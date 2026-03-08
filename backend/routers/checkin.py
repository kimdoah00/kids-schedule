from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, Child, CheckinEvent, CheckinEventType, ScheduleBlock, Activity, Contact, IncomingNotification
from schemas import CheckinRequest
from utils.auth import get_current_user
from routers.schedule import format_time
from services.ai_service import parse_notification

router = APIRouter(prefix="/checkin", tags=["checkin"])


@router.post("/")
async def record_checkin(
    req: CheckinRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Record a checkin event from notification listener."""
    # Try to match to a schedule block
    now = datetime.now()
    day_of_week = now.weekday()

    matched_block_id = None
    blocks_result = await db.execute(
        select(ScheduleBlock)
        .join(Activity)
        .where(
            Activity.child_id == req.child_id,
            ScheduleBlock.day_of_week == day_of_week,
        )
        .order_by(ScheduleBlock.start_time)
    )
    blocks = blocks_result.scalars().all()

    current_time = now.time()
    for block in blocks:
        if block.start_time <= current_time <= block.end_time:
            matched_block_id = block.id
            break

    # Find source contact by phone if not provided
    source_contact_id = req.source_contact_id
    if not source_contact_id and req.source_phone:
        contact_result = await db.execute(
            select(Contact).where(
                Contact.family_id == user.family_id,
                Contact.phone == req.source_phone,
            )
        )
        contact = contact_result.scalar_one_or_none()
        if contact:
            source_contact_id = contact.id

    event = CheckinEvent(
        child_id=req.child_id,
        schedule_block_id=matched_block_id,
        event_type=CheckinEventType(req.event_type),
        raw_message=req.raw_message,
        source_contact_id=source_contact_id,
        matched=matched_block_id is not None,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    return {
        "event_id": event.id,
        "matched_block": matched_block_id,
        "matched": event.matched,
    }


@router.post("/notification")
async def process_notification(
    req: CheckinRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Process raw notification from NotificationListenerService via Inbox Agent."""
    # Inbox Agent로 파싱
    parsed = await parse_notification(
        raw_message=req.raw_message,
        source_app=req.source_app or "unknown",
        source_channel=req.source_channel or "unknown",
    )

    event_type = parsed.get("event_type", "chat")

    # 입퇴실 이벤트면 CheckinEvent 생성
    if event_type in ("enter", "exit", "board", "arrive"):
        child_id = req.child_id
        if not child_id and parsed.get("child_name"):
            child_result = await db.execute(
                select(Child).where(
                    Child.family_id == user.family_id,
                    Child.name.contains(parsed["child_name"])
                )
            )
            child = child_result.scalar_one_or_none()
            if child:
                child_id = child.id

        if child_id:
            now = datetime.now()
            matched_block_id = None
            blocks_result = await db.execute(
                select(ScheduleBlock).join(Activity)
                .where(Activity.child_id == child_id, ScheduleBlock.day_of_week == now.weekday())
                .order_by(ScheduleBlock.start_time)
            )
            for block in blocks_result.scalars().all():
                if block.start_time <= now.time() <= block.end_time:
                    matched_block_id = block.id
                    break

            event = CheckinEvent(
                child_id=child_id,
                schedule_block_id=matched_block_id,
                event_type=CheckinEventType(event_type),
                raw_message=req.raw_message,
                source_app=req.source_app,
                source_channel=req.source_channel,
                matched=matched_block_id is not None,
            )
            db.add(event)

    # 모든 알림은 IncomingNotification에도 저장
    notification = IncomingNotification(
        family_id=user.family_id,
        raw_content=req.raw_message,
        ai_summary=parsed.get("summary"),
        schedule_impact=event_type if event_type != "chat" else None,
        source_app=req.source_app,
        source_channel=req.source_channel,
    )
    db.add(notification)
    await db.commit()

    # Schedule-Guard 트리거 (입퇴실 이벤트일 때)
    guard_result = None
    if event_type in ("enter", "exit", "board", "arrive") and req.child_id:
        from services.schedule_guard import run_guard_check
        guard_result = await run_guard_check(db, req.child_id)

    return {
        "parsed": parsed,
        "event_type": event_type,
        "guard_warnings": guard_result.get("warnings", []) if guard_result else [],
    }


@router.get("/{child_id}/today")
async def get_today_checkins(
    child_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get today's checkin events vs scheduled blocks."""
    now = datetime.now()
    day_of_week = now.weekday()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Get today's schedule
    blocks_result = await db.execute(
        select(ScheduleBlock)
        .join(Activity)
        .where(
            Activity.child_id == child_id,
            ScheduleBlock.day_of_week == day_of_week,
        )
        .order_by(ScheduleBlock.start_time)
    )
    blocks = blocks_result.scalars().all()

    # Get today's checkin events
    events_result = await db.execute(
        select(CheckinEvent)
        .where(
            CheckinEvent.child_id == child_id,
            CheckinEvent.timestamp >= today_start,
        )
        .order_by(CheckinEvent.timestamp)
    )
    events = events_result.scalars().all()

    # Build timeline
    timeline = []
    for block in blocks:
        activity = await db.get(Activity, block.activity_id)
        guardian = await db.get(Contact, block.guardian_contact_id) if block.guardian_contact_id else None

        # Find matching checkin events
        block_events = [e for e in events if e.schedule_block_id == block.id]

        status = "upcoming"
        if block.end_time < now.time():
            status = "completed" if block_events else "missed"
        elif block.start_time <= now.time() <= block.end_time:
            status = "current"

        timeline.append({
            "block_id": block.id,
            "activity_name": activity.name if activity else "",
            "block_type": block.block_type.value,
            "start_time": format_time(block.start_time),
            "end_time": format_time(block.end_time),
            "guardian_name": guardian.name if guardian else None,
            "status": status,
            "checkin_events": [
                {
                    "type": e.event_type.value,
                    "time": e.timestamp.strftime("%H:%M"),
                    "message": e.raw_message,
                }
                for e in block_events
            ],
        })

    # Check for anomalies
    anomalies = []
    for item in timeline:
        if item["status"] == "missed":
            anomalies.append({
                "type": "no_checkin",
                "activity": item["activity_name"],
                "expected_time": item["start_time"],
                "message": f"{item['activity_name']} 체크인 누락 ({item['start_time']})",
            })

    return {
        "date": now.strftime("%Y-%m-%d"),
        "day_of_week": day_of_week,
        "timeline": timeline,
        "anomalies": anomalies,
        "total_events": len(events),
    }

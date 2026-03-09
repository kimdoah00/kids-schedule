from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import (
    User, Child, CheckinEvent, CheckinEventType, ScheduleBlock,
    Activity, Contact, IncomingNotification, ActivityContact,
    PendingResponse, ResponseStatus,
)
from schemas import CheckinRequest
from utils.auth import get_current_user
from routers.schedule import format_time
from services.ai_service import parse_notification, identify_sender, assess_and_respond
from services.sms_service import send_sms
from services.push_service import send_push_to_family

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
    """Process raw notification via 5-Agent pipeline:
    Inbox Agent → Mom-Responder → auto-send or approval queue."""

    # === Stage 1: Inbox Agent (parse + identify) ===
    parsed = await parse_notification(
        raw_message=req.raw_message,
        source_app=req.source_app or "unknown",
        source_channel=req.source_channel or "unknown",
    )
    parsed["raw_message"] = req.raw_message

    event_type = parsed.get("event_type", "chat")

    # Identify sender contact and related activity
    contact, activity = await identify_sender(
        db, user.family_id,
        req.source_app or "", req.source_channel or "", req.raw_message,
    )

    # Identify child
    child = None
    child_id = req.child_id
    if not child_id and parsed.get("child_name"):
        child_result = await db.execute(
            select(Child).where(
                Child.family_id == user.family_id,
                Child.name.contains(parsed["child_name"]),
            )
        )
        child = child_result.scalar_one_or_none()
        if child:
            child_id = child.id
    elif child_id:
        child = await db.get(Child, child_id)

    # Create CheckinEvent for enter/exit events
    if event_type in ("enter", "exit", "board", "arrive") and child_id:
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

        checkin = CheckinEvent(
            child_id=child_id,
            schedule_block_id=matched_block_id,
            event_type=CheckinEventType(event_type),
            raw_message=req.raw_message,
            source_contact_id=contact.id if contact else None,
            source_app=req.source_app,
            source_channel=req.source_channel,
            matched=matched_block_id is not None,
        )
        db.add(checkin)

    # === Stage 2: Mom-Responder Agent (assess + decide) ===
    assessment = await assess_and_respond(
        db, user.family_id, parsed, contact, activity, child,
    )

    priority = assessment.get("priority", "info")
    auto_send_ok = assessment.get("auto_send_ok", False)
    confidence = assessment.get("confidence", 0.0)
    suggested_response = assessment.get("suggested_response")
    requires_response = assessment.get("requires_response", False)

    # Save notification with enriched data
    notification = IncomingNotification(
        family_id=user.family_id,
        source_contact_id=contact.id if contact else None,
        raw_content=req.raw_message,
        ai_summary=parsed.get("summary"),
        schedule_impact=assessment.get("schedule_impact", {}).get("type"),
        source_app=req.source_app,
        source_channel=req.source_channel,
        activity_id=activity.id if activity else None,
        child_id=child_id,
        priority=priority,
        requires_response=requires_response,
    )
    db.add(notification)
    await db.flush()  # get notification.id

    # === Stage 3: Auto-send or Queue ===
    response_action = None

    if requires_response and suggested_response and contact:
        channel = assessment.get("response_channel", contact.channel.value)

        if auto_send_ok and confidence >= 0.85:
            # Auto-send
            if channel == "sms" and contact.phone:
                await send_sms(contact.phone, suggested_response)

            pending = PendingResponse(
                family_id=user.family_id,
                notification_id=notification.id,
                contact_id=contact.id,
                channel=channel,
                draft_text=suggested_response,
                priority=priority,
                confidence_score=confidence,
                status=ResponseStatus.AUTO_SENT,
                responded_at=datetime.utcnow(),
            )
            db.add(pending)
            notification.auto_responded = True
            response_action = "auto_sent"
        else:
            # Queue for mom approval
            pending = PendingResponse(
                family_id=user.family_id,
                notification_id=notification.id,
                contact_id=contact.id,
                channel=channel,
                draft_text=suggested_response,
                priority=priority,
                confidence_score=confidence,
                status=ResponseStatus.PENDING,
            )
            db.add(pending)
            response_action = "queued_for_approval"

            # Push notification to mom
            push_title = "응답 필요" if priority == "urgent" else "응답 확인"
            push_body = f"{contact.name}: {parsed.get('summary', req.raw_message[:50])}"
            await send_push_to_family(
                db, user.family_id,
                title=push_title,
                body=push_body,
                data={"type": "pending_response", "notification_id": notification.id},
            )

    await db.commit()

    # Schedule-Guard trigger
    guard_result = None
    if event_type in ("enter", "exit", "board", "arrive") and child_id:
        from services.schedule_guard import run_guard_check
        guard_result = await run_guard_check(db, child_id)

    return {
        "parsed": parsed,
        "event_type": event_type,
        "priority": priority,
        "assessment": assessment.get("assessment"),
        "response_action": response_action,
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

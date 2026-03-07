from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, CheckinEvent, CheckinEventType, ScheduleBlock, Activity, Contact
from schemas import CheckinRequest
from utils.auth import get_current_user
from routers.schedule import format_time

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

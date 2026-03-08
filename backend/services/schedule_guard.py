from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Child, Activity, ScheduleBlock, CheckinEvent, Contact
from routers.schedule import format_time
from services.ai_service import check_schedule_guard


async def run_guard_check(db: AsyncSession, child_id: str) -> dict:
    """Run Schedule-Guard Agent for a child's today schedule."""
    now = datetime.now()
    day_of_week = now.weekday()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Get today's schedule blocks
    blocks_result = await db.execute(
        select(ScheduleBlock).join(Activity)
        .where(Activity.child_id == child_id, ScheduleBlock.day_of_week == day_of_week)
        .order_by(ScheduleBlock.start_time)
    )
    blocks = blocks_result.scalars().all()

    schedule_data = []
    for block in blocks:
        activity = await db.get(Activity, block.activity_id)
        guardian = await db.get(Contact, block.guardian_contact_id) if block.guardian_contact_id else None
        schedule_data.append({
            "start_time": format_time(block.start_time),
            "end_time": format_time(block.end_time),
            "activity_name": activity.name if activity else "?",
            "guardian_name": guardian.name if guardian else "미정",
        })

    # Get today's checkin events
    events_result = await db.execute(
        select(CheckinEvent)
        .where(CheckinEvent.child_id == child_id, CheckinEvent.timestamp >= today_start)
        .order_by(CheckinEvent.timestamp)
    )
    events = events_result.scalars().all()

    checkin_data = [
        {
            "time": e.timestamp.strftime("%H:%M"),
            "type": e.event_type.value,
            "message": e.raw_message,
        }
        for e in events
    ]

    if not schedule_data:
        return {"status": "all_clear", "warnings": []}

    return await check_schedule_guard(
        schedule_blocks=schedule_data,
        checkin_events=checkin_data,
        current_time=now.strftime("%H:%M"),
    )

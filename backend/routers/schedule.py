from typing import Optional, List
from datetime import time as dt_time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Child, Activity, ScheduleBlock, Contact, BlockType
from schemas import ScheduleBlockCreate, ScheduleBlockResponse, GapInfo
from utils.auth import get_current_user

router = APIRouter(prefix="/schedule", tags=["schedule"])


def parse_time(t: str) -> dt_time:
    parts = t.split(":")
    return dt_time(int(parts[0]), int(parts[1]))


def format_time(t: dt_time) -> str:
    return t.strftime("%H:%M")


@router.get("/{child_id}", response_model=List[ScheduleBlockResponse])
async def get_schedule(
    child_id: str,
    day: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify child belongs to family
    child_result = await db.execute(
        select(Child).where(Child.id == child_id, Child.family_id == user.family_id)
    )
    if not child_result.scalar_one_or_none():
        raise HTTPException(404, "Child not found")

    query = (
        select(ScheduleBlock)
        .join(Activity)
        .where(Activity.child_id == child_id)
    )
    if day is not None:
        query = query.where(ScheduleBlock.day_of_week == day)
    query = query.order_by(ScheduleBlock.day_of_week, ScheduleBlock.start_time)

    result = await db.execute(query)
    blocks = result.scalars().all()

    response = []
    for b in blocks:
        activity = await db.get(Activity, b.activity_id)
        guardian_name = None
        if b.guardian_contact_id:
            guardian = await db.get(Contact, b.guardian_contact_id)
            if guardian:
                guardian_name = guardian.name

        response.append(ScheduleBlockResponse(
            id=b.id,
            activity_name=activity.name if activity else "",
            activity_type=activity.activity_type if activity else "",
            day_of_week=b.day_of_week,
            start_time=format_time(b.start_time),
            end_time=format_time(b.end_time),
            guardian_contact_id=b.guardian_contact_id,
            guardian_name=guardian_name,
            block_type=b.block_type.value,
            notes=b.notes,
        ))

    return response


@router.post("/blocks", response_model=ScheduleBlockResponse)
async def create_block(
    req: ScheduleBlockCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify child
    child_result = await db.execute(
        select(Child).where(Child.id == req.child_id, Child.family_id == user.family_id)
    )
    if not child_result.scalar_one_or_none():
        raise HTTPException(404, "Child not found")

    # Find or create activity
    activity_result = await db.execute(
        select(Activity).where(
            Activity.child_id == req.child_id,
            Activity.name == req.activity_name,
        )
    )
    activity = activity_result.scalar_one_or_none()
    if not activity:
        activity = Activity(
            child_id=req.child_id,
            name=req.activity_name,
            activity_type=req.activity_type,
            contact_id=req.contact_id,
            location=req.location,
        )
        db.add(activity)
        await db.flush()

    block = ScheduleBlock(
        activity_id=activity.id,
        day_of_week=req.day_of_week,
        start_time=parse_time(req.start_time),
        end_time=parse_time(req.end_time),
        guardian_contact_id=req.guardian_contact_id,
        block_type=BlockType(req.block_type),
        notes=req.notes,
    )
    db.add(block)
    await db.commit()
    await db.refresh(block)

    guardian_name = None
    if block.guardian_contact_id:
        guardian = await db.get(Contact, block.guardian_contact_id)
        if guardian:
            guardian_name = guardian.name

    return ScheduleBlockResponse(
        id=block.id,
        activity_name=activity.name,
        activity_type=activity.activity_type,
        day_of_week=block.day_of_week,
        start_time=format_time(block.start_time),
        end_time=format_time(block.end_time),
        guardian_contact_id=block.guardian_contact_id,
        guardian_name=guardian_name,
        block_type=block.block_type.value,
        notes=block.notes,
    )


@router.delete("/blocks/{block_id}")
async def delete_block(
    block_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(ScheduleBlock).where(ScheduleBlock.id == block_id))
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(404, "Block not found")
    await db.delete(block)
    await db.commit()
    return {"status": "deleted"}


@router.post("/detect-gaps", response_model=List[GapInfo])
async def detect_gaps(
    child_id: str,
    day: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Detect guardian gaps in schedule for a child."""
    child_result = await db.execute(
        select(Child).where(Child.id == child_id, Child.family_id == user.family_id)
    )
    if not child_result.scalar_one_or_none():
        raise HTTPException(404, "Child not found")

    days_to_check = [day] if day is not None else list(range(5))  # Mon-Fri
    gaps = []

    for d in days_to_check:
        query = (
            select(ScheduleBlock)
            .join(Activity)
            .where(Activity.child_id == child_id, ScheduleBlock.day_of_week == d)
            .order_by(ScheduleBlock.start_time)
        )
        result = await db.execute(query)
        blocks = result.scalars().all()

        if not blocks:
            continue

        # Check gaps between consecutive blocks
        for i in range(len(blocks) - 1):
            current = blocks[i]
            next_block = blocks[i + 1]

            # Gap between end of current and start of next
            if current.end_time < next_block.start_time:
                current_activity = await db.get(Activity, current.activity_id)
                next_activity = await db.get(Activity, next_block.activity_id)
                gaps.append(GapInfo(
                    day_of_week=d,
                    start_time=format_time(current.end_time),
                    end_time=format_time(next_block.start_time),
                    before_activity=current_activity.name if current_activity else None,
                    after_activity=next_activity.name if next_activity else None,
                ))

        # Check blocks without guardian
        for block in blocks:
            if not block.guardian_contact_id:
                activity = await db.get(Activity, block.activity_id)
                gaps.append(GapInfo(
                    day_of_week=d,
                    start_time=format_time(block.start_time),
                    end_time=format_time(block.end_time),
                    before_activity=f"[담당자 없음] {activity.name}" if activity else "[담당자 없음]",
                ))

    return gaps

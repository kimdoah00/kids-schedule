from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from database import get_db
from models import User, IncomingNotification
from utils.auth import get_current_user

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/")
async def list_messages(
    days: int = Query(default=7, le=30),
    channel: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get unified message timeline from all channels."""
    since = datetime.utcnow() - timedelta(days=days)

    query = (
        select(IncomingNotification)
        .where(
            IncomingNotification.family_id == user.family_id,
            IncomingNotification.timestamp >= since,
        )
    )
    if channel:
        query = query.where(IncomingNotification.source_channel == channel)

    query = query.order_by(desc(IncomingNotification.timestamp)).limit(100)

    result = await db.execute(query)
    notifications = result.scalars().all()

    return [
        {
            "id": n.id,
            "raw_content": n.raw_content,
            "ai_summary": n.ai_summary,
            "source_channel": n.source_channel,
            "source_app": n.source_app,
            "schedule_impact": n.schedule_impact,
            "status": n.status.value,
            "timestamp": n.timestamp.isoformat(),
        }
        for n in notifications
    ]

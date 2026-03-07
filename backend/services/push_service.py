from typing import Optional
from exponent_server_sdk import (
    PushClient,
    PushMessage,
    PushServerError,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import User, UserRole


push_client = PushClient()


async def send_push_to_caregivers(
    db: AsyncSession,
    family_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
):
    """Send push notification to all caregivers in the family."""
    result = await db.execute(
        select(User).where(
            User.family_id == family_id,
            User.role == UserRole.CAREGIVER,
            User.push_token.isnot(None),
        )
    )
    caregivers = result.scalars().all()

    messages = []
    for caregiver in caregivers:
        if caregiver.push_token:
            messages.append(
                PushMessage(
                    to=caregiver.push_token,
                    title=title,
                    body=body,
                    data=data or {},
                )
            )

    if not messages:
        return {"sent": 0, "message": "No caregivers with push tokens"}

    try:
        responses = push_client.publish_multiple(messages)
        return {"sent": len(responses), "message": "ok"}
    except PushServerError as e:
        return {"sent": 0, "error": str(e)}


async def send_push_to_family(
    db: AsyncSession,
    family_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    exclude_user_id: Optional[str] = None,
):
    """Send push notification to all family members."""
    query = select(User).where(
        User.family_id == family_id,
        User.push_token.isnot(None),
    )
    result = await db.execute(query)
    members = result.scalars().all()

    messages = []
    for member in members:
        if member.push_token and member.id != exclude_user_id:
            messages.append(
                PushMessage(
                    to=member.push_token,
                    title=title,
                    body=body,
                    data=data or {},
                )
            )

    if not messages:
        return {"sent": 0}

    try:
        responses = push_client.publish_multiple(messages)
        return {"sent": len(responses)}
    except PushServerError as e:
        return {"sent": 0, "error": str(e)}

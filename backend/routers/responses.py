from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, Contact, PendingResponse, ResponseStatus, IncomingNotification
from schemas import PendingResponseResponse, ResponseEditRequest
from services.sms_service import send_sms
from utils.auth import get_current_user

router = APIRouter(prefix="/responses", tags=["responses"])


@router.get("/pending", response_model=list[PendingResponseResponse])
async def list_pending_responses(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all pending responses awaiting mom's approval."""
    result = await db.execute(
        select(PendingResponse)
        .where(
            PendingResponse.family_id == user.family_id,
            PendingResponse.status == ResponseStatus.PENDING,
        )
        .order_by(PendingResponse.created_at.desc())
    )
    responses = result.scalars().all()

    items = []
    for r in responses:
        contact = await db.get(Contact, r.contact_id)
        notification = await db.get(IncomingNotification, r.notification_id)
        items.append(PendingResponseResponse(
            id=r.id,
            notification_id=r.notification_id,
            contact_id=r.contact_id,
            contact_name=contact.name if contact else "?",
            channel=r.channel,
            draft_text=r.draft_text,
            priority=r.priority,
            confidence_score=r.confidence_score,
            status=r.status.value,
            created_at=r.created_at.isoformat(),
            raw_notification=notification.raw_content if notification else "",
        ))
    return items


@router.post("/{response_id}/approve")
async def approve_response(
    response_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Approve and send the AI-drafted response as-is."""
    pending = await db.get(PendingResponse, response_id)
    if not pending or pending.family_id != user.family_id:
        raise HTTPException(404, "Response not found")
    if pending.status != ResponseStatus.PENDING:
        raise HTTPException(400, "Response already processed")

    # Send the message
    contact = await db.get(Contact, pending.contact_id)
    sent = False
    if pending.channel == "sms" and contact and contact.phone:
        await send_sms(contact.phone, pending.draft_text)
        sent = True

    pending.status = ResponseStatus.APPROVED
    pending.responded_at = datetime.utcnow()

    # Update notification
    notification = await db.get(IncomingNotification, pending.notification_id)
    if notification:
        notification.auto_responded = True

    await db.commit()

    return {
        "status": "approved",
        "sent": sent,
        "channel": pending.channel,
        "contact_name": contact.name if contact else "?",
    }


@router.post("/{response_id}/edit")
async def edit_and_send_response(
    response_id: str,
    req: ResponseEditRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Edit the draft text and send."""
    pending = await db.get(PendingResponse, response_id)
    if not pending or pending.family_id != user.family_id:
        raise HTTPException(404, "Response not found")
    if pending.status != ResponseStatus.PENDING:
        raise HTTPException(400, "Response already processed")

    pending.draft_text = req.text

    contact = await db.get(Contact, pending.contact_id)
    sent = False
    if pending.channel == "sms" and contact and contact.phone:
        await send_sms(contact.phone, req.text)
        sent = True

    pending.status = ResponseStatus.EDITED
    pending.responded_at = datetime.utcnow()

    notification = await db.get(IncomingNotification, pending.notification_id)
    if notification:
        notification.auto_responded = True

    await db.commit()

    return {"status": "edited_and_sent", "sent": sent}


@router.post("/{response_id}/reject")
async def reject_response(
    response_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reject — do not send anything."""
    pending = await db.get(PendingResponse, response_id)
    if not pending or pending.family_id != user.family_id:
        raise HTTPException(404, "Response not found")

    pending.status = ResponseStatus.REJECTED
    pending.responded_at = datetime.utcnow()
    await db.commit()

    return {"status": "rejected"}

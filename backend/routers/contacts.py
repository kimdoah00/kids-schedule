from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, Contact, ContactRole, Channel
from schemas import ContactCreate, ContactResponse
from utils.auth import get_current_user

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("/", response_model=List[ContactResponse])
async def list_contacts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Contact).where(Contact.family_id == user.family_id)
    )
    contacts = result.scalars().all()
    return [
        ContactResponse(
            id=c.id, name=c.name, role=c.role.value,
            phone=c.phone, channel=c.channel.value,
            linked_child_ids=c.linked_child_ids,
            organization=c.organization,
        )
        for c in contacts
    ]


@router.post("/", response_model=ContactResponse)
async def create_contact(
    req: ContactCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    contact = Contact(
        family_id=user.family_id,
        name=req.name,
        role=ContactRole(req.role),
        phone=req.phone,
        channel=Channel(req.channel),
        linked_child_ids=req.linked_child_ids,
        organization=req.organization,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return ContactResponse(
        id=contact.id, name=contact.name, role=contact.role.value,
        phone=contact.phone, channel=contact.channel.value,
        linked_child_ids=contact.linked_child_ids,
        organization=contact.organization,
    )


@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: str,
    req: ContactCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.family_id == user.family_id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Contact not found")

    contact.name = req.name
    contact.role = ContactRole(req.role)
    contact.phone = req.phone
    contact.channel = Channel(req.channel)
    contact.linked_child_ids = req.linked_child_ids
    contact.organization = req.organization
    await db.commit()
    await db.refresh(contact)
    return ContactResponse(
        id=contact.id, name=contact.name, role=contact.role.value,
        phone=contact.phone, channel=contact.channel.value,
        linked_child_ids=contact.linked_child_ids,
        organization=contact.organization,
    )


@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.family_id == user.family_id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Contact not found")
    await db.delete(contact)
    await db.commit()
    return {"status": "deleted"}

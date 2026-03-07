from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, Child
from schemas import ChildCreate, ChildResponse
from utils.auth import get_current_user

router = APIRouter(prefix="/children", tags=["children"])


@router.get("/", response_model=List[ChildResponse])
async def list_children(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Child).where(Child.family_id == user.family_id)
    )
    children = result.scalars().all()
    return [
        ChildResponse(id=c.id, name=c.name, grade=c.grade, school=c.school)
        for c in children
    ]


@router.post("/", response_model=ChildResponse)
async def create_child(
    req: ChildCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    child = Child(
        family_id=user.family_id,
        name=req.name,
        grade=req.grade,
        school=req.school,
    )
    db.add(child)
    await db.commit()
    await db.refresh(child)
    return ChildResponse(id=child.id, name=child.name, grade=child.grade, school=child.school)


@router.put("/{child_id}", response_model=ChildResponse)
async def update_child(
    child_id: str,
    req: ChildCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Child).where(Child.id == child_id, Child.family_id == user.family_id)
    )
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(404, "Child not found")

    child.name = req.name
    child.grade = req.grade
    child.school = req.school
    await db.commit()
    await db.refresh(child)
    return ChildResponse(id=child.id, name=child.name, grade=child.grade, school=child.school)


@router.delete("/{child_id}")
async def delete_child(
    child_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Child).where(Child.id == child_id, Child.family_id == user.family_id)
    )
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(404, "Child not found")
    await db.delete(child)
    await db.commit()
    return {"status": "deleted"}

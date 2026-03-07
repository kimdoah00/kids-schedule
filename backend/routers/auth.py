from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, Family, UserRole
from schemas import RegisterRequest, LoginRequest, AuthResponse
from utils.auth import create_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    role = UserRole(req.role)

    if role == UserRole.MOM:
        family = Family()
        db.add(family)
        await db.flush()
    else:
        if not req.family_code:
            raise HTTPException(400, "family_code required for caregiver")
        result = await db.execute(
            select(Family).where(Family.family_code == req.family_code)
        )
        family = result.scalar_one_or_none()
        if not family:
            raise HTTPException(404, "Family not found with this code")

    user = User(
        family_id=family.id,
        role=role,
        name=req.name,
        phone=req.phone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await db.refresh(family)

    token = create_token(user.id, family.id, user.role.value)

    return AuthResponse(
        user_id=user.id,
        family_id=family.id,
        family_code=family.family_code,
        role=user.role.value,
        token=token,
    )


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Family).where(Family.family_code == req.family_code)
    )
    family = result.scalar_one_or_none()
    if not family:
        raise HTTPException(404, "Family not found")

    result = await db.execute(
        select(User).where(User.family_id == family.id, User.phone == req.phone)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    token = create_token(user.id, family.id, user.role.value)

    return AuthResponse(
        user_id=user.id,
        family_id=family.id,
        family_code=family.family_code,
        role=user.role.value,
        token=token,
    )


@router.post("/push-token")
async def update_push_token(
    push_token: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.push_token = push_token
    await db.commit()
    return {"status": "ok"}

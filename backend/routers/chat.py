from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from schemas import ChatRequest, ChatResponse, DraftMessage, GapInfo
from services.ai_service import chat_with_ai
from utils.auth import get_current_user

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    clean_text, action = await chat_with_ai(db, user.family_id, req.message)

    draft_messages = None
    gaps_detected = None
    schedule_changes = None
    action_type = None

    if action:
        action_type = action.get("type")

        if action.get("draft_messages"):
            draft_messages = [
                DraftMessage(
                    contact_id=m.get("contact_id", ""),
                    contact_name=m.get("contact_name", ""),
                    channel=m.get("channel", "kakao"),
                    draft_text=m.get("text", ""),
                    app_package=_get_app_package(m.get("channel", "kakao")),
                )
                for m in action["draft_messages"]
            ]

        if action.get("gaps"):
            gaps_detected = [
                GapInfo(
                    day_of_week=0,
                    start_time=g.get("start", ""),
                    end_time=g.get("end", ""),
                    before_activity=g.get("child", ""),
                )
                for g in action["gaps"]
            ]

        if action.get("schedule_changes"):
            schedule_changes = {"changes": action["schedule_changes"]}

    return ChatResponse(
        response=clean_text,
        action_type=action_type,
        draft_messages=draft_messages,
        schedule_changes=schedule_changes,
        gaps_detected=gaps_detected,
    )


def _get_app_package(channel: str) -> Optional[str]:
    packages = {
        "kakao": "com.kakao.talk",
        "sms": None,  # Use system SMS intent
        "hiclass": "com.hiclass.school",
    }
    return packages.get(channel)

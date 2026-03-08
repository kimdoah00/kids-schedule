from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Contact
from schemas import ChatRequest, ChatResponse, DraftMessage, GapInfo, SendResult
from services.ai_service import chat_with_ai
from services.sms_service import send_sms
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
    send_results = None

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

            # SMS 채널 메시지는 자동 발신
            send_results = []
            for m in action["draft_messages"]:
                if m.get("channel") == "sms" and m.get("contact_id"):
                    contact = await db.get(Contact, m["contact_id"])
                    if contact and contact.phone:
                        await send_sms(contact.phone, m["text"])
                        send_results.append(SendResult(
                            contact_name=m.get("contact_name", ""),
                            channel="sms",
                            status="sent",
                        ))
                elif m.get("channel") in ("kakao", "hiclass"):
                    send_results.append(SendResult(
                        contact_name=m.get("contact_name", ""),
                        channel=m.get("channel", "kakao"),
                        status="pending_user_action",
                    ))

            if not send_results:
                send_results = None

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
        send_results=send_results,
    )


def _get_app_package(channel: str) -> Optional[str]:
    packages = {
        "kakao": "com.kakao.talk",
        "sms": None,
        "hiclass": "com.iscreammedia.app.hiclass.android",
    }
    return packages.get(channel)

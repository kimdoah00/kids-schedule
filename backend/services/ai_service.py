from typing import Optional, Tuple
import os
import json
from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Child, Contact, Activity, ScheduleBlock, ChatMessage, ActivityContact
from routers.schedule import format_time
from prompts.mom_ai import MOM_AI_PROMPT
from prompts.inbox import INBOX_PROMPT
from prompts.schedule_guard import SCHEDULE_GUARD_PROMPT
from prompts.mom_responder import MOM_RESPONDER_PROMPT

client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


async def build_family_context(db: AsyncSession, family_id: str) -> str:
    """Build context string with all family data for AI."""
    # Children
    result = await db.execute(select(Child).where(Child.family_id == family_id))
    children = result.scalars().all()

    # Contacts
    result = await db.execute(select(Contact).where(Contact.family_id == family_id))
    contacts = result.scalars().all()

    context_parts = []

    # Children info
    context_parts.append("### 아이들")
    for child in children:
        context_parts.append(f"- {child.name} (초{child.grade}, {child.school or '학교 미등록'}) [id: {child.id}]")

        # Schedule for this child
        blocks_result = await db.execute(
            select(ScheduleBlock)
            .join(Activity)
            .where(Activity.child_id == child.id)
            .order_by(ScheduleBlock.day_of_week, ScheduleBlock.start_time)
        )
        blocks = blocks_result.scalars().all()

        days_kr = ["월", "화", "수", "목", "금", "토", "일"]
        current_day = -1
        for block in blocks:
            if block.day_of_week != current_day:
                current_day = block.day_of_week
                context_parts.append(f"  [{days_kr[current_day]}요일]")

            activity = await db.get(Activity, block.activity_id)
            guardian = await db.get(Contact, block.guardian_contact_id) if block.guardian_contact_id else None
            block_type_str = "이동" if block.block_type.value == "transition" else ""
            guardian_str = f"(담당: {guardian.name})" if guardian else "(담당자 없음!)"
            context_parts.append(
                f"  {format_time(block.start_time)}-{format_time(block.end_time)} "
                f"{block_type_str}{activity.name if activity else '?'} {guardian_str}"
            )

    # Contacts info
    context_parts.append("\n### 연락처")
    for c in contacts:
        context_parts.append(
            f"- {c.name} ({c.role.value}, {c.channel.value}) "
            f"[id: {c.id}] {c.organization or ''}"
        )

    from datetime import datetime
    days_kr = ["월", "화", "수", "목", "금", "토", "일"]
    now = datetime.now()
    context_parts.append(f"\n### 오늘: {now.strftime('%Y년 %m월 %d일')} ({days_kr[now.weekday()]}요일) {now.strftime('%H:%M')}")

    return "\n".join(context_parts)


def parse_action_from_response(text: str) -> Optional[dict]:
    """Extract action JSON from AI response."""
    if "```action" not in text:
        return None

    try:
        start = text.index("```action") + len("```action")
        end = text.index("```", start)
        action_json = text[start:end].strip()
        return json.loads(action_json)
    except (ValueError, json.JSONDecodeError):
        return None


def clean_response(text: str) -> str:
    """Remove action JSON block from visible response."""
    if "```action" not in text:
        return text
    try:
        start = text.index("```action")
        end = text.index("```", start + 9) + 3
        return text[:start].strip()
    except ValueError:
        return text


async def chat_with_ai(
    db: AsyncSession,
    family_id: str,
    user_message: str,
    history_limit: int = 20,
) -> tuple[str, Optional[dict]]:
    """Send message to Claude and get response with optional action."""

    # Build context
    family_context = await build_family_context(db, family_id)
    system_prompt = MOM_AI_PROMPT.format(family_context=family_context)

    # Get recent chat history
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.family_id == family_id)
        .order_by(ChatMessage.timestamp.desc())
        .limit(history_limit)
    )
    history = list(reversed(result.scalars().all()))

    messages = []
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": user_message})

    response = await client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=2000,
        system=system_prompt,
        messages=messages,
    )

    ai_text = response.content[0].text
    action = parse_action_from_response(ai_text)
    clean_text = clean_response(ai_text)

    # Save messages to DB
    user_msg = ChatMessage(family_id=family_id, role="user", content=user_message)
    ai_msg = ChatMessage(
        family_id=family_id,
        role="assistant",
        content=clean_text,
        action_type=action.get("type") if action else None,
        metadata_json=action,
    )
    db.add(user_msg)
    db.add(ai_msg)
    await db.commit()

    return clean_text, action


async def parse_notification(raw_message: str, source_app: str, source_channel: str) -> dict:
    """Inbox Agent: 알림 메시지를 구조화된 이벤트로 파싱."""
    response = await client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=500,
        system=INBOX_PROMPT,
        messages=[{
            "role": "user",
            "content": f"source_app: {source_app}\nsource_channel: {source_channel}\nraw_message: {raw_message}"
        }],
    )
    text = response.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            return json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            return {"event_type": "chat", "summary": raw_message, "requires_action": False}


async def check_schedule_guard(schedule_blocks: list, checkin_events: list, current_time: str) -> dict:
    """Schedule-Guard Agent: 스케줄 vs 실제 비교."""
    context = f"현재 시각: {current_time}\n\n스케줄:\n"
    for b in schedule_blocks:
        context += f"- {b['start_time']}-{b['end_time']} {b['activity_name']} (담당: {b.get('guardian_name', '미정')})\n"
    context += f"\n체크인 기록:\n"
    for e in checkin_events:
        context += f"- {e['time']} {e['type']} {e['message']}\n"

    response = await client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=500,
        system=SCHEDULE_GUARD_PROMPT,
        messages=[{"role": "user", "content": context}],
    )
    text = response.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            return json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            return {"status": "all_clear", "warnings": []}


async def identify_sender(
    db: AsyncSession, family_id: str, source_app: str, source_channel: str, raw_message: str
) -> Tuple[Optional[Contact], Optional[Activity]]:
    """Identify which contact sent this notification and which activity it relates to.
    Returns (contact, activity) or (None, None)."""
    # Try to find contact by channel match and message content
    contacts_result = await db.execute(
        select(Contact).where(Contact.family_id == family_id)
    )
    contacts = contacts_result.scalars().all()

    # Match by organization/name appearing in message
    matched_contact = None
    for c in contacts:
        if c.organization and c.organization in raw_message:
            matched_contact = c
            break
        if c.name and c.name in raw_message:
            matched_contact = c
            break

    # Find related activity via ActivityContact
    matched_activity = None
    if matched_contact:
        ac_result = await db.execute(
            select(ActivityContact)
            .where(ActivityContact.contact_id == matched_contact.id)
        )
        ac = ac_result.scalar_one_or_none()
        if ac:
            matched_activity = await db.get(Activity, ac.activity_id)

    return matched_contact, matched_activity


async def assess_and_respond(
    db: AsyncSession,
    family_id: str,
    parsed_notification: dict,
    contact: Optional[Contact],
    activity: Optional[Activity],
    child: Optional[Child],
) -> dict:
    """Mom-Responder Agent: assess priority and draft response."""
    family_context = await build_family_context(db, family_id)

    # Build notification context
    contact_info = "불명"
    if contact:
        contact_info = f"{contact.name} ({contact.role.value}, {contact.organization or ''}, {contact.channel.value})"

    activity_info = "불명"
    if activity:
        activity_info = f"{activity.name} ({activity.activity_type})"

    child_info = "불명"
    if child:
        child_info = f"{child.name} (초{child.grade})"

    user_message = f"""## 수신 알림
원문: {parsed_notification.get('raw_message', '')}
파싱 결과: {json.dumps(parsed_notification, ensure_ascii=False)}

## 발신자
{contact_info}

## 관련 활동
{activity_info}

## 아이
{child_info}

## 가족 전체 컨텍스트
{family_context}"""

    response = await client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1000,
        system=MOM_RESPONDER_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    text = response.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            return json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            return {
                "priority": "normal",
                "assessment": "판단 불가",
                "requires_response": False,
                "auto_send_ok": False,
                "confidence": 0.0,
                "suggested_response": None,
                "schedule_impact": {"type": "none"},
                "follow_up_actions": [],
            }

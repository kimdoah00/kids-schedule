from typing import Optional, Tuple
import os
import json
from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Child, Contact, Activity, ScheduleBlock, ChatMessage
from routers.schedule import format_time
from prompts.mom_ai import MOM_AI_PROMPT
from prompts.inbox import INBOX_PROMPT
from prompts.schedule_guard import SCHEDULE_GUARD_PROMPT

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

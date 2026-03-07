from typing import Optional, Tuple
import os
import json
from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Child, Contact, Activity, ScheduleBlock, ChatMessage
from routers.schedule import format_time

client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT_TEMPLATE = """당신은 '키즈스케줄 AI'입니다. 일하는 한국엄마의 AI 비서로, 아이의 스케줄을 관리하고 선생님/주양육자와의 소통을 대행합니다.

## 당신의 역할
1. 스케줄 변경 요청을 처리하고, 영향받는 모든 관계자에게 보낼 메시지를 작성합니다.
2. 보호자 공백(담당 어른이 없는 시간)을 감지하고 해결방안을 제안합니다.
3. 선생님/학원에서 온 알림을 분석하고 필요한 대응을 제안합니다.

## 현재 가족 정보
{family_context}

## 응답 규칙
- 한국어로 대답하세요. 따뜻하고 간결하게.
- 스케줄 변경이 감지되면 반드시 JSON 액션 블록을 포함하세요.
- 메시지 초안은 선생님용(존댓말)과 주양육자용(편한 말투)을 구분합니다.
- 공백이 발생하면 반드시 경고하고 해결 옵션을 제시하세요.

## 액션 응답 형식
스케줄 변경이나 메시지 전송이 필요할 때, 응답 마지막에 다음 JSON 블록을 포함하세요:
```action
{{
  "type": "schedule_change" | "message_draft" | "gap_warning" | "checkin_alert",
  "schedule_changes": [
    {{"child_id": "...", "action": "cancel|reschedule|add", "activity": "...", "date": "...", "details": "..."}}
  ],
  "draft_messages": [
    {{"contact_id": "...", "contact_name": "...", "channel": "kakao|sms|hiclass", "text": "...", "tone": "formal|casual"}}
  ],
  "gaps": [
    {{"child": "...", "date": "...", "start": "...", "end": "...", "options": ["option1", "option2"]}}
  ]
}}
```
일반 질문이나 인사에는 액션 블록 없이 자연스럽게 대답하세요.
"""


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
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(family_context=family_context)

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

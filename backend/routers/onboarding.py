import os
import json
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from anthropic import AsyncAnthropic

from database import get_db
from models import User
from schemas import (
    SmsScanRequest, SmsScanResponse, DetectedContact, DetectedSchedule,
    ScheduleOcrRequest, ScheduleOcrResponse, OcrScheduleItem,
)
from utils.auth import get_current_user

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SMS_ANALYSIS_PROMPT = """당신은 한국 초등학생 엄마의 문자 메시지를 분석하는 AI입니다.

다음 문자 메시지 목록에서 아이의 학교/학원/돌봄 관련 연락처와 스케줄 패턴을 추출하세요.

## 분석할 메시지
{messages}

## 추출 규칙
1. 입퇴실/출석/도착/탑승 관련 반복 패턴을 찾으세요
2. 각 전화번호가 어떤 역할(학교, 학원, 돌봄, 셔틀, 주양육자)인지 판단하세요
3. 반복되는 시간 패턴에서 스케줄을 추출하세요
4. channel은 문자는 "sms", 카카오톡은 "kakao"로 구분하세요

## 응답 형식 (반드시 이 JSON 형식으로)
```json
{{
  "contacts": [
    {{
      "phone_number": "010-xxxx-xxxx",
      "detected_name": "돌봄교실",
      "detected_role": "teacher|caregiver|shuttle|admin",
      "channel": "sms|kakao",
      "pattern": "매일 13:30 입실/14:00 퇴실 알림",
      "sample_messages": ["메시지1", "메시지2"]
    }}
  ],
  "schedules": [
    {{
      "activity_name": "돌봄교실",
      "days": [0,1,2,3,4],
      "start_time": "13:30",
      "end_time": "14:00",
      "contact_phone": "010-xxxx-xxxx"
    }}
  ]
}}
```
"""


@router.post("/analyze-sms", response_model=SmsScanResponse)
async def analyze_sms(
    req: SmsScanRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Analyze SMS history to auto-detect contacts and schedule patterns."""

    # Format messages for AI
    msg_text = "\n".join(
        f"[{m.timestamp}] {m.phone_number} ({m.sender_name or '알 수 없음'}): {m.body}"
        for m in req.messages[:200]  # Limit to 200 messages
    )

    prompt = SMS_ANALYSIS_PROMPT.format(messages=msg_text)

    response = await client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    ai_text = response.content[0].text

    # Parse JSON from response
    try:
        json_start = ai_text.index("```json") + 7
        json_end = ai_text.index("```", json_start)
        data = json.loads(ai_text[json_start:json_end].strip())
    except (ValueError, json.JSONDecodeError):
        # Fallback: try parsing entire response as JSON
        try:
            data = json.loads(ai_text)
        except json.JSONDecodeError:
            data = {"contacts": [], "schedules": []}

    contacts = [
        DetectedContact(
            phone_number=c.get("phone_number", ""),
            detected_name=c.get("detected_name"),
            detected_role=c.get("detected_role", "teacher"),
            channel=c.get("channel", "sms"),
            pattern=c.get("pattern", ""),
            sample_messages=c.get("sample_messages", []),
        )
        for c in data.get("contacts", [])
    ]

    schedules = [
        DetectedSchedule(
            activity_name=s.get("activity_name", ""),
            days=s.get("days", []),
            start_time=s.get("start_time", ""),
            end_time=s.get("end_time", ""),
            contact_phone=s.get("contact_phone"),
        )
        for s in data.get("schedules", [])
    ]

    return SmsScanResponse(
        contacts=contacts,
        schedules=schedules,
        total_analyzed=len(req.messages),
    )


SCHEDULE_OCR_PROMPT = """이 이미지는 한국 초등학생의 주간 스케줄표입니다.
이미지에서 모든 활동/수업/학원/돌봄 스케줄을 추출하세요.

## 추출 규칙
1. 각 활동의 이름, 요일, 시작/종료 시간을 정확히 추출
2. 요일은 숫자로: 월=0, 화=1, 수=2, 목=3, 금=4
3. activity_type: school(정규수업), academy(학원), care(돌봄/늘봄), shuttle(이동/셔틀), other(기타)
4. 시간은 "HH:MM" 형식 (24시간)

## 응답 형식 (반드시 이 JSON만 출력)
```json
{
  "schedules": [
    {
      "activity_name": "정규수업",
      "activity_type": "school",
      "days": [0,1,2,3,4],
      "start_time": "09:00",
      "end_time": "13:20"
    }
  ],
  "raw_text": "이미지에서 읽은 원본 텍스트"
}
```
"""


@router.post("/analyze-schedule-photo", response_model=ScheduleOcrResponse)
async def analyze_schedule_photo(
    req: ScheduleOcrRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Analyze a schedule photo using Claude Vision to extract schedule data."""
    import base64

    # Detect image type
    image_data = req.image_base64
    if image_data.startswith("data:"):
        media_type = image_data.split(";")[0].split(":")[1]
        image_data = image_data.split(",")[1]
    else:
        media_type = "image/jpeg"

    child_context = f"\n아이 이름: {req.child_name}" if req.child_name else ""

    response = await client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=2000,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_data,
                    },
                },
                {
                    "type": "text",
                    "text": SCHEDULE_OCR_PROMPT + child_context,
                },
            ],
        }],
    )

    ai_text = response.content[0].text

    try:
        json_start = ai_text.index("```json") + 7
        json_end = ai_text.index("```", json_start)
        data = json.loads(ai_text[json_start:json_end].strip())
    except (ValueError, json.JSONDecodeError):
        try:
            data = json.loads(ai_text)
        except json.JSONDecodeError:
            data = {"schedules": [], "raw_text": ai_text}

    schedules = [
        OcrScheduleItem(
            activity_name=s.get("activity_name", ""),
            activity_type=s.get("activity_type", "other"),
            days=s.get("days", []),
            start_time=s.get("start_time", ""),
            end_time=s.get("end_time", ""),
        )
        for s in data.get("schedules", [])
    ]

    return ScheduleOcrResponse(
        schedules=schedules,
        raw_text=data.get("raw_text"),
    )

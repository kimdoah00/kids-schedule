# Mom Agent v3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform kids-schedule from a passive notification store into an autonomous Mom Agent that reads incoming messages, judges priority, and responds on mom's behalf.

**Architecture:** 5-Agent pipeline — Inbox Agent parses and identifies sender/activity, new Mom-Responder Agent assesses priority and drafts responses, existing Guardian-Sync formats messages per channel, auto-sends or queues for mom approval via push notification.

**Tech Stack:** FastAPI, SQLAlchemy async, Anthropic Claude API (Haiku for parsing/formatting, Sonnet for judgment), Expo push notifications

---

### Task 1: Data Model — ActivityContact junction table

**Files:**
- Modify: `backend/models.py:119-130` (add ActivityContact class + Activity relationship)
- Modify: `backend/schemas.py` (add ActivityContactCreate/Response schemas)

**Step 1: Add ActivityContact model to models.py**

After the `Activity` class (line 130), add:

```python
class ActivityContact(Base):
    __tablename__ = "activity_contacts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    activity_id: Mapped[str] = mapped_column(ForeignKey("activities.id"))
    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id"))
    role: Mapped[str] = mapped_column(String(20))  # teacher, shuttle, pickup, admin
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    activity: Mapped["Activity"] = relationship(back_populates="activity_contacts")
    contact: Mapped["Contact"] = relationship()
```

Add to `Activity` class:
```python
    activity_contacts: Mapped[List["ActivityContact"]] = relationship(back_populates="activity")
```

**Step 2: Add schemas to schemas.py**

```python
# ===== ACTIVITY CONTACTS =====

class ActivityContactCreate(BaseModel):
    contact_id: str
    role: str  # teacher, shuttle, pickup, admin
    is_primary: bool = False

class ActivityContactResponse(BaseModel):
    id: str
    contact_id: str
    contact_name: str
    role: str
    is_primary: bool
    channel: str
```

**Step 3: Verify server starts**

Run: `cd backend && python3 -c "from models import *; print('OK')"`
Expected: OK

**Step 4: Commit**

```bash
git add backend/models.py backend/schemas.py
git commit -m "feat: add ActivityContact junction table for multi-contact per activity"
```

---

### Task 2: Data Model — Extend IncomingNotification + add PendingResponse

**Files:**
- Modify: `backend/models.py:184-196` (extend IncomingNotification)
- Modify: `backend/models.py` (add PendingResponse, ResponseStatus enum)

**Step 1: Add ResponseStatus enum**

After `NotificationStatus` enum:

```python
class ResponseStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    EDITED = "edited"
    REJECTED = "rejected"
    AUTO_SENT = "auto_sent"
```

**Step 2: Extend IncomingNotification**

Add these columns to the existing `IncomingNotification` class:

```python
    activity_id: Mapped[Optional[str]] = mapped_column(ForeignKey("activities.id"), nullable=True)
    child_id: Mapped[Optional[str]] = mapped_column(ForeignKey("children.id"), nullable=True)
    priority: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # urgent/normal/info
    requires_response: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_responded: Mapped[bool] = mapped_column(Boolean, default=False)
```

**Step 3: Add PendingResponse model**

```python
class PendingResponse(Base):
    __tablename__ = "pending_responses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    notification_id: Mapped[str] = mapped_column(ForeignKey("incoming_notifications.id"))
    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id"))
    channel: Mapped[str] = mapped_column(String(20))  # sms, kakao, hiclass
    draft_text: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(20))  # urgent, normal
    confidence_score: Mapped[float] = mapped_column(default=0.0)
    status: Mapped[ResponseStatus] = mapped_column(SAEnum(ResponseStatus), default=ResponseStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    notification: Mapped["IncomingNotification"] = relationship()
    contact: Mapped["Contact"] = relationship()
```

**Step 4: Add PendingResponse schemas to schemas.py**

```python
# ===== PENDING RESPONSES =====

class PendingResponseResponse(BaseModel):
    id: str
    notification_id: str
    contact_id: str
    contact_name: str
    channel: str
    draft_text: str
    priority: str
    confidence_score: float
    status: str
    created_at: str
    raw_notification: str  # original message that triggered this

class ResponseEditRequest(BaseModel):
    text: str
```

**Step 5: Verify**

Run: `cd backend && python3 -c "from models import *; print('OK')"`

**Step 6: Commit**

```bash
git add backend/models.py backend/schemas.py
git commit -m "feat: extend IncomingNotification + add PendingResponse model"
```

---

### Task 3: Mom-Responder Agent — Prompt

**Files:**
- Create: `backend/prompts/mom_responder.py`

**Step 1: Write the prompt**

```python
MOM_RESPONDER_PROMPT = """당신은 엄마를 대신하여 아이 관련 알림을 판단하고 대응 방법을 결정하는 AI입니다.

## 입력 정보
- 파싱된 알림 내용 (Inbox Agent 결과)
- 발신자 연락처 정보 (이름, 역할, 관계, 소속)
- 관련 활동 정보 (활동명, 유형)
- 아이 정보 (이름, 학년)
- 오늘의 전체 스케줄
- 최근 24시간 같은 연락처 대화 이력

## 판단 기준

### priority (긴급도)
- **urgent**: 아이 건강 이상, 사고, 긴급 연락 요청, 즉시 픽업 필요
- **normal**: 스케줄 변경, 준비물 안내, 비정형 공지, 질문에 대한 답변 필요
- **info**: 출석/도착/탑승 확인, 월 납부 안내, 정기 공지

### auto_send_ok (자동 발송 가능 여부)
- true: 정형화된 감사/확인 응답 (출석 확인 → "감사합니다~")
- false: 판단이 필요한 상황, 스케줄 영향, 비정형 내용

### confidence (신뢰도 0.0~1.0)
- 0.9+: 매우 확실한 판단 (출석 확인 등)
- 0.7~0.9: 높은 확신 (일반 공지 응답)
- 0.5~0.7: 엄마 확인 필요
- 0.5 미만: 판단 불가, 엄마에게 전달만

## 응답 규칙
1. suggested_response는 발신자와의 관계에 맞는 톤으로 작성
   - 선생님: 존댓말 ("감사합니다, 선생님!")
   - 셔틀기사: 편한 존댓말 ("감사합니다~")
   - 가족: 편한 말투 ("네 알겠어요~")
2. schedule_impact가 있으면 영향받는 활동과 조치 사항 명시
3. follow_up_actions로 연쇄 대응 제안 (수업 취소 → 다음 활동 연락처에도 알림)

## 응답 (JSON만 출력)
```json
{{
  "priority": "urgent|normal|info",
  "assessment": "판단 근거 1-2문장",
  "requires_response": true,
  "auto_send_ok": true,
  "confidence": 0.92,
  "suggested_response": "응답 초안 텍스트",
  "response_channel": "sms|kakao|hiclass",
  "schedule_impact": {{
    "type": "none|cancel|reschedule|add",
    "affected_activities": ["활동명 (시간)"],
    "action_needed": "필요한 조치 설명"
  }},
  "follow_up_actions": [
    {{
      "type": "notify_contact",
      "contact_name": "연락처 이름",
      "message": "보낼 메시지"
    }}
  ]
}}
```"""
```

**Step 2: Commit**

```bash
git add backend/prompts/mom_responder.py
git commit -m "feat: add Mom-Responder Agent prompt"
```

---

### Task 4: Mom-Responder Agent — Service function

**Files:**
- Modify: `backend/services/ai_service.py` (add assess_and_respond function)

**Step 1: Add import**

At top of ai_service.py, add:
```python
from prompts.mom_responder import MOM_RESPONDER_PROMPT
```

**Step 2: Add sender identification function**

```python
async def identify_sender(
    db: AsyncSession, family_id: str, source_app: str, source_channel: str, raw_message: str
) -> Optional[tuple]:
    """Identify which contact sent this notification and which activity it relates to.
    Returns (contact, activity) or (None, None)."""
    from models import Contact, ActivityContact, Activity

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
```

**Step 3: Add Mom-Responder function**

```python
async def assess_and_respond(
    db: AsyncSession,
    family_id: str,
    parsed_notification: dict,
    contact: Optional[object],
    activity: Optional[object],
    child: Optional[object],
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
```

**Step 4: Verify import**

Run: `cd backend && python3 -c "from services.ai_service import assess_and_respond, identify_sender; print('OK')"`

**Step 5: Commit**

```bash
git add backend/services/ai_service.py
git commit -m "feat: add Mom-Responder service functions (identify_sender + assess_and_respond)"
```

---

### Task 5: Wire notification pipeline — connect Inbox → Mom-Responder → auto-send/queue

**Files:**
- Modify: `backend/routers/checkin.py:77-153` (rewrite process_notification endpoint)

**Step 1: Update imports in checkin.py**

```python
from models import (
    User, Child, CheckinEvent, CheckinEventType, ScheduleBlock,
    Activity, Contact, IncomingNotification, ActivityContact,
    PendingResponse, ResponseStatus,
)
from services.ai_service import parse_notification, identify_sender, assess_and_respond
from services.sms_service import send_sms
from services.push_service import send_push_to_family
```

**Step 2: Rewrite process_notification endpoint**

Replace the existing `process_notification` function (lines 77-153) with:

```python
@router.post("/notification")
async def process_notification(
    req: CheckinRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Process raw notification via 5-Agent pipeline:
    Inbox Agent → Mom-Responder → auto-send or approval queue."""

    # === Stage 1: Inbox Agent (parse + identify) ===
    parsed = await parse_notification(
        raw_message=req.raw_message,
        source_app=req.source_app or "unknown",
        source_channel=req.source_channel or "unknown",
    )
    parsed["raw_message"] = req.raw_message

    event_type = parsed.get("event_type", "chat")

    # Identify sender contact and related activity
    contact, activity = await identify_sender(
        db, user.family_id,
        req.source_app or "", req.source_channel or "", req.raw_message,
    )

    # Identify child
    child = None
    child_id = req.child_id
    if not child_id and parsed.get("child_name"):
        child_result = await db.execute(
            select(Child).where(
                Child.family_id == user.family_id,
                Child.name.contains(parsed["child_name"]),
            )
        )
        child = child_result.scalar_one_or_none()
        if child:
            child_id = child.id
    elif child_id:
        child = await db.get(Child, child_id)

    # Create CheckinEvent for enter/exit events
    if event_type in ("enter", "exit", "board", "arrive") and child_id:
        now = datetime.now()
        matched_block_id = None
        blocks_result = await db.execute(
            select(ScheduleBlock).join(Activity)
            .where(Activity.child_id == child_id, ScheduleBlock.day_of_week == now.weekday())
            .order_by(ScheduleBlock.start_time)
        )
        for block in blocks_result.scalars().all():
            if block.start_time <= now.time() <= block.end_time:
                matched_block_id = block.id
                break

        checkin = CheckinEvent(
            child_id=child_id,
            schedule_block_id=matched_block_id,
            event_type=CheckinEventType(event_type),
            raw_message=req.raw_message,
            source_contact_id=contact.id if contact else None,
            source_app=req.source_app,
            source_channel=req.source_channel,
            matched=matched_block_id is not None,
        )
        db.add(checkin)

    # === Stage 2: Mom-Responder Agent (assess + decide) ===
    assessment = await assess_and_respond(
        db, user.family_id, parsed, contact, activity, child,
    )

    priority = assessment.get("priority", "info")
    auto_send_ok = assessment.get("auto_send_ok", False)
    confidence = assessment.get("confidence", 0.0)
    suggested_response = assessment.get("suggested_response")
    requires_response = assessment.get("requires_response", False)

    # Save notification with enriched data
    notification = IncomingNotification(
        family_id=user.family_id,
        source_contact_id=contact.id if contact else None,
        raw_content=req.raw_message,
        ai_summary=parsed.get("summary"),
        schedule_impact=assessment.get("schedule_impact", {}).get("type"),
        source_app=req.source_app,
        source_channel=req.source_channel,
        activity_id=activity.id if activity else None,
        child_id=child_id,
        priority=priority,
        requires_response=requires_response,
    )
    db.add(notification)
    await db.flush()  # get notification.id

    # === Stage 3: Auto-send or Queue ===
    response_action = None

    if requires_response and suggested_response and contact:
        channel = assessment.get("response_channel", contact.channel.value)

        if auto_send_ok and confidence >= 0.85:
            # Auto-send
            if channel == "sms" and contact.phone:
                await send_sms(contact.phone, suggested_response)

            pending = PendingResponse(
                family_id=user.family_id,
                notification_id=notification.id,
                contact_id=contact.id,
                channel=channel,
                draft_text=suggested_response,
                priority=priority,
                confidence_score=confidence,
                status=ResponseStatus.AUTO_SENT,
                responded_at=datetime.utcnow(),
            )
            db.add(pending)
            notification.auto_responded = True
            response_action = "auto_sent"
        else:
            # Queue for mom approval
            pending = PendingResponse(
                family_id=user.family_id,
                notification_id=notification.id,
                contact_id=contact.id,
                channel=channel,
                draft_text=suggested_response,
                priority=priority,
                confidence_score=confidence,
                status=ResponseStatus.PENDING,
            )
            db.add(pending)
            response_action = "queued_for_approval"

            # Push notification to mom
            push_title = "🔔 응답 필요" if priority == "urgent" else "💬 응답 확인"
            push_body = f"{contact.name}: {parsed.get('summary', req.raw_message[:50])}"
            await send_push_to_family(
                db, user.family_id,
                title=push_title,
                body=push_body,
                data={"type": "pending_response", "notification_id": notification.id},
            )

    await db.commit()

    # Schedule-Guard trigger
    guard_result = None
    if event_type in ("enter", "exit", "board", "arrive") and child_id:
        from services.schedule_guard import run_guard_check
        guard_result = await run_guard_check(db, child_id)

    return {
        "parsed": parsed,
        "event_type": event_type,
        "priority": priority,
        "assessment": assessment.get("assessment"),
        "response_action": response_action,
        "guard_warnings": guard_result.get("warnings", []) if guard_result else [],
    }
```

**Step 3: Verify server starts**

Run: `cd backend && python3 -c "from routers.checkin import router; print('OK')"`

**Step 4: Commit**

```bash
git add backend/routers/checkin.py
git commit -m "feat: wire 5-Agent notification pipeline (Inbox → Mom-Responder → auto-send/queue)"
```

---

### Task 6: Approval Queue API endpoints

**Files:**
- Create: `backend/routers/responses.py`
- Modify: `backend/main.py` (register router)

**Step 1: Create responses router**

```python
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
```

**Step 2: Register router in main.py**

Add import and include_router:
```python
from routers import auth, children, contacts, schedule, chat, checkin, onboarding, guardian_view, messages, responses
# ...
app.include_router(responses.router)
```

**Step 3: Verify**

Run: `cd backend && python3 -c "from routers.responses import router; print('OK')"`

**Step 4: Commit**

```bash
git add backend/routers/responses.py backend/main.py
git commit -m "feat: add approval queue API (GET pending, POST approve/edit/reject)"
```

---

### Task 7: Activity-Contacts API endpoints

**Files:**
- Modify: `backend/routers/schedule.py` (add activity contacts endpoints)

**Step 1: Add endpoints to schedule.py**

Add at the end of the file:

```python
from models import ActivityContact
from schemas import ActivityContactCreate, ActivityContactResponse


@router.get("/activities/{activity_id}/contacts", response_model=list[ActivityContactResponse])
async def list_activity_contacts(
    activity_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List contacts linked to an activity."""
    result = await db.execute(
        select(ActivityContact).where(ActivityContact.activity_id == activity_id)
    )
    acs = result.scalars().all()

    items = []
    for ac in acs:
        contact = await db.get(Contact, ac.contact_id)
        if contact:
            items.append(ActivityContactResponse(
                id=ac.id,
                contact_id=ac.contact_id,
                contact_name=contact.name,
                role=ac.role,
                is_primary=ac.is_primary,
                channel=contact.channel.value,
            ))
    return items


@router.post("/activities/{activity_id}/contacts", response_model=ActivityContactResponse)
async def add_activity_contact(
    activity_id: str,
    req: ActivityContactCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Link a contact to an activity."""
    contact = await db.get(Contact, req.contact_id)
    if not contact:
        raise HTTPException(404, "Contact not found")

    ac = ActivityContact(
        activity_id=activity_id,
        contact_id=req.contact_id,
        role=req.role,
        is_primary=req.is_primary,
    )
    db.add(ac)
    await db.commit()
    await db.refresh(ac)

    return ActivityContactResponse(
        id=ac.id,
        contact_id=ac.contact_id,
        contact_name=contact.name,
        role=ac.role,
        is_primary=ac.is_primary,
        channel=contact.channel.value,
    )


@router.delete("/activities/{activity_id}/contacts/{contact_id}")
async def remove_activity_contact(
    activity_id: str,
    contact_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Unlink a contact from an activity."""
    result = await db.execute(
        select(ActivityContact).where(
            ActivityContact.activity_id == activity_id,
            ActivityContact.contact_id == contact_id,
        )
    )
    ac = result.scalar_one_or_none()
    if not ac:
        raise HTTPException(404, "Activity-Contact link not found")

    await db.delete(ac)
    await db.commit()
    return {"status": "deleted"}
```

**Step 2: Add missing imports if needed**

Ensure `Contact` and `HTTPException` are imported in schedule.py.

**Step 3: Commit**

```bash
git add backend/routers/schedule.py
git commit -m "feat: add activity-contacts CRUD endpoints"
```

---

### Task 8: App — Approval queue screen

**Files:**
- Create: `app/app/(mom)/approvals.tsx`
- Modify: `app/src/services/api.ts` (add approval API calls)

**Step 1: Add API functions to api.ts**

```typescript
// ===== RESPONSES (APPROVAL QUEUE) =====
export const responsesAPI = {
  listPending: async () => {
    const { data } = await api.get('/responses/pending');
    return data;
  },
  approve: async (id: string) => {
    const { data } = await api.post(`/responses/${id}/approve`);
    return data;
  },
  edit: async (id: string, text: string) => {
    const { data } = await api.post(`/responses/${id}/edit`, { text });
    return data;
  },
  reject: async (id: string) => {
    const { data } = await api.post(`/responses/${id}/reject`);
    return data;
  },
};
```

**Step 2: Create approvals screen**

Create `app/app/(mom)/approvals.tsx` with:
- List of pending responses (pull-to-refresh)
- Each card shows: contact name, original notification, AI draft
- 3 action buttons: Approve (green), Edit (blue), Reject (gray)
- Edit opens TextInput modal to modify draft before sending
- Priority badge (urgent = red, normal = yellow)
- Empty state: "모든 알림이 처리되었습니다"

**Step 3: Add tab or navigation entry**

Add "승인" tab to the existing tab navigator if there's space, or add it as a modal accessible from the timeline/messages screen.

**Step 4: Commit**

```bash
git add app/app/(mom)/approvals.tsx app/src/services/api.ts
git commit -m "feat: add approval queue screen in app"
```

---

### Task 9: Integration test — Full pipeline

**Files:**
- Test manually via curl or app

**Step 1: Test notification → assessment → queue flow**

```bash
# 1. Register and get token
TOKEN=$(curl -s -X POST https://kids-schedule-production-ff25.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"role": "mom", "name": "테스트엄마"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Send a test notification
curl -X POST https://kids-schedule-production-ff25.up.railway.app/checkin/notification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "raw_message": "지윤이가 피아노교실에 출석했습니다",
    "source_app": "SMS",
    "source_channel": "sms"
  }'

# Expected: response with priority, assessment, response_action

# 3. Check pending responses
curl -X GET https://kids-schedule-production-ff25.up.railway.app/responses/pending \
  -H "Authorization: Bearer $TOKEN"
```

**Step 2: Verify each scenario**

- Info message (출석 확인) → auto_sent
- Normal message (수업 취소) → queued_for_approval
- Urgent message (아이 아픔) → queued + push notification

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: pipeline integration adjustments"
```

---

### Task 10: Deploy and push

**Step 1: Push to GitHub (triggers Railway auto-deploy)**

```bash
git push origin main
```

**Step 2: Rebuild APK**

```bash
cd app && eas build --platform android --profile preview --non-interactive
```

**Step 3: Verify health**

```bash
curl https://kids-schedule-production-ff25.up.railway.app/health
```

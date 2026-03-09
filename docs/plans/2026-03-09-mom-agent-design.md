# Mom Agent v3 Design: 자율 알림 판단 + 자동 대응 시스템

**Date**: 2026-03-09
**Status**: Approved
**Approach**: 5-Agent Pipeline (접근법 B)

## Problem Statement

현재 kids-schedule v2는 알림을 캡처하고 저장하지만, 엄마를 대신하여 판단하고 대응하지 못한다.

핵심 사용자 시나리오:
1. 아이의 일정별로 관련 연락처가 2-3개씩 있다
2. 해당 연락처들에게서 다양한 연락이 온다
3. 연락을 읽고 판단하여 엄마로서 대응해야 한다

## Architecture: 5-Agent Pipeline

```
[Android 알림 캡처]
       ↓
  POST /checkin/notification
       ↓
  ┌─ Inbox Agent (Haiku) ─────────────────┐
  │ 파싱 + 발신자 식별 + 활동 매핑         │
  │ → event_type, contact_id, activity_id │
  └───────────────────────────────────────┘
       ↓
  ┌─ Mom-Responder Agent (Sonnet) ────────┐
  │ 긴급도 판단 + 응답 결정                │
  │ → priority, suggested_response,       │
  │   auto_send_ok, schedule_impact       │
  └───────────────────────────────────────┘
       ↓
  ┌─ 분기 ─────────────────────────────────┐
  │                                        │
  │  auto_send_ok == true                  │
  │    → Guardian-Sync (Haiku)             │
  │    → 채널별 메시지 포맷팅              │
  │    → 자동 발송 (SMS API / 반자동)      │
  │                                        │
  │  auto_send_ok == false                 │
  │    → PendingResponse 테이블 저장       │
  │    → 엄마에게 푸시 알림                │
  │    → 앱에서 승인/수정/거부             │
  │                                        │
  │  schedule_impact 있음                  │
  │    → Schedule-Guard 트리거             │
  │    → 연쇄 알림 (다른 연락처에도 연락) │
  └────────────────────────────────────────┘
```

## Agent Roles

| Agent | 역할 | 모델 | 트리거 |
|-------|------|------|--------|
| Inbox | 파싱, 연락처/활동 식별 | Haiku | 알림 수신시 |
| **Mom-Responder (NEW)** | 긴급도 판단, 응답 결정, 스케줄 영향 분석 | Sonnet | Inbox 출력 후 |
| Schedule-Guard | 시간 기반 이상 감지 | Haiku | 체크인 이벤트 / 스케줄 영향 감지시 |
| Guardian-Sync | 채널/관계별 메시지 작성 | Haiku | 응답 발송시 |
| MOM-AI | 엄마 채팅 대화 | Sonnet | 엄마 채팅 입력시 |

## Data Model Changes

### New: ActivityContact (활동-연락처 다대다 매핑)

```python
class ActivityContact(Base):
    __tablename__ = "activity_contacts"

    id: Mapped[str]           # UUID PK
    activity_id: Mapped[str]  # FK → activities
    contact_id: Mapped[str]   # FK → contacts
    role: Mapped[str]         # "teacher" | "shuttle" | "pickup" | "admin"
    is_primary: Mapped[bool]  # 이 활동의 대표 연락처
```

Example:
| activity | contact | role | is_primary |
|----------|---------|------|------------|
| 피아노 | 피아노선생님 | teacher | true |
| 피아노 | 셔틀기사님 | shuttle | false |
| 피아노 | 할머니 | pickup | false |

### Extended: IncomingNotification

추가 컬럼:
- `activity_id: Optional[str]` — FK → activities
- `child_id: Optional[str]` — FK → children
- `priority: Optional[str]` — "urgent" | "normal" | "info"
- `requires_response: bool` — default False
- `auto_responded: bool` — default False
- `response_id: Optional[str]` — FK → pending_responses

### New: PendingResponse (승인 대기 큐)

```python
class PendingResponse(Base):
    __tablename__ = "pending_responses"

    id: Mapped[str]                    # UUID PK
    notification_id: Mapped[str]       # FK → incoming_notifications
    contact_id: Mapped[str]            # FK → contacts (응답 대상)
    channel: Mapped[str]               # "sms" | "kakao" | "hiclass"
    draft_text: Mapped[str]            # AI 응답 초안
    priority: Mapped[str]              # "urgent" | "normal"
    confidence_score: Mapped[float]    # 0.0 ~ 1.0
    status: Mapped[str]               # "pending" | "approved" | "edited" | "rejected" | "auto_sent"
    created_at: Mapped[datetime]
    responded_at: Mapped[Optional[datetime]]
```

## Mom-Responder Agent Design

### Input Context

```
- 파싱된 알림 내용 (Inbox Agent 출력)
- 발신자 연락처 정보 (이름, 역할, 관계)
- 관련 활동 정보 (피아노, 돌봄교실 등)
- 아이 정보 (이름, 학년)
- 오늘의 전체 스케줄
- 최근 24시간 같은 연락처 대화 이력
```

### Output Schema

```json
{
  "priority": "urgent | normal | info",
  "assessment": "판단 근거 설명",
  "requires_response": true,
  "auto_send_ok": false,
  "confidence": 0.95,
  "suggested_response": "응답 초안 텍스트",
  "response_channel": "kakao | sms | hiclass",
  "schedule_impact": {
    "type": "cancel_remaining | reschedule | none",
    "affected_activities": ["태권도 (16:00)"],
    "action_needed": "태권도 선생님에게도 결석 연락 필요"
  },
  "follow_up_actions": [
    {
      "type": "notify_contact",
      "contact": "태권도선생님",
      "message": "오늘 지윤이 조퇴해서 태권도 결석합니다."
    }
  ]
}
```

### Priority Decision Matrix

| 상황 | priority | auto_send_ok | action |
|------|----------|-------------|--------|
| 출석/도착 확인 | info | true | "감사합니다~" 자동발송 |
| 셔틀 탑승 확인 | info | true | "감사합니다~" 자동발송 |
| 일반 공지 (준비물 등) | normal | false | 초안 → 엄마 승인 |
| 스케줄 변경 (수업 취소) | normal | false | 초안 + 스케줄 업데이트 제안 |
| 아이 건강 이상 | urgent | false | 즉시 푸시 + 초안 + 스케줄 변경 제안 |
| 긴급 연락 요청 | urgent | false | 즉시 푸시 + 전화 제안 |
| 월 납부/행정 안내 | info | false | 정보 저장, 응답 불필요 |

### Auto-Send Criteria

```
confidence >= 0.85 AND priority == "info" → 자동 발송
confidence >= 0.85 AND priority == "normal" AND 정형화된 응답 → 자동 발송
그 외 → 엄마 승인 대기 (푸시 알림)
```

## API Endpoints (New)

### 승인 큐
```
GET  /responses/pending              # 승인 대기 목록
POST /responses/{id}/approve         # 승인 (그대로 발송)
POST /responses/{id}/edit            # 수정 후 발송 {text: "수정된 텍스트"}
POST /responses/{id}/reject          # 거부 (발송 안 함)
```

### 활동-연락처 매핑
```
GET    /activities/{id}/contacts              # 활동의 연락처 목록
POST   /activities/{id}/contacts              # 연락처 추가
DELETE /activities/{id}/contacts/{contact_id}  # 연락처 제거
```

## App UX: 승인 화면

푸시 알림 수신 후 앱에서 표시:

```
┌────────────────────────────────────┐
│ 💬 피아노선생님 → "내일 수업 쉽니다" │
│                                    │
│ AI 응답 초안:                       │
│ "네 선생님, 알겠습니다. 감사합니다!" │
│                                    │
│ [✅ 보내기] [✏️ 수정] [❌ 무시]      │
└────────────────────────────────────┘
```

urgent 알림은 전체화면 + 진동으로 즉시 알림.

## Cost Optimization

| Agent | 모델 | 호출 빈도 | 예상 비용/월 |
|-------|------|----------|-------------|
| Inbox | Haiku ($0.80/$4) | ~50/일 | ~$2 |
| Mom-Responder | Sonnet ($3/$15) | ~15/일 | ~$8 |
| Guardian-Sync | Haiku | ~10/일 | ~$1 |
| Schedule-Guard | Haiku | ~10/일 | ~$1 |
| MOM-AI | Sonnet | ~5/일 | ~$3 |
| **합계** | | | **~$15/월** |

## Implementation Phases

### Phase 1: Data Model + Mom-Responder (3일)
- ActivityContact 테이블 추가
- IncomingNotification 확장
- PendingResponse 테이블 추가
- Mom-Responder Agent 프롬프트 + 서비스 구현
- checkin notification 엔드포인트에 파이프라인 연결

### Phase 2: 승인 큐 + API (2일)
- /responses/* 엔드포인트
- /activities/*/contacts 엔드포인트
- 자동발송 로직 (confidence 기반)

### Phase 3: 앱 UX (2일)
- 승인 큐 화면 (앱 탭 또는 모달)
- 푸시 알림 연동
- 활동별 연락처 관리 UI

### Phase 4: 연쇄 대응 + 학습 (2일)
- follow_up_actions 처리 (연쇄 알림)
- schedule_impact → 스케줄 자동 업데이트
- 엄마 승인/거부 패턴 학습 (향후)

## Migration Notes

- 기존 Activity.contact_id는 유지 (하위 호환)
- ActivityContact 테이블로 점진적 마이그레이션
- 기존 Inbox Agent 프롬프트 확장 (연락처/활동 매핑 추가)
- checkin.py의 notification 엔드포인트에 Mom-Responder 호출 추가

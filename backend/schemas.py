from pydantic import BaseModel
from typing import Optional, List
from datetime import time, datetime


# ===== AUTH =====

class RegisterRequest(BaseModel):
    role: str  # "mom" or "caregiver"
    name: str
    phone: Optional[str] = None
    family_code: Optional[str] = None  # required for caregiver


class LoginRequest(BaseModel):
    phone: str
    family_code: str


class AuthResponse(BaseModel):
    user_id: str
    family_id: str
    family_code: str
    role: str
    token: str


# ===== CHILDREN =====

class ChildCreate(BaseModel):
    name: str
    grade: int
    school: Optional[str] = None


class ChildResponse(BaseModel):
    id: str
    name: str
    grade: int
    school: Optional[str]


# ===== CONTACTS =====

class ContactCreate(BaseModel):
    name: str
    role: str  # teacher, caregiver, shuttle, admin
    phone: Optional[str] = None
    channel: str = "kakao"
    linked_child_ids: Optional[List[str]] = None
    organization: Optional[str] = None


class ContactResponse(BaseModel):
    id: str
    name: str
    role: str
    phone: Optional[str]
    channel: str
    linked_child_ids: Optional[List[str]]
    organization: Optional[str]


# ===== SCHEDULE =====

class ScheduleBlockCreate(BaseModel):
    activity_name: str
    activity_type: str  # school, hagwon, care, home
    child_id: str
    day_of_week: int
    start_time: str  # "HH:MM"
    end_time: str
    guardian_contact_id: Optional[str] = None
    block_type: str = "activity"
    contact_id: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class ScheduleBlockResponse(BaseModel):
    id: str
    activity_name: str
    activity_type: str
    day_of_week: int
    start_time: str
    end_time: str
    guardian_contact_id: Optional[str]
    guardian_name: Optional[str] = None
    block_type: str
    notes: Optional[str]


class GapInfo(BaseModel):
    day_of_week: int
    start_time: str
    end_time: str
    before_activity: Optional[str] = None
    after_activity: Optional[str] = None


# ===== CHAT =====

class ChatRequest(BaseModel):
    message: str


class DraftMessage(BaseModel):
    contact_id: str
    contact_name: str
    channel: str
    draft_text: str
    app_package: Optional[str] = None


class SendResult(BaseModel):
    contact_name: str
    channel: str
    status: str  # sent, pending_user_action, error


class ChatResponse(BaseModel):
    response: str
    action_type: Optional[str] = None
    draft_messages: Optional[List[DraftMessage]] = None
    schedule_changes: Optional[dict] = None
    gaps_detected: Optional[List[GapInfo]] = None
    send_results: Optional[List[SendResult]] = None


# ===== CHECKIN =====

class CheckinRequest(BaseModel):
    child_id: Optional[str] = None  # Inbox Agent가 자동 매칭할 수도 있으므로 optional
    event_type: Optional[str] = None  # Inbox Agent가 판단
    raw_message: str
    source_contact_id: Optional[str] = None
    source_phone: Optional[str] = None
    source_app: Optional[str] = None  # 패키지명
    source_channel: Optional[str] = None  # hiclass/sms/kakao


# ===== NOTIFICATION =====

class NotificationAnalyzeRequest(BaseModel):
    raw_content: str
    source_phone: Optional[str] = None
    source_app: Optional[str] = None


# ===== SMS SCAN =====

class SmsMessage(BaseModel):
    phone_number: str
    body: str
    timestamp: str
    sender_name: Optional[str] = None


class SmsScanRequest(BaseModel):
    messages: List[SmsMessage]


class DetectedContact(BaseModel):
    phone_number: str
    detected_name: Optional[str] = None
    detected_role: str
    channel: str
    pattern: str
    sample_messages: List[str]


class DetectedSchedule(BaseModel):
    activity_name: str
    days: List[int]
    start_time: str
    end_time: str
    contact_phone: Optional[str] = None


class SmsScanResponse(BaseModel):
    contacts: List[DetectedContact]
    schedules: List[DetectedSchedule]
    total_analyzed: int


# ===== SCHEDULE OCR =====

class ScheduleOcrRequest(BaseModel):
    image_base64: str  # base64 encoded image
    child_name: Optional[str] = None


class OcrScheduleItem(BaseModel):
    activity_name: str
    activity_type: str  # school, academy, care, shuttle, other
    days: List[int]  # 0=Mon, 4=Fri
    start_time: str
    end_time: str


class ScheduleOcrResponse(BaseModel):
    schedules: List[OcrScheduleItem]
    raw_text: Optional[str] = None


# ===== PUSH =====

class PushRequest(BaseModel):
    title: str
    body: str
    data: Optional[dict] = None
    recipient_role: Optional[str] = "caregiver"

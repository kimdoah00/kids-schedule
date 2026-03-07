import uuid
from typing import Optional, List
from datetime import datetime, time
from sqlalchemy import String, Integer, Boolean, DateTime, Time, Text, ForeignKey, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from database import Base


def gen_uuid():
    return str(uuid.uuid4())


def gen_family_code():
    import random, string
    return ''.join(random.choices(string.digits, k=6))


class UserRole(str, enum.Enum):
    MOM = "mom"
    CAREGIVER = "caregiver"


class ContactRole(str, enum.Enum):
    TEACHER = "teacher"
    CAREGIVER = "caregiver"
    SHUTTLE = "shuttle"
    ADMIN = "admin"


class Channel(str, enum.Enum):
    KAKAO = "kakao"
    SMS = "sms"
    HICLASS = "hiclass"
    PHONE = "phone"


class BlockType(str, enum.Enum):
    ACTIVITY = "activity"
    TRANSITION = "transition"


class CheckinEventType(str, enum.Enum):
    ENTER = "enter"
    EXIT = "exit"
    BOARD = "board"
    ARRIVE = "arrive"


class NotificationStatus(str, enum.Enum):
    PENDING = "pending"
    RESOLVED = "resolved"
    IGNORED = "ignored"


# ===== USERS & FAMILIES =====

class Family(Base):
    __tablename__ = "families"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    family_code: Mapped[str] = mapped_column(String(6), unique=True, index=True, default=gen_family_code)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members: Mapped[List["User"]] = relationship(back_populates="family")
    children: Mapped[List["Child"]] = relationship(back_populates="family")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole))
    name: Mapped[str] = mapped_column(String(50))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    push_token: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    family: Mapped["Family"] = relationship(back_populates="members")


# ===== CHILDREN =====

class Child(Base):
    __tablename__ = "children"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    name: Mapped[str] = mapped_column(String(50))
    grade: Mapped[int] = mapped_column(Integer)
    school: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    family: Mapped["Family"] = relationship(back_populates="children")
    activities: Mapped[List["Activity"]] = relationship(back_populates="child")
    checkin_events: Mapped[List["CheckinEvent"]] = relationship(back_populates="child")


# ===== CONTACTS =====

class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    name: Mapped[str] = mapped_column(String(50))
    role: Mapped[ContactRole] = mapped_column(SAEnum(ContactRole))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    channel: Mapped[Channel] = mapped_column(SAEnum(Channel), default=Channel.KAKAO)
    linked_child_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    organization: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ===== ACTIVITIES & SCHEDULE =====

class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    child_id: Mapped[str] = mapped_column(ForeignKey("children.id"))
    name: Mapped[str] = mapped_column(String(100))
    activity_type: Mapped[str] = mapped_column(String(50))
    contact_id: Mapped[Optional[str]] = mapped_column(ForeignKey("contacts.id"), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    child: Mapped["Child"] = relationship(back_populates="activities")
    schedule_blocks: Mapped[List["ScheduleBlock"]] = relationship(back_populates="activity")


class ScheduleBlock(Base):
    __tablename__ = "schedule_blocks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    activity_id: Mapped[str] = mapped_column(ForeignKey("activities.id"))
    day_of_week: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    guardian_contact_id: Mapped[Optional[str]] = mapped_column(ForeignKey("contacts.id"), nullable=True)
    block_type: Mapped[BlockType] = mapped_column(SAEnum(BlockType), default=BlockType.ACTIVITY)
    expected_checkin_msg: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    activity: Mapped["Activity"] = relationship(back_populates="schedule_blocks")


# ===== CHECKIN EVENTS =====

class CheckinEvent(Base):
    __tablename__ = "checkin_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    child_id: Mapped[str] = mapped_column(ForeignKey("children.id"))
    schedule_block_id: Mapped[Optional[str]] = mapped_column(ForeignKey("schedule_blocks.id"), nullable=True)
    event_type: Mapped[CheckinEventType] = mapped_column(SAEnum(CheckinEventType))
    raw_message: Mapped[str] = mapped_column(Text)
    source_contact_id: Mapped[Optional[str]] = mapped_column(ForeignKey("contacts.id"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    matched: Mapped[bool] = mapped_column(Boolean, default=False)

    child: Mapped["Child"] = relationship(back_populates="checkin_events")


# ===== CHAT =====

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    action_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


# ===== NOTIFICATIONS =====

class IncomingNotification(Base):
    __tablename__ = "incoming_notifications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    source_contact_id: Mapped[Optional[str]] = mapped_column(ForeignKey("contacts.id"), nullable=True)
    raw_content: Mapped[str] = mapped_column(Text)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    schedule_impact: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[NotificationStatus] = mapped_column(SAEnum(NotificationStatus), default=NotificationStatus.PENDING)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ===== SMS SCAN =====

class SmsScanResult(Base):
    __tablename__ = "sms_scan_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    phone_number: Mapped[str] = mapped_column(String(20))
    detected_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    detected_pattern: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sample_messages: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)

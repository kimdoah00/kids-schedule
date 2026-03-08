import os
import hmac
import hashlib
import time as time_mod
import uuid
from datetime import datetime, timezone

import httpx

COOLSMS_API_KEY = os.getenv("COOLSMS_API_KEY")
COOLSMS_API_SECRET = os.getenv("COOLSMS_API_SECRET")
COOLSMS_FROM_NUMBER = os.getenv("COOLSMS_FROM_NUMBER")  # 발신번호 (사전등록 필요)


def _make_auth_header() -> str:
    """Generate HMAC-SHA256 auth header for Coolsms API."""
    date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    salt = str(uuid.uuid4())
    data = date + salt
    signature = hmac.new(
        COOLSMS_API_SECRET.encode("utf-8"),
        data.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"HMAC-SHA256 apiKey={COOLSMS_API_KEY}, date={date}, salt={salt}, signature={signature}"


async def send_sms(to: str, text: str) -> dict:
    """Send SMS via Coolsms API."""
    if not all([COOLSMS_API_KEY, COOLSMS_API_SECRET, COOLSMS_FROM_NUMBER]):
        return {"status": "error", "message": "SMS credentials not configured"}

    msg_type = "SMS" if len(text.encode("utf-8")) <= 90 else "LMS"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.coolsms.co.kr/messages/v4/send",
            headers={
                "Authorization": _make_auth_header(),
                "Content-Type": "application/json",
            },
            json={
                "message": {
                    "to": to.replace("-", ""),
                    "from": COOLSMS_FROM_NUMBER.replace("-", ""),
                    "text": text,
                    "type": msg_type,
                }
            },
        )
        return response.json()

from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.requests import Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import select

from database import async_session
from models import Family, Child, Activity, ScheduleBlock, Contact
from routers.schedule import format_time

router = APIRouter(tags=["guardian-view"])
templates = Jinja2Templates(directory="templates")

DAYS_KR = ["월", "화", "수", "목", "금", "토", "일"]


@router.get("/view/{family_code}", response_class=HTMLResponse)
async def guardian_weekly_view(request: Request, family_code: str):
    """Public weekly schedule view for caregivers. No auth required."""
    async with async_session() as db:
        result = await db.execute(
            select(Family).where(Family.family_code == family_code)
        )
        family = result.scalar_one_or_none()
        if not family:
            raise HTTPException(404, "가족을 찾을 수 없습니다")

        # Get children
        children_result = await db.execute(
            select(Child).where(Child.family_id == family.id)
        )
        children = children_result.scalars().all()

        children_schedules = []
        for child in children:
            weekly = {}
            for day in range(5):  # Mon-Fri
                blocks_result = await db.execute(
                    select(ScheduleBlock).join(Activity)
                    .where(Activity.child_id == child.id, ScheduleBlock.day_of_week == day)
                    .order_by(ScheduleBlock.start_time)
                )
                blocks = blocks_result.scalars().all()

                day_items = []
                for b in blocks:
                    activity = await db.get(Activity, b.activity_id)
                    guardian = await db.get(Contact, b.guardian_contact_id) if b.guardian_contact_id else None
                    day_items.append({
                        "time": f"{format_time(b.start_time)}-{format_time(b.end_time)}",
                        "name": activity.name if activity else "?",
                        "guardian": guardian.name if guardian else None,
                        "has_guardian": guardian is not None,
                    })
                weekly[DAYS_KR[day]] = day_items

            children_schedules.append({
                "name": child.name,
                "grade": child.grade,
                "school": child.school,
                "weekly": weekly,
            })

        return templates.TemplateResponse("guardian_weekly.html", {
            "request": request,
            "children": children_schedules,
            "updated_at": datetime.now().strftime("%m/%d %H:%M"),
        })

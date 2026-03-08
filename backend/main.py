import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers import auth, children, contacts, schedule, chat, checkin, onboarding, guardian_view, messages


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="키즈스케줄 API",
    description="일하는 엄마를 위한 AI 자녀 스케줄 매니저",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(children.router)
app.include_router(contacts.router)
app.include_router(schedule.router)
app.include_router(chat.router)
app.include_router(checkin.router)
app.include_router(onboarding.router)
app.include_router(guardian_view.router)
app.include_router(messages.router)


@app.get("/")
async def root():
    return {"app": "키즈스케줄", "version": "0.1.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "ok"}

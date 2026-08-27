from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import resume, interview, face, voice

app = FastAPI(
    title="IntivraBot AI Service",
    description="Resume ATS parsing & matching (Phase 3). Face/voice/interview added later.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume.router, prefix="/api", tags=["resume"])
app.include_router(interview.router, prefix="/api", tags=["interview"])
app.include_router(face.router, prefix="/api", tags=["face"])
app.include_router(voice.router, prefix="/api", tags=["voice"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "intivrabot-ai", "version": app.version}


@app.get("/")
def root():
    return {
        "service": "intivrabot-ai",
        "endpoints": [
            "/health",
            "/api/parse-resume",
            "/api/match",
            "/api/interview/question",
            "/api/interview/score",
            "/api/interview/summary",
        ],
    }

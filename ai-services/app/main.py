import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core import face as face_core, voice as voice_core
from app.routers import resume, interview, face, voice

# uvicorn only attaches handlers to its own loggers, and Railway shows nothing
# else — so warmup timings have to go out under uvicorn's to be visible there.
log = logging.getLogger("uvicorn.error")


def _warm_models() -> None:
    """Load the face/voice models once at boot.

    Left lazy, the first candidate to record pays ~47s on a laptop and minutes
    on a small container — far past the backend's 35s timeout, which surfaces as
    a bogus "couldn't read your voice" 422. Runs on its own thread so uvicorn
    binds the port immediately and Railway's health check doesn't time out.
    """
    for name, warm in (("face", face_core.warmup), ("voice", voice_core.warmup)):
        started = time.time()
        try:
            ok = warm()
        except Exception:  # a failed warmup must never stop the service booting
            log.exception("%s warmup crashed", name)
            continue
        log.info("%s warmup %s in %.1fs", name, "ok" if ok else "skipped", time.time() - started)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    threading.Thread(target=_warm_models, name="model-warmup", daemon=True).start()
    yield


app = FastAPI(
    title="IntivraBot AI Service",
    description="Resume ATS parsing & matching (Phase 3). Face/voice/interview added later.",
    version="1.0.0",
    lifespan=lifespan,
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

from fastapi import APIRouter

from app.core import voice
from app.models.schemas import VoiceAnalyzeRequest

router = APIRouter()


@router.get("/voice/status")
def voice_status():
    """Whether the voice-biometrics model (Resemblyzer) is importable."""
    return {"voiceEnabled": voice.voice_available()}


@router.post("/voice/analyze")
def voice_analyze(body: VoiceAnalyzeRequest):
    """Speaker embedding + identity match (vs reference) + multi-voice check
    for one answer's audio clip (raw Int16 PCM)."""
    return voice.analyze(body.audio, body.sampleRate, body.reference)

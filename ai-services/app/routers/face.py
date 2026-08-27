from fastapi import APIRouter

from app.core import face
from app.models.schemas import FaceAnalyzeRequest

router = APIRouter()


@router.get("/face/status")
def face_status():
    """Whether the face/emotion models are present and ready."""
    return {"faceEnabled": face.models_available()}


@router.post("/face/analyze")
def face_analyze(body: FaceAnalyzeRequest):
    """Detect faces, score emotion (confidence/stress) and, if a baseline is
    supplied, an identity match for a single interview frame."""
    return face.analyze(body.frame, body.baseline)

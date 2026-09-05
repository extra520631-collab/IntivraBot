from fastapi import APIRouter

from app.core import interview, gemini
from app.core.fields import detect_field, rubric
from app.models.schemas import (
    ConverseRequest,
    ConverseResponse,
    QuestionRequest,
    QuestionResponse,
    ScoreRequest,
    ScoreResponse,
    SummaryRequest,
    SummaryResponse,
)

router = APIRouter()


@router.get("/interview/status")
def interview_status():
    """Whether Gemini is active or the offline fallback is in use."""
    return {"geminiEnabled": gemini.is_enabled()}


@router.post("/interview/question", response_model=QuestionResponse)
def question(body: QuestionRequest):
    field = body.field or detect_field(body.jobTitle, body.jobSkills)
    q = interview.next_question(
        body.jobTitle,
        body.jobSkills,
        [qa.model_dump() for qa in body.previousQA],
        body.number,
        body.total,
        body.language,
        field=field,
        candidate=body.candidate.model_dump() if body.candidate else None,
    )
    # The field is returned so the backend can store it after the first call
    # and keep the whole interview in one style.
    return {"question": q, "field": field}


@router.post("/interview/score", response_model=ScoreResponse)
def score(body: ScoreRequest):
    return interview.score_answer(
        body.question,
        body.answer,
        body.jobTitle,
        body.jobSkills,
        body.language,
        field=body.field or detect_field(body.jobTitle, body.jobSkills),
        candidate=body.candidate.model_dump() if body.candidate else None,
    )


@router.post("/interview/converse", response_model=ConverseResponse)
def converse(body: ConverseRequest):
    """What did the candidate just say — an answer, a question, or a problem?

    This is what makes the interview a conversation rather than a form: only a
    genuine answer goes on to be scored, and anything else gets a spoken reply.
    """
    return interview.converse(
        body.utterance,
        body.question,
        body.jobTitle,
        body.jobSkills,
        [qa.model_dump() for qa in body.previousQA],
        [t.model_dump() for t in body.turns],
        body.language,
        field=body.field or detect_field(body.jobTitle, body.jobSkills),
        candidate=body.candidate.model_dump() if body.candidate else None,
    )


@router.post("/interview/detect-field")
def field_of(body: QuestionRequest):
    """Which field a role falls into — used when an HR posts a job."""
    field = detect_field(body.jobTitle, body.jobSkills)
    return {"field": field, "label": rubric(field)["label"]}


@router.post("/interview/summary", response_model=SummaryResponse)
def summary(body: SummaryRequest):
    return interview.summarize(
        body.jobTitle,
        [qa.model_dump() for qa in body.qa],
        body.passThreshold,
        turns=[t.model_dump() for t in body.turns],
    )

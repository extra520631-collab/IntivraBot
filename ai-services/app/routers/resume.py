from fastapi import APIRouter, File, UploadFile

from app.core.extract import extract_text, parse_resume
from app.core.matcher import match, match_many
from app.models.schemas import (
    ParseTextRequest,
    ParseResponse,
    MatchRequest,
    MatchResponse,
    MatchBatchRequest,
    MatchBatchResponse,
)

router = APIRouter()


@router.post("/parse-resume", response_model=ParseResponse)
def parse_resume_text(body: ParseTextRequest):
    """Parse skills / experience / education from raw resume text."""
    return parse_resume(body.text)


@router.post("/parse-resume-file", response_model=ParseResponse)
async def parse_resume_file(file: UploadFile = File(...)):
    """Parse an uploaded PDF / DOCX / TXT resume."""
    data = await file.read()
    text = extract_text(data, file.filename or "")
    return parse_resume(text)


@router.post("/extract-text")
async def extract_resume_text(file: UploadFile = File(...)):
    """Return the raw text of an uploaded PDF / DOCX / TXT resume."""
    data = await file.read()
    text = extract_text(data, file.filename or "")
    return {"text": text, "charCount": len(text)}


@router.post("/match", response_model=MatchResponse)
def match_resume(body: MatchRequest):
    """Score a resume against a job's required skills + experience."""
    return match(
        body.resumeText,
        body.jobSkills,
        body.jobExperience,
        extra_skills=body.profileSkills,
        experience_years=body.experienceYears,
    )


@router.post("/match-batch", response_model=MatchBatchResponse)
def match_resume_batch(body: MatchBatchRequest):
    """Score one resume against many jobs — used by the candidate job board."""
    results = match_many(
        body.resumeText,
        [j.model_dump() for j in body.jobs],
        extra_skills=body.profileSkills,
        experience_years=body.experienceYears,
    )
    return {"results": results}

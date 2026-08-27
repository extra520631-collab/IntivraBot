# IntivraBot — AI Services (Python + FastAPI)

Separate microservice for the heavy AI work, deployed on Railway. The Node
backend calls it over HTTP (`AI_SERVICE_URL`).

## Status
- ✅ **Phase 3** — ATS: resume parsing (`/parse-resume`, `/parse-resume-file`) + match scoring (`/match`)
- ✅ **Phase 4** — AI interviews (Gemini): adaptive question gen + answer scoring + summary (offline fallback built-in)
- ⬜ Phase 5 — face verification + emotion (DeepFace)
- ⬜ Phase 6 — voice biometrics (Resemblyzer)

## Structure
```
ai-services/
├── app/
│   ├── main.py            FastAPI entry (CORS, health, routers)
│   ├── config.py          settings (.env)
│   ├── core/
│   │   ├── skills.py      skills taxonomy + aliases
│   │   ├── extract.py     PDF/DOCX text + skill/experience/education parsing
│   │   └── matcher.py     ATS scoring (85% skills + 15% experience)
│   ├── models/schemas.py  pydantic request/response
│   └── routers/resume.py  /parse-resume, /parse-resume-file, /match
├── requirements.txt
└── .env.example
```

## Setup & run
```bash
cd ai-services
python -m venv .venv
# Windows:  .venv\Scripts\activate    macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000     # http://localhost:8000
```
Interactive API docs at **http://localhost:8000/docs**.

## Endpoints
| Method | Route | Body | Returns |
|--------|-------|------|---------|
| GET | `/health` | — | status |
| POST | `/api/parse-resume` | `{ text }` | `{ skills[], experienceYears, education[], charCount }` |
| POST | `/api/parse-resume-file` | multipart `file` (PDF/DOCX) | same as above |
| POST | `/api/match` | `{ resumeText, jobSkills[], jobExperience }` | `{ score, matchedSkills[], missingSkills[], resumeSkills[], … }` |
| GET | `/api/interview/status` | — | `{ geminiEnabled }` |
| POST | `/api/interview/question` | `{ jobTitle, jobSkills[], previousQA[], number, total, language }` | `{ question }` |
| POST | `/api/interview/score` | `{ question, answer, jobTitle, jobSkills[] }` | `{ score, feedback, strengths[], improvements[] }` |
| POST | `/api/interview/summary` | `{ jobTitle, qa[], passThreshold }` | `{ overallScore, verdict, strengths[], improvements[] }` |

### Interview engine
Uses **Gemini** when `GEMINI_API_KEY` is set (adaptive questions that build on prior
answers + rubric scoring). Without a key it runs a deterministic **offline fallback**
(question bank + length/relevance heuristic) so the flow works end-to-end for demos.

### ATS design
The matcher is deliberately **transparent** (important for a bias-free tool):
`score = 85% skill-coverage + 15% experience-fit`, and every matched / missing
skill is returned so any score can be explained. It uses a skills-taxonomy +
regex engine — fast, deterministic, no model download. spaCy NER can be layered
in later without changing the API.

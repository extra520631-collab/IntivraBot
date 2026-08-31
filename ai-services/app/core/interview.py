"""AI interview logic: adaptive question generation, answer scoring, and a
final summary. Uses Gemini when configured, otherwise a deterministic offline
engine so the whole flow works end-to-end without an API key."""

from app.core import gemini
from app.core.extract import extract_skills
from app.core.fields import detect_field, rubric

# ── Offline question bank (used when Gemini is not configured) ──
_GENERIC_QUESTIONS = [
    "Tell us briefly about yourself and your background.",
    "Describe a challenging project you worked on and your role in it.",
    "How do you approach learning a new technology or tool?",
    "Tell us about a time you worked in a team to solve a problem.",
    "Where do you see your skills adding the most value in this role?",
    "How do you handle tight deadlines or competing priorities?",
    "Describe a mistake you made and what you learned from it.",
]


def _skill_question(skill: str) -> str:
    return f"Can you describe your hands-on experience with {skill} and give a concrete example?"


def _level(years) -> str:
    """Difficulty band, so a fresher isn't asked staff-engineer questions."""
    try:
        y = float(years or 0)
    except (TypeError, ValueError):
        y = 0.0
    if y < 1:
        return "entry level (fresher) — keep questions foundational and practical"
    if y < 3:
        return "junior/mid level — expect hands-on detail but not architecture ownership"
    if y < 6:
        return "mid/senior level — expect design trade-offs and ownership"
    return "senior level — expect architecture, mentoring and judgement at scale"


def _candidate_block(candidate: dict | None) -> str:
    """What we know about this specific candidate, for the prompt."""
    if not candidate:
        return ""
    skills = ", ".join((candidate.get("skills") or [])[:20])
    parts = []
    if skills:
        parts.append(f"Skills on their CV: {skills}.")
    if candidate.get("headline"):
        parts.append(f"They describe themselves as: {candidate['headline']}.")
    years = candidate.get("experienceYears")
    if years is not None:
        parts.append(f"Experience: {years} year(s) — {_level(years)}.")
    if not parts:
        return ""
    return "About this candidate:\n" + " ".join(parts) + "\n"


# ── Question generation ──
def next_question(
    job_title,
    job_skills,
    previous_qa,
    number,
    total,
    language="English",
    field=None,
    candidate=None,
):
    field_id = field or detect_field(job_title, job_skills)
    guide = rubric(field_id)

    if gemini.is_enabled():
        history = "\n".join(
            f"Q{i+1}: {qa.get('question','')}\nA{i+1}: {qa.get('answer','')}"
            for i, qa in enumerate(previous_qa or [])
        ) or "(no previous answers yet)"
        prompt = (
            f"You are an experienced {guide['label']} interviewer hiring for a '{job_title}' role.\n"
            f"Required skills: {', '.join(job_skills) or 'general'}.\n\n"
            f"{_candidate_block(candidate)}\n"
            f"What to probe for this field: {guide['probe']}.\n"
            f"How to ask: {guide['style']}\n"
            f"Constraint: {guide['avoid']}\n\n"
            f"Conversation so far:\n{history}\n\n"
            f"Ask ONE interview question (#{number} of {total}). "
            f"Build on their previous answers — if an answer was vague, drill into it. "
            f"Never repeat a question already asked. "
            f"Pitch the difficulty at the candidate's level. "
            f"Ask exactly one question, in {language}. "
            f"Return ONLY the question text, no numbering or preamble."
        )
        text = gemini.generate(prompt, temperature=0.8)
        if text:
            return text.strip().strip('"')

    # Offline fallback. Alternates this field's own bank with skill-specific
    # questions, so a network engineer isn't handed developer questions just
    # because Gemini is unavailable.
    idx = max(0, number - 1)
    if job_skills and idx % 2 == 1:
        skill = job_skills[(idx // 2) % len(job_skills)]
        return _skill_question(skill)
    bank = guide.get("fallbacks") or _GENERIC_QUESTIONS
    return bank[(idx // 2) % len(bank)]


# ── Answer scoring ──
def score_answer(question, answer, job_title, job_skills, language="English", field=None, candidate=None):
    guide = rubric(field or detect_field(job_title, job_skills))

    if gemini.is_enabled():
        prompt = (
            f"You are an experienced {guide['label']} interviewer scoring one answer "
            f"for a '{job_title}' role.\n"
            f"Required skills: {', '.join(job_skills) or 'general'}.\n"
            f"For this field, a strong answer shows: {guide['probe']}.\n"
            f"{_candidate_block(candidate)}"
            f"Judge the answer against what is reasonable for their experience level, "
            f"not against a perfect textbook answer.\n\n"
            f"Question: {question}\n"
            f"Answer: {answer}\n\n"
            f"Score honestly — a vague or evasive answer must score low even if it is well worded, "
            f"and an answer that is off-topic for this field scores low regardless of length.\n\n"
            # An explicit band table is what keeps two candidates who gave
            # equally good answers from landing 13 points apart.
            f"Use this scale, and pick the band the answer actually fits:\n"
            f"  90-100  Specific, correct, and shows depth: real examples, trade-offs or measurable outcomes.\n"
            f"  75-89   Solid and relevant with a concrete example, but thin on depth or reasoning.\n"
            f"  60-74   Correct but general - little evidence they have done this themselves.\n"
            f"  40-59   Partly relevant, vague, or leaves the question half answered.\n"
            f"  20-39   Generic filler, or mostly restates the question.\n"
            f"  0-19    Off-topic, empty, or a list of keywords with no answer in it.\n\n"
            f"A short answer that is specific and correct beats a long one that says nothing.\n"
            f"Respond in strict JSON with keys: "
            f'score (integer 0-100), feedback (one short sentence), '
            f"strengths (array of up to 2 short phrases), "
            f"improvements (array of up to 2 short phrases)."
        )
        # Temperature 0 for scoring: the same answer must earn the same mark
        # every time, or two candidates who said the same thing are ranked by
        # chance. Creativity belongs in question generation, not marking.
        data = gemini.generate_json(prompt, temperature=0.0)
        if data and "score" in data:
            return {
                "score": _clamp(data.get("score")),
                "feedback": str(data.get("feedback", ""))[:300],
                "strengths": _as_list(data.get("strengths")),
                "improvements": _as_list(data.get("improvements")),
            }

    return _fallback_score(answer, job_skills)


# Words that carry no information about competence. A long answer built from
# these is padding, and scoring it on length alone rewards waffle.
_FILLER = {
    "basically", "actually", "really", "very", "just", "quite", "always", "definitely",
    "passionate", "hardworking", "hard", "worker", "team", "player", "dedicated",
    "motivated", "enthusiastic", "believe", "think", "feel", "try", "best", "good",
    "great", "nice", "thing", "things", "stuff", "etc", "many", "various", "several",
}

# Signals that an answer describes something the candidate actually did, rather
# than what they believe about themselves.
# Ordinary connective words. Real sentences are full of them; a pasted list of
# technologies has none.
_FUNCTION_WORDS = {
    "the", "a", "an", "and", "or", "but", "if", "so", "because", "then", "than",
    "with", "without", "to", "from", "for", "of", "in", "on", "at", "by", "as",
    "that", "this", "these", "those", "it", "its", "was", "were", "is", "are",
    "we", "i", "my", "our", "had", "have", "has", "did", "do", "does", "when",
    "where", "which", "while", "after", "before", "over", "into", "about",
}

_SPECIFIC_MARKERS = (
    "i built", "i wrote", "i designed", "i implemented", "i used", "i created",
    "i led", "i fixed", "i debugged", "i migrated", "i deployed", "i added",
    "we built", "we used", "for example", "such as", "resulted in", "reduced",
    "improved", "increased", "the problem was", "the issue was", "so i", "because",
)


def _fallback_score(answer, job_skills):
    """Heuristic score used when the AI service is unavailable.

    Deliberately harder to game than a length-plus-keyword count: that version
    scored a repeated keyword list higher than a thoughtful answer that simply
    did not name the exact skills, which is backwards. Four signals are blended
    so no single one can carry a weak answer.
    """
    answer = (answer or "").strip()
    tokens = [t.strip(".,!?;:()\"'").lower() for t in answer.split()]
    tokens = [t for t in tokens if t]
    words = len(tokens)

    if words < 5:
        return {
            "score": max(0, words * 2),
            "feedback": "Too short to assess - describe what you did and how.",
            "strengths": [],
            "improvements": ["Give a concrete example", "Explain your reasoning"],
        }

    lower = answer.lower()

    # 1. Substance: length, but saturating early so rambling gains nothing.
    length_score = min(1.0, words / 60.0)

    # 2. Relevance: skills named, credited generously (2 of the required set
    #    is already a relevant answer - naming all of them is not the point).
    mentioned = set(extract_skills(answer))
    relevant = mentioned.intersection(set(job_skills)) if job_skills else mentioned
    target = min(len(job_skills or []), 2) or 1
    relevance = min(1.0, len(relevant) / target)

    # 3. Specificity: did they describe real work? This is what separates a
    #    genuine short answer from a long generic one.
    specificity = min(1.0, sum(m in lower for m in _SPECIFIC_MARKERS) / 3.0)
    # Concrete numbers ("10,000 rows", "200ms", "3 seconds") are strong evidence.
    if any(t.replace(",", "").replace(".", "").isdigit() for t in tokens):
        specificity = min(1.0, specificity + 0.25)

    # 4. Density: what share of the answer is meaningful, and how varied is it?
    #    Repetition drives this down, which is what defeats keyword stuffing.
    unique_ratio = len(set(tokens)) / words
    filler_ratio = sum(t in _FILLER for t in tokens) / words
    density = max(0.0, min(1.0, unique_ratio - filler_ratio))

    score = round(
        (0.20 * length_score + 0.25 * relevance + 0.35 * specificity + 0.20 * density) * 100
    )

    # A list of technologies is not an answer to anything. Prose has function
    # words - "the", "a", "with", "to" - and a keyword dump has almost none, so
    # their absence is the clearest signal that nothing was actually said.
    function_words = sum(t in _FUNCTION_WORDS for t in tokens) / words
    if words >= 8 and function_words < 0.10:
        score = min(score, 15)
    # A wall of repeated words is likewise not an answer.
    if unique_ratio < 0.60:
        score = min(score, 20)
    score = _clamp(score)

    if specificity < 0.34:
        feedback = "Describe something you actually built or solved, and how."
    elif relevance < 0.34:
        feedback = "Good detail - tie it more directly to the skills this role needs."
    elif words < 25:
        feedback = "On the right track - a little more depth would strengthen it."
    else:
        feedback = "Clear, specific answer with relevant detail."

    strengths = []
    if specificity >= 0.5:
        strengths.append("Concrete example")
    if relevance >= 0.5:
        strengths.append("Relevant to the role")
    improvements = []
    if specificity < 0.5:
        improvements.append("Add a specific example")
    if relevance < 0.5:
        improvements.append("Mention the role's key skills")
    if words < 25:
        improvements.append("Go into more depth")

    return {
        "score": score,
        "feedback": feedback,
        "strengths": strengths,
        "improvements": improvements[:2],
    }


# ── Final summary ──
def summarize(job_title, qa, pass_threshold=75):
    scores = [q.get("score", 0) for q in qa if q.get("score") is not None]
    overall = round(sum(scores) / len(scores)) if scores else 0

    if gemini.is_enabled():
        transcript = "\n".join(
            f"Q: {q.get('question','')}\nA: {q.get('answer','')}\nScore: {q.get('score')}"
            for q in qa
        )
        prompt = (
            f"Summarize this interview for a '{job_title}' role.\n{transcript}\n\n"
            f"Respond in strict JSON with keys: verdict (one short sentence), "
            f"strengths (array of up to 3 phrases), improvements (array of up to 3 phrases)."
        )
        data = gemini.generate_json(prompt)
        if data:
            return {
                "overallScore": overall,
                "verdict": str(data.get("verdict", ""))[:300] or _verdict(overall, pass_threshold),
                "strengths": _as_list(data.get("strengths")),
                "improvements": _as_list(data.get("improvements")),
            }

    # Fallback: aggregate per-question feedback.
    strengths, improvements = [], []
    for q in qa:
        strengths += q.get("strengths", [])
        improvements += q.get("improvements", [])
    return {
        "overallScore": overall,
        "verdict": _verdict(overall, pass_threshold),
        "strengths": _dedupe(strengths)[:3],
        "improvements": _dedupe(improvements)[:3],
    }


def _verdict(overall, threshold):
    if overall >= threshold:
        return f"Strong interview ({overall}%) — meets the bar for this role."
    if overall >= threshold - 15:
        return f"Solid interview ({overall}%) — close, with room to grow."
    return f"Interview scored {overall}% — below the pass threshold for this role."


# ── helpers ──
def _clamp(v):
    try:
        return max(0, min(100, int(round(float(v)))))
    except (TypeError, ValueError):
        return 0


def _as_list(v):
    if isinstance(v, list):
        return [str(x)[:120] for x in v][:3]
    if v:
        return [str(v)[:120]]
    return []


def _dedupe(items):
    seen, out = set(), []
    for i in items:
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out

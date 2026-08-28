"""ATS match scoring: resume vs a job's requirements.

Transparent + explainable (important for a bias-free hiring tool):
  score = 85% skill coverage + 15% experience fit
Every matched / missing skill is returned so the result can be justified.
"""

import re

from app.core.extract import _SKILL_PATTERNS, extract_skills, extract_experience_years
from app.core.skills import (
    BUNDLE_ALIASES,
    SKILL_ALIASES,
    SKILL_BUNDLES,
    normalize_skill,
)

# Alias -> canonical lookup, for normalizing free-text job skills. Keyed on the
# *normalized* form so an employer typing "React JS" and a CV saying "React.js"
# land on the same entry — nobody has to spell a skill the same way twice.
_ALIAS_TO_CANONICAL: dict[str, str] = {}
for _canonical, _aliases in SKILL_ALIASES.items():
    for _a in (_canonical, *_aliases):
        _ALIAS_TO_CANONICAL.setdefault(normalize_skill(_a), _canonical)

# Bundle names ("MERN stack") resolve to themselves; _expand turns them into
# their member skills.
_BUNDLE_LOOKUP: dict[str, str] = {}
for _bundle, _aliases in BUNDLE_ALIASES.items():
    for _a in (_bundle, *_aliases):
        _BUNDLE_LOOKUP.setdefault(normalize_skill(_a), _bundle)


def _canonicalize(skill: str) -> str:
    """Map a written skill to its taxonomy name, or return it cleaned up."""
    key = normalize_skill(skill)
    if not key:
        return skill.strip()
    return _ALIAS_TO_CANONICAL.get(key, skill.strip())


def _expand(skills: list[str]) -> list[str]:
    """Canonicalize a skill list, replacing any bundle with its members.

    "MERN Stack" on either side becomes MongoDB + Express + React + Node.js, so
    a CV that names the stack satisfies a job listing the four parts, and a job
    asking for the stack is satisfied by a CV listing them individually.
    """
    out: list[str] = []
    for raw in skills or []:
        if not raw or not raw.strip():
            continue
        bundle = _BUNDLE_LOOKUP.get(normalize_skill(raw))
        if bundle:
            out.extend(SKILL_BUNDLES[bundle])
        else:
            out.append(_canonicalize(raw))
    return out


def _custom_pattern(skill: str) -> re.Pattern:
    """Word-boundary regex for a skill outside the taxonomy.

    Built so spacing and punctuation between the words don't matter: a job
    asking for "Odoo ERP" is satisfied by a CV writing "Odoo-ERP" or "Odoo.ERP".
    """
    words = [re.escape(w) for w in re.split(r"[\s._/\\-]+", skill.strip()) if w]
    if not words:
        return re.compile(r"(?!)")  # matches nothing
    body = r"[\s._/\\-]*".join(words)
    return re.compile(r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % body, re.IGNORECASE)


def _mentions(skill: str, resume_skills: set[str], resume_text: str, resume_keys: set[str]) -> bool:
    """Is a required skill present in the resume?

    Known skills go through the taxonomy's alias regex, so "NodeJS" matches
    "Node.js" and a bare "SQL" requirement is not satisfied by the "MySQL" in
    someone's CV. Skills outside the taxonomy (HR typed something custom) are
    compared on their normalized key first — so a hand-typed "Power-BI" still
    matches a profile skill of "Power BI" — then by word-boundary search.
    """
    if skill in resume_skills:
        return True
    pattern = _SKILL_PATTERNS.get(skill)
    if pattern is not None:
        return bool(pattern.search(resume_text))
    if normalize_skill(skill) in resume_keys:
        return True
    return bool(_custom_pattern(skill).search(resume_text))


def _min_years(experience: str) -> int:
    """Parse a minimum year requirement from strings like '2-4 years', '3+ years'."""
    if not experience:
        return 0
    nums = re.findall(r"\d{1,2}", experience)
    return int(nums[0]) if nums else 0


def match(
    resume_text: str,
    job_skills: list[str],
    job_experience: str = "",
    extra_skills: list[str] | None = None,
    experience_years: float | None = None,
) -> dict:
    """Score one resume against one job.

    `extra_skills` are the skills the candidate ticked on their profile: the CV
    text often doesn't spell out everything they can do, and ignoring them
    under-scores people whose CV is thin but whose profile is filled in.
    `experience_years` likewise overrides the number parsed out of the CV when
    the profile states it.
    """
    resume_text = resume_text or ""
    resume_skills = set(extract_skills(resume_text))
    resume_skills.update(_expand(extra_skills or []))
    # Bundles named in the CV text itself ("MERN stack developer") count as
    # their member skills too — extract_skills only sees the taxonomy.
    for bundle, aliases in BUNDLE_ALIASES.items():
        if any(_custom_pattern(a).search(resume_text) for a in aliases):
            resume_skills.update(SKILL_BUNDLES[bundle])

    # Normalized keys of everything the candidate has, for comparing against
    # requirements that fall outside the taxonomy.
    resume_keys = {normalize_skill(s) for s in resume_skills}

    resume_years = extract_experience_years(resume_text)
    if experience_years is not None:
        resume_years = max(resume_years, float(experience_years))

    required = _expand(job_skills or [])
    required_unique = list(dict.fromkeys(required))  # de-dupe, keep order

    matched, missing = [], []
    for skill in required_unique:
        (matched if _mentions(skill, resume_skills, resume_text, resume_keys) else missing).append(skill)

    if required_unique:
        skill_score = len(matched) / len(required_unique)
    else:
        # No explicit requirements — reward a rich, relevant skill set instead.
        skill_score = min(1.0, len(resume_skills) * 0.08)

    min_yrs = _min_years(job_experience)
    if min_yrs > 0:
        exp_score = min(1.0, resume_years / min_yrs) if resume_years else 0.0
    else:
        exp_score = 1.0  # neutral when no requirement stated

    score = round((0.85 * skill_score + 0.15 * exp_score) * 100)

    return {
        "score": score,
        "matchedSkills": matched,
        "missingSkills": missing,
        "resumeSkills": sorted(resume_skills),
        "resumeExperienceYears": resume_years,
        "requiredExperienceYears": min_yrs,
    }


def match_many(
    resume_text: str,
    jobs: list[dict],
    extra_skills: list[str] | None = None,
    experience_years: float | None = None,
) -> list[dict]:
    """Score one resume against many jobs in a single call.

    The job board scores every listed job for the signed-in candidate, so doing
    this one HTTP round-trip per job would be N calls per page load.
    """
    results = []
    for job in jobs or []:
        scored = match(
            resume_text,
            job.get("skills") or [],
            job.get("experience") or "",
            extra_skills=extra_skills,
            experience_years=experience_years,
        )
        results.append({
            "id": str(job.get("id", "")),
            "score": scored["score"],
            "matchedSkills": scored["matchedSkills"],
            "missingSkills": scored["missingSkills"],
        })
    return results

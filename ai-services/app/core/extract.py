"""Resume text extraction + parsing (skills, experience, education)."""

import io
import re

from app.core.skills import SKILL_ALIASES

# Pre-compile one regex per skill. Custom boundaries so tokens like "c++" and
# "c#" work while plain words ("go", "java") don't match inside larger words.
_SKILL_PATTERNS: dict[str, re.Pattern] = {}
for _canonical, _aliases in SKILL_ALIASES.items():
    _parts = [re.escape(a) for a in _aliases]
    _pattern = r"(?<![A-Za-z0-9])(?:%s)(?![A-Za-z0-9])" % "|".join(_parts)
    _SKILL_PATTERNS[_canonical] = re.compile(_pattern, re.IGNORECASE)

_DEGREE_PATTERNS = [
    (r"\bph\.?\s?d\b|\bdoctorate\b", "PhD"),
    (r"\bm\.?\s?s\.?\b|\bmaster'?s?\b|\bm\.?\s?sc\b|\bmba\b", "Master's"),
    (r"\bb\.?\s?s\.?\b|\bbachelor'?s?\b|\bb\.?\s?sc\b|\bb\.?\s?e\b|\bbtech\b", "Bachelor's"),
    (r"\bdiploma\b", "Diploma"),
    (r"\bintermediate\b|\bhsc\b|\ba[- ]?levels?\b", "Intermediate"),
]


def _sniff(data: bytes) -> str:
    """File type from the bytes themselves.

    The filename is not trustworthy — CVs re-read from storage often arrive with
    no extension, and decoding a PDF as UTF-8 yields its raw source ('%PDF-1.4
    /Type /StructElem ...') which looks like 70k characters of real text but
    contains almost none of the candidate's actual skills.
    """
    head = data[:4]
    if head[:4] == b"%PDF":
        return "pdf"
    if head[:2] == b"PK":  # zip container -> docx/xlsx/pptx
        return "docx"
    return "txt"


def extract_text(data: bytes, filename: str = "") -> str:
    """Extract plain text from PDF / DOCX / TXT bytes."""
    kind = _sniff(data)

    # The extension only breaks ties the magic bytes can't (plain-text formats).
    if kind == "txt":
        name = (filename or "").lower()
        if name.endswith(".pdf"):
            kind = "pdf"
        elif name.endswith(".docx"):
            kind = "docx"

    try:
        if kind == "pdf":
            return _from_pdf(data)
        if kind == "docx":
            return _from_docx(data)
        return data.decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"extract_text failed for a {kind} file: {e}")
        return ""


def _from_pdf(data: bytes) -> str:
    import pdfplumber

    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or "")
    return "\n".join(text_parts)


def _from_docx(data: bytes) -> str:
    import docx

    document = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in document.paragraphs)


def extract_skills(text: str) -> list[str]:
    """Return canonical skill names found in the text, in taxonomy order."""
    found = [name for name, pattern in _SKILL_PATTERNS.items() if pattern.search(text)]
    return found


def extract_experience_years(text: str) -> float:
    """Best-effort years of experience from phrases like '3+ years', '2 yrs'."""
    matches = re.findall(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b", text, re.IGNORECASE)
    years = [int(m) for m in matches if int(m) <= 50]
    return float(max(years)) if years else 0.0


def extract_education(text: str) -> list[str]:
    found: list[str] = []
    for pattern, label in _DEGREE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE) and label not in found:
            found.append(label)
    return found


def parse_resume(text: str) -> dict:
    text = text or ""
    return {
        "skills": extract_skills(text),
        "experienceYears": extract_experience_years(text),
        "education": extract_education(text),
        "charCount": len(text),
    }

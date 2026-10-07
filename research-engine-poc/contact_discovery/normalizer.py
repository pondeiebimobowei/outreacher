"""Lexical normalization, canonical key generation, and role classification for Contact Discovery."""

import re
import unicodedata
from typing import List, Optional

from contact_discovery.models import RoleFamily


def normalize_person_name(name: Optional[str]) -> str:
    """Normalize person names using deterministic lexical rules without semantic drift."""
    if not name or not name.strip():
        return ""

    # 1. Unicode NFD decomposition followed by stripping combining diacritical marks
    text = unicodedata.normalize("NFD", name)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")

    # 2. Lowercase
    text = text.lower()

    # 3. Strip common honorific prefixes
    text = re.sub(r"^(dr|mr|mrs|ms|prof)\.?\s+", "", text)

    # 4. Strip apostrophes without adding space (O'Connor -> oconnor)
    text = re.sub(r"['’]", "", text)

    # 5. Replace any remaining non-alphanumeric characters with a single space
    text = re.sub(r"[^a-z0-9\s]", " ", text)

    # 6. Collapse contiguous whitespace and trim
    text = re.sub(r"\s+", " ", text).strip()

    return text


def normalize_role_title(title: Optional[str]) -> str:
    """Normalize role titles using deterministic lexical rules without semantic drift."""
    if not title or not title.strip():
        return ""

    # 1. Unicode NFD decomposition followed by stripping combining diacritical marks
    text = unicodedata.normalize("NFD", title)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")

    # 2. Lowercase
    text = text.lower()

    # 3. Expand ampersand to ' and '
    text = text.replace("&", " and ")

    # 4. Replace punctuation and separators with a single space
    text = re.sub(r"[,/|+\-:\;.()[\]{}\\_]", " ", text)

    # 5. Strip all remaining non-alphanumeric characters
    text = re.sub(r"[^a-z0-9\s]", " ", text)

    # 6. Collapse contiguous whitespace and trim
    text = re.sub(r"\s+", " ", text).strip()

    return text


def get_null_email_canonical_key(
    first_name: Optional[str], last_name: Optional[str], title: Optional[str]
) -> str:
    """Generate deterministic canonical key for secondary identity deduplication."""
    norm_first = normalize_person_name(first_name)
    norm_last = normalize_person_name(last_name)
    norm_title = normalize_role_title(title)
    return f"{norm_first}|{norm_last}|{norm_title}"


def classify_role_family(title: Optional[str]) -> RoleFamily:
    """Classify normalized role title into a standard closed RoleFamily."""
    if not title:
        return RoleFamily.GENERAL

    norm = normalize_role_title(title)
    words = set(norm.split())

    # Executive Leadership
    if any(term in norm for term in ["ceo", "cto", "cfo", "coo", "cpo", "cro", "founder", "president", "chief executive", "chief technology"]):
        return RoleFamily.LEADERSHIP
    if "founder" in words or "ceo" in words or "cto" in words:
        return RoleFamily.LEADERSHIP

    # Recruiting / Talent / HR
    if any(term in norm for term in ["talent", "recruiting", "recruiter", "human resources", "people operations", "head of people"]):
        return RoleFamily.RECRUITING

    # Product
    if any(term in norm for term in ["product manager", "head of product", "vp of product", "vp product", "director of product"]):
        return RoleFamily.PRODUCT

    # Engineering / Technical
    if any(term in norm for term in ["engineering", "engineer", "software", "devops", "sre", "tech lead", "developer", "architect"]):
        return RoleFamily.ENGINEERING
    if "em" in words or "swe" in words:
        return RoleFamily.ENGINEERING

    return RoleFamily.GENERAL


ROLE_SYNONYMS = {
    "engineering manager": ["engineering manager", "em", "software engineering manager", "engineering team lead", "eng manager"],
    "head of talent": ["head of talent", "talent acquisition lead", "lead recruiter", "recruiting lead", "head of people", "senior recruiter", "recruiter"],
    "ceo": ["ceo", "chief executive officer", "founder", "co founder", "president"],
    "cto": ["cto", "chief technology officer", "vp engineering", "vp of engineering", "head of engineering"],
}


def matches_target_roles(candidate_title: Optional[str], target_roles: List[str]) -> bool:
    """Determine if a candidate's title matches any of the requested target roles or synonyms."""
    if not candidate_title or not target_roles:
        return False

    norm_candidate = normalize_role_title(candidate_title)
    candidate_words = set(norm_candidate.split())

    for target in target_roles:
        norm_target = normalize_role_title(target)

        # Exact match or substring containment
        if norm_candidate == norm_target or norm_target in norm_candidate:
            return True

        # Check synonym expansion
        for base_role, synonyms in ROLE_SYNONYMS.items():
            if norm_target in synonyms or norm_target == base_role:
                if any(syn in norm_candidate for syn in synonyms):
                    return True
                if any(syn in candidate_words for syn in synonyms if len(syn) <= 3):
                    return True

    return False

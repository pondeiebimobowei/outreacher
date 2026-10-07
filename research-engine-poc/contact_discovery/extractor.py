"""Structured contact extraction with strict canonical text grounding."""

import re
from typing import List, Optional, Set, Tuple

from contact_discovery.models import (
    ALLOWED_ROLE_ADDRESS_MAILBOXES,
    ContactConfidence,
    ContactEvidenceSpan,
    ContactPersonKind,
    DiscoveredContact,
)
from contact_discovery.normalizer import classify_role_family


# Common job title patterns
TITLE_PATTERNS = [
    r"\b(?:VP|Vice President)\s+(?:of\s+)?[A-Za-z\s&/]+",
    r"\b(?:Head|Director)\s+(?:of\s+)?[A-Za-z\s&/]+",
    r"\bChief\s+[A-Za-z\s]+\s+Officer\b",
    r"\b(?:CEO|CTO|CFO|COO|CPO|CRO)\b",
    r"\bFounder(?:\s+and\s+(?:CEO|CTO|President))?\b",
    r"\b(?:Lead|Principal|Staff|Senior)\s+(?:Software\s+)?(?:Engineer|Developer|Architect|Recruiter)\b",
    r"\b(?:Software\s+)?Engineering\s+Manager\b",
    r"\bProduct\s+Manager\b",
]

COMPILED_TITLE_REGEX = re.compile(
    r"(?:" + "|".join(TITLE_PATTERNS) + r")",
    re.IGNORECASE,
)

NAME_REGEX = re.compile(
    r"\b([A-ZÀ-ÿ][a-zà-ÿ]*(?:['’][A-ZÀ-ÿa-zà-ÿ]+)?(?:[ \t]+[A-ZÀ-ÿ][a-zà-ÿ]*(?:['’][A-ZÀ-ÿa-zà-ÿ]+)?)+)\b"
)

EMAIL_REGEX = re.compile(
    r"\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b"
)

STOPWORDS = {
    "Home", "About", "Products", "Services", "Contact", "Privacy Policy", "Terms of Service",
    "Acme Corp", "Copyright", "Looking For", "Direct Inquiries", "Our Team", "Leadership",
    "Engineering Team", "Open Source", "All Rights", "Learn More", "Get Started", "Read More"
}


class StructuredContactExtractor:
    """Extracts contacts from canonical document text with guaranteed exact-substring grounding."""

    def __init__(self, verified_domain: str):
        self.verified_domain = verified_domain.lower().strip()

    def _is_domain_match(self, email: str) -> bool:
        if "@" not in email:
            return False
        domain = email.split("@")[1].lower()
        return domain == self.verified_domain or domain.endswith("." + self.verified_domain)

    def _get_sentence_excerpt(self, text: str, start_idx: int, end_idx: int) -> str:
        """Find the sentence/clause boundary around a match in canonical text to form an exact excerpt."""
        before = text[:start_idx]
        delims_before = [before.rfind(". "), before.rfind("! "), before.rfind("? "), before.rfind("\n")]
        last_delim = max(delims_before)
        if last_delim == -1:
            sent_start = 0
        elif before[last_delim] == "\n":
            sent_start = last_delim + 1
        else:
            sent_start = last_delim + 2

        after = text[end_idx:]
        delims_after = [d for d in [after.find(". "), after.find("! "), after.find("? "), after.find("\n")] if d != -1]
        next_delim = min(delims_after) if delims_after else len(after)
        sent_end = end_idx + next_delim
        if sent_end < len(text) and text[sent_end] in ".!?":
            sent_end += 1

        excerpt = text[sent_start:sent_end].strip()
        if not excerpt:
            excerpt = text[start_idx:end_idx]

        return excerpt

    def extract(self, canonical_text: str, source_url: str) -> List[DiscoveredContact]:
        """Extract contacts from canonical text."""
        if not canonical_text:
            return []

        contacts: List[DiscoveredContact] = []
        seen_emails: Set[str] = set()
        seen_names: Set[Tuple[str, str]] = set()

        # 1. Extract Role Addresses
        for match in EMAIL_REGEX.finditer(canonical_text):
            email = match.group(1).lower()
            if not self._is_domain_match(email):
                continue

            local_part = email.split("@")[0]
            if local_part in ALLOWED_ROLE_ADDRESS_MAILBOXES and email not in seen_emails:
                seen_emails.add(email)
                excerpt = self._get_sentence_excerpt(canonical_text, match.start(), match.end())
                if email in excerpt and excerpt in canonical_text:
                    contacts.append(
                        DiscoveredContact(
                            person_kind=ContactPersonKind.ROLE_ADDRESS,
                            first_name=None,
                            last_name=None,
                            title=f"{local_part.capitalize()} Inquiries",
                            email=email,
                            confidence=ContactConfidence.HIGH,
                            role_family=classify_role_family(local_part),
                            source="Website Discovery",
                            source_url=source_url,
                            evidence=[
                                ContactEvidenceSpan(
                                    claim=f"Role email {email} discovered on public website",
                                    source_name="Website Page",
                                    source_url=source_url,
                                    source_excerpt=excerpt,
                                    classification="FACT",
                                    confidence="HIGH",
                                )
                            ],
                        )
                    )

        # 2. Extract Person Candidates by inspecting lines and paragraphs
        lines = [l.strip() for l in canonical_text.split("\n") if l.strip()]

        for i, line in enumerate(lines):
            # Check for person name in this line
            name_match = NAME_REGEX.search(line)
            if not name_match:
                continue

            full_name = name_match.group(1).strip()
            if full_name in STOPWORDS or any(part in STOPWORDS for part in full_name.split()):
                continue

            parts = full_name.split()
            first_name = parts[0]
            last_name = " ".join(parts[1:]) if len(parts) > 1 else None

            name_key = (first_name.lower(), (last_name or "").lower())
            if name_key in seen_names:
                continue

            # Context window: current line and next few lines (up to 3)
            context_lines = lines[i : min(len(lines), i + 4)]
            context_block = "\n".join(context_lines)

            # Determine title if present in context lines
            title: Optional[str] = None
            for ctx_line in context_lines:
                t_match = COMPILED_TITLE_REGEX.search(ctx_line)
                if t_match:
                    candidate_t = t_match.group(0).strip()
                    if candidate_t in canonical_text:
                        title = candidate_t
                        break

            # Determine personal email if present in context lines
            person_email: Optional[str] = None
            for ctx_line in context_lines:
                e_match = EMAIL_REGEX.search(ctx_line)
                if e_match:
                    cand_email = e_match.group(1).lower()
                    if self._is_domain_match(cand_email) and cand_email.split("@")[0] not in ALLOWED_ROLE_ADDRESS_MAILBOXES:
                        person_email = cand_email
                        seen_emails.add(person_email)
                        break

            # Evidence grounding: construct exact substring excerpts
            evidence_spans: List[ContactEvidenceSpan] = []

            # Find name excerpt
            n_start = canonical_text.find(full_name)
            if n_start == -1:
                continue
            name_excerpt = self._get_sentence_excerpt(canonical_text, n_start, n_start + len(full_name))

            # If name is mentioned in a longer sentence containing full_name, use it
            for ctx_line in context_lines[1:]:
                if full_name.lower() in ctx_line.lower() and len(ctx_line) > len(name_excerpt):
                    if ctx_line in canonical_text:
                        name_excerpt = ctx_line
                        break

            evidence_spans.append(
                ContactEvidenceSpan(
                    claim=f"{full_name} is associated with {self.verified_domain}",
                    source_name="Website Page",
                    source_url=source_url,
                    source_excerpt=name_excerpt,
                    classification="FACT",
                    confidence="HIGH",
                )
            )

            # Check if there is an additional bio context sentence mentioning the first name
            for ctx_line in context_lines[1:]:
                if first_name.lower() in ctx_line.lower() and ctx_line in canonical_text:
                    if ctx_line != name_excerpt:
                        evidence_spans.append(
                            ContactEvidenceSpan(
                                claim=f"{full_name} background and bio",
                                source_name="Website Page",
                                source_url=source_url,
                                source_excerpt=ctx_line,
                                classification="FACT",
                                confidence="HIGH",
                            )
                        )
                        break

            # Ground title if present
            if title:
                t_start = canonical_text.find(title)
                if t_start != -1:
                    t_excerpt = self._get_sentence_excerpt(canonical_text, t_start, t_start + len(title))
                    if title.lower() in t_excerpt.lower() and t_excerpt in canonical_text:
                        if t_excerpt != name_excerpt:
                            evidence_spans.append(
                                ContactEvidenceSpan(
                                    claim=f"{full_name} holds role {title}",
                                    source_name="Website Page",
                                    source_url=source_url,
                                    source_excerpt=t_excerpt,
                                    classification="FACT",
                                    confidence="HIGH",
                                )
                            )
                    else:
                        title = None
                else:
                    title = None

            try:
                contact = DiscoveredContact(
                    person_kind=ContactPersonKind.PERSON,
                    first_name=first_name,
                    last_name=last_name,
                    title=title,
                    email=person_email,
                    confidence=ContactConfidence.HIGH,
                    role_family=classify_role_family(title),
                    source="Website Discovery",
                    source_url=source_url,
                    evidence=evidence_spans,
                )
                contacts.append(contact)
                seen_names.add(name_key)
            except Exception:
                continue

        return contacts

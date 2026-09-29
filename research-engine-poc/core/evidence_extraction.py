import re
from typing import List
from datetime import datetime, timezone
from core.models import CrawledDocument, PageType, RawResearchPackage
from core.evidence import (
    EvidenceSpan, ResearchEvidenceType, compute_document_hash, compute_span_id,
)

class DeterministicEvidenceExtractor:
    """
    Deterministic chunker and evidence span extractor:
      - Operates on exact, un-normalized UTF-8 document content.
      - Finds structural boundaries (lines, paragraphs, headings).
      - Computes exact character offsets `[char_start:char_end]`.
      - Derives semantic section titles deterministically from heading patterns.
      - Produces immutable, reproducible `EvidenceSpan` instances.
    """
    _HEADING_PATTERN = re.compile(
        r'^(?:#{1,6}\s+)?([A-Z][A-Za-z0-9\s,\-\&/]{1,50}):?$',
    )

    _SECTION_KEYWORDS = {
        'about': 'About',
        'mission': 'Mission',
        'vision': 'Vision',
        'product': 'Products & Services',
        'products': 'Products & Services',
        'solutions': 'Products & Services',
        'features': 'Products & Services',
        'platform': 'Products & Services',
        'customers': 'Customers & Case Studies',
        'clients': 'Customers & Case Studies',
        'careers': 'Careers',
        'jobs': 'Careers',
        'responsibilities': 'Responsibilities',
        'what you\'ll do': 'Responsibilities',
        'duties': 'Responsibilities',
        'qualifications': 'Qualifications',
        'requirements': 'Requirements',
        'what we look for': 'Qualifications',
        'skills': 'Qualifications',
        'benefits': 'Perks & Benefits',
        'perks': 'Perks & Benefits',
        'contact': 'Contact & Location',
        'leadership': 'Team & Leadership',
        'team': 'Team & Leadership',
    }

    @classmethod
    def extract_document_spans(cls, doc: CrawledDocument) -> List[EvidenceSpan]:
        """Extracts deterministic evidence spans from a single CrawledDocument."""
        if not doc.content or not doc.content.strip():
            return []

        doc_hash = compute_document_hash(doc.content)
        spans: List[EvidenceSpan] = []
        retrieved_at = doc.retrieved_at or datetime.now(timezone.utc)

        current_section = "Overview"
        
        # Iterate over non-empty lines with exact offsets
        line_pattern = re.compile(r'([^\r\n]+)')
        
        for match in line_pattern.finditer(doc.content):
            char_start = match.start()
            char_end = match.end()
            text = doc.content[char_start:char_end]

            stripped = text.strip()
            if not stripped:
                continue

            # Check if this line is a section heading
            stripped_lower = stripped.lower().rstrip(':')
            is_heading = False
            detected_label = None

            if len(stripped.split()) <= 7:
                for kw, label in cls._SECTION_KEYWORDS.items():
                    if kw == stripped_lower or stripped_lower.startswith(kw + " ") or stripped_lower.endswith(" " + kw):
                        detected_label = label
                        is_heading = True
                        break
                if not is_heading:
                    heading_m = cls._HEADING_PATTERN.match(stripped)
                    if heading_m and (stripped.startswith("#") or stripped.endswith(":") or stripped.isupper() or stripped.istitle()):
                        detected_label = heading_m.group(1).strip()
                        is_heading = True

            if is_heading and detected_label:
                current_section = detected_label
                evidence_type = ResearchEvidenceType.HEADING
            else:
                evidence_type = cls._classify_span_type(stripped, current_section, doc.page_type)

            span_id = compute_span_id(doc_hash, char_start, char_end)
            spans.append(EvidenceSpan(
                id=span_id,
                document_hash=doc_hash,
                source_url=doc.url,
                page_type=doc.page_type,
                section=current_section,
                char_start=char_start,
                char_end=char_end,
                text=text,
                evidence_type=evidence_type,
                retrieved_at=retrieved_at,
            ))

        return spans

    @classmethod
    def extract_package_spans(cls, package: RawResearchPackage) -> List[EvidenceSpan]:
        """Extracts deterministic evidence spans across all crawled documents in a package."""
        all_spans: List[EvidenceSpan] = []
        for doc in package.documents:
            all_spans.extend(cls.extract_document_spans(doc))
        return all_spans

    @classmethod
    def _classify_span_type(
        cls,
        text: str,
        section: str,
        page_type: PageType,
    ) -> ResearchEvidenceType:
        sec_lower = section.lower()
        text_lower = text.lower()

        if "responsibilit" in sec_lower or "duties" in sec_lower:
            return ResearchEvidenceType.JOB_RESPONSIBILITY
        if "requirement" in sec_lower or "qualification" in sec_lower or "skills" in sec_lower:
            return ResearchEvidenceType.JOB_REQUIREMENT
        if "mission" in sec_lower or "vision" in sec_lower:
            return ResearchEvidenceType.MISSION_STATEMENT
        if "about" in sec_lower or page_type == PageType.ABOUT:
            return ResearchEvidenceType.COMPANY_OVERVIEW
        if "product" in sec_lower or page_type == PageType.PRODUCT:
            return ResearchEvidenceType.PRODUCT_DESCRIPTION
        if "customer" in sec_lower or page_type == PageType.CASE_STUDY:
            return ResearchEvidenceType.CUSTOMER_REFERENCE
        if "contact" in sec_lower or page_type == PageType.CONTACT:
            return ResearchEvidenceType.CONTACT_INFO

        # Text-level heuristics
        if any(w in text_lower for w in ["we build", "we provide", "platform for", "software that"]):
            return ResearchEvidenceType.PRODUCT_DESCRIPTION
        if any(w in text_lower for w in ["our mission is", "we believe"]):
            return ResearchEvidenceType.MISSION_STATEMENT

        return ResearchEvidenceType.PAGE_TEXT

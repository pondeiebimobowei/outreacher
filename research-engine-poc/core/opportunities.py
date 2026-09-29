"""
Opportunity Engine & Verification Gates.

Invariants:
  1. CONFIRMED means evidence supports an active-looking opening at retrieval time,
     not merely that the URL looks like a job page.
  2. Confirmed opportunities are deduplicated by canonical URL. Different URLs that
     represent the same underlying opening across sources/ATS are not yet reconciled.
"""

import re
from typing import List, Optional, Set
from core.models import CrawledDocument, DocumentQuality, PageType, RawResearchPackage
from core.dto import ResearchOpportunityDTO, OpportunityType
from core.urls import canonicalize_url, normalize_research_package

# Signals that establish semantic evidence of an active job opening in document content
JOB_POSTING_SIGNALS = (
    "responsibilities",
    "what you'll do",
    "what you will do",
    "qualifications",
    "requirements",
    "what you need",
    "what you bring",
    "who you are",
    "skills",
    "apply for this job",
    "apply for this role",
    "apply now",
    "submit application",
    "about the role",
    "about the position",
    "key duties",
    "basic qualifications",
    "preferred qualifications",
    "job description",
)

# Negative/Closed vacancy signals that disqualify a document from being an active opening
CLOSED_JOB_SIGNALS = (
    "no longer accepting applications",
    "position has been filled",
    "position filled",
    "this role is no longer available",
    "job closed",
    "applications are closed",
    "this opening has been closed",
    "this job has expired",
    "position is no longer open",
    "role is filled",
    "this posting has expired",
    "this job is no longer active",
    "this position is closed",
    "applications closed",
)

def clean_job_title(title: str, company_name: Optional[str] = None) -> str:
    """
    Cleans raw HTML page title into a canonical job role title by stripping
    trailing brand/company suffixes (e.g. 'Senior Frontend Engineer | Linear' -> 'Senior Frontend Engineer',
    'Director of Engineering at Scale | Linear' -> 'Director of Engineering at Scale').
    """
    if not title:
        return ""
    cleaned = re.sub(r'\s+', ' ', title).strip()
    if not cleaned:
        return ""

    # 1. Remove company specific trailing patterns
    if company_name and company_name.strip():
        escaped_company = re.escape(company_name.strip())
        company_patterns = [
            rf"\s*\|\s*{escaped_company}.*$",
            rf"\s*-\s*{escaped_company}.*$",
            rf"\s*–\s*{escaped_company}.*$",
            rf"\s*—\s*{escaped_company}.*$",
            rf"\s+at\s+{escaped_company}.*$",
            rf"\s+@\s+{escaped_company}.*$",
        ]
        for pat in company_patterns:
            cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE).strip()

    # 2. Remove generic trailing portal/careers suffixes
    generic_trailing = [
        r"\s*\|\s*(careers|jobs|open positions|join us).*$",
        r"\s*-\s*(careers|jobs|open positions|join us).*$",
        r"\s*–\s*(careers|jobs|open positions|join us).*$",
        r"\s*—\s*(careers|jobs|open positions|join us).*$",
    ]
    for pat in generic_trailing:
        cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE).strip()

    # 3. Fallback separator strip if trailing brand wasn't named
    for sep in [" | ", " – ", " — "]:
        if sep in cleaned:
            parts = cleaned.split(sep)
            if len(parts) >= 2 and len(parts[0].strip()) >= 3:
                cleaned = parts[0].strip()

    return cleaned or title.strip()

def has_job_posting_content_signal(doc: CrawledDocument) -> bool:
    """
    Verifies that the document text contains active job-posting structural signals
    rather than just an unconfirmed career-related URL.
    """
    if not doc.content or len(doc.content.strip()) < 50:
        return False
    
    text_sample = doc.content[:3000].lower()
    return any(signal in text_sample for signal in JOB_POSTING_SIGNALS)

def has_closed_job_signal(doc: CrawledDocument) -> bool:
    """Detects explicit closed, filled, or archived job status indicators in text."""
    if not doc.content:
        return False
    text_sample = doc.content[:3000].lower()
    return any(signal in text_sample for signal in CLOSED_JOB_SIGNALS)

def is_confirmed_job_opening(doc: CrawledDocument) -> bool:
    """
    Strict CONFIRMED opening gate:
      1. PageType is JOB_LISTING
      2. Document quality is VALID
      3. Non-empty title is present
      4. Substantive job posting content signals exist in text
      5. NO closed/archived/filled signals present in text
    """
    return (
        doc.page_type == PageType.JOB_LISTING
        and doc.quality == DocumentQuality.VALID
        and bool(doc.title and doc.title.strip())
        and has_job_posting_content_signal(doc)
        and not has_closed_job_signal(doc)
    )

def extract_research_opportunities(
    package: RawResearchPackage,
    company_name: Optional[str] = None,
) -> List[ResearchOpportunityDTO]:
    """
    Extracts opportunity DTOs strictly adhering to the CONFIRMED vs PROACTIVE vs UNCLASSIFIED contract:
      - CONFIRMED: Verified active job opening with title and content evidence (deduplicated by canonical URL).
      - PROACTIVE: Valid company research exists, but no verified active opening found.
      - UNCLASSIFIED: Insufficient valid documents collected to classify outreach opportunity.
    """
    name = company_name or (package.identity.name if package.identity else "Company")
    package = normalize_research_package(package)
    confirmed_docs = [d for d in package.documents if is_confirmed_job_opening(d)]

    if confirmed_docs:
        opportunities = []
        seen_canonical_urls: Set[str] = set()
        for jd in confirmed_docs:
            c_url = canonicalize_url(jd.url) or jd.url
            if c_url in seen_canonical_urls:
                continue
            seen_canonical_urls.add(c_url)
            clean_title = clean_job_title(jd.title or "", name)
            opportunities.append(ResearchOpportunityDTO(
                role_title=clean_title,
                opening_source_url=jd.url,
                role_url=jd.url,
                role_description=jd.content[:200] if jd.content else None,
                opportunity_type=OpportunityType.CONFIRMED,
            ))
        if opportunities:
            return opportunities

    if package.documents and any(d.quality == DocumentQuality.VALID for d in package.documents):
        target_url = package.identity.website_url if package.identity else ""
        return [
            ResearchOpportunityDTO(
                role_title="General Outreach",
                opening_source_url=target_url,
                role_url=target_url,
                role_description="Proactive outreach based on verified company overview and signals.",
                opportunity_type=OpportunityType.PROACTIVE,
            )
        ]

    target_url = package.identity.website_url if package.identity else ""
    return [
        ResearchOpportunityDTO(
            role_title="Unclassified Target",
            opening_source_url=target_url,
            role_url=target_url,
            role_description="Insufficient evidence collected to classify opportunity.",
            opportunity_type=OpportunityType.UNCLASSIFIED,
        )
    ]

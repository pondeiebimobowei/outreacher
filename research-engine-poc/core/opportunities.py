import re
from typing import List, Optional
from core.models import CrawledDocument, DocumentQuality, PageType, RawResearchPackage
from core.dto import ResearchOpportunityDTO, OpportunityType

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

def clean_job_title(title: str, company_name: Optional[str] = None) -> str:
    """
    Cleans raw HTML page title into a canonical job role title by stripping
    brand/company separators (e.g. 'Senior Frontend Engineer | Linear' -> 'Senior Frontend Engineer').
    """
    if not title:
        return ""
    cleaned = title.strip()
    for sep in [" | ", " - ", " – ", " — ", " at "]:
        if sep in cleaned:
            if company_name and (company_name.lower() in cleaned.lower() or "careers" in cleaned.lower() or "jobs" in cleaned.lower()):
                parts = cleaned.split(sep)
                if len(parts) >= 2 and len(parts[0].strip()) >= 3:
                    cleaned = parts[0].strip()
            elif not company_name:
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
    
    text_sample = doc.content[:2000].lower()
    return any(signal in text_sample for signal in JOB_POSTING_SIGNALS)

def is_confirmed_job_opening(doc: CrawledDocument) -> bool:
    """
    Strict CONFIRMED opening gate:
      1. PageType is JOB_LISTING
      2. Document quality is VALID
      3. Non-empty title is present
      4. Substantive job posting content signals exist in text
    """
    return (
        doc.page_type == PageType.JOB_LISTING
        and doc.quality == DocumentQuality.VALID
        and bool(doc.title and doc.title.strip())
        and has_job_posting_content_signal(doc)
    )

def extract_research_opportunities(
    package: RawResearchPackage,
    company_name: Optional[str] = None,
) -> List[ResearchOpportunityDTO]:
    """
    Extracts opportunity DTOs strictly adhering to the CONFIRMED vs PROACTIVE vs UNCLASSIFIED contract:
      - CONFIRMED: Verified active job opening with title and content evidence.
      - PROACTIVE: Valid company research exists, but no verified active opening found.
      - UNCLASSIFIED: Insufficient valid documents collected to classify outreach opportunity.
    """
    name = company_name or (package.identity.name if package.identity else "Company")
    confirmed_docs = [d for d in package.documents if is_confirmed_job_opening(d)]

    if confirmed_docs:
        opportunities = []
        for jd in confirmed_docs:
            clean_title = clean_job_title(jd.title or "", name)
            opportunities.append(ResearchOpportunityDTO(
                role_title=clean_title,
                opening_source_url=jd.url,
                role_url=jd.url,
                role_description=jd.content[:200] if jd.content else None,
                opportunity_type=OpportunityType.CONFIRMED,
            ))
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

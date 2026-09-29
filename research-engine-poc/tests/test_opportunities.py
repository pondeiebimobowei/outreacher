from datetime import datetime, timezone
import pytest

from core.models import (
    CompanyIdentity, IdentityConfidence, CrawledDocument,
    DocumentQuality, PageType, RawResearchPackage,
)
from core.dto import OpportunityType
from core.opportunities import (
    clean_job_title, has_job_posting_content_signal,
    is_confirmed_job_opening, extract_research_opportunities,
)

def test_clean_job_title_separators():
    assert clean_job_title("Senior Frontend Engineer | Linear", "Linear") == "Senior Frontend Engineer"
    assert clean_job_title("Staff Infrastructure Engineer - Moniepoint", "Moniepoint") == "Staff Infrastructure Engineer"
    assert clean_job_title("Product Designer – Acme Corp", "Acme Corp") == "Product Designer"
    assert clean_job_title("Engineering Manager at Linear", "Linear") == "Engineering Manager"
    assert clean_job_title("Software Engineer", "Linear") == "Software Engineer"
    assert clean_job_title("", "Linear") == ""

def test_has_job_posting_content_signal():
    doc_with_signal = CrawledDocument(
        url="https://acme.com/jobs/1",
        final_url="https://acme.com/jobs/1",
        page_type=PageType.JOB_LISTING,
        title="Software Engineer",
        content="Software Engineer opening.\nRequirements: 5+ years Python.\nResponsibilities: build APIs.\nApply now.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )
    assert has_job_posting_content_signal(doc_with_signal) is True

    doc_without_signal = CrawledDocument(
        url="https://acme.com/careers/article",
        final_url="https://acme.com/careers/article",
        page_type=PageType.JOB_LISTING,
        title="Why We Love Engineering",
        content="We love building software and collaborating together on innovative projects across the globe.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )
    assert has_job_posting_content_signal(doc_without_signal) is False

def test_is_confirmed_job_opening_gate():
    # Valid job doc with title and posting signal -> Confirmed
    doc_confirmed = CrawledDocument(
        url="https://acme.com/careers/86abcce0",
        final_url="https://acme.com/careers/86abcce0",
        page_type=PageType.JOB_LISTING,
        title="Senior Backend Engineer | Acme",
        content="Senior Backend Engineer\nResponsibilities: Maintain core services.\nQualifications: PostgreSQL expertise.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )
    assert is_confirmed_job_opening(doc_confirmed) is True

    # JOB_LISTING but missing job posting signal -> Not confirmed
    doc_stale = CrawledDocument(
        url="https://acme.com/careers/stale-uuid",
        final_url="https://acme.com/careers/stale-uuid",
        page_type=PageType.JOB_LISTING,
        title="General Info",
        content="This position is closed. Thank you for your interest in our company.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )
    assert is_confirmed_job_opening(doc_stale) is False

    # JOB_LISTING with signal but TOO_SHORT -> Not confirmed
    doc_short = CrawledDocument(
        url="https://acme.com/careers/short",
        final_url="https://acme.com/careers/short",
        page_type=PageType.JOB_LISTING,
        title="Short Role",
        content="Apply now",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.TOO_SHORT,
    )
    assert is_confirmed_job_opening(doc_short) is False

def test_extract_research_opportunities_demotes_insufficient_job_docs():
    identity = CompanyIdentity(
        name="Linear",
        domain="linear.app",
        website_url="https://linear.app",
        confidence=IdentityConfidence.CONFIDENT,
        reasoning="Verified.",
    )
    doc_about = CrawledDocument(
        url="https://linear.app/about",
        final_url="https://linear.app/about",
        page_type=PageType.ABOUT,
        title="About Linear",
        content="Linear is the purpose-built tool for planning and building software.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )
    # Stale job page without content signals
    doc_stale_job = CrawledDocument(
        url="https://linear.app/careers/uuid-123",
        final_url="https://linear.app/careers/uuid-123",
        page_type=PageType.JOB_LISTING,
        title="Career Page",
        content="Welcome to Linear careers. Explore what we build.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )
    package = RawResearchPackage(
        identity=identity,
        documents=[doc_about, doc_stale_job],
        discovered_at=datetime.now(timezone.utc),
    )

    opps = extract_research_opportunities(package, "Linear")
    assert len(opps) == 1
    # Demoted to PROACTIVE because doc_stale_job failed the content signal gate
    assert opps[0].opportunity_type == OpportunityType.PROACTIVE
    assert opps[0].role_title == "General Outreach"

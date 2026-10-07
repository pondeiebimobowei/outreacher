import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock
import pytest

from core.models import (
    CrawledDocument,
    DocumentQuality,
    IdentityConfidence,
    PageType,
    SiteRelationship,
)
from crawling.acquirer import (
    AcquiredSiteDocuments,
)
from contact_discovery.models import (
    ContactPersonKind,
    ProviderFailureCode,
)
from contact_discovery.pipeline import ContactDiscoveryPipeline
from gateway.schemas import (
    ContactDiscoveryRequest,
)


SAMPLE_HTML_PAGE = """
<html>
<head><title>About Acme Corp Team</title></head>
<body>
<h1>Acme Corp Team</h1>
<div class="member">
    <h3>Sarah Connor</h3>
    <p>Chief Technology Officer</p>
    <p>Sarah leads engineering and distributed architecture.</p>
</div>
<div class="member">
    <h3>John Doe</h3>
    <p>Head of Talent</p>
    <p>John Doe leads talent acquisition and hiring across the company.</p>
    <p>Contact: john.doe@acme.com</p>
</div>
<div class="footer">
    <p>Careers: careers@acme.com</p>
</div>
</body>
</html>
"""


@pytest.fixture
def mock_pipeline_dependencies():
    verifier = MagicMock()
    acquirer = MagicMock()
    crawl_manager = MagicMock()
    search_provider = MagicMock()
    return verifier, acquirer, crawl_manager, search_provider


def test_pipeline_halts_when_not_primary(mock_pipeline_dependencies):
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    # Verifier reports RELATED (not PRIMARY)
    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme",
        raw_html="<html>Acme</html>",
        content="Acme",
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=doc)
    verifier.classify_relationship.return_value = (
        SiteRelationship.RELATED,
        "Parent company domain",
        [],
    )

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-1",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme",
        domain="acme.com",
    )

    resp = pipeline.run(req)

    assert resp.status == "IDENTITY_HALTED"
    assert resp.identity.verified_domain == "acme.com"
    assert resp.identity.primary_relationship == "RELATED"
    assert resp.identity.confidence == "AMBIGUOUS"
    assert resp.contacts == []
    assert resp.failure is None
    # No crawl or search should have occurred
    crawl_manager.fetch_with_fallback.assert_not_called()
    search_provider.search.assert_not_called()
    assert resp.metadata["search_calls"] == 0
    assert resp.metadata["candidate_urls_discovered"] == 0
    assert resp.metadata["static_crawl_calls"] == 0
    assert resp.metadata["browser_fallback_count"] == 0
    assert resp.metadata["extraction_calls"] == 0


def test_pipeline_halts_when_ambiguous(mock_pipeline_dependencies):
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme",
        raw_html="<html>Acme</html>",
        content="Acme",
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.TOO_SHORT,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=doc)
    verifier.classify_relationship.return_value = (
        SiteRelationship.UNKNOWN,
        "Could not verify domain",
        [],
    )

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-2",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme",
        domain="acme.com",
    )

    resp = pipeline.run(req)

    assert resp.status == "IDENTITY_HALTED"
    assert resp.identity.confidence == "UNRESOLVED"
    assert resp.contacts == []
    crawl_manager.fetch_with_fallback.assert_not_called()
    search_provider.search.assert_not_called()
    assert resp.metadata["search_calls"] == 0
    assert resp.metadata["candidate_urls_discovered"] == 0
    assert resp.metadata["static_crawl_calls"] == 0
    assert resp.metadata["browser_fallback_count"] == 0
    assert resp.metadata["extraction_calls"] == 0


ALL_14_INVALID_COMBINATIONS = [
    (rel, conf)
    for rel in [
        SiteRelationship.PRIMARY,
        SiteRelationship.RELATED,
        SiteRelationship.LEGACY,
        SiteRelationship.UNRELATED,
        SiteRelationship.UNKNOWN,
    ]
    for conf in [
        IdentityConfidence.CONFIDENT,
        IdentityConfidence.AMBIGUOUS,
        IdentityConfidence.UNRESOLVED,
    ]
    if not (rel == SiteRelationship.PRIMARY and conf == IdentityConfidence.CONFIDENT)
]


@pytest.mark.parametrize("rel,conf", ALL_14_INVALID_COMBINATIONS)
def test_pipeline_halts_for_all_non_primary_confident_combinations_with_zero_acquisition_calls(
    mock_pipeline_dependencies, rel, conf
):
    """Proves every non-(PRIMARY + CONFIDENT) identity combination (14 total) exits before any search or crawl dependency is invoked."""
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme Corp",
        raw_html="<html>Acme</html>",
        content="Acme",
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=doc)
    verifier.classify_relationship.return_value = (rel, conf, f"Classification: {rel.value} {conf.value}", [])

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id=f"req-gate-{rel.value}-{conf.value}",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme Corp",
        domain="acme.com",
    )

    resp = pipeline.run(req)

    assert resp.status == "IDENTITY_HALTED"
    assert resp.identity.primary_relationship == rel.value
    assert resp.identity.confidence == conf.value
    assert resp.contacts == []
    assert resp.failure is None
    # Zero candidate search or crawl calls
    crawl_manager.fetch_with_fallback.assert_not_called()
    search_provider.search.assert_not_called()
    assert resp.metadata["identity_verification_calls"] == 1
    assert resp.metadata["search_calls"] == 0
    assert resp.metadata["candidate_urls_discovered"] == 0
    assert resp.metadata["static_crawl_calls"] == 0
    assert resp.metadata["browser_fallback_count"] == 0
    assert resp.metadata["extraction_calls"] == 0
    assert resp.metadata["homepage_extractions"] == 0
    assert resp.metadata["bundle_secondary_extractions"] == 0
    assert resp.metadata["candidate_page_extractions"] == 0


def test_pipeline_extracts_contacts_when_confident(mock_pipeline_dependencies):
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    # Verifier reports PRIMARY + CONFIDENT
    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme Corp Team",
        raw_html=SAMPLE_HTML_PAGE,
        content=SAMPLE_HTML_PAGE,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(
        homepage_doc=doc,
        secondary_docs=[],
    )
    verifier.classify_relationship.return_value = (
        SiteRelationship.PRIMARY,
        "Exact domain match verified",
        [MagicMock(type="SELF_IDENTITY", signal="exact")],
    )

    # Search provider returns candidate URLs
    search_provider.search.return_value = [
        {"url": "https://acme.com/team", "title": "Team"},
        {"url": "https://acme.com/careers", "title": "Careers"},
    ]

    # Crawl manager returns documents for candidate URLs
    crawl_manager.fetch_with_fallback.return_value = doc

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-3",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme Corp",
        domain="acme.com",
        target_roles=["Chief Technology Officer", "Head of Talent"],
    )

    resp = pipeline.run(req)

    assert resp.status == "COMPLETED"
    assert resp.identity.verified_domain == "acme.com"
    assert resp.identity.primary_relationship == "PRIMARY"
    assert resp.identity.confidence == "CONFIDENT"
    assert len(resp.contacts) >= 2

    # Check Sarah Connor and John Doe
    names = {f"{c.first_name} {c.last_name}" for c in resp.contacts if c.person_kind == ContactPersonKind.PERSON}
    assert "Sarah Connor" in names
    assert "John Doe" in names


def test_pipeline_defaults_target_roles_and_caps_at_5(mock_pipeline_dependencies):
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme Corp Team",
        raw_html=SAMPLE_HTML_PAGE,
        content=SAMPLE_HTML_PAGE,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=doc)
    verifier.classify_relationship.return_value = (
        SiteRelationship.PRIMARY,
        "Exact match",
        [MagicMock(type="SELF_IDENTITY", signal="exact")],
    )
    search_provider.search.return_value = []
    crawl_manager.fetch_with_fallback.return_value = doc

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    # Empty target_roles
    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-4",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme Corp",
        domain="acme.com",
        target_roles=None,
    )

    resp = pipeline.run(req)

    assert resp.status == "COMPLETED"
    assert len(resp.contacts) <= 5
    assert len(resp.contacts) > 0


def test_pipeline_handles_crawl_failure_gracefully(mock_pipeline_dependencies):
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme Corp Team",
        raw_html="<html>Acme</html>",
        content="Acme",
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=doc)
    verifier.classify_relationship.return_value = (
        SiteRelationship.PRIMARY,
        "Verified",
        [MagicMock(type="SELF_IDENTITY", signal="exact")],
    )
    search_provider.search.side_effect = RuntimeError("Upstream search provider unreachable")

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-5",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme Corp",
        domain="acme.com",
    )

    resp = pipeline.run(req)

    assert resp.status == "FAILED"
    assert resp.contacts == []
    assert resp.failure is not None
    assert resp.failure.code == ProviderFailureCode.UPSTREAM_SEARCH_FAILED
    assert resp.failure.retryable is True
    # Identity reflects last known state
    assert resp.identity.verified_domain == "acme.com"
    assert resp.identity.primary_relationship == "PRIMARY"
    assert resp.identity.confidence == "CONFIDENT"


def test_pipeline_fails_when_crawl_manager_missing_fetch_with_fallback(mock_pipeline_dependencies):
    """Missing crawler API must produce typed FAILED with zero contacts, never COMPLETED."""
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme Corp Team",
        raw_html=SAMPLE_HTML_PAGE,
        content=SAMPLE_HTML_PAGE,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=doc)
    verifier.classify_relationship.return_value = (
        SiteRelationship.PRIMARY,
        "Exact domain match verified",
        [MagicMock(type="SELF_IDENTITY", signal="exact")],
    )

    search_provider.search.return_value = [
        {"url": "https://acme.com/team", "title": "Team"}
    ]

    # Object lacking fetch_with_fallback (e.g. hypothetical broken crawler)
    class IncompleteCrawler:
        pass

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=IncompleteCrawler(),
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-missing-api",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme Corp",
        domain="acme.com",
    )

    resp = pipeline.run(req)

    assert resp.status == "FAILED"
    assert resp.contacts == []
    assert resp.failure is not None
    assert resp.failure.code == ProviderFailureCode.DISCOVERY_OPERATIONAL_FAILURE
    assert resp.failure.retryable is True
    assert "does not implement required 'fetch_with_fallback' API" in resp.failure.message


def test_pipeline_fails_when_crawler_throws_unexpected_exception(mock_pipeline_dependencies):
    """Crawler exception during candidate crawl must produce typed FAILED, never COMPLETED."""
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme Corp Team",
        raw_html=SAMPLE_HTML_PAGE,
        content=SAMPLE_HTML_PAGE,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=doc)
    verifier.classify_relationship.return_value = (
        SiteRelationship.PRIMARY,
        "Exact domain match verified",
        [MagicMock(type="SELF_IDENTITY", signal="exact")],
    )

    search_provider.search.return_value = [
        {"url": "https://acme.com/team", "title": "Team"}
    ]

    # Crawler crashes unexpectedly during fetch
    crawl_manager.fetch_with_fallback.side_effect = RuntimeError("Playwright browser process disconnected")

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-crash",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme Corp",
        domain="acme.com",
    )

    resp = pipeline.run(req)

    assert resp.status == "FAILED"
    assert resp.contacts == []
    assert resp.failure is not None
    assert resp.failure.code == ProviderFailureCode.DISCOVERY_OPERATIONAL_FAILURE
    assert "Playwright browser process disconnected" in resp.failure.message


def test_pipeline_bounds_browser_fallbacks(mock_pipeline_dependencies):
    """Verify that browser fallback is capped at MAX_BROWSER_FALLBACKS (2)."""
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme Corp Team",
        raw_html="<html>Acme Corp</html>",
        content="Acme Corp",
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=doc)
    verifier.classify_relationship.return_value = (
        SiteRelationship.PRIMARY,
        "Exact domain match verified",
        [MagicMock(type="SELF_IDENTITY", signal="exact")],
    )

    search_provider.search.return_value = [
        {"url": "https://acme.com/team", "title": "Team"},
        {"url": "https://acme.com/leadership", "title": "Leadership"},
        {"url": "https://acme.com/contact", "title": "Contact"},
    ]

    browser_doc = CrawledDocument(
        url="https://acme.com/sub",
        final_url="https://acme.com/sub",
        title="Sub",
        raw_html="<html>Content</html>",
        content="Content",
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.OTHER,
        quality=DocumentQuality.VALID,
        fetch_strategy="BROWSER",
    )
    crawl_manager.fetch_with_fallback.return_value = browser_doc

    static_crawler = MagicMock()
    static_crawler.fetch.return_value = browser_doc
    crawl_manager.static_crawler = static_crawler

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-fallback-bound",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme Corp",
        domain="acme.com",
    )

    resp = pipeline.run(req)

    assert resp.status == "COMPLETED"
    # Exactly 2 calls to fetch_with_fallback, and the 3rd candidate called static_crawler.fetch
    assert crawl_manager.fetch_with_fallback.call_count == 2
    assert static_crawler.fetch.call_count == 1


def test_pipeline_skips_recoverable_candidate_failure_when_other_evidence_valid(mock_pipeline_dependencies):
    """A recoverable page-level failure (e.g. 404 or empty content) allows valid evidence to complete."""
    verifier, acquirer, crawl_manager, search_provider = mock_pipeline_dependencies

    # Homepage has valid contact
    hp_doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://acme.com",
        title="Acme Corp Team",
        raw_html=SAMPLE_HTML_PAGE,
        content=SAMPLE_HTML_PAGE,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=hp_doc)
    verifier.classify_relationship.return_value = (
        SiteRelationship.PRIMARY,
        "Exact domain match verified",
        [MagicMock(type="SELF_IDENTITY", signal="exact")],
    )

    search_provider.search.return_value = [
        {"url": "https://acme.com/team", "title": "Team"},
    ]

    # Candidate URL returns an empty/failed doc (e.g. 404/FETCH_FAILED)
    failed_doc = CrawledDocument(
        url="https://acme.com/team",
        final_url="https://acme.com/team",
        title="",
        raw_html="",
        content="",
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.OTHER,
        quality=DocumentQuality.FETCH_FAILED,
        status_code=404,
    )
    crawl_manager.fetch_with_fallback.return_value = failed_doc

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-recoverable",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme Corp",
        domain="acme.com",
        target_roles=["Chief Technology Officer"],
    )

    resp = pipeline.run(req)

    # Legitimate completion using homepage evidence
    assert resp.status == "COMPLETED"
    assert len(resp.contacts) >= 1
    assert any(c.first_name == "Sarah" for c in resp.contacts)

"""
tests/test_acquisition_fallbacks.py — Unit test suite for legitimate search-indexed acquisition fallbacks (Track 2)
"""

import pytest
from datetime import datetime, timezone
from core.models import (
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType, EvidenceType,
)
from identity.verifier import WebsiteVerifier
from benchmark_identity_recall import (
    _DeterministicSearchProvider,
    _DeterministicCrawlManager,
)


def _blocked_doc(url: str) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=403,
        title="",
        content="",
        raw_html="",
        word_count=0,
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.BLOCKED,
        error="Cloudflare challenge page / WAF blocked",
        retrieved_at=datetime.now(timezone.utc),
    )


def test_blocked_homepage_with_dual_indexed_evidence_verifies_primary():
    """Tests that a blocked homepage is safely rescued when dual identity-bearing indexed results corroborate the entity."""
    company = "Personio"
    website_url = "https://personio.com"

    crawl = _DeterministicCrawlManager({
        "https://personio.com": _blocked_doc("https://personio.com"),
    })

    search = _DeterministicSearchProvider(
        company="Personio",
        domain="personio.com",
        results=[
            SearchResult(
                title="Personio: The HR Operating System",
                url="https://personio.com",
                snippet="Personio is the holistic HR software for small and medium-sized businesses.",
            ),
            SearchResult(
                title="Impressum | Personio",
                url="https://personio.com/impressum",
                snippet="Personio SE & Co. KG, Seidlstraße 28, 80335 München. Registered at AG München.",
            ),
        ]
    )

    verifier = WebsiteVerifier(crawl_manager=crawl, search_provider=search)
    rel, msg, ev = verifier.classify_relationship(company, website_url, hint_title="Personio: The HR Operating System")

    assert rel == SiteRelationship.PRIMARY
    assert any("INDEXED" in e.signal for e in ev)
    assert any("impressum" in e.url for e in ev)


def test_blocked_homepage_snippet_only_insufficient():
    """Tests that a search snippet alone without entity title match or secondary corroboration is strictly UNKNOWN."""
    company = "ObscureBrand"
    website_url = "https://obscurebrand.com"

    crawl = _DeterministicCrawlManager({
        "https://obscurebrand.com": _blocked_doc("https://obscurebrand.com"),
    })

    # Only one search result with a non-matching title and vague snippet
    search = _DeterministicSearchProvider(
        company="ObscureBrand",
        domain="obscurebrand.com",
        results=[
            SearchResult(
                title="Welcome to our Portal",
                url="https://obscurebrand.com",
                snippet="We provide services across various industries worldwide.",
            ),
        ]
    )

    verifier = WebsiteVerifier(crawl_manager=crawl, search_provider=search)
    rel, msg, ev = verifier.classify_relationship(company, website_url)

    assert rel == SiteRelationship.UNKNOWN
    assert "insufficient" in msg.lower() or "blocked" in msg.lower()


def test_blocked_homepage_subpage_without_identity_evidence_insufficient():
    """Tests that the mere existence of a first-party sub-URL without identity evidence remains UNKNOWN."""
    company = "TargetTech"
    website_url = "https://targettech.com"

    crawl = _DeterministicCrawlManager({
        "https://targettech.com": _blocked_doc("https://targettech.com"),
    })

    search = _DeterministicSearchProvider(
        company="TargetTech",
        domain="targettech.com",
        results=[
            SearchResult(
                title="TargetTech - Cloud Infrastructure",
                url="https://targettech.com",
                snippet="TargetTech provides enterprise cloud infrastructure.",
            ),
            # Secondary indexed URL exists, but has NO identity-bearing information
            SearchResult(
                title="System Changelog & Release Notes",
                url="https://targettech.com/changelog",
                snippet="Fixed issue with dashboard rendering and improved API response times.",
            ),
        ]
    )

    verifier = WebsiteVerifier(crawl_manager=crawl, search_provider=search)
    rel, msg, ev = verifier.classify_relationship(company, website_url, hint_title="TargetTech - Cloud Infrastructure")

    assert rel == SiteRelationship.UNKNOWN
    assert rel != SiteRelationship.PRIMARY


def test_blocked_homepage_subordinate_relationship_classified_related():
    """Tests that when indexed evidence reveals a subordinate relationship, it is classified as RELATED, not PRIMARY."""
    company = "Vercel"
    website_url = "https://v0.dev"

    crawl = _DeterministicCrawlManager({
        "https://v0.dev": _blocked_doc("https://v0.dev"),
    })

    search = _DeterministicSearchProvider(
        company="Vercel",
        domain="v0.dev",
        results=[
            SearchResult(
                title="v0 by Vercel: Generative UI",
                url="https://v0.dev",
                snippet="v0 is a generative UI tool built by Vercel for modern web developers.",
            ),
            SearchResult(
                title="About v0 - Product of Vercel",
                url="https://v0.dev/about",
                snippet="v0 is an experimental AI interface built by Vercel Labs.",
            ),
        ]
    )

    verifier = WebsiteVerifier(crawl_manager=crawl, search_provider=search)
    rel, msg, ev = verifier.classify_relationship(company, website_url)

    assert rel == SiteRelationship.RELATED
    assert rel != SiteRelationship.PRIMARY


def test_blocked_homepage_third_party_domain_rejected():
    """Tests that a third-party domain with no domain correspondence is never promoted on blocked fallback."""
    company = "Acme Global"
    website_url = "https://random-distributor.com"

    crawl = _DeterministicCrawlManager({
        "https://random-distributor.com": _blocked_doc("https://random-distributor.com"),
    })

    search = _DeterministicSearchProvider(
        company="Acme Global",
        domain="random-distributor.com",
        results=[
            SearchResult(
                title="Acme Global Supplies Catalog",
                url="https://random-distributor.com",
                snippet="We sell Acme Global products at wholesale prices.",
            ),
            SearchResult(
                title="Contact Distributor",
                url="https://random-distributor.com/contact",
                snippet="Get in touch for Acme Global ordering inquiries.",
            ),
        ]
    )

    verifier = WebsiteVerifier(crawl_manager=crawl, search_provider=search)
    rel, msg, ev = verifier.classify_relationship(company, website_url)

    assert rel == SiteRelationship.UNKNOWN
    assert rel != SiteRelationship.PRIMARY

"""
tests/test_evidence_weighted_shape_risk.py — Unit tests for Evidence-Weighted Shape-Risk Arbitration (Track 3)
"""

import pytest
from datetime import datetime, timezone
from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityCandidate,
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from crawling.acquirer import FirstPartyAcquirer
from benchmark_identity_recall import (
    _DeterministicSearchProvider,
    _DeterministicCrawlManager,
)


def _valid_doc(url: str, title: str, content: str, ptype: PageType = PageType.OTHER) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=200,
        title=title,
        content=content,
        word_count=len(content.split()),
        page_type=ptype,
        quality=DocumentQuality.VALID,
        retrieved_at=datetime.now(timezone.utc),
    )


def test_coined_short_brand_uncontested_exact_domain_promoted_confident():
    """Tests that a 5-letter coined brand with exact domain, uncontested primary, and strong corroboration is CONFIDENT."""
    company = "Adyen"
    domain = "adyen.com"

    search = _DeterministicSearchProvider(
        company="Adyen",
        domain="adyen.com",
        results=[
            SearchResult(
                title="Adyen – Global Financial Technology Platform",
                url="https://adyen.com",
                snippet="Adyen is the financial technology platform of choice for leading businesses.",
            ),
        ]
    )

    crawl = _DeterministicCrawlManager({
        "https://adyen.com": _valid_doc("https://adyen.com", "Adyen – Global Financial Technology Platform", "Adyen is a global financial technology platform.", PageType.HOMEPAGE),
        "https://adyen.com/about": _valid_doc("https://adyen.com/about", "About Adyen", "About Adyen: The financial technology platform.", PageType.ABOUT),
    })

    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)
    resolver = IdentityResolver(search, verifier, acquirer=acquirer)

    identity = resolver.resolve(company)
    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain
    assert "uncontested" in identity.reasoning.lower() or "uniquely verified" in identity.reasoning.lower()


def test_coined_4letter_brand_uncontested_exact_domain_promoted_confident():
    """Tests that a 4-letter coined brand (e.g. Yoco) with exact domain and dual corroboration is CONFIDENT."""
    company = "Yoco"
    domain = "yoco.com"

    search = _DeterministicSearchProvider(
        company="Yoco",
        domain="yoco.com",
        results=[
            SearchResult(
                title="Yoco - Point of Sale & Card Machines",
                url="https://yoco.com",
                snippet="Yoco helps small businesses get paid with card machines and online payments.",
            ),
        ]
    )

    crawl = _DeterministicCrawlManager({
        "https://yoco.com": _valid_doc("https://yoco.com", "Yoco - Point of Sale & Card Machines", "Yoco provides card machines and payment solutions.", PageType.HOMEPAGE),
        "https://yoco.com/about": _valid_doc("https://yoco.com/about", "About Yoco", "About Yoco: empowering small businesses across Africa.", PageType.ABOUT),
    })

    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)
    resolver = IdentityResolver(search, verifier, acquirer=acquirer)

    identity = resolver.resolve(company)
    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain


def test_generic_dictionary_shape_risk_stays_ambiguous():
    """Tests that a short generic dictionary word (e.g. Acme Corp) remains AMBIGUOUS despite single primary."""
    company = "Acme Corp"
    domain = "acme.com"

    search = _DeterministicSearchProvider(
        company="Acme Corp",
        domain="acme.com",
        results=[
            SearchResult(
                title="Acme Corp - Manufacturing",
                url="https://acme.com",
                snippet="Acme Corp manufactures industrial widgets.",
            ),
        ]
    )

    crawl = _DeterministicCrawlManager({
        "https://acme.com": _valid_doc("https://acme.com", "Acme Corp - Manufacturing", "Acme Corp is an industrial manufacturing company.", PageType.HOMEPAGE),
        "https://acme.com/about": _valid_doc("https://acme.com/about", "About Acme Corp", "About Acme Corp.", PageType.ABOUT),
    })

    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)
    resolver = IdentityResolver(search, verifier, acquirer=acquirer)

    identity = resolver.resolve(company)
    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert "generic" in identity.reasoning.lower() or "shape-risk" in identity.reasoning.lower()


def test_short_brand_with_competing_primaries_stays_ambiguous():
    """Tests that multiple competing primaries sharing a short name strictly yield AMBIGUOUS."""
    company = "Linear"

    search = _DeterministicSearchProvider(
        company="Linear",
        domain="linear.app",
        results=[
            SearchResult(title="Linear – Issue Tracking", url="https://linear.app", snippet="Linear software planning."),
            SearchResult(title="Linear – Venture Capital", url="https://linear.vc", snippet="Linear early stage investing."),
        ]
    )

    crawl = _DeterministicCrawlManager({
        "https://linear.app": _valid_doc("https://linear.app", "Linear – Issue Tracking", "Linear is a software issue tracker.", PageType.HOMEPAGE),
        "https://linear.app/about": _valid_doc("https://linear.app/about", "About Linear", "About Linear software.", PageType.ABOUT),
        "https://linear.vc": _valid_doc("https://linear.vc", "Linear – Venture Capital", "Linear is a venture capital firm.", PageType.HOMEPAGE),
        "https://linear.vc/about": _valid_doc("https://linear.vc/about", "About Linear", "About Linear venture capital.", PageType.ABOUT),
    })

    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)
    resolver = IdentityResolver(search, verifier, acquirer=acquirer)

    identity = resolver.resolve(company)
    assert identity.confidence == IdentityConfidence.AMBIGUOUS


def test_short_generic_name_with_non_exact_domain_stays_ambiguous():
    """Tests that a short generic brand on a non-exact domain remains AMBIGUOUS."""
    company = "Nexus"
    domain = "nexus-consulting-group.com"

    search = _DeterministicSearchProvider(
        company="Nexus",
        domain="nexus-consulting-group.com",
        results=[
            SearchResult(
                title="Nexus Consulting Group - Global Advisors",
                url="https://nexus-consulting-group.com",
                snippet="Nexus Consulting Group provides management advisory.",
            ),
        ]
    )

    crawl = _DeterministicCrawlManager({
        "https://nexus-consulting-group.com": _valid_doc("https://nexus-consulting-group.com", "Nexus Consulting Group - Global Advisors", "Nexus provides business advisory services.", PageType.HOMEPAGE),
        "https://nexus-consulting-group.com/about": _valid_doc("https://nexus-consulting-group.com/about", "About Nexus", "About Nexus Consulting.", PageType.ABOUT),
    })

    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)
    resolver = IdentityResolver(search, verifier, acquirer=acquirer)

    identity = resolver.resolve(company)
    assert identity.confidence == IdentityConfidence.AMBIGUOUS

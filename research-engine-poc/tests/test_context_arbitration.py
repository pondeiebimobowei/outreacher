"""
tests/test_context_arbitration.py — Comprehensive Regression Tests for Context-Aware Arbitration

Covers all 5 core requirements & 10 safety invariants:
1. Verified candidate + strong positive first-party context match overrides unverified competing domains -> CONFIDENT.
2. Non-matching strong context or weak context + competing domain -> AMBIGUOUS.
3. Multiple verified PRIMARY candidates:
   - Context matches exactly 1 -> CONFIDENT for the matching candidate.
   - Context matches neither (0) -> AMBIGUOUS.
   - Context matches both (>1) -> AMBIGUOUS.
   - No context -> AMBIGUOUS.
4. Active namesake collision on short/coined brand tokens:
   - Discounted only by positive first-party context match.
   - Preserves AMBIGUOUS when context does not match or is absent.
5. Invariant: Indexed-only fallback candidates (bot-blocked) cannot receive CONFIDENT context override.
6. Invariant: Strong context without live first-party crawled evidence cannot resolve CONFIDENT.
7. Invariant: Subordinate/RELATED candidate matching context cannot be promoted to PRIMARY/CONFIDENT.
"""

import pytest
from datetime import datetime, timezone
from typing import List, Optional
from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityCandidate, IdentityEvidence, IdentityContext,
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType, EvidenceType,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from benchmark_identity_recall import (
    _DeterministicSearchProvider,
    _DeterministicCrawlManager,
)


def _doc(url: str, title: str = "", content: str = "", ptype: PageType = PageType.OTHER, final_url: str = None) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=final_url or url,
        status_code=200,
        title=title,
        content=content,
        word_count=len(content.split()),
        page_type=ptype,
        quality=DocumentQuality.VALID,
        retrieved_at=datetime.now(timezone.utc),
    )


def _blocked_doc(url: str) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=403,
        title="403 Forbidden - Access Denied (Cloudflare)",
        content="<html><body>Access Denied. Cloudflare bot protection active.</body></html>",
        word_count=8,
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.HTTP_ERROR,
        retrieved_at=datetime.now(timezone.utc),
    )


class _DomainAwareSearchProvider:
    """Mock search provider that routes site: queries cleanly to their respective domains."""
    def __init__(self, main_results: List[SearchResult], domain_site_results: Optional[dict] = None):
        self.main_results = main_results
        self.domain_site_results = domain_site_results or {}

    @property
    def name(self) -> str:
        return "domain_aware_mock_search"

    def search(self, query: str, num_results: int = 10) -> List[SearchResult]:
        q_lower = query.lower()
        for dom, res_list in self.domain_site_results.items():
            if f"site:{dom.lower()}" in q_lower:
                return res_list
        return self.main_results


# ── 1. Competing Brand Domains Overridden By Verified Candidate With Strong Context ──

def test_verified_candidate_with_strong_context_overrides_unverified_competing_domain():
    """When a candidate is verified PRIMARY and the caller supplies STRONG context
    that matches live first-party crawled evidence, an unverified competing domain in
    search results does not force AMBIGUOUS; resolution succeeds as CONFIDENT."""
    company = "DocuSign"
    target_domain = "docusign.com"
    competing_domain = "docusign.net"

    search = _DomainAwareSearchProvider(
        main_results=[
            SearchResult(title="DocuSign | Electronic Signatures", url=f"https://{target_domain}", snippet="DocuSign agreement platform."),
            SearchResult(title="DocuSign Network Infrastructure", url=f"https://{competing_domain}", snippet="DocuSign internal gateway."),
        ],
        domain_site_results={
            target_domain: [SearchResult(title="About DocuSign", url=f"https://{target_domain}/about", snippet="About DocuSign, Inc.")],
            competing_domain: [SearchResult(title="DocuSign System Gateway", url=f"https://{competing_domain}", snippet="Internal gateway.")],
        }
    )

    crawl = _DeterministicCrawlManager({
        f"https://{target_domain}": _doc(
            f"https://{target_domain}",
            "DocuSign: Intelligent Agreement Management",
            "DocuSign is the global agreement platform. Copyright 2026 DocuSign, Inc. All rights reserved.",
            PageType.HOMEPAGE,
        ),
        f"https://{target_domain}/about": _doc(
            f"https://{target_domain}/about",
            "About DocuSign",
            "DocuSign, Inc. is headquartered in San Francisco, California.",
            PageType.ABOUT,
        ),
        f"https://{competing_domain}": _doc(
            f"https://{competing_domain}",
            "DocuSign System Gateway",
            "System access gateway. Internal use only.",
            PageType.HOMEPAGE,
        ),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    # 1. With strong matching context -> CONFIDENT
    ctx = IdentityContext(legal_name="DocuSign, Inc.", headquarters="San Francisco")
    identity_with_ctx = resolver.resolve(company, context=ctx)
    assert identity_with_ctx.confidence == IdentityConfidence.CONFIDENT, (
        f"Expected CONFIDENT with strong matching context, got {identity_with_ctx.confidence}. "
        f"Reasoning: {identity_with_ctx.reasoning}"
    )
    assert identity_with_ctx.domain == target_domain

    # 2. Without context -> remains AMBIGUOUS due to competing brand domains
    identity_no_ctx = resolver.resolve(company, context=None)
    assert identity_no_ctx.confidence == IdentityConfidence.AMBIGUOUS, (
        f"Expected AMBIGUOUS without context due to competing domain, got {identity_no_ctx.confidence}."
    )
    assert identity_no_ctx.domain == ""


def test_verified_candidate_with_non_matching_context_retains_competing_domain_ambiguous():
    """If caller context does NOT match the first-party text, competing domain ambiguity
    must be preserved (no unbacked override)."""
    company = "DocuSign"
    target_domain = "docusign.com"
    competing_domain = "docusign.net"

    search = _DomainAwareSearchProvider(
        main_results=[
            SearchResult(title="DocuSign | Electronic Signatures", url=f"https://{target_domain}", snippet="DocuSign agreement platform."),
            SearchResult(title="DocuSign Network Infrastructure", url=f"https://{competing_domain}", snippet="DocuSign internal gateway."),
        ]
    )

    crawl = _DeterministicCrawlManager({
        f"https://{target_domain}": _doc(
            f"https://{target_domain}",
            "DocuSign: Intelligent Agreement Management",
            "DocuSign is the global agreement platform. Copyright 2026 DocuSign, Inc.",
            PageType.HOMEPAGE,
        ),
        f"https://{target_domain}/about": _doc(
            f"https://{target_domain}/about",
            "About DocuSign",
            "DocuSign, Inc. is located in San Francisco.",
            PageType.ABOUT,
        ),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    # Context specifies completely different entity / location
    ctx = IdentityContext(legal_name="Unrelated Corp Inc.", headquarters="Tokyo")
    identity = resolver.resolve(company, context=ctx)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""


def test_weak_context_only_with_competing_domain_preserves_ambiguity():
    """Weak context attributes (e.g. industry, employee count, description) cannot override
    competing brand domain ambiguity; resolution must remain AMBIGUOUS."""
    company = "DocuSign"
    target_domain = "docusign.com"
    competing_domain = "docusign.net"

    search = _DomainAwareSearchProvider(
        main_results=[
            SearchResult(title="DocuSign | Electronic Signatures", url=f"https://{target_domain}", snippet="DocuSign agreement platform."),
            SearchResult(title="DocuSign Network Infrastructure", url=f"https://{competing_domain}", snippet="DocuSign internal gateway."),
        ],
        domain_site_results={
            target_domain: [SearchResult(title="About DocuSign", url=f"https://{target_domain}/about", snippet="About DocuSign.")],
        }
    )

    crawl = _DeterministicCrawlManager({
        f"https://{target_domain}": _doc(
            f"https://{target_domain}",
            "DocuSign: Agreement Management",
            "DocuSign is a software company. Copyright 2026 DocuSign, Inc.",
            PageType.HOMEPAGE,
        ),
        f"https://{target_domain}/about": _doc(
            f"https://{target_domain}/about",
            "About DocuSign",
            "DocuSign agreement solutions.",
            PageType.ABOUT,
        ),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    # Caller supplies only weak context
    ctx = IdentityContext(industry="software", description="electronic signatures")
    identity = resolver.resolve(company, context=ctx)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""


# ── 2. Multiple Verified PRIMARY Candidates Disambiguation ───────────────────────

def test_multiple_verified_primary_candidates_disambiguated_by_strong_context():
    """When multiple candidates are verified PRIMARY, strong caller context is evaluated
    against EVERY verified PRIMARY candidate:
    - Exactly 1 match -> that candidate is selected (CONFIDENT).
    """
    company = "Palantir"
    domain_a = "palantir.com"
    domain_b = "palantir.net"

    search = _DomainAwareSearchProvider(
        main_results=[
            SearchResult(title="Palantir Technologies", url=f"https://{domain_a}", snippet="Palantir analytics platforms."),
            SearchResult(title="Palantir.net – Digital Consultancy", url=f"https://{domain_b}", snippet="Palantir.net digital consulting."),
        ],
        domain_site_results={
            domain_a: [SearchResult(title="About Palantir Technologies", url=f"https://{domain_a}/about", snippet="Palantir Technologies Denver")],
            domain_b: [SearchResult(title="About Palantir.net", url=f"https://{domain_b}/about", snippet="Palantir.net Chicago")],
        }
    )

    crawl = _DeterministicCrawlManager({
        f"https://{domain_a}": _doc(
            f"https://{domain_a}",
            "Palantir: AI and Data Platforms",
            "Palantir is a software platform company. Palantir Technologies Inc. builds foundational software. Headquartered in Denver.",
            PageType.HOMEPAGE,
        ),
        f"https://{domain_a}/about": _doc(
            f"https://{domain_a}/about",
            "About Palantir Technologies",
            "Palantir Technologies Inc. was founded in 2003. Headquarters: Denver, Colorado.",
            PageType.ABOUT,
        ),
        f"https://{domain_b}": _doc(
            f"https://{domain_b}",
            "Palantir.net: Strategic Digital Consulting",
            "Palantir.net is a full-service digital consultancy in Chicago. Palantir.net, Inc. builds Drupal platforms.",
            PageType.HOMEPAGE,
        ),
        f"https://{domain_b}/about": _doc(
            f"https://{domain_b}/about",
            "About Palantir.net",
            "Palantir.net, Inc. provides open-source Drupal consulting in Chicago, Illinois.",
            PageType.ABOUT,
        ),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    # 1. Strong context matching Palantir Technologies (Denver) -> selects palantir.com
    ctx_a = IdentityContext(legal_name="Palantir Technologies Inc.", headquarters="Denver")
    res_a = resolver.resolve(company, context=ctx_a)
    assert res_a.confidence == IdentityConfidence.CONFIDENT, (
        f"Expected palantir.com to be CONFIDENT with Denver context, got {res_a.confidence}. "
        f"Reasoning: {res_a.reasoning}"
    )
    assert res_a.domain == domain_a

    # 2. Strong context matching Palantir.net (Chicago) -> selects palantir.net
    ctx_b = IdentityContext(legal_name="Palantir.net, Inc.", headquarters="Chicago")
    res_b = resolver.resolve(company, context=ctx_b)
    assert res_b.confidence == IdentityConfidence.CONFIDENT, (
        f"Expected palantir.net to be CONFIDENT with Chicago context, got {res_b.confidence}. "
        f"Reasoning: {res_b.reasoning}"
    )
    assert res_b.domain == domain_b


def test_multiple_verified_primary_candidates_context_matches_neither_remains_ambiguous():
    """When multiple verified PRIMARY candidates exist and strong context matches neither,
    resolution must remain AMBIGUOUS."""
    company = "Palantir"
    domain_a = "palantir.com"
    domain_b = "palantir.net"

    search = _DomainAwareSearchProvider(
        main_results=[
            SearchResult(title="Palantir Technologies", url=f"https://{domain_a}", snippet="Palantir analytics platforms."),
            SearchResult(title="Palantir.net – Digital Consultancy", url=f"https://{domain_b}", snippet="Palantir.net digital consulting."),
        ],
        domain_site_results={
            domain_a: [SearchResult(title="About Palantir", url=f"https://{domain_a}/about", snippet="Palantir Technologies Denver")],
            domain_b: [SearchResult(title="About Palantir.net", url=f"https://{domain_b}/about", snippet="Palantir.net Chicago")],
        }
    )

    crawl = _DeterministicCrawlManager({
        f"https://{domain_a}": _doc(f"https://{domain_a}", "Palantir: Software", "Palantir is a software company. Denver.", PageType.HOMEPAGE),
        f"https://{domain_a}/about": _doc(f"https://{domain_a}/about", "About Palantir", "Palantir software.", PageType.ABOUT),
        f"https://{domain_b}": _doc(f"https://{domain_b}", "Palantir.net: Consulting", "Palantir.net is a consultancy. Chicago.", PageType.HOMEPAGE),
        f"https://{domain_b}/about": _doc(f"https://{domain_b}/about", "About Palantir.net", "Palantir.net consulting.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    # Context specifies London location that neither candidate has
    ctx = IdentityContext(legal_name="Palantir Healthcare Ltd.", headquarters="London")
    res = resolver.resolve(company, context=ctx)

    assert res.confidence == IdentityConfidence.AMBIGUOUS
    assert res.domain == ""


def test_multiple_verified_primary_candidates_context_matches_both_remains_ambiguous():
    """When multiple verified PRIMARY candidates exist and context happens to match both
    (non-unique discrimination), resolution must remain AMBIGUOUS."""
    company = "Palantir"
    domain_a = "palantir.com"
    domain_b = "palantir.net"

    search = _DomainAwareSearchProvider(
        main_results=[
            SearchResult(title="Palantir Technologies", url=f"https://{domain_a}", snippet="Palantir analytics platforms."),
            SearchResult(title="Palantir.net – Digital Consultancy", url=f"https://{domain_b}", snippet="Palantir.net digital consulting."),
        ],
        domain_site_results={
            domain_a: [SearchResult(title="About Palantir", url=f"https://{domain_a}/about", snippet="Palantir Technologies US")],
            domain_b: [SearchResult(title="About Palantir.net", url=f"https://{domain_b}/about", snippet="Palantir.net US")],
        }
    )

    crawl = _DeterministicCrawlManager({
        f"https://{domain_a}": _doc(f"https://{domain_a}", "Palantir: Software", "Palantir is a company. Headquarters in Delaware.", PageType.HOMEPAGE),
        f"https://{domain_a}/about": _doc(f"https://{domain_a}/about", "About Palantir", "Palantir Delaware operations.", PageType.ABOUT),
        f"https://{domain_b}": _doc(f"https://{domain_b}", "Palantir.net: Consulting", "Palantir.net is a company. Headquarters in Delaware.", PageType.HOMEPAGE),
        f"https://{domain_b}/about": _doc(f"https://{domain_b}/about", "About Palantir.net", "Palantir.net Delaware operations.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    # Context matches location on both sites
    ctx = IdentityContext(headquarters="Delaware")
    res = resolver.resolve(company, context=ctx)

    assert res.confidence == IdentityConfidence.AMBIGUOUS
    assert res.domain == ""


def test_multiple_verified_primary_candidates_no_context_remains_ambiguous():
    """When multiple verified PRIMARY candidates exist and no context is supplied,
    resolution must remain AMBIGUOUS."""
    company = "Palantir"
    domain_a = "palantir.com"
    domain_b = "palantir.net"

    search = _DomainAwareSearchProvider(
        main_results=[
            SearchResult(title="Palantir Technologies", url=f"https://{domain_a}", snippet="Palantir analytics platforms."),
            SearchResult(title="Palantir.net – Digital Consultancy", url=f"https://{domain_b}", snippet="Palantir.net digital consulting."),
        ],
        domain_site_results={
            domain_a: [SearchResult(title="About Palantir", url=f"https://{domain_a}/about", snippet="Palantir Denver")],
            domain_b: [SearchResult(title="About Palantir.net", url=f"https://{domain_b}/about", snippet="Palantir Chicago")],
        }
    )

    crawl = _DeterministicCrawlManager({
        f"https://{domain_a}": _doc(f"https://{domain_a}", "Palantir: Software", "Palantir is a software company.", PageType.HOMEPAGE),
        f"https://{domain_a}/about": _doc(f"https://{domain_a}/about", "About Palantir", "Palantir platform.", PageType.ABOUT),
        f"https://{domain_b}": _doc(f"https://{domain_b}", "Palantir.net: Consulting", "Palantir.net is a consultancy.", PageType.HOMEPAGE),
        f"https://{domain_b}/about": _doc(f"https://{domain_b}/about", "About Palantir.net", "Palantir.net platform.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    res = resolver.resolve(company, context=None)
    assert res.confidence == IdentityConfidence.AMBIGUOUS
    assert res.domain == ""


# ── 3. Active Namesake Collision Discounted By Positive Context ──────────────────

def test_active_namesake_collision_discounted_by_positive_first_party_context():
    """When a short/coined brand token triggers an active namesake probe finding a
    competing corporate domain, strong positive first-party context corroboration
    allows shape-risk discounting to succeed."""
    company = "Pleo"
    domain = "pleo.io"

    search = _DeterministicSearchProvider(
        company=company,
        domain=domain,
        results=[
            SearchResult(title="Pleo | Smart Business Spending", url=f"https://{domain}", snippet="Pleo expense management."),
        ]
    )

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _doc(
            f"https://{domain}",
            "Pleo | Smart Business Spending",
            "Pleo is a smart business spend management platform. Operational headquarters in Copenhagen.",
            PageType.HOMEPAGE,
        ),
        f"https://{domain}/about": _doc(
            f"https://{domain}/about",
            "About Pleo",
            "Pleo Technologies ApS is founded in Copenhagen, Denmark.",
            PageType.ABOUT,
        ),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    # Simulate active namesake probe detecting pleoworld.com
    resolver._check_active_namesake_collision = lambda co, cand: (True, "pleoworld.com")

    # 1. With strong matching context (Copenhagen) -> CONFIDENT
    ctx = IdentityContext(legal_name="Pleo Technologies ApS", headquarters="Copenhagen")
    res_ctx = resolver.resolve(company, context=ctx)
    assert res_ctx.confidence == IdentityConfidence.CONFIDENT, (
        f"Expected Pleo with Copenhagen context to resolve CONFIDENT, got {res_ctx.confidence}. "
        f"Reasoning: {res_ctx.reasoning}"
    )
    assert res_ctx.domain == domain

    # 2. Without context -> remains AMBIGUOUS due to active namesake collision
    res_no_ctx = resolver.resolve(company, context=None)
    assert res_no_ctx.confidence == IdentityConfidence.AMBIGUOUS
    assert res_no_ctx.domain == ""


def test_active_namesake_collision_with_non_matching_context_retains_ambiguity():
    """When an active namesake collision is detected, non-matching context must NOT discount
    shape risk; resolution remains AMBIGUOUS."""
    company = "Pleo"
    domain = "pleo.io"

    search = _DeterministicSearchProvider(company=company, domain=domain, results=[
        SearchResult(title="Pleo | Smart Business Spending", url=f"https://{domain}", snippet="Pleo expense management."),
    ])

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _doc(
            f"https://{domain}",
            "Pleo | Smart Business Spending",
            "Pleo is a spend management platform in Copenhagen.",
            PageType.HOMEPAGE,
        ),
        f"https://{domain}/about": _doc(
            f"https://{domain}/about",
            "About Pleo",
            "Pleo smart cards in Copenhagen.",
            PageType.ABOUT,
        ),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)
    resolver._check_active_namesake_collision = lambda co, cand: (True, "pleoworld.com")

    ctx = IdentityContext(legal_name="Unrelated Pleo AG", headquarters="Zurich")
    res = resolver.resolve(company, context=ctx)

    assert res.confidence == IdentityConfidence.AMBIGUOUS
    assert res.domain == ""


# ── 4. Invariant: Indexed-Only & Evidence Safety Invariants ──────────────────────

def test_indexed_only_fallback_candidate_cannot_receive_confident_context_override():
    """Invariant: When a candidate is verified solely through search-indexed fallback
    (bot-blocked homepage/sub-pages), context discrimination cannot execute because live
    first-party crawled evidence is absent. Epistemic cap at AMBIGUOUS must be preserved."""
    company = "Huel"
    domain = "huel.com"

    search = _DeterministicSearchProvider(
        company=company,
        domain=domain,
        results=[
            SearchResult(title="Huel – Nutritionally Complete Food", url=f"https://{domain}", snippet="Huel complete nutrition meals."),
            SearchResult(title="About Huel – Official", url=f"https://{domain}/about", snippet="Huel was founded in 2015 to make nutritionally complete food."),
        ]
    )

    # Live crawler is blocked (403 HTTP error)
    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _blocked_doc(f"https://{domain}"),
        f"https://{domain}/about": _blocked_doc(f"https://{domain}/about"),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    # Even with caller supplying strong context, bot-blocked candidate cannot resolve CONFIDENT
    ctx = IdentityContext(legal_name="Huel Limited", location="Tring")
    identity = resolver.resolve(company, context=ctx)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS, (
        f"Indexed-only candidate must remain AMBIGUOUS even with context, got {identity.confidence}. "
        f"Reasoning: {identity.reasoning}"
    )
    assert identity.domain == "", "Domain must be suppressed on AMBIGUOUS"


def test_strong_context_with_no_live_first_party_evidence_not_confident():
    """When a candidate has no live crawled first-party text, strong caller context
    cannot manufacture evidence and resolution cannot become CONFIDENT."""
    cand = IdentityCandidate(
        domain="thin.com",
        is_verified=False,
        relationship=SiteRelationship.UNKNOWN,
        evidence=[]
    )
    resolver = IdentityResolver(None, None)
    ctx = IdentityContext(legal_name="Thin Corp Inc.", headquarters="Seattle")

    is_matched, reason, basis = resolver._evaluate_context_discrimination(cand, ctx)
    assert is_matched is False
    assert basis in ("NO_FIRST_PARTY_EVIDENCE", "NO_FIRST_PARTY_MATCH")


def test_successful_context_override_requires_verified_primary_relationship():
    """A subordinate or RELATED relationship (e.g. 'Foo is a product of Bar') must NEVER
    become CONFIDENT or be selected as PRIMARY, even if caller context matches Bar's legal name."""
    company = "V0"
    domain = "v0.dev"

    search = _DeterministicSearchProvider(company=company, domain=domain, results=[
        SearchResult(title="V0 by Vercel", url=f"https://{domain}", snippet="V0 is an AI coding tool built by Vercel."),
    ])

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _doc(
            f"https://{domain}",
            "V0 by Vercel",
            "V0 is a product of Vercel Inc., headquartered in San Francisco.",
            PageType.HOMEPAGE,
        ),
        f"https://{domain}/about": _doc(
            f"https://{domain}/about",
            "About V0",
            "V0 is built by Vercel Inc. in San Francisco.",
            PageType.ABOUT,
        ),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    ctx = IdentityContext(legal_name="Vercel Inc.", headquarters="San Francisco")
    res = resolver.resolve(company, context=ctx)

    # Subordinate product must NOT resolve as CONFIDENT for V0
    assert res.confidence != IdentityConfidence.CONFIDENT
    assert res.domain == ""

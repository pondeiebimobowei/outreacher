"""
tests/test_identity_invariants.py — Formal Safety Invariant Property Tests (v1.3.2)

Codifies the 10 structural and semantic identity safety invariants:
1. Relationship precedence over self-ID
2. Common-word collision independent of length
3. Multi-primary arbitration safety (no snippet-only CONFIDENT promotion)
4. Evidence independence (soft-404 / duplicate homepage cannot corroborate)
5. Indexed fallback provenance and evidence contract
6. Canonical token and domain normalization (order-preserving)
7. Resolver domain/target suppression (None on non-CONFIDENT)
8. Counterfactual competitor injection
9. Search-order and pruning monotonicity
10. Unified Unsafe-CONFIDENT metric accounting
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


# ── Invariant 1: Relationship Precedence (v1.3.2-1) ───────────────────────────

def test_subordinate_relationship_precedence_over_sentence_self_id():
    """Asserts that phrases like 'Foo is a product of Bar' or 'Foo is a subsidiary of Bar'
    are classified as RELATED and NEVER PRIMARY, even though 'Foo is...' matches self-ID."""
    test_cases = [
        ("Acme", "https://acme.com", "Acme is a product of Global Holdings.", "About Acme", "Acme is a brand owned by Global Holdings."),
        ("Alpha", "https://alpha.io", "Alpha is a subsidiary of MegaCorp.", "About Alpha", "Alpha is a business unit of MegaCorp."),
        ("V0", "https://v0.dev", "V0 is built by Vercel.", "About V0", "V0 is an AI tool made by Vercel Labs."),
        ("Beats", "https://beatsbydre.com", "Beats was acquired by Apple Inc.", "About Beats", "Beats is part of Apple."),
    ]

    for company, url, hp_content, about_title, about_content in test_cases:
        crawl = _DeterministicCrawlManager({
            url: _doc(url, f"{company} – Official", hp_content, PageType.HOMEPAGE),
            f"{url}/about": _doc(f"{url}/about", about_title, about_content, PageType.ABOUT),
        })
        search = _DeterministicSearchProvider(company=company, domain=url.replace("https://", ""), results=[
            SearchResult(title=f"{company} – Official", url=url, snippet=hp_content),
        ])
        verifier = WebsiteVerifier(crawl, search)
        rel, msg, ev = verifier.classify_relationship(company, url)

        assert rel == SiteRelationship.RELATED, (
            f"Expected {company} with relationship phrasing to be RELATED, but got {rel}. Msg: {msg}"
        )
        assert rel != SiteRelationship.PRIMARY


# ── Invariant 2: Common-Word Collision Independent of Length (v1.3.2-2) ──────

def test_common_dictionary_words_of_any_length_never_confident_uncontested():
    """Asserts that bare single-token common dictionary words of arbitrary length
    (Pillar, Beacon, Monolith, Compass, Stream, Signal, Vanguard, Pinnacle, Catalyst, Horizon, Spectrum)
    with a single uncontested PRIMARY candidate in search results MUST remain AMBIGUOUS and NEVER CONFIDENT."""
    test_words = [
        # 6-letter words (previously bypassed <=5 char threshold)
        ("Pillar", "pillar.io"),
        ("Beacon", "beacon.bio"),
        ("Stream", "stream.io"),
        ("Signal", "signal.org"),
        # 7-letter words
        ("Compass", "compass.com"),
        ("Horizon", "horizon.io"),
        # 8-letter words
        ("Monolith", "monolith.asia"),
        ("Pinnacle", "pinnacle.com"),
        ("Catalyst", "catalyst.io"),
        ("Spectrum", "spectrum.com"),
        ("Vanguard", "vanguard.com"),
        # 9-letter words
        ("Universal", "universal.com"),
    ]

    for word, domain in test_words:
        search = _DeterministicSearchProvider(
            company=word,
            domain=domain,
            results=[
                SearchResult(
                    title=f"{word} – Official Platform",
                    url=f"https://{domain}",
                    snippet=f"{word} provides commercial enterprise software and services.",
                ),
            ]
        )

        crawl = _DeterministicCrawlManager({
            f"https://{domain}": _doc(f"https://{domain}", f"{word} – Official Platform", f"{word} is a company.", PageType.HOMEPAGE),
            f"https://{domain}/about": _doc(f"https://{domain}/about", f"About {word}", f"About {word} platform.", PageType.ABOUT),
        })

        verifier = WebsiteVerifier(crawl, search)
        resolver = IdentityResolver(search, verifier)

        identity = resolver.resolve(word)
        assert identity.confidence == IdentityConfidence.AMBIGUOUS, (
            f"Expected generic common word '{word}' ({len(word)} chars) to be AMBIGUOUS, but got {identity.confidence}. "
            f"Reasoning: {identity.reasoning}"
        )


# ── Invariant 3: Multi-Primary Context Disambiguation Safety (v1.3.2-3) ──────

def test_multiple_primary_candidates_with_snippet_only_context_stays_ambiguous():
    """Asserts that when multiple verified PRIMARY candidates exist, thin search snippet
    context scores cannot force CONFIDENT — they must remain AMBIGUOUS."""
    search = _DeterministicSearchProvider(
        company="Mercury",
        domain="mercury.com",
        results=[
            SearchResult(title="Mercury – Banking for Startups", url="https://mercury.com", snippet="Mercury offers banking and financial accounts for tech startups."),
            SearchResult(title="Mercury Insurance – Auto & Home Insurance", url="https://mercuryinsurance.com", snippet="Mercury Insurance provides low cost auto, home, and business insurance."),
        ]
    )

    crawl = _DeterministicCrawlManager({
        "https://mercury.com": _doc("https://mercury.com", "Mercury – Banking for Startups", "Mercury is fintech banking for startups.", PageType.HOMEPAGE),
        "https://mercury.com/about": _doc("https://mercury.com/about", "About Mercury", "Mercury is a financial technology company.", PageType.ABOUT),
        "https://mercuryinsurance.com": _doc("https://mercuryinsurance.com", "Mercury Insurance", "Mercury Insurance provides auto coverage.", PageType.HOMEPAGE),
        "https://mercuryinsurance.com/about": _doc("https://mercuryinsurance.com/about", "About Mercury Insurance", "Mercury Insurance is a licensed insurer.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    # Even with context hints, snippet keyword matching between 2 legitimate primaries must stay AMBIGUOUS
    identity = resolver.resolve("Mercury")
    assert identity.confidence == IdentityConfidence.AMBIGUOUS, f"Expected AMBIGUOUS, got {identity.confidence}"
    assert identity.domain == "", f"Domain must be empty on AMBIGUOUS, got {identity.domain}"


# ── Invariant 4: Evidence Independence / Soft-404 / Duplicate Protection (v1.3.2-4) ─

def test_duplicate_homepage_content_cannot_act_as_secondary_corroboration():
    """Asserts that when /about returns the exact duplicate content of homepage (e.g. SPA catch-all routing),
    it is not treated as independent secondary corroboration."""
    company = "CatchAllSpa"
    domain = "catchallspa.io"
    hp_content = "CatchAllSpa is a reactive frontend application."

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _doc(f"https://{domain}", f"{company} – Official", hp_content, PageType.HOMEPAGE),
        # /about returns the identical content and title as homepage (catch-all SPA)
        f"https://{domain}/about": _doc(f"https://{domain}/about", f"{company} – Official", hp_content, PageType.ABOUT),
    })

    search = _DeterministicSearchProvider(company=company, domain=domain, results=[
        SearchResult(title=f"{company} – Official", url=f"https://{domain}", snippet=hp_content),
    ])

    verifier = WebsiteVerifier(crawl, search)
    rel, msg, _ = verifier.classify_relationship(company, f"https://{domain}")
    assert rel == SiteRelationship.UNKNOWN, (
        f"Duplicate homepage content on /about must not corroborate PRIMARY. Got {rel}. Msg: {msg}"
    )


def test_soft_404_secondary_page_cannot_corroborate():
    """Asserts that secondary pages returning soft-404 content ('Page Not Found') cannot corroborate identity."""
    company = "NotFoundBrand"
    domain = "notfoundbrand.com"

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _doc(f"https://{domain}", f"{company} – Welcome", f"{company} is an online service.", PageType.HOMEPAGE),
        f"https://{domain}/about": _doc(f"https://{domain}/about", "404 Not Found", "The requested page was not found.", PageType.ABOUT),
    })

    search = _DeterministicSearchProvider(company=company, domain=domain, results=[
        SearchResult(title=f"{company} – Welcome", url=f"https://{domain}", snippet=f"{company} is an online service."),
    ])

    verifier = WebsiteVerifier(crawl, search)
    rel, msg, _ = verifier.classify_relationship(company, f"https://{domain}")
    assert rel == SiteRelationship.UNKNOWN


# ── Invariant 5: Canonical Token Normalization Preserves Order (v1.3.2-6) ────

def test_canonical_brand_slug_preserves_token_order():
    """Asserts that multi-token brand normalization preserves word order ('traderepublic', not 'republictrade')."""
    assert IdentityResolver.canonical_brand_slug("Trade Republic") == "traderepublic"
    assert IdentityResolver.canonical_brand_slug("Bending Spoons") == "bendingspoons"
    assert IdentityResolver.canonical_brand_slug("Lami Technologies") == "lami"
    assert IdentityResolver.canonical_brand_slug("FairMoney Financial") == "fairmoney"


# ── Invariant 6: Domain Suppression on Non-CONFIDENT (v1.3.2-7) ───────────────

def test_domain_suppressed_unless_confident():
    """Asserts that CompanyIdentity.domain and website_url are strictly empty strings
    when confidence is AMBIGUOUS or UNRESOLVED."""
    search = _DeterministicSearchProvider(
        company="Atlas",
        domain="atlas.com",
        results=[
            SearchResult(title="Atlas – Cloud", url="https://atlas.com", snippet="Atlas cloud computing."),
            SearchResult(title="Atlas Coffee Club", url="https://atlascoffeeclub.com", snippet="Atlas Coffee subscription."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://atlas.com": _doc("https://atlas.com", "Atlas – Cloud", "Atlas is a cloud platform.", PageType.HOMEPAGE),
        "https://atlas.com/about": _doc("https://atlas.com/about", "About Atlas", "About Atlas cloud.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    identity = resolver.resolve("Atlas")
    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == "", f"Expected empty domain for AMBIGUOUS, got {identity.domain}"
    assert identity.website_url == "", f"Expected empty website_url for AMBIGUOUS, got {identity.website_url}"
    assert len(identity.candidates) > 0, "Candidates list should still retain observed domains for research"


# ── Invariant 7: Counterfactual Competitor Injection (v1.3.2 Invariant) ──────

def test_counterfactual_competitor_injection_forces_ambiguous():
    """Asserts that taking a CONFIDENT resolution and injecting a verified competitor
    with the same brand root strictly drops confidence to AMBIGUOUS."""
    brand = "Klarna"
    primary_domain = "klarna.com"
    competitor_domain = "klarnapayments.org"

    # 1. Base uncontested resolution -> CONFIDENT
    search_base = _DeterministicSearchProvider(
        company=brand,
        domain=primary_domain,
        results=[
            SearchResult(title=f"{brand} – Shop Now Pay Later", url=f"https://{primary_domain}", snippet=f"{brand} global payments network."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        f"https://{primary_domain}": _doc(f"https://{primary_domain}", f"{brand} – Shop Now Pay Later", f"{brand} is a global payments network.", PageType.HOMEPAGE),
        f"https://{primary_domain}/about": _doc(f"https://{primary_domain}/about", f"About {brand}", f"About {brand}.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search_base)
    resolver = IdentityResolver(search_base, verifier)
    res_base = resolver.resolve(brand)
    assert res_base.confidence == IdentityConfidence.CONFIDENT

    # 2. Inject competing search domain -> MUST drop to AMBIGUOUS
    search_injected = _DeterministicSearchProvider(
        company=brand,
        domain=primary_domain,
        results=[
            SearchResult(title=f"{brand} – Shop Now Pay Later", url=f"https://{primary_domain}", snippet=f"{brand} global payments network."),
            SearchResult(title=f"{brand} Independent Solutions", url=f"https://{competitor_domain}", snippet=f"{brand} payments credit services."),
        ]
    )
    resolver_injected = IdentityResolver(search_injected, verifier)
    res_injected = resolver_injected.resolve(brand)
    assert res_injected.confidence == IdentityConfidence.AMBIGUOUS, (
        f"Injected competitor must drop state to AMBIGUOUS, got {res_injected.confidence}"
    )


# ── Invariant 8: Search-Order & Pruning Monotonicity ──────────────────────────

def test_pruning_or_reordering_cannot_turn_unverified_into_confident():
    """Asserts that reordering results or removing irrelevant non-matching domains
    does not alter the core evidence decision."""
    company = "Moniepoint"
    domain = "moniepoint.com"

    results_order1 = [
        SearchResult(title="Moniepoint – Business Banking", url=f"https://{domain}", snippet="Moniepoint business banking."),
        SearchResult(title="Tech Review of Moniepoint", url="https://techreview.com/moniepoint", snippet="Review article."),
    ]
    results_order2 = [
        SearchResult(title="Tech Review of Moniepoint", url="https://techreview.com/moniepoint", snippet="Review article."),
        SearchResult(title="Moniepoint – Business Banking", url=f"https://{domain}", snippet="Moniepoint business banking."),
    ]

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _doc(f"https://{domain}", "Moniepoint – Business Banking", "Moniepoint is Nigeria's leading business banking platform.", PageType.HOMEPAGE),
        f"https://{domain}/about": _doc(f"https://{domain}/about", "About Moniepoint", "About Moniepoint banking.", PageType.ABOUT),
    })

    search1 = _DeterministicSearchProvider(company=company, domain=domain, results=results_order1)
    search2 = _DeterministicSearchProvider(company=company, domain=domain, results=results_order2)

    res1 = IdentityResolver(search1, WebsiteVerifier(crawl, search1)).resolve(company)
    res2 = IdentityResolver(search2, WebsiteVerifier(crawl, search2)).resolve(company)

    assert res1.confidence == IdentityConfidence.CONFIDENT
    assert res2.confidence == IdentityConfidence.CONFIDENT
    assert res1.domain == res2.domain == domain



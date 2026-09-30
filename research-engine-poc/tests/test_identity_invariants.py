"""
tests/test_identity_invariants.py — Formal Safety Invariant Property Tests (v1.3.2)

Comprehensive structural adversarial gate covering the 10 core safety invariants:
1. Relationship precedence over sentence self-ID
2. Common-word collision independent of length (short & long dictionary words -> AMBIGUOUS)
3. Single coined brand distinctiveness -> CONFIDENT
4. Multi-token distinctive phrase resolution -> CONFIDENT
5. Search dominance / competing brand domains -> AMBIGUOUS
6. Subdomain of same registrable root != competing entity
7. Evidence independence (soft-404 / catch-all duplicate homepage rejected)
8. Indexed fallback provenance and epistemic cap (bot-blocked fallback capped at AMBIGUOUS)
9. Indexed fallback route filtering (blogs / careers / jobs rejected for corroboration)
10. Canonical token and domain normalization (order-preserving)
11. Resolver target suppression (domain="" and website_url="" on non-CONFIDENT)
12. Counterfactual competitor injection
13. Search-order and pruning monotonicity
14. Fail-closed lexicon loading (RuntimeError on missing/empty lexicon)
15. Strict UNSAFE_CONFIDENT metric evaluation
"""

import pytest
import os
from unittest.mock import patch
from datetime import datetime, timezone
from typing import List, Dict, Optional, Set

from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityCandidate, IdentityEvidence,
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType, EvidenceType,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from identity.lexicon import is_dictionary_word, has_low_lexical_collision_risk, _get_dictionary
import identity.lexicon as lexicon_module
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


# ── Invariant 1: Relationship Precedence (v1.3.2-1) ───────────────────────────

def test_subordinate_relationship_precedence_over_sentence_self_id():
    """Phrases like 'Foo is a product of Bar' or 'Foo is a subsidiary of Bar'
    must be classified as RELATED (or LEGACY), NEVER PRIMARY."""
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

        assert rel in (SiteRelationship.RELATED, SiteRelationship.LEGACY), (
            f"Expected {company} with subordinate phrasing to be RELATED/LEGACY, got {rel}. Msg: {msg}"
        )
        assert rel != SiteRelationship.PRIMARY


# ── Invariant 2: Common-Word Collision Independent of Length (v1.3.2-2) ──────

def test_common_dictionary_words_of_any_length_never_confident_uncontested():
    """Bare single-token common dictionary words of arbitrary length
    (Pillar, Beacon, Monolith, Compass, Stream, Signal, Vanguard, Pinnacle, Catalyst, Horizon, Spectrum)
    with a single uncontested PRIMARY candidate in search results MUST remain AMBIGUOUS and NEVER CONFIDENT."""
    test_words = [
        # <=5 chars
        ("Haven", "haven.com"),
        ("Flock", "flock.com"),
        ("Loom", "loom.com"),
        # 6-letter words
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
        assert identity.domain == ""


# ── Invariant 3: Single Coined Word Resolves to CONFIDENT ─────────────────────

def test_single_coined_distinctive_word_resolves_to_confident():
    """Single coined non-dictionary brand names (e.g. Klarna, Supabase, Vercel, Retool, Moniepoint)
    with uncontested PRIMARY candidates must resolve to CONFIDENT."""
    coined_cases = [
        ("Klarna", "klarna.com", "Klarna provides buy-now-pay-later shopping services."),
        ("Supabase", "supabase.com", "Supabase is an open-source Firebase alternative."),
        ("Vercel", "vercel.com", "Vercel is the platform for frontend developers."),
        ("Retool", "retool.com", "Retool is the fast way to build internal tools."),
        ("Moniepoint", "moniepoint.com", "Moniepoint powers banking for modern businesses."),
    ]

    for brand, domain, desc in coined_cases:
        search = _DeterministicSearchProvider(
            company=brand,
            domain=domain,
            results=[
                SearchResult(title=f"{brand} – Official", url=f"https://{domain}", snippet=desc),
            ]
        )
        crawl = _DeterministicCrawlManager({
            f"https://{domain}": _doc(f"https://{domain}", f"{brand} – Official", f"{brand} {desc}", PageType.HOMEPAGE),
            f"https://{domain}/about": _doc(f"https://{domain}/about", f"About {brand}", f"About {brand}: {desc}", PageType.ABOUT),
        })

        verifier = WebsiteVerifier(crawl, search)
        resolver = IdentityResolver(search, verifier)

        identity = resolver.resolve(brand)
        assert identity.confidence == IdentityConfidence.CONFIDENT, (
            f"Expected coined brand '{brand}' to be CONFIDENT, but got {identity.confidence}. Reasoning: {identity.reasoning}"
        )
        assert identity.domain == domain


# ── Invariant 4: Multi-Token Distinctive Phrase Resolves to CONFIDENT ─────────

def test_multi_token_distinctive_phrase_resolves_to_confident():
    """Distinctive multi-token queries with exact primary match must resolve to CONFIDENT."""
    multi_cases = [
        ("Trade Republic", "traderepublic.com", "Trade Republic is Europe's largest savings platform."),
        ("Bending Spoons", "bendingspoons.com", "Bending Spoons develops digital creative tools."),
        ("Moove Mobility", "moove.io", "Moove Mobility democratizes vehicle ownership in emerging markets."),
        ("GitLab Engineering", "gitlab.com", "GitLab Engineering provides DevSecOps automation."),
    ]

    for brand, domain, desc in multi_cases:
        search = _DeterministicSearchProvider(
            company=brand,
            domain=domain,
            results=[
                SearchResult(title=f"{brand} – Official", url=f"https://{domain}", snippet=desc),
            ]
        )
        crawl = _DeterministicCrawlManager({
            f"https://{domain}": _doc(f"https://{domain}", f"{brand} – Official", f"{brand} {desc}", PageType.HOMEPAGE),
            f"https://{domain}/about": _doc(f"https://{domain}/about", f"About {brand}", f"About {brand}: {desc}", PageType.ABOUT),
        })

        verifier = WebsiteVerifier(crawl, search)
        resolver = IdentityResolver(search, verifier)

        identity = resolver.resolve(brand)
        assert identity.confidence == IdentityConfidence.CONFIDENT, (
            f"Expected multi-token brand '{brand}' to be CONFIDENT, but got {identity.confidence}. Reasoning: {identity.reasoning}"
        )
        assert identity.domain == domain


# ── Invariant 5: Competing Brand Domains Force AMBIGUOUS ───────────────────────

def test_competing_brand_domains_in_search_force_ambiguous():
    """When multiple independent domains appear for a brand in top search results,
    resolution must drop to AMBIGUOUS for disambiguation."""
    search = _DeterministicSearchProvider(
        company="Stripe",
        domain="stripe.com",
        results=[
            SearchResult(title="Stripe – Financial Infrastructure", url="https://stripe.com", snippet="Stripe payments platform."),
            SearchResult(title="Stripe Developer IDE", url="https://stripedev.io", snippet="Stripe code editor."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://stripe.com": _doc("https://stripe.com", "Stripe – Financial Infrastructure", "Stripe is payments.", PageType.HOMEPAGE),
        "https://stripe.com/about": _doc("https://stripe.com/about", "About Stripe", "About Stripe payments.", PageType.ABOUT),
        "https://stripedev.io": _doc("https://stripedev.io", "Stripe Developer IDE", "Stripe IDE for developers.", PageType.HOMEPAGE),
        "https://stripedev.io/about": _doc("https://stripedev.io/about", "About Stripe IDE", "Stripe developer editor.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    identity = resolver.resolve("Stripe")
    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""


# ── Invariant 6: Subdomains Belonging to Same Registrable Root Are Not Competitors ──

def test_subdomains_of_same_root_do_not_trigger_competing_collision():
    """Subdomains of the same primary entity (e.g. docs.klarna.com, app.klarna.com)
    are recognized as the same entity and do not trigger false competing collisions."""
    brand = "Klarna"
    domain = "klarna.com"
    search = _DeterministicSearchProvider(
        company=brand,
        domain=domain,
        results=[
            SearchResult(title=f"{brand} – Official", url=f"https://{domain}", snippet="Klarna payments network."),
            SearchResult(title=f"{brand} Documentation", url=f"https://docs.{domain}", snippet="Klarna developer docs."),
            SearchResult(title=f"{brand} App Portal", url=f"https://app.{domain}", snippet="Klarna customer portal."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _doc(f"https://{domain}", f"{brand} – Official", f"{brand} payments.", PageType.HOMEPAGE),
        f"https://{domain}/about": _doc(f"https://{domain}/about", f"About {brand}", f"About {brand}.", PageType.ABOUT),
        f"https://docs.{domain}": _doc(f"https://docs.{domain}", f"{brand} Docs", f"Docs for {brand}.", PageType.OTHER),
        f"https://app.{domain}": _doc(f"https://app.{domain}", f"{brand} Portal", f"Portal for {brand}.", PageType.OTHER),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    identity = resolver.resolve(brand)
    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain


# ── Invariant 7: Soft-404 and Catch-All Duplicate Protection ───────────────────

def test_duplicate_homepage_content_cannot_act_as_secondary_corroboration():
    """When /about returns identical content to homepage (catch-all SPA routing),
    it is rejected as independent secondary corroboration."""
    company = "CatchAllSpa"
    domain = "catchallspa.io"
    hp_content = "CatchAllSpa is a reactive frontend application."

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _doc(f"https://{domain}", f"{company} – Official", hp_content, PageType.HOMEPAGE),
        f"https://{domain}/about": _doc(f"https://{domain}/about", f"{company} – Official", hp_content, PageType.ABOUT),
    })

    search = _DeterministicSearchProvider(company=company, domain=domain, results=[
        SearchResult(title=f"{company} – Official", url=f"https://{domain}", snippet=hp_content),
    ])

    verifier = WebsiteVerifier(crawl, search)
    rel, msg, _ = verifier.classify_relationship(company, f"https://{domain}")
    assert rel == SiteRelationship.UNKNOWN


def test_soft_404_secondary_page_cannot_corroborate():
    """Secondary pages returning soft-404 content ('Page Not Found') cannot corroborate identity."""
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


# ── Invariant 8: Indexed Fallback Provenance & Epistemic Cap (v1.3.2 Track 2) ──

def test_indexed_fallback_provenance_and_epistemic_cap():
    """Bot-blocked homepages that verify via search-indexed fallback:
    1. Emit EvidenceType.FALLBACK_INDEXED
    2. Establish a verified PRIMARY candidate
    3. Are strictly CAPPED at AMBIGUOUS by the resolver (never CONFIDENT on index alone)."""
    company = "Docplanner Global"
    domain = "docplanner.com"

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _blocked_doc(f"https://{domain}"),
        f"https://{domain}/about": _blocked_doc(f"https://{domain}/about"),
    })

    search = _DeterministicSearchProvider(
        company=company,
        domain=domain,
        results=[
            SearchResult(title="Docplanner Global – Healthcare Booking", url=f"https://{domain}", snippet="Docplanner Global connects patients with healthcare specialists."),
            SearchResult(title="About Docplanner Global", url=f"https://{domain}/about", snippet="Learn about Docplanner Global and our medical booking platform."),
        ]
    )

    verifier = WebsiteVerifier(crawl, search)
    rel, msg, ev = verifier.classify_relationship(company, f"https://{domain}")

    # Verifier establishes PRIMARY via indexed fallback
    assert rel == SiteRelationship.PRIMARY
    assert any(e.type == EvidenceType.FALLBACK_INDEXED for e in ev)
    assert not any(e.type == EvidenceType.SELF_IDENTITY and e.source == "homepage" for e in ev)

    # Resolver evaluates the candidate and enforces the epistemic cap -> AMBIGUOUS
    resolver = IdentityResolver(search, verifier)
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS, (
        f"Indexed-only fallback MUST be capped at AMBIGUOUS, but got {identity.confidence}. Reasoning: {identity.reasoning}"
    )
    assert identity.domain == "", "Domain must be suppressed on AMBIGUOUS"
    assert "search-indexed fallback" in identity.reasoning


# ── Invariant 9: Indexed Fallback Route Filtering (Blogs/Jobs Rejected) ──────

def test_indexed_fallback_rejects_blog_and_job_routes():
    """Search-indexed fallback must reject blog posts, articles, and job listings
    from acting as secondary corroboration."""
    company = "BlockedBrand"
    domain = "blockedbrand.com"

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _blocked_doc(f"https://{domain}"),
        f"https://{domain}/blog/hiring": _blocked_doc(f"https://{domain}/blog/hiring"),
    })

    search = _DeterministicSearchProvider(
        company=company,
        domain=domain,
        results=[
            SearchResult(title="BlockedBrand Official", url=f"https://{domain}", snippet="BlockedBrand is an online platform."),
            # Blog route only
            SearchResult(title="BlockedBrand Blog: Why We Are Hiring Engineers", url=f"https://{domain}/blog/hiring", snippet="Article about BlockedBrand culture."),
        ]
    )

    verifier = WebsiteVerifier(crawl, search)
    rel, msg, _ = verifier.classify_relationship(company, f"https://{domain}")

    assert rel == SiteRelationship.UNKNOWN, (
        f"Indexed fallback must not corroborate on blog route. Got {rel}. Msg: {msg}"
    )


# ── Invariant 10: Canonical Token Normalization Preserves Order (v1.3.2-6) ────

def test_canonical_brand_slug_preserves_token_order():
    """Multi-token brand normalization must preserve token sequence ('traderepublic', not 'republictrade')."""
    assert IdentityResolver.canonical_brand_slug("Trade Republic") == "traderepublic"
    assert IdentityResolver.canonical_brand_slug("Bending Spoons") == "bendingspoons"
    assert IdentityResolver.canonical_brand_slug("Lami Technologies") == "lami"
    assert IdentityResolver.canonical_brand_slug("FairMoney Financial") == "fairmoney"


# ── Invariant 11: Domain Suppression on Non-CONFIDENT (v1.3.2-7) ──────────────

def test_domain_suppressed_unless_confident():
    """CompanyIdentity.domain and website_url must be strictly empty strings
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


# ── Invariant 12: Counterfactual Competitor Injection ─────────────────────────

def test_counterfactual_competitor_injection_forces_ambiguous():
    """Injecting a verified competitor with the same brand root strictly drops confidence to AMBIGUOUS."""
    brand = "Klarna"
    primary_domain = "klarna.com"
    competitor_domain = "klarnapayments.org"

    # Base uncontested resolution -> CONFIDENT
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

    # Inject competing search domain -> MUST drop to AMBIGUOUS
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


# ── Invariant 13: Search-Order & Pruning Monotonicity ─────────────────────────

def test_pruning_or_reordering_cannot_turn_unverified_into_confident():
    """Reordering results or adding non-matching noise results does not alter verified outcome."""
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


# ── Invariant 14: Fail-Closed Lexicon Loading ─────────────────────────────────

def test_lexicon_fails_closed_on_missing_or_empty_corpus():
    """The lexicon module must fail fast with a RuntimeError/FileNotFoundError if
    common_english_words.txt is missing or empty, with NO silent hardcoded fallbacks."""
    # Reset cached dictionary set
    lexicon_module._DICTIONARY_SET = None

    with patch("pathlib.Path.is_file", return_value=False):
        with pytest.raises((FileNotFoundError, RuntimeError)) as excinfo:
            lexicon_module._get_dictionary()
        assert "missing" in str(excinfo.value).lower()

    lexicon_module._DICTIONARY_SET = None
    with patch("builtins.open", side_effect=IOError("Permission denied")):
        with pytest.raises(RuntimeError) as excinfo:
            lexicon_module._get_dictionary()
        assert "failed to load" in str(excinfo.value).lower()

    # Restore lexicon
    lexicon_module._DICTIONARY_SET = None
    valid_dict = lexicon_module._get_dictionary()
    assert len(valid_dict) > 10000


# ── Invariant 15: UNSAFE_CONFIDENT Metric Calculation Formula ─────────────────

def test_unsafe_confident_metric_formal_invariant():
    """Verifies that UNSAFE_CONFIDENT(case) is strictly True iff:
    predicted_state == CONFIDENT and (expected_state != CONFIDENT or predicted_domain not in accepted_domains)."""
    def is_unsafe_confident(pred_state: IdentityConfidence, pred_domain: str, exp_state: IdentityConfidence, accepted_domains: Set[str]) -> bool:
        return (pred_state == IdentityConfidence.CONFIDENT) and (
            exp_state != IdentityConfidence.CONFIDENT or pred_domain not in accepted_domains
        )

    # 1. Correct Confident
    assert not is_unsafe_confident(IdentityConfidence.CONFIDENT, "stripe.com", IdentityConfidence.CONFIDENT, {"stripe.com"})

    # 2. False Confident on Ambiguous ground truth
    assert is_unsafe_confident(IdentityConfidence.CONFIDENT, "pillar.io", IdentityConfidence.AMBIGUOUS, set())

    # 3. False Confident on Unresolved ground truth
    assert is_unsafe_confident(IdentityConfidence.CONFIDENT, "linear.vc", IdentityConfidence.UNRESOLVED, set())

    # 4. Wrong domain on Confident ground truth
    assert is_unsafe_confident(IdentityConfidence.CONFIDENT, "pennylane.com", IdentityConfidence.CONFIDENT, {"pennylane.fr"})

    # 5. Safe Ambiguous / Unresolved
    assert not is_unsafe_confident(IdentityConfidence.AMBIGUOUS, "", IdentityConfidence.CONFIDENT, {"stripe.com"})
    assert not is_unsafe_confident(IdentityConfidence.AMBIGUOUS, "", IdentityConfidence.AMBIGUOUS, set())
    assert not is_unsafe_confident(IdentityConfidence.UNRESOLVED, "", IdentityConfidence.UNRESOLVED, set())

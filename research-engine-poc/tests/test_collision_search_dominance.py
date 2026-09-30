"""
tests/test_collision_search_dominance.py — Unit test suite for Lexical & Collision Search-Dominance Arbitration (Track 3 Refinement)
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


def test_bare_dictionary_word_single_search_result_stays_ambiguous():
    """Tests that a single-word generic dictionary term (e.g. Pillar, Beacon, Kite, Loom, Monolith)
    stays AMBIGUOUS even if search happens to return only one domain."""
    for word, domain in [
        ("Pillar", "pillar.io"),
        ("Beacon", "beacon.bio"),
        ("Monolith", "monolith.asia"),
        ("Kite", "kite.com"),
        ("Loom", "loom.com"),
        ("Summit", "summit.co"),
        ("Apex", "apex.ai"),
    ]:
        search = _DeterministicSearchProvider(
            company=word,
            domain=domain,
            results=[
                SearchResult(
                    title=f"{word} – Official Platform",
                    url=f"https://{domain}",
                    snippet=f"{word} provides commercial services.",
                ),
            ]
        )

        crawl = _DeterministicCrawlManager({
            f"https://{domain}": _valid_doc(f"https://{domain}", f"{word} – Official Platform", f"{word} is a company.", PageType.HOMEPAGE),
            f"https://{domain}/about": _valid_doc(f"https://{domain}/about", f"About {word}", f"About {word} platform.", PageType.ABOUT),
        })

        verifier = WebsiteVerifier(crawl, search)
        resolver = IdentityResolver(search, verifier)

        identity = resolver.resolve(word)
        assert identity.confidence == IdentityConfidence.AMBIGUOUS, f"Expected {word} to be AMBIGUOUS, but got {identity.confidence} (Domain: {identity.domain})"
        assert identity.domain == domain


def test_bare_dictionary_word_multi_domain_collision_stays_ambiguous():
    """Tests that a generic dictionary word with competing candidate domains in search results stays AMBIGUOUS."""
    word = "Pillar"
    search = _DeterministicSearchProvider(
        company=word,
        domain="pillar.io",
        results=[
            SearchResult(title="Pillar Spokes & Nipples", url="https://pillarspoke.com", snippet="Pillar bicycle spokes."),
            SearchResult(title="Pillar College", url="https://pillar.edu", snippet="Pillar undergraduate education."),
            SearchResult(title="Pillar – Link in Bio", url="https://pillar.io", snippet="Pillar creator monetization platform."),
            SearchResult(title="Pillar VC", url="https://pillar.vc", snippet="Pillar venture capital investing in technical breakthroughs."),
        ]
    )

    crawl = _DeterministicCrawlManager({
        "https://pillar.io": _valid_doc("https://pillar.io", "Pillar – Link in Bio", "Pillar lets creators monetize their audience.", PageType.HOMEPAGE),
        "https://pillar.io/about": _valid_doc("https://pillar.io/about", "About Pillar", "About Pillar creator tools.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    identity = resolver.resolve(word)
    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert any(k in identity.reasoning.lower() for k in ("shape-risk", "collision", "dictionary", "conflicting"))


def test_coined_single_word_brand_uncontested_promoted_to_confident():
    """Tests that coined / neologism brands (Adyen, Yoco, Qonto, Kasha, Mambu, Swile, Wasoko)
    with exact domain and uncontested corroboration are safely promoted to CONFIDENT."""
    for brand, domain in [
        ("Adyen", "adyen.com"),
        ("Yoco", "yoco.com"),
        ("Qonto", "qonto.com"),
        ("Mambu", "mambu.com"),
        ("Swile", "swile.co"),
        ("Wasoko", "wasoko.com"),
    ]:
        search = _DeterministicSearchProvider(
            company=brand,
            domain=domain,
            results=[
                SearchResult(
                    title=f"{brand} – Leading Global Technology",
                    url=f"https://{domain}",
                    snippet=f"{brand} is a modern enterprise technology company.",
                ),
            ]
        )

        crawl = _DeterministicCrawlManager({
            f"https://{domain}": _valid_doc(f"https://{domain}", f"{brand} – Leading Global Technology", f"{brand} builds products.", PageType.HOMEPAGE),
            f"https://{domain}/about": _valid_doc(f"https://{domain}/about", f"About {brand}", f"About {brand} enterprise.", PageType.ABOUT),
        })

        verifier = WebsiteVerifier(crawl, search)
        resolver = IdentityResolver(search, verifier)

        identity = resolver.resolve(brand)
        assert identity.confidence == IdentityConfidence.CONFIDENT, f"Expected {brand} to be CONFIDENT, but got {identity.confidence}"
        assert identity.domain == domain


def test_multi_token_distinctive_name_promoted_to_confident():
    """Tests that multi-token distinctive corporate names (Trade Republic, Bending Spoons, Cowrywise Financial)
    have low shape risk and resolve to CONFIDENT."""
    for company, domain in [
        ("Trade Republic", "traderepublic.com"),
        ("Bending Spoons", "bendingspoons.com"),
        ("Lami Technologies", "lami.world"),
    ]:
        search = _DeterministicSearchProvider(
            company=company,
            domain=domain,
            results=[
                SearchResult(
                    title=f"{company} – Official Platform",
                    url=f"https://{domain}",
                    snippet=f"{company} official corporate portal.",
                ),
            ]
        )

        crawl = _DeterministicCrawlManager({
            f"https://{domain}": _valid_doc(f"https://{domain}", f"{company} – Official Platform", f"{company} is a business.", PageType.HOMEPAGE),
            f"https://{domain}/about": _valid_doc(f"https://{domain}/about", f"About {company}", f"About {company}.", PageType.ABOUT),
        })

        verifier = WebsiteVerifier(crawl, search)
        resolver = IdentityResolver(search, verifier)

        identity = resolver.resolve(company)
        assert identity.confidence == IdentityConfidence.CONFIDENT
        assert identity.domain == domain


def test_competing_domains_in_search_prevents_confident_promotion():
    """Tests that if search results contain competing domains for different entities under the same name,
    promotion to CONFIDENT is prevented (AMBIGUOUS)."""
    company = "Pennylane"
    search = _DeterministicSearchProvider(
        company=company,
        domain="pennylane.ai",
        results=[
            SearchResult(title="PennyLane – Quantum Programming", url="https://pennylane.ai", snippet="PennyLane is an open source quantum computing library."),
            SearchResult(title="Penny Lane Centers – Child & Family Support", url="https://pennylane.org", snippet="Penny Lane Centers is a 501(c)(3) nonprofit charity organization."),
        ]
    )

    crawl = _DeterministicCrawlManager({
        "https://pennylane.ai": _valid_doc("https://pennylane.ai", "PennyLane – Quantum Programming", "PennyLane quantum library.", PageType.HOMEPAGE),
        "https://pennylane.ai/about": _valid_doc("https://pennylane.ai/about", "About PennyLane", "About PennyLane quantum software.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    identity = resolver.resolve(company)
    assert identity.confidence == IdentityConfidence.AMBIGUOUS

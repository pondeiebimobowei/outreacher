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


def test_bare_dictionary_word_collision_distribution_stays_ambiguous():
    """Tests that generic dictionary collision words with realistic competing candidate
    domains in search results stay AMBIGUOUS, covering the validation failure family
    and an extensive set of unseen common English nouns/verbs."""
    generic_collision_fixtures = [
        # Validation failure family
        ("Pillar", "pillar.io", "pillarspoke.com"),
        ("Beacon", "beacon.bio", "beaconbank.com"),
        ("Monolith", "monolith.asia", "monolithsrl.com"),
        ("Kite", "kite.com", "kitepharma.com"),
        ("Loom", "loom.com", "rainbowloom.com"),
        ("Summit", "summit.co", "summithealth.com"),
        ("Apex", "apex.ai", "apexclearing.com"),
        ("Mercury", "mercury.com", "mercuryinsurance.com"),
        ("Atlas", "atlas.com", "atlascoffee.com"),
        # Fresh unseen generic English collision words
        ("Anchor", "anchor.fm", "anchorbaking.com"),
        ("Bridge", "bridge.xyz", "bridgelogistics.com"),
        ("Forge", "forge.io", "forgeglobal.com"),
        ("Haven", "haven.com", "havenhealth.org"),
        ("Trace", "trace.ai", "tracesoftware.com"),
        ("Zenith", "zenith.org", "zenithbank.com"),
        ("Compass", "compass.com", "compasshealth.org"),
        ("Catalyst", "catalyst.io", "catalystpharma.com"),
        ("Flock", "flock.com", "flocksafety.com"),
        ("Roost", "roost.com", "roostsensors.com"),
        ("Nest", "nest.io", "nestbedding.com"),
        ("Hive", "hive.com", "hivesmarthome.com"),
        ("Grove", "grove.co", "grovecollaborative.com"),
        ("Drift", "drift.com", "driftpayments.com"),
        ("Bench", "bench.co", "benchaccounting.com"),
        ("Slate", "slate.com", "slatemagazine.com"),
        ("Verve", "verve.com", "vervecard.com"),
        ("Prism", "prism.io", "prismhealth.org"),
        ("Orbit", "orbit.love", "orbitirrigation.com"),
        ("Signal", "signal.org", "signalai.com"),
        ("Stream", "stream.io", "streamenergy.com"),
        ("Echo", "echo.com", "echologistics.com"),
        ("Spire", "spire.com", "spiresatellites.com"),
        ("Vault", "vault.com", "vaulthashicorp.com"),
    ]

    for word, primary_domain, competing_domain in generic_collision_fixtures:
        search = _DeterministicSearchProvider(
            company=word,
            domain=primary_domain,
            results=[
                SearchResult(
                    title=f"{word} – Official Platform",
                    url=f"https://{primary_domain}",
                    snippet=f"{word} provides commercial software and services.",
                ),
                SearchResult(
                    title=f"{word} Products & Solutions",
                    url=f"https://{competing_domain}",
                    snippet=f"Independent commercial services by {word}.",
                ),
            ]
        )

        crawl = _DeterministicCrawlManager({
            f"https://{primary_domain}": _valid_doc(f"https://{primary_domain}", f"{word} – Official Platform", f"{word} is a commercial company.", PageType.HOMEPAGE),
            f"https://{primary_domain}/about": _valid_doc(f"https://{primary_domain}/about", f"About {word}", f"About {word} platform.", PageType.ABOUT),
        })

        verifier = WebsiteVerifier(crawl, search)
        resolver = IdentityResolver(search, verifier)

        identity = resolver.resolve(word)
        assert identity.confidence == IdentityConfidence.AMBIGUOUS, (
            f"Expected generic word '{word}' to be AMBIGUOUS due to collision distribution, but got {identity.confidence} (Domain: {identity.domain})"
        )


def test_short_generic_dictionary_words_stay_ambiguous():
    """Tests that short (<= 5 chars) generic dictionary words (Kite, Loom, Acme, Apex)
    stay AMBIGUOUS due to lexical commonness even when uncontested in search."""
    for word, domain in [
        ("Acme", "acme.com"),
        ("Apex", "apex.com"),
        ("Kite", "kite.com"),
        ("Loom", "loom.com"),
    ]:
        search = _DeterministicSearchProvider(
            company=word,
            domain=domain,
            results=[
                SearchResult(
                    title=f"{word} – Official Platform",
                    url=f"https://{domain}",
                    snippet=f"{word} provides industrial manufacturing.",
                ),
            ]
        )

        crawl = _DeterministicCrawlManager({
            f"https://{domain}": _valid_doc(f"https://{domain}", f"{word} – Official Platform", f"{word} is a manufacturing company.", PageType.HOMEPAGE),
            f"https://{domain}/about": _valid_doc(f"https://{domain}/about", f"About {word}", f"About {word}.", PageType.ABOUT),
        })

        verifier = WebsiteVerifier(crawl, search)
        resolver = IdentityResolver(search, verifier)

        identity = resolver.resolve(word)
        assert identity.confidence == IdentityConfidence.AMBIGUOUS, f"Expected short generic word '{word}' to be AMBIGUOUS, got {identity.confidence}"


def test_coined_single_word_brand_uncontested_promoted_to_confident():
    """Tests that uncommon coined / neologism brands with exact domain and uncontested corroboration
    are safely promoted to CONFIDENT without hand-curated allowlists."""
    coined_brands = [
        ("Adyen", "adyen.com"),
        ("Yoco", "yoco.com"),
        ("Qonto", "qonto.com"),
        ("Mambu", "mambu.com"),
        ("Swile", "swile.co"),
        ("Wasoko", "wasoko.com"),
        ("Klarna", "klarna.com"),
        ("Revolut", "revolut.com"),
        ("Monzo", "monzo.com"),
        ("Pipedrive", "pipedrive.com"),
        ("Paystack", "paystack.com"),
    ]

    for brand, domain in coined_brands:
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
        assert identity.confidence == IdentityConfidence.CONFIDENT, f"Expected coined brand '{brand}' to be CONFIDENT, but got {identity.confidence}"
        assert identity.domain == domain


def test_multi_token_distinctive_name_promoted_to_confident():
    """Tests that multi-token distinctive corporate names (Trade Republic, Bending Spoons, Cowrywise Financial)
    have low shape risk and resolve to CONFIDENT."""
    multi_token_cases = [
        ("Trade Republic", "traderepublic.com"),
        ("Bending Spoons", "bendingspoons.com"),
        ("Lami Technologies", "lami.world"),
        ("FairMoney Financial", "fairmoney.io"),
        ("Cowrywise Investments", "cowrywise.com"),
    ]

    for company, domain in multi_token_cases:
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


def test_brand_domain_mismatch_prevents_confident_promotion():
    """Tests that a single verified candidate with a non-exact domain root stays non-CONFIDENT."""
    company = "Nexus"
    domain = "nexus-advisory-partners.com"
    search = _DeterministicSearchProvider(
        company=company,
        domain=domain,
        results=[
            SearchResult(title="Nexus Advisory Partners", url=f"https://{domain}", snippet="Nexus Advisory Partners is a management consultancy."),
        ]
    )

    crawl = _DeterministicCrawlManager({
        f"https://{domain}": _valid_doc(f"https://{domain}", "Nexus Advisory Partners", "Nexus provides business advisory services.", PageType.HOMEPAGE),
        f"https://{domain}/about": _valid_doc(f"https://{domain}/about", "About Nexus Advisory Partners", "About Nexus Advisory Partners.", PageType.ABOUT),
    })

    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    identity = resolver.resolve(company)
    assert identity.confidence != IdentityConfidence.CONFIDENT

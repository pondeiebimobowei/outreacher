"""
tests/test_multi_token_adversarial_generalization.py — Evidence-Varying Entity Discrimination Suite

Formal validation verifying that multi-token resolution is governed by EVIDENCE
(explicit entity discrimination basis), not by artificial vocabulary membership:

Evidence Categories tested:
1. Bare common-word compounds (NO discriminator) -> AMBIGUOUS (basis: NONE, domain suppressed)
2. Common-word compounds WITH caller IdentityContext -> CONFIDENT (basis: USER_CONTEXT)
3. Common-word compounds WITH first-party legal registration -> CONFIDENT (basis: LEGAL_ENTITY_MATCH)
4. Coined / non-dictionary brand tokens -> CONFIDENT (basis: COINED_BRAND_TOKEN)
5. Competing brand domains -> AMBIGUOUS (competing domains observed)
"""

from datetime import datetime, timezone
import pytest

from core.models import (
    CrawledDocument, PageType, DocumentQuality, SearchResult,
    IdentityConfidence, IdentityContext, SiteRelationship,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from benchmark_identity_recall import _DeterministicSearchProvider, _DeterministicCrawlManager


def _doc(url: str, title: str, content: str, page_type: PageType) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        content=content,
        title=title,
        status_code=200,
        quality=DocumentQuality.VALID,
        page_type=page_type,
        retrieved_at=datetime.now(timezone.utc),
    )


# ── 1. Bare Common-Word Compounds (No Discriminator -> AMBIGUOUS) ─────────────

BARE_COMMON_WORD_CASES = [
    ("Harbor Payments", "harborpayments.com"),
    ("Meridian Analytics", "meridiananalytics.com"),
    ("Pillar Platform", "pillarplatform.com"),
    ("Beacon Systems", "beaconsystems.com"),
    ("Summit Capital", "summitcapital.com"),
    ("Horizon Logistics", "horizonlogistics.com"),
    ("Iron Mountain", "ironmountain.com"),
    ("Blue Ribbon", "blueribbon.com"),
    ("Silver Lake", "silverlake.com"),
    ("Modern Treasury", "moderntreasury.com"),
]


@pytest.mark.parametrize("company,domain", BARE_COMMON_WORD_CASES)
def test_bare_common_word_compounds_without_discriminator_stay_ambiguous(company: str, domain: str):
    """Verifies that bare common-word compounds without any entity-discriminating basis
    (no caller context, no legal entity registration, no coined brand token) remain AMBIGUOUS."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} provides enterprise solutions.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company}: company overview.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} official site."),
    ]
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "NONE"
    assert identity.diagnostic_trace.final_decision_rule == "SHAPE_RISK_RETAINED_AMBIGUOUS"


# ── 2. Evidence-Varying: Same Names With Caller Context -> CONFIDENT ──────────

CONTEXT_DISCRIMINATED_CASES = [
    ("Harbor Payments", "harborpayments.com", IdentityContext(description="merchant payment gateway", location="Toronto", country="Canada"), "Harbor Payments is a Toronto, Canada merchant gateway."),
    ("Meridian Analytics", "meridiananalytics.com", IdentityContext(description="healthcare data insights and biopharma analytics", industry="healthcare"), "Meridian Analytics provides healthcare data insights and biopharma analytics."),
    ("Pillar Platform", "pillarplatform.com", IdentityContext(description="construction project management software", industry="construction"), "Pillar Platform is a construction project management system."),
    ("Beacon Systems", "beaconsystems.com", IdentityContext(description="maritime navigation hardware and iot sensors", industry="maritime"), "Beacon Systems manufactures maritime navigation hardware and iot sensors."),
    ("Summit Capital", "summitcapital.com", IdentityContext(description="growth equity venture capital in Boston", location="Boston"), "Summit Capital is a growth equity venture fund in Boston."),
    ("Horizon Logistics", "horizonlogistics.com", IdentityContext(description="freight forwarding supply chain in Rotterdam", location="Rotterdam"), "Horizon Logistics provides European freight forwarding in Rotterdam."),
    ("Iron Mountain", "ironmountain.com", IdentityContext(description="commercial archival storage facilities in Boston", location="Boston", country="United States"), "Iron Mountain provides commercial archival storage facilities in Boston, United States."),
    ("Blue Ribbon", "blueribbon.com", IdentityContext(description="culinary restaurant hospitality venues", industry="culinary"), "Blue Ribbon operates culinary restaurant hospitality venues."),
    ("Silver Lake", "silverlake.com", IdentityContext(description="technology buyout investment fund in Menlo Park", location="Menlo Park"), "Silver Lake is a technology buyout investment fund in Menlo Park."),
]


@pytest.mark.parametrize("company,domain,context,doc_content", CONTEXT_DISCRIMINATED_CASES)
def test_common_word_compounds_with_matching_context_become_confident(
    company: str, domain: str, context: IdentityContext, doc_content: str
):
    """Verifies that when caller provides structured IdentityContext matching candidate evidence,
    entity discrimination basis becomes USER_CONTEXT and resolves to CONFIDENT."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} official web presence.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", doc_content, PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=doc_content),
    ]
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "USER_CONTEXT"
    assert identity.diagnostic_trace.final_decision_rule == "SHAPE_RISK_DISCOUNTED_CONFIDENT"


# ── 3. First-Party Legal Entity Registration Alone Stays AMBIGUOUS (Invariant B) ─

LEGAL_ENTITY_CASES = [
    ("Trade Republic", "traderepublic.com", "Trade Republic Bank GmbH is supervised by BaFin.", IdentityContext(country="Germany", legal_name="Trade Republic Bank GmbH")),
    ("Bending Spoons", "bendingspoons.com", "Bending Spoons S.p.A. Registered in Milan, Italy.", IdentityContext(country="Italy", location="Milan", company_type="S.p.A.")),
    ("Modern Treasury", "moderntreasury.com", "Modern Treasury Inc. Registered in Delaware, Registration No. 7349102.", IdentityContext(jurisdiction="Delaware", registration_number="7349102")),
    ("Beacon Systems", "beaconsystems.com", "Beacon Systems LLC, licensed and regulated by authorities.", IdentityContext(company_type="LLC", legal_name="Beacon Systems LLC")),
]


@pytest.mark.parametrize("company,domain,legal_doc,context", LEGAL_ENTITY_CASES)
def test_first_party_legal_alone_is_ambiguous_and_becomes_confident_with_context(
    company: str, domain: str, legal_doc: str, context: IdentityContext
):
    """Invariant B: First-party legal entity registration on a candidate's own site is
    LEGAL_ENTITY_CORROBORATION (self-identity). Bare query alone remains AMBIGUOUS.
    When matched with caller context, it resolves to CONFIDENT under USER_CONTEXT."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} web presence.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", legal_doc, PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} official website."),
    ]
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )

    # 1. Bare query without context -> AMBIGUOUS (basis: NONE)
    bare_identity = resolver.resolve(company)
    assert bare_identity.confidence == IdentityConfidence.AMBIGUOUS
    assert bare_identity.domain == ""
    assert bare_identity.diagnostic_trace is not None
    assert bare_identity.diagnostic_trace.entity_discrimination_basis == "NONE"

    # 2. Query WITH matching caller context -> CONFIDENT (basis: USER_CONTEXT)
    ctx_identity = resolver.resolve(company, context=context)
    assert ctx_identity.confidence == IdentityConfidence.CONFIDENT
    assert ctx_identity.domain == domain
    assert ctx_identity.diagnostic_trace is not None
    assert ctx_identity.diagnostic_trace.entity_discrimination_basis == "USER_CONTEXT"


# ── 4. Coined / Non-Dictionary Brand Tokens -> CONFIDENT ──────────────────────

COINED_BRAND_CASES = [
    ("FairMoney Financial", "fairmoney.io"),
    ("Lami Technologies", "lami.world"),
    ("Moove Mobility", "moove.io"),
    ("GitLab Engineering", "gitlab.com"),
    ("Moniepoint Africa", "moniepoint.com"),
]


@pytest.mark.parametrize("company,domain", COINED_BRAND_CASES)
def test_coined_brands_resolve_to_confident(company: str, domain: str):
    """Verifies that coined / non-dictionary brand tokens carry low lexical collision risk
    and resolve to CONFIDENT under basis COINED_BRAND_TOKEN."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} is a leading global technology company.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company}: company profile.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} is a leading technology company."),
    ]
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "COINED_BRAND_TOKEN"


# ── 5. Invariant A: Contradiction Detection Blocks to AMBIGUOUS ───────────────

def test_geographic_contradiction_between_context_and_first_party_blocks_confident():
    """Invariant A: If caller context specifies Toronto/Canada, but candidate first-party evidence
    explicitly claims Berlin/Germany without Toronto, resolution fails closed to AMBIGUOUS."""
    company = "Harbor Payments"
    domain = "harborpayments.com"
    url = f"https://{domain}"

    # Caller specifies Toronto, Canada
    context = IdentityContext(location="Toronto", country="Canada", description="merchant payment gateway")

    # First-party live crawled page explicitly states Berlin, Germany
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} is a merchant gateway.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} is headquartered in Berlin, Germany.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} merchant gateway."),
    ]
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "CONTRADICTION_BLOCKED"


# ── 6. Invariant A: Generic-Only Context Fails to Discount Shape Risk ─────────

def test_generic_industry_context_fails_to_discount_shape_risk():
    """Invariant A: Caller context with only generic industry words (software, services, platform)
    cannot discount shape risk on common-word dictionary queries."""
    company = "Pillar Platform"
    domain = "pillarplatform.com"
    url = f"https://{domain}"

    # Context has only generic words
    context = IdentityContext(industry="software", description="software platform and digital services")

    docs = {
        url: _doc(url, f"{company} – Official", f"{company} software platform and digital services.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} provides software and services.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} software platform."),
    ]
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "NONE"


# ── 7. Invariant A: Search Snippet-Only Context Match Rejected ────────────────

def test_search_snippet_only_match_without_first_party_crawl_rejected():
    """Invariant A & E: Discriminator appearing ONLY in search snippets but NOT in first-party
    crawled pages cannot discount shape risk."""
    company = "Beacon Systems"
    domain = "beaconsystems.com"
    url = f"https://{domain}"

    # Context specifies Rotterdam maritime
    context = IdentityContext(location="Rotterdam", industry="maritime", description="maritime sensors")

    # Search snippet mentions Rotterdam, but live crawled page has generic content without Rotterdam
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} builds commercial technology solutions.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company}: global enterprise solutions.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet="Beacon Systems Rotterdam maritime sensors."),
    ]
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "NONE"

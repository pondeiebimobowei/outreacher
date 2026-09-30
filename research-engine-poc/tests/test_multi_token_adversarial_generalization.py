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
    ("Harbor Payments", "harborpayments.com", IdentityContext(description="Toronto merchant payment gateway", industry="fintech"), "Harbor Payments is a Toronto merchant gateway."),
    ("Meridian Analytics", "meridiananalytics.com", IdentityContext(description="healthcare data insights and analytics", industry="healthcare"), "Meridian Analytics provides healthcare data insights."),
    ("Pillar Platform", "pillarplatform.com", IdentityContext(description="construction project management software", industry="construction"), "Pillar Platform is a construction management system."),
    ("Beacon Systems", "beaconsystems.com", IdentityContext(description="maritime navigation hardware and iot", industry="maritime"), "Beacon Systems manufactures maritime navigation hardware."),
    ("Summit Capital", "summitcapital.com", IdentityContext(description="growth equity venture capital in Boston", industry="finance"), "Summit Capital is a growth equity venture fund in Boston."),
    ("Horizon Logistics", "horizonlogistics.com", IdentityContext(description="freight forwarding supply chain in Rotterdam", industry="logistics"), "Horizon Logistics provides European freight forwarding."),
    ("Iron Mountain", "ironmountain.com", IdentityContext(description="records storage information management", industry="data storage"), "Iron Mountain provides records storage and management."),
    ("Blue Ribbon", "blueribbon.com", IdentityContext(description="culinary restaurant hospitality group", industry="hospitality"), "Blue Ribbon operates restaurants and culinary venues."),
    ("Silver Lake", "silverlake.com", IdentityContext(description="technology private equity buyout investment", industry="private equity"), "Silver Lake is a technology private equity firm."),
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


# ── 3. First-Party Legal Entity Registration -> CONFIDENT ─────────────────────

LEGAL_ENTITY_DISCRIMINATED_CASES = [
    ("Trade Republic", "traderepublic.com", "Trade Republic Bank GmbH is supervised by BaFin."),
    ("Bending Spoons", "bendingspoons.com", "Bending Spoons S.p.A. Registered in Milan, Italy."),
    ("Modern Treasury", "moderntreasury.com", "Modern Treasury Inc. Registered in Delaware, Registration No. 7349102."),
    ("Beacon Systems", "beaconsystems.com", "Beacon Systems LLC, licensed and regulated by authorities."),
]


@pytest.mark.parametrize("company,domain,legal_doc", LEGAL_ENTITY_DISCRIMINATED_CASES)
def test_common_word_compounds_with_legal_registration_become_confident(company: str, domain: str, legal_doc: str):
    """Verifies that first-party legal registration or regulatory attribution provides
    explicit entity discrimination basis LEGAL_ENTITY_MATCH and resolves to CONFIDENT."""
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
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "LEGAL_ENTITY_MATCH"
    assert identity.diagnostic_trace.final_decision_rule == "SHAPE_RISK_DISCOUNTED_CONFIDENT"


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
    assert identity.diagnostic_trace.final_decision_rule in (
        "DISTINCTIVE_PRIMARY_CONFIDENT", "SHAPE_RISK_DISCOUNTED_CONFIDENT"
    )

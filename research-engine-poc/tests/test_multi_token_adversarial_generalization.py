"""
tests/test_multi_token_adversarial_generalization.py — Multi-Token Distinctiveness & Safety Generalization Suite

Independent adversarial validation containing 20 multi-token cases:
- 10 Generic / Common-word compounds (Single dictionary root + generic category/industry suffix) -> AMBIGUOUS
- 10 Plausible distinctive multi-token companies (Coined brands or non-generic semantic compounds) -> CONFIDENT

Each case is equipped with:
- 1 exact matching domain
- Strong homepage self-identity
- Strong independent corroboration
- 0 observed search competitors
"""

from datetime import datetime, timezone
import pytest

from core.models import (
    CrawledDocument, PageType, DocumentQuality, SearchResult,
    IdentityConfidence, SiteRelationship,
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


GENERIC_MULTI_TOKEN_ADVERSARIES = [
    ("Harbor Payments", "harborpayments.com"),
    ("Meridian Analytics", "meridiananalytics.com"),
    ("Pillar Platform", "pillarplatform.com"),
    ("Beacon Systems", "beaconsystems.com"),
    ("Summit Capital", "summitcapital.com"),
    ("Horizon Logistics", "horizonlogistics.com"),
    ("Anchor Media", "anchormedia.com"),
    ("Apex Consulting", "apexconsulting.com"),
    ("Catalyst Ventures", "catalystventures.com"),
    ("Vanguard Software", "vanguardsoftware.com"),
]

DISTINCTIVE_MULTI_TOKEN_COMPANIES = [
    ("Trade Republic", "traderepublic.com"),
    ("Bending Spoons", "bendingspoons.com"),
    ("Modern Treasury", "moderntreasury.com"),
    ("Iron Mountain", "ironmountain.com"),
    ("Blue Ribbon", "blueribbon.com"),
    ("Silver Lake", "silverlake.com"),
    ("FairMoney Financial", "fairmoney.io"),
    ("Lami Technologies", "lami.world"),
    ("Moove Mobility", "moove.io"),
    ("GitLab Engineering", "gitlab.com"),
]


@pytest.mark.parametrize("company,domain", GENERIC_MULTI_TOKEN_ADVERSARIES)
def test_generic_multi_token_adversaries_resolve_to_ambiguous(company: str, domain: str):
    """Verifies that single-word dictionary roots attached to generic category/industry descriptors
    remain AMBIGUOUS even with exact domain, strong homepage, strong secondary, and 0 search competitors."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} is a leading commercial enterprise provider.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company}: enterprise company overview.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} provides leading commercial enterprise services."),
    ]
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS, (
        f"Expected generic multi-token adversary '{company}' to resolve to AMBIGUOUS, got {identity.confidence}. "
        f"Trace: {identity.diagnostic_trace}"
    )
    assert identity.domain == "", f"Domain must be suppressed on AMBIGUOUS for {company}"
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.final_decision_rule == "SHAPE_RISK_RETAINED_AMBIGUOUS"


@pytest.mark.parametrize("company,domain", DISTINCTIVE_MULTI_TOKEN_COMPANIES)
def test_distinctive_multi_token_companies_resolve_to_confident(company: str, domain: str):
    """Verifies that distinctive multi-token companies (coined tokens or non-generic semantic compounds)
    resolve to CONFIDENT with exact domain correspondence, strong corroboration, and 0 competitors."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} is a leading technology company.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company}: our official company history.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} is a leading technology company."),
    ]
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.CONFIDENT, (
        f"Expected distinctive company '{company}' to resolve to CONFIDENT, got {identity.confidence}. "
        f"Trace: {identity.diagnostic_trace}"
    )
    assert identity.domain == domain
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.final_decision_rule in (
        "SHAPE_RISK_DISCOUNTED_CONFIDENT", "DISTINCTIVE_PRIMARY_CONFIDENT"
    )

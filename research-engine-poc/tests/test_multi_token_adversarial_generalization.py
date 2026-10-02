"""
tests/test_multi_token_adversarial_generalization.py — Evidence-Varying Entity Discrimination Suite

Formal validation verifying that multi-token resolution is governed strictly by EVIDENCE
(explicit entity discrimination basis) and structural attributes, NOT by arbitrary lexical denylists:

Structural Matrix Cases:
1. Common-word + self-ID only -> AMBIGUOUS (basis: NONE, domain suppressed)
2. Common-word + self-ID + About -> AMBIGUOUS (basis: NONE, domain suppressed)
3. Common-word + generic industry/description overlap -> AMBIGUOUS (basis: NONE, domain suppressed)
4. Common-word + specific structural location/HQ match -> CONFIDENT (basis: USER_CONTEXT)
5. Common-word + wrong location / explicit conflict -> AMBIGUOUS (basis: CONTRADICTION_BLOCKED)
6. Common-word + compatible multi-location operations -> CONFIDENT (basis: USER_CONTEXT)
7. Common-word + legal suffix only on candidate site -> AMBIGUOUS (basis: NONE)
8. Common-word + caller context legal attribute match -> CONFIDENT (basis: USER_CONTEXT)
9. Common-word + trusted external registry match -> CONFIDENT (basis: EXTERNAL_ENTITY_MATCH)
10. Common-word + conflicting external registry record -> AMBIGUOUS (basis: CONTRADICTION_BLOCKED)
11. Coined brand + competitor discovered -> AMBIGUOUS (COMPETING_BRAND_DOMAINS_AMBIGUOUS)
12. Coined brand + uncontested -> CONFIDENT (basis: COINED_BRAND_TOKEN)
13. Indexed fallback only -> AMBIGUOUS (INDEXED_ONLY_EPISTEMIC_CAP_AMBIGUOUS)
"""

from datetime import datetime, timezone
import pytest

from core.models import (
    CrawledDocument, PageType, DocumentQuality, SearchResult,
    IdentityConfidence, IdentityContext, SiteRelationship,
    IdentityEvidence, EvidenceType,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from crawling.acquirer import FirstPartyAcquirer
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


def _make_resolver(company: str, domain: str, docs: dict, results: list) -> IdentityResolver:
    crawl = _DeterministicCrawlManager(docs)
    search = _DeterministicSearchProvider(company, domain, results)
    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)
    return IdentityResolver(search, verifier, acquirer=acquirer)


# ── 1. Bare Common-Word Compounds: Self-ID Only (AMBIGUOUS) ───────────────────

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
    """1 & 2: Common-word compounds with self-ID and About page alone remain AMBIGUOUS."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} provides enterprise solutions.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company}: company overview.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} official site."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "NONE"
    assert identity.diagnostic_trace.final_decision_rule == "SHAPE_RISK_RETAINED_AMBIGUOUS"


# ── 3. Generic Industry / Description Overlap Stays AMBIGUOUS ──────────────────

@pytest.mark.parametrize("company,domain,industry,desc", [
    ("Pillar Platform", "pillarplatform.com", "construction", "construction project management software"),
    ("Beacon Systems", "beaconsystems.com", "maritime", "maritime navigation hardware and iot sensors"),
    ("Meridian Analytics", "meridiananalytics.com", "healthcare", "healthcare data insights and biopharma analytics"),
    ("Blue Ribbon", "blueribbon.com", "culinary", "culinary restaurant hospitality venues"),
])
def test_generic_industry_and_description_overlap_fails_to_discount_shape_risk(
    company: str, domain: str, industry: str, desc: str
):
    """3: Caller providing only industry and description text cannot discount shape risk."""
    url = f"https://{domain}"
    context = IdentityContext(industry=industry, description=desc)
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} {desc}.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} operates in {industry}.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} {desc}"),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "NONE"


# ── 4. Structural Location / HQ Match -> CONFIDENT (USER_CONTEXT) ─────────────

STRUCTURAL_LOCATION_CASES = [
    ("Harbor Payments", "harborpayments.com", IdentityContext(location="Toronto", country="Canada"), "Harbor Payments is located in Toronto, Canada."),
    ("Summit Capital", "summitcapital.com", IdentityContext(headquarters="Boston", country="United States"), "Summit Capital is headquartered in Boston, United States."),
    ("Horizon Logistics", "horizonlogistics.com", IdentityContext(location="Rotterdam", country="Netherlands"), "Horizon Logistics operates in Rotterdam, Netherlands."),
    ("Iron Mountain", "ironmountain.com", IdentityContext(headquarters="Boston", headquarters_country="United States"), "Iron Mountain is based in Boston, United States."),
    ("Silver Lake", "silverlake.com", IdentityContext(location="Menlo Park"), "Silver Lake operations in Menlo Park."),
]


@pytest.mark.parametrize("company,domain,context,doc_content", STRUCTURAL_LOCATION_CASES)
def test_common_word_compounds_with_structural_location_match_become_confident(
    company: str, domain: str, context: IdentityContext, doc_content: str
):
    """4: Specific structural location/HQ attributes matching first-party crawl resolve to CONFIDENT."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} official web presence.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", doc_content, PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=doc_content),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "USER_CONTEXT"
    assert identity.diagnostic_trace.final_decision_rule == "SHAPE_RISK_DISCOUNTED_CONFIDENT"


# ── 5. Location Contradiction Blocks to AMBIGUOUS ─────────────────────────────

def test_geographic_contradiction_between_context_and_first_party_blocks_confident():
    """5: Explicit contradiction between caller context and first-party evidence blocks."""
    company = "Harbor Payments"
    domain = "harborpayments.com"
    url = f"https://{domain}"

    context = IdentityContext(location="Toronto", country="Canada")
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} is a merchant gateway.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} is headquartered in Berlin, Germany.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} merchant gateway."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "CONTRADICTION_BLOCKED"


def test_explicit_headquarters_contradiction_overrides_historical_location_blocks_confident():
    """5b: Explicit HQ contradiction blocks even if historical/founding city matches caller HQ."""
    company = "Harbor Payments"
    domain = "harborpayments.com"
    url = f"https://{domain}"

    # Caller requests Toronto HQ; Candidate was founded in Toronto but HQ is now Berlin
    context = IdentityContext(headquarters="Toronto")
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} global payments.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} was founded in Toronto. Headquarters in Berlin, Germany.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} global payments."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "CONTRADICTION_BLOCKED"


def test_incidental_customer_location_mention_fails_to_discriminate_stays_ambiguous():
    """5c: Mention of city purely in a customer/marketing context cannot discriminate entity."""
    company = "Pillar Platform"
    domain = "pillarplatform.com"
    url = f"https://{domain}"

    context = IdentityContext(location="Toronto")
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} software platform.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"We are proud to serve our enterprise customers in Toronto and across North America.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} customers in Toronto."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "NONE"


def test_incidental_conference_location_mention_fails_to_discriminate_stays_ambiguous():
    """5d: Mention of city purely in an event/conference context cannot discriminate entity."""
    company = "Beacon Systems"
    domain = "beaconsystems.com"
    url = f"https://{domain}"

    context = IdentityContext(location="Toronto")
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} enterprise security.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"Join our tech keynote at the annual developer conference in Toronto next summer.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} conference in Toronto."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "NONE"


# ── 6. Multi-Location Operations are Compatible ───────────────────────────────

def test_multi_location_operations_compatible_with_location_context():
    """6: Multi-location statements (e.g. Offices in Toronto, Berlin, London) match location='Toronto'."""
    company = "Pillar Platform"
    domain = "pillarplatform.com"
    url = f"https://{domain}"

    context = IdentityContext(location="Toronto")
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} software platform.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} has offices in Toronto, Berlin, and London.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} multi-city offices."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "USER_CONTEXT"


def test_unseen_team_location_phrasing_matches_as_operational():
    """6b: Unseen phrasing 'Our team is based in Toronto' qualifies as operational presence."""
    company = "Pillar Platform"
    domain = "pillarplatform.com"
    url = f"https://{domain}"

    context = IdentityContext(location="Toronto")
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} enterprise software.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", "Our team is based in Toronto, Ontario, building next-generation systems.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} software."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "USER_CONTEXT"


def test_irrelevant_buried_location_mention_stays_ambiguous():
    """6c: Buried incidental history mention on long page cannot discriminate entity."""
    company = "Beacon Systems"
    domain = "beaconsystems.com"
    url = f"https://{domain}"

    context = IdentityContext(location="Toronto")
    long_content = (
        "Beacon Systems is an enterprise security engineering firm with headquarters in Berlin, Germany. "
        "In 2012, our founding CEO attended an industry meetup in Toronto before establishing our Berlin headquarters. "
        "Today all core development operations remain firmly located in Berlin."
    )
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} security.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", long_content, PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} security."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company, context=context)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis in ("NONE", "CONTRADICTION_BLOCKED")


# ── 7 & 8. Legal Form Corroboration vs Caller Context Legal Match ─────────────

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
    """7 & 8: First-party legal form alone is AMBIGUOUS. With matching caller context, resolves to CONFIDENT."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} web presence.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", legal_doc, PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} official website."),
    ]
    resolver = _make_resolver(company, domain, docs, results)

    # 7. Bare query without context -> AMBIGUOUS (basis: NONE)
    bare_identity = resolver.resolve(company)
    assert bare_identity.confidence == IdentityConfidence.AMBIGUOUS
    assert bare_identity.domain == ""
    assert bare_identity.diagnostic_trace is not None
    assert bare_identity.diagnostic_trace.entity_discrimination_basis == "NONE"

    # 8. Query WITH matching caller context -> CONFIDENT (basis: USER_CONTEXT)
    ctx_identity = resolver.resolve(company, context=context)
    assert ctx_identity.confidence == IdentityConfidence.CONFIDENT
    assert ctx_identity.domain == domain
    assert ctx_identity.diagnostic_trace is not None
    assert ctx_identity.diagnostic_trace.entity_discrimination_basis == "USER_CONTEXT"


# ── 9 & 10. External Registry Matching vs Conflict ───────────────────────────

def test_external_registry_corroboration_resolves_to_confident():
    """9: Independent trusted external registry match satisfies entity discrimination."""
    from identity.registry import SecEdgarRegistryProvider
    provider = SecEdgarRegistryProvider()

    company = "Iron Mountain"
    domain = "ironmountain.com"
    url = f"https://{domain}"

    docs = {
        url: _doc(url, f"{company} – Official", f"{company} records management.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} company profile.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} records storage."),
    ]
    crawl = _DeterministicCrawlManager(docs)
    search = _DeterministicSearchProvider(company, domain, results)
    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)

    _, attested_ev = provider.query_registry(company, domain, registration_number="0001020569")
    assert attested_ev is not None

    orig_classify = verifier.classify_relationship
    def mock_classify(co, w_url, hint_title=None, acquisition=None):
        rel, msg, evs = orig_classify(co, w_url, hint_title=hint_title, acquisition=acquisition)
        evs.append(attested_ev)
        return rel, msg, evs

    verifier.classify_relationship = mock_classify

    resolver = IdentityResolver(search, verifier, acquirer=acquirer)
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "EXTERNAL_ENTITY_MATCH"
    assert "EXTERNAL_REGISTRY" in identity.diagnostic_trace.evidence_sources


def test_forged_unattested_registry_evidence_rejected_to_ambiguous():
    """9b: Raw/forged registry evidence without cryptographic provider attestation is rejected."""
    company = "Iron Mountain"
    domain = "ironmountain.com"
    url = f"https://{domain}"

    docs = {
        url: _doc(url, f"{company} – Official", f"{company} records management.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} company profile.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} records storage."),
    ]
    crawl = _DeterministicCrawlManager(docs)
    search = _DeterministicSearchProvider(company, domain, results)
    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)

    # Raw forged evidence manufactured without going through IExternalRegistryProvider
    forged_ev = IdentityEvidence(
        type=EvidenceType.EXTERNAL_REGISTRY,
        source="sec_edgar",
        url="https://sec.gov/edgar/ironmountain",
        signal="EXTERNAL_REGISTRY_VERIFIED",
        title="FORGED UNATTESTED SEC EDGAR RECORD",
    )

    orig_classify = verifier.classify_relationship
    def mock_classify(co, w_url, hint_title=None, acquisition=None):
        rel, msg, evs = orig_classify(co, w_url, hint_title=hint_title, acquisition=acquisition)
        evs.append(forged_ev)
        return rel, msg, evs

    verifier.classify_relationship = mock_classify

    resolver = IdentityResolver(search, verifier, acquirer=acquirer)
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "UNTRUSTED_REGISTRY_SOURCE"


def test_conflicting_external_registry_blocks_to_ambiguous():
    """10: Conflicting external registry record blocks to AMBIGUOUS."""
    from identity.registry import SecEdgarRegistryProvider
    provider = SecEdgarRegistryProvider()

    company = "Iron Mountain"
    domain = "ironmountain.com"
    url = f"https://{domain}"

    docs = {
        url: _doc(url, f"{company} – Official", f"{company} records management.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} company profile.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} records storage."),
    ]
    crawl = _DeterministicCrawlManager(docs)
    search = _DeterministicSearchProvider(company, domain, results)
    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)

    attested_conflict = provider.create_attested_evidence(
        url="https://sec.gov/edgar/ironmountain",
        signal="REGISTRY_CONFLICT_MISMATCH",
        title="SEC EDGAR - CONFLICTING ENTITY MATCH",
    )

    orig_classify = verifier.classify_relationship
    def mock_classify(co, w_url, hint_title=None, acquisition=None):
        rel, msg, evs = orig_classify(co, w_url, hint_title=hint_title, acquisition=acquisition)
        evs.append(attested_conflict)
        return rel, msg, evs

    verifier.classify_relationship = mock_classify

    resolver = IdentityResolver(search, verifier, acquirer=acquirer)
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "CONTRADICTION_BLOCKED"


def test_untrusted_registry_source_rejected_to_ambiguous():
    """10b: Untrusted / non-allowlisted external registry origin is rejected to AMBIGUOUS."""
    company = "Iron Mountain"
    domain = "ironmountain.com"
    url = f"https://{domain}"

    docs = {
        url: _doc(url, f"{company} – Official", f"{company} records management.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} company profile.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} records storage."),
    ]
    crawl = _DeterministicCrawlManager(docs)
    search = _DeterministicSearchProvider(company, domain, results)
    acquirer = FirstPartyAcquirer(crawl, search)
    verifier = WebsiteVerifier(search)

    orig_classify = verifier.classify_relationship
    def mock_classify(co, w_url, hint_title=None, acquisition=None):
        rel, msg, evs = orig_classify(co, w_url, hint_title=hint_title, acquisition=acquisition)
        evs.append(IdentityEvidence(
            type=EvidenceType.EXTERNAL_REGISTRY,
            source="untrusted_third_party_scraper",
            url="https://untrusted.com/ironmountain",
            signal="EXTERNAL_REGISTRY_VERIFIED",
            title="Untrusted Registry Mirror",
        ))
        return rel, msg, evs

    verifier.classify_relationship = mock_classify

    resolver = IdentityResolver(search, verifier, acquirer=acquirer)
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "UNTRUSTED_REGISTRY_SOURCE"


# ── 11 & 12. Coined Brand Tokens: Contested vs Uncontested ────────────────────

COINED_BRAND_CASES = [
    ("FairMoney Financial", "fairmoney.io"),
    ("Lami Technologies", "lami.world"),
    ("Moove Mobility", "moove.io"),
    ("GitLab Engineering", "gitlab.com"),
    ("Moniepoint Africa", "moniepoint.com"),
]


@pytest.mark.parametrize("company,domain", COINED_BRAND_CASES)
def test_uncontested_coined_brands_resolve_to_confident(company: str, domain: str):
    """12: Uncontested coined brand tokens resolve to CONFIDENT under COINED_BRAND_TOKEN."""
    url = f"https://{domain}"
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} is a leading global technology company.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company}: company profile.", PageType.ABOUT),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} is a leading technology company."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.CONFIDENT
    assert identity.domain == domain
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.entity_discrimination_basis == "COINED_BRAND_TOKEN"


def test_coined_brand_with_competing_domains_stays_ambiguous():
    """11: Coined brand token with competing domains discovered in search results stays AMBIGUOUS."""
    company = "Moniepoint Africa"
    domain1 = "moniepoint.com"
    domain2 = "moniepoint.io"
    url1 = f"https://{domain1}"
    url2 = f"https://{domain2}"

    docs = {
        url1: _doc(url1, f"{company} – Official", f"{company} financial services.", PageType.HOMEPAGE),
        url2: _doc(url2, f"{company} – Alternative", f"{company} tech platform.", PageType.HOMEPAGE),
    }
    results = [
        SearchResult(title=f"{company} – Official", url=url1, snippet=f"{company} financial services."),
        SearchResult(title=f"{company} – App", url=url2, snippet=f"{company} mobile app."),
    ]
    resolver = _make_resolver(company, domain1, docs, results)
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.final_decision_rule == "COMPETING_BRAND_DOMAINS_AMBIGUOUS"


# ── 13. Search-Indexed Fallback Only (Track 2 Epistemic Cap) ──────────────────

def test_indexed_only_fallback_evidence_retains_epistemic_cap_ambiguous():
    """13: Indexed-only fallback evidence (bot-blocked homepage) cannot promote to CONFIDENT."""
    company = "Acme Global"
    domain = "acmeglobal.com"
    url = f"https://{domain}"

    # Bot blocked homepage -> fallback indexed via root and secondary search result
    docs = {
        url: CrawledDocument(
            url=url,
            final_url=url,
            content="",
            title="",
            status_code=403,
            quality=DocumentQuality.BLOCKED,
            page_type=PageType.HOMEPAGE,
            retrieved_at=datetime.now(timezone.utc),
        ),
        f"{url}/about": CrawledDocument(
            url=f"{url}/about",
            final_url=f"{url}/about",
            content="",
            title="",
            status_code=403,
            quality=DocumentQuality.BLOCKED,
            page_type=PageType.ABOUT,
            retrieved_at=datetime.now(timezone.utc),
        ),
    }
    results = [
        SearchResult(title=f"{company}: Official Site", url=url, snippet=f"{company} delivers global services."),
        SearchResult(title=f"About {company}", url=f"{url}/about", snippet=f"About {company} company information."),
    ]
    resolver = _make_resolver(company, domain, docs, results)
    identity = resolver.resolve(company)

    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert identity.domain == ""
    assert identity.diagnostic_trace is not None
    assert identity.diagnostic_trace.final_decision_rule == "INDEXED_ONLY_EPISTEMIC_CAP_AMBIGUOUS"
    assert "SEARCH_INDEX_FALLBACK" in identity.diagnostic_trace.evidence_sources

"""
tests/test_acquisition_fixtures.py — Contract-Level Acquisition, Verification, and Arbitration Suite

This suite verifies the decoupled, 3-layer identity architecture:
  Layer 1: FirstPartyAcquirer (crawling/acquirer.py)
           Contract: website_url -> AcquiredSiteDocuments (live first-party only)
  Layer 2: WebsiteVerifier (identity/verifier.py)
           Contract: (company_name, website_url, AcquiredSiteDocuments) -> SiteRelationship & IdentityEvidence
           * Note: First-party verification is in-memory over acquired docs.
           * Indexed fallback is a separate search-derived epistemic fallback path for blocked homepages.
  Layer 3: IdentityResolver (identity/resolver.py)
           Contract: (company_name, candidates, IdentityContext) -> CompanyIdentity
"""

import pytest
from datetime import datetime, timezone
from typing import Dict, List, Optional
from unittest.mock import patch

from core.models import (
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType, EvidenceType,
    IdentityConfidence, IdentityCandidate, IdentityContext,
    CompanyIdentity, CrawlAttempt,
)
from crawling.base import ICrawlerProvider
from crawling.manager import CrawlManager
from crawling.acquirer import (
    FirstPartyAcquirer, AcquiredSiteDocuments, AcquiredDocument,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from benchmark_identity_recall import (
    _DeterministicSearchProvider,
    _DeterministicCrawlManager,
)


def _doc(
    url: str,
    title: str = "",
    content: str = "",
    raw_html: str = "",
    ptype: PageType = PageType.OTHER,
    final_url: Optional[str] = None,
    status_code: int = 200,
    quality: DocumentQuality = DocumentQuality.VALID,
) -> CrawledDocument:
    raw_html = raw_html or f"<html><head><title>{title}</title></head><body><h1>{title}</h1><p>{content}</p></body></html>"
    return CrawledDocument(
        url=url,
        final_url=final_url or url,
        status_code=status_code,
        title=title,
        content=content,
        raw_html=raw_html,
        word_count=len(content.split()) if content else 0,
        page_type=ptype,
        quality=quality,
        retrieved_at=datetime.now(timezone.utc),
    )


def _blocked_doc(url: str, status_code: int = 403) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=status_code,
        title="Access Denied",
        content="",
        raw_html="<html><body>403 Forbidden - WAF Challenge Active</body></html>",
        word_count=0,
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.BLOCKED if status_code == 403 else DocumentQuality.HTTP_ERROR,
        retrieved_at=datetime.now(timezone.utc),
    )


def _spa_shell_doc(url: str, title: str = "") -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=200,
        title=title or "Loading Application...",
        content="Please enable JavaScript to continue using this application.",
        raw_html="""
        <html>
            <head><title>Loading Application...</title></head>
            <body>
                <div id="root"></div>
                <script src="/bundle.js"></script>
            </body>
        </html>
        """,
        word_count=7,
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.TOO_SHORT,
        retrieved_at=datetime.now(timezone.utc),
    )


# ==============================================================================
# SECTION 1: Acquisition Layer Contract Tests (FirstPartyAcquirer in isolation)
# ==============================================================================

def test_contract_a_homepage_acquisition():
    """Acquisition Contract A: Valid homepage is acquired with populated metadata,
    preserved final_url, and validated quality."""
    url = "https://linear.app"
    crawl = _DeterministicCrawlManager({
        url: _doc(url, "Linear – Issue Tracking", "Linear is a project management tool.", ptype=PageType.HOMEPAGE),
    })
    acquirer = FirstPartyAcquirer(crawl_manager=crawl)
    bundle = acquirer.acquire(url)

    assert isinstance(bundle, AcquiredSiteDocuments)
    assert bundle.homepage_doc.quality == DocumentQuality.VALID
    assert bundle.homepage_doc.title == "Linear – Issue Tracking"
    assert bundle.homepage_doc.final_url == url


def test_contract_b_static_to_browser_fallback():
    """Acquisition Contract B: Static TOO_SHORT document triggers browser crawler fallback,
    returning a rich document and recording crawl attempts in telemetry."""
    url = "https://snowflake.com"
    rich_text = (
        "Snowflake Inc. is the Data Cloud company delivering unified data analytics and scalable cloud infrastructure. "
        "Operational corporate headquarters located in Bozeman, Montana. "
        "Snowflake powers data architecture and scalable data pipelines for thousands of modern enterprises worldwide. "
        "Our platform combines data engineering, data warehousing, data lake storage, and secure data sharing into a unified architecture. "
        "We provide robust governance, data security, enterprise compliance certifications, and comprehensive support. "
        "Founded by data industry veterans, Snowflake revolutionizes how organizations collaborate and analyze enterprise datasets."
    )

    class MockStaticProvider(ICrawlerProvider):
        def fetch(self, u: str, ptype: PageType) -> CrawledDocument:
            return _spa_shell_doc(u, title="Loading...")

    class MockBrowserProvider(ICrawlerProvider):
        def fetch(self, u: str, ptype: PageType) -> CrawledDocument:
            return CrawledDocument(
                url=u, final_url=u, status_code=200, title="Snowflake: AI Data Cloud",
                content=rich_text, raw_html=f"<html><body><h1>Snowflake</h1><p>{rich_text}</p></body></html>",
                word_count=len(rich_text.split()), page_type=ptype, quality=DocumentQuality.VALID,
                retrieved_at=datetime.now(timezone.utc),
            )

    mgr = CrawlManager(static_crawler=MockStaticProvider(), browser_crawler=MockBrowserProvider())
    acquirer = FirstPartyAcquirer(crawl_manager=mgr)
    bundle = acquirer.acquire(url)

    assert bundle.homepage_doc.quality == DocumentQuality.VALID
    assert bundle.homepage_doc.fetch_strategy == "BROWSER"
    assert len(bundle.homepage_doc.attempts) == 2
    assert bundle.homepage_doc.attempts[0].strategy == "STATIC"
    assert bundle.homepage_doc.attempts[1].strategy == "BROWSER"


def test_contract_c_conventional_route_discovery():
    """Acquisition Contract C: Probes conventional paths (/legal, /about, /impressum)
    and includes valid discovered pages in secondary_docs."""
    url = "https://stripe.com"
    legal_url = "https://stripe.com/legal"

    crawl = _DeterministicCrawlManager({
        url: _doc(url, "Stripe: Financial Infrastructure", "Online payments platform.", ptype=PageType.HOMEPAGE),
        legal_url: _doc(legal_url, "Stripe: Legal Terms", "Stripe, Inc. operates global payments.", ptype=PageType.OTHER),
    })

    acquirer = FirstPartyAcquirer(crawl_manager=crawl)
    bundle = acquirer.acquire(url)

    discovered = [d for d in bundle.secondary_docs if d.doc.url == legal_url]
    assert len(discovered) == 1
    assert discovered[0].source == "CONVENTIONAL_PATH"
    assert discovered[0].route_kind == "LEGAL"


def test_contract_c_mutation_without_conventional_discovery():
    """Mutation Contract C: Disabling conventional probing prevents /legal from entering secondary_docs."""
    url = "https://stripe.com"
    legal_url = "https://stripe.com/legal"

    crawl = _DeterministicCrawlManager({
        url: _doc(url, "Stripe: Financial Infrastructure", "Online payments platform.", ptype=PageType.HOMEPAGE),
        legal_url: _doc(legal_url, "Stripe: Legal Terms", "Stripe, Inc. operates global payments.", ptype=PageType.OTHER),
    })

    with patch("crawling.acquirer._CONVENTIONAL_PATHS", []):
        acquirer = FirstPartyAcquirer(crawl_manager=crawl)
        bundle = acquirer.acquire(url)
        assert len(bundle.secondary_docs) == 0


def test_contract_d_html_link_route_discovery():
    """Acquisition Contract D: Dynamically extracts first-party identity links from raw homepage HTML
    that do not exist in conventional path dictionaries."""
    url = "https://palantir.com"
    dyn_url = "https://palantir.com/corporate/leadership"

    hp_html = f"""
    <html><body>
        <header><h1>Palantir</h1></header>
        <footer><a href="/corporate/leadership">Corporate Leadership</a></footer>
    </body></html>
    """

    crawl = _DeterministicCrawlManager({
        url: _doc(url, "Palantir", "Palantir software.", raw_html=hp_html, ptype=PageType.HOMEPAGE),
        dyn_url: _doc(dyn_url, "Palantir Leadership", "Palantir Technologies Inc. is headquartered in Denver.", ptype=PageType.ABOUT),
    })

    acquirer = FirstPartyAcquirer(crawl_manager=crawl)
    bundle = acquirer.acquire(url)

    discovered = [d for d in bundle.secondary_docs if d.doc.url == dyn_url]
    assert len(discovered) == 1
    assert discovered[0].source == "INTERNAL_LINK"
    assert discovered[0].route_kind in ("ABOUT", "COMPANY")


def test_contract_d_mutation_without_html_link_extraction():
    """Mutation Contract D: Disabling dynamic HTML link extraction prevents non-conventional routes
    from being acquired."""
    url = "https://palantir.com"
    dyn_url = "https://palantir.com/corporate/leadership"

    hp_html = f"""
    <html><body>
        <header><h1>Palantir</h1></header>
        <footer><a href="/corporate/leadership">Corporate Leadership</a></footer>
    </body></html>
    """

    crawl = _DeterministicCrawlManager({
        url: _doc(url, "Palantir", "Palantir software.", raw_html=hp_html, ptype=PageType.HOMEPAGE),
        dyn_url: _doc(dyn_url, "Palantir Leadership", "Palantir Technologies Inc. is headquartered in Denver.", ptype=PageType.ABOUT),
    })

    with patch("crawling.acquirer.extract_identity_candidates", return_value=[]):
        acquirer = FirstPartyAcquirer(crawl_manager=crawl)
        bundle = acquirer.acquire(url)
        discovered = [d for d in bundle.secondary_docs if d.doc.url == dyn_url]
        assert len(discovered) == 0


def test_contract_e_same_domain_redirect_normalization():
    """Acquisition Contract E: Normalizes an already-resolved localized final_url
    (e.g., https://personio.com/de-de/ueber-uns) within the same registrable domain,
    allowing statutory routes like /impressum to be discovered on the canonical domain."""
    url = "https://personio.com"
    localized_final_url = "https://personio.com/de-de/ueber-uns"
    impressum_url = "https://personio.com/impressum"

    crawl = _DeterministicCrawlManager({
        url: _doc(url, "Personio HR", "Personio software.", final_url=localized_final_url, ptype=PageType.HOMEPAGE),
        impressum_url: _doc(impressum_url, "Impressum | Personio", "Personio SE & Co. KG, Munich.", ptype=PageType.OTHER),
    })

    acquirer = FirstPartyAcquirer(crawl_manager=crawl)
    bundle = acquirer.acquire(url)

    assert bundle.homepage_doc.final_url == localized_final_url
    impressum_secondaries = [d for d in bundle.secondary_docs if d.doc.url == impressum_url]
    assert len(impressum_secondaries) == 1


def test_contract_f_domain_boundary_protection():
    """Acquisition Contract F: External third-party links on the homepage (e.g. partner or phishing domains)
    must NEVER be added to secondary_docs as first-party documents."""
    url = "https://mycompany.com"
    external_url = "https://external-partner.com/about"

    hp_html = f"""
    <html><body>
        <h1>MyCompany</h1>
        <a href="{external_url}">External Partner</a>
        <a href="https://twitter.com/mycompany">Twitter</a>
    </body></html>
    """

    crawl = _DeterministicCrawlManager({
        url: _doc(url, "MyCompany", "MyCompany home.", raw_html=hp_html, ptype=PageType.HOMEPAGE),
        external_url: _doc(external_url, "External Partner", "Partner info.", ptype=PageType.ABOUT),
    })

    acquirer = FirstPartyAcquirer(crawl_manager=crawl)
    bundle = acquirer.acquire(url)

    # Must NOT contain external domains
    external_docs = [d for d in bundle.secondary_docs if "external-partner.com" in d.doc.url or "twitter.com" in d.doc.url]
    assert len(external_docs) == 0


def test_contract_g_duplicate_and_soft_404_filtering():
    """Acquisition Contract G: Filters out duplicate catch-all SPA pages and soft-404 error responses,
    ensuring only genuine identity-bearing documents enter secondary_docs."""
    url = "https://spa-app.com"
    dup_url = "https://spa-app.com/about"
    soft404_url = "https://spa-app.com/company"
    valid_legal_url = "https://spa-app.com/legal"

    hp_text = "This is the primary single page application marketing shell."
    soft404_text = "404 not found. The page cannot be found."
    legal_text = "These legal terms govern App Corp. Registered in Delaware."

    crawl = _DeterministicCrawlManager({
        url: _doc(url, "SPA App", hp_text, ptype=PageType.HOMEPAGE),
        dup_url: _doc(dup_url, "SPA App", hp_text, ptype=PageType.ABOUT),  # Duplicate content
        soft404_url: _doc(soft404_url, "Page Not Found", soft404_text, ptype=PageType.OTHER),  # Soft 404
        valid_legal_url: _doc(valid_legal_url, "App Corp Legal", legal_text, ptype=PageType.OTHER),
    })

    acquirer = FirstPartyAcquirer(crawl_manager=crawl)
    bundle = acquirer.acquire(url)

    acquired_urls = [d.doc.url for d in bundle.secondary_docs]
    assert dup_url not in acquired_urls, "Duplicate content SPA shell must be filtered out"
    assert soft404_url not in acquired_urls, "Soft 404 error page must be filtered out"
    assert valid_legal_url in acquired_urls, "Valid legal document must be acquired"


def test_contract_h_complete_acquisition_failure():
    """Acquisition Contract H: When all network requests fail, acquirer returns an explicit
    failure state (HTTP_ERROR / BLOCKED) with 0 secondary documents and no fabricated content."""
    url = "https://unreachable-corp.io"

    crawl = _DeterministicCrawlManager({
        url: _blocked_doc(url, status_code=500),
    })

    acquirer = FirstPartyAcquirer(crawl_manager=crawl)
    bundle = acquirer.acquire(url)

    assert bundle.homepage_doc.quality == DocumentQuality.HTTP_ERROR
    assert len(bundle.secondary_docs) == 0


# ==============================================================================
# SECTION 2: Verification Layer Contract Tests (WebsiteVerifier over AcquiredSiteDocuments)
# ==============================================================================

def test_verifier_contract_primary():
    """Verifier Contract: Classifies SiteRelationship.PRIMARY when supplied with an
    AcquiredSiteDocuments bundle having valid entity title match and secondary corroboration."""
    company = "Linear"
    url = "https://linear.app"

    bundle = AcquiredSiteDocuments(
        homepage_doc=_doc(url, "Linear – Issue Tracking", "Linear is an issue tracker.", ptype=PageType.HOMEPAGE),
        secondary_docs=[
            AcquiredDocument(
                doc=_doc(f"{url}/about", "About Linear", "Linear builds issue tracking software.", ptype=PageType.ABOUT),
                route_kind="ABOUT",
                source="CONVENTIONAL_PATH",
                strength="strong",
            ),
        ],
    )

    verifier = WebsiteVerifier()
    rel, msg, evidence = verifier.classify_relationship(company, url, acquisition=bundle)

    assert rel == SiteRelationship.PRIMARY
    assert any(ev.type == EvidenceType.SELF_IDENTITY for ev in evidence)


def test_verifier_contract_related():
    """Verifier Contract: Classifies SiteRelationship.RELATED when acquired documents
    indicate a subordinate or product relationship (e.g. 'v0 is a product of Vercel')."""
    company = "Vercel"
    url = "https://v0.dev"

    bundle = AcquiredSiteDocuments(
        homepage_doc=_doc(url, "v0 by Vercel", "v0 is a generative UI tool. A product of Vercel.", ptype=PageType.HOMEPAGE),
        secondary_docs=[],
    )

    verifier = WebsiteVerifier()
    rel, msg, evidence = verifier.classify_relationship(company, url, acquisition=bundle)

    assert rel == SiteRelationship.RELATED
    assert any(ev.type == EvidenceType.RELATIONSHIP for ev in evidence)


def test_verifier_contract_legacy():
    """Verifier Contract: Classifies SiteRelationship.LEGACY when entity matches in title
    and secondary page, but the domain has no correspondence (rebranded / acquired asset)."""
    company = "Moniepoint"
    url = "https://monnify.com"

    bundle = AcquiredSiteDocuments(
        homepage_doc=_doc(url, "Moniepoint: Payment Portal", "Moniepoint payment services.", ptype=PageType.HOMEPAGE),
        secondary_docs=[
            AcquiredDocument(
                doc=_doc(f"{url}/about", "About Moniepoint", "Moniepoint financial group operations.", ptype=PageType.ABOUT),
                route_kind="ABOUT",
                source="CONVENTIONAL_PATH",
                strength="strong",
            ),
        ],
    )

    verifier = WebsiteVerifier()
    rel, msg, evidence = verifier.classify_relationship(company, url, acquisition=bundle)

    assert rel == SiteRelationship.LEGACY


def test_verifier_contract_unknown_when_uncorroborated():
    """Verifier Contract: Classifies SiteRelationship.UNKNOWN when homepage has only weak name presence
    and secondary documents provide no corroboration."""
    company = "ThinBrand"
    url = "https://thinbrand.com"

    bundle = AcquiredSiteDocuments(
        homepage_doc=_doc(url, "Welcome to Our Platform", "We stock ThinBrand widgets.", ptype=PageType.HOMEPAGE),
        secondary_docs=[],
    )

    verifier = WebsiteVerifier()
    rel, msg, evidence = verifier.classify_relationship(company, url, acquisition=bundle)

    assert rel == SiteRelationship.UNKNOWN


def test_verifier_contract_indexed_fallback_semantic_separation():
    """Verifier Contract: When homepage acquisition is BLOCKED, verifier falls back to
    search-indexed evidence, explicitly tagging evidence as FALLBACK_INDEXED rather than LIVE_FIRST_PARTY."""
    company = "Huel"
    url = "https://huel.com"

    search = _DeterministicSearchProvider(
        company=company,
        domain="huel.com",
        results=[
            SearchResult(title="Huel – Complete Nutrition", url=url, snippet="Huel complete food."),
            SearchResult(title="About Huel – Story", url=f"{url}/about", snippet="Huel Limited was founded in 2015."),
        ],
    )

    # Acquired bundle indicates blocked live crawl
    bundle = AcquiredSiteDocuments(
        homepage_doc=_blocked_doc(url, status_code=403),
        secondary_docs=[],
    )

    verifier = WebsiteVerifier(search_provider=search)
    rel, msg, evidence = verifier.classify_relationship(company, url, acquisition=bundle)

    assert rel == SiteRelationship.PRIMARY
    assert any(ev.type == EvidenceType.FALLBACK_INDEXED for ev in evidence)
    assert not any(ev.type == EvidenceType.PAGE_IDENTITY for ev in evidence)


def test_verifier_contract_rejects_missing_acquisition_bundle():
    """WebsiteVerifier raises ValueError when called without an AcquiredSiteDocuments bundle,
    proving it has no hidden crawler / acquisition mechanism."""
    verifier = WebsiteVerifier()
    with pytest.raises(ValueError, match="requires an AcquiredSiteDocuments bundle"):
        verifier.classify_relationship("Acme", "https://acme.com", acquisition=None)

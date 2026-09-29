import pytest
from datetime import datetime, timezone
from typing import List, Optional

from core.models import (
    DocumentQuality, PageType, DiscoveryPurpose, DiscoveryQuery,
    DiscoveredURL, CrawledDocument, SearchResult, CompanyIdentity,
    IdentityConfidence, IdentityCandidate, SiteRelationship,
    RawResearchPackage,
)
from discovery.scope import DomainScopeFilter
from discovery.classifier import TwoStageClassifier
from discovery.queries import DiscoveryQueryBuilder
from discovery.ranking import DiversityBudgetRanker
from discovery.discoverer import ScopedDiscoverer
from core.urls import canonicalize_url
from pipeline.acquisition import AcquisitionRunner
from search.base import ISearchProvider, SearchProviderError
from search.sanitizer import SearchResultSanitizer
from crawling.evaluator import DocumentQualityEvaluator
from crawling.manager import CrawlManager
from crawling.base import ICrawlerProvider


# ── 1. Discovery Query Generation Tests ───────────────────────────────────────

def test_discovery_query_builder():
    queries = DiscoveryQueryBuilder.build_queries("linear.app", "Linear")
    assert len(queries) >= 8
    
    purposes = {q.purpose for q in queries}
    assert DiscoveryPurpose.ABOUT in purposes
    assert DiscoveryPurpose.PRODUCT in purposes
    assert DiscoveryPurpose.CAREERS in purposes
    assert DiscoveryPurpose.CUSTOMERS in purposes
    assert DiscoveryPurpose.NEWS in purposes
    assert DiscoveryPurpose.ENGINEERING in purposes
    assert DiscoveryPurpose.CONTACT in purposes
    assert DiscoveryPurpose.ATS in purposes
    
    # Check that ATS queries are isolated per provider
    ats_providers = {q.provider for q in queries if q.purpose == DiscoveryPurpose.ATS}
    assert "greenhouse" in ats_providers
    assert "lever" in ats_providers
    assert "ashby" in ats_providers
    assert "workable" in ats_providers


# ── 2. Domain Scope & ATS Tenant Tests ────────────────────────────────────────

def test_domain_scope_security():
    # Exact domain
    assert DomainScopeFilter.is_allowed("https://moniepoint.com/careers", "moniepoint.com") is True
    # www and non-www interoperability on primary domain
    assert DomainScopeFilter.is_allowed("https://www.moniepoint.com/careers", "moniepoint.com") is True
    assert DomainScopeFilter.is_allowed("https://moniepoint.com/careers", "www.moniepoint.com") is True
    assert DomainScopeFilter.is_allowed("https://www.moniepoint.com/careers", "https://www.moniepoint.com") is True
    assert DomainScopeFilter.is_allowed("https://moniepoint.com/careers", "https://moniepoint.com") is True
    # Subdomain
    assert DomainScopeFilter.is_allowed("https://jobs.moniepoint.com/careers", "moniepoint.com") is True
    # URL with explicit port and userinfo
    assert DomainScopeFilter.is_allowed("https://user:pass@moniepoint.com:8080/careers", "moniepoint.com") is True
    assert DomainScopeFilter.is_allowed("https://user:pass@evil.com:8080/careers", "moniepoint.com") is False
    # Reject malformed suffix domains
    assert DomainScopeFilter.is_allowed("https://evilmoniepoint.com/careers", "moniepoint.com") is False
    assert DomainScopeFilter.is_allowed("https://moniepoint.com.evil.com/careers", "moniepoint.com") is False
    
    # Allowed ATS with matching tenant
    assert DomainScopeFilter.is_allowed(
        "https://boards.greenhouse.io/moniepoint/jobs/123",
        "moniepoint.com",
        company_name="Moniepoint",
    ) is True
    assert DomainScopeFilter.is_allowed(
        "https://jobs.lever.co/stripe",
        "stripe.com",
        company_name="Stripe",
    ) is True
    assert DomainScopeFilter.is_allowed(
        "https://jobs.ashbyhq.com/linear",
        "linear.app",
        company_name="Linear",
    ) is True
    assert DomainScopeFilter.is_allowed(
        "https://moniepoint.workable.com/jobs/123",
        "moniepoint.com",
        company_name="Moniepoint",
    ) is True
    
    # Reject ATS with non-matching tenant (competitor leakage prevention)
    assert DomainScopeFilter.is_allowed(
        "https://boards.greenhouse.io/competitor/jobs/123",
        "moniepoint.com",
        company_name="Moniepoint",
    ) is False
    assert DomainScopeFilter.is_allowed(
        "https://jobs.lever.co/otherco",
        "stripe.com",
        company_name="Stripe",
    ) is False
    
    # Reject evil ATS domain spoofing
    assert DomainScopeFilter.is_allowed("https://evilgreenhouse.io/moniepoint", "moniepoint.com") is False
    assert DomainScopeFilter.is_allowed("https://greenhouse.io.evil.com/moniepoint", "moniepoint.com") is False


def test_domain_scope_rejects_loose_word_collision():
    # Company "Global Media Inc" on domain "globalmedia.com" should not match unrelated tenant "media" or "global"
    assert DomainScopeFilter.is_allowed("https://jobs.lever.co/media", "globalmedia.com", company_name="Global Media Inc") is False
    assert DomainScopeFilter.is_allowed("https://jobs.lever.co/global", "globalmedia.com", company_name="Global Media Inc") is False
    assert DomainScopeFilter.is_allowed("https://jobs.lever.co/globalmedia", "globalmedia.com", company_name="Global Media Inc") is True
    assert DomainScopeFilter.is_allowed("https://jobs.lever.co/global-media", "globalmedia.com", company_name="Global Media Inc") is True


# ── 3. Two-Stage Classification Tests ─────────────────────────────────────────

def test_two_stage_classifier_stage1_url():
    # Root -> HOMEPAGE
    assert TwoStageClassifier.stage1_classify_url("https://acme.com") == PageType.HOMEPAGE
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/") == PageType.HOMEPAGE
    
    # Company / About
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/about") == PageType.ABOUT
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/about-us") == PageType.ABOUT
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/company/our-story") == PageType.ABOUT
    
    # Blog / News / Engineering
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/blog/announcement") == PageType.BLOG
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/news/press-release") == PageType.BLOG
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/engineering/scaling-postgres") == PageType.BLOG
    
    # Customer stories / Case studies
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/customers/stripe") == PageType.CASE_STUDY
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/case-study/enterprise") == PageType.CASE_STUDY
    
    # Contact
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/contact") == PageType.CONTACT
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/contact-us") == PageType.CONTACT
    
    # Careers Index vs Info Subpages vs Job Listings
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/careers") == PageType.CAREERS_INDEX
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/careers/search") == PageType.CAREERS_INDEX
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/careers/benefits") == PageType.OTHER
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/careers/culture") == PageType.OTHER
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/careers/software-engineer") == PageType.JOB_LISTING
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/careers/senior-backend-engineer") == PageType.JOB_LISTING
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/position/12345") == PageType.JOB_LISTING
    assert TwoStageClassifier.stage1_classify_url("https://boards.greenhouse.io/acme/jobs/5551234") == PageType.JOB_LISTING
    assert TwoStageClassifier.stage1_classify_url("https://jobs.lever.co/acme/b12345-6789-abcd") == PageType.JOB_LISTING
    
    # Conservative leaf segment classification (avoiding false-positive job listing classification)
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/careers/engineering-blog") == PageType.BLOG
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/careers/marketing-resources") == PageType.OTHER
    assert TwoStageClassifier.stage1_classify_url("https://acme.com/careers/software-news") == PageType.BLOG


def test_two_stage_classifier_stage2_content():
    # Upgrade CAREERS_INDEX -> JOB_LISTING if single job structure is found
    job_content = (
        "We are looking for a Senior Staff Engineer. "
        "Responsibilities: Architect distributed systems. Lead engineering teams. "
        "Qualifications: 8+ years experience in Python and Rust. "
        "Apply for this job by submitting your resume below."
    )
    refined = TwoStageClassifier.stage2_refine_content(
        provisional=PageType.CAREERS_INDEX,
        title="Senior Staff Engineer",
        content=job_content,
    )
    assert refined == PageType.JOB_LISTING
    
    # Refine OTHER -> ABOUT if mission text is found
    about_content = "About Us: Acme Corp was founded in 2020 with the mission to revolutionize data pipelines."
    refined_about = TwoStageClassifier.stage2_refine_content(
        provisional=PageType.OTHER,
        title="Our Story",
        content=about_content,
    )
    assert refined_about == PageType.ABOUT


# ── 4. Diversity Budget Ranking Tests ─────────────────────────────────────────

def test_diversity_budget_ranker():
    # Create 15 candidates spanning multiple categories with heavy job bias
    candidates = [
        DiscoveredURL(url="https://acme.com/", purpose=DiscoveryPurpose.HOMEPAGE, source="seed", query="", rank=0, provisional_page_type=PageType.HOMEPAGE),
        DiscoveredURL(url="https://acme.com/about", purpose=DiscoveryPurpose.ABOUT, source="serper", query="about", rank=1, provisional_page_type=PageType.ABOUT),
        DiscoveredURL(url="https://acme.com/product", purpose=DiscoveryPurpose.PRODUCT, source="serper", query="product", rank=1, provisional_page_type=PageType.PRODUCT),
        DiscoveredURL(url="https://acme.com/careers", purpose=DiscoveryPurpose.CAREERS, source="serper", query="careers", rank=1, provisional_page_type=PageType.CAREERS_INDEX),
        DiscoveredURL(url="https://acme.com/contact", purpose=DiscoveryPurpose.CONTACT, source="serper", query="contact", rank=1, provisional_page_type=PageType.CONTACT),
        DiscoveredURL(url="https://acme.com/customers/bank", purpose=DiscoveryPurpose.CUSTOMERS, source="serper", query="customers", rank=1, provisional_page_type=PageType.CASE_STUDY),
        DiscoveredURL(url="https://acme.com/blog/launch", purpose=DiscoveryPurpose.NEWS, source="serper", query="news", rank=1, provisional_page_type=PageType.BLOG),
    ]
    # Add 8 job listing candidates
    for i in range(1, 9):
        candidates.append(DiscoveredURL(
            url=f"https://acme.com/careers/job-{i}",
            purpose=DiscoveryPurpose.CAREERS,
            source="serper",
            query="careers",
            rank=i,
            provisional_page_type=PageType.JOB_LISTING,
        ))
        
    ranker = DiversityBudgetRanker()
    budgeted = ranker.select_budgeted_urls(candidates, max_budget=8)
    
    assert len(budgeted) == 8
    
    selected_types = [b.provisional_page_type for b in budgeted]
    # Ensure Homepage, About, Product, Careers Index, Job Listings, Customers/Blog are all represented
    assert PageType.HOMEPAGE in selected_types
    assert PageType.ABOUT in selected_types
    assert PageType.PRODUCT in selected_types
    assert PageType.CAREERS_INDEX in selected_types
    assert PageType.JOB_LISTING in selected_types
    assert PageType.CASE_STUDY in selected_types or PageType.BLOG in selected_types
    
    # Ensure job listings did not crowd out all 8 slots (max job quota is 2 in pass 1)
    job_count = sum(1 for t in selected_types if t == PageType.JOB_LISTING)
    assert job_count <= 3


def test_diversity_budget_empty():
    ranker = DiversityBudgetRanker()
    assert ranker.select_budgeted_urls([]) == []
    assert ranker.select_budgeted_urls([], max_budget=0) == []


# ── 5. Canonicalization Tests ─────────────────────────────────────────────────

def test_url_canonicalization():
    # Trailing slash on path stripped
    assert canonicalize_url("https://acme.com/about/") == "https://acme.com/about"
    # Root slash preserved
    assert canonicalize_url("https://acme.com/") == "https://acme.com/"
    assert canonicalize_url("https://acme.com") == "https://acme.com/"
    
    # Lowercase host and www removal
    assert canonicalize_url("https://WWW.Acme.COM/about") == "https://acme.com/about"
    
    # Fragment stripped
    assert canonicalize_url("https://acme.com/about#team-section") == "https://acme.com/about"
    
    # Tracking parameters stripped
    url_with_tracking = "https://acme.com/about?utm_source=twitter&utm_medium=social&ref=footer&srsltid=123"
    assert canonicalize_url(url_with_tracking) == "https://acme.com/about"
    
    # Substantive query params preserved
    url_with_search = "https://acme.com/search?q=engineer&location=remote"
    assert canonicalize_url(url_with_search) == "https://acme.com/search?location=remote&q=engineer"

    # www vs non-www equivalence
    assert canonicalize_url("https://www.domain.com") == canonicalize_url("https://domain.com")
    assert canonicalize_url("https://www.domain.com/careers/") == canonicalize_url("https://domain.com/careers")
    assert canonicalize_url("http://WWW.DOMAIN.COM") == "http://domain.com/"


def test_normalize_domain():
    from core.urls import normalize_domain
    assert normalize_domain("domain.com") == "domain.com"
    assert normalize_domain("www.domain.com") == "domain.com"
    assert normalize_domain("https://www.domain.com") == "domain.com"
    assert normalize_domain("HTTPS://DOMAIN.COM/") == "domain.com"
    assert normalize_domain("https://user:pass@www.domain.com:443/path") == "domain.com"
    assert normalize_domain("https://www2.domain.com") == "www2.domain.com"
    assert normalize_domain("WWW.Acme.COM:8080") == "acme.com"
    assert normalize_domain("acme.com/") == "acme.com"
    assert normalize_domain("www.stripe.com") == "stripe.com"
    assert normalize_domain("") == ""
    assert normalize_domain("   ") == ""


def test_url_canonicalization_invalid_inputs():
    assert canonicalize_url("") == ""
    assert canonicalize_url("not-a-url") == ""
    assert canonicalize_url("/relative/path") == ""
    assert canonicalize_url("javascript:alert(1)") == ""
    assert canonicalize_url("ftp://example.com/file") == ""


# ── 6. Document Quality Evaluator Tests ───────────────────────────────────────

def test_document_quality_evaluator():
    # 403 / 401 / 429 -> BLOCKED
    doc_blocked = CrawledDocument(url="x", final_url="x", status_code=403, retrieved_at=datetime(2024, 1, 1), page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_blocked) == DocumentQuality.BLOCKED
    
    # 500 / 404 -> HTTP_ERROR
    doc_500 = CrawledDocument(url="x", final_url="x", status_code=500, retrieved_at=datetime(2024, 1, 1), page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_500) == DocumentQuality.HTTP_ERROR
    
    # 200 + empty content -> EXTRACTION_FAILED
    doc_empty = CrawledDocument(url="x", final_url="x", status_code=200, content="", retrieved_at=datetime(2024, 1, 1), page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_empty) == DocumentQuality.EXTRACTION_FAILED
    
    # Contact page: 25 words -> VALID (threshold is 20)
    doc_contact = CrawledDocument(
        url="x", final_url="x", status_code=200,
        content="Contact us at support@acme.com or call 555-1234. Headquarters: 100 Market St, San Francisco, CA. Send inquiries anytime.",
        word_count=22, retrieved_at=datetime(2024, 1, 1), page_type=PageType.CONTACT,
    )
    assert DocumentQualityEvaluator.evaluate(doc_contact) == DocumentQuality.VALID
    
    # About page: 25 words -> TOO_SHORT (threshold is 100)
    doc_about_short = CrawledDocument(
        url="x", final_url="x", status_code=200, content="Short about text " * 5,
        word_count=15, retrieved_at=datetime(2024, 1, 1), page_type=PageType.ABOUT,
    )
    assert DocumentQualityEvaluator.evaluate(doc_about_short) == DocumentQuality.TOO_SHORT
    
    # About page: >= 100 words -> VALID
    doc_about_valid = CrawledDocument(
        url="x", final_url="x", status_code=200, content="Comprehensive company mission and vision " * 30,
        word_count=150, retrieved_at=datetime(2024, 1, 1), page_type=PageType.ABOUT,
    )
    assert DocumentQualityEvaluator.evaluate(doc_about_valid) == DocumentQuality.VALID
    
    # Homepage: >= 80 words -> VALID, < 80 -> TOO_SHORT
    doc_hp_valid = CrawledDocument(
        url="x", final_url="x", status_code=200, content="Welcome to the homepage of our product " * 20,
        word_count=90, retrieved_at=datetime(2024, 1, 1), page_type=PageType.HOMEPAGE,
    )
    assert DocumentQualityEvaluator.evaluate(doc_hp_valid) == DocumentQuality.VALID
    
    # Cloudflare challenge interception -> BLOCKED
    doc_cf = CrawledDocument(
        url="x", final_url="x", status_code=200,
        title="Just a moment...",
        content="Checking your browser before accessing acme.com. Enable JavaScript and cookies to continue.",
        word_count=20, retrieved_at=datetime(2024, 1, 1), page_type=PageType.ABOUT,
    )
    assert DocumentQualityEvaluator.evaluate(doc_cf) == DocumentQuality.BLOCKED
    
    # Connection error / timeout -> FETCH_FAILED
    doc_timeout = CrawledDocument(url="x", final_url="x", status_code=None, error="Connection timed out after 10s", retrieved_at=datetime(2024, 1, 1), page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_timeout) == DocumentQuality.FETCH_FAILED


# ── 7. Search Sanitizer Tests ─────────────────────────────────────────────────

def test_search_sanitization():
    raw_results = [
        SearchResult(title="Good", url="https://acme.com", snippet=""),
        SearchResult(title="Ad", url="https://googleadservices.com/pagead/aclk?id=123", snippet=""),
        SearchResult(title="Redirect", url="https://google.com/url?q=https://acme.com/unwrapped", snippet=""),
    ]
    clean = SearchResultSanitizer.sanitize(raw_results)
    assert len(clean) == 2
    assert clean[0].url == "https://acme.com"
    assert clean[1].url == "https://acme.com/unwrapped"


# ── 8. Crawl Manager Best-Attempt Selection Tests ─────────────────────────────

def test_crawl_manager_best_attempt_selection():
    # Case 1: Browser fallback succeeds with VALID after static returned TOO_SHORT
    class _ShortStatic(ICrawlerProvider):
        def fetch(self, url: str, page_type: PageType = PageType.OTHER) -> CrawledDocument:
            return CrawledDocument(
                url=url, final_url=url, status_code=200, title="Short",
                content="Short snippet of text.", word_count=5, page_type=page_type,
                quality=DocumentQuality.TOO_SHORT, retrieved_at=datetime.now(timezone.utc),
            )

    class _ValidBrowser(ICrawlerProvider):
        def fetch(self, url: str, page_type: PageType = PageType.OTHER) -> CrawledDocument:
            return CrawledDocument(
                url=url, final_url=url, status_code=200, title="Full Page",
                content="Comprehensive and long text content " * 30, word_count=180,
                page_type=page_type, quality=DocumentQuality.VALID,
                retrieved_at=datetime.now(timezone.utc),
            )

    mgr = CrawlManager(_ShortStatic(), _ValidBrowser())
    res = mgr.fetch_with_fallback("https://acme.com/about", PageType.ABOUT)
    assert res.quality == DocumentQuality.VALID
    assert res.fetch_strategy == "BROWSER"
    assert len(res.attempts) == 2

    # Case 2: Browser fallback fails (EXTRACTION_FAILED) after static had 40 words (TOO_SHORT) -> preserves static
    class _FailedBrowser(ICrawlerProvider):
        def fetch(self, url: str, page_type: PageType = PageType.OTHER) -> CrawledDocument:
            return CrawledDocument(
                url=url, final_url=url, status_code=200, title="Empty",
                content="", word_count=0, page_type=page_type,
                quality=DocumentQuality.EXTRACTION_FAILED, retrieved_at=datetime.now(timezone.utc),
            )

    mgr2 = CrawlManager(_ShortStatic(), _FailedBrowser())
    res2 = mgr2.fetch_with_fallback("https://acme.com/about", PageType.ABOUT)
    # Static attempt was TOO_SHORT (quality 5), browser was EXTRACTION_FAILED (quality 3) -> preserves static
    assert res2.quality == DocumentQuality.TOO_SHORT
    assert res2.word_count == 5
    assert len(res2.attempts) == 2


# ── 9. End-to-End Acquisition Runner Tests ────────────────────────────────────

class _MockResolver:
    def __init__(self, confidence=IdentityConfidence.CONFIDENT, domain="acme.com"):
        self.confidence = confidence
        self.domain = domain
    def resolve(self, company_name, context=None):
        return CompanyIdentity(
            name=company_name,
            domain=self.domain,
            website_url=f"https://{self.domain}",
            confidence=self.confidence,
            reasoning="Mock resolved identity",
            candidates=[
                IdentityCandidate(
                    domain=self.domain,
                    is_verified=True,
                    relationship=SiteRelationship.PRIMARY,
                )
            ]
        )

class _MockDiscoverySearch(ISearchProvider):
    def __init__(self, results_by_query=None):
        self.results_by_query = results_by_query or {}
    @property
    def name(self) -> str:
        return "mock_discovery_search"
    def search(self, query: str, num_results: int = 5):
        return self.results_by_query.get(query, [
            SearchResult(title="About Acme", url="https://acme.com/about", snippet=""),
            SearchResult(title="Careers at Acme", url="https://acme.com/careers", snippet=""),
            SearchResult(title="Software Engineer Job", url="https://acme.com/careers/software-engineer", snippet=""),
        ])

class _MockCrawler(ICrawlerProvider):
    def fetch(self, url: str, page_type: PageType = PageType.OTHER) -> CrawledDocument:
        return CrawledDocument(
            url=url, final_url=url, status_code=200,
            title=f"Title for {url}",
            content=f"Content for {url} with plenty of words to make it valid and research-grade. " * 20,
            word_count=300,
            page_type=page_type,
            quality=DocumentQuality.VALID,
            retrieved_at=datetime.now(timezone.utc),
        )

def test_acquisition_runner_successful_flow():
    resolver = _MockResolver(confidence=IdentityConfidence.CONFIDENT, domain="acme.com")
    search_prov = _MockDiscoverySearch()
    discoverer = ScopedDiscoverer(search_prov)
    ranker = DiversityBudgetRanker()
    crawler = _MockCrawler()
    crawl_mgr = CrawlManager(crawler, crawler)
    
    runner = AcquisitionRunner(resolver, discoverer, ranker, crawl_mgr, max_crawl_budget=5)
    package = runner.run("Acme")
    
    assert package.identity.confidence == IdentityConfidence.CONFIDENT
    assert len(package.documents) > 0
    assert len(package.documents) <= 5
    
    # Check that documents have provenance attached
    for doc in package.documents:
        assert doc.quality == DocumentQuality.VALID
        assert doc.source_query is not None
        assert doc.page_type in [
            PageType.HOMEPAGE, PageType.ABOUT, PageType.CAREERS_INDEX,
            PageType.JOB_LISTING, PageType.PRODUCT, PageType.OTHER,
        ]

def test_acquisition_runner_aborts_on_ambiguous_identity():
    resolver = _MockResolver(confidence=IdentityConfidence.AMBIGUOUS, domain="acme.com")
    search_prov = _MockDiscoverySearch()
    discoverer = ScopedDiscoverer(search_prov)
    ranker = DiversityBudgetRanker()
    crawler = _MockCrawler()
    crawl_mgr = CrawlManager(crawler, crawler)
    
    runner = AcquisitionRunner(resolver, discoverer, ranker, crawl_mgr)
    package = runner.run("Acme")
    
    assert package.identity.confidence == IdentityConfidence.AMBIGUOUS
    assert len(package.documents) == 0


def test_scoped_discoverer_catches_search_provider_error():
    class _FailingSearch(ISearchProvider):
        @property
        def name(self) -> str:
            return "failing_search"
        def search(self, query: str, num_results: int = 5):
            raise SearchProviderError("API rate limit exceeded")

    discoverer = ScopedDiscoverer(_FailingSearch())
    # Should catch SearchProviderError gracefully and return seed homepage
    results = discoverer.discover("acme.com", "Acme")
    assert len(results) == 1
    assert results[0].url == "https://acme.com/"


def test_scoped_discoverer_propagates_unexpected_exceptions():
    class _BuggySearch(ISearchProvider):
        @property
        def name(self) -> str:
            return "buggy_search"
        def search(self, query: str, num_results: int = 5):
            raise TypeError("Unexpected programming error inside search provider")

    discoverer = ScopedDiscoverer(_BuggySearch())
    # Unexpected TypeError must not be swallowed
    with pytest.raises(TypeError, match="Unexpected programming error"):
        discoverer.discover("acme.com", "Acme")


def test_verifier_catches_search_provider_error_in_corroboration():
    from identity.verifier import WebsiteVerifier
    
    class _FailingSearch(ISearchProvider):
        @property
        def name(self) -> str:
            return "failing_search"
        def search(self, query: str, num_results: int = 5):
            raise SearchProviderError("Secondary search query failed")

    class _MockCrawler(ICrawlerProvider):
        def fetch(self, url: str, page_type: PageType = PageType.OTHER) -> CrawledDocument:
            return CrawledDocument(
                url=url, final_url=url, status_code=200,
                title="Acme Corporation | Homepage",
                content="Welcome to Acme Corporation. We make everything.",
                word_count=100, page_type=page_type, quality=DocumentQuality.VALID,
                retrieved_at=datetime.now(timezone.utc),
            )

    crawler = _MockCrawler()
    crawl_mgr = CrawlManager(crawler, crawler)
    verifier = WebsiteVerifier(crawl_mgr, _FailingSearch())
    
    # Even if secondary search raises SearchProviderError, fallback /about check runs safely
    rel, msg, ev = verifier.classify_relationship("Acme Corporation", "https://acme.com")
    assert rel in [SiteRelationship.PRIMARY, SiteRelationship.UNKNOWN]

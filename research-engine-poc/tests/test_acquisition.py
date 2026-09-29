import pytest
from datetime import datetime, timezone
from typing import List, Optional

from core.models import (
    DocumentQuality, PageType, CrawledDocument, SearchResult,
    CompanyIdentity, IdentityConfidence, IdentityCandidate,
    SiteRelationship, RawResearchPackage,
)
from pipeline.discovery import DomainScopeFilter, URLClassifier
from pipeline.acquisition import canonicalize_url, AcquisitionRunner
from search.sanitizer import SearchResultSanitizer
from crawling.evaluator import DocumentQualityEvaluator
from crawling.manager import CrawlManager
from crawling.base import ICrawlerProvider


# ── Domain Scope & ATS Tenant Tests ──────────────────────────────────────────

def test_domain_scope_security():
    # Should accept exact domain
    assert DomainScopeFilter.is_allowed("https://moniepoint.com/careers", "moniepoint.com") is True
    # Should accept subdomain
    assert DomainScopeFilter.is_allowed("https://jobs.moniepoint.com/careers", "moniepoint.com") is True
    # Should reject malformed suffix domains
    assert DomainScopeFilter.is_allowed("https://evilmoniepoint.com/careers", "moniepoint.com") is False
    assert DomainScopeFilter.is_allowed("https://moniepoint.com.evil.com/careers", "moniepoint.com") is False
    
    # Should accept allowed ATS with matching tenant
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
        "https://moniepoint.workable.com/jobs/123",
        "moniepoint.com",
        company_name="Moniepoint",
    ) is True
    
    # Should reject ATS with non-matching tenant (competitor leakage)
    assert DomainScopeFilter.is_allowed(
        "https://boards.greenhouse.io/competitor/jobs/123",
        "moniepoint.com",
        company_name="Moniepoint",
    ) is False
    
    # Should reject evil ATS domain spoofing
    assert DomainScopeFilter.is_allowed("https://evilgreenhouse.io/moniepoint", "moniepoint.com") is False
    assert DomainScopeFilter.is_allowed("https://greenhouse.io.evil.com/moniepoint", "moniepoint.com") is False


# ── URL Classification Tests ──────────────────────────────────────────────────

def test_url_classification():
    # Job indexes
    assert URLClassifier.classify("https://acme.com/careers") == PageType.CAREERS_INDEX
    assert URLClassifier.classify("https://acme.com/careers/search") == PageType.CAREERS_INDEX
    assert URLClassifier.classify("https://acme.com/jobs") == PageType.CAREERS_INDEX
    assert URLClassifier.classify("https://acme.com/jobs/all") == PageType.CAREERS_INDEX
    
    # Careers sub-pages (info, culture, perks) -> OTHER
    assert URLClassifier.classify("https://acme.com/careers/benefits") == PageType.OTHER
    assert URLClassifier.classify("https://acme.com/careers/culture") == PageType.OTHER
    assert URLClassifier.classify("https://acme.com/careers/values") == PageType.OTHER
    
    # Real job listing patterns
    assert URLClassifier.classify("https://acme.com/careers/software-engineer") == PageType.JOB_LISTING
    assert URLClassifier.classify("https://acme.com/careers/senior-product-manager") == PageType.JOB_LISTING
    assert URLClassifier.classify("https://acme.com/position/12345") == PageType.JOB_LISTING
    assert URLClassifier.classify("https://acme.com/jobs/987654") == PageType.JOB_LISTING
    assert URLClassifier.classify("https://boards.greenhouse.io/acme/jobs/5551234") == PageType.JOB_LISTING
    assert URLClassifier.classify("https://jobs.lever.co/acme/b12345-6789-abcd") == PageType.JOB_LISTING
    
    # Other types
    assert URLClassifier.classify("https://acme.com/about") == PageType.ABOUT
    assert URLClassifier.classify("https://acme.com/company/our-story") == PageType.ABOUT
    assert URLClassifier.classify("https://acme.com/contact") == PageType.CONTACT
    assert URLClassifier.classify("https://acme.com/product/features") == PageType.PRODUCT
    assert URLClassifier.classify("https://acme.com/blog/latest-release") == PageType.BLOG
    assert URLClassifier.classify("https://acme.com/case-study/client") == PageType.CASE_STUDY


# ── Canonicalization Tests ────────────────────────────────────────────────────

def test_url_canonicalization():
    # Trailing slash on path stripped
    assert canonicalize_url("https://acme.com/about/") == "https://acme.com/about"
    # Root slash preserved
    assert canonicalize_url("https://acme.com/") == "https://acme.com/"
    assert canonicalize_url("https://acme.com") == "https://acme.com/"
    
    # Lowercasing host and www stripping
    assert canonicalize_url("https://WWW.Acme.COM/about") == "https://acme.com/about"
    
    # Fragment stripped
    assert canonicalize_url("https://acme.com/about#team-section") == "https://acme.com/about"
    
    # Tracking parameters stripped
    url_with_tracking = "https://acme.com/about?utm_source=twitter&utm_medium=social&ref=footer&srsltid=123"
    assert canonicalize_url(url_with_tracking) == "https://acme.com/about"
    
    # Substantive query params preserved
    url_with_search = "https://acme.com/search?q=engineer&location=remote"
    assert canonicalize_url(url_with_search) == "https://acme.com/search?location=remote&q=engineer"


# ── Document Quality Evaluator Tests ──────────────────────────────────────────

def test_document_quality_evaluator():
    # 403 / 401 / 429 -> BLOCKED
    doc_blocked = CrawledDocument(url="x", final_url="x", status_code=403, retrieved_at=datetime(2024, 1, 1), page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_blocked) == DocumentQuality.BLOCKED
    
    # 500 / 404 -> HTTP_ERROR
    doc_500 = CrawledDocument(url="x", final_url="x", status_code=500, retrieved_at=datetime(2024, 1, 1), page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_500) == DocumentQuality.HTTP_ERROR
    
    # 200 + no content -> EXTRACTION_FAILED
    doc_empty = CrawledDocument(url="x", final_url="x", status_code=200, content="", retrieved_at=datetime(2024, 1, 1), page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_empty) == DocumentQuality.EXTRACTION_FAILED
    
    # Contact page: 40 words -> VALID (threshold is 30)
    doc_contact = CrawledDocument(
        url="x", final_url="x", status_code=200,
        content="Contact us at hello@acme.com or call 555-1234. Our office is open Monday to Friday 9am to 5pm in San Francisco.",
        word_count=25, retrieved_at=datetime(2024, 1, 1), page_type=PageType.CONTACT,
    )
    # Give it 35 words
    doc_contact.content = "Contact us at support@acme.com or call 555-1234. Our headquarters are located at 100 Market St, San Francisco, CA. Send us any inquiries or feedback anytime."
    doc_contact.word_count = len(doc_contact.content.split())
    assert DocumentQualityEvaluator.evaluate(doc_contact) == DocumentQuality.VALID
    
    # About page: 40 words -> TOO_SHORT (threshold is 100)
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


# ── Search Sanitizer Tests ────────────────────────────────────────────────────

def test_search_sanitization():
    raw_results = [
        SearchResult(title="Good", url="https://acme.com", snippet=""),
        SearchResult(title="Ad", url="https://bing.com/aclick?id=123", snippet=""),
        SearchResult(title="Ad 2", url="https://google.com/url?sa=t", snippet=""),
    ]
    clean = SearchResultSanitizer.sanitize(raw_results)
    assert len(clean) == 1
    assert clean[0].url == "https://acme.com"


# ── End-to-End Acquisition Runner Tests ───────────────────────────────────────

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

class _MockDiscoverySearch:
    def __init__(self, results_by_query=None):
        self.results_by_query = results_by_query or {}
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
    crawler = _MockCrawler()
    crawl_mgr = CrawlManager(crawler, crawler)
    
    runner = AcquisitionRunner(resolver, search_prov, crawl_mgr, max_crawl_budget=5)
    package = runner.run("Acme")
    
    assert package.identity.confidence == IdentityConfidence.CONFIDENT
    assert len(package.documents) > 0
    assert len(package.documents) <= 5
    
    # Check that documents have provenance attached
    for doc in package.documents:
        assert doc.quality == DocumentQuality.VALID
        assert doc.source_query is not None
        assert doc.page_type in [PageType.ABOUT, PageType.CAREERS_INDEX, PageType.JOB_LISTING, PageType.PRODUCT, PageType.OTHER]

def test_acquisition_runner_aborts_on_ambiguous_identity():
    resolver = _MockResolver(confidence=IdentityConfidence.AMBIGUOUS, domain="acme.com")
    search_prov = _MockDiscoverySearch()
    crawler = _MockCrawler()
    crawl_mgr = CrawlManager(crawler, crawler)
    
    runner = AcquisitionRunner(resolver, search_prov, crawl_mgr)
    package = runner.run("Acme")
    
    assert package.identity.confidence == IdentityConfidence.AMBIGUOUS
    assert len(package.documents) == 0

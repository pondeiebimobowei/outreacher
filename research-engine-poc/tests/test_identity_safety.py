import pytest
from core.models import DocumentQuality, PageType, CrawledDocument, SearchResult, IdentityConfidence
from pipeline.discovery import URLClassifier
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver

class MockSearchProvider:
    def __init__(self, results=None):
        self.results = results or []
    def search(self, query, num_results=5):
        return self.results

class MockCrawlManager:
    def __init__(self, responses):
        self.responses = responses
    def fetch_with_fallback(self, url, page_type):
        return self.responses.get(url, CrawledDocument(
            url=url, final_url=url, status_code=404, retrieved_at="2024-01-01T00:00:00Z", 
            page_type=page_type, quality=DocumentQuality.HTTP_ERROR
        ))

def test_url_classifier_prioritizes_blog():
    assert URLClassifier.classify("https://acme.com/blog/company-news") == PageType.BLOG
    assert URLClassifier.classify("https://acme.com/company/about") == PageType.ABOUT

def test_homepage_only_never_produces_confident():
    search = MockSearchProvider([SearchResult(title="Acme Corp", url="https://acme.com", snippet="")])
    crawler = MockCrawlManager({
        "https://acme.com": CrawledDocument(
            url="https://acme.com", final_url="https://acme.com", status_code=200, 
            retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER, quality=DocumentQuality.VALID,
            title="Acme Corp", content="Welcome to Acme Corp."
        )
    })
    
    verifier = WebsiteVerifier(crawler, search)
    resolver = IdentityResolver(search, verifier)
    
    identity = resolver.resolve("Acme Corp")
    assert identity.confidence == IdentityConfidence.AMBIGUOUS
    assert "uncorroborated" in identity.reasoning

def test_blog_mention_does_not_corroborate():
    search = MockSearchProvider([
        SearchResult(title="Acme Corp", url="https://acme.com", snippet=""),
        SearchResult(title="Acme Corp Blog", url="https://acme.com/blog/company", snippet="")
    ])
    
    crawler = MockCrawlManager({
        "https://acme.com": CrawledDocument(
            url="https://acme.com", final_url="https://acme.com", status_code=200, 
            retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER, quality=DocumentQuality.VALID,
            title="Acme Corp", content="Welcome."
        ),
        "https://acme.com/blog/company": CrawledDocument(
            url="https://acme.com/blog/company", final_url="https://acme.com/blog/company", status_code=200, 
            retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.BLOG, quality=DocumentQuality.VALID,
            title="Blog", content="Acme Corp launched a new product."
        )
    })
    
    verifier = WebsiteVerifier(crawler, search)
    resolver = IdentityResolver(search, verifier)
    
    identity = resolver.resolve("Acme Corp")
    assert identity.confidence == IdentityConfidence.AMBIGUOUS

def test_close_candidates_both_verify():
    search = MockSearchProvider([
        SearchResult(title="Acme Corp", url="https://acme.com", snippet=""),
        SearchResult(title="Acme Corp", url="https://acmecorp.io", snippet="")
    ])
    
    crawler = MockCrawlManager({
        "https://acme.com": CrawledDocument(
            url="https://acme.com", final_url="https://acme.com", status_code=200, 
            retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER, quality=DocumentQuality.VALID,
            title="Acme Corp", content="Welcome."
        ),
        "https://acme.com/about": CrawledDocument(
            url="https://acme.com/about", final_url="https://acme.com/about", status_code=200, 
            retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.ABOUT, quality=DocumentQuality.VALID,
            title="About", content="About Acme Corp."
        ),
        "https://acmecorp.io": CrawledDocument(
            url="https://acmecorp.io", final_url="https://acmecorp.io", status_code=200, 
            retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER, quality=DocumentQuality.VALID,
            title="Acme Corp", content="Welcome."
        ),
        "https://acmecorp.io/about": CrawledDocument(
            url="https://acmecorp.io/about", final_url="https://acmecorp.io/about", status_code=200, 
            retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.ABOUT, quality=DocumentQuality.VALID,
            title="About", content="About Acme Corp."
        )
    })
    
    verifier = WebsiteVerifier(crawler, search)
    resolver = IdentityResolver(search, verifier)
    
    identity = resolver.resolve("Acme Corp")
    # Both strongly verify, so we expect AMBIGUOUS
    assert identity.confidence == IdentityConfidence.AMBIGUOUS

import pytest
from core.models import DocumentQuality, PageType, CrawledDocument, SearchResult
from pipeline.discovery import DomainScopeFilter, URLClassifier
from search.sanitizer import SearchResultSanitizer
from crawling.evaluator import DocumentQualityEvaluator

def test_domain_scope_security():
    # Should accept exact domain
    assert DomainScopeFilter.is_allowed("https://moniepoint.com/careers", "moniepoint.com") is True
    # Should accept subdomain
    assert DomainScopeFilter.is_allowed("https://jobs.moniepoint.com/careers", "moniepoint.com") is True
    # Should reject malformed suffix domains
    assert DomainScopeFilter.is_allowed("https://evilmoniepoint.com/careers", "moniepoint.com") is False
    assert DomainScopeFilter.is_allowed("https://moniepoint.com.evil.com/careers", "moniepoint.com") is False
    
    # Should accept allowed ATS
    assert DomainScopeFilter.is_allowed("https://boards.greenhouse.io/moniepoint", "moniepoint.com") is True
    # Should reject evil ATS
    assert DomainScopeFilter.is_allowed("https://evilgreenhouse.io/moniepoint", "moniepoint.com") is False

def test_url_classification():
    # Job listings vs indexes
    assert URLClassifier.classify("https://acme.com/careers") == PageType.CAREERS_INDEX
    assert URLClassifier.classify("https://acme.com/careers/search") == PageType.CAREERS_INDEX
    assert URLClassifier.classify("https://acme.com/careers/benefits") == PageType.OTHER # or ABOUT depending on fine-tuning, but NOT JOB_LISTING
    
    # Real job listing patterns
    assert URLClassifier.classify("https://acme.com/careers/software-engineer") == PageType.JOB_LISTING
    assert URLClassifier.classify("https://acme.com/position/12345") == PageType.JOB_LISTING
    
    # Other types
    assert URLClassifier.classify("https://acme.com/case-study/client") == PageType.CASE_STUDY
    assert URLClassifier.classify("https://acme.com/about") == PageType.ABOUT

def test_document_quality_evaluator():
    # 403 -> BLOCKED
    doc_blocked = CrawledDocument(url="x", final_url="x", status_code=403, retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_blocked) == DocumentQuality.BLOCKED
    
    # 500 -> HTTP_ERROR
    doc_500 = CrawledDocument(url="x", final_url="x", status_code=500, retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_500) == DocumentQuality.HTTP_ERROR
    
    # 200 + no content -> EXTRACTION_FAILED
    doc_200_empty = CrawledDocument(url="x", final_url="x", status_code=200, content="", retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_200_empty) == DocumentQuality.EXTRACTION_FAILED
    
    # 200 + <100 words -> TOO_SHORT
    doc_200_short = CrawledDocument(url="x", final_url="x", status_code=200, content="short content", word_count=50, retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_200_short) == DocumentQuality.TOO_SHORT
    
    # 200 + >= 100 words -> VALID
    doc_200_valid = CrawledDocument(url="x", final_url="x", status_code=200, content="valid content " * 100, word_count=200, retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_200_valid) == DocumentQuality.VALID
    
    # connection error / timeout / failed to download -> FETCH_FAILED
    doc_fetch_failed = CrawledDocument(url="x", final_url="x", status_code=None, error="Failed to download", retrieved_at="2024-01-01T00:00:00Z", page_type=PageType.OTHER)
    assert DocumentQualityEvaluator.evaluate(doc_fetch_failed) == DocumentQuality.FETCH_FAILED

def test_search_sanitization():
    raw_results = [
        SearchResult(title="Good", url="https://acme.com", snippet=""),
        SearchResult(title="Ad", url="https://bing.com/aclick?id=123", snippet=""),
        SearchResult(title="Ad 2", url="https://google.com/url?sa=t", snippet="")
    ]
    clean = SearchResultSanitizer.sanitize(raw_results)
    assert len(clean) == 1
    assert clean[0].url == "https://acme.com"

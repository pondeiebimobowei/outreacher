"""
Tests for Network and SSRF Safety validator in Contact Discovery.
"""

import uuid
from unittest.mock import MagicMock
import pytest

from core.models import (
    CrawledDocument,
    DocumentQuality,
    PageType,
)
from crawling.acquirer import AcquiredSiteDocuments
from contact_discovery.models import ProviderFailureCode
from contact_discovery.network_safety import (
    UnsafeTargetUrlError,
    is_safe_redirect,
    is_safe_target_url,
    validate_target_url,
)
from contact_discovery.pipeline import ContactDiscoveryPipeline
from gateway.schemas import ContactDiscoveryRequest


@pytest.mark.parametrize(
    "unsafe_url",
    [
        "http://localhost",
        "http://localhost:8080",
        "https://127.0.0.1",
        "http://127.0.0.1:3000/api",
        "http://0.0.0.0",
        "http://10.0.0.1/admin",
        "http://172.16.0.1",
        "http://192.168.1.1",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://[::]/",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "gopher://localhost:70",
        "ftp://example.com",
        "http://subdomain.local",
        "http://service.internal",
        "http://router.lan",
        "http://2130706433/",  # decimal representation of 127.0.0.1
        "",
        "   ",
    ],
)
def test_rejects_unsafe_target_urls(unsafe_url):
    assert is_safe_target_url(unsafe_url) is False
    with pytest.raises(UnsafeTargetUrlError):
        validate_target_url(unsafe_url)


@pytest.mark.parametrize(
    "safe_url",
    [
        "https://example.com",
        "https://www.example.com/team",
        "http://sub.domain.co.uk/about-us",
        "https://stripe.com/jobs",
    ],
)
def test_accepts_safe_public_urls(safe_url):
    assert is_safe_target_url(safe_url) is True
    # Should not raise:
    validate_target_url(safe_url)


def test_redirect_containment():
    expected_domain = "example.com"

    # Same domain or subdomain is safe
    assert is_safe_redirect("https://example.com/careers", expected_domain) is True
    assert is_safe_redirect("https://sub.example.com/team", expected_domain) is True
    assert is_safe_redirect("http://www.example.com/", expected_domain) is True

    # Off-domain redirects are unsafe
    assert is_safe_redirect("https://evil.com/page", expected_domain) is False
    assert is_safe_redirect("https://notexample.com", expected_domain) is False
    assert is_safe_redirect("https://example.com.evil.com", expected_domain) is False

    # SSRF destinations as redirects are unsafe
    assert is_safe_redirect("http://127.0.0.1/admin", expected_domain) is False
    assert is_safe_redirect("http://localhost", expected_domain) is False


def test_pipeline_rejects_ssrf_without_network_call():
    verifier = MagicMock()
    acquirer = MagicMock()
    crawl_manager = MagicMock()
    search_provider = MagicMock()

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-ssrf-1",
        discovery_run_id=uuid.uuid4(),
        company_name="Malicious Target",
        website_url="http://127.0.0.1:8080/secret",
    )

    resp = pipeline.run(req)

    assert resp.status == "FAILED"
    assert resp.failure is not None
    assert resp.failure.code == ProviderFailureCode.DISCOVERY_OPERATIONAL_FAILURE
    assert resp.failure.retryable is False
    assert "Unsafe" in resp.failure.message or "Loopback" in resp.failure.message or "rejected" in resp.failure.message

    # Crucial assertion: acquirer must never be invoked!
    acquirer.acquire.assert_not_called()
    verifier.classify_relationship.assert_not_called()
    crawl_manager.fetch_with_fallback.assert_not_called()
    search_provider.search.assert_not_called()


def test_pipeline_rejects_off_domain_redirect():
    verifier = MagicMock()
    acquirer = MagicMock()
    crawl_manager = MagicMock()
    search_provider = MagicMock()

    from datetime import datetime, timezone

    # Acquirer returns a document that redirected off-domain to evil.com
    doc = CrawledDocument(
        url="https://acme.com",
        final_url="https://evil.com/phishing",
        title="Evil",
        raw_html="<html>Evil</html>",
        content="Evil",
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    acquirer.acquire.return_value = AcquiredSiteDocuments(homepage_doc=doc)

    pipeline = ContactDiscoveryPipeline(
        verifier=verifier,
        acquirer=acquirer,
        crawl_manager=crawl_manager,
        search_provider=search_provider,
    )

    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-redir-1",
        discovery_run_id=uuid.uuid4(),
        company_name="Acme Corp",
        domain="acme.com",
    )

    resp = pipeline.run(req)

    assert resp.status == "FAILED"
    assert resp.failure is not None
    assert resp.failure.code == ProviderFailureCode.DISCOVERY_OPERATIONAL_FAILURE
    assert resp.failure.retryable is False
    assert "Off-domain redirect" in resp.failure.message

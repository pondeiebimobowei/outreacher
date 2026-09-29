"""
tests/test_identity_live.py — Unit test suite for live identity runner and stage attribution telemetry
"""

import pytest
from core.models import IdentityConfidence, SiteRelationship, SearchResult, CrawledDocument, DocumentQuality, PageType
from benchmark_identity_live import (
    LIVE_IDENTITY_CORPUS,
    LiveIdentityCase,
    InstrumentedLiveIdentityRunner,
    LiveStageTelemetry,
)
from benchmark_identity_recall import (
    _DeterministicSearchProvider,
    _DeterministicCrawlManager,
    _doc,
)

def test_live_corpus_ground_truth_integrity():
    """Validates that all live identity cases have explicit non-empty ground truth provenance."""
    assert len(LIVE_IDENTITY_CORPUS) >= 15
    for case in LIVE_IDENTITY_CORPUS:
        assert case.case_id.startswith("live_")
        assert len(case.company) > 0
        assert len(case.ground_truth_source) > 0
        assert len(case.ground_truth_timestamp) > 0
        assert len(case.rationale) > 0
        if case.expected_confidence == IdentityConfidence.CONFIDENT:
            assert case.expected_domain is not None
            assert case.expected_relationship == SiteRelationship.PRIMARY


def test_instrumented_runner_stage_attribution_success():
    """Tests that the runner attributes a clean resolution to RESOLVED_CONFIDENT."""
    case = LiveIdentityCase(
        case_id="test_live_stripe",
        company="Stripe",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="stripe.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="GLOBAL_FINTECH",
        ground_truth_source="Registry Test",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Unit test case for live runner.",
    )

    search = _DeterministicSearchProvider(
        company="Stripe",
        domain="stripe.com",
        results=[
            SearchResult(title="Stripe | Financial Infrastructure", url="https://stripe.com", snippet="Stripe powers online payments."),
            SearchResult(title="About Stripe", url="https://stripe.com/about", snippet="Stripe is financial infrastructure."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://stripe.com": _doc("https://stripe.com", title="Stripe - Online Payment Processing", content="Stripe is a financial infrastructure platform.", ptype=PageType.HOMEPAGE),
        "https://stripe.com/about": _doc("https://stripe.com/about", title="About Stripe", content="Stripe builds economic infrastructure for the internet.", ptype=PageType.ABOUT),
    })

    runner = InstrumentedLiveIdentityRunner(
        search_provider=search,
        crawl_manager=crawl,
        inter_case_delay=0.0,
    )

    telemetry = runner.evaluate_case(case)
    assert telemetry.is_state_match is True
    assert telemetry.is_domain_match is True
    assert telemetry.actual_confidence == "CONFIDENT"
    assert telemetry.actual_domain == "stripe.com"
    assert telemetry.final_stage_attribution == "RESOLVED_CONFIDENT"
    assert telemetry.search_attribution == "SEARCH_SUCCESS"
    assert telemetry.primary_candidate_count == 1


def test_instrumented_runner_stage_attribution_search_dropoff():
    """Tests that the runner attributes search omission when the target domain is not returned."""
    case = LiveIdentityCase(
        case_id="test_live_omitted",
        company="Obscure Brand",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="obscurebrand.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEV_TEST",
        ground_truth_source="Test Registry",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Simulated search dropoff.",
    )

    search = _DeterministicSearchProvider(
        company="Obscure Brand",
        domain="obscurebrand.com",
        results=[
            SearchResult(title="Something Else", url="https://other.com", snippet="Unrelated site."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://other.com": _doc("https://other.com", title="Other", content="Other content", ptype=PageType.HOMEPAGE),
    })

    runner = InstrumentedLiveIdentityRunner(
        search_provider=search,
        crawl_manager=crawl,
        inter_case_delay=0.0,
    )

    telemetry = runner.evaluate_case(case)
    assert telemetry.is_state_match is False
    assert telemetry.search_attribution == "TARGET_DOMAIN_NOT_IN_SEARCH"
    assert telemetry.final_stage_attribution == "FAIL_SEARCH_DROPOFF"

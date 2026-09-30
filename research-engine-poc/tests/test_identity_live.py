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
    assert len(LIVE_IDENTITY_CORPUS) == 20
    for case in LIVE_IDENTITY_CORPUS:
        assert case.case_id.startswith("live_")
        assert len(case.query_name) > 0
        assert len(case.target_entity) > 0
        assert len(case.provenance_type) > 0
        assert len(case.ground_truth_provenance) > 0
        assert len(case.ground_truth_verified_at) > 0
        assert len(case.rationale) > 0
        if case.expected_state == IdentityConfidence.CONFIDENT:
            assert case.target_domain is not None
            assert case.expected_relationship == SiteRelationship.PRIMARY


def test_instrumented_runner_stage_attribution_success():
    """Tests that the runner attributes a clean resolution to RESOLVED_TARGET_CONFIDENT."""
    case = LiveIdentityCase(
        case_id="test_live_stripe",
        query_name="Stripe",
        target_entity="Stripe, Inc. (Global payments infrastructure)",
        target_domain="stripe.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="GLOBAL_FINTECH",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Registry Test",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
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
    assert telemetry.final_stage_attribution == "RESOLVED_TARGET_CONFIDENT"
    assert telemetry.search_attribution == "SEARCH_SUCCESS"
    assert telemetry.primary_candidate_count == 1
    assert telemetry.is_target_misidentified is False
    assert telemetry.is_false_confident is False


def test_instrumented_runner_target_misidentification_detection():
    """Tests that resolving a different verified domain than target_domain is flagged as FAIL_TARGET_MISIDENTIFICATION."""
    case = LiveIdentityCase(
        case_id="test_live_drone_zipline",
        query_name="Zipline",
        target_entity="Zipline International Inc. (Automated drone logistics)",
        target_domain="flyzipline.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="LOGISTICS",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="SEC Form D / Corporate Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Simulated collision where retail Zipline surfaces instead.",
    )

    # Retail zipline (getzipline.com) surfaces as PRIMARY instead of Drone Zipline (flyzipline.com)
    search = _DeterministicSearchProvider(
        company="Zipline",
        domain="getzipline.com",
        results=[
            SearchResult(title="Zipline Retail Communication", url="https://getzipline.com", snippet="Zipline is the leading operations platform for retail."),
            SearchResult(title="About Zipline", url="https://getzipline.com/about", snippet="Zipline retail communications."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://getzipline.com": _doc("https://getzipline.com", title="Zipline - Retail Communication", content="Zipline helps retail brands communicate with frontline workers.", ptype=PageType.HOMEPAGE),
        "https://getzipline.com/about": _doc("https://getzipline.com/about", title="About Zipline", content="Zipline builds communications software.", ptype=PageType.ABOUT),
    })

    runner = InstrumentedLiveIdentityRunner(
        search_provider=search,
        crawl_manager=crawl,
        inter_case_delay=0.0,
    )

    telemetry = runner.evaluate_case(case)
    # State is CONFIDENT (state match), but domain is getzipline.com != flyzipline.com (target mismatch!)
    assert telemetry.is_state_match is True
    assert telemetry.is_domain_match is False
    assert telemetry.is_target_misidentified is True
    assert telemetry.final_stage_attribution == "FAIL_TARGET_MISIDENTIFICATION"


def test_instrumented_runner_stage_attribution_search_dropoff():
    """Tests that the runner attributes search omission when the target domain is not returned."""
    case = LiveIdentityCase(
        case_id="test_live_omitted",
        query_name="Obscure Brand",
        target_entity="Obscure Brand Corp",
        target_domain="obscurebrand.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEV_TEST",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Test Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
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


def test_instrumented_runner_secondary_corroboration_failure():
    """Tests that when homepage self-ID succeeds but secondary corroboration fails, attribution is FAIL_SECONDARY_CORROBORATION."""
    case = LiveIdentityCase(
        case_id="test_live_missing_secondary",
        query_name="Uncorroborated Co",
        target_entity="Uncorroborated Co",
        target_domain="uncorroborated.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEV_TEST",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Test Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Simulated missing secondary corroboration.",
    )

    search = _DeterministicSearchProvider(
        company="Uncorroborated Co",
        domain="uncorroborated.com",
        results=[
            SearchResult(title="Uncorroborated Co - Official Homepage", url="https://uncorroborated.com", snippet="Uncorroborated Co builds tools."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://uncorroborated.com": _doc("https://uncorroborated.com", title="Uncorroborated Co", content="Uncorroborated Co is a developer tools company.", ptype=PageType.HOMEPAGE),
        # No about/contact page exists -> secondary corroboration fails
    })

    runner = InstrumentedLiveIdentityRunner(
        search_provider=search,
        crawl_manager=crawl,
        inter_case_delay=0.0,
    )

    telemetry = runner.evaluate_case(case)
    assert telemetry.is_state_match is False
    assert telemetry.actual_confidence == "UNRESOLVED"
    assert telemetry.final_stage_attribution == "FAIL_SECONDARY_CORROBORATION"


def test_instrumented_runner_homepage_acquisition_failure():
    """Tests that when homepage crawl fails (WAF/error/no self-ID), attribution is FAIL_HOMEPAGE_ACQUISITION."""
    case = LiveIdentityCase(
        case_id="test_live_blocked_homepage",
        query_name="Blocked Co",
        target_entity="Blocked Co",
        target_domain="blockedco.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEV_TEST",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Test Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Simulated blocked homepage.",
    )

    search = _DeterministicSearchProvider(
        company="Blocked Co",
        domain="blockedco.com",
        results=[
            SearchResult(title="Blocked Co - Homepage", url="https://blockedco.com", snippet="Blocked Co portal."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        # Homepage crawl returns BLOCKED quality
        "https://blockedco.com": _doc("https://blockedco.com", title="", content="", ptype=PageType.HOMEPAGE, quality=DocumentQuality.BLOCKED),
    })

    runner = InstrumentedLiveIdentityRunner(
        search_provider=search,
        crawl_manager=crawl,
        inter_case_delay=0.0,
    )

    telemetry = runner.evaluate_case(case)
    assert telemetry.is_state_match is False
    assert telemetry.actual_confidence == "UNRESOLVED"
    assert telemetry.final_stage_attribution == "FAIL_HOMEPAGE_ACQUISITION"

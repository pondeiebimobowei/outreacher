"""
tests/test_identity_geographic_holdout.py — Unit test suite for geographic holdout benchmark and telemetry
"""

import pytest
from core.models import IdentityConfidence, SiteRelationship, SearchResult, CrawledDocument, DocumentQuality, PageType
from benchmark_identity_geographic_holdout import (
    GEOGRAPHIC_HOLDOUT_CORPUS,
    GeographicIdentityCase,
    InstrumentedGeographicIdentityRunner,
    GeographicStageTelemetry,
)
from benchmark_identity_recall import (
    _DeterministicSearchProvider,
    _DeterministicCrawlManager,
    _doc,
)

def test_geographic_corpus_ground_truth_integrity():
    """Validates that all 30 geographic holdout cases adhere to the schema and ground truth governance rules."""
    assert len(GEOGRAPHIC_HOLDOUT_CORPUS) == 30
    
    africa_cases = [c for c in GEOGRAPHIC_HOLDOUT_CORPUS if c.region == "AFRICA"]
    eu_cases = [c for c in GEOGRAPHIC_HOLDOUT_CORPUS if c.region == "EU"]
    collision_cases = [c for c in GEOGRAPHIC_HOLDOUT_CORPUS if c.region == "GLOBAL_COLLISION"]
    negative_cases = [c for c in GEOGRAPHIC_HOLDOUT_CORPUS if c.region == "NEGATIVE_CONTROL"]
    
    assert len(africa_cases) == 9
    assert len(eu_cases) == 9
    assert len(collision_cases) == 6
    assert len(negative_cases) == 6

    confident_cases = [c for c in GEOGRAPHIC_HOLDOUT_CORPUS if c.expected_state == IdentityConfidence.CONFIDENT]
    ambiguous_cases = [c for c in GEOGRAPHIC_HOLDOUT_CORPUS if c.expected_state == IdentityConfidence.AMBIGUOUS]
    unresolved_cases = [c for c in GEOGRAPHIC_HOLDOUT_CORPUS if c.expected_state == IdentityConfidence.UNRESOLVED]

    assert len(confident_cases) == 18
    assert len(ambiguous_cases) == 6
    assert len(unresolved_cases) == 6

    for case in GEOGRAPHIC_HOLDOUT_CORPUS:
        assert case.case_id.startswith("geo_")
        assert len(case.query_name) > 0
        assert len(case.target_entity) > 0
        assert len(case.country_association) > 0
        assert len(case.primary_language) > 0
        assert len(case.provenance_type) > 0
        assert len(case.ground_truth_provenance) > 0
        assert len(case.ground_truth_verified_at) > 0
        assert len(case.rationale) > 0
        assert case.region in {"AFRICA", "EU", "GLOBAL_COLLISION", "NEGATIVE_CONTROL"}
        
        if case.expected_state == IdentityConfidence.CONFIDENT:
            assert case.target_domain is not None
            assert case.expected_relationship == SiteRelationship.PRIMARY
        else:
            assert case.target_domain is None
            assert case.expected_relationship == SiteRelationship.UNKNOWN


def test_geographic_runner_stage_attribution_success():
    """Tests that the runner attributes an EU real entity resolution to RESOLVED_TARGET_CONFIDENT."""
    case = GeographicIdentityCase(
        case_id="test_geo_personio",
        query_name="Personio",
        target_entity="Personio SE & Co. KG (German HR software provider for SMEs)",
        target_domain="personio.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Germany",
        legal_entity_country="Germany",
        headquarters_country="Germany",
        operating_country="Germany",
        primary_language="German",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Handelsregister München (HRA 114562)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Unit test case for Personio.",
    )

    search = _DeterministicSearchProvider(
        company="Personio",
        domain="personio.com",
        results=[
            SearchResult(title="Personio: The HR Operating System", url="https://personio.com", snippet="Personio is the holistic HR software."),
            SearchResult(title="About Personio", url="https://personio.com/about", snippet="Personio HR management."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://personio.com": _doc("https://personio.com", title="Personio - The HR Operating System", content="Personio offers all-in-one HR software solutions for small and medium businesses.", ptype=PageType.HOMEPAGE),
        "https://personio.com/about": _doc("https://personio.com/about", title="About Personio", content="Personio was founded with the goal of enabling better HR management.", ptype=PageType.ABOUT),
    })

    runner = InstrumentedGeographicIdentityRunner(
        search_provider=search,
        crawl_manager=crawl,
        inter_case_delay=0.0,
    )

    telemetry = runner.evaluate_case(case)
    assert telemetry.is_state_match is True
    assert telemetry.is_domain_match is True
    assert telemetry.actual_confidence == "CONFIDENT"
    assert telemetry.actual_domain == "personio.com"
    assert telemetry.final_stage_attribution == "RESOLVED_TARGET_CONFIDENT"
    assert telemetry.search_attribution == "SEARCH_SUCCESS"
    assert telemetry.primary_candidate_count == 1
    assert telemetry.is_target_misidentified is False
    assert telemetry.is_false_confident is False


def test_geographic_runner_target_misidentification_detection():
    """Tests that resolving a different verified domain than target_domain is flagged as FAIL_TARGET_MISIDENTIFICATION."""
    case = GeographicIdentityCase(
        case_id="test_geo_qonto_mismatch",
        query_name="Qonto",
        target_entity="Qonto Payments EU",
        target_domain="qonto.eu",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="France",
        legal_entity_country="France",
        headquarters_country="France",
        operating_country="France",
        primary_language="French",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="INPI France",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Simulated mismatch where qonto.com surfaces instead of qonto.eu.",
    )

    # Simulated qonto.com surfaces as PRIMARY instead of qonto.eu
    search = _DeterministicSearchProvider(
        company="Qonto",
        domain="qonto.com",
        results=[
            SearchResult(title="Qonto - Business Banking", url="https://qonto.com", snippet="Qonto Business Finance."),
            SearchResult(title="About Qonto", url="https://qonto.com/about", snippet="Qonto finance solutions."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://qonto.com": _doc("https://qonto.com", title="Qonto - Business Banking", content="Qonto is a business finance solution.", ptype=PageType.HOMEPAGE),
        "https://qonto.com/about": _doc("https://qonto.com/about", title="About Qonto", content="Qonto provides financial tools for SMEs.", ptype=PageType.ABOUT),
    })

    runner = InstrumentedGeographicIdentityRunner(
        search_provider=search,
        crawl_manager=crawl,
        inter_case_delay=0.0,
    )

    telemetry = runner.evaluate_case(case)
    assert telemetry.is_state_match is True  # State is CONFIDENT
    assert telemetry.is_domain_match is False  # qonto.com != qonto.eu
    assert telemetry.is_target_misidentified is True
    assert telemetry.final_stage_attribution == "FAIL_TARGET_MISIDENTIFICATION"


def test_geographic_runner_non_confident_safety():
    """Tests that ambiguous collisions and synthetic negatives are safely attributed and never flagged as false confident."""
    col_case = GeographicIdentityCase(
        case_id="test_geo_col_bolt",
        query_name="Bolt",
        target_entity="Disambiguation Conflict: Bolt Technology OÜ vs Bolt Financial Inc",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        region="GLOBAL_COLLISION",
        country_association="Global",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Two major tech companies with active primary domains.",
    )

    # Two primary candidates surface -> AMBIGUOUS
    search = _DeterministicSearchProvider(
        company="Bolt",
        domain="bolt.eu",
        results=[
            SearchResult(title="Bolt: Fast and Affordable Rides", url="https://bolt.eu", snippet="Bolt mobility."),
            SearchResult(title="About Bolt Mobility", url="https://bolt.eu/about", snippet="About Bolt ride hailing."),
            SearchResult(title="Bolt: One-Click Checkout", url="https://bolt.com", snippet="Bolt checkout."),
            SearchResult(title="About Bolt Checkout", url="https://bolt.com/about", snippet="About Bolt checkout."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://bolt.eu": _doc("https://bolt.eu", title="Bolt - Fast and Affordable Rides", content="Bolt is the all-in-one mobility app.", ptype=PageType.HOMEPAGE),
        "https://bolt.eu/about": _doc("https://bolt.eu/about", title="About Bolt", content="Bolt offers ride-hailing and micromobility services.", ptype=PageType.ABOUT),
        "https://bolt.com": _doc("https://bolt.com", title="Bolt - One-Click Checkout", content="Bolt powers one-click checkout.", ptype=PageType.HOMEPAGE),
        "https://bolt.com/about": _doc("https://bolt.com/about", title="About Bolt", content="Bolt is a checkout experience platform.", ptype=PageType.ABOUT),
    })

    runner = InstrumentedGeographicIdentityRunner(
        search_provider=search,
        crawl_manager=crawl,
        inter_case_delay=0.0,
    )

    telemetry = runner.evaluate_case(col_case)
    assert telemetry.actual_confidence == "AMBIGUOUS"
    assert telemetry.is_state_match is True
    assert telemetry.is_false_confident is False
    assert telemetry.final_stage_attribution == "RESOLVED_AMBIGUOUS_SAFETY"


def test_geographic_runner_secondary_corroboration_failure():
    """Tests that missing secondary route discovery results in FAIL_SECONDARY_CORROBORATION."""
    case = GeographicIdentityCase(
        case_id="test_geo_kasha_missing_secondary",
        query_name="Kasha",
        target_entity="Kasha Rwanda Ltd",
        target_domain="kasha.co",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Rwanda",
        legal_entity_country="Rwanda",
        headquarters_country="Rwanda",
        operating_country="Rwanda",
        primary_language="English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Rwanda Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Simulated missing secondary corroboration.",
    )

    search = _DeterministicSearchProvider(
        company="Kasha",
        domain="kasha.co",
        results=[
            SearchResult(title="Kasha - Women's Health", url="https://kasha.co", snippet="Kasha access platform."),
        ]
    )
    crawl = _DeterministicCrawlManager({
        "https://kasha.co": _doc("https://kasha.co", title="Kasha - Women's Health", content="Kasha is a healthcare access platform.", ptype=PageType.HOMEPAGE),
    })

    runner = InstrumentedGeographicIdentityRunner(
        search_provider=search,
        crawl_manager=crawl,
        inter_case_delay=0.0,
    )

    telemetry = runner.evaluate_case(case)
    assert telemetry.is_state_match is False
    assert telemetry.actual_confidence == "UNRESOLVED"
    assert telemetry.final_stage_attribution == "FAIL_SECONDARY_CORROBORATION"

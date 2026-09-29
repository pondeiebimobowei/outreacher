import pytest
from core.models import DocumentQuality, IdentityConfidence, PageType
from core.dto import OpportunityType, ResearchStatus
from core.claim_builder import ClaimGraphBuilder
from evaluate_pipeline import EVALUATION_DATASET

def test_evaluation_dataset_categories_and_ground_truth():
    """Verifies that all 8 benchmark cases execute deterministically and meet ground truth contracts."""
    assert len(EVALUATION_DATASET) == 8

    category_counts = {}
    for case in EVALUATION_DATASET:
        category_counts[case.category] = category_counts.get(case.category, 0) + 1
        
        # Test baseline deterministic graph builder and DTO export
        graph = ClaimGraphBuilder.build_from_package(case.package)
        dto = ClaimGraphBuilder.export_to_dto(graph, case.package)

        assert dto.status in (ResearchStatus.COMPLETED, ResearchStatus.PARTIAL)
        assert len(dto.findings) >= 1
        assert len(dto.sources) >= 1
        assert len(dto.opportunities) >= 1

        # Match opportunity verdict to ground truth expectation
        actual_opp = dto.opportunities[0]
        assert actual_opp.opportunity_type == case.expected_opportunity_type

        if case.expected_role_title:
            assert actual_opp.role_title == case.expected_role_title

    # Category breakdown assertions
    assert category_counts["REAL_WORLD"] == 3
    assert category_counts["NEGATIVE_GATING"] == 3
    assert category_counts["CONTRACT_FIXTURE"] == 1
    assert category_counts["IDENTITY_SAFETY"] == 1

def test_negative_gating_never_produces_false_confirmed():
    """Explicitly verifies that negative cases reject CONFIRMED openings and demote to PROACTIVE."""
    neg_cases = [c for c in EVALUATION_DATASET if c.category == "NEGATIVE_GATING"]
    assert len(neg_cases) == 3

    for case in neg_cases:
        graph = ClaimGraphBuilder.build_from_package(case.package)
        dto = ClaimGraphBuilder.export_to_dto(graph, case.package)

        if case.case_id in ("neg_closed_filled_posting", "neg_culture_article_incidental_word"):
            assert dto.opportunities[0].opportunity_type == OpportunityType.PROACTIVE
        elif case.case_id == "neg_canonical_url_deduplication":
            # Must deduplicate to exactly 1 confirmed opening
            assert len(dto.opportunities) == 1
            assert dto.opportunities[0].opportunity_type == OpportunityType.CONFIRMED

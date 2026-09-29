"""
tests/test_identity_recall.py — Unit test suite for identity recall benchmark and metrics matrix
"""

import pytest
from core.models import IdentityConfidence, SiteRelationship
from benchmark_identity_recall import (
    IDENTITY_RECALL_DATASET,
    evaluate_identity_case,
    run_identity_recall_benchmark,
)

def test_identity_recall_benchmark_dataset_integrity():
    """Verifies that all 24 frozen identity recall cases have valid schema and expected attributes."""
    assert len(IDENTITY_RECALL_DATASET) == 24
    categories = {c.category for c in IDENTITY_RECALL_DATASET}
    assert "SPA_RENDERED" in categories
    assert "UNCONVENTIONAL_PATH" in categories
    assert "INDIRECT_SELF_ID" in categories
    assert "SUBDOMAIN_MULTI_TIER" in categories
    assert "NEGATIVE_CONTROL" in categories


def test_identity_recall_benchmark_metrics_calculation():
    """Runs the identity recall benchmark suite and asserts 100% state accuracy, 100% recall, and 0% false confident."""
    metrics = run_identity_recall_benchmark()

    # Core Matrix Invariants
    assert metrics["total_cases"] == 24
    assert metrics["expected_confident"] == 15
    assert metrics["expected_non_confident"] == 9
    assert metrics["false_confident_count"] == 0, f"False CONFIDENT must strictly be 0, got {metrics['false_confident_count']}"
    assert metrics["false_confident_rate_pct"] == 0.0
    assert metrics["confident_recall_pct"] == 100.0, f"CONFIDENT recall should be 100%, got {metrics['confident_recall_pct']}%"
    assert metrics["state_accuracy_pct"] == 100.0, f"State accuracy should be 100%, got {metrics['state_accuracy_pct']}%"
    assert metrics["non_confident_safety_pct"] == 100.0

    # Matrix cell counts
    assert metrics["missed_conf_ambiguous_count"] == 0
    assert metrics["missed_id_unresolved_count"] == 0
    assert metrics["correct_confident_count"] == 15
    assert metrics["correct_ambiguous_count"] == 2
    assert metrics["correct_unresolved_count"] == 7


def test_individual_case_evaluations():
    """Tests that each individual frozen fixture passes its exact expected state."""
    for case in IDENTITY_RECALL_DATASET:
        res = evaluate_identity_case(case)
        assert res["is_state_match"] is True, (
            f"Case {case.case_id} failed: expected {case.expected_confidence}, got {res['actual_confidence']}. Reasoning: {res['reasoning']}"
        )
        assert res["is_domain_match"] is True, (
            f"Case {case.case_id} domain mismatch: expected {case.expected_domain}, got {res['actual_domain']}"
        )

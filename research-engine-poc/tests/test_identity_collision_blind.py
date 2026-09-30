"""
tests/test_identity_collision_blind.py — Unit test suite for collision-focused blind identity evaluation (v1.3.1)
"""

import pytest
from core.models import IdentityConfidence, SiteRelationship
from benchmark_identity_collision_blind import (
    COLLISION_BLIND_DATASET,
    run_collision_blind_benchmark,
    evaluate_collision_blind_case,
)


def test_collision_blind_dataset_integrity():
    """Verifies that the collision blind dataset has 22 valid cases across all 4 categories."""
    assert len(COLLISION_BLIND_DATASET) == 22
    categories = {c.category for c in COLLISION_BLIND_DATASET}
    assert "GENERIC_COLLISION" in categories
    assert "COINED_BRAND" in categories
    assert "MULTI_TOKEN" in categories
    assert "SYNTHETIC_NEGATIVE" in categories


def test_collision_blind_benchmark_metrics_and_safety_invariants():
    """Evaluates the v1.3.1 resolver against the collision blind benchmark suite."""
    metrics = run_collision_blind_benchmark()

    # Core Counts
    assert metrics["total_cases"] == 22
    assert metrics["expected_confident"] == 10
    assert metrics["expected_non_confident"] == 12

    # Hard Safety Invariants: 0 False CONFIDENT leaks & 0 Target Misidentifications
    assert metrics["false_confident_count"] == 0, f"False CONFIDENT must strictly be 0, got {metrics['false_confident_count']}"
    assert metrics["false_confident_rate_pct"] == 0.0
    assert metrics["target_misidentified_count"] == 0, f"Target Misidentification must strictly be 0, got {metrics['target_misidentified_count']}"
    assert metrics["target_misidentification_rate_pct"] == 0.0

    # Perfect Performance on the 22-case collision suite
    assert metrics["state_accuracy_pct"] == 100.0
    assert metrics["confident_recall_pct"] == 100.0


def test_collision_blind_individual_cases():
    """Tests all 22 individual cases in the collision blind dataset."""
    for case in COLLISION_BLIND_DATASET:
        res = evaluate_collision_blind_case(case)
        assert res["is_state_match"] is True, (
            f"Collision blind case {case.case_id} ({case.query_name}) failed state: "
            f"expected {case.expected_state}, got {res['actual_state']}. Reasoning: {res['reasoning']}"
        )
        assert res["is_domain_match"] is True, (
            f"Collision blind case {case.case_id} ({case.query_name}) failed domain match: "
            f"expected {case.target_domain}, got {res['actual_domain']}"
        )
        assert res["is_false_confident"] is False
        assert res["is_target_misidentified"] is False

"""
tests/test_identity_blind.py — Unit test suite for fresh blind holdout identity evaluation
"""

import pytest
from core.models import IdentityConfidence, SiteRelationship
from benchmark_identity_blind import (
    IDENTITY_BLIND_DATASET,
    run_blind_benchmark,
    evaluate_blind_case,
)


def test_blind_dataset_integrity():
    """Verifies that the blind dataset has 14 valid cases across all 5 structural categories."""
    assert len(IDENTITY_BLIND_DATASET) == 14
    categories = {c.category for c in IDENTITY_BLIND_DATASET}
    assert "SPA_RENDERED" in categories
    assert "UNCONVENTIONAL_PATH" in categories
    assert "DIVERGENT_DOMAIN" in categories
    assert "SUBDOMAIN_MULTI_TIER" in categories
    assert "NEGATIVE_CONTROL" in categories


def test_blind_benchmark_metrics_and_safety_invariants():
    """Evaluates the frozen v1.2 resolver against the fresh blind holdout corpus."""
    metrics = run_blind_benchmark()

    # Core Matrix Invariants
    assert metrics["total_cases"] == 14
    assert metrics["expected_confident"] == 9
    assert metrics["expected_non_confident"] == 5

    # Hard Safety Invariants (Strict 0.0% false confident, 100% control preservation)
    assert metrics["false_confident_count"] == 0, f"False CONFIDENT must strictly be 0, got {metrics['false_confident_count']}"
    assert metrics["false_confident_rate_pct"] == 0.0
    assert metrics["non_confident_safety_pct"] == 100.0

    # Blind Generalization Results (Frozen v1.2 Resolver)
    assert metrics["state_accuracy_pct"] >= 90.0
    assert metrics["confident_recall_pct"] >= 85.0
    assert metrics["correct_confident_count"] == 8
    assert metrics["missed_id_unresolved_count"] == 1
    assert metrics["correct_ambiguous_count"] == 1
    assert metrics["correct_unresolved_count"] == 4


def test_blind_safety_and_control_evaluations():
    """Tests that all 5 non-confident blind controls correctly preserve safety states."""
    safety_cases = [c for c in IDENTITY_BLIND_DATASET if c.expected_confidence != IdentityConfidence.CONFIDENT]
    for case in safety_cases:
        res = evaluate_blind_case(case)
        assert res["is_state_match"] is True, (
            f"Safety blind case {case.case_id} failed: expected {case.expected_confidence}, got {res['actual_confidence']}"
        )

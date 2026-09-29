"""
tests/test_identity_holdout.py — Unit tests for unseen holdout identity evaluation
"""

import pytest
from core.models import IdentityConfidence, SiteRelationship
from benchmark_identity_holdout import (
    IDENTITY_HOLDOUT_DATASET,
    run_holdout_benchmark,
)
from benchmark_identity_recall import evaluate_identity_case


def test_holdout_dataset_integrity():
    """Verifies that the unseen holdout dataset has valid schema and covers all 5 categories."""
    assert len(IDENTITY_HOLDOUT_DATASET) == 10
    categories = {c.category for c in IDENTITY_HOLDOUT_DATASET}
    assert "SPA_RENDERED" in categories
    assert "UNCONVENTIONAL_PATH" in categories
    assert "INDIRECT_SELF_ID" in categories
    assert "SUBDOMAIN_MULTI_TIER" in categories
    assert "NEGATIVE_CONTROL" in categories


def test_holdout_benchmark_metrics_and_safety_invariants():
    """Evaluates the frozen resolver against the unseen holdout corpus."""
    comp = run_holdout_benchmark()
    h = comp["holdout"]

    assert h["total_cases"] == 10
    assert h["expected_confident"] == 6
    assert h["expected_non_confident"] == 4

    # Hard safety invariants (Strict 0.0% false confident, 100% control preservation)
    assert h["false_confident_count"] == 0, f"False CONFIDENT must strictly be 0, got {h['false_confident_count']}"
    assert h["false_confident_rate_pct"] == 0.0
    assert h["non_confident_safety_pct"] == 100.0

    # Measured holdout generalization metrics (frozen resolver 7a870ea)
    assert h["state_accuracy_pct"] == 80.0
    assert h["confident_recall_pct"] == 66.66666666666666 or round(h["confident_recall_pct"], 1) == 66.7
    assert comp["gap_state_accuracy"] == 20.0


def test_holdout_safety_and_control_evaluations():
    """Tests that all holdout negative controls and subdomains correctly preserve safety states."""
    safety_cases = [c for c in IDENTITY_HOLDOUT_DATASET if c.expected_confidence != IdentityConfidence.CONFIDENT]
    for case in safety_cases:
        res = evaluate_identity_case(case)
        assert res["is_state_match"] is True, (
            f"Safety holdout case {case.case_id} failed: expected {case.expected_confidence}, got {res['actual_confidence']}"
        )

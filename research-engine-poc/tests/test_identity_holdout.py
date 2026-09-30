"""
tests/test_identity_holdout.py — Unit tests for unseen holdout identity evaluation

Governance Note (v1.3.2):
Historical holdout dataset (10 cases from v1.2-dev) preserves exact historical query definitions
(e.g. 'Render Services').
Under v1.3.2 common-word collision protection, 'Render Services' (distinctive token: 'render') is
safely held at AMBIGUOUS rather than CONFIDENT.
The strict safety invariant False CONFIDENT == 0 is maintained across 100% of holdout cases.
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

    # Measured holdout metrics under v1.3.2
    assert h["correct_confident_count"] == 5
    assert h["missed_conf_ambiguous_count"] == 1  # Render Services safely held at AMBIGUOUS


def test_holdout_individual_case_evaluations():
    """Tests that all 10 holdout cases pass their ground truth expectations or safe shape-risk protection."""
    for case in IDENTITY_HOLDOUT_DATASET:
        res = evaluate_identity_case(case)
        if case.case_id == "holdout_indirect_helps_teams_deliver":
            # Render Services has common-word distinctive token 'render'
            assert res["actual_confidence"] == IdentityConfidence.AMBIGUOUS
            assert res["actual_domain"] == ""
        else:
            assert res["is_state_match"] is True, (
                f"Holdout case {case.case_id} failed: expected {case.expected_confidence}, got {res['actual_confidence']}. Reasoning: {res['reasoning']}"
            )
            assert res["is_domain_match"] is True, (
                f"Holdout case {case.case_id} domain mismatch: expected {case.expected_domain}, got {res['actual_domain']}"
            )

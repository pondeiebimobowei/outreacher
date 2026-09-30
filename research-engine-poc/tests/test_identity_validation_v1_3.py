"""
tests/test_identity_validation_v1_3.py — Unit test suite for 34-case validation benchmark dataset integrity
"""

import pytest
from core.models import IdentityConfidence, SiteRelationship
from benchmark_identity_live import LIVE_IDENTITY_CORPUS
from benchmark_identity_geographic_holdout import GEOGRAPHIC_HOLDOUT_CORPUS
from benchmark_identity_validation_v1_3 import (
    VALIDATION_CORPUS,
    ValidationIdentityCase,
    InstrumentedValidationRunner,
)


def test_validation_corpus_size_and_strata_breakdown():
    """Validates that the fresh validation corpus has exactly 34 cases with the locked stratum distribution."""
    assert len(VALIDATION_CORPUS) == 34

    africa = [c for c in VALIDATION_CORPUS if c.region == "AFRICA"]
    eu = [c for c in VALIDATION_CORPUS if c.region == "EU"]
    collisions = [c for c in VALIDATION_CORPUS if c.region == "GLOBAL_COLLISION"]
    negatives = [c for c in VALIDATION_CORPUS if c.region == "NEGATIVE_CONTROL"]

    assert len(africa) == 10
    assert len(eu) == 10
    assert len(collisions) == 7
    assert len(negatives) == 7

    assert sum(1 for c in VALIDATION_CORPUS if c.expected_state == IdentityConfidence.CONFIDENT) == 20
    assert sum(1 for c in VALIDATION_CORPUS if c.expected_state == IdentityConfidence.AMBIGUOUS) == 7
    assert sum(1 for c in VALIDATION_CORPUS if c.expected_state == IdentityConfidence.UNRESOLVED) == 7


def test_zero_entity_leakage_across_all_historical_corpora():
    """Asserts that zero entities or domains from the baseline (20 cases) or holdout (30 cases) leak into validation."""
    baseline_names = {c.query_name.lower().strip() for c in LIVE_IDENTITY_CORPUS}
    baseline_domains = {c.target_domain.lower().strip() for c in LIVE_IDENTITY_CORPUS if c.target_domain}

    holdout_names = {c.query_name.lower().strip() for c in GEOGRAPHIC_HOLDOUT_CORPUS}
    holdout_domains = {c.target_domain.lower().strip() for c in GEOGRAPHIC_HOLDOUT_CORPUS if c.target_domain}

    historical_names = baseline_names | holdout_names
    historical_domains = baseline_domains | holdout_domains

    for case in VALIDATION_CORPUS:
        q_norm = case.query_name.lower().strip()
        assert q_norm not in historical_names, f"Name leakage detected: '{case.query_name}' was in a previous corpus!"

        if case.target_domain:
            d_norm = case.target_domain.lower().strip()
            assert d_norm not in historical_domains, f"Domain leakage detected: '{case.target_domain}' was in a previous corpus!"


def test_validation_corpus_schema_completeness():
    """Ensures every validation fixture defines all required provenance fields."""
    for case in VALIDATION_CORPUS:
        assert case.case_id.startswith("val_")
        assert len(case.query_name) > 0
        assert len(case.target_entity) > 0
        assert case.expected_state in (IdentityConfidence.CONFIDENT, IdentityConfidence.AMBIGUOUS, IdentityConfidence.UNRESOLVED)
        assert case.provenance_type in ("CORPORATE_REGISTRY", "COMPANY_DIRECTORY", "PUBLIC_ENTITY_RECORD", "MULTI_ENTITY_REFERENCE", "SYNTHETIC_NEGATIVE_CONTROL")
        assert len(case.ground_truth_provenance) > 0
        assert case.ground_truth_verified_at == "2026-09-30T09:00:00Z"
        assert len(case.rationale) > 0

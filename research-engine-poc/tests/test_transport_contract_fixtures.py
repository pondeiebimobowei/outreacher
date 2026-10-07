"""
Transport Contract v1.0 Fixture Validation Tests for Python Gateway & Domain Models.
Validates the canonical wire contract fixture suite against Pydantic v2 schemas.
"""

import json
from pathlib import Path
import pytest
from pydantic import ValidationError

from gateway.schemas import ContactDiscoveryResponse


FIXTURES_DIR = (
    Path(__file__).resolve().parents[2]
    / "packages"
    / "shared"
    / "fixtures"
    / "contact-discovery-v1"
)


def load_fixture(filename: str) -> dict:
    fixture_path = FIXTURES_DIR / filename
    assert fixture_path.exists(), f"Fixture file not found: {fixture_path}"
    with open(fixture_path, "r", encoding="utf-8") as f:
        return json.load(f)


class TestValidContractFixtures:
    """Fixtures that represent compliant Transport Contract v1.0 envelopes."""

    def test_valid_success_fixture(self):
        data = load_fixture("valid_success.json")
        resp = ContactDiscoveryResponse.model_validate(data)

        assert resp.contract_version == "1.0"
        assert str(resp.discovery_run_id) == "550e8400-e29b-41d4-a716-446655440000"
        assert resp.status == "COMPLETED"
        assert resp.identity.verified_domain == "example.com"
        assert resp.identity.primary_relationship == "PRIMARY"
        assert resp.identity.confidence == "CONFIDENT"
        assert len(resp.contacts) == 2

        # Candidate 0: PERSON
        c0 = resp.contacts[0]
        assert c0.person_kind == "PERSON"
        assert c0.first_name == "Jane"
        assert c0.last_name == "Doe"
        assert c0.email == "jane@example.com"
        assert c0.role_family == "ENGINEERING"
        assert len(c0.evidence) == 1

        # Candidate 1: ROLE_ADDRESS
        c1 = resp.contacts[1]
        assert c1.person_kind == "ROLE_ADDRESS"
        assert c1.first_name is None
        assert c1.email == "careers@example.com"
        assert c1.role_family == "RECRUITING"

        assert resp.failure is None
        assert resp.unknowns == []

    def test_identity_halted_fixture(self):
        data = load_fixture("identity_halted.json")
        resp = ContactDiscoveryResponse.model_validate(data)

        assert resp.contract_version == "1.0"
        assert str(resp.discovery_run_id) == "550e8400-e29b-41d4-a716-446655440001"
        assert resp.status == "IDENTITY_HALTED"
        assert resp.identity.verified_domain == "crown.com"
        assert resp.identity.primary_relationship == "RELATED"
        assert resp.identity.confidence == "AMBIGUOUS"
        assert resp.contacts == []
        assert resp.failure is None
        assert "identity_related_ambiguous" in resp.unknowns

    def test_typed_acquisition_failure_fixture(self):
        data = load_fixture("typed_acquisition_failure.json")
        resp = ContactDiscoveryResponse.model_validate(data)

        assert resp.contract_version == "1.0"
        assert str(resp.discovery_run_id) == "550e8400-e29b-41d4-a716-446655440002"
        assert resp.status == "FAILED"
        assert resp.contacts == []
        assert resp.failure is not None
        assert resp.failure.code == "DISCOVERY_TIMEOUT"
        assert resp.failure.retryable is True
        assert "Upstream crawl timed out" in resp.failure.message


class TestInvalidContractFixtures:
    """Fixtures that violate Transport Contract v1.0 and MUST fail validation."""

    def test_invalid_contract_version_fails(self):
        data = load_fixture("invalid_contract_version.json")
        with pytest.raises(ValidationError) as exc_info:
            ContactDiscoveryResponse.model_validate(data)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("contract_version",) for e in errors)

    def test_invalid_discovery_run_id_fails(self):
        data = load_fixture("invalid_discovery_run_id.json")
        with pytest.raises(ValidationError) as exc_info:
            ContactDiscoveryResponse.model_validate(data)
        errors = exc_info.value.errors()
        assert any("discovery_run_id" in e["loc"] for e in errors)

    def test_unknown_role_family_fails(self):
        data = load_fixture("unknown_role_family.json")
        with pytest.raises(ValidationError) as exc_info:
            ContactDiscoveryResponse.model_validate(data)
        errors = exc_info.value.errors()
        assert any("role_family" in str(e["loc"]) for e in errors)

    def test_missing_required_fields_fails(self):
        data = load_fixture("missing_required_fields.json")
        with pytest.raises(ValidationError) as exc_info:
            ContactDiscoveryResponse.model_validate(data)
        errors = exc_info.value.errors()
        assert len(errors) >= 2

    def test_unexpected_fields_fails(self):
        data = load_fixture("unexpected_fields.json")
        with pytest.raises(ValidationError) as exc_info:
            ContactDiscoveryResponse.model_validate(data)
        errors = exc_info.value.errors()
        assert any("speculative_forbidden_field" in str(e) for e in errors)

    def test_malformed_nested_payload_fails(self):
        data = load_fixture("malformed_nested_payload.json")
        with pytest.raises(ValidationError) as exc_info:
            ContactDiscoveryResponse.model_validate(data)
        errors = exc_info.value.errors()
        assert any("source_url" in str(e["loc"]) for e in errors)

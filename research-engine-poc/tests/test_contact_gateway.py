import uuid
import pytest
from pydantic import ValidationError

from contact_discovery.models import (
    ContactConfidence,
    ContactDiscoveryFailure,
    ContactEvidenceSpan,
    ContactIdentity,
    ContactPersonKind,
    DiscoveredContact,
    ProviderFailureCode,
    RoleFamily,
)
from gateway.schemas import (
    ContactDiscoveryContext,
    ContactDiscoveryRequest,
    ContactDiscoveryResponse,
)


VALID_RUN_ID = uuid.uuid4()


def test_contact_discovery_request_valid():
    req = ContactDiscoveryRequest(
        contract_version="1.0",
        request_id="req-123",
        discovery_run_id=VALID_RUN_ID,
        company_name="Acme Corp",
        website_url="https://acme.com",
        domain="acme.com",
        target_roles=["VP of Engineering", "Head of Talent"],
        context=ContactDiscoveryContext(industry="Software", company_id="comp-1", workspace_id="ws-1"),
    )
    assert req.contract_version == "1.0"
    assert req.discovery_run_id == VALID_RUN_ID
    assert req.company_name == "Acme Corp"


def test_contact_discovery_request_rejects_extra_fields():
    with pytest.raises(ValidationError):
        ContactDiscoveryRequest(
            contract_version="1.0",
            request_id="req-123",
            discovery_run_id=VALID_RUN_ID,
            company_name="Acme Corp",
            unsupported_field="fail",
        )


def test_contact_discovery_request_rejects_invalid_uuid():
    with pytest.raises(ValidationError):
        ContactDiscoveryRequest(
            contract_version="1.0",
            request_id="req-123",
            discovery_run_id="not-a-uuid-v4",
            company_name="Acme Corp",
        )


def test_contact_discovery_response_completed_semantics():
    contact = DiscoveredContact(
        person_kind=ContactPersonKind.PERSON,
        first_name="Jane",
        last_name="Doe",
        title="VP of Engineering",
        email="jane.doe@acme.com",
        confidence=ContactConfidence.HIGH,
        role_family=RoleFamily.ENGINEERING,
        source="Website Discovery",
        source_url="https://acme.com/team",
        evidence=[
            ContactEvidenceSpan(
                claim="Jane Doe is VP of Engineering",
                source_name="Team Page",
                source_url="https://acme.com/team",
                source_excerpt="Jane Doe leads engineering as VP of Engineering",
                classification="FACT",
                confidence="HIGH",
            )
        ],
    )

    # Valid COMPLETED response
    resp = ContactDiscoveryResponse(
        contract_version="1.0",
        discovery_run_id=VALID_RUN_ID,
        status="COMPLETED",
        identity=ContactIdentity(
            verified_domain="acme.com",
            primary_relationship="PRIMARY",
            confidence="CONFIDENT",
        ),
        contacts=[contact],
        failure=None,
    )
    assert resp.status == "COMPLETED"
    assert len(resp.contacts) == 1

    # COMPLETED fails if relationship != PRIMARY
    with pytest.raises(ValidationError, match="Status COMPLETED requires identity.primary_relationship to be PRIMARY"):
        ContactDiscoveryResponse(
            contract_version="1.0",
            discovery_run_id=VALID_RUN_ID,
            status="COMPLETED",
            identity=ContactIdentity(
                verified_domain="acme.com",
                primary_relationship="RELATED",
                confidence="CONFIDENT",
            ),
            contacts=[contact],
            failure=None,
        )

    # COMPLETED fails if confidence != CONFIDENT
    with pytest.raises(ValidationError, match="Status COMPLETED requires identity.confidence to be CONFIDENT"):
        ContactDiscoveryResponse(
            contract_version="1.0",
            discovery_run_id=VALID_RUN_ID,
            status="COMPLETED",
            identity=ContactIdentity(
                verified_domain="acme.com",
                primary_relationship="PRIMARY",
                confidence="AMBIGUOUS",
            ),
            contacts=[contact],
            failure=None,
        )

    # COMPLETED fails if failure is present
    with pytest.raises(ValidationError, match="Status COMPLETED must not contain a failure object"):
        ContactDiscoveryResponse(
            contract_version="1.0",
            discovery_run_id=VALID_RUN_ID,
            status="COMPLETED",
            identity=ContactIdentity(
                verified_domain="acme.com",
                primary_relationship="PRIMARY",
                confidence="CONFIDENT",
            ),
            contacts=[contact],
            failure=ContactDiscoveryFailure(
                code=ProviderFailureCode.DISCOVERY_OPERATIONAL_FAILURE,
                retryable=False,
                message="Error",
            ),
        )


def test_contact_discovery_response_identity_halted_semantics():
    # Valid IDENTITY_HALTED response
    resp = ContactDiscoveryResponse(
        contract_version="1.0",
        discovery_run_id=VALID_RUN_ID,
        status="IDENTITY_HALTED",
        identity=ContactIdentity(
            verified_domain="acme.com",
            primary_relationship="RELATED",
            confidence="AMBIGUOUS",
        ),
        contacts=[],
        failure=None,
    )
    assert resp.status == "IDENTITY_HALTED"

    # IDENTITY_HALTED fails if relationship is PRIMARY and confidence is CONFIDENT
    with pytest.raises(ValidationError, match="Status IDENTITY_HALTED requires non-\\(PRIMARY and CONFIDENT\\) identity"):
        ContactDiscoveryResponse(
            contract_version="1.0",
            discovery_run_id=VALID_RUN_ID,
            status="IDENTITY_HALTED",
            identity=ContactIdentity(
                verified_domain="acme.com",
                primary_relationship="PRIMARY",
                confidence="CONFIDENT",
            ),
            contacts=[],
            failure=None,
        )

    # IDENTITY_HALTED fails if contacts is non-empty
    contact = DiscoveredContact(
        person_kind=ContactPersonKind.ROLE_ADDRESS,
        first_name=None,
        last_name=None,
        title="Jobs",
        email="jobs@acme.com",
        confidence=ContactConfidence.HIGH,
        role_family=RoleFamily.RECRUITING,
        source="Website Discovery",
        source_url="https://acme.com/jobs",
        evidence=[
            ContactEvidenceSpan(
                claim="Jobs email",
                source_name="Careers",
                source_url="https://acme.com/jobs",
                source_excerpt="Email jobs@acme.com",
                classification="FACT",
                confidence="HIGH",
            )
        ],
    )
    with pytest.raises(ValidationError, match="Status IDENTITY_HALTED requires contacts to be empty"):
        ContactDiscoveryResponse(
            contract_version="1.0",
            discovery_run_id=VALID_RUN_ID,
            status="IDENTITY_HALTED",
            identity=ContactIdentity(
                verified_domain="acme.com",
                primary_relationship="UNRELATED",
                confidence="AMBIGUOUS",
            ),
            contacts=[contact],
            failure=None,
        )

    # IDENTITY_HALTED fails if failure is present
    with pytest.raises(ValidationError, match="Status IDENTITY_HALTED must not contain a failure object"):
        ContactDiscoveryResponse(
            contract_version="1.0",
            discovery_run_id=VALID_RUN_ID,
            status="IDENTITY_HALTED",
            identity=ContactIdentity(
                verified_domain="acme.com",
                primary_relationship="UNRELATED",
                confidence="AMBIGUOUS",
            ),
            contacts=[],
            failure=ContactDiscoveryFailure(
                code=ProviderFailureCode.DISCOVERY_OPERATIONAL_FAILURE,
                retryable=False,
                message="Error",
            ),
        )


def test_contact_discovery_response_failed_semantics():
    # Valid FAILED response: contacts must be empty, failure must be present,
    # identity can be PRIMARY + CONFIDENT (last known identity state)
    resp = ContactDiscoveryResponse(
        contract_version="1.0",
        discovery_run_id=VALID_RUN_ID,
        status="FAILED",
        identity=ContactIdentity(
            verified_domain="acme.com",
            primary_relationship="PRIMARY",
            confidence="CONFIDENT",
        ),
        contacts=[],
        failure=ContactDiscoveryFailure(
            code=ProviderFailureCode.DISCOVERY_TIMEOUT,
            retryable=True,
            message="Upstream crawl timed out after 30s",
        ),
    )
    assert resp.status == "FAILED"
    assert resp.failure is not None
    assert resp.failure.retryable is True

    # FAILED fails if contacts is non-empty
    contact = DiscoveredContact(
        person_kind=ContactPersonKind.ROLE_ADDRESS,
        first_name=None,
        last_name=None,
        title="Jobs",
        email="jobs@acme.com",
        confidence=ContactConfidence.HIGH,
        role_family=RoleFamily.RECRUITING,
        source="Website Discovery",
        source_url="https://acme.com/jobs",
        evidence=[
            ContactEvidenceSpan(
                claim="Jobs email",
                source_name="Careers",
                source_url="https://acme.com/jobs",
                source_excerpt="Email jobs@acme.com",
                classification="FACT",
                confidence="HIGH",
            )
        ],
    )
    with pytest.raises(ValidationError, match="Status FAILED must not contain discovered contacts"):
        ContactDiscoveryResponse(
            contract_version="1.0",
            discovery_run_id=VALID_RUN_ID,
            status="FAILED",
            identity=ContactIdentity(
                verified_domain="acme.com",
                primary_relationship="PRIMARY",
                confidence="CONFIDENT",
            ),
            contacts=[contact],
            failure=ContactDiscoveryFailure(
                code=ProviderFailureCode.DISCOVERY_TIMEOUT,
                retryable=True,
                message="Timeout",
            ),
        )

    # FAILED fails if failure is None
    with pytest.raises(ValidationError, match="Status FAILED requires a typed failure object"):
        ContactDiscoveryResponse(
            contract_version="1.0",
            discovery_run_id=VALID_RUN_ID,
            status="FAILED",
            identity=ContactIdentity(
                verified_domain="acme.com",
                primary_relationship="PRIMARY",
                confidence="CONFIDENT",
            ),
            contacts=[],
            failure=None,
        )


@pytest.mark.asyncio
async def test_contact_task_registry_idempotency_and_caching():
    from gateway.contact_registry import ContactTaskRegistry
    from gateway.registry import IdempotencyPayloadConflictError

    registry = ContactTaskRegistry()
    run_id = str(uuid.uuid4())
    fp = ContactTaskRegistry.compute_fingerprint("Acme Corp", "https://acme.com", "acme.com")

    # First caller is owner
    cached, fut, is_owner = await registry.get_or_register(run_id, fp)
    assert cached is None
    assert is_owner is True
    assert fut is not None

    # Concurrent caller awaits future
    cached2, fut2, is_owner2 = await registry.get_or_register(run_id, fp)
    assert cached2 is None
    assert is_owner2 is False
    assert fut2 is fut

    # Payload conflict raises error
    different_fp = ContactTaskRegistry.compute_fingerprint("Other Corp", "https://other.com", "other.com")
    with pytest.raises(IdempotencyPayloadConflictError):
        await registry.get_or_register(run_id, different_fp)

    # Complete the future
    sample_result = {
        "contract_version": "1.0",
        "discovery_run_id": run_id,
        "status": "COMPLETED",
        "identity": {
            "verified_domain": "acme.com",
            "primary_relationship": "PRIMARY",
            "confidence": "CONFIDENT",
        },
        "contacts": [],
        "failure": None,
        "unknowns": [],
        "metadata": {"duration_ms": 10.0},
    }
    await registry.complete(run_id, sample_result, fp)

    # Subsequent caller receives cached result
    cached3, fut3, is_owner3 = await registry.get_or_register(run_id, fp)
    assert cached3 is not None
    assert cached3["status"] == "COMPLETED"
    assert is_owner3 is False


def test_fastapi_contact_discover_endpoint_success():
    from fastapi.testclient import TestClient
    from unittest.mock import patch
    from gateway.main import app

    client = TestClient(app)
    run_id = str(uuid.uuid4())
    payload = {
        "contract_version": "1.0",
        "request_id": "req-fastapi-1",
        "discovery_run_id": run_id,
        "company_name": "Acme Corp",
        "domain": "acme.com",
    }

    mock_resp = {
        "contract_version": "1.0",
        "discovery_run_id": run_id,
        "status": "COMPLETED",
        "identity": {
            "verified_domain": "acme.com",
            "primary_relationship": "PRIMARY",
            "confidence": "CONFIDENT",
        },
        "contacts": [],
        "failure": None,
        "unknowns": [],
        "metadata": {"duration_ms": 50.0},
    }

    with patch("gateway.main.contact_runner.execute_sync", return_value=mock_resp):
        res = client.post("/contact/discover", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["contract_version"] == "1.0"
        assert data["discovery_run_id"] == run_id
        assert data["status"] == "COMPLETED"

        # Duplicate call returns cached result with cached=True
        res2 = client.post("/contact/discover", json=payload)
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["metadata"]["cached"] is True


def test_fastapi_contact_discover_endpoint_validation_error():
    from fastapi.testclient import TestClient
    from gateway.main import app

    client = TestClient(app)
    payload = {
        "contract_version": "1.0",
        "request_id": "req-invalid",
        "discovery_run_id": "invalid-uuid",
        "company_name": "Acme",
        "unknown_field": "invalid",
    }
    res = client.post("/contact/discover", json=payload)
    assert res.status_code == 400

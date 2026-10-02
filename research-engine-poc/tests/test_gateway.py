import pytest
import asyncio
from fastapi.testclient import TestClient
from gateway.main import app, task_registry
from gateway.registry import TaskRegistry
from gateway.schemas import ResearchCompanyRequest

client = TestClient(app)

def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["contract_version"] == "1.0"

def test_request_validation_extra_fields_forbidden():
    """Validates that unknown fields trigger HTTP 400."""
    payload = {
        "contract_version": "1.0",
        "request_id": "req-1",
        "research_run_id": "run-1",
        "company_name": "Linear",
        "unknown_extra_field": "disallowed",
    }
    resp = client.post("/research/company", json=payload)
    assert resp.status_code == 400
    data = resp.json()
    assert data["error"]["code"] == "INVALID_REQUEST"
    assert data["error"]["retryable"] is False

def test_request_validation_missing_contract_version():
    payload = {
        "request_id": "req-1",
        "research_run_id": "run-1",
        "company_name": "Linear",
    }
    resp = client.post("/research/company", json=payload)
    assert resp.status_code == 400

@pytest.mark.asyncio
async def test_task_registry_idempotency_and_caching():
    registry = task_registry
    run_id = "test-run-unique-id"

    # A. Concurrent callers: first is owner, second awaits existing future
    cached, fut, is_owner = await registry.get_or_register(run_id)
    assert cached is None
    assert is_owner is True
    assert fut is not None

    cached2, fut2, is_owner2 = await registry.get_or_register(run_id)
    assert cached2 is None
    assert is_owner2 is False
    assert fut2 is fut

    # B. Duplicate after terminal success/partial/identity_halt -> returns cached envelope
    sample_res = {"status": "COMPLETED", "research_run_id": run_id}
    await registry.complete(run_id, sample_res)

    assert await fut2 == sample_res

    cached3, fut3, is_owner3 = await registry.get_or_register(run_id)
    assert cached3 == sample_res
    assert is_owner3 is False
    assert fut3 is None


@pytest.mark.asyncio
async def test_task_registry_retryable_failure_permits_retry():
    # C. retryable FAILED -> permits a new execution
    registry = TaskRegistry()
    run_id = "run-retryable-fail"

    cached1, fut1, is_owner1 = await registry.get_or_register(run_id)
    assert is_owner1 is True

    # Mark as failed (transient exception during execution)
    await registry.fail(run_id, RuntimeError("Transient network error"))
    assert fut1.done()

    # Subsequent request with same run_id must be permitted to execute anew
    cached2, fut2, is_owner2 = await registry.get_or_register(run_id)
    assert cached2 is None
    assert is_owner2 is True
    assert fut2 is not None


@pytest.mark.asyncio
async def test_task_registry_permanent_failure_caches_result():
    # D. permanent FAILED -> returns cached fail
    registry = TaskRegistry()
    run_id = "run-permanent-fail"

    cached1, fut1, is_owner1 = await registry.get_or_register(run_id)
    assert is_owner1 is True

    perm_fail_envelope = {
        "status": "FAILED",
        "research_run_id": run_id,
        "error": {
            "code": "INVALID_INPUT",
            "message": "Malformed company entity",
            "retryable": False,
        },
    }
    await registry.complete(run_id, perm_fail_envelope)

    # Subsequent request returns cached failure
    cached2, fut2, is_owner2 = await registry.get_or_register(run_id)
    assert cached2 == perm_fail_envelope
    assert is_owner2 is False
    assert fut2 is None


@pytest.mark.asyncio
async def test_task_registry_payload_conflict_running():
    # Case E1: Idempotency conflict while RUNNING
    from gateway.registry import IdempotencyPayloadConflictError

    registry = TaskRegistry()
    run_id = "R123"
    fp_linear = TaskRegistry.compute_fingerprint("Linear")
    fp_stripe = TaskRegistry.compute_fingerprint("Stripe")

    # Request A starts for Linear
    cached1, fut1, is_owner1 = await registry.get_or_register(run_id, fp_linear)
    assert is_owner1 is True
    assert fut1 is not None

    # Request B with SAME run_id but DIFFERENT payload (Stripe) MUST be rejected with conflict
    with pytest.raises(IdempotencyPayloadConflictError) as exc_info:
        await registry.get_or_register(run_id, fp_stripe)

    assert exc_info.value.code == "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"
    assert "currently executing with a different request payload" in str(exc_info.value)


@pytest.mark.asyncio
async def test_task_registry_payload_conflict_cached():
    # Case E2: Idempotency conflict after terminal cache entry
    from gateway.registry import IdempotencyPayloadConflictError

    registry = TaskRegistry()
    run_id = "R123"
    fp_linear = TaskRegistry.compute_fingerprint("Linear")
    fp_stripe = TaskRegistry.compute_fingerprint("Stripe")

    # Request A completes for Linear
    cached1, fut1, is_owner1 = await registry.get_or_register(run_id, fp_linear)
    assert is_owner1 is True
    linear_envelope = {"status": "COMPLETED", "research_run_id": run_id, "summary": "Linear tools"}
    await registry.complete(run_id, linear_envelope, fp_linear)

    # Request A re-sent with SAME payload gets cached result
    cached_same, fut_same, is_owner_same = await registry.get_or_register(run_id, fp_linear)
    assert cached_same == linear_envelope
    assert is_owner_same is False

    # Request B with SAME run_id but DIFFERENT payload (Stripe) MUST NOT receive Linear cached result
    with pytest.raises(IdempotencyPayloadConflictError) as exc_info:
        await registry.get_or_register(run_id, fp_stripe)

    assert exc_info.value.code == "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"
    assert "already has a completed result with a different request payload" in str(exc_info.value)


@pytest.mark.asyncio
async def test_cancellation_safety_of_underlying_task():
    # Section 2: Cancellation safety of the shared in-flight task
    # 1. Request A starts research for run R123.
    # 2. Request A's HTTP waiter is cancelled/disconnected.
    # 3. The underlying shared research task MUST continue.
    # 4. Request B with the same research_run_id joins existing task and receives shared result.
    registry = TaskRegistry()
    run_id = "R-cancel-safety"
    fp = TaskRegistry.compute_fingerprint("Supabase")

    # Request A registers
    cached1, shared_fut, is_owner1 = await registry.get_or_register(run_id, fp)
    assert is_owner1 is True

    # Simulate Request A's HTTP waiter wrapping shared_fut with asyncio.shield
    async def waiter_a():
        return await asyncio.shield(shared_fut)

    task_waiter_a = asyncio.create_task(waiter_a())
    await asyncio.sleep(0.01)

    # Request A client disconnects / cancels
    task_waiter_a.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task_waiter_a

    # Crucial invariant: The shared underlying future in registry is NOT cancelled!
    assert not shared_fut.cancelled()
    assert not shared_fut.done()

    # Request B arrives with same run_id and fingerprint
    cached2, fut2, is_owner2 = await registry.get_or_register(run_id, fp)
    assert cached2 is None
    assert is_owner2 is False
    assert fut2 is shared_fut

    # Underlying background execution finishes
    result_envelope = {"status": "COMPLETED", "research_run_id": run_id}
    await registry.complete(run_id, result_envelope, fp)

    # Request B receives the shared result successfully
    res_b = await fut2
    assert res_b == result_envelope


def test_supplied_valid_domain_proceeds_to_normal_research(monkeypatch):
    """Supplied valid domain establishes CONFIDENT identity and proceeds to normal discovery/crawl/synthesis."""
    from gateway.main import pipeline_runner
    from core.models import SiteRelationship

    monkeypatch.setattr(pipeline_runner.acquirer, "acquire", lambda url: None)
    monkeypatch.setattr(
        pipeline_runner.verifier,
        "classify_relationship",
        lambda company_name, url, acquisition=None: (SiteRelationship.PRIMARY, "Verified primary corporate domain", []),
    )
    monkeypatch.setattr(pipeline_runner.discoverer, "discover", lambda **kwargs: [])
    monkeypatch.setattr(pipeline_runner.ranker, "select_budgeted_urls", lambda discovered, **kwargs: [])
    monkeypatch.setattr(pipeline_runner, "synth", None)

    res = pipeline_runner.execute_sync(
        request_id="req-valid",
        research_run_id="run-valid",
        company_name="Supabase",
        website_url="https://supabase.com",
        domain="supabase.com",
    )

    assert res["status"] in ("COMPLETED", "PARTIAL")
    assert res["status"] != "IDENTITY_HALTED"
    assert res["identity"]["confidence"] == "CONFIDENT"
    assert res["identity"]["domain"] == "supabase.com"


def test_supplied_invalid_domain_halts_as_unresolved_without_naked_fallback(monkeypatch):
    """Supplied invalid/unverifiable domain returns terminal IDENTITY_HALTED (UNRESOLVED) with NO naked-name fallback."""
    from gateway.main import pipeline_runner
    from core.models import SiteRelationship

    resolver_called = False
    def mock_resolve(*args, **kwargs):
        nonlocal resolver_called
        resolver_called = True
        raise AssertionError("resolver.resolve() MUST NOT be called when domain verification fails!")

    monkeypatch.setattr(pipeline_runner.resolver, "resolve", mock_resolve)
    monkeypatch.setattr(
        pipeline_runner.verifier,
        "classify_relationship",
        lambda company_name, url, acquisition=None: (SiteRelationship.UNKNOWN, "Failed verification: unrelated entity", []),
    )
    monkeypatch.setattr(pipeline_runner.acquirer, "acquire", lambda url: None)

    res = pipeline_runner.execute_sync(
        request_id="req-invalid",
        research_run_id="run-invalid",
        company_name="Supabase",
        website_url="https://fake-unrelated-domain.xyz",
        domain="fake-unrelated-domain.xyz",
    )

    assert resolver_called is False
    assert res["status"] == "IDENTITY_HALTED"
    assert res["identity"]["confidence"] == "UNRESOLVED"
    assert "fake-unrelated-domain.xyz" in res["identity"]["reasoning"]


def test_supplied_ambiguous_domain_halts_as_ambiguous_without_naked_fallback(monkeypatch):
    """Supplied ambiguous domain returns terminal IDENTITY_HALTED (AMBIGUOUS) with NO naked-name fallback."""
    from gateway.main import pipeline_runner
    from core.models import SiteRelationship

    resolver_called = False
    def mock_resolve(*args, **kwargs):
        nonlocal resolver_called
        resolver_called = True
        raise AssertionError("resolver.resolve() MUST NOT be called when domain is ambiguous!")

    monkeypatch.setattr(pipeline_runner.resolver, "resolve", mock_resolve)
    monkeypatch.setattr(
        pipeline_runner.verifier,
        "classify_relationship",
        lambda company_name, url, acquisition=None: (SiteRelationship.RELATED, "Product or subsidiary page", []),
    )
    monkeypatch.setattr(pipeline_runner.acquirer, "acquire", lambda url: None)

    res = pipeline_runner.execute_sync(
        request_id="req-ambig",
        research_run_id="run-ambig",
        company_name="Acme",
        website_url="https://related-brand.com",
        domain="related-brand.com",
    )

    assert resolver_called is False
    assert res["status"] == "IDENTITY_HALTED"
    assert res["identity"]["confidence"] == "AMBIGUOUS"
    assert "ambiguous (RELATED)" in res["identity"]["reasoning"]


def test_no_url_or_domain_halts_as_unresolved_without_network_call(monkeypatch):
    """Missing website URL and domain immediately halts as UNRESOLVED without any network/resolver calls."""
    from gateway.main import pipeline_runner

    acquirer_called = False
    resolver_called = False

    def mock_acquire(*args, **kwargs):
        nonlocal acquirer_called
        acquirer_called = True
        raise AssertionError("acquirer.acquire() MUST NOT be called when domain/URL is absent!")

    def mock_resolve(*args, **kwargs):
        nonlocal resolver_called
        resolver_called = True
        raise AssertionError("resolver.resolve() MUST NOT be called when domain/URL is absent!")

    monkeypatch.setattr(pipeline_runner.acquirer, "acquire", mock_acquire)
    monkeypatch.setattr(pipeline_runner.resolver, "resolve", mock_resolve)

    res = pipeline_runner.execute_sync(
        request_id="req-none",
        research_run_id="run-none",
        company_name="Acme",
        website_url=None,
        domain=None,
    )

    assert acquirer_called is False
    assert resolver_called is False
    assert res["status"] == "IDENTITY_HALTED"
    assert res["identity"]["confidence"] == "UNRESOLVED"
    assert "No website URL or domain provided" in res["identity"]["reasoning"]

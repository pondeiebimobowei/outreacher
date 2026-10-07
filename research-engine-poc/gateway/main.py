import os
import sys
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from .schemas import ResearchCompanyRequest, ContactDiscoveryRequest
from .registry import TaskRegistry, IdempotencyPayloadConflictError
from .contact_registry import ContactTaskRegistry
from .service import ResearchPipelineRunner, ENGINE_VERSION
from contact_discovery.service import ContactDiscoveryPipelineRunner

app = FastAPI(
    title="Research Engine Gateway",
    version=ENGINE_VERSION,
    description="Transport Contract v1.0 Gateway for Outreacher Research Engine"
)

# Shared in-memory single-instance registry and pipeline runner
task_registry = TaskRegistry()
pipeline_runner = ResearchPipelineRunner()

# Contact discovery in-memory registry and pipeline runner
contact_registry = ContactTaskRegistry()
contact_runner = ContactDiscoveryPipelineRunner()

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Format request validation errors according to Transport Contract v1.0 error envelope.
    """
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "contract_version": "1.0",
            "engine_version": ENGINE_VERSION,
            "request_id": "unknown",
            "research_run_id": "unknown",
            "status": "FAILED",
            "identity": None,
            "result": None,
            "error": {
                "code": "INVALID_REQUEST",
                "message": str(exc),
                "retryable": False,
            },
            "metadata": {
                "duration_ms": 0.0,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "cached": False,
            }
        }
    )

@app.get("/health")
async def health():
    return {"status": "ok", "engine_version": ENGINE_VERSION, "contract_version": "1.0"}

@app.post("/research/company")
async def research_company(req: ResearchCompanyRequest):
    industry = req.context.industry if req.context else None
    fingerprint = TaskRegistry.compute_fingerprint(
        company_name=req.company_name,
        website_url=req.website_url,
        domain=req.domain,
        industry=industry,
    )

    try:
        cached, fut, is_owner = await task_registry.get_or_register(req.research_run_id, fingerprint)
    except IdempotencyPayloadConflictError as conflict_err:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "contract_version": "1.0",
                "engine_version": ENGINE_VERSION,
                "request_id": req.request_id,
                "research_run_id": req.research_run_id,
                "status": "FAILED",
                "identity": None,
                "result": None,
                "error": {
                    "code": conflict_err.code,
                    "message": str(conflict_err),
                    "retryable": False,
                },
                "metadata": {
                    "duration_ms": 0.0,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "cached": False,
                },
            },
        )

    if cached is not None:
        # Return cached terminal result with updated cached flag and request_id
        res = dict(cached)
        res["request_id"] = req.request_id
        res_metadata = dict(res.get("metadata", {}))
        res_metadata["cached"] = True
        res["metadata"] = res_metadata
        return JSONResponse(status_code=status.HTTP_200_OK, content=res)

    if is_owner:
        # Launch the underlying execution as an un-cancellable background task on the loop
        async def _execute_task():
            loop = asyncio.get_running_loop()
            try:
                envelope = await loop.run_in_executor(
                    None,
                    pipeline_runner.execute_sync,
                    req.request_id,
                    req.research_run_id,
                    req.company_name,
                    req.website_url,
                    req.domain,
                    industry,
                )
                await task_registry.complete(req.research_run_id, envelope, fingerprint)
            except Exception as exc:
                await task_registry.fail(req.research_run_id, exc)

        # Fire independent task not tied to HTTP request scope
        asyncio.create_task(_execute_task())

    # Both owner and joining waiters await the shared future shielded from client disconnects
    try:
        res = await asyncio.shield(fut)
        res_copy = dict(res)
        res_copy["request_id"] = req.request_id
        if not is_owner:
            res_meta = dict(res_copy.get("metadata", {}))
            res_meta["cached"] = True
            res_copy["metadata"] = res_meta
        return JSONResponse(status_code=status.HTTP_200_OK, content=res_copy)
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "contract_version": "1.0",
                "engine_version": ENGINE_VERSION,
                "request_id": req.request_id,
                "research_run_id": req.research_run_id,
                "status": "FAILED",
                "identity": None,
                "result": None,
                "error": {
                    "code": "EXECUTION_FAILED",
                    "message": str(exc),
                    "retryable": True,
                },
                "metadata": {
                    "duration_ms": 0.0,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "cached": False,
                }
            }
        )


@app.post("/contact/discover")
async def discover_contacts(req: ContactDiscoveryRequest):
    run_id_str = str(req.discovery_run_id)
    fingerprint = ContactTaskRegistry.compute_fingerprint(
        company_name=req.company_name,
        website_url=req.website_url,
        domain=req.domain,
        target_roles=req.target_roles,
    )

    try:
        cached, fut, is_owner = await contact_registry.get_or_register(run_id_str, fingerprint)
    except IdempotencyPayloadConflictError as conflict_err:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "contract_version": "1.0",
                "discovery_run_id": run_id_str,
                "status": "FAILED",
                "identity": {
                    "verified_domain": req.domain or "",
                    "primary_relationship": "UNKNOWN",
                    "confidence": "UNRESOLVED",
                },
                "contacts": [],
                "failure": {
                    "code": "DISCOVERY_OPERATIONAL_FAILURE",
                    "retryable": False,
                    "message": str(conflict_err),
                },
                "unknowns": ["idempotency_payload_conflict"],
                "metadata": {"cached": False},
            },
        )

    if cached is not None:
        res = dict(cached)
        res_metadata = dict(res.get("metadata", {}))
        res_metadata["cached"] = True
        res["metadata"] = res_metadata
        return JSONResponse(status_code=status.HTTP_200_OK, content=res)

    if is_owner:
        async def _execute_contact_task():
            try:
                envelope = await asyncio.to_thread(contact_runner.execute_sync, req)
                await contact_registry.complete(run_id_str, envelope, fingerprint)
            except Exception as exc:
                await contact_registry.fail(run_id_str, exc)

        asyncio.create_task(_execute_contact_task())

    try:
        res = await asyncio.shield(fut)
        res_copy = dict(res)
        if not is_owner:
            res_meta = dict(res_copy.get("metadata", {}))
            res_meta["cached"] = True
            res_copy["metadata"] = res_meta
        return JSONResponse(status_code=status.HTTP_200_OK, content=res_copy)
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "contract_version": "1.0",
                "discovery_run_id": run_id_str,
                "status": "FAILED",
                "identity": {
                    "verified_domain": req.domain or "",
                    "primary_relationship": "UNKNOWN",
                    "confidence": "UNRESOLVED",
                },
                "contacts": [],
                "failure": {
                    "code": "DISCOVERY_OPERATIONAL_FAILURE",
                    "retryable": True,
                    "message": str(exc),
                },
                "unknowns": ["execution_failed"],
                "metadata": {"error": str(exc)},
            },
        )

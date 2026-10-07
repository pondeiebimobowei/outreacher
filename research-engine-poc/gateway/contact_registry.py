"""
In-memory single-instance task registry for contact discovery.
Provides deduplication of in-flight requests, caching of terminal results,
and payload fingerprint validation to prevent idempotency key reuse.
"""

import asyncio
from collections import OrderedDict
import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple

from gateway.registry import IdempotencyPayloadConflictError


class ContactTaskRegistry:
    """
    In-memory task registry providing single-process idempotency for contact discovery:
      - Deduplicates concurrent in-flight executions keyed by discovery_run_id
      - Validates payload fingerprint to prevent key reuse across different requests
      - Caches terminal results (bounded LRU, max 1000 items)
      - Not cluster-wide (scoped strictly to this process)
    """

    def __init__(self, max_cached: int = 1000):
        # Maps run_id -> (asyncio.Future, payload_fingerprint)
        self._in_flight: Dict[str, Tuple[asyncio.Future, str]] = {}
        # Maps run_id -> (terminal_envelope, payload_fingerprint)
        self._terminal_cache: OrderedDict[str, Tuple[Dict[str, Any], str]] = OrderedDict()
        self._lock = asyncio.Lock()
        self._max_cached = max_cached

    @staticmethod
    def compute_fingerprint(
        company_name: str,
        website_url: Optional[str] = None,
        domain: Optional[str] = None,
        target_roles: Optional[List[str]] = None,
    ) -> str:
        """Computes deterministic sha256 hash over canonical contact discovery parameters."""
        canonical = {
            "company_name": company_name.strip().lower(),
            "website_url": website_url.strip().lower() if website_url else "",
            "domain": domain.strip().lower() if domain else "",
            "target_roles": sorted([r.strip().lower() for r in (target_roles or [])]),
        }
        raw = json.dumps(canonical, sort_keys=True)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    async def get_or_register(
        self,
        run_id: str,
        fingerprint: Optional[str] = None,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[asyncio.Future], bool]:
        """
        Returns (cached_result, future, is_owner):
          - If cached_result is not None: terminal execution was already completed.
          - If future is not None and not is_owner: execution is currently in-flight; caller should await future.
          - If is_owner is True: caller is responsible for executing discovery and resolving the future.
        Raises IdempotencyPayloadConflictError if run_id exists with a different payload fingerprint.
        """
        async with self._lock:
            # Check terminal cache
            if run_id in self._terminal_cache:
                cached_res, cached_fp = self._terminal_cache[run_id]
                if fingerprint and cached_fp and fingerprint != cached_fp:
                    raise IdempotencyPayloadConflictError(
                        run_id,
                        f"discovery_run_id '{run_id}' already has a completed result with a different request payload.",
                    )
                self._terminal_cache.move_to_end(run_id)
                return cached_res, None, False

            # Check in-flight
            if run_id in self._in_flight:
                fut, in_flight_fp = self._in_flight[run_id]
                if fingerprint and in_flight_fp and fingerprint != in_flight_fp:
                    raise IdempotencyPayloadConflictError(
                        run_id,
                        f"discovery_run_id '{run_id}' is currently executing with a different request payload.",
                    )
                return None, fut, False

            loop = asyncio.get_running_loop()
            fut = loop.create_future()
            self._in_flight[run_id] = (fut, fingerprint or "")
            return None, fut, True

    async def complete(self, run_id: str, result: Dict[str, Any], fingerprint: Optional[str] = None) -> None:
        async with self._lock:
            in_flight_entry = self._in_flight.pop(run_id, None)
            fut = in_flight_entry[0] if in_flight_entry else None
            fp = fingerprint or (in_flight_entry[1] if in_flight_entry else "")

            # Check if result is a terminal FAILED with retryable=True
            failure = result.get("failure") if isinstance(result, dict) else None
            is_retryable = failure.get("retryable", False) if isinstance(failure, dict) else False

            # Cache in terminal_cache if NOT a retryable failure:
            # (COMPLETED, IDENTITY_HALTED, or non-retryable FAILED are cached)
            if not is_retryable:
                self._terminal_cache[run_id] = (result, fp)
                if len(self._terminal_cache) > self._max_cached:
                    self._terminal_cache.popitem(last=False)

            if fut and not fut.done():
                fut.set_result(result)

    async def fail(self, run_id: str, exc: Exception) -> None:
        async with self._lock:
            in_flight_entry = self._in_flight.pop(run_id, None)
            fut = in_flight_entry[0] if in_flight_entry else None
            if fut and not fut.done():
                fut.set_exception(exc)

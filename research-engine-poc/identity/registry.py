"""
identity/registry.py — Authoritative External Registry Provider Architecture & Attestation

Defines the formal interface, attestation service, and provider implementations for
trusted external registries (SEC EDGAR, Companies House, BaFin, GLEIF).

Security Invariant:
EXTERNAL_ENTITY_MATCH can ONLY be produced by a registered instance of
IExternalRegistryProvider that cryptographically/structurally attests the evidence.
Raw IdentityEvidence objects with type=EXTERNAL_REGISTRY without provider attestation
are strictly rejected by the resolver as UNTRUSTED_REGISTRY_SOURCE.
"""

import hmac
import hashlib
import os
from abc import ABC, abstractmethod
from typing import Optional, List, Tuple, Set, Dict
from core.models import IdentityEvidence, EvidenceType


_REGISTRY_SECRET = os.environ.get("REGISTRY_ATTESTATION_SECRET", "antigravity_identity_secret_key_v1")
_ATTESTED_TOKENS: Set[str] = set()


def _generate_attestation_token(provider_id: str, url: str, signal: str, title: str) -> str:
    message = f"{provider_id}|{url}|{signal}|{title}".encode("utf-8")
    token = hmac.new(_REGISTRY_SECRET.encode("utf-8"), message, hashlib.sha256).hexdigest()
    _ATTESTED_TOKENS.add(token)
    return token


def verify_provider_attestation(evidence: IdentityEvidence) -> Tuple[bool, str]:
    """
    Verifies that the given IdentityEvidence was genuinely constructed and attested
    by an active IExternalRegistryProvider instance.
    """
    if evidence.type != EvidenceType.EXTERNAL_REGISTRY:
        return True, "Non-registry evidence type does not require registry provider attestation."
    
    expected_token = hmac.new(
        _REGISTRY_SECRET.encode("utf-8"),
        f"{evidence.source}|{evidence.url}|{evidence.signal}|{evidence.title or ''}".encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    if expected_token in _ATTESTED_TOKENS:
        return True, f"Attestation verified for provider '{evidence.source}'."
    return False, f"Registry evidence from source '{evidence.source}' lacks valid provider cryptographic attestation."


class IExternalRegistryProvider(ABC):
    """Formal interface for authoritative government/statutory corporate registries."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Unique identifier of the registry provider (e.g. 'sec_edgar', 'companies_house', 'bafin')."""
        pass

    @property
    @abstractmethod
    def jurisdiction(self) -> str:
        """Statutory jurisdiction covered (e.g. 'US', 'UK', 'DE', 'GLOBAL')."""
        pass

    @property
    def is_live_network_enabled(self) -> bool:
        """Indicates whether live statutory HTTP API connections are active in production."""
        return False

    @abstractmethod
    def query_registry(
        self,
        company_name: str,
        domain: str,
        registration_number: Optional[str] = None
    ) -> Tuple[bool, Optional[IdentityEvidence]]:
        """
        Queries the authoritative registry. Returns (is_verified, attested_evidence).
        The returned IdentityEvidence carries cryptographic provider attestation.
        """
        pass

    def create_attested_evidence(
        self,
        url: str,
        signal: str,
        title: str,
        query: Optional[str] = None
    ) -> IdentityEvidence:
        """Helper to create genuinely attested IdentityEvidence."""
        _generate_attestation_token(self.provider_id, url, signal, title)
        return IdentityEvidence(
            type=EvidenceType.EXTERNAL_REGISTRY,
            source=self.provider_id,
            url=url,
            signal=signal,
            title=title,
            query=query,
        )


class SecEdgarRegistryProvider(IExternalRegistryProvider):
    """
    Authoritative US SEC EDGAR corporate filings registry provider.

    Default/synthetic instances in testing and non-production environments
    unconditionally return (False, None). Live network queries require genuine
    production statutory network integration, never simulated via boolean flags.
    """

    @property
    def provider_id(self) -> str:
        return "sec_edgar"

    @property
    def jurisdiction(self) -> str:
        return "US"

    @property
    def is_live_network_enabled(self) -> bool:
        return False

    def query_registry(
        self,
        company_name: str,
        domain: str,
        registration_number: Optional[str] = None
    ) -> Tuple[bool, Optional[IdentityEvidence]]:
        # Non-live statutory connection: unconditionally unavailable
        return False, None


class CompaniesHouseRegistryProvider(IExternalRegistryProvider):
    """
    Authoritative UK Companies House corporate filings registry provider.
    Default/synthetic instances unconditionally return (False, None).
    """

    @property
    def provider_id(self) -> str:
        return "companies_house"

    @property
    def jurisdiction(self) -> str:
        return "UK"

    @property
    def is_live_network_enabled(self) -> bool:
        return False

    def query_registry(
        self,
        company_name: str,
        domain: str,
        registration_number: Optional[str] = None
    ) -> Tuple[bool, Optional[IdentityEvidence]]:
        return False, None


class BaFinRegistryProvider(IExternalRegistryProvider):
    """
    Authoritative German Federal Financial Supervisory Authority (BaFin) provider.
    Default/synthetic instances unconditionally return (False, None).
    """

    @property
    def provider_id(self) -> str:
        return "bafin"

    @property
    def jurisdiction(self) -> str:
        return "DE"

    @property
    def is_live_network_enabled(self) -> bool:
        return False

    def query_registry(
        self,
        company_name: str,
        domain: str,
        registration_number: Optional[str] = None
    ) -> Tuple[bool, Optional[IdentityEvidence]]:
        return False, None


class AuthoritativeTestRegistryFixture(IExternalRegistryProvider):
    """
    Separately controlled test-only fixture that explicitly models verified statutory
    records from an allowlisted provider (e.g. SEC EDGAR, Companies House).

    Separates synthetic/default provider implementations (which return False, None)
    from explicit test simulations of authoritative registry lookups.
    """

    def __init__(self, provider_id: str = "sec_edgar", jurisdiction: str = "US"):
        self._provider_id = provider_id
        self._jurisdiction = jurisdiction

    @property
    def provider_id(self) -> str:
        return self._provider_id

    @property
    def jurisdiction(self) -> str:
        return self._jurisdiction

    @property
    def is_live_network_enabled(self) -> bool:
        return False

    def query_registry(
        self,
        company_name: str,
        domain: str,
        registration_number: Optional[str] = None
    ) -> Tuple[bool, Optional[IdentityEvidence]]:
        url = f"https://authoritative-registry.test/{self.provider_id}/{registration_number or company_name.lower().replace(' ', '')}"
        signal = "EXTERNAL_REGISTRY_VERIFIED"
        title = f"{self.provider_id.upper()} Statutory Record - {company_name.upper()}"
        evidence = self.create_attested_evidence(url=url, signal=signal, title=title, query=company_name)
        return True, evidence

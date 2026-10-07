from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, UUID4, model_validator
from typing_extensions import Self

from contact_discovery.models import (
    ContactDiscoveryFailure,
    ContactIdentity,
    DiscoveredContact,
)


class ResearchCompanyContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    industry: Optional[str] = None


class ResearchCompanyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["1.0"]
    request_id: str = Field(..., min_length=1)
    research_run_id: str = Field(..., min_length=1)
    company_name: str = Field(..., min_length=1)
    website_url: Optional[str] = None
    domain: Optional[str] = None
    context: Optional[ResearchCompanyContext] = None


class ContactDiscoveryContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    industry: Optional[str] = None
    company_id: Optional[str] = None
    workspace_id: Optional[str] = None


class ContactDiscoveryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["1.0"]
    request_id: str = Field(..., min_length=1)
    discovery_run_id: UUID4
    company_name: str = Field(..., min_length=1)
    website_url: Optional[str] = None
    domain: Optional[str] = None
    target_roles: Optional[List[str]] = None
    context: Optional[ContactDiscoveryContext] = None


class ContactDiscoveryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["1.0"]  # REQUIRED - no default value
    discovery_run_id: UUID4           # Strictly UUID v4
    status: Literal["COMPLETED", "IDENTITY_HALTED", "FAILED"]
    identity: ContactIdentity
    contacts: List[DiscoveredContact]
    failure: Optional[ContactDiscoveryFailure] = None
    unknowns: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)  # Telemetry ONLY

    @model_validator(mode="after")
    def validate_semantics(self) -> Self:
        if self.status == "COMPLETED":
            if self.identity.primary_relationship != "PRIMARY":
                raise ValueError("Status COMPLETED requires identity.primary_relationship to be PRIMARY")
            if self.identity.confidence != "CONFIDENT":
                raise ValueError("Status COMPLETED requires identity.confidence to be CONFIDENT")
            if self.failure is not None:
                raise ValueError("Status COMPLETED must not contain a failure object")
        elif self.status == "IDENTITY_HALTED":
            if self.identity.primary_relationship == "PRIMARY" and self.identity.confidence == "CONFIDENT":
                raise ValueError("Status IDENTITY_HALTED requires non-(PRIMARY and CONFIDENT) identity")
            if len(self.contacts) > 0:
                raise ValueError("Status IDENTITY_HALTED requires contacts to be empty")
            if self.failure is not None:
                raise ValueError("Status IDENTITY_HALTED must not contain a failure object")
        elif self.status == "FAILED":
            if len(self.contacts) > 0:
                raise ValueError("Status FAILED must not contain discovered contacts")
            if self.failure is None:
                raise ValueError("Status FAILED requires a typed failure object (code, retryable, message)")
            # Identity represents last known identity state and may legitimately be PRIMARY + CONFIDENT
        return self

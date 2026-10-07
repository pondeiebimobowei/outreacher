"""Domain models and schemas for Contact Discovery."""

from enum import Enum
from typing import List, Literal, Optional
from typing_extensions import Self
from pydantic import BaseModel, ConfigDict, field_validator, model_validator


ALLOWED_ROLE_ADDRESS_MAILBOXES = {
    "careers",
    "jobs",
    "recruiting",
    "hiring",
    "contact",
    "team",
    "hello",
    "info",
}


class ContactPersonKind(str, Enum):
    PERSON = "PERSON"
    ROLE_ADDRESS = "ROLE_ADDRESS"


class ContactConfidence(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class RoleFamily(str, Enum):
    LEADERSHIP = "LEADERSHIP"
    ENGINEERING = "ENGINEERING"
    PRODUCT = "PRODUCT"
    RECRUITING = "RECRUITING"
    GENERAL = "GENERAL"


class ProviderFailureCode(str, Enum):
    DISCOVERY_OPERATIONAL_FAILURE = "DISCOVERY_OPERATIONAL_FAILURE"
    DISCOVERY_TIMEOUT = "DISCOVERY_TIMEOUT"
    UPSTREAM_SEARCH_FAILED = "UPSTREAM_SEARCH_FAILED"
    ACQUISITION_RATE_LIMITED = "ACQUISITION_RATE_LIMITED"


class ContactDiscoveryFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: ProviderFailureCode
    retryable: bool
    message: str


class ContactEvidenceSpan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim: str
    source_name: str
    source_url: str
    source_excerpt: str
    classification: Literal["FACT"] = "FACT"
    confidence: Literal["HIGH", "MEDIUM"]

    @field_validator("source_url")
    @classmethod
    def validate_http_url(cls, v: str) -> str:
        if not v or not v.lower().startswith(("http://", "https://")):
            raise ValueError("source_url must use http or https scheme")
        return v


class DiscoveredContact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    person_kind: ContactPersonKind
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    confidence: ContactConfidence
    role_family: Optional[RoleFamily] = None
    source: str
    source_url: str
    evidence: List[ContactEvidenceSpan]

    @field_validator("source_url")
    @classmethod
    def validate_http_url(cls, v: str) -> str:
        if not v or not v.lower().startswith(("http://", "https://")):
            raise ValueError("source_url must use http or https scheme")
        return v

    @model_validator(mode="after")
    def validate_candidate_invariants(self) -> Self:
        if self.person_kind == ContactPersonKind.PERSON:
            if not self.first_name or not self.first_name.strip():
                raise ValueError("PERSON requires a non-empty first_name")

            full_name = f"{self.first_name} {self.last_name or ''}".strip().lower()
            name_grounded = any(full_name in ev.source_excerpt.lower() for ev in self.evidence)
            if not name_grounded:
                raise ValueError(f"PERSON name '{full_name}' must be grounded in an evidence excerpt")

            if self.title and self.title.strip():
                title_lower = self.title.strip().lower()
                title_grounded = any(title_lower in ev.source_excerpt.lower() for ev in self.evidence)
                if not title_grounded:
                    raise ValueError(f"PERSON title '{self.title}' must be grounded in an evidence excerpt")

        elif self.person_kind == ContactPersonKind.ROLE_ADDRESS:
            if self.first_name is not None or self.last_name is not None:
                raise ValueError("ROLE_ADDRESS must have null first_name and last_name")
            if not self.email or not self.email.strip():
                raise ValueError("ROLE_ADDRESS requires a valid email")

            local_part = self.email.split("@")[0].lower()
            if local_part not in ALLOWED_ROLE_ADDRESS_MAILBOXES:
                raise ValueError(f"ROLE_ADDRESS mailbox '{local_part}' is not in allowed set")

            email_grounded = any(self.email.lower() in ev.source_excerpt.lower() for ev in self.evidence)
            if not email_grounded:
                raise ValueError(f"ROLE_ADDRESS email '{self.email}' must be grounded in an evidence excerpt")

        return self


class ContactIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verified_domain: str
    primary_relationship: Literal["PRIMARY", "RELATED", "LEGACY", "UNRELATED", "UNKNOWN"]
    confidence: Literal["CONFIDENT", "AMBIGUOUS", "UNRESOLVED"]

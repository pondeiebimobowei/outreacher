from typing import Optional, Any
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, field_validator

class SearchResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    title: str
    url: str
    snippet: str

class IdentityConfidence(str, Enum):
    # Unambiguous single match with verified primary relationship and distinctive name.
    CONFIDENT = "CONFIDENT"
    # Multiple competing primary candidates or single candidate with high shape-risk.
    AMBIGUOUS = "AMBIGUOUS"
    # Identity could not be established with available evidence (0 primary candidates).
    UNRESOLVED = "UNRESOLVED"

class SiteRelationship(str, Enum):
    # This site IS the target company's primary web presence.
    PRIMARY = "PRIMARY"
    # This site belongs to a related entity: product, subsidiary, active affiliate.
    RELATED = "RELATED"
    # Site self-identifies as the company but domain has no correspondence.
    # Typically a rebranded, acquired, or redirected legacy domain.
    # Still company-controlled, but not the canonical identity URL.
    LEGACY = "LEGACY"
    # A different company with incidental name overlap.
    UNRELATED = "UNRELATED"
    # Insufficient evidence to classify.
    UNKNOWN = "UNKNOWN"

class EvidenceType(str, Enum):
    SEARCH_RESULT  = "SEARCH_RESULT"
    # Page directly self-identifies as the company ("Linear is...", title = "Linear")
    SELF_IDENTITY  = "SELF_IDENTITY"
    # Page describes a relationship between this site and the company
    # ("v0 is built by Vercel", "Monnify acquired by Moniepoint")
    RELATIONSHIP   = "RELATIONSHIP"
    # Page merely mentions the company as a third party
    THIRD_PARTY    = "THIRD_PARTY"
    # Generic page-identity signal (legacy; prefer the three types above)
    PAGE_IDENTITY  = "PAGE_IDENTITY"
    # Search-indexed acquisition fallback evidence (Track 2)
    FALLBACK_INDEXED = "FALLBACK_INDEXED"
    # Independent trusted external registry record (e.g. SEC, BaFin, Companies House)
    EXTERNAL_REGISTRY = "EXTERNAL_REGISTRY"

class IdentityEvidence(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: EvidenceType
    source: str
    url: str
    signal: str
    rank: Optional[int] = None
    query: Optional[str] = None
    title: Optional[str] = None
    snippet: Optional[str] = None
    route_kind: Optional[str] = None
    strength: Optional[str] = None

class IdentityCandidate(BaseModel):
    model_config = ConfigDict(frozen=True)

    domain: str
    is_verified: bool = False
    # Relationship between this domain and the target company
    relationship: Optional[SiteRelationship] = None
    relationship_reasoning: str = ""
    # kept for backward-compat; mirrors relationship_reasoning
    verification_msg: str = ""
    evidence: tuple[IdentityEvidence, ...] = Field(default_factory=tuple)

    @field_validator("evidence", mode="before")
    @classmethod
    def coerce_evidence(cls, v: Any) -> tuple[IdentityEvidence, ...]:
        if isinstance(v, (list, set)):
            return tuple(v)
        if isinstance(v, tuple):
            return v
        return tuple(v) if v else ()

    @property
    def is_indexed_only(self) -> bool:
        """
        True if candidate verification relied wholly or partially on search-engine
        indexed fallback snippets (EvidenceType.FALLBACK_INDEXED) rather than complete
        dual-page live crawled first-party verification.
        Carries a permanent epistemic cap: cannot produce CONFIDENT resolution.
        """
        return any(ev.type == EvidenceType.FALLBACK_INDEXED for ev in self.evidence)

class IdentityDiagnosticTrace(BaseModel):
    model_config = ConfigDict(frozen=True)

    query: str
    tokens: tuple[str, ...]
    common_word_hits: tuple[str, ...]
    generic_term_hits: tuple[str, ...]
    domain_slug: str
    domain_correspondence: str
    candidate_count: int
    competitor_count: int
    self_id_strength: str
    corroboration_strength: str
    indexed_only: bool
    relationship_status: str
    shape_risk_result: bool
    entity_discrimination_basis: str
    final_decision_rule: str
    evidence_sources: tuple[str, ...] = Field(default_factory=tuple)

class CompanyIdentity(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    domain: str
    website_url: str
    confidence: IdentityConfidence
    reasoning: str
    # candidates[] is the single authoritative evidence container.
    # Each candidate carries its own search + verification evidence.
    # Do not add a separate top-level evidence list — it would drift.
    candidates: tuple[IdentityCandidate, ...] = Field(default_factory=tuple)
    diagnostic_trace: Optional[IdentityDiagnosticTrace] = None

    @field_validator("candidates", mode="before")
    @classmethod
    def coerce_candidates(cls, v: Any) -> tuple[IdentityCandidate, ...]:
        if isinstance(v, (list, set)):
            return tuple(v)
        if isinstance(v, tuple):
            return v
        return tuple(v) if v else ()

class IdentityContext(BaseModel):
    """
    Structured caller-supplied context for entity disambiguation.

    Only explicit structural discriminators (location, jurisdiction, country,
    headquarters, headquarters_country, legal_name, registration_number,
    product_id, trusted_registry_id) can serve as entity discriminators.

    General free-text descriptions or industry categories do NOT act as entity discriminators.
    """
    model_config = ConfigDict(frozen=True)

    country: Optional[str] = None             # "Canada", "Germany", "Nigeria", "United States"
    jurisdiction: Optional[str] = None        # "Germany", "Delaware", "Ontario", "UK"
    location: Optional[str] = None            # "Toronto", "Berlin", "Lagos", "Boston"
    headquarters: Optional[str] = None        # "Toronto", "Berlin", "Milan", "San Francisco"
    headquarters_country: Optional[str] = None# "Canada", "Germany", "Italy", "United States"
    legal_name: Optional[str] = None          # "Trade Republic Bank GmbH", "Iron Mountain Inc."
    registration_number: Optional[str] = None # "HRB 12345", "7349102"
    product_id: Optional[str] = None          # "specific product / service identifier"
    trusted_registry_id: Optional[str] = None # "verified registry entity ID"
    company_type: Optional[str] = None        # "GmbH", "S.p.A.", "LLC", "Inc"
    industry: Optional[str] = None            # Informational only — not a discriminator
    description: Optional[str] = None         # Informational only — not a discriminator

class PageType(str, Enum):
    HOMEPAGE = "HOMEPAGE"
    CAREERS_INDEX = "CAREERS_INDEX"
    JOB_LISTING = "JOB_LISTING"
    ABOUT = "ABOUT"
    PRODUCT = "PRODUCT"
    CASE_STUDY = "CASE_STUDY"
    BLOG = "BLOG"
    CONTACT = "CONTACT"
    OTHER = "OTHER"

class DiscoveryPurpose(str, Enum):
    HOMEPAGE = "HOMEPAGE"
    ABOUT = "ABOUT"
    PRODUCT = "PRODUCT"
    CAREERS = "CAREERS"
    CUSTOMERS = "CUSTOMERS"
    NEWS = "NEWS"
    ENGINEERING = "ENGINEERING"
    CONTACT = "CONTACT"
    ATS = "ATS"

class DiscoveryQuery(BaseModel):
    model_config = ConfigDict(frozen=True)

    purpose: DiscoveryPurpose
    query: str
    max_results: int = 2
    provider: str = "site"

class DiscoveredURL(BaseModel):
    model_config = ConfigDict(frozen=True)

    url: str
    purpose: DiscoveryPurpose
    source: str
    query: str
    rank: int
    provisional_page_type: PageType

class DocumentQuality(str, Enum):
    VALID = "VALID"
    TOO_SHORT = "TOO_SHORT"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"
    BLOCKED = "BLOCKED"
    SUSPECT = "SUSPECT"
    FETCH_FAILED = "FETCH_FAILED"
    HTTP_ERROR = "HTTP_ERROR"

class CrawlAttempt(BaseModel):
    model_config = ConfigDict(frozen=True)

    strategy: str
    quality: DocumentQuality
    error: Optional[str] = None

class CrawledDocument(BaseModel):
    model_config = ConfigDict(frozen=True)

    url: str
    final_url: str
    status_code: Optional[int] = None
    title: Optional[str] = None
    content: Optional[str] = None
    raw_html: Optional[str] = None
    content_type: Optional[str] = None
    retrieved_at: datetime
    word_count: int = 0
    page_type: PageType
    provisional_page_type: Optional[PageType] = None
    purpose: Optional[DiscoveryPurpose] = None
    quality: DocumentQuality = DocumentQuality.SUSPECT
    error: Optional[str] = None
    fetch_strategy: str = "STATIC"
    source_query: Optional[str] = None
    search_rank: Optional[int] = None
    attempts: tuple[CrawlAttempt, ...] = Field(default_factory=tuple)

    @field_validator("attempts", mode="before")
    @classmethod
    def coerce_attempts(cls, v: Any) -> tuple[CrawlAttempt, ...]:
        if isinstance(v, (list, set)):
            return tuple(v)
        if isinstance(v, tuple):
            return v
        return tuple(v) if v else ()

class RawResearchPackage(BaseModel):
    """
    Immutable container of verified identity and crawled documents.
    Serves as the raw, un-tampered input to evidence extraction and claim generation.
    Deeply immutable: cannot modify package, documents, attempts, or identity structures.
    """
    model_config = ConfigDict(frozen=True)

    identity: CompanyIdentity
    documents: tuple[CrawledDocument, ...] = Field(default_factory=tuple)
    discovered_at: datetime

    @field_validator("documents", mode="before")
    @classmethod
    def coerce_documents(cls, v: Any) -> tuple[CrawledDocument, ...]:
        if isinstance(v, (list, set)):
            return tuple(v)
        if isinstance(v, tuple):
            return v
        return tuple(v) if v else ()

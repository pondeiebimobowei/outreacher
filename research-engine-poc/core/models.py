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
    CONFIDENT = "CONFIDENT"
    AMBIGUOUS = "AMBIGUOUS"
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

class IdentityEvidence(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: EvidenceType
    source: str
    url: str
    signal: str
    rank: Optional[int] = None
    query: Optional[str] = None
    title: Optional[str] = None

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
    Optional caller-supplied context for entity disambiguation.

    Used when a bare company name resolves to multiple PRIMARY candidates
    (genuine entity collision). The resolver scores each candidate's search
    snippet against the provided terms and selects the one that aligns best.

    Context must come from the caller's domain knowledge (user profile, job
    opportunity metadata, etc.) — NOT from an LLM inferring the user's intent.

    Fields are free-text, not an enum. The resolver tokenises and scores them.

    Example:
        IdentityContext(
            industry="software",
            description="product development software",
            company_type="software_product",
        )
    """
    model_config = ConfigDict(frozen=True)

    industry: Optional[str] = None      # "software", "fintech", "venture capital"
    description: Optional[str] = None   # "product development software"
    company_type: Optional[str] = None  # "software_product", "vc_firm", "bank"

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

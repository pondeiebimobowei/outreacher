from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum

class SearchResult(BaseModel):
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
    type: EvidenceType
    source: str
    url: str
    signal: str
    rank: Optional[int] = None
    query: Optional[str] = None
    title: Optional[str] = None

class IdentityCandidate(BaseModel):
    domain: str
    is_verified: bool = False
    # Relationship between this domain and the target company
    relationship: Optional[SiteRelationship] = None
    relationship_reasoning: str = ""
    # kept for backward-compat; mirrors relationship_reasoning
    verification_msg: str = ""
    evidence: List[IdentityEvidence] = Field(default_factory=list)

class CompanyIdentity(BaseModel):
    name: str
    domain: str
    website_url: str
    confidence: IdentityConfidence
    reasoning: str
    # candidates[] is the single authoritative evidence container.
    # Each candidate carries its own search + verification evidence.
    # Do not add a separate top-level evidence list — it would drift.
    candidates: List[IdentityCandidate] = Field(default_factory=list)

class PageType(str, Enum):
    CAREERS_INDEX = "CAREERS_INDEX"
    JOB_LISTING = "JOB_LISTING"
    ABOUT = "ABOUT"
    PRODUCT = "PRODUCT"
    CASE_STUDY = "CASE_STUDY"
    BLOG = "BLOG"
    CONTACT = "CONTACT"
    OTHER = "OTHER"

class DocumentQuality(str, Enum):
    VALID = "VALID"
    TOO_SHORT = "TOO_SHORT"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"
    BLOCKED = "BLOCKED"
    SUSPECT = "SUSPECT"
    FETCH_FAILED = "FETCH_FAILED"
    HTTP_ERROR = "HTTP_ERROR"

class CrawlAttempt(BaseModel):
    strategy: str
    quality: DocumentQuality
    error: Optional[str] = None

class CrawledDocument(BaseModel):
    url: str
    final_url: str
    status_code: Optional[int] = None
    title: Optional[str] = None
    content: Optional[str] = None
    content_type: Optional[str] = None
    retrieved_at: datetime
    word_count: int = 0
    page_type: PageType
    quality: DocumentQuality = DocumentQuality.SUSPECT
    error: Optional[str] = None
    fetch_strategy: str = "STATIC"
    attempts: List[CrawlAttempt] = Field(default_factory=list)

class RawResearchPackage(BaseModel):
    identity: CompanyIdentity
    documents: List[CrawledDocument]
    discovered_at: datetime

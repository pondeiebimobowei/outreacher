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

class EvidenceType(str, Enum):
    SEARCH_RESULT = "SEARCH_RESULT"
    PAGE_IDENTITY = "PAGE_IDENTITY"

class IdentityEvidence(BaseModel):
    type: EvidenceType
    source: str
    url: str
    signal: str
    rank: Optional[int] = None

class IdentityCandidate(BaseModel):
    domain: str
    evidence: List[IdentityEvidence] = Field(default_factory=list)

class CompanyIdentity(BaseModel):
    name: str
    domain: str
    website_url: str
    confidence: IdentityConfidence
    reasoning: str
    candidates: List[IdentityCandidate] = Field(default_factory=list)
    evidence: List[IdentityEvidence] = Field(default_factory=list)

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

from pydantic import BaseModel
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

class CompanyIdentity(BaseModel):
    name: str
    domain: str
    website_url: str
    confidence: IdentityConfidence
    reasoning: str

class PageType(str, Enum):
    CAREERS_INDEX = "CAREERS_INDEX"
    JOB_LISTING = "JOB_LISTING"
    ABOUT = "ABOUT"
    PRODUCT = "PRODUCT"
    CASE_STUDY = "CASE_STUDY"
    BLOG = "BLOG"
    CONTACT = "CONTACT"
    OTHER = "OTHER"

class CrawledDocument(BaseModel):
    url: str
    final_url: str
    status_code: Optional[int]
    title: Optional[str]
    content: Optional[str]
    content_type: Optional[str]
    retrieved_at: datetime
    word_count: int = 0
    page_type: PageType
    error: Optional[str]

class RawResearchPackage(BaseModel):
    identity: CompanyIdentity
    documents: List[CrawledDocument]
    discovered_at: datetime

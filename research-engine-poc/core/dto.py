from typing import List, Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field, field_validator

class SourceTier(str, Enum):
    TIER_1 = "TIER_1"
    TIER_2 = "TIER_2"
    TIER_3 = "TIER_3"

class ResearchStatus(str, Enum):
    COMPLETED = "COMPLETED"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"

class OpportunityType(str, Enum):
    CONFIRMED = "CONFIRMED"
    PROACTIVE = "PROACTIVE"
    UNCLASSIFIED = "UNCLASSIFIED"

class ResearchFindingDTO(BaseModel):
    title: str
    detail: str
    why_it_matters: Optional[str] = None
    source_url: Optional[str] = None
    claim_id: Optional[str] = None
    evidence_refs: tuple[str, ...] = Field(default_factory=tuple)

    @field_validator("evidence_refs", mode="before")
    @classmethod
    def coerce_refs(cls, v: Any) -> tuple[str, ...]:
        if isinstance(v, (list, set)):
            return tuple(v)
        if isinstance(v, tuple):
            return v
        return tuple(v) if v else ()

    def to_nest_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "title": self.title,
            "detail": self.detail,
        }
        if self.why_it_matters is not None:
            d["whyItMatters"] = self.why_it_matters
        if self.source_url is not None:
            d["sourceUrl"] = self.source_url
        if self.claim_id is not None:
            d["claimId"] = self.claim_id
        if self.evidence_refs:
            d["evidenceRefs"] = list(self.evidence_refs)
        return d

class ResearchSourceDTO(BaseModel):
    name: str
    url: str
    tier: SourceTier = SourceTier.TIER_1

    def to_nest_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "url": self.url,
            "tier": self.tier.value,
        }

class ResearchOpportunityDTO(BaseModel):
    role_title: str
    opening_source_url: Optional[str] = None
    role_url: Optional[str] = None
    role_location: Optional[str] = None
    role_description: Optional[str] = None
    opportunity_type: OpportunityType

    def to_nest_dict(self) -> Dict[str, Any]:
        return {
            "roleTitle": self.role_title,
            "openingSourceUrl": self.opening_source_url,
            "roleUrl": self.role_url,
            "roleLocation": self.role_location,
            "roleDescription": self.role_description,
            "opportunityType": self.opportunity_type.value,
        }

class ResearchEvidenceDTO(BaseModel):
    claim: str
    classification: str
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    source_excerpt: Optional[str] = None
    confidence: Optional[str] = None
    claim_id: Optional[str] = None
    evidence_ref: Optional[str] = None

    def to_nest_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "claim": self.claim,
            "classification": self.classification,
            "sourceName": self.source_name,
            "sourceUrl": self.source_url,
            "sourceExcerpt": self.source_excerpt,
            "confidence": self.confidence,
        }
        if self.claim_id is not None:
            d["claimId"] = self.claim_id
        if self.evidence_ref is not None:
            d["evidenceRef"] = self.evidence_ref
        return d

class CompanyResearchDTO(BaseModel):
    summary: str
    findings: List[ResearchFindingDTO] = Field(default_factory=list)
    sources: List[ResearchSourceDTO] = Field(default_factory=list)
    opportunities: List[ResearchOpportunityDTO] = Field(default_factory=list)
    evidence: List[ResearchEvidenceDTO] = Field(default_factory=list)
    unknowns: List[str] = Field(default_factory=list)
    status: ResearchStatus = ResearchStatus.COMPLETED

    def to_nest_dict(self) -> Dict[str, Any]:
        return {
            "summary": self.summary,
            "findings": [f.to_nest_dict() for f in self.findings],
            "sources": [s.to_nest_dict() for s in self.sources],
            "opportunities": [o.to_nest_dict() for o in self.opportunities],
            "evidence": [e.to_nest_dict() for e in self.evidence],
            "unknowns": list(self.unknowns),
            "status": self.status.value,
        }

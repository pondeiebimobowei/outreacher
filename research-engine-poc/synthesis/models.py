from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from core.evidence import ClaimCategory, ClaimClassification

class LLMClaimCandidate(BaseModel):
    """
    A single proposition candidate extracted by an LLM from numbered evidence spans.
    Subject to strict deterministic validation before entering ClaimGraph.
    """
    subject: str
    predicate: str
    object_value: str
    category: ClaimCategory
    classification: ClaimClassification
    evidence_span_ids: List[str] = Field(default_factory=list)
    confidence: float = 0.85
    reasoning: Optional[str] = None

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        if not (0.0 <= v <= 1.0):
            raise ValueError(f"Confidence must be between 0.0 and 1.0, got {v}")
        return v

class LLMResearchExtraction(BaseModel):
    """
    Structured JSON output contract expected from the LLM synthesis model.
    """
    summary: str
    claims: List[LLMClaimCandidate] = Field(default_factory=list)
    unknowns: List[str] = Field(default_factory=list)

import hashlib
from typing import Optional, Dict, Set, Any
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from core.models import PageType, CrawledDocument

class ResearchEvidenceType(str, Enum):
    """
    Research evidence types representing locatable source material.
    Distinct from identity resolution evidence.
    """
    PAGE_TEXT = "PAGE_TEXT"
    HEADING = "HEADING"
    COMPANY_OVERVIEW = "COMPANY_OVERVIEW"
    MISSION_STATEMENT = "MISSION_STATEMENT"
    PRODUCT_DESCRIPTION = "PRODUCT_DESCRIPTION"
    CUSTOMER_REFERENCE = "CUSTOMER_REFERENCE"
    JOB_RESPONSIBILITY = "JOB_RESPONSIBILITY"
    JOB_REQUIREMENT = "JOB_REQUIREMENT"
    TECH_SIGNAL = "TECH_SIGNAL"
    CONTACT_INFO = "CONTACT_INFO"
    OTHER = "OTHER"

class ClaimCategory(str, Enum):
    OVERVIEW = "OVERVIEW"
    PRODUCT = "PRODUCT"
    HIRING = "HIRING"
    TECH_STACK = "TECH_STACK"
    CUSTOMER = "CUSTOMER"
    TRACTION = "TRACTION"
    MISSION = "MISSION"
    CONTACT = "CONTACT"

class ClaimClassification(str, Enum):
    FACT = "FACT"
    INFERENCE = "INFERENCE"
    UNKNOWN = "UNKNOWN"

def compute_document_hash(content: str) -> str:
    """Computes exact SHA-256 hex digest of raw UTF-8 content bytes without normalization."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()

def compute_span_id(document_hash: str, char_start: int, char_end: int) -> str:
    """Computes a deterministic, reproducible EvidenceSpan ID."""
    raw_key = f"{document_hash}:{char_start}:{char_end}"
    digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:16]
    return f"span_{digest}"

class EvidenceSpan(BaseModel):
    """
    Atomic, reproducible, and addressable source evidence span.
    Strictly immutable once instantiated.
    """
    model_config = ConfigDict(frozen=True)

    id: str
    document_hash: str
    source_url: str
    page_type: PageType
    section: str = "General"
    char_start: int
    char_end: int
    text: str
    evidence_type: ResearchEvidenceType = ResearchEvidenceType.PAGE_TEXT
    retrieved_at: datetime

    @field_validator("char_end")
    @classmethod
    def validate_range(cls, v: int, info) -> int:
        start = info.data.get("char_start")
        if start is not None and v <= start:
            raise ValueError(f"char_end ({v}) must be strictly greater than char_start ({start}).")
        return v

class Claim(BaseModel):
    """
    An interpreted fact, inference, or unknown state.
    Must be backed by at least one EvidenceSpan reference if FACT or INFERENCE.
    UNKNOWN claims must have zero evidence references and 0.0 confidence.
    """
    model_config = ConfigDict(frozen=True)

    id: str
    subject: str
    predicate: str
    object_value: str
    category: ClaimCategory
    classification: ClaimClassification
    evidence_refs: tuple[str, ...] = Field(default_factory=tuple)
    confidence: float = 1.0
    reasoning: Optional[str] = None

    @field_validator("evidence_refs", mode="before")
    @classmethod
    def coerce_evidence_refs(cls, v: Any) -> tuple[str, ...]:
        if isinstance(v, (list, set)):
            return tuple(v)
        if isinstance(v, tuple):
            return v
        return tuple(v) if v else ()

    @field_validator("confidence")
    @classmethod
    def validate_confidence_range(cls, v: float) -> float:
        if not (0.0 <= v <= 1.0):
            raise ValueError(f"Claim confidence must be between 0.0 and 1.0, got {v}")
        return v

    @model_validator(mode="after")
    def validate_classification_invariants(self) -> "Claim":
        if self.classification == ClaimClassification.UNKNOWN:
            if self.evidence_refs:
                raise ValueError("UNKNOWN claims must have 0 evidence_refs.")
            if self.confidence != 0.0:
                raise ValueError(f"UNKNOWN claims must have confidence 0.0, got {self.confidence}")
        elif self.classification in (ClaimClassification.FACT, ClaimClassification.INFERENCE):
            if not self.evidence_refs:
                raise ValueError(f"Claims with classification '{self.classification.value}' require at least one evidence_ref.")
            if self.confidence <= 0.0:
                raise ValueError(f"Claims with classification '{self.classification.value}' must have confidence > 0.0, got {self.confidence}")
        return self

class ClaimGraphValidationError(Exception):
    """Raised when cross-object invariants fail within a ClaimGraph."""
    pass

class ClaimGraph(BaseModel):
    """
    Enclosing container that binds documents, evidence spans, and claims.
    Enforces relational invariants, document content matching, and citation integrity.
    Strictly deeply immutable and self-validating upon instantiation.
    """
    model_config = ConfigDict(frozen=True)

    documents: tuple[CrawledDocument, ...] = Field(default_factory=tuple)
    evidence_spans: tuple[EvidenceSpan, ...] = Field(default_factory=tuple)
    claims: tuple[Claim, ...] = Field(default_factory=tuple)

    @field_validator("documents", "evidence_spans", "claims", mode="before")
    @classmethod
    def coerce_to_tuple(cls, v: Any) -> tuple:
        if isinstance(v, (list, set)):
            return tuple(v)
        if isinstance(v, tuple):
            return v
        return tuple(v) if v else ()

    @model_validator(mode="after")
    def validate_graph_auto(self) -> "ClaimGraph":
        self.validate_graph()
        return self

    def validate_graph(self) -> None:
        """
        Validates all relational and content integrity invariants:
          1. Document content hashes match SHA-256 of exact content bytes.
          2. Span character ranges are bounded within the parent document.
          3. Span text exactly matches doc.content[char_start:char_end].
          4. Span IDs are deterministic and match compute_span_id.
          5. Span IDs are unique across the graph.
          6. Claim IDs are unique across the graph.
          7. Every evidence_ref in every claim resolves to a verified EvidenceSpan in this graph.
        """
        doc_by_hash: Dict[str, CrawledDocument] = {}
        for doc in self.documents:
            if doc.content is None:
                continue
            doc_hash = compute_document_hash(doc.content)
            doc_by_hash[doc_hash] = doc

        # 1-5: Validate EvidenceSpans
        seen_span_ids: Set[str] = set()
        for span in self.evidence_spans:
            if span.id in seen_span_ids:
                raise ClaimGraphValidationError(f"Duplicate EvidenceSpan ID: '{span.id}'")
            seen_span_ids.add(span.id)

            expected_id = compute_span_id(span.document_hash, span.char_start, span.char_end)
            if span.id != expected_id:
                raise ClaimGraphValidationError(
                    f"EvidenceSpan '{span.id}' has non-deterministic ID; expected '{expected_id}'"
                )

            parent_doc = doc_by_hash.get(span.document_hash)
            if not parent_doc or parent_doc.content is None:
                raise ClaimGraphValidationError(
                    f"EvidenceSpan '{span.id}' references unknown document_hash '{span.document_hash}'"
                )

            doc_len = len(parent_doc.content)
            if span.char_start < 0 or span.char_end > doc_len:
                raise ClaimGraphValidationError(
                    f"EvidenceSpan '{span.id}' range [{span.char_start}:{span.char_end}] exceeds doc content length {doc_len}"
                )

            actual_slice = parent_doc.content[span.char_start:span.char_end]
            if actual_slice != span.text:
                raise ClaimGraphValidationError(
                    f"EvidenceSpan '{span.id}' text mismatch. "
                    f"Expected slice {actual_slice!r}, got span text {span.text!r}"
                )

        # 6-7: Validate Claims
        seen_claim_ids: Set[str] = set()
        for claim in self.claims:
            if claim.id in seen_claim_ids:
                raise ClaimGraphValidationError(f"Duplicate Claim ID: '{claim.id}'")
            seen_claim_ids.add(claim.id)

            for ref in claim.evidence_refs:
                if ref not in seen_span_ids:
                    raise ClaimGraphValidationError(
                        f"Claim '{claim.id}' references non-existent EvidenceSpan '{ref}'"
                    )

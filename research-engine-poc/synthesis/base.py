from typing import Protocol, List, Optional
from core.models import CompanyIdentity
from core.evidence import EvidenceSpan, Claim
from .models import LLMResearchExtraction

class ILLMSynthesizer(Protocol):
    """Protocol for LLM synthesis and claim extraction."""
    def extract_claims(
        self,
        identity: CompanyIdentity,
        spans: List[EvidenceSpan],
    ) -> LLMResearchExtraction:
        """Stage 1: Invokes LLM model with prompt context to extract candidate claims and unknowns."""
        ...

    def synthesize_summary(
        self,
        identity: CompanyIdentity,
        claims: List[Claim],
    ) -> str:
        """Stage 2: Invokes LLM model with verified claims to synthesize a grounded summary."""
        ...

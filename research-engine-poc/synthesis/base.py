from typing import Protocol
from core.models import CompanyIdentity
from core.evidence import EvidenceSpan
from .models import LLMResearchExtraction

class ILLMSynthesizer(Protocol):
    """Protocol for LLM synthesis and claim extraction."""
    def extract_claims(
        self,
        identity: CompanyIdentity,
        spans: list[EvidenceSpan],
    ) -> LLMResearchExtraction:
        """Invokes LLM model with prompt context and returns structured extraction."""
        ...

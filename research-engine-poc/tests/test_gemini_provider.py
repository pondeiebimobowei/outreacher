import os
import json
import pytest
import httpx
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from core.models import (
    CompanyIdentity, IdentityConfidence, CrawledDocument,
    DocumentQuality, PageType, RawResearchPackage,
)
from core.evidence import (
    ClaimGraph, ClaimCategory, ClaimClassification, Claim,
)
from core.evidence_extraction import DeterministicEvidenceExtractor
from synthesis.providers.gemini import GeminiLLMSynthesizer, GeminiAPIError
from synthesis.bridge import LLMClaimGraphBridge

def test_gemini_synthesizer_init_validates_key():
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(ValueError, match="Gemini API key must be provided"):
            GeminiLLMSynthesizer(api_key=None)

    synth = GeminiLLMSynthesizer(api_key="test_key")
    assert synth.api_key == "test_key"
    assert synth.model == "gemini-3.5-flash-lite"

def test_gemini_synthesizer_extract_and_synthesize_mocked():
    synth = GeminiLLMSynthesizer(api_key="test_key")

    mock_extraction_json = json.dumps({
        "claims": [
            {
                "subject": "Linear",
                "predicate": "provides_product",
                "object_value": "Issue tracking tool",
                "category": "PRODUCT",
                "classification": "FACT",
                "evidence_span_ids": ["span_1"],
                "supporting_quotes": ["Linear is an issue tracker."],
                "confidence": 0.9,
            }
        ],
        "unknowns": ["Office location"],
    })

    identity = CompanyIdentity(
        name="Linear",
        domain="linear.app",
        website_url="https://linear.app",
        confidence=IdentityConfidence.CONFIDENT,
        reasoning="Verified primary domain.",
    )

    with patch.object(synth, "_call_gemini", return_value=mock_extraction_json) as mock_call:
        extraction = synth.extract_claims(identity, [])
        assert len(extraction.claims) == 1
        assert extraction.claims[0].subject == "Linear"
        assert extraction.claims[0].supporting_quotes == ["Linear is an issue tracker."]
        assert extraction.unknowns == ["Office location"]

    with patch.object(synth, "_call_gemini", return_value="Linear builds software tools."):
        claims = [
            Claim(
                id="claim_1",
                subject="Linear",
                predicate="provides_product",
                object_value="Issue tracking tool",
                category=ClaimCategory.PRODUCT,
                classification=ClaimClassification.FACT,
                evidence_refs=("span_1",),
                supporting_quotes=("Linear is an issue tracker.",),
                confidence=0.9,
            )
        ]
        summary = synth.synthesize_summary(identity, claims)
        assert summary == "Linear builds software tools."

def test_gemini_synthesizer_call_populates_metadata():
    synth = GeminiLLMSynthesizer(api_key="test_key")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "candidates": [
            {"content": {"parts": [{"text": '{"claims": [], "unknowns": []}'}]}}
        ],
        "usageMetadata": {
            "promptTokenCount": 120,
            "candidatesTokenCount": 35,
            "totalTokenCount": 155,
        }
    }

    with patch("httpx.Client.post", return_value=mock_resp):
        res = synth._call_gemini(
            prompt="test",
            system_instruction="sys",
            stage="EXTRACTION",
        )
        assert res == '{"claims": [], "unknowns": []}'
        assert synth.last_metadata is not None
        assert synth.last_metadata.provider == "google"
        assert synth.last_metadata.prompt_tokens == 120
        assert synth.last_metadata.candidate_tokens == 35
        assert synth.last_metadata.total_tokens == 155

@pytest.mark.skipif(
    not os.environ.get("GEMINI_API_KEY"),
    reason="Requires live GEMINI_API_KEY to execute integration test against Gemini API."
)
def test_gemini_synthesizer_live_integration():
    api_key = os.environ.get("GEMINI_API_KEY")
    synth = GeminiLLMSynthesizer(api_key=api_key)

    identity = CompanyIdentity(
        name="Linear",
        domain="linear.app",
        website_url="https://linear.app",
        confidence=IdentityConfidence.CONFIDENT,
        reasoning="Verified primary domain.",
    )
    doc = CrawledDocument(
        url="https://linear.app/about",
        final_url="https://linear.app/about",
        page_type=PageType.ABOUT,
        title="About Linear",
        content="About Linear\nLinear is the purpose-built tool for planning and building software.\nBuilt for modern software teams.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )
    package = RawResearchPackage(
        identity=identity,
        documents=[doc],
        discovered_at=datetime.now(timezone.utc),
    )

    graph, dto, diagnostics = LLMClaimGraphBridge.process(package, synth)

    assert isinstance(graph, ClaimGraph)
    assert len(dto.findings) >= 1
    assert dto.summary is not None and len(dto.summary) > 0
    assert dto.status.value in ("COMPLETED", "PARTIAL")

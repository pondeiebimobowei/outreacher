import os
import json
import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from core.models import (
    CompanyIdentity, IdentityConfidence, CrawledDocument,
    DocumentQuality, PageType, RawResearchPackage,
)
from core.evidence import (
    ClaimGraph, ClaimCategory, ClaimClassification, Claim,
)
from synthesis.providers.mistral import MistralLLMSynthesizer, MistralAPIError
from synthesis.bridge import LLMClaimGraphBridge

def test_mistral_synthesizer_init_validates_key():
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(ValueError, match="Mistral API key must be provided"):
            MistralLLMSynthesizer(api_key=None)

    synth = MistralLLMSynthesizer(api_key="test_key")
    assert synth.api_key == "test_key"
    assert synth.model == "mistral-small-latest"

def test_mistral_synthesizer_extract_and_synthesize_mocked():
    synth = MistralLLMSynthesizer(api_key="test_key")

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

    with patch.object(synth, "_call_mistral", return_value=mock_extraction_json):
        extraction = synth.extract_claims(identity, [])
        assert len(extraction.claims) == 1
        assert extraction.claims[0].subject == "Linear"
        assert extraction.claims[0].supporting_quotes == ["Linear is an issue tracker."]
        assert extraction.unknowns == ["Office location"]

    with patch.object(synth, "_call_mistral", return_value="Linear builds software tools."):
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

@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_LLM_TESTS") != "1" or not os.environ.get("MISTRAL_API_KEY"),
    reason="Requires RUN_LIVE_LLM_TESTS=1 and MISTRAL_API_KEY to execute integration test against live Mistral API."
)
def test_mistral_synthesizer_live_integration():
    api_key = os.environ.get("MISTRAL_API_KEY")
    synth = MistralLLMSynthesizer(api_key=api_key)

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

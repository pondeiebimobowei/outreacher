import pytest
from datetime import datetime, timezone
from core.models import (
    CompanyIdentity, IdentityConfidence, CrawledDocument,
    DocumentQuality, PageType, RawResearchPackage,
)
from core.evidence import (
    ClaimGraph, ClaimCategory, ClaimClassification,
)
from synthesis.prompt import LLMPromptBuilder
from synthesis.models import LLMResearchExtraction, LLMClaimCandidate
from synthesis.bridge import LLMClaimGraphBridge
from synthesis.base import ILLMSynthesizer

def create_test_package() -> RawResearchPackage:
    identity = CompanyIdentity(
        name="Linear",
        domain="linear.app",
        website_url="https://linear.app",
        confidence=IdentityConfidence.CONFIDENT,
        reasoning="Verified primary domain.",
    )
    doc_about = CrawledDocument(
        url="https://linear.app/about",
        final_url="https://linear.app/about",
        page_type=PageType.ABOUT,
        title="About Linear",
        content="About Linear\nLinear is the purpose-built tool for planning and building software.\nBuilt for modern software teams.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )
    doc_careers = CrawledDocument(
        url="https://linear.app/careers/product-engineer",
        final_url="https://linear.app/careers/product-engineer",
        page_type=PageType.JOB_LISTING,
        title="Product Engineer",
        content="Product Engineer\nResponsibilities:\nBuild delightful UI interactions with React and TypeScript.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )
    return RawResearchPackage(
        identity=identity,
        documents=[doc_about, doc_careers],
        discovered_at=datetime.now(timezone.utc),
    )

def test_prompt_builder_format_and_security_fence():
    package = create_test_package()
    from core.evidence_extraction import DeterministicEvidenceExtractor
    spans = DeterministicEvidenceExtractor.extract_package_spans(package)

    prompt = LLMPromptBuilder.build_prompt(package.identity, spans)

    assert "<COMPANY_CONTEXT>" in prompt
    assert "Name: Linear" in prompt
    assert "Domain: linear.app" in prompt
    assert "<EVIDENCE_SPANS" in prompt
    assert "[SPAN_1]" in prompt
    assert spans[0].id in prompt
    assert "CRITICAL INVARIANTS" in LLMPromptBuilder.SYSTEM_INSTRUCTIONS
    assert "UNTRUSTED DATA BOUNDARY" in LLMPromptBuilder.SYSTEM_INSTRUCTIONS

class _MockSynthesizer(ILLMSynthesizer):
    def __init__(self, claims=None, hallucinate=False):
        self.claims = claims or []
        self.hallucinate = hallucinate

    def extract_claims(self, identity, spans):
        if self.hallucinate:
            return LLMResearchExtraction(
                summary="Linear operates massive quantum data centers across the globe.",
                claims=[
                    LLMClaimCandidate(
                        subject="Linear",
                        predicate="unverified_assertion",
                        object_value="Operates quantum computing centers",
                        category=ClaimCategory.PRODUCT,
                        classification=ClaimClassification.FACT,
                        evidence_span_ids=["span_hallucinated_12345678"],
                        confidence=0.9,
                    )
                ],
                unknowns=["Executive team structure"],
            )

        span_overview = [s for s in spans if "purpose-built" in s.text][0]
        span_hiring = [s for s in spans if "React and TypeScript" in s.text][0]

        return LLMResearchExtraction(
            summary="Linear is a purpose-built system for software teams.",
            claims=[
                LLMClaimCandidate(
                    subject="Linear",
                    predicate="provides_product",
                    object_value="Purpose-built tool for planning and building software",
                    category=ClaimCategory.PRODUCT,
                    classification=ClaimClassification.FACT,
                    evidence_span_ids=[span_overview.id],
                    confidence=0.9,
                ),
                LLMClaimCandidate(
                    subject="Linear",
                    predicate="uses_tech_stack",
                    object_value="React and TypeScript",
                    category=ClaimCategory.TECH_STACK,
                    classification=ClaimClassification.FACT,
                    evidence_span_ids=[span_hiring.id],
                    confidence=0.85,
                ),
                LLMClaimCandidate(
                    subject="Linear",
                    predicate="office_locations",
                    object_value="Specific physical office addresses",
                    category=ClaimCategory.CONTACT,
                    classification=ClaimClassification.UNKNOWN,
                    evidence_span_ids=[],
                    confidence=0.0,
                ),
            ],
            unknowns=["Specific physical office locations"],
        )

def test_llm_claim_graph_bridge_valid_flow():
    package = create_test_package()
    synthesizer = _MockSynthesizer()

    graph, dto, diagnostics = LLMClaimGraphBridge.process(package, synthesizer)

    assert len(diagnostics) == 0
    assert isinstance(graph, ClaimGraph)
    assert len(graph.claims) == 3
    assert len(dto.findings) == 2  # 2 FACT findings (UNKNOWN excluded from findings)
    assert len(dto.evidence) == 3
    assert dto.opportunities[0].opportunity_type.value == "CONFIRMED"
    assert dto.opportunities[0].role_title == "Product Engineer"
    assert dto.summary == "Linear is a purpose-built system for software teams."

    # Lineage is preserved
    assert dto.findings[0].claim_id is not None
    assert len(dto.findings[0].evidence_refs) == 1
    assert dto.evidence[0].evidence_ref.startswith("span_")

def test_llm_claim_graph_bridge_rejects_hallucinated_citations_and_guards_summary():
    package = create_test_package()
    synthesizer = _MockSynthesizer(hallucinate=True)

    graph, dto, diagnostics = LLMClaimGraphBridge.process(package, synthesizer)

    # 1. Candidate was explicitly rejected, NOT converted to UNKNOWN
    assert len(diagnostics) == 1
    assert diagnostics[0].candidate_index == 1
    assert "Missing or hallucinated" in diagnostics[0].reason
    assert diagnostics[0].invalid_evidence_refs == ("span_hallucinated_12345678",)

    # 2. Graph claims is empty
    assert len(graph.claims) == 0
    assert len(dto.findings) == 0

    # 3. Grounded summary prevents ungrounded hallucinated summary escape hatch
    assert "no valid evidence-grounded claims could be verified" in dto.summary
    assert "quantum data centers" not in dto.summary
    assert dto.status.value == "PARTIAL"

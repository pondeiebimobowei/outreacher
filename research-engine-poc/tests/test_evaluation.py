from datetime import datetime, timezone
import pytest
from core.models import CrawledDocument, DocumentQuality, IdentityConfidence, PageType
from core.dto import OpportunityType, ResearchStatus
from core.claim_builder import ClaimGraphBuilder
from evaluate_pipeline import EVALUATION_DATASET, audit_semantic_claims, EvaluationBenchmarkCase
from core.evidence import (
    ClaimGraph, Claim, EvidenceSpan, ClaimCategory, ClaimClassification,
    compute_document_hash, compute_span_id,
)

def test_evaluation_dataset_categories_and_ground_truth():
    """Verifies that all 14 benchmark cases execute deterministically and meet ground truth contracts."""
    assert len(EVALUATION_DATASET) == 14

    category_counts = {}
    for case in EVALUATION_DATASET:
        category_counts[case.category] = category_counts.get(case.category, 0) + 1
        
        # Test baseline deterministic graph builder and DTO export
        graph = ClaimGraphBuilder.build_from_package(case.package)
        dto = ClaimGraphBuilder.export_to_dto(graph, case.package)

        assert dto.status in (ResearchStatus.COMPLETED, ResearchStatus.PARTIAL)
        assert len(dto.findings) >= 1
        assert len(dto.sources) >= 1
        assert len(dto.opportunities) >= 1

        # Match opportunity verdict to ground truth expectation
        actual_opp = dto.opportunities[0]
        assert actual_opp.opportunity_type == case.expected_opportunity_type

        if case.expected_role_title:
            assert actual_opp.role_title == case.expected_role_title

    # Category breakdown assertions
    assert category_counts["REAL_WORLD"] == 3
    assert category_counts["NEGATIVE_GATING"] == 4
    assert category_counts["CONTRACT_FIXTURE"] == 2
    assert category_counts["IDENTITY_SAFETY"] == 1
    assert category_counts["SEMANTIC_STRESS"] == 4

def test_negative_gating_never_produces_false_confirmed():
    """Explicitly verifies that negative cases reject CONFIRMED openings and demote to PROACTIVE."""
    neg_cases = [c for c in EVALUATION_DATASET if c.category == "NEGATIVE_GATING"]
    assert len(neg_cases) == 4

    for case in neg_cases:
        graph = ClaimGraphBuilder.build_from_package(case.package)
        dto = ClaimGraphBuilder.export_to_dto(graph, case.package)

        if case.case_id in ("neg_closed_filled_posting", "neg_culture_article_incidental_word", "neg_job_description_with_hiring_freeze"):
            assert dto.opportunities[0].opportunity_type == OpportunityType.PROACTIVE
        elif case.case_id == "neg_canonical_url_deduplication":
            # Must deduplicate to exactly 1 confirmed opening
            assert len(dto.opportunities) == 1
            assert dto.opportunities[0].opportunity_type == OpportunityType.CONFIRMED

def test_audit_semantic_claims_logic():
    """Unit test for post-bridge audit_semantic_claims logic."""
    content = "Cloud DB product for Developers. Software Engineer role."
    doc = CrawledDocument(
        url="https://testco.com",
        final_url="https://testco.com",
        status_code=200,
        content=content,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    doc_hash = compute_document_hash(content)
    span = EvidenceSpan(
        id=compute_span_id(doc_hash, 0, len(content)),
        document_hash=doc_hash,
        source_url=doc.url,
        page_type=doc.page_type,
        section="Overview",
        char_start=0,
        char_end=len(content),
        text=content,
        retrieved_at=datetime.now(timezone.utc),
    )

    case = EvaluationBenchmarkCase(
        category="SEMANTIC_STRESS",
        case_id="test_case",
        company="TestCo",
        description="Test",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Notes",
        expected_accepted_predicates=["provides_product", "target_users"],
        expected_omitted_predicates=["hiring_role"],
        prohibited_predicates=["hiring_role"],
        package=EVALUATION_DATASET[0].package,
    )

    # 1. Clean passing graph
    graph_pass = ClaimGraph(
        documents=[doc],
        evidence_spans=[span],
        claims=[
            Claim(
                id="claim_1",
                subject="TestCo",
                predicate="provides_product",
                object_value="Cloud DB",
                category=ClaimCategory.PRODUCT,
                classification=ClaimClassification.FACT,
                confidence=1.0,
                evidence_refs=[span.id],
                supporting_quotes=["Cloud DB"],
            ),
            Claim(
                id="claim_2",
                subject="TestCo",
                predicate="target_users",
                object_value="Developers",
                category=ClaimCategory.PRODUCT,
                classification=ClaimClassification.FACT,
                confidence=1.0,
                evidence_refs=[span.id],
                supporting_quotes=["Developers"],
            ),
        ]
    )
    res_pass = audit_semantic_claims(graph_pass, case)
    assert res_pass["has_rules"] is True
    assert res_pass["passed"] is True
    assert len(res_pass["missing_expected"]) == 0
    assert len(res_pass["prohibited_found"]) == 0

    # 2. Graph missing expected predicate
    graph_missing = ClaimGraph(
        documents=[doc],
        evidence_spans=[span],
        claims=[
            Claim(
                id="claim_1",
                subject="TestCo",
                predicate="provides_product",
                object_value="Cloud DB",
                category=ClaimCategory.PRODUCT,
                classification=ClaimClassification.FACT,
                confidence=1.0,
                evidence_refs=[span.id],
                supporting_quotes=["Cloud DB"],
            ),
        ]
    )
    res_missing = audit_semantic_claims(graph_missing, case)
    assert res_missing["passed"] is False
    assert "target_users" in res_missing["missing_expected"]

    # 3. Graph containing prohibited predicate
    graph_prohibited = ClaimGraph(
        documents=[doc],
        evidence_spans=[span],
        claims=[
            Claim(
                id="claim_1",
                subject="TestCo",
                predicate="provides_product",
                object_value="Cloud DB",
                category=ClaimCategory.PRODUCT,
                classification=ClaimClassification.FACT,
                confidence=1.0,
                evidence_refs=[span.id],
                supporting_quotes=["Cloud DB"],
            ),
            Claim(
                id="claim_2",
                subject="TestCo",
                predicate="target_users",
                object_value="Developers",
                category=ClaimCategory.PRODUCT,
                classification=ClaimClassification.FACT,
                confidence=1.0,
                evidence_refs=[span.id],
                supporting_quotes=["Developers"],
            ),
            Claim(
                id="claim_3",
                subject="TestCo",
                predicate="hiring_role",
                object_value="Software Engineer",
                category=ClaimCategory.HIRING,
                classification=ClaimClassification.FACT,
                confidence=1.0,
                evidence_refs=[span.id],
                supporting_quotes=["Software Engineer"],
            ),
        ]
    )
    res_prohibited = audit_semantic_claims(graph_prohibited, case)
    assert res_prohibited["passed"] is False
    assert "hiring_role" in res_prohibited["prohibited_found"]

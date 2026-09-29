import pytest
from datetime import datetime, timezone
from core.models import (
    CompanyIdentity, IdentityConfidence, CrawledDocument,
    DocumentQuality, PageType, RawResearchPackage,
)
from core.evidence import (
    ClaimGraph, ClaimCategory, ClaimClassification, ResearchEvidenceType,
    compute_document_hash,
)
from core.claim_builder import ClaimGraphBuilder
from core.dto import CompanyResearchDTO, OpportunityType, ResearchStatus

def create_sample_package(has_job: bool = True, job_quality: DocumentQuality = DocumentQuality.VALID) -> RawResearchPackage:
    identity = CompanyIdentity(
        name="Acme Corp",
        domain="acme.com",
        website_url="https://acme.com",
        confidence=IdentityConfidence.CONFIDENT,
        reasoning="Verified primary domain.",
    )

    doc_about = CrawledDocument(
        url="https://acme.com/about",
        final_url="https://acme.com/about",
        page_type=PageType.ABOUT,
        title="About Acme Corp",
        content="About Acme Corp\nWe build high-performance data infrastructure for enterprises.\nOur mission is to simplify distributed systems.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )

    doc_contact = CrawledDocument(
        url="https://acme.com/contact",
        final_url="https://acme.com/contact",
        page_type=PageType.CONTACT,
        title="Contact Acme",
        content="Contact us at hello@acme.com or visit our San Francisco office.",
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.VALID,
    )

    docs = [doc_about, doc_contact]

    if has_job:
        doc_job = CrawledDocument(
            url="https://acme.com/careers/backend",
            final_url="https://acme.com/careers/backend",
            page_type=PageType.JOB_LISTING,
            title="Senior Backend Engineer",
            content="Senior Backend Engineer\nRequirements:\n5+ years of experience with Python and PostgreSQL.",
            retrieved_at=datetime.now(timezone.utc),
            quality=job_quality,
        )
        docs.append(doc_job)

    return RawResearchPackage(
        identity=identity,
        documents=docs,
        discovered_at=datetime.now(timezone.utc),
    )

def test_claim_graph_builder_with_jobs():
    package = create_sample_package(has_job=True)
    graph = ClaimGraphBuilder.build_from_package(package)

    assert isinstance(graph, ClaimGraph)
    assert len(graph.evidence_spans) > 0
    assert len(graph.claims) > 0
    assert isinstance(graph.documents, tuple)
    assert isinstance(graph.evidence_spans, tuple)
    assert isinstance(graph.claims, tuple)

    # Invariants must have passed validate_graph() without exception
    graph.validate_graph()

    # Verify overview claim exists and has valid evidence reference and calibrated confidence
    overview_claims = [c for c in graph.claims if c.category == ClaimCategory.OVERVIEW]
    assert len(overview_claims) == 1
    assert overview_claims[0].classification == ClaimClassification.FACT
    assert len(overview_claims[0].evidence_refs) == 1
    assert overview_claims[0].confidence == 0.85

    # Verify hiring claim exists for job requirement
    hiring_claims = [c for c in graph.claims if c.category == ClaimCategory.HIRING]
    assert len(hiring_claims) >= 1
    assert all(c.classification == ClaimClassification.FACT for c in hiring_claims)
    assert all(c.confidence == 0.85 for c in hiring_claims)

def test_claim_graph_builder_without_jobs_emits_unknown():
    package = create_sample_package(has_job=False)
    graph = ClaimGraphBuilder.build_from_package(package)

    assert isinstance(graph, ClaimGraph)
    graph.validate_graph()

    # Should have an UNKNOWN claim for hiring with 0 evidence refs and 0.0 confidence
    unknown_hiring = [c for c in graph.claims if c.category == ClaimCategory.HIRING and c.classification == ClaimClassification.UNKNOWN]
    assert len(unknown_hiring) == 1
    assert len(unknown_hiring[0].evidence_refs) == 0
    assert unknown_hiring[0].confidence == 0.0

def test_export_to_dto_and_nest_dict_with_lineage():
    package = create_sample_package(has_job=True)
    graph = ClaimGraphBuilder.build_from_package(package)
    dto = ClaimGraphBuilder.export_to_dto(graph, package)

    assert isinstance(dto, CompanyResearchDTO)
    assert dto.status == ResearchStatus.COMPLETED
    assert len(dto.findings) > 0
    assert len(dto.sources) == 3
    assert len(dto.opportunities) == 1
    assert dto.opportunities[0].opportunity_type == OpportunityType.CONFIRMED
    assert dto.opportunities[0].role_title == "Senior Backend Engineer"

    # Lineage verification: DTO findings and evidence preserve span and claim IDs
    assert dto.findings[0].claim_id is not None
    assert len(dto.findings[0].evidence_refs) > 0
    assert dto.evidence[0].claim_id is not None
    assert dto.evidence[0].evidence_ref is not None
    assert dto.evidence[0].evidence_ref.startswith("span_")

    # Test NestJS serialization format
    nest_dict = dto.to_nest_dict()
    assert "summary" in nest_dict
    assert "findings" in nest_dict
    assert "sources" in nest_dict
    assert "opportunities" in nest_dict
    assert "evidence" in nest_dict
    assert "unknowns" in nest_dict
    assert nest_dict["status"] == "COMPLETED"

    opp = nest_dict["opportunities"][0]
    assert opp["opportunityType"] == "CONFIRMED"
    assert opp["roleTitle"] == "Senior Backend Engineer"
    assert opp["openingSourceUrl"] == "https://acme.com/careers/backend"

    ev = nest_dict["evidence"][0]
    assert "claimId" in ev
    assert "evidenceRef" in ev
    assert ev["evidenceRef"].startswith("span_")

def test_export_to_dto_proactive_opportunity():
    package = create_sample_package(has_job=False)
    graph = ClaimGraphBuilder.build_from_package(package)
    dto = ClaimGraphBuilder.export_to_dto(graph, package)

    assert dto.status == ResearchStatus.COMPLETED
    assert len(dto.opportunities) == 1
    assert dto.opportunities[0].opportunity_type == OpportunityType.PROACTIVE
    assert len(dto.unknowns) >= 1

    nest_dict = dto.to_nest_dict()
    assert nest_dict["opportunities"][0]["opportunityType"] == "PROACTIVE"

def test_export_to_dto_unclassified_when_no_valid_docs():
    identity = CompanyIdentity(
        name="Empty Corp",
        domain="empty.com",
        website_url="https://empty.com",
        confidence=IdentityConfidence.UNRESOLVED,
        reasoning="Failed to crawl.",
    )
    doc_failed = CrawledDocument(
        url="https://empty.com",
        final_url="https://empty.com",
        page_type=PageType.HOMEPAGE,
        retrieved_at=datetime.now(timezone.utc),
        quality=DocumentQuality.FETCH_FAILED,
        content=None,
    )
    package = RawResearchPackage(
        identity=identity,
        documents=[doc_failed],
        discovered_at=datetime.now(timezone.utc),
    )
    graph = ClaimGraphBuilder.build_from_package(package)
    dto = ClaimGraphBuilder.export_to_dto(graph, package)

    assert dto.opportunities[0].opportunity_type == OpportunityType.UNCLASSIFIED

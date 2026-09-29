import pytest
from core.models import DocumentQuality, IdentityConfidence, PageType
from core.dto import OpportunityType, ResearchStatus
from core.claim_builder import ClaimGraphBuilder
from evaluate_pipeline import ARCHETYPE_PACKAGES

def test_archetype_packages_deterministic_processing():
    """Verifies that all 5 archetype packages process cleanly through ClaimGraphBuilder."""
    assert len(ARCHETYPE_PACKAGES) == 5

    for case in ARCHETYPE_PACKAGES:
        pkg = case["package"]
        graph = ClaimGraphBuilder.build_from_package(pkg)
        dto = ClaimGraphBuilder.export_to_dto(graph, pkg)

        assert dto.status in (ResearchStatus.COMPLETED, ResearchStatus.PARTIAL)
        assert len(dto.findings) >= 1
        assert len(dto.sources) >= 1
        assert len(dto.opportunities) >= 1

    # Verify Archetype 1 (Moniepoint) has CONFIRMED opportunity (has valid job listing with requirements)
    moniepoint_dto = ClaimGraphBuilder.export_to_dto(
        ClaimGraphBuilder.build_from_package(ARCHETYPE_PACKAGES[0]["package"]),
        ARCHETYPE_PACKAGES[0]["package"],
    )
    assert moniepoint_dto.opportunities[0].opportunity_type == OpportunityType.CONFIRMED
    assert moniepoint_dto.opportunities[0].role_title == "Lead Infrastructure Engineer"

    # Verify Archetype 3 (Vercel ATS) has CONFIRMED opportunity (Ashby job listing with requirements)
    vercel_dto = ClaimGraphBuilder.export_to_dto(
        ClaimGraphBuilder.build_from_package(ARCHETYPE_PACKAGES[2]["package"]),
        ARCHETYPE_PACKAGES[2]["package"],
    )
    assert vercel_dto.opportunities[0].opportunity_type == OpportunityType.CONFIRMED
    assert vercel_dto.opportunities[0].role_title == "Senior Solutions Architect"

    # Verify Archetype 4 (Acme AI Labs - No Careers) falls back safely to PROACTIVE
    acme_dto = ClaimGraphBuilder.export_to_dto(
        ClaimGraphBuilder.build_from_package(ARCHETYPE_PACKAGES[3]["package"]),
        ARCHETYPE_PACKAGES[3]["package"],
    )
    assert acme_dto.opportunities[0].opportunity_type == OpportunityType.PROACTIVE
    assert acme_dto.opportunities[0].role_title == "General Outreach"

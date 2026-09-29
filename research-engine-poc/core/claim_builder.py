import hashlib
from typing import List, Optional, Set
from core.models import RawResearchPackage, PageType, CrawledDocument
from core.evidence import (
    EvidenceSpan, Claim, ClaimGraph, ClaimCategory, ClaimClassification,
    ResearchEvidenceType,
)
from core.evidence_extraction import DeterministicEvidenceExtractor
from core.dto import (
    CompanyResearchDTO, ResearchFindingDTO, ResearchSourceDTO,
    ResearchOpportunityDTO, ResearchEvidenceDTO, SourceTier,
    OpportunityType, ResearchStatus,
)

class ClaimGraphBuilder:
    """
    Builds and validates a deterministic ClaimGraph from a RawResearchPackage.
    Guarantees that:
      - All EvidenceSpans have exact character offsets into package documents.
      - All FACT/INFERENCE claims reference valid, verified EvidenceSpan IDs.
      - Graph invariants are validated before return.
    """

    @classmethod
    def build_from_package(cls, package: RawResearchPackage) -> ClaimGraph:
        """Extracts deterministic evidence spans and builds grounded claims."""
        # 1. Extract deterministic EvidenceSpans
        spans = DeterministicEvidenceExtractor.extract_package_spans(package)
        
        # 2. Derive deterministic Claims
        claims: List[Claim] = []
        company_name = package.identity.name or "Company"

        seen_claim_keys: Set[str] = set()

        def add_claim(
            subject: str,
            predicate: str,
            object_value: str,
            category: ClaimCategory,
            classification: ClaimClassification,
            evidence_refs: List[str],
            confidence: float = 1.0,
            reasoning: Optional[str] = None,
        ) -> None:
            raw_key = f"{subject}:{predicate}:{object_value}:{category.value}:{classification.value}"
            if raw_key in seen_claim_keys:
                return
            seen_claim_keys.add(raw_key)
            claim_id = f"claim_{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:16]}"
            claims.append(Claim(
                id=claim_id,
                subject=subject,
                predicate=predicate,
                object_value=object_value,
                category=category,
                classification=classification,
                evidence_refs=evidence_refs,
                confidence=confidence,
                reasoning=reasoning,
            ))

        # Group spans by type
        overview_spans = [s for s in spans if s.evidence_type == ResearchEvidenceType.COMPANY_OVERVIEW]
        product_spans = [s for s in spans if s.evidence_type == ResearchEvidenceType.PRODUCT_DESCRIPTION]
        mission_spans = [s for s in spans if s.evidence_type == ResearchEvidenceType.MISSION_STATEMENT]
        job_req_spans = [s for s in spans if s.evidence_type in (ResearchEvidenceType.JOB_REQUIREMENT, ResearchEvidenceType.JOB_RESPONSIBILITY)]
        contact_spans = [s for s in spans if s.evidence_type == ResearchEvidenceType.CONTACT_INFO]

        # Overview Claims
        if overview_spans:
            primary_overview = overview_spans[0]
            add_claim(
                subject=company_name,
                predicate="operates_as",
                object_value=primary_overview.text.strip(),
                category=ClaimCategory.OVERVIEW,
                classification=ClaimClassification.FACT,
                evidence_refs=[primary_overview.id],
                confidence=1.0,
            )

        # Product Claims
        for p_span in product_spans[:3]:
            add_claim(
                subject=company_name,
                predicate="provides_product",
                object_value=p_span.text.strip(),
                category=ClaimCategory.PRODUCT,
                classification=ClaimClassification.FACT,
                evidence_refs=[p_span.id],
                confidence=1.0,
            )

        # Mission Claims
        for m_span in mission_spans[:2]:
            add_claim(
                subject=company_name,
                predicate="states_mission",
                object_value=m_span.text.strip(),
                category=ClaimCategory.MISSION,
                classification=ClaimClassification.FACT,
                evidence_refs=[m_span.id],
                confidence=1.0,
            )

        # Hiring Claims
        hiring_docs = [d for d in package.documents if d.page_type in (PageType.CAREERS_INDEX, PageType.JOB_LISTING)]
        if hiring_docs and job_req_spans:
            for j_span in job_req_spans[:5]:
                add_claim(
                    subject=company_name,
                    predicate="requires_skill",
                    object_value=j_span.text.strip(),
                    category=ClaimCategory.HIRING,
                    classification=ClaimClassification.FACT,
                    evidence_refs=[j_span.id],
                    confidence=1.0,
                )
        elif not hiring_docs:
            add_claim(
                subject=company_name,
                predicate="hiring_status",
                object_value="No active hiring or careers page confirmed in verified scope",
                category=ClaimCategory.HIRING,
                classification=ClaimClassification.UNKNOWN,
                evidence_refs=[],
                confidence=0.0,
                reasoning="Careers page could not be located during scoped discovery",
            )

        # Contact Claims
        if contact_spans:
            c_span = contact_spans[0]
            add_claim(
                subject=company_name,
                predicate="contact_point",
                object_value=c_span.text.strip(),
                category=ClaimCategory.CONTACT,
                classification=ClaimClassification.FACT,
                evidence_refs=[c_span.id],
                confidence=1.0,
            )

        # Build and validate ClaimGraph
        graph = ClaimGraph(
            documents=package.documents,
            evidence_spans=spans,
            claims=claims,
        )
        graph.validate_graph()
        return graph

    @classmethod
    def export_to_dto(cls, graph: ClaimGraph, package: RawResearchPackage) -> CompanyResearchDTO:
        """Transforms a verified ClaimGraph into a CompanyResearchDTO matching the NestJS schema."""
        span_by_id = {s.id: s for s in graph.evidence_spans}
        company_name = package.identity.name or "Company"

        # 1. Sources
        sources: List[ResearchSourceDTO] = []
        seen_urls: Set[str] = set()
        for doc in package.documents:
            if doc.url in seen_urls:
                continue
            seen_urls.add(doc.url)
            name = doc.title or f"{company_name} {doc.page_type.value}"
            tier = SourceTier.TIER_1 if doc.page_type != PageType.OTHER else SourceTier.TIER_2
            sources.append(ResearchSourceDTO(
                name=name,
                url=doc.url,
                tier=tier,
            ))

        # 2. Findings
        findings: List[ResearchFindingDTO] = []
        for claim in graph.claims:
            if claim.classification == ClaimClassification.UNKNOWN:
                continue
            first_span = span_by_id.get(claim.evidence_refs[0]) if claim.evidence_refs else None
            source_url = first_span.source_url if first_span else None
            findings.append(ResearchFindingDTO(
                title=f"{claim.category.value.title()}: {claim.predicate.replace('_', ' ').title()}",
                detail=claim.object_value,
                why_it_matters=f"Directly verified from {claim.category.value.lower()} sources.",
                source_url=source_url,
            ))

        # 3. Evidence
        evidence_items: List[ResearchEvidenceDTO] = []
        for claim in graph.claims:
            first_span = span_by_id.get(claim.evidence_refs[0]) if claim.evidence_refs else None
            source_name = f"{company_name} ({first_span.page_type.value})" if first_span else None
            source_url = first_span.source_url if first_span else None
            source_excerpt = first_span.text if first_span else None
            evidence_items.append(ResearchEvidenceDTO(
                claim=f"{claim.subject} {claim.predicate.replace('_', ' ')}: {claim.object_value}",
                classification=claim.classification.value,
                source_name=source_name,
                source_url=source_url,
                source_excerpt=source_excerpt,
                confidence="HIGH" if claim.confidence >= 0.8 else "MEDIUM",
            ))

        # 4. Opportunities
        opportunities: List[ResearchOpportunityDTO] = []
        job_docs = [d for d in package.documents if d.page_type == PageType.JOB_LISTING]
        if job_docs:
            for jd in job_docs:
                role_title = jd.title or "Software Engineer"
                opportunities.append(ResearchOpportunityDTO(
                    role_title=role_title,
                    opening_source_url=jd.url,
                    role_url=jd.url,
                    role_description=jd.content[:200] if jd.content else None,
                    opportunity_type=OpportunityType.CONFIRMED,
                ))
        else:
            opportunities.append(ResearchOpportunityDTO(
                role_title="General Outreach",
                opening_source_url=package.identity.website_url,
                role_url=package.identity.website_url,
                role_description="Proactive outreach based on verified company overview and signals.",
                opportunity_type=OpportunityType.PROACTIVE,
            ))

        # 5. Unknowns
        unknowns = [c.object_value for c in graph.claims if c.classification == ClaimClassification.UNKNOWN]

        # 6. Summary
        overview_claims = [c.object_value for c in graph.claims if c.category == ClaimCategory.OVERVIEW and c.classification == ClaimClassification.FACT]
        if overview_claims:
            summary = f"{company_name}: {overview_claims[0]}"
        else:
            summary = f"Research profile for {company_name} based on {len(package.documents)} verified documents."

        status = ResearchStatus.COMPLETED if package.documents else ResearchStatus.FAILED

        return CompanyResearchDTO(
            summary=summary,
            findings=findings,
            sources=sources,
            opportunities=opportunities,
            evidence=evidence_items,
            unknowns=unknowns,
            status=status,
        )

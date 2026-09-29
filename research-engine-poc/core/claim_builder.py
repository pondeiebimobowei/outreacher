import hashlib
from typing import List, Optional, Set
from core.models import RawResearchPackage, PageType, CrawledDocument, DocumentQuality
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
from core.urls import normalize_research_package
from core.opportunities import extract_research_opportunities

class ClaimGraphBuilder:
    """
    Baseline builder for grounded ClaimGraphs from a RawResearchPackage.
    Acts as a deterministic pipeline scaffold and baseline for testing:
      - Extracts line-level EvidenceSpans with exact document character offsets.
      - Assembles grounded claims referencing verified EvidenceSpan IDs.
      - Self-validates graph integrity via ClaimGraph constructor.
      - Exports to lineage-preserving CompanyResearchDTO for NestJS consumption.
    """

    @classmethod
    def build_from_package(cls, package: RawResearchPackage) -> ClaimGraph:
        """Extracts deterministic evidence spans and builds grounded claims."""
        # 1. Canonicalize and deduplicate documents at package boundary
        package = normalize_research_package(package)

        # 2. Extract deterministic EvidenceSpans
        spans = DeterministicEvidenceExtractor.extract_package_spans(package)
        
        # 2. Derive grounded Claims
        claims: List[Claim] = []
        company_name = package.identity.name or "Company"

        seen_claim_keys: Set[str] = set()

        def add_claim(
            subject: str,
            predicate: str,
            object_value: str,
            category: ClaimCategory,
            classification: ClaimClassification,
            evidence_refs: tuple[str, ...],
            confidence: float,
            reasoning: Optional[str] = None,
            supporting_quotes: tuple[str, ...] = (),
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
                supporting_quotes=supporting_quotes,
                confidence=confidence,
                reasoning=reasoning,
            ))

        # Group spans by type
        overview_spans = [s for s in spans if s.evidence_type == ResearchEvidenceType.COMPANY_OVERVIEW]
        product_spans = [s for s in spans if s.evidence_type == ResearchEvidenceType.PRODUCT_DESCRIPTION]
        mission_spans = [s for s in spans if s.evidence_type == ResearchEvidenceType.MISSION_STATEMENT]
        job_req_spans = [s for s in spans if s.evidence_type in (ResearchEvidenceType.JOB_REQUIREMENT, ResearchEvidenceType.JOB_RESPONSIBILITY)]
        contact_spans = [s for s in spans if s.evidence_type == ResearchEvidenceType.CONTACT_INFO]

        # Overview Claims (Calibrated confidence: 0.85 for direct source grounding)
        if overview_spans:
            primary_overview = overview_spans[0]
            add_claim(
                subject=company_name,
                predicate="operates_as",
                object_value=primary_overview.text.strip(),
                category=ClaimCategory.OVERVIEW,
                classification=ClaimClassification.FACT,
                evidence_refs=(primary_overview.id,),
                supporting_quotes=(primary_overview.text.strip(),),
                confidence=0.85,
            )
        elif spans:
            candidate_spans = [s for s in spans if s.evidence_type != ResearchEvidenceType.HEADING]
            if candidate_spans:
                first_span = candidate_spans[0]
                add_claim(
                    subject=company_name,
                    predicate="operates_as",
                    object_value=first_span.text.strip(),
                    category=ClaimCategory.OVERVIEW,
                    classification=ClaimClassification.FACT,
                    evidence_refs=(first_span.id,),
                    supporting_quotes=(first_span.text.strip(),),
                    confidence=0.85,
                )

        # Product Claims
        for p_span in product_spans[:3]:
            add_claim(
                subject=company_name,
                predicate="provides_product",
                object_value=p_span.text.strip(),
                category=ClaimCategory.PRODUCT,
                classification=ClaimClassification.FACT,
                evidence_refs=(p_span.id,),
                supporting_quotes=(p_span.text.strip(),),
                confidence=0.85,
            )

        # Mission Claims
        for m_span in mission_spans[:2]:
            add_claim(
                subject=company_name,
                predicate="states_mission",
                object_value=m_span.text.strip(),
                category=ClaimCategory.MISSION,
                classification=ClaimClassification.FACT,
                evidence_refs=(m_span.id,),
                supporting_quotes=(m_span.text.strip(),),
                confidence=0.85,
            )

        # Hiring Claims
        valid_job_docs = [
            d for d in package.documents
            if d.page_type in (PageType.CAREERS_INDEX, PageType.JOB_LISTING) and d.quality == DocumentQuality.VALID
        ]
        if valid_job_docs and job_req_spans:
            for j_span in job_req_spans[:5]:
                add_claim(
                    subject=company_name,
                    predicate="requires_skill",
                    object_value=j_span.text.strip(),
                    category=ClaimCategory.HIRING,
                    classification=ClaimClassification.FACT,
                    evidence_refs=(j_span.id,),
                    supporting_quotes=(j_span.text.strip(),),
                    confidence=0.85,
                )
        elif not valid_job_docs:
            # Explicit UNKNOWN claim: 0 evidence refs, confidence 0.0
            add_claim(
                subject=company_name,
                predicate="hiring_status",
                object_value="No active hiring or careers page confirmed in verified scope",
                category=ClaimCategory.HIRING,
                classification=ClaimClassification.UNKNOWN,
                evidence_refs=(),
                supporting_quotes=(),
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
                evidence_refs=(c_span.id,),
                supporting_quotes=(c_span.text.strip(),),
                confidence=0.85,
            )

        # Instantiating ClaimGraph automatically triggers .validate_graph()
        return ClaimGraph(
            documents=package.documents,
            evidence_spans=spans,
            claims=claims,
        )

    @classmethod
    def export_to_dto(cls, graph: ClaimGraph, package: RawResearchPackage) -> CompanyResearchDTO:
        """Transforms a verified ClaimGraph into a CompanyResearchDTO preserving full evidence lineage."""
        package = normalize_research_package(package)
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

        # 2. Findings (with full claim_id and evidence_refs lineage)
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
                claim_id=claim.id,
                evidence_refs=claim.evidence_refs,
            ))

        # 3. Evidence (with full claim_id and evidence_ref lineage)
        evidence_items: List[ResearchEvidenceDTO] = []
        for claim in graph.claims:
            first_span = span_by_id.get(claim.evidence_refs[0]) if claim.evidence_refs else None
            source_name = f"{company_name} ({first_span.page_type.value})" if first_span else None
            source_url = first_span.source_url if first_span else None
            source_excerpt = first_span.text if first_span else None
            evidence_ref = first_span.id if first_span else None
            evidence_items.append(ResearchEvidenceDTO(
                claim=f"{claim.subject} {claim.predicate.replace('_', ' ')}: {claim.object_value}",
                classification=claim.classification.value,
                source_name=source_name,
                source_url=source_url,
                source_excerpt=source_excerpt,
                confidence="HIGH" if claim.confidence >= 0.8 else ("MEDIUM" if claim.confidence > 0.0 else "UNKNOWN"),
                claim_id=claim.id,
                evidence_ref=evidence_ref,
            ))

        # 4. Opportunities (Strict verification gate: active job posting signals required for CONFIRMED)
        opportunities = extract_research_opportunities(package, company_name)

        # 5. Unknowns
        raw_unknowns = [c.object_value for c in graph.claims if c.classification == ClaimClassification.UNKNOWN]
        unknowns = [
            u for u in raw_unknowns
            if isinstance(u, str) and u.strip().lower() not in (
                "unknown", "n/a", "none", "not available", "null", "undefined", "unspecified", "na"
            ) and len(u.strip()) >= 3
        ]

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

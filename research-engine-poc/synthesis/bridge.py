import hashlib
from typing import List, Set, Optional, Dict
from core.models import RawResearchPackage, PageType, DocumentQuality
from core.evidence import (
    EvidenceSpan, Claim, ClaimGraph, ClaimCategory, ClaimClassification,
)
from core.evidence_extraction import DeterministicEvidenceExtractor
from core.dto import (
    CompanyResearchDTO, ResearchFindingDTO, ResearchSourceDTO,
    ResearchOpportunityDTO, ResearchEvidenceDTO, SourceTier,
    OpportunityType, ResearchStatus,
)
from .base import ILLMSynthesizer
from .models import LLMResearchExtraction, LLMClaimCandidate

class LLMClaimGraphBridge:
    """
    Deterministic validation and assembly bridge between LLM claim extraction and ClaimGraph:
      1. Deterministically extracts immutable EvidenceSpans from RawResearchPackage.
      2. Assembles prompt context with Company Context and Numbered EvidenceSpans.
      3. Invokes ILLMSynthesizer to obtain structured LLMResearchExtraction.
      4. Deterministically validates all candidate claims against actual extracted span IDs.
      5. Rejects / sanitizes any hallucinated span citations or invalid confidence values.
      6. Constructs self-validating ClaimGraph.
      7. Emits lineage-preserving CompanyResearchDTO for NestJS consumption.
    """

    @classmethod
    def process(
        cls,
        package: RawResearchPackage,
        synthesizer: ILLMSynthesizer,
    ) -> tuple[ClaimGraph, CompanyResearchDTO]:
        """Runs the deterministic extraction -> LLM synthesis -> deterministic validation lifecycle."""
        # 1. Deterministic Span Extraction
        spans = DeterministicEvidenceExtractor.extract_package_spans(package)
        valid_span_ids: Set[str] = {s.id for s in spans}

        # 2. Invoke LLM Synthesizer
        extraction: LLMResearchExtraction = synthesizer.extract_claims(package.identity, spans)

        # 3. Deterministic Validation & Invariant Enforcement
        verified_claims: List[Claim] = []
        seen_claim_ids: Set[str] = set()

        for cand in extraction.claims:
            # Filter evidence references to only span IDs that genuinely exist
            valid_refs = tuple(ref for ref in cand.evidence_span_ids if ref in valid_span_ids)

            classification = cand.classification
            confidence = cand.confidence

            # Enforce invariant: UNKNOWN must have 0 refs and 0.0 confidence
            if classification == ClaimClassification.UNKNOWN:
                valid_refs = ()
                confidence = 0.0
            elif classification in (ClaimClassification.FACT, ClaimClassification.INFERENCE):
                # If all citations were hallucinated, demote to UNKNOWN
                if not valid_refs:
                    classification = ClaimClassification.UNKNOWN
                    confidence = 0.0
                else:
                    if confidence <= 0.0:
                        confidence = 0.5

            raw_key = f"{cand.subject}:{cand.predicate}:{cand.object_value}:{cand.category.value}:{classification.value}"
            claim_id = f"claim_{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:16]}"

            if claim_id in seen_claim_ids:
                continue
            seen_claim_ids.add(claim_id)

            verified_claims.append(Claim(
                id=claim_id,
                subject=cand.subject,
                predicate=cand.predicate,
                object_value=cand.object_value,
                category=cand.category,
                classification=classification,
                evidence_refs=valid_refs,
                confidence=confidence,
                reasoning=cand.reasoning,
            ))

        # 4. Construct self-validating ClaimGraph
        graph = ClaimGraph(
            documents=package.documents,
            evidence_spans=spans,
            claims=verified_claims,
        )

        # 5. Export to NestJS DTO
        dto = cls._export_to_dto(graph, package, extraction.summary, extraction.unknowns)
        return graph, dto

    @classmethod
    def _export_to_dto(
        cls,
        graph: ClaimGraph,
        package: RawResearchPackage,
        summary: Optional[str],
        additional_unknowns: List[str],
    ) -> CompanyResearchDTO:
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
                why_it_matters=f"Grounded in verified {claim.category.value.lower()} evidence.",
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

        # 4. Opportunities (Strict verification: only CONFIRMED when valid doc with non-empty title exists)
        opportunities: List[ResearchOpportunityDTO] = []
        valid_job_docs = [
            d for d in package.documents
            if d.page_type == PageType.JOB_LISTING and d.quality == DocumentQuality.VALID and d.title and d.title.strip()
        ]
        if valid_job_docs:
            for jd in valid_job_docs:
                opportunities.append(ResearchOpportunityDTO(
                    role_title=jd.title.strip(),
                    opening_source_url=jd.url,
                    role_url=jd.url,
                    role_description=jd.content[:200] if jd.content else None,
                    opportunity_type=OpportunityType.CONFIRMED,
                ))
        elif package.documents and any(d.quality == DocumentQuality.VALID for d in package.documents):
            opportunities.append(ResearchOpportunityDTO(
                role_title="General Outreach",
                opening_source_url=package.identity.website_url,
                role_url=package.identity.website_url,
                role_description="Proactive outreach based on verified company overview and signals.",
                opportunity_type=OpportunityType.PROACTIVE,
            ))
        else:
            opportunities.append(ResearchOpportunityDTO(
                role_title="Unclassified Target",
                opening_source_url=package.identity.website_url,
                role_url=package.identity.website_url,
                role_description="Insufficient evidence collected to classify opportunity.",
                opportunity_type=OpportunityType.UNCLASSIFIED,
            ))

        # 5. Unknowns
        graph_unknowns = [c.object_value for c in graph.claims if c.classification == ClaimClassification.UNKNOWN]
        all_unknowns = list(dict.fromkeys(graph_unknowns + additional_unknowns))

        # 6. Summary
        final_summary = summary or f"Research profile for {company_name} based on {len(package.documents)} verified documents."
        status = ResearchStatus.COMPLETED if package.documents else ResearchStatus.FAILED

        return CompanyResearchDTO(
            summary=final_summary,
            findings=findings,
            sources=sources,
            opportunities=opportunities,
            evidence=evidence_items,
            unknowns=all_unknowns,
            status=status,
        )

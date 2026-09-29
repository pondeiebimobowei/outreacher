import hashlib
from typing import List, Set, Optional, Dict, Tuple
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
from .models import LLMResearchExtraction, LLMClaimCandidate, ClaimRejectionDiagnostic

class LLMClaimGraphBridge:
    """
    Deterministic validation and assembly bridge between LLM claim extraction and ClaimGraph:
      1. Deterministically extracts immutable EvidenceSpans from RawResearchPackage.
      2. Assembles prompt context with Company Context and Numbered EvidenceSpans.
      3. Invokes ILLMSynthesizer (Stage 1) to obtain candidate claims and unknowns.
      4. Deterministically validates all candidate claims against actual extracted span IDs.
      5. Rejects candidate claims with invalid/missing citations, recording ClaimRejectionDiagnostics.
      6. Invokes Stage 2 grounded summary synthesis taking strictly accepted Claim[] objects.
      7. Sanitizes and deduplicates epistemic unknowns.
      8. Constructs self-validating ClaimGraph and emits lineage-preserving CompanyResearchDTO.
    """

    @staticmethod
    def _sanitize_unknowns(raw_unknowns: List[str]) -> List[str]:
        """Sanitizes and normalizes epistemic unknowns into concise topic strings."""
        cleaned: List[str] = []
        seen: Set[str] = set()
        for item in raw_unknowns:
            if not isinstance(item, str):
                continue
            t = item.strip().strip("-*• \t\r\n\"'")
            if not t or len(t) < 3 or len(t) > 120:
                continue
            
            lowered = t.lower()
            
            # Reject conversational / speculative assertions claiming inability to verify a speculative proposition
            # e.g., "I could not verify that Linear has 50,000 customers"
            if any(lowered.startswith(prefix) for prefix in (
                "i could not verify", "unable to verify", "cannot confirm", "i could not find evidence that",
                "not verified that", "unknown whether", "unverified whether", "could not determine if",
            )):
                continue

            # Strip non-speculative structural labels (e.g., "Unknown: Pricing model")
            if lowered.startswith(("unknown:", "not found:", "missing:", "unspecified:")):
                parts = t.split(":", 1)
                t = parts[-1].strip() if len(parts) > 1 else t
                lowered = t.lower()

            if not t or len(t) < 3:
                continue

            # Reject conversational assertions that contain speculative clauses ("that X does Y", "whether X has Y")
            if any(lowered.startswith(p) for p in ("that ", "whether ", "if ", "about whether ")):
                continue

            key = t.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(t)
        return cleaned

    @classmethod
    def process(
        cls,
        package: RawResearchPackage,
        synthesizer: ILLMSynthesizer,
    ) -> Tuple[ClaimGraph, CompanyResearchDTO, List[ClaimRejectionDiagnostic]]:
        """Runs the deterministic extraction -> LLM synthesis -> deterministic validation lifecycle."""
        # 1. Deterministic Span Extraction
        spans = DeterministicEvidenceExtractor.extract_package_spans(package)
        valid_span_ids: Set[str] = {s.id for s in spans}
        span_by_id: Dict[str, EvidenceSpan] = {s.id: s for s in spans}

        # 2. Stage 1: LLM Candidate Extraction
        extraction: LLMResearchExtraction = synthesizer.extract_claims(package.identity, spans)

        # 3. Deterministic Validation & Invariant Enforcement
        verified_claims: List[Claim] = []
        diagnostics: List[ClaimRejectionDiagnostic] = []
        seen_claim_ids: Set[str] = set()

        for idx, cand in enumerate(extraction.claims, start=1):
            classification = cand.classification
            confidence = cand.confidence

            # UNKNOWN invariant: 0 evidence refs, 0 quotes, 0.0 confidence
            if classification == ClaimClassification.UNKNOWN:
                valid_refs: Tuple[str, ...] = ()
                valid_quotes: Tuple[str, ...] = ()
                confidence = 0.0
            elif classification in (ClaimClassification.FACT, ClaimClassification.INFERENCE):
                # Filter evidence references to only span IDs that genuinely exist in this package
                resolved_refs = tuple(ref for ref in cand.evidence_span_ids if ref in valid_span_ids)
                
                # REJECTION GATE 1: If required evidence is missing or hallucinated, reject candidate
                if not resolved_refs:
                    diagnostics.append(ClaimRejectionDiagnostic(
                        candidate_index=idx,
                        subject=cand.subject,
                        predicate=cand.predicate,
                        reason="Rejected: Missing or hallucinated evidence references.",
                        invalid_evidence_refs=tuple(cand.evidence_span_ids),
                    ))
                    continue

                # REJECTION GATE 2: Supporting Quotes verification against cited EvidenceSpans
                cleaned_quotes = [q.strip() for q in cand.supporting_quotes if isinstance(q, str) and q.strip()]
                
                if classification == ClaimClassification.FACT:
                    if not cleaned_quotes:
                        diagnostics.append(ClaimRejectionDiagnostic(
                            candidate_index=idx,
                            subject=cand.subject,
                            predicate=cand.predicate,
                            reason="Rejected: FACT claim requires verbatim supporting_quotes from cited spans.",
                            invalid_evidence_refs=tuple(cand.evidence_span_ids),
                        ))
                        continue
                    
                    # Verify each quote is a substring of at least one of the resolved spans
                    unverified_quotes = [
                        q for q in cleaned_quotes
                        if not any(q in span_by_id[ref].text for ref in resolved_refs)
                    ]
                    if unverified_quotes:
                        diagnostics.append(ClaimRejectionDiagnostic(
                            candidate_index=idx,
                            subject=cand.subject,
                            predicate=cand.predicate,
                            reason=f"Rejected: Supporting quote not found in cited evidence span(s): '{unverified_quotes[0][:40]}...'",
                            invalid_evidence_refs=tuple(cand.evidence_span_ids),
                        ))
                        continue
                    valid_quotes = tuple(cleaned_quotes)
                else:  # INFERENCE
                    unverified_quotes = [
                        q for q in cleaned_quotes
                        if not any(q in span_by_id[ref].text for ref in resolved_refs)
                    ]
                    if unverified_quotes:
                        diagnostics.append(ClaimRejectionDiagnostic(
                            candidate_index=idx,
                            subject=cand.subject,
                            predicate=cand.predicate,
                            reason=f"Rejected: Supporting quote not found in cited evidence span(s): '{unverified_quotes[0][:40]}...'",
                            invalid_evidence_refs=tuple(cand.evidence_span_ids),
                        ))
                        continue
                    valid_quotes = tuple(cleaned_quotes)

                valid_refs = resolved_refs
                if confidence <= 0.0:
                    confidence = 0.85 if classification == ClaimClassification.FACT else 0.65
            else:
                diagnostics.append(ClaimRejectionDiagnostic(
                    candidate_index=idx,
                    subject=cand.subject,
                    predicate=cand.predicate,
                    reason=f"Rejected: Unrecognized classification '{classification}'",
                    invalid_evidence_refs=tuple(cand.evidence_span_ids),
                ))
                continue

            # Deterministic Claim ID derived from proposition, sorted citations, and sorted quotes
            refs_key = ":".join(sorted(valid_refs))
            quotes_key = ":".join(sorted(valid_quotes))
            raw_key = f"{cand.subject}:{cand.predicate}:{cand.object_value.strip().lower()}:{cand.category.value}:{classification.value}:{refs_key}:{quotes_key}"
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
                supporting_quotes=valid_quotes,
                confidence=confidence,
                reasoning=cand.reasoning,
            ))

        # 4. Construct self-validating ClaimGraph
        graph = ClaimGraph(
            documents=package.documents,
            evidence_spans=spans,
            claims=verified_claims,
        )

        # 5. Stage 2: Grounded Summary Synthesis (strictly taking accepted claims)
        accepted_facts = [c for c in graph.claims if c.classification in (ClaimClassification.FACT, ClaimClassification.INFERENCE)]
        stage2_summary: Optional[str] = None
        if accepted_facts and hasattr(synthesizer, "synthesize_summary") and callable(getattr(synthesizer, "synthesize_summary")):
            try:
                stage2_summary = synthesizer.synthesize_summary(package.identity, accepted_facts)
            except Exception:
                stage2_summary = None

        # 6. Export to NestJS DTO
        dto = cls._export_to_dto(graph, package, stage2_summary, extraction.unknowns)
        return graph, dto, diagnostics

    @classmethod
    def _export_to_dto(
        cls,
        graph: ClaimGraph,
        package: RawResearchPackage,
        stage2_summary: Optional[str],
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
            source_excerpt = claim.supporting_quotes[0] if claim.supporting_quotes else (first_span.text if first_span else None)
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

        # 5. Sanitized Unknowns
        graph_unknowns = [c.object_value for c in graph.claims if c.classification == ClaimClassification.UNKNOWN]
        all_unknowns = cls._sanitize_unknowns(graph_unknowns + additional_unknowns)

        # 6. Constrained Summary (Grounding Invariant: Summary cannot fabricate ungrounded claims)
        accepted_facts = [c for c in graph.claims if c.classification in (ClaimClassification.FACT, ClaimClassification.INFERENCE)]
        if not accepted_facts:
            final_summary = f"Research completed for {company_name} with {len(package.documents)} crawled documents, but no valid evidence-grounded claims could be verified."
        elif stage2_summary and stage2_summary.strip():
            final_summary = stage2_summary.strip()
        else:
            overview_facts = [c.object_value for c in accepted_facts if c.category == ClaimCategory.OVERVIEW]
            product_facts = [c.object_value for c in accepted_facts if c.category == ClaimCategory.PRODUCT]
            if overview_facts:
                final_summary = f"{company_name}: {overview_facts[0]}"
            elif product_facts:
                final_summary = f"{company_name}: {product_facts[0]}"
            else:
                final_summary = f"Verified research profile for {company_name} with {len(accepted_facts)} grounded claims."

        status = ResearchStatus.COMPLETED if accepted_facts else (ResearchStatus.PARTIAL if package.documents else ResearchStatus.FAILED)

        return CompanyResearchDTO(
            summary=final_summary,
            findings=findings,
            sources=sources,
            opportunities=opportunities,
            evidence=evidence_items,
            unknowns=all_unknowns,
            status=status,
        )


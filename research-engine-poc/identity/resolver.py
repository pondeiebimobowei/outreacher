import re
from urllib.parse import urlparse
from collections import defaultdict
from typing import List

from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from core.models import (
    CompanyIdentity, IdentityConfidence,
    IdentityCandidate, IdentityEvidence, EvidenceType, SiteRelationship,
)
from identity.verifier import WebsiteVerifier

# How many top candidates to run through the verifier.
# This is an explicit policy constant, not a silent assumption.
VERIFY_TOP_N = 3


class IdentityResolver:
    def __init__(self, search_provider: ISearchProvider, verifier: WebsiteVerifier):
        self.search_provider = search_provider
        self.verifier = verifier
        self.provider_name = (
            search_provider.__class__.__name__
            .replace("SearchProvider", "")
            .lower()
        )

    # ── Name-shape risk ─────────────────────────────────────────────────────────
    # Measures the *shape* of the name (short / dominated by generic suffixes).
    # Does NOT calculate true collision probability; hence "name_shape_risk".
    def name_shape_risk(self, company_name: str) -> bool:
        generic_terms = {
            "corp", "corporation", "inc", "company", "llc", "ltd",
            "solutions", "media", "group", "holdings", "services",
            "agency", "technologies", "tech",
        }
        words = set(re.findall(r'\b[a-z]+\b', company_name.lower()))
        distinctive = words - generic_terms
        return len(distinctive) <= 1 and sum(len(w) for w in distinctive) <= 5

    # ── Resolution ──────────────────────────────────────────────────────────────
    def resolve(self, company_name: str) -> CompanyIdentity:
        query = f'"{company_name}" official website'
        raw_results = self.search_provider.search(query, num_results=10)
        results = SearchResultSanitizer.sanitize(raw_results)

        excluded_domains = {
            'linkedin.com', 'crunchbase.com', 'wikipedia.org',
            'twitter.com', 'x.com', 'facebook.com', 'youtube.com',
            'glassdoor.com', 'g2.com', 'capterra.com', 'bloomberg.com',
            'ycombinator.com', 'pitchbook.com', 'zoominfo.com', 'builtin.com',
            'f6s.com', 'b2bhint.com', 'instagram.com', 'github.com',
            'app.apollo.io', 'web.app', 'herokuapp.com', 'vercel.app',
            'github.io', 'maptons.com',
        }

        domain_evidence: dict = defaultdict(list)
        domain_top_result: dict = {}
        domain_ranks: dict = defaultdict(list)

        name_lower = company_name.lower().strip()
        clean_name = re.sub(r'[^a-z0-9]', '', name_lower)

        for idx, r in enumerate(results):
            domain = urlparse(r.url).netloc.replace('www.', '').lower()
            if any(domain == ex or domain.endswith("." + ex) for ex in excluded_domains):
                continue
            if domain not in domain_top_result:
                domain_top_result[domain] = r
            domain_ranks[domain].append(idx + 1)
            domain_evidence[domain].append(IdentityEvidence(
                type=EvidenceType.SEARCH_RESULT,
                source=self.provider_name,
                url=r.url,
                signal="RANKED_RESULT",
                rank=idx + 1,
                query=query,
                title=r.title,
            ))

        if not domain_evidence:
            return CompanyIdentity(
                name=company_name, domain="", website_url="",
                confidence=IdentityConfidence.UNRESOLVED,
                reasoning="No candidates passed the domain exclusion filter.",
                candidates=[],
            )

        # Sort by heuristic generation score (rank + name-match bonus)
        candidate_list = []
        for domain, ev_list in domain_evidence.items():
            best_rank  = min(domain_ranks[domain])
            rank_score = max(0, 11 - best_rank)
            name_score = (5 if clean_name and clean_name in domain else 0) + \
                         (3 if domain.startswith(clean_name + ".") else 0)
            gen_score  = rank_score + name_score + (len(domain_ranks[domain]) - 1)
            candidate_list.append((gen_score, domain, ev_list))

        candidate_list.sort(key=lambda x: x[0], reverse=True)

        # ── Verification pass ────────────────────────────────────────────────────
        # Only SiteRelationship.PRIMARY qualifies as "verified" for identity resolution.
        # LEGACY and RELATED are recorded in candidates[] for research value but do NOT
        # contribute to the CONFIDENT decision — they are not the canonical identity URL.
        recorded_candidates: List[IdentityCandidate] = []
        verified_candidates: List[IdentityCandidate] = []  # PRIMARY only
        is_shape_risk = self.name_shape_risk(company_name)

        for gen_score, domain, ev_list in candidate_list[:VERIFY_TOP_N]:
            first_url        = domain_top_result[domain].url
            scheme           = urlparse(first_url).scheme or "https"
            website_url_cand = f"{scheme}://{domain}"

            rel, msg, ver_ev = self.verifier.classify_relationship(
                company_name, website_url_cand
            )
            is_primary = rel == SiteRelationship.PRIMARY

            cand = IdentityCandidate(
                domain=domain,
                is_verified=is_primary,
                relationship=rel,
                relationship_reasoning=msg,
                verification_msg=msg,
                evidence=list(ev_list) + ver_ev,
            )
            recorded_candidates.append(cand)
            if is_primary:
                verified_candidates.append(cand)

        # Append remaining candidates without running verification
        for gen_score, domain, ev_list in candidate_list[VERIFY_TOP_N:]:
            recorded_candidates.append(
                IdentityCandidate(domain=domain, evidence=list(ev_list))
            )

        # ── Decision policy ──────────────────────────────────────────────────────
        if len(verified_candidates) == 1:
            best = verified_candidates[0]
            if is_shape_risk:
                confidence = IdentityConfidence.AMBIGUOUS
                reasoning  = (
                    f"Single PRIMARY candidate '{best.domain}', but name has high "
                    f"shape-risk (short / generic-suffix dominated). Manual disambiguation "
                    f"required. {best.relationship_reasoning}"
                )
            else:
                confidence = IdentityConfidence.CONFIDENT
                reasoning  = (
                    f"Uniquely verified PRIMARY candidate. {best.relationship_reasoning}"
                )
            chosen = best

        elif len(verified_candidates) > 1:
            names      = ", ".join(c.domain for c in verified_candidates)
            confidence = IdentityConfidence.AMBIGUOUS
            reasoning  = f"Multiple PRIMARY candidates: {names}. Identity is ambiguous."
            chosen     = verified_candidates[0]

        else:
            # No PRIMARY found — report best candidate's relationship for diagnostics.
            top        = recorded_candidates[0]
            rel_str    = top.relationship.value if top.relationship else "UNKNOWN"
            confidence = IdentityConfidence.AMBIGUOUS
            reasoning  = (
                f"No PRIMARY candidates found in top {VERIFY_TOP_N}. "
                f"Best candidate '{top.domain}' classified as {rel_str}. "
                + top.relationship_reasoning
            )
            chosen = top

        first_result = domain_top_result.get(chosen.domain)
        scheme       = (urlparse(first_result.url).scheme if first_result else None) or "https"
        website_url  = f"{scheme}://{chosen.domain}"

        return CompanyIdentity(
            name=company_name,
            domain=chosen.domain,
            website_url=website_url,
            confidence=confidence,
            reasoning=reasoning,
            candidates=recorded_candidates,
        )

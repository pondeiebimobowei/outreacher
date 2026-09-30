import re
from urllib.parse import urlparse
from collections import defaultdict
from typing import List, Optional, Tuple

from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityContext,
    IdentityCandidate, IdentityEvidence, EvidenceType, SiteRelationship,
)
from core.urls import normalize_domain, get_registrable_domain
from identity.verifier import WebsiteVerifier
from identity.lexicon import is_dictionary_word

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

    # ── Context scoring ─────────────────────────────────────────────────────────
    @staticmethod
    def _context_score(text: str, context: IdentityContext) -> int:
        """
        Score how well candidate text matches the caller-supplied context.

        Tokenises context field values and counts unique terms found in text.
        Uses the search result title + snippet (already in memory — no extra fetch).

        Returns an integer ≥ 0. A score of 0 means no context terms were found.
        Discrimination requires best_score > second_best_score; a tie means
        context did not resolve the ambiguity and AMBIGUOUS is still returned.
        """
        terms: set = set()
        for val in (context.industry, context.description, context.company_type):
            if val:
                for tok in val.lower().split():
                    if len(tok) > 3:          # ignore stop-word-length tokens
                        terms.add(tok)
        text_lower = text.lower()
        return sum(1 for t in terms if t in text_lower)

    # ── Name-shape risk ─────────────────────────────────────────────────────────
    GENERIC_TERMS = {
        "corp", "corporation", "inc", "company", "llc", "ltd",
        "solutions", "media", "group", "holdings", "services",
        "agency", "technologies", "tech", "global", "capital",
        "partners", "ventures", "enterprises", "consulting", "financial",
    }

    GENERIC_MODIFIERS = {
        "general", "global", "national", "international", "first",
        "universal", "standard", "central", "united", "american",
        "federal", "mutual", "prime", "direct", "total", "core",
        "premier", "advanced", "integrated", "strategic", "applied",
    }

    GENERIC_CATEGORY_NOUNS = {
        "logistics", "capital", "security", "financial", "partners",
        "ventures", "holdings", "services", "solutions", "management",
        "consulting", "enterprises", "investments", "properties",
        "resources", "industries", "systems",
    }

    @classmethod
    def extract_distinctive_tokens(cls, company_name: str) -> List[str]:
        """Extracts distinctive brand tokens in order, stripping common corporate suffixes."""
        words = re.findall(r'\b[a-z0-9]+\b', company_name.lower())
        return [w for w in words if w not in cls.GENERIC_TERMS]

    @classmethod
    def canonical_brand_slug(cls, company_name: str) -> str:
        """
        Normalizes brand name to canonical slug preserving token order (v1.3.2-6).
        e.g. 'Trade Republic' -> 'traderepublic' (not 'republictrade').
        """
        tokens = cls.extract_distinctive_tokens(company_name)
        if tokens:
            return "".join(tokens)
        return re.sub(r'[^a-z0-9]', '', company_name.lower())

    def has_entity_collision_risk(self, company_name: str) -> bool:
        """
        Evaluates whether the company name has inherent entity collision risk (v1.3.2-2).
        Any bare single-token dictionary word of arbitrary length (e.g. Pillar, Beacon,
        Monolith, Compass, Stream, Signal, Vanguard, Pinnacle, Catalyst, Horizon, Spectrum)
        or any short name (<= 5 chars) carries high collision risk and cannot be CONFIDENT
        on search dominance alone.
        """
        tokens = self.extract_distinctive_tokens(company_name)
        if not tokens:
            return True
        if len(tokens) == 1:
            tok = tokens[0]
            if len(tok) <= 5 or is_dictionary_word(tok):
                return True
        elif sum(len(t) for t in tokens) <= 5:
            return True
        elif all(is_dictionary_word(t) for t in tokens):
            return True
        return False

    def name_shape_risk(self, company_name: str) -> bool:
        """Backward-compatible alias for has_entity_collision_risk."""
        return self.has_entity_collision_risk(company_name)

    def _should_discount_shape_risk(
        self,
        company_name: str,
        best_candidate: IdentityCandidate,
        all_candidates: Optional[List[IdentityCandidate]] = None,
    ) -> Tuple[bool, str]:
        """
        Evaluates whether shape risk on a uniquely verified PRIMARY candidate
        should be discounted due to strong coined-brand distinctiveness,
        exact domain correspondence, and uncontested search distribution (Track 3).

        Returns (can_discount, reason).
        """
        # 0. Candidate provenance: indexed-only evidence cannot discount shape risk
        if best_candidate.is_indexed_only:
            return False, "Candidate established via search-indexed fallback (bot-blocked homepage) carries epistemic cap."

        distinctive = self.extract_distinctive_tokens(company_name)
        if not distinctive:
            return False, "Query contains only generic corporate suffixes without a distinctive brand token."

        # 1. Single-token dictionary words carry unmitigated entity collision risk
        if len(distinctive) == 1:
            tok = distinctive[0]
            if is_dictionary_word(tok):
                return False, f"Single-token dictionary word '{tok}' carries high entity collision risk."

        # 2. Multi-token generic combinations (e.g. 'General Logistics Services', 'First National Security')
        if len(distinctive) >= 2:
            if distinctive[0] in self.GENERIC_MODIFIERS and all(
                t in (self.GENERIC_CATEGORY_NOUNS | self.GENERIC_TERMS | self.GENERIC_MODIFIERS) for t in distinctive[1:]
            ):
                return False, f"Multi-token generic combination ({' '.join(distinctive)}) without distinctive brand token."

        # 3. Domain correspondence
        clean_co = re.sub(r'[^a-z0-9]', '', company_name.lower())
        clean_dist = self.canonical_brand_slug(company_name)
        clean_lbl = best_candidate.domain.split('.')[0].lower()
        clean_tok0 = distinctive[0] if distinctive else ""

        is_exact_domain = (
            (clean_lbl == clean_dist)
            or (clean_lbl == clean_co)
            or best_candidate.domain.startswith(clean_dist + ".")
            or (clean_lbl == clean_tok0)
            or (clean_tok0 and clean_lbl.startswith(clean_tok0))
            or (clean_tok0 and clean_tok0.startswith(clean_lbl))
        )
        if not is_exact_domain:
            return False, f"Domain '{best_candidate.domain}' does not match distinctive brand name."

        # 4. Search Result Collision / Competing Entity Detection
        if all_candidates:
            has_competing, competing_str = self._check_competing_brand_domains(
                company_name, best_candidate, all_candidates
            )
            if has_competing:
                return False, f"Multiple distinct brand domains ({competing_str}) observed in search results."

        return True, "Distinctive brand with exact domain correspondence, uncontested search dominance, and verified corroboration."

    def _check_competing_brand_domains(
        self,
        company_name: str,
        best_candidate: IdentityCandidate,
        all_candidates: List[IdentityCandidate],
    ) -> Tuple[bool, str]:
        """
        Checks if search candidates contain multiple distinct registrable root domains
        claiming the same brand name (e.g. pennylane.ai vs pennylane.fr vs pennylane.org).
        """
        clean_co = re.sub(r'[^a-z0-9]', '', company_name.lower())
        clean_dist = self.canonical_brand_slug(company_name)

        best_reg = get_registrable_domain(best_candidate.domain)
        competing_brand_domains = set()
        for cand in all_candidates:
            c_domain = cand.domain.lower()
            if not c_domain:
                continue
            c_reg = get_registrable_domain(c_domain)
            if c_reg == best_reg:
                continue
            c_root = c_reg.split('.')[0]
            if (clean_dist and clean_dist in c_reg) or c_root == clean_dist or c_root == clean_co:
                competing_brand_domains.add(c_domain)

        if competing_brand_domains:
            competing_str = ", ".join(sorted(competing_brand_domains)[:3])
            return True, competing_str

        return False, ""

    # ── Resolution ──────────────────────────────────────────────────────────────
    def resolve(
        self,
        company_name: str,
        context: Optional[IdentityContext] = None,
    ) -> CompanyIdentity:
        """
        Resolve a company name to a primary identity.

        context: optional caller-supplied IdentityContext.  When provided and
          multiple PRIMARY candidates are found, context is used to select the
          most likely candidate.  Context must come from structured product data,
          NOT from an LLM's guess about the user's intent.
        """
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
            'github.io',
        }

        domain_evidence: dict = defaultdict(list)
        domain_top_result: dict = {}
        domain_ranks: dict = defaultdict(list)

        name_lower = company_name.lower().strip()
        clean_name = re.sub(r'[^a-z0-9]', '', name_lower)

        for idx, r in enumerate(results):
            domain = normalize_domain(r.url)
            if not domain or any(domain == ex or domain.endswith("." + ex) for ex in excluded_domains):
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

            # The search result title (from Google's index) is passed as hint_title.
            # The verifier uses it only when the live crawler returns an empty title,
            # which is common for JS-rendered SPA homepages.
            search_title = domain_top_result[domain].title or ""

            rel, msg, ver_ev = self.verifier.classify_relationship(
                company_name, website_url_cand, hint_title=search_title,
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
            is_indexed_only = best.is_indexed_only
            has_competing, competing_str = self._check_competing_brand_domains(
                company_name, best, recorded_candidates
            )
            if has_competing:
                confidence = IdentityConfidence.AMBIGUOUS
                reasoning = (
                    f"Single PRIMARY candidate '{best.domain}', but conflicting brand domains "
                    f"({competing_str}) observed in search results. Manual disambiguation required. "
                    f"{best.relationship_reasoning}"
                )
            elif is_indexed_only:
                confidence = IdentityConfidence.AMBIGUOUS
                reasoning = (
                    f"Single PRIMARY candidate '{best.domain}' established via search-indexed fallback (bot-blocked homepage). "
                    f"Manual confirmation required. {best.relationship_reasoning}"
                )
            elif is_shape_risk:
                can_discount, discount_reason = self._should_discount_shape_risk(
                    company_name, best, recorded_candidates
                )
                if can_discount:
                    confidence = IdentityConfidence.CONFIDENT
                    reasoning = (
                        f"Uniquely verified PRIMARY candidate with exact domain correspondence "
                        f"and uncontested corroboration discounting shape-risk. {best.relationship_reasoning}"
                    )
                else:
                    confidence = IdentityConfidence.AMBIGUOUS
                    reasoning = (
                        f"Single PRIMARY candidate '{best.domain}', but name has high "
                        f"shape-risk (short / generic-suffix dominated: {discount_reason}). "
                        f"Manual disambiguation required. {best.relationship_reasoning}"
                    )
            else:
                confidence = IdentityConfidence.CONFIDENT
                reasoning  = (
                    f"Uniquely verified PRIMARY candidate. {best.relationship_reasoning}"
                )
            chosen = best

        elif len(verified_candidates) > 1:
            names = ", ".join(c.domain for c in verified_candidates)
            confidence = IdentityConfidence.AMBIGUOUS
            reasoning = (
                f"Multiple PRIMARY candidates: {names}. "
                f"Identity is ambiguous and requires domain-level disambiguation."
            )
            chosen = verified_candidates[0]

        else:
            # No PRIMARY found — report best candidate's relationship for diagnostics.
            top        = recorded_candidates[0]
            rel_str    = top.relationship.value if top.relationship else "UNKNOWN"
            confidence = IdentityConfidence.UNRESOLVED
            reasoning  = (
                f"No PRIMARY candidates found in top {VERIFY_TOP_N}. "
                f"Best candidate '{top.domain}' classified as {rel_str}. "
                + top.relationship_reasoning
            )
            chosen = top

        if confidence == IdentityConfidence.CONFIDENT:
            final_domain = chosen.domain
            first_result = domain_top_result.get(chosen.domain)
            scheme = (urlparse(first_result.url).scheme if first_result else None) or "https"
            final_url = f"{scheme}://{chosen.domain}"
        else:
            final_domain = ""
            final_url = ""

        return CompanyIdentity(
            name=company_name,
            domain=final_domain,
            website_url=final_url,
            confidence=confidence,
            reasoning=reasoning,
            candidates=recorded_candidates,
        )

import re
from urllib.parse import urlparse
from collections import defaultdict
from typing import List, Optional, Tuple

from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityContext,
    IdentityCandidate, IdentityEvidence, EvidenceType, SiteRelationship,
    IdentityDiagnosticTrace,
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

    COMMON_GEOS = {
        "toronto": "canada", "vancouver": "canada", "montreal": "canada", "canada": "canada", "ontario": "canada",
        "berlin": "germany", "munich": "germany", "frankfurt": "germany", "germany": "germany",
        "lagos": "nigeria", "abuja": "nigeria", "nigeria": "nigeria",
        "london": "uk", "manchester": "uk", "uk": "uk", "united kingdom": "uk", "england": "uk",
        "milan": "italy", "rome": "italy", "italy": "italy",
        "paris": "france", "france": "france",
        "tokyo": "japan", "japan": "japan",
        "rotterdam": "netherlands", "amsterdam": "netherlands", "netherlands": "netherlands",
        "boston": "usa", "san francisco": "usa", "new york": "usa", "chicago": "usa", "menlo park": "usa",
        "delaware": "usa", "united states": "usa", "usa": "usa", "california": "usa",
        "stockholm": "sweden", "sweden": "sweden", "sydney": "australia", "australia": "australia",
    }

    @classmethod
    def _extract_structural_discriminators(cls, context: IdentityContext) -> Tuple[List[str], List[str], List[str], List[str]]:
        """
        Extracts structured discriminators:
        1. hq_geos: (headquarters, headquarters_country)
        2. general_geos: (location, country, jurisdiction)
        3. legals: (legal_name, registration_number, company_type)
        4. product_or_registry_ids: (product_id, trusted_registry_id)

        Note: Description and industry fields are informational and do NOT act as entity discriminators.
        """
        hq_geos = [
            x.strip().lower() for x in (context.headquarters, context.headquarters_country)
            if x and x.strip()
        ]
        general_geos = [
            x.strip().lower() for x in (context.location, context.country, context.jurisdiction)
            if x and x.strip()
        ]
        legals = [
            x.strip().lower() for x in (context.legal_name, context.registration_number, context.company_type)
            if x and x.strip()
        ]
        product_or_registry_ids = [
            x.strip().lower() for x in (context.product_id, context.trusted_registry_id)
            if x and x.strip()
        ]
        return hq_geos, general_geos, legals, product_or_registry_ids

    def _evaluate_context_discrimination(
        self,
        candidate: IdentityCandidate,
        context: IdentityContext,
    ) -> Tuple[bool, str, str]:
        """
        Evaluates caller-supplied structured context against first-party crawled evidence.
        - Free-text industry / description overlap is rejected as a discriminator.
        - Specific structural discriminators (HQ, location, legal identity, product/registry ID)
          matched against live crawled first-party evidence succeed.
        - Explicit contradiction between caller context and candidate first-party evidence blocks.
        - Multi-location operations are compatible with location queries.
        """
        hq_geos, general_geos, legals, ids = self._extract_structural_discriminators(context)

        # Check if context contains any structural discriminators at all
        if not hq_geos and not general_geos and not legals and not ids:
            return False, "Caller context contains only general industry/description text without structural discriminators.", "GENERIC_CONTEXT_REJECTED"

        # First-party live crawled evidence (NOT search index snippets)
        first_party_ev = [
            ev for ev in candidate.evidence
            if (ev.source.startswith("homepage") or ev.source.startswith("secondary_"))
            and ev.type != EvidenceType.FALLBACK_INDEXED
        ]
        if not first_party_ev:
            return False, "No live first-party crawled evidence available to corroborate caller context.", "NO_FIRST_PARTY_EVIDENCE"

        fp_text = " ".join(
            f"{ev.title or ''} {ev.snippet or ''}" for ev in first_party_ev
        ).lower()

        # 1. Contradiction check for geographic attributes
        all_geos = hq_geos + general_geos
        if all_geos:
            ctx_regions = set()
            for loc in all_geos:
                for word in re.findall(r'\b[a-z0-9]+\b', loc):
                    if word in self.COMMON_GEOS:
                        ctx_regions.add(self.COMMON_GEOS[word])

            if ctx_regions:
                has_loc_match = any(loc in fp_text for loc in all_geos) or any(
                    any(w in fp_text for w, r in self.COMMON_GEOS.items() if r == reg)
                    for reg in ctx_regions
                )
                if not has_loc_match:
                    found_conflicting_regions = set()
                    for word, region in self.COMMON_GEOS.items():
                        if region not in ctx_regions and re.search(rf'\b{re.escape(word)}\b', fp_text):
                            found_conflicting_regions.add(region)
                    if found_conflicting_regions:
                        return False, f"Explicit geographic contradiction: caller specified {all_geos}, candidate claims {sorted(found_conflicting_regions)}.", "CONTRADICTION_BLOCKED"

        # 2. Check for explicit HQ Contradiction when caller specified headquarters
        if hq_geos:
            hq_match = re.search(r'\b(?:headquartered|based|hq)\s+(?:in|at)\s+([a-z\s,]+)', fp_text)
            if hq_match:
                claimed_hq_text = hq_match.group(1)[:50]
                claimed_regions = {self.COMMON_GEOS[w] for w in re.findall(r'\b[a-z0-9]+\b', claimed_hq_text) if w in self.COMMON_GEOS}
                caller_hq_regions = {self.COMMON_GEOS[w] for loc in hq_geos for w in re.findall(r'\b[a-z0-9]+\b', loc) if w in self.COMMON_GEOS}
                if claimed_regions and caller_hq_regions and not (claimed_regions & caller_hq_regions):
                    return False, f"Explicit headquarters contradiction: caller specified HQ {hq_geos}, candidate states '{claimed_hq_text.strip()}'.", "CONTRADICTION_BLOCKED"

        # 3. Matching check against first-party text
        matches = []
        for hq in hq_geos:
            if hq in fp_text:
                matches.append(f"headquarters '{hq}'")
        for loc in general_geos:
            if loc in fp_text:
                matches.append(f"location '{loc}'")
        for leg in legals:
            if leg in fp_text:
                matches.append(f"legal '{leg}'")
        for id_val in ids:
            if id_val in fp_text:
                matches.append(f"identifier '{id_val}'")

        if matches:
            matched_str = ", ".join(matches[:3])
            return True, f"Caller context matched first-party evidence ({matched_str}).", "USER_CONTEXT"

        return False, "Specific caller context structural attributes were not corroborated in candidate first-party evidence.", "NO_FIRST_PARTY_MATCH"

    @staticmethod
    def _context_score(text: str, context: IdentityContext) -> int:
        """
        Score how well candidate text matches the caller-supplied context for candidate selection.
        """
        terms: set = set()
        for val in (context.industry, context.description, context.company_type, context.location, context.country, context.legal_name):
            if val:
                for tok in val.lower().split():
                    if len(tok) > 3:
                        terms.add(tok)
        text_lower = text.lower()
        return sum(1 for t in terms if t in text_lower)

    # ── Name-shape risk ─────────────────────────────────────────────────────────
    GENERIC_TERMS = {
        "corp", "corporation", "inc", "company", "llc", "ltd", "co",
        "solutions", "media", "group", "holdings", "services",
        "agency", "technologies", "technology", "tech", "global", "capital",
        "partners", "ventures", "enterprises", "consulting", "financial",
        "systems", "system", "software", "platform", "platforms", "workspace",
        "workspaces", "cloud", "data", "digital", "network", "networks",
        "security", "management", "logistics", "studio", "studios",
        "interactive", "labs", "lab", "app", "apps", "healthcare",
        "health", "insurance", "payments", "payment", "bank", "banking",
        "finance", "industries", "resources", "properties", "investments",
        "analytics", "engineering", "mobility", "communications",
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

    def _detect_legal_entity_registration(self, company_name: str, candidate: IdentityCandidate) -> bool:
        """
        Detects if first-party candidate evidence contains explicit corporate registration,
        jurisdictional authority, or recognized corporate entity forms (e.g. GmbH, S.p.A., AG,
        B.V., Pty Ltd, LLC, Inc., Registration No., licensed/regulated by authority).
        """
        if any(ev.signal in ("LEGAL_ENTITY_REGISTRATION", "LEGAL_ENTITY_CORROBORATION") for ev in candidate.evidence):
            return True
        legal_pattern = re.compile(
            r'\b(?:gmbh|s\.p\.a\.|s\.a\.|b\.v\.|pty\s+ltd|registered\s+in|registration\s+no|company\s+no|licen[sc]ed\s+by|regulated\s+by|supervised\s+by)\b',
            re.IGNORECASE
        )
        combined_text = candidate.relationship_reasoning + " " + candidate.verification_msg
        for ev in candidate.evidence:
            combined_text += " " + (ev.title or "") + " " + (ev.signal or "") + " " + (ev.query or "")
        return bool(legal_pattern.search(combined_text))

    @staticmethod
    def _get_evidence_sources(candidate: Optional[IdentityCandidate]) -> tuple[str, ...]:
        if not candidate or not candidate.evidence:
            return ()
        sources = set()
        for ev in candidate.evidence:
            if ev.type == EvidenceType.FALLBACK_INDEXED or ev.source == "indexed_search":
                sources.add("SEARCH_INDEX_FALLBACK")
            elif ev.type == EvidenceType.EXTERNAL_REGISTRY:
                sources.add("EXTERNAL_REGISTRY")
            elif ev.type == EvidenceType.SEARCH_RESULT or ev.source in ("serper", "mock_search", "mocksearchprovider", "search"):
                sources.add("SEARCH_INDEX")
            elif ev.source.startswith("homepage") or ev.source.startswith("secondary_"):
                sources.add("FIRST_PARTY_CRAWL")
            elif ev.type in (EvidenceType.SELF_IDENTITY, EvidenceType.PAGE_IDENTITY, EvidenceType.RELATIONSHIP):
                sources.add("FIRST_PARTY_CRAWL")
        return tuple(sorted(sources))

    def _should_discount_shape_risk(
        self,
        company_name: str,
        best_candidate: IdentityCandidate,
        all_candidates: Optional[List[IdentityCandidate]] = None,
        context: Optional[IdentityContext] = None,
    ) -> Tuple[bool, str, str]:
        """
        Evaluates whether shape risk on a uniquely verified PRIMARY candidate
        should be discounted due to genuine entity-discriminating positive evidence.

        Returns (can_discount, reason, entity_discrimination_basis).
        """
        # 0. Candidate provenance: indexed-only evidence cannot discount shape risk
        if best_candidate.is_indexed_only:
            return False, "Candidate established via search-indexed fallback (bot-blocked homepage) carries epistemic cap.", "NONE"

        distinctive = self.extract_distinctive_tokens(company_name)
        if not distinctive:
            return False, "Query contains only generic corporate suffixes without a distinctive brand token.", "NONE"

        # 1. Domain correspondence check
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
            return False, f"Domain '{best_candidate.domain}' does not match brand name.", "NONE"

        # 2. Competing Brand Domains Check
        if all_candidates:
            has_competing, competing_str = self._check_competing_brand_domains(
                company_name, best_candidate, all_candidates
            )
            if has_competing:
                return False, f"Multiple distinct brand domains ({competing_str}) observed in search results.", "NONE"

        # 3. Check for External Registry Match
        ext_registry_ev = [
            ev for ev in best_candidate.evidence
            if ev.type == EvidenceType.EXTERNAL_REGISTRY
        ]
        if ext_registry_ev:
            has_conflict = any(
                "CONFLICT" in (ev.signal or "") or "MISMATCH" in (ev.signal or "") or "CONTRADICTION" in (ev.signal or "")
                for ev in ext_registry_ev
            )
            if has_conflict:
                return False, "Conflicting external registry record detected.", "CONTRADICTION_BLOCKED"
            return True, "Entity identity verified via independent external registry record.", "EXTERNAL_ENTITY_MATCH"

        # 4. Check for Entity Discrimination Basis:
        # Basis 0: Distinctive coined brand token (non-dictionary)
        if any(not is_dictionary_word(t) for t in distinctive):
            return True, "Entity collision risk discounted via distinctive coined brand token.", "COINED_BRAND_TOKEN"

        # Basis A: Caller-supplied structured context evaluated strictly against first-party crawled evidence
        if context:
            is_matched, match_reason, match_basis = self._evaluate_context_discrimination(best_candidate, context)
            if is_matched:
                return True, match_reason, "USER_CONTEXT"
            if match_basis == "CONTRADICTION_BLOCKED":
                return False, match_reason, "CONTRADICTION_BLOCKED"

        # Invariant B: First-party legal entity registration on candidate's site alone is self-corroboration,
        # NOT cross-entity discrimination. It remains AMBIGUOUS without caller context or external registry match.
        return False, "Common-word entity requires explicit entity-discriminating evidence (caller context matching first-party crawled evidence or external registry).", "NONE"

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
        distinctive = self.extract_distinctive_tokens(company_name)

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
            if (
                (clean_dist and clean_dist in c_reg)
                or c_root == clean_dist
                or c_root == clean_co
                or (distinctive and c_root == distinctive[0])
                or (distinctive and len(distinctive[0]) > 4 and distinctive[0] in c_root)
            ):
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
                snippet=r.snippet,
            ))

        if not domain_evidence:
            diag_trace = IdentityDiagnosticTrace(
                query=company_name,
                tokens=tuple(re.findall(r'\b[a-z0-9]+\b', company_name.lower())),
                common_word_hits=tuple(t for t in re.findall(r'\b[a-z0-9]+\b', company_name.lower()) if is_dictionary_word(t)),
                generic_term_hits=tuple(t for t in re.findall(r'\b[a-z0-9]+\b', company_name.lower()) if t in self.GENERIC_TERMS or t in self.GENERIC_MODIFIERS or t in self.GENERIC_CATEGORY_NOUNS),
                domain_slug=self.canonical_brand_slug(company_name),
                domain_correspondence="no_candidate",
                candidate_count=0,
                competitor_count=0,
                self_id_strength="NONE",
                corroboration_strength="none",
                indexed_only=False,
                relationship_status="UNKNOWN",
                shape_risk_result=self.name_shape_risk(company_name),
                entity_discrimination_basis="NONE",
                final_decision_rule="NO_CANDIDATES_UNRESOLVED",
                evidence_sources=(),
            )
            return CompanyIdentity(
                name=company_name, domain="", website_url="",
                confidence=IdentityConfidence.UNRESOLVED,
                reasoning="No candidates passed the domain exclusion filter.",
                candidates=[],
                diagnostic_trace=diag_trace,
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
        decision_rule = "UNKNOWN"
        competing_count = 0
        entity_discrimination_basis = "COINED_BRAND_TOKEN" if not is_shape_risk else "NONE"

        if len(verified_candidates) == 1:
            best = verified_candidates[0]
            is_indexed_only = best.is_indexed_only
            has_competing, competing_str = self._check_competing_brand_domains(
                company_name, best, recorded_candidates
            )
            if has_competing:
                decision_rule = "COMPETING_BRAND_DOMAINS_AMBIGUOUS"
                competing_count = len(competing_str.split(","))
                confidence = IdentityConfidence.AMBIGUOUS
                reasoning = (
                    f"Single PRIMARY candidate '{best.domain}', but conflicting brand domains "
                    f"({competing_str}) observed in search results. Manual disambiguation required. "
                    f"{best.relationship_reasoning}"
                )
            elif is_indexed_only:
                decision_rule = "INDEXED_ONLY_EPISTEMIC_CAP_AMBIGUOUS"
                confidence = IdentityConfidence.AMBIGUOUS
                reasoning = (
                    f"Single PRIMARY candidate '{best.domain}' established via search-indexed fallback (bot-blocked homepage). "
                    f"Manual confirmation required. {best.relationship_reasoning}"
                )
            elif is_shape_risk:
                can_discount, discount_reason, disc_basis = self._should_discount_shape_risk(
                    company_name, best, recorded_candidates, context=context
                )
                entity_discrimination_basis = disc_basis
                if can_discount:
                    decision_rule = "SHAPE_RISK_DISCOUNTED_CONFIDENT"
                    confidence = IdentityConfidence.CONFIDENT
                    reasoning = (
                        f"Uniquely verified PRIMARY candidate with exact domain correspondence "
                        f"and {disc_basis} evidence discounting shape-risk. {best.relationship_reasoning}"
                    )
                else:
                    decision_rule = "SHAPE_RISK_RETAINED_AMBIGUOUS"
                    confidence = IdentityConfidence.AMBIGUOUS
                    reasoning = (
                        f"Single PRIMARY candidate '{best.domain}', but name has high "
                        f"shape-risk (short / generic-suffix dominated: {discount_reason}). "
                        f"Manual disambiguation required. {best.relationship_reasoning}"
                    )
            else:
                decision_rule = "DISTINCTIVE_PRIMARY_CONFIDENT"
                confidence = IdentityConfidence.CONFIDENT
                reasoning  = (
                    f"Uniquely verified PRIMARY candidate. {best.relationship_reasoning}"
                )
            chosen = best

        elif len(verified_candidates) > 1:
            decision_rule = "MULTIPLE_PRIMARY_AMBIGUOUS"
            names = ", ".join(c.domain for c in verified_candidates)
            confidence = IdentityConfidence.AMBIGUOUS
            reasoning = (
                f"Multiple PRIMARY candidates: {names}. "
                f"Identity is ambiguous and requires domain-level disambiguation."
            )
            chosen = verified_candidates[0]

        else:
            decision_rule = "NO_PRIMARY_UNRESOLVED"
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

        # Build diagnostic trace
        tokens = tuple(re.findall(r'\b[a-z0-9]+\b', company_name.lower()))
        common_hits = tuple(t for t in tokens if is_dictionary_word(t))
        generic_hits = tuple(t for t in tokens if t in self.GENERIC_TERMS or t in self.GENERIC_MODIFIERS or t in self.GENERIC_CATEGORY_NOUNS)
        domain_slug = self.canonical_brand_slug(company_name)

        best_cand = chosen if chosen else (recorded_candidates[0] if recorded_candidates else None)
        domain_corr = "no_candidate"
        self_id_str = "NONE"
        corr_str = "none"
        is_idx_only = False
        rel_status = "UNKNOWN"

        if best_cand:
            domain_corr = self.verifier._domain_name_signal(company_name, best_cand.domain) if best_cand.domain else "none"
            is_idx_only = best_cand.is_indexed_only
            rel_status = best_cand.relationship.value if best_cand.relationship else "UNKNOWN"

            # Check self-ID
            for ev in best_cand.evidence:
                if ev.signal == "TITLE_ENTITY_MATCH":
                    self_id_str = "TITLE_MATCH"
                    break
                elif ev.signal == "SELF_IDENTITY_STATEMENT" and self_id_str == "NONE":
                    self_id_str = "SENTENCE_ID"

            # Check corroboration
            for ev in best_cand.evidence:
                if ev.signal in ("CORROBORATED_ABOUT_TITLE", "CORROBORATED_CONTACT_TITLE"):
                    corr_str = "strong"
                    break
                elif ev.signal in ("CORROBORATED_ABOUT_NAME", "CORROBORATED_CONTACT_NAME") and corr_str != "strong":
                    corr_str = "medium"
                elif ev.signal == "CORROBORATED_CAREERS_NAME" and corr_str not in ("strong", "medium"):
                    corr_str = "supplemental"
                elif ev.type == EvidenceType.FALLBACK_INDEXED and corr_str == "none":
                    corr_str = "indexed_fallback"

        diag_trace = IdentityDiagnosticTrace(
            query=company_name,
            tokens=tokens,
            common_word_hits=common_hits,
            generic_term_hits=generic_hits,
            domain_slug=domain_slug,
            domain_correspondence=domain_corr,
            candidate_count=len(recorded_candidates),
            competitor_count=competing_count,
            self_id_strength=self_id_str,
            corroboration_strength=corr_str,
            indexed_only=is_idx_only,
            relationship_status=rel_status,
            shape_risk_result=is_shape_risk,
            entity_discrimination_basis=entity_discrimination_basis,
            final_decision_rule=decision_rule,
            evidence_sources=self._get_evidence_sources(best_cand),
        )

        return CompanyIdentity(
            name=company_name,
            domain=final_domain,
            website_url=final_url,
            confidence=confidence,
            reasoning=reasoning,
            candidates=recorded_candidates,
            diagnostic_trace=diag_trace,
        )

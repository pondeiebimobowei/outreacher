"""
identity/verifier.py — v0.7.3

Relationship taxonomy:
  PRIMARY   — site IS the company's canonical web presence.
  RELATED   — site describes a relationship TO the company (product, product of, affiliate).
  LEGACY    — site self-identifies as the company but domain has no correspondence;
               typically a rebranded / redirected / acquired domain.
  UNKNOWN   — insufficient evidence to classify.

Evidence hierarchy (typed, not collapsed into a single bool):
  TITLE_ENTITY_MATCH        — page title opens or closes with exactly the company name.
  SELF_IDENTITY_STATEMENT   — sentence-initial subject-verb phrase where company is subject.
  RELATIONSHIP              — page states a structural relationship to the company.
  THIRD_PARTY               — name present but no identity or relationship signal.

PRIMARY decision rule:
  (TITLE_ENTITY_MATCH OR SELF_IDENTITY_STATEMENT on homepage)
  AND entity title confirmed on secondary identity page (ABOUT/CONTACT)
  AND domain-name correspondence ∈ {exact, partial}

LEGACY decision rule:
  Same as PRIMARY but domain-name correspondence == none.

RELATED decision rule:
  Relationship pattern present AND no self-identity.

Important design constraints:
  - domain-name correspondence is a SIGNAL, not a gate.
    A site can be PRIMARY with "partial" correspondence (e.g. abbreviated domain).
    A site with "exact" correspondence but no self-identity is still UNKNOWN.
  - 'title_matches_entity' uses a non-alpha character check after the name,
    NOT a fixed separator enumeration — handles all Unicode dashes, colons, etc.
  - Content self-identity requires sentence-initial position to reduce third-party
    mention false positives (e.g. "We stock Linear chips" ≠ "Linear is...").
"""
import re
import time
from typing import List, Optional, Tuple, Dict, Any

from crawling.manager import CrawlManager
from crawling.link_extractor import extract_identity_candidates, SecondaryRouteCandidate, classify_route_kind
from search.base import ISearchProvider, SearchProviderError
from search.sanitizer import SearchResultSanitizer
from core.models import (
    DocumentQuality, EvidenceType, IdentityEvidence, PageType, SiteRelationship,
)
from discovery.classifier import TwoStageClassifier

# ── Constants ──────────────────────────────────────────────────────────────────

# Common prefixes on secondary identity pages.
# Used by _secondary_title_matches_entity to strip preambles before matching.
_ABOUT_TITLE_PREFIXES: tuple = (
    "about ", "about the ", "meet ", "meet the ", "who we are",
    "our story", "company overview", "welcome to ",
)

# Relationship signal templates — indicate a NON-PRIMARY relationship.
# {name} is replaced with re.escape(company_name.lower()).
_SUBORDINATE_RELATIONSHIP_TEMPLATES: list = [
    # Subordinate relationship templates (entity is a brand/product/subsidiary of another)
    r"{name}\s+(?:is|was)\s+a\s+(?:brand|product|division|subsidiary|service)\s+of\b",
    r"{name}\s+(?:is|was)\s+(?:owned|acquired|built|made|created|developed|powered)\s+by\b",
    r"{name}\s+operates\s+as\s+a\s+(?:subsidiary|division)\s+of\b",
    r"{name}\s+(?:is|was)\s+part\s+of\b",
]

_PARENT_ATTRIBUTION_TEMPLATES: list = [
    # Parent/creator relationship templates
    r"a\s+product\s+of\s+{name}",
    r"owned\s+by\s+{name}",
    r"acquired\s+by\s+{name}",
    r"built\s+by\s+{name}",
    r"made\s+by\s+{name}",
    r"created\s+by\s+{name}",
    r"developed\s+by\s+{name}",
    r"powered\s+by\s+{name}",
    r"part\s+of\s+(?:the\s+)?{name}",
    r"subsidiary\s+of\s+{name}",
    r"a\s+(?:brand|division|service)\s+of\s+{name}",
    # Covers "v0 by Vercel", "v0 — by Vercel.", "tagline by Vercel" etc.
    # Guard [^a-zA-Z]|$ prevents matching mid-word (e.g. "Vercelian").
    r"by\s+{name}(?:[^a-zA-Z]|$)",
]

_RELATIONSHIP_TEMPLATES: list = _SUBORDINATE_RELATIONSHIP_TEMPLATES + _PARENT_ATTRIBUTION_TEMPLATES

# Corroboration strength by page type.
# Only ABOUT and CONTACT satisfy PRIMARY; CAREERS is supplemental only.
_CORROBORATION_STRENGTH: dict = {
    PageType.ABOUT:         "strong",
    PageType.CONTACT:       "medium",
    PageType.CAREERS_INDEX: "supplemental",
}


class WebsiteVerifier:
    def __init__(self, crawl_manager: CrawlManager, search_provider: ISearchProvider):
        self.crawl_manager   = crawl_manager
        self.search_provider = search_provider
        self.telemetry: Dict[str, Any] = {
            "secondary_search_requests": 0,
            "secondary_probe_count": 0,
            "successful_corroboration_count": 0,
            "verifier_elapsed_ms": 0.0,
        }

    # ── Public API ─────────────────────────────────────────────────────────────

    def classify_relationship(
        self, company_name: str, website_url: str,
        hint_title: Optional[str] = None,
    ) -> Tuple[SiteRelationship, str, List[IdentityEvidence]]:
        """
        Classify the relationship between *website_url* and *company_name*.

        Returns (relationship, reasoning, evidence_list).
        Only SiteRelationship.PRIMARY is eligible for CONFIDENT.

        hint_title: the page title from the search result (Google-indexed).
          Used as a fallback when the live crawler cannot extract a title from
          a JS-rendered SPA. Priority: crawled title > hint_title > "".
        """
        evidence: List[IdentityEvidence] = []
        company_lower = company_name.lower().strip()
        domain = website_url.replace("https://", "").replace("http://", "").rstrip("/")
        domain_signal = self._domain_name_signal(company_name, domain)

        # ── 1. Homepage ────────────────────────────────────────────────────────
        hp_doc = self.crawl_manager.fetch_with_fallback(website_url, PageType.OTHER)
        if hp_doc.quality.name not in ["VALID", "TOO_SHORT"]:
            return self._verify_from_indexed_evidence(
                company_name=company_name,
                company_lower=company_lower,
                website_url=website_url,
                domain=domain,
                domain_signal=domain_signal,
                hint_title=hint_title,
            )

        # Use the search-result title (Google-indexed) as a fallback when the
        # live crawler returns no title — common for JS-rendered SPAs.
        hp_title   = (hp_doc.title or hint_title or "").strip()
        hp_content = (hp_doc.content or "")
        hp_scan_text = hp_content if len(hp_content) <= 12000 else (hp_content[:6000] + " " + hp_content[-6000:])
        hp_sample  = (hp_title + ". " + hp_scan_text).lower()

        hp_title_match  = self._title_matches_entity(hp_title, company_name)
        hp_sentence_id  = self._detect_self_identity(hp_sample, company_name)
        hp_relationship = self._detect_relationship(
            hp_sample, company_name, domain_signal=domain_signal, has_exact_title_match=hp_title_match
        )
        hp_name_present = company_lower in hp_content.lower()

        # Record typed evidence signals
        if hp_title_match:
            evidence.append(IdentityEvidence(
                type=EvidenceType.SELF_IDENTITY, source="homepage",
                url=website_url, signal="TITLE_ENTITY_MATCH",
            ))
        if hp_sentence_id:
            evidence.append(IdentityEvidence(
                type=EvidenceType.SELF_IDENTITY, source="homepage",
                url=website_url, signal="SELF_IDENTITY_STATEMENT",
            ))
        if hp_relationship:
            evidence.append(IdentityEvidence(
                type=EvidenceType.RELATIONSHIP, source="homepage",
                url=website_url, signal="RELATIONSHIP_MENTION",
            ))
        elif hp_name_present and not hp_title_match and not hp_sentence_id:
            evidence.append(IdentityEvidence(
                type=EvidenceType.THIRD_PARTY, source="homepage",
                url=website_url, signal="NAME_IN_CONTENT_ONLY",
            ))

        # ── 2. Early exits ────────────────────────────────────────────────────
        # Relationship signal has absolute precedence: a subordinate/product/owned relationship
        # cannot be PRIMARY even if a sentence-initial pattern was matched.
        if hp_relationship:
            return (
                SiteRelationship.RELATED,
                f"Homepage references {company_name} in a structural relationship "
                f"(product/brand/acquired/owned/subsidiary).",
                evidence,
            )

        has_self_id = hp_title_match or hp_sentence_id

        if not hp_name_present and not has_self_id:
            return SiteRelationship.UNKNOWN, "Company name absent from homepage.", evidence

        if not has_self_id:
            # Name is present but no self-identity signal (e.g. footer or third-party mention)
            return (
                SiteRelationship.UNKNOWN,
                f"Name present on homepage but no self-identity signal found "
                f"(domain_signal={domain_signal}).",
                evidence,
            )

        # ── 3. Secondary identity corroboration ───────────────────────────────
        dynamic_candidates = extract_identity_candidates(hp_doc.raw_html or hp_doc.content or "", website_url)
        corr_entity_match, corr_name_match, corr_strength, corr_rel, corr_ev = (
            self._find_corroboration(company_name, company_lower, website_url, domain, dynamic_candidates=dynamic_candidates, hp_doc=hp_doc)
        )
        evidence.extend(corr_ev)

        if corr_rel:
            return (
                SiteRelationship.RELATED,
                f"Secondary page references {company_name} in a structural relationship (product/brand/subsidiary/acquired).",
                evidence,
            )

        # ── 4. Decision ───────────────────────────────────────────────────────
        # STRONG evidence: secondary page title also matches the entity.
        # MEDIUM evidence: secondary page found, name present, but title doesn't match entity.

        if corr_entity_match and corr_strength in ("strong", "medium"):
            # Both homepage and secondary page title-confirm the entity.
            if domain_signal in ("exact", "partial"):
                return (
                    SiteRelationship.PRIMARY,
                    f"Entity-title confirmed on both homepage and secondary page "
                    f"(corroboration={corr_strength}, domain_signal={domain_signal}).",
                    evidence,
                )
            else:
                return (
                    SiteRelationship.LEGACY,
                    f"Entity-title confirmed on both pages but domain has no correspondence "
                    f"(domain_signal={domain_signal}). Likely a rebranded or acquired domain.",
                    evidence,
                )

        if hp_title_match and corr_name_match and corr_strength in ("strong", "medium"):
            # Homepage entity-title match + secondary page name corroboration.
            # Covers cases where the secondary page title isn't perfectly structured
            # (e.g. "Contact Us | Moniepoint") but name presence confirms identity.
            if domain_signal in ("exact", "partial"):
                return (
                    SiteRelationship.PRIMARY,
                    f"Homepage entity-title match + name corroborated in "
                    f"{corr_strength} secondary page (domain_signal={domain_signal}).",
                    evidence,
                )
            else:
                return (
                    SiteRelationship.LEGACY,
                    f"Homepage entity-title match + name in secondary page, "
                    f"no domain correspondence (domain_signal={domain_signal}).",
                    evidence,
                )

        if hp_sentence_id and corr_name_match and corr_strength in ("strong", "medium") and domain_signal == "exact":
            # Homepage sentence-initial self-ID + secondary page name corroboration
            # + exact domain — all three gates passed.
            # domain_signal=="exact" is the key safety invariant: only fires when the
            # primary domain label exactly matches the company name (e.g. "moniepoint"
            # for "Moniepoint"), preventing a third-party site from reaching PRIMARY
            # through accidental sentence-initial matches.
            return (
                SiteRelationship.PRIMARY,
                f"Homepage self-ID statement + name corroborated in "
                f"{corr_strength} secondary page (domain_signal={domain_signal}).",
                evidence,
            )

        if corr_strength == "supplemental":
            return (
                SiteRelationship.UNKNOWN,
                "Homepage self-ID found, but only careers-page corroboration — insufficient.",
                evidence,
            )

        return (
            SiteRelationship.UNKNOWN,
            "Homepage self-ID found, but no secondary identity page confirmed.",
            evidence,
        )

    def verify(
        self, company_name: str, website_url: str
    ) -> Tuple[bool, str, List[IdentityEvidence]]:
        """Backward-compatible shim. PRIMARY → True; everything else → False."""
        rel, msg, ev = self.classify_relationship(company_name, website_url)
        return rel == SiteRelationship.PRIMARY, msg, ev

    # ── Static helpers — entity matching ──────────────────────────────────────

    @staticmethod
    def _domain_name_signal(company_name: str, domain: str) -> str:
        """
        Returns 'exact', 'partial', or 'none'.
        Uses only the primary label (before the first dot).

        Signal semantics:
          exact   — label IS the company name (linear → linear.app)
          partial — one is a prefix of the other (linearsolutions ⊃ linear)
          none    — no overlap
        """
        clean_co  = re.sub(r"[^a-z0-9]", "", company_name.lower())
        label     = domain.split(".")[0].lower()
        clean_lbl = re.sub(r"[^a-z0-9]", "", label)
        if not clean_co or not clean_lbl:
            return "none"
        if clean_lbl == clean_co:
            return "exact"
        if clean_lbl.startswith(clean_co) or clean_co.startswith(clean_lbl):
            return "partial"
        # Distinctive token overlap (e.g. "Postmark Mail" with domain "postmarkapp.com")
        generic_terms = {
            "mail", "app", "inc", "corp", "tech", "group", "co", "cloud",
            "io", "ai", "labs", "software", "technologies", "services",
            "solutions", "global", "hq", "platform", "online", "official",
        }
        words = [
            w for w in re.findall(r"[a-z0-9]+", company_name.lower())
            if len(w) >= 4 and w not in generic_terms
        ]
        if any(w in clean_lbl for w in words):
            return "partial"
        return "none"

    @staticmethod
    def _title_matches_entity(title: str, company_name: str) -> bool:
        """
        True if the page title opens OR closes with exactly the company name as
        a complete entity — not part of a longer entity name.

        Uses a non-alpha character check rather than a fixed separator enumeration,
        which handles all Unicode dashes, colons, semicolons, pipes, etc.:

            "Linear – Project Management"   → True   (non-alpha after name)
            "Vercel: Build and deploy"       → True   (colon is non-alpha)
            "Linear Solutions - ..."         → False  ('s' after name is alpha)
            "v0 - Generative UI by Vercel"   → False  ('v' at start, title opens with 'v')
            "Project Management | Linear"    → True   (name closes title after '|')
        """
        t = title.strip().lower()
        n = company_name.strip().lower()
        if not t or not n:
            return False

        # Forward: title starts with exactly the company name
        if t.startswith(n):
            rest = t[len(n):].lstrip()
            # Anything after the name must be non-alphabetic (separator, digit, empty)
            if not rest or not rest[0].isalpha():
                return True

        # Reverse: title ends with exactly the company name after a separator
        # Handles "Project Management | Linear" or "Best Tool – Linear"
        if t.endswith(n):
            pre = t[: -len(n)].rstrip()
            if pre and not pre[-1].isalpha():
                return True

        return False

    @staticmethod
    def _secondary_title_matches_entity(title: str, company_name: str) -> bool:
        """
        True if a secondary page title (ABOUT / CONTACT) confirms the entity.

        Handles the common pattern "About {Company}" by stripping known prefixes
        before applying the standard entity match:

            "About Linear"           → True  for "Linear"
            "About Linear Solutions" → False for "Linear"  (different entity)
            "Linear | About Us"      → True  for "Linear"  (standard forward match)
        """
        t = title.strip().lower()
        n = company_name.strip().lower()
        for prefix in _ABOUT_TITLE_PREFIXES:
            if t.startswith(prefix):
                remainder = t[len(prefix):].strip()
                if remainder.startswith(("|", "-", "–", "—", ":", "•", "/")):
                    remainder = remainder.lstrip("|-–—:•/ ").strip()
                if remainder == n:
                    return True
                if remainder.startswith(n):
                    rest = remainder[len(n):].lstrip()
                    if not rest or not rest[0].isalpha():
                        return True
        # Fall through to standard forward/reverse check
        return WebsiteVerifier._title_matches_entity(title, company_name)

    @staticmethod
    def _detect_self_identity(text: str, company_name: str) -> bool:
        """
        True if the company name appears as a sentence-initial grammatical subject
        followed immediately by a verb.

        Sentence-initial requirement prevents false positives like:
            "We distribute Linear products. Linear is a manufacturer we stock."
        where "Linear" would match mid-sentence as a third-party subject.

        Retained (per design): "welcome to {name}" is position-independent because
        that phrase cannot reasonably reference a third party.
        """
        escaped = re.escape(company_name.lower())
        # Sentence-initial: start of text or after .!? + whitespace
        sentence_start = rf"(?:^|(?<=[.!?])\s+){escaped}\s+"
        verbs = r"(?:is|was|are|has|helps|enables|provides|offers|powers|serves|builds|makes)\b"
        if re.search(sentence_start + verbs, text.lower(), re.MULTILINE):
            return True
        # Position-independent welcome phrase
        if re.search(rf"\bwelcome\s+to\s+{escaped}\b", text.lower()):
            return True
        return False

    @staticmethod
    def _detect_relationship(
        text: str,
        company_name: str,
        domain_signal: str = "none",
        has_exact_title_match: bool = False,
    ) -> bool:
        """
        True if text signals that this site RELATES TO (but is not) the company.
        Distinguishes structural subordinate relationships (e.g. 'Foo is a subsidiary of Bar')
        from ordinary creator/author self-attribution (e.g. 'Built by Foo' on Foo's own exact domain).
        """
        escaped = re.escape(company_name.lower())

        # 1. Subordinate relationship templates: {name} is explicitly a subsidiary/product of another entity
        for tmpl in _SUBORDINATE_RELATIONSHIP_TEMPLATES:
            if re.search(tmpl.format(name=escaped), text.lower()):
                return True

        # 2. Parent/creator attribution templates: site is a product/creation of {name}
        # On {name}'s own canonical exact domain with entity-title match, 'Built by {name}' is self-attribution
        is_canonical_self = (domain_signal == "exact" and has_exact_title_match)
        if not is_canonical_self:
            for tmpl in _PARENT_ATTRIBUTION_TEMPLATES:
                if re.search(tmpl.format(name=escaped), text.lower()):
                    return True

        return False

    # ── Secondary corroboration ────────────────────────────────────────────────

    def _find_corroboration(
        self,
        company_name: str,
        company_lower: str,
        website_url: str,
        domain: str,
        dynamic_candidates: Optional[List[SecondaryRouteCandidate]] = None,
        hp_doc: Optional[CrawledDocument] = None,
    ) -> Tuple[bool, bool, Optional[str], bool, List[IdentityEvidence]]:
        """
        Search for and evaluate a secondary identity page (ABOUT / CONTACT / LEGAL / COMPANY).

        Returns:
          entity_title_match — secondary page title entity-matched the company name.
          name_match         — company name was present on the secondary page.
          strength           — 'strong' | 'medium' | 'supplemental' | None.
          rel_match          — structural relationship (product/brand/subsidiary) detected.
          evidence           — list of IdentityEvidence items.
        """
        candidate_routes: Dict[str, Tuple[str, str, PageType]] = {}
        domain_signal = self._domain_name_signal(company_name, domain)

        # 1. Dynamic first-party candidate routes from homepage HTML & JSON-LD
        if dynamic_candidates:
            for dc in dynamic_candidates:
                if dc.url.rstrip("/") != website_url.rstrip("/"):
                    ptype = PageType.ABOUT if dc.route_kind in ("ABOUT", "COMPANY") else (
                        PageType.CONTACT if dc.route_kind == "CONTACT" else PageType.OTHER
                    )
                    candidate_routes[dc.url] = (dc.route_kind, dc.source, ptype)

        # 2. Search-discovered URLs
        query = f'site:{domain} "about" OR "company" OR "contact"'
        try:
            self.telemetry["secondary_search_requests"] += 1
            raw   = self.search_provider.search(query, num_results=5)
            clean = SearchResultSanitizer.sanitize(raw)
            for r in clean:
                u = r.url.rstrip("/")
                if u != website_url.rstrip("/") and u not in candidate_routes:
                    ptype = TwoStageClassifier.stage1_classify_url(r.url)
                    if ptype == PageType.BLOG:
                        continue
                    kind, score = classify_route_kind(r.url)
                    if kind == "EXCLUDED":
                        continue
                    if kind == "UNKNOWN":
                        if ptype == PageType.ABOUT:
                            kind = "ABOUT"
                        elif ptype == PageType.CONTACT:
                            kind = "CONTACT"
                        elif ptype == PageType.CAREERS_INDEX:
                            kind = "CAREERS"
                        else:
                            kind = "COMPANY"
                    candidate_routes[r.url] = (kind, "SEARCH_DISCOVERY", ptype)
        except SearchProviderError:
            pass

        # 3. Multi-candidate conventional route fallback probing
        conventional_paths = [
            "/about", "/about-us", "/company", "/company/about", "/about/company",
            "/who-we-are", "/our-story", "/contact", "/contact-us",
            "/impressum", "/legal", "/mentions-legales", "/aviso-legal",
        ]
        base_url = website_url.rstrip("/")
        for path in conventional_paths:
            cand_url = base_url + path
            if cand_url not in candidate_routes:
                ptype = TwoStageClassifier.stage1_classify_url(cand_url)
                kind, _ = classify_route_kind(cand_url)
                if kind == "UNKNOWN":
                    kind = "ABOUT" if ptype == PageType.ABOUT else ("CONTACT" if ptype == PageType.CONTACT else "COMPANY")
                candidate_routes[cand_url] = (kind, "CONVENTIONAL_PATH", ptype)

        hp_clean_content = (hp_doc.content or "").strip() if hp_doc else ""

        for url, (route_kind, source, ptype) in candidate_routes.items():
            if route_kind == "EXCLUDED" or ptype in (PageType.BLOG, PageType.JOB_LISTING):
                continue
            if route_kind in ("ABOUT", "LEGAL"):
                strength = "strong"
            elif route_kind in ("COMPANY", "CONTACT"):
                strength = "medium"
            elif route_kind == "CAREERS" or ptype == PageType.CAREERS_INDEX:
                strength = "supplemental"
            else:
                strength = _CORROBORATION_STRENGTH.get(ptype)

            if strength is None:
                continue

            self.telemetry["secondary_probe_count"] += 1
            doc = self.crawl_manager.fetch_with_fallback(url, ptype)
            if doc.quality not in {DocumentQuality.VALID, DocumentQuality.TOO_SHORT}:
                continue

            # Invariant: Discovered route redirecting back to homepage is not independent
            if doc.final_url and doc.final_url.rstrip("/") == website_url.rstrip("/"):
                continue

            doc_title   = (doc.title   or "").strip()
            doc_content = (doc.content or "")
            doc_scan_text = doc_content if len(doc_content) <= 12000 else (doc_content[:6000] + " " + doc_content[-6000:])
            doc_sample  = (doc_title + ". " + doc_scan_text).lower()

            # Invariant: Catch-all SPA duplicate content check
            if hp_clean_content and len(hp_clean_content) > 30 and doc_content.strip() == hp_clean_content:
                continue

            # Invariant: Soft-404 error page check
            soft_404_markers = ["404 not found", "page not found", "page cannot be found", "error 404", "does not exist", "page does not exist"]
            if any(marker in doc_sample for marker in soft_404_markers) and len(doc_content.split()) < 50:
                continue

            entity_match = self._secondary_title_matches_entity(doc_title, company_name)
            rel_match = self._detect_relationship(
                doc_sample, company_name, domain_signal=domain_signal, has_exact_title_match=entity_match
            )
            if rel_match:
                return False, False, None, True, [IdentityEvidence(
                    type=EvidenceType.RELATIONSHIP, source=f"secondary_{source.lower()}", url=url, signal="RELATIONSHIP_MENTION",
                )]
            name_match   = (
                company_lower in doc_content.lower()
                or company_lower in doc_title.lower()
            )

            if entity_match or name_match:
                self.telemetry["successful_corroboration_count"] += 1
                if entity_match:
                    signal   = f"ENTITY_TITLE_IN_{strength.upper()}_PAGE"
                    ev_type  = EvidenceType.SELF_IDENTITY
                else:
                    signal   = f"NAME_IN_{strength.upper()}_PAGE"
                    ev_type  = EvidenceType.PAGE_IDENTITY
                return entity_match, name_match, strength, False, [IdentityEvidence(
                    type=ev_type, source=f"secondary_{source.lower()}", url=url, signal=signal,
                )]

        return False, False, None, False, []

    # ── Search-Indexed Acquisition Fallback (Track 2) ─────────────────────────

    def _verify_from_indexed_evidence(
        self,
        company_name: str,
        company_lower: str,
        website_url: str,
        domain: str,
        domain_signal: str,
        hint_title: Optional[str] = None,
    ) -> Tuple[SiteRelationship, str, List[IdentityEvidence]]:
        """
        Legitimate Search-Indexed Acquisition Fallback (Track 2).
        Rescues bot-blocked/challenge homepages (WAF, Cloudflare, 403) only when
        strict first-party search-indexed evidence corroborates the entity without circumvention.
        """
        evidence: List[IdentityEvidence] = []

        # Gate 1: Fetch indexed search results for domain
        query = f'site:{domain}'
        try:
            self.telemetry["secondary_search_requests"] += 1
            raw = self.search_provider.search(query, num_results=5)
            clean = SearchResultSanitizer.sanitize(raw)
        except SearchProviderError:
            return SiteRelationship.UNKNOWN, "Homepage blocked and indexed search query failed.", evidence

        if not clean:
            return SiteRelationship.UNKNOWN, "Homepage blocked and no indexed search results found.", evidence

        # Gate 2: First-party relationship check
        # If any indexed result indicates a subordinate / product / subsidiary relationship, classify as RELATED
        for r in clean:
            sample = f"{r.title}. {r.snippet}"
            if self._detect_relationship(sample, company_name):
                evidence.append(IdentityEvidence(
                    type=EvidenceType.RELATIONSHIP,
                    source="indexed_search",
                    url=r.url,
                    signal="INDEXED_RELATIONSHIP_MENTION",
                ))
                return (
                    SiteRelationship.RELATED,
                    f"Indexed search evidence references {company_name} in a structural relationship (product/brand/acquired).",
                    evidence,
                )

        # Gate 3: Strict Domain Correspondence for PRIMARY promotion
        if domain_signal not in ("exact", "partial"):
            return (
                SiteRelationship.UNKNOWN,
                f"Homepage fetch failed/blocked and domain signal '{domain_signal}' "
                f"insufficient for search-indexed PRIMARY promotion.",
                evidence,
            )

        # Gate 4: Root / Homepage entity match
        norm_web_url = website_url.rstrip("/")
        root_candidates = {norm_web_url, norm_web_url.replace("www.", ""), f"https://{domain}", f"http://{domain}"}
        root_results = [r for r in clean if r.url.rstrip("/") in root_candidates]

        has_primary_match = False
        primary_url = website_url

        # Check hint_title first
        if hint_title and self._title_matches_entity(hint_title, company_name):
            has_primary_match = True

        # Check root result if available
        if root_results:
            r0 = root_results[0]
            primary_url = r0.url
            if self._title_matches_entity(r0.title, company_name) or self._detect_self_identity(f"{r0.title}. {r0.snippet}", company_name):
                has_primary_match = True

        if not has_primary_match:
            return (
                SiteRelationship.UNKNOWN,
                f"Homepage blocked and indexed root page title does not match entity '{company_name}'.",
                evidence,
            )

        evidence.append(IdentityEvidence(
            type=EvidenceType.FALLBACK_INDEXED,
            source="indexed_fallback",
            url=primary_url,
            signal="INDEXED_ROOT_MATCH",
        ))

        # Gate 5: Secondary Corroborating Page
        # Needs a distinct second result corroborating identity on an identity-bearing route
        legal_forms = r"\b(?:se|gmbh|ltd|limited|inc|incorporated|corp|corporation|sa|s\.a\.|ag|pty|plc|sarl|bv|kg|llc)\b"
        legal_pattern = rf"\b{re.escape(company_lower)}(?:\s+(?:&|and)\s+\w+)?\s+{legal_forms}"

        corroborated = False
        corroborating_url = None

        for r in clean:
            if r.url.rstrip("/") == primary_url.rstrip("/"):
                continue

            ptype = TwoStageClassifier.stage1_classify_url(r.url)
            if ptype in (PageType.BLOG, PageType.JOB_LISTING):
                continue
            route_kind, _ = classify_route_kind(r.url)
            if route_kind == "EXCLUDED":
                continue

            sample = f"{r.title}. {r.snippet}"

            # Check 1: Secondary title matches entity on acceptable identity route
            if route_kind in ("ABOUT", "LEGAL", "CONTACT", "COMPANY") and self._secondary_title_matches_entity(r.title, company_name):
                corroborated = True
                corroborating_url = r.url
                break

            # Check 2: Self-identity in secondary snippet on identity route
            if route_kind in ("ABOUT", "LEGAL", "CONTACT", "COMPANY") and self._detect_self_identity(sample, company_name):
                corroborated = True
                corroborating_url = r.url
                break

            # Check 3: Legal corporate entity match in title/snippet
            if re.search(legal_pattern, sample.lower()):
                corroborated = True
                corroborating_url = r.url
                break

            # Check 4: Identity route kind + company name present
            if route_kind in ("ABOUT", "LEGAL", "CONTACT", "COMPANY") and (
                company_lower in r.title.lower() or company_lower in r.snippet.lower()
            ):
                corroborated = True
                corroborating_url = r.url
                break

        if not corroborated or not corroborating_url:
            return (
                SiteRelationship.UNKNOWN,
                f"Homepage blocked; indexed root title matched but no corroborating secondary indexed page found.",
                evidence,
            )

        evidence.append(IdentityEvidence(
            type=EvidenceType.FALLBACK_INDEXED,
            source="indexed_fallback",
            url=corroborating_url,
            signal="INDEXED_CORROBORATING_PAGE",
        ))

        return (
            SiteRelationship.PRIMARY,
            f"Homepage blocked, but dual identity-bearing indexed search evidence corroborates entity "
            f"(domain_signal={domain_signal}).",
            evidence,
        )


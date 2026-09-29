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
from typing import List, Optional, Tuple

from crawling.manager import CrawlManager
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
_RELATIONSHIP_TEMPLATES: list = [
    # Subordinate relationship templates (entity is a brand/product/subsidiary of another)
    r"{name}\s+(?:is|was)\s+a\s+(?:brand|product|division|subsidiary|service)\s+of\b",
    r"{name}\s+(?:is|was)\s+(?:owned|acquired|built|made|created|developed|powered)\s+by\b",
    r"{name}\s+operates\s+as\s+a\s+(?:subsidiary|division)\s+of\b",
    r"{name}\s+(?:is|was)\s+part\s+of\b",
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
    r"{name}\s+acquired\b",
    r"{name}\s+owns\b",
    r"subsidiary\s+of\s+{name}",
    r"a\s+(?:brand|division|service)\s+of\s+{name}",
    # Covers "v0 by Vercel", "v0 — by Vercel.", "tagline by Vercel" etc.
    # Guard [^a-zA-Z]|$ prevents matching mid-word (e.g. "Vercelian").
    r"by\s+{name}(?:[^a-zA-Z]|$)",
]

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
            return SiteRelationship.UNKNOWN, "Homepage fetch failed or blocked.", evidence

        # Use the search-result title (Google-indexed) as a fallback when the
        # live crawler returns no title — common for JS-rendered SPAs.
        hp_title   = (hp_doc.title or hint_title or "").strip()
        hp_content = (hp_doc.content or "")
        hp_sample  = (hp_title + ". " + hp_content[:3000]).lower()

        hp_title_match  = self._title_matches_entity(hp_title, company_name)
        hp_sentence_id  = self._detect_self_identity(hp_sample, company_name)
        hp_relationship = self._detect_relationship(hp_sample, company_name)
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
        has_self_id = hp_title_match or hp_sentence_id

        if not hp_name_present and not has_self_id:
            return SiteRelationship.UNKNOWN, "Company name absent from homepage.", evidence

        # Relationship signal present but no self-identity → RELATED
        if hp_relationship and not has_self_id:
            return (
                SiteRelationship.RELATED,
                f"Homepage references {company_name} as a structural relationship "
                f"(product/acquired/owned) without self-identifying as {company_name}.",
                evidence,
            )

        if not has_self_id:
            # Name is present but no self-identity signal (e.g. footer or third-party mention)
            return (
                SiteRelationship.UNKNOWN,
                f"Name present on homepage but no self-identity signal found "
                f"(domain_signal={domain_signal}).",
                evidence,
            )

        # ── 3. Secondary identity corroboration ───────────────────────────────
        corr_entity_match, corr_name_match, corr_strength, corr_rel, corr_ev = (
            self._find_corroboration(company_name, company_lower, website_url, domain)
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
            if domain_signal == "exact":
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
    def _detect_relationship(text: str, company_name: str) -> bool:
        """True if text signals that this site RELATES TO (but is not) the company."""
        escaped = re.escape(company_name.lower())
        for tmpl in _RELATIONSHIP_TEMPLATES:
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
    ) -> Tuple[bool, bool, Optional[str], bool, List[IdentityEvidence]]:
        """
        Search for and evaluate a secondary identity page (ABOUT / CONTACT).

        Returns:
          entity_title_match — secondary page title entity-matched the company name.
          name_match         — company name was present on the secondary page.
          strength           — 'strong' | 'medium' | 'supplemental' | None.
          rel_match          — structural relationship (product/brand/subsidiary) detected.
          evidence           — list of IdentityEvidence items.
        """
        query = f'site:{domain} "about" OR "company" OR "contact"'
        urls: list = []
        try:
            raw   = self.search_provider.search(query, num_results=5)
            clean = SearchResultSanitizer.sanitize(raw)
            for r in clean:
                if r.url.rstrip("/") != website_url.rstrip("/"):
                    urls.append(r.url)
        except SearchProviderError:
            pass

        # Always include /about as direct fallback
        fallback = website_url.rstrip("/") + "/about"
        if fallback not in urls:
            urls.append(fallback)

        for url in urls:
            ptype    = TwoStageClassifier.stage1_classify_url(url)
            strength = _CORROBORATION_STRENGTH.get(ptype)
            if strength is None:
                continue

            doc = self.crawl_manager.fetch_with_fallback(url, ptype)
            if doc.quality not in {DocumentQuality.VALID, DocumentQuality.TOO_SHORT}:
                continue

            doc_title   = (doc.title   or "").strip()
            doc_content = (doc.content or "")
            doc_sample  = (doc_title + ". " + doc_content[:3000]).lower()

            rel_match = self._detect_relationship(doc_sample, company_name)
            if rel_match:
                return False, False, None, True, [IdentityEvidence(
                    type=EvidenceType.RELATIONSHIP, source="secondary_page", url=url, signal="RELATIONSHIP_MENTION",
                )]

            entity_match = self._secondary_title_matches_entity(doc_title, company_name)
            name_match   = (
                company_lower in doc_content.lower()
                or company_lower in doc_title.lower()
            )

            if entity_match or name_match:
                if entity_match:
                    signal   = f"ENTITY_TITLE_IN_{strength.upper()}_PAGE"
                    ev_type  = EvidenceType.SELF_IDENTITY
                else:
                    signal   = f"NAME_IN_{strength.upper()}_PAGE"
                    ev_type  = EvidenceType.PAGE_IDENTITY
                return entity_match, name_match, strength, False, [IdentityEvidence(
                    type=ev_type, source="secondary_page", url=url, signal=signal,
                )]

        return False, False, None, False, []

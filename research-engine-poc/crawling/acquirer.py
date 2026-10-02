"""
crawling/acquirer.py — First-Party Content Acquisition Layer

Responsible for acquiring first-party web content from candidate domains:
- Homepage fetch with static -> browser fallback
- Same-domain redirect following and normalization
- HTML anchor and JSON-LD route discovery
- Conventional route probing (/about, /legal, /impressum, etc.)
- Secondary route acquisition and quality validation
- Soft-404 and duplicate-SPA filtering
"""

from typing import List, Dict, Optional, Tuple, Any, Protocol
from dataclasses import dataclass, field
from urllib.parse import urlparse

from core.models import (
    CrawledDocument, PageType, DocumentQuality,
)
from crawling.manager import CrawlManager
from crawling.link_extractor import extract_identity_candidates, classify_route_kind, SecondaryRouteCandidate
from search.base import ISearchProvider, SearchProviderError
from search.sanitizer import SearchResultSanitizer
from discovery.classifier import TwoStageClassifier


_CONVENTIONAL_PATHS: List[str] = [
    "/about", "/about-us", "/company", "/company/about", "/about/company",
    "/who-we-are", "/our-story", "/contact", "/contact-us",
    "/impressum", "/legal", "/mentions-legales", "/aviso-legal",
]

_CORROBORATION_STRENGTH: Dict[PageType, str] = {
    PageType.ABOUT: "strong",
    PageType.CONTACT: "medium",
    PageType.CAREERS_INDEX: "supplemental",
}


@dataclass(frozen=True)
class AcquiredDocument:
    doc: CrawledDocument
    route_kind: str
    source: str
    strength: str


@dataclass
class AcquiredSiteDocuments:
    homepage_doc: CrawledDocument
    secondary_docs: List[AcquiredDocument] = field(default_factory=list)
    telemetry: Dict[str, Any] = field(default_factory=dict)


class IFirstPartyAcquirer(Protocol):
    def acquire(self, website_url: str) -> AcquiredSiteDocuments:
        ...


class FirstPartyAcquirer:
    """
    Standard First-Party Acquisition Layer.
    Coordinates homepage acquisition, dynamic route extraction, search-guided discovery,
    and conventional route probing to build an AcquiredSiteDocuments bundle for downstream verification.
    """
    def __init__(
        self,
        crawl_manager: Any,
        search_provider: Optional[ISearchProvider] = None,
    ):
        self.crawl_manager = crawl_manager
        self.search_provider = search_provider
        self.telemetry: Dict[str, Any] = {
            "secondary_search_requests": 0,
            "secondary_probe_count": 0,
            "acquired_secondary_count": 0,
        }

    def acquire(self, website_url: str) -> AcquiredSiteDocuments:
        domain = website_url.replace("https://", "").replace("http://", "").rstrip("/")
        
        # 1. Acquire Homepage
        hp_doc = self.crawl_manager.fetch_with_fallback(website_url, PageType.OTHER)
        if hp_doc.quality.name not in ["VALID", "TOO_SHORT"]:
            return AcquiredSiteDocuments(
                homepage_doc=hp_doc,
                secondary_docs=[],
                telemetry=dict(self.telemetry),
            )

        candidate_routes: Dict[str, Tuple[str, str, PageType]] = {}

        # 2. Dynamic first-party route discovery (HTML links & JSON-LD)
        dynamic_candidates = extract_identity_candidates(
            hp_doc.raw_html or hp_doc.content or "", website_url
        )
        for dc in dynamic_candidates:
            if dc.url.rstrip("/") != website_url.rstrip("/"):
                ptype = (
                    PageType.ABOUT if dc.route_kind in ("ABOUT", "COMPANY")
                    else (PageType.CONTACT if dc.route_kind == "CONTACT" else PageType.OTHER)
                )
                candidate_routes[dc.url] = (dc.route_kind, dc.source, ptype)

        # 3. Search-discovered secondary routes
        if self.search_provider:
            query = f'site:{domain} "about" OR "company" OR "contact"'
            try:
                self.telemetry["secondary_search_requests"] += 1
                raw = self.search_provider.search(query, num_results=5)
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

        # 4. Conventional route fallback probing
        base_url = website_url.rstrip("/")
        for path in _CONVENTIONAL_PATHS:
            cand_url = base_url + path
            if cand_url not in candidate_routes:
                ptype = TwoStageClassifier.stage1_classify_url(cand_url)
                kind, _ = classify_route_kind(cand_url)
                if kind == "UNKNOWN":
                    kind = "ABOUT" if ptype == PageType.ABOUT else ("CONTACT" if ptype == PageType.CONTACT else "COMPANY")
                candidate_routes[cand_url] = (kind, "CONVENTIONAL_PATH", ptype)

        # 5. Acquire secondary routes with quality & soft-404 filtering
        hp_clean_content = (hp_doc.content or "").strip()
        acquired_secondaries: List[AcquiredDocument] = []

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

            doc_title = (doc.title or "").strip()
            doc_content = (doc.content or "")
            doc_scan_text = doc_content if len(doc_content) <= 12000 else (doc_content[:6000] + " " + doc_content[-6000:])
            doc_sample = (doc_title + ". " + doc_scan_text).lower()

            # Invariant: Catch-all SPA duplicate content check
            if hp_clean_content and len(hp_clean_content) > 30 and doc_content.strip() == hp_clean_content:
                continue

            # Invariant: Soft-404 error page check
            soft_404_markers = ["404 not found", "page not found", "page cannot be found", "error 404", "does not exist", "page does not exist"]
            if any(marker in doc_sample for marker in soft_404_markers) and len(doc_content.split()) < 50:
                continue

            acquired_secondaries.append(AcquiredDocument(
                doc=doc,
                route_kind=route_kind,
                source=source,
                strength=strength,
            ))

        self.telemetry["acquired_secondary_count"] = len(acquired_secondaries)
        return AcquiredSiteDocuments(
            homepage_doc=hp_doc,
            secondary_docs=acquired_secondaries,
            telemetry=dict(self.telemetry),
        )

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
from core.urls import get_registrable_domain
from crawling.link_extractor import (
    extract_identity_candidates, classify_route_kind,
    extract_sitemap_urls, extract_robots_sitemaps,
    extract_html_lang, extract_path_locale,
)
from search.base import ISearchProvider, SearchProviderError
from search.sanitizer import SearchResultSanitizer
from discovery.classifier import TwoStageClassifier


_CONVENTIONAL_PATHS: List[str] = [
    "/about", "/about-us", "/company", "/company/about", "/about/company",
    "/who-we-are", "/our-story", "/contact", "/contact-us",
    "/impressum", "/legal", "/mentions-legales", "/aviso-legal",
    "/ueber-uns", "/uber-uns", "/a-propos", "/sobre-nosotros",
    "/kontakt", "/contacto",
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
    Coordinates homepage acquisition, canonical origin resolution, dynamic route extraction,
    sitemap/robots discovery, locale-aware probing, and soft-404/duplicate filtering.
    """
    def __init__(
        self,
        crawl_manager: Any,
        search_provider: Optional[ISearchProvider] = None,
    ):
        self.crawl_manager = crawl_manager
        self.search_provider = search_provider

    def acquire(self, website_url: str) -> AcquiredSiteDocuments:
        # Initialize comprehensive diagnostic telemetry
        telemetry: Dict[str, Any] = {
            "homepage_status": 0,
            "homepage_quality": "",
            "homepage_fetch_strategy": "STATIC",
            "canonical_origin": "",
            "discovered_route_count": 0,
            "discovered_routes_by_source": {
                "HTML_LINK": 0,
                "JSON_LD": 0,
                "SITEMAP": 0,
                "SEARCH_DISCOVERY": 0,
                "CONVENTIONAL_PATH": 0,
            },
            "fetches_attempted": 0,
            "fetches_completed": 0,
            "documents_accepted": 0,
            "documents_rejected": 0,
            "rejections_by_reason": {
                "EXTERNAL_REDIRECT": 0,
                "HOMEPAGE_REDIRECT": 0,
                "DUPLICATE_CONTENT": 0,
                "SOFT_404": 0,
                "FETCH_FAILED": 0,
                "EXCLUDED_ROUTE": 0,
            },
            "acquired_secondary_count": 0,
        }

        # 1. Acquire Homepage
        hp_doc = self.crawl_manager.fetch_with_fallback(website_url, PageType.OTHER)
        telemetry["homepage_status"] = hp_doc.status_code
        telemetry["homepage_quality"] = hp_doc.quality.name
        telemetry["homepage_fetch_strategy"] = (
            hp_doc.fetch_strategy if hasattr(hp_doc, "fetch_strategy") and hp_doc.fetch_strategy else "STATIC"
        )

        if hp_doc.quality.name not in ["VALID", "TOO_SHORT"]:
            return AcquiredSiteDocuments(
                homepage_doc=hp_doc,
                secondary_docs=[],
                telemetry=telemetry,
            )

        # 2. Canonical Origin Resolution & Same-Domain Protection
        input_reg = get_registrable_domain(website_url)
        canonical_path = ""

        if hp_doc.final_url:
            final_reg = get_registrable_domain(hp_doc.final_url)
            if final_reg == input_reg:
                parsed_final = urlparse(hp_doc.final_url)
                canonical_origin = f"{parsed_final.scheme}://{parsed_final.netloc}"
                canonical_path = parsed_final.path or ""
            else:
                # Redirect left the registrable domain — reject external origin
                parsed_in = urlparse(website_url if "://" in website_url else f"https://{website_url}")
                canonical_origin = f"{parsed_in.scheme}://{parsed_in.netloc}"
                telemetry["rejections_by_reason"]["EXTERNAL_REDIRECT"] += 1
        else:
            parsed_in = urlparse(website_url if "://" in website_url else f"https://{website_url}")
            canonical_origin = f"{parsed_in.scheme}://{parsed_in.netloc}"

        telemetry["canonical_origin"] = canonical_origin
        domain = canonical_origin.replace("https://", "").replace("http://", "").rstrip("/")

        candidate_routes: Dict[str, Tuple[str, str, PageType]] = {}

        # 3. Dynamic First-Party Route Discovery (HTML links & JSON-LD)
        dynamic_candidates = extract_identity_candidates(
            hp_doc.raw_html or hp_doc.content or "", canonical_origin
        )
        for dc in dynamic_candidates:
            if dc.url.rstrip("/") != canonical_origin.rstrip("/"):
                ptype = (
                    PageType.ABOUT if dc.route_kind in ("ABOUT", "COMPANY")
                    else (PageType.CONTACT if dc.route_kind == "CONTACT" else PageType.OTHER)
                )
                candidate_routes[dc.url] = (dc.route_kind, dc.source, ptype)

        # 4. Sitemap & robots.txt Discovery (Generic fallback when dynamic link discovery is sparse)
        if len(candidate_routes) < 3:
            sitemap_urls: List[str] = []

            # Check robots.txt
            robots_doc = self.crawl_manager.fetch_with_fallback(f"{canonical_origin}/robots.txt", PageType.OTHER)
            if robots_doc.quality.name in ["VALID", "TOO_SHORT"] and robots_doc.content:
                sitemap_declarations = extract_robots_sitemaps(robots_doc.content, canonical_origin)
                sitemap_urls.extend(sitemap_declarations)

            # Fall back to standard sitemap.xml if no robots declaration
            if not sitemap_urls:
                sitemap_urls.append(f"{canonical_origin}/sitemap.xml")

            for s_url in sitemap_urls[:2]:  # Bound sitemap checks to at most 2
                s_doc = self.crawl_manager.fetch_with_fallback(s_url, PageType.OTHER)
                if s_doc.quality.name in ["VALID", "TOO_SHORT"] and (s_doc.raw_html or s_doc.content):
                    raw_sitemap = s_doc.raw_html or s_doc.content
                    discovered_locs = extract_sitemap_urls(raw_sitemap, canonical_origin)
                    for loc in discovered_locs:
                        if loc.rstrip("/") != canonical_origin.rstrip("/") and loc not in candidate_routes:
                            kind, score = classify_route_kind(loc)
                            if score > 0.0 and kind != "EXCLUDED":
                                ptype = (
                                    PageType.ABOUT if kind in ("ABOUT", "COMPANY")
                                    else (PageType.CONTACT if kind == "CONTACT" else PageType.OTHER)
                                )
                                candidate_routes[loc] = (kind, "SITEMAP", ptype)

        # 5. Search-Discovered Secondary Routes
        if self.search_provider:
            query = f'site:{domain} "about" OR "company" OR "contact"'
            try:
                raw = self.search_provider.search(query, num_results=5)
                clean = SearchResultSanitizer.sanitize(raw)
                for r in clean:
                    if get_registrable_domain(r.url) != input_reg:
                        continue
                    u = r.url.rstrip("/")
                    if u != canonical_origin.rstrip("/") and u not in candidate_routes:
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

        # 6. Conservative Locale-Aware Route Generation
        locale_hint = extract_path_locale(canonical_path) or extract_html_lang(hp_doc.raw_html or "")
        conventional_paths_to_probe = list(_CONVENTIONAL_PATHS)
        if locale_hint and locale_hint != "en" and len(locale_hint) in (2, 5):
            for cp in _CONVENTIONAL_PATHS:
                conventional_paths_to_probe.append(f"/{locale_hint}{cp}")

        # 7. Conventional Route Probing
        for path in conventional_paths_to_probe:
            cand_url = f"{canonical_origin}{path}"
            if cand_url not in candidate_routes:
                ptype = TwoStageClassifier.stage1_classify_url(cand_url)
                kind, _ = classify_route_kind(cand_url)
                if kind == "UNKNOWN":
                    kind = "ABOUT" if ptype == PageType.ABOUT else ("CONTACT" if ptype == PageType.CONTACT else "COMPANY")
                candidate_routes[cand_url] = (kind, "CONVENTIONAL_PATH", ptype)

        telemetry["discovered_route_count"] = len(candidate_routes)
        for _, source, _ in candidate_routes.values():
            if source in telemetry["discovered_routes_by_source"]:
                telemetry["discovered_routes_by_source"][source] += 1
            else:
                telemetry["discovered_routes_by_source"][source] = 1

        # 8. Secondary Route Acquisition, Soft-404 & Duplicate Filtering
        hp_clean_content = (hp_doc.content or "").strip()
        acquired_secondaries: List[AcquiredDocument] = []

        for url, (route_kind, source, ptype) in candidate_routes.items():
            if route_kind == "EXCLUDED" or ptype in (PageType.BLOG, PageType.JOB_LISTING):
                telemetry["documents_rejected"] += 1
                telemetry["rejections_by_reason"]["EXCLUDED_ROUTE"] += 1
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

            telemetry["fetches_attempted"] += 1
            doc = self.crawl_manager.fetch_with_fallback(url, ptype)

            if doc.quality not in {DocumentQuality.VALID, DocumentQuality.TOO_SHORT}:
                telemetry["documents_rejected"] += 1
                telemetry["rejections_by_reason"]["FETCH_FAILED"] += 1
                continue

            telemetry["fetches_completed"] += 1

            # Invariant: Discovered route redirecting to an external domain is rejected
            if doc.final_url and get_registrable_domain(doc.final_url) != input_reg:
                telemetry["documents_rejected"] += 1
                telemetry["rejections_by_reason"]["EXTERNAL_REDIRECT"] += 1
                continue

            # Invariant: Discovered route redirecting back to homepage is not independent
            if doc.final_url and (
                doc.final_url.rstrip("/") == canonical_origin.rstrip("/")
                or doc.final_url.rstrip("/") == website_url.rstrip("/")
            ):
                telemetry["documents_rejected"] += 1
                telemetry["rejections_by_reason"]["HOMEPAGE_REDIRECT"] += 1
                continue

            doc_title = (doc.title or "").strip()
            doc_content = (doc.content or "")
            doc_scan_text = doc_content if len(doc_content) <= 12000 else (doc_content[:6000] + " " + doc_content[-6000:])
            doc_sample = (doc_title + ". " + doc_scan_text).lower()

            # Invariant: Catch-all SPA duplicate content check
            if hp_clean_content and len(hp_clean_content) > 30 and doc_content.strip() == hp_clean_content:
                telemetry["documents_rejected"] += 1
                telemetry["rejections_by_reason"]["DUPLICATE_CONTENT"] += 1
                continue

            # Invariant: Soft-404 error page check
            soft_404_markers = ["404 not found", "page not found", "page cannot be found", "error 404", "does not exist", "page does not exist"]
            if any(marker in doc_sample for marker in soft_404_markers) and len(doc_content.split()) < 50:
                telemetry["documents_rejected"] += 1
                telemetry["rejections_by_reason"]["SOFT_404"] += 1
                continue

            acquired_secondaries.append(AcquiredDocument(
                doc=doc,
                route_kind=route_kind,
                source=source,
                strength=strength,
            ))
            telemetry["documents_accepted"] += 1

        telemetry["acquired_secondary_count"] = len(acquired_secondaries)
        return AcquiredSiteDocuments(
            homepage_doc=hp_doc,
            secondary_docs=acquired_secondaries,
            telemetry=telemetry,
        )

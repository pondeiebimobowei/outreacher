"""
crawling/link_extractor.py — Extraction and classification of first-party secondary identity candidate routes and structured metadata
"""

import re
import json
from urllib.parse import urlparse, urljoin, parse_qs, urlencode, urlunparse
from typing import List, Dict, Optional, Tuple, Any, Set
from dataclasses import dataclass
from html.parser import HTMLParser


@dataclass(frozen=True)
class SecondaryRouteCandidate:
    url: str
    source: str          # INTERNAL_LINK | JSON_LD
    route_kind: str      # ABOUT | LEGAL | CONTACT | COMPANY | UNKNOWN
    relevance_score: float
    anchor_text: str = ""


# Tracking query parameters to strip during normalization
_TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "ref", "source", "fbclid", "gclid", "_ga", "mc_cid", "mc_eid",
}

# Identity route classification dictionaries
_ABOUT_PATTERNS = [
    r"/about(?:-us)?(?:/.*)?$",
    r"/who-we-are(?:/.*)?$",
    r"/our-story(?:/.*)?$",
    r"/our-company(?:/.*)?$",
    r"/team(?:/.*)?$",
    r"/leadership(?:/.*)?$",
    r"/(?:[a-z]{2}(?:-[a-z]{2})?/)?a-propos(?:/.*)?$",          # French
    r"/(?:[a-z]{2}(?:-[a-z]{2})?/)?ueber-uns(?:/.*)?$",         # German
    r"/(?:[a-z]{2}(?:-[a-z]{2})?/)?uber-uns(?:/.*)?$",          # German
    r"/(?:[a-z]{2}(?:-[a-z]{2})?/)?sobre-nosotros(?:/.*)?$",    # Spanish
    r"/(?:[a-z]{2}(?:-[a-z]{2})?/)?om-oss(?:/.*)?$",            # Swedish/Norwegian/Danish
    r"/(?:[a-z]{2}(?:-[a-z]{2})?/)?om-selskapet(?:/.*)?$",      # Scandinavian
    r"/(?:[a-z]{2}(?:-[a-z]{2})?/)?tietoa-meista(?:/.*)?$",     # Finnish
]

_LEGAL_PATTERNS = [
    r"/impressum(?:/.*)?$",                                     # German statutory impressum
    r"/legal(?:/.*)?$",
    r"/legal-notice(?:/.*)?$",
    r"/mentions-legales(?:/.*)?$",                              # French
    r"/aviso-legal(?:/.*)?$",                                   # Spanish
    r"/juridisk-information(?:/.*)?$",                          # Swedish
    r"/terms(?:-of-service|-and-conditions)?(?:/.*)?$",
    r"/conditions-generales(?:/.*)?$",                          # French
    r"/privacy(?:-policy)?(?:/.*)?$",
    r"/datenschutz(?:/.*)?$",                                   # German
    r"/politica-de-privacidad(?:/.*)?$",                        # Spanish
]

_COMPANY_PATTERNS = [
    r"/company(?:/about)?(?:/.*)?$",
    r"/corporate(?:/.*)?$",
    r"/organisation(?:/.*)?$",
    r"/organization(?:/.*)?$",
]

_CONTACT_PATTERNS = [
    r"/contact(?:-us)?(?:/.*)?$",
    r"/contactez-nous(?:/.*)?$",                                # French
    r"/kontakt(?:/.*)?$",                                       # German/Scandinavian
    r"/contacto(?:/.*)?$",                                      # Spanish
    r"/get-in-touch(?:/.*)?$",
    r"/ota-yhteytta(?:/.*)?$",                                  # Finnish
]

_EXCLUDED_PATTERNS = [
    r"/blog(?:/.*)?$",
    r"/news(?:/.*)?$",
    r"/articles(?:/.*)?$",
    r"/press(?:/.*)?$",
    r"/pricing(?:/.*)?$",
    r"/plans(?:/.*)?$",
    r"/careers(?:/.*)?$",
    r"/jobs(?:/.*)?$",
    r"/work-with-us(?:/.*)?$",
    r"/docs(?:/.*)?$",
    r"/documentation(?:/.*)?$",
    r"/api(?:/.*)?$",
    r"/developers(?:/.*)?$",
    r"/login(?:/.*)?$",
    r"/signin(?:/.*)?$",
    r"/signup(?:/.*)?$",
    r"/register(?:/.*)?$",
    r"/auth(?:/.*)?$",
    r"/app(?:/.*)?$",
    r"/dashboard(?:/.*)?$",
    r"/cart(?:/.*)?$",
    r"/checkout(?:/.*)?$",
    r"/shop(?:/.*)?$",
    r"/products?(?:/.*)?$",
    r"/features?(?:/.*)?$",
    r"/downloads?(?:/.*)?$",
    r"/status(?:/.*)?$",
    r"/help(?:/.*)?$",
    r"/support(?:/.*)?$",
]


def classify_route_kind(path_or_url: str, anchor_text: str = "") -> Tuple[str, float]:
    """
    Classifies a path or URL into an identity route kind and returns (route_kind, relevance_score).
    
    Relevance Score Scale:
      1.00 — Direct ABOUT routes
      0.95 — Statutory / LEGAL / IMPRESSUM routes
      0.85 — General COMPANY routes
      0.80 — Direct CONTACT routes
      0.00 — Excluded or non-identity routes (blog, pricing, careers, docs, login, etc.)
    """
    parsed = urlparse(path_or_url)
    path = parsed.path.lower().rstrip("/")
    if not path:
        path = "/"

    anchor = anchor_text.lower().strip()

    # 1. Check exclusions first
    for pat in _EXCLUDED_PATTERNS:
        if re.search(pat, path):
            return "EXCLUDED", 0.0

    # 2. Check ABOUT routes (Path or strong anchor)
    for pat in _ABOUT_PATTERNS:
        if re.search(pat, path):
            return "ABOUT", 1.00
    if any(k in anchor for k in ["about us", "about the company", "à propos", "über uns", "uber uns", "sobre nosotros", "om oss"]):
        return "ABOUT", 0.95

    # 3. Check LEGAL / IMPRESSUM routes
    for pat in _LEGAL_PATTERNS:
        if re.search(pat, path):
            return "LEGAL", 0.95
    if any(k in anchor for k in ["impressum", "legal notice", "mentions légales", "aviso legal", "terms of service", "privacy policy"]):
        return "LEGAL", 0.90

    # 4. Check COMPANY routes
    for pat in _COMPANY_PATTERNS:
        if re.search(pat, path):
            return "COMPANY", 0.85
    if any(k in anchor for k in ["company", "who we are", "our story"]):
        return "COMPANY", 0.80

    # 5. Check CONTACT routes
    for pat in _CONTACT_PATTERNS:
        if re.search(pat, path):
            return "CONTACT", 0.80
    if any(k in anchor for k in ["contact us", "contactez-nous", "kontakt", "contacto", "get in touch"]):
        return "CONTACT", 0.75

    return "UNKNOWN", 0.0


def normalize_internal_url(raw_url: str, base_url: str) -> Optional[str]:
    """
    Normalizes a link relative to base_url, stripping fragments, tracking parameters,
    and enforcing same-origin constraints.
    """
    if not raw_url:
        return None

    raw_url = raw_url.strip()
    if raw_url.startswith(("mailto:", "tel:", "javascript:", "data:", "sms:", "#")):
        return None

    joined = urljoin(base_url, raw_url)
    parsed_base = urlparse(base_url)
    parsed = urlparse(joined)

    if parsed.scheme not in ("http", "https"):
        return None

    # Host validation: Must match base host exactly (or be same primary domain)
    base_host = (parsed_base.hostname or "").lower()
    link_host = (parsed.hostname or "").lower()

    if not base_host or not link_host:
        return None

    if base_host != link_host:
        # Strip leading www. if mismatched
        clean_base = base_host.removeprefix("www.")
        clean_link = link_host.removeprefix("www.")
        if clean_base != clean_link:
            return None

    # Clean path: normalize slashes
    clean_path = parsed.path
    while "//" in clean_path:
        clean_path = clean_path.replace("//", "/")
    if clean_path != "/" and clean_path.endswith("/"):
        clean_path = clean_path.rstrip("/")

    # Clean query: strip tracking parameters
    if parsed.query:
        qs = parse_qs(parsed.query)
        filtered_qs = {k: v for k, v in qs.items() if k.lower() not in _TRACKING_PARAMS}
        clean_query = urlencode(filtered_qs, doseq=True) if filtered_qs else ""
    else:
        clean_query = ""

    normalized = urlunparse((
        parsed_base.scheme,
        base_host,
        clean_path,
        "",  # params
        clean_query,
        ""   # fragment
    ))

    # Reject if normalized URL is simply the base homepage root
    base_root = f"{parsed_base.scheme}://{base_host}"
    if normalized.rstrip("/") == base_root:
        return None

    return normalized


class _SimpleHTMLLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: List[Tuple[str, str]] = []  # List of (href, anchor_text)
        self._current_href: Optional[str] = None
        self._current_text: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]):
        if tag.lower() == "a":
            attrs_dict = dict(attrs)
            href = attrs_dict.get("href")
            if href:
                self._current_href = href
                self._current_text = []

    def handle_data(self, data: str):
        if self._current_href is not None:
            self._current_text.append(data)

    def handle_endtag(self, tag: str):
        if tag.lower() == "a" and self._current_href is not None:
            text = " ".join("".join(self._current_text).split())
            self.links.append((self._current_href, text))
            self._current_href = None
            self._current_text = []


def extract_json_ld_organizations(html: str, base_url: str) -> List[Dict[str, Any]]:
    """
    Safely extracts Organization / Corporation schema objects from HTML script tags.
    """
    if not html:
        return []

    org_types = {
        "organization", "corporation", "localbusiness",
        "financialservice", "technologyservice", "educationalorganization",
        "medicalorganization", "ngo",
    }

    results: List[Dict[str, Any]] = []
    matches = re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.IGNORECASE | re.DOTALL)

    for m in matches:
        raw_text = m.strip()
        if not raw_text:
            continue
        try:
            data = json.loads(raw_text)
        except Exception:
            continue

        items = []
        if isinstance(data, dict):
            if "@graph" in data and isinstance(data["@graph"], list):
                items.extend(data["@graph"])
            else:
                items.append(data)
        elif isinstance(data, list):
            items.extend(data)

        for item in items:
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("@type", "")).lower()
            if any(t == item_type or item_type.endswith(t) for t in org_types):
                name = str(item.get("name", "")).strip() or None
                legal_name = str(item.get("legalName", "")).strip() or None
                url = str(item.get("url", "")).strip() or None
                
                same_as_raw = item.get("sameAs", [])
                same_as_list: List[str] = []
                if isinstance(same_as_raw, str):
                    same_as_list = [same_as_raw.strip()]
                elif isinstance(same_as_raw, list):
                    same_as_list = [str(s).strip() for s in same_as_raw if s]

                results.append({
                    "name": name,
                    "legalName": legal_name,
                    "url": url,
                    "sameAs": same_as_list,
                })

    return results


def extract_identity_candidates(html: str, base_url: str) -> List[SecondaryRouteCandidate]:
    """
    Extracts, normalizes, and ranks likely first-party secondary identity verification routes
    from raw homepage HTML and JSON-LD metadata.
    """
    if not html or not base_url:
        return []

    candidates_by_url: Dict[str, SecondaryRouteCandidate] = {}

    # 1. Parse HTML Links
    parser = _SimpleHTMLLinkParser()
    try:
        parser.feed(html)
    except Exception:
        pass

    for href, text in parser.links:
        norm_url = normalize_internal_url(href, base_url)
        if not norm_url:
            continue

        kind, score = classify_route_kind(norm_url, text)
        if score <= 0.0 or kind == "EXCLUDED":
            continue

        existing = candidates_by_url.get(norm_url)
        if existing is None or score > existing.relevance_score:
            candidates_by_url[norm_url] = SecondaryRouteCandidate(
                url=norm_url,
                source="INTERNAL_LINK",
                route_kind=kind,
                relevance_score=score,
                anchor_text=text,
            )

    # 2. Parse JSON-LD metadata
    json_ld_orgs = extract_json_ld_organizations(html, base_url)
    for org in json_ld_orgs:
        # Check org url and sameAs for same-origin identity pages
        urls_to_check = []
        if org.get("url"):
            urls_to_check.append(org["url"])
        urls_to_check.extend(org.get("sameAs", []))

        for u in urls_to_check:
            norm_url = normalize_internal_url(u, base_url)
            if not norm_url:
                continue
            kind, score = classify_route_kind(norm_url, "JSON-LD Organization")
            if score <= 0.0 or kind == "EXCLUDED":
                # Default JSON-LD candidate to COMPANY if path is not excluded
                kind, score = "COMPANY", 0.85

            existing = candidates_by_url.get(norm_url)
            if existing is None or score > existing.relevance_score:
                candidates_by_url[norm_url] = SecondaryRouteCandidate(
                    url=norm_url,
                    source="JSON_LD",
                    route_kind=kind,
                    relevance_score=score,
                    anchor_text="JSON-LD Organization",
                )

    # 3. Sort candidates by relevance score descending, then by shortest URL length
    ranked = sorted(
        candidates_by_url.values(),
        key=lambda c: (-c.relevance_score, len(c.url), c.url),
    )
    return ranked

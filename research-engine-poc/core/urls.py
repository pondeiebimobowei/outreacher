import re
from typing import Set
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

# Marketing and analytics tracking parameters to strip
_TRACKING_PARAMS: Set[str] = {
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'ref', 'ref_src', 'ref_url', 'source', 'srsltid', 'fbclid', 'gclid',
    'gclsrc', 'dclid', 'zanpid', 'msclkid', 'mc_cid', 'mc_eid',
}

def normalize_domain(domain_or_url: str) -> str:
    """
    Normalizes a domain or URL to its canonical hostname:
      - Extracts hostname if a full URL or path is provided.
      - Lowercases characters.
      - Strips port numbers if present.
      - Strips leading 'www.' prefix.
      - Strips leading/trailing dots and slashes.
    """
    if not domain_or_url or not isinstance(domain_or_url, str):
        return ""
    raw = domain_or_url.strip()
    if not raw:
        return ""
    if "://" not in raw:
        raw = f"http://{raw}"
    try:
        parsed = urlparse(raw)
        hostname = parsed.hostname or parsed.netloc.split(":")[0]
        if not hostname:
            return ""
        host = hostname.lower()
        if host.startswith("www."):
            host = host[4:]
        return host.strip(".")
    except Exception:
        return ""

def canonicalize_url(url: str) -> str:
    """
    Normalizes a URL to prevent duplicate crawls of identical pages:
      - Validates that the URL is an absolute http/https URL (returns "" on failure).
      - Lowercases scheme and netloc.
      - Strips 'www.' prefix.
      - Normalizes path (collapses duplicate slashes, removes trailing slash except root '/').
      - Strips tracking & marketing query parameters (utm_*, ref, srsltid, etc.).
      - Sorts remaining substantive query parameters deterministically.
      - Strips URL fragments (#hash).
    """
    if not url or not isinstance(url, str):
        return ""
        
    try:
        raw = url.strip()
        parsed = urlparse(raw)
        
        # Must be an absolute http or https URL with a valid host
        scheme = parsed.scheme.lower()
        if scheme not in ("http", "https"):
            return ""
            
        netloc = normalize_domain(parsed.netloc or parsed.path)
        if not netloc:
            return ""
            
        # Normalize path
        path = parsed.path
        path = re.sub(r'/+', '/', path)
        if path in ("", "/"):
            path = "/"
        else:
            path = path.rstrip("/")
            
        # Filter and sort query parameters
        filtered_query = ""
        if parsed.query:
            query_pairs = parse_qsl(parsed.query, keep_blank_values=False)
            clean_pairs = [
                (k, v) for k, v in query_pairs
                if k.lower() not in _TRACKING_PARAMS and not k.lower().startswith('utm_')
            ]
            if clean_pairs:
                clean_pairs.sort(key=lambda x: (x[0], x[1]))
                filtered_query = urlencode(clean_pairs)
                
        return urlunparse((scheme, netloc, path, "", filtered_query, ""))
    except Exception:
        return ""

def deduplicate_documents_by_canonical_url(documents: list) -> list:
    """
    Deduplicates a list of CrawledDocument instances by canonical URL:
      - Normalizes doc.final_url or doc.url using canonicalize_url.
      - Preserves first-encountered document order.
      - Ensures downstream packages, evidence extractors, and ClaimGraphs operate on an identical, canonical document universe.
    """
    seen_keys: Set[str] = set()
    deduped = []
    for doc in documents:
        raw_url = getattr(doc, "final_url", None) or getattr(doc, "url", None) or ""
        canon_url = canonicalize_url(raw_url)
        key = canon_url if canon_url else raw_url
        if key and key not in seen_keys:
            seen_keys.add(key)
            deduped.append(doc)
        elif not key:
            deduped.append(doc)
    return deduped

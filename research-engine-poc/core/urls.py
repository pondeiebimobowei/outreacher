import re
from typing import Set
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

# Marketing and analytics tracking parameters to strip
_TRACKING_PARAMS: Set[str] = {
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'ref', 'ref_src', 'ref_url', 'source', 'srsltid', 'fbclid', 'gclid',
    'gclsrc', 'dclid', 'zanpid', 'msclkid', 'mc_cid', 'mc_eid',
}

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
            
        netloc = parsed.netloc.lower()
        if not netloc:
            return ""
            
        if netloc.startswith("www."):
            netloc = netloc[4:]
            
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

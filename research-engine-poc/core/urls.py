import re
from typing import Set, Any, List, TYPE_CHECKING
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

if TYPE_CHECKING:
    from core.models import CrawledDocument, RawResearchPackage

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


# Common multi-part country code second-level domains (ccSLDs)
_MULTI_PART_TLDS = {
    "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "net.uk",
    "com.au", "net.au", "org.au", "edu.au", "gov.au",
    "co.nz", "net.nz", "org.nz", "govt.nz",
    "co.za", "org.za", "net.za", "gov.za",
    "com.ng", "org.ng", "gov.ng", "edu.ng",
    "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
    "com.br", "org.br", "net.br", "gov.br",
    "co.in", "net.in", "org.in", "gen.in", "firm.in",
    "com.sg", "org.sg", "edu.sg", "gov.sg",
    "com.mx", "org.mx", "edu.mx", "gob.mx",
    "com.tr", "org.tr", "edu.tr", "gov.tr",
}

def get_registrable_domain(domain_or_url: str) -> str:
    """
    Extracts the registrable domain (effective top-level domain + 1 label) from a hostname or URL.
    Examples:
      - 'eu.company.com' -> 'company.com'
      - 'company.com' -> 'company.com'
      - 'docs.company.co.uk' -> 'company.co.uk'
      - 'company.example.com' -> 'example.com'
    """
    host = normalize_domain(domain_or_url)
    if not host:
        return ""
    parts = host.split(".")
    if len(parts) <= 1:
        return host
    
    # Check if the last two parts match known multi-part ccTLDs (e.g. 'co.uk')
    if len(parts) >= 3:
        two_part_suffix = f"{parts[-2]}.{parts[-1]}"
        if two_part_suffix in _MULTI_PART_TLDS:
            return f"{parts[-3]}.{two_part_suffix}"
            
    # Default single-part TLD (e.g. 'company.com')
    return f"{parts[-2]}.{parts[-1]}"


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

def deduplicate_documents_by_canonical_url(documents: List["CrawledDocument"]) -> List["CrawledDocument"]:
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

def normalize_research_package(package: "RawResearchPackage") -> "RawResearchPackage":
    """
    Creates a canonical, normalized RawResearchPackage:
      - Deduplicates package.documents by canonical URL.
      - Preserves first-encountered document order.
      - Guarantees all downstream consumers (evidence extractor, claim builders, opportunity gates, DTO exporters)
        operate strictly on the identical canonical document universe.
    """
    if not package or not hasattr(package, "documents"):
        return package
    deduped_docs = deduplicate_documents_by_canonical_url(list(package.documents))
    return package.model_copy(update={"documents": tuple(deduped_docs)})

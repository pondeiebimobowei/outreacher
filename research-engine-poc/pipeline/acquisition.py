import re
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
from rich.console import Console

from core.models import (
    RawResearchPackage, PageType, IdentityConfidence,
    IdentityContext, CrawledDocument, DocumentQuality,
)
from identity.resolver import IdentityResolver
from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from crawling.manager import CrawlManager
from pipeline.discovery import URLClassifier, DomainScopeFilter

console = Console()

# Query parameters to strip during URL canonicalization
_TRACKING_PARAMS = {
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'ref', 'ref_src', 'ref_url', 'source', 'srsltid', 'fbclid', 'gclid',
    'gclsrc', 'dclid', 'zanpid', 'msclkid', 'mc_cid', 'mc_eid',
}

# Priority ordering for crawled documents
_PAGE_PRIORITY: Dict[PageType, int] = {
    PageType.ABOUT: 1,
    PageType.PRODUCT: 2,
    PageType.CAREERS_INDEX: 3,
    PageType.JOB_LISTING: 4,
    PageType.BLOG: 5,
    PageType.CASE_STUDY: 6,
    PageType.CONTACT: 7,
    PageType.OTHER: 8,
}


def canonicalize_url(url: str) -> str:
    """
    Normalizes a URL to prevent duplicate crawls of identical pages:
      - Lowercases scheme and netloc
      - Strips 'www.' prefix
      - Normalizes path (collapses duplicate slashes, removes trailing slash except root '/')
      - Strips tracking & marketing query parameters (utm_*, ref, srsltid, etc.)
      - Strips URL fragments (#hash)
    """
    if not url:
        return ""
    try:
        parsed = urlparse(url.strip())
        scheme = parsed.scheme.lower() or "https"
        netloc = parsed.netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
            
        # Normalize path
        path = parsed.path
        path = re.sub(r'/+', '/', path)
        if path in ("", "/"):
            path = "/"
        else:
            path = path.rstrip("/")
            
        # Filter tracking query parameters
        filtered_query = ""
        if parsed.query:
            query_pairs = parse_qsl(parsed.query, keep_blank_values=False)
            clean_pairs = [
                (k, v) for k, v in query_pairs
                if k.lower() not in _TRACKING_PARAMS and not k.lower().startswith('utm_')
            ]
            if clean_pairs:
                clean_pairs.sort(key=lambda x: x[0])
                filtered_query = urlencode(clean_pairs)
                
        return urlunparse((scheme, netloc, path, "", filtered_query, ""))
    except Exception:
        return url.strip()


class AcquisitionRunner:
    """
    Orchestrates identity resolution and scoped discovery crawling.
    
    Workflow:
      1. Resolves and verifies primary company identity (aborts if not CONFIDENT).
      2. Executes scoped discovery queries against the primary domain and known ATS platforms.
      3. Normalizes, deduplicates, filters domain scope, and classifies candidate URLs.
      4. Fetches priority-ordered pages within the crawl budget and assesses document quality.
    """
    def __init__(
        self,
        resolver: IdentityResolver,
        discovery_search_provider: ISearchProvider,
        crawl_manager: CrawlManager,
        max_crawl_budget: int = 8,
    ):
        self.resolver = resolver
        self.discovery_search_provider = discovery_search_provider
        self.crawl_manager = crawl_manager
        self.max_crawl_budget = max_crawl_budget

    def run(
        self,
        company_name: str,
        context: Optional[IdentityContext] = None,
    ) -> RawResearchPackage:
        console.print(f"[bold blue]Step 1: Identity Resolution & Verification[/bold blue]")
        identity = self.resolver.resolve(company_name, context=context)
        
        color = "green" if identity.confidence == IdentityConfidence.CONFIDENT else "yellow" if identity.confidence == IdentityConfidence.AMBIGUOUS else "red"
        console.print(f"  [{color}]{identity.confidence.value}[/{color}] Domain: {identity.domain} ({identity.reasoning})")
        
        if identity.confidence != IdentityConfidence.CONFIDENT:
            console.print(f"[{color}]Aborting acquisition because identity is not CONFIDENT.[/{color}]")
            return RawResearchPackage(
                identity=identity,
                documents=[],
                discovered_at=datetime.now(timezone.utc),
            )

        console.print(f"\n[bold blue]Step 2: Scoped Discovery Phase[/bold blue]")
        queries = [
            (f'site:{identity.domain} "about" OR "company" OR "mission" OR "our story"', 2),
            (f'site:{identity.domain} "careers" OR "jobs" OR "open positions"', 3),
            (f'site:{identity.domain} "product" OR "solutions" OR "features" OR "platform"', 2),
            (f'"{company_name}" site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:workable.com', 2),
        ]
        
        # Track discovery provenance for each URL: {canonical_url: (source_query, rank)}
        provenance: Dict[str, Tuple[Optional[str], Optional[int]]] = {}
        
        # Seed with canonical homepage
        homepage_canonical = canonicalize_url(identity.website_url)
        provenance[homepage_canonical] = ("homepage_seed", 0)
        
        for query_str, num in queries:
            try:
                raw_results = self.discovery_search_provider.search(query_str, num_results=num)
                clean_results = SearchResultSanitizer.sanitize(raw_results)
                for rank, res in enumerate(clean_results, start=1):
                    can_url = canonicalize_url(res.url)
                    if can_url and can_url not in provenance:
                        provenance[can_url] = (query_str, rank)
            except Exception as e:
                console.print(f"    [!] Search query failed ('{query_str[:40]}...'): {str(e)}")
            
        console.print(f"\n[bold blue]Step 3: URL Classification & Scoping[/bold blue]")
        classified_urls = []
        for url, (src_query, rank) in provenance.items():
            if not DomainScopeFilter.is_allowed(url, identity.domain, company_name=company_name):
                console.print(f"  [red]REJECTED (Out of scope)[/red]: {url}")
                continue
                
            ptype = URLClassifier.classify(url)
            classified_urls.append((ptype, url, src_query, rank))
            
        # Sort by priority order, then by search rank
        classified_urls.sort(key=lambda x: (_PAGE_PRIORITY.get(x[0], 10), x[3] or 99))
        
        # Enforce crawl budget
        budgeted_urls = classified_urls[:self.max_crawl_budget]
        
        for ptype, url, _, _ in budgeted_urls:
            console.print(f"  [cyan]{ptype.name}[/cyan]: {url}")

        console.print(f"\n[bold blue]Step 4: Fetching, Fallbacks & Quality Evaluation[/bold blue]")
        documents: List[CrawledDocument] = []
        for ptype, url, src_query, rank in budgeted_urls:
            console.print(f"  Fetching {url}...")
            doc = self.crawl_manager.fetch_with_fallback(url, page_type=ptype)
            doc.source_query = src_query
            doc.search_rank = rank
            
            color = "green" if doc.quality == DocumentQuality.VALID else "yellow" if doc.quality == DocumentQuality.TOO_SHORT else "red"
            console.print(f"    [{color}]{doc.quality.name}[/{color}]: {doc.word_count} words (strategy={doc.fetch_strategy})")
            documents.append(doc)
            
        return RawResearchPackage(
            identity=identity,
            documents=documents,
            discovered_at=datetime.now(timezone.utc),
        )

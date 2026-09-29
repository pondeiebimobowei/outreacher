import re
from typing import List, Optional, Dict
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
from rich.console import Console

from core.models import (
    RawResearchPackage, PageType, IdentityConfidence,
    IdentityContext, CrawledDocument, DocumentQuality,
)
from identity.resolver import IdentityResolver
from search.base import ISearchProvider
from crawling.manager import CrawlManager
from discovery.discoverer import ScopedDiscoverer
from discovery.ranking import DiversityBudgetRanker
from discovery.classifier import TwoStageClassifier

console = Console()

# Query parameters to strip during URL canonicalization
_TRACKING_PARAMS = {
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'ref', 'ref_src', 'ref_url', 'source', 'srsltid', 'fbclid', 'gclid',
    'gclsrc', 'dclid', 'zanpid', 'msclkid', 'mc_cid', 'mc_eid',
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
    Orchestrates company research acquisition:
      1. Resolves and verifies primary company identity (aborts if not CONFIDENT).
      2. Executes purposeful, structured discovery queries across primary domain and ATS targets.
      3. Allocates a diversity-aware crawl budget across research categories.
      4. Fetches priority pages with fallback and executes Stage 2 content classification.
    """
    def __init__(
        self,
        resolver: IdentityResolver,
        discovery_search_provider: ISearchProvider,
        crawl_manager: CrawlManager,
        max_crawl_budget: int = 8,
    ):
        self.resolver = resolver
        self.discoverer = ScopedDiscoverer(discovery_search_provider)
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
        all_discovered = self.discoverer.discover(
            domain=identity.domain,
            company_name=company_name,
            homepage_url=identity.website_url,
        )
        console.print(f"  Discovered {len(all_discovered)} in-scope URLs across research categories.")

        console.print(f"\n[bold blue]Step 3: Diversity Budget Allocation[/bold blue]")
        budgeted_items = DiversityBudgetRanker.select_budgeted_urls(
            all_discovered,
            max_budget=self.max_crawl_budget,
        )
        
        for item in budgeted_items:
            console.print(f"  [cyan]{item.provisional_page_type.name}[/cyan] (purpose={item.purpose.name}, rank={item.rank}): {item.url}")

        console.print(f"\n[bold blue]Step 4: Fetching, Fallbacks & Quality Evaluation[/bold blue]")
        documents: List[CrawledDocument] = []
        for item in budgeted_items:
            console.print(f"  Fetching {item.url}...")
            doc = self.crawl_manager.fetch_with_fallback(item.url, page_type=item.provisional_page_type)
            
            # Stage 2: Refine PageType based on crawled content
            final_type = TwoStageClassifier.stage2_refine_content(
                provisional=item.provisional_page_type,
                title=doc.title,
                content=doc.content,
                url=doc.url,
            )
            
            doc.page_type = final_type
            doc.provisional_page_type = item.provisional_page_type
            doc.purpose = item.purpose
            doc.source_query = item.query
            doc.search_rank = item.rank
            
            color = "green" if doc.quality == DocumentQuality.VALID else "yellow" if doc.quality == DocumentQuality.TOO_SHORT else "red"
            type_change = f" -> [magenta]{final_type.name}[/magenta]" if final_type != item.provisional_page_type else ""
            console.print(f"    [{color}]{doc.quality.name}[/{color}]: {doc.word_count} words (strategy={doc.fetch_strategy}){type_change}")
            documents.append(doc)
            
        return RawResearchPackage(
            identity=identity,
            documents=documents,
            discovered_at=datetime.now(timezone.utc),
        )

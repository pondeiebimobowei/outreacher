from typing import List
from datetime import datetime, timezone
from rich.console import Console
from core.models import RawResearchPackage, PageType, IdentityConfidence
from identity.resolver import IdentityResolver
from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from crawling.manager import CrawlManager
from pipeline.discovery import URLClassifier, DomainScopeFilter

console = Console()

class AcquisitionRunner:
    def __init__(self, resolver: IdentityResolver, discovery_search_provider: ISearchProvider, crawl_manager: CrawlManager):
        self.resolver = resolver
        self.discovery_search_provider = discovery_search_provider
        self.crawl_manager = crawl_manager
        
    def run(self, company_name: str) -> RawResearchPackage:
        console.print(f"[bold blue]Step 1: Identity Resolution & Verification[/bold blue]")
        identity = self.resolver.resolve(company_name)
        
        color = "green" if identity.confidence == IdentityConfidence.CONFIDENT else "yellow" if identity.confidence == IdentityConfidence.AMBIGUOUS else "red"
        console.print(f"  [{color}]{identity.confidence.value}[/{color}] Domain: {identity.domain} ({identity.reasoning})")
        
        if identity.confidence != IdentityConfidence.CONFIDENT:
            console.print(f"[{color}]Aborting acquisition because identity is not CONFIDENT.[/{color}]")
            return RawResearchPackage(identity=identity, documents=[], discovered_at=datetime.now(timezone.utc))

        console.print(f"\n[bold blue]Step 2: Scoped Discovery Phase[/bold blue]")
        queries = [
            (f'site:{identity.domain} "about" OR "company" OR "mission"', 2),
            (f'site:{identity.domain} "careers" OR "jobs"', 3),
            (f'site:{identity.domain} "product" OR "solutions"', 2)
        ]
        
        discovered_urls = [identity.website_url]
        for query, num in queries:
            try:
                raw_results = self.discovery_search_provider.search(query, num_results=num)
                clean_results = SearchResultSanitizer.sanitize(raw_results)
                discovered_urls.extend([r.url for r in clean_results])
            except Exception as e:
                console.print(f"    [!] Search query failed: {str(e)}")
            
        discovered_urls = list(dict.fromkeys(discovered_urls))
        
        console.print(f"\n[bold blue]Step 3: URL Classification & Scoping[/bold blue]")
        classified_urls = []
        for url in discovered_urls:
            if not DomainScopeFilter.is_allowed(url, identity.domain):
                console.print(f"  [red]REJECTED (Out of scope)[/red]: {url}")
                continue
                
            ptype = URLClassifier.classify(url)
            classified_urls.append((ptype, url))
            
        priority_order = {
            PageType.ABOUT: 1,
            PageType.PRODUCT: 2,
            PageType.CAREERS_INDEX: 3,
            PageType.JOB_LISTING: 4,
            PageType.BLOG: 5,
            PageType.CASE_STUDY: 6,
            PageType.CONTACT: 7,
            PageType.OTHER: 8
        }
        
        classified_urls.sort(key=lambda x: priority_order.get(x[0], 10))
        
        for ptype, url in classified_urls:
            console.print(f"  [cyan]{ptype.name}[/cyan]: {url}")

        console.print(f"\n[bold blue]Step 4: Fetching, Fallbacks & Quality Evaluation[/bold blue]")
        documents = []
        for ptype, url in classified_urls:
            console.print(f"  Fetching {url}...")
            doc = self.crawl_manager.fetch_with_fallback(url, page_type=ptype)
            
            color = "green" if doc.quality.name == "VALID" else "yellow" if doc.quality.name == "TOO_SHORT" else "red"
            console.print(f"    [{color}]{doc.quality.name}[/{color}]: {doc.word_count} words")
            documents.append(doc)
            
        return RawResearchPackage(
            identity=identity,
            documents=documents,
            discovered_at=datetime.now(timezone.utc)
        )

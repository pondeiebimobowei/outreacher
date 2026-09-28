from typing import List
from datetime import datetime, timezone
from rich.console import Console
from core.models import RawResearchPackage, PageType, IdentityConfidence
from identity.resolver import IdentityResolver
from search.base import ISearchProvider
from crawling.base import ICrawlerProvider
from pipeline.discovery import URLClassifier

console = Console()

class AcquisitionRunner:
    def __init__(self, resolver: IdentityResolver, search_provider: ISearchProvider, crawler_provider: ICrawlerProvider):
        self.resolver = resolver
        self.search_provider = search_provider
        self.crawler_provider = crawler_provider
        
    def run(self, company_name: str) -> RawResearchPackage:
        console.print(f"[bold blue]Step 1: Identity Resolution for '{company_name}'[/bold blue]")
        identity = self.resolver.resolve(company_name)
        
        color = "green" if identity.confidence == IdentityConfidence.CONFIDENT else "yellow" if identity.confidence == IdentityConfidence.AMBIGUOUS else "red"
        console.print(f"  [{color}]{identity.confidence.value}[/{color}] Domain: {identity.domain} ({identity.reasoning})")
        
        if identity.confidence == IdentityConfidence.UNRESOLVED:
            console.print("[red]Aborting acquisition due to UNRESOLVED identity.[/red]")
            return RawResearchPackage(identity=identity, documents=[], discovered_at=datetime.now(timezone.utc))

        console.print(f"\n[bold blue]Step 2: Adaptive Discovery Phase[/bold blue]")
        queries = [
            (f"site:{identity.domain} about company OR mission", 2),
            (f"site:{identity.domain} careers OR jobs", 3),
            (f"site:{identity.domain} product OR solutions", 2)
        ]
        
        discovered_urls = [identity.website_url]
        for query, num in queries:
            results = self.search_provider.search(query, num_results=num)
            discovered_urls.extend([r.url for r in results])
            
        discovered_urls = list(dict.fromkeys(discovered_urls))
        
        console.print(f"\n[bold blue]Step 3: URL Classification & Prioritization[/bold blue]")
        classified_urls = []
        for url in discovered_urls:
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

        console.print(f"\n[bold blue]Step 4: Fetching & Metadata Enrichment[/bold blue]")
        documents = []
        for ptype, url in classified_urls:
            console.print(f"  Fetching {url}...")
            doc = self.crawler_provider.fetch(url, page_type=ptype)
            
            if doc.content:
                status = f"[green]✓[/green] Success"
                meta = f"({doc.word_count} words, Title: '{doc.title}')"
                console.print(f"    {status}: {meta}")
            else:
                console.print(f"    [red]✗[/red] Failed: {doc.error}")
            documents.append(doc)
            
        return RawResearchPackage(
            identity=identity,
            documents=documents,
            discovered_at=datetime.now(timezone.utc)
        )

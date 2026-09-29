from typing import List, Optional
from datetime import datetime, timezone
from rich.console import Console

from core.models import (
    RawResearchPackage, PageType, IdentityConfidence,
    IdentityContext, CrawledDocument, DocumentQuality,
)
from core.urls import canonicalize_url
from identity.resolver import IdentityResolver
from crawling.manager import CrawlManager
from discovery.discoverer import ScopedDiscoverer
from discovery.ranking import DiversityBudgetRanker
from discovery.classifier import TwoStageClassifier

console = Console()

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
        discoverer: ScopedDiscoverer,
        ranker: DiversityBudgetRanker,
        crawl_manager: CrawlManager,
        max_crawl_budget: int = 8,
    ):
        self.resolver = resolver
        self.discoverer = discoverer
        self.ranker = ranker
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
        budgeted_items = self.ranker.select_budgeted_urls(
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
            )
            
            refined_doc = doc.model_copy(update={
                "page_type": final_type,
                "provisional_page_type": item.provisional_page_type,
                "purpose": item.purpose,
                "source_query": item.query,
                "search_rank": item.rank,
            })
            
            color = "green" if refined_doc.quality == DocumentQuality.VALID else "yellow" if refined_doc.quality == DocumentQuality.TOO_SHORT else "red"
            type_change = f" -> [magenta]{final_type.name}[/magenta]" if final_type != item.provisional_page_type else ""
            console.print(f"    [{color}]{refined_doc.quality.name}[/{color}]: {refined_doc.word_count} words (strategy={refined_doc.fetch_strategy}){type_change}")
            documents.append(refined_doc)
            
        return RawResearchPackage(
            identity=identity,
            documents=documents,
            discovered_at=datetime.now(timezone.utc),
        )

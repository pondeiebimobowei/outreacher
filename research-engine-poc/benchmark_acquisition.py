import sys
import os
import time
from rich.console import Console
from rich.table import Table

from search.duckduckgo import DuckDuckGoSearchProvider
from search.serper import SerperSearchProvider
from crawling.trafilatura_crawler import TrafilaturaCrawlerProvider
from crawling.playwright_crawler import PlaywrightCrawlerProvider
from crawling.manager import CrawlManager
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from discovery.discoverer import ScopedDiscoverer
from discovery.ranking import DiversityBudgetRanker
from pipeline.acquisition import AcquisitionRunner
from core.models import DocumentQuality, IdentityConfidence, IdentityContext

console = Console()

ACQUISITION_CASES = [
    {
        "company": "Linear",
        "context": IdentityContext(
            industry="software",
            description="product development software",
            company_type="software_product",
        ),
    },
    {"company": "Stripe"},
    {"company": "Vercel"},
    {"company": "Moniepoint"},
]

def run_benchmark(provider_name: str, verbose: bool = False):
    console.print(f"\n[bold green]Acquisition Pipeline Benchmark — {provider_name}[/bold green]\n")
    
    if provider_name == "Serper":
        identity_search = SerperSearchProvider()
        discovery_search = SerperSearchProvider()
    else:
        identity_search = DuckDuckGoSearchProvider()
        discovery_search = DuckDuckGoSearchProvider()
        
    static_crawler = TrafilaturaCrawlerProvider()
    browser_crawler = PlaywrightCrawlerProvider()
    crawl_manager = CrawlManager(static_crawler, browser_crawler)
    
    verifier = WebsiteVerifier(crawl_manager, discovery_search)
    resolver = IdentityResolver(identity_search, verifier)
    discoverer = ScopedDiscoverer(discovery_search)
    ranker = DiversityBudgetRanker()
    runner = AcquisitionRunner(resolver, discoverer, ranker, crawl_manager, max_crawl_budget=6)
    
    summary_table = Table(title=f"Acquisition Summary ({provider_name})", expand=True)
    summary_table.add_column("Company", style="cyan", no_wrap=True)
    summary_table.add_column("Identity", style="bold")
    summary_table.add_column("Domain", style="magenta")
    summary_table.add_column("Crawled", justify="right", style="blue")
    summary_table.add_column("Valid", justify="right", style="green")
    summary_table.add_column("Short", justify="right", style="yellow")
    summary_table.add_column("Errors", justify="right", style="red")
    summary_table.add_column("Fallbacks", justify="right", style="dim")
    summary_table.add_column("Latency", justify="right")
    
    for case in ACQUISITION_CASES:
        company = case["company"]
        context = case.get("context")
        start_time = time.time()
        
        try:
            package = runner.run(company, context=context)
            latency = f"{time.time() - start_time:.1f}s"
            
            docs = package.documents
            valid_count = sum(1 for d in docs if d.quality == DocumentQuality.VALID)
            short_count = sum(1 for d in docs if d.quality == DocumentQuality.TOO_SHORT)
            err_count = sum(1 for d in docs if d.quality in [DocumentQuality.BLOCKED, DocumentQuality.HTTP_ERROR, DocumentQuality.FETCH_FAILED, DocumentQuality.EXTRACTION_FAILED])
            fallback_count = sum(1 for d in docs if d.fetch_strategy == "BROWSER")
            
            id_col = "green" if package.identity.confidence == IdentityConfidence.CONFIDENT else "yellow" if package.identity.confidence == IdentityConfidence.AMBIGUOUS else "red"
            id_label = f"[{id_col}]{package.identity.confidence.value}[/{id_col}]"
            
            summary_table.add_row(
                company,
                id_label,
                package.identity.domain or "N/A",
                str(len(docs)),
                str(valid_count),
                str(short_count),
                str(err_count),
                str(fallback_count),
                latency,
            )
            
            if verbose:
                console.print(f"[dim]Identity reasoning for {company}: {package.identity.reasoning}[/dim]")
                if docs:
                    detail_table = Table(title=f"Documents for {company} ({package.identity.domain})", expand=True)
                    detail_table.add_column("PageType", style="cyan")
                    detail_table.add_column("Quality", style="green")
                    detail_table.add_column("Strategy", style="dim")
                    detail_table.add_column("Words", justify="right")
                    detail_table.add_column("URL", style="dim", ratio=2)
                    
                    for d in docs:
                        q_col = "green" if d.quality == DocumentQuality.VALID else "yellow" if d.quality == DocumentQuality.TOO_SHORT else "red"
                        detail_table.add_row(
                            d.page_type.value,
                            f"[{q_col}]{d.quality.value}[/{q_col}]",
                            d.fetch_strategy,
                            str(d.word_count),
                            d.url[:70],
                        )
                    console.print(detail_table)
                    console.print()
                
        except Exception as e:
            summary_table.add_row(company, "[red]ERROR[/red]", "N/A", "0", "0", "0", "1", "0", f"{time.time() - start_time:.1f}s")
            console.print(f"[red]Error processing {company}: {e}[/red]")
            
    console.print(summary_table)


def main():
    if "--serper" in sys.argv and not os.environ.get("SERPER_API_KEY"):
        console.print("[red]Error: --serper flag used but SERPER_API_KEY is not set.[/red]")
        sys.exit(1)
        
    provider = "Serper" if "--serper" in sys.argv else "DuckDuckGo"
    verbose = "--verbose" in sys.argv
    run_benchmark(provider, verbose=verbose)


if __name__ == "__main__":
    main()

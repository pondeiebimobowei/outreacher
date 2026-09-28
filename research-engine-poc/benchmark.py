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
from pipeline.acquisition import AcquisitionRunner
from core.models import IdentityConfidence, DocumentQuality

console = Console()

def run_benchmark(provider_name: str, companies: list[str]):
    console.print(f"\n[bold green]Running Benchmark with {provider_name} Search[/bold green]\n")
    
    if provider_name == "Serper":
        search_provider = SerperSearchProvider()
    else:
        search_provider = DuckDuckGoSearchProvider()
        
    static_crawler = TrafilaturaCrawlerProvider()
    browser_crawler = PlaywrightCrawlerProvider()
    crawl_manager = CrawlManager(static_crawler, browser_crawler)
    verifier = WebsiteVerifier(crawl_manager)
    resolver = IdentityResolver(search_provider, verifier)
    runner = AcquisitionRunner(resolver, search_provider, crawl_manager)
    
    table = Table(title=f"Benchmark Results ({provider_name})")
    table.add_column("Company", style="cyan")
    table.add_column("Domain", style="magenta")
    table.add_column("Confidence", style="green")
    table.add_column("Top 3 Cands", style="yellow")
    table.add_column("Latency", justify="right")
    table.add_column("Valid Docs", justify="right")
    
    for company in companies:
        start_time = time.time()
        try:
            package = runner.run(company)
            latency = f"{time.time() - start_time:.1f}s"
            
            domain = package.identity.domain or "N/A"
            conf = package.identity.confidence.name
            
            cands = [f"{c.domain}({c.score})" for c in package.identity.candidates[:3]]
            cands_str = ", ".join(cands) if cands else "None"
            
            valid_docs = sum(1 for d in package.documents if d.quality == DocumentQuality.VALID)
            
            table.add_row(company, domain, conf, cands_str, latency, str(valid_docs))
        except Exception as e:
            table.add_row(company, "ERROR", str(e), "", f"{time.time() - start_time:.1f}s", "0")
            
    console.print(table)

def main():
    if "--serper" in sys.argv and not os.environ.get("SERPER_API_KEY"):
        console.print("[red]Error: --serper flag used but SERPER_API_KEY is not set.[/red]")
        sys.exit(1)
        
    companies = [
        "Linear",
        "Stripe",
        "Vercel",
        "Moniepoint",
        "Kelmond Media Company",
        "Manom Solutions",
        "Outray",
        "Acme Corp"
    ]
    
    provider = "Serper" if "--serper" in sys.argv else "DuckDuckGo"
    run_benchmark(provider, companies)

if __name__ == "__main__":
    main()

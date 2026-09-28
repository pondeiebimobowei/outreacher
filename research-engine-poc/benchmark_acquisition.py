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
from pipeline.discovery import URLClassifier, DomainScopeFilter
from pipeline.acquisition import canonicalize_url
from search.sanitizer import SearchResultSanitizer
from core.models import DocumentQuality, PageType

console = Console()

ACQUISITION_CASES = [
    {"domain": "linear.app"},
    {"domain": "stripe.com"},
    {"domain": "vercel.com"}
]

def run_benchmark(provider_name: str):
    console.print(f"\n[bold green]Running Acquisition Benchmark with {provider_name} Search[/bold green]\n")
    
    if provider_name == "Serper":
        search_provider = SerperSearchProvider()
    else:
        search_provider = DuckDuckGoSearchProvider()
        
    static_crawler = TrafilaturaCrawlerProvider()
    browser_crawler = PlaywrightCrawlerProvider()
    crawl_manager = CrawlManager(static_crawler, browser_crawler)
    
    table = Table(title=f"Acquisition Results ({provider_name})")
    table.add_column("Domain", style="cyan")
    table.add_column("Discovered", justify="right", style="magenta")
    table.add_column("Valid Docs", justify="right", style="green")
    table.add_column("Fallbacks", justify="right", style="yellow")
    table.add_column("Failed Docs", justify="right", style="red")
    table.add_column("Latency", justify="right")
    
    for case in ACQUISITION_CASES:
        domain = case["domain"]
        start_time = time.time()
        
        try:
            # Step 1: Mock discovery
            queries = [
                (f'site:{domain} "about" OR "company" OR "mission"', 2),
                (f'site:{domain} "careers" OR "jobs"', 3),
                (f'site:{domain} "product" OR "solutions"', 2)
            ]
            raw_discovered = [f"https://{domain}"]
            for query, num in queries:
                try:
                    raw_results = search_provider.search(query, num_results=num)
                    clean_results = SearchResultSanitizer.sanitize(raw_results)
                    raw_discovered.extend([r.url for r in clean_results])
                except:
                    pass
                    
            discovered_urls = []
            seen = set()
            for raw in raw_discovered:
                canonical = canonicalize_url(raw)
                if canonical not in seen:
                    seen.add(canonical)
                    discovered_urls.append(canonical)
                    
            classified_urls = []
            for url in discovered_urls:
                if DomainScopeFilter.is_allowed(url, domain):
                    classified_urls.append((URLClassifier.classify(url), url))
                    
            # Step 2: Crawl
            valid_docs = 0
            fallbacks = 0
            failed_docs = 0
            
            for ptype, url in classified_urls:
                doc = crawl_manager.fetch_with_fallback(url, page_type=ptype)
                if doc.quality == DocumentQuality.VALID:
                    valid_docs += 1
                else:
                    failed_docs += 1
                    
                if doc.fetch_strategy == "BROWSER":
                    fallbacks += 1
                    
            latency = f"{time.time() - start_time:.1f}s"
            
            table.add_row(
                domain,
                str(len(classified_urls)),
                str(valid_docs),
                str(fallbacks),
                str(failed_docs),
                latency
            )
        except Exception as e:
            table.add_row(domain, "ERROR", str(e), "", "", f"{time.time() - start_time:.1f}s")
            
    console.print(table)

def main():
    if "--serper" in sys.argv and not os.environ.get("SERPER_API_KEY"):
        console.print("[red]Error: --serper flag used but SERPER_API_KEY is not set.[/red]")
        sys.exit(1)
        
    provider = "Serper" if "--serper" in sys.argv else "DuckDuckGo"
    run_benchmark(provider)

if __name__ == "__main__":
    main()

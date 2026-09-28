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

console = Console()

BENCHMARK_CASES = [
    {"company": "Linear", "expected_domain": "linear.app", "expected": "CONFIDENT"},
    {"company": "Stripe", "expected_domain": "stripe.com", "expected": "CONFIDENT"},
    {"company": "Vercel", "expected_domain": "vercel.com", "expected": "CONFIDENT"},
    {"company": "Moniepoint", "expected_domain": "moniepoint.com", "expected": "CONFIDENT"},
    {"company": "Kelmond Media Company", "expected": "ABSTAIN"},
    {"company": "Manom Solutions", "expected": "ABSTAIN"},
    {"company": "Outray", "expected": "ABSTAIN"},
    {"company": "Acme Corp", "expected": "ABSTAIN"}
]

def run_benchmark(provider_name: str):
    console.print(f"\n[bold green]Running Identity Benchmark with {provider_name} Search[/bold green]\n")
    
    if provider_name == "Serper":
        search_provider = SerperSearchProvider()
    else:
        search_provider = DuckDuckGoSearchProvider()
        
    static_crawler = TrafilaturaCrawlerProvider()
    browser_crawler = PlaywrightCrawlerProvider()
    crawl_manager = CrawlManager(static_crawler, browser_crawler)
    
    # Pass search provider to verifier for discovery of corroborating pages
    verifier = WebsiteVerifier(crawl_manager, search_provider)
    resolver = IdentityResolver(search_provider, verifier)
    
    table = Table(title=f"Identity Results ({provider_name})")
    table.add_column("Company", style="cyan")
    table.add_column("Expected Outcome", style="dim")
    table.add_column("Selected Domain", style="magenta")
    table.add_column("Actual Conf", style="green")
    table.add_column("Match?", justify="center")
    table.add_column("Latency", justify="right")
    
    metrics = {"correct_identity": 0, "false_confident": 0, "correct_abstention": 0}
    
    for case in BENCHMARK_CASES:
        company = case["company"]
        expected_domain = case.get("expected_domain")
        expected_outcome = case["expected"]
        
        start_time = time.time()
        try:
            identity = resolver.resolve(company)
            latency = f"{time.time() - start_time:.1f}s"
            
            domain = identity.domain or "N/A"
            conf = identity.confidence.name
            
            actual_outcome = "CONFIDENT" if conf == "CONFIDENT" else "ABSTAIN"
            
            is_match = False
            if expected_outcome == "CONFIDENT":
                if actual_outcome == "CONFIDENT" and domain == expected_domain:
                    is_match = True
                    metrics["correct_identity"] += 1
                elif actual_outcome == "CONFIDENT" and domain != expected_domain:
                    metrics["false_confident"] += 1
            else: # expected ABSTAIN
                if actual_outcome == "ABSTAIN":
                    is_match = True
                    metrics["correct_abstention"] += 1
                else:
                    metrics["false_confident"] += 1
            
            match_str = "[green]✓[/green]" if is_match else "[red]✗[/red]"
            
            table.add_row(
                company, 
                f"{expected_outcome} ({expected_domain})" if expected_domain else expected_outcome, 
                domain, 
                conf, 
                match_str,
                latency
            )
        except Exception as e:
            table.add_row(company, expected_outcome, "ERROR", str(e), "[red]✗[/red]", f"{time.time() - start_time:.1f}s")
            
    console.print(table)
    console.print("\n[bold]Metrics[/bold]")
    console.print(f"Correct Identity (True Positive): {metrics['correct_identity']}")
    console.print(f"False CONFIDENT (False Positive): [red]{metrics['false_confident']}[/red]")
    console.print(f"Correct Abstention (True Negative): {metrics['correct_abstention']}")

def main():
    if "--serper" in sys.argv and not os.environ.get("SERPER_API_KEY"):
        console.print("[red]Error: --serper flag used but SERPER_API_KEY is not set.[/red]")
        sys.exit(1)
        
    provider = "Serper" if "--serper" in sys.argv else "DuckDuckGo"
    run_benchmark(provider)

if __name__ == "__main__":
    main()

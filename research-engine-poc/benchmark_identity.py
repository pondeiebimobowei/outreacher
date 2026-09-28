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
    {"company": "Linear", "expected_domain": "linear.app", "expected_confidence": "CONFIDENT"},
    {"company": "Stripe", "expected_domain": "stripe.com", "expected_confidence": "CONFIDENT"},
    {"company": "Vercel", "expected_domain": "vercel.com", "expected_confidence": "CONFIDENT"},
    {"company": "Moniepoint", "expected_domain": "moniepoint.com", "expected_confidence": "CONFIDENT"},
    {"company": "Kelmond Media Company", "expected_domain": None, "expected_confidence": "AMBIGUOUS"}, # Or UNRESOLVED
    {"company": "Manom Solutions", "expected_domain": None, "expected_confidence": "AMBIGUOUS"},
    {"company": "Outray", "expected_domain": "outray.dev", "expected_confidence": "AMBIGUOUS"}, # The crawler fails so it stays AMBIGUOUS
    {"company": "Acme Corp", "expected_domain": None, "expected_confidence": "AMBIGUOUS"}
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
    verifier = WebsiteVerifier(crawl_manager)
    resolver = IdentityResolver(search_provider, verifier)
    
    table = Table(title=f"Identity Results ({provider_name})")
    table.add_column("Company", style="cyan")
    table.add_column("Expected", style="dim")
    table.add_column("Selected", style="magenta")
    table.add_column("Expected Conf", style="dim")
    table.add_column("Actual Conf", style="green")
    table.add_column("Match?", justify="center")
    table.add_column("Latency", justify="right")
    
    metrics = {"correct_identity": 0, "false_confident": 0, "correct_abstention": 0}
    
    for case in BENCHMARK_CASES:
        company = case["company"]
        expected_domain = case["expected_domain"]
        expected_conf = case["expected_confidence"]
        
        start_time = time.time()
        try:
            identity = resolver.resolve(company)
            latency = f"{time.time() - start_time:.1f}s"
            
            domain = identity.domain or "N/A"
            conf = identity.confidence.name
            
            domain_match = (domain == expected_domain) if expected_domain else (conf != "CONFIDENT")
            conf_match = (conf == expected_conf) or (expected_conf in ["AMBIGUOUS", "UNRESOLVED"] and conf in ["AMBIGUOUS", "UNRESOLVED"])
            
            is_match = domain_match and conf_match
            
            # Metrics
            if conf == "CONFIDENT":
                if domain == expected_domain:
                    metrics["correct_identity"] += 1
                else:
                    metrics["false_confident"] += 1
            else:
                if expected_domain is None or conf_match:
                    metrics["correct_abstention"] += 1
            
            match_str = "[green]✓[/green]" if is_match else "[red]✗[/red]"
            
            table.add_row(
                company, 
                expected_domain or "None", 
                domain, 
                expected_conf, 
                conf, 
                match_str,
                latency
            )
        except Exception as e:
            table.add_row(company, expected_domain or "None", "ERROR", expected_conf, str(e), "[red]✗[/red]", f"{time.time() - start_time:.1f}s")
            
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

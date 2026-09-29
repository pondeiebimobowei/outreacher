import sys
import os
from rich.console import Console
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

console = Console()

def main():
    if len(sys.argv) < 2:
        console.print("[red]Usage: python main.py <company_name> [--serper][/red]")
        sys.exit(1)
        
    company_name = sys.argv[1]
    use_serper = "--serper" in sys.argv
    
    if use_serper:
        if not os.environ.get("SERPER_API_KEY"):
            console.print("[red]Error: --serper flag used but SERPER_API_KEY environment variable is not set.[/red]")
            sys.exit(1)
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
    
    runner = AcquisitionRunner(resolver, discoverer, ranker, crawl_manager)
    
    try:
        package = runner.run(company_name)
        
        console.print("\n[bold magenta]--- Final Raw Research Package ---[/bold magenta]")
        output_dict = package.model_dump(mode="json")
        for doc in output_dict["documents"]:
            if doc.get("content"):
                doc["content"] = doc["content"][:100] + "... [TRUNCATED FOR DISPLAY]"
                
        console.print_json(data=output_dict)
        
    except Exception as e:
        console.print(f"\n[bold red]Pipeline failed: {e}[/bold red]")
        sys.exit(1)

if __name__ == "__main__":
    main()

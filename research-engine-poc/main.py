import sys
from rich.console import Console
from search.duckduckgo import DuckDuckGoSearchProvider
from crawling.trafilatura_crawler import TrafilaturaCrawlerProvider
from crawling.playwright_crawler import PlaywrightCrawlerProvider
from crawling.manager import CrawlManager
from identity.resolver import IdentityResolver
from pipeline.acquisition import AcquisitionRunner

console = Console()

def main():
    if len(sys.argv) < 2:
        console.print("[red]Usage: python main.py <company_name>[/red]")
        sys.exit(1)
        
    company_name = sys.argv[1]
    
    search_provider = DuckDuckGoSearchProvider()
    static_crawler = TrafilaturaCrawlerProvider()
    browser_crawler = PlaywrightCrawlerProvider()
    
    crawl_manager = CrawlManager(static_crawler, browser_crawler)
    
    # We use the static crawler just to verify identity homepage quickly
    resolver = IdentityResolver(search_provider, crawl_manager)
    
    runner = AcquisitionRunner(resolver, search_provider, crawl_manager)
    
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

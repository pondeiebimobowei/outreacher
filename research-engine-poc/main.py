import sys
from rich.console import Console
from search.duckduckgo import DuckDuckGoSearchProvider
from crawling.trafilatura_crawler import TrafilaturaCrawlerProvider
from identity.resolver import IdentityResolver
from pipeline.acquisition import AcquisitionRunner

console = Console()

def main():
    if len(sys.argv) < 2:
        console.print("[red]Usage: python main.py <company_name>[/red]")
        sys.exit(1)
        
    company_name = sys.argv[1]
    
    # Initialize providers (Dependency Injection)
    search_provider = DuckDuckGoSearchProvider()
    crawler_provider = TrafilaturaCrawlerProvider()
    resolver = IdentityResolver(search_provider)
    
    runner = AcquisitionRunner(resolver, search_provider, crawler_provider)
    
    try:
        package = runner.run(company_name)
        
        console.print("\n[bold magenta]--- Final Raw Research Package ---[/bold magenta]")
        # Dump the JSON but truncate the document content slightly for readability in the console output
        output_dict = package.model_dump(mode="json")
        for doc in output_dict["documents"]:
            if doc.get("content"):
                doc["content"] = doc["content"][:200] + "... [TRUNCATED FOR DISPLAY]"
                
        console.print_json(data=output_dict)
        
    except Exception as e:
        console.print(f"\n[bold red]Pipeline failed: {e}[/bold red]")
        sys.exit(1)

if __name__ == "__main__":
    main()

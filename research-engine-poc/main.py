import sys
import os
from rich.console import Console
from rich.panel import Panel
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
from core.models import IdentityConfidence
from pipeline.acquisition import AcquisitionRunner
from synthesis.bridge import LLMClaimGraphBridge
from synthesis.providers.gemini import GeminiLLMSynthesizer
from synthesis.providers.mistral import MistralLLMSynthesizer

console = Console()

def main():
    if len(sys.argv) < 2:
        console.print("[red]Usage: python main.py <company_name> [--serper] [--gemini | --mistral][/red]")
        sys.exit(1)
        
    company_name = sys.argv[1]
    use_serper = "--serper" in sys.argv
    use_mistral = "--mistral" in sys.argv
    use_gemini = "--gemini" in sys.argv or (not use_mistral and bool(os.environ.get("GEMINI_API_KEY")))
    
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
        console.print(f"[bold cyan]🔍 Running Acquisition Pipeline for: {company_name}...[/bold cyan]")
        package = runner.run(company_name)
        
        if package.identity.confidence != IdentityConfidence.CONFIDENT:
            console.print(Panel.fit(
                f"[bold yellow]Acquisition Aborted / Research Skipped[/bold yellow]\n"
                f"• Identity Confidence: [bold red]{package.identity.confidence.value}[/bold red]\n"
                f"• Domain: {package.identity.domain or 'None'}\n"
                f"• Reason: Identity verification was not confident. Acquisition halted safely without crawling or synthesis.\n"
                f"• Documents Crawled: {len(package.documents)}",
                title="Acquisition Aborted"
            ))
            return

        console.print(Panel.fit(
            f"[bold green]Company Identity Verified[/bold green]\n"
            f"• Name: [bold]{package.identity.name}[/bold]\n"
            f"• Domain: {package.identity.domain}\n"
            f"• Website: {package.identity.website_url}\n"
            f"• Confidence: {package.identity.confidence.value}\n"
            f"• Documents Crawled: {len(package.documents)}",
            title="Acquisition Complete"
        ))

        if use_mistral:
            api_key = os.environ.get("MISTRAL_API_KEY")
            if not api_key:
                console.print("[yellow]Notice: MISTRAL_API_KEY not found in environment. Set MISTRAL_API_KEY to enable Mistral synthesis.[/yellow]")
                return
            console.print("\n[bold magenta]🤖 Running Mistral Two-Stage Extraction & ClaimGraph Bridge...[/bold magenta]")
            synth = MistralLLMSynthesizer(api_key=api_key)
            _run_synthesis_and_display(package, synth)

        elif use_gemini:
            api_key = os.environ.get("GEMINI_API_KEY")
            if not api_key:
                console.print("[yellow]Notice: GEMINI_API_KEY not found in environment. Set GEMINI_API_KEY to enable Gemini synthesis.[/yellow]")
                return
            console.print("\n[bold magenta]🤖 Running Gemini Two-Stage Extraction & ClaimGraph Bridge...[/bold magenta]")
            synth = GeminiLLMSynthesizer(api_key=api_key)
            _run_synthesis_and_display(package, synth)

    except Exception as e:
        console.print(f"\n[bold red]Pipeline failed: {e}[/bold red]")
        sys.exit(1)

def _run_synthesis_and_display(package, synth):
    graph, dto, diagnostics = LLMClaimGraphBridge.process(package, synth)

    # 1. Print ClaimGraph Claims
    claims_table = Table(title=f"Verified ClaimGraph ({synth.__class__.__name__})", show_lines=True)
    claims_table.add_column("Category", style="cyan", width=12)
    claims_table.add_column("Classification", style="magenta", width=12)
    claims_table.add_column("Proposition", style="white")
    claims_table.add_column("Verbatim Quote", style="green")

    for c in graph.claims:
        quote_text = c.supporting_quotes[0] if c.supporting_quotes else "-"
        claims_table.add_row(
            c.category.value,
            c.classification.value,
            f"{c.subject} {c.predicate.replace('_', ' ')}: [bold]{c.object_value}[/bold]",
            quote_text
        )
    console.print(claims_table)

    # 2. Print Diagnostics (if any candidate was rejected)
    if diagnostics:
        diag_table = Table(title="Rejected Candidate Claims (Diagnostic Log)", show_lines=True)
        diag_table.add_column("Idx", width=4)
        diag_table.add_column("Proposition", style="yellow")
        diag_table.add_column("Rejection Reason", style="red")
        for d in diagnostics:
            diag_table.add_row(str(d.candidate_index), f"{d.subject} {d.predicate}", d.reason)
        console.print(diag_table)

    # 3. Print Final DTO
    console.print("\n[bold green]📦 CompanyResearchDTO (NestJS Integration Contract)[/bold green]")
    console.print_json(data=dto.model_dump(mode="json"))

if __name__ == "__main__":
    main()

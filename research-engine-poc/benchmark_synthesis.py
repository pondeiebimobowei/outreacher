import sys
import os
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from core.models import (
    CompanyIdentity, IdentityConfidence, CrawledDocument,
    DocumentQuality, PageType, RawResearchPackage,
)
from core.evidence import ClaimGraph
from synthesis.bridge import LLMClaimGraphBridge
from synthesis.providers.gemini import GeminiLLMSynthesizer
from synthesis.providers.mistral import MistralLLMSynthesizer

console = Console()

# Curated benchmark research packages representing varied company archetypes
BENCHMARK_PACKAGES = [
    RawResearchPackage(
        identity=CompanyIdentity(
            name="Linear",
            domain="linear.app",
            website_url="https://linear.app",
            confidence=IdentityConfidence.CONFIDENT,
            reasoning="Verified primary domain for Linear.",
        ),
        documents=[
            CrawledDocument(
                url="https://linear.app/about",
                final_url="https://linear.app/about",
                page_type=PageType.ABOUT,
                title="About Linear",
                content="""About Linear
Linear is the purpose-built tool for planning and building software.
Created for modern software teams who want to build high quality software faster.
We are a remote-first team distributed across North America and Europe.
Linear was founded in 2019 by Karri Saarinen, Tuomas Artman, and Jori Lallo.""",
                retrieved_at=datetime.now(timezone.utc),
                quality=DocumentQuality.VALID,
            ),
            CrawledDocument(
                url="https://linear.app/careers",
                final_url="https://linear.app/careers",
                page_type=PageType.CAREERS,
                title="Careers at Linear",
                content="""Careers at Linear
We are building the next generation of software development tools.
Open roles: Senior Frontend Engineer (React/TypeScript), Backend Engineer (Node.js/PostgreSQL).
We offer competitive salaries, equity, remote flexibility, and comprehensive health benefits.""",
                retrieved_at=datetime.now(timezone.utc),
                quality=DocumentQuality.VALID,
            ),
        ],
        discovered_at=datetime.now(timezone.utc),
    ),
    RawResearchPackage(
        identity=CompanyIdentity(
            name="Moniepoint",
            domain="moniepoint.com",
            website_url="https://moniepoint.com",
            confidence=IdentityConfidence.CONFIDENT,
            reasoning="Verified financial services provider in Nigeria.",
        ),
        documents=[
            CrawledDocument(
                url="https://moniepoint.com/about",
                final_url="https://moniepoint.com/about",
                page_type=PageType.ABOUT,
                title="About Moniepoint",
                content="""About Moniepoint
Moniepoint Inc. is a leading financial technology company providing banking, payments, credit, and business management tools.
Founded in 2015 by Tosin Eniolorunda and Felix Ike, Moniepoint powers over 1.3 million businesses across Africa.
Licensed by the Central Bank of Nigeria as a Microfinance Bank.""",
                retrieved_at=datetime.now(timezone.utc),
                quality=DocumentQuality.VALID,
            ),
        ],
        discovered_at=datetime.now(timezone.utc),
    ),
]

def benchmark_provider(provider_name: str, synthesizer, packages: List[RawResearchPackage]) -> List[Dict[str, Any]]:
    results = []
    
    for pkg in packages:
        company = pkg.identity.name
        start_time = time.perf_counter()
        
        try:
            graph, dto, diagnostics = LLMClaimGraphBridge.process(pkg, synthesizer)
            total_duration = time.perf_counter() - start_time
            
            # Retrieve last telemetry if available
            meta = getattr(synthesizer, "last_metadata", None)
            total_tokens = meta.total_tokens if meta else None
            
            accepted_claims = len(graph.claims)
            rejected_count = len(diagnostics)
            total_candidates = accepted_claims + rejected_count
            rejection_rate = (rejected_count / total_candidates * 100) if total_candidates > 0 else 0.0
            
            results.append({
                "provider": provider_name,
                "model": getattr(synthesizer, "model", "default"),
                "company": company,
                "status": dto.status.value,
                "candidates": total_candidates,
                "accepted": accepted_claims,
                "rejected": rejected_count,
                "rejection_rate": f"{rejection_rate:.1f}%",
                "unknowns": len(dto.unknowns),
                "summary_words": len(dto.summary.split()) if dto.summary else 0,
                "latency_s": f"{total_duration:.2f}s",
                "tokens": str(total_tokens) if total_tokens is not None else "-",
                "error": None,
            })
        except Exception as e:
            total_duration = time.perf_counter() - start_time
            results.append({
                "provider": provider_name,
                "model": getattr(synthesizer, "model", "default"),
                "company": company,
                "status": "FAILED",
                "candidates": 0,
                "accepted": 0,
                "rejected": 0,
                "rejection_rate": "N/A",
                "unknowns": 0,
                "summary_words": 0,
                "latency_s": f"{total_duration:.2f}s",
                "tokens": "-",
                "error": str(e),
            })
            
    return results

def main():
    gemini_key = os.environ.get("GEMINI_API_KEY")
    mistral_key = os.environ.get("MISTRAL_API_KEY")

    if not gemini_key and not mistral_key:
        console.print("[red]Error: Neither GEMINI_API_KEY nor MISTRAL_API_KEY is set in environment.[/red]")
        console.print("[yellow]Set at least one API key to run LLM synthesis benchmarks.[/yellow]")
        sys.exit(1)

    configurations = []
    
    if gemini_key:
        configurations.append(("Gemini (3.5 Flash Lite)", GeminiLLMSynthesizer(api_key=gemini_key, model="gemini-3.5-flash-lite")))
        configurations.append(("Gemini (3.1 Flash Lite)", GeminiLLMSynthesizer(api_key=gemini_key, model="gemini-3.1-flash-lite")))
    
    if mistral_key:
        configurations.append(("Mistral (Small)", MistralLLMSynthesizer(api_key=mistral_key, model="mistral-small-latest")))

    console.print(Panel.fit(
        f"[bold cyan]Head-to-Head LLM Claim Extraction & Synthesis Benchmark[/bold cyan]\n"
        f"Evaluating {len(configurations)} model configuration(s) across {len(BENCHMARK_PACKAGES)} test packages.\n"
        f"Verifies verbatim quote grounding, candidate acceptance rate, latency, and token metrics.",
        title="Dual-Contract Synthesis Benchmark"
    ))

    all_results = []
    for label, synth in configurations:
        console.print(f"Running benchmark for [bold magenta]{label}[/bold magenta]...")
        res = benchmark_provider(label, synth, BENCHMARK_PACKAGES)
        all_results.extend(res)

    # Display comparison table
    table = Table(title="LLM Provider Synthesis & Grounding Metrics", expand=True, show_lines=True)
    table.add_column("Provider / Model", style="cyan", no_wrap=True)
    table.add_column("Company", style="white")
    table.add_column("Status", style="bold")
    table.add_column("Candidates", justify="right")
    table.add_column("Accepted", justify="right", style="green")
    table.add_column("Rejected", justify="right", style="red")
    table.add_column("Rej %", justify="right", style="yellow")
    table.add_column("Unknowns", justify="right", style="blue")
    table.add_column("Summary Words", justify="right")
    table.add_column("Latency", justify="right")
    table.add_column("Tokens", justify="right", style="dim")

    for r in all_results:
        status_style = "green" if r["status"] == "COMPLETED" else "yellow" if r["status"] == "PARTIAL" else "red"
        table.add_row(
            f"{r['provider']}",
            r["company"],
            f"[{status_style}]{r['status']}[/{status_style}]",
            str(r["candidates"]),
            str(r["accepted"]),
            str(r["rejected"]),
            r["rejection_rate"],
            str(r["unknowns"]),
            str(r["summary_words"]),
            r["latency_s"],
            r["tokens"],
        )

    console.print()
    console.print(table)

if __name__ == "__main__":
    main()

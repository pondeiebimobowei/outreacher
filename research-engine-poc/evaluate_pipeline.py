import sys
import os
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityCandidate, IdentityContext,
    CrawledDocument, DocumentQuality, PageType, RawResearchPackage,
)
from core.evidence import ClaimGraph, ClaimClassification
from core.opportunities import extract_research_opportunities
from synthesis.bridge import LLMClaimGraphBridge
from synthesis.providers.gemini import GeminiLLMSynthesizer
from synthesis.providers.mistral import MistralLLMSynthesizer

console = Console()

# ── 5 Archetype Evaluation Cases ──────────────────────────────────────────────

ARCHETYPE_PACKAGES: List[Dict[str, Any]] = [
    # Archetype 1: Straightforward Corporate Site (Rich static info, multiple products)
    {
        "archetype": "1. Corporate Multi-Product",
        "company": "Moniepoint",
        "description": "Established fintech with rich corporate overview and active banking/POS products",
        "package": RawResearchPackage(
            identity=CompanyIdentity(
                name="Moniepoint",
                domain="moniepoint.com",
                website_url="https://moniepoint.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified financial services platform in Nigeria.",
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
Headquartered in London with primary operations in Lagos, Nigeria.
Licensed by the Central Bank of Nigeria as a Microfinance Bank.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://moniepoint.com/careers/lead-infra-engineer",
                    final_url="https://moniepoint.com/careers/lead-infra-engineer",
                    page_type=PageType.JOB_LISTING,
                    title="Lead Infrastructure Engineer | Moniepoint",
                    content="""Lead Infrastructure Engineer
Responsibilities:
- Scale Kubernetes clusters across multi-cloud regions.
- Architect high-throughput payment settlement pipelines.
Requirements:
- 7+ years distributed systems experience with Go and AWS.
- Strong knowledge of PostgreSQL and Kafka.
Apply now to join our infrastructure team.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    },

    # Archetype 2: SPA / Dynamic Developer Tool (Client-side rendering, tech-heavy)
    {
        "archetype": "2. SPA Developer Tool",
        "company": "Linear",
        "description": "High-velocity modern software product with client-side interactive pages",
        "package": RawResearchPackage(
            identity=CompanyIdentity(
                name="Linear",
                domain="linear.app",
                website_url="https://linear.app",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified primary domain for Linear product development system.",
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
Linear was founded in 2019 by Karri Saarinen, Tuomas Artman, and Jori Lallo.
More than 40,000 companies including OpenAI, Coinbase, and Ramp build with Linear.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://linear.app/now/series-b-announcement",
                    final_url="https://linear.app/now/series-b-announcement",
                    page_type=PageType.BLOG,
                    title="Linear's Next Chapter: Series B",
                    content="""Linear's Next Chapter
Announcing our $35M Series B funding led by Accel.
Published on September 14. 4 min read.
We are scaling our sync engine architecture built with TypeScript and SQLite.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    },

    # Archetype 3: External ATS Hosted Careers (Ashby / Greenhouse)
    {
        "archetype": "3. External ATS Integration",
        "company": "Vercel",
        "description": "Platform company routing career requisitions through third-party ATS (Ashby/Greenhouse)",
        "package": RawResearchPackage(
            identity=CompanyIdentity(
                name="Vercel",
                domain="vercel.com",
                website_url="https://vercel.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified cloud platform for Next.js and frontend applications.",
            ),
            documents=[
                CrawledDocument(
                    url="https://vercel.com/about",
                    final_url="https://vercel.com/about",
                    page_type=PageType.ABOUT,
                    title="About Vercel",
                    content="""About Vercel
Vercel is the Frontend Cloud. We provide the developer experience and infrastructure to build and deploy high-performance web applications.
Founded by Guillermo Rauch, Vercel created Next.js, the premier React framework.
Over 1 million active developers use Vercel worldwide.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://jobs.ashbyhq.com/vercel/1a2b3c4d",
                    final_url="https://jobs.ashbyhq.com/vercel/1a2b3c4d",
                    page_type=PageType.JOB_LISTING,
                    title="Senior Solutions Architect - Vercel Careers",
                    content="""Senior Solutions Architect
About the role:
Partner with enterprise customers deploying large Next.js and AI workloads.
Responsibilities:
- Advise enterprise architects on edge middleware and rendering patterns.
- Resolve complex distributed caching architectures.
Requirements:
- 5+ years experience in frontend architecture and modern web performance.
Apply for this role.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    },

    # Archetype 4: Boutique / Early-Stage (No Public Careers Page -> Proactive Outreach)
    {
        "archetype": "4. No Careers / Stealth",
        "company": "Acme AI Labs",
        "description": "Specialized boutique research firm with verified identity but zero active job postings",
        "package": RawResearchPackage(
            identity=CompanyIdentity(
                name="Acme AI Labs",
                domain="acmeailabs.io",
                website_url="https://acmeailabs.io",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified single primary research domain.",
            ),
            documents=[
                CrawledDocument(
                    url="https://acmeailabs.io",
                    final_url="https://acmeailabs.io",
                    page_type=PageType.HOMEPAGE,
                    title="Acme AI Labs - Autonomous Systems",
                    content="""Acme AI Labs
We research and build verifiable agent architectures for high-reliability software engineering.
Our team consists of 8 researchers in Zurich and San Francisco.
Contact us at research@acmeailabs.io for research collaborations.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    },

    # Archetype 5: Ambiguous Entity Collision (Requires Context Disambiguation)
    {
        "archetype": "5. Ambiguous Collision",
        "company": "Apex",
        "description": "Multiple competing entities sharing common dictionary name, resolved via context",
        "package": RawResearchPackage(
            identity=CompanyIdentity(
                name="Apex",
                domain="apexfintechsolutions.com",
                website_url="https://apexfintechsolutions.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Resolved primary identity disambiguated via financial clearing context.",
            ),
            documents=[
                CrawledDocument(
                    url="https://apexfintechsolutions.com/about-us",
                    final_url="https://apexfintechsolutions.com/about-us",
                    page_type=PageType.ABOUT,
                    title="About Apex Fintech Solutions",
                    content="""About Apex Fintech Solutions
Apex Fintech Solutions is the fintech for fintechs, powering modern investing and clearing custody services.
We provide execution, clearing, custody, and digital wealth solutions for hundreds of broker-dealers and modern fintechs.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    },
]

def run_evaluation(synthesizer, provider_name: str) -> None:
    console.print(Panel.fit(
        f"[bold cyan]Dual-Contract Research Engine — 5-Archetype Evaluation[/bold cyan]\n"
        f"Provider: [bold magenta]{provider_name}[/bold magenta] ({getattr(synthesizer, 'model', 'default')})\n"
        f"Evaluating identity confidence, provenance grounding, opportunity classification, and token telemetry.",
        title="Pipeline Evaluation"
    ))

    summary_table = Table(title=f"Evaluation Summary: {provider_name}", expand=True, show_lines=True)
    summary_table.add_column("Archetype", style="cyan", no_wrap=True)
    summary_table.add_column("Company", style="white")
    summary_table.add_column("Status", style="bold")
    summary_table.add_column("Claims", justify="right", style="green")
    summary_table.add_column("Rejected", justify="right", style="red")
    summary_table.add_column("Opportunity Type", style="magenta")
    summary_table.add_column("Role Title", style="white")
    summary_table.add_column("Unknowns", justify="right", style="blue")
    summary_table.add_column("Latency", justify="right")
    summary_table.add_column("Tokens", justify="right", style="dim")

    for case in ARCHETYPE_PACKAGES:
        archetype_label = case["archetype"]
        company = case["company"]
        pkg = case["package"]

        start_time = time.perf_counter()
        try:
            graph, dto, diagnostics = LLMClaimGraphBridge.process(pkg, synthesizer)
            duration_s = time.perf_counter() - start_time

            meta = getattr(synthesizer, "last_metadata", None)
            tokens = str(meta.total_tokens) if meta and meta.total_tokens else "-"

            accepted_count = len([c for c in graph.claims if c.classification in (ClaimClassification.FACT, ClaimClassification.INFERENCE)])
            rejected_count = len(diagnostics)
            
            top_opp = dto.opportunities[0] if dto.opportunities else None
            opp_type = top_opp.opportunity_type.value if top_opp else "NONE"
            opp_title = top_opp.role_title if top_opp else "-"

            status_style = "green" if dto.status.value == "COMPLETED" else "yellow" if dto.status.value == "PARTIAL" else "red"
            opp_style = "green" if opp_type == "CONFIRMED" else "cyan" if opp_type == "PROACTIVE" else "yellow"

            summary_table.add_row(
                archetype_label,
                company,
                f"[{status_style}]{dto.status.value}[/{status_style}]",
                str(accepted_count),
                str(rejected_count),
                f"[{opp_style}]{opp_type}[/{opp_style}]",
                opp_title[:32],
                str(len(dto.unknowns)),
                f"{duration_s:.2f}s",
                tokens,
            )
        except Exception as e:
            duration_s = time.perf_counter() - start_time
            summary_table.add_row(
                archetype_label,
                company,
                "[red]FAILED[/red]",
                "0",
                "0",
                "ERROR",
                str(e)[:32],
                "0",
                f"{duration_s:.2f}s",
                "-",
            )

    console.print()
    console.print(summary_table)

def main():
    gemini_key = os.environ.get("GEMINI_API_KEY")
    mistral_key = os.environ.get("MISTRAL_API_KEY")

    if not gemini_key and not mistral_key:
        console.print("[red]Error: Neither GEMINI_API_KEY nor MISTRAL_API_KEY is set in environment.[/red]")
        console.print("[yellow]Set at least one API key to run LLM evaluation.[/yellow]")
        sys.exit(1)

    if gemini_key:
        synth = GeminiLLMSynthesizer(api_key=gemini_key, model="gemini-3.5-flash-lite")
        run_evaluation(synth, "Google Gemini 3.5 Flash-Lite")

    if mistral_key:
        synth = MistralLLMSynthesizer(api_key=mistral_key, model="mistral-small-latest")
        run_evaluation(synth, "Mistral Small")

if __name__ == "__main__":
    main()

"""
benchmark_identity.py — v0.8 Identity Acceptance Gate

Run:
    uv run benchmark_identity.py              # DuckDuckGo (degraded)
    uv run benchmark_identity.py --serper     # Serper (production)
    uv run benchmark_identity.py --verbose    # Show full per-candidate evidence

Acceptance criteria (Serper):

  Bare-name resolution:
    Linear       → AMBIGUOUS           (genuine entity collision: linear.app / linear.vc)
    Stripe       → CONFIDENT (stripe.com)
    Vercel       → CONFIDENT (vercel.com)
    Moniepoint   → CONFIDENT (moniepoint.com)
    Kelmond      → ABSTAIN
    Manom        → ABSTAIN
    Outray       → ABSTAIN
    Acme Corp    → ABSTAIN

  Context-assisted resolution:
    Linear (software context) → CONFIDENT (linear.app)

  FALSE CONFIDENT = 0
"""
import sys
import os

from rich.console import Console
from rich.table import Table

from search.duckduckgo import DuckDuckGoSearchProvider
from search.serper import SerperSearchProvider
from crawling.trafilatura_crawler import TrafilaturaCrawlerProvider
from crawling.playwright_crawler import PlaywrightCrawlerProvider
from crawling.manager import CrawlManager
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from core.models import IdentityConfidence, IdentityContext

console = Console()

# ── Benchmark cases ──────────────────────────────────────────────────────────
# Each case is a dict with:
#   company:         company name to resolve
#   expected:        "CONFIDENT" | "AMBIGUOUS" (for ABSTAIN-expected cases)
#   expected_domain: required when expected=="CONFIDENT"
#   context:         optional IdentityContext dict for context-assisted cases

BENCHMARK_CASES = [
    # Bare-name resolution ────────────────────────────────────────────────────
    # "Linear" has a genuine entity collision when both linear.app (PM tool) and
    # linear.vc (VC firm) appear in the same Serper run. Two acceptable outcomes:
    #   AMBIGUOUS      — correct when both companies surface (both become PRIMARY)
    #   CONFIDENT(linear.app) — correct when only linear.app surfaces as PRIMARY
    # The only false confident would be CONFIDENT(linear.vc) or anything else.
    {
        "company": "Linear",
        "expected": "AMBIGUOUS_OR_CONFIDENT",
        "acceptable_domains": ["linear.app"],
    },
    {"company": "Stripe",               "expected_domain": "stripe.com",     "expected": "CONFIDENT"},
    {"company": "Vercel",               "expected_domain": "vercel.com",     "expected": "CONFIDENT"},
    {"company": "Moniepoint",           "expected_domain": "moniepoint.com", "expected": "CONFIDENT"},
    {"company": "Kelmond Media Company",                                      "expected": "ABSTAIN"},
    {"company": "Manom Solutions",                                            "expected": "ABSTAIN"},
    {"company": "Outray",                                                     "expected": "ABSTAIN"},
    {"company": "Acme Corp",                                                  "expected": "ABSTAIN"},

    # Context-assisted resolution ─────────────────────────────────────────────
    # The caller knows this is a software product. That context discriminates
    # linear.app (product development software) from linear.vc (VC firm).
    # Context comes from structured product data, not LLM inference.
    {
        "company": "Linear",
        "label":   "Linear (software context)",
        "context": IdentityContext(
            industry="software",
            description="product development software",
            company_type="software_product",
        ),
        "expected_domain": "linear.app",
        "expected": "CONFIDENT",
    },
]


def _actual_outcome(confidence: IdentityConfidence) -> str:
    return "CONFIDENT" if confidence == IdentityConfidence.CONFIDENT else "ABSTAIN"


def print_candidate_diagnostics(identity):
    """Print full per-candidate evidence tree including relationship classification."""
    console.print(f"\n  [bold underline]{identity.name}[/bold underline]  —  "
                  f"[yellow]{identity.confidence.name}[/yellow]")
    console.print(f"  {identity.reasoning}\n")

    for cand in identity.candidates:
        rel_str = cand.relationship.value if cand.relationship else "—"
        rel_colour = {
            "PRIMARY":   "green",
            "RELATED":   "yellow",
            "LEGACY":    "cyan",
            "UNRELATED": "red",
            "UNKNOWN":   "dim",
        }.get(rel_str, "dim")
        verified_str = "[green]VERIFIED[/green]" if cand.is_verified else "[red]NOT VERIFIED[/red]"
        console.print(
            f"  [cyan]{cand.domain}[/cyan]  {verified_str}  "
            f"rel=[{rel_colour}]{rel_str}[/{rel_colour}]"
        )
        if cand.verification_msg:
            console.print(f"    msg: [dim]{cand.verification_msg}[/dim]")
        for ev in cand.evidence:
            rank_str = f" rank={ev.rank}" if ev.rank else ""
            console.print(
                f"    • [{ev.type.value}]{rank_str}  signal={ev.signal}  "
                f"src={ev.source}  {ev.url[:60]}"
            )
        console.print()


def run_benchmark(provider_name: str, verbose: bool = False):
    console.print(f"\n[bold green]Identity Benchmark — {provider_name}[/bold green]\n")

    if provider_name == "Serper":
        search_provider = SerperSearchProvider()
    else:
        search_provider = DuckDuckGoSearchProvider()

    crawl_manager = CrawlManager(
        TrafilaturaCrawlerProvider(),
        PlaywrightCrawlerProvider(),
    )
    verifier  = WebsiteVerifier(crawl_manager, search_provider)
    resolver  = IdentityResolver(search_provider, verifier)

    # Summary table
    table = Table(title=f"Identity Results ({provider_name})", expand=True)
    table.add_column("Case",            style="cyan",    no_wrap=True)
    table.add_column("Expected",        style="dim")
    table.add_column("Selected Domain", style="magenta")
    table.add_column("Actual",          style="green")
    table.add_column("Verified Cands",  style="blue")
    table.add_column("Reasoning",       style="italic",  ratio=3)
    table.add_column("Match?",          justify="center")

    metrics = {"correct_identity": 0, "false_confident": 0, "correct_abstention": 0}

    for case in BENCHMARK_CASES:
        company          = case["company"]
        label            = case.get("label", company)
        expected_domain  = case.get("expected_domain")
        expected_outcome = case["expected"]
        context          = case.get("context")

        try:
            identity = resolver.resolve(company, context=context)
        except Exception as exc:
            table.add_row(label, expected_outcome, "ERROR", str(exc), "", "", "[red]✗[/red]")
            continue

        actual_outcome = _actual_outcome(identity.confidence)
        domain         = identity.domain or "N/A"
        conf           = identity.confidence.name

        verified_names = ", ".join(
            c.domain for c in identity.candidates if c.is_verified
        ) or "—"

        is_match = False
        if expected_outcome == "CONFIDENT":
            if actual_outcome == "CONFIDENT" and domain == expected_domain:
                is_match = True
                metrics["correct_identity"] += 1
            else:
                metrics["false_confident"] += 1 if actual_outcome == "CONFIDENT" else 0

        elif expected_outcome == "AMBIGUOUS_OR_CONFIDENT":
            # Case where both AMBIGUOUS and CONFIDENT(acceptable_domain) are valid.
            # A false confident occurs only when CONFIDENT is returned for a domain
            # NOT in the acceptable list (e.g. CONFIDENT(linear.vc) for "Linear").
            acceptable = case.get("acceptable_domains", [])
            if identity.confidence == IdentityConfidence.AMBIGUOUS:
                is_match = True
                metrics["correct_abstention"] += 1
            elif actual_outcome == "CONFIDENT" and domain in acceptable:
                is_match = True
                metrics["correct_identity"] += 1
            elif actual_outcome == "CONFIDENT":
                metrics["false_confident"] += 1   # wrong domain chosen

        elif expected_outcome == "AMBIGUOUS":
            # Bare-name collision: we expect AMBIGUOUS, not CONFIDENT.
            if identity.confidence == IdentityConfidence.AMBIGUOUS:
                is_match = True
                metrics["correct_abstention"] += 1
            elif actual_outcome == "CONFIDENT":
                metrics["false_confident"] += 1
        else:  # ABSTAIN
            if actual_outcome == "ABSTAIN":
                is_match = True
                metrics["correct_abstention"] += 1
            else:
                metrics["false_confident"] += 1

        match_str = "[green]✓[/green]" if is_match else "[red]✗[/red]"
        reasoning_short = (identity.reasoning[:70] + "…") if len(identity.reasoning) > 70 else identity.reasoning

        table.add_row(
            label,
            f"{expected_outcome} ({expected_domain})" if expected_domain else expected_outcome,
            domain,
            conf,
            verified_names,
            reasoning_short,
            match_str,
        )

        if verbose:
            print_candidate_diagnostics(identity)

    console.print(table)

    console.print("\n[bold]Metrics[/bold]")
    console.print(f"  Correct Identity  (True Positive):  {metrics['correct_identity']}")
    fp_colour = "red" if metrics["false_confident"] > 0 else "green"
    console.print(f"  False CONFIDENT   (False Positive): [{fp_colour}]{metrics['false_confident']}[/{fp_colour}]")
    console.print(f"  Correct Abstention (True Negative): {metrics['correct_abstention']}")

    if metrics["false_confident"] == 0:
        console.print("\n[bold green]✓ FALSE CONFIDENT = 0  — safety gate passed.[/bold green]")
    else:
        console.print("\n[bold red]✗ FALSE CONFIDENT > 0  — safety gate FAILED.[/bold red]")


def main():
    if "--serper" in sys.argv and not os.environ.get("SERPER_API_KEY"):
        console.print("[red]Error: --serper requires SERPER_API_KEY env var.[/red]")
        sys.exit(1)

    provider = "Serper" if "--serper" in sys.argv else "DuckDuckGo"
    verbose  = "--verbose" in sys.argv
    run_benchmark(provider, verbose=verbose)


if __name__ == "__main__":
    main()

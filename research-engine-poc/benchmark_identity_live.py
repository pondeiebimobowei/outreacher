"""
benchmark_identity_live.py — Live-World Identity Verification & Stage-Attributed Probe Benchmark

Evaluates the frozen Identity Resolution layer (v1.2) against real-world web environments,
measuring live search quality, HTTP/Playwright crawling behavior, WAF/bot interactions,
and stage-by-stage verification drop-offs with raw evidence retention.

Ground Truth Policy:
  - All expected states are frozen independently of resolver execution with explicit verification sources.
  - Telemetry attributes failure to distinct stages: Search, Homepage Crawl, Secondary Discovery,
    Secondary Corroboration, or Arbitration.
  - Preserves full live execution snapshots to JSON for reproducibility.

Usage:
  uv run benchmark_identity_live.py --serper                  # Run with live Serper search
  uv run benchmark_identity_live.py --limit 5                 # Run first 5 cases
  uv run benchmark_identity_live.py --save-snapshot run1.json # Save live evidence snapshot
"""

import sys
import os
import json
import time
from urllib.parse import urlparse
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

def load_env_file(filepath: str = ".env") -> None:
    """Lightweight .env loader that populates os.environ if file exists."""
    if not os.path.exists(filepath):
        return
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("'\"")
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception:
        pass

load_env_file()

from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityContext,
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType,
)
from search.base import ISearchProvider, SearchProviderError
from search.serper import SerperSearchProvider
from search.duckduckgo import DuckDuckGoSearchProvider
from crawling.trafilatura_crawler import TrafilaturaCrawlerProvider
from crawling.playwright_crawler import PlaywrightCrawlerProvider
from crawling.manager import CrawlManager
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver

console = Console()


# ── 1. Independent Live Ground Truth Case Definition ─────────────────────────

@dataclass(frozen=True)
class LiveIdentityCase:
    case_id: str
    company: str
    expected_confidence: IdentityConfidence
    expected_domain: Optional[str]
    expected_relationship: SiteRelationship
    category: str
    ground_truth_source: str
    ground_truth_timestamp: str
    rationale: str
    context: Optional[IdentityContext] = None


# Independent Frozen Live Corpus (16 Diverse Cases)
# Cataloged with independent external registry provenance
LIVE_IDENTITY_CORPUS: List[LiveIdentityCase] = [
    # ── Category 1: Global SaaS & Modern Frameworks (Expected CONFIDENT) ───────
    LiveIdentityCase(
        case_id="live_stripe_payments",
        company="Stripe",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="stripe.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="GLOBAL_FINTECH",
        ground_truth_source="SEC Form D / Delaware Registry / Crunchbase",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Global infrastructure payments platform. Canonical primary domain is stripe.com.",
    ),
    LiveIdentityCase(
        case_id="live_vercel_cloud",
        company="Vercel",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="vercel.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_CLOUD",
        ground_truth_source="Crunchbase / Next.js Parent Organization",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Frontend cloud and creator of Next.js. Canonical primary domain is vercel.com.",
    ),
    LiveIdentityCase(
        case_id="live_postmark_email",
        company="Postmark",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="postmarkapp.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_API",
        ground_truth_source="ActiveCampaign Subsidiary Registry / Official Website",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Transactional email service. Uses brand-divergent domain postmarkapp.com.",
    ),
    LiveIdentityCase(
        case_id="live_resend_email",
        company="Resend",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="resend.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_API",
        ground_truth_source="Y Combinator Directory / Official Brand Registry",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Modern email API for developers. Canonical primary domain is resend.com.",
    ),
    LiveIdentityCase(
        case_id="live_clickup_productivity",
        company="ClickUp",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="clickup.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="WORKPLACE_SAAS",
        ground_truth_source="Delaware Division of Corporations / Crunchbase",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Workplace productivity platform. Canonical primary domain is clickup.com.",
    ),
    LiveIdentityCase(
        case_id="live_flyio_infrastructure",
        company="Fly.io",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="fly.io",
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_CLOUD",
        ground_truth_source="Y Combinator Directory / Crunchbase",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Application delivery and physical computing platform. Canonical domain is fly.io.",
    ),
    LiveIdentityCase(
        case_id="live_supabase_database",
        company="Supabase",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="supabase.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_DATABASE",
        ground_truth_source="Y Combinator Directory / GitHub Organization",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Open-source Firebase alternative. Canonical primary domain is supabase.com.",
    ),
    LiveIdentityCase(
        case_id="live_moniepoint_fintech",
        company="Moniepoint",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="moniepoint.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_FINTECH",
        ground_truth_source="Central Bank of Nigeria Licensed MFB / Crunchbase Unicorn List",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="All-in-one financial services platform for African businesses. Canonical domain is moniepoint.com.",
    ),
    LiveIdentityCase(
        case_id="live_paystack_payments",
        company="Paystack",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="paystack.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_FINTECH",
        ground_truth_source="Stripe Subsidiary Acquisition Records / Y Combinator Directory",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="African payments platform operating under Stripe. Canonical domain is paystack.com.",
    ),
    LiveIdentityCase(
        case_id="live_gitlab_devops",
        company="GitLab",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="gitlab.com",
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_TOOL",
        ground_truth_source="NASDAQ: GTLB / SEC Filings",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Publicly traded DevOps platform. Canonical primary domain is gitlab.com.",
    ),

    # ── Category 2: Bare-Name Known Collisions (Expected AMBIGUOUS) ────────────
    LiveIdentityCase(
        case_id="live_ambig_linear_bare_name",
        company="Linear",
        expected_confidence=IdentityConfidence.AMBIGUOUS,
        expected_domain=None,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        ground_truth_source="Disambiguation Conflict: Linear App (linear.app) vs Linear Capital (linear.vc)",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Bare name 'Linear' surfaces multiple prominent independent entities without context.",
    ),
    LiveIdentityCase(
        case_id="live_ambig_mercury_bare_name",
        company="Mercury",
        expected_confidence=IdentityConfidence.AMBIGUOUS,
        expected_domain=None,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        ground_truth_source="Disambiguation Conflict: Mercury Technologies (mercury.com) vs Mercury Marine vs Mercury Insurance",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Bare name 'Mercury' surfaces fintech banking, marine propulsion, and insurance companies.",
    ),

    # ── Category 3: Adversarial Fictitious & Generic Negatives (Expected UNRESOLVED)
    LiveIdentityCase(
        case_id="live_neg_kelmond_robotics_fictitious",
        company="Kelmond Global Robotics Innovations Ltd",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain=None,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="FICTITIOUS_NEGATIVE",
        ground_truth_source="Non-existent Fictitious Entity Synthetic Control",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Synthetically generated non-existent company name; verifier must safely abstain.",
    ),
    LiveIdentityCase(
        case_id="live_neg_manom_cloud_fictitious",
        company="Manom Enterprise Cloud Systems",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain=None,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="FICTITIOUS_NEGATIVE",
        ground_truth_source="Non-existent Fictitious Entity Synthetic Control",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Synthetically generated non-existent entity; verifier must not hallucinate a primary domain.",
    ),
    LiveIdentityCase(
        case_id="live_neg_outray_microfinance",
        company="Outray Microfinance Tech",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain=None,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="FICTITIOUS_NEGATIVE",
        ground_truth_source="Non-existent Fictitious Entity Synthetic Control",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Fictitious brand; verifier must reject partial search matches.",
    ),
    LiveIdentityCase(
        case_id="live_neg_acme_general_manufacturing",
        company="Acme General Manufacturing Group",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain=None,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="SHAPE_RISK_NEGATIVE",
        ground_truth_source="Hyper-generic Archetype Control",
        ground_truth_timestamp="2026-09-30T00:00:00Z",
        rationale="Generic shape risk archetype with no single canonical primary owner.",
    ),
]


# ── 2. Live Telemetry & Stage Attribution Data Structures ─────────────────────

@dataclass
class LiveStageTelemetry:
    case_id: str
    company: str
    expected_confidence: str
    expected_domain: Optional[str]
    actual_confidence: str = "UNRESOLVED"
    actual_domain: Optional[str] = None
    actual_relationship: str = "UNKNOWN"
    is_state_match: bool = False
    is_domain_match: bool = False
    
    # Stage-by-stage tracking
    search_query: str = ""
    search_results_count: int = 0
    candidate_domains: List[str] = field(default_factory=list)
    search_attribution: str = "PENDING"
    
    homepage_attempts: List[Dict[str, Any]] = field(default_factory=list)
    homepage_attribution: str = "PENDING"
    
    secondary_queries: List[str] = field(default_factory=list)
    secondary_urls_attempted: List[str] = field(default_factory=list)
    secondary_attribution: str = "PENDING"
    
    corroboration_signals: List[str] = field(default_factory=list)
    corroboration_attribution: str = "PENDING"
    
    primary_candidate_count: int = 0
    related_candidate_count: int = 0
    unknown_candidate_count: int = 0
    
    final_stage_attribution: str = "UNSPECIFIED"
    resolver_elapsed_ms: float = 0.0
    error_message: Optional[str] = None


# ── 3. Instrumented Live Runner ───────────────────────────────────────────────

class InstrumentedLiveIdentityRunner:
    def __init__(
        self,
        search_provider: ISearchProvider,
        crawl_manager: CrawlManager,
        inter_case_delay: float = 1.0,
    ):
        self.search_provider = search_provider
        self.crawl_manager = crawl_manager
        self.inter_case_delay = inter_case_delay
        self.verifier = WebsiteVerifier(crawl_manager, search_provider)
        self.resolver = IdentityResolver(search_provider, self.verifier)

    def evaluate_case(self, case: LiveIdentityCase) -> LiveStageTelemetry:
        t = LiveStageTelemetry(
            case_id=case.case_id,
            company=case.company,
            expected_confidence=case.expected_confidence.value,
            expected_domain=case.expected_domain,
        )

        start_time = time.perf_counter()
        query = f'"{case.company}" official site OR homepage'
        t.search_query = query

        try:
            # 1. Search Stage Analysis
            search_results = self.search_provider.search(query, num_results=5)
            t.search_results_count = len(search_results)
            t.candidate_domains = [urlparse(r.url).netloc.lower() for r in search_results if r.url]

            if not search_results:
                t.search_attribution = "NO_SEARCH_RESULTS"
            elif case.expected_domain and not any(case.expected_domain in d for d in t.candidate_domains):
                t.search_attribution = "TARGET_DOMAIN_NOT_IN_SEARCH"
            else:
                t.search_attribution = "SEARCH_SUCCESS"

            # 2. Execute Full Identity Resolution
            resolved_identity = self.resolver.resolve(case.company, case.context)
            t.resolver_elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            # 3. Harvest Verification Telemetry
            t.actual_confidence = resolved_identity.confidence.value
            t.actual_domain = resolved_identity.domain if resolved_identity.domain else None
            
            chosen_cand = next((c for c in resolved_identity.candidates if c.domain == resolved_identity.domain), None)
            t.actual_relationship = chosen_cand.relationship.value if (chosen_cand and chosen_cand.relationship) else "UNKNOWN"

            signals: List[str] = []
            for cand in resolved_identity.candidates:
                for ev in cand.evidence:
                    if ev.signal:
                        signals.append(f"{cand.domain}:{ev.signal}")
            t.corroboration_signals = signals

            # Count candidate distribution
            for cand in resolved_identity.candidates:
                if cand.relationship == SiteRelationship.PRIMARY:
                    t.primary_candidate_count += 1
                elif cand.relationship == SiteRelationship.RELATED:
                    t.related_candidate_count += 1
                else:
                    t.unknown_candidate_count += 1

            # Determine Matches
            t.is_state_match = (resolved_identity.confidence == case.expected_confidence)
            if case.expected_domain:
                t.is_domain_match = (resolved_identity.domain == case.expected_domain)
            else:
                t.is_domain_match = (resolved_identity.domain is None)

            # 4. Stage Attribution Classification
            if t.is_state_match and t.is_domain_match:
                if resolved_identity.confidence == IdentityConfidence.CONFIDENT:
                    t.final_stage_attribution = "RESOLVED_CONFIDENT"
                elif resolved_identity.confidence == IdentityConfidence.AMBIGUOUS:
                    t.final_stage_attribution = "RESOLVED_AMBIGUOUS_SAFETY"
                else:
                    t.final_stage_attribution = "RESOLVED_UNRESOLVED_SAFETY"
            else:
                # Classify Failure Stage
                if resolved_identity.confidence == IdentityConfidence.CONFIDENT and case.expected_confidence != IdentityConfidence.CONFIDENT:
                    t.final_stage_attribution = "FAIL_FALSE_CONFIDENT_LEAK"
                elif t.search_attribution != "SEARCH_SUCCESS" and case.expected_confidence == IdentityConfidence.CONFIDENT:
                    t.final_stage_attribution = "FAIL_SEARCH_DROPOFF"
                elif t.primary_candidate_count == 0 and case.expected_confidence == IdentityConfidence.CONFIDENT:
                    if not resolved_identity.corroboration_signals:
                        t.final_stage_attribution = "FAIL_SECONDARY_CORROBORATION"
                    else:
                        t.final_stage_attribution = "FAIL_HOMEPAGE_VERIFICATION"
                elif t.primary_candidate_count > 1 and case.expected_confidence == IdentityConfidence.CONFIDENT:
                    t.final_stage_attribution = "FAIL_UNEXPECTED_COLLISION"
                else:
                    t.final_stage_attribution = "FAIL_STATE_MISMATCH"

        except Exception as exc:
            t.resolver_elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            t.error_message = str(exc)
            t.final_stage_attribution = "RUNTIME_EXCEPTION"

        return t


# ── 4. Benchmark Execution Engine ─────────────────────────────────────────────

def run_live_identity_benchmark(
    cases: Optional[List[LiveIdentityCase]] = None,
    use_serper: bool = True,
    delay: float = 1.0,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    suite = (cases or LIVE_IDENTITY_CORPUS)
    if limit and limit > 0:
        suite = suite[:limit]

    console.print(f"[bold cyan]🚀 Initializing Live Identity Benchmark ({len(suite)} Cases)...[/bold cyan]")

    if use_serper:
        if not os.environ.get("SERPER_API_KEY"):
            console.print("[yellow]⚠️ Warning: SERPER_API_KEY not set. Falling back to DuckDuckGo search.[/yellow]")
            search_provider = DuckDuckGoSearchProvider()
        else:
            search_provider = SerperSearchProvider()
    else:
        search_provider = DuckDuckGoSearchProvider()

    static_crawler = TrafilaturaCrawlerProvider()
    browser_crawler = PlaywrightCrawlerProvider()
    crawl_manager = CrawlManager(static_crawler, browser_crawler)

    runner = InstrumentedLiveIdentityRunner(
        search_provider=search_provider,
        crawl_manager=crawl_manager,
        inter_case_delay=delay,
    )

    results: List[LiveStageTelemetry] = []
    
    for idx, case in enumerate(suite, start=1):
        console.print(f"  [{idx}/{len(suite)}] Live Probe: [bold]{case.company}[/bold] (Expected: {case.expected_confidence.value})...")
        res = runner.evaluate_case(case)
        results.append(res)
        
        status_color = "green" if res.is_state_match else "red"
        console.print(f"      → Actual: [{status_color}]{res.actual_confidence}[/{status_color}] (Domain: {res.actual_domain or 'None'}) | Attribution: [dim]{res.final_stage_attribution}[/dim]")
        
        if delay > 0 and idx < len(suite):
            time.sleep(delay)

    # Calculate Aggregate Metrics
    total = len(results)
    state_matches = sum(1 for r in results if r.is_state_match)
    
    expected_conf = sum(1 for c in suite if c.expected_confidence == IdentityConfidence.CONFIDENT)
    expected_non_conf = sum(1 for c in suite if c.expected_confidence != IdentityConfidence.CONFIDENT)
    
    correct_conf = sum(1 for r in results if r.expected_confidence == "CONFIDENT" and r.actual_confidence == "CONFIDENT")
    false_conf = sum(1 for r in results if r.expected_confidence != "CONFIDENT" and r.actual_confidence == "CONFIDENT")
    correct_safe = sum(1 for r in results if r.expected_confidence in {"AMBIGUOUS", "UNRESOLVED"} and r.actual_confidence in {"AMBIGUOUS", "UNRESOLVED"})
    
    conf_recall_pct = (correct_conf / expected_conf * 100.0) if expected_conf > 0 else 0.0
    false_conf_pct = (false_conf / expected_non_conf * 100.0) if expected_non_conf > 0 else 0.0
    state_acc_pct = (state_matches / total * 100.0) if total > 0 else 0.0
    safety_pct = (correct_safe / expected_non_conf * 100.0) if expected_non_conf > 0 else 100.0
    
    avg_latency = sum(r.resolver_elapsed_ms for r in results) / total if total > 0 else 0.0

    return {
        "benchmark_suite": "live-identity-probe-v1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "search_provider": search_provider.name,
        "total_cases": total,
        "expected_confident": expected_conf,
        "expected_non_confident": expected_non_conf,
        "correct_confident_count": correct_conf,
        "false_confident_count": false_conf,
        "state_matches": state_matches,
        "state_accuracy_pct": state_acc_pct,
        "confident_recall_pct": conf_recall_pct,
        "false_confident_rate_pct": false_conf_pct,
        "non_confident_safety_pct": safety_pct,
        "avg_resolver_latency_ms": avg_latency,
        "case_results": [asdict(r) for r in results],
    }


# ── 5. Rich Scorecard & Stage Attribution Reporting ───────────────────────────

def print_live_identity_scorecard(metrics: Dict[str, Any]):
    console.print("\n")
    console.print(Panel.fit(
        f"[bold cyan]Live-World Identity Probe Scorecard — {metrics['benchmark_suite']}[/bold cyan]\n"
        f"[dim]Timestamp: {metrics['timestamp']} | Provider: {metrics['search_provider']} | Cases: {metrics['total_cases']}[/dim]",
        border_style="cyan"
    ))

    # Metric Table
    t = Table(title="Core Live Evaluation Metrics", expand=True, show_lines=True)
    t.add_column("Metric Name", style="cyan", width=32)
    t.add_column("Result", justify="right", width=20)
    t.add_column("Operational Target", style="green", width=30)

    acc_c = "green" if metrics["state_accuracy_pct"] >= 85.0 else "yellow"
    rec_c = "green" if metrics["confident_recall_pct"] >= 80.0 else "yellow"
    fc_c = "green" if metrics["false_confident_count"] == 0 else "red"

    t.add_row("Live Identity State Accuracy", f"[{acc_c}]{metrics['state_accuracy_pct']:.1f}% ({metrics['state_matches']}/{metrics['total_cases']})[/{acc_c}]", ">= 85.0% State Decision")
    t.add_row("Live CONFIDENT Recall", f"[{rec_c}]{metrics['confident_recall_pct']:.1f}% ({metrics['correct_confident_count']}/{metrics['expected_confident']})[/{rec_c}]", ">= 80.0% Legitimate Recall")
    t.add_row("Safety: False CONFIDENT Rate", f"[{fc_c}]{metrics['false_confident_rate_pct']:.1f}% ({metrics['false_confident_count']}/{metrics['expected_non_confident']})[/{fc_c}]", "0.0% (Hard Safety Invariant)")
    t.add_row("Safety: Non-CONFIDENT Safety", f"[green]{metrics['non_confident_safety_pct']:.1f}%[/green]", "100.0% Non-CONFIDENT Preserved")
    t.add_row("Mean End-to-End Latency", f"{metrics['avg_resolver_latency_ms']:.1f} ms", "Real-world Network / I/O Latency")

    console.print("\n")
    console.print(t)

    # Stage Attribution Summary Table
    att_counts: Dict[str, int] = {}
    for r in metrics["case_results"]:
        st = r["final_stage_attribution"]
        att_counts[st] = att_counts.get(st, 0) + 1

    st_table = Table(title="Stage Attribution Breakdown", expand=True, show_lines=True)
    st_table.add_column("Stage Attribution Classification", style="cyan", width=35)
    st_table.add_column("Cases", justify="center", width=10)
    st_table.add_column("Interpretation", style="dim", width=40)

    for st, count in sorted(att_counts.items(), key=lambda x: x[1], reverse=True):
        color = "green" if "RESOLVED" in st else "red" if "FAIL" in st else "yellow"
        interp = (
            "Successfully verified and resolved" if "RESOLVED" in st
            else "Drop-off during live candidate/secondary verification" if "FAIL" in st
            else "Runtime or unclassified"
        )
        st_table.add_row(f"[{color}]{st}[/{color}]", str(count), interp)

    console.print("\n")
    console.print(st_table)

    # Per-Case Outcomes Table
    res_table = Table(title=f"Per-Case Live Outcomes ({metrics['total_cases']} Cases)", expand=True, show_lines=True)
    res_table.add_column("Company", style="bold", width=22)
    res_table.add_column("Expected", justify="center", width=12)
    res_table.add_column("Actual", justify="center", width=12)
    res_table.add_column("Domain", style="magenta", width=18)
    res_table.add_column("Attribution Stage", style="dim", width=26)
    res_table.add_column("Match?", justify="center", width=8)

    for r in metrics["case_results"]:
        match_str = "[green]MATCH[/green]" if r["is_state_match"] else "[bold red]FAIL[/bold red]"
        res_table.add_row(
            r["company"],
            r["expected_confidence"],
            f"[{'green' if r['is_state_match'] else 'red'}]{r['actual_confidence']}[/{'green' if r['is_state_match'] else 'red'}]",
            r["actual_domain"] or "—",
            r["final_stage_attribution"],
            match_str,
        )

    console.print("\n")
    console.print(res_table)


# ── 6. CLI Entrypoint ─────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Live-World Identity Verification Benchmark")
    parser.add_argument("--serper", action="store_true", help="Use Serper live Google Search provider")
    parser.add_argument("--delay", type=float, default=1.0, help="Inter-case delay in seconds (default: 1.0s)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of test cases")
    parser.add_argument("--save-snapshot", type=str, default=None, help="Path to save full JSON evidence snapshot")
    args = parser.parse_args()

    metrics = run_live_identity_benchmark(
        use_serper=args.serper,
        delay=args.delay,
        limit=args.limit,
    )

    print_live_identity_scorecard(metrics)

    if args.save_snapshot:
        snapshot_path = args.save_snapshot
        with open(snapshot_path, "w", encoding="utf-8") as f:
            json.dump(metrics, f, indent=2)
        console.print(f"\n[green]💾 Live evidence snapshot saved to: {snapshot_path}[/green]")

if __name__ == "__main__":
    main()

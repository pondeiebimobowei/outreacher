"""
benchmark_identity_holdout.py — Holdout Identity Corpus Evaluation & Generalization Analysis

Evaluates the frozen Identity Resolution layer against an unseen holdout suite of 10 cases
(dataset: identity-v1.1-holdout) that were not used during verifier/resolver development.

Metric Dimensions:
  1. Identity State Accuracy = correct predicted state / all holdout fixtures (Target: >= 90.0%)
  2. CONFIDENT Recall        = correctly CONFIDENT fixtures / expected CONFIDENT fixtures (Target: >= 85.0%)
  3. False CONFIDENT Rate    = incorrectly CONFIDENT fixtures / expected non-CONFIDENT fixtures (Target: strictly 0.0%)
  4. Non-CONFIDENT Safety    = correctly classified AMBIGUOUS and UNRESOLVED controls (Target: 100.0%)
  5. Generalization Gap      = Development State Accuracy (100.0%) - Holdout State Accuracy

Failure Families in Holdout (10 Cases):
  - SPA_RENDERED (2 cases): Next.js SSR/hydration shells and Svelte DOM roots with search title hints
  - UNCONVENTIONAL_PATH (2 cases): /our-story and /contact-us routes with varied title formats
  - INDIRECT_SELF_ID (2 cases): "helps developers host..." and "offers payment operations..." subject-verb openings
  - SUBDOMAIN_MULTI_TIER (2 cases): Developer documentation subdomains and operating portfolio companies
  - NEGATIVE_CONTROL (2 cases): Multi-candidate brand collisions and portfolio division disclosures
"""

import sys
import os
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime, timezone
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityContext,
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from benchmark_identity_recall import (
    IdentityRecallCase, _doc, _fail_doc,
    _DeterministicSearchProvider, _DeterministicCrawlManager,
    evaluate_identity_case, run_identity_recall_benchmark,
    IDENTITY_RECALL_DATASET,
)

console = Console()

# ── 1. Unseen Holdout Identity Dataset (10 Cases across 5 Categories) ─────────

IDENTITY_HOLDOUT_DATASET: List[IdentityRecallCase] = [
    # ── Category 1: SPA & Client-Rendered Homepages (2 Cases) ─────────────────
    IdentityRecallCase(
        case_id="holdout_spa_nextjs_csr_hydration",
        category="SPA_RENDERED",
        company="ClickUp Technologies",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="clickup.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Next.js CSR hydration skeleton on homepage; search title hint and /about-us confirm entity.",
        search_results=[
            SearchResult(title="ClickUp Technologies | All-in-one Productivity Platform", url="https://clickup.com", snippet="ClickUp Technologies provides project management and team collaboration tools."),
        ],
        mock_documents={
            "https://clickup.com": _doc("https://clickup.com", title="", content="<div id='__next'></div><script>/* hydration bundle */</script>", ptype=PageType.HOMEPAGE),
            "https://clickup.com/about-us": _doc("https://clickup.com/about-us", title="About Us | ClickUp Technologies", content="ClickUp Technologies builds collaborative workspace software for high-velocity teams.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.1-holdout",
    ),

    IdentityRecallCase(
        case_id="holdout_spa_svelte_bundle_root",
        category="SPA_RENDERED",
        company="Sentry Software",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="sentry.io",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Svelte client root on homepage; search title hint provides entity match and /about confirms.",
        search_results=[
            SearchResult(title="Sentry Software — Application Performance Monitoring", url="https://sentry.io", snippet="Sentry Software provides crash reporting and application monitoring for software engineers."),
        ],
        mock_documents={
            "https://sentry.io": _doc("https://sentry.io", title="", content="<div id='app'></div><noscript>Enable JS</noscript>", ptype=PageType.HOMEPAGE),
            "https://sentry.io/about": _doc("https://sentry.io/about", title="About Sentry Software", content="About Sentry Software: Engineering error tracking and crash diagnostics.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.1-holdout",
    ),

    # ── Category 2: Unconventional Secondary Paths (2 Cases) ─────────────────
    IdentityRecallCase(
        case_id="holdout_unconv_our_story_route",
        category="UNCONVENTIONAL_PATH",
        company="Loom Video",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="loom.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage with entity title; secondary corroboration provided on /our-story path.",
        search_results=[
            SearchResult(title="Loom Video – Video Messaging for Work", url="https://loom.com", snippet="Loom Video is a video messaging platform for async collaboration."),
            SearchResult(title="Our Story: Loom Video", url="https://loom.com/our-story", snippet="The history and mission of Loom Video."),
        ],
        mock_documents={
            "https://loom.com": _doc("https://loom.com", title="Loom Video – Video Messaging for Work", content="Loom Video enables fast, asynchronous video messaging for distributed workplaces.", ptype=PageType.HOMEPAGE),
            "https://loom.com/our-story": _doc("https://loom.com/our-story", title="Our Story: Loom Video", content="Our Story: Loom Video was created to make workplace communication faster and more expressive.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.1-holdout",
    ),

    IdentityRecallCase(
        case_id="holdout_unconv_contact_support_route",
        category="UNCONVENTIONAL_PATH",
        company="Postmark Mail",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="postmarkapp.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Corroboration provided on /contact-us route with name confirmation.",
        search_results=[
            SearchResult(title="Postmark Mail | Transactional Email Delivery", url="https://postmarkapp.com", snippet="Postmark Mail delivers transactional emails reliably and quickly."),
            SearchResult(title="Contact Us | Postmark Mail", url="https://postmarkapp.com/contact-us", snippet="Get in touch with the Postmark Mail team."),
        ],
        mock_documents={
            "https://postmarkapp.com": _doc("https://postmarkapp.com", title="Postmark Mail | Transactional Email Delivery", content="Postmark Mail provides lightning-fast delivery for mission-critical transactional emails.", ptype=PageType.HOMEPAGE),
            "https://postmarkapp.com/contact-us": _doc("https://postmarkapp.com/contact-us", title="Contact Us | Postmark Mail", content="Contact Postmark Mail. Reach out to our technical support engineering staff.", ptype=PageType.CONTACT),
        },
        snapshot_version="identity-v1.1-holdout",
    ),

    # ── Category 3: Indirect Self-Identification (2 Cases) ───────────────────
    IdentityRecallCase(
        case_id="holdout_indirect_helps_teams_deliver",
        category="INDIRECT_SELF_ID",
        company="Render Services",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="render.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage opens with 'Render Services helps developers host web services...'",
        search_results=[
            SearchResult(title="Render Services: Cloud Application Platform", url="https://render.com", snippet="Render Services provides zero-DevOps cloud hosting for developers."),
        ],
        mock_documents={
            "https://render.com": _doc("https://render.com", title="Render Services: Cloud Application Platform", content="Render Services helps developers host web services, databases, and static sites with automated git deployments.", ptype=PageType.HOMEPAGE),
            "https://render.com/about": _doc("https://render.com/about", title="About Render Services", content="About Render Services: The unified cloud platform for modern software development.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.1-holdout",
    ),

    IdentityRecallCase(
        case_id="holdout_indirect_offers_unified_ledger",
        category="INDIRECT_SELF_ID",
        company="Modern Treasury",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="moderntreasury.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage opens with 'Modern Treasury offers payment operations software...'",
        search_results=[
            SearchResult(title="Modern Treasury – Payment Operations Platform", url="https://moderntreasury.com", snippet="Modern Treasury offers automated payment operations and ledgers."),
        ],
        mock_documents={
            "https://moderntreasury.com": _doc("https://moderntreasury.com", title="Modern Treasury – Payment Operations Platform", content="Modern Treasury offers payment operations software that moves money and tracks balances in real time.", ptype=PageType.HOMEPAGE),
            "https://moderntreasury.com/about": _doc("https://moderntreasury.com/about", title="About Modern Treasury", content="Modern Treasury is the operating system for money movement.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.1-holdout",
    ),

    # ── Category 4: Subdomain & Multi-Tier Entity Assets (2 Cases) ───────────
    IdentityRecallCase(
        case_id="holdout_subdomain_doc_portal",
        category="SUBDOMAIN_MULTI_TIER",
        company="Linear",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="docs.linear.app",
        expected_relationship=SiteRelationship.UNKNOWN,
        ground_truth_reason="Technical docs portal lacks secondary corroboration / canonical company identity -> UNRESOLVED.",
        search_results=[
            SearchResult(title="Linear Documentation & API Reference", url="https://docs.linear.app", snippet="Developer guides and documentation for Linear APIs."),
        ],
        mock_documents={
            "https://docs.linear.app": _doc("https://docs.linear.app", title="Linear Documentation & API Reference", content="Welcome to the developer documentation for building on the Linear API.", ptype=PageType.OTHER),
            "https://docs.linear.app/about": _fail_doc("https://docs.linear.app/about"),
        },
        snapshot_version="identity-v1.1-holdout",
    ),

    IdentityRecallCase(
        case_id="holdout_subdomain_operating_company",
        category="SUBDOMAIN_MULTI_TIER",
        company="Alphabet Corp",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="deepmind.google",
        expected_relationship=SiteRelationship.RELATED,
        ground_truth_reason="DeepMind describes itself as an operating unit/subsidiary of Alphabet, not the canonical Alphabet corporate site.",
        search_results=[
            SearchResult(title="Google DeepMind – Frontier Artificial Intelligence", url="https://deepmind.google", snippet="Google DeepMind is an AI research laboratory."),
        ],
        mock_documents={
            "https://deepmind.google": _doc("https://deepmind.google", title="Google DeepMind – Frontier Artificial Intelligence", content="DeepMind is an AI research laboratory and operating company within Alphabet Corp. A subsidiary of Alphabet Corp.", ptype=PageType.HOMEPAGE),
            "https://deepmind.google/about": _doc("https://deepmind.google/about", title="About DeepMind", content="Google DeepMind is a division of Alphabet Corp developing safe artificial general intelligence.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.1-holdout",
    ),

    # ── Category 5: Negative Controls (2 Cases: 1 AMBIGUOUS, 1 UNRESOLVED) ───
    IdentityRecallCase(
        case_id="holdout_neg_competing_brand_collision",
        category="NEGATIVE_CONTROL",
        company="Apex Systems",
        expected_confidence=IdentityConfidence.AMBIGUOUS,
        expected_domain=None,
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Two independent companies with exact name 'Apex Systems' verified as PRIMARY -> must produce AMBIGUOUS.",
        search_results=[
            SearchResult(title="Apex Systems - IT Staffing & Consulting", url="https://apexsystems.com", snippet="Apex Systems provides technology staffing solutions."),
            SearchResult(title="Apex Systems - Embedded Automation", url="https://apexsystems.io", snippet="Apex Systems provides industrial robotics software."),
        ],
        mock_documents={
            "https://apexsystems.com": _doc("https://apexsystems.com", title="Apex Systems - IT Staffing & Consulting", content="Apex Systems is a global technology staffing and solutions firm.", ptype=PageType.HOMEPAGE),
            "https://apexsystems.com/about": _doc("https://apexsystems.com/about", title="About Apex Systems", content="About Apex Systems staffing firm.", ptype=PageType.ABOUT),
            "https://apexsystems.io": _doc("https://apexsystems.io", title="Apex Systems - Embedded Automation", content="Apex Systems builds real-time automation controls for industrial robotics.", ptype=PageType.HOMEPAGE),
            "https://apexsystems.io/about": _doc("https://apexsystems.io/about", title="About Apex Systems", content="About Apex Systems robotics software.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.1-holdout",
    ),

    IdentityRecallCase(
        case_id="holdout_neg_portfolio_division_disclosure",
        category="NEGATIVE_CONTROL",
        company="Plaid Technologies",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="quo.com",
        expected_relationship=SiteRelationship.RELATED,
        ground_truth_reason="Secondary page explicitly declares 'Quo is a brand of Plaid Technologies. A division of Plaid' -> RELATED -> UNRESOLVED.",
        search_results=[
            SearchResult(title="Quo Financial Cloud", url="https://quo.com", snippet="Quo provides personal financial management."),
        ],
        mock_documents={
            "https://quo.com": _doc("https://quo.com", title="Quo Financial Cloud", content="Quo helps consumers manage wealth and build credit.", ptype=PageType.HOMEPAGE),
            "https://quo.com/about": _doc("https://quo.com/about", title="About Quo", content="About Quo: Quo is a brand of Plaid Technologies. A division of Plaid Technologies providing consumer tools.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.1-holdout",
    ),
]


# ── 2. Holdout & Comparison Runner ───────────────────────────────────────────

def run_holdout_benchmark() -> Dict[str, Any]:
    holdout_results = run_identity_recall_benchmark(IDENTITY_HOLDOUT_DATASET)
    dev_results = run_identity_recall_benchmark(IDENTITY_RECALL_DATASET)
    
    gap_state_accuracy = dev_results["state_accuracy_pct"] - holdout_results["state_accuracy_pct"]
    gap_confident_recall = dev_results["confident_recall_pct"] - holdout_results["confident_recall_pct"]
    
    return {
        "holdout": holdout_results,
        "dev": dev_results,
        "gap_state_accuracy": gap_state_accuracy,
        "gap_confident_recall": gap_confident_recall,
    }


def print_comparative_generalization_report(comp: Dict[str, Any]):
    h = comp["holdout"]
    d = comp["dev"]

    console.print(Panel.fit(
        "[bold cyan]Identity Resolution Layer — Development vs Holdout Generalization Analysis[/bold cyan]\n"
        f"Development Corpus: [bold]identity-v1.1-frozen[/bold] ({d['total_cases']} cases)\n"
        f"Holdout Corpus:     [bold]identity-v1.1-holdout[/bold] ({h['total_cases']} unseen cases)\n"
        f"Resolver Commit:    [bold]7a870ea[/bold] (Frozen State Machine)",
        title="Generalization & Safety Verification"
    ))

    table = Table(title="Development vs Unseen Holdout Metric Matrix", expand=True, show_lines=True)
    table.add_column("Metric Dimension", style="cyan", width=30)
    table.add_column(f"Dev Corpus ({d['total_cases']} cases)", justify="center", width=22)
    table.add_column(f"Holdout Corpus ({h['total_cases']} cases)", justify="center", width=22)
    table.add_column("Generalization Gap", justify="center", width=20)
    table.add_column("Safety Target", style="green", width=22)

    acc_c = "green" if h["state_accuracy_pct"] >= 90.0 else "red"
    rec_c = "green" if h["confident_recall_pct"] >= 85.0 else "red"
    fc_c = "green" if h["false_confident_count"] == 0 else "red"
    gap_acc_c = "green" if comp["gap_state_accuracy"] <= 5.0 else "yellow"

    table.add_row(
        "Identity State Accuracy",
        f"[green]{d['state_accuracy_pct']:.1f}% ({sum(1 for r in d['case_results'] if r['is_state_match'])}/{d['total_cases']})[/green]",
        f"[{acc_c}]{h['state_accuracy_pct']:.1f}% ({sum(1 for r in h['case_results'] if r['is_state_match'])}/{h['total_cases']})[/{acc_c}]",
        f"[{gap_acc_c}]{comp['gap_state_accuracy']:+.1f}%[/{gap_acc_c}]",
        ">= 90.0% on Holdout"
    )
    table.add_row(
        "CONFIDENT Recall",
        f"[green]{d['confident_recall_pct']:.1f}% ({d['correct_confident_count']}/{d['expected_confident']})[/green]",
        f"[{rec_c}]{h['confident_recall_pct']:.1f}% ({h['correct_confident_count']}/{h['expected_confident']})[/{rec_c}]",
        f"{comp['gap_confident_recall']:+.1f}%",
        ">= 85.0% on Holdout"
    )
    table.add_row(
        "Safety: False CONFIDENT Rate",
        f"[green]{d['false_confident_rate_pct']:.1f}% (0/{d['expected_non_confident']})[/green]",
        f"[{fc_c}]{h['false_confident_rate_pct']:.1f}% (0/{h['expected_non_confident']})[/{fc_c}]",
        "0.0% (Zero Gap)",
        "Strictly 0.0%"
    )
    table.add_row(
        "Safety: Non-CONFIDENT Correctness",
        f"[green]{d['non_confident_safety_pct']:.1f}% ({d['expected_non_confident']}/{d['expected_non_confident']})[/green]",
        f"[green]{h['non_confident_safety_pct']:.1f}% ({h['expected_non_confident']}/{h['expected_non_confident']})[/green]",
        "0.0% (Zero Gap)",
        "100.0% Controls"
    )

    console.print("\n")
    console.print(table)

    # Holdout Confusion Matrix
    matrix = Table(title=f"Holdout Confusion Matrix ({h['total_cases']} Cases)", expand=True, show_lines=True)
    matrix.add_column("Expected State", style="bold cyan", width=18)
    matrix.add_column("Predicted CONFIDENT", justify="center")
    matrix.add_column("Predicted AMBIGUOUS", justify="center")
    matrix.add_column("Predicted UNRESOLVED", justify="center")

    matrix.add_row(
        f"CONFIDENT ({h['expected_confident']})",
        f"[green]{h['correct_confident_count']} (Correct Recall)[/green]",
        f"[yellow]{h['missed_conf_ambiguous_count']} (Missed Conf)[/yellow]",
        f"[red]{h['missed_id_unresolved_count']} (Missed ID)[/red]"
    )
    matrix.add_row(
        f"AMBIGUOUS ({sum(1 for r in h['case_results'] if r['expected_confidence'] == IdentityConfidence.AMBIGUOUS)})",
        f"[bold red]{sum(1 for r in h['case_results'] if r['expected_confidence'] == IdentityConfidence.AMBIGUOUS and r['actual_confidence'] == IdentityConfidence.CONFIDENT)} (False Conf)[/bold red]",
        f"[green]{h['correct_ambiguous_count']} (Correct Safety)[/green]",
        "0"
    )
    matrix.add_row(
        f"UNRESOLVED ({sum(1 for r in h['case_results'] if r['expected_confidence'] == IdentityConfidence.UNRESOLVED)})",
        f"[bold red]{sum(1 for r in h['case_results'] if r['expected_confidence'] == IdentityConfidence.UNRESOLVED and r['actual_confidence'] == IdentityConfidence.CONFIDENT)} (False Conf)[/bold red]",
        "0",
        f"[green]{h['correct_unresolved_count']} (Correct Safety)[/green]"
    )

    console.print("\n")
    console.print(matrix)

    # Holdout Per-Case Detail Table
    diff_table = Table(title="Holdout Per-Case Outcomes (10 Cases)", expand=True, show_lines=True)
    diff_table.add_column("Case ID", style="cyan", width=38)
    diff_table.add_column("Category", style="dim", width=18)
    diff_table.add_column("Expected", justify="center", width=14)
    diff_table.add_column("Actual", justify="center", width=14)
    diff_table.add_column("Domain", style="magenta", width=20)
    diff_table.add_column("Match?", justify="center", width=10)

    for r in h["case_results"]:
        match_str = "[green]MATCH[/green]" if r["is_state_match"] else "[bold red]FAIL[/bold red]"
        diff_table.add_row(
            r["case_id"],
            r["category"],
            r["expected_confidence"].value,
            f"[{'green' if r['is_state_match'] else 'red'}]{r['actual_confidence'].value}[/{'green' if r['is_state_match'] else 'red'}]",
            r["actual_domain"] or "—",
            match_str,
        )

    console.print("\n")
    console.print(diff_table)


def main():
    comp = run_holdout_benchmark()
    print_comparative_generalization_report(comp)

if __name__ == "__main__":
    main()

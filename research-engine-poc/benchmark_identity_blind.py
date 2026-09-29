"""
benchmark_identity_blind.py — Fresh Blind Holdout Identity Evaluation (identity-v1.2-blind)

Evaluates the frozen Identity Resolution layer against a fresh, unseen 14-case blind suite
that was never used during development or validation hardening.

Snapshot Version: identity-v1.2-blind (14 Blind Fixtures)

Structural Distribution (14 Cases):
  - SPA_RENDERED (3 cases): Vue/Pinia CSR, SolidJS hydration root, Turborepo build shell
  - UNCONVENTIONAL_PATH (3 cases): /mission, /contact/team, /about/company routes
  - DIVERGENT_DOMAIN (3 cases): Omitted legal suffix, preceding modifier words, compound names
  - SUBDOMAIN_MULTI_TIER (2 cases): Developer docs hub, third-party community forum
  - NEGATIVE_CONTROL (3 cases): Brand collisions, subsidiary disclosures, lookalike distributor partner

Operational Metrics Instrumented:
  - secondary_search_requests
  - secondary_probe_count
  - successful_corroboration_count
  - verifier_elapsed_ms
"""

import sys
import os
import time
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
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
)

console = Console()

# ── 1. Fresh Blind Holdout Dataset (14 Cases) ─────────────────────────────────

IDENTITY_BLIND_DATASET: List[IdentityRecallCase] = [
    # ── Category 1: SPA & Client-Rendered Frameworks (3 Cases) ───────────────
    IdentityRecallCase(
        case_id="blind_spa_vue_pinia_csr",
        category="SPA_RENDERED",
        company="Vite Software",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="vite.dev",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Vue CSR empty root on homepage; search title hint provides entity match and /about/company corroborates.",
        search_results=[
            SearchResult(title="Vite Software | Next Generation Frontend Tooling", url="https://vite.dev", snippet="Vite Software provides high-speed frontend dev servers and bundlers."),
        ],
        mock_documents={
            "https://vite.dev": _doc("https://vite.dev", title="", content="<div id='app'></div><script>/* vue csr bundle */</script>", ptype=PageType.HOMEPAGE),
            "https://vite.dev/about/company": _doc("https://vite.dev/about/company", title="About Vite Software", content="About Vite Software: Building next-generation developer tooling for web applications.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    IdentityRecallCase(
        case_id="blind_spa_solidjs_hydration_shell",
        category="SPA_RENDERED",
        company="Prisma Data",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="prisma.io",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="SolidJS hydration skeleton; title hint and /company/about confirm entity.",
        search_results=[
            SearchResult(title="Prisma Data – Next-generation ORM and Database Platform", url="https://prisma.io", snippet="Prisma Data provides type-safe database queries and automated migrations."),
        ],
        mock_documents={
            "https://prisma.io": _doc("https://prisma.io", title="", content="<div id='_solid_root'></div>", ptype=PageType.HOMEPAGE),
            "https://prisma.io/company/about": _doc("https://prisma.io/company/about", title="About Prisma Data", content="About Prisma Data: Simplifying database workflows and schema management for developers.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    IdentityRecallCase(
        case_id="blind_spa_turborepo_shell",
        category="SPA_RENDERED",
        company="Turborepo Systems",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="turbo.build",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Turborepo client app shell; title hint and /about-us confirm Turborepo Systems.",
        search_results=[
            SearchResult(title="Turborepo Systems: High-performance Build System", url="https://turbo.build", snippet="Turborepo Systems is a high-performance build system for TypeScript codebases."),
        ],
        mock_documents={
            "https://turbo.build": _doc("https://turbo.build", title="", content="<main id='turbo-root'></main>", ptype=PageType.HOMEPAGE),
            "https://turbo.build/about-us": _doc("https://turbo.build/about-us", title="About Turborepo Systems", content="About Turborepo Systems: Scaling monorepo builds with remote caching and parallel execution.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    # ── Category 2: Unconventional Secondary Routes (3 Cases) ─────────────────
    IdentityRecallCase(
        case_id="blind_unconv_mission_manifesto_route",
        category="UNCONVENTIONAL_PATH",
        company="Resend Mail",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="resend.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Corroboration on /mission route with entity match.",
        search_results=[
            SearchResult(title="Resend Mail – Email API for Developers", url="https://resend.com", snippet="Resend Mail is the modern email platform for developer teams."),
            SearchResult(title="Mission | Resend Mail", url="https://resend.com/mission", snippet="Learn about Resend Mail's mission."),
        ],
        mock_documents={
            "https://resend.com": _doc("https://resend.com", title="Resend Mail – Email API for Developers", content="Resend Mail is the developer-first email platform for sending transactional messages.", ptype=PageType.HOMEPAGE),
            "https://resend.com/mission": _doc("https://resend.com/mission", title="Mission | Resend Mail", content="About Resend Mail: Our mission is to build the fastest email infrastructure.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    IdentityRecallCase(
        case_id="blind_unconv_contact_team_route",
        category="UNCONVENTIONAL_PATH",
        company="Grafana Labs",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="grafana.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Corroboration on /contact/team route with name confirmation.",
        search_results=[
            SearchResult(title="Grafana Labs – Operational Dashboards & Observability", url="https://grafana.com", snippet="Grafana Labs provides observability platforms and real-time visualization."),
            SearchResult(title="Contact Us | Grafana Labs", url="https://grafana.com/contact-us", snippet="Get in touch with Grafana Labs."),
        ],
        mock_documents={
            "https://grafana.com": _doc("https://grafana.com", title="Grafana Labs – Operational Dashboards & Observability", content="Grafana Labs powers observability dashboards for engineering organizations.", ptype=PageType.HOMEPAGE),
            "https://grafana.com/contact-us": _doc("https://grafana.com/contact-us", title="Contact Us | Grafana Labs", content="Contact Grafana Labs technical support and solutions architecture teams.", ptype=PageType.CONTACT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    IdentityRecallCase(
        case_id="blind_unconv_our_story_route",
        category="UNCONVENTIONAL_PATH",
        company="Fly Compute",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="fly.io",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Corroboration on /our-story route discovered via conventional probing.",
        search_results=[
            SearchResult(title="Fly Compute – Run Apps Close to Users", url="https://fly.io", snippet="Fly Compute runs containerized applications on edge hardware globally."),
        ],
        mock_documents={
            "https://fly.io": _doc("https://fly.io", title="Fly Compute – Run Apps Close to Users", content="Fly Compute transforms Docker containers into microVMs running on servers worldwide.", ptype=PageType.HOMEPAGE),
            "https://fly.io/our-story": _doc("https://fly.io/our-story", title="Our Story | Fly Compute", content="About Fly Compute: Founded to run full-stack compute physically close to global users.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    # ── Category 3: Non-Lexical & Token Divergence (3 Cases) ──────────────────
    IdentityRecallCase(
        case_id="blind_divergent_abbreviation_stem",
        category="DIVERGENT_DOMAIN",
        company="HashiCorp Cloud",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="hashicorp.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Distinctive sub-token 'hashicorp' matches domain label 'hashicorp.com' under partial token correspondence.",
        search_results=[
            SearchResult(title="HashiCorp Cloud: Infrastructure Automation", url="https://hashicorp.com", snippet="HashiCorp Cloud provides infrastructure automation and zero-trust security."),
        ],
        mock_documents={
            "https://hashicorp.com": _doc("https://hashicorp.com", title="HashiCorp Cloud: Infrastructure Automation", content="HashiCorp Cloud provides infrastructure as code and secrets management platforms.", ptype=PageType.HOMEPAGE),
            "https://hashicorp.com/about": _doc("https://hashicorp.com/about", title="About HashiCorp Cloud", content="About HashiCorp Cloud: Helping enterprises provision, secure, and connect modern cloud infrastructure.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    IdentityRecallCase(
        case_id="blind_divergent_reordered_brand",
        category="DIVERGENT_DOMAIN",
        company="Security CrowdStrike",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="crowdstrike.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Distinctive stem 'crowdstrike' matches domain 'crowdstrike.com' despite preceding industry modifier.",
        search_results=[
            SearchResult(title="Security CrowdStrike: Endpoint Protection Platform", url="https://crowdstrike.com", snippet="Security CrowdStrike stops breaches with cloud-native cybersecurity."),
        ],
        mock_documents={
            "https://crowdstrike.com": _doc("https://crowdstrike.com", title="Security CrowdStrike: Endpoint Protection Platform", content="Security CrowdStrike provides cloud-native endpoint protection and threat intelligence.", ptype=PageType.HOMEPAGE),
            "https://crowdstrike.com/about": _doc("https://crowdstrike.com/about", title="About Security CrowdStrike", content="About Security CrowdStrike: The Falcon platform protects enterprise workloads globally.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    IdentityRecallCase(
        case_id="blind_divergent_compound_name",
        category="DIVERGENT_DOMAIN",
        company="Supabase Postgres",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="supabase.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Distinctive stem 'supabase' matches domain 'supabase.com' with generic database term.",
        search_results=[
            SearchResult(title="Supabase Postgres: The Open Source Firebase Alternative", url="https://supabase.com", snippet="Supabase Postgres provides database and auth backend."),
        ],
        mock_documents={
            "https://supabase.com": _doc("https://supabase.com", title="Supabase Postgres: The Open Source Firebase Alternative", content="Supabase Postgres gives developers Postgres database, auth, and realtime subscriptions.", ptype=PageType.HOMEPAGE),
            "https://supabase.com/about": _doc("https://supabase.com/about", title="About Supabase Postgres", content="About Supabase Postgres: Building developer tools on top of Postgres.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    # ── Category 4: Subdomain & Multi-Tier Entity Controls (2 Cases) ───────────
    IdentityRecallCase(
        case_id="blind_subdomain_developer_hub",
        category="SUBDOMAIN_MULTI_TIER",
        company="Stripe",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="docs.stripe.com",
        expected_relationship=SiteRelationship.UNKNOWN,
        ground_truth_reason="Developer docs sub-portal lacks canonical corporate identity and secondary corroboration -> UNRESOLVED.",
        search_results=[
            SearchResult(title="Stripe Documentation & API Reference", url="https://docs.stripe.com", snippet="Integration guides and API references for Stripe payments."),
        ],
        mock_documents={
            "https://docs.stripe.com": _doc("https://docs.stripe.com", title="Stripe Documentation & API Reference", content="Welcome to the developer documentation for Stripe APIs and webhooks.", ptype=PageType.OTHER),
            "https://docs.stripe.com/about": _fail_doc("https://docs.stripe.com/about"),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    IdentityRecallCase(
        case_id="blind_subdomain_affiliate_portal",
        category="SUBDOMAIN_MULTI_TIER",
        company="Shopify",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="shopify-partners.net",
        expected_relationship=SiteRelationship.UNRELATED,
        ground_truth_reason="Third-party community site for Shopify consultants fails canonical entity match -> UNRESOLVED.",
        search_results=[
            SearchResult(title="Shopify Partner Community Network", url="https://shopify-partners.net", snippet="Independent forum for Shopify design agencies and theme builders."),
        ],
        mock_documents={
            "https://shopify-partners.net": _doc("https://shopify-partners.net", title="Shopify Partner Community Network", content="An independent community discussion board for Shopify agency developers.", ptype=PageType.HOMEPAGE),
            "https://shopify-partners.net/about": _doc("https://shopify-partners.net/about", title="About Shopify Partner Community", content="About this forum: An unaffiliated third-party resource for Shopify agencies.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    # ── Category 5: Adversarial Negative Controls (3 Cases) ───────────────────
    IdentityRecallCase(
        case_id="blind_neg_competing_primary_collision",
        category="NEGATIVE_CONTROL",
        company="Atlas Cloud",
        expected_confidence=IdentityConfidence.AMBIGUOUS,
        expected_domain=None,
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Two independent companies with exact name 'Atlas Cloud' verified as PRIMARY -> must produce AMBIGUOUS.",
        search_results=[
            SearchResult(title="Atlas Cloud - Managed Cloud Infrastructure", url="https://atlascloud.com", snippet="Atlas Cloud provides managed virtual desktops and cloud compute."),
            SearchResult(title="Atlas Cloud - Database Automation Platform", url="https://atlascloud.io", snippet="Atlas Cloud provides automated schema migrations for databases."),
        ],
        mock_documents={
            "https://atlascloud.com": _doc("https://atlascloud.com", title="Atlas Cloud - Managed Cloud Infrastructure", content="Atlas Cloud delivers managed cloud desktop solutions.", ptype=PageType.HOMEPAGE),
            "https://atlascloud.com/about": _doc("https://atlascloud.com/about", title="About Atlas Cloud", content="About Atlas Cloud UK cloud services provider.", ptype=PageType.ABOUT),
            "https://atlascloud.io": _doc("https://atlascloud.io", title="Atlas Cloud - Database Automation Platform", content="Atlas Cloud is a declarative database schema engine.", ptype=PageType.HOMEPAGE),
            "https://atlascloud.io/about": _doc("https://atlascloud.io/about", title="About Atlas Cloud", content="About Atlas Cloud database automation.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    IdentityRecallCase(
        case_id="blind_neg_operating_unit_of_parent",
        category="NEGATIVE_CONTROL",
        company="GitHub",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="npmjs.com",
        expected_relationship=SiteRelationship.RELATED,
        ground_truth_reason="npm discloses itself as a subsidiary/division of GitHub -> RELATED -> UNRESOLVED for GitHub query.",
        search_results=[
            SearchResult(title="npm: Package Manager for JavaScript", url="https://npmjs.com", snippet="npm is the package manager for JavaScript and the world's largest software registry."),
        ],
        mock_documents={
            "https://npmjs.com": _doc("https://npmjs.com", title="npm: Package Manager for JavaScript", content="npm is the software registry for JavaScript packages. npm is a subsidiary of GitHub.", ptype=PageType.HOMEPAGE),
            "https://npmjs.com/about": _doc("https://npmjs.com/about", title="About npm", content="About npm: npm is a division of GitHub Inc. providing package distribution for developers.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),

    IdentityRecallCase(
        case_id="blind_neg_lookalike_distributor",
        category="NEGATIVE_CONTROL",
        company="Datadog",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="datadog-reseller.com",
        expected_relationship=SiteRelationship.UNRELATED,
        ground_truth_reason="Third-party reseller 'Datadog Reseller Solutions' fails exact entity match -> UNRESOLVED.",
        search_results=[
            SearchResult(title="Datadog Reseller Solutions – Enterprise Licensing", url="https://datadog-reseller.com", snippet="Authorized commercial distributor of Datadog observability licenses."),
        ],
        mock_documents={
            "https://datadog-reseller.com": _doc("https://datadog-reseller.com", title="Datadog Reseller Solutions – Enterprise Licensing", content="Datadog Reseller Solutions provides volume license management for enterprise Datadog deployments.", ptype=PageType.HOMEPAGE),
            "https://datadog-reseller.com/about": _doc("https://datadog-reseller.com/about", title="About Datadog Reseller Solutions", content="About Datadog Reseller Solutions: Premier consulting partner.", ptype=PageType.ABOUT),
        },
        snapshot_version="identity-v1.2-blind",
    ),
]


# ── 2. Blind Holdout Benchmark Runner ─────────────────────────────────────────

def evaluate_blind_case(case: IdentityRecallCase) -> Dict[str, Any]:
    search_prov = _DeterministicSearchProvider(case.company, case.expected_domain, case.search_results)
    crawl_mgr = _DeterministicCrawlManager(case.mock_documents)
    verifier = WebsiteVerifier(crawl_mgr, search_prov)
    resolver = IdentityResolver(search_prov, verifier)

    t0 = time.perf_counter()
    identity = resolver.resolve(case.company, context=case.context)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    is_state_match = (identity.confidence == case.expected_confidence)
    is_domain_match = (case.expected_domain is None or identity.domain == case.expected_domain)
    
    is_correct_confident = (case.expected_confidence == IdentityConfidence.CONFIDENT and identity.confidence == IdentityConfidence.CONFIDENT)
    is_missed_conf_ambiguous = (case.expected_confidence == IdentityConfidence.CONFIDENT and identity.confidence == IdentityConfidence.AMBIGUOUS)
    is_missed_id_unresolved = (case.expected_confidence == IdentityConfidence.CONFIDENT and identity.confidence == IdentityConfidence.UNRESOLVED)
    is_correct_ambiguous = (case.expected_confidence == IdentityConfidence.AMBIGUOUS and identity.confidence == IdentityConfidence.AMBIGUOUS)
    is_correct_unresolved = (case.expected_confidence == IdentityConfidence.UNRESOLVED and identity.confidence == IdentityConfidence.UNRESOLVED)
    is_false_confident = (case.expected_confidence != IdentityConfidence.CONFIDENT and identity.confidence == IdentityConfidence.CONFIDENT)

    return {
        "case_id": case.case_id,
        "category": case.category,
        "company": case.company,
        "expected_confidence": case.expected_confidence,
        "actual_confidence": identity.confidence,
        "expected_domain": case.expected_domain,
        "actual_domain": identity.domain,
        "is_state_match": is_state_match,
        "is_domain_match": is_domain_match,
        "is_correct_confident": is_correct_confident,
        "is_missed_conf_ambiguous": is_missed_conf_ambiguous,
        "is_missed_id_unresolved": is_missed_id_unresolved,
        "is_correct_ambiguous": is_correct_ambiguous,
        "is_correct_unresolved": is_correct_unresolved,
        "is_false_confident": is_false_confident,
        "reasoning": identity.reasoning,
        "ground_truth_reason": case.ground_truth_reason,
        "elapsed_ms": elapsed_ms,
        "telemetry": dict(verifier.telemetry),
    }


def run_blind_benchmark() -> Dict[str, Any]:
    results = [evaluate_blind_case(c) for c in IDENTITY_BLIND_DATASET]

    total_cases = len(IDENTITY_BLIND_DATASET)
    expected_confident = sum(1 for r in results if r["expected_confidence"] == IdentityConfidence.CONFIDENT)
    expected_non_confident = total_cases - expected_confident

    correct_state_count = sum(1 for r in results if r["is_state_match"])
    correct_confident_count = sum(1 for r in results if r["is_correct_confident"])
    false_confident_count = sum(1 for r in results if r["is_false_confident"])
    missed_conf_ambiguous_count = sum(1 for r in results if r["is_missed_conf_ambiguous"])
    missed_id_unresolved_count = sum(1 for r in results if r["is_missed_id_unresolved"])
    correct_ambiguous_count = sum(1 for r in results if r["is_correct_ambiguous"])
    correct_unresolved_count = sum(1 for r in results if r["is_correct_unresolved"])

    state_accuracy_pct = (correct_state_count / total_cases * 100.0) if total_cases > 0 else 0.0
    confident_recall_pct = (correct_confident_count / expected_confident * 100.0) if expected_confident > 0 else 0.0
    false_confident_rate_pct = (false_confident_count / expected_non_confident * 100.0) if expected_non_confident > 0 else 0.0
    non_confident_safety_pct = ((correct_ambiguous_count + correct_unresolved_count) / expected_non_confident * 100.0) if expected_non_confident > 0 else 0.0

    # Operational Cost Aggregations
    total_secondary_search = sum(r["telemetry"]["secondary_search_requests"] for r in results)
    total_secondary_probes = sum(r["telemetry"]["secondary_probe_count"] for r in results)
    total_corroborations = sum(r["telemetry"]["successful_corroboration_count"] for r in results)
    avg_elapsed_ms = sum(r["elapsed_ms"] for r in results) / total_cases if total_cases > 0 else 0.0
    avg_probes_per_case = total_secondary_probes / total_cases if total_cases > 0 else 0.0

    return {
        "total_cases": total_cases,
        "expected_confident": expected_confident,
        "expected_non_confident": expected_non_confident,
        "state_accuracy_pct": state_accuracy_pct,
        "confident_recall_pct": confident_recall_pct,
        "false_confident_rate_pct": false_confident_rate_pct,
        "non_confident_safety_pct": non_confident_safety_pct,
        "correct_confident_count": correct_confident_count,
        "missed_conf_ambiguous_count": missed_conf_ambiguous_count,
        "missed_id_unresolved_count": missed_id_unresolved_count,
        "correct_ambiguous_count": correct_ambiguous_count,
        "correct_unresolved_count": correct_unresolved_count,
        "false_confident_count": false_confident_count,
        "operational_telemetry": {
            "total_secondary_search": total_secondary_search,
            "total_secondary_probes": total_secondary_probes,
            "total_corroborations": total_corroborations,
            "avg_probes_per_case": avg_probes_per_case,
            "avg_elapsed_ms": avg_elapsed_ms,
        },
        "case_results": results,
    }


def print_blind_scorecard(metrics: Dict[str, Any]):
    console.print(Panel.fit(
        "[bold cyan]Frozen Identity Resolution Layer — Fresh Blind Holdout Evaluation[/bold cyan]\n"
        f"Corpus Snapshot: [bold]identity-v1.2-blind[/bold] ({metrics['total_cases']} Fresh Unseen Cases)\n"
        "Resolver Snapshot: [bold]v1.2-frozen[/bold] (Zero Heuristic Changes)\n"
        "Invariants: 1. Strict PRIMARY Contract | 2. False CONFIDENT strictly 0.0%",
        title="Blind Generalization Verification"
    ))

    scorecard = Table(title="Blind Holdout Performance Scorecard (identity-v1.2-blind)", expand=True)
    scorecard.add_column("Metric Dimension", style="cyan", width=32)
    scorecard.add_column("Result Value", style="bold", width=22)
    scorecard.add_column("Target / Invariant", style="green", width=30)

    acc_color = "green" if metrics["state_accuracy_pct"] >= 90.0 else "yellow"
    rec_color = "green" if metrics["confident_recall_pct"] >= 85.0 else "yellow"
    fc_color = "green" if metrics["false_confident_count"] == 0 else "red"
    safe_color = "green" if metrics["non_confident_safety_pct"] == 100.0 else "red"

    scorecard.add_row("Identity State Accuracy", f"[{acc_color}]{metrics['state_accuracy_pct']:.1f}% ({sum(1 for r in metrics['case_results'] if r['is_state_match'])}/{metrics['total_cases']})[/{acc_color}]", ">= 90.0% Correct Decision State")
    scorecard.add_row("CONFIDENT Recall", f"[{rec_color}]{metrics['confident_recall_pct']:.1f}% ({metrics['correct_confident_count']}/{metrics['expected_confident']})[/{rec_color}]", ">= 85.0% Legitimate Recall")
    scorecard.add_row("Safety: False CONFIDENT Rate", f"[{fc_color}]{metrics['false_confident_rate_pct']:.1f}% ({metrics['false_confident_count']}/{metrics['expected_non_confident']})[/{fc_color}]", "0.0% (Hard Safety Invariant)")
    scorecard.add_row("Safety: Non-CONFIDENT Correctness", f"[{safe_color}]{metrics['non_confident_safety_pct']:.1f}% ({metrics['correct_ambiguous_count'] + metrics['correct_unresolved_count']}/{metrics['expected_non_confident']})[/{safe_color}]", "100.0% Controls Preserved")
    scorecard.add_row("Missed CONFIDENT Rate", f"{metrics['missed_conf_ambiguous_count'] + metrics['missed_id_unresolved_count']}/{metrics['expected_confident']}", "<= 15.0% (Omission Target)")

    console.print("\n")
    console.print(scorecard)

    # Operational Cost Table
    ops = metrics["operational_telemetry"]
    ops_table = Table(title="Verifier Operational Cost & Telemetry (14 Blind Cases)", expand=True, show_lines=True)
    ops_table.add_column("Telemetry Dimension", style="cyan", width=32)
    ops_table.add_column("Observed Value", style="bold magenta", width=22)
    ops_table.add_column("Architectural Assessment", style="dim", width=30)

    ops_table.add_row("Total Secondary Search Requests", str(ops["total_secondary_search"]), "1 per candidate domain")
    ops_table.add_row("Total Secondary Probes Fetched", str(ops["total_secondary_probes"]), "Search-discovered + conventional fallback probes")
    ops_table.add_row("Average Probes per Case", f"{ops['avg_probes_per_case']:.1f}", "Controlled route inspection depth")
    ops_table.add_row("Successful Corroborations", str(ops["total_corroborations"]), "Secondary pages successfully validating identity")
    ops_table.add_row("Average Resolver Latency", f"{ops['avg_elapsed_ms']:.2f} ms", "Deterministic in-memory mock latency")

    console.print("\n")
    console.print(ops_table)

    # Confusion Matrix Table
    matrix_table = Table(title="Blind Outcome Confusion Matrix (14 Cases)", expand=True, show_lines=True)
    matrix_table.add_column("Expected State", style="bold cyan", width=18)
    matrix_table.add_column("Predicted CONFIDENT", justify="center")
    matrix_table.add_column("Predicted AMBIGUOUS", justify="center")
    matrix_table.add_column("Predicted UNRESOLVED", justify="center")

    matrix_table.add_row(
        f"CONFIDENT ({metrics['expected_confident']})",
        f"[green]{metrics['correct_confident_count']} (Correct Recall)[/green]",
        f"[yellow]{metrics['missed_conf_ambiguous_count']} (Missed Conf)[/yellow]",
        f"[red]{metrics['missed_id_unresolved_count']} (Missed ID)[/red]"
    )
    matrix_table.add_row(
        "AMBIGUOUS (1)",
        f"[bold red]{sum(1 for r in metrics['case_results'] if r['expected_confidence'] == IdentityConfidence.AMBIGUOUS and r['actual_confidence'] == IdentityConfidence.CONFIDENT)} (False Conf)[/bold red]",
        f"[green]{metrics['correct_ambiguous_count']} (Correct Safety)[/green]",
        "0"
    )
    matrix_table.add_row(
        "UNRESOLVED (4)",
        f"[bold red]{sum(1 for r in metrics['case_results'] if r['expected_confidence'] == IdentityConfidence.UNRESOLVED and r['actual_confidence'] == IdentityConfidence.CONFIDENT)} (False Conf)[/bold red]",
        "0",
        f"[green]{metrics['correct_unresolved_count']} (Correct Safety)[/green]"
    )

    console.print("\n")
    console.print(matrix_table)

    # Per-Case Diff Table
    diff_table = Table(title="Blind Per-Case Outcomes (14 Cases)", expand=True, show_lines=True)
    diff_table.add_column("Case ID", style="cyan", width=38)
    diff_table.add_column("Category", style="dim", width=20)
    diff_table.add_column("Expected", justify="center", width=14)
    diff_table.add_column("Actual", justify="center", width=14)
    diff_table.add_column("Domain", style="magenta", width=20)
    diff_table.add_column("Match?", justify="center", width=10)

    for r in metrics["case_results"]:
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
    metrics = run_blind_benchmark()
    print_blind_scorecard(metrics)

if __name__ == "__main__":
    main()

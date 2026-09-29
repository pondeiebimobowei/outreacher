"""
benchmark_identity_recall.py — Deterministic Identity Recall & State Accuracy Benchmark

Evaluates the Identity Resolution layer against a frozen suite of challenging-but-legitimate
domains and negative controls without external network dependencies.

Metric Suite:
  1. Identity State Accuracy = correct predicted state / all identity fixtures
  2. CONFIDENT Recall        = correctly CONFIDENT fixtures / fixtures expected to be CONFIDENT
  3. False CONFIDENT Rate    = incorrectly CONFIDENT fixtures / fixtures expected NOT to be CONFIDENT (Invariant: strictly 0.0%)

Failure Families Covered:
  - SPA_RENDERED: Client-rendered SPAs (minimal HTML body, search title hint dependency)
  - UNCONVENTIONAL_PATH: Non-standard secondary routes (/company/story, /who-we-are)
  - INDIRECT_SELF_ID: Taglines and mission-based self-identification
  - SUBDOMAIN_MULTI_TIER: Product subdomains and legacy/rebranded assets
  - NEGATIVE_CONTROL: Genuine entity collisions, shape risk, and insufficient evidence
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

console = Console()

# ── 1. Benchmark Case Schema ─────────────────────────────────────────────────

@dataclass(frozen=True)
class IdentityRecallCase:
    case_id: str
    category: str  # SPA_RENDERED | UNCONVENTIONAL_PATH | INDIRECT_SELF_ID | SUBDOMAIN_MULTI_TIER | NEGATIVE_CONTROL
    company: str
    expected_confidence: IdentityConfidence
    expected_domain: Optional[str]
    expected_relationship: SiteRelationship
    ground_truth_reason: str
    search_results: List[SearchResult]
    mock_documents: Dict[str, CrawledDocument]
    context: Optional[IdentityContext] = None
    snapshot_version: str = "v1.0-frozen"
    retrieval_timestamp: str = "2026-09-29T12:00:00Z"


def _doc(url: str, title: str = "", content: str = "", ptype: PageType = PageType.OTHER, quality: DocumentQuality = DocumentQuality.VALID) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=200,
        title=title,
        content=content,
        word_count=len(content.split()),
        page_type=ptype,
        quality=quality,
        retrieved_at=datetime.now(timezone.utc),
    )

def _fail_doc(url: str, ptype: PageType = PageType.OTHER) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=404,
        title="",
        content="",
        word_count=0,
        page_type=ptype,
        quality=DocumentQuality.HTTP_ERROR,
        retrieved_at=datetime.now(timezone.utc),
    )


# ── 2. Frozen Identity Recall Dataset (12 Cases across 5 Categories) ─────────

IDENTITY_RECALL_DATASET: List[IdentityRecallCase] = [
    # ── Category 1: SPA & Client-Rendered Homepages ───────────────────────────
    IdentityRecallCase(
        case_id="spa_empty_body_with_hint_title",
        category="SPA_RENDERED",
        company="Linear",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="linear.app",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="SPA homepage returns empty body; index search title hint provides entity self-identity.",
        search_results=[
            SearchResult(title="Linear: Software Development Tool", url="https://linear.app", snippet="Linear is a purpose-built issue tracking tool."),
        ],
        mock_documents={
            "https://linear.app": _doc("https://linear.app", title="", content="<div id='root'></div>", ptype=PageType.HOMEPAGE),
            "https://linear.app/about": _doc("https://linear.app/about", title="About Linear", content="Linear builds modern issue tracking and software planning tools.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="spa_minimal_tagline_client_rendered",
        category="SPA_RENDERED",
        company="Vercel",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="vercel.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Minimal SPA skeleton on homepage; search title hint provides entity match and /about corroborates.",
        search_results=[
            SearchResult(title="Vercel: Build and deploy the open web", url="https://vercel.com", snippet="Vercel provides developer tooling and serverless hosting."),
        ],
        mock_documents={
            "https://vercel.com": _doc("https://vercel.com", title="", content="Loading application...", ptype=PageType.HOMEPAGE),
            "https://vercel.com/about": _doc("https://vercel.com/about", title="About Vercel", content="Vercel enables frontend teams to develop, preview, and ship web applications.", ptype=PageType.ABOUT),
        },
    ),

    # ── Category 2: Unconventional Secondary Paths ───────────────────────────
    IdentityRecallCase(
        case_id="unconv_company_story_path",
        category="UNCONVENTIONAL_PATH",
        company="Moove Mobility",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="moove.io",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Legitimate company where secondary corroboration is hosted on /company/story.",
        search_results=[
            SearchResult(title="Moove Mobility - Mobility Fintech", url="https://moove.io", snippet="Moove Mobility democratizes vehicle ownership."),
            SearchResult(title="Our Story | Moove Mobility", url="https://moove.io/company/story", snippet="Learn about Moove Mobility and our mission."),
        ],
        mock_documents={
            "https://moove.io": _doc("https://moove.io", title="Moove Mobility - Mobility Fintech", content="Moove Mobility is a global mobility fintech company providing revenue-based financing.", ptype=PageType.HOMEPAGE),
            "https://moove.io/company/story": _doc("https://moove.io/company/story", title="Our Story | Moove Mobility", content="About Moove Mobility: Founded in 2020, Moove empowers mobility entrepreneurs.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="unconv_who_we_are_path",
        category="UNCONVENTIONAL_PATH",
        company="Zipline",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="zipline.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Secondary corroboration hosted at /who-we-are path.",
        search_results=[
            SearchResult(title="Zipline - Autonomous Delivery", url="https://zipline.com", snippet="Zipline builds autonomous drone logistics networks."),
            SearchResult(title="Who We Are - Zipline", url="https://zipline.com/who-we-are", snippet="Meet Zipline and our team."),
        ],
        mock_documents={
            "https://zipline.com": _doc("https://zipline.com", title="Zipline - Autonomous Delivery", content="Zipline operates the world's largest automated delivery network.", ptype=PageType.HOMEPAGE),
            "https://zipline.com/who-we-are": _doc("https://zipline.com/who-we-are", title="Who We Are - Zipline", content="Zipline was founded to provide fast, reliable access to healthcare.", ptype=PageType.ABOUT),
        },
    ),

    # ── Category 3: Indirect Self-Identification ─────────────────────────────
    IdentityRecallCase(
        case_id="indirect_action_verb_brand",
        category="INDIRECT_SELF_ID",
        company="Moniepoint",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="moniepoint.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage self-identity uses strong active verb phrase rather than passive 'X is a' definition.",
        search_results=[
            SearchResult(title="Moniepoint – Financial Services Platform", url="https://moniepoint.com", snippet="Moniepoint powers modern banking for 1M+ African businesses."),
        ],
        mock_documents={
            "https://moniepoint.com": _doc("https://moniepoint.com", title="Moniepoint – Financial Services Platform", content="Moniepoint powers financial operations and payment terminals for businesses.", ptype=PageType.HOMEPAGE),
            "https://moniepoint.com/about": _doc("https://moniepoint.com/about", title="About Moniepoint", content="About Moniepoint: Nigeria's leading business payments platform.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="indirect_mission_statement",
        category="INDIRECT_SELF_ID",
        company="Stripe",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="stripe.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage opens with mission statement self-identification.",
        search_results=[
            SearchResult(title="Stripe | Financial Infrastructure for the Internet", url="https://stripe.com", snippet="Stripe builds financial infrastructure."),
        ],
        mock_documents={
            "https://stripe.com": _doc("https://stripe.com", title="Stripe | Financial Infrastructure for the Internet", content="Stripe builds economic infrastructure for the internet. Businesses of every size use our software.", ptype=PageType.HOMEPAGE),
            "https://stripe.com/about": _doc("https://stripe.com/about", title="About Stripe", content="Stripe is a financial infrastructure platform for businesses.", ptype=PageType.ABOUT),
        },
    ),

    # ── Category 4: Subdomain & Multi-Tier Entity Assets ──────────────────────
    IdentityRecallCase(
        case_id="subdomain_related_product_v0",
        category="SUBDOMAIN_MULTI_TIER",
        company="Vercel",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="v0.app",
        expected_relationship=SiteRelationship.RELATED,
        ground_truth_reason="v0.app is a product of Vercel; should classify as RELATED and produce UNRESOLVED for Vercel query.",
        search_results=[
            SearchResult(title="v0 by Vercel", url="https://v0.app", snippet="v0 is a generative UI tool by Vercel."),
        ],
        mock_documents={
            "https://v0.app": _doc("https://v0.app", title="v0 - Generative UI by Vercel", content="v0 is a product of Vercel. Generative UI for frontend teams.", ptype=PageType.HOMEPAGE),
            "https://v0.app/about": _doc("https://v0.app/about", title="About v0", content="v0 is built by Vercel.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="subdomain_rebranded_legacy_monnify",
        category="SUBDOMAIN_MULTI_TIER",
        company="Moniepoint",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="atm.monnify.com",
        expected_relationship=SiteRelationship.LEGACY,
        ground_truth_reason="Acquired portal with Moniepoint branding but non-corresponding domain classifies as LEGACY -> UNRESOLVED.",
        search_results=[
            SearchResult(title="Moniepoint – ATM Services", url="https://atm.monnify.com", snippet="Moniepoint ATM services."),
        ],
        mock_documents={
            "https://atm.monnify.com": _doc("https://atm.monnify.com", title="Moniepoint – ATM Services", content="Moniepoint ATM services operates under Moniepoint financial group.", ptype=PageType.HOMEPAGE),
            "https://atm.monnify.com/about": _doc("https://atm.monnify.com/about", title="About Moniepoint – ATM Services", content="About Moniepoint ATM operations.", ptype=PageType.ABOUT),
        },
    ),

    # ── Category 5: Negative Controls (Safety & Insufficient Evidence) ────────
    IdentityRecallCase(
        case_id="neg_competing_primary_collision",
        category="NEGATIVE_CONTROL",
        company="Stripe",
        expected_confidence=IdentityConfidence.AMBIGUOUS,
        expected_domain=None,
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Two independent companies sharing the name 'Stripe' in search results must produce AMBIGUOUS.",
        search_results=[
            SearchResult(title="Stripe - Payments Infrastructure", url="https://stripe.com", snippet="Stripe payments platform."),
            SearchResult(title="Stripe - Developer IDE", url="https://stripedev.io", snippet="Stripe developer workspace."),
        ],
        mock_documents={
            "https://stripe.com": _doc("https://stripe.com", title="Stripe - Payments Infrastructure", content="Stripe is a payments infrastructure company.", ptype=PageType.HOMEPAGE),
            "https://stripe.com/about": _doc("https://stripe.com/about", title="About Stripe", content="About Stripe payments.", ptype=PageType.ABOUT),
            "https://stripedev.io": _doc("https://stripedev.io", title="Stripe - Developer IDE", content="Stripe is a developer workspace company.", ptype=PageType.HOMEPAGE),
            "https://stripedev.io/about": _doc("https://stripedev.io/about", title="About Stripe", content="About Stripe developer tools.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="neg_shape_risk_generic_name",
        category="NEGATIVE_CONTROL",
        company="Acme Corp",
        expected_confidence=IdentityConfidence.AMBIGUOUS,
        expected_domain="acme.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Single primary match on high shape-risk generic name must require manual disambiguation (AMBIGUOUS).",
        search_results=[
            SearchResult(title="Acme Corp - Manufacturing", url="https://acme.com", snippet="Acme Corp manufactures industrial widgets."),
        ],
        mock_documents={
            "https://acme.com": _doc("https://acme.com", title="Acme Corp - Manufacturing", content="Acme Corp is an industrial manufacturing company.", ptype=PageType.HOMEPAGE),
            "https://acme.com/about": _doc("https://acme.com/about", title="About Acme Corp", content="About Acme Corp.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="neg_unsupported_homepage_only",
        category="NEGATIVE_CONTROL",
        company="Widgetco",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="widgetco.com",
        expected_relationship=SiteRelationship.UNKNOWN,
        ground_truth_reason="Homepage self-ID without secondary corroboration must produce UNRESOLVED (insufficient evidence).",
        search_results=[
            SearchResult(title="Widgetco - Official Site", url="https://widgetco.com", snippet="Welcome to Widgetco."),
        ],
        mock_documents={
            "https://widgetco.com": _doc("https://widgetco.com", title="Widgetco - Official Site", content="Widgetco is an enterprise software vendor.", ptype=PageType.HOMEPAGE),
            "https://widgetco.com/about": _fail_doc("https://widgetco.com/about"),
        },
    ),

    IdentityRecallCase(
        case_id="neg_unrelated_distributor_entity",
        category="NEGATIVE_CONTROL",
        company="Linear",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="linear-solutions.com",
        expected_relationship=SiteRelationship.UNRELATED,
        ground_truth_reason="Different entity ('Linear Solutions') fails exact entity title match -> UNRESOLVED for 'Linear'.",
        search_results=[
            SearchResult(title="Linear Solutions - Electrical Distributor", url="https://linear-solutions.com", snippet="Authorized distributor of Linear brand components."),
        ],
        mock_documents={
            "https://linear-solutions.com": _doc("https://linear-solutions.com", title="Linear Solutions - Electrical Distributor", content="Linear Solutions is an authorized distributor of semiconductors.", ptype=PageType.HOMEPAGE),
            "https://linear-solutions.com/about": _doc("https://linear-solutions.com/about", title="About Linear Solutions", content="About Linear Solutions distributor.", ptype=PageType.ABOUT),
        },
    ),
]


# ── 3. Mock Harness Providers ────────────────────────────────────────────────

class _DeterministicSearchProvider:
    def __init__(self, company: str, domain: Optional[str], results: List[SearchResult]):
        self.company = company
        self.domain = domain or ""
        self.results = results

    @property
    def name(self) -> str:
        return "deterministic_mock_search"

    def search(self, query: str, num_results: int = 10) -> List[SearchResult]:
        q_lower = query.lower()
        if self.company.lower() in q_lower or (self.domain and self.domain.lower() in q_lower):
            return self.results
        return []

class _DeterministicCrawlManager:
    def __init__(self, doc_map: Dict[str, CrawledDocument]):
        self.doc_map = doc_map

    def fetch_with_fallback(self, url: str, page_type: PageType) -> CrawledDocument:
        normalized_url = url.rstrip("/")
        for k, doc in self.doc_map.items():
            if k.rstrip("/") == normalized_url:
                return doc
        return _fail_doc(url, page_type)


# ── 4. Benchmark Runner & Metric Calculator ──────────────────────────────────

def evaluate_identity_case(case: IdentityRecallCase) -> Dict[str, Any]:
    search_prov = _DeterministicSearchProvider(case.company, case.expected_domain, case.search_results)
    crawl_mgr = _DeterministicCrawlManager(case.mock_documents)
    verifier = WebsiteVerifier(crawl_mgr, search_prov)
    resolver = IdentityResolver(search_prov, verifier)

    identity = resolver.resolve(case.company, context=case.context)
    
    is_state_match = (identity.confidence == case.expected_confidence)
    is_domain_match = (case.expected_domain is None or identity.domain == case.expected_domain)
    
    # Classify outcome matrix cell
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
    }


def run_identity_recall_benchmark(cases: Optional[List[IdentityRecallCase]] = None) -> Dict[str, Any]:
    dataset = cases or IDENTITY_RECALL_DATASET
    results = [evaluate_identity_case(c) for c in dataset]

    total_cases = len(dataset)
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

    # Family Breakdown
    families = ["SPA_RENDERED", "UNCONVENTIONAL_PATH", "INDIRECT_SELF_ID", "SUBDOMAIN_MULTI_TIER", "NEGATIVE_CONTROL"]
    family_stats = {}
    for fam in families:
        fam_res = [r for r in results if r["category"] == fam]
        fam_total = len(fam_res)
        fam_matches = sum(1 for r in fam_res if r["is_state_match"])
        fam_fc = sum(1 for r in fam_res if r["is_false_confident"])
        family_stats[fam] = {
            "total": fam_total,
            "matches": fam_matches,
            "accuracy_pct": (fam_matches / fam_total * 100.0) if fam_total > 0 else 0.0,
            "false_confident": fam_fc,
        }

    return {
        "total_cases": total_cases,
        "expected_confident": expected_confident,
        "expected_non_confident": expected_non_confident,
        "state_accuracy_pct": state_accuracy_pct,
        "confident_recall_pct": confident_recall_pct,
        "false_confident_rate_pct": false_confident_rate_pct,
        "correct_confident_count": correct_confident_count,
        "missed_conf_ambiguous_count": missed_conf_ambiguous_count,
        "missed_id_unresolved_count": missed_id_unresolved_count,
        "correct_ambiguous_count": correct_ambiguous_count,
        "correct_unresolved_count": correct_unresolved_count,
        "false_confident_count": false_confident_count,
        "family_stats": family_stats,
        "case_results": results,
    }


def print_identity_recall_scorecard(metrics: Dict[str, Any]):
    console.print(Panel.fit(
        "[bold cyan]Dual-Contract Research Engine — Identity Recall & State Accuracy Benchmark[/bold cyan]\n"
        f"Corpus: [bold]v1.0-frozen[/bold] ({metrics['total_cases']} Frozen Fixtures across 5 Categories)\n"
        "Invariants: 1. Strict PRIMARY Contract | 2. False CONFIDENT strictly 0.0%",
        title="Identity Layer Verification"
    ))

    scorecard = Table(title="Identity Recall & State Correctness Scorecard", expand=True)
    scorecard.add_column("Metric Dimension", style="cyan", width=32)
    scorecard.add_column("Result Value", style="bold", width=22)
    scorecard.add_column("Target / Invariant", style="green", width=30)

    acc_color = "green" if metrics["state_accuracy_pct"] == 100.0 else "yellow"
    rec_color = "green" if metrics["confident_recall_pct"] == 100.0 else "yellow"
    fc_color = "green" if metrics["false_confident_count"] == 0 else "red"

    scorecard.add_row("Identity State Accuracy", f"[{acc_color}]{metrics['state_accuracy_pct']:.1f}% ({sum(1 for r in metrics['case_results'] if r['is_state_match'])}/{metrics['total_cases']})[/{acc_color}]", "100.0% Correct Decision State")
    scorecard.add_row("CONFIDENT Recall", f"[{rec_color}]{metrics['confident_recall_pct']:.1f}% ({metrics['correct_confident_count']}/{metrics['expected_confident']})[/{rec_color}]", "100.0% Legitimate Recall")
    scorecard.add_row("Safety: False CONFIDENT Rate", f"[{fc_color}]{metrics['false_confident_rate_pct']:.1f}% ({metrics['false_confident_count']}/{metrics['expected_non_confident']})[/{fc_color}]", "0.0% (Hard Safety Invariant)")
    scorecard.add_row("Missed Confidence (Ambiguous)", f"{metrics['missed_conf_ambiguous_count']}", "0 (Unnecessary Ambiguity)")
    scorecard.add_row("Missed Identity (Unresolved)", f"{metrics['missed_id_unresolved_count']}", "0 (Unnecessary Rejection)")
    scorecard.add_row("Correct Safety (Ambiguous)", f"{metrics['correct_ambiguous_count']}", "Preserved Collision Gate")
    scorecard.add_row("Correct Safety (Unresolved)", f"{metrics['correct_unresolved_count']}", "Preserved Evidence Gate")

    console.print("\n")
    console.print(scorecard)

    # Confusion Matrix Table
    matrix_table = Table(title="Identity Outcome Confusion Matrix", expand=True, show_lines=True)
    matrix_table.add_column("Expected State", style="bold cyan", width=18)
    matrix_table.add_column("Predicted CONFIDENT", justify="center")
    matrix_table.add_column("Predicted AMBIGUOUS", justify="center")
    matrix_table.add_column("Predicted UNRESOLVED", justify="center")

    matrix_table.add_row(
        "CONFIDENT",
        f"[green]{metrics['correct_confident_count']} (Correct Recall)[/green]",
        f"[yellow]{metrics['missed_conf_ambiguous_count']} (Missed Conf)[/yellow]",
        f"[red]{metrics['missed_id_unresolved_count']} (Missed ID)[/red]"
    )
    matrix_table.add_row(
        "AMBIGUOUS",
        f"[bold red]{sum(1 for r in metrics['case_results'] if r['expected_confidence'] == IdentityConfidence.AMBIGUOUS and r['actual_confidence'] == IdentityConfidence.CONFIDENT)} (False Conf)[/bold red]",
        f"[green]{metrics['correct_ambiguous_count']} (Correct Safety)[/green]",
        "0"
    )
    matrix_table.add_row(
        "UNRESOLVED",
        f"[bold red]{sum(1 for r in metrics['case_results'] if r['expected_confidence'] == IdentityConfidence.UNRESOLVED and r['actual_confidence'] == IdentityConfidence.CONFIDENT)} (False Conf)[/bold red]",
        "0",
        f"[green]{metrics['correct_unresolved_count']} (Correct Safety)[/green]"
    )

    console.print("\n")
    console.print(matrix_table)

    # Family Breakdown Table
    fam_table = Table(title="Category & Family Breakdown", expand=True, show_lines=True)
    fam_table.add_column("Category Family", style="cyan", width=25)
    fam_table.add_column("Total Cases", justify="center", width=12)
    fam_table.add_column("State Accuracy", justify="right", width=18)
    fam_table.add_column("False CONFIDENT", justify="right", width=18)

    for fam, stats in metrics["family_stats"].items():
        col = "green" if stats["accuracy_pct"] == 100.0 else "yellow"
        fc_c = "green" if stats["false_confident"] == 0 else "red"
        fam_table.add_row(
            fam,
            str(stats["total"]),
            f"[{col}]{stats['accuracy_pct']:.1f}% ({stats['matches']}/{stats['total']})[/{col}]",
            f"[{fc_c}]{stats['false_confident']}[/{fc_c}]"
        )

    console.print("\n")
    console.print(fam_table)

    # Per-Case Diff Table
    diff_table = Table(title="Per-Case Verification & Outcome Details", expand=True, show_lines=True)
    diff_table.add_column("Case ID", style="cyan", width=30)
    diff_table.add_column("Category", style="dim", width=18)
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
    metrics = run_identity_recall_benchmark()
    print_identity_recall_scorecard(metrics)

if __name__ == "__main__":
    main()

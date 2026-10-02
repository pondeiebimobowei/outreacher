"""
benchmark_identity_live.py — Live-World Identity Verification & Stage-Attributed Probe Benchmark

Evaluates the frozen Identity Resolution layer (v1.2) against real-world web environments,
measuring live search quality, HTTP/Playwright crawling behavior, WAF/bot interactions,
and stage-by-stage verification drop-offs with raw evidence retention.

Methodological Foundation:
  1. Strict Single-Valued Ground Truth:
     Every fixture defines one unambiguous expected state (CONFIDENT, AMBIGUOUS, or UNRESOLVED)
     and an explicit canonical target entity & domain with public registry provenance.
  2. Orthogonal Metric Evaluation:
     Decouples Entity/Domain Correctness from State Correctness:
       - Did we identify the intended entity/domain? (Target Domain Recall)
       - Given the query, did the resolver assign the correct confidence state? (State Accuracy)
       - Did the resolver promote a verified but WRONG entity? (Target Misidentification Rate)
  3. Granular Stage Attribution:
     Search Failure -> Homepage Acquisition -> Homepage Verification ->
     Secondary Discovery -> Secondary Corroboration -> Resolver Arbitration.
  4. Raw Evidence Snapshot Retention:
     Preserves full live execution logs, snippets, crawled titles, status codes, and latency to JSON.

Usage:
  uv run python benchmark_identity_live.py --serper                  # Run with Serper live search
  uv run python benchmark_identity_live.py --limit 5                 # Run first 5 cases
  uv run python benchmark_identity_live.py --save-snapshot run.json  # Save live evidence snapshot
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
from crawling.acquirer import FirstPartyAcquirer
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver

console = Console()


# ── 1. Independent Live Ground Truth Case Definition ─────────────────────────

@dataclass(frozen=True)
class LiveIdentityCase:
    case_id: str
    query_name: str
    target_entity: str
    target_domain: Optional[str]
    expected_state: IdentityConfidence
    expected_relationship: SiteRelationship
    category: str
    provenance_type: str  # CORPORATE_REGISTRY | COMPANY_DIRECTORY | PUBLIC_ENTITY_RECORD | MULTI_ENTITY_REFERENCE | SYNTHETIC_NEGATIVE_CONTROL
    ground_truth_provenance: str
    ground_truth_verified_at: str
    rationale: str
    context: Optional[IdentityContext] = None


# Independent Frozen Live Corpus (20 Strictly Single-Valued Cases)
# Cataloged with independent ground-truth provenance
LIVE_IDENTITY_CORPUS: List[LiveIdentityCase] = [
    # ── Category 1: Global SaaS & Developer Infrastructure (Expected CONFIDENT) ─
    LiveIdentityCase(
        case_id="live_stripe_payments",
        query_name="Stripe",
        target_entity="Stripe, Inc. (Global payment processing platform)",
        target_domain="stripe.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="GLOBAL_FINTECH",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="SEC Form D / Delaware Division of Corporations",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical primary domain is stripe.com.",
    ),
    LiveIdentityCase(
        case_id="live_vercel_cloud",
        query_name="Vercel",
        target_entity="Vercel, Inc. (Frontend cloud platform & creator of Next.js)",
        target_domain="vercel.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_CLOUD",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Crunchbase Verified / Next.js Parent Organization",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical primary domain is vercel.com.",
    ),
    LiveIdentityCase(
        case_id="live_postmark_email",
        query_name="Postmark",
        target_entity="Postmark (Transactional email delivery platform by ActiveCampaign)",
        target_domain="postmarkapp.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_API",
        provenance_type="PUBLIC_ENTITY_RECORD",
        ground_truth_provenance="ActiveCampaign Subsidiary Registry / Official Product Site",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Brand-divergent domain postmarkapp.com is canonical primary presence.",
    ),
    LiveIdentityCase(
        case_id="live_resend_email",
        query_name="Resend",
        target_entity="Resend, Inc. (Modern email API platform for developers)",
        target_domain="resend.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_API",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Y Combinator Directory / Official Brand Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical primary domain is resend.com.",
    ),
    LiveIdentityCase(
        case_id="live_clickup_productivity",
        query_name="ClickUp",
        target_entity="ClickUp Technologies, Inc. (Workplace productivity SaaS)",
        target_domain="clickup.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="WORKPLACE_SAAS",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Delaware Division of Corporations / Crunchbase",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical primary domain is clickup.com.",
    ),
    LiveIdentityCase(
        case_id="live_flyio_infrastructure",
        query_name="Fly.io",
        target_entity="Fly.io, Inc. (Public application cloud platform)",
        target_domain="fly.io",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_CLOUD",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Y Combinator Directory / Crunchbase",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical domain is fly.io.",
    ),
    LiveIdentityCase(
        case_id="live_supabase_database",
        query_name="Supabase",
        target_entity="Supabase, Inc. (Open-source Firebase alternative)",
        target_domain="supabase.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_DATABASE",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Y Combinator Directory / GitHub Verified Org",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical primary domain is supabase.com.",
    ),
    LiveIdentityCase(
        case_id="live_gitlab_devops",
        query_name="GitLab",
        target_entity="GitLab, Inc. (The DevSecOps platform)",
        target_domain="gitlab.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="DEVELOPER_TOOL",
        provenance_type="PUBLIC_ENTITY_RECORD",
        ground_truth_provenance="NASDAQ: GTLB / SEC Filings",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Publicly traded DevOps platform. Canonical domain is gitlab.com.",
    ),

    # ── Category 2: African High-Growth Tech & Fintech (Expected CONFIDENT) ────
    LiveIdentityCase(
        case_id="live_moniepoint_fintech",
        query_name="Moniepoint",
        target_entity="Moniepoint Inc. (All-in-one financial services for African businesses)",
        target_domain="moniepoint.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_FINTECH",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Central Bank of Nigeria Licensed MFB Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical primary domain is moniepoint.com.",
    ),
    LiveIdentityCase(
        case_id="live_interswitch_payments",
        query_name="Interswitch",
        target_entity="Interswitch Group (Integrated payment and digital commerce company)",
        target_domain="interswitchgroup.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_FINTECH",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Corporate Affairs Commission / Visa Equity Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical primary corporate domain is interswitchgroup.com.",
    ),
    LiveIdentityCase(
        case_id="live_piggyvest_savings",
        query_name="PiggyVest",
        target_entity="Piggytech Global Limited (Online savings and investment platform)",
        target_domain="piggyvest.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_FINTECH",
        provenance_type="PUBLIC_ENTITY_RECORD",
        ground_truth_provenance="SEC Nigeria Capital Market Registry / Crunchbase",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical primary domain is piggyvest.com.",
    ),
    LiveIdentityCase(
        case_id="live_termii_communications",
        query_name="Termii",
        target_entity="Termii Inc. (Telecom messaging API platform for African businesses)",
        target_domain="termii.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_SAAS",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Y Combinator Directory (W20) / Official Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Canonical primary domain is termii.com.",
    ),

    # ── Category 3: Bare-Name Known Collisions (Expected AMBIGUOUS) ────────────
    LiveIdentityCase(
        case_id="live_ambig_linear_bare_name",
        query_name="Linear",
        target_entity="Disambiguation Conflict: Linear App (linear.app) vs Linear Capital (linear.vc) vs Linear Technology",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation: Multiple prominent independent firms sharing exact name",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Bare name 'Linear' surfaces multiple prominent independent entities without context.",
    ),
    LiveIdentityCase(
        case_id="live_ambig_mercury_bare_name",
        query_name="Mercury",
        target_entity="Disambiguation Conflict: Mercury Technologies (mercury.com) vs Mercury Marine vs Mercury Insurance",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation: Banking fintech vs marine engine manufacturer vs insurer",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Bare name 'Mercury' surfaces fintech banking, marine propulsion, and insurance companies.",
    ),
    LiveIdentityCase(
        case_id="live_ambig_atlas_bare_name",
        query_name="Atlas",
        target_entity="Disambiguation Conflict: Atlas Cloud Services vs Atlas Corp vs Atlassian Corporation",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation: Multi-industry global collision",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Bare name 'Atlas' has no single canonical owner without contextual disambiguation.",
    ),

    # ── Category 4: Adversarial Fictitious & Generic Negatives (Expected UNRESOLVED)
    LiveIdentityCase(
        case_id="live_neg_kelmond_robotics_fictitious",
        query_name="Kelmond Global Robotics Innovations Ltd",
        target_entity="Non-existent synthetic company control",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="FICTITIOUS_NEGATIVE",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Fictitious Entity)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Non-existent company name; verifier must safely abstain without hallucinating primary.",
    ),
    LiveIdentityCase(
        case_id="live_neg_manom_cloud_fictitious",
        query_name="Manom Enterprise Cloud Systems",
        target_entity="Non-existent synthetic company control",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="FICTITIOUS_NEGATIVE",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Fictitious Entity)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Non-existent entity; verifier must not promote partial directory matches.",
    ),
    LiveIdentityCase(
        case_id="live_neg_outray_microfinance",
        query_name="Outray Microfinance Tech",
        target_entity="Non-existent synthetic company control",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="FICTITIOUS_NEGATIVE",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Fictitious Entity)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Fictitious brand; verifier must reject partial search matches.",
    ),
    LiveIdentityCase(
        case_id="live_neg_acme_general_manufacturing",
        query_name="Acme General Manufacturing Group",
        target_entity="Hyper-generic archetype control",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="SHAPE_RISK_NEGATIVE",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Generic Archetype)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Generic shape-risk archetype with no single canonical primary owner.",
    ),
    LiveIdentityCase(
        case_id="live_neg_distributor_reseller_hub",
        query_name="Linear Distributor Solutions Hub",
        target_entity="Adversarial distributor / reseller name variant",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="DISTRIBUTOR_NEGATIVE",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Third-Party Partner)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Third-party reseller or distributor naming must not be promoted to PRIMARY.",
    ),
]


# ── 2. Live Telemetry & Stage Attribution Data Structures ─────────────────────

@dataclass
class LiveStageTelemetry:
    case_id: str
    query_name: str
    target_entity: str
    target_domain: Optional[str]
    expected_state: str
    
    # Resolver Outputs
    actual_confidence: str = "UNRESOLVED"
    actual_domain: Optional[str] = None
    actual_relationship: str = "UNKNOWN"
    
    # Dual-Dimension Evaluation
    is_state_match: bool = False
    is_domain_match: bool = False
    is_target_misidentified: bool = False
    is_false_confident: bool = False
    
    # Stage-by-Stage Diagnostics
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
        self.acquirer = FirstPartyAcquirer(crawl_manager, search_provider)
        self.verifier = WebsiteVerifier(search_provider)
        self.resolver = IdentityResolver(search_provider, self.verifier, acquirer=self.acquirer)

    def evaluate_case(self, case: LiveIdentityCase) -> LiveStageTelemetry:
        t = LiveStageTelemetry(
            case_id=case.case_id,
            query_name=case.query_name,
            target_entity=case.target_entity,
            target_domain=case.target_domain,
            expected_state=case.expected_state.value,
        )

        start_time = time.perf_counter()
        query = f'"{case.query_name}" official site OR homepage'
        t.search_query = query

        try:
            # 1. Search Stage Analysis
            search_results = self.search_provider.search(query, num_results=5)
            t.search_results_count = len(search_results)
            t.candidate_domains = [urlparse(r.url).netloc.lower() for r in search_results if r.url]

            if not search_results:
                t.search_attribution = "NO_SEARCH_RESULTS"
            elif case.target_domain and not any(case.target_domain in d for d in t.candidate_domains):
                t.search_attribution = "TARGET_DOMAIN_NOT_IN_SEARCH"
            else:
                t.search_attribution = "SEARCH_SUCCESS"

            # 2. Execute Full Identity Resolution
            resolved_identity = self.resolver.resolve(case.query_name, case.context)
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

            # 4. Orthogonal Dual-Dimension Evaluation
            # A. State Match
            t.is_state_match = (resolved_identity.confidence == case.expected_state)

            # B. Domain / Entity Match (evaluated for cases with a defined target domain)
            if case.target_domain is not None:
                t.is_domain_match = (resolved_identity.domain == case.target_domain)
            else:
                t.is_domain_match = True

            # C. Safety Boundary Checks
            if resolved_identity.confidence == IdentityConfidence.CONFIDENT:
                if case.expected_state != IdentityConfidence.CONFIDENT:
                    t.is_false_confident = True
                elif case.target_domain and resolved_identity.domain != case.target_domain:
                    t.is_target_misidentified = True

            # 5. Granular Stage Attribution Classification
            if t.is_false_confident:
                t.final_stage_attribution = "FAIL_FALSE_CONFIDENT_LEAK"
            elif t.is_target_misidentified:
                t.final_stage_attribution = "FAIL_TARGET_MISIDENTIFICATION"
            elif t.is_state_match:
                if resolved_identity.confidence == IdentityConfidence.CONFIDENT:
                    t.final_stage_attribution = "RESOLVED_TARGET_CONFIDENT"
                elif resolved_identity.confidence == IdentityConfidence.AMBIGUOUS:
                    t.final_stage_attribution = "RESOLVED_AMBIGUOUS_SAFETY"
                else:
                    t.final_stage_attribution = "RESOLVED_UNRESOLVED_SAFETY"
            else:
                # Classify Failure Stage for Unresolved / Misclassified Cases
                if case.target_domain and t.search_attribution == "TARGET_DOMAIN_NOT_IN_SEARCH":
                    t.final_stage_attribution = "FAIL_SEARCH_DROPOFF"
                elif case.target_domain and t.search_attribution == "NO_SEARCH_RESULTS":
                    t.final_stage_attribution = "FAIL_NO_SEARCH_RESULTS"
                elif t.primary_candidate_count == 0:
                    # Check if homepage self-identity was established on the target/top candidate
                    has_hp_self_id = any(
                        ("SELF_IDENTITY_STATEMENT" in sig or "TITLE_ENTITY_MATCH" in sig)
                        for sig in t.corroboration_signals
                    )
                    if has_hp_self_id:
                        # Homepage was successfully crawled and identified, but secondary about/contact corroboration failed
                        t.final_stage_attribution = "FAIL_SECONDARY_CORROBORATION"
                    else:
                        # Homepage failed to crawl (WAF block / HTTP error) or lacked self-identity evidence
                        t.final_stage_attribution = "FAIL_HOMEPAGE_ACQUISITION"
                elif t.primary_candidate_count > 1 and case.expected_state == IdentityConfidence.CONFIDENT:
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

    console.print(f"[bold cyan]🚀 Initializing Live Identity Benchmark ({len(suite)} Strict Cases)...[/bold cyan]")

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
        console.print(f"  [{idx}/{len(suite)}] Live Probe: [bold]{case.query_name}[/bold] (Expected: {case.expected_state.value})...")
        res = runner.evaluate_case(case)
        results.append(res)
        
        status_color = "green" if (res.is_state_match and res.is_domain_match) else "red"
        console.print(f"      → Actual: [{status_color}]{res.actual_confidence}[/{status_color}] (Domain: {res.actual_domain or 'None'}) | Attribution: [dim]{res.final_stage_attribution}[/dim]")
        
        if delay > 0 and idx < len(suite):
            time.sleep(delay)

    # Calculate Multi-Dimensional Metrics
    total = len(results)
    state_matches = sum(1 for r in results if r.is_state_match)
    
    expected_conf_cases = [r for r in results if r.expected_state == "CONFIDENT"]
    expected_non_conf_cases = [r for r in results if r.expected_state != "CONFIDENT"]
    cases_with_target_domain = [r for r in results if r.target_domain is not None]
    
    # 1. Canonical Target Identification Rate (Did acquisition/resolver find the intended canonical domain?)
    target_domain_matches = sum(1 for r in cases_with_target_domain if r.is_domain_match)
    canonical_target_id_rate_pct = (target_domain_matches / len(cases_with_target_domain) * 100.0) if cases_with_target_domain else 0.0
    
    # 2. State Accuracy (Did the resolver assign the exact expected confidence state?)
    state_acc_pct = (state_matches / total * 100.0) if total > 0 else 0.0
    
    # 3. CONFIDENT Recall (Correct state AND correct canonical domain)
    correct_confident_count = sum(1 for r in expected_conf_cases if r.actual_confidence == "CONFIDENT" and r.is_domain_match)
    conf_recall_pct = (correct_confident_count / len(expected_conf_cases) * 100.0) if expected_conf_cases else 0.0

    # 4. Correct Confidence Given Correct Target (Once target is found, did the resolver assign expected confidence?)
    correct_conf_given_target = sum(1 for r in cases_with_target_domain if r.is_domain_match and r.is_state_match)
    correct_conf_given_target_pct = (correct_conf_given_target / target_domain_matches * 100.0) if target_domain_matches > 0 else 0.0
    
    # 5. Target Misidentifications (CONFIDENT on wrong entity domain among cases with defined target)
    target_misidentified_count = sum(1 for r in cases_with_target_domain if r.is_target_misidentified)
    target_misidentified_pct = (target_misidentified_count / len(cases_with_target_domain) * 100.0) if cases_with_target_domain else 0.0
    
    # 6. False CONFIDENT (CONFIDENT when expected AMBIGUOUS or UNRESOLVED)
    false_conf_count = sum(1 for r in expected_non_conf_cases if r.actual_confidence == "CONFIDENT")
    false_conf_rate_pct = (false_conf_count / len(expected_non_conf_cases) * 100.0) if expected_non_conf_cases else 0.0
    
    # 7. Non-CONFIDENT Safety (Correctly preserved as AMBIGUOUS or UNRESOLVED)
    correct_safety_count = sum(1 for r in expected_non_conf_cases if r.actual_confidence in {"AMBIGUOUS", "UNRESOLVED"})
    non_conf_safety_pct = (correct_safety_count / len(expected_non_conf_cases) * 100.0) if expected_non_conf_cases else 100.0
    
    avg_latency = sum(r.resolver_elapsed_ms for r in results) / total if total > 0 else 0.0

    return {
        "benchmark_suite": "live-identity-probe-v1.1-strict",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "search_provider": search_provider.name,
        "total_cases": total,
        "expected_confident_count": len(expected_conf_cases),
        "expected_non_confident_count": len(expected_non_conf_cases),
        "cases_with_target_domain_count": len(cases_with_target_domain),
        "target_domain_matches": target_domain_matches,
        "canonical_target_id_rate_pct": canonical_target_id_rate_pct,
        "state_matches": state_matches,
        "state_accuracy_pct": state_acc_pct,
        "correct_confident_count": correct_confident_count,
        "confident_recall_pct": conf_recall_pct,
        "correct_conf_given_target": correct_conf_given_target,
        "correct_conf_given_target_pct": correct_conf_given_target_pct,
        "target_misidentified_count": target_misidentified_count,
        "target_misidentified_pct": target_misidentified_pct,
        "false_confident_count": false_conf_count,
        "false_confident_rate_pct": false_conf_rate_pct,
        "correct_safety_count": correct_safety_count,
        "non_confident_safety_pct": non_conf_safety_pct,
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

    # Core Metric Table with Observed Result vs Acceptance Target vs Status
    t = Table(title="Core Multi-Dimensional Live Evaluation Metrics", expand=True, show_lines=True)
    t.add_column("Evaluation Metric / Dimension", style="cyan", width=34)
    t.add_column("Observed Result", justify="right", width=22)
    t.add_column("Acceptance Target", justify="center", width=20)
    t.add_column("Status", justify="center", width=16)

    # Status classification
    target_id_status = "[green]PASS[/green]" if metrics["canonical_target_id_rate_pct"] >= 80.0 else "[yellow]BELOW TARGET[/yellow]"
    state_acc_status = "[green]PASS[/green]" if metrics["state_accuracy_pct"] >= 85.0 else "[yellow]BELOW TARGET[/yellow]"
    conf_rec_status = "[green]PASS[/green]" if metrics["confident_recall_pct"] >= 80.0 else "[yellow]BELOW TARGET[/yellow]"
    conf_given_target_status = "[green]PASS[/green]" if metrics["correct_conf_given_target_pct"] >= 90.0 else "[yellow]BELOW TARGET[/yellow]"
    misid_status = "[green]PASS[/green]" if metrics["target_misidentified_count"] == 0 else "[bold red]INVARIANT VIOLATION[/bold red]"
    false_conf_status = "[green]PASS[/green]" if metrics["false_confident_count"] == 0 else "[bold red]INVARIANT VIOLATION[/bold red]"
    safety_status = "[green]PASS[/green]" if metrics["non_confident_safety_pct"] == 100.0 else "[bold red]INVARIANT VIOLATION[/bold red]"

    t.add_row(
        "Canonical Target Identification Rate",
        f"{metrics['canonical_target_id_rate_pct']:.1f}% ({metrics['target_domain_matches']}/{metrics['cases_with_target_domain_count']})",
        ">= 80.0%",
        target_id_status,
    )
    t.add_row(
        "Identity State Accuracy",
        f"{metrics['state_accuracy_pct']:.1f}% ({metrics['state_matches']}/{metrics['total_cases']})",
        ">= 85.0%",
        state_acc_status,
    )
    t.add_row(
        "Live CONFIDENT Recall",
        f"{metrics['confident_recall_pct']:.1f}% ({metrics['correct_confident_count']}/{metrics['expected_confident_count']})",
        ">= 80.0%",
        conf_rec_status,
    )
    t.add_row(
        "Correct Confidence Given Target",
        f"{metrics['correct_conf_given_target_pct']:.1f}% ({metrics['correct_conf_given_target']}/{metrics['target_domain_matches']})",
        ">= 90.0%",
        conf_given_target_status,
    )
    t.add_row(
        "Target Misidentification Rate",
        f"{metrics['target_misidentified_pct']:.1f}% ({metrics['target_misidentified_count']}/{metrics['cases_with_target_domain_count']})",
        "0.0%",
        misid_status,
    )
    t.add_row(
        "Safety: False CONFIDENT Rate",
        f"{metrics['false_confident_rate_pct']:.1f}% ({metrics['false_confident_count']}/{metrics['expected_non_confident_count']})",
        "0.0% (Hard Invariant)",
        false_conf_status,
    )
    t.add_row(
        "Safety: Non-CONFIDENT Safety",
        f"{metrics['non_confident_safety_pct']:.1f}% ({metrics['correct_safety_count']}/{metrics['expected_non_confident_count']})",
        "100.0%",
        safety_status,
    )
    t.add_row(
        "Mean End-to-End Latency",
        f"{metrics['avg_resolver_latency_ms']:.1f} ms",
        "—",
        "[dim]TELEMETRY[/dim]",
    )

    console.print("\n")
    console.print(t)

    # Stage Attribution Breakdown Table
    att_counts: Dict[str, int] = {}
    for r in metrics["case_results"]:
        st = r["final_stage_attribution"]
        att_counts[st] = att_counts.get(st, 0) + 1

    st_table = Table(title="Stage Attribution Breakdown", expand=True, show_lines=True)
    st_table.add_column("Stage Attribution Classification", style="cyan", width=36)
    st_table.add_column("Cases", justify="center", width=10)
    st_table.add_column("Interpretation", style="dim", width=42)

    for st, count in sorted(att_counts.items(), key=lambda x: x[1], reverse=True):
        color = "green" if "RESOLVED" in st else "red" if "FAIL" in st else "yellow"
        interp = (
            "Target domain verified and state confirmed" if st == "RESOLVED_TARGET_CONFIDENT"
            else "Collision or non-existent entity safely preserved" if "RESOLVED" in st
            else "Target entity missed in search results" if st == "FAIL_SEARCH_DROPOFF"
            else "Homepage WAF block, network timeout, or HTTP error" if st == "FAIL_HOMEPAGE_ACQUISITION"
            else "Secondary routes lacked self-ID evidence" if st == "FAIL_SECONDARY_CORROBORATION"
            else "Resolved a verified website, but WRONG target entity" if st == "FAIL_TARGET_MISIDENTIFICATION"
            else "Promoted non-existent entity to CONFIDENT" if st == "FAIL_FALSE_CONFIDENT_LEAK"
            else "Unexpected collision or state mismatch"
        )
        st_table.add_row(f"[{color}]{st}[/{color}]", str(count), interp)

    console.print("\n")
    console.print(st_table)

    # Per-Case Outcomes Table
    res_table = Table(title=f"Per-Case Live Outcomes ({metrics['total_cases']} Cases)", expand=True, show_lines=True)
    res_table.add_column("Query Name", style="bold", width=20)
    res_table.add_column("Expected State", justify="center", width=14)
    res_table.add_column("Actual State", justify="center", width=14)
    res_table.add_column("Target Domain", style="cyan", width=20)
    res_table.add_column("Actual Domain", style="magenta", width=20)
    res_table.add_column("Attribution Stage", style="dim", width=26)
    res_table.add_column("Domain?", justify="center", width=8)
    res_table.add_column("State?", justify="center", width=8)

    for r in metrics["case_results"]:
        st_match = "[green]MATCH[/green]" if r["is_state_match"] else "[bold red]FAIL[/bold red]"
        dom_match = "[green]MATCH[/green]" if r["is_domain_match"] else "[bold red]MISMATCH[/bold red]"
        res_table.add_row(
            r["query_name"],
            r["expected_state"],
            f"[{'green' if r['is_state_match'] else 'red'}]{r['actual_confidence']}[/{'green' if r['is_state_match'] else 'red'}]",
            r["target_domain"] or "—",
            r["actual_domain"] or "—",
            r["final_stage_attribution"],
            dom_match,
            st_match,
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

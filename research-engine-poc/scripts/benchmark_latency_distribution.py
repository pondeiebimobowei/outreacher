import os
import sys
import time
import json
import statistics
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

# Ensure research-engine-poc root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from search.duckduckgo import DuckDuckGoSearchProvider
from search.serper import SerperSearchProvider
from crawling.trafilatura_crawler import TrafilaturaCrawlerProvider
from crawling.playwright_crawler import PlaywrightCrawlerProvider
from crawling.manager import CrawlManager
from crawling.acquirer import FirstPartyAcquirer
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from discovery.discoverer import ScopedDiscoverer
from discovery.ranking import DiversityBudgetRanker
from discovery.classifier import TwoStageClassifier
from core.models import (
    IdentityConfidence, IdentityContext, RawResearchPackage,
    DocumentQuality,
)
from core.urls import normalize_research_package
from synthesis.bridge import LLMClaimGraphBridge
from synthesis.providers.gemini import GeminiLLMSynthesizer
from synthesis.providers.mistral import MistralLLMSynthesizer


# 20 Target Companies (Categorized)
TARGET_COHORTS = {
    "STATIC_SAAS": [
        "Linear",
        "Postmark",
        "Resend",
        "Supabase",
        "Vercel",
    ],
    "DYNAMIC_ENTERPRISE": [
        "Palantir",
        "UiPath",
        "Stripe",
        "Datadog",
        "Snowflake",
    ],
    "REGIONAL_MIDMARKET": [
        "Fawry",
        "Moniepoint",
        "Piggyvest",
        "Kuda",
        "Paystack",
    ],
    "AMBIGUOUS_COLLISION": [
        "Crown",
        "Flock",
        "Apex",
        "Beacon",
        "Summit",
    ]
}


def build_pipeline(use_serper: bool = True):
    if use_serper and os.environ.get("SERPER_API_KEY"):
        search_provider = SerperSearchProvider()
    else:
        search_provider = DuckDuckGoSearchProvider()

    static_crawler = TrafilaturaCrawlerProvider()
    browser_crawler = PlaywrightCrawlerProvider()
    crawl_manager = CrawlManager(static_crawler, browser_crawler)

    acquirer = FirstPartyAcquirer(crawl_manager, search_provider)
    verifier = WebsiteVerifier(search_provider)
    resolver = IdentityResolver(search_provider, verifier, acquirer=acquirer)
    discoverer = ScopedDiscoverer(search_provider)
    ranker = DiversityBudgetRanker()

    synth = None
    if os.environ.get("GEMINI_API_KEY"):
        synth = GeminiLLMSynthesizer(api_key=os.environ.get("GEMINI_API_KEY"))
    elif os.environ.get("MISTRAL_API_KEY"):
        synth = MistralLLMSynthesizer(api_key=os.environ.get("MISTRAL_API_KEY"))

    return resolver, discoverer, ranker, crawl_manager, synth


def run_measured_trial(
    company_name: str,
    resolver: IdentityResolver,
    discoverer: ScopedDiscoverer,
    ranker: DiversityBudgetRanker,
    crawl_manager: CrawlManager,
    synth: Any,
    max_budget: int = 8,
) -> Dict[str, Any]:
    t0 = time.perf_counter()

    # Phase 1: Identity Resolution
    t_id_start = time.perf_counter()
    identity = resolver.resolve(company_name)
    t_id_end = time.perf_counter()
    duration_identity = t_id_end - t_id_start

    # If identity is not CONFIDENT, pipeline halts
    if identity.confidence != IdentityConfidence.CONFIDENT:
        t_total = time.perf_counter() - t0
        return {
            "company_name": company_name,
            "status": "IDENTITY_HALTED",
            "identity_confidence": identity.confidence.value,
            "domain": identity.domain,
            "duration_identity_ms": round(duration_identity * 1000, 2),
            "duration_discovery_ms": 0.0,
            "duration_crawl_ms": 0.0,
            "duration_llm_ms": 0.0,
            "duration_total_ms": round(t_total * 1000, 2),
            "documents_count": 0,
            "claims_count": 0,
        }

    # Phase 2: Scoped Discovery & Diversity Budgeting
    t_disc_start = time.perf_counter()
    all_discovered = discoverer.discover(
        domain=identity.domain,
        company_name=company_name,
        homepage_url=identity.website_url,
    )
    budgeted_items = ranker.select_budgeted_urls(
        all_discovered,
        max_budget=max_budget,
    )
    t_disc_end = time.perf_counter()
    duration_discovery = t_disc_end - t_disc_start

    # Phase 3: Crawling, Fallbacks & Quality Evaluation
    t_crawl_start = time.perf_counter()
    documents = []
    for item in budgeted_items:
        doc = crawl_manager.fetch_with_fallback(item.url, page_type=item.provisional_page_type)
        final_type = TwoStageClassifier.stage2_refine_content(
            provisional=item.provisional_page_type,
            title=doc.title,
            content=doc.content,
            url=item.url,
        )
        refined_doc = doc.model_copy(update={
            "page_type": final_type,
            "provisional_page_type": item.provisional_page_type,
            "purpose": item.purpose,
            "source_query": item.query,
            "search_rank": item.rank,
        })
        documents.append(refined_doc)
    t_crawl_end = time.perf_counter()
    duration_crawl = t_crawl_end - t_crawl_start

    package = RawResearchPackage(
        identity=identity,
        documents=documents,
        discovered_at=datetime.now(timezone.utc),
    )
    package = normalize_research_package(package)

    # Phase 4: Stage 1 LLM Extraction & Stage 2 Grounded Synthesis
    duration_llm = 0.0
    claims_count = 0
    run_status = "PARTIAL"
    if synth:
        t_llm_start = time.perf_counter()
        graph, dto, _ = LLMClaimGraphBridge.process(package, synth)
        t_llm_end = time.perf_counter()
        duration_llm = t_llm_end - t_llm_start
        claims_count = len(graph.claims)
        run_status = dto.status.value

    t_total = time.perf_counter() - t0

    return {
        "company_name": company_name,
        "status": run_status,
        "identity_confidence": identity.confidence.value,
        "domain": identity.domain,
        "duration_identity_ms": round(duration_identity * 1000, 2),
        "duration_discovery_ms": round(duration_discovery * 1000, 2),
        "duration_crawl_ms": round(duration_crawl * 1000, 2),
        "duration_llm_ms": round(duration_llm * 1000, 2),
        "duration_total_ms": round(t_total * 1000, 2),
        "documents_count": len(documents),
        "claims_count": claims_count,
    }


def compute_percentiles(values: List[float]) -> Dict[str, float]:
    if not values:
        return {"p50": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0, "max": 0.0, "min": 0.0, "avg": 0.0}
    sorted_v = sorted(values)
    n = len(sorted_v)

    def p(pct):
        k = (n - 1) * (pct / 100.0)
        f = int(k)
        c = f + 1
        if c >= n:
            return sorted_v[-1]
        d = k - f
        return sorted_v[f] + d * (sorted_v[c] - sorted_v[f])

    return {
        "p50": round(p(50), 2),
        "p90": round(p(90), 2),
        "p95": round(p(95), 2),
        "p99": round(p(99), 2),
        "max": round(max(sorted_v), 2),
        "min": round(min(sorted_v), 2),
        "avg": round(statistics.mean(sorted_v), 2),
    }


def main():
    print("=" * 80)
    print("EMPIRICAL LATENCY BENCHMARK: 20 Targets x 3 Runs (60 Total Executions)")
    print("=" * 80)

    resolver, discoverer, ranker, crawl_manager, synth = build_pipeline(use_serper=True)
    all_results = []

    # Flatten targets
    targets = []
    for cohort, names in TARGET_COHORTS.items():
        for name in names:
            targets.append((cohort, name))

    trial_idx = 0
    total_trials = len(targets) * 3

    for run_num in range(1, 4):
        print(f"\n>>> Commencing Run Pass {run_num} of 3 <<<")
        for cohort, company_name in targets:
            trial_idx += 1
            print(f"[{trial_idx}/{total_trials}] {cohort}: {company_name} (Run {run_num})...", end="", flush=True)
            res = run_measured_trial(
                company_name=company_name,
                resolver=resolver,
                discoverer=discoverer,
                ranker=ranker,
                crawl_manager=crawl_manager,
                synth=synth,
                max_budget=8,
            )
            res["cohort"] = cohort
            res["run_number"] = run_num
            all_results.append(res)
            print(f" -> {res['status']} in {res['duration_total_ms']}ms (Identity={res['duration_identity_ms']}ms, Crawl={res['duration_crawl_ms']}ms, LLM={res['duration_llm_ms']}ms)")

    # Partition datasets
    confident_runs = [r for r in all_results if r["identity_confidence"] == "CONFIDENT"]
    halted_runs = [r for r in all_results if r["identity_confidence"] != "CONFIDENT"]

    print("\n" + "=" * 80)
    print("DISTRIBUTION SUMMARY: CONFIDENT FULL-RESEARCH RUNS (N={})".format(len(confident_runs)))
    print("=" * 80)

    total_times = [r["duration_total_ms"] for r in confident_runs]
    id_times = [r["duration_identity_ms"] for r in confident_runs]
    disc_times = [r["duration_discovery_ms"] for r in confident_runs]
    crawl_times = [r["duration_crawl_ms"] for r in confident_runs]
    llm_times = [r["duration_llm_ms"] for r in confident_runs]

    summary_confident = {
        "count": len(confident_runs),
        "total_ms": compute_percentiles(total_times),
        "identity_ms": compute_percentiles(id_times),
        "discovery_ms": compute_percentiles(disc_times),
        "crawl_ms": compute_percentiles(crawl_times),
        "llm_ms": compute_percentiles(llm_times),
    }
    print(json.dumps(summary_confident, indent=2))

    print("\n" + "=" * 80)
    print("DISTRIBUTION SUMMARY: IDENTITY_HALTED RUNS (N={})".format(len(halted_runs)))
    print("=" * 80)
    halted_totals = [r["duration_total_ms"] for r in halted_runs]
    summary_halted = {
        "count": len(halted_runs),
        "total_ms": compute_percentiles(halted_totals),
    }
    print(json.dumps(summary_halted, indent=2))

    output_path = "scripts/benchmark_latency_distribution_results.json"
    with open(output_path, "w") as f:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "summary_confident": summary_confident,
            "summary_halted": summary_halted,
            "trials": all_results,
        }, f, indent=2)
    print(f"\nSaved full raw benchmark metrics to {output_path}")


if __name__ == "__main__":
    main()

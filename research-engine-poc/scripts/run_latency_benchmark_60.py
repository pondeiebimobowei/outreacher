import os
import sys
import time
import json
import statistics
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

# Ensure research-engine-poc root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env
env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k] = v.strip("\"'")

from rich.console import Console
import pipeline.acquisition
# Keep console quiet so execution logs stay deterministic and concise
pipeline.acquisition.console = Console(quiet=True)

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
from pipeline.acquisition import AcquisitionRunner
from core.models import IdentityConfidence, RawResearchPackage
from synthesis.bridge import LLMClaimGraphBridge
from synthesis.providers.gemini import GeminiLLMSynthesizer
from synthesis.providers.mistral import MistralLLMSynthesizer

# 20 Targets: 15 expected CONFIDENT targets + 5 IDENTITY_HALTED / Unresolved targets
TARGETS = [
    # 15 CONFIDENT Targets
    ("CONFIDENT", "Linear"),
    ("CONFIDENT", "Postmark"),
    ("CONFIDENT", "Resend"),
    ("CONFIDENT", "Supabase"),
    ("CONFIDENT", "Vercel"),
    ("CONFIDENT", "Palantir"),
    ("CONFIDENT", "UiPath"),
    ("CONFIDENT", "Stripe"),
    ("CONFIDENT", "Datadog"),
    ("CONFIDENT", "Snowflake"),
    ("CONFIDENT", "Moniepoint"),
    ("CONFIDENT", "Piggyvest"),
    ("CONFIDENT", "Paystack"),
    ("CONFIDENT", "Agicap"),
    ("CONFIDENT", "Wolt Enterprises"),

    # 5 IDENTITY_HALTED / Unresolved Targets
    ("HALTED", "Crown"),
    ("HALTED", "Flock"),
    ("HALTED", "Apex"),
    ("HALTED", "Beacon"),
    ("HALTED", "Best European Payroll Providers Directory"),
]


class InstrumentedResolver:
    """Non-invasive measurement wrapper around frozen IdentityResolver."""
    def __init__(self, inner: IdentityResolver):
        self._inner = inner
        self.last_duration_s = 0.0

    def resolve(self, company_name: str, context: Any = None):
        t0 = time.perf_counter()
        try:
            return self._inner.resolve(company_name, context=context)
        finally:
            self.last_duration_s = time.perf_counter() - t0

    def __getattr__(self, name: str):
        return getattr(self._inner, name)


class InstrumentedDiscoverer:
    """Non-invasive measurement wrapper around frozen ScopedDiscoverer."""
    def __init__(self, inner: ScopedDiscoverer):
        self._inner = inner
        self.last_duration_s = 0.0

    def discover(self, *args, **kwargs):
        t0 = time.perf_counter()
        try:
            return self._inner.discover(*args, **kwargs)
        finally:
            self.last_duration_s = time.perf_counter() - t0

    def __getattr__(self, name: str):
        return getattr(self._inner, name)


class InstrumentedCrawlManager:
    """Non-invasive measurement wrapper around frozen CrawlManager."""
    def __init__(self, inner: CrawlManager):
        self._inner = inner
        self.total_crawl_duration_s = 0.0

    def reset_timer(self):
        self.total_crawl_duration_s = 0.0

    def fetch_with_fallback(self, *args, **kwargs):
        t0 = time.perf_counter()
        try:
            return self._inner.fetch_with_fallback(*args, **kwargs)
        finally:
            self.total_crawl_duration_s += (time.perf_counter() - t0)

    def __getattr__(self, name: str):
        return getattr(self._inner, name)


def build_pipeline():
    if os.environ.get("SERPER_API_KEY"):
        search_provider = SerperSearchProvider()
    else:
        search_provider = DuckDuckGoSearchProvider()

    raw_crawl_mgr = CrawlManager(TrafilaturaCrawlerProvider(), PlaywrightCrawlerProvider())
    inst_crawl_mgr = InstrumentedCrawlManager(raw_crawl_mgr)

    acquirer = FirstPartyAcquirer(raw_crawl_mgr, search_provider)
    verifier = WebsiteVerifier(search_provider)
    raw_resolver = IdentityResolver(search_provider, verifier, acquirer=acquirer)
    inst_resolver = InstrumentedResolver(raw_resolver)

    raw_discoverer = ScopedDiscoverer(search_provider)
    inst_discoverer = InstrumentedDiscoverer(raw_discoverer)

    ranker = DiversityBudgetRanker()

    # Literal public AcquisitionRunner instance
    runner = AcquisitionRunner(
        resolver=inst_resolver,
        discoverer=inst_discoverer,
        ranker=ranker,
        crawl_manager=inst_crawl_mgr,
        max_crawl_budget=4,
    )

    synth = None
    if os.environ.get("GEMINI_API_KEY"):
        synth = GeminiLLMSynthesizer(api_key=os.environ.get("GEMINI_API_KEY"))
    elif os.environ.get("MISTRAL_API_KEY"):
        synth = MistralLLMSynthesizer(api_key=os.environ.get("MISTRAL_API_KEY"))

    return runner, inst_resolver, inst_discoverer, inst_crawl_mgr, synth


def run_single_execution(
    cohort: str,
    company_name: str,
    runner: AcquisitionRunner,
    inst_resolver: InstrumentedResolver,
    inst_discoverer: InstrumentedDiscoverer,
    inst_crawl_mgr: InstrumentedCrawlManager,
    synth: Any,
) -> Dict[str, Any]:
    inst_crawl_mgr.reset_timer()
    t0 = time.perf_counter()

    try:
        # Call literal public AcquisitionRunner.run() entry point
        pkg: RawResearchPackage = runner.run(company_name)

        t_identity = inst_resolver.last_duration_s
        t_discovery = inst_discoverer.last_duration_s
        t_crawl = inst_crawl_mgr.total_crawl_duration_s

        # Downstream LLM Synthesis if identity was CONFIDENT
        t_llm = 0.0
        claims_count = 0
        run_status = "IDENTITY_HALTED" if pkg.identity.confidence != IdentityConfidence.CONFIDENT else "PARTIAL"

        if pkg.identity.confidence == IdentityConfidence.CONFIDENT and synth:
            t_llm_start = time.perf_counter()
            graph, dto, _ = LLMClaimGraphBridge.process(pkg, synth)
            t_llm = time.perf_counter() - t_llm_start
            claims_count = len(graph.claims)
            run_status = dto.status.value

        t_total = time.perf_counter() - t0

        return {
            "company_name": company_name,
            "cohort": cohort,
            "status": run_status,
            "actual_identity_state": pkg.identity.confidence.value,
            "domain": pkg.identity.domain,
            "duration_identity_ms": round(t_identity * 1000, 2),
            "duration_discovery_ms": round(t_discovery * 1000, 2),
            "duration_crawl_ms": round(t_crawl * 1000, 2),
            "duration_llm_ms": round(t_llm * 1000, 2),
            "duration_total_ms": round(t_total * 1000, 2),
            "docs_count": len(pkg.documents),
            "claims_count": claims_count,
        }
    except Exception as exc:
        t_total = time.perf_counter() - t0
        return {
            "company_name": company_name,
            "cohort": cohort,
            "status": "FAILED",
            "actual_identity_state": "ERROR",
            "domain": None,
            "duration_identity_ms": round(inst_resolver.last_duration_s * 1000, 2),
            "duration_discovery_ms": round(inst_discoverer.last_duration_s * 1000, 2),
            "duration_crawl_ms": round(inst_crawl_mgr.total_crawl_duration_s * 1000, 2),
            "duration_llm_ms": 0.0,
            "duration_total_ms": round(t_total * 1000, 2),
            "docs_count": 0,
            "claims_count": 0,
            "error": str(exc),
        }


def compute_percentiles(values: List[float]) -> Dict[str, Any]:
    if not values:
        return {"n": 0, "p50": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0, "max": 0.0, "min": 0.0, "avg": 0.0}
    sorted_v = sorted(values)
    n = len(sorted_v)

    # Standard linear interpolation percentile method (inclusive NIST / Python statistics.quantiles style):
    def p(pct):
        k = (n - 1) * (pct / 100.0)
        f = int(k)
        c = f + 1
        if c >= n:
            return sorted_v[-1]
        d = k - f
        return sorted_v[f] + d * (sorted_v[c] - sorted_v[f])

    return {
        "n": n,
        "p50": round(p(50), 2),
        "p90": round(p(90), 2),
        "p95": round(p(95), 2),
        "p99": round(p(99), 2),
        "max": round(max(sorted_v), 2),
        "min": round(min(sorted_v), 2),
        "avg": round(statistics.mean(sorted_v), 2),
    }


def save_intermediate_results(output_path: str, all_trials: List[Dict[str, Any]]) -> None:
    confident_trials = [t for t in all_trials if t["actual_identity_state"] == "CONFIDENT" and t["status"] in ("COMPLETED", "PARTIAL")]
    halted_trials = [t for t in all_trials if t["actual_identity_state"] not in ("CONFIDENT", "ERROR")]
    failed_trials = [t for t in all_trials if t["status"] == "FAILED"]

    summary_confident = {
        "n": len(confident_trials),
        "T_total": compute_percentiles([t["duration_total_ms"] for t in confident_trials]),
        "T_identity": compute_percentiles([t["duration_identity_ms"] for t in confident_trials]),
        "T_discovery": compute_percentiles([t["duration_discovery_ms"] for t in confident_trials]),
        "T_crawl": compute_percentiles([t["duration_crawl_ms"] for t in confident_trials]),
        "T_llm": compute_percentiles([t["duration_llm_ms"] for t in confident_trials]),
    }
    summary_halted = {
        "n": len(halted_trials),
        "T_total": compute_percentiles([t["duration_total_ms"] for t in halted_trials]),
        "T_identity": compute_percentiles([t["duration_identity_ms"] for t in halted_trials]),
        "T_discovery": compute_percentiles([t["duration_discovery_ms"] for t in halted_trials]),
        "T_crawl": compute_percentiles([t["duration_crawl_ms"] for t in halted_trials]),
        "T_llm": compute_percentiles([t["duration_llm_ms"] for t in halted_trials]),
    }

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "completed_count": len(all_trials),
        "confident_count": len(confident_trials),
        "halted_count": len(halted_trials),
        "failed_count": len(failed_trials),
        "summary_confident": summary_confident,
        "summary_halted": summary_halted,
        "trials": all_trials,
    }
    tmp_path = output_path + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp_path, output_path)


def main():
    print("=" * 80)
    print("EMPIRICAL BENCHMARK (LITERAL AcquisitionRunner.run PATH): 20 Targets x 3 Passes")
    print("=" * 80)

    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "empirical_latency_benchmark_60_results.json")
    runner, inst_resolver, inst_discoverer, inst_crawl_mgr, synth = build_pipeline()
    all_trials = []
    trial_count = 0
    total_expected = len(TARGETS) * 3

    for run_pass in range(1, 4):
        print(f"\n=================== RUN PASS {run_pass} of 3 ===================")
        for cohort, company_name in TARGETS:
            trial_count += 1
            print(f"[{trial_count:02d}/{total_expected:02d}] {cohort:8s} | {company_name:30s} (Pass {run_pass})...", end="", flush=True)
            res = run_single_execution(cohort, company_name, runner, inst_resolver, inst_discoverer, inst_crawl_mgr, synth)
            res["run_pass"] = run_pass
            all_trials.append(res)
            print(f" -> {res['status']:15s} ({res['actual_identity_state']:10s}) in {res['duration_total_ms']/1000:6.2f}s (Id={res['duration_identity_ms']/1000:5.2f}s, Disc={res['duration_discovery_ms']/1000:5.2f}s, Crawl={res['duration_crawl_ms']/1000:5.2f}s, LLM={res['duration_llm_ms']/1000:5.2f}s)")
            save_intermediate_results(output_path, all_trials)
            # Polite 1.5s pause to prevent socket / DNS / Serper bursts
            time.sleep(1.5)

    print("\n" + "=" * 80)
    print(f"BENCHMARK COMPLETE (N={len(all_trials)})")
    print("=" * 80)
    with open(output_path) as f:
        summary_data = json.load(f)
    print("CONFIDENT FULL-RESEARCH PARTITION:")
    print(json.dumps(summary_data["summary_confident"], indent=2))
    print("IDENTITY_HALTED / UNRESOLVED PARTITION:")
    print(json.dumps(summary_data["summary_halted"], indent=2))
    print(f"\nSaved raw benchmark results to {output_path}")

if __name__ == "__main__":
    main()

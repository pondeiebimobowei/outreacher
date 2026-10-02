"""
Production-shaped calibration benchmark for known-domain full research.

Execution path:
  run_confident_production_benchmark.py
  -> ResearchPipelineRunner.execute_sync()
  -> known-domain first-party verification
  -> Scoped Discovery
  -> Crawl
  -> LLM synthesis
"""

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
pipeline.acquisition.console = Console(quiet=True)

from gateway.service import ResearchPipelineRunner, ENGINE_VERSION
from identity.resolver import normalize_domain
from core.models import IdentityCandidate, CompanyIdentity, IdentityConfidence, SiteRelationship

# 10 Distinct Known Companies with Known Website & Domain
CONFIDENT_TARGETS = [
    ("Supabase", "supabase.com", "https://supabase.com"),
    ("Resend", "resend.com", "https://resend.com"),
    ("Postmark", "postmarkapp.com", "https://postmarkapp.com"),
    ("Piggyvest", "piggyvest.com", "https://piggyvest.com"),
    ("Wolt", "wolt.com", "https://wolt.com"),
    ("GitGuardian", "gitguardian.com", "https://gitguardian.com"),
    ("Sourcegraph", "sourcegraph.com", "https://sourcegraph.com"),
    ("LaunchDarkly", "launchdarkly.com", "https://launchdarkly.com"),
    ("Doppler", "doppler.com", "https://doppler.com"),
    ("PlanetScale", "planetscale.com", "https://planetscale.com"),
]

def compute_percentiles(values: List[float]) -> Dict[str, Any]:
    if not values:
        return {"n": 0, "p50": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0, "max": 0.0, "min": 0.0, "avg": 0.0}
    sorted_v = sorted(values)
    n = len(sorted_v)

    # Standard linear interpolation percentile method (NIST / Python statistics.quantiles style):
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

def run_single_execution(
    runner: ResearchPipelineRunner,
    company_name: str,
    domain: str,
    website_url: str,
    pass_num: int,
) -> Dict[str, Any]:
    t0 = time.perf_counter()
    req_id = f"req-{company_name.lower()}-p{pass_num}"
    run_id = f"run-{company_name.lower()}-p{pass_num}"

    # Phase 1: Identity Resolution / Verification
    t_id_start = time.perf_counter()
    target_url = website_url or f"https://{domain}"
    norm_domain = domain or normalize_domain(target_url)
    bundle = runner.acquirer.acquire(target_url)
    is_primary, msg, ver_ev = runner.verifier.verify(company_name, target_url, acquisition=bundle)
    if is_primary:
        cand = IdentityCandidate(
            domain=norm_domain,
            is_verified=True,
            relationship=SiteRelationship.PRIMARY,
            relationship_reasoning=msg,
            verification_msg=msg,
            evidence=ver_ev,
        )
        identity = CompanyIdentity(
            name=company_name,
            domain=norm_domain,
            website_url=target_url,
            confidence=IdentityConfidence.CONFIDENT,
            reasoning=f"Verified known website/domain: {msg}",
            candidates=(cand,),
        )
    else:
        identity = runner.resolver.resolve(company_name)
    t_id_end = time.perf_counter()
    dur_id_ms = (t_id_end - t_id_start) * 1000

    dur_disc_ms = 0.0
    dur_crawl_ms = 0.0
    dur_llm_ms = 0.0
    findings_count = 0
    claims_count = 0
    docs_count = 0
    status = "IDENTITY_HALTED"

    if identity.confidence == IdentityConfidence.CONFIDENT:
        # Phase 2: Scoped Discovery
        t_disc_start = time.perf_counter()
        all_discovered = runner.discoverer.discover(
            domain=identity.domain,
            company_name=company_name,
            homepage_url=identity.website_url,
        )
        budgeted_items = runner.ranker.select_budgeted_urls(all_discovered, max_budget=4)
        t_disc_end = time.perf_counter()
        dur_disc_ms = (t_disc_end - t_disc_start) * 1000

        # Phase 3: Crawling
        t_crawl_start = time.perf_counter()
        documents = []
        for item in budgeted_items:
            doc = runner.crawl_manager.fetch_with_fallback(item.url, page_type=item.provisional_page_type)
            documents.append(doc)
        t_crawl_end = time.perf_counter()
        dur_crawl_ms = (t_crawl_end - t_crawl_start) * 1000
        docs_count = len(documents)

        # Phase 4: Synthesis
        t_llm_start = time.perf_counter()
        from core.models import RawResearchPackage
        from synthesis.bridge import LLMClaimGraphBridge
        pkg = RawResearchPackage(
            identity=identity,
            documents=documents,
            discovered_at=datetime.now(timezone.utc),
        )
        graph, dto, _ = LLMClaimGraphBridge.process(pkg, runner.synth)
        t_llm_end = time.perf_counter()
        dur_llm_ms = (t_llm_end - t_llm_start) * 1000
        claims_count = len(graph.claims)
        findings_count = len(dto.findings)
        status = dto.status.value

    dur_total_ms = (time.perf_counter() - t0) * 1000

    return {
        "company_name": company_name,
        "domain": domain,
        "website_url": website_url,
        "pass_num": pass_num,
        "status": status,
        "actual_identity_state": identity.confidence.value,
        "duration_total_ms": round(dur_total_ms, 2),
        "duration_identity_ms": round(dur_id_ms, 2),
        "duration_discovery_ms": round(dur_disc_ms, 2),
        "duration_crawl_ms": round(dur_crawl_ms, 2),
        "duration_llm_ms": round(dur_llm_ms, 2),
        "docs_count": docs_count,
        "claims_count": claims_count,
        "findings_count": findings_count,
    }

def save_intermediate_results(output_path: str, trials: List[Dict[str, Any]]) -> None:
    confident = [t for t in trials if t["actual_identity_state"] == "CONFIDENT"]
    halted = [t for t in trials if t["actual_identity_state"] != "CONFIDENT"]

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_n": len(trials),
        "confident_n": len(confident),
        "halted_n": len(halted),
        "T_total": compute_percentiles([t["duration_total_ms"] for t in confident]),
        "T_identity": compute_percentiles([t["duration_identity_ms"] for t in confident]),
        "T_discovery": compute_percentiles([t["duration_discovery_ms"] for t in confident]),
        "T_crawl": compute_percentiles([t["duration_crawl_ms"] for t in confident]),
        "T_llm": compute_percentiles([t["duration_llm_ms"] for t in confident]),
        "trials": trials,
    }
    tmp_path = output_path + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(summary, f, indent=2)
    os.replace(tmp_path, output_path)

def main():
    print("=" * 80)
    print("FOCUSED CALIBRATION STUDY: Production-Shaped CONFIDENT Research (10 Targets x 3 Passes)")
    print("=" * 80)

    runner = ResearchPipelineRunner()
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "confident_production_benchmark_results.json")
    all_trials = []
    trial_count = 0
    total_expected = len(CONFIDENT_TARGETS) * 3

    for pass_num in range(1, 4):
        print(f"\n=================== RUN PASS {pass_num} of 3 ===================")
        for name, domain, url in CONFIDENT_TARGETS:
            trial_count += 1
            print(f"[{trial_count:02d}/{total_expected:02d}] {name:15s} ({domain:20s}) Pass {pass_num}...", end="", flush=True)
            res = run_single_execution(runner, name, domain, url, pass_num)
            all_trials.append(res)
            save_intermediate_results(output_path, all_trials)
            print(f" -> {res['status']:12s} in {res['duration_total_ms']/1000:6.2f}s (Id={res['duration_identity_ms']/1000:5.2f}s, Disc={res['duration_discovery_ms']/1000:5.2f}s, Crawl={res['duration_crawl_ms']/1000:5.2f}s, LLM={res['duration_llm_ms']/1000:5.2f}s)")
            time.sleep(1.0)

    print("\n" + "=" * 80)
    print(f"BENCHMARK COMPLETE (N={len(all_trials)})")
    print("=" * 80)
    with open(output_path) as f:
        final_data = json.load(f)

    for metric in ["T_total", "T_identity", "T_discovery", "T_crawl", "T_llm"]:
        print(f"\n{metric}:")
        print(json.dumps(final_data[metric], indent=2))

if __name__ == "__main__":
    main()

"""
tests/test_causal_mutation_invariants.py — Causal Mutation & Fault-Injection Invariant Verification

This suite proves that every identity safety gate is CAUSALLY NECESSARY:
For each invariant, we execute:
1. Baseline Test (Gate Active): Proves the safety gate enforces the required contract (fails closed to AMBIGUOUS).
2. Mutation Test (Gate Disabled): Proves that removing the safety gate immediately produces an unsafe false CONFIDENT.

Invariants Covered:
1. Geographic Contradiction Gate
2. Weak Context Rejection Gate (Context Strength Hierarchy)
3. First-Party Crawl Restriction Gate (Anti-Search-Snippet Hallucination)
4. Legal-Only Demotion Gate (Invariant B: Self-Corroboration != Discrimination)
5. External Registry Provider Allowlist Gate (Provenance Verification)
6. Active Coined Collision Probe Gate (Contested Non-Dictionary Names)
7. Track 2 Search-Indexed Fallback Epistemic Cap Gate
"""

from datetime import datetime, timezone
import pytest

from core.models import (
    CrawledDocument, PageType, DocumentQuality, SearchResult,
    IdentityConfidence, IdentityContext, SiteRelationship,
    IdentityEvidence, EvidenceType,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver, ALLOWLISTED_REGISTRY_PROVIDERS
from benchmark_identity_recall import _DeterministicSearchProvider, _DeterministicCrawlManager


def _doc(url: str, title: str, content: str, page_type: PageType = PageType.HOMEPAGE) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        content=content,
        title=title,
        status_code=200,
        quality=DocumentQuality.VALID,
        page_type=page_type,
        retrieved_at=datetime.now(timezone.utc),
    )


# ── 1. Geographic Contradiction Gate Mutation ────────────────────────────────

def test_causal_mutation_geographic_contradiction_gate():
    """Proves that the Geographic Contradiction Gate is causally necessary to prevent false CONFIDENT."""
    company = "Harbor Payments"
    domain = "harborpayments.com"
    url = f"https://{domain}"

    # Caller specifies Toronto, Canada; Candidate first-party explicitly claims Berlin, Germany
    context = IdentityContext(location="Toronto", country="Canada")
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} is a payments gateway.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"{company} is headquartered in Berlin, Germany.", PageType.ABOUT),
    }
    results = [SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} gateway.")]

    # 1. Baseline: Gate active -> AMBIGUOUS (CONTRADICTION_BLOCKED)
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    baseline = resolver.resolve(company, context=context)
    assert baseline.confidence == IdentityConfidence.AMBIGUOUS
    assert baseline.diagnostic_trace.entity_discrimination_basis == "CONTRADICTION_BLOCKED"

    # 2. Mutation: Bypass contradiction gate in resolver
    orig_eval = resolver._evaluate_context_discrimination
    def mutated_eval(cand, ctx):
        # Blindly match without contradiction check
        return True, "Mutated match ignoring contradiction", "USER_CONTEXT"
    resolver._evaluate_context_discrimination = mutated_eval

    mutated = resolver.resolve(company, context=context)
    assert mutated.confidence == IdentityConfidence.CONFIDENT
    assert mutated.domain == domain
    assert mutated.diagnostic_trace.entity_discrimination_basis == "USER_CONTEXT"


# ── 2. Weak Context Rejection Gate Mutation ──────────────────────────────────

def test_causal_mutation_weak_context_rejection_gate():
    """Proves that rejecting WEAK context attributes (country only, company_type only) is causally necessary."""
    company = "Harbor Payments"
    domain = "harborpayments.com"
    url = f"https://{domain}"

    # Caller specifies only weak country attribute
    context = IdentityContext(country="Canada", company_type="bank")
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} is a Canadian bank and financial service.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company} in Canada.", PageType.ABOUT),
    }
    results = [SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} in Canada.")]

    # 1. Baseline: Gate active -> AMBIGUOUS (WEAK_CONTEXT_INSUFFICIENT -> NONE)
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    baseline = resolver.resolve(company, context=context)
    assert baseline.confidence == IdentityConfidence.AMBIGUOUS
    assert baseline.diagnostic_trace.entity_discrimination_basis == "NONE"

    # 2. Mutation: Treat WEAK attributes as sufficient discriminators
    orig_eval = resolver._evaluate_context_discrimination
    def mutated_eval(cand, ctx):
        # Mutated: allow country or company_type to promote
        if ctx.country or ctx.company_type:
            return True, "Mutated: promoted on country/type alone", "USER_CONTEXT"
        return False, "no match", "NONE"
    resolver._evaluate_context_discrimination = mutated_eval

    mutated = resolver.resolve(company, context=context)
    assert mutated.confidence == IdentityConfidence.CONFIDENT
    assert mutated.domain == domain


# ── 3. First-Party Crawl Restriction Gate Mutation ───────────────────────────

def test_causal_mutation_first_party_crawl_restriction_gate():
    """Proves that restricting context matching to live first-party crawled pages is causally necessary."""
    company = "Beacon Systems"
    domain = "beaconsystems.com"
    url = f"https://{domain}"

    # Caller specifies Boston location; Search snippet claims Boston, but live crawled page has generic text
    context = IdentityContext(location="Boston")
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} is a global enterprise company.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company} technology overview.", PageType.ABOUT),
    }
    results = [SearchResult(title=f"{company} – Official", url=url, snippet="Beacon Systems Boston headquarters.")]

    # 1. Baseline: Gate active -> AMBIGUOUS (first-party text lacks Boston -> NONE)
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    baseline = resolver.resolve(company, context=context)
    assert baseline.confidence == IdentityConfidence.AMBIGUOUS
    assert baseline.diagnostic_trace.entity_discrimination_basis == "NONE"

    # 2. Mutation: Fall back to scoring search snippets as if they were first-party text
    orig_eval = resolver._evaluate_context_discrimination
    def mutated_eval(cand, ctx):
        # Mutated: match against search snippet
        snippet_text = " ".join(ev.snippet or "" for ev in cand.evidence if ev.type == EvidenceType.SEARCH_RESULT)
        if ctx.location and ctx.location.lower() in snippet_text.lower():
            return True, "Mutated: matched search snippet", "USER_CONTEXT"
        return False, "no match", "NONE"
    resolver._evaluate_context_discrimination = mutated_eval

    mutated = resolver.resolve(company, context=context)
    assert mutated.confidence == IdentityConfidence.CONFIDENT
    assert mutated.domain == domain


# ── 4. Legal-Only Demotion Gate Mutation (Invariant B) ───────────────────────

def test_causal_mutation_legal_only_demotion_gate():
    """Proves that demoting first-party self-legal statements on shape-risk entities is causally necessary."""
    company = "Trade Republic"
    domain = "traderepublic.com"
    url = f"https://{domain}"

    # First-party site states legal entity, but caller provides NO context and NO external registry
    docs = {
        url: _doc(url, f"{company} – Official", f"{company} web presence.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", "Trade Republic Bank GmbH is supervised by BaFin.", PageType.ABOUT),
    }
    results = [SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} official site.")]

    # 1. Baseline: Gate active -> AMBIGUOUS (Invariant B: self legal form alone remains AMBIGUOUS)
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    baseline = resolver.resolve(company)
    assert baseline.confidence == IdentityConfidence.AMBIGUOUS
    assert baseline.diagnostic_trace.entity_discrimination_basis == "NONE"

    # 2. Mutation: Promote whenever candidate has legal entity signal
    orig_discount = resolver._should_discount_shape_risk
    def mutated_discount(co, best, all_candidates=None, context=None):
        if any(ev.signal == "LEGAL_ENTITY_CORROBORATION" for ev in best.evidence):
            return True, "Mutated: legal entity promoted without external registry", "LEGAL_ENTITY_MATCH"
        return orig_discount(co, best, all_candidates, context=context)
    resolver._should_discount_shape_risk = mutated_discount

    mutated = resolver.resolve(company)
    assert mutated.confidence == IdentityConfidence.CONFIDENT
    assert mutated.domain == domain


# ── 5. External Registry Provider Origin Allowlist Gate Mutation ─────────────

def test_causal_mutation_external_registry_provider_allowlist_gate():
    """Proves that enforcing the allowlisted registry provider origin is causally necessary."""
    company = "Iron Mountain"
    domain = "ironmountain.com"
    url = f"https://{domain}"

    docs = {
        url: _doc(url, f"{company} – Official", f"{company} records storage.", PageType.HOMEPAGE),
        f"{url}/about": _doc(f"{url}/about", f"About {company}", f"About {company} overview.", PageType.ABOUT),
    }
    results = [SearchResult(title=f"{company} – Official", url=url, snippet=f"{company} records storage.")]

    # Candidate has external registry evidence, but from an UNTRUSTED/SPOOFED provider
    untrusted_ev = IdentityEvidence(
        type=EvidenceType.EXTERNAL_REGISTRY,
        source="untrusted_third_party_scraper",
        url="https://untrusted-scraper.com/ironmountain",
        signal="EXTERNAL_REGISTRY_VERIFIED",
        title="Unverified Registry Mirror",
    )

    verifier = WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results))
    orig_classify = verifier.classify_relationship
    def mock_classify(co, w_url, hint_title=None):
        rel, msg, evs = orig_classify(co, w_url, hint_title=hint_title)
        evs.append(untrusted_ev)
        return rel, msg, evs
    verifier.classify_relationship = mock_classify

    # 1. Baseline: Gate active -> UNTRUSTED provider rejected -> AMBIGUOUS
    resolver = IdentityResolver(_DeterministicSearchProvider(company, domain, results), verifier)
    baseline = resolver.resolve(company)
    assert baseline.confidence == IdentityConfidence.AMBIGUOUS
    assert baseline.diagnostic_trace.entity_discrimination_basis == "UNTRUSTED_REGISTRY_SOURCE"

    # 2. Mutation: Bypass provider allowlist
    orig_discount = resolver._should_discount_shape_risk
    def mutated_discount(co, best, all_candidates=None, context=None):
        # Mutated: accept any source for EXTERNAL_REGISTRY
        if any(ev.type == EvidenceType.EXTERNAL_REGISTRY for ev in best.evidence):
            return True, "Mutated: accepted untrusted registry source", "EXTERNAL_ENTITY_MATCH"
        return orig_discount(co, best, all_candidates, context=context)
    resolver._should_discount_shape_risk = mutated_discount

    mutated = resolver.resolve(company)
    assert mutated.confidence == IdentityConfidence.CONFIDENT
    assert mutated.domain == domain
    assert mutated.diagnostic_trace.entity_discrimination_basis == "EXTERNAL_ENTITY_MATCH"


# ── 6. Active Coined Collision Probe Gate Mutation ───────────────────────────

def test_causal_mutation_active_coined_collision_probe_gate():
    """Proves that the active namesake collision probe for coined brands is causally necessary."""
    company = "Moove Mobility"
    domain1 = "moove.io"
    url1 = f"https://{domain1}"

    docs = {
        url1: _doc(url1, f"{company} – Official", f"{company} provides vehicle financing.", PageType.HOMEPAGE),
        f"{url1}/about": _doc(f"{url1}/about", f"About {company}", f"About {company} fleet solutions.", PageType.ABOUT),
    }
    # Main search results only show moove.io, but active probe query discovers competing namesake moove.com
    results = [
        SearchResult(title=f"{company} – Official", url=url1, snippet=f"{company} vehicle financing."),
    ]
    probe_results = [
        SearchResult(title="Moove – Real Estate Coworking", url="https://moove.com", snippet="Moove shared workspaces."),
    ]

    class _ProbeAwareSearchProvider:
        def search(self, query: str, num_results: int = 10):
            if "-site:" in query:
                return probe_results
            return results

    # 1. Baseline: Active collision probe discovers moove.com -> fails closed to AMBIGUOUS
    resolver = IdentityResolver(
        _ProbeAwareSearchProvider(),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _ProbeAwareSearchProvider()),
    )
    baseline = resolver.resolve(company)
    assert baseline.confidence == IdentityConfidence.AMBIGUOUS
    assert baseline.diagnostic_trace.entity_discrimination_basis == "NONE"

    # 2. Mutation: Disable active collision probe
    resolver._check_active_namesake_collision = lambda co, best: (False, "")

    mutated = resolver.resolve(company)
    assert mutated.confidence == IdentityConfidence.CONFIDENT
    assert mutated.domain == domain1
    assert mutated.diagnostic_trace.entity_discrimination_basis == "COINED_BRAND_TOKEN"


# ── 7. Track 2 Search-Indexed Fallback Epistemic Cap Mutation ────────────────

def test_causal_mutation_indexed_fallback_epistemic_cap_gate():
    """Proves that the Track 2 Epistemic Cap on bot-blocked indexed evidence is causally necessary."""
    company = "Paystack Payments"
    domain = "paystack.com"
    url = f"https://{domain}"

    # Bot-blocked homepage -> fallback indexed evidence
    docs = {
        url: CrawledDocument(
            url=url, final_url=url, content="", title="", status_code=403,
            quality=DocumentQuality.BLOCKED, page_type=PageType.HOMEPAGE,
            retrieved_at=datetime.now(timezone.utc),
        ),
        f"{url}/about": CrawledDocument(
            url=f"{url}/about", final_url=f"{url}/about", content="", title="", status_code=403,
            quality=DocumentQuality.BLOCKED, page_type=PageType.ABOUT,
            retrieved_at=datetime.now(timezone.utc),
        ),
    }
    results = [
        SearchResult(title=f"{company}: Official Site", url=url, snippet=f"{company} delivers global payments."),
        SearchResult(title=f"About {company}", url=f"{url}/about", snippet=f"About {company} company information."),
    ]

    # 1. Baseline: Gate active -> is_indexed_only enforces epistemic cap -> AMBIGUOUS
    resolver = IdentityResolver(
        _DeterministicSearchProvider(company, domain, results),
        WebsiteVerifier(_DeterministicCrawlManager(docs), _DeterministicSearchProvider(company, domain, results)),
    )
    baseline = resolver.resolve(company)
    assert baseline.confidence == IdentityConfidence.AMBIGUOUS
    assert baseline.diagnostic_trace.final_decision_rule == "INDEXED_ONLY_EPISTEMIC_CAP_AMBIGUOUS"

    # 2. Mutation: Disable strictly the is_indexed_only epistemic cap by clearing fallback indexed flag
    orig_classify = resolver.verifier.classify_relationship
    def mock_classify(co, cand_url, hint_title=""):
        rel, msg, evs = orig_classify(co, cand_url, hint_title=hint_title)
        mutated_evs = []
        for ev in evs:
            if ev.type == EvidenceType.FALLBACK_INDEXED:
                mutated_evs.append(IdentityEvidence(
                    type=EvidenceType.SELF_IDENTITY,
                    source="homepage_title",
                    url=ev.url,
                    signal=ev.signal,
                    title=ev.title,
                ))
            else:
                mutated_evs.append(ev)
        return rel, msg, mutated_evs
    resolver.verifier.classify_relationship = mock_classify

    mutated = resolver.resolve(company)
    assert mutated.confidence == IdentityConfidence.CONFIDENT
    assert mutated.domain == domain

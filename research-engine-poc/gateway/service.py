import os
import sys
import time
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from search.serper import SerperSearchProvider
from search.duckduckgo import DuckDuckGoSearchProvider
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
    PageType, DocumentQuality, CompanyIdentity,
    SiteRelationship, IdentityCandidate
)
from identity.resolver import normalize_domain
from core.urls import normalize_research_package
from synthesis.bridge import LLMClaimGraphBridge
from synthesis.providers.gemini import GeminiLLMSynthesizer
from synthesis.providers.mistral import MistralLLMSynthesizer

ENGINE_VERSION = "0.1.0"

class ResearchPipelineRunner:
    def __init__(self):
        if os.environ.get("SERPER_API_KEY"):
            self.search_provider = SerperSearchProvider()
        else:
            self.search_provider = DuckDuckGoSearchProvider()

        self.static_crawler = TrafilaturaCrawlerProvider()
        self.browser_crawler = PlaywrightCrawlerProvider()
        self.crawl_manager = CrawlManager(self.static_crawler, self.browser_crawler)

        self.acquirer = FirstPartyAcquirer(self.crawl_manager, self.search_provider)
        self.verifier = WebsiteVerifier(self.search_provider)
        self.resolver = IdentityResolver(self.search_provider, self.verifier, acquirer=self.acquirer)
        self.discoverer = ScopedDiscoverer(self.search_provider)
        self.ranker = DiversityBudgetRanker()

        self.synth = None
        if os.environ.get("GEMINI_API_KEY"):
            self.synth = GeminiLLMSynthesizer(api_key=os.environ.get("GEMINI_API_KEY"))
        elif os.environ.get("MISTRAL_API_KEY"):
            self.synth = MistralLLMSynthesizer(api_key=os.environ.get("MISTRAL_API_KEY"))

    def execute_sync(
        self,
        request_id: str,
        research_run_id: str,
        company_name: str,
        website_url: Optional[str] = None,
        domain: Optional[str] = None,
        industry: Optional[str] = None,
        max_budget: int = 8,
    ) -> Dict[str, Any]:
        """
        Executes the frozen research pipeline synchronously, formatting the output into
        Transport Envelope v1.0.
        """
        t0 = time.perf_counter()
        context = IdentityContext(industry=industry) if industry else None

        # Phase 1: Identity Resolution / Verification
        t_id_start = time.perf_counter()
        if website_url or domain:
            target_url = website_url or f"https://{domain}"
            norm_domain = domain or normalize_domain(target_url)
            try:
                bundle = self.acquirer.acquire(target_url)
                rel, msg, ver_ev = self.verifier.classify_relationship(
                    company_name, target_url, acquisition=bundle
                )
            except Exception as acquire_err:
                rel = SiteRelationship.UNKNOWN
                msg = f"Failed to acquire or verify target URL: {str(acquire_err)}"
                ver_ev = []

            if rel == SiteRelationship.PRIMARY:
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
            elif rel in (SiteRelationship.RELATED, SiteRelationship.LEGACY):
                cand = IdentityCandidate(
                    domain=norm_domain,
                    is_verified=False,
                    relationship=rel,
                    relationship_reasoning=msg,
                    verification_msg=msg,
                    evidence=ver_ev,
                )
                identity = CompanyIdentity(
                    name=company_name,
                    domain=norm_domain,
                    website_url=target_url,
                    confidence=IdentityConfidence.AMBIGUOUS,
                    reasoning=f"Supplied website/domain is ambiguous ({rel.value}): {msg}",
                    candidates=(cand,),
                )
            else:
                cand = IdentityCandidate(
                    domain=norm_domain,
                    is_verified=False,
                    relationship=SiteRelationship.UNKNOWN,
                    relationship_reasoning=msg,
                    verification_msg=msg,
                    evidence=ver_ev,
                )
                identity = CompanyIdentity(
                    name=company_name,
                    domain=norm_domain,
                    website_url=target_url,
                    confidence=IdentityConfidence.UNRESOLVED,
                    reasoning=f"Failed to verify supplied website/domain ({norm_domain}): {msg}",
                    candidates=(cand,),
                )
        else:
            # Neither website_url nor domain supplied -> immediate UNRESOLVED, no naked search
            identity = CompanyIdentity(
                name=company_name,
                domain="",
                website_url="",
                confidence=IdentityConfidence.UNRESOLVED,
                reasoning="No website URL or domain provided in request.",
                candidates=(),
            )
        t_id_end = time.perf_counter()
        duration_identity_ms = (t_id_end - t_id_start) * 1000

        # Halt if identity is not CONFIDENT
        if identity.confidence != IdentityConfidence.CONFIDENT:
            duration_total_ms = (time.perf_counter() - t0) * 1000
            return {
                "contract_version": "1.0",
                "engine_version": ENGINE_VERSION,
                "request_id": request_id,
                "research_run_id": research_run_id,
                "status": "IDENTITY_HALTED",
                "identity": {
                    "confidence": identity.confidence.value,
                    "domain": identity.domain or None,
                    "website_url": identity.website_url or None,
                    "reasoning": identity.reasoning or "Identity not confirmed.",
                },
                "result": None,
                "error": None,
                "metadata": {
                    "duration_ms": round(duration_total_ms, 2),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "cached": False,
                }
            }

        # Phase 2: Scoped Discovery
        t_disc_start = time.perf_counter()
        all_discovered = self.discoverer.discover(
            domain=identity.domain,
            company_name=company_name,
            homepage_url=identity.website_url,
        )
        budgeted_items = self.ranker.select_budgeted_urls(
            all_discovered,
            max_budget=max_budget,
        )
        t_disc_end = time.perf_counter()
        duration_discovery_ms = (t_disc_end - t_disc_start) * 1000

        # Phase 3: Crawling
        t_crawl_start = time.perf_counter()
        documents = []
        for item in budgeted_items:
            doc = self.crawl_manager.fetch_with_fallback(item.url, page_type=item.provisional_page_type)
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
        duration_crawl_ms = (t_crawl_end - t_crawl_start) * 1000

        package = RawResearchPackage(
            identity=identity,
            documents=documents,
            discovered_at=datetime.now(timezone.utc),
        )
        package = normalize_research_package(package)

        # Phase 4: LLM Synthesis
        t_llm_start = time.perf_counter()
        duration_llm_ms = 0.0
        dto_dict = {
            "summary": "",
            "findings": [],
            "sources": [],
            "opportunities": [],
            "evidence": [],
            "unknowns": [],
            "status": "PARTIAL",
        }

        if self.synth is not None:
            graph, dto, diags = LLMClaimGraphBridge.process(package, self.synth)
            t_llm_end = time.perf_counter()
            duration_llm_ms = (t_llm_end - t_llm_start) * 1000
            dto_dict = dto.to_nest_dict()

        duration_total_ms = (time.perf_counter() - t0) * 1000

        return {
            "contract_version": "1.0",
            "engine_version": ENGINE_VERSION,
            "request_id": request_id,
            "research_run_id": research_run_id,
            "status": dto_dict.get("status", "COMPLETED"),
            "identity": {
                "confidence": identity.confidence.value,
                "domain": identity.domain,
                "website_url": identity.website_url,
                "reasoning": identity.reasoning,
            },
            "result": dto_dict,
            "error": None,
            "metadata": {
                "duration_ms": round(duration_total_ms, 2),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "cached": False,
            }
        }

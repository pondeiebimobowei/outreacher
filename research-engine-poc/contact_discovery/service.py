"""
Service runner for production contact discovery pipeline.
"""

import os
from typing import Any, Dict

from crawling.acquirer import FirstPartyAcquirer
from crawling.manager import CrawlManager
from crawling.playwright_crawler import PlaywrightCrawlerProvider
from crawling.trafilatura_crawler import TrafilaturaCrawlerProvider
from identity.verifier import WebsiteVerifier
from search.duckduckgo import DuckDuckGoSearchProvider
from search.serper import SerperSearchProvider

from contact_discovery.pipeline import ContactDiscoveryPipeline
from gateway.schemas import ContactDiscoveryRequest, ContactDiscoveryResponse


class ContactDiscoveryPipelineRunner:
    """Instantiates providers and executes contact discovery synchronously."""

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
        self.pipeline = ContactDiscoveryPipeline(
            verifier=self.verifier,
            acquirer=self.acquirer,
            crawl_manager=self.crawl_manager,
            search_provider=self.search_provider,
        )

    def execute_sync(self, request: ContactDiscoveryRequest) -> Dict[str, Any]:
        """Runs contact discovery pipeline and returns JSON-compatible dictionary."""
        response: ContactDiscoveryResponse = self.pipeline.run(request)
        return response.model_dump(mode="json")

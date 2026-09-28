from core.models import CrawledDocument, PageType, DocumentQuality
from .base import ICrawlerProvider
from .evaluator import DocumentQualityEvaluator
from rich.console import Console

console = Console()

class CrawlManager:
    def __init__(self, static_crawler: ICrawlerProvider, browser_crawler: ICrawlerProvider):
        self.static_crawler = static_crawler
        self.browser_crawler = browser_crawler
        
    def fetch_with_fallback(self, url: str, page_type: PageType) -> CrawledDocument:
        doc = self.static_crawler.fetch(url, page_type)
        quality = DocumentQualityEvaluator.evaluate(doc)
        doc.quality = quality
        
        # Trigger fallback for any failure class (but not TOO_SHORT, since Playwright won't invent words)
        # We might want to fallback for TOO_SHORT if we suspect client-side rendering
        if quality in [DocumentQuality.BLOCKED, DocumentQuality.EXTRACTION_FAILED, DocumentQuality.FETCH_FAILED, DocumentQuality.HTTP_ERROR, DocumentQuality.TOO_SHORT]:
            console.print(f"    [yellow]![/yellow] Static crawl yielded {quality.name}. Falling back to Browser...")
            fallback_doc = self.browser_crawler.fetch(url, page_type)
            fallback_quality = DocumentQualityEvaluator.evaluate(fallback_doc)
            fallback_doc.quality = fallback_quality
            return fallback_doc
            
        return doc

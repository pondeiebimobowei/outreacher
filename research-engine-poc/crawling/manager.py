from core.models import CrawledDocument, PageType, DocumentQuality, CrawlAttempt
from .base import ICrawlerProvider
from .evaluator import DocumentQualityEvaluator
from rich.console import Console

console = Console()

_QUALITY_PRIORITY = {
    DocumentQuality.VALID: 6,
    DocumentQuality.TOO_SHORT: 5,
    DocumentQuality.SUSPECT: 4,
    DocumentQuality.EXTRACTION_FAILED: 3,
    DocumentQuality.FETCH_FAILED: 2,
    DocumentQuality.BLOCKED: 1,
    DocumentQuality.HTTP_ERROR: 0,
}

class CrawlManager:
    def __init__(self, static_crawler: ICrawlerProvider, browser_crawler: ICrawlerProvider):
        self.static_crawler = static_crawler
        self.browser_crawler = browser_crawler
        
    def fetch_with_fallback(self, url: str, page_type: PageType) -> CrawledDocument:
        raw_doc = self.static_crawler.fetch(url, page_type)
        quality = DocumentQualityEvaluator.evaluate(raw_doc)
        static_attempt = CrawlAttempt(strategy="STATIC", quality=quality, error=raw_doc.error)
        
        # Permanent 404 / 410 client errors will not resolve with a browser; skip expensive fallback.
        if raw_doc.status_code in [404, 410]:
            return raw_doc.model_copy(update={"quality": quality, "attempts": (static_attempt,)})
        
        # Trigger browser fallback on client-rendered pages, WAF blocks, or network timeouts
        if quality in [
            DocumentQuality.BLOCKED,
            DocumentQuality.EXTRACTION_FAILED,
            DocumentQuality.FETCH_FAILED,
            DocumentQuality.TOO_SHORT,
        ]:
            console.print(f"    [yellow]![/yellow] Static crawl yielded {quality.name}. Falling back to Browser...")
            fallback_raw = self.browser_crawler.fetch(url, page_type)
            fallback_quality = DocumentQualityEvaluator.evaluate(fallback_raw)
            browser_attempt = CrawlAttempt(strategy="BROWSER", quality=fallback_quality, error=fallback_raw.error)
            attempts = (static_attempt, browser_attempt)
            
            # Pick best attempt: higher quality priority, or higher word count on tie
            static_score = _QUALITY_PRIORITY.get(quality, 0)
            fallback_score = _QUALITY_PRIORITY.get(fallback_quality, 0)
            
            if fallback_score > static_score or (fallback_score == static_score and fallback_raw.word_count >= raw_doc.word_count):
                return fallback_raw.model_copy(update={
                    "quality": fallback_quality,
                    "fetch_strategy": "BROWSER",
                    "attempts": attempts,
                })
            else:
                # Static attempt had better content / higher quality
                return raw_doc.model_copy(update={"quality": quality, "attempts": attempts})
            
        return raw_doc.model_copy(update={"quality": quality, "attempts": (static_attempt,)})

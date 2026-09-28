from playwright.sync_api import sync_playwright
from .base import ICrawlerProvider
from core.models import CrawledDocument, PageType
from datetime import datetime, timezone
import trafilatura

class PlaywrightCrawlerProvider(ICrawlerProvider):
    def fetch(self, url: str, page_type: PageType = PageType.OTHER) -> CrawledDocument:
        now = datetime.now(timezone.utc)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                
                # We catch errors and timeouts gracefully
                response = page.goto(url, wait_until='domcontentloaded', timeout=15000)
                html = page.content()
                status = response.status if response else None
                title = page.title()
                
                text = trafilatura.extract(html)
                browser.close()
                
                if not text:
                    return CrawledDocument(
                        url=url, final_url=page.url, status_code=status, title=title,
                        content=None, content_type="text/html", retrieved_at=now,
                        word_count=0, page_type=page_type, error="Playwright extraction failed"
                    )
                    
                word_count = len(text.split())
                return CrawledDocument(
                    url=url, final_url=page.url, status_code=status, title=title,
                    content=text, content_type="text/plain", retrieved_at=now,
                    word_count=word_count, page_type=page_type, error=None
                )
        except Exception as e:
            return CrawledDocument(
                url=url, final_url=url, status_code=None, title=None,
                content=None, content_type=None, retrieved_at=now,
                word_count=0, page_type=page_type, error=f"Playwright error: {str(e)}"
            )

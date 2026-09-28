from datetime import datetime, timezone
import httpx
import trafilatura
from .base import ICrawlerProvider
from core.models import CrawledDocument, PageType

class TrafilaturaCrawlerProvider(ICrawlerProvider):
    def fetch(self, url: str, page_type: PageType = PageType.OTHER) -> CrawledDocument:
        now = datetime.now(timezone.utc)
        
        try:
            with httpx.Client(follow_redirects=True, timeout=10.0) as client:
                response = client.get(url)
                
            status_code = response.status_code
            final_url = str(response.url)
            content_type = response.headers.get("Content-Type", "")
            html = response.text
            
            # Allow trafilatura to extract from the raw HTML
            extracted = trafilatura.extract(html) if html else None
            word_count = len(extracted.split()) if extracted else 0
            
            return CrawledDocument(
                url=url,
                final_url=final_url,
                status_code=status_code,
                title=None,
                content=extracted,
                content_type=content_type,
                retrieved_at=now,
                word_count=word_count,
                page_type=page_type,
                error=None,
                fetch_strategy="STATIC",
                attempts=[]
            )
        except httpx.RequestError as e:
            return CrawledDocument(
                url=url,
                final_url=url,
                status_code=None,
                title=None,
                content=None,
                content_type=None,
                retrieved_at=now,
                word_count=0,
                page_type=page_type,
                error=f"Fetch failed: {str(e)}",
                fetch_strategy="STATIC",
                attempts=[]
            )

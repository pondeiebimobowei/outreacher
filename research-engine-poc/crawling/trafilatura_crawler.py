import trafilatura
from datetime import datetime, timezone
from .base import ICrawlerProvider
from core.models import CrawledDocument, PageType

class TrafilaturaCrawlerProvider(ICrawlerProvider):
    def fetch(self, url: str, page_type: PageType = PageType.OTHER) -> CrawledDocument:
        now = datetime.now(timezone.utc)
        try:
            downloaded = trafilatura.fetch_url(url)
            if downloaded is None:
                return CrawledDocument(
                    url=url, final_url=url, status_code=None, title=None,
                    content=None, content_type=None, retrieved_at=now,
                    word_count=0, page_type=page_type, error="Failed to download"
                )
            
            metadata = trafilatura.extract_metadata(downloaded)
            text = trafilatura.extract(downloaded)
            
            title = metadata.title if metadata else None
            
            if not text:
                return CrawledDocument(
                    url=url, final_url=url, status_code=200, title=title,
                    content=None, content_type="text/html", retrieved_at=now,
                    word_count=0, page_type=page_type, error="Extraction failed or empty page"
                )
            
            word_count = len(text.split())
            return CrawledDocument(
                url=url, final_url=url, status_code=200, title=title,
                content=text, content_type="text/plain", retrieved_at=now,
                word_count=word_count, page_type=page_type, error=None
            )
        except Exception as e:
            return CrawledDocument(
                url=url, final_url=url, status_code=None, title=None,
                content=None, content_type=None, retrieved_at=now,
                word_count=0, page_type=page_type, error=str(e)
            )

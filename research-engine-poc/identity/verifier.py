from crawling.manager import CrawlManager
from core.models import PageType

class WebsiteVerifier:
    def __init__(self, crawl_manager: CrawlManager):
        self.crawl_manager = crawl_manager

    def verify(self, company_name: str, website_url: str) -> tuple[bool, str]:
        doc = self.crawl_manager.fetch_with_fallback(website_url, PageType.OTHER)
        quality = doc.quality
        
        if quality.name in ["VALID", "TOO_SHORT"]:
            content_to_check = (doc.title or "") + " " + (doc.content or "")
            if company_name.lower() in content_to_check.lower():
                return True, "Homepage verified."
            else:
                return False, "Name not found on homepage."
                
        return False, f"Homepage crawl returned {quality.name}."

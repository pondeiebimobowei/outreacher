from abc import ABC, abstractmethod
from core.models import CrawledDocument, PageType

class ICrawlerProvider(ABC):
    @abstractmethod
    def fetch(self, url: str, page_type: PageType = PageType.OTHER) -> CrawledDocument:
        pass

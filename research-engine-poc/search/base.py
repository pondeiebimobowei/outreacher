from abc import ABC, abstractmethod
from typing import List
from core.models import SearchResult

class SearchProviderError(Exception):
    """Raised when a search provider request fails."""
    pass

class ISearchProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """The canonical name of this search provider (e.g. 'serper', 'duckduckgo')."""
        pass

    @abstractmethod
    def search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        pass

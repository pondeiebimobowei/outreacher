from abc import ABC, abstractmethod
from typing import List
from core.models import SearchResult

class ISearchProvider(ABC):
    @abstractmethod
    def search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        pass

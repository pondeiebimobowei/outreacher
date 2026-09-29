from typing import List
from ddgs import DDGS
from .base import ISearchProvider, SearchProviderError
from core.models import SearchResult

class DuckDuckGoSearchProvider(ISearchProvider):
    @property
    def name(self) -> str:
        return "duckduckgo"

    def search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        results = []
        try:
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=num_results):
                    results.append(SearchResult(
                        title=r.get('title', ''),
                        url=r.get('href', ''),
                        snippet=r.get('body', '')
                    ))
        except Exception as exc:
            raise SearchProviderError(f"DuckDuckGo search failed for query '{query}': {exc}") from exc
        return results

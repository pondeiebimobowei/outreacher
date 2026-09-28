from typing import List
from ddgs import DDGS
from .base import ISearchProvider
from core.models import SearchResult

class DuckDuckGoSearchProvider(ISearchProvider):
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
        except Exception as e:
            print(f"[!] DuckDuckGo Search Error: {e}")
        return results

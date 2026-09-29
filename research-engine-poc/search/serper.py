import os
import httpx
from typing import List, Optional
from .base import ISearchProvider, SearchProviderError
from core.models import SearchResult

class SerperSearchProvider(ISearchProvider):
    def __init__(self, api_key: Optional[str] = None, client: Optional[httpx.Client] = None):
        self.api_key = api_key or os.environ.get("SERPER_API_KEY")
        self._client = client

    @property
    def name(self) -> str:
        return "serper"

    def search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        if not self.api_key:
            raise SearchProviderError("SERPER_API_KEY environment variable is not set.")
            
        url = "https://google.serper.dev/search"
        payload = {
            "q": query,
            "num": num_results
        }
        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json"
        }
        
        try:
            if self._client is not None:
                response = self._client.post(url, json=payload, headers=headers, timeout=10.0)
            else:
                with httpx.Client() as client:
                    response = client.post(url, json=payload, headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            raise SearchProviderError(f"Serper search failed for query '{query}': {exc}") from exc
            
        organic = data.get("organic", [])
        results = []
        for item in organic:
            results.append(SearchResult(
                title=item.get("title", ""),
                url=item.get("link", ""),
                snippet=item.get("snippet", "")
            ))
        return results

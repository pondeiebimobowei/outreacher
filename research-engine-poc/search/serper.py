import os
import httpx
from typing import List
from .base import ISearchProvider
from core.models import SearchResult

class SerperSearchProvider(ISearchProvider):
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("SERPER_API_KEY")
        
    def search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        if not self.api_key:
            raise ValueError("SERPER_API_KEY environment variable is not set.")
            
        url = "https://google.serper.dev/search"
        payload = {
            "q": query,
            "num": num_results
        }
        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json"
        }
        
        with httpx.Client() as client:
            response = client.post(url, json=payload, headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            
        organic = data.get("organic", [])
        results = []
        for item in organic:
            results.append(SearchResult(
                title=item.get("title", ""),
                url=item.get("link", ""),
                snippet=item.get("snippet", "")
            ))
        return results

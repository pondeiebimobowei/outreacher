from typing import List
from core.models import SearchResult

class SearchResultSanitizer:
    @staticmethod
    def sanitize(results: List[SearchResult]) -> List[SearchResult]:
        clean = []
        banned = ['aclick', 'doubleclick', 'google.com/url', 'bing.com/aclick', 'adurl']
        for r in results:
            url_lower = r.url.lower()
            if any(b in url_lower for b in banned):
                continue
            clean.append(r)
        return clean

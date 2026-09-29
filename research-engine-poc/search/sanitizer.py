from typing import List
from urllib.parse import urlparse, parse_qs, unquote
from core.models import SearchResult

class SearchResultSanitizer:
    """
    Sanitizes search results by:
      - Validating URL structure (must be http/https with valid netloc).
      - Unwrapping search engine redirect URLs (e.g., google.com/url?q=...).
      - Rejecting sponsored ad networks, click tracking endpoints, and malformed entries.
    """
    _BANNED_HOSTS = {
        'googleadservices.com',
        'doubleclick.net',
        'adservice.google.com',
        'bing.com/aclick',
        'clickserve.dartsearch.net',
        'outbrain.com',
        'taboola.com',
    }

    _BANNED_PATH_SUBSTRINGS = {
        '/aclick',
        '/adurl',
        '/pagead/',
    }

    @classmethod
    def _unwrap_redirect(cls, url: str) -> str:
        """Unwrap google.com/url?q=... or bing.com/ck/a?... destination URLs if present."""
        try:
            parsed = urlparse(url)
            host = parsed.netloc.lower()
            if 'google.com' in host and parsed.path == '/url':
                qs = parse_qs(parsed.query)
                if 'q' in qs and qs['q']:
                    return unquote(qs['q'][0])
                if 'url' in qs and qs['url']:
                    return unquote(qs['url'][0])
        except Exception:
            pass
        return url

    @classmethod
    def sanitize(cls, results: List[SearchResult]) -> List[SearchResult]:
        clean: List[SearchResult] = []
        for r in results:
            if not r.url:
                continue
                
            raw_url = cls._unwrap_redirect(r.url.strip())
            try:
                parsed = urlparse(raw_url)
                if parsed.scheme.lower() not in ('http', 'https'):
                    continue
                hostname = parsed.hostname
                if not hostname:
                    continue
                    
                host = hostname.lower().removeprefix('www.')
                path = parsed.path.lower()
                
                # Check banned ad tracker hosts
                if any(banned in host for banned in cls._BANNED_HOSTS):
                    continue
                # Check banned ad click paths
                if any(banned in path for banned in cls._BANNED_PATH_SUBSTRINGS):
                    continue
                    
                clean.append(SearchResult(
                    title=r.title,
                    url=raw_url,
                    snippet=r.snippet,
                ))
            except Exception:
                continue
                
        return clean

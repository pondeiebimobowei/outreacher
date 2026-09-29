from typing import List, Optional
from rich.console import Console
from core.models import DiscoveredURL, DiscoveryPurpose, PageType
from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from .queries import DiscoveryQueryBuilder
from .scope import DomainScopeFilter
from .classifier import TwoStageClassifier

console = Console()

def _canonicalize_quick(url: str) -> str:
    """Imported from pipeline.acquisition to avoid circular dependencies."""
    from pipeline.acquisition import canonicalize_url
    return canonicalize_url(url)

class ScopedDiscoverer:
    """
    Executes structured discovery queries, sanitizes results, applies strict domain scoping,
    and assigns provisional PageType classifications.
    """
    def __init__(self, search_provider: ISearchProvider):
        self.search_provider = search_provider
        self.provider_name = (
            search_provider.__class__.__name__
            .replace("SearchProvider", "")
            .lower()
        )

    def discover(
        self,
        domain: str,
        company_name: str,
        homepage_url: Optional[str] = None,
    ) -> List[DiscoveredURL]:
        discovered: List[DiscoveredURL] = []
        seen_urls = set()

        # Seed with canonical homepage
        hp_url = homepage_url or f"https://{domain}"
        can_hp = _canonicalize_quick(hp_url)
        if can_hp:
            seen_urls.add(can_hp)
            discovered.append(DiscoveredURL(
                url=can_hp,
                purpose=DiscoveryPurpose.HOMEPAGE,
                source="homepage_seed",
                query="canonical_homepage",
                rank=0,
                provisional_page_type=PageType.HOMEPAGE,
            ))

        queries = DiscoveryQueryBuilder.build_queries(domain, company_name)
        
        for q in queries:
            try:
                raw_results = self.search_provider.search(q.query, num_results=q.max_results)
                clean_results = SearchResultSanitizer.sanitize(raw_results)
                
                for rank, res in enumerate(clean_results, start=1):
                    can_url = _canonicalize_quick(res.url)
                    if not can_url or can_url in seen_urls:
                        continue
                        
                    # Strict domain & tenant scope check
                    if not DomainScopeFilter.is_allowed(can_url, domain, company_name=company_name):
                        continue
                        
                    provisional_type = TwoStageClassifier.stage1_classify_url(can_url, purpose=q.purpose)
                    
                    seen_urls.add(can_url)
                    discovered.append(DiscoveredURL(
                        url=can_url,
                        purpose=q.purpose,
                        source=self.provider_name,
                        query=q.query,
                        rank=rank,
                        provisional_page_type=provisional_type,
                    ))
            except Exception as exc:
                console.print(f"    [!] Discovery query failed ('{q.query[:35]}...'): {exc}")
                
        return discovered

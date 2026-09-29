from typing import List, Dict, Set, Optional
from core.models import DiscoveredURL, PageType

class DiversityBudgetRanker:
    """
    Ranks and selects discovered URLs under a strict crawl budget,
    maximizing evidence diversity across research categories.
    
    Prevents search ranking from crowding out essential categories
    (e.g., prevents spending all 8 slots on blog posts or job listings).
    """
    DEFAULT_BUDGET = 8

    # Default category quota priority
    CATEGORY_QUOTAS: Dict[PageType, int] = {
        PageType.HOMEPAGE: 1,
        PageType.ABOUT: 1,
        PageType.PRODUCT: 1,
        PageType.CAREERS_INDEX: 1,
        PageType.JOB_LISTING: 2,
        PageType.CASE_STUDY: 1,
        PageType.BLOG: 1,
        PageType.CONTACT: 1,
        PageType.OTHER: 1,
    }

    def __init__(self, category_quotas: Optional[Dict[PageType, int]] = None):
        self.category_quotas = category_quotas if category_quotas is not None else dict(self.CATEGORY_QUOTAS)

    def select_budgeted_urls(
        self,
        discovered: List[DiscoveredURL],
        max_budget: int = DEFAULT_BUDGET,
    ) -> List[DiscoveredURL]:
        if not discovered or max_budget <= 0:
            return []

        # Deduplicate by URL while preserving best rank
        unique_by_url: Dict[str, DiscoveredURL] = {}
        for d in discovered:
            if d.url not in unique_by_url:
                unique_by_url[d.url] = d
            elif d.rank < unique_by_url[d.url].rank:
                unique_by_url[d.url] = d

        items = list(unique_by_url.values())

        # Group by provisional page type, sorted by search rank
        by_type: Dict[PageType, List[DiscoveredURL]] = {ptype: [] for ptype in PageType}
        for item in items:
            by_type[item.provisional_page_type].append(item)

        for ptype in by_type:
            by_type[ptype].sort(key=lambda x: x.rank)

        selected: List[DiscoveredURL] = []
        selected_urls: Set[str] = set()

        # Pass 1: Allocate quotas in priority order
        quota_order = [
            PageType.HOMEPAGE,
            PageType.ABOUT,
            PageType.PRODUCT,
            PageType.CAREERS_INDEX,
            PageType.JOB_LISTING,
            PageType.CASE_STUDY,
            PageType.BLOG,
            PageType.CONTACT,
        ]

        for ptype in quota_order:
            quota = self.category_quotas.get(ptype, 1)
            candidates = by_type.get(ptype, [])
            for cand in candidates[:quota]:
                if len(selected) >= max_budget:
                    break
                if cand.url not in selected_urls:
                    selected.append(cand)
                    selected_urls.add(cand.url)

        # Pass 2: Fill remaining budget with highest-ranking remaining candidates
        if len(selected) < max_budget:
            remaining = [
                d for d in items
                if d.url not in selected_urls
            ]
            # Sort by search rank, then category priority
            type_priority = {pt: idx for idx, pt in enumerate(quota_order)}
            remaining.sort(key=lambda x: (x.rank, type_priority.get(x.provisional_page_type, 99)))
            
            for cand in remaining:
                if len(selected) >= max_budget:
                    break
                selected.append(cand)
                selected_urls.add(cand.url)

        return selected

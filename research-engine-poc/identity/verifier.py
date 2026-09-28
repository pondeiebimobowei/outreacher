import re
from typing import List, Tuple
from crawling.manager import CrawlManager
from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from core.models import PageType, IdentityEvidence, EvidenceType
from pipeline.discovery import URLClassifier

class WebsiteVerifier:
    def __init__(self, crawl_manager: CrawlManager, search_provider: ISearchProvider):
        self.crawl_manager = crawl_manager
        self.search_provider = search_provider
        # Derive provider name
        self.provider_name = search_provider.__class__.__name__.replace("SearchProvider", "").lower()

    def verify(self, company_name: str, website_url: str) -> Tuple[bool, str, List[IdentityEvidence]]:
        evidence_list = []
        company_lower = company_name.lower().strip()
        clean_name = re.sub(r'[^a-z0-9]', '', company_lower)
        
        # 1. Fetch Homepage
        hp_doc = self.crawl_manager.fetch_with_fallback(website_url, PageType.OTHER)
        hp_quality = hp_doc.quality
        
        if hp_quality.name not in ["VALID", "TOO_SHORT"]:
            return False, "Homepage fetch failed or was blocked.", evidence_list
            
        title = (hp_doc.title or "").lower()
        content = (hp_doc.content or "").lower()
        
        has_hp_title = False
        has_hp_content = False
        
        if company_lower in title or clean_name in title:
            has_hp_title = True
            evidence_list.append(IdentityEvidence(
                type=EvidenceType.PAGE_IDENTITY, source="homepage", url=website_url,
                signal="EXACT_NAME_IN_TITLE"
            ))
            
        if company_lower in content:
            has_hp_content = True
            evidence_list.append(IdentityEvidence(
                type=EvidenceType.PAGE_IDENTITY, source="homepage", url=website_url,
                signal="EXACT_NAME_IN_CONTENT"
            ))
            
        if not (has_hp_title or has_hp_content):
            return False, "Name not found on homepage.", evidence_list

        # 2. Discover Corroborating Page
        domain = website_url.replace("https://", "").replace("http://", "").rstrip("/")
        query = f'site:{domain} "about" OR "company" OR "contact"'
        corroboration_urls = []
        
        try:
            raw_results = self.search_provider.search(query, num_results=3)
            clean_results = SearchResultSanitizer.sanitize(raw_results)
            for r in clean_results:
                if r.url != website_url and r.url != website_url + "/":
                    corroboration_urls.append(r.url)
        except Exception:
            pass
            
        if not corroboration_urls:
            corroboration_urls.append(website_url + "/about")

        has_corroboration = False
        
        for url in corroboration_urls:
            ptype = URLClassifier.classify(url)
            # MUST be a proper identity page type to count as corroboration
            if ptype not in [PageType.ABOUT, PageType.CONTACT, PageType.CAREERS_INDEX]:
                continue
                
            about_doc = self.crawl_manager.fetch_with_fallback(url, ptype)
            if about_doc.quality.name in ["VALID", "TOO_SHORT"]:
                about_title = (about_doc.title or "").lower()
                about_content = (about_doc.content or "").lower()
                
                if company_lower in about_content or company_lower in about_title:
                    has_corroboration = True
                    evidence_list.append(IdentityEvidence(
                        type=EvidenceType.PAGE_IDENTITY, source="secondary_page", url=url,
                        signal="NAME_IN_SECONDARY_PAGE"
                    ))
                    break # One corroboration is enough
                
        # 3. Decision Logic
        if has_corroboration:
            return True, "Strong multi-page identity verified.", evidence_list
        else:
            return False, "Weak verification: name found on homepage but uncorroborated by a valid secondary page.", evidence_list

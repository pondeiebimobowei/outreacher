import re
from typing import List, Tuple
from crawling.manager import CrawlManager
from core.models import PageType, IdentityEvidence, EvidenceType

class WebsiteVerifier:
    def __init__(self, crawl_manager: CrawlManager):
        self.crawl_manager = crawl_manager

    def verify(self, company_name: str, website_url: str) -> Tuple[bool, str, List[IdentityEvidence]]:
        evidence_list = []
        company_lower = company_name.lower().strip()
        clean_name = re.sub(r'[^a-z0-9]', '', company_lower)
        
        # 1. Fetch Homepage
        hp_doc = self.crawl_manager.fetch_with_fallback(website_url, PageType.OTHER)
        hp_quality = hp_doc.quality
        
        if hp_quality.name in ["VALID", "TOO_SHORT"]:
            title = (hp_doc.title or "").lower()
            content = (hp_doc.content or "").lower()
            
            if company_lower in title or clean_name in title:
                evidence_list.append(IdentityEvidence(
                    type=EvidenceType.PAGE_IDENTITY, source="homepage", url=website_url,
                    signal="EXACT_NAME_IN_TITLE"
                ))
            if company_lower in content:
                evidence_list.append(IdentityEvidence(
                    type=EvidenceType.PAGE_IDENTITY, source="homepage", url=website_url,
                    signal="EXACT_NAME_IN_CONTENT"
                ))
        
        # 2. Try fetching an about or contact page to corroborate
        about_url = website_url.rstrip("/") + "/about"
        about_doc = self.crawl_manager.fetch_with_fallback(about_url, PageType.ABOUT)
        
        if about_doc.quality.name in ["VALID", "TOO_SHORT"]:
            about_content = (about_doc.content or "").lower()
            if company_lower in about_content:
                evidence_list.append(IdentityEvidence(
                    type=EvidenceType.PAGE_IDENTITY, source="about_page", url=about_url,
                    signal="NAME_IN_ABOUT_PAGE"
                ))
                
        # 3. Decision Logic
        has_hp_title = any(e.signal == "EXACT_NAME_IN_TITLE" for e in evidence_list)
        has_hp_content = any(e.signal == "EXACT_NAME_IN_CONTENT" for e in evidence_list)
        has_corroboration = any(e.signal == "NAME_IN_ABOUT_PAGE" for e in evidence_list)
        
        if (has_hp_title or has_hp_content) and has_corroboration:
            return True, "Strong multi-page identity verified.", evidence_list
        elif has_hp_title and has_hp_content:
            return True, "Homepage title and content match.", evidence_list
        elif has_hp_title or has_hp_content:
            return False, "Weak verification: name found on homepage but uncorroborated.", evidence_list
        else:
            return False, "Name not found on primary pages.", evidence_list

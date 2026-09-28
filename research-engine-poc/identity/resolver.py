from core.models import PageType
import re
from urllib.parse import urlparse
from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from core.models import CompanyIdentity, IdentityConfidence
from crawling.base import ICrawlerProvider
from crawling.evaluator import DocumentQualityEvaluator

class IdentityResolver:
    def __init__(self, search_provider: ISearchProvider, crawler: ICrawlerProvider):
        self.search_provider = search_provider
        self.crawler = crawler
        
    def resolve(self, company_name: str) -> CompanyIdentity:
        query = f'"{company_name}" official website'
        raw_results = self.search_provider.search(query, num_results=10)
        results = SearchResultSanitizer.sanitize(raw_results)
        
        excluded_domains = [
            'linkedin.com', 'crunchbase.com', 'wikipedia.org', 
            'twitter.com', 'x.com', 'facebook.com', 'youtube.com',
            'glassdoor.com', 'g2.com', 'capterra.com', 'bloomberg.com',
            'ycombinator.com', 'pitchbook.com', 'zoominfo.com', 'builtin.com'
        ]
        
        candidates = []
        for r in results:
            parsed = urlparse(r.url)
            domain = parsed.netloc.replace('www.', '')
            if any(ex in domain for ex in excluded_domains):
                continue
                
            score = 0
            name_lower = company_name.lower().strip()
            clean_name = re.sub(r'[^a-z0-9]', '', name_lower)
            
            if clean_name and clean_name in domain:
                score += 5
                if domain.startswith(clean_name + "."):
                    score += 3
                    
            if name_lower in r.title.lower():
                score += 3
                
            if "official" in r.snippet.lower() or name_lower in r.snippet.lower():
                score += 2
                
            candidates.append((score, domain, r))
            
        if not candidates:
            return CompanyIdentity(
                name=company_name, domain="", website_url="",
                confidence=IdentityConfidence.UNRESOLVED,
                reasoning="No non-excluded domains found."
            )
            
        candidates.sort(key=lambda x: x[0], reverse=True)
        top_score, top_domain, top_result = candidates[0]
        
        scheme = urlparse(top_result.url).scheme or "https"
        website_url = f"{scheme}://{top_domain}"
        
        # Identity Verification
        confidence = IdentityConfidence.AMBIGUOUS
        verification_reason = f"Score: {top_score}."
        
        if top_score >= 8:
            doc = self.crawler.fetch_with_fallback(website_url, page_type=PageType.OTHER)
            quality = DocumentQualityEvaluator.evaluate(doc)
            
            if quality.name in ["VALID", "TOO_SHORT"]:
                content_to_check = (doc.title or "") + " " + (doc.content or "")
                if company_name.lower() in content_to_check.lower():
                    confidence = IdentityConfidence.CONFIDENT
                    verification_reason += " Homepage verified."
                else:
                    verification_reason += " Name not found on homepage."
            else:
                verification_reason += f" Homepage crawl returned {quality.name}."
        else:
            verification_reason += " Score too low for automatic CONFIDENT."
                
        return CompanyIdentity(
            name=company_name,
            domain=top_domain,
            website_url=website_url,
            confidence=confidence,
            reasoning=verification_reason
        )

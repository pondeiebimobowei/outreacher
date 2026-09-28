import re
from urllib.parse import urlparse
from search.base import ISearchProvider
from core.models import CompanyIdentity, IdentityConfidence

class IdentityResolver:
    def __init__(self, search_provider: ISearchProvider):
        self.search_provider = search_provider
        
    def resolve(self, company_name: str) -> CompanyIdentity:
        query = f'"{company_name}" official website'
        results = self.search_provider.search(query, num_results=10)
        
        excluded_domains = [
            'linkedin.com', 'crunchbase.com', 'wikipedia.org', 
            'twitter.com', 'x.com', 'facebook.com', 'youtube.com',
            'glassdoor.com', 'g2.com', 'capterra.com', 'bloomberg.com',
            'ycombinator.com', 'pitchbook.com', 'zoominfo.com'
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
            
            # Domain match
            if clean_name and clean_name in domain:
                score += 5
                if domain.startswith(clean_name + "."):
                    score += 3  # exact domain prefix
                    
            # Title match
            if name_lower in r.title.lower():
                score += 3
                
            # Snippet relevance
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
        
        confidence = IdentityConfidence.AMBIGUOUS
        if top_score >= 8:
            confidence = IdentityConfidence.CONFIDENT
            
        # Ambiguity check
        if len(candidates) > 1:
            runner_up_score = candidates[1][0]
            if runner_up_score >= top_score - 2 and candidates[1][1] != top_domain:
                confidence = IdentityConfidence.AMBIGUOUS
                
        scheme = urlparse(top_result.url).scheme or "https"
        
        return CompanyIdentity(
            name=company_name,
            domain=top_domain,
            website_url=f"{scheme}://{top_domain}",
            confidence=confidence,
            reasoning=f"Score: {top_score}. Competitors: {len(candidates)}"
        )

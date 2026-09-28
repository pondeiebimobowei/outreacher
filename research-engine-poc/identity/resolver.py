import re
from urllib.parse import urlparse
from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from core.models import CompanyIdentity, IdentityConfidence, IdentityCandidate
from identity.verifier import WebsiteVerifier

class IdentityResolver:
    def __init__(self, search_provider: ISearchProvider, verifier: WebsiteVerifier):
        self.search_provider = search_provider
        self.verifier = verifier
        
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
        
        candidate_list = []
        for r in results:
            parsed = urlparse(r.url)
            domain = parsed.netloc.replace('www.', '')
            if any(ex in domain for ex in excluded_domains):
                continue
                
            score = 0
            reasons = []
            name_lower = company_name.lower().strip()
            clean_name = re.sub(r'[^a-z0-9]', '', name_lower)
            
            if clean_name and clean_name in domain:
                score += 5
                reasons.append("Name in domain")
                if domain.startswith(clean_name + "."):
                    score += 3
                    reasons.append("Domain prefix match")
                    
            if name_lower in r.title.lower():
                score += 3
                reasons.append("Name in title")
                
            if "official" in r.snippet.lower() or name_lower in r.snippet.lower():
                score += 2
                reasons.append("Snippet signal")
                
            candidate_list.append((score, domain, r, reasons))
            
        if not candidate_list:
            return CompanyIdentity(
                name=company_name, domain="", website_url="",
                confidence=IdentityConfidence.UNRESOLVED,
                reasoning="No non-excluded domains found.",
                candidates=[]
            )
            
        candidate_list.sort(key=lambda x: x[0], reverse=True)
        
        recorded_candidates = []
        for c in candidate_list:
            recorded_candidates.append(IdentityCandidate(domain=c[1], score=c[0], reasons=c[3]))
            
        top_score, top_domain, top_result, top_reasons = candidate_list[0]
        
        scheme = urlparse(top_result.url).scheme or "https"
        website_url = f"{scheme}://{top_domain}"
        
        confidence = IdentityConfidence.AMBIGUOUS
        verification_reason = f"Top Score: {top_score}."
        
        if top_score >= 8:
            is_verified, msg = self.verifier.verify(company_name, website_url)
            verification_reason += " " + msg
            if is_verified:
                confidence = IdentityConfidence.CONFIDENT
        else:
            verification_reason += " Score too low for automatic CONFIDENT."
                
        return CompanyIdentity(
            name=company_name,
            domain=top_domain,
            website_url=website_url,
            confidence=confidence,
            reasoning=verification_reason,
            candidates=recorded_candidates
        )

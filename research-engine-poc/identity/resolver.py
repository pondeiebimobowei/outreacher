import re
from urllib.parse import urlparse
from collections import defaultdict
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
            'ycombinator.com', 'pitchbook.com', 'zoominfo.com', 'builtin.com',
            'f6s.com', 'b2bhint.com', 'instagram.com', 'github.com', 'app.apollo.io'
        ]
        
        domain_scores = defaultdict(int)
        domain_reasons = defaultdict(set)
        domain_result = {}
        
        name_lower = company_name.lower().strip()
        clean_name = re.sub(r'[^a-z0-9]', '', name_lower)
        
        for r in results:
            parsed = urlparse(r.url)
            domain = parsed.netloc.replace('www.', '')
            if any(ex in domain for ex in excluded_domains):
                continue
                
            # Multiple appearances bonus
            if domain in domain_scores:
                domain_scores[domain] += 2
                domain_reasons[domain].add("Multiple search results")
                continue
                
            domain_result[domain] = r
            
            if clean_name and clean_name in domain:
                domain_scores[domain] += 5
                domain_reasons[domain].add("Name in domain")
                if domain.startswith(clean_name + "."):
                    domain_scores[domain] += 3
                    domain_reasons[domain].add("Domain prefix match")
                    
            if name_lower in r.title.lower():
                domain_scores[domain] += 3
                domain_reasons[domain].add("Name in title")
                
            if "official" in r.snippet.lower() or name_lower in r.snippet.lower():
                domain_scores[domain] += 2
                domain_reasons[domain].add("Snippet signal")
                
        candidate_list = []
        for domain, score in domain_scores.items():
            candidate_list.append((score, domain, domain_result[domain], list(domain_reasons[domain])))
            
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
            
        top_score = candidate_list[0][0]
        top_domain = candidate_list[0][1]
        top_result = candidate_list[0][2]
        
        scheme = urlparse(top_result.url).scheme or "https"
        website_url = f"{scheme}://{top_domain}"
        
        confidence = IdentityConfidence.AMBIGUOUS
        verification_reason = f"Top Score: {top_score}."
        
        margin_ok = True
        if len(candidate_list) > 1:
            margin = top_score - candidate_list[1][0]
            if margin < 3:
                margin_ok = False
                verification_reason += f" Margin to 2nd candidate is only {margin}."
                
        if top_score >= 8 and margin_ok:
            is_verified, msg = self.verifier.verify(company_name, website_url)
            verification_reason += " " + msg
            if is_verified:
                confidence = IdentityConfidence.CONFIDENT
        elif top_score < 8:
            verification_reason += " Score too low for automatic CONFIDENT."
                
        return CompanyIdentity(
            name=company_name,
            domain=top_domain,
            website_url=website_url,
            confidence=confidence,
            reasoning=verification_reason,
            candidates=recorded_candidates
        )

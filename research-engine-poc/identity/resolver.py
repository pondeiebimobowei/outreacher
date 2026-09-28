import re
from urllib.parse import urlparse
from collections import defaultdict
from typing import List, Tuple
from search.base import ISearchProvider
from search.sanitizer import SearchResultSanitizer
from core.models import CompanyIdentity, IdentityConfidence, IdentityCandidate, IdentityEvidence, EvidenceType
from identity.verifier import WebsiteVerifier

class IdentityResolver:
    def __init__(self, search_provider: ISearchProvider, verifier: WebsiteVerifier):
        self.search_provider = search_provider
        self.verifier = verifier
        self.provider_name = search_provider.__class__.__name__.replace("SearchProvider", "").lower()
        
    def resolve(self, company_name: str) -> CompanyIdentity:
        query = f'"{company_name}" official website'
        raw_results = self.search_provider.search(query, num_results=10)
        results = SearchResultSanitizer.sanitize(raw_results)
        
        excluded_domains = [
            'linkedin.com', 'crunchbase.com', 'wikipedia.org', 
            'twitter.com', 'x.com', 'facebook.com', 'youtube.com',
            'glassdoor.com', 'g2.com', 'capterra.com', 'bloomberg.com',
            'ycombinator.com', 'pitchbook.com', 'zoominfo.com', 'builtin.com',
            'f6s.com', 'b2bhint.com', 'instagram.com', 'github.com', 'app.apollo.io',
            'web.app', 'herokuapp.com', 'vercel.app', 'github.io', 'maptons.com'
        ]
        
        domain_evidence = defaultdict(list)
        domain_top_result = {}
        domain_ranks = defaultdict(list)
        
        name_lower = company_name.lower().strip()
        clean_name = re.sub(r'[^a-z0-9]', '', name_lower)
        
        for idx, r in enumerate(results):
            parsed = urlparse(r.url)
            domain = parsed.netloc.replace('www.', '').lower()
            
            if any(domain == ex or domain.endswith("." + ex) for ex in excluded_domains):
                continue
                
            if domain not in domain_top_result:
                domain_top_result[domain] = r
                
            domain_ranks[domain].append(idx + 1)
                
            domain_evidence[domain].append(IdentityEvidence(
                type=EvidenceType.SEARCH_RESULT,
                source=self.provider_name,
                url=r.url,
                signal="RANKED_RESULT",
                rank=idx + 1,
                query=query,
                title=r.title
            ))
                
        candidate_list = []
        for domain, evidence_list in domain_evidence.items():
            ranks = domain_ranks[domain]
            best_rank = min(ranks)
            
            rank_score = max(0, 11 - best_rank)
            
            name_score = 0
            if clean_name and clean_name in domain:
                name_score += 5
            if domain.startswith(clean_name + "."):
                name_score += 3
                
            generation_score = rank_score + name_score + (len(ranks) - 1)
            candidate_list.append((generation_score, domain, evidence_list))
            
        if not candidate_list:
            return CompanyIdentity(
                name=company_name, domain="", website_url="",
                confidence=IdentityConfidence.UNRESOLVED,
                reasoning="No candidates passed the domain exclusion filter.",
                candidates=[], evidence=[]
            )
            
        candidate_list.sort(key=lambda x: x[0], reverse=True)
        
        recorded_candidates = []
        for c in candidate_list:
            recorded_candidates.append(IdentityCandidate(domain=c[1], evidence=c[2]))
            
        top_candidates = candidate_list[:2]
        verified_candidates = []
        all_verification_failures = []
        
        for score, domain, evidence_list in top_candidates:
            scheme = urlparse(domain_top_result[domain].url).scheme or "https"
            website_url = f"{scheme}://{domain}"
            
            is_verified, msg, ver_evidence = self.verifier.verify(company_name, website_url)
            all_evidence = list(evidence_list) + ver_evidence
            
            if is_verified:
                verified_candidates.append({
                    "domain": domain,
                    "website_url": website_url,
                    "evidence": all_evidence,
                    "msg": msg
                })
            else:
                all_verification_failures.append(msg)
                
        if len(verified_candidates) == 1:
            confidence = IdentityConfidence.CONFIDENT
            best = verified_candidates[0]
            reasoning = "Strongly verified top candidate. " + best["msg"]
            domain = best["domain"]
            website_url = best["website_url"]
            all_evidence = best["evidence"]
        elif len(verified_candidates) > 1:
            confidence = IdentityConfidence.AMBIGUOUS
            best = verified_candidates[0]
            reasoning = "Multiple candidates strongly verified. Identity is ambiguous."
            domain = best["domain"]
            website_url = best["website_url"]
            all_evidence = best["evidence"]
        else:
            confidence = IdentityConfidence.AMBIGUOUS
            failure_reason = all_verification_failures[0] if all_verification_failures else ""
            reasoning = f"No candidates strongly verified. {failure_reason}"
            domain = top_candidates[0][1]
            scheme = urlparse(domain_top_result[domain].url).scheme or "https"
            website_url = f"{scheme}://{domain}"
            
            # Re-verify just to grab the evidence array for the best failed candidate
            _, _, failed_ev = self.verifier.verify(company_name, website_url)
            all_evidence = top_candidates[0][2] + failed_ev
            
        return CompanyIdentity(
            name=company_name,
            domain=domain,
            website_url=website_url,
            confidence=confidence,
            reasoning=reasoning,
            candidates=recorded_candidates,
            evidence=all_evidence
        )

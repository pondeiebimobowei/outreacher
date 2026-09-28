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
        
        name_lower = company_name.lower().strip()
        clean_name = re.sub(r'[^a-z0-9]', '', name_lower)
        
        for idx, r in enumerate(results):
            parsed = urlparse(r.url)
            domain = parsed.netloc.replace('www.', '').lower()
            
            # Exact exclusion match or subdomain of excluded
            if any(domain == ex or domain.endswith("." + ex) for ex in excluded_domains):
                continue
                
            if domain not in domain_top_result:
                domain_top_result[domain] = r
                
            # Treat each search result as a distinct piece of search evidence
            rank = idx + 1
            domain_evidence[domain].append(IdentityEvidence(
                type=EvidenceType.SEARCH_RESULT,
                source="search_engine",
                url=r.url,
                signal="RANKED_RESULT",
                rank=rank
            ))
            
            if clean_name and clean_name in domain:
                domain_evidence[domain].append(IdentityEvidence(
                    type=EvidenceType.SEARCH_RESULT, source="search_engine", url=r.url,
                    signal="NAME_IN_DOMAIN", rank=rank
                ))
            if domain.startswith(clean_name + "."):
                domain_evidence[domain].append(IdentityEvidence(
                    type=EvidenceType.SEARCH_RESULT, source="search_engine", url=r.url,
                    signal="DOMAIN_PREFIX_MATCH", rank=rank
                ))
            if name_lower in r.title.lower():
                domain_evidence[domain].append(IdentityEvidence(
                    type=EvidenceType.SEARCH_RESULT, source="search_engine", url=r.url,
                    signal="NAME_IN_TITLE", rank=rank
                ))
                
        candidate_list = []
        for domain, evidence_list in domain_evidence.items():
            # A simplistic heuristic to sort candidates (rank 1 is better, more evidence is better)
            score = len(evidence_list) * 2
            top_rank = min((e.rank for e in evidence_list if e.rank is not None), default=10)
            score += (10 - top_rank)
            
            candidate_list.append((score, domain, evidence_list))
            
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
            
        top_score = candidate_list[0][0]
        top_domain = candidate_list[0][1]
        top_evidence = candidate_list[0][2]
        
        scheme = urlparse(domain_top_result[top_domain].url).scheme or "https"
        website_url = f"{scheme}://{top_domain}"
        
        confidence = IdentityConfidence.AMBIGUOUS
        reasoning = f"Top candidate {top_domain} selected from {len(candidate_list)} domains."
        
        margin_ok = True
        if len(candidate_list) > 1:
            margin = top_score - candidate_list[1][0]
            if margin < 3:
                margin_ok = False
                reasoning += " Margin to second place is too small (ambiguous search results)."
                
        # Candidate generation -> Verification
        all_evidence = list(top_evidence)
        if margin_ok:
            is_verified, msg, ver_evidence = self.verifier.verify(company_name, website_url)
            all_evidence.extend(ver_evidence)
            reasoning += " " + msg
            if is_verified:
                confidence = IdentityConfidence.CONFIDENT
            else:
                confidence = IdentityConfidence.AMBIGUOUS
        else:
            reasoning += " Skipped active verification due to weak/ambiguous search margin."
            
        return CompanyIdentity(
            name=company_name,
            domain=top_domain,
            website_url=website_url,
            confidence=confidence,
            reasoning=reasoning,
            candidates=recorded_candidates,
            evidence=all_evidence
        )

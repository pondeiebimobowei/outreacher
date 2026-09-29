import re
from urllib.parse import urlparse
from typing import Optional, Set

class DomainScopeFilter:
    """
    Enforces strict security and domain boundaries on discovered URLs.
    
    Rules:
      1. Primary domain or its subdomains (e.g. *.domain.com) are always allowed.
      2. Approved ATS platforms (greenhouse.io, lever.co, workable.com, breezy.hr, ashbyhq.com)
         are ONLY allowed if the tenant slug exactly matches the target company.
      3. All other third-party hosts or competitor ATS tenants are rejected.
    """
    ALLOWED_ATS_DOMAINS = {
        'greenhouse.io',
        'lever.co',
        'workable.com',
        'breezy.hr',
        'ashbyhq.com',
    }

    @classmethod
    def _extract_valid_slugs(cls, verified_domain: str, company_name: Optional[str]) -> Set[str]:
        """Generate normalized candidate tenant slugs for the company."""
        slugs = set()
        
        # Domain stem (e.g. 'moniepoint' from 'moniepoint.com')
        domain_clean = verified_domain.lower().replace('www.', '')
        domain_stem = domain_clean.split('.')[0]
        if domain_stem and len(domain_stem) >= 2:
            slugs.add(domain_stem)
            slugs.add(re.sub(r'[^a-z0-9]', '', domain_stem))
            
        # Company name variations
        if company_name:
            name_lower = company_name.lower().strip()
            # Clean alphanumeric without spaces (e.g. 'moniepoint')
            clean_name = re.sub(r'[^a-z0-9]', '', name_lower)
            if clean_name and len(clean_name) >= 2:
                slugs.add(clean_name)
            # Hyphenated (e.g. 'acme-corp')
            hyphen_name = re.sub(r'\s+', '-', name_lower)
            hyphen_name = re.sub(r'[^a-z0-9-]', '', hyphen_name).strip('-')
            if hyphen_name and len(hyphen_name) >= 2:
                slugs.add(hyphen_name)
            # Words in name (e.g. 'acme' from 'Acme Corp')
            for word in re.findall(r'\b[a-z0-9]+\b', name_lower):
                if len(word) >= 3 and word not in {'corp', 'inc', 'llc', 'ltd', 'company', 'solutions', 'technologies', 'group'}:
                    slugs.add(word)
                    
        return slugs

    @classmethod
    def is_allowed(cls, url: str, verified_domain: str, company_name: Optional[str] = None) -> bool:
        if not url or not verified_domain:
            return False
            
        try:
            parsed = urlparse(url.strip())
            host = parsed.netloc.lower().replace('www.', '')
            if not host:
                return False
                
            verified_host = verified_domain.lower().replace('www.', '')
            
            # 1. Primary domain or subdomain match
            if host == verified_host or host.endswith('.' + verified_host):
                return True
                
            # 2. Approved ATS domain validation
            is_ats = any(host == ats or host.endswith('.' + ats) for ats in cls.ALLOWED_ATS_DOMAINS)
            if not is_ats:
                return False
                
            valid_slugs = cls._extract_valid_slugs(verified_domain, company_name)
            
            # Check tenant in subdomain (e.g. moniepoint.workable.com, acme.breezy.hr)
            subdomains = host.split('.')
            if len(subdomains) >= 3:
                sub_slug = subdomains[0].lower()
                if sub_slug in valid_slugs:
                    return True
                    
            # Check tenant in path segment (e.g. boards.greenhouse.io/moniepoint/..., jobs.lever.co/stripe/...)
            path_segments = [seg.lower() for seg in parsed.path.strip('/').split('/') if seg]
            if path_segments:
                tenant_segment = path_segments[0].lower()
                # Exact slug match on the first path segment
                if tenant_segment in valid_slugs:
                    return True
                    
            # ATS domain matched but tenant slug did not match target company
            return False
        except Exception:
            return False

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
            
            # Direct clean alphanumeric (e.g. 'moniepoint', 'acmecorp')
            clean_full = re.sub(r'[^a-z0-9]', '', name_lower)
            if clean_full and len(clean_full) >= 2:
                slugs.add(clean_full)
                
            # Direct hyphenated (e.g. 'acme-corp')
            hyphen_full = re.sub(r'\s+', '-', name_lower)
            hyphen_full = re.sub(r'[^a-z0-9-]', '', hyphen_full).strip('-')
            if hyphen_full and len(hyphen_full) >= 2:
                slugs.add(hyphen_full)
                
            # Name stripped of common corporate suffixes
            stripped_name = re.sub(r'\b(inc|corp|corporation|llc|ltd|limited|company|co|technologies|solutions|group)\b', '', name_lower).strip()
            if stripped_name and stripped_name != name_lower:
                clean_stripped = re.sub(r'[^a-z0-9]', '', stripped_name)
                if clean_stripped and len(clean_stripped) >= 2:
                    slugs.add(clean_stripped)
                hyphen_stripped = re.sub(r'\s+', '-', stripped_name)
                hyphen_stripped = re.sub(r'[^a-z0-9-]', '', hyphen_stripped).strip('-')
                if hyphen_stripped and len(hyphen_stripped) >= 2:
                    slugs.add(hyphen_stripped)
                    
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

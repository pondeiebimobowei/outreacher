import re
from urllib.parse import urlparse
from typing import Optional
from core.models import PageType

class DomainScopeFilter:
    """
    Enforces strict security boundaries on discovered URLs.
    
    Allowed destinations:
      1. Target primary domain (e.g. acme.com)
      2. Any subdomain of target primary domain (e.g. careers.acme.com, blog.acme.com)
      3. Approved ATS domains (greenhouse.io, lever.co, workable.com, breezy.hr, ashbyhq.com)
         ONLY if the tenant slug in the URL path or subdomain matches the target company.
    """
    ALLOWED_ATS_DOMAINS = {
        'greenhouse.io',
        'lever.co',
        'workable.com',
        'breezy.hr',
        'ashbyhq.com',
    }

    @classmethod
    def is_allowed(cls, url: str, verified_domain: str, company_name: Optional[str] = None) -> bool:
        if not url or not verified_domain:
            return False
            
        try:
            parsed = urlparse(url)
            host = parsed.netloc.lower().replace('www.', '')
            if not host:
                return False
            
            verified_host = verified_domain.lower().replace('www.', '')
            
            # 1. Primary domain or subdomain match
            if host == verified_host or host.endswith('.' + verified_host):
                return True
                
            # 2. Approved ATS check with tenant verification
            # Ensure host is actually on an approved ATS domain (avoid evilgreenhouse.io)
            is_ats = any(host == ats or host.endswith('.' + ats) for ats in cls.ALLOWED_ATS_DOMAINS)
            if not is_ats:
                return False
                
            # Extract allowed tenant candidates (domain stem and company name words)
            domain_stem = re.sub(r'[^a-z0-9]', '', verified_host.split('.')[0])
            name_stem = re.sub(r'[^a-z0-9]', '', (company_name or '').lower())
            valid_tenants = {t for t in (domain_stem, name_stem) if len(t) >= 2}
            
            # Check subdomain tenant (e.g. acme.workable.com, acme.breezy.hr)
            subdomains = host.split('.')
            if len(subdomains) >= 3:
                sub_slug = re.sub(r'[^a-z0-9]', '', subdomains[0])
                if any(sub_slug == t or sub_slug.startswith(t) or t.startswith(sub_slug) for t in valid_tenants):
                    return True
            
            # Check path tenant (e.g. boards.greenhouse.io/acme/..., jobs.lever.co/acme/...)
            path_segments = [seg.lower() for seg in parsed.path.strip('/').split('/') if seg]
            if path_segments:
                first_segment = re.sub(r'[^a-z0-9]', '', path_segments[0])
                if any(first_segment == t or first_segment.startswith(t) or t.startswith(first_segment) for t in valid_tenants):
                    return True
            
            # ATS domain matched but tenant did not belong to target company
            return False
        except Exception:
            return False


class URLClassifier:
    """
    Classifies URLs into PageType categories based on URL path structures
    and optional content heuristics.
    """
    # Specific career sub-pages that are informational, not job listings or index boards
    _CAREER_INFO_SUBPATHS = {
        'benefits', 'perks', 'culture', 'values', 'diversity',
        'inclusion', 'faq', 'faqs', 'life', 'life-at', 'our-culture',
        'why-us', 'working-here', 'how-we-hire',
    }

    # Common job title / role indicators in URL slugs
    _JOB_ROLE_KEYWORDS = {
        'software', 'engineer', 'developer', 'designer', 'manager',
        'lead', 'head', 'director', 'vp', 'specialist', 'analyst',
        'consultant', 'intern', 'coordinator', 'representative',
        'architect', 'recruiter', 'strategist', 'writer', 'scientist',
        'executive', 'associate', 'account', 'sales', 'marketing',
        'frontend', 'backend', 'fullstack', 'infrastructure', 'devops',
    }

    @classmethod
    def classify(cls, url: str, content: Optional[str] = None, title: Optional[str] = None) -> PageType:
        try:
            parsed = urlparse(url)
            path = parsed.path.lower().rstrip('/')
            
            if path == "":
                return PageType.ABOUT
                
            # 1. Blog / News / Press
            if path.startswith('/blog') or '/blog/' in path or path.startswith('/news') or '/news/' in path or path.startswith('/press') or '/press/' in path:
                return PageType.BLOG
                
            # 2. Case studies / Customer stories
            if '/case-study' in path or '/case-studies' in path or '/customers' in path or '/stories' in path or '/customer-stories' in path:
                return PageType.CASE_STUDY
                
            # 3. About / Company / Mission / Team
            if path in ['/about', '/about-us', '/our-story', '/company', '/team', '/mission', '/who-we-are', '/values'] or \
               path.startswith('/about/') or path.startswith('/company/') or path.startswith('/team/'):
                return PageType.ABOUT
                
            # 4. Contact
            if path in ['/contact', '/contact-us', '/get-in-touch'] or path.startswith('/contact/'):
                return PageType.CONTACT
                
            # 5. Careers & Job Listings
            # Standalone job paths (e.g. /position/12345, /job/12345, /posting/12345)
            if re.match(r'^/(?:position|positions|job|jobs|posting|postings)/[a-zA-Z0-9_-]+', path):
                # If it's a generic search or index subpath
                if path in ['/jobs', '/jobs/search', '/jobs/all', '/positions', '/positions/search']:
                    return PageType.CAREERS_INDEX
                return PageType.JOB_LISTING
                
            # Under /careers/ or /jobs/
            if path in ['/careers', '/jobs'] or path.startswith('/careers/') or path.startswith('/jobs/'):
                segments = [s for s in path.strip('/').split('/') if s]
                
                # Check for career info subpaths (e.g. /careers/benefits) -> OTHER
                if len(segments) >= 2 and segments[1] in cls._CAREER_INFO_SUBPATHS:
                    return PageType.OTHER
                    
                # Explicit index / search paths
                if len(segments) >= 2 and segments[1] in ['search', 'all', 'openings', 'departments', 'teams', 'explore']:
                    return PageType.CAREERS_INDEX
                    
                # Job listing indicators: role keywords, digits/IDs, or ATS job paths
                if any(kw in path for kw in cls._JOB_ROLE_KEYWORDS) or re.search(r'/\d+|/[a-f0-9-]{8,}', path):
                    return PageType.JOB_LISTING
                    
                # Root careers page (/careers, /jobs)
                if len(segments) == 1:
                    return PageType.CAREERS_INDEX
                    
                # Deeper careers subpath without job indicators defaults to OTHER
                return PageType.OTHER
                
            # ATS host job path patterns (e.g. boards.greenhouse.io/acme/jobs/123, jobs.lever.co/acme/uuid, jobs.ashbyhq.com/acme/uuid)
            host = parsed.netloc.lower()
            if any(ats in host for ats in DomainScopeFilter.ALLOWED_ATS_DOMAINS):
                segments = [s for s in path.strip('/').split('/') if s]
                if len(segments) >= 2:
                    if segments[1] not in ['all', 'search', 'teams', 'departments']:
                        return PageType.JOB_LISTING
                    return PageType.CAREERS_INDEX
                if len(segments) == 1:
                    return PageType.CAREERS_INDEX
                return PageType.CAREERS_INDEX
                
            # 6. Product / Solutions / Features
            if path in ['/product', '/products', '/solutions', '/features', '/platform', '/pricing'] or \
               path.startswith('/product/') or path.startswith('/products/') or path.startswith('/solutions/') or \
               path.startswith('/features/') or path.startswith('/platform/'):
                return PageType.PRODUCT
                
            # 7. Content-based heuristics (if available)
            if title or content:
                text = f"{title or ''} {(content or '')[:400]}".lower()
                if "job description" in text or "responsibilities" in text and "qualifications" in text:
                    return PageType.JOB_LISTING
                if "about us" in text or "our mission" in text:
                    return PageType.ABOUT
                if "open positions" in text or "join our team" in text:
                    return PageType.CAREERS_INDEX
                    
            return PageType.OTHER
        except Exception:
            return PageType.OTHER

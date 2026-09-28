import re
from urllib.parse import urlparse
from core.models import PageType

class DomainScopeFilter:
    ALLOWED_ATS = ['greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'breezy.hr', 'jobs.']
    
    @staticmethod
    def is_allowed(url: str, primary_domain: str) -> bool:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        
        # Secure domain matching
        if netloc == primary_domain or netloc.endswith("." + primary_domain):
            return True
            
        if any(netloc == ats or netloc.endswith("." + ats) for ats in DomainScopeFilter.ALLOWED_ATS):
            return True
            
        return False

class URLClassifier:
    @staticmethod
    def classify(url: str) -> PageType:
        parsed = urlparse(url)
        path = parsed.path.lower()
        
        if re.search(r'/(jobs?|careers?)/(.+)', path) or '/position/' in path or '/role/' in path or '/offer/' in path:
            if not re.search(r'/(page|p)/\d+', path):
                return PageType.JOB_LISTING
                
        if path in ['/careers', '/jobs', '/careers/', '/jobs/'] or re.search(r'^/(careers|jobs)$', path):
            return PageType.CAREERS_INDEX
            
        if '/about' in path or '/company' in path or '/our-story' in path:
            return PageType.ABOUT
            
        if '/product' in path or '/features' in path or '/solutions' in path:
            return PageType.PRODUCT
            
        if '/case-study' in path or '/customers' in path or '/success-stories' in path:
            return PageType.CASE_STUDY
            
        if '/blog' in path or '/news' in path or '/press' in path:
            return PageType.BLOG
            
        if '/contact' in path:
            return PageType.CONTACT
            
        return PageType.OTHER

import re
from urllib.parse import urlparse
from core.models import PageType

class DomainScopeFilter:
    @staticmethod
    def is_allowed(url: str, verified_domain: str) -> bool:
        try:
            parsed = urlparse(url)
            host = parsed.netloc.lower().replace('www.', '')
            
            if host == verified_domain or host.endswith('.' + verified_domain):
                return True
                
            allowed_ats_domains = ['greenhouse.io', 'lever.co', 'workable.com', 'breezy.hr', 'ashbyhq.com']
            if any(host == ats or host.endswith('.' + ats) for ats in allowed_ats_domains):
                return True
                
            return False
        except:
            return False

class URLClassifier:
    @staticmethod
    def classify(url: str) -> PageType:
        try:
            path = urlparse(url).path.lower()
            if path == "" or path == "/":
                return PageType.OTHER
                
            if path.startswith('/blog') or '/blog/' in path:
                return PageType.BLOG
            if '/case-study' in path or '/customers' in path:
                return PageType.CASE_STUDY
                
            if path in ['/about', '/about-us', '/our-story', '/company'] or path.startswith('/about/') or path.startswith('/company/'):
                return PageType.ABOUT
                
            if path in ['/contact', '/contact-us'] or path.startswith('/contact/'):
                return PageType.CONTACT
                
            if path in ['/careers', '/jobs'] or path.startswith('/careers/') or path.startswith('/jobs/'):
                if 'software' in path or 'engineer' in path or re.search(r'\d+', path):
                    return PageType.JOB_LISTING
                return PageType.CAREERS_INDEX
                
            if path.startswith('/product') or '/solutions' in path:
                return PageType.PRODUCT
                
            return PageType.OTHER
        except:
            return PageType.OTHER

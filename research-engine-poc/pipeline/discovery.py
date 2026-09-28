import re
from urllib.parse import urlparse
from core.models import PageType

class URLClassifier:
    @staticmethod
    def classify(url: str) -> PageType:
        parsed = urlparse(url)
        path = parsed.path.lower()
        
        # Job Listings
        if re.search(r'/(jobs?|careers?)/(.+)', path) or '/position/' in path or '/role/' in path or '/offer/' in path:
            if not re.search(r'/(page|p)/\d+', path):
                return PageType.JOB_LISTING
                
        # Careers Index
        if path in ['/careers', '/jobs', '/careers/', '/jobs/'] or re.search(r'^/(careers|jobs)$', path):
            return PageType.CAREERS_INDEX
            
        # About
        if '/about' in path or '/company' in path or '/our-story' in path:
            return PageType.ABOUT
            
        # Product
        if '/product' in path or '/features' in path or '/solutions' in path:
            return PageType.PRODUCT
            
        # Blog
        if '/blog' in path or '/news' in path or '/press' in path:
            return PageType.BLOG
            
        # Contact
        if '/contact' in path:
            return PageType.CONTACT
            
        return PageType.OTHER

import re
from urllib.parse import urlparse
from typing import Optional
from core.models import PageType, DiscoveryPurpose

class TwoStageClassifier:
    """
    Two-stage page classifier:
      Stage 1: Fast URL-path and discovery-purpose classification -> provisional PageType.
      Stage 2: Post-crawl content/title inspection -> final verified PageType.
    """
    _CAREER_INFO_SUBPATHS = {
        'benefits', 'perks', 'culture', 'values', 'diversity',
        'inclusion', 'faq', 'faqs', 'life', 'life-at', 'our-culture',
        'why-us', 'working-here', 'how-we-hire',
    }

    _JOB_ROLE_KEYWORDS = {
        'software', 'engineer', 'developer', 'designer', 'manager',
        'lead', 'head', 'director', 'vp', 'specialist', 'analyst',
        'consultant', 'intern', 'coordinator', 'representative',
        'architect', 'recruiter', 'strategist', 'writer', 'scientist',
        'executive', 'associate', 'account', 'sales', 'marketing',
        'frontend', 'backend', 'fullstack', 'infrastructure', 'devops',
    }

    _ATS_DOMAINS = {
        'greenhouse.io', 'lever.co', 'workable.com', 'breezy.hr', 'ashbyhq.com',
    }

    @classmethod
    def stage1_classify_url(
        cls,
        url: str,
        purpose: Optional[DiscoveryPurpose] = None,
    ) -> PageType:
        """Stage 1: Determine provisional PageType purely from URL path and search intent."""
        try:
            parsed = urlparse(url.strip())
            host = parsed.netloc.lower()
            path = parsed.path.lower().rstrip('/')
            
            # Root path is HOMEPAGE
            if path in ("", "/"):
                return PageType.HOMEPAGE

            # 1. Blog / News / Press / Engineering Blog
            if path.startswith('/blog') or '/blog/' in path or \
               path.startswith('/news') or '/news/' in path or \
               path.startswith('/press') or '/press/' in path or \
               path.startswith('/articles') or '/articles/' in path or \
               path.startswith('/engineering') or '/engineering/' in path:
                return PageType.BLOG

            # 2. Case studies / Customer stories
            if '/case-study' in path or '/case-studies' in path or \
               '/customers' in path or '/stories' in path or '/customer-stories' in path:
                return PageType.CASE_STUDY

            # 3. About / Company / Mission / Team
            if path in ['/about', '/about-us', '/our-story', '/company', '/team', '/mission', '/who-we-are', '/values'] or \
               path.startswith('/about/') or path.startswith('/company/') or path.startswith('/team/'):
                return PageType.ABOUT

            # 4. Contact
            if path in ['/contact', '/contact-us', '/get-in-touch'] or path.startswith('/contact/'):
                return PageType.CONTACT

            # 5. Careers & Job Listings
            # Standalone job paths (e.g. /position/12345, /job/12345)
            if re.match(r'^/(?:position|positions|job|jobs|posting|postings)/[a-zA-Z0-9_-]+', path):
                if path in ['/jobs', '/jobs/search', '/jobs/all', '/positions', '/positions/search']:
                    return PageType.CAREERS_INDEX
                return PageType.JOB_LISTING

            # Paths under /careers/ or /jobs/
            if path in ['/careers', '/jobs'] or path.startswith('/careers/') or path.startswith('/jobs/'):
                segments = [s for s in path.strip('/').split('/') if s]
                
                # Check career info subpages -> OTHER
                if len(segments) >= 2 and segments[1] in cls._CAREER_INFO_SUBPATHS:
                    return PageType.OTHER
                    
                # Explicit search/index subpages -> CAREERS_INDEX
                if len(segments) >= 2 and segments[1] in ['search', 'all', 'openings', 'departments', 'teams', 'explore']:
                    return PageType.CAREERS_INDEX
                    
                # Job role keyword or ID in slug -> JOB_LISTING
                if any(kw in path for kw in cls._JOB_ROLE_KEYWORDS) or re.search(r'/\d+|/[a-f0-9-]{8,}', path):
                    return PageType.JOB_LISTING
                    
                if len(segments) == 1:
                    return PageType.CAREERS_INDEX
                    
                return PageType.OTHER

            # ATS domain paths (e.g. boards.greenhouse.io/acme/jobs/123, jobs.lever.co/acme/uuid)
            if any(ats in host for ats in cls._ATS_DOMAINS):
                segments = [s for s in path.strip('/').split('/') if s]
                if len(segments) >= 2 and segments[1] not in ['all', 'search', 'teams', 'departments']:
                    return PageType.JOB_LISTING
                return PageType.CAREERS_INDEX

            # 6. Product / Solutions / Features / Platform / Pricing
            if path in ['/product', '/products', '/solutions', '/features', '/platform', '/pricing'] or \
               path.startswith('/product/') or path.startswith('/products/') or path.startswith('/solutions/') or \
               path.startswith('/features/') or path.startswith('/platform/'):
                return PageType.PRODUCT

            # 7. Fallback to DiscoveryPurpose if URL path is uninformative
            if purpose == DiscoveryPurpose.ABOUT:
                return PageType.ABOUT
            elif purpose == DiscoveryPurpose.PRODUCT:
                return PageType.PRODUCT
            elif purpose == DiscoveryPurpose.CAREERS:
                return PageType.CAREERS_INDEX
            elif purpose == DiscoveryPurpose.CUSTOMERS:
                return PageType.CASE_STUDY
            elif purpose in (DiscoveryPurpose.NEWS, DiscoveryPurpose.ENGINEERING):
                return PageType.BLOG
            elif purpose == DiscoveryPurpose.CONTACT:
                return PageType.CONTACT
            elif purpose == DiscoveryPurpose.HOMEPAGE:
                return PageType.HOMEPAGE

            return PageType.OTHER
        except Exception:
            return PageType.OTHER

    @classmethod
    def stage2_refine_content(
        cls,
        provisional: PageType,
        title: Optional[str] = None,
        content: Optional[str] = None,
        url: str = "",
    ) -> PageType:
        """Stage 2: Refine or confirm provisional PageType using crawled text and HTML title."""
        if not content:
            return provisional

        text_sample = f"{title or ''} {content[:800]}".lower()

        # Job posting signals
        has_job_structure = (
            ("responsibilities" in text_sample or "what you'll do" in text_sample or "duties" in text_sample) and
            ("qualifications" in text_sample or "requirements" in text_sample or "what you need" in text_sample or "skills" in text_sample)
        ) or "apply for this job" in text_sample or "apply now" in text_sample

        # Careers index signals
        has_board_structure = (
            "open positions" in text_sample or "current openings" in text_sample or
            "join our team" in text_sample or "search jobs" in text_sample
        )

        # Refine CAREERS_INDEX -> JOB_LISTING if single posting structure is clear
        if provisional == PageType.CAREERS_INDEX and has_job_structure and not has_board_structure:
            return PageType.JOB_LISTING

        # Refine JOB_LISTING -> CAREERS_INDEX if multiple openings without single role description
        if provisional == PageType.JOB_LISTING and has_board_structure and not has_job_structure:
            return PageType.CAREERS_INDEX

        # Refine OTHER -> ABOUT if mission/company overview present
        if provisional == PageType.OTHER:
            if "about us" in text_sample or "our mission" in text_sample or "who we are" in text_sample:
                return PageType.ABOUT
            if "customer story" in text_sample or "case study" in text_sample:
                return PageType.CASE_STUDY
            if "contact us" in text_sample or "get in touch" in text_sample:
                return PageType.CONTACT

        return provisional

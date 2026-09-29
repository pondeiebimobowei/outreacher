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

    _BLOG_SUBPATHS = {
        'blog', 'blogs', 'news', 'press', 'press-releases', 'articles', 'article',
        'engineering', 'posts', 'post', 'now', 'updates', 'changelog', 'announcements',
        'announcement', 'journal', 'insights', 'media', 'feed', 'releases',
    }

    _ANNOUNCEMENT_SLUG_PATTERNS = [
        r'\bannounc(ing|ement)\b',
        r'\bseed-round\b',
        r'\bseries-[a-f]\b',
        r'\bfunding\b',
        r'\brais(es|ed)\b',
        r'\bpress-release\b',
        r'\bnext-chapter\b',
        r'\bintroducing\b',
        r'\bunveiling\b',
    ]

    @classmethod
    def stage1_classify_url(
        cls,
        url: str,
        purpose: Optional[DiscoveryPurpose] = None,
    ) -> PageType:
        """Stage 1: Determine provisional PageType purely from URL path and search intent."""
        try:
            parsed = urlparse(url.strip())
            host = (parsed.hostname or "").lower().removeprefix("www.")
            path = parsed.path.lower().rstrip('/')
            segments = [s for s in path.strip('/').split('/') if s]
            
            # Root path is HOMEPAGE
            if not segments:
                return PageType.HOMEPAGE

            first = segments[0]
            leaf = segments[-1]

            # 1. Blog / News / Press / Articles / Announcements / Engineering / Updates
            if first in cls._BLOG_SUBPATHS:
                return PageType.BLOG

            # Check if any path segment or leaf contains explicit announcement/funding tokens
            if any(re.search(pat, path) for pat in cls._ANNOUNCEMENT_SLUG_PATTERNS):
                return PageType.BLOG

            # 2. Case studies / Customer stories
            if first in ('case-study', 'case-studies', 'customers', 'customer-stories', 'stories', 'clients'):
                return PageType.CASE_STUDY

            # 3. About / Company / Mission / Team
            if first in ('about', 'about-us', 'our-story', 'company', 'team', 'mission', 'who-we-are', 'values'):
                return PageType.ABOUT

            # 4. Contact
            if first in ('contact', 'contact-us', 'get-in-touch'):
                return PageType.CONTACT

            # 5. Standalone job paths (e.g. /position/12345, /job/12345)
            if first in ('position', 'positions', 'job', 'jobs', 'posting', 'postings'):
                if len(segments) == 1:
                    return PageType.CAREERS_INDEX
                if len(segments) >= 2 and segments[1] in ('search', 'all'):
                    return PageType.CAREERS_INDEX
                return PageType.JOB_LISTING

            # Paths under /careers/
            if first == 'careers':
                if len(segments) == 1:
                    return PageType.CAREERS_INDEX

                # Check info subpaths on any segment (e.g. /careers/benefits, /careers/culture)
                if any(seg in cls._CAREER_INFO_SUBPATHS for seg in segments[1:]):
                    return PageType.OTHER
                    
                # Explicit search/index subpages -> CAREERS_INDEX
                if segments[1] in ['search', 'all', 'openings', 'departments', 'teams', 'explore']:
                    return PageType.CAREERS_INDEX
                    
                # Leaf segment token-level inspection
                leaf_tokens = set(re.split(r'[-_]', leaf))
                
                # Check if leaf represents non-job career subcontent
                if any(t in leaf_tokens for t in {'blog', 'news', 'press', 'articles', 'article'}):
                    return PageType.BLOG
                if any(t in leaf_tokens for t in {'resources', 'resource', 'faq', 'faqs'} | cls._CAREER_INFO_SUBPATHS):
                    return PageType.OTHER
                    
                # Role keyword tokens or numeric/uuid job IDs in leaf
                has_role_token = bool(leaf_tokens & cls._JOB_ROLE_KEYWORDS)
                has_job_id = bool(re.search(r'\b\d{4,}\b|^[a-f0-9-]{8,}$', leaf)) or leaf.isdigit()
                
                if has_role_token or has_job_id:
                    return PageType.JOB_LISTING
                    
                return PageType.OTHER

            # ATS domain paths (e.g. boards.greenhouse.io/acme/jobs/123, jobs.lever.co/acme/uuid)
            if any(host == ats or host.endswith('.' + ats) for ats in cls._ATS_DOMAINS):
                if len(segments) >= 2 and segments[1] not in ['all', 'search', 'teams', 'departments']:
                    return PageType.JOB_LISTING
                return PageType.CAREERS_INDEX

            # 6. Product / Solutions / Features / Platform / Pricing
            if first in ('product', 'products', 'solutions', 'features', 'platform', 'pricing'):
                return PageType.PRODUCT

            # 7. Fallback to DiscoveryPurpose only if URL path is neutral/uninformative
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
        """Stage 2: Refine or confirm provisional PageType using crawled text, HTML title, and URL."""
        if not content:
            return provisional

        text_sample = f"{title or ''} {content[:800]}".lower()

        # Blog / News / Announcement / Funding signals in title or opening content
        has_announcement_signals = any(k in text_sample for k in [
            "announcing ", "announces ", "seed round", "series a", "series b",
            "series c", "raises $", "raised $", "funding round", "min read",
            "press release", "written by", "published on", "next chapter"
        ])
        if provisional in (PageType.ABOUT, PageType.OTHER, PageType.HOMEPAGE) and has_announcement_signals:
            return PageType.BLOG

        # Job posting signals
        has_job_structure = (
            ("responsibilities" in text_sample or "what you'll do" in text_sample or "duties" in text_sample) and
            ("qualifications" in text_sample or "requirements" in text_sample or "what you need" in text_sample or "skills" in text_sample)
        ) or "apply for this job" in text_sample or "apply now" in text_sample or "apply for this role" in text_sample

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

from typing import List
from core.models import DiscoveryPurpose, DiscoveryQuery

class DiscoveryQueryBuilder:
    """
    Builds purposeful, structured discovery queries for primary domain and ATS targets.
    
    Rather than generic searches, each query encodes an explicit research intent
    (ABOUT, PRODUCT, CAREERS, CUSTOMERS, NEWS, ENGINEERING, CONTACT, ATS)
    with isolated ATS queries per provider.
    """
    @classmethod
    def build_queries(cls, domain: str, company_name: str) -> List[DiscoveryQuery]:
        clean_domain = domain.lower().replace('www.', '')
        clean_name = company_name.strip()
        
        queries = [
            # Primary Domain Queries
            DiscoveryQuery(
                purpose=DiscoveryPurpose.ABOUT,
                query=f'site:{clean_domain} "about" OR "company" OR "mission" OR "our story"',
                max_results=2,
                provider="site",
            ),
            DiscoveryQuery(
                purpose=DiscoveryPurpose.PRODUCT,
                query=f'site:{clean_domain} "product" OR "solutions" OR "platform" OR "features"',
                max_results=2,
                provider="site",
            ),
            DiscoveryQuery(
                purpose=DiscoveryPurpose.CAREERS,
                query=f'site:{clean_domain} "careers" OR "jobs" OR "open positions"',
                max_results=3,
                provider="site",
            ),
            DiscoveryQuery(
                purpose=DiscoveryPurpose.CUSTOMERS,
                query=f'site:{clean_domain} "customers" OR "case studies" OR "customer stories"',
                max_results=2,
                provider="site",
            ),
            DiscoveryQuery(
                purpose=DiscoveryPurpose.NEWS,
                query=f'site:{clean_domain} "news" OR "press" OR "announcements"',
                max_results=2,
                provider="site",
            ),
            DiscoveryQuery(
                purpose=DiscoveryPurpose.ENGINEERING,
                query=f'site:{clean_domain} "engineering" OR "tech blog" OR "developers"',
                max_results=2,
                provider="site",
            ),
            DiscoveryQuery(
                purpose=DiscoveryPurpose.CONTACT,
                query=f'site:{clean_domain} "contact" OR "contact us"',
                max_results=1,
                provider="site",
            ),
            # Isolated ATS Provider Queries
            DiscoveryQuery(
                purpose=DiscoveryPurpose.ATS,
                query=f'"{clean_name}" site:greenhouse.io',
                max_results=2,
                provider="greenhouse",
            ),
            DiscoveryQuery(
                purpose=DiscoveryPurpose.ATS,
                query=f'"{clean_name}" site:lever.co',
                max_results=2,
                provider="lever",
            ),
            DiscoveryQuery(
                purpose=DiscoveryPurpose.ATS,
                query=f'"{clean_name}" site:ashbyhq.com',
                max_results=2,
                provider="ashby",
            ),
            DiscoveryQuery(
                purpose=DiscoveryPurpose.ATS,
                query=f'"{clean_name}" site:workable.com',
                max_results=2,
                provider="workable",
            ),
        ]
        return queries

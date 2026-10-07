"""
Production Contact Discovery Pipeline.
Gated by frozen identity verification, bounded by deterministic acquisition caps,
and enforced by exact canonical text substring grounding.
"""

import logging
import re
import time
from typing import List, Optional, Set, Tuple
from urllib.parse import urlparse

from core.models import (
    IdentityConfidence,
    PageType,
    SiteRelationship,
)
from core.urls import get_registrable_domain
from crawling.acquirer import FirstPartyAcquirer
from crawling.manager import CrawlManager
from identity.resolver import normalize_domain
from identity.verifier import WebsiteVerifier
from search.base import ISearchProvider, SearchProviderError

from contact_discovery.canonical import flatten_canonical_text
from contact_discovery.extractor import StructuredContactExtractor
from contact_discovery.models import (
    ContactDiscoveryFailure,
    ContactIdentity,
    ContactPersonKind,
    DiscoveredContact,
    ProviderFailureCode,
    RoleFamily,
)
from contact_discovery.network_safety import (
    UnsafeTargetUrlError,
    is_safe_redirect,
    is_safe_target_url,
    validate_target_url,
)
from contact_discovery.normalizer import (
    get_null_email_canonical_key,
    matches_target_roles,
)
from gateway.schemas import (
    ContactDiscoveryRequest,
    ContactDiscoveryResponse,
)

logger = logging.getLogger(__name__)

# Deterministic Acquisition Caps
MAX_SEARCH_QUERIES = 3
MAX_CANDIDATE_URLS = 10
MAX_PAGES_CRAWLED = 5
MAX_BROWSER_FALLBACKS = 2

DEFAULT_TARGET_ROLES = [
    "CEO",
    "Founder",
    "President",
    "Chief Executive Officer",
    "CTO",
    "Chief Technology Officer",
    "Head of Talent",
    "Recruiter",
    "VP of Engineering",
]

TARGET_PATH_PATTERN = re.compile(
    r"/(?:about|team|leadership|people|contact|careers|jobs|management|board)\b",
    re.IGNORECASE,
)


class ContactDiscoveryPipeline:
    """Orchestrates end-to-end contact discovery with identity gating and deterministic budgets."""

    def __init__(
        self,
        verifier: WebsiteVerifier,
        acquirer: FirstPartyAcquirer,
        crawl_manager: CrawlManager,
        search_provider: ISearchProvider,
    ):
        self.verifier = verifier
        self.acquirer = acquirer
        self.crawl_manager = crawl_manager
        self.search_provider = search_provider

    def _extract_domain(self, request: ContactDiscoveryRequest) -> Tuple[Optional[str], Optional[str]]:
        if request.website_url:
            target_url = request.website_url
            domain = normalize_domain(target_url)
            return target_url, domain
        elif request.domain:
            domain = normalize_domain(request.domain)
            target_url = f"https://{domain}"
            return target_url, domain
        return None, None

    def _is_first_party_url(self, url: str, base_domain: str) -> bool:
        try:
            parsed = urlparse(url)
            host = normalize_domain(parsed.netloc)
            return host == base_domain or host.endswith("." + base_domain)
        except Exception:
            return False

    def _discover_candidate_urls(self, domain: str, homepage_html: Optional[str]) -> Tuple[List[str], int]:
        candidate_urls: List[str] = []
        seen_urls: Set[str] = set()
        search_calls = 0

        # 1. Internal links from homepage HTML
        if homepage_html:
            for match in re.finditer(r'href=["\'](/[^"\']*|https?://[^"\']*)["\']', homepage_html, re.I):
                raw_href = match.group(1).strip()
                if TARGET_PATH_PATTERN.search(raw_href):
                    if raw_href.startswith("/"):
                        full_url = f"https://{domain}{raw_href}"
                    else:
                        full_url = raw_href
                    if (
                        self._is_first_party_url(full_url, domain)
                        and is_safe_target_url(full_url)
                        and is_safe_redirect(full_url, domain)
                        and full_url not in seen_urls
                    ):
                        seen_urls.add(full_url)
                        candidate_urls.append(full_url)
                        if len(candidate_urls) >= MAX_CANDIDATE_URLS:
                            return candidate_urls, search_calls

        # 2. Targeted search queries (capped at MAX_SEARCH_QUERIES)
        queries = [
            f'site:{domain} "leadership" OR "team" OR "management"',
            f'site:{domain} "contact" OR "careers" OR "jobs"',
            f'site:{domain} "people" OR "about-us"',
        ][:MAX_SEARCH_QUERIES]

        for q in queries:
            if len(candidate_urls) >= MAX_CANDIDATE_URLS:
                break
            search_calls += 1
            try:
                results = self.search_provider.search(q, num_results=5)
                for res in results:
                    url = res.get("url") if isinstance(res, dict) else getattr(res, "url", None)
                    if (
                        url
                        and self._is_first_party_url(url, domain)
                        and is_safe_target_url(url)
                        and is_safe_redirect(url, domain)
                        and url not in seen_urls
                    ):
                        seen_urls.add(url)
                        candidate_urls.append(url)
                        if len(candidate_urls) >= MAX_CANDIDATE_URLS:
                            break
            except Exception as e:
                logger.warning(f"Search query '{q}' failed: {e}")
                raise

        return candidate_urls, search_calls

    def run(self, request: ContactDiscoveryRequest) -> ContactDiscoveryResponse:
        t0 = time.perf_counter()
        target_url, domain = self._extract_domain(request)

        identity_verification_calls = 0
        search_calls = 0
        candidate_urls_count = 0
        static_crawl_calls = 0
        browser_fallback_count = 0
        extraction_calls = 0

        if not target_url or not domain:
            return ContactDiscoveryResponse(
                contract_version="1.0",
                discovery_run_id=request.discovery_run_id,
                status="IDENTITY_HALTED",
                identity=ContactIdentity(
                    verified_domain="",
                    primary_relationship="UNKNOWN",
                    confidence="UNRESOLVED",
                ),
                contacts=[],
                failure=None,
                unknowns=["company_website_url", "company_domain"],
                metadata={
                    "reasoning": "Neither website URL nor domain provided for company.",
                    "identity_verification_calls": 0,
                    "search_calls": 0,
                    "candidate_urls_discovered": 0,
                    "static_crawl_calls": 0,
                    "browser_fallback_count": 0,
                    "extraction_calls": 0,
                    "homepage_extractions": 0,
                    "bundle_secondary_extractions": 0,
                    "candidate_page_extractions": 0,
                },
            )

        # Phase 1: Identity Gating
        try:
            validate_target_url(target_url)
            bundle = self.acquirer.acquire(target_url)
            if bundle.homepage_doc and getattr(bundle.homepage_doc, "final_url", None):
                if not is_safe_redirect(bundle.homepage_doc.final_url, domain):
                    raise UnsafeTargetUrlError(f"Off-domain redirect to '{bundle.homepage_doc.final_url}' rejected")
            identity_verification_calls += 1
            classify_res = self.verifier.classify_relationship(
                request.company_name, target_url, acquisition=bundle
            )
            if len(classify_res) == 4:
                rel, confidence, msg, ver_ev = classify_res
            else:
                rel, msg, ver_ev = classify_res
                # Derive Confidence
                if rel == SiteRelationship.PRIMARY and len(ver_ev) > 0:
                    confidence = IdentityConfidence.CONFIDENT
                elif rel in (SiteRelationship.RELATED, SiteRelationship.LEGACY, SiteRelationship.PRIMARY):
                    confidence = IdentityConfidence.AMBIGUOUS
                else:
                    confidence = IdentityConfidence.UNRESOLVED

            if isinstance(rel, str):
                rel = SiteRelationship(rel)
            if isinstance(confidence, str):
                confidence = IdentityConfidence(confidence)

            # Gate Check
            if rel != SiteRelationship.PRIMARY or confidence != IdentityConfidence.CONFIDENT:
                duration_ms = (time.perf_counter() - t0) * 1000.0
                return ContactDiscoveryResponse(
                    contract_version="1.0",
                    discovery_run_id=request.discovery_run_id,
                    status="IDENTITY_HALTED",
                    identity=ContactIdentity(
                        verified_domain=domain,
                        primary_relationship=rel.value if hasattr(rel, "value") else str(rel),
                        confidence=confidence.value if hasattr(confidence, "value") else str(confidence),
                    ),
                    contacts=[],
                    failure=None,
                    unknowns=[f"identity_{rel.value.lower() if hasattr(rel, 'value') else str(rel).lower()}_{confidence.value.lower() if hasattr(confidence, 'value') else str(confidence).lower()}"],
                    metadata={
                        "reasoning": msg,
                        "duration_ms": duration_ms,
                        "identity_verification_calls": identity_verification_calls,
                        "search_calls": 0,
                        "candidate_urls_discovered": 0,
                        "static_crawl_calls": 0,
                        "browser_fallback_count": 0,
                        "extraction_calls": 0,
                        "homepage_extractions": 0,
                        "bundle_secondary_extractions": 0,
                        "candidate_page_extractions": 0,
                    },
                )

            # Phase 2: Targeted Contact Discovery & Canonical Extraction
            extractor = StructuredContactExtractor(verified_domain=domain)
            raw_contacts: List[DiscoveredContact] = []
            crawled_urls: Set[str] = set()

            homepage_extractions = 0
            bundle_secondary_extractions = 0
            candidate_page_extractions = 0

            # 1. Extract from homepage document
            hp_doc = bundle.homepage_doc
            if hp_doc and (hp_doc.raw_html or hp_doc.content):
                crawled_urls.add(hp_doc.url)
                hp_canonical = flatten_canonical_text(hp_doc.raw_html or hp_doc.content)
                extraction_calls += 1
                hp_contacts = extractor.extract(hp_canonical, hp_doc.url)
                homepage_extractions += len(hp_contacts)
                raw_contacts.extend(hp_contacts)

            # 2. Extract from secondary docs if present
            for sec in getattr(bundle, "secondary_docs", []):
                sec_doc = getattr(sec, "doc", sec)
                if sec_doc and sec_doc.url not in crawled_urls:
                    crawled_urls.add(sec_doc.url)
                    sec_canonical = flatten_canonical_text(sec_doc.raw_html or sec_doc.content)
                    extraction_calls += 1
                    sec_contacts = extractor.extract(sec_canonical, sec_doc.url)
                    bundle_secondary_extractions += len(sec_contacts)
                    raw_contacts.extend(sec_contacts)

            # 3. Discover and crawl additional targeted candidate URLs up to MAX_PAGES_CRAWLED
            candidate_urls, search_calls = self._discover_candidate_urls(domain, hp_doc.raw_html if hp_doc else None)
            candidate_urls_count = len(candidate_urls)
            for c_url in candidate_urls:
                if len(crawled_urls) >= MAX_PAGES_CRAWLED:
                    break
                if c_url in crawled_urls:
                    continue
                if not is_safe_target_url(c_url) or not is_safe_redirect(c_url, domain):
                    continue

                if not hasattr(self.crawl_manager, "fetch_with_fallback") or not callable(
                    getattr(self.crawl_manager, "fetch_with_fallback")
                ):
                    raise AttributeError(
                        f"Crawl manager '{type(self.crawl_manager).__name__}' does not implement required 'fetch_with_fallback' API"
                    )

                if browser_fallback_count < MAX_BROWSER_FALLBACKS:
                    crawled_doc = self.crawl_manager.fetch_with_fallback(c_url, PageType.OTHER)
                    if crawled_doc and getattr(crawled_doc, "fetch_strategy", None) == "BROWSER":
                        browser_fallback_count += 1
                    else:
                        static_crawl_calls += 1
                else:
                    if hasattr(self.crawl_manager, "static_crawler") and hasattr(
                        self.crawl_manager.static_crawler, "fetch"
                    ):
                        crawled_doc = self.crawl_manager.static_crawler.fetch(c_url, PageType.OTHER)
                        static_crawl_calls += 1
                    else:
                        crawled_doc = self.crawl_manager.fetch_with_fallback(c_url, PageType.OTHER)
                        if crawled_doc and getattr(crawled_doc, "fetch_strategy", None) == "BROWSER":
                            browser_fallback_count += 1
                        else:
                            static_crawl_calls += 1

                crawled_urls.add(c_url)
                if crawled_doc and (crawled_doc.raw_html or crawled_doc.content):
                    c_canonical = flatten_canonical_text(crawled_doc.raw_html or crawled_doc.content)
                    extraction_calls += 1
                    cand_contacts = extractor.extract(c_canonical, c_url)
                    candidate_page_extractions += len(cand_contacts)
                    raw_contacts.extend(cand_contacts)

            # Phase 3: Filtering & Deduplication
            target_roles = request.target_roles
            is_default_roles = not target_roles

            filtered_contacts: List[DiscoveredContact] = []
            for c in raw_contacts:
                if is_default_roles:
                    # Default: accept leadership and recruiting
                    if c.person_kind == ContactPersonKind.ROLE_ADDRESS:
                        filtered_contacts.append(c)
                    elif c.role_family in (RoleFamily.LEADERSHIP, RoleFamily.RECRUITING):
                        filtered_contacts.append(c)
                    elif matches_target_roles(c.title, DEFAULT_TARGET_ROLES):
                        filtered_contacts.append(c)
                    elif not c.title:
                        # Include general person if under cap
                        filtered_contacts.append(c)
                else:
                    # User specified target roles
                    if c.person_kind == ContactPersonKind.ROLE_ADDRESS:
                        if matches_target_roles(c.title, target_roles) or c.role_family in (RoleFamily.LEADERSHIP, RoleFamily.RECRUITING):
                            filtered_contacts.append(c)
                    else:
                        if matches_target_roles(c.title, target_roles):
                            filtered_contacts.append(c)

            # Deduplicate by email or null-email canonical key
            deduped_contacts: List[DiscoveredContact] = []
            seen_email_keys: Set[str] = set()
            seen_null_keys: Set[str] = set()

            for c in filtered_contacts:
                if c.email:
                    e_key = c.email.lower()
                    if e_key not in seen_email_keys:
                        seen_email_keys.add(e_key)
                        deduped_contacts.append(c)
                else:
                    n_key = get_null_email_canonical_key(c.first_name, c.last_name, c.title)
                    if n_key not in seen_null_keys:
                        seen_null_keys.add(n_key)
                        deduped_contacts.append(c)

            # Cap at 5 if default target roles
            if is_default_roles and len(deduped_contacts) > 5:
                deduped_contacts = deduped_contacts[:5]

            duration_ms = (time.perf_counter() - t0) * 1000.0

            return ContactDiscoveryResponse(
                contract_version="1.0",
                discovery_run_id=request.discovery_run_id,
                status="COMPLETED",
                identity=ContactIdentity(
                    verified_domain=domain,
                    primary_relationship="PRIMARY",
                    confidence="CONFIDENT",
                ),
                contacts=deduped_contacts,
                failure=None,
                unknowns=[],
                metadata={
                    "duration_ms": duration_ms,
                    "pages_crawled": len(crawled_urls),
                    "candidates_extracted": len(raw_contacts),
                    "identity_verification_calls": identity_verification_calls,
                    "search_calls": search_calls,
                    "candidate_urls_discovered": candidate_urls_count,
                    "static_crawl_calls": static_crawl_calls,
                    "browser_fallback_count": browser_fallback_count,
                    "extraction_calls": extraction_calls,
                    "homepage_extractions": homepage_extractions,
                    "bundle_secondary_extractions": bundle_secondary_extractions,
                    "candidate_page_extractions": candidate_page_extractions,
                },
            )

        except Exception as exc:
            duration_ms = (time.perf_counter() - t0) * 1000.0
            msg = str(exc)
            msg_lower = msg.lower()

            if isinstance(exc, UnsafeTargetUrlError):
                code = ProviderFailureCode.DISCOVERY_OPERATIONAL_FAILURE
                retryable = False
            elif isinstance(exc, SearchProviderError) or "search" in msg_lower:
                code = ProviderFailureCode.UPSTREAM_SEARCH_FAILED
                retryable = True
            elif "timeout" in msg_lower:
                code = ProviderFailureCode.DISCOVERY_TIMEOUT
                retryable = True
            elif "rate limit" in msg_lower or "429" in msg_lower:
                code = ProviderFailureCode.ACQUISITION_RATE_LIMITED
                retryable = True
            else:
                code = ProviderFailureCode.DISCOVERY_OPERATIONAL_FAILURE
                retryable = True

            last_rel = rel.value if "rel" in locals() and hasattr(rel, "value") else "UNKNOWN"
            last_conf = confidence.value if "confidence" in locals() and hasattr(confidence, "value") else "UNRESOLVED"

            return ContactDiscoveryResponse(
                contract_version="1.0",
                discovery_run_id=request.discovery_run_id,
                status="FAILED",
                identity=ContactIdentity(
                    verified_domain=domain,
                    primary_relationship=last_rel,
                    confidence=last_conf,
                ),
                contacts=[],
                failure=ContactDiscoveryFailure(
                    code=code,
                    retryable=retryable,
                    message=msg,
                ),
                unknowns=[],
                metadata={
                    "duration_ms": duration_ms,
                    "error": msg,
                    "identity_verification_calls": identity_verification_calls,
                    "search_calls": search_calls,
                    "candidate_urls_discovered": candidate_urls_count,
                    "static_crawl_calls": static_crawl_calls,
                    "browser_fallback_count": browser_fallback_count,
                    "extraction_calls": extraction_calls,
                    "homepage_extractions": homepage_extractions if "homepage_extractions" in locals() else 0,
                    "bundle_secondary_extractions": bundle_secondary_extractions if "bundle_secondary_extractions" in locals() else 0,
                    "candidate_page_extractions": candidate_page_extractions if "candidate_page_extractions" in locals() else 0,
                },
            )

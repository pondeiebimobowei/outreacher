"""
benchmark_identity_recall.py — Deterministic Identity Recall & State Accuracy Benchmark

Evaluates the Identity Resolution layer against an expanded frozen development suite of 28 challenging-but-legitimate
domains and adversarial negative controls without external network dependencies.

Corpus Snapshot: identity-v1.2-dev (28 Frozen Development Cases)

Metric Suite:
  1. Identity State Accuracy = correct predicted state / all 28 identity fixtures (Target: >= 95.0%)
  2. CONFIDENT Recall        = correctly CONFIDENT fixtures / 18 expected CONFIDENT fixtures (Target: >= 90.0%)
  3. False CONFIDENT Rate    = incorrectly CONFIDENT fixtures / 10 expected non-CONFIDENT fixtures (Target: strictly 0.0%)
  4. Non-CONFIDENT Safety    = correctly classified AMBIGUOUS and UNRESOLVED controls (Target: 100.0%)

Failure Families Covered (28 Cases):
  - SPA_RENDERED (5 cases): Client-rendered minimal DOMs with Google-indexed title hints
  - UNCONVENTIONAL_PATH (6 cases): Secondary identity corroboration on non-standard routes
  - INDIRECT_SELF_ID (6 cases): Active verb phrases and mission statement self-identification
  - SUBDOMAIN_MULTI_TIER (5 cases): Product subdomains, legacy assets, and hosted blog targets
  - NEGATIVE_CONTROL (6 cases): Entity collisions, shape-risk names, missing corroboration, and adversarial related secondaries
"""

import sys
import os
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime, timezone
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityContext,
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from crawling.acquirer import FirstPartyAcquirer

console = Console()

# ── 1. Benchmark Case Schema ─────────────────────────────────────────────────

@dataclass(frozen=True)
class IdentityRecallCase:
    case_id: str
    category: str  # SPA_RENDERED | UNCONVENTIONAL_PATH | INDIRECT_SELF_ID | SUBDOMAIN_MULTI_TIER | NEGATIVE_CONTROL
    company: str
    expected_confidence: IdentityConfidence
    expected_domain: Optional[str]
    expected_relationship: SiteRelationship
    ground_truth_reason: str
    search_results: List[SearchResult]
    mock_documents: Dict[str, CrawledDocument]
    context: Optional[IdentityContext] = None
    snapshot_version: str = "identity-v1.1-frozen"
    retrieval_timestamp: str = "2026-09-29T12:00:00Z"


def _doc(url: str, title: str = "", content: str = "", ptype: PageType = PageType.OTHER, quality: DocumentQuality = DocumentQuality.VALID) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=200,
        title=title,
        content=content,
        word_count=len(content.split()),
        page_type=ptype,
        quality=quality,
        retrieved_at=datetime.now(timezone.utc),
    )

def _fail_doc(url: str, ptype: PageType = PageType.OTHER) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=404,
        title="",
        content="",
        word_count=0,
        page_type=ptype,
        quality=DocumentQuality.HTTP_ERROR,
        retrieved_at=datetime.now(timezone.utc),
    )


# ── 2. Frozen Identity Recall Dataset (24 Cases across 5 Categories) ─────────

IDENTITY_RECALL_DATASET: List[IdentityRecallCase] = [
    # ── Category 1: SPA & Client-Rendered Homepages (5 Cases) ─────────────────
    IdentityRecallCase(
        case_id="spa_empty_body_with_hint_title",
        category="SPA_RENDERED",
        company="Linear",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="linear.app",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="SPA homepage returns empty DOM; search title hint provides entity match and /about corroborates.",
        search_results=[
            SearchResult(title="Linear: Software Development Tool", url="https://linear.app", snippet="Linear is a purpose-built issue tracking tool."),
        ],
        mock_documents={
            "https://linear.app": _doc("https://linear.app", title="", content="<div id='root'></div>", ptype=PageType.HOMEPAGE),
            "https://linear.app/about": _doc("https://linear.app/about", title="About Linear", content="Linear builds modern issue tracking and software planning tools.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="spa_minimal_tagline_client_rendered",
        category="SPA_RENDERED",
        company="Vercel",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="vercel.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Minimal SPA skeleton on homepage; search title hint provides entity match and /about corroborates.",
        search_results=[
            SearchResult(title="Vercel: Build and deploy the open web", url="https://vercel.com", snippet="Vercel provides developer tooling and serverless hosting."),
        ],
        mock_documents={
            "https://vercel.com": _doc("https://vercel.com", title="", content="Loading application...", ptype=PageType.HOMEPAGE),
            "https://vercel.com/about": _doc("https://vercel.com/about", title="About Vercel", content="Vercel enables frontend teams to develop, preview, and ship web applications.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="spa_framework_shell_react",
        category="SPA_RENDERED",
        company="Retool",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="retool.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="React shell requiring JavaScript fallback; title hint and /about establish verified primary identity.",
        search_results=[
            SearchResult(title="Retool: Build internal tools fast", url="https://retool.com", snippet="Retool provides app building building blocks for engineering teams."),
        ],
        mock_documents={
            "https://retool.com": _doc("https://retool.com", title="", content="<noscript>You need to enable JavaScript to run this app.</noscript>", ptype=PageType.HOMEPAGE),
            "https://retool.com/about": _doc("https://retool.com/about", title="About Retool", content="Retool is the fast way to build internal software. Trusted by thousands of companies.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="spa_angular_root_loader",
        category="SPA_RENDERED",
        company="Ramp Financial",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="ramp.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Angular app-root spinner on homepage; search title hint and secondary /company corroboration confirm Ramp Financial.",
        search_results=[
            SearchResult(title="Ramp Financial - Cards and Spend Management", url="https://ramp.com", snippet="Ramp Financial helps finance teams automate expenses and save time."),
            SearchResult(title="About Ramp Financial", url="https://ramp.com/company", snippet="Learn about Ramp Financial's mission."),
        ],
        mock_documents={
            "https://ramp.com": _doc("https://ramp.com", title="", content="<app-root><div class='loading-spinner'></div></app-root>", ptype=PageType.HOMEPAGE),
            "https://ramp.com/company": _doc("https://ramp.com/company", title="About Ramp Financial", content="About Ramp Financial: The modern finance automation platform designed to save businesses money.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="spa_shadow_dom_minimal_text",
        category="SPA_RENDERED",
        company="Figma Design",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="figma.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Minimal text on homepage shadow DOM; title hint and /about establish verified primary identity.",
        search_results=[
            SearchResult(title="Figma Design: The Collaborative Interface Design Tool", url="https://figma.com", snippet="Figma Design connects teams in the design process."),
        ],
        mock_documents={
            "https://figma.com": _doc("https://figma.com", title="", content="Figma Design. Connect your design process with collaborative canvases.", ptype=PageType.HOMEPAGE),
            "https://figma.com/about": _doc("https://figma.com/about", title="About Figma Design", content="Figma Design is the leading collaborative interface design platform.", ptype=PageType.ABOUT),
        },
    ),

    # ── Category 2: Unconventional Secondary Paths (5 Cases) ─────────────────
    IdentityRecallCase(
        case_id="unconv_company_story_path",
        category="UNCONVENTIONAL_PATH",
        company="Moove Mobility",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="moove.io",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Secondary corroboration hosted at /company/story route.",
        search_results=[
            SearchResult(title="Moove Mobility - Mobility Fintech", url="https://moove.io", snippet="Moove Mobility democratizes vehicle ownership."),
            SearchResult(title="Our Story | Moove Mobility", url="https://moove.io/company/story", snippet="Learn about Moove Mobility and our mission."),
        ],
        mock_documents={
            "https://moove.io": _doc("https://moove.io", title="Moove Mobility - Mobility Fintech", content="Moove Mobility is a global mobility fintech company providing revenue-based financing.", ptype=PageType.HOMEPAGE),
            "https://moove.io/company/story": _doc("https://moove.io/company/story", title="Our Story | Moove Mobility", content="About Moove Mobility: Founded in 2020, Moove empowers mobility entrepreneurs.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="unconv_who_we_are_path",
        category="UNCONVENTIONAL_PATH",
        company="Zipline",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="zipline.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Secondary corroboration hosted at /who-we-are path.",
        search_results=[
            SearchResult(title="Zipline - Autonomous Delivery", url="https://zipline.com", snippet="Zipline builds autonomous drone logistics networks."),
            SearchResult(title="Who We Are - Zipline", url="https://zipline.com/who-we-are", snippet="Meet Zipline and our team."),
        ],
        mock_documents={
            "https://zipline.com": _doc("https://zipline.com", title="Zipline - Autonomous Delivery", content="Zipline operates the world's largest automated delivery network.", ptype=PageType.HOMEPAGE),
            "https://zipline.com/who-we-are": _doc("https://zipline.com/who-we-are", title="Who We Are - Zipline", content="Zipline was founded to provide fast, reliable access to healthcare.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="unconv_about_us_mission_path",
        category="UNCONVENTIONAL_PATH",
        company="Paystack",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="paystack.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Secondary corroboration at /about-us path with strong entity title confirmation.",
        search_results=[
            SearchResult(title="Paystack - Modern Online Payments", url="https://paystack.com", snippet="Paystack helps businesses in Africa get paid by anyone."),
            SearchResult(title="About Us | Paystack", url="https://paystack.com/about-us", snippet="Learn about Paystack and our journey."),
        ],
        mock_documents={
            "https://paystack.com": _doc("https://paystack.com", title="Paystack - Modern Online Payments", content="Paystack is a growth engine for modern internet businesses in Africa.", ptype=PageType.HOMEPAGE),
            "https://paystack.com/about-us": _doc("https://paystack.com/about-us", title="About Us | Paystack", content="About Paystack: Over 60,000 businesses use Paystack to collect payments safely.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="unconv_company_overview_path",
        category="UNCONVENTIONAL_PATH",
        company="Postman",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="postman.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Secondary page at /company/overview with company name in title and body.",
        search_results=[
            SearchResult(title="Postman API Platform", url="https://postman.com", snippet="Postman is an API platform for building and using APIs."),
            SearchResult(title="Company Overview | Postman", url="https://postman.com/company/overview", snippet="Postman overview and history."),
        ],
        mock_documents={
            "https://postman.com": _doc("https://postman.com", title="Postman API Platform", content="Postman is the world's leading API platform used by 30 million developers.", ptype=PageType.HOMEPAGE),
            "https://postman.com/company/overview": _doc("https://postman.com/company/overview", title="Company Overview | Postman", content="Postman was founded in 2014 to simplify every step of the API lifecycle.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="unconv_contact_sales_path",
        category="UNCONVENTIONAL_PATH",
        company="Supabase",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="supabase.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Secondary corroboration provided via /contact/sales route.",
        search_results=[
            SearchResult(title="Supabase | The Open Source Firebase Alternative", url="https://supabase.com", snippet="Supabase is an open source Firebase alternative."),
            SearchResult(title="Contact Supabase", url="https://supabase.com/contact/sales", snippet="Get in touch with the Supabase team."),
        ],
        mock_documents={
            "https://supabase.com": _doc("https://supabase.com", title="Supabase | The Open Source Firebase Alternative", content="Supabase provides Postgres database, authentication, and instant APIs.", ptype=PageType.HOMEPAGE),
            "https://supabase.com/contact/sales": _doc("https://supabase.com/contact/sales", title="Contact Supabase", content="Talk to the Supabase sales engineering team.", ptype=PageType.CONTACT),
        },
    ),

    # ── Category 3: Indirect Self-Identification (5 Cases) ───────────────────
    IdentityRecallCase(
        case_id="indirect_action_verb_brand",
        category="INDIRECT_SELF_ID",
        company="Moniepoint",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="moniepoint.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage opens with active verb phrase ('Moniepoint powers...').",
        search_results=[
            SearchResult(title="Moniepoint – Financial Services Platform", url="https://moniepoint.com", snippet="Moniepoint powers modern banking for 1M+ African businesses."),
        ],
        mock_documents={
            "https://moniepoint.com": _doc("https://moniepoint.com", title="Moniepoint – Financial Services Platform", content="Moniepoint powers financial operations and payment terminals for businesses.", ptype=PageType.HOMEPAGE),
            "https://moniepoint.com/about": _doc("https://moniepoint.com/about", title="About Moniepoint", content="About Moniepoint: Nigeria's leading business payments platform.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="indirect_mission_statement",
        category="INDIRECT_SELF_ID",
        company="Stripe",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="stripe.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage opens with mission statement self-identification ('Stripe builds...').",
        search_results=[
            SearchResult(title="Stripe | Financial Infrastructure for the Internet", url="https://stripe.com", snippet="Stripe builds financial infrastructure."),
        ],
        mock_documents={
            "https://stripe.com": _doc("https://stripe.com", title="Stripe | Financial Infrastructure for the Internet", content="Stripe builds economic infrastructure for the internet. Businesses of every size use our software.", ptype=PageType.HOMEPAGE),
            "https://stripe.com/about": _doc("https://stripe.com/about", title="About Stripe", content="Stripe is a financial infrastructure platform for businesses.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="indirect_enables_enterprise_thesis",
        category="INDIRECT_SELF_ID",
        company="Datadog",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="datadoghq.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage uses 'Datadog enables full-stack observability...' with exact domain correspondence.",
        search_results=[
            SearchResult(title="Datadog – Cloud Monitoring & Security", url="https://datadoghq.com", snippet="Datadog provides observability and security for cloud applications."),
        ],
        mock_documents={
            "https://datadoghq.com": _doc("https://datadoghq.com", title="Datadog – Cloud Monitoring & Security", content="Datadog enables full-stack observability and security monitoring across modern cloud environments.", ptype=PageType.HOMEPAGE),
            "https://datadoghq.com/about": _doc("https://datadoghq.com/about", title="About Datadog", content="Datadog brings together metrics, traces, and logs in a unified SaaS platform.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="indirect_serves_global_workforce",
        category="INDIRECT_SELF_ID",
        company="Deel Global",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="deel.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage opens with 'Deel Global serves over 20,000 global companies with automated payroll...'",
        search_results=[
            SearchResult(title="Deel Global: Global Payroll & Compliance", url="https://deel.com", snippet="Deel Global simplifies hiring and payroll across 150+ countries."),
        ],
        mock_documents={
            "https://deel.com": _doc("https://deel.com", title="Deel Global: Global Payroll & Compliance", content="Deel Global serves over 20,000 global companies with automated international payroll and HR compliance.", ptype=PageType.HOMEPAGE),
            "https://deel.com/about": _doc("https://deel.com/about", title="About Deel Global", content="Deel Global was founded in 2019 to help teams hire anyone, anywhere in the world.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="indirect_welcome_phrase_onboarding",
        category="INDIRECT_SELF_ID",
        company="Notion",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="notion.so",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Homepage uses position-independent 'Welcome to Notion' opening.",
        search_results=[
            SearchResult(title="Notion: Your connected workspace", url="https://notion.so", snippet="Notion connects wikis, docs, and project management in one place."),
        ],
        mock_documents={
            "https://notion.so": _doc("https://notion.so", title="Notion: Your connected workspace", content="Welcome to Notion: The connected workspace where better, faster work happens.", ptype=PageType.HOMEPAGE),
            "https://notion.so/about": _doc("https://notion.so/about", title="About Notion", content="Notion makes software toolmaking ubiquitous for individuals and teams.", ptype=PageType.ABOUT),
        },
    ),

    # ── Category 4: Subdomain & Multi-Tier Entity Assets (4 Cases) ───────────
    IdentityRecallCase(
        case_id="subdomain_related_product_v0",
        category="SUBDOMAIN_MULTI_TIER",
        company="Vercel",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="v0.app",
        expected_relationship=SiteRelationship.RELATED,
        ground_truth_reason="v0.app is a product of Vercel; should classify as RELATED and produce UNRESOLVED for Vercel query.",
        search_results=[
            SearchResult(title="v0 by Vercel", url="https://v0.app", snippet="v0 is a generative UI tool by Vercel."),
        ],
        mock_documents={
            "https://v0.app": _doc("https://v0.app", title="v0 - Generative UI by Vercel", content="v0 is a product of Vercel. Generative UI for frontend teams.", ptype=PageType.HOMEPAGE),
            "https://v0.app/about": _doc("https://v0.app/about", title="About v0", content="v0 is built by Vercel.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="subdomain_rebranded_legacy_monnify",
        category="SUBDOMAIN_MULTI_TIER",
        company="Moniepoint",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="atm.monnify.com",
        expected_relationship=SiteRelationship.LEGACY,
        ground_truth_reason="Acquired portal with Moniepoint branding but non-corresponding domain classifies as LEGACY -> UNRESOLVED.",
        search_results=[
            SearchResult(title="Moniepoint – ATM Services", url="https://atm.monnify.com", snippet="Moniepoint ATM services."),
        ],
        mock_documents={
            "https://atm.monnify.com": _doc("https://atm.monnify.com", title="Moniepoint – ATM Services", content="Moniepoint ATM services operates under Moniepoint financial group.", ptype=PageType.HOMEPAGE),
            "https://atm.monnify.com/about": _doc("https://atm.monnify.com/about", title="About Moniepoint – ATM Services", content="About Moniepoint ATM operations.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="subdomain_standalone_product_brand",
        category="SUBDOMAIN_MULTI_TIER",
        company="Linear",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="linear.vc",
        expected_relationship=SiteRelationship.UNRELATED,
        ground_truth_reason="linear.vc is a venture fund with incidental name overlap; fails primary relationship for Linear software query.",
        search_results=[
            SearchResult(title="Linear Capital - Early Stage Venture Fund", url="https://linear.vc", snippet="Linear Capital invests in early-stage data intelligence startups."),
        ],
        mock_documents={
            "https://linear.vc": _doc("https://linear.vc", title="Linear Capital - Early Stage Venture Fund", content="Linear Capital is an early-stage venture capital firm.", ptype=PageType.HOMEPAGE),
            "https://linear.vc/about": _doc("https://linear.vc/about", title="About Linear Capital", content="About Linear Capital: Backing visionary founders.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="subdomain_hosted_engineering_blog",
        category="SUBDOMAIN_MULTI_TIER",
        company="Fly.io",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="flyio.ghost.io",
        expected_relationship=SiteRelationship.RELATED,
        ground_truth_reason="Third-party hosted blog on ghost.io is not the canonical primary identity domain.",
        search_results=[
            SearchResult(title="Fly.io Engineering Blog", url="https://flyio.ghost.io", snippet="Technical articles from the Fly.io team."),
        ],
        mock_documents={
            "https://flyio.ghost.io": _doc("https://flyio.ghost.io", title="Fly.io Engineering Blog", content="Official engineering publications by Fly.io infrastructure engineers.", ptype=PageType.HOMEPAGE),
            "https://flyio.ghost.io/about": _doc("https://flyio.ghost.io/about", title="About This Blog", content="Articles about distributed compute and Postgres on Fly.io.", ptype=PageType.ABOUT),
        },
    ),

    # ── Category 5: Negative Controls (5 Cases: 2 AMBIGUOUS, 3 UNRESOLVED) ───
    IdentityRecallCase(
        case_id="neg_competing_primary_collision",
        category="NEGATIVE_CONTROL",
        company="Stripe",
        expected_confidence=IdentityConfidence.AMBIGUOUS,
        expected_domain=None,
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Two independent companies sharing the name 'Stripe' in search results must produce AMBIGUOUS.",
        search_results=[
            SearchResult(title="Stripe - Payments Infrastructure", url="https://stripe.com", snippet="Stripe payments platform."),
            SearchResult(title="Stripe - Developer IDE", url="https://stripedev.io", snippet="Stripe developer workspace."),
        ],
        mock_documents={
            "https://stripe.com": _doc("https://stripe.com", title="Stripe - Payments Infrastructure", content="Stripe is a payments infrastructure company.", ptype=PageType.HOMEPAGE),
            "https://stripe.com/about": _doc("https://stripe.com/about", title="About Stripe", content="About Stripe payments.", ptype=PageType.ABOUT),
            "https://stripedev.io": _doc("https://stripedev.io", title="Stripe - Developer IDE", content="Stripe is a developer workspace company.", ptype=PageType.HOMEPAGE),
            "https://stripedev.io/about": _doc("https://stripedev.io/about", title="About Stripe", content="About Stripe developer tools.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="neg_shape_risk_generic_name",
        category="NEGATIVE_CONTROL",
        company="Acme Corp",
        expected_confidence=IdentityConfidence.AMBIGUOUS,
        expected_domain="acme.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Single primary match on high shape-risk generic name must require manual disambiguation (AMBIGUOUS).",
        search_results=[
            SearchResult(title="Acme Corp - Manufacturing", url="https://acme.com", snippet="Acme Corp manufactures industrial widgets."),
        ],
        mock_documents={
            "https://acme.com": _doc("https://acme.com", title="Acme Corp - Manufacturing", content="Acme Corp is an industrial manufacturing company.", ptype=PageType.HOMEPAGE),
            "https://acme.com/about": _doc("https://acme.com/about", title="About Acme Corp", content="About Acme Corp.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="neg_unsupported_homepage_only",
        category="NEGATIVE_CONTROL",
        company="Widgetco",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="widgetco.com",
        expected_relationship=SiteRelationship.UNKNOWN,
        ground_truth_reason="Homepage self-ID without secondary corroboration must produce UNRESOLVED (insufficient evidence).",
        search_results=[
            SearchResult(title="Widgetco - Official Site", url="https://widgetco.com", snippet="Welcome to Widgetco."),
        ],
        mock_documents={
            "https://widgetco.com": _doc("https://widgetco.com", title="Widgetco - Official Site", content="Widgetco is an enterprise software vendor.", ptype=PageType.HOMEPAGE),
            "https://widgetco.com/about": _fail_doc("https://widgetco.com/about"),
        },
    ),

    IdentityRecallCase(
        case_id="neg_unrelated_distributor_entity",
        category="NEGATIVE_CONTROL",
        company="Linear",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="linear-solutions.com",
        expected_relationship=SiteRelationship.UNRELATED,
        ground_truth_reason="Different entity ('Linear Solutions') fails exact entity title match -> UNRESOLVED for 'Linear'.",
        search_results=[
            SearchResult(title="Linear Solutions - Electrical Distributor", url="https://linear-solutions.com", snippet="Authorized distributor of Linear brand components."),
        ],
        mock_documents={
            "https://linear-solutions.com": _doc("https://linear-solutions.com", title="Linear Solutions - Electrical Distributor", content="Linear Solutions is an authorized distributor of semiconductors.", ptype=PageType.HOMEPAGE),
            "https://linear-solutions.com/about": _doc("https://linear-solutions.com/about", title="About Linear Solutions", content="About Linear Solutions distributor.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="neg_adversarial_exact_domain_related_secondary",
        category="NEGATIVE_CONTROL",
        company="ScaleHub",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="scalehub.com",
        expected_relationship=SiteRelationship.RELATED,
        ground_truth_reason="Exact domain + homepage self-ID, but secondary /about proves it is a subsidiary/product-of brand -> UNRESOLVED.",
        search_results=[
            SearchResult(title="ScaleHub Cloud Services", url="https://scalehub.com", snippet="ScaleHub provides enterprise integration services."),
            SearchResult(title="About ScaleHub", url="https://scalehub.com/about", snippet="Learn about ScaleHub."),
        ],
        mock_documents={
            "https://scalehub.com": _doc("https://scalehub.com", title="ScaleHub Cloud Services", content="ScaleHub provides enterprise integration connectors for hybrid cloud deployments.", ptype=PageType.HOMEPAGE),
            "https://scalehub.com/about": _doc("https://scalehub.com/about", title="About ScaleHub", content="About ScaleHub: ScaleHub is a brand of CloudMesh Global Corporation. A product of CloudMesh.", ptype=PageType.ABOUT),
        },
    ),

    # ── Category: Generalization Hardening Fixtures (v1.2 Dev Expansion) ────
    IdentityRecallCase(
        case_id="dev_route_probing_about_us",
        category="UNCONVENTIONAL_PATH",
        company="GitLab Engineering",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="gitlab.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Secondary corroboration hosted exclusively at /about-us, discovered via multi-candidate conventional route probing.",
        search_results=[
            SearchResult(title="GitLab Engineering: The DevSecOps Platform", url="https://gitlab.com", snippet="GitLab is the open DevSecOps platform."),
        ],
        mock_documents={
            "https://gitlab.com": _doc("https://gitlab.com", title="GitLab Engineering: The DevSecOps Platform", content="GitLab Engineering provides automated CI/CD and security testing.", ptype=PageType.HOMEPAGE),
            "https://gitlab.com/about": _fail_doc("https://gitlab.com/about"),
            "https://gitlab.com/about-us": _doc("https://gitlab.com/about-us", title="About GitLab Engineering", content="About GitLab Engineering: Empowering organizations to innovate faster.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="dev_lexical_subtoken_domain_match",
        category="INDIRECT_SELF_ID",
        company="Retool Platform",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="retool.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Distinctive sub-token 'retool' matches domain 'retool.com' under partial token correspondence.",
        search_results=[
            SearchResult(title="Retool Platform – Build Internal Software", url="https://retool.com", snippet="Retool Platform helps developers build internal apps."),
        ],
        mock_documents={
            "https://retool.com": _doc("https://retool.com", title="Retool Platform – Build Internal Software", content="Retool Platform powers internal tools for thousands of engineering teams.", ptype=PageType.HOMEPAGE),
            "https://retool.com/about": _doc("https://retool.com/about", title="About Retool Platform", content="About Retool Platform: Fast UI components and integrations.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="dev_route_probing_company_team",
        category="UNCONVENTIONAL_PATH",
        company="Anthropic AI",
        expected_confidence=IdentityConfidence.CONFIDENT,
        expected_domain="anthropic.com",
        expected_relationship=SiteRelationship.PRIMARY,
        ground_truth_reason="Secondary corroboration located at /company/about route discovered via multi-candidate probing.",
        search_results=[
            SearchResult(title="Anthropic AI – AI Research and Products", url="https://anthropic.com", snippet="Anthropic AI is an AI safety and research company."),
        ],
        mock_documents={
            "https://anthropic.com": _doc("https://anthropic.com", title="Anthropic AI – AI Research and Products", content="Anthropic AI builds reliable, interpretable, and steerable AI systems.", ptype=PageType.HOMEPAGE),
            "https://anthropic.com/about": _fail_doc("https://anthropic.com/about"),
            "https://anthropic.com/company/about": _doc("https://anthropic.com/company/about", title="About Anthropic AI", content="About Anthropic AI: Dedicated to building safe foundation models.", ptype=PageType.ABOUT),
        },
    ),

    IdentityRecallCase(
        case_id="dev_subtoken_negative_control_different_brand",
        category="NEGATIVE_CONTROL",
        company="Postmark Logistics",
        expected_confidence=IdentityConfidence.UNRESOLVED,
        expected_domain="postmarkexpress.com",
        expected_relationship=SiteRelationship.UNRELATED,
        ground_truth_reason="Courier delivery service 'Postmark Express' fails exact entity match for 'Postmark Logistics' -> UNRESOLVED.",
        search_results=[
            SearchResult(title="Postmark Express - Same Day Courier", url="https://postmarkexpress.com", snippet="Same day package and parcel logistics."),
        ],
        mock_documents={
            "https://postmarkexpress.com": _doc("https://postmarkexpress.com", title="Postmark Express - Same Day Courier", content="Postmark Express provides global parcel logistics.", ptype=PageType.HOMEPAGE),
            "https://postmarkexpress.com/about": _doc("https://postmarkexpress.com/about", title="About Postmark Express", content="About Postmark Express courier.", ptype=PageType.ABOUT),
        },
    ),
]


# ── 3. Mock Harness Providers ────────────────────────────────────────────────

class _DeterministicSearchProvider:
    def __init__(self, company: str, domain: Optional[str], results: List[SearchResult]):
        self.company = company
        self.domain = domain or ""
        self.results = results

    @property
    def name(self) -> str:
        return "deterministic_mock_search"

    def search(self, query: str, num_results: int = 10) -> List[SearchResult]:
        q_lower = query.lower()
        if self.company.lower() in q_lower or (self.domain and self.domain.lower() in q_lower):
            return self.results
        return []

class _DeterministicCrawlManager:
    def __init__(self, doc_map: Dict[str, CrawledDocument]):
        self.doc_map = doc_map

    def fetch_with_fallback(self, url: str, page_type: PageType) -> CrawledDocument:
        normalized_url = url.rstrip("/")
        for k, doc in self.doc_map.items():
            if k.rstrip("/") == normalized_url:
                return doc
        return _fail_doc(url, page_type)


# ── 4. Benchmark Runner & Metric Calculator ──────────────────────────────────

def evaluate_identity_case(case: IdentityRecallCase) -> Dict[str, Any]:
    search_prov = _DeterministicSearchProvider(case.company, case.expected_domain, case.search_results)
    crawl_mgr = _DeterministicCrawlManager(case.mock_documents)
    acquirer = FirstPartyAcquirer(crawl_mgr, search_prov)
    verifier = WebsiteVerifier(search_prov)
    resolver = IdentityResolver(search_prov, verifier, acquirer=acquirer)

    identity = resolver.resolve(case.company, context=case.context)
    
    is_state_match = (identity.confidence == case.expected_confidence)
    is_domain_match = (
        case.expected_domain is None
        or (identity.confidence == IdentityConfidence.CONFIDENT and identity.domain == case.expected_domain)
        or (identity.confidence != IdentityConfidence.CONFIDENT and identity.domain == "")
    )
    
    # Classify outcome matrix cell
    is_correct_confident = (case.expected_confidence == IdentityConfidence.CONFIDENT and identity.confidence == IdentityConfidence.CONFIDENT)
    is_missed_conf_ambiguous = (case.expected_confidence == IdentityConfidence.CONFIDENT and identity.confidence == IdentityConfidence.AMBIGUOUS)
    is_missed_id_unresolved = (case.expected_confidence == IdentityConfidence.CONFIDENT and identity.confidence == IdentityConfidence.UNRESOLVED)
    is_correct_ambiguous = (case.expected_confidence == IdentityConfidence.AMBIGUOUS and identity.confidence == IdentityConfidence.AMBIGUOUS)
    is_correct_unresolved = (case.expected_confidence == IdentityConfidence.UNRESOLVED and identity.confidence == IdentityConfidence.UNRESOLVED)
    is_false_confident = (case.expected_confidence != IdentityConfidence.CONFIDENT and identity.confidence == IdentityConfidence.CONFIDENT)

    return {
        "case_id": case.case_id,
        "category": case.category,
        "company": case.company,
        "expected_confidence": case.expected_confidence,
        "actual_confidence": identity.confidence,
        "expected_domain": case.expected_domain,
        "actual_domain": identity.domain,
        "is_state_match": is_state_match,
        "is_domain_match": is_domain_match,
        "is_correct_confident": is_correct_confident,
        "is_missed_conf_ambiguous": is_missed_conf_ambiguous,
        "is_missed_id_unresolved": is_missed_id_unresolved,
        "is_correct_ambiguous": is_correct_ambiguous,
        "is_correct_unresolved": is_correct_unresolved,
        "is_false_confident": is_false_confident,
        "reasoning": identity.reasoning,
        "ground_truth_reason": case.ground_truth_reason,
    }


def run_identity_recall_benchmark(cases: Optional[List[IdentityRecallCase]] = None) -> Dict[str, Any]:
    dataset = cases or IDENTITY_RECALL_DATASET
    results = [evaluate_identity_case(c) for c in dataset]

    total_cases = len(dataset)
    expected_confident = sum(1 for r in results if r["expected_confidence"] == IdentityConfidence.CONFIDENT)
    expected_non_confident = total_cases - expected_confident

    correct_state_count = sum(1 for r in results if r["is_state_match"])
    correct_confident_count = sum(1 for r in results if r["is_correct_confident"])
    false_confident_count = sum(1 for r in results if r["is_false_confident"])
    missed_conf_ambiguous_count = sum(1 for r in results if r["is_missed_conf_ambiguous"])
    missed_id_unresolved_count = sum(1 for r in results if r["is_missed_id_unresolved"])
    correct_ambiguous_count = sum(1 for r in results if r["is_correct_ambiguous"])
    correct_unresolved_count = sum(1 for r in results if r["is_correct_unresolved"])

    predicted_confident_count = sum(1 for r in results if r["actual_confidence"] == IdentityConfidence.CONFIDENT)
    wrong_target_count = sum(1 for r in results if r["expected_confidence"] == IdentityConfidence.CONFIDENT and r["actual_confidence"] == IdentityConfidence.CONFIDENT and r["expected_domain"] and r["actual_domain"] != r["expected_domain"])
    unsafe_confident_count = false_confident_count + wrong_target_count

    state_accuracy_pct = (correct_state_count / total_cases * 100.0) if total_cases > 0 else 0.0
    confident_recall_pct = (correct_confident_count / expected_confident * 100.0) if expected_confident > 0 else 0.0
    false_confident_rate_pct = (false_confident_count / expected_non_confident * 100.0) if expected_non_confident > 0 else 0.0
    wrong_target_rate_pct = (wrong_target_count / expected_confident * 100.0) if expected_confident > 0 else 0.0
    unsafe_precision_loss_pct = (unsafe_confident_count / predicted_confident_count * 100.0) if predicted_confident_count > 0 else 0.0
    non_confident_safety_pct = ((correct_ambiguous_count + correct_unresolved_count) / expected_non_confident * 100.0) if expected_non_confident > 0 else 0.0

    # Family Breakdown
    families = ["SPA_RENDERED", "UNCONVENTIONAL_PATH", "INDIRECT_SELF_ID", "SUBDOMAIN_MULTI_TIER", "NEGATIVE_CONTROL"]
    family_stats = {}
    for fam in families:
        fam_res = [r for r in results if r["category"] == fam]
        fam_total = len(fam_res)
        fam_matches = sum(1 for r in fam_res if r["is_state_match"])
        fam_fc = sum(1 for r in fam_res if r["is_false_confident"])
        family_stats[fam] = {
            "total": fam_total,
            "matches": fam_matches,
            "accuracy_pct": (fam_matches / fam_total * 100.0) if fam_total > 0 else 0.0,
            "false_confident": fam_fc,
        }

    return {
        "total_cases": total_cases,
        "expected_confident": expected_confident,
        "expected_non_confident": expected_non_confident,
        "predicted_confident_count": predicted_confident_count,
        "state_accuracy_pct": state_accuracy_pct,
        "confident_recall_pct": confident_recall_pct,
        "false_confident_rate_pct": false_confident_rate_pct,
        "wrong_target_rate_pct": wrong_target_rate_pct,
        "unsafe_precision_loss_pct": unsafe_precision_loss_pct,
        "non_confident_safety_pct": non_confident_safety_pct,
        "correct_confident_count": correct_confident_count,
        "wrong_target_count": wrong_target_count,
        "unsafe_confident_count": unsafe_confident_count,
        "missed_conf_ambiguous_count": missed_conf_ambiguous_count,
        "missed_id_unresolved_count": missed_id_unresolved_count,
        "correct_ambiguous_count": correct_ambiguous_count,
        "correct_unresolved_count": correct_unresolved_count,
        "false_confident_count": false_confident_count,
        "family_stats": family_stats,
        "case_results": results,
    }


def print_identity_recall_scorecard(metrics: Dict[str, Any]):
    console.print(Panel.fit(
        "[bold cyan]Dual-Contract Research Engine — Identity Recall & State Accuracy Benchmark[/bold cyan]\n"
        f"Corpus Snapshot: [bold]identity-v1.1-frozen[/bold] ({metrics['total_cases']} Frozen Fixtures across 5 Categories)\n"
        f"Breakdown: {metrics['expected_confident']} Expected CONFIDENT, {metrics['expected_non_confident']} Expected Non-CONFIDENT Controls\n"
        "Invariants: 1. Strict PRIMARY Contract | 2. False CONFIDENT strictly 0.0%",
        title="Identity Layer Verification"
    ))

    scorecard = Table(title="Identity Recall & State Correctness Scorecard (identity-v1.1-frozen)", expand=True)
    scorecard.add_column("Metric Dimension", style="cyan", width=32)
    scorecard.add_column("Result Value", style="bold", width=22)
    scorecard.add_column("Target / Invariant", style="green", width=30)

    acc_color = "green" if metrics["state_accuracy_pct"] >= 95.0 else "yellow"
    rec_color = "green" if metrics["confident_recall_pct"] >= 90.0 else "yellow"
    fc_color = "green" if metrics["false_confident_count"] == 0 else "red"
    unsafe_color = "green" if metrics["unsafe_confident_count"] == 0 else "red"
    safe_color = "green" if metrics["non_confident_safety_pct"] == 100.0 else "red"

    scorecard.add_row("Identity State Accuracy", f"[{acc_color}]{metrics['state_accuracy_pct']:.1f}% ({sum(1 for r in metrics['case_results'] if r['is_state_match'])}/{metrics['total_cases']})[/{acc_color}]", ">= 95.0% Correct Decision State")
    scorecard.add_row("CONFIDENT Recall", f"[{rec_color}]{metrics['confident_recall_pct']:.1f}% ({metrics['correct_confident_count']}/{metrics['expected_confident']})[/{rec_color}]", ">= 90.0% Legitimate Recall")
    scorecard.add_row("Primary Safety: Unsafe Loss", f"[{unsafe_color}]{metrics['unsafe_precision_loss_pct']:.1f}% ({metrics['unsafe_confident_count']}/{metrics['predicted_confident_count']})[/{unsafe_color}]", "0.0% (UNSAFE_CONFIDENT / Predicted)")
    scorecard.add_row("Safety: False CONFIDENT Rate", f"[{fc_color}]{metrics['false_confident_rate_pct']:.1f}% ({metrics['false_confident_count']}/{metrics['expected_non_confident']})[/{fc_color}]", "0.0% (Hard Safety Invariant)")
    scorecard.add_row("Safety: Non-CONFIDENT Correctness", f"[{safe_color}]{metrics['non_confident_safety_pct']:.1f}% ({metrics['correct_ambiguous_count'] + metrics['correct_unresolved_count']}/{metrics['expected_non_confident']})[/{safe_color}]", "100.0% Controls Preserved")
    scorecard.add_row("Missed Confidence (Ambiguous)", f"{metrics['missed_conf_ambiguous_count']}", "0 (Unnecessary Ambiguity)")
    scorecard.add_row("Missed Identity (Unresolved)", f"{metrics['missed_id_unresolved_count']}", "0 (Unnecessary Rejection)")
    scorecard.add_row("Correct Safety (Ambiguous)", f"{metrics['correct_ambiguous_count']}", "Preserved Collision Gate")
    scorecard.add_row("Correct Safety (Unresolved)", f"{metrics['correct_unresolved_count']}", "Preserved Evidence Gate")

    console.print("\n")
    console.print(scorecard)

    # Confusion Matrix Table
    matrix_table = Table(title=f"Identity Outcome Confusion Matrix ({metrics['total_cases']} Cases - identity-v1.2-dev)", expand=True, show_lines=True)
    matrix_table.add_column("Expected State", style="bold cyan", width=18)
    matrix_table.add_column("Predicted CONFIDENT", justify="center")
    matrix_table.add_column("Predicted AMBIGUOUS", justify="center")
    matrix_table.add_column("Predicted UNRESOLVED", justify="center")

    exp_ambiguous = sum(1 for r in metrics['case_results'] if r['expected_confidence'] == IdentityConfidence.AMBIGUOUS)
    exp_unresolved = sum(1 for r in metrics['case_results'] if r['expected_confidence'] == IdentityConfidence.UNRESOLVED)

    matrix_table.add_row(
        f"CONFIDENT ({metrics['expected_confident']})",
        f"[green]{metrics['correct_confident_count']} (Correct Recall)[/green]",
        f"[yellow]{metrics['missed_conf_ambiguous_count']} (Missed Conf)[/yellow]",
        f"[red]{metrics['missed_id_unresolved_count']} (Missed ID)[/red]"
    )
    matrix_table.add_row(
        f"AMBIGUOUS ({exp_ambiguous})",
        f"[bold red]{sum(1 for r in metrics['case_results'] if r['expected_confidence'] == IdentityConfidence.AMBIGUOUS and r['actual_confidence'] == IdentityConfidence.CONFIDENT)} (False Conf)[/bold red]",
        f"[green]{metrics['correct_ambiguous_count']} (Correct Safety)[/green]",
        "0"
    )
    matrix_table.add_row(
        f"UNRESOLVED ({exp_unresolved})",
        f"[bold red]{sum(1 for r in metrics['case_results'] if r['expected_confidence'] == IdentityConfidence.UNRESOLVED and r['actual_confidence'] == IdentityConfidence.CONFIDENT)} (False Conf)[/bold red]",
        "0",
        f"[green]{metrics['correct_unresolved_count']} (Correct Safety)[/green]"
    )

    console.print("\n")
    console.print(matrix_table)

    # Family Breakdown Table
    fam_table = Table(title="Category & Family Breakdown (identity-v1.2-dev)", expand=True, show_lines=True)
    fam_table.add_column("Category Family", style="cyan", width=25)
    fam_table.add_column("Total Cases", justify="center", width=12)
    fam_table.add_column("State Accuracy", justify="right", width=18)
    fam_table.add_column("False CONFIDENT", justify="right", width=18)

    for fam, stats in metrics["family_stats"].items():
        col = "green" if stats["accuracy_pct"] == 100.0 else "yellow"
        fc_c = "green" if stats["false_confident"] == 0 else "red"
        fam_table.add_row(
            fam,
            str(stats["total"]),
            f"[{col}]{stats['accuracy_pct']:.1f}% ({stats['matches']}/{stats['total']})[/{col}]",
            f"[{fc_c}]{stats['false_confident']}[/{fc_c}]"
        )

    console.print("\n")
    console.print(fam_table)

    # Per-Case Diff Table
    diff_table = Table(title="Per-Case Verification & Outcome Details (24 Cases)", expand=True, show_lines=True)
    diff_table.add_column("Case ID", style="cyan", width=34)
    diff_table.add_column("Category", style="dim", width=18)
    diff_table.add_column("Expected", justify="center", width=14)
    diff_table.add_column("Actual", justify="center", width=14)
    diff_table.add_column("Domain", style="magenta", width=20)
    diff_table.add_column("Match?", justify="center", width=10)

    for r in metrics["case_results"]:
        match_str = "[green]MATCH[/green]" if r["is_state_match"] else "[bold red]FAIL[/bold red]"
        diff_table.add_row(
            r["case_id"],
            r["category"],
            r["expected_confidence"].value,
            f"[{'green' if r['is_state_match'] else 'red'}]{r['actual_confidence'].value}[/{'green' if r['is_state_match'] else 'red'}]",
            r["actual_domain"] or "—",
            match_str,
        )

    console.print("\n")
    console.print(diff_table)


def main():
    metrics = run_identity_recall_benchmark()
    print_identity_recall_scorecard(metrics)

if __name__ == "__main__":
    main()

import sys
import os
import time
from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timezone
from dataclasses import dataclass
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from core.models import (
    CompanyIdentity, IdentityConfidence, CrawledDocument,
    DocumentQuality, PageType, RawResearchPackage,
)
from core.evidence import ClaimGraph, ClaimClassification
from core.dto import OpportunityType, CompanyResearchDTO
from core.opportunities import extract_research_opportunities, is_confirmed_job_opening, has_closed_job_signal, has_job_posting_content_signal
from synthesis.bridge import LLMClaimGraphBridge
from synthesis.providers.gemini import GeminiLLMSynthesizer
from synthesis.providers.mistral import MistralLLMSynthesizer

console = Console()

@dataclass(frozen=True)
class EvaluationBenchmarkCase:
    category: str  # REAL_WORLD | NEGATIVE_GATING | IDENTITY_SAFETY | CONTRACT_FIXTURE | SEMANTIC_STRESS
    case_id: str
    company: str
    description: str
    package: RawResearchPackage
    expected_opportunity_type: OpportunityType
    expected_role_title: Optional[str]
    expected_identity_confidence: IdentityConfidence
    ground_truth_notes: str
    snapshot_version: str = "v1.0-frozen"
    retrieval_timestamp: str = "2026-09-29T08:00:00Z"
    expected_accepted_predicates: Optional[List[str]] = None
    expected_omitted_predicates: Optional[List[str]] = None
    prohibited_predicates: Optional[List[str]] = None


# ── Benchmark Evaluation Dataset (14 Frozen Snapshot Cases across 5 Dimensions) ──
# Deterministic regression dataset with frozen crawled evidence packages:
# 1. REAL_WORLD: Frozen observed evidence snapshots + human-established ground truth
# 2. NEGATIVE_GATING: Negative vacancy signals (closed, filled, paused, culture-only)
# 3. CONTRACT_FIXTURE: Invariant boundary fixtures (stealth, short overview, multi-source)
# 4. IDENTITY_SAFETY: Disambiguation and domain collision safety scenario
# 5. SEMANTIC_STRESS: Adversarial semantic entailment tests (negation, unstated metrics, launch vs founded, multi-entity)

EVALUATION_DATASET: List[EvaluationBenchmarkCase] = [
    # ── Category 1: Real-World Cases (Observed Evidence + Expected Result) ─────
    EvaluationBenchmarkCase(
        category="REAL_WORLD",
        case_id="real_moniepoint_corporate",
        company="Moniepoint",
        description="Established multi-product fintech with active in-domain engineering requisition",
        expected_opportunity_type=OpportunityType.CONFIRMED,
        expected_role_title="Lead Infrastructure Engineer",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Verified active job posting with explicit responsibilities and qualifications.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="Moniepoint",
                domain="moniepoint.com",
                website_url="https://moniepoint.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified financial services platform in Nigeria.",
            ),
            documents=[
                CrawledDocument(
                    url="https://moniepoint.com/about",
                    final_url="https://moniepoint.com/about",
                    page_type=PageType.ABOUT,
                    title="About Moniepoint",
                    content="""About Moniepoint
Moniepoint Inc. is a leading financial technology company providing banking, payments, credit, and business management tools.
Founded in 2015 by Tosin Eniolorunda and Felix Ike, Moniepoint powers over 1.3 million businesses across Africa.
Headquartered in London with primary operations in Lagos, Nigeria.
Licensed by the Central Bank of Nigeria as a Microfinance Bank.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://moniepoint.com/careers/lead-infra-engineer",
                    final_url="https://moniepoint.com/careers/lead-infra-engineer",
                    page_type=PageType.JOB_LISTING,
                    title="Lead Infrastructure Engineer | Moniepoint",
                    content="""Lead Infrastructure Engineer
Responsibilities:
- Scale Kubernetes clusters across multi-cloud regions.
- Architect high-throughput payment settlement pipelines.
Requirements:
- 7+ years distributed systems experience with Go and AWS.
- Strong knowledge of PostgreSQL and Kafka.
Apply now to join our infrastructure team.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    EvaluationBenchmarkCase(
        category="REAL_WORLD",
        case_id="real_linear_spa",
        company="Linear",
        description="SPA developer tool with about page, funding post, and active Product Manager opening",
        expected_opportunity_type=OpportunityType.CONFIRMED,
        expected_role_title="Product Manager",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Verified active job posting crawled with HTML title; satisfies CONFIRMED gate.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="Linear",
                domain="linear.app",
                website_url="https://linear.app",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified primary domain for Linear product development system.",
            ),
            documents=[
                CrawledDocument(
                    url="https://linear.app/about",
                    final_url="https://linear.app/about",
                    page_type=PageType.ABOUT,
                    title="About Linear",
                    content="""About Linear
Linear is the purpose-built tool for planning and building software.
Created for modern software teams who want to build high quality software faster.
Linear was founded in 2019 by Karri Saarinen, Tuomas Artman, and Jori Lallo.
More than 40,000 companies including OpenAI, Coinbase, and Ramp build with Linear.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://linear.app/now/series-b-announcement",
                    final_url="https://linear.app/now/series-b-announcement",
                    page_type=PageType.BLOG,
                    title="Linear's Next Chapter: Series B",
                    content="""Linear's Next Chapter
Announcing our $35M Series B funding led by Accel.
Published on September 14. 4 min read.
We are scaling our sync engine architecture built with TypeScript and SQLite.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://linear.app/careers/86abcce0-04b2-405c-9a8e-e0ca84813914",
                    final_url="https://linear.app/careers/86abcce0-04b2-405c-9a8e-e0ca84813914",
                    page_type=PageType.JOB_LISTING,
                    title="Product Manager - Linear Careers",
                    content="""Product Manager
At Linear, we're building the product development system for teams and agents.
Responsibilities:
- Drive core product roadmap for issue tracking and project planning.
- Work closely with engineering and design to ship high craft user experiences.
Requirements:
- 4+ years product management experience building developer tools.
- Strong technical empathy and deep product craft.
Apply for this position.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    EvaluationBenchmarkCase(
        category="REAL_WORLD",
        case_id="real_vercel_ats",
        company="Vercel",
        description="Platform company with third-party Ashby ATS hosted opening",
        expected_opportunity_type=OpportunityType.CONFIRMED,
        expected_role_title="Senior Solutions Architect",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Verified active opening hosted on external ATS with job structure.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="Vercel",
                domain="vercel.com",
                website_url="https://vercel.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified cloud platform for Next.js and frontend applications.",
            ),
            documents=[
                CrawledDocument(
                    url="https://vercel.com/about",
                    final_url="https://vercel.com/about",
                    page_type=PageType.ABOUT,
                    title="About Vercel",
                    content="""About Vercel
Vercel is the Frontend Cloud. We provide developer experience and infrastructure to build and deploy web applications.
Founded by Guillermo Rauch, Vercel created Next.js, the premier React framework.
Over 1 million active developers use Vercel worldwide.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://jobs.ashbyhq.com/vercel/1a2b3c4d",
                    final_url="https://jobs.ashbyhq.com/vercel/1a2b3c4d",
                    page_type=PageType.JOB_LISTING,
                    title="Senior Solutions Architect - Vercel Careers",
                    content="""Senior Solutions Architect
About the role:
Partner with enterprise customers deploying large Next.js workloads.
Responsibilities:
- Advise enterprise architects on edge middleware and rendering patterns.
Requirements:
- 5+ years experience in frontend architecture and web performance.
Apply for this role.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    # ── Category 2: Negative Gating & False Positive Reduction ────────────────
    EvaluationBenchmarkCase(
        category="NEGATIVE_GATING",
        case_id="neg_closed_filled_posting",
        company="TechCorp Closed",
        description="Expired job requisition with 'position filled' notification",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Must reject CONFIRMED because position has been filled / applications are closed.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="TechCorp Closed",
                domain="techcorpclosed.com",
                website_url="https://techcorpclosed.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified company identity.",
            ),
            documents=[
                CrawledDocument(
                    url="https://techcorpclosed.com/about",
                    final_url="https://techcorpclosed.com/about",
                    page_type=PageType.ABOUT,
                    title="About TechCorp",
                    content="TechCorp builds enterprise database synchronization solutions.",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://techcorpclosed.com/careers/senior-python-dev",
                    final_url="https://techcorpclosed.com/careers/senior-python-dev",
                    page_type=PageType.JOB_LISTING,
                    title="Senior Python Developer",
                    content="""Senior Python Developer
Responsibilities:
- Maintain ETL pipelines.
Requirements:
- Python and SQL.
Notice: This position has been filled. Applications are closed. Thank you for your interest.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    EvaluationBenchmarkCase(
        category="NEGATIVE_GATING",
        case_id="neg_culture_article_incidental_word",
        company="Innovate Labs",
        description="Culture blog post containing incidental 'responsibilities' token without job opening",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Must reject CONFIRMED because page is a blog/culture essay, not an active opening.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="Innovate Labs",
                domain="innovatelabs.ai",
                website_url="https://innovatelabs.ai",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified AI research studio.",
            ),
            documents=[
                CrawledDocument(
                    url="https://innovatelabs.ai/about",
                    final_url="https://innovatelabs.ai/about",
                    page_type=PageType.ABOUT,
                    title="About Innovate Labs",
                    content="Innovate Labs builds generative AI agents for scientific discovery.",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://innovatelabs.ai/careers/culture-and-values",
                    final_url="https://innovatelabs.ai/careers/culture-and-values",
                    page_type=PageType.OTHER,
                    title="Our Culture & Values",
                    content="""Our Culture and Values
As engineering leaders, our core responsibilities include fostering deep collaboration and psychological safety across distributed teams.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    EvaluationBenchmarkCase(
        category="NEGATIVE_GATING",
        case_id="neg_canonical_url_deduplication",
        company="Stripe Dedup",
        description="Multiple crawled URLs pointing to identical opening via query/tracking variants",
        expected_opportunity_type=OpportunityType.CONFIRMED,
        expected_role_title="Backend Staff Engineer",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Must emit exactly 1 CONFIRMED opportunity after canonical URL deduplication.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="Stripe Dedup",
                domain="stripedup.com",
                website_url="https://stripedup.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified payments infrastructure company.",
            ),
            documents=[
                CrawledDocument(
                    url="https://stripedup.com/careers/backend-staff",
                    final_url="https://stripedup.com/careers/backend-staff",
                    page_type=PageType.JOB_LISTING,
                    title="Backend Staff Engineer | Stripe Dedup",
                    content="""Backend Staff Engineer
Responsibilities:
- Build global financial ledger.
Requirements:
- Distributed systems experience.
Apply for this job.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://www.stripedup.com/careers/backend-staff?utm_source=linkedin&ref=jobboard",
                    final_url="https://www.stripedup.com/careers/backend-staff?utm_source=linkedin&ref=jobboard",
                    page_type=PageType.JOB_LISTING,
                    title="Backend Staff Engineer | Stripe Dedup",
                    content="""Backend Staff Engineer
Responsibilities:
- Build global financial ledger.
Requirements:
- Distributed systems experience.
Apply for this job.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    EvaluationBenchmarkCase(
        category="NEGATIVE_GATING",
        case_id="neg_job_description_with_hiring_freeze",
        company="TechScale Paused",
        description="Job requisition with explicit 'hiring paused' status banner",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Must reject CONFIRMED because posting is paused / no longer accepting applications.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="TechScale Paused",
                domain="techscalepaused.com",
                website_url="https://techscalepaused.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified company identity.",
            ),
            documents=[
                CrawledDocument(
                    url="https://techscalepaused.com/about",
                    final_url="https://techscalepaused.com/about",
                    page_type=PageType.ABOUT,
                    title="About TechScale",
                    content="TechScale builds cloud infrastructure tooling.",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://techscalepaused.com/careers/senior-frontend-engineer",
                    final_url="https://techscalepaused.com/careers/senior-frontend-engineer",
                    page_type=PageType.JOB_LISTING,
                    title="Senior Frontend Engineer | TechScale",
                    content="""Senior Frontend Engineer
Responsibilities:
- Build React design systems.
Requirements:
- 5+ years TypeScript.
Status update: We are currently no longer accepting applications for this role due to a hiring pause.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    # ── Category 3: Contract Fixtures ─────────────────────────────────────────
    EvaluationBenchmarkCase(
        category="CONTRACT_FIXTURE",
        case_id="fixture_stealth_no_careers",
        company="Acme AI Labs",
        description="Stealth boutique research lab with single homepage, zero public careers evidence",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="No careers page; emits PROACTIVE general outreach with high overview grounding.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="Acme AI Labs",
                domain="acmeailabs.io",
                website_url="https://acmeailabs.io",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified single primary research domain.",
            ),
            documents=[
                CrawledDocument(
                    url="https://acmeailabs.io",
                    final_url="https://acmeailabs.io",
                    page_type=PageType.HOMEPAGE,
                    title="Acme AI Labs - Autonomous Systems",
                    content="""Acme AI Labs
We research and build verifiable agent architectures for high-reliability software engineering.
Our team consists of 8 researchers in Zurich and San Francisco.
Contact us at research@acmeailabs.io for research collaborations.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    EvaluationBenchmarkCase(
        category="CONTRACT_FIXTURE",
        case_id="fixture_growth_company_no_jobs_in_scope",
        company="CraftFlow",
        description="Productivity app with about and changelog pages, zero job listings discovered in scope",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="No job posting in crawled scope; safely demotes to PROACTIVE general outreach.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="CraftFlow",
                domain="craftflow.io",
                website_url="https://craftflow.io",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified productivity app domain.",
            ),
            documents=[
                CrawledDocument(
                    url="https://craftflow.io/about",
                    final_url="https://craftflow.io/about",
                    page_type=PageType.ABOUT,
                    title="About CraftFlow",
                    content="""About CraftFlow
CraftFlow is a modern workspace for creative engineering teams.
Founded in 2022, CraftFlow streamlines document review and issue tracking.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://craftflow.io/changelog",
                    final_url="https://craftflow.io/changelog",
                    page_type=PageType.BLOG,
                    title="CraftFlow Changelog - v2.4 Release",
                    content="""Changelog v2.4
We released real-time canvas collaboration and offline mode support.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    # ── Category 4: Identity Safety Regressions ───────────────────────────────
    EvaluationBenchmarkCase(
        category="IDENTITY_SAFETY",
        case_id="safety_entity_collision_apex",
        company="Apex",
        description="Entity collision disambiguated via financial clearing domain context",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Tests identity discrimination safety under common noun collision.",
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="Apex",
                domain="apexfintechsolutions.com",
                website_url="https://apexfintechsolutions.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Resolved primary identity disambiguated via financial clearing context.",
            ),
            documents=[
                CrawledDocument(
                    url="https://apexfintechsolutions.com/about-us",
                    final_url="https://apexfintechsolutions.com/about-us",
                    page_type=PageType.ABOUT,
                    title="About Apex Fintech Solutions",
                    content="""About Apex Fintech Solutions
Apex Fintech Solutions is the fintech for fintechs, powering modern investing and clearing custody services.
We provide execution, clearing, custody, and digital wealth solutions for hundreds of broker-dealers.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    # ── Category 5: Semantic Stress Testing Fixtures ──────────────────────────
    EvaluationBenchmarkCase(
        category="SEMANTIC_STRESS",
        case_id="stress_paused_hiring_negation",
        company="Nexar Robotics",
        description="Negated hiring state: company explicitly pauses hiring while restructuring",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Tests negation comprehension: active hiring_role must NOT be extracted from paused notice.",
        expected_accepted_predicates=["provides_product"],
        expected_omitted_predicates=["hiring_role"],
        prohibited_predicates=["hiring_role"],
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="Nexar Robotics",
                domain="nexarrobotics.com",
                website_url="https://nexarrobotics.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified robotics engineering company.",
            ),
            documents=[
                CrawledDocument(
                    url="https://nexarrobotics.com/about",
                    final_url="https://nexarrobotics.com/about",
                    page_type=PageType.ABOUT,
                    title="About Nexar Robotics",
                    content="""About Nexar Robotics
Nexar Robotics builds autonomous warehouse sorting robots for supply chain operators.
Founded in 2021 in Austin, Texas.
Our core technology automates parcel classification in distribution centers.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
                CrawledDocument(
                    url="https://nexarrobotics.com/careers/notice",
                    final_url="https://nexarrobotics.com/careers/notice",
                    page_type=PageType.BLOG,
                    title="Hiring Update - Nexar Robotics",
                    content="""Careers Notice
Engineering hiring is currently paused for Q3 and Q4 while we restructure team operations.
We are not accepting applications for Software Engineer or Robotics Engineer roles at this time.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    EvaluationBenchmarkCase(
        category="SEMANTIC_STRESS",
        case_id="stress_unstated_metric_extrapolation",
        company="AfriPay Cloud",
        description="Unstated metrics: B2B gateway serving banks without disclosing quantitative customer count",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Tests anti-hallucination on quantities: customer_count or user numbers must NOT be invented.",
        expected_accepted_predicates=["provides_product"],
        expected_omitted_predicates=["serves_customer_count", "active_user_count"],
        prohibited_predicates=["serves_customer_count", "active_user_count"],
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="AfriPay Cloud",
                domain="afripaycloud.com",
                website_url="https://afripaycloud.com",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified payment infrastructure provider.",
            ),
            documents=[
                CrawledDocument(
                    url="https://afripaycloud.com/overview",
                    final_url="https://afripaycloud.com/overview",
                    page_type=PageType.ABOUT,
                    title="About AfriPay Cloud",
                    content="""AfriPay Cloud Overview
AfriPay Cloud provides B2B payment gateway infrastructure and clearing protocols.
Serving enterprise banks and regulated financial institutions across Nigeria and Ghana with multi-currency settlement.
Built with resilient Go microservices and Kafka event streaming.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    EvaluationBenchmarkCase(
        category="SEMANTIC_STRESS",
        case_id="stress_launch_vs_founded_confusion",
        company="ReconFlow AI",
        description="Temporal attribute distinction: product launched in 2024, founding year unstated",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Tests temporal distinction: product launch year (2024) must NOT be attributed to company founded_in.",
        expected_accepted_predicates=["provides_product"],
        expected_omitted_predicates=["founded_in"],
        prohibited_predicates=["founded_in"],
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="ReconFlow AI",
                domain="reconflow.ai",
                website_url="https://reconflow.ai",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified financial automation company.",
            ),
            documents=[
                CrawledDocument(
                    url="https://reconflow.ai/products/platform-x",
                    final_url="https://reconflow.ai/products/platform-x",
                    page_type=PageType.PRODUCT,
                    title="Platform X Announcement - ReconFlow AI",
                    content="""Platform X Product Launch
ReconFlow AI launched Platform X in 2024 to automate financial reconciliation for accounting teams.
Eliminate manual ledger matching with AI-powered invoice reconciliation.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),

    EvaluationBenchmarkCase(
        category="SEMANTIC_STRESS",
        case_id="stress_multi_entity_attribute_contamination",
        company="DataCore Solutions",
        description="Multi-entity attribution: partner operates 10,000 servers, target builds software plugins",
        expected_opportunity_type=OpportunityType.PROACTIVE,
        expected_role_title="General Outreach",
        expected_identity_confidence=IdentityConfidence.CONFIDENT,
        ground_truth_notes="Tests entity isolation: partner's server infrastructure scale must NOT be attributed to target company.",
        expected_accepted_predicates=["provides_product"],
        expected_omitted_predicates=["business_scale", "active_user_count"],
        prohibited_predicates=["business_scale", "active_user_count"],
        package=RawResearchPackage(
            identity=CompanyIdentity(
                name="DataCore Solutions",
                domain="datacoresolutions.io",
                website_url="https://datacoresolutions.io",
                confidence=IdentityConfidence.CONFIDENT,
                reasoning="Verified database observability vendor.",
            ),
            documents=[
                CrawledDocument(
                    url="https://datacoresolutions.io/integrations/cloudgrid",
                    final_url="https://datacoresolutions.io/integrations/cloudgrid",
                    page_type=PageType.PRODUCT,
                    title="CloudGrid Integration - DataCore Solutions",
                    content="""CloudGrid Integration
DataCore Solutions develops real-time database observability plugins.
Our cloud partner CloudGrid operates 10,000 bare-metal servers across Europe.
DataCore connects seamlessly to CloudGrid telemetry pipelines.""",
                    retrieved_at=datetime.now(timezone.utc),
                    quality=DocumentQuality.VALID,
                ),
            ],
            discovered_at=datetime.now(timezone.utc),
        ),
    ),
]


def audit_semantic_claims(graph: ClaimGraph, case: EvaluationBenchmarkCase) -> Dict[str, Any]:
    """Audits accepted Claim propositions against expected semantic constraints."""
    accepted_facts = [c for c in graph.claims if c.classification in (ClaimClassification.FACT, ClaimClassification.INFERENCE)]
    accepted_predicates = {c.predicate for c in accepted_facts}

    missing_expected = [p for p in (case.expected_accepted_predicates or []) if p not in accepted_predicates]
    prohibited_found = [p for p in (case.prohibited_predicates or []) if p in accepted_predicates]
    unwanted_omitted = [p for p in (case.expected_omitted_predicates or []) if p in accepted_predicates]

    has_rules = bool(case.expected_accepted_predicates or case.prohibited_predicates or case.expected_omitted_predicates)
    passed = (len(missing_expected) == 0 and len(prohibited_found) == 0 and len(unwanted_omitted) == 0) if has_rules else True

    return {
        "has_rules": has_rules,
        "passed": passed,
        "missing_expected": missing_expected,
        "prohibited_found": prohibited_found,
        "unwanted_omitted": unwanted_omitted,
    }


def run_benchmark_evaluation(synthesizer, provider_label: str) -> Dict[str, Any]:
    run_timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    model_name = getattr(synthesizer, "model", getattr(synthesizer, "_model", "default"))

    console.print(Panel.fit(
        f"[bold cyan]Dual-Contract Research Engine — Multi-Dimensional Benchmark[/bold cyan]\n"
        f"Provider: [bold magenta]{provider_label}[/bold magenta] | Model: [bold yellow]{model_name}[/bold yellow]\n"
        f"Timestamp: [dim]{run_timestamp}[/dim]\n"
        f"Evaluating {len(EVALUATION_DATASET)} benchmark cases across Real-World, Negative Gating, Identity, and Semantic Stress Fixtures.\n"
        f"Hard Invariant: Grounding Failures must strictly be 0.",
        title="Comprehensive Quality & Accuracy Benchmark"
    ))

    # 1. Detailed Per-Case Execution Table
    case_table = Table(title=f"Per-Case Evaluation Results ({provider_label} - {model_name})", expand=True, show_lines=True)
    case_table.add_column("Category", style="dim", width=14)
    case_table.add_column("Case ID", style="cyan", width=22)
    case_table.add_column("Company", style="white", width=14)
    case_table.add_column("Expected Opp", style="bold")
    case_table.add_column("Actual Opp", style="bold")
    case_table.add_column("Opp Verdict", justify="center")
    case_table.add_column("Status", justify="center")
    case_table.add_column("Accepted", justify="right", style="green")
    case_table.add_column("Rejected", justify="right", style="red")
    case_table.add_column("GF", justify="right")
    case_table.add_column("Sem Audit", justify="center")
    case_table.add_column("Latency", justify="right")
    case_table.add_column("Tokens", justify="right", style="dim")

    total_cases = len(EVALUATION_DATASET)
    opp_matches = 0
    false_confirmed = 0
    missed_confirmed = 0
    expected_confirmed_cases = sum(1 for c in EVALUATION_DATASET if c.expected_opportunity_type == OpportunityType.CONFIRMED)
    expected_non_confirmed_cases = sum(1 for c in EVALUATION_DATASET if c.expected_opportunity_type != OpportunityType.CONFIRMED)
    total_candidates = 0
    total_accepted_claims = 0
    total_rejected_claims = 0
    grounding_failures = 0
    semantic_stress_cases_count = 0
    semantic_stress_clean_count = 0
    total_latency_s = 0.0
    case_latencies: List[float] = []
    total_tokens_consumed = 0
    provider_errors = 0
    validation_errors = 0
    claims_by_category: Dict[str, int] = {}
    case_details: Dict[str, Dict[str, Any]] = {}

    for case in EVALUATION_DATASET:
        start_time = time.perf_counter()
        try:
            graph, dto, diagnostics = LLMClaimGraphBridge.process(case.package, synthesizer)
            duration_s = time.perf_counter() - start_time
            total_latency_s += duration_s
            case_latencies.append(duration_s)

            meta = getattr(synthesizer, "last_metadata", None)
            tokens = meta.total_tokens if meta and meta.total_tokens else 0
            total_tokens_consumed += tokens

            actual_opp = dto.opportunities[0].opportunity_type if dto.opportunities else OpportunityType.UNCLASSIFIED
            is_opp_match = (actual_opp == case.expected_opportunity_type)
            if is_opp_match:
                opp_matches += 1
            elif actual_opp == OpportunityType.CONFIRMED and case.expected_opportunity_type != OpportunityType.CONFIRMED:
                false_confirmed += 1
            elif actual_opp != OpportunityType.CONFIRMED and case.expected_opportunity_type == OpportunityType.CONFIRMED:
                missed_confirmed += 1

            accepted_claims_list = [c for c in graph.claims if c.classification in (ClaimClassification.FACT, ClaimClassification.INFERENCE)]
            accepted_count = len(accepted_claims_list)
            rejected_count = len(diagnostics)
            total_candidates += (accepted_count + rejected_count)
            total_accepted_claims += accepted_count
            total_rejected_claims += rejected_count

            for c in accepted_claims_list:
                cat_name = c.category.value
                claims_by_category[cat_name] = claims_by_category.get(cat_name, 0) + 1

            # Hard invariant check: Every accepted claim in graph must strictly have valid citations and verbatim quotes
            case_gf = 0
            for c in graph.claims:
                if c.classification in (ClaimClassification.FACT, ClaimClassification.INFERENCE):
                    if not c.evidence_refs or not c.supporting_quotes:
                        case_gf += 1
            grounding_failures += case_gf

            # Audit semantic propositions against expected/prohibited rules
            audit_res = audit_semantic_claims(graph, case)
            if audit_res["has_rules"]:
                semantic_stress_cases_count += 1
                if audit_res["passed"]:
                    semantic_stress_clean_count += 1
                sem_label = "[bold green]PASS[/bold green]" if audit_res["passed"] else "[bold red]FAIL[/bold red]"
            else:
                sem_label = "[dim]-[/dim]"

            opp_match_label = "[bold green]PASS[/bold green]" if is_opp_match else "[bold red]MISMATCH[/bold red]"
            gf_label = "[bold green]0[/bold green]" if case_gf == 0 else f"[bold red]{case_gf}[/bold red]"
            exec_status = "[green]SUCCESS[/green]"

            case_details[case.case_id] = {
                "category": case.category,
                "company": case.company,
                "expected_opp": case.expected_opportunity_type.value,
                "actual_opp": actual_opp.value,
                "is_match": is_opp_match,
                "exec_status": "SUCCESS",
                "accepted_claims": accepted_count,
                "rejected_claims": rejected_count,
                "grounding_failures": case_gf,
                "semantic_audit": audit_res,
                "latency_s": duration_s,
                "tokens": tokens,
            }

            case_table.add_row(
                case.category,
                case.case_id,
                case.company,
                case.expected_opportunity_type.value,
                actual_opp.value,
                opp_match_label,
                exec_status,
                str(accepted_count),
                str(rejected_count),
                gf_label,
                sem_label,
                f"{duration_s:.2f}s",
                str(tokens) if tokens > 0 else "-",
            )
        except Exception as e:
            duration_s = time.perf_counter() - start_time
            case_latencies.append(duration_s)
            err_type = "PROVIDER_ERROR" if "API" in type(e).__name__ or "Http" in type(e).__name__ or "timeout" in str(e).lower() else "VALIDATION_ERROR"
            if err_type == "PROVIDER_ERROR":
                provider_errors += 1
            else:
                validation_errors += 1

            audit_res = {"has_rules": bool(case.expected_accepted_predicates or case.prohibited_predicates), "passed": False}
            if audit_res["has_rules"]:
                semantic_stress_cases_count += 1

            case_details[case.case_id] = {
                "category": case.category,
                "company": case.company,
                "expected_opp": case.expected_opportunity_type.value,
                "actual_opp": "ERROR",
                "is_match": False,
                "exec_status": err_type,
                "accepted_claims": 0,
                "rejected_claims": 0,
                "grounding_failures": 0,
                "semantic_audit": audit_res,
                "latency_s": duration_s,
                "tokens": 0,
            }

            case_table.add_row(
                case.category,
                case.case_id,
                case.company,
                case.expected_opportunity_type.value,
                "ERROR",
                "[bold red]ERROR[/bold red]",
                f"[bold red]{err_type}[/bold red]",
                "0",
                "0",
                "[bold red]ERROR[/bold red]",
                f"{duration_s:.2f}s",
                "-",
            )
        finally:
            time.sleep(1.0)

    console.print(case_table)

    # 2. Executive Benchmark Quality Scorecard
    scorecard = Table(title=f"Benchmark Quality Scorecard ({provider_label} - {model_name})", expand=True)
    scorecard.add_column("Metric Dimension", style="cyan")
    scorecard.add_column("Result Value", style="bold")
    scorecard.add_column("Target / Invariant", style="green")

    opp_accuracy_pct = (opp_matches / total_cases) * 100.0
    false_conf_pct = (false_confirmed / expected_non_confirmed_cases * 100.0) if expected_non_confirmed_cases > 0 else 0.0
    confirmed_recall_pct = ((expected_confirmed_cases - missed_confirmed) / expected_confirmed_cases * 100.0) if expected_confirmed_cases > 0 else 100.0
    rejection_rate_pct = (total_rejected_claims / total_candidates * 100.0) if total_candidates > 0 else 0.0
    acceptance_rate_pct = (total_accepted_claims / total_candidates * 100.0) if total_candidates > 0 else 0.0
    semantic_accuracy_pct = (semantic_stress_clean_count / semantic_stress_cases_count * 100.0) if semantic_stress_cases_count > 0 else 100.0

    sorted_latencies = sorted(case_latencies) if case_latencies else [0.0]
    p50_latency = sorted_latencies[len(sorted_latencies) // 2]
    p95_index = min(len(sorted_latencies) - 1, int(0.95 * len(sorted_latencies)))
    p95_latency = sorted_latencies[p95_index]
    avg_latency = total_latency_s / total_cases if total_cases > 0 else 0.0

    scorecard.add_row("Model & Timestamp", f"{model_name} @ {run_timestamp}", "Deterministic Model ID")
    scorecard.add_row("Total Evaluation Cases", f"{total_cases} Cases ({total_cases - provider_errors - validation_errors} SUCCESS, {provider_errors} PROVIDER_ERR, {validation_errors} VAL_ERR)", f"{total_cases} Cases")
    scorecard.add_row("Opportunity Verdict Accuracy", f"{opp_accuracy_pct:.1f}% ({opp_matches}/{total_cases})", "100.0%")
    scorecard.add_row("Recall: Confirmed Opening Recall", f"{confirmed_recall_pct:.1f}% ({expected_confirmed_cases - missed_confirmed}/{expected_confirmed_cases})", "100.0% (High Recall)")
    scorecard.add_row("Safety: False CONFIRMED Rate", f"{false_conf_pct:.1f}% ({false_confirmed}/{expected_non_confirmed_cases})", "0.0% (Hard Safety Invariant)")
    scorecard.add_row("Grounding: Provenance Leakage", str(grounding_failures), "Strictly 0 (Hard Invariant)")
    scorecard.add_row("Semantic: Entailment & Omission Accuracy", f"{semantic_accuracy_pct:.1f}% ({semantic_stress_clean_count}/{semantic_stress_cases_count})", "100.0% (Zero Hallucination / Contamination)")
    scorecard.add_row("Grounding: Candidate Rejection Rate", f"{total_rejected_claims}/{total_candidates} ({rejection_rate_pct:.1f}%)", "Filters ungrounded")
    scorecard.add_row("Grounding: Accepted Claim Rate (Diagnostic)", f"{total_accepted_claims}/{total_candidates} ({acceptance_rate_pct:.1f}%)", "Diagnostic Yield")
    scorecard.add_row("Usefulness: Total Grounded Claims Accepted", str(total_accepted_claims), "High useful yield")
    
    # Format categories according to ClaimCategory domain enum
    cat_order = ["OVERVIEW", "PRODUCT", "HIRING", "TECH_STACK", "CUSTOMER", "TRACTION", "MISSION", "CONTACT"]
    cat_summary = ", ".join(f"{k}: {claims_by_category.get(k, 0)}" for k in cat_order if claims_by_category.get(k, 0) > 0)
    if not cat_summary:
        cat_summary = "None"
    scorecard.add_row("Usefulness: Claims by Category", cat_summary, "Balanced distribution across domain taxonomy")
    scorecard.add_row("Performance: Latency (Avg / p50 / p95)", f"{avg_latency:.2f}s / {p50_latency:.2f}s / {p95_latency:.2f}s", "< 10.0s")
    scorecard.add_row("Performance: Total Token Consumption", str(total_tokens_consumed), "-")

    console.print()
    console.print(scorecard)

    return {
        "provider": provider_label,
        "model": model_name,
        "run_timestamp": run_timestamp,
        "total_cases": total_cases,
        "opp_matches": opp_matches,
        "accuracy_pct": opp_accuracy_pct,
        "false_confirmed_rate": false_conf_pct,
        "false_confirmed_count": false_confirmed,
        "expected_non_confirmed_cases": expected_non_confirmed_cases,
        "confirmed_recall_pct": confirmed_recall_pct,
        "missed_confirmed": missed_confirmed,
        "expected_confirmed_cases": expected_confirmed_cases,
        "grounding_failures": grounding_failures,
        "semantic_stress_cases_count": semantic_stress_cases_count,
        "semantic_stress_clean_count": semantic_stress_clean_count,
        "semantic_accuracy_pct": semantic_accuracy_pct,
        "total_claims": total_accepted_claims,
        "rejected_claims": total_rejected_claims,
        "acceptance_rate_pct": acceptance_rate_pct,
        "claims_by_category": claims_by_category,
        "avg_latency_s": avg_latency,
        "p50_latency_s": p50_latency,
        "p95_latency_s": p95_latency,
        "total_tokens": total_tokens_consumed,
        "case_details": case_details,
    }


def print_comparative_summary(results: List[Dict[str, Any]]):
    if len(results) < 2:
        return

    # 1. Executive Summary Table
    comp_table = Table(title="Cross-Provider Comparative Benchmark Matrix", expand=True, show_lines=True)
    comp_table.add_column("Evaluation Dimension", style="cyan", width=28)
    for r in results:
        comp_table.add_column(f"{r['provider']}\n[dim]({r['model']})[/dim]", style="bold", justify="right")

    comp_table.add_row(
        "Opportunity Verdict Accuracy",
        *[f"{r['accuracy_pct']:.1f}% ({r.get('opp_matches', r['total_cases'] - r.get('missed_confirmed', 0))}/{r['total_cases']})" for r in results]
    )
    comp_table.add_row(
        "Recall: Confirmed Opening Recall",
        *[f"{r['confirmed_recall_pct']:.1f}% ({r['expected_confirmed_cases'] - r['missed_confirmed']}/{r['expected_confirmed_cases']})" for r in results]
    )
    comp_table.add_row(
        "Safety: False CONFIRMED Rate",
        *[f"{r['false_confirmed_rate']:.1f}% ({r['false_confirmed_count']}/{r['expected_non_confirmed_cases']})" for r in results]
    )
    comp_table.add_row(
        "Grounding: Provenance Leakage",
        *[str(r["grounding_failures"]) for r in results]
    )
    comp_table.add_row(
        "Semantic: Entailment & Omission Accuracy",
        *[f"{r['semantic_accuracy_pct']:.1f}% ({r['semantic_stress_clean_count']}/{r['semantic_stress_cases_count']})" if r.get("semantic_stress_cases_count", 0) > 0 else "N/A" for r in results]
    )
    comp_table.add_row(
        "Total Accepted Claims",
        *[str(r["total_claims"]) for r in results]
    )
    comp_table.add_row(
        "Rejected Candidate Claims",
        *[str(r["rejected_claims"]) for r in results]
    )
    comp_table.add_row(
        "Accepted Claim Rate (Diagnostic)",
        *[f"{r['acceptance_rate_pct']:.1f}%" for r in results]
    )
    comp_table.add_row(
        "Latency: Avg / p50 / p95",
        *[f"{r['avg_latency_s']:.2f}s / {r['p50_latency_s']:.2f}s / {r['p95_latency_s']:.2f}s" for r in results]
    )
    comp_table.add_row(
        "Total Tokens Consumed",
        *[str(r["total_tokens"]) for r in results]
    )

    console.print("\n")
    console.print(comp_table)

    # 2. Side-by-Side Per-Case Diff Table
    diff_table = Table(title="Per-Case Model Comparison (Gemini vs Mistral)", expand=True, show_lines=True)
    diff_table.add_column("Case ID", style="cyan", width=24)
    diff_table.add_column("Expected Opp", style="bold", width=12)
    for r in results:
        diff_table.add_column(f"{r['provider']}\nOpp | Acc / Rej | Sem", justify="center")

    all_case_ids = [c.case_id for c in EVALUATION_DATASET]
    for cid in all_case_ids:
        exp_opp = results[0]["case_details"].get(cid, {}).get("expected_opp", "-")
        prov_cols = []
        for r in results:
            cd = r["case_details"].get(cid, {})
            actual_opp = cd.get("actual_opp", "-")
            acc = cd.get("accepted_claims", 0)
            rej = cd.get("rejected_claims", 0)
            status = cd.get("exec_status", "SUCCESS")
            if status != "SUCCESS":
                prov_cols.append(f"[bold red]{status}[/bold red]")
            else:
                match_color = "green" if cd.get("is_match") else "red"
                sem_audit = cd.get("semantic_audit", {})
                if sem_audit.get("has_rules"):
                    sem_str = " | [green]PASS[/green]" if sem_audit.get("passed") else " | [red]FAIL[/red]"
                else:
                    sem_str = ""
                prov_cols.append(f"[{match_color}]{actual_opp}[/{match_color}] | [green]{acc}[/green] / [red]{rej}[/red]{sem_str}")

        diff_table.add_row(cid, exp_opp, *prov_cols)

    console.print("\n")
    console.print(diff_table)


def main():
    gemini_key = os.environ.get("GEMINI_API_KEY")
    mistral_key = os.environ.get("MISTRAL_API_KEY")

    if not gemini_key and not mistral_key:
        console.print("[red]Error: Neither GEMINI_API_KEY nor MISTRAL_API_KEY is set in environment.[/red]")
        console.print("[yellow]Set at least one API key to run LLM benchmark evaluation.[/yellow]")
        sys.exit(1)

    results = []
    if gemini_key:
        synth = GeminiLLMSynthesizer(api_key=gemini_key, model="gemini-3.5-flash-lite")
        res = run_benchmark_evaluation(synth, "Google Gemini")
        results.append(res)

    if mistral_key:
        synth = MistralLLMSynthesizer(api_key=mistral_key, model=os.environ.get("MISTRAL_MODEL"))
        res = run_benchmark_evaluation(synth, "Mistral AI")
        results.append(res)

    if len(results) >= 2:
        print_comparative_summary(results)

if __name__ == "__main__":
    main()

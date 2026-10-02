"""
benchmark_identity_geographic_holdout.py — 30-Case Geographic & Multilingual Live Identity Benchmark

Evaluates the frozen Identity Resolution layer (v1.2) against an independently frozen,
30-case geographic holdout corpus (dataset: identity-v1.3-geographic-holdout) spanning
African markets, EU multilingual ecosystems, multi-entity collisions, and adversarial controls.

Methodological Dimensions:
  1. Geographic & Multilingual Stratification:
     - 9 African Real Entities (Kenya, Egypt, South Africa, Senegal, Rwanda, Uganda, Côte d'Ivoire, Morocco, Ghana)
     - 9 EU Real Entities (Netherlands, France, Germany, Estonia, Sweden, Spain, Denmark, Lithuania, Finland)
     - 6 Entity Collisions (Bare-name collisions across global tech/fintech markets)
     - 6 Adversarial Negatives (3 synthetic plausible names + 3 lookalike distributor/reseller variants)
     - Non-CONFIDENT Proportion: 12/30 (40.0%)
  2. Multi-Faceted Entity Provenance:
     Tracks country_association, legal_entity_country, headquarters_country, operating_country,
     and primary_language to model complex multinational operating structures.
  3. Decoupled Dual-Dimension Scoring:
     - Canonical Target Identification Rate vs. State Accuracy vs. CONFIDENT Recall
     - Zero Target Misidentifications & Zero False CONFIDENT Leaks as hard invariants.
  4. Regional & Language Slicing:
     Reports performance stratified by Region (Africa, EU, Collision, Negatives) and Language.

Usage:
  uv run python benchmark_identity_geographic_holdout.py --serper
  uv run python benchmark_identity_geographic_holdout.py --limit 5
  uv run python benchmark_identity_geographic_holdout.py --save-snapshot geo_holdout_run.json
"""

import sys
import os
import json
import time
from urllib.parse import urlparse
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

def load_env_file(filepath: str = ".env") -> None:
    """Lightweight .env loader that populates os.environ if file exists."""
    if not os.path.exists(filepath):
        return
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("'\"")
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception:
        pass

load_env_file()

from core.models import (
    CompanyIdentity, IdentityConfidence, IdentityContext,
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType,
)
from search.base import ISearchProvider, SearchProviderError
from search.serper import SerperSearchProvider
from search.duckduckgo import DuckDuckGoSearchProvider
from crawling.trafilatura_crawler import TrafilaturaCrawlerProvider
from crawling.playwright_crawler import PlaywrightCrawlerProvider
from crawling.manager import CrawlManager
from crawling.acquirer import FirstPartyAcquirer
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver

console = Console()


# ── 1. Independent Geographic Ground-Truth Schema & Corpus ───────────────────

@dataclass(frozen=True)
class GeographicIdentityCase:
    case_id: str
    query_name: str
    target_entity: str
    target_domain: Optional[str]
    expected_state: IdentityConfidence
    expected_relationship: SiteRelationship
    category: str  # AFRICA_REAL | EU_REAL | ENTITY_COLLISION | SYNTHETIC_NEGATIVE | ADVERSARIAL_THIRD_PARTY
    region: str    # AFRICA | EU | GLOBAL_COLLISION | NEGATIVE_CONTROL
    country_association: str
    legal_entity_country: Optional[str]
    headquarters_country: Optional[str]
    operating_country: Optional[str]
    primary_language: str
    provenance_type: str  # CORPORATE_REGISTRY | COMPANY_DIRECTORY | PUBLIC_ENTITY_RECORD | MULTI_ENTITY_REFERENCE | SYNTHETIC_NEGATIVE_CONTROL
    ground_truth_provenance: str
    ground_truth_verified_at: str
    rationale: str
    context: Optional[IdentityContext] = None


# Independent Frozen 30-Case Geographic Holdout Corpus
GEOGRAPHIC_HOLDOUT_CORPUS: List[GeographicIdentityCase] = [
    # ── Stratum 1: African Real Entities (9 Cases - Expected CONFIDENT) ──────────
    GeographicIdentityCase(
        case_id="geo_afr_mkopa_kenya",
        query_name="M-KOPA",
        target_entity="M-KOPA Kenya Limited / M-KOPA Holdings (Connected asset financing)",
        target_domain="m-kopa.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Kenya",
        legal_entity_country="United Kingdom",
        headquarters_country="Kenya",
        operating_country="Kenya",
        primary_language="English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="M-KOPA Kenya Privacy Notice & Corporate Disclosures (Nairobi HQ)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Multinational African asset financing platform. Canonical domain is m-kopa.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_afr_fawry_egypt",
        query_name="Fawry",
        target_entity="Fawry for Banking & Electronic Payment Technology Services S.A.E.",
        target_domain="fawry.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Egypt",
        legal_entity_country="Egypt",
        headquarters_country="Egypt",
        operating_country="Egypt",
        primary_language="Arabic",
        provenance_type="PUBLIC_ENTITY_RECORD",
        ground_truth_provenance="Egyptian Information Technology Industry Development Agency (ITIDA) & EGX: FWRY",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Egyptian electronic payments network. Canonical domain is fawry.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_afr_yoco_southafrica",
        query_name="Yoco",
        target_entity="Yoco Technologies (Pty) Ltd (South African merchant point-of-sale fintech)",
        target_domain="yoco.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="South Africa",
        legal_entity_country="South Africa",
        headquarters_country="South Africa",
        operating_country="South Africa",
        primary_language="English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Companies and Intellectual Property Commission (CIPC) & Yoco Merchant Agreement",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="South African SME payment gateway and POS hardware. Canonical domain is yoco.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_afr_wave_senegal",
        query_name="Wave Mobile Money",
        target_entity="Wave Digital Finance SA (UEMOA Licensed E-Money Institution in Senegal)",
        target_domain="wave.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Senegal",
        legal_entity_country="Senegal",
        headquarters_country="Senegal",
        operating_country="Senegal",
        primary_language="French",
        provenance_type="PUBLIC_ENTITY_RECORD",
        ground_truth_provenance="BCEAO E-Money Institution Registry / Wave Digital Finance SA Legal Terms",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Francophone West Africa mobile money institution. Canonical domain is wave.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_afr_kasha_rwanda",
        query_name="Kasha",
        target_entity="Kasha Global, Inc. / Kasha Rwanda Ltd (Health supply chain and e-commerce)",
        target_domain="kasha.co",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Rwanda",
        legal_entity_country="Rwanda",
        headquarters_country="Rwanda",
        operating_country="Rwanda",
        primary_language="English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Rwanda Development Board / Global Health Council Corporate Directory",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="East African healthcare access platform. Canonical domain is kasha.co.",
    ),
    GeographicIdentityCase(
        case_id="geo_afr_numida_uganda",
        query_name="Numida",
        target_entity="Numida Technologies Uganda Limited (Digital unsecured lending for micro-enterprises)",
        target_domain="numida.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Uganda",
        legal_entity_country="Uganda",
        headquarters_country="Uganda",
        operating_country="Uganda",
        primary_language="English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Uganda Registration Services Bureau (URSB) / Y Combinator (W22)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Ugandan fintech SME credit platform. Canonical domain is numida.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_afr_julaya_ivorycoast",
        query_name="Julaya",
        target_entity="Julaya SAS (B2B payment platform for West African businesses)",
        target_domain="julaya.co",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Côte d’Ivoire",
        legal_entity_country="France",
        headquarters_country="Côte d’Ivoire",
        operating_country="Côte d’Ivoire",
        primary_language="French",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Abidjan Commercial Court Registry / Official About & Legal Terms",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Francophone West Africa B2B fintech platform. Canonical domain is julaya.co.",
    ),
    GeographicIdentityCase(
        case_id="geo_afr_chari_morocco",
        query_name="Chari",
        target_entity="Chari.ma (B2B e-commerce and retail fintech licensed by Bank Al-Maghrib)",
        target_domain="chari.ma",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Morocco",
        legal_entity_country="Morocco",
        headquarters_country="Morocco",
        operating_country="Morocco",
        primary_language="French",
        provenance_type="PUBLIC_ENTITY_RECORD",
        ground_truth_provenance="Bank Al-Maghrib Payment Institution Registry & Casablanca Commercial Registry",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Moroccan B2B retail distribution platform using .ma ccTLD. Canonical domain is chari.ma.",
    ),
    GeographicIdentityCase(
        case_id="geo_afr_mpharma_ghana",
        query_name="mPharma",
        target_entity="mPharma Data Technologies Limited (Ghana-headquartered healthcare tech infrastructure)",
        target_domain="mpharma.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Ghana",
        legal_entity_country="Ghana",
        headquarters_country="Ghana",
        operating_country="Ghana",
        primary_language="English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Registrar General's Department Ghana / Official Press & Corporate Records",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Ghanaian health supply chain network. Canonical domain is mpharma.com.",
    ),

    # ── Stratum 2: EU Real Entities (9 Cases - Expected CONFIDENT) ───────────────
    GeographicIdentityCase(
        case_id="geo_eu_adyen_netherlands",
        query_name="Adyen",
        target_entity="Adyen N.V. (Global payments company licensed as Dutch credit institution)",
        target_domain="adyen.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Netherlands",
        legal_entity_country="Netherlands",
        headquarters_country="Netherlands",
        operating_country="Netherlands",
        primary_language="English",
        provenance_type="PUBLIC_ENTITY_RECORD",
        ground_truth_provenance="De Nederlandsche Bank (DNB) Financial Register (Relation F0001) / Euronext Amsterdam",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Dutch licensed bank and global payments engine. Canonical domain is adyen.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_eu_qonto_france",
        query_name="Qonto",
        target_entity="Olinda SAS (operating as Qonto, French regulated payment institution)",
        target_domain="qonto.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="France",
        legal_entity_country="France",
        headquarters_country="France",
        operating_country="France",
        primary_language="French",
        provenance_type="PUBLIC_ENTITY_RECORD",
        ground_truth_provenance="Banque de France / ACPR Regulated Institution Register (Code 16958)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="French SME financial management platform with French primary DOM. Canonical domain is qonto.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_eu_personio_germany",
        query_name="Personio",
        target_entity="Personio SE & Co. KG (German HR software provider for SMEs)",
        target_domain="personio.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Germany",
        legal_entity_country="Germany",
        headquarters_country="Germany",
        operating_country="Germany",
        primary_language="German",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Handelsregister München (HRA 114562) & Statutory Impressum",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="German HR tech platform with German statutory legal notices. Canonical domain is personio.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_eu_pipedrive_estonia",
        query_name="Pipedrive",
        target_entity="Pipedrive OÜ (Estonian sales CRM and pipeline management software)",
        target_domain="pipedrive.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Estonia",
        legal_entity_country="Estonia",
        headquarters_country="Estonia",
        operating_country="Estonia",
        primary_language="English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Estonian e-Business Register (Registry Code 11958888)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Estonian SaaS CRM unicorn. Canonical domain is pipedrive.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_eu_fortnox_sweden",
        query_name="Fortnox",
        target_entity="Fortnox AB (Swedish cloud-based accounting and business platform)",
        target_domain="fortnox.se",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Sweden",
        legal_entity_country="Sweden",
        headquarters_country="Sweden",
        operating_country="Sweden",
        primary_language="Swedish",
        provenance_type="PUBLIC_ENTITY_RECORD",
        ground_truth_provenance="Bolagsverket (Swedish Companies Registration Office) & Nasdaq Stockholm",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Swedish accounting software with Swedish-language primary site on .se ccTLD. Canonical domain is fortnox.se.",
    ),
    GeographicIdentityCase(
        case_id="geo_eu_factorial_spain",
        query_name="Factorial",
        target_entity="Factorial HR / Factorial Technologies SL (Spanish all-in-one HR software)",
        target_domain="factorialhr.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Spain",
        legal_entity_country="Spain",
        headquarters_country="Spain",
        operating_country="Spain",
        primary_language="Spanish",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Registro Mercantil de Barcelona & Factorial Legal Notice (Aviso Legal)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Spanish HR software utilizing brand-divergent domain factorialhr.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_eu_pleo_denmark",
        query_name="Pleo",
        target_entity="Pleo Financial Services A/S (Danish business spending and smart corporate card platform)",
        target_domain="pleo.io",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Denmark",
        legal_entity_country="Denmark",
        headquarters_country="Denmark",
        operating_country="Denmark",
        primary_language="English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Danish Central Business Register (CVR 36538686) & Danish FSA Register",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Danish business expense management platform. Canonical domain is pleo.io.",
    ),
    GeographicIdentityCase(
        case_id="geo_eu_vinted_lithuania",
        query_name="Vinted",
        target_entity="Vinted, UAB (Lithuanian online consumer-to-consumer marketplace for second-hand fashion)",
        target_domain="vinted.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Lithuania",
        legal_entity_country="Lithuania",
        headquarters_country="Lithuania",
        operating_country="Lithuania",
        primary_language="English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="State Enterprise Centre of Registers Lithuania (Registrų centras) & Vinted HQ Vilnius",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Lithuanian global marketplace unicorn. Canonical domain is vinted.com.",
    ),
    GeographicIdentityCase(
        case_id="geo_eu_supercell_finland",
        query_name="Supercell",
        target_entity="Supercell Oy (Finnish mobile game development studio headquartered in Helsinki)",
        target_domain="supercell.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Finland",
        legal_entity_country="Finland",
        headquarters_country="Finland",
        operating_country="Finland",
        primary_language="English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Finnish Patent and Registration Office (PRH Business ID 2336509-6)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Finnish gaming studio. Canonical domain is supercell.com.",
    ),

    # ── Stratum 3: Entity Collisions (6 Cases - Expected AMBIGUOUS) ──────────────
    GeographicIdentityCase(
        case_id="geo_col_linear_bare_name",
        query_name="Linear",
        target_entity="Disambiguation Conflict: Linear App (linear.app) vs Linear Capital (linear.vc) vs Linear Technology",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        region="GLOBAL_COLLISION",
        country_association="Global",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation: Project management tool (linear.app) vs Venture fund (linear.vc)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Bare name 'Linear' surfaces multiple prominent independent entities.",
    ),
    GeographicIdentityCase(
        case_id="geo_col_mercury_bare_name",
        query_name="Mercury",
        target_entity="Disambiguation Conflict: Mercury Technologies (mercury.com) vs Mercury Marine vs Mercury Insurance",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        region="GLOBAL_COLLISION",
        country_association="Global",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation: Banking fintech (mercury.com) vs Marine engine manufacturer vs Insurer",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Bare name 'Mercury' surfaces fintech banking, marine propulsion, and insurance companies.",
    ),
    GeographicIdentityCase(
        case_id="geo_col_atlas_bare_name",
        query_name="Atlas",
        target_entity="Disambiguation Conflict: Atlas Cloud Services vs Atlas Corp vs Atlassian Corporation",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        region="GLOBAL_COLLISION",
        country_association="Global",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation: Multi-industry global collision across infrastructure and finance",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Bare name 'Atlas' has no single canonical owner without contextual disambiguation.",
    ),
    GeographicIdentityCase(
        case_id="geo_col_bolt_bare_name",
        query_name="Bolt",
        target_entity="Disambiguation Conflict: Bolt Technology OÜ (Estonian mobility, bolt.eu) vs Bolt Financial Inc (US checkout, bolt.com)",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        region="GLOBAL_COLLISION",
        country_association="Global",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation: Major European mobility platform (bolt.eu) vs US one-click checkout unicorn (bolt.com)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Bare name 'Bolt' surfaces two multi-billion dollar tech companies with active primary domains.",
    ),
    GeographicIdentityCase(
        case_id="geo_col_lydia_bare_name",
        query_name="Lydia",
        target_entity="Disambiguation Conflict: Lydia Solutions SAS (French P2P payments, lydia-app.com) vs Lydia AI (Healthcare, lydia.ai)",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        region="GLOBAL_COLLISION",
        country_association="Global",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation: French consumer payment leader (lydia-app.com) vs AI health risk platform (lydia.ai)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Bare name 'Lydia' represents independent tech entities in Europe and North America.",
    ),
    GeographicIdentityCase(
        case_id="geo_col_kora_bare_name",
        query_name="Kora",
        target_entity="Disambiguation Conflict: Kora Payments (African cross-border payment infra, korapay.com) vs Kora Organics vs Kora Sustainability (kora.app)",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ENTITY_COLLISION",
        region="GLOBAL_COLLISION",
        country_association="Global",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="MULTI_ENTITY_REFERENCE",
        ground_truth_provenance="Public Disambiguation: Pan-African payment infrastructure (korapay.com) vs climate reward app (kora.app)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Bare name 'Kora' surfaces payment, sustainability, and consumer products with competing web footprints.",
    ),

    # ── Stratum 4: Adversarial Negatives (6 Cases - Expected UNRESOLVED) ─────────
    GeographicIdentityCase(
        case_id="geo_neg_kelmond_robotics_fictitious",
        query_name="Kelmond Global Robotics Innovations Ltd",
        target_entity="Non-existent synthetic company control",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="SYNTHETIC_NEGATIVE",
        region="NEGATIVE_CONTROL",
        country_association="N/A",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Fictitious Entity)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Non-existent company name; verifier must safely abstain without hallucinating primary.",
    ),
    GeographicIdentityCase(
        case_id="geo_neg_manom_cloud_fictitious",
        query_name="Manom Enterprise Cloud Systems",
        target_entity="Non-existent synthetic company control",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="SYNTHETIC_NEGATIVE",
        region="NEGATIVE_CONTROL",
        country_association="N/A",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Fictitious Entity)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Non-existent entity; verifier must not promote partial directory matches.",
    ),
    GeographicIdentityCase(
        case_id="geo_neg_outray_microfinance",
        query_name="Outray Microfinance Tech",
        target_entity="Non-existent synthetic company control",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="SYNTHETIC_NEGATIVE",
        region="NEGATIVE_CONTROL",
        country_association="N/A",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Fictitious Entity)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Fictitious brand; verifier must reject partial search matches.",
    ),
    GeographicIdentityCase(
        case_id="geo_neg_acme_manufacturing_generic",
        query_name="Acme General Manufacturing Group",
        target_entity="Hyper-generic archetype control",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ADVERSARIAL_THIRD_PARTY",
        region="NEGATIVE_CONTROL",
        country_association="N/A",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Generic Archetype)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Generic shape-risk archetype with no single canonical primary owner.",
    ),
    GeographicIdentityCase(
        case_id="geo_neg_linear_distributor_hub",
        query_name="Linear Distributor Solutions Hub",
        target_entity="Adversarial distributor / reseller name variant",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ADVERSARIAL_THIRD_PARTY",
        region="NEGATIVE_CONTROL",
        country_association="N/A",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Third-Party Partner Lookalike)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Third-party reseller or distributor naming must not be promoted to PRIMARY.",
    ),
    GeographicIdentityCase(
        case_id="geo_neg_adyen_partner_reseller",
        query_name="Adyen Partner Reseller Gateway",
        target_entity="Adversarial reseller / integrator lookalike control",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="ADVERSARIAL_THIRD_PARTY",
        region="NEGATIVE_CONTROL",
        country_association="N/A",
        legal_entity_country=None,
        headquarters_country=None,
        operating_country=None,
        primary_language="English",
        provenance_type="SYNTHETIC_NEGATIVE_CONTROL",
        ground_truth_provenance="Synthetic Control Catalog (Affiliate Gateway Lookalike)",
        ground_truth_verified_at="2026-09-29T18:00:00Z",
        rationale="Third-party payment integrator/affiliate must not be promoted as canonical Adyen.",
    ),
]


# ── 2. Live Geographic Telemetry & Attribution Structures ────────────────────

@dataclass
class GeographicStageTelemetry:
    case_id: str
    query_name: str
    target_entity: str
    target_domain: Optional[str]
    expected_state: str
    region: str
    country_association: str
    primary_language: str
    
    # Resolver Outputs
    actual_confidence: str = "UNRESOLVED"
    actual_domain: Optional[str] = None
    actual_relationship: str = "UNKNOWN"
    
    # Dual-Dimension Evaluation
    is_state_match: bool = False
    is_domain_match: bool = False
    is_target_misidentified: bool = False
    is_false_confident: bool = False
    
    # Stage-by-Stage Diagnostics
    search_query: str = ""
    search_results_count: int = 0
    candidate_domains: List[str] = field(default_factory=list)
    search_attribution: str = "PENDING"
    
    corroboration_signals: List[str] = field(default_factory=list)
    primary_candidate_count: int = 0
    related_candidate_count: int = 0
    unknown_candidate_count: int = 0
    
    final_stage_attribution: str = "UNSPECIFIED"
    resolver_elapsed_ms: float = 0.0
    error_message: Optional[str] = None


# ── 3. Instrumented Geographic Runner ─────────────────────────────────────────

class InstrumentedGeographicIdentityRunner:
    def __init__(
        self,
        search_provider: ISearchProvider,
        crawl_manager: CrawlManager,
        inter_case_delay: float = 1.0,
    ):
        self.search_provider = search_provider
        self.crawl_manager = crawl_manager
        self.inter_case_delay = inter_case_delay
        self.acquirer = FirstPartyAcquirer(crawl_manager, search_provider)
        self.verifier = WebsiteVerifier(search_provider)
        self.resolver = IdentityResolver(search_provider, self.verifier, acquirer=self.acquirer)

    def evaluate_case(self, case: GeographicIdentityCase) -> GeographicStageTelemetry:
        t = GeographicStageTelemetry(
            case_id=case.case_id,
            query_name=case.query_name,
            target_entity=case.target_entity,
            target_domain=case.target_domain,
            expected_state=case.expected_state.value,
            region=case.region,
            country_association=case.country_association,
            primary_language=case.primary_language,
        )

        start_time = time.perf_counter()
        query = f'"{case.query_name}" official site OR homepage'
        t.search_query = query

        try:
            # 1. Search Stage Analysis
            search_results = self.search_provider.search(query, num_results=5)
            t.search_results_count = len(search_results)
            t.candidate_domains = [urlparse(r.url).netloc.lower() for r in search_results if r.url]

            if not search_results:
                t.search_attribution = "NO_SEARCH_RESULTS"
            elif case.target_domain and not any(case.target_domain in d for d in t.candidate_domains):
                t.search_attribution = "TARGET_DOMAIN_NOT_IN_SEARCH"
            else:
                t.search_attribution = "SEARCH_SUCCESS"

            # 2. Execute Full Identity Resolution
            resolved_identity = self.resolver.resolve(case.query_name, case.context)
            t.resolver_elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            # 3. Harvest Verification Telemetry
            t.actual_confidence = resolved_identity.confidence.value
            t.actual_domain = resolved_identity.domain if resolved_identity.domain else None
            
            chosen_cand = next((c for c in resolved_identity.candidates if c.domain == resolved_identity.domain), None)
            t.actual_relationship = chosen_cand.relationship.value if (chosen_cand and chosen_cand.relationship) else "UNKNOWN"

            signals: List[str] = []
            for cand in resolved_identity.candidates:
                for ev in cand.evidence:
                    if ev.signal:
                        signals.append(f"{cand.domain}:{ev.signal}")
            t.corroboration_signals = signals

            for cand in resolved_identity.candidates:
                if cand.relationship == SiteRelationship.PRIMARY:
                    t.primary_candidate_count += 1
                elif cand.relationship == SiteRelationship.RELATED:
                    t.related_candidate_count += 1
                else:
                    t.unknown_candidate_count += 1

            # 4. Orthogonal Dual-Dimension Evaluation
            # A. State Match
            t.is_state_match = (resolved_identity.confidence == case.expected_state)

            # B. Domain / Entity Match
            if case.target_domain is not None:
                t.is_domain_match = (resolved_identity.domain == case.target_domain)
            else:
                t.is_domain_match = True

            # C. Safety Boundary Checks
            if resolved_identity.confidence == IdentityConfidence.CONFIDENT:
                if case.expected_state != IdentityConfidence.CONFIDENT:
                    t.is_false_confident = True
                elif case.target_domain and resolved_identity.domain != case.target_domain:
                    t.is_target_misidentified = True

            # 5. Granular Stage Attribution Classification
            if t.is_false_confident:
                t.final_stage_attribution = "FAIL_FALSE_CONFIDENT_LEAK"
            elif t.is_target_misidentified:
                t.final_stage_attribution = "FAIL_TARGET_MISIDENTIFICATION"
            elif t.is_state_match:
                if resolved_identity.confidence == IdentityConfidence.CONFIDENT:
                    t.final_stage_attribution = "RESOLVED_TARGET_CONFIDENT"
                elif resolved_identity.confidence == IdentityConfidence.AMBIGUOUS:
                    t.final_stage_attribution = "RESOLVED_AMBIGUOUS_SAFETY"
                else:
                    t.final_stage_attribution = "RESOLVED_UNRESOLVED_SAFETY"
            else:
                # Classify Failure Stage for Unresolved / Misclassified Cases
                if case.target_domain and t.search_attribution == "TARGET_DOMAIN_NOT_IN_SEARCH":
                    t.final_stage_attribution = "FAIL_SEARCH_DROPOFF"
                elif case.target_domain and t.search_attribution == "NO_SEARCH_RESULTS":
                    t.final_stage_attribution = "FAIL_NO_SEARCH_RESULTS"
                elif t.primary_candidate_count == 0:
                    has_hp_self_id = any(
                        ("SELF_IDENTITY_STATEMENT" in sig or "TITLE_ENTITY_MATCH" in sig)
                        for sig in t.corroboration_signals
                    )
                    if has_hp_self_id:
                        t.final_stage_attribution = "FAIL_SECONDARY_CORROBORATION"
                    else:
                        t.final_stage_attribution = "FAIL_HOMEPAGE_ACQUISITION"
                elif t.primary_candidate_count > 1 and case.expected_state == IdentityConfidence.CONFIDENT:
                    t.final_stage_attribution = "FAIL_UNEXPECTED_COLLISION"
                else:
                    t.final_stage_attribution = "FAIL_STATE_MISMATCH"

        except Exception as exc:
            t.resolver_elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            t.error_message = str(exc)
            t.final_stage_attribution = "RUNTIME_EXCEPTION"

        return t


# ── 4. Benchmark Execution Engine ─────────────────────────────────────────────

def run_geographic_holdout_benchmark(
    cases: Optional[List[GeographicIdentityCase]] = None,
    use_serper: bool = True,
    delay: float = 1.0,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    suite = (cases or GEOGRAPHIC_HOLDOUT_CORPUS)
    if limit and limit > 0:
        suite = suite[:limit]

    console.print(f"[bold cyan]🚀 Initializing Geographic Holdout Live Benchmark ({len(suite)} Cases — identity-v1.3-geographic-holdout)...[/bold cyan]")

    if use_serper:
        if not os.environ.get("SERPER_API_KEY"):
            console.print("[yellow]⚠️ Warning: SERPER_API_KEY not set. Falling back to DuckDuckGo search.[/yellow]")
            search_provider = DuckDuckGoSearchProvider()
        else:
            search_provider = SerperSearchProvider()
    else:
        search_provider = DuckDuckGoSearchProvider()

    static_crawler = TrafilaturaCrawlerProvider()
    browser_crawler = PlaywrightCrawlerProvider()
    crawl_manager = CrawlManager(static_crawler, browser_crawler)

    runner = InstrumentedGeographicIdentityRunner(
        search_provider=search_provider,
        crawl_manager=crawl_manager,
        inter_case_delay=delay,
    )

    results: List[GeographicStageTelemetry] = []
    
    for idx, case in enumerate(suite, start=1):
        console.print(f"  [{idx}/{len(suite)}] [{case.region}] Live Probe: [bold]{case.query_name}[/bold] ({case.country_association}, {case.primary_language}) → Expected: {case.expected_state.value}...")
        res = runner.evaluate_case(case)
        results.append(res)
        
        status_color = "green" if (res.is_state_match and res.is_domain_match) else "red"
        console.print(f"      → Actual: [{status_color}]{res.actual_confidence}[/{status_color}] (Domain: {res.actual_domain or 'None'}) | Attribution: [dim]{res.final_stage_attribution}[/dim]")
        
        if delay > 0 and idx < len(suite):
            time.sleep(delay)

    # Multi-Dimensional Global & Sliced Metrics
    total = len(results)
    state_matches = sum(1 for r in results if r.is_state_match)
    
    expected_conf_cases = [r for r in results if r.expected_state == "CONFIDENT"]
    expected_non_conf_cases = [r for r in results if r.expected_state != "CONFIDENT"]
    cases_with_target_domain = [r for r in results if r.target_domain is not None]
    
    # 1. Canonical Target Identification Rate
    target_domain_matches = sum(1 for r in cases_with_target_domain if r.is_domain_match)
    canonical_target_id_rate_pct = (target_domain_matches / len(cases_with_target_domain) * 100.0) if cases_with_target_domain else 0.0
    
    # 2. State Accuracy
    state_acc_pct = (state_matches / total * 100.0) if total > 0 else 0.0
    
    # 3. CONFIDENT Recall
    correct_confident_count = sum(1 for r in expected_conf_cases if r.actual_confidence == "CONFIDENT" and r.is_domain_match)
    conf_recall_pct = (correct_confident_count / len(expected_conf_cases) * 100.0) if expected_conf_cases else 0.0

    # 4. Correct Confidence Given Target
    correct_conf_given_target = sum(1 for r in cases_with_target_domain if r.is_domain_match and r.is_state_match)
    correct_conf_given_target_pct = (correct_conf_given_target / target_domain_matches * 100.0) if target_domain_matches > 0 else 0.0
    
    # 5. Target Misidentifications
    target_misidentified_count = sum(1 for r in cases_with_target_domain if r.is_target_misidentified)
    target_misidentified_pct = (target_misidentified_count / len(cases_with_target_domain) * 100.0) if cases_with_target_domain else 0.0
    
    # 6. False CONFIDENT
    false_conf_count = sum(1 for r in expected_non_conf_cases if r.actual_confidence == "CONFIDENT")
    false_conf_rate_pct = (false_conf_count / len(expected_non_conf_cases) * 100.0) if expected_non_conf_cases else 0.0
    
    # 7. Non-CONFIDENT Safety
    correct_safety_count = sum(1 for r in expected_non_conf_cases if r.actual_confidence in {"AMBIGUOUS", "UNRESOLVED"})
    non_conf_safety_pct = (correct_safety_count / len(expected_non_conf_cases) * 100.0) if expected_non_conf_cases else 100.0
    
    avg_latency = sum(r.resolver_elapsed_ms for r in results) / total if total > 0 else 0.0

    # Region Slice Calculations
    regions = ["AFRICA", "EU", "GLOBAL_COLLISION", "NEGATIVE_CONTROL"]
    region_stats: Dict[str, Dict[str, Any]] = {}
    for reg in regions:
        reg_cases = [r for r in results if r.region == reg]
        reg_total = len(reg_cases)
        if reg_total == 0:
            continue
        reg_state_m = sum(1 for r in reg_cases if r.is_state_match)
        reg_targets = [r for r in reg_cases if r.target_domain is not None]
        reg_target_m = sum(1 for r in reg_targets if r.is_domain_match)
        reg_conf_expected = sum(1 for r in reg_cases if r.expected_state == "CONFIDENT")
        reg_conf_correct = sum(1 for r in reg_cases if r.expected_state == "CONFIDENT" and r.actual_confidence == "CONFIDENT" and r.is_domain_match)
        reg_false_conf = sum(1 for r in reg_cases if r.expected_state != "CONFIDENT" and r.actual_confidence == "CONFIDENT")
        
        region_stats[reg] = {
            "total_cases": reg_total,
            "state_accuracy_pct": (reg_state_m / reg_total * 100.0),
            "target_id_rate_pct": (reg_target_m / len(reg_targets) * 100.0) if reg_targets else 0.0,
            "confident_recall_pct": (reg_conf_correct / reg_conf_expected * 100.0) if reg_conf_expected else 0.0,
            "false_confident_count": reg_false_conf,
        }

    # Language Slice Calculations
    languages = sorted(list({r.primary_language for r in results}))
    language_stats: Dict[str, Dict[str, Any]] = {}
    for lang in languages:
        lang_cases = [r for r in results if r.primary_language == lang]
        lang_total = len(lang_cases)
        lang_state_m = sum(1 for r in lang_cases if r.is_state_match)
        lang_targets = [r for r in lang_cases if r.target_domain is not None]
        lang_target_m = sum(1 for r in lang_targets if r.is_domain_match)
        language_stats[lang] = {
            "total_cases": lang_total,
            "state_accuracy_pct": (lang_state_m / lang_total * 100.0),
            "target_id_rate_pct": (lang_target_m / len(lang_targets) * 100.0) if lang_targets else 0.0,
        }

    return {
        "benchmark_suite": "identity-v1.3-geographic-holdout",
        "resolver_version": "identity-v1.2 (frozen)",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "search_provider": search_provider.name,
        "total_cases": total,
        "expected_confident_count": len(expected_conf_cases),
        "expected_non_confident_count": len(expected_non_conf_cases),
        "cases_with_target_domain_count": len(cases_with_target_domain),
        "target_domain_matches": target_domain_matches,
        "canonical_target_id_rate_pct": canonical_target_id_rate_pct,
        "state_matches": state_matches,
        "state_accuracy_pct": state_acc_pct,
        "correct_confident_count": correct_confident_count,
        "confident_recall_pct": conf_recall_pct,
        "correct_conf_given_target": correct_conf_given_target,
        "correct_conf_given_target_pct": correct_conf_given_target_pct,
        "target_misidentified_count": target_misidentified_count,
        "target_misidentified_pct": target_misidentified_pct,
        "false_confident_count": false_conf_count,
        "false_confident_rate_pct": false_conf_rate_pct,
        "correct_safety_count": correct_safety_count,
        "non_confident_safety_pct": non_conf_safety_pct,
        "avg_resolver_latency_ms": avg_latency,
        "region_stats": region_stats,
        "language_stats": language_stats,
        "case_results": [asdict(r) for r in results],
    }


# ── 5. Rich Scorecard & Geographic Slicing Reporting ─────────────────────────

def print_geographic_holdout_scorecard(metrics: Dict[str, Any]):
    console.print("\n")
    console.print(Panel.fit(
        f"[bold cyan]Geographic Holdout Live Scorecard — {metrics['benchmark_suite']}[/bold cyan]\n"
        f"[dim]Resolver: {metrics['resolver_version']} | Provider: {metrics['search_provider']} | Cases: {metrics['total_cases']} (18 Confident / 12 Non-Confident)[/dim]",
        border_style="cyan"
    ))

    # Core Metric Table with Observed Result vs Acceptance Target vs Status
    t = Table(title="Global Multi-Dimensional Live Evaluation Metrics", expand=True, show_lines=True)
    t.add_column("Evaluation Metric / Dimension", style="cyan", width=34)
    t.add_column("Observed Result", justify="right", width=22)
    t.add_column("Acceptance Target", justify="center", width=20)
    t.add_column("Status", justify="center", width=16)

    target_id_status = "[green]PASS[/green]" if metrics["canonical_target_id_rate_pct"] >= 80.0 else "[yellow]BELOW TARGET[/yellow]"
    state_acc_status = "[green]PASS[/green]" if metrics["state_accuracy_pct"] >= 85.0 else "[yellow]BELOW TARGET[/yellow]"
    conf_rec_status = "[green]PASS[/green]" if metrics["confident_recall_pct"] >= 80.0 else "[yellow]BELOW TARGET[/yellow]"
    conf_given_target_status = "[green]PASS[/green]" if metrics["correct_conf_given_target_pct"] >= 90.0 else "[yellow]BELOW TARGET[/yellow]"
    misid_status = "[green]PASS[/green]" if metrics["target_misidentified_count"] == 0 else "[bold red]INVARIANT VIOLATION[/bold red]"
    false_conf_status = "[green]PASS[/green]" if metrics["false_confident_count"] == 0 else "[bold red]INVARIANT VIOLATION[/bold red]"
    safety_status = "[green]PASS[/green]" if metrics["non_confident_safety_pct"] == 100.0 else "[bold red]INVARIANT VIOLATION[/bold red]"

    t.add_row(
        "Canonical Target Identification Rate",
        f"{metrics['canonical_target_id_rate_pct']:.1f}% ({metrics['target_domain_matches']}/{metrics['cases_with_target_domain_count']})",
        ">= 80.0%",
        target_id_status,
    )
    t.add_row(
        "Identity State Accuracy",
        f"{metrics['state_accuracy_pct']:.1f}% ({metrics['state_matches']}/{metrics['total_cases']})",
        ">= 85.0%",
        state_acc_status,
    )
    t.add_row(
        "Live CONFIDENT Recall",
        f"{metrics['confident_recall_pct']:.1f}% ({metrics['correct_confident_count']}/{metrics['expected_confident_count']})",
        ">= 80.0%",
        conf_rec_status,
    )
    t.add_row(
        "Correct Confidence Given Target",
        f"{metrics['correct_conf_given_target_pct']:.1f}% ({metrics['correct_conf_given_target']}/{metrics['target_domain_matches']})",
        ">= 90.0%",
        conf_given_target_status,
    )
    t.add_row(
        "Target Misidentification Rate",
        f"{metrics['target_misidentified_pct']:.1f}% ({metrics['target_misidentified_count']}/{metrics['cases_with_target_domain_count']})",
        "0.0%",
        misid_status,
    )
    t.add_row(
        "Safety: False CONFIDENT Rate",
        f"{metrics['false_confident_rate_pct']:.1f}% ({metrics['false_confident_count']}/{metrics['expected_non_confident_count']})",
        "0.0% (Hard Invariant)",
        false_conf_status,
    )
    t.add_row(
        "Safety: Non-CONFIDENT Safety",
        f"{metrics['non_confident_safety_pct']:.1f}% ({metrics['correct_safety_count']}/{metrics['expected_non_confident_count']})",
        "100.0%",
        safety_status,
    )
    t.add_row(
        "Mean End-to-End Latency",
        f"{metrics['avg_resolver_latency_ms']:.1f} ms",
        "—",
        "[dim]TELEMETRY[/dim]",
    )

    console.print("\n")
    console.print(t)

    # Regional Breakdown Table
    reg_table = Table(title="Regional Geographic Stratification", expand=True, show_lines=True)
    reg_table.add_column("Region Stratum", style="bold cyan", width=22)
    reg_table.add_column("Total Cases", justify="center", width=12)
    reg_table.add_column("State Accuracy", justify="right", width=18)
    reg_table.add_column("Target ID Rate", justify="right", width=18)
    reg_table.add_column("CONFIDENT Recall", justify="right", width=18)
    reg_table.add_column("False CONFIDENT", justify="center", width=16)

    for reg, stats in metrics["region_stats"].items():
        fc_c = "green" if stats["false_confident_count"] == 0 else "bold red"
        reg_table.add_row(
            reg,
            str(stats["total_cases"]),
            f"{stats['state_accuracy_pct']:.1f}%",
            f"{stats['target_id_rate_pct']:.1f}%",
            f"{stats['confident_recall_pct']:.1f}%",
            f"[{fc_c}]{stats['false_confident_count']}[/{fc_c}]",
        )

    console.print("\n")
    console.print(reg_table)

    # Language Breakdown Table
    lang_table = Table(title="Primary Language Stratification", expand=True, show_lines=True)
    lang_table.add_column("Language", style="magenta", width=20)
    lang_table.add_column("Total Cases", justify="center", width=14)
    lang_table.add_column("State Accuracy", justify="right", width=20)
    lang_table.add_column("Target ID Rate", justify="right", width=20)

    for lang, stats in metrics["language_stats"].items():
        lang_table.add_row(
            lang,
            str(stats["total_cases"]),
            f"{stats['state_accuracy_pct']:.1f}%",
            f"{stats['target_id_rate_pct']:.1f}%",
        )

    console.print("\n")
    console.print(lang_table)

    # Stage Attribution Summary Table
    att_counts: Dict[str, int] = {}
    for r in metrics["case_results"]:
        st = r["final_stage_attribution"]
        att_counts[st] = att_counts.get(st, 0) + 1

    st_table = Table(title="Stage Attribution Breakdown", expand=True, show_lines=True)
    st_table.add_column("Stage Attribution Classification", style="cyan", width=36)
    st_table.add_column("Cases", justify="center", width=10)
    st_table.add_column("Interpretation", style="dim", width=42)

    for st, count in sorted(att_counts.items(), key=lambda x: x[1], reverse=True):
        color = "green" if "RESOLVED" in st else "red" if "FAIL" in st else "yellow"
        interp = (
            "Target domain verified and state confirmed" if st == "RESOLVED_TARGET_CONFIDENT"
            else "Collision or non-existent entity safely preserved" if "RESOLVED" in st
            else "Target entity missed in search results" if st == "FAIL_SEARCH_DROPOFF"
            else "Homepage WAF block, network timeout, or HTTP error" if st == "FAIL_HOMEPAGE_ACQUISITION"
            else "Secondary routes lacked self-ID evidence" if st == "FAIL_SECONDARY_CORROBORATION"
            else "Resolved a verified website, but WRONG target entity" if st == "FAIL_TARGET_MISIDENTIFICATION"
            else "Promoted non-existent entity to CONFIDENT" if st == "FAIL_FALSE_CONFIDENT_LEAK"
            else "Unexpected collision or state mismatch"
        )
        st_table.add_row(f"[{color}]{st}[/{color}]", str(count), interp)

    console.print("\n")
    console.print(st_table)

    # Per-Case Outcomes Table
    res_table = Table(title=f"Per-Case Geographic Outcomes ({metrics['total_cases']} Cases)", expand=True, show_lines=True)
    res_table.add_column("Query Name", style="bold", width=18)
    res_table.add_column("Region", style="dim", width=14)
    res_table.add_column("Country / Lang", style="dim", width=16)
    res_table.add_column("Expected", justify="center", width=10)
    res_table.add_column("Actual", justify="center", width=10)
    res_table.add_column("Target Domain", style="cyan", width=16)
    res_table.add_column("Actual Domain", style="magenta", width=16)
    res_table.add_column("Attribution Stage", style="dim", width=24)
    res_table.add_column("Match?", justify="center", width=8)

    for r in metrics["case_results"]:
        match_str = "[green]MATCH[/green]" if (r["is_state_match"] and r["is_domain_match"]) else "[bold red]FAIL[/bold red]"
        res_table.add_row(
            r["query_name"],
            r["region"],
            f"{r['country_association']} ({r['primary_language']})",
            r["expected_state"],
            f"[{'green' if r['is_state_match'] else 'red'}]{r['actual_confidence']}[/{'green' if r['is_state_match'] else 'red'}]",
            r["target_domain"] or "—",
            r["actual_domain"] or "—",
            r["final_stage_attribution"],
            match_str,
        )

    console.print("\n")
    console.print(res_table)


# ── 6. CLI Entrypoint ─────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Geographic Holdout Live Identity Benchmark")
    parser.add_argument("--serper", action="store_true", help="Use Serper live Google Search provider")
    parser.add_argument("--delay", type=float, default=1.0, help="Inter-case delay in seconds (default: 1.0s)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of test cases")
    parser.add_argument("--save-snapshot", type=str, default=None, help="Path to save full JSON evidence snapshot")
    args = parser.parse_args()

    metrics = run_geographic_holdout_benchmark(
        use_serper=args.serper,
        delay=args.delay,
        limit=args.limit,
    )

    print_geographic_holdout_scorecard(metrics)

    if args.save_snapshot:
        snapshot_path = args.save_snapshot
        with open(snapshot_path, "w", encoding="utf-8") as f:
            json.dump(metrics, f, indent=2)
        console.print(f"\n[green]💾 Geographic live evidence snapshot saved to: {snapshot_path}[/green]")

if __name__ == "__main__":
    main()

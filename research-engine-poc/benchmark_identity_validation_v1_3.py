"""
benchmark_identity_validation_v1.3.py — Fresh 34-Case Unseen Validation Live Benchmark (identity-v1.3)

Evaluates the frozen Identity Resolution layer (v1.3) against an independent, unseen 34-case
validation corpus (dataset: identity-v1.3-unseen-validation) across African fintech/tech,
EU multilingual SaaS/marketplaces, multi-entity collision archetypes, and adversarial controls.

Methodological Foundation:
  1. Strict Single-Valued Ground Truth:
     Every fixture defines one unambiguous expected state (CONFIDENT, AMBIGUOUS, or UNRESOLVED)
     and an explicit canonical target entity & domain with public registry provenance.
  2. Stratum Failure Stage Breakdown:
     Computes granular failure attribution (Search -> Homepage Acquisition -> Homepage Verification ->
     Secondary Discovery -> Secondary Corroboration -> Resolver Arbitration) across all four strata:
     Africa, EU, Collisions, and Negatives.
  3. Strict Artifact Immutability:
     - Raw execution output saved byte-for-byte to live_identity_v1.3_validation_snapshot.json
     - Derived analysis saved separately to live_identity_v1.3_validation_analysis.json
  4. Orthogonal Metric Scorecard:
     - Canonical Target Identification Rate
     - Identity State Accuracy
     - Live CONFIDENT Recall
     - Correct Confidence Given Target
     - Target Misidentification Rate (Hard Invariant: 0.0%)
     - False CONFIDENT Rate (Hard Invariant: 0.0%)
     - Non-CONFIDENT Safety (100.0%)

Usage:
  uv run python benchmark_identity_validation_v1.3.py --serper                  # Run with Serper live search
  uv run python benchmark_identity_validation_v1.3.py --limit 5                 # Run first 5 cases
  uv run python benchmark_identity_validation_v1.3.py --save-snapshot run.json  # Save live evidence snapshot
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
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver

console = Console()


# ── 1. Independent Validation Ground-Truth Schema & Corpus ───────────────────

@dataclass(frozen=True)
class ValidationIdentityCase:
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


VALIDATION_CORPUS: List[ValidationIdentityCase] = [
    # ── Stratum 1: African Real Entities (10 Cases - Expected CONFIDENT) ────────
    ValidationIdentityCase(
        case_id="val_afr_tymebank",
        query_name="TymeBank",
        target_entity="TymeBank Limited (South African digital retail bank / Commonwealth Bank spin-off)",
        target_domain="tymebank.co.za",
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
        ground_truth_provenance="Prudential Authority South Africa / CIPC / Crunchbase",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary presence is tymebank.co.za.",
    ),
    ValidationIdentityCase(
        case_id="val_afr_fairmoney",
        query_name="FairMoney",
        target_entity="FairMoney (Credit-led neobank and digital lending platform in Nigeria)",
        target_domain="fairmoney.io",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Nigeria",
        legal_entity_country="France",
        headquarters_country="Nigeria",
        operating_country="Nigeria / India",
        primary_language="English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Crunchbase / Y Combinator / Central Bank of Nigeria MFB Directory",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary presence is fairmoney.io.",
    ),
    ValidationIdentityCase(
        case_id="val_afr_cowrywise",
        query_name="Cowrywise",
        target_entity="Cowrywise Financial Technology Limited (SEC-licensed Nigerian digital investment and savings platform)",
        target_domain="cowrywise.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Nigeria",
        legal_entity_country="Nigeria",
        headquarters_country="Nigeria",
        operating_country="Nigeria",
        primary_language="English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="SEC Nigeria Fund Manager License / Y Combinator (S18)",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary presence is cowrywise.com.",
    ),
    ValidationIdentityCase(
        case_id="val_afr_wasoko",
        query_name="Wasoko",
        target_entity="Wasoko Inc (East African B2B retail supply chain and e-commerce platform, formerly Sokowatch)",
        target_domain="wasoko.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Kenya",
        legal_entity_country="United States",
        headquarters_country="Kenya",
        operating_country="Kenya / Tanzania / Rwanda / Uganda",
        primary_language="English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Crunchbase / Financial Times Fastest Growing Companies Africa",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary presence is wasoko.com.",
    ),
    ValidationIdentityCase(
        case_id="val_afr_maxab",
        query_name="MaxAB",
        target_entity="MaxAB (Egyptian B2B food and grocery e-commerce and retail logistics platform)",
        target_domain="maxab.io",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Egypt",
        legal_entity_country="Egypt",
        headquarters_country="Egypt",
        operating_country="Egypt / Morocco / Saudi Arabia",
        primary_language="Arabic / English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Crunchbase / Beco Capital Portfolio Registry",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary presence is maxab.io.",
    ),
    ValidationIdentityCase(
        case_id="val_afr_chargel",
        query_name="Chargel",
        target_entity="Chargel (Senegalese digital freight and logistics platform in Francophone West Africa)",
        target_domain="chargel.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Senegal",
        legal_entity_country="Senegal",
        headquarters_country="Senegal",
        operating_country="Senegal",
        primary_language="French",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Crunchbase / Seedstars Directory",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is chargel.com.",
    ),
    ValidationIdentityCase(
        case_id="val_afr_lami",
        query_name="Lami Technologies",
        target_entity="Lami Technologies Limited (Kenyan digital insurance-as-a-service API platform)",
        target_domain="lami.world",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Kenya",
        legal_entity_country="Kenya",
        headquarters_country="Kenya",
        operating_country="Kenya / Nigeria / Egypt",
        primary_language="English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Business Registration Service Kenya / Crunchbase",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary presence is lami.world.",
    ),
    ValidationIdentityCase(
        case_id="val_afr_djamo",
        query_name="Djamo",
        target_entity="Djamo (Ivorian personal finance and digital banking app in Francophone West Africa)",
        target_domain="djamo.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Ivory Coast",
        legal_entity_country="Ivory Coast",
        headquarters_country="Ivory Coast",
        operating_country="Ivory Coast / Senegal",
        primary_language="French",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Y Combinator Directory (W21) / Crunchbase",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary presence is djamo.com.",
    ),
    ValidationIdentityCase(
        case_id="val_afr_prospa",
        query_name="Prospa Business Banking",
        target_entity="Prospa Technology Limited (Nigerian operating system for micro-businesses and entrepreneurs)",
        target_domain="getprospa.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Nigeria",
        legal_entity_country="Nigeria",
        headquarters_country="Nigeria",
        operating_country="Nigeria",
        primary_language="English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Y Combinator Directory (W21) / Corporate Affairs Commission Nigeria",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary presence is getprospa.com.",
    ),
    ValidationIdentityCase(
        case_id="val_afr_zoona",
        query_name="Zoona",
        target_entity="Zoona Transacting Ltd (Zambian and South African mobile money remittance and agent network)",
        target_domain="zoona.co.za",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="AFRICA_REAL",
        region="AFRICA",
        country_association="Zambia / South Africa",
        legal_entity_country="South Africa",
        headquarters_country="South Africa",
        operating_country="Zambia / South Africa / Malawi",
        primary_language="English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="CIPC South Africa / Chipper Cash Acquisition Public Records",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary presence is zoona.co.za.",
    ),

    # ── Stratum 2: EU Real Entities (10 Cases - Expected CONFIDENT) ────────────
    ValidationIdentityCase(
        case_id="val_eu_bunq",
        query_name="Bunq",
        target_entity="bunq B.V. (Dutch digital neobank and European financial institution)",
        target_domain="bunq.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Netherlands",
        legal_entity_country="Netherlands",
        headquarters_country="Netherlands",
        operating_country="Pan-European",
        primary_language="English / Dutch",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="De Nederlandsche Bank (DNB) Banking License / KVK Trade Register",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is bunq.com.",
    ),
    ValidationIdentityCase(
        case_id="val_eu_pennylane",
        query_name="Pennylane",
        target_entity="Pennylane SAS (French financial management and accounting platform for SMEs)",
        target_domain="pennylane.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="France",
        legal_entity_country="France",
        headquarters_country="France",
        operating_country="France / EU",
        primary_language="French",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Infogreffe France / Sirene / Crunchbase",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is pennylane.com.",
    ),
    ValidationIdentityCase(
        case_id="val_eu_spendesk",
        query_name="Spendesk",
        target_entity="Spendesk SAS (French corporate spend management platform with smart payment cards)",
        target_domain="spendesk.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="France",
        legal_entity_country="France",
        headquarters_country="France",
        operating_country="Pan-European",
        primary_language="French / English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Infogreffe France / Sirene / Crunchbase",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is spendesk.com.",
    ),
    ValidationIdentityCase(
        case_id="val_eu_wefox",
        query_name="Wefox",
        target_entity="wefox Holding AG (German digital insurance company and insurance distribution platform)",
        target_domain="wefox.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Germany",
        legal_entity_country="Germany / Switzerland",
        headquarters_country="Germany",
        operating_country="Germany / Austria / Switzerland",
        primary_language="German / English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Handelsregister Berlin-Charlottenburg / Crunchbase",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is wefox.com.",
    ),
    ValidationIdentityCase(
        case_id="val_eu_taxfix",
        query_name="Taxfix",
        target_entity="Taxfix SE (German digital mobile tax filing and compliance platform)",
        target_domain="taxfix.de",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Germany",
        legal_entity_country="Germany",
        headquarters_country="Germany",
        operating_country="Germany / Italy / Spain / France",
        primary_language="German",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Handelsregister Berlin-Charlottenburg / Impressum",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is taxfix.de.",
    ),
    ValidationIdentityCase(
        case_id="val_eu_traderepublic",
        query_name="Trade Republic",
        target_entity="Trade Republic Bank GmbH (German neobroker and savings banking platform)",
        target_domain="traderepublic.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Germany",
        legal_entity_country="Germany",
        headquarters_country="Germany",
        operating_country="Pan-European",
        primary_language="German / English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="BaFin German Banking Directory / Handelsregister Berlin",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is traderepublic.com.",
    ),
    ValidationIdentityCase(
        case_id="val_eu_swile",
        query_name="Swile",
        target_entity="Swile SAS (French employee benefit, meal voucher, and corporate engagement card platform)",
        target_domain="swile.co",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="France",
        legal_entity_country="France",
        headquarters_country="France",
        operating_country="France / Brazil",
        primary_language="French",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Infogreffe Montpellier / Sirene / Crunchbase",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is swile.co.",
    ),
    ValidationIdentityCase(
        case_id="val_eu_docplanner",
        query_name="Docplanner",
        target_entity="Docplanner Tech S.L. / ZnanyLekarz Sp. z o.o. (European healthcare booking platform)",
        target_domain="docplanner.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Poland / Spain",
        legal_entity_country="Spain / Poland",
        headquarters_country="Poland",
        operating_country="Pan-European / Latin America",
        primary_language="Polish / Spanish / English",
        provenance_type="COMPANY_DIRECTORY",
        ground_truth_provenance="Crunchbase / Polish National Court Register (KRS)",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is docplanner.com.",
    ),
    ValidationIdentityCase(
        case_id="val_eu_bendingspoons",
        query_name="Bending Spoons",
        target_entity="Bending Spoons S.p.A. (Italian mobile application technology and software publisher)",
        target_domain="bendingspoons.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Italy",
        legal_entity_country="Italy",
        headquarters_country="Italy",
        operating_country="Global",
        primary_language="English / Italian",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="Registro delle Imprese Milano / Crunchbase",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is bendingspoons.com.",
    ),
    ValidationIdentityCase(
        case_id="val_eu_mambu",
        query_name="Mambu",
        target_entity="Mambu B.V. (Dutch SaaS cloud banking engine and platform)",
        target_domain="mambu.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="EU_REAL",
        region="EU",
        country_association="Netherlands",
        legal_entity_country="Netherlands",
        headquarters_country="Netherlands",
        operating_country="Global",
        primary_language="English",
        provenance_type="CORPORATE_REGISTRY",
        ground_truth_provenance="KVK Dutch Trade Register / Crunchbase",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Canonical primary domain is mambu.com.",
    ),

    # ── Stratum 3: Entity Collisions (7 Cases - Expected AMBIGUOUS) ─────────────
    ValidationIdentityCase(
        case_id="val_col_pillar",
        query_name="Pillar",
        target_entity="Disambiguation Conflict: Pillar Payments vs Pillar VC vs Pillar Wellbeing",
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
        ground_truth_provenance="Multi-industry collision across fintech, venture capital, and wellness",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Bare name 'Pillar' surfaces multiple active primary domains.",
    ),
    ValidationIdentityCase(
        case_id="val_col_beacon",
        query_name="Beacon",
        target_entity="Disambiguation Conflict: Beacon Supply Chain vs Beacon Digital vs Beacon Health",
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
        ground_truth_provenance="Multi-industry collision across logistics, healthcare, and software",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Bare name 'Beacon' surfaces multiple distinct corporate presences.",
    ),
    ValidationIdentityCase(
        case_id="val_col_monolith",
        query_name="Monolith",
        target_entity="Disambiguation Conflict: Monolith AI vs Monolith Crypto vs Monolith Materials",
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
        ground_truth_provenance="Multi-industry collision across engineering AI, crypto cards, and carbon materials",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Bare name 'Monolith' represents multiple technology entities.",
    ),
    ValidationIdentityCase(
        case_id="val_col_kite",
        query_name="Kite",
        target_entity="Disambiguation Conflict: Kite Zerodha vs Kite AI vs Kite Mobility",
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
        ground_truth_provenance="Multi-industry collision across brokerage trading, developer AI, and urban micro-mobility",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Bare name 'Kite' surfaces distinct primary tech products.",
    ),
    ValidationIdentityCase(
        case_id="val_col_verve",
        query_name="Verve",
        target_entity="Disambiguation Conflict: Verve Card Interswitch vs Verve Therapeutics vs Verve Coffee",
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
        ground_truth_provenance="Multi-industry collision across African card scheme, biotech, and consumer coffee",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Bare name 'Verve' surfaces multiple high-profile entities.",
    ),
    ValidationIdentityCase(
        case_id="val_col_crest",
        query_name="Crest",
        target_entity="Disambiguation Conflict: Crest Oral Care (P&G) vs Crest Data Systems vs Crest Financial",
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
        ground_truth_provenance="Multi-industry collision across consumer health, enterprise data integrations, and financial services",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Bare name 'Crest' surfaces distinct major brands.",
    ),
    ValidationIdentityCase(
        case_id="val_col_loom",
        query_name="Loom",
        target_entity="Disambiguation Conflict: Loom Video (Atlassian) vs Loom Network vs Loom Games",
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
        ground_truth_provenance="Multi-industry collision across async video software, blockchain network, and mobile games",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Bare name 'Loom' represents multiple prominent technology entities.",
    ),

    # ── Stratum 4: Adversarial Negatives (7 Cases - Expected UNRESOLVED) ────────
    ValidationIdentityCase(
        case_id="val_neg_dunder_mifflin",
        query_name="Dunder Mifflin Paper Company Inc",
        target_entity="Fictional paper company control (The Office)",
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
        ground_truth_provenance="Fictional / Pop Culture Negative Control Catalog",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Fictional company; resolver must safely abstain without promoting fan sites or merchandise stores.",
    ),
    ValidationIdentityCase(
        case_id="val_neg_stark_industries",
        query_name="Stark Industries Defense Technologies",
        target_entity="Fictional defense / technology conglomerate control",
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
        ground_truth_provenance="Fictional / Pop Culture Negative Control Catalog",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Fictional entity; verifier must not promote entertainment wikis or parody sites.",
    ),
    ValidationIdentityCase(
        case_id="val_neg_wayne_enterprises",
        query_name="Wayne Enterprises Global Holdings",
        target_entity="Fictional industrial enterprise control",
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
        ground_truth_provenance="Fictional / Pop Culture Negative Control Catalog",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Fictional entity; verifier must abstain without promoting fan domains.",
    ),
    ValidationIdentityCase(
        case_id="val_neg_initech_software",
        query_name="Initech Y2K Software Solutions LLC",
        target_entity="Fictional software company control (Office Space)",
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
        ground_truth_provenance="Fictional / Pop Culture Negative Control Catalog",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Fictional software company; must produce UNRESOLVED.",
    ),
    ValidationIdentityCase(
        case_id="val_neg_pied_piper",
        query_name="Pied Piper Decentralized Compression",
        target_entity="Fictional compression startup control (Silicon Valley)",
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
        ground_truth_provenance="Fictional / Pop Culture Negative Control Catalog",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Fictional startup; verifier must abstain.",
    ),
    ValidationIdentityCase(
        case_id="val_neg_acme_widget_logistics",
        query_name="Acme Widget Logistics Group International",
        target_entity="Hyper-generic synthetic combination control",
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
        ground_truth_provenance="Synthetic Generic Combination Catalog",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Non-existent entity with generic buzzwords; must return UNRESOLVED.",
    ),
    ValidationIdentityCase(
        case_id="val_neg_aperture_science",
        query_name="Aperture Science Innovations Portal Labs",
        target_entity="Fictional scientific research lab control (Portal)",
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
        ground_truth_provenance="Fictional / Video Game Control Catalog",
        ground_truth_verified_at="2026-09-30T09:00:00Z",
        rationale="Fictional research lab; verifier must abstain.",
    ),
]


# ── 2. Live Validation Execution Telemetry Schema ────────────────────────────

@dataclass
class ValidationStageTelemetry:
    case_id: str
    query_name: str
    target_entity: str
    target_domain: Optional[str]
    expected_state: str
    expected_relationship: str
    category: str
    region: str
    country_association: str
    primary_language: str
    provenance_type: str
    ground_truth_provenance: str
    ground_truth_verified_at: str
    actual_confidence: str = "UNRESOLVED"
    actual_domain: Optional[str] = None
    actual_relationship: Optional[str] = None
    is_state_match: bool = False
    is_domain_match: bool = False
    is_correct_confident: bool = False
    is_missed_conf_ambiguous: bool = False
    is_missed_id_unresolved: bool = False
    is_correct_ambiguous: bool = False
    is_correct_unresolved: bool = False
    is_false_confident: bool = False
    is_target_misidentified: bool = False
    search_attribution: str = "UNKNOWN"
    homepage_attribution: str = "UNKNOWN"
    secondary_attribution: str = "UNKNOWN"
    arbitration_attribution: str = "UNKNOWN"
    final_stage_attribution: str = "UNKNOWN"
    top_search_domains: List[str] = field(default_factory=list)
    top_search_snippets: List[Dict[str, str]] = field(default_factory=list)
    primary_candidate_count: int = 0
    candidate_domains: List[str] = field(default_factory=list)
    corroboration_signals: List[str] = field(default_factory=list)
    search_elapsed_ms: float = 0.0
    crawler_elapsed_ms: float = 0.0
    resolver_elapsed_ms: float = 0.0
    total_elapsed_ms: float = 0.0
    timestamp_utc: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    error_message: Optional[str] = None


# ── 3. Instrumented Live Validation Runner ───────────────────────────────────

class InstrumentedValidationRunner:
    def __init__(
        self,
        search_provider: ISearchProvider,
        crawl_manager: CrawlManager,
        inter_case_delay: float = 1.0,
    ):
        self.search_provider = search_provider
        self.crawl_manager = crawl_manager
        self.verifier = WebsiteVerifier(crawl_manager, search_provider)
        self.resolver = IdentityResolver(search_provider, self.verifier)
        self.inter_case_delay = inter_case_delay

    def evaluate_case(self, case: ValidationIdentityCase) -> ValidationStageTelemetry:
        t = ValidationStageTelemetry(
            case_id=case.case_id,
            query_name=case.query_name,
            target_entity=case.target_entity,
            target_domain=case.target_domain,
            expected_state=case.expected_state.value,
            expected_relationship=case.expected_relationship.value,
            category=case.category,
            region=case.region,
            country_association=case.country_association,
            primary_language=case.primary_language,
            provenance_type=case.provenance_type,
            ground_truth_provenance=case.ground_truth_provenance,
            ground_truth_verified_at=case.ground_truth_verified_at,
        )

        start_time = time.perf_counter()
        query = f'"{case.query_name}" official website'

        try:
            # 1. Search Acquisition Stage
            s_start = time.perf_counter()
            raw_results = self.search_provider.search(query, num_results=10)
            t.search_elapsed_ms = (time.perf_counter() - s_start) * 1000.0

            if not raw_results:
                t.search_attribution = "NO_SEARCH_RESULTS"
            else:
                for r in raw_results:
                    d = urlparse(r.url).netloc.replace("www.", "").lower()
                    if d:
                        t.top_search_domains.append(d)
                        t.top_search_snippets.append({"url": r.url, "title": r.title, "snippet": r.snippet})

                if case.target_domain:
                    norm_target = case.target_domain.replace("www.", "").lower()
                    if any(d == norm_target or d.endswith("." + norm_target) for d in t.top_search_domains):
                        t.search_attribution = "TARGET_DOMAIN_IN_SEARCH"
                    else:
                        t.search_attribution = "TARGET_DOMAIN_NOT_IN_SEARCH"
                else:
                    t.search_attribution = "NON_CONFIDENT_QUERY_SEARCH_OK"

            # 2. Identity Resolution & Verification Execution
            r_start = time.perf_counter()
            resolved_identity = self.resolver.resolve(case.query_name, context=case.context)
            t.resolver_elapsed_ms = (time.perf_counter() - r_start) * 1000.0
            t.total_elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            t.actual_confidence = resolved_identity.confidence.value
            t.actual_domain = resolved_identity.domain if resolved_identity.domain else None

            # Extract Candidates & Corroboration Signals
            primary_cands = [c for c in resolved_identity.candidates if c.is_verified]
            t.primary_candidate_count = len(primary_cands)
            t.candidate_domains = [c.domain for c in resolved_identity.candidates]

            chosen_cand = next((c for c in resolved_identity.candidates if c.domain == resolved_identity.domain), None)
            if chosen_cand:
                t.actual_relationship = chosen_cand.relationship.value if chosen_cand.relationship else "UNKNOWN"
                t.corroboration_signals = [e.signal for e in chosen_cand.evidence]
            elif resolved_identity.candidates:
                top_cand = resolved_identity.candidates[0]
                t.actual_relationship = top_cand.relationship.value if top_cand.relationship else "UNKNOWN"
                t.corroboration_signals = [e.signal for e in top_cand.evidence]

            # 3. Orthogonal Evaluation Metrics
            t.is_state_match = (resolved_identity.confidence == case.expected_state)

            if case.target_domain:
                norm_target = case.target_domain.replace("www.", "").lower()
                norm_actual = (resolved_identity.domain or "").replace("www.", "").lower()
                t.is_domain_match = (norm_target == norm_actual)
            else:
                t.is_domain_match = (resolved_identity.domain == "" or resolved_identity.domain is None)

            # Safety Invariants
            t.is_false_confident = (
                case.expected_state != IdentityConfidence.CONFIDENT
                and resolved_identity.confidence == IdentityConfidence.CONFIDENT
            )

            t.is_target_misidentified = (
                case.expected_state == IdentityConfidence.CONFIDENT
                and resolved_identity.confidence == IdentityConfidence.CONFIDENT
                and not t.is_domain_match
            )

            # Confusion Matrix
            t.is_correct_confident = (case.expected_state == IdentityConfidence.CONFIDENT and resolved_identity.confidence == IdentityConfidence.CONFIDENT and t.is_domain_match)
            t.is_missed_conf_ambiguous = (case.expected_state == IdentityConfidence.CONFIDENT and resolved_identity.confidence == IdentityConfidence.AMBIGUOUS)
            t.is_missed_id_unresolved = (case.expected_state == IdentityConfidence.CONFIDENT and resolved_identity.confidence == IdentityConfidence.UNRESOLVED)
            t.is_correct_ambiguous = (case.expected_state == IdentityConfidence.AMBIGUOUS and resolved_identity.confidence == IdentityConfidence.AMBIGUOUS)
            t.is_correct_unresolved = (case.expected_state == IdentityConfidence.UNRESOLVED and resolved_identity.confidence == IdentityConfidence.UNRESOLVED)

            # 4. Granular Stage Attribution Classification
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
                        ("SELF_IDENTITY_STATEMENT" in sig or sig == "TITLE_ENTITY_MATCH")
                        for sig in t.corroboration_signals
                    )
                    if has_hp_self_id:
                        t.final_stage_attribution = "FAIL_SECONDARY_CORROBORATION"
                    else:
                        t.final_stage_attribution = "FAIL_HOMEPAGE_ACQUISITION"
                elif t.primary_candidate_count == 1 and case.expected_state == IdentityConfidence.CONFIDENT and resolved_identity.confidence == IdentityConfidence.AMBIGUOUS:
                    t.final_stage_attribution = "FAIL_SHAPE_RISK_ARBITRATION"
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

def run_validation_identity_benchmark(
    cases: Optional[List[ValidationIdentityCase]] = None,
    use_serper: bool = True,
    delay: float = 1.0,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    suite = (cases or VALIDATION_CORPUS)
    if limit and limit > 0:
        suite = suite[:limit]

    console.print(f"[bold cyan]🚀 Initializing Fresh Unseen Validation Benchmark ({len(suite)} Strict Cases)...[/bold cyan]")

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

    runner = InstrumentedValidationRunner(
        search_provider=search_provider,
        crawl_manager=crawl_manager,
        inter_case_delay=delay,
    )

    results: List[ValidationStageTelemetry] = []

    for idx, case in enumerate(suite, start=1):
        console.print(f"  [{idx}/{len(suite)}] Live Probe: [bold]{case.query_name}[/bold] (Expected: {case.expected_state.value})...")
        res = runner.evaluate_case(case)
        results.append(res)

        status_color = "green" if (res.is_state_match and res.is_domain_match) else "red"
        console.print(f"      → Actual: [{status_color}]{res.actual_confidence}[/{status_color}] (Domain: {res.actual_domain or 'None'}) | Attribution: [dim]{res.final_stage_attribution}[/dim]")

        if delay > 0 and idx < len(suite):
            time.sleep(delay)

    # Calculate Multi-Dimensional Metrics
    total = len(results)
    state_matches = sum(1 for r in results if r.is_state_match)

    expected_conf_cases = [r for r in results if r.expected_state == "CONFIDENT"]
    expected_non_conf_cases = [r for r in results if r.expected_state != "CONFIDENT"]
    cases_with_target_domain = [r for r in results if r.target_domain is not None]

    # 1. Canonical Target Identification Rate
    target_domain_matches = sum(1 for r in cases_with_target_domain if r.is_domain_match)
    canonical_target_id_rate_pct = (target_domain_matches / len(cases_with_target_domain) * 100.0) if cases_with_target_domain else 0.0

    # 2. Identity State Accuracy
    state_accuracy_pct = (state_matches / total * 100.0) if total else 0.0

    # 3. Live CONFIDENT Recall
    correct_confident = sum(1 for r in expected_conf_cases if r.is_correct_confident)
    confident_recall_pct = (correct_confident / len(expected_conf_cases) * 100.0) if expected_conf_cases else 0.0

    # 4. Correct Confidence Given Target
    target_found_cases = [r for r in expected_conf_cases if r.is_domain_match]
    correct_conf_given_target_count = sum(1 for r in target_found_cases if r.actual_confidence == "CONFIDENT")
    correct_conf_given_target_pct = (correct_conf_given_target_count / len(target_found_cases) * 100.0) if target_found_cases else 0.0

    # 5. Target Misidentification Rate (Hard Safety Invariant)
    target_misidentified = sum(1 for r in expected_conf_cases if r.is_target_misidentified)
    target_misidentification_rate_pct = (target_misidentified / len(expected_conf_cases) * 100.0) if expected_conf_cases else 0.0

    # 6. False CONFIDENT Rate (Hard Safety Invariant)
    false_confident = sum(1 for r in expected_non_conf_cases if r.is_false_confident)
    false_confident_rate_pct = (false_confident / len(expected_non_conf_cases) * 100.0) if expected_non_conf_cases else 0.0

    # 7. Non-CONFIDENT Safety Rate
    non_conf_safety_count = sum(1 for r in expected_non_conf_cases if r.is_state_match)
    non_conf_safety_pct = (non_conf_safety_count / len(expected_non_conf_cases) * 100.0) if expected_non_conf_cases else 0.0

    # Stratum & Failure Stage Distribution Breakdown
    strata = ["AFRICA", "EU", "GLOBAL_COLLISION", "NEGATIVE_CONTROL"]
    strata_stats = {}
    for st in strata:
        st_res = [r for r in results if r.region == st]
        st_total = len(st_res)
        st_matches = sum(1 for r in st_res if r.is_state_match)
        st_target_matches = sum(1 for r in st_res if r.target_domain and r.is_domain_match)
        st_target_total = sum(1 for r in st_res if r.target_domain is not None)
        
        # Stage distribution within stratum
        stages_count = {}
        for r in st_res:
            stages_count[r.final_stage_attribution] = stages_count.get(r.final_stage_attribution, 0) + 1

        strata_stats[st] = {
            "total": st_total,
            "state_matches": st_matches,
            "state_accuracy_pct": (st_matches / st_total * 100.0) if st_total > 0 else 0.0,
            "target_domain_matches": st_target_matches,
            "target_domain_total": st_target_total,
            "target_id_rate_pct": (st_target_matches / st_target_total * 100.0) if st_target_total > 0 else 0.0,
            "stage_distribution": stages_count,
        }

    # Confusion Matrix Counts
    matrix = {
        "expected_confident": {
            "predicted_confident": sum(1 for r in expected_conf_cases if r.actual_confidence == "CONFIDENT"),
            "predicted_ambiguous": sum(1 for r in expected_conf_cases if r.actual_confidence == "AMBIGUOUS"),
            "predicted_unresolved": sum(1 for r in expected_conf_cases if r.actual_confidence == "UNRESOLVED"),
        },
        "expected_ambiguous": {
            "predicted_confident": sum(1 for r in results if r.expected_state == "AMBIGUOUS" and r.actual_confidence == "CONFIDENT"),
            "predicted_ambiguous": sum(1 for r in results if r.expected_state == "AMBIGUOUS" and r.actual_confidence == "AMBIGUOUS"),
            "predicted_unresolved": sum(1 for r in results if r.expected_state == "AMBIGUOUS" and r.actual_confidence == "UNRESOLVED"),
        },
        "expected_unresolved": {
            "predicted_confident": sum(1 for r in results if r.expected_state == "UNRESOLVED" and r.actual_confidence == "CONFIDENT"),
            "predicted_ambiguous": sum(1 for r in results if r.expected_state == "UNRESOLVED" and r.actual_confidence == "AMBIGUOUS"),
            "predicted_unresolved": sum(1 for r in results if r.expected_state == "UNRESOLVED" and r.actual_confidence == "UNRESOLVED"),
        },
    }

    metrics = {
        "total_cases": total,
        "canonical_target_id_rate_pct": canonical_target_id_rate_pct,
        "state_accuracy_pct": state_accuracy_pct,
        "confident_recall_pct": confident_recall_pct,
        "correct_conf_given_target_pct": correct_conf_given_target_pct,
        "target_misidentification_rate_pct": target_misidentification_rate_pct,
        "false_confident_rate_pct": false_confident_rate_pct,
        "non_conf_safety_pct": non_conf_safety_pct,
        "strata_stats": strata_stats,
        "confusion_matrix": matrix,
        "results": [asdict(r) for r in results],
    }

    _render_validation_scorecard(metrics)
    return metrics


def _render_validation_scorecard(metrics: Dict[str, Any]) -> None:
    table = Table(title=f"Fresh Unseen Validation Live Identity Scorecard ({metrics['total_cases']} Cases)", show_header=True)
    table.add_column("Metric Dimension", style="cyan", width=36)
    table.add_column("Value", justify="right", style="bold green", width=12)
    table.add_column("Status / Boundary", style="dim", width=34)

    table.add_row("Canonical Target ID Rate", f"{metrics['canonical_target_id_rate_pct']:.1f}%", "Upstream Acquisition & Search")
    table.add_row("Identity State Accuracy", f"{metrics['state_accuracy_pct']:.1f}%", "Overall State Correctness")
    table.add_row("Live CONFIDENT Recall", f"{metrics['confident_recall_pct']:.1f}%", "Positive Entity Resolution")
    table.add_row("Correct Confidence Given Target", f"{metrics['correct_conf_given_target_pct']:.1f}%", "Resolver Verification Given Acquisition")
    table.add_row(
        "Target Misidentification Rate",
        f"{metrics['target_misidentification_rate_pct']:.1f}%",
        "[bold green]PASS (0.0% Target Misid)[/bold green]" if metrics['target_misidentification_rate_pct'] == 0 else "[bold red]FAIL LEAK[/bold red]"
    )
    table.add_row(
        "False CONFIDENT Rate",
        f"{metrics['false_confident_rate_pct']:.1f}%",
        "[bold green]PASS (0.0% False Conf)[/bold green]" if metrics['false_confident_rate_pct'] == 0 else "[bold red]FAIL LEAK[/bold red]"
    )
    table.add_row("Non-CONFIDENT Safety Rate", f"{metrics['non_conf_safety_pct']:.1f}%", "Collision & Adversarial Robustness")

    console.print()
    console.print(table)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run Fresh Unseen Live Identity Validation Benchmark")
    parser.add_argument("--serper", action="store_true", help="Use Serper search API (requires SERPER_API_KEY)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of validation cases")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay in seconds between cases")
    parser.add_argument("--save-snapshot", type=str, default="live_identity_v1.3_validation_snapshot.json", help="Path to save raw live snapshot JSON")
    parser.add_argument("--save-analysis", type=str, default="live_identity_v1.3_validation_analysis.json", help="Path to save derived analysis JSON")

    args = parser.parse_args()

    metrics = run_validation_identity_benchmark(
        use_serper=args.serper,
        delay=args.delay,
        limit=args.limit,
    )

    if args.save_snapshot:
        with open(args.save_snapshot, "w", encoding="utf-8") as f:
            json.dump(metrics["results"], f, indent=2)
        console.print(f"\n[bold green]📁 Saved raw execution snapshot to {args.save_snapshot}[/bold green]")

    if args.save_analysis:
        analysis_data = {
            "benchmark_version": "identity-v1.3-validation-34cases",
            "execution_timestamp": datetime.now(timezone.utc).isoformat(),
            "total_cases": metrics["total_cases"],
            "metrics": {
                "canonical_target_id_rate_pct": metrics["canonical_target_id_rate_pct"],
                "state_accuracy_pct": metrics["state_accuracy_pct"],
                "confident_recall_pct": metrics["confident_recall_pct"],
                "correct_conf_given_target_pct": metrics["correct_conf_given_target_pct"],
                "target_misidentification_rate_pct": metrics["target_misidentification_rate_pct"],
                "false_confident_rate_pct": metrics["false_confident_rate_pct"],
                "non_conf_safety_pct": metrics["non_conf_safety_pct"],
            },
            "strata_stats": metrics["strata_stats"],
            "confusion_matrix": metrics["confusion_matrix"],
        }
        with open(args.save_analysis, "w", encoding="utf-8") as f:
            json.dump(analysis_data, f, indent=2)
        console.print(f"[bold green]📁 Saved derived analysis to {args.save_analysis}[/bold green]")

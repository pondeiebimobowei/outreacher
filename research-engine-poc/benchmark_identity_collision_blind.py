"""
benchmark_identity_collision_blind.py — Dedicated Collision-Focused Blind Evaluation Suite (v1.3.1 Validation)
"""

from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from core.models import (
    IdentityConfidence, IdentityContext, SiteRelationship, SearchResult,
    CrawledDocument, PageType, DocumentQuality,
)
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver
from benchmark_identity_recall import (
    _DeterministicSearchProvider,
    _DeterministicCrawlManager,
)


@dataclass(frozen=True)
class CollisionBlindCase:
    case_id: str
    query_name: str
    target_entity: str
    target_domain: Optional[str]
    expected_state: IdentityConfidence
    expected_relationship: SiteRelationship
    category: str
    rationale: str
    search_results: List[SearchResult]
    mock_documents: Dict[str, CrawledDocument]
    context: Optional[IdentityContext] = None


def _doc(url: str, title: str, content: str, ptype: PageType = PageType.OTHER) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=200,
        title=title,
        content=content,
        word_count=len(content.split()),
        page_type=ptype,
        quality=DocumentQuality.VALID,
        retrieved_at=datetime.now(timezone.utc),
    )


COLLISION_BLIND_DATASET: List[CollisionBlindCase] = [
    # ── 1. Unseen Generic Dictionary Word Collisions (8 Cases -> AMBIGUOUS) ────
    CollisionBlindCase(
        case_id="col_blind_flock",
        query_name="Flock",
        target_entity="Disambiguation Conflict: Flock Safety (security) vs Flock Freight (logistics) vs Flock (audio)",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="GENERIC_COLLISION",
        rationale="Bare query 'Flock' collides across Flock Safety (flocksafety.com) and Flock Freight (flockfreight.com).",
        search_results=[
            SearchResult(title="Flock Safety – Public Safety Cameras", url="https://flocksafety.com", snippet="Flock Safety builds automated license plate recognition."),
            SearchResult(title="Flock Freight – Shared Truckload Freight Shipping", url="https://flockfreight.com", snippet="Flock Freight pools freight shipments for efficiency."),
            SearchResult(title="Flock Audio – Analog Patchbay Routing", url="https://flockaudio.com", snippet="Flock Audio makes digitally controlled analog hardware."),
        ],
        mock_documents={
            "https://flocksafety.com": _doc("https://flocksafety.com", "Flock – Public Safety Cameras", "Flock is a public safety operating system.", PageType.HOMEPAGE),
            "https://flocksafety.com/about": _doc("https://flocksafety.com/about", "About Flock", "Flock is an all-in-one public safety operating system.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_haven",
        query_name="Haven",
        target_entity="Disambiguation Conflict: Haven Life (insurance) vs Haven Healthcare (joint venture) vs Haven Holidays (hospitality)",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="GENERIC_COLLISION",
        rationale="Bare query 'Haven' collides across life insurance, healthcare, and vacation resorts.",
        search_results=[
            SearchResult(title="Haven Life Insurance Agency", url="https://havenlife.com", snippet="Haven Life is an online life insurance agency backed by MassMutual."),
            SearchResult(title="Haven Holidays UK – Caravan & Lodge Breaks", url="https://haven.com", snippet="Haven UK family holiday parks and holiday homes."),
            SearchResult(title="Haven Health Group", url="https://havenhealth.org", snippet="Haven Health skilled nursing and rehabilitation."),
        ],
        mock_documents={
            "https://haven.com": _doc("https://haven.com", "Haven Holidays UK", "Haven is the UK's leading family holiday park operator.", PageType.HOMEPAGE),
            "https://haven.com/about": _doc("https://haven.com/about", "About Haven", "Haven UK holiday parks.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_compass",
        query_name="Compass",
        target_entity="Disambiguation Conflict: Compass Inc (real estate tech) vs Compass Group (food service) vs Compass Health",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="GENERIC_COLLISION",
        rationale="Bare query 'Compass' collides across residential real estate and global catering services.",
        search_results=[
            SearchResult(title="Compass – Real Estate Homes for Sale & Rent", url="https://compass.com", snippet="Compass is a tech-driven real estate brokerage."),
            SearchResult(title="Compass Group – Contract Foodservice & Hospitality", url="https://compass-group.com", snippet="Compass Group is the world's leading food services company."),
            SearchResult(title="Compass Health Brands", url="https://compasshealthbrands.com", snippet="Medical equipment and pain management products."),
        ],
        mock_documents={
            "https://compass.com": _doc("https://compass.com", "Compass – Real Estate Homes for Sale & Rent", "Compass is a modern real estate platform.", PageType.HOMEPAGE),
            "https://compass.com/about": _doc("https://compass.com/about", "About Compass", "Compass real estate brokerage.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_forge",
        query_name="Forge",
        target_entity="Disambiguation Conflict: Forge Global (private market shares) vs Forge Software vs Autodesk Forge",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="GENERIC_COLLISION",
        rationale="Bare query 'Forge' collides across fintech share trading and CAD cloud software.",
        search_results=[
            SearchResult(title="Forge Global – Private Market Trading & Pre-IPO Shares", url="https://forgeglobal.com", snippet="Forge is the leading trading platform for private company stock."),
            SearchResult(title="Autodesk Platform Services (formerly Forge)", url="https://aps.autodesk.com", snippet="Cloud developer platform formerly known as Forge."),
            SearchResult(title="Forge Biologics – Gene Therapy CDMO", url="https://forgebiologics.com", snippet="Viral vector manufacturing for gene therapy."),
        ],
        mock_documents={
            "https://forgeglobal.com": _doc("https://forgeglobal.com", "Forge Global – Private Market Trading", "Forge is an online private securities marketplace.", PageType.HOMEPAGE),
            "https://forgeglobal.com/about": _doc("https://forgeglobal.com/about", "About Forge", "Forge enables trading in private companies.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_stream",
        query_name="Stream",
        target_entity="Disambiguation Conflict: Stream.io (activity feeds & chat APIs) vs Stream Energy vs Stream Media",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="GENERIC_COLLISION",
        rationale="Bare query 'Stream' collides across developer chat APIs and retail energy providers.",
        search_results=[
            SearchResult(title="Stream: Chat & Activity Feed APIs", url="https://getstream.io", snippet="Scalable in-app chat messaging and video APIs for developers."),
            SearchResult(title="Stream Energy – Electricity & Gas", url="https://mystream.com", snippet="Stream Energy electricity, gas, and mobile services."),
            SearchResult(title="Stream Realty Partners", url="https://streamrealty.com", snippet="Full-service commercial real estate firm."),
        ],
        mock_documents={
            "https://getstream.io": _doc("https://getstream.io", "Stream: Chat & Activity Feed APIs", "Stream powers chat and social feeds for a billion end users.", PageType.HOMEPAGE),
            "https://getstream.io/about": _doc("https://getstream.io/about", "About Stream", "Stream developer APIs.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_signal",
        query_name="Signal",
        target_entity="Disambiguation Conflict: Signal Messenger (encrypted messaging) vs Signal AI vs SignalFire VC",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="GENERIC_COLLISION",
        rationale="Bare query 'Signal' collides across encrypted privacy messaging and enterprise PR intelligence.",
        search_results=[
            SearchResult(title="Signal Messenger – Speak Freely", url="https://signal.org", snippet="Say 'hello' to a different messaging experience. An unexpected focus on privacy."),
            SearchResult(title="Signal AI – External Intelligence Platform", url="https://signal-ai.com", snippet="Signal AI empowers decision-makers with corporate reputation analytics."),
            SearchResult(title="SignalFire – Venture Capital", url="https://signalfire.com", snippet="SignalFire early stage venture capital investing in AI."),
        ],
        mock_documents={
            "https://signal.org": _doc("https://signal.org", "Signal Messenger – Speak Freely", "Signal is a simple, powerful, and secure messaging app.", PageType.HOMEPAGE),
            "https://signal.org/about": _doc("https://signal.org/about", "About Signal", "Signal is a 501(c)(3) nonprofit organization.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_verve",
        query_name="Verve",
        target_entity="Disambiguation Conflict: Verve Card (African card payment scheme) vs Verve Coffee vs Verve Records",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="GENERIC_COLLISION",
        rationale="Bare query 'Verve' collides across payments, specialty coffee, and jazz music records.",
        search_results=[
            SearchResult(title="Verve – Domestic & International Payment Card", url="https://myverveworld.com", snippet="Verve is a pan-African chip card payment card scheme by Interswitch."),
            SearchResult(title="Verve Coffee Roasters – Specialty Coffee", url="https://vervecoffee.com", snippet="Verve Coffee craft roasters in California and Japan."),
            SearchResult(title="Verve Records – The Legendary Jazz Label", url="https://ververecords.com", snippet="Verve Records historic American jazz record company."),
        ],
        mock_documents={
            "https://myverveworld.com": _doc("https://myverveworld.com", "Verve – Domestic & International Payment Card", "Verve is a leading payment card brand.", PageType.HOMEPAGE),
            "https://myverveworld.com/about": _doc("https://myverveworld.com/about", "About Verve", "Verve card payment network.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_echo",
        query_name="Echo",
        target_entity="Disambiguation Conflict: Echo Global Logistics vs Echo Devices (Amazon) vs Echo Outdoor Power Equipment",
        target_domain=None,
        expected_state=IdentityConfidence.AMBIGUOUS,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="GENERIC_COLLISION",
        rationale="Bare query 'Echo' collides across freight transportation and power lawn equipment.",
        search_results=[
            SearchResult(title="Echo Global Logistics – Freight Brokerage & Transportation", url="https://echo.com", snippet="Echo Global Logistics is a leading provider of technology-enabled freight transportation."),
            SearchResult(title="ECHO Power Equipment – Professional Grade Tools", url="https://echo-usa.com", snippet="ECHO outdoor power equipment trimmers, blowers, and chainsaws."),
            SearchResult(title="Echo Therapeutics", url="https://echotx.com", snippet="Echo Therapeutics transdermal medical monitoring."),
        ],
        mock_documents={
            "https://echo.com": _doc("https://echo.com", "Echo Global Logistics – Freight Brokerage", "Echo is a leading provider of technology-enabled freight transportation.", PageType.HOMEPAGE),
            "https://echo.com/about": _doc("https://echo.com/about", "About Echo", "Echo is a premier logistics provider.", PageType.ABOUT),
        },
    ),

    # ── 2. Unseen Distinctive Coined / Neologism Brands (6 Cases -> CONFIDENT) ─
    CollisionBlindCase(
        case_id="col_blind_paystack",
        query_name="Paystack",
        target_entity="Paystack Payments Limited (African payments processor and Stripe subsidiary)",
        target_domain="paystack.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="COINED_BRAND",
        rationale="Coined neologism with exact domain correspondence and uncontested search dominance.",
        search_results=[
            SearchResult(title="Paystack – Modern Online Payments for Africa", url="https://paystack.com", snippet="Paystack helps businesses in Africa get paid by anyone, anywhere in the world."),
            SearchResult(title="Paystack Documentation", url="https://paystack.com/docs", snippet="Developer documentation and REST API reference for Paystack."),
            SearchResult(title="Paystack Careers", url="https://paystack.com/careers", snippet="Join the Paystack team across Lagos, San Francisco, and remote."),
        ],
        mock_documents={
            "https://paystack.com": _doc("https://paystack.com", "Paystack – Modern Online Payments for Africa", "Paystack is a growth engine for modern businesses in Africa.", PageType.HOMEPAGE),
            "https://paystack.com/about": _doc("https://paystack.com/about", "About Paystack", "Paystack builds payment tools that enable commerce across Africa.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_klarna",
        query_name="Klarna",
        target_entity="Klarna Bank AB (Swedish digital bank and Buy Now Pay Later payment provider)",
        target_domain="klarna.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="COINED_BRAND",
        rationale="Distinctive coined brand with exact domain and strong dual corroboration.",
        search_results=[
            SearchResult(title="Klarna | Shop now, pay later or pay in 4", url="https://klarna.com", snippet="Klarna is a global payments and shopping service that lets customers buy now and pay later."),
            SearchResult(title="About Klarna", url="https://klarna.com/about-us", snippet="Klarna was founded in Stockholm, Sweden, with the goal of making shopping smooth."),
        ],
        mock_documents={
            "https://klarna.com": _doc("https://klarna.com", "Klarna | Shop now, pay later", "Klarna offers smooth shopping and flexible payment options.", PageType.HOMEPAGE),
            "https://klarna.com/about-us": _doc("https://klarna.com/about-us", "About Klarna", "Klarna is a licensed Swedish bank and shopping service.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_revolut",
        query_name="Revolut",
        target_entity="Revolut Ltd (UK global financial superapp and digital banking platform)",
        target_domain="revolut.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="COINED_BRAND",
        rationale="Coined neologism with exact domain match and uncontested primary verification.",
        search_results=[
            SearchResult(title="Revolut – One app, all things money", url="https://revolut.com", snippet="Revolut is a global financial app helping 45+ million customers manage spending and savings."),
            SearchResult(title="About Revolut", url="https://revolut.com/about", snippet="Revolut was founded in London to build a borderless digital bank."),
        ],
        mock_documents={
            "https://revolut.com": _doc("https://revolut.com", "Revolut – One app, all things money", "Revolut is a global financial super-app.", PageType.HOMEPAGE),
            "https://revolut.com/about": _doc("https://revolut.com/about", "About Revolut", "Revolut builds global money management tools.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_monzo",
        query_name="Monzo",
        target_entity="Monzo Bank Limited (UK regulated digital mobile banking institution)",
        target_domain="monzo.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="COINED_BRAND",
        rationale="Coined brand name with exact domain and clean first-party corroboration.",
        search_results=[
            SearchResult(title="Monzo – Bank that makes money work for you", url="https://monzo.com", snippet="Monzo is a UK digital bank with instant spending notifications and fee-free travel card."),
            SearchResult(title="About Monzo Bank", url="https://monzo.com/about", snippet="Monzo Bank Ltd is authorised by the Prudential Regulation Authority."),
        ],
        mock_documents={
            "https://monzo.com": _doc("https://monzo.com", "Monzo – Bank that makes money work for you", "Monzo is a digital bank designed for your smartphone.", PageType.HOMEPAGE),
            "https://monzo.com/about": _doc("https://monzo.com/about", "About Monzo Bank", "Monzo is a fully licensed UK bank.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_pipedrive",
        query_name="Pipedrive",
        target_entity="Pipedrive Inc. (Estonian sales CRM and pipeline management SaaS platform)",
        target_domain="pipedrive.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="COINED_BRAND",
        rationale="Coined compound brand with exact domain correspondence and uncontested corroboration.",
        search_results=[
            SearchResult(title="Pipedrive – Sales CRM & Pipeline Management Software", url="https://pipedrive.com", snippet="Pipedrive is the easy-to-use sales CRM designed for closing deals faster."),
            SearchResult(title="About Pipedrive", url="https://pipedrive.com/about", snippet="Pipedrive was founded in Tallinn, Estonia, to help sales teams win."),
        ],
        mock_documents={
            "https://pipedrive.com": _doc("https://pipedrive.com", "Pipedrive – Sales CRM Software", "Pipedrive is an activity-based sales CRM.", PageType.HOMEPAGE),
            "https://pipedrive.com/about": _doc("https://pipedrive.com/about", "About Pipedrive", "Pipedrive helps sales teams succeed.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_piggyvest",
        query_name="PiggyVest",
        target_entity="PiggyTech Global Limited (Nigerian online savings and investment platform)",
        target_domain="piggyvest.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="COINED_BRAND",
        rationale="Coined compound brand with exact domain and strong first-party verification.",
        search_results=[
            SearchResult(title="PiggyVest – Save & Invest with Ease", url="https://piggyvest.com", snippet="PiggyVest helps 5M+ customers save and invest money simply and securely in Nigeria."),
            SearchResult(title="About PiggyVest", url="https://piggyvest.com/about", snippet="PiggyVest is the leading online savings and investment platform in West Africa."),
        ],
        mock_documents={
            "https://piggyvest.com": _doc("https://piggyvest.com", "PiggyVest – Save & Invest with Ease", "PiggyVest empowers individuals to achieve financial freedom.", PageType.HOMEPAGE),
            "https://piggyvest.com/about": _doc("https://piggyvest.com/about", "About PiggyVest", "PiggyVest is a registered microfinance platform.", PageType.ABOUT),
        },
    ),

    # ── 3. Unseen Multi-Token Distinctive Entities (4 Cases -> CONFIDENT) ──────
    CollisionBlindCase(
        case_id="col_blind_traderepublic",
        query_name="Trade Republic",
        target_entity="Trade Republic Bank GmbH (German digital brokerage and savings bank)",
        target_domain="traderepublic.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="MULTI_TOKEN",
        rationale="Multi-token distinctive corporate name with low intrinsic shape risk and matching caller context.",
        search_results=[
            SearchResult(title="Trade Republic: Invest, Save, Trade", url="https://traderepublic.com", snippet="Trade Republic is a European digital bank and investment platform with 4M+ customers."),
            SearchResult(title="About Trade Republic", url="https://traderepublic.com/about", snippet="Trade Republic is a German full-service banking institution supervised by BaFin."),
        ],
        mock_documents={
            "https://traderepublic.com": _doc("https://traderepublic.com", "Trade Republic: Invest, Save, Trade", "Trade Republic makes wealth creation accessible for everyone.", PageType.HOMEPAGE),
            "https://traderepublic.com/about": _doc("https://traderepublic.com/about", "About Trade Republic", "Trade Republic Bank GmbH is regulated by BaFin in Germany.", PageType.ABOUT),
        },
        context=IdentityContext(country="Germany", legal_name="Trade Republic Bank GmbH", company_type="GmbH"),
    ),
    CollisionBlindCase(
        case_id="col_blind_bendingspoons",
        query_name="Bending Spoons",
        target_entity="Bending Spoons S.p.A. (Italian mobile application and digital software studio)",
        target_domain="bendingspoons.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="MULTI_TOKEN",
        rationale="Multi-token distinctive compound brand with exact domain and matching caller context.",
        search_results=[
            SearchResult(title="Bending Spoons – Leading Digital Software Apps", url="https://bendingspoons.com", snippet="Bending Spoons is an Italian technology company creating globally popular mobile apps."),
            SearchResult(title="About Bending Spoons", url="https://bendingspoons.com/company", snippet="Bending Spoons is headquartered in Milan, Italy."),
        ],
        mock_documents={
            "https://bendingspoons.com": _doc("https://bendingspoons.com", "Bending Spoons – Digital Apps", "Bending Spoons S.p.A. creates world-class digital software products.", PageType.HOMEPAGE),
            "https://bendingspoons.com/company": _doc("https://bendingspoons.com/company", "About Bending Spoons", "Bending Spoons S.p.A. is registered in Milan, Italy.", PageType.ABOUT),
        },
        context=IdentityContext(country="Italy", location="Milan", company_type="S.p.A."),
    ),
    CollisionBlindCase(
        case_id="col_blind_lamitech",
        query_name="Lami Technologies",
        target_entity="Lami Technologies Limited (Kenyan digital insurance-as-a-service API platform)",
        target_domain="lami.world",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="MULTI_TOKEN",
        rationale="Multi-token name with generic suffix narrowing scope to single uncontested PRIMARY.",
        search_results=[
            SearchResult(title="Lami – Embedded Insurance APIs for Africa", url="https://lami.world", snippet="Lami Technologies powers embedded insurance products for businesses across Africa."),
            SearchResult(title="About Lami Technologies", url="https://lami.world/about", snippet="Lami Technologies is based in Nairobi, Kenya."),
        ],
        mock_documents={
            "https://lami.world": _doc("https://lami.world", "Lami Technologies – Embedded Insurance APIs", "Lami Technologies is an insurance infrastructure company.", PageType.HOMEPAGE),
            "https://lami.world/about": _doc("https://lami.world/about", "About Lami Technologies", "Lami Technologies democratizes insurance in Africa.", PageType.ABOUT),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_flutterwave",
        query_name="Flutterwave Payments",
        target_entity="Flutterwave Inc. (Pan-African enterprise payment technology provider)",
        target_domain="flutterwave.com",
        expected_state=IdentityConfidence.CONFIDENT,
        expected_relationship=SiteRelationship.PRIMARY,
        category="MULTI_TOKEN",
        rationale="Multi-token distinctive corporate query with uncontested domain resolution.",
        search_results=[
            SearchResult(title="Flutterwave – Endless Possibilities for Payments", url="https://flutterwave.com", snippet="Flutterwave lets businesses build and manage global payments across 30+ African countries."),
            SearchResult(title="About Flutterwave", url="https://flutterwave.com/about", snippet="Flutterwave connects Africa to the global economy."),
        ],
        mock_documents={
            "https://flutterwave.com": _doc("https://flutterwave.com", "Flutterwave Payments – Endless Possibilities", "Flutterwave Payments is a payments technology company.", PageType.HOMEPAGE),
            "https://flutterwave.com/about": _doc("https://flutterwave.com/about", "About Flutterwave Payments", "Flutterwave Payments powers global payments.", PageType.ABOUT),
        },
    ),

    # ── 4. Unseen Adversarial Negatives / Fabricated Entities (4 Cases -> UNRESOLVED)
    CollisionBlindCase(
        case_id="col_blind_fake_zephyrx",
        query_name="ZephyrX Technologies Fake Global",
        target_entity="Synthetic Adversarial Negative: Nonexistent fabricated tech firm",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="SYNTHETIC_NEGATIVE",
        rationale="Fabricated nonexistent entity returning only blog mentions or empty results.",
        search_results=[
            SearchResult(title="Zephyr Weather Predictions Blog", url="https://zephyrweatherblog.org", snippet="Discussion on atmospheric zephyr currents."),
        ],
        mock_documents={
            "https://zephyrweatherblog.org": _doc("https://zephyrweatherblog.org", "Zephyr Weather Blog", "Meteorological analysis of wind patterns.", PageType.HOMEPAGE),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_fake_quantacore",
        query_name="QuantaCore Synthetic Innovations",
        target_entity="Synthetic Adversarial Negative: Fabricated quantum venture",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="SYNTHETIC_NEGATIVE",
        rationale="Fictional entity with no genuine primary domain match.",
        search_results=[
            SearchResult(title="Quantum Physics Forum", url="https://quantphysicsforum.net", snippet="General forum on quantum physics theory."),
        ],
        mock_documents={
            "https://quantphysicsforum.net": _doc("https://quantphysicsforum.net", "Quantum Physics Forum", "Community discussions on physics.", PageType.HOMEPAGE),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_fake_vortigraph",
        query_name="VortiGraph Fictional Labs",
        target_entity="Synthetic Adversarial Negative: Nonexistent graph database",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="SYNTHETIC_NEGATIVE",
        rationale="Synthetic entity with zero qualifying primary candidates.",
        search_results=[
            SearchResult(title="Vortex Mathematics Wiki", url="https://vortexmathwiki.org", snippet="Mathematical overview of vortex dynamics."),
        ],
        mock_documents={
            "https://vortexmathwiki.org": _doc("https://vortexmathwiki.org", "Vortex Math Wiki", "Wiki pages on vortex math.", PageType.HOMEPAGE),
        },
    ),
    CollisionBlindCase(
        case_id="col_blind_fake_aetherion",
        query_name="Aetherion Bioware Phantom",
        target_entity="Synthetic Adversarial Negative: Nonexistent biopharma firm",
        target_domain=None,
        expected_state=IdentityConfidence.UNRESOLVED,
        expected_relationship=SiteRelationship.UNKNOWN,
        category="SYNTHETIC_NEGATIVE",
        rationale="Fictional entity designed to test false confidence resistance.",
        search_results=[
            SearchResult(title="Aetherion Fantasy Gaming Lore", url="https://aetheriongaminglore.com", snippet="Lore encyclopedia for the Aetherion fantasy universe."),
        ],
        mock_documents={
            "https://aetheriongaminglore.com": _doc("https://aetheriongaminglore.com", "Aetherion Lore", "Fantasy roleplaying lore archive.", PageType.HOMEPAGE),
        },
    ),
]


def evaluate_collision_blind_case(case: CollisionBlindCase) -> Dict[str, Any]:
    search = _DeterministicSearchProvider(
        company=case.query_name,
        domain=case.target_domain or "unknown.com",
        results=case.search_results,
    )
    crawl = _DeterministicCrawlManager(case.mock_documents)
    verifier = WebsiteVerifier(crawl, search)
    resolver = IdentityResolver(search, verifier)

    identity = resolver.resolve(case.query_name, context=case.context)

    is_state_match = identity.confidence == case.expected_state
    is_domain_match = (
        (identity.domain == case.target_domain)
        if case.target_domain
        else (identity.confidence != IdentityConfidence.CONFIDENT)
    )
    is_false_confident = (
        case.expected_state != IdentityConfidence.CONFIDENT
        and identity.confidence == IdentityConfidence.CONFIDENT
    )
    is_target_misidentified = (
        case.expected_state == IdentityConfidence.CONFIDENT
        and identity.confidence == IdentityConfidence.CONFIDENT
        and case.target_domain is not None
        and identity.domain != case.target_domain
    )

    return {
        "case_id": case.case_id,
        "query_name": case.query_name,
        "expected_state": case.expected_state.value,
        "actual_state": identity.confidence.value,
        "expected_domain": case.target_domain,
        "actual_domain": identity.domain,
        "is_state_match": is_state_match,
        "is_domain_match": is_domain_match,
        "is_false_confident": is_false_confident,
        "is_target_misidentified": is_target_misidentified,
        "reasoning": identity.reasoning,
    }


def run_collision_blind_benchmark() -> Dict[str, Any]:
    results = [evaluate_collision_blind_case(c) for c in COLLISION_BLIND_DATASET]
    total = len(results)
    state_matches = sum(1 for r in results if r["is_state_match"])
    expected_conf = [r for r in results if r["expected_state"] == "CONFIDENT"]
    expected_non_conf = [r for r in results if r["expected_state"] != "CONFIDENT"]

    false_confident_count = sum(1 for r in expected_non_conf if r["is_false_confident"])
    target_misidentified_count = sum(1 for r in expected_conf if r["is_target_misidentified"])
    correct_conf_count = sum(1 for r in expected_conf if r["is_state_match"] and r["is_domain_match"])

    return {
        "total_cases": total,
        "expected_confident": len(expected_conf),
        "expected_non_confident": len(expected_non_conf),
        "state_accuracy_pct": (state_matches / total * 100.0) if total else 0.0,
        "confident_recall_pct": (correct_conf_count / len(expected_conf) * 100.0) if expected_conf else 0.0,
        "false_confident_count": false_confident_count,
        "false_confident_rate_pct": (false_confident_count / len(expected_non_conf) * 100.0) if expected_non_conf else 0.0,
        "target_misidentified_count": target_misidentified_count,
        "target_misidentification_rate_pct": (target_misidentified_count / len(expected_conf) * 100.0) if expected_conf else 0.0,
        "case_results": results,
    }


if __name__ == "__main__":
    from rich.console import Console
    from rich.table import Table
    console = Console()
    m = run_collision_blind_benchmark()
    table = Table(title=f"Collision-Focused Blind Benchmark (v1.3.2) — {m['total_cases']} Cases")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")
    table.add_row("Total Cases", str(m["total_cases"]))
    table.add_row("State Accuracy", f"{m['state_accuracy_pct']:.1f}%")
    table.add_row("CONFIDENT Recall", f"{m['confident_recall_pct']:.1f}% ({m['expected_confident']} expected)")
    table.add_row("False CONFIDENT Count", f"{m['false_confident_count']} ({m['false_confident_rate_pct']:.1f}%)")
    table.add_row("Target Misidentified Count", f"{m['target_misidentified_count']} ({m['target_misidentification_rate_pct']:.1f}%)")
    console.print(table)

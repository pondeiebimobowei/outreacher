"""
tests/test_dynamic_corroboration.py — Unit test suite for verifier dynamic first-party corroboration
"""

import pytest
from core.models import (
    CrawledDocument, SearchResult, SiteRelationship,
    DocumentQuality, PageType, EvidenceType,
)
from crawling.manager import CrawlManager
from identity.verifier import WebsiteVerifier
from benchmark_identity_recall import (
    _DeterministicSearchProvider,
    _DeterministicCrawlManager,
    _doc,
)


from datetime import datetime, timezone

def _html_doc(url: str, title: str, html: str, content: str, ptype: PageType = PageType.OTHER) -> CrawledDocument:
    return CrawledDocument(
        url=url,
        final_url=url,
        status_code=200,
        title=title,
        content=content,
        raw_html=html,
        word_count=len(content.split()),
        page_type=ptype,
        quality=DocumentQuality.VALID,
        retrieved_at=datetime.now(timezone.utc),
    )


def test_dynamic_corroboration_french_localized_route():
    """Tests that a French entity with non-standard /fr/a-propos route discovered via homepage HTML verifies as PRIMARY."""
    company = "Wave"
    website_url = "https://wave.com"
    
    hp_html = """
    <html>
    <head><title>Wave - Mobile Money</title></head>
    <body>
        <h1>Wave Mobile Money</h1>
        <p>Wave is a digital financial services provider.</p>
        <footer>
            <a href="/fr/a-propos">À propos de Wave</a>
            <a href="/fr/conditions">Conditions Générales</a>
        </footer>
    </body>
    </html>
    """
    
    about_html = """
    <html>
    <head><title>À propos de Wave</title></head>
    <body>
        <h1>À propos de Wave</h1>
        <p>Wave Digital Finance SA est un établissement de monnaie électronique agréé au Sénégal.</p>
    </body>
    </html>
    """

    crawl = _DeterministicCrawlManager({
        "https://wave.com": _html_doc("https://wave.com", "Wave - Mobile Money", hp_html, "Wave is a digital financial services provider.", PageType.HOMEPAGE),
        "https://wave.com/fr/a-propos": _html_doc("https://wave.com/fr/a-propos", "À propos de Wave", about_html, "Wave Digital Finance SA est un établissement de monnaie électronique agréé.", PageType.ABOUT),
    })
    
    search = _DeterministicSearchProvider(company="Wave", domain="wave.com", results=[])
    verifier = WebsiteVerifier(crawl_manager=crawl, search_provider=search)

    rel, msg, ev = verifier.classify_relationship(company, website_url)
    assert rel == SiteRelationship.PRIMARY
    assert any("a-propos" in e.url for e in ev)


def test_dynamic_corroboration_german_impressum():
    """Tests that a German entity with /impressum statutory route discovered via homepage HTML verifies as PRIMARY."""
    company = "Personio"
    website_url = "https://personio.com"

    hp_html = """
    <html>
    <head><title>Personio - HR Operating System</title></head>
    <body>
        <h1>Personio HR Management</h1>
        <p>Personio is the holistic HR software for small and medium businesses.</p>
        <footer>
            <a href="/impressum">Impressum</a>
            <a href="/datenschutz">Datenschutz</a>
        </footer>
    </body>
    </html>
    """

    impressum_html = """
    <html>
    <head><title>Impressum | Personio</title></head>
    <body>
        <h1>Impressum</h1>
        <p>Personio SE & Co. KG, Seidlstraße 28, 80335 München.</p>
    </body>
    </html>
    """

    crawl = _DeterministicCrawlManager({
        "https://personio.com": _html_doc("https://personio.com", "Personio - HR Operating System", hp_html, "Personio is the holistic HR software.", PageType.HOMEPAGE),
        "https://personio.com/impressum": _html_doc("https://personio.com/impressum", "Impressum | Personio", impressum_html, "Personio SE & Co. KG, Seidlstraße 28, 80335 München.", PageType.OTHER),
    })

    search = _DeterministicSearchProvider(company="Personio", domain="personio.com", results=[])
    verifier = WebsiteVerifier(crawl_manager=crawl, search_provider=search)

    rel, msg, ev = verifier.classify_relationship(company, website_url)
    assert rel == SiteRelationship.PRIMARY
    assert any("impressum" in e.url for e in ev)


def test_dynamic_corroboration_json_ld_schema():
    """Tests that JSON-LD Organization schema on homepage dynamically guides corroboration."""
    company = "Numida"
    website_url = "https://numida.com"

    hp_html = """
    <html>
    <head>
        <title>Numida - Micro-enterprise Credit</title>
        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Numida",
            "legalName": "Numida Technologies Uganda Limited",
            "url": "https://numida.com",
            "sameAs": [
                "https://numida.com/legal/company-profile"
            ]
        }
        </script>
    </head>
    <body>
        <p>Numida provides working capital loans to African micro-businesses.</p>
    </body>
    </html>
    """

    legal_html = """
    <html>
    <head><title>Company Profile - Numida</title></head>
    <body>
        <p>Numida Technologies Uganda Limited is regulated by the Uganda Microfinance Regulatory Authority.</p>
    </body>
    </html>
    """

    crawl = _DeterministicCrawlManager({
        "https://numida.com": _html_doc("https://numida.com", "Numida - Micro-enterprise Credit", hp_html, "Numida provides working capital loans.", PageType.HOMEPAGE),
        "https://numida.com/legal/company-profile": _html_doc("https://numida.com/legal/company-profile", "Company Profile - Numida", legal_html, "Numida Technologies Uganda Limited is regulated.", PageType.OTHER),
    })

    search = _DeterministicSearchProvider(company="Numida", domain="numida.com", results=[])
    verifier = WebsiteVerifier(crawl_manager=crawl, search_provider=search)

    rel, msg, ev = verifier.classify_relationship(company, website_url)
    assert rel == SiteRelationship.PRIMARY
    assert any("company-profile" in e.url for e in ev)


def test_dynamic_corroboration_adversarial_rejected():
    """Tests that non-identity internal links (/blog, /pricing, /careers) do not trigger false corroboration."""
    company = "FictitiousBrand"
    website_url = "https://fictitiousbrand.com"

    hp_html = """
    <html>
    <head><title>FictitiousBrand - Home</title></head>
    <body>
        <p>FictitiousBrand is an experimental platform.</p>
        <footer>
            <a href="/blog/ai-updates">Blog</a>
            <a href="/pricing/enterprise">Pricing</a>
            <a href="https://external-social.com/fictitious">Social</a>
        </footer>
    </body>
    </html>
    """

    crawl = _DeterministicCrawlManager({
        "https://fictitiousbrand.com": _html_doc("https://fictitiousbrand.com", "FictitiousBrand - Home", hp_html, "FictitiousBrand is an experimental platform.", PageType.HOMEPAGE),
        "https://fictitiousbrand.com/blog/ai-updates": _html_doc("https://fictitiousbrand.com/blog/ai-updates", "AI Updates Blog", "Blog content mentioning FictitiousBrand.", PageType.BLOG),
    })

    search = _DeterministicSearchProvider(company="FictitiousBrand", domain="fictitiousbrand.com", results=[])
    verifier = WebsiteVerifier(crawl_manager=crawl, search_provider=search)

    rel, msg, ev = verifier.classify_relationship(company, website_url)
    # Since only /blog existed and no valid secondary corroboration was found, must safely abstain
    assert rel == SiteRelationship.UNKNOWN

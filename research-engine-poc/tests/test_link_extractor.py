"""
tests/test_link_extractor.py — Comprehensive unit & adversarial test suite for link and metadata extractor
"""

import pytest
from crawling.link_extractor import (
    SecondaryRouteCandidate,
    extract_identity_candidates,
    extract_json_ld_organizations,
    classify_route_kind,
    normalize_internal_url,
)


def test_classify_route_kind_multilingual():
    """Validates classification of standard and localized identity route paths and anchors."""
    # Standard English
    assert classify_route_kind("/about", "About Us")[0] == "ABOUT"
    assert classify_route_kind("/about-us", "About")[0] == "ABOUT"
    assert classify_route_kind("/company/about", "Company Info")[0] == "ABOUT"
    assert classify_route_kind("/contact", "Contact Us")[0] == "CONTACT"
    assert classify_route_kind("/legal/privacy", "Privacy Policy")[0] == "LEGAL"
    assert classify_route_kind("/terms", "Terms of Service")[0] == "LEGAL"

    # French
    assert classify_route_kind("/fr/a-propos", "À propos")[0] == "ABOUT"
    assert classify_route_kind("/mentions-legales", "Mentions Légales")[0] == "LEGAL"
    assert classify_route_kind("/contactez-nous", "Contactez-nous")[0] == "CONTACT"

    # German
    assert classify_route_kind("/de/ueber-uns", "Über uns")[0] == "ABOUT"
    assert classify_route_kind("/impressum", "Impressum")[0] == "LEGAL"
    assert classify_route_kind("/kontakt", "Kontakt")[0] == "CONTACT"

    # Spanish
    assert classify_route_kind("/es/sobre-nosotros", "Sobre nosotros")[0] == "ABOUT"
    assert classify_route_kind("/aviso-legal", "Aviso Legal")[0] == "LEGAL"
    assert classify_route_kind("/contacto", "Contacto")[0] == "CONTACT"

    # Swedish & Finnish
    assert classify_route_kind("/om-oss", "Om oss")[0] == "ABOUT"
    assert classify_route_kind("/tietoa-meista", "Tietoa meistä")[0] == "ABOUT"
    assert classify_route_kind("/ota-yhteytta", "Ota yhteyttä")[0] == "CONTACT"

    # Non-identity routes should be EXCLUDED with 0.0 relevance score
    assert classify_route_kind("/blog/post-123", "Our Blog")[1] == 0.0
    assert classify_route_kind("/pricing", "Pricing Plans")[1] == 0.0
    assert classify_route_kind("/careers/jobs", "Open Positions")[1] == 0.0
    assert classify_route_kind("/docs/api", "API Docs")[1] == 0.0
    assert classify_route_kind("/login", "Sign In")[1] == 0.0
    assert classify_route_kind("/app/dashboard", "Dashboard")[1] == 0.0


def test_normalize_internal_url_adversarial():
    """Adversarial tests for URL normalization and boundary cases."""
    base = "https://example.com"
    
    # Fragments and query parameters stripped
    assert normalize_internal_url("/about#team", base) == "https://example.com/about"
    assert normalize_internal_url("/about?utm_source=nav&utm_medium=cpc", base) == "https://example.com/about"
    
    # Preserves legitimate non-tracking query parameters if any
    assert normalize_internal_url("/about?lang=fr", base) == "https://example.com/about?lang=fr"
    
    # Relative paths and double slashes
    assert normalize_internal_url("about/us", base) == "https://example.com/about/us"
    assert normalize_internal_url("//example.com/legal//terms/", base) == "https://example.com/legal/terms"

    # External, mailto, tel, javascript, data URLs rejected
    assert normalize_internal_url("https://malicious-site.com/about", base) is None
    assert normalize_internal_url("mailto:security@example.com", base) is None
    assert normalize_internal_url("tel:+1234567890", base) is None
    assert normalize_internal_url("javascript:alert(1)", base) is None
    assert normalize_internal_url("data:text/html,<html></html>", base) is None

    # Subdomain policies: cross-subdomain like app.example.com rejected from base example.com
    assert normalize_internal_url("https://app.example.com/login", base) is None
    assert normalize_internal_url("https://other.example.com/about", base) is None
    
    # www vs non-www matching
    assert normalize_internal_url("https://www.example.com/about", "https://example.com") == "https://example.com/about"
    assert normalize_internal_url("https://example.com/about", "https://www.example.com") == "https://www.example.com/about"

    # Reject empty or root homepage
    assert normalize_internal_url("", base) is None
    assert normalize_internal_url("/", base) is None
    assert normalize_internal_url("https://example.com/", base) is None


def test_extract_identity_candidates_ranking_and_deduplication():
    """Tests candidate ranking and deduplication across rich HTML markup."""
    base_url = "https://acme.org"
    html = """
    <!DOCTYPE html>
    <html>
    <body>
        <!-- Duplicate links with different fragments/anchors -->
        <a href="/about">About Us</a>
        <a href="/about#leadership">Leadership</a>
        <a href="/about?utm_campaign=brand">About Us (Ad)</a>
        
        <!-- Localized route -->
        <a href="/es/sobre-nosotros">Sobre nosotros</a>
        
        <!-- Statutory Impressum / Legal -->
        <a href="/impressum">Impressum</a>
        <a href="/legal/terms">Terms and Conditions</a>
        
        <!-- Contact -->
        <a href="/contact">Contact</a>
        <a href="/contact-us">Get in Touch</a>
        
        <!-- Excluded routes -->
        <a href="/blog/hello-world">Blog</a>
        <a href="/careers/engineer">Careers</a>
        <a href="/pricing">Pricing</a>
    </body>
    </html>
    """

    candidates = extract_identity_candidates(html, base_url)
    assert len(candidates) >= 5

    urls = [c.url for c in candidates]
    # Deduplication check
    assert urls.count("https://acme.org/about") == 1
    
    # Excluded routes check
    assert not any("/blog" in u for u in urls)
    assert not any("/careers" in u for u in urls)
    assert not any("/pricing" in u for u in urls)

    # Ranking: ABOUT and LEGAL ranked first
    first_kinds = [c.route_kind for c in candidates[:3]]
    assert "ABOUT" in first_kinds
    assert "LEGAL" in first_kinds


def test_extract_json_ld_organizations_adversarial():
    """Adversarial tests for JSON-LD Organization parser."""
    base_url = "https://example.com"
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <!-- Valid Organization -->
        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "Corporation",
            "name": "Target Corp",
            "legalName": "Target Corporation SE",
            "url": "https://example.com",
            "sameAs": [
                "https://example.com/legal/impressum",
                "https://malicious-external-site.com/target",
                "https://twitter.com/target"
            ]
        }
        </script>
        <!-- Missing fields & empty array -->
        <script type="application/ld+json">
        {
            "@type": "Organization",
            "name": "",
            "legalName": null,
            "sameAs": []
        }
        </script>
        <!-- Nested @graph array with non-org mixed in -->
        <script type="application/ld+json">
        {
            "@graph": [
                { "@type": "BreadcrumbList", "itemListElement": [] },
                { "@type": "Organization", "name": "Target France", "url": "https://example.com/fr/a-propos" }
            ]
        }
        </script>
        <!-- Broken / malformed JSON -->
        <script type="application/ld+json">
        { "name": "Broken", "@type": "Organization", ... invalid json
        </script>
    </head>
    <body>
        <a href="/contact">Contact</a>
    </body>
    </html>
    """

    orgs = extract_json_ld_organizations(html, base_url)
    assert len(orgs) == 3

    # Primary org extracted
    target_corp = next(o for o in orgs if o.get("name") == "Target Corp")
    assert target_corp["legalName"] == "Target Corporation SE"

    # Candidates extracted only include same-origin sameAs, filtering external
    candidates = extract_identity_candidates(html, base_url)
    cand_urls = [c.url for c in candidates]
    
    assert "https://example.com/legal/impressum" in cand_urls
    assert "https://example.com/fr/a-propos" in cand_urls
    assert not any("malicious-external-site.com" in u for u in cand_urls)
    assert not any("twitter.com" in u for u in cand_urls)

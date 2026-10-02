"""
tests/test_evidence_plumbing.py — Deterministic Fixture Tests for Generic Evidence Plumbing

Validates the generic evidence plumbing between first-party acquisition, verification,
and context arbitration:
1. First matching secondary document does NOT discard later corroborating documents.
2. Legal-name and corporate registration evidence from subsequent documents survives.
3. Headquarters / location evidence from subsequent documents survives.
4. Evidence excerpts are strictly bounded (<= 350 chars) without raw document dumping.
5. Source URL and first-party provenance (route_kind, strength, char_offset) are preserved.
6. Unrelated page text / boilerplate does not become identity evidence.
7. Dictionary-word safety invariant strictly holds (AMBIGUOUS) on context mismatch or absent context.
8. Matching caller context can see evidence from subsequent documents to resolve CONFIDENT.
9. Structural relationship signals (RELATED) maintain absolute precedence over PRIMARY.
10. Legacy domain relationship logic is preserved.
"""

import pytest
from datetime import datetime, timezone
from typing import Optional

from core.models import (
    CrawledDocument, DocumentQuality, PageType, EvidenceType,
    IdentityEvidence, IdentityCandidate, IdentityContext, IdentityConfidence,
    SiteRelationship, SearchResult,
)
from crawling.acquirer import AcquiredSiteDocuments, AcquiredDocument
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver


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


# ── 1. First matching secondary does not discard later corroborating documents ─

def test_first_matching_secondary_does_not_discard_later_corroborating_documents():
    """
    Proves that acquiring multiple secondary documents (e.g. /about AND /impressum)
    preserves evidence from ALL secondary documents rather than early-exiting on /about.
    """
    verifier = WebsiteVerifier()

    hp = _doc("https://stripe.com", "Stripe | Financial Infrastructure", "Stripe infrastructure for the internet.")
    doc_about = _doc("https://stripe.com/about", "About Stripe", "Stripe builds economic infrastructure for the internet.")
    doc_impressum = _doc(
        "https://stripe.com/impressum",
        "Impressum | Stripe",
        "Stripe, Inc. is headquartered at South San Francisco, California. Registered entity."
    )

    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=hp,
        secondary_docs=[
            AcquiredDocument(doc=doc_about, route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"),
            AcquiredDocument(doc=doc_impressum, route_kind="LEGAL", source="CONVENTIONAL_PATH", strength="strong"),
        ]
    )

    rel, msg, evidence = verifier.classify_relationship("Stripe", "https://stripe.com", acquisition=acq_bundle)

    assert rel == SiteRelationship.PRIMARY
    ev_urls = [ev.url for ev in evidence]
    assert "https://stripe.com" in ev_urls
    assert "https://stripe.com/about" in ev_urls
    assert "https://stripe.com/impressum" in ev_urls, (
        "Evidence from later secondary document /impressum must survive without being dropped"
    )


# ── 2. Legal-name and registration evidence from later secondary survives ─────

def test_legal_name_and_registration_from_later_secondary_survives():
    """
    Proves that corporate registration and legal entity forms located in subsequent
    documents (e.g. /legal or /impressum) are successfully extracted with provenance.
    """
    verifier = WebsiteVerifier()

    hp = _doc("https://personio.de", "Personio – HR Software", "Personio HR operating system.")
    doc_about = _doc("https://personio.de/about-us", "About Personio", "We make HR processes transparent.")
    doc_legal = _doc(
        "https://personio.de/legal/notice",
        "Legal Notice | Personio",
        "Personio SE & Co. KG is registered in Munich, Germany. Registration no HRB 230489."
    )

    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=hp,
        secondary_docs=[
            AcquiredDocument(doc=doc_about, route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"),
            AcquiredDocument(doc=doc_legal, route_kind="LEGAL", source="CONVENTIONAL_PATH", strength="strong"),
        ]
    )

    rel, msg, evidence = verifier.classify_relationship("Personio", "https://personio.de", acquisition=acq_bundle)

    assert rel == SiteRelationship.PRIMARY
    legal_ev = [ev for ev in evidence if ev.signal == "LEGAL_ENTITY_CORROBORATION" and ev.url == "https://personio.de/legal/notice"]
    assert len(legal_ev) >= 1
    assert "registered in" in legal_ev[0].snippet.lower() or "registration no" in legal_ev[0].snippet.lower()
    assert legal_ev[0].route_kind == "LEGAL"
    assert legal_ev[0].strength == "strong"


# ── 3. Headquarters evidence from later secondary survives ────────────────────

def test_headquarters_evidence_from_later_secondary_survives():
    """
    Proves that headquarters and operating location facts located in later secondary
    documents survive with signal HEADQUARTERS_CORROBORATION.
    """
    verifier = WebsiteVerifier()

    hp = _doc("https://palantir.com", "Palantir – Foundational Software", "Palantir software for critical institutions.")
    doc_contact = _doc("https://palantir.com/contact", "Contact Us | Palantir", "Get in touch with Palantir.")
    doc_locations = _doc(
        "https://palantir.com/about",
        "About Palantir",
        "Palantir Technologies is headquartered in Denver, Colorado with global offices across the world."
    )

    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=hp,
        secondary_docs=[
            AcquiredDocument(doc=doc_contact, route_kind="CONTACT", source="INTERNAL_LINK", strength="medium"),
            AcquiredDocument(doc=doc_locations, route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"),
        ]
    )

    rel, msg, evidence = verifier.classify_relationship("Palantir", "https://palantir.com", acquisition=acq_bundle)

    assert rel == SiteRelationship.PRIMARY
    hq_ev = [ev for ev in evidence if ev.signal == "HEADQUARTERS_CORROBORATION"]
    assert len(hq_ev) >= 1
    assert "denver" in hq_ev[0].snippet.lower()
    assert "headquartered" in hq_ev[0].snippet.lower()


# ── 4. Evidence excerpts are strictly bounded (<= 350 chars) ──────────────────

def test_evidence_excerpts_are_strictly_bounded_without_raw_dumping():
    """
    Proves that excerpts across all secondary and homepage documents are strictly
    bounded to <= 350 characters, preventing raw document ingestion into resolver.
    """
    verifier = WebsiteVerifier()

    huge_content = "Palantir Technologies inc. " + ("Arbitrary lengthy legal terms and disclosures. " * 500) + " headquartered in Denver, Colorado."
    hp = _doc("https://palantir.com", "Palantir – Foundational Software", "Palantir software.")
    doc_huge = _doc("https://palantir.com/legal", "Legal | Palantir", huge_content)

    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=hp,
        secondary_docs=[
            AcquiredDocument(doc=doc_huge, route_kind="LEGAL", source="INTERNAL_LINK", strength="strong"),
        ]
    )

    rel, msg, evidence = verifier.classify_relationship("Palantir", "https://palantir.com", acquisition=acq_bundle)

    assert rel == SiteRelationship.PRIMARY
    assert len(evidence) > 0
    for ev in evidence:
        if ev.snippet:
            assert len(ev.snippet) <= 350, f"Evidence snippet exceeded 350 chars: {len(ev.snippet)}"


# ── 5. Source URL and first-party provenance are preserved ────────────────────

def test_source_url_and_first_party_provenance_preserved():
    """
    Proves that every evidence item emitted retains source URL, route_kind, strength,
    and char_offset.
    """
    verifier = WebsiteVerifier()

    hp = _doc("https://chime.com", "Chime – Banking That Has Your Back", "Chime financial technology.")
    doc_contact = _doc("https://chime.com/contact", "Contact Chime", "Reach our support team.")
    doc_about = _doc(
        "https://chime.com/about-us",
        "About Chime",
        "Chime Financial, Inc. is headquartered in San Francisco, California."
    )

    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=hp,
        secondary_docs=[
            AcquiredDocument(doc=doc_contact, route_kind="CONTACT", source="INTERNAL_LINK", strength="medium"),
            AcquiredDocument(doc=doc_about, route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"),
        ]
    )

    rel, msg, evidence = verifier.classify_relationship("Chime", "https://chime.com", acquisition=acq_bundle)

    assert rel == SiteRelationship.PRIMARY
    about_ev = [ev for ev in evidence if ev.url == "https://chime.com/about-us"]
    assert len(about_ev) >= 1
    for ev in about_ev:
        assert ev.source.startswith("secondary_")
        assert ev.route_kind == "ABOUT"
        assert ev.strength == "strong"


# ── 6. Unrelated page boilerplate does not become identity evidence ──────────

def test_unrelated_page_boilerplate_does_not_become_identity_evidence():
    """
    Proves that generic boilerplate, navigation bars, and cookie consent texts
    do not match entity title, self-identity, or relationship patterns.
    """
    verifier = WebsiteVerifier()

    boilerplate_nav = "Cookie Preferences | Accept All Cookies | Navigation Menu | Products | Pricing"
    is_entity_title = verifier._secondary_title_matches_entity("Cookie Preferences", "Stripe")
    is_self_id = verifier._detect_self_identity(boilerplate_nav, "Stripe")
    is_rel = verifier._detect_relationship(boilerplate_nav, "Stripe")

    assert is_entity_title is False
    assert is_self_id is False
    assert is_rel is False


# ── 7. Dictionary-word safety invariant strictly holds on context mismatch ────

def test_dictionary_word_safety_invariant_holds_on_context_mismatch_or_absence():
    """
    Proves that SHAPE_RISK_RETAINED_AMBIGUOUS remains strictly AMBIGUOUS for
    dictionary-word brands when context is absent or fails to match plumbed evidence.
    """
    company = "Stripe"
    target_domain = "stripe.com"

    class MockSearch:
        def search(self, q, num_results=10):
            return [
                SearchResult(title="Stripe | Financial Infrastructure", url="https://stripe.com", snippet="Online payments."),
            ]

    verifier = WebsiteVerifier()
    resolver = IdentityResolver(MockSearch(), verifier)

    plumbed_evidence = [
        IdentityEvidence(
            type=EvidenceType.SELF_IDENTITY,
            source="homepage",
            url="https://stripe.com",
            signal="TITLE_ENTITY_MATCH",
            title="Stripe | Financial Infrastructure",
            snippet="Stripe official infrastructure.",
            route_kind="HOMEPAGE",
            strength="strong",
        ),
        IdentityEvidence(
            type=EvidenceType.SELF_IDENTITY,
            source="secondary_legal",
            url="https://stripe.com/impressum",
            signal="HEADQUARTERS_CORROBORATION",
            title="Impressum | Stripe",
            snippet="Stripe, Inc. is headquartered at South San Francisco, California.",
            route_kind="LEGAL",
            strength="strong",
            char_offset=0,
        ),
    ]

    candidate = IdentityCandidate(
        domain=target_domain,
        is_verified=True,
        relationship=SiteRelationship.PRIMARY,
        relationship_reasoning="Entity-title confirmed on homepage and secondary page.",
        verification_msg="Entity-title confirmed.",
        evidence=tuple(plumbed_evidence),
    )

    # 1. Non-matching caller context (caller specifies Seattle)
    mismatched_ctx = IdentityContext(headquarters="Seattle")
    can_discount, reason, basis = resolver._should_discount_shape_risk(
        company, candidate, [candidate], context=mismatched_ctx
    )
    assert can_discount is False
    assert basis == "NONE"
    assert "Common-word entity requires explicit entity-discriminating evidence" in reason

    # 2. No caller context provided
    can_discount_no_ctx, reason_no_ctx, basis_no_ctx = resolver._should_discount_shape_risk(
        company, candidate, [candidate], context=None
    )
    assert can_discount_no_ctx is False
    assert basis_no_ctx == "NONE"
    assert "Common-word entity requires explicit entity-discriminating evidence" in reason_no_ctx


# ── 8. Matching caller context sees later secondary evidence -> CONFIDENT ────

def test_matching_caller_context_sees_later_secondary_evidence_and_resolves_confident():
    """
    Proves that when strong caller context matches facts that were present ONLY
    in a later secondary document (e.g. /impressum or /legal), context arbitration
    sees the plumbed evidence and resolves to CONFIDENT.
    """
    company = "Stripe"
    target_domain = "stripe.com"

    class MockSearch:
        def search(self, q, num_results=10):
            return [
                SearchResult(title="Stripe | Financial Infrastructure", url="https://stripe.com", snippet="Online payments."),
            ]

    verifier = WebsiteVerifier()
    resolver = IdentityResolver(MockSearch(), verifier)

    # Secondary /about has no HQ; secondary /impressum has South San Francisco
    hp = _doc("https://stripe.com", "Stripe | Financial Infrastructure", "Stripe payments.")
    doc_about = _doc("https://stripe.com/about", "About Stripe", "Stripe infrastructure.")
    doc_impressum = _doc(
        "https://stripe.com/impressum",
        "Impressum | Stripe",
        "Stripe, Inc. is headquartered at South San Francisco, California. Delaware corporation."
    )

    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=hp,
        secondary_docs=[
            AcquiredDocument(doc=doc_about, route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"),
            AcquiredDocument(doc=doc_impressum, route_kind="LEGAL", source="CONVENTIONAL_PATH", strength="strong"),
        ]
    )

    rel, msg, evidence = verifier.classify_relationship(company, "https://stripe.com", acquisition=acq_bundle)
    assert rel == SiteRelationship.PRIMARY

    candidate = IdentityCandidate(
        domain=target_domain,
        is_verified=True,
        relationship=rel,
        relationship_reasoning=msg,
        verification_msg=msg,
        evidence=tuple(evidence),
    )

    # Caller context specifies South San Francisco HQ
    context = IdentityContext(headquarters="South San Francisco", legal_name="Stripe, Inc.")
    can_discount, reason, basis = resolver._should_discount_shape_risk(
        company, candidate, [candidate], context=context
    )
    assert can_discount is True
    assert basis == "USER_CONTEXT"
    assert "STRONG discriminator" in reason


# ── 9. Relationship precedence invariant: RELATED aborts immediately ──────────

def test_relationship_precedence_invariant_in_secondary_accumulation():
    """
    Proves that if any secondary document indicates a structural relationship (e.g. subsidiary/acquired),
    classify_relationship immediately yields SiteRelationship.RELATED even if other documents
    contain self-identity signals.
    """
    verifier = WebsiteVerifier()

    hp = _doc("https://acme.com", "Acme – Widgets and Tools", "Acme is a manufacturer of quality tools.")
    doc_about = _doc("https://acme.com/about", "About Acme", "Acme is a global tool maker.")
    doc_subsidiary = _doc("https://acme.com/brands", "Brands", "Acme was acquired by MegaCorp.")

    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=hp,
        secondary_docs=[
            AcquiredDocument(doc=doc_about, route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"),
            AcquiredDocument(doc=doc_subsidiary, route_kind="COMPANY", source="INTERNAL_LINK", strength="medium"),
        ]
    )

    rel, msg, evidence = verifier.classify_relationship("Acme", "https://acme.com", acquisition=acq_bundle)
    assert rel == SiteRelationship.RELATED
    assert any(ev.type == EvidenceType.RELATIONSHIP for ev in evidence)


# ── 10. Comprehensive Relationship Classification Semantic Matrix ─────────────

@pytest.mark.parametrize(
    "case_id,hp_title,hp_content,domain_url,secondaries,expected_rel",
    [
        # Case 1: homepage self-id + secondary self-id (exact domain) -> PRIMARY
        (
            "hp_self_id_and_sec_self_id",
            "Linear – Project Management",
            "Linear is issue tracking software.",
            "https://linear.app",
            [
                AcquiredDocument(
                    doc=_doc("https://linear.app/about", "About Linear", "Linear is built for high-performance teams."),
                    route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"
                )
            ],
            SiteRelationship.PRIMARY,
        ),
        # Case 2: homepage self-id + secondary corroboration (name only in secondary) -> PRIMARY
        (
            "hp_self_id_and_sec_corroboration",
            "Linear – Project Management",
            "Linear is issue tracking software.",
            "https://linear.app",
            [
                AcquiredDocument(
                    doc=_doc("https://linear.app/contact", "Contact Support", "Reach Linear support at contact@linear.app."),
                    route_kind="CONTACT", source="INTERNAL_LINK", strength="medium"
                )
            ],
            SiteRelationship.PRIMARY,
        ),
        # Case 3: homepage self-id + secondary RELATED language -> RELATED
        (
            "hp_self_id_and_sec_related",
            "Linear – Project Management",
            "Linear is issue tracking software.",
            "https://linear.app",
            [
                AcquiredDocument(
                    doc=_doc("https://linear.app/legal", "Legal Notices", "Linear was acquired by Acme Corporation."),
                    route_kind="LEGAL", source="INTERNAL_LINK", strength="strong"
                )
            ],
            SiteRelationship.RELATED,
        ),
        # Case 4: homepage self-id + one RELATED secondary + another strong self-id secondary -> RELATED (precedence holds)
        (
            "hp_self_id_and_related_plus_strong_self_id",
            "Linear – Project Management",
            "Linear is issue tracking software.",
            "https://linear.app",
            [
                AcquiredDocument(
                    doc=_doc("https://linear.app/about", "About Linear", "Linear is built for teams."),
                    route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"
                ),
                AcquiredDocument(
                    doc=_doc("https://linear.app/ownership", "Ownership", "Linear is a subsidiary of Parent Holdings."),
                    route_kind="COMPANY", source="INTERNAL_LINK", strength="medium"
                ),
            ],
            SiteRelationship.RELATED,
        ),
        # Case 5: homepage self-id + LEGACY secondary (no domain correspondence) -> LEGACY
        (
            "hp_self_id_and_legacy_domain",
            "Moniepoint – Business Banking",
            "Moniepoint is the all-in-one financial services platform.",
            "https://monnify.com",  # domain has no correspondence with Moniepoint
            [
                AcquiredDocument(
                    doc=_doc("https://monnify.com/about", "About Moniepoint", "Moniepoint powers financial inclusion."),
                    route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"
                )
            ],
            SiteRelationship.LEGACY,
        ),
        # Case 6: UNKNOWN homepage (no self-id) + strong secondary identity -> UNKNOWN (homepage gate holds)
        (
            "unknown_hp_and_strong_sec",
            "Project Management Directory",
            "Linear software tools are listed here in this directory.",  # third-party mention only
            "https://linear.app",
            [
                AcquiredDocument(
                    doc=_doc("https://linear.app/about", "About Linear", "Linear is built for teams."),
                    route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"
                )
            ],
            SiteRelationship.UNKNOWN,
        ),
        # Case 7: multiple secondaries with different signals (first normal, second RELATED) -> RELATED
        (
            "multiple_secondaries_different_signals",
            "Linear – Project Management",
            "Linear is issue tracking software.",
            "https://linear.app",
            [
                AcquiredDocument(
                    doc=_doc("https://linear.app/features", "Features", "Linear issue tracking features."),
                    route_kind="COMPANY", source="INTERNAL_LINK", strength="medium"
                ),
                AcquiredDocument(
                    doc=_doc("https://linear.app/parent", "Corporate Info", "Linear is a brand of Corp Inc."),
                    route_kind="COMPANY", source="INTERNAL_LINK", strength="medium"
                ),
            ],
            SiteRelationship.RELATED,
        ),
    ]
)
def test_relationship_classification_semantic_matrix(
    case_id, hp_title, hp_content, domain_url, secondaries, expected_rel
):
    verifier = WebsiteVerifier()
    hp = _doc(domain_url, hp_title, hp_content)
    acq_bundle = AcquiredSiteDocuments(homepage_doc=hp, secondary_docs=secondaries)
    co_name = "Moniepoint" if ("moniepoint" in case_id.lower() or "legacy" in case_id.lower()) else "Linear"

    rel, msg, evidence = verifier.classify_relationship(co_name, domain_url, acquisition=acq_bundle)
    assert rel == expected_rel, f"Failed case {case_id}: expected {expected_rel}, got {rel} ({msg})"


# ── 11. Generic Evidence-Anchor False Positive Audit ──────────────────────────

def test_generic_anchor_words_do_not_produce_misleading_evidence():
    """
    Proves that generic legal-form words ('limited', 'inc', 'corp', 'corporation')
    occurring in customer reviews, footer copyright, or generic marketing copy
    WITHOUT the target company name do NOT produce LEGAL_ENTITY_CORROBORATION evidence.
    """
    verifier = WebsiteVerifier()

    hp = _doc("https://acme.com", "Acme – Tools and Cloud", "Acme provides developer tools.")
    # Page contains generic legal words referring to other entities or generic terms
    doc_customers = _doc(
        "https://acme.com/customers",
        "Customers | Acme",
        "Trusted by Fortune 500 enterprises including Global Logistics Inc., "
        "Retail Partners Corp., and Pacific Shipping Limited. "
        "Every corporation benefits from our high-throughput platform."
    )

    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=hp,
        secondary_docs=[
            AcquiredDocument(doc=doc_customers, route_kind="ABOUT", source="INTERNAL_LINK", strength="strong")
        ]
    )

    rel, msg, evidence = verifier.classify_relationship("Acme", "https://acme.com", acquisition=acq_bundle)
    assert rel == SiteRelationship.PRIMARY

    # Verify that NO legal entity corroboration was fabricated from Global Logistics Inc. or Pacific Shipping Limited
    legal_ev = [ev for ev in evidence if ev.signal == "LEGAL_ENTITY_CORROBORATION" and ev.url == "https://acme.com/customers"]
    assert len(legal_ev) == 0, f"Unrelated legal entities fabricated corroboration: {legal_ev}"


# ── 12. True End-to-End Evidence Plumbing Verification ────────────────────────

def test_true_end_to_end_evidence_plumbing_without_manual_construction():
    """
    Executes the true end-to-end pipeline:
    AcquiredSiteDocuments
    -> WebsiteVerifier.classify_relationship()
    -> IdentityCandidate.evidence
    -> IdentityResolver._evaluate_context_discrimination()

    Proves that the later secondary document (/impressum) provides the HQ fact
    that enables context discrimination to succeed (basis USER_CONTEXT).
    """
    company = "Stripe"
    target_domain = "stripe.com"

    class MockSearch:
        def search(self, q, num_results=10):
            return [
                SearchResult(title="Stripe | Financial Infrastructure", url="https://stripe.com", snippet="Online payments."),
            ]

    verifier = WebsiteVerifier()
    resolver = IdentityResolver(MockSearch(), verifier)

    hp = _doc("https://stripe.com", "Stripe | Financial Infrastructure", "Stripe online payments.")
    # First secondary: ordinary about page without headquarters
    doc_about = _doc("https://stripe.com/about", "About Stripe", "Stripe builds economic infrastructure for the internet.")
    # Later secondary: impressum containing strong headquarters fact
    doc_impressum = _doc(
        "https://stripe.com/impressum",
        "Impressum | Stripe",
        "Stripe, Inc. is headquartered in South San Francisco, California. Registered in Delaware."
    )

    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=hp,
        secondary_docs=[
            AcquiredDocument(doc=doc_about, route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"),
            AcquiredDocument(doc=doc_impressum, route_kind="LEGAL", source="CONVENTIONAL_PATH", strength="strong"),
        ]
    )

    # 1. Execute actual verifier
    rel, msg, emitted_evidence = verifier.classify_relationship(company, "https://stripe.com", acquisition=acq_bundle)
    assert rel == SiteRelationship.PRIMARY

    # 2. Construct candidate with verbatim emitted evidence
    candidate = IdentityCandidate(
        domain=target_domain,
        is_verified=True,
        relationship=rel,
        relationship_reasoning=msg,
        verification_msg=msg,
        evidence=tuple(emitted_evidence),
    )

    # 3. Caller context with HQ
    context = IdentityContext(headquarters="South San Francisco", legal_name="Stripe, Inc.")

    # 4. Context discrimination evaluates candidate evidence directly
    is_matched, reason, basis = resolver._evaluate_context_discrimination(candidate, context)
    assert is_matched is True
    assert basis == "USER_CONTEXT"
    assert "headquarters 'south san francisco'" in reason.lower()


# ── 13. Excerpt Boundary and Location Section Audit ───────────────────────────

@pytest.mark.parametrize("fact_position", ["start", "middle", "end", "footer"])
def test_excerpt_boundary_and_location_positions(fact_position):
    """
    Proves that regardless of where the fact appears in the document
    (start, middle, end, footer), the excerpt is <= 350 chars, contains the fact,
    and normalizes cleanly.
    """
    filler = "Filler text discussing generic industry patterns and concepts. " * 30
    fact = "Stripe, Inc. is headquartered in South San Francisco, California."

    if fact_position == "start":
        content = fact + " " + filler
    elif fact_position == "middle":
        content = filler[:500] + " " + fact + " " + filler[500:]
    elif fact_position == "end":
        content = filler + " " + fact
    else:  # footer
        content = filler + "\n\n<footer>\n" + fact + "\n</footer>"

    doc = _doc("https://stripe.com/locations", "Stripe Locations", content)
    acq_bundle = AcquiredSiteDocuments(
        homepage_doc=_doc("https://stripe.com", "Stripe | Financial Infrastructure", "Stripe payments."),
        secondary_docs=[
            AcquiredDocument(doc=doc, route_kind="ABOUT", source="INTERNAL_LINK", strength="strong"),
        ]
    )

    verifier = WebsiteVerifier()
    rel, msg, evidence = verifier.classify_relationship("Stripe", "https://stripe.com", acquisition=acq_bundle)

    hq_ev = [ev for ev in evidence if ev.signal == "HEADQUARTERS_CORROBORATION"]
    assert len(hq_ev) >= 1
    for ev in hq_ev:
        assert len(ev.snippet) <= 350
        assert "south san francisco" in ev.snippet.lower()
        assert ev.url == "https://stripe.com/locations"
        assert ev.route_kind == "ABOUT"
        assert ev.strength == "strong"


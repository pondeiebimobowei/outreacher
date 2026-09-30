"""
tests/test_identity_safety.py — v0.7.3 identity invariant regression suite

Invariants under test:
  Structural (1–5): URLClassifier, corroboration policy, multi-candidate ambiguity.
  Decision policy (6–7): shape-risk, distinctive-name CONFIDENT.

Relationship regressions (8–13):
  8.  linear-solutions.com is NOT PRIMARY for "Linear"
       (different entity; title "Linear Solutions" fails entity match)
  9.  v0.app is RELATED for "Vercel"
       (product-of relationship signal; no self-identity for Vercel)
  10. atm.monnify.com is LEGACY (not PRIMARY) for "Moniepoint"
       (post-acquisition rebrand: self-identifies as Moniepoint but domain has no correspondence)
  11. linear.app IS PRIMARY for "Linear"
  12. moniepoint.com IS PRIMARY for "Moniepoint"
  13. vercel.com IS PRIMARY for "Vercel"
       (title "Vercel: Build and deploy" — colon is a valid separator)

Unit tests for matching helpers (14–18):
  14. title_matches_entity: colon separator
  15. title_matches_entity: en-dash separator
  16. title_matches_entity: "Linear Solutions" is not "Linear"
  17. secondary_title_matches_entity: "About Linear" → True for "Linear"
  18. secondary_title_matches_entity: "About Linear Solutions" → False for "Linear"
"""
import pytest
from datetime import datetime

from core.models import (
    DocumentQuality, EvidenceType, IdentityConfidence, PageType,
    CrawledDocument, SearchResult, SiteRelationship,
)
from discovery.classifier import TwoStageClassifier
from identity.verifier import WebsiteVerifier
from identity.resolver import IdentityResolver


# ── Test helpers ──────────────────────────────────────────────────────────────

def _doc(url, title="", content="", ptype=PageType.OTHER,
         quality=DocumentQuality.VALID):
    return CrawledDocument(
        url=url, final_url=url, status_code=200,
        retrieved_at=datetime(2024, 1, 1),
        page_type=ptype, quality=quality,
        title=title, content=content,
    )

def _fail(url, ptype=PageType.OTHER):
    return CrawledDocument(
        url=url, final_url=url, status_code=404,
        retrieved_at=datetime(2024, 1, 1),
        page_type=ptype, quality=DocumentQuality.HTTP_ERROR,
    )

class _Search:
    def __init__(self, results=None):
        self._r = results or []
    @property
    def name(self) -> str:
        return "mock_search"
    def search(self, query, num_results=5):
        return self._r

class _Crawler:
    def __init__(self, pages):
        self._p = pages
    def fetch_with_fallback(self, url, page_type):
        return self._p.get(url, _fail(url, page_type))

def _make(search_results, pages):
    s = _Search(search_results)
    c = _Crawler(pages)
    v = WebsiteVerifier(c, s)
    r = IdentityResolver(s, v)
    return v, r


# ── 1–5. Structural invariants ────────────────────────────────────────────────

def test_classifier_blog_before_company():
    assert TwoStageClassifier.stage1_classify_url("https://a.com/blog/company-news") == PageType.BLOG

def test_classifier_company_path_is_about():
    assert TwoStageClassifier.stage1_classify_url("https://a.com/company/about") == PageType.ABOUT

def test_classifier_contact():
    assert TwoStageClassifier.stage1_classify_url("https://a.com/contact") == PageType.CONTACT

def test_classifier_careers():
    assert TwoStageClassifier.stage1_classify_url("https://a.com/careers") == PageType.CAREERS_INDEX

def test_classifier_job_listing():
    assert TwoStageClassifier.stage1_classify_url("https://a.com/careers/123-engineer") == PageType.JOB_LISTING

def test_homepage_only_never_confident():
    _, r = _make(
        [SearchResult(title="Widgetco", url="https://widgetco.com", snippet="")],
        {"https://widgetco.com": _doc("https://widgetco.com",
                                      title="Widgetco",
                                      content="Welcome.")},
    )
    res = r.resolve("Widgetco")
    assert res.confidence == IdentityConfidence.UNRESOLVED
    assert res.confidence != IdentityConfidence.CONFIDENT

def test_blog_cannot_corroborate():
    _, r = _make(
        [SearchResult(title="Widgetco", url="https://widgetco.com", snippet=""),
         SearchResult(title="Blog", url="https://widgetco.com/blog/company", snippet="")],
        {
            "https://widgetco.com": _doc("https://widgetco.com",
                                         title="Widgetco",
                                         content="Widgetco is great."),
            "https://widgetco.com/blog/company": _doc(
                "https://widgetco.com/blog/company",
                title="Blog", content="Widgetco launched.", ptype=PageType.BLOG),
        },
    )
    res = r.resolve("Widgetco")
    assert res.confidence == IdentityConfidence.UNRESOLVED
    assert res.confidence != IdentityConfidence.CONFIDENT

def test_careers_only_insufficient():
    _, r = _make(
        [SearchResult(title="Widgetco", url="https://widgetco.com", snippet="")],
        {
            "https://widgetco.com": _doc("https://widgetco.com",
                                         title="Widgetco",
                                         content="Widgetco is great."),
            "https://widgetco.com/careers": _doc(
                "https://widgetco.com/careers",
                title="Widgetco Careers", content="Join Widgetco.",
                ptype=PageType.CAREERS_INDEX),
            "https://widgetco.com/about": _fail("https://widgetco.com/about"),
        },
    )
    res = r.resolve("Widgetco")
    assert res.confidence == IdentityConfidence.UNRESOLVED
    assert res.confidence != IdentityConfidence.CONFIDENT

def test_two_primary_candidates_is_ambiguous():
    _, r = _make(
        [SearchResult(title="Stripe", url="https://stripe.com", snippet=""),
         SearchResult(title="Stripe", url="https://stripedev.io", snippet="")],
        {
            "https://stripe.com":         _doc("https://stripe.com",         title="Stripe",       content="Stripe is a payments company."),
            "https://stripe.com/about":   _doc("https://stripe.com/about",   title="About Stripe", content="About Stripe.", ptype=PageType.ABOUT),
            "https://stripedev.io":       _doc("https://stripedev.io",       title="Stripe",       content="Stripe is a developer platform."),
            "https://stripedev.io/about": _doc("https://stripedev.io/about", title="About Stripe", content="About Stripe.", ptype=PageType.ABOUT),
        },
    )
    assert r.resolve("Stripe").confidence == IdentityConfidence.AMBIGUOUS


# ── 6–7. Decision policy ──────────────────────────────────────────────────────

def test_shape_risk_name_forces_ambiguous():
    _, r = _make(
        [SearchResult(title="Acme Corp", url="https://acme.com", snippet="")],
        {
            "https://acme.com":       _doc("https://acme.com",       title="Acme Corp",       content="Acme Corp is a widget maker."),
            "https://acme.com/about": _doc("https://acme.com/about", title="About Acme Corp", content="About Acme Corp.", ptype=PageType.ABOUT),
        },
    )
    result = r.resolve("Acme Corp")
    assert result.confidence == IdentityConfidence.AMBIGUOUS
    assert "shape-risk" in result.reasoning

def test_distinctive_single_primary_is_confident():
    _, r = _make(
        [SearchResult(title="Moniepoint", url="https://moniepoint.com", snippet="")],
        {
            "https://moniepoint.com":       _doc("https://moniepoint.com",       title="Moniepoint",       content="Moniepoint is Nigeria's leading business banking platform."),
            "https://moniepoint.com/about": _doc("https://moniepoint.com/about", title="About Moniepoint", content="About Moniepoint.", ptype=PageType.ABOUT),
        },
    )
    assert r.resolve("Moniepoint").confidence == IdentityConfidence.CONFIDENT


# ── 8. linear-solutions.com is NOT PRIMARY for "Linear" ──────────────────────

def test_linear_solutions_is_not_primary_for_linear():
    """
    Regression v0.7.3 — Entity "Linear" vs entity "Linear Solutions".

    linear-solutions.com homepage title: "Linear Solutions - Electrical Component Distributor"
    → title_matches_entity fails: 's' (alpha) follows "linear" after stripping whitespace.

    Their about page title: "About Linear Solutions"
    → _secondary_title_matches_entity fails: after stripping "about ", remainder is
      "linear solutions" which starts with "linear" but 's' follows — not exact entity.

    Even if content self-identity fires (e.g. "Linear is a brand we distribute"),
    the secondary title confirmation is required for PRIMARY and is absent.
    """
    v, _ = _make([], {
        "https://linear-solutions.com": _doc(
            "https://linear-solutions.com",
            title="Linear Solutions - Electrical Component Distributor",
            content=(
                "Linear Solutions is an authorized distributor of electronic "
                "components. Linear is a leading brand of analog semiconductors "
                "that we stock and distribute globally."
            ),
        ),
        "https://linear-solutions.com/about": _doc(
            "https://linear-solutions.com/about",
            title="About Linear Solutions",
            content="About Linear Solutions. We provide Linear components.",
            ptype=PageType.ABOUT,
        ),
    })
    rel, msg, _ = v.classify_relationship("Linear", "https://linear-solutions.com")
    assert rel != SiteRelationship.PRIMARY, (
        f"linear-solutions.com must not be PRIMARY for 'Linear'. Got {rel}: {msg}"
    )


# ── 9. v0.app is RELATED for "Vercel" ────────────────────────────────────────

def test_v0_app_is_related_for_vercel():
    """
    Regression v0.7.3 — v0.app is Vercel's product, not Vercel's primary identity.

    Homepage title: "v0 - Generative UI by Vercel"
    → title_matches_entity("Vercel"): title does not start with "vercel"; reverse check
      finds "vercel" at end, but preceding char "y" (in "by") is alpha → False.

    Homepage content: "v0 is a product of Vercel."
    → _detect_relationship fires → RELATED.
    """
    v, _ = _make([], {
        "https://v0.app": _doc(
            "https://v0.app",
            title="v0 - Generative UI by Vercel",
            content=(
                "v0 is a generative UI tool. "
                "v0 is a product of Vercel. "
                "Vercel and v0 share the same account system."
            ),
        ),
        "https://v0.app/about": _doc(
            "https://v0.app/about",
            title="About v0",
            content="v0 is built by Vercel. A product of Vercel.",
            ptype=PageType.ABOUT,
        ),
    })
    rel, msg, _ = v.classify_relationship("Vercel", "https://v0.app")
    assert rel == SiteRelationship.RELATED, (
        f"v0.app should be RELATED for 'Vercel'. Got {rel}: {msg}"
    )


# ── 10. atm.monnify.com is LEGACY (not PRIMARY) for "Moniepoint" ──────────────

def test_monnify_is_legacy_for_moniepoint():
    """
    Regression v0.7.3 — atm.monnify.com post-acquisition scenario.

    After Moniepoint acquired Monnify, atm.monnify.com may show Moniepoint branding.
    This makes it self-identify as "Moniepoint" (TITLE_ENTITY_MATCH), but:
      - domain "monnify" has NO correspondence to "moniepoint" → domain_signal=none
      - → LEGACY, not PRIMARY

    LEGACY = company-controlled but not the canonical identity URL.
    """
    v, _ = _make([], {
        "https://atm.monnify.com": _doc(
            "https://atm.monnify.com",
            title="Moniepoint - ATM Services",
            content=(
                "Moniepoint provides ATM services across Nigeria. "
                "Moniepoint acquired Monnify to expand its infrastructure."
            ),
        ),
        "https://atm.monnify.com/about": _doc(
            "https://atm.monnify.com/about",
            title="About Moniepoint ATM",
            # "About Moniepoint ATM" — after stripping "about ", remainder is
            # "moniepoint atm" which starts with "moniepoint" but 'a' follows → False
            content="Moniepoint ATM services provide nationwide coverage.",
            ptype=PageType.ABOUT,
        ),
    })
    rel, msg, _ = v.classify_relationship("Moniepoint", "https://atm.monnify.com")
    assert rel != SiteRelationship.PRIMARY, (
        f"atm.monnify.com must not be PRIMARY for 'Moniepoint'. Got {rel}: {msg}"
    )
    assert rel == SiteRelationship.LEGACY, (
        f"atm.monnify.com should be LEGACY for 'Moniepoint'. Got {rel}: {msg}"
    )


# ── 11. linear.app IS PRIMARY for "Linear" ───────────────────────────────────

def test_linear_app_is_primary():
    """
    Title: "Linear – The system for product development"
    → title_matches_entity: starts with "linear", rest " – The system..." stripped
      to "– The system...", first char "–" is non-alpha → True.
    About: "About Linear" → secondary_title_matches: strip "about " → "linear" == "linear" → True.
    Domain signal: "linear" == "linear" → exact.
    → PRIMARY.
    """
    v, _ = _make([], {
        "https://linear.app": _doc(
            "https://linear.app",
            title="Linear – The system for product development",
            content="Linear is the project management tool for high-performance teams.",
        ),
        "https://linear.app/about": _doc(
            "https://linear.app/about",
            title="About Linear",
            content="About Linear. Linear helps software teams ship faster.",
            ptype=PageType.ABOUT,
        ),
    })
    rel, msg, _ = v.classify_relationship("Linear", "https://linear.app")
    assert rel == SiteRelationship.PRIMARY, (
        f"linear.app must be PRIMARY for 'Linear'. Got {rel}: {msg}"
    )


# ── 12. moniepoint.com IS PRIMARY for "Moniepoint" ───────────────────────────

def test_moniepoint_com_is_primary():
    v, _ = _make([], {
        "https://moniepoint.com": _doc(
            "https://moniepoint.com",
            title="Moniepoint - Business Banking",
            content="Moniepoint is Nigeria's leading business banking platform.",
        ),
        "https://moniepoint.com/about": _doc(
            "https://moniepoint.com/about",
            title="About Moniepoint",
            content="About Moniepoint. Moniepoint enables financial services.",
            ptype=PageType.ABOUT,
        ),
    })
    rel, msg, _ = v.classify_relationship("Moniepoint", "https://moniepoint.com")
    assert rel == SiteRelationship.PRIMARY, (
        f"moniepoint.com must be PRIMARY for 'Moniepoint'. Got {rel}: {msg}"
    )


# ── 13. vercel.com IS PRIMARY for "Vercel" (colon separator) ─────────────────

def test_vercel_com_is_primary():
    """
    Title: "Vercel: Build and deploy the best web experiences with the Frontend Cloud"
    → title_matches_entity: starts with "vercel", rest ": Build..." stripped to
      ": Build...", first char ":" is non-alpha → True.
    → PRIMARY (with about corroboration and exact domain).
    """
    v, _ = _make([], {
        "https://vercel.com": _doc(
            "https://vercel.com",
            title="Vercel: Build and deploy the best web experiences with the Frontend Cloud",
            content="Vercel is the platform for frontend developers.",
        ),
        "https://vercel.com/about": _doc(
            "https://vercel.com/about",
            title="About Vercel",
            content="About Vercel. Vercel enables frontend teams to ship faster.",
            ptype=PageType.ABOUT,
        ),
    })
    rel, msg, _ = v.classify_relationship("Vercel", "https://vercel.com")
    assert rel == SiteRelationship.PRIMARY, (
        f"vercel.com must be PRIMARY for 'Vercel'. Got {rel}: {msg}"
    )



# ── 14–18. Unit tests for matching helpers ────────────────────────────────────

def test_title_matches_entity_colon():
    """Colon is a non-alpha separator — must pass."""
    assert WebsiteVerifier._title_matches_entity(
        "Vercel: Build and deploy", "Vercel"
    ) is True

def test_title_matches_entity_en_dash():
    """En-dash is a non-alpha separator — must pass."""
    assert WebsiteVerifier._title_matches_entity(
        "Linear – The system for product development", "Linear"
    ) is True

def test_title_matches_entity_rejects_longer_entity():
    """'Linear Solutions' must not match entity 'Linear'."""
    assert WebsiteVerifier._title_matches_entity(
        "Linear Solutions - Electrical Component Distributor", "Linear"
    ) is False

def test_secondary_title_about_prefix():
    """'About Linear' should match entity 'Linear'."""
    assert WebsiteVerifier._secondary_title_matches_entity(
        "About Linear", "Linear"
    ) is True

def test_secondary_title_rejects_longer_entity():
    """'About Linear Solutions' must not confirm entity 'Linear'."""
    assert WebsiteVerifier._secondary_title_matches_entity(
        "About Linear Solutions", "Linear"
    ) is False


# ── 19. CONFIDENT → PRIMARY invariant ────────────────────────────────────────

def test_confident_result_always_backed_by_primary_relationship():
    """
    Core invariant: when resolver.resolve() returns CONFIDENT, the chosen
    candidate must carry relationship == PRIMARY.

    This is a stronger check than merely asserting confidence == CONFIDENT,
    because it verifies that the decision policy never bypasses the relationship
    layer (e.g. by promoting a LEGACY or UNKNOWN candidate to CONFIDENT).
    """
    _, r = _make(
        [SearchResult(title="Moniepoint", url="https://moniepoint.com", snippet="")],
        {
            "https://moniepoint.com": _doc(
                "https://moniepoint.com",
                title="Moniepoint - Business Banking",
                content="Moniepoint is Nigeria's leading business banking platform.",
            ),
            "https://moniepoint.com/about": _doc(
                "https://moniepoint.com/about",
                title="About Moniepoint",
                content="About Moniepoint. Moniepoint enables financial services.",
                ptype=PageType.ABOUT,
            ),
        },
    )
    result = r.resolve("Moniepoint")
    assert result.confidence == IdentityConfidence.CONFIDENT, (
        f"Expected CONFIDENT, got {result.confidence.name}: {result.reasoning}"
    )
    chosen = next(
        (c for c in result.candidates if c.domain == result.domain), None
    )
    assert chosen is not None, "Chosen domain not found in candidates list."
    assert chosen.relationship == SiteRelationship.PRIMARY, (
        f"CONFIDENT result must be backed by a PRIMARY candidate, "
        f"but chosen candidate '{chosen.domain}' has relationship={chosen.relationship}."
    )


# ── 20. Moniepoint via sentence-ID + medium corroboration ────────────────────

def test_moniepoint_resolves_confident_via_sentence_id_and_contact():
    """
    Regression for the live Moniepoint failure mode:

    Homepage title: empty (SPA — crawler returns no title, hint_title not in unit test scope)
    Homepage content: "Moniepoint is Nigeria's leading..." → SELF_IDENTITY_STATEMENT fires
    Secondary page: moniepoint.com/contact → NAME_IN_MEDIUM_PAGE (contact page, name present)
    Domain: moniepoint → moniepoint → exact

    Decision branch: hp_sentence_id + corr_name_match + "medium" + domain_signal="exact"
    Expected: PRIMARY → CONFIDENT
    """
    primary_results = [
        SearchResult(title="Moniepoint – Business Banking", url="https://moniepoint.com", snippet=""),
    ]
    secondary_results = [
        SearchResult(title="Contact Us", url="https://moniepoint.com/contact", snippet=""),
    ]

    class _TwoPhaseSearch:
        def __init__(self):
            self._calls = 0
        def search(self, query, num_results=5):
            self._calls += 1
            if self._calls == 1:
                return primary_results
            return secondary_results

    s = _TwoPhaseSearch()
    c = _Crawler({
        # No title on homepage (simulates SPA with empty crawled title)
        "https://moniepoint.com": _doc(
            "https://moniepoint.com",
            title="",
            content=(
                "Moniepoint is Nigeria's leading business banking platform. "
                "Moniepoint helps over 1.5 million businesses grow."
            ),
        ),
        # About page fails (404) — verifier must fall back to contact
        "https://moniepoint.com/about": _fail("https://moniepoint.com/about", PageType.ABOUT),
        "https://moniepoint.com/contact": _doc(
            "https://moniepoint.com/contact",
            title="Contact Us",
            content="Contact Moniepoint. We'd love to hear from you.",
            ptype=PageType.CONTACT,
        ),
    })
    v = WebsiteVerifier(c, s)
    r = IdentityResolver(s, v)
    result = r.resolve("Moniepoint")
    assert result.confidence == IdentityConfidence.CONFIDENT, (
        f"Expected CONFIDENT, got {result.confidence.name}: {result.reasoning}"
    )
    chosen = next(c for c in result.candidates if c.domain == result.domain)
    assert chosen.relationship == SiteRelationship.PRIMARY


# ── 21. Reciprocal invariant: non-PRIMARY ⇒ not CONFIDENT ────────────────────

def test_non_primary_candidate_never_produces_confident():
    """
    Reciprocal of test 19.

    test_confident_result_always_backed_by_primary_relationship (test 19):
        CONFIDENT ⇒ selected candidate.relationship == PRIMARY

    This test:
        selected candidate.relationship != PRIMARY ⇒ confidence != CONFIDENT

    Sounds redundant, but protects the decision boundary if another branch
    gets added later. Uses LEGACY as the relationship — the most plausible
    misclassification that could slip through.
    """
    hp = _doc(
        "https://atm.monnify.com",
        title="Moniepoint – ATM Services",
        content="Moniepoint is a financial services platform.",
    )
    about = _doc(
        "https://atm.monnify.com/about",
        title="About Moniepoint – ATM Services",
        content="Moniepoint ATM services helps you bank on the go.",
        ptype=PageType.ABOUT,
    )
    s = _Search([
        SearchResult(title="Moniepoint – ATM Services", url="https://atm.monnify.com", snippet=""),
    ])
    c = _Crawler({
        "https://atm.monnify.com": hp,
        "https://atm.monnify.com/about": about,
    })
    v = WebsiteVerifier(c, s)
    r = IdentityResolver(s, v)
    result = r.resolve("Moniepoint")

    # atm.monnify.com should be LEGACY (self-identifies but domain != "moniepoint")
    chosen = result.candidates[0] if result.candidates else None
    assert chosen is not None, "No candidate recorded."

    if chosen.relationship != SiteRelationship.PRIMARY:
        assert result.confidence != IdentityConfidence.CONFIDENT, (
            f"Non-PRIMARY candidate '{chosen.domain}' (rel={chosen.relationship}) "
            f"must not produce CONFIDENT, but got {result.confidence.name}."
        )
        assert result.confidence == IdentityConfidence.UNRESOLVED, (
            f"Expected UNRESOLVED for non-PRIMARY candidate, got {result.confidence.name}."
        )


# ── 22. State machine matrix: UNRESOLVED vs AMBIGUOUS failure branches ───────

def test_zero_primary_related_candidate_is_unresolved():
    """0 PRIMARY + RELATED candidate (e.g. product page v0.app for Vercel) -> UNRESOLVED."""
    v0_hp = _doc(
        "https://v0.app",
        title="v0 - Generative UI by Vercel",
        content="v0 is a generative UI tool. v0 is a product of Vercel.",
    )
    v0_about = _doc(
        "https://v0.app/about",
        title="About v0",
        content="v0 is built by Vercel. A product of Vercel.",
        ptype=PageType.ABOUT,
    )
    s = _Search([SearchResult(title="v0 by Vercel", url="https://v0.app", snippet="")])
    c = _Crawler({"https://v0.app": v0_hp, "https://v0.app/about": v0_about})
    v = WebsiteVerifier(c, s)
    r = IdentityResolver(s, v)
    result = r.resolve("Vercel")

    assert result.confidence == IdentityConfidence.UNRESOLVED
    assert result.confidence != IdentityConfidence.AMBIGUOUS
    assert result.confidence != IdentityConfidence.CONFIDENT
    assert result.domain == ""


def test_zero_primary_legacy_candidate_is_unresolved():
    """0 PRIMARY + LEGACY candidate (e.g. acquired domain atm.monnify.com for Moniepoint) -> UNRESOLVED."""
    hp = _doc(
        "https://atm.monnify.com",
        title="Moniepoint – ATM Services",
        content="Moniepoint is a financial services platform.",
    )
    about = _doc(
        "https://atm.monnify.com/about",
        title="About Moniepoint – ATM Services",
        content="Moniepoint ATM services helps you bank on the go.",
        ptype=PageType.ABOUT,
    )
    s = _Search([SearchResult(title="Moniepoint – ATM Services", url="https://atm.monnify.com", snippet="")])
    c = _Crawler({"https://atm.monnify.com": hp, "https://atm.monnify.com/about": about})
    v = WebsiteVerifier(c, s)
    r = IdentityResolver(s, v)
    result = r.resolve("Moniepoint")

    assert result.confidence == IdentityConfidence.UNRESOLVED
    assert result.confidence != IdentityConfidence.AMBIGUOUS
    assert result.confidence != IdentityConfidence.CONFIDENT
    assert result.domain == ""


def test_zero_primary_unknown_candidate_is_unresolved():
    """0 PRIMARY + UNKNOWN candidate (uncorroborated homepage only) -> UNRESOLVED."""
    hp = _doc("https://moove.io", title="Moove", content="Moove is mobility fintech.")
    s = _Search([SearchResult(title="Moove", url="https://moove.io", snippet="")])
    c = _Crawler({"https://moove.io": hp, "https://moove.io/about": _fail("https://moove.io/about")})
    v = WebsiteVerifier(c, s)
    r = IdentityResolver(s, v)
    result = r.resolve("Moove")

    assert result.confidence == IdentityConfidence.UNRESOLVED
    assert result.confidence != IdentityConfidence.AMBIGUOUS
    assert result.confidence != IdentityConfidence.CONFIDENT
    assert result.domain == ""


def test_two_primary_candidates_strictly_ambiguous():
    """2 verified PRIMARY candidates -> strictly AMBIGUOUS (not UNRESOLVED)."""
    s = _Search([
        SearchResult(title="Stripe", url="https://stripe.com", snippet=""),
        SearchResult(title="Stripe", url="https://stripedev.io", snippet=""),
    ])
    c = _Crawler({
        "https://stripe.com": _doc("https://stripe.com", title="Stripe", content="Stripe is payments."),
        "https://stripe.com/about": _doc("https://stripe.com/about", title="About Stripe", content="About Stripe.", ptype=PageType.ABOUT),
        "https://stripedev.io": _doc("https://stripedev.io", title="Stripe", content="Stripe is dev platform."),
        "https://stripedev.io/about": _doc("https://stripedev.io/about", title="About Stripe", content="About Stripe.", ptype=PageType.ABOUT),
    })
    v = WebsiteVerifier(c, s)
    r = IdentityResolver(s, v)
    result = r.resolve("Stripe")

    assert result.confidence == IdentityConfidence.AMBIGUOUS
    assert result.confidence != IdentityConfidence.UNRESOLVED
    assert result.confidence != IdentityConfidence.CONFIDENT


def test_single_primary_shape_risk_strictly_ambiguous():
    """1 verified PRIMARY candidate with generic shape risk name -> strictly AMBIGUOUS (not UNRESOLVED)."""
    s = _Search([SearchResult(title="Acme Corp", url="https://acme.com", snippet="")])
    c = _Crawler({
        "https://acme.com": _doc("https://acme.com", title="Acme Corp", content="Acme Corp is a widget maker."),
        "https://acme.com/about": _doc("https://acme.com/about", title="About Acme Corp", content="About Acme Corp.", ptype=PageType.ABOUT),
    })
    v = WebsiteVerifier(c, s)
    r = IdentityResolver(s, v)
    result = r.resolve("Acme Corp")

    assert result.confidence == IdentityConfidence.AMBIGUOUS
    assert result.confidence != IdentityConfidence.UNRESOLVED
    assert result.confidence != IdentityConfidence.CONFIDENT
    assert "shape-risk" in result.reasoning


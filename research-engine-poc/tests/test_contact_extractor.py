import pytest

from contact_discovery.canonical import flatten_canonical_text
from contact_discovery.extractor import StructuredContactExtractor
from contact_discovery.models import ContactPersonKind


SAMPLE_TEAM_HTML = """
<html>
<head><title>About Our Team - Acme Corp</title></head>
<body>
<nav>Home | Products | About</nav>
<main>
    <h1>Leadership & Engineering Team</h1>
    <div class="team-grid">
        <div class="member">
            <h3>Renée O'Connor</h3>
            <p class="role">VP of Engineering</p>
            <p class="bio">Renée leads our engineering organisation and core platform infrastructure.</p>
        </div>
        <div class="member">
            <h3>David Müller</h3>
            <p class="role">Head of Talent</p>
            <p class="bio">David manages recruiting and people operations across EMEA and US.</p>
            <p>Direct inquiries: david.muller@acme.com</p>
        </div>
        <div class="member">
            <h3>Alice Smith</h3>
            <p class="bio">Alice is a core contributor to our open source distributed systems.</p>
        </div>
    </div>
    <div class="careers-footer">
        <p>Looking for a career? Contact our talent team at careers@acme.com or jobs@acme.com.</p>
        <p>For generic sales questions, contact vendor-sales@external-partner.com.</p>
    </div>
</main>
<footer>Terms of Service | Privacy Policy | Copyright 2026 Acme Corp</footer>
</body>
</html>
"""


def test_flatten_canonical_text_strips_tags_and_normalizes():
    text = flatten_canonical_text(SAMPLE_TEAM_HTML)
    assert "<html" not in text
    assert "<main>" not in text
    assert "Renée O'Connor" in text
    assert "VP of Engineering" in text
    assert "careers@acme.com" in text
    # Substring grounding check
    assert "Renée leads our engineering organisation and core platform infrastructure." in text


def test_structured_extractor_extracts_grounded_candidates():
    extractor = StructuredContactExtractor(verified_domain="acme.com")
    canonical_text = flatten_canonical_text(SAMPLE_TEAM_HTML)
    source_url = "https://acme.com/team"

    contacts = extractor.extract(canonical_text=canonical_text, source_url=source_url)

    # Verify extracted contacts
    assert len(contacts) >= 3

    # Check Renée O'Connor
    renee = next((c for c in contacts if c.first_name == "Renée"), None)
    assert renee is not None
    assert renee.person_kind == ContactPersonKind.PERSON
    assert renee.last_name == "O'Connor"
    assert renee.title == "VP of Engineering"
    # Grounding invariant: every excerpt MUST be an exact substring of canonical text
    for ev in renee.evidence:
        assert ev.source_excerpt in canonical_text
        assert ev.source_url == source_url

    # Check David Müller (with verified email)
    david = next((c for c in contacts if c.first_name == "David"), None)
    assert david is not None
    assert david.email == "david.muller@acme.com"
    assert david.title == "Head of Talent"
    for ev in david.evidence:
        assert ev.source_excerpt in canonical_text

    # Check Alice Smith (title optional: no title in HTML, so title should be None)
    alice = next((c for c in contacts if c.first_name == "Alice"), None)
    assert alice is not None
    assert alice.title is None
    for ev in alice.evidence:
        assert ev.source_excerpt in canonical_text

    # Check role addresses: careers@acme.com, jobs@acme.com
    careers = next((c for c in contacts if c.email == "careers@acme.com"), None)
    assert careers is not None
    assert careers.person_kind == ContactPersonKind.ROLE_ADDRESS
    assert careers.first_name is None
    assert careers.last_name is None
    for ev in careers.evidence:
        assert ev.source_excerpt in canonical_text


def test_structured_extractor_rejects_external_domain_emails():
    extractor = StructuredContactExtractor(verified_domain="acme.com")
    canonical_text = flatten_canonical_text(SAMPLE_TEAM_HTML)
    source_url = "https://acme.com/team"

    contacts = extractor.extract(canonical_text=canonical_text, source_url=source_url)

    # Must NOT extract vendor-sales@external-partner.com
    external = [c for c in contacts if c.email and "external-partner.com" in c.email]
    assert len(external) == 0


def test_structured_extractor_rejects_unallowed_role_mailboxes():
    text = "Please reach out to support@acme.com or abuse@acme.com or legal@acme.com for non-career matters."
    extractor = StructuredContactExtractor(verified_domain="acme.com")
    contacts = extractor.extract(canonical_text=text, source_url="https://acme.com/contact")

    # support, abuse, legal are not in ALLOWED_ROLE_ADDRESS_MAILBOXES
    role_contacts = [c for c in contacts if c.person_kind == ContactPersonKind.ROLE_ADDRESS]
    assert len(role_contacts) == 0

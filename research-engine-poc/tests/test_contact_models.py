import pytest
from pydantic import ValidationError

from contact_discovery.models import (
    ALLOWED_ROLE_ADDRESS_MAILBOXES,
    ContactConfidence,
    ContactDiscoveryFailure,
    ContactEvidenceSpan,
    ContactIdentity,
    ContactPersonKind,
    DiscoveredContact,
    ProviderFailureCode,
    RoleFamily,
)


def test_allowed_role_address_mailboxes():
    expected = {
        "careers", "jobs", "recruiting", "hiring", "contact", "team", "hello", "info"
    }
    assert ALLOWED_ROLE_ADDRESS_MAILBOXES == expected


def test_provider_failure_code_enum():
    assert set(ProviderFailureCode) == {
        ProviderFailureCode.DISCOVERY_OPERATIONAL_FAILURE,
        ProviderFailureCode.DISCOVERY_TIMEOUT,
        ProviderFailureCode.UPSTREAM_SEARCH_FAILED,
        ProviderFailureCode.ACQUISITION_RATE_LIMITED,
    }


def test_contact_discovery_failure_valid():
    failure = ContactDiscoveryFailure(
        code=ProviderFailureCode.DISCOVERY_TIMEOUT,
        retryable=True,
        message="Upstream crawl timed out after 30s",
    )
    assert failure.code == ProviderFailureCode.DISCOVERY_TIMEOUT
    assert failure.retryable is True
    assert failure.message == "Upstream crawl timed out after 30s"


def test_contact_discovery_failure_forbids_extra():
    with pytest.raises(ValidationError):
        ContactDiscoveryFailure(
            code=ProviderFailureCode.DISCOVERY_TIMEOUT,
            retryable=True,
            message="timeout",
            extra_field="disallowed",
        )


def test_contact_evidence_span_valid_http_urls():
    span = ContactEvidenceSpan(
        claim="Jane Doe is VP Engineering",
        source_name="Company Team",
        source_url="https://example.com/team",
        source_excerpt="Jane Doe leads engineering as VP Engineering",
        classification="FACT",
        confidence="HIGH",
    )
    assert span.source_url == "https://example.com/team"
    assert span.confidence == "HIGH"


def test_contact_evidence_span_rejects_non_http_urls():
    for invalid_url in [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "ftp://example.com/doc",
        "data:text/plain;base64,SGVsbG8=",
        "/relative/path/only",
    ]:
        with pytest.raises(ValidationError, match="http"):
            ContactEvidenceSpan(
                claim="Some claim",
                source_name="Source",
                source_url=invalid_url,
                source_excerpt="Some excerpt",
                classification="FACT",
                confidence="HIGH",
            )


def test_discovered_contact_person_with_title_grounded():
    contact = DiscoveredContact(
        person_kind=ContactPersonKind.PERSON,
        first_name="Jane",
        last_name="Doe",
        title="VP of Engineering",
        email="jane.doe@example.com",
        confidence=ContactConfidence.HIGH,
        role_family=RoleFamily.ENGINEERING,
        source="Company Team Page",
        source_url="https://example.com/team",
        evidence=[
            ContactEvidenceSpan(
                claim="Jane Doe is VP of Engineering",
                source_name="Company Team Page",
                source_url="https://example.com/team",
                source_excerpt="Jane Doe serves as our VP of Engineering leading core infrastructure.",
                classification="FACT",
                confidence="HIGH",
            )
        ],
    )
    assert contact.first_name == "Jane"
    assert contact.title == "VP of Engineering"


def test_discovered_contact_person_with_title_ungrounded_raises():
    with pytest.raises(ValidationError, match="title"):
        DiscoveredContact(
            person_kind=ContactPersonKind.PERSON,
            first_name="Jane",
            last_name="Doe",
            title="Chief Technology Officer",
            email="jane.doe@example.com",
            confidence=ContactConfidence.HIGH,
            role_family=RoleFamily.LEADERSHIP,
            source="Company Team Page",
            source_url="https://example.com/team",
            evidence=[
                ContactEvidenceSpan(
                    claim="Jane Doe works here",
                    source_name="Company Team Page",
                    source_url="https://example.com/team",
                    source_excerpt="Jane Doe joined our team in 2022.",
                    classification="FACT",
                    confidence="HIGH",
                )
            ],
        )


def test_discovered_contact_person_without_title_valid_when_name_grounded():
    contact = DiscoveredContact(
        person_kind=ContactPersonKind.PERSON,
        first_name="Jane",
        last_name="Doe",
        title=None,
        email="jane.doe@example.com",
        confidence=ContactConfidence.HIGH,
        role_family=RoleFamily.GENERAL,
        source="Company Team Page",
        source_url="https://example.com/team",
        evidence=[
            ContactEvidenceSpan(
                claim="Jane Doe is a team member",
                source_name="Company Team Page",
                source_url="https://example.com/team",
                source_excerpt="Meet Jane Doe on our engineering staff.",
                classification="FACT",
                confidence="HIGH",
            )
        ],
    )
    assert contact.title is None
    assert contact.first_name == "Jane"


def test_discovered_contact_person_without_title_ungrounded_name_raises():
    with pytest.raises(ValidationError, match="name"):
        DiscoveredContact(
            person_kind=ContactPersonKind.PERSON,
            first_name="Jane",
            last_name="Doe",
            title=None,
            confidence=ContactConfidence.HIGH,
            source="Company Team Page",
            source_url="https://example.com/team",
            evidence=[
                ContactEvidenceSpan(
                    claim="Someone else works here",
                    source_name="Company Team Page",
                    source_url="https://example.com/team",
                    source_excerpt="John Smith joined our company.",
                    classification="FACT",
                    confidence="HIGH",
                )
            ],
        )


def test_discovered_contact_person_missing_first_name_raises():
    with pytest.raises(ValidationError, match="first_name"):
        DiscoveredContact(
            person_kind=ContactPersonKind.PERSON,
            first_name=None,
            last_name="Doe",
            title="VP Engineering",
            confidence=ContactConfidence.HIGH,
            source="Company Team Page",
            source_url="https://example.com/team",
            evidence=[
                ContactEvidenceSpan(
                    claim="Doe is VP Engineering",
                    source_name="Company Team Page",
                    source_url="https://example.com/team",
                    source_excerpt="Doe is our VP Engineering.",
                    classification="FACT",
                    confidence="HIGH",
                )
            ],
        )


def test_discovered_contact_role_address_valid():
    contact = DiscoveredContact(
        person_kind=ContactPersonKind.ROLE_ADDRESS,
        first_name=None,
        last_name=None,
        title="Careers & Talent Inquiries",
        email="careers@example.com",
        confidence=ContactConfidence.HIGH,
        role_family=RoleFamily.RECRUITING,
        source="Company Careers Page",
        source_url="https://example.com/careers",
        evidence=[
            ContactEvidenceSpan(
                claim="Careers contact address",
                source_name="Company Careers Page",
                source_url="https://example.com/careers",
                source_excerpt="For recruiting inquiries, contact careers@example.com directly.",
                classification="FACT",
                confidence="HIGH",
            )
        ],
    )
    assert contact.email == "careers@example.com"
    assert contact.person_kind == ContactPersonKind.ROLE_ADDRESS


def test_discovered_contact_role_address_disallowed_mailbox_raises():
    with pytest.raises(ValidationError, match="mailbox"):
        DiscoveredContact(
            person_kind=ContactPersonKind.ROLE_ADDRESS,
            first_name=None,
            last_name=None,
            email="jane@example.com",
            confidence=ContactConfidence.HIGH,
            source="Company Page",
            source_url="https://example.com/contact",
            evidence=[
                ContactEvidenceSpan(
                    claim="Contact jane",
                    source_name="Company Page",
                    source_url="https://example.com/contact",
                    source_excerpt="Email jane@example.com for info.",
                    classification="FACT",
                    confidence="HIGH",
                )
            ],
        )


def test_discovered_contact_role_address_with_person_names_raises():
    with pytest.raises(ValidationError, match="null first_name"):
        DiscoveredContact(
            person_kind=ContactPersonKind.ROLE_ADDRESS,
            first_name="Jane",
            last_name="Doe",
            email="jobs@example.com",
            confidence=ContactConfidence.HIGH,
            source="Company Page",
            source_url="https://example.com/careers",
            evidence=[
                ContactEvidenceSpan(
                    claim="Recruiting email",
                    source_name="Company Page",
                    source_url="https://example.com/careers",
                    source_excerpt="Send resume to jobs@example.com.",
                    classification="FACT",
                    confidence="HIGH",
                )
            ],
        )


def test_discovered_contact_role_address_ungrounded_email_raises():
    with pytest.raises(ValidationError, match="grounded"):
        DiscoveredContact(
            person_kind=ContactPersonKind.ROLE_ADDRESS,
            first_name=None,
            last_name=None,
            email="jobs@example.com",
            confidence=ContactConfidence.HIGH,
            source="Company Page",
            source_url="https://example.com/careers",
            evidence=[
                ContactEvidenceSpan(
                    claim="Recruiting email",
                    source_name="Company Page",
                    source_url="https://example.com/careers",
                    source_excerpt="Apply online through our portal.",
                    classification="FACT",
                    confidence="HIGH",
                )
            ],
        )


def test_contact_identity_valid():
    identity = ContactIdentity(
        verified_domain="example.com",
        primary_relationship="PRIMARY",
        confidence="CONFIDENT",
    )
    assert identity.verified_domain == "example.com"
    assert identity.primary_relationship == "PRIMARY"
    assert identity.confidence == "CONFIDENT"

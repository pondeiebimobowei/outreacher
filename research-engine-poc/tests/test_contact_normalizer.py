import pytest

from contact_discovery.models import RoleFamily
from contact_discovery.normalizer import (
    classify_role_family,
    get_null_email_canonical_key,
    matches_target_roles,
    normalize_person_name,
    normalize_role_title,
)


def test_normalize_person_name_empty_and_none():
    assert normalize_person_name(None) == ""
    assert normalize_person_name("") == ""
    assert normalize_person_name("    ") == ""


def test_normalize_person_name_honorifics_and_apostrophes():
    assert normalize_person_name("Dr. John") == "john"
    assert normalize_person_name("Prof. Jane") == "jane"
    assert normalize_person_name("Mr. Robert") == "robert"
    assert normalize_person_name("O'Connor") == "oconnor"
    assert normalize_person_name("D’Angelo") == "dangelo"


def test_normalize_person_name_diacritics():
    assert normalize_person_name("Renée") == "renee"
    assert normalize_person_name("Müller") == "muller"
    assert normalize_person_name("François") == "francois"


def test_normalize_role_title_empty_and_none():
    assert normalize_role_title(None) == ""
    assert normalize_role_title("") == ""
    assert normalize_role_title("   ") == ""


def test_normalize_role_title_ampersand_expansion():
    assert normalize_role_title("Head of R&D") == "head of r and d"
    assert normalize_role_title("Core & Infra") == "core and infra"
    assert normalize_role_title("Founder & CEO") == "founder and ceo"


def test_normalize_role_title_punctuation_and_separators():
    assert normalize_role_title("Staff DevSecOps / Cloud & Platform") == "staff devsecops cloud and platform"
    assert normalize_role_title("Software Engineer (Backend, Platform)") == "software engineer backend platform"
    assert normalize_role_title("VP - Engineering | Core") == "vp engineering core"


def test_cross_language_canonical_key_fixtures():
    # Fixture 1
    assert (
        get_null_email_canonical_key("  Renée  ", "  O'Connor  ", "VP of Engineering")
        == "renee|oconnor|vp of engineering"
    )

    # Fixture 2
    assert (
        get_null_email_canonical_key("Müller", "Smith-Jones", "Staff DevSecOps / Cloud & Platform")
        == "muller|smith jones|staff devsecops cloud and platform"
    )

    # Fixture 3
    assert (
        get_null_email_canonical_key("Dr. John", "Doe, Jr.", "Founder & CEO")
        == "john|doe jr|founder and ceo"
    )

    # Fixture 4
    assert (
        get_null_email_canonical_key("Alice", None, None)
        == "alice||"
    )

    # Fixture 5
    assert (
        get_null_email_canonical_key("  Jane   Anne ", "Doe", "Software Engineer (Backend, Platform)")
        == "jane anne|doe|software engineer backend platform"
    )

    # Fixture 6
    assert (
        get_null_email_canonical_key(None, None, "Head of Talent")
        == "||head of talent"
    )


def test_classify_role_family():
    assert classify_role_family("Chief Executive Officer") == RoleFamily.LEADERSHIP
    assert classify_role_family("Founder & CTO") == RoleFamily.LEADERSHIP
    assert classify_role_family("Software Engineering Manager") == RoleFamily.ENGINEERING
    assert classify_role_family("VP of Product") == RoleFamily.PRODUCT
    assert classify_role_family("Head of Talent Acquisition") == RoleFamily.RECRUITING
    assert classify_role_family("Office Operations") == RoleFamily.GENERAL


def test_matches_target_roles():
    target_roles = ["Engineering Manager", "Head of Talent"]
    assert matches_target_roles("Software Engineering Manager", target_roles) is True
    assert matches_target_roles("EM", target_roles) is True
    assert matches_target_roles("Engineering Team Lead", target_roles) is True
    assert matches_target_roles("Head of Talent", target_roles) is True
    assert matches_target_roles("Senior Recruiter", target_roles) is True
    # Narrow roles must not match unrelated seniorities
    assert matches_target_roles("VP Sales", target_roles) is False
    assert matches_target_roles("Chief Financial Officer", target_roles) is False

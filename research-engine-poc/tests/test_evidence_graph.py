import pytest
import hashlib
from datetime import datetime, timezone
from pydantic import ValidationError

from core.models import (
    CrawledDocument, CrawlAttempt, PageType, DocumentQuality, CompanyIdentity,
    IdentityConfidence, RawResearchPackage,
)
from core.evidence import (
    EvidenceSpan, Claim, ClaimGraph, ResearchEvidenceType,
    ClaimCategory, ClaimClassification, ClaimGraphValidationError,
    compute_document_hash, compute_span_id,
)
from core.evidence_extraction import DeterministicEvidenceExtractor


# ── 1. Document Hashing & Deterministic ID Tests ──────────────────────────────

def test_document_hash_reproducibility():
    raw_text = "Stripe builds economic infrastructure for the internet.\nMillions of businesses use Stripe."
    expected_hash = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
    
    assert compute_document_hash(raw_text) == expected_hash
    # Exact bytes rule: trailing newline or whitespace changes hash
    assert compute_document_hash(raw_text + " ") != expected_hash
    # Empty string produces valid SHA-256 hex digest
    empty_hash = hashlib.sha256(b"").hexdigest()
    assert compute_document_hash("") == empty_hash


def test_span_id_determinism():
    doc_hash = "abcdef0123456789"
    id1 = compute_span_id(doc_hash, 0, 55)
    id2 = compute_span_id(doc_hash, 0, 55)
    id3 = compute_span_id(doc_hash, 56, 120)
    
    assert id1 == id2
    assert id1 != id3
    assert id1.startswith("span_")


def test_crawled_document_and_package_deep_immutability():
    now = datetime.now(timezone.utc)
    attempt = CrawlAttempt(strategy="STATIC", quality=DocumentQuality.VALID)
    
    with pytest.raises(ValidationError):
        attempt.strategy = "BROWSER"

    doc = CrawledDocument(
        url="https://stripe.com",
        final_url="https://stripe.com",
        status_code=200,
        content="Stripe content",
        retrieved_at=now,
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
        attempts=[attempt],
    )
    
    with pytest.raises(ValidationError):
        doc.content = "Tampered content"

    with pytest.raises(ValidationError):
        doc.quality = DocumentQuality.BLOCKED

    identity = CompanyIdentity(
        name="Stripe",
        domain="stripe.com",
        website_url="https://stripe.com",
        confidence=IdentityConfidence.CONFIDENT,
        reasoning="Primary verified.",
    )

    package = RawResearchPackage(
        identity=identity,
        documents=[doc],
        discovered_at=now,
    )

    # Nested documents cannot be mutated
    with pytest.raises(ValidationError):
        package.documents[0].content = "Tampered in package"


def test_claim_deep_immutability_and_invariants():
    # FACT without evidence_refs must fail
    with pytest.raises(ValidationError, match="require at least one evidence_ref"):
        Claim(
            id="claim-1",
            subject="Stripe",
            predicate="provides_product",
            object_value="Payments",
            category=ClaimCategory.PRODUCT,
            classification=ClaimClassification.FACT,
            evidence_refs=[],
        )

    # UNKNOWN with non-zero confidence must fail
    with pytest.raises(ValidationError, match="UNKNOWN claims must have confidence 0.0"):
        Claim(
            id="claim-unknown-invalid",
            subject="Stripe",
            predicate="has_active_opening",
            object_value="Rust Engineer",
            category=ClaimCategory.HIRING,
            classification=ClaimClassification.UNKNOWN,
            evidence_refs=[],
            confidence=0.5,
        )

    # UNKNOWN with evidence_refs must fail
    with pytest.raises(ValidationError, match="UNKNOWN claims must have 0 evidence_refs"):
        Claim(
            id="claim-unknown-refs",
            subject="Stripe",
            predicate="has_active_opening",
            object_value="Rust Engineer",
            category=ClaimCategory.HIRING,
            classification=ClaimClassification.UNKNOWN,
            evidence_refs=["span_123"],
            confidence=0.0,
        )

    # Valid UNKNOWN claim: empty tuple refs and 0.0 confidence
    unknown_claim = Claim(
        id="claim-unknown",
        subject="Stripe",
        predicate="has_active_opening",
        object_value="Rust Engineer",
        category=ClaimCategory.HIRING,
        classification=ClaimClassification.UNKNOWN,
        evidence_refs=[],
        confidence=0.0,
    )
    assert unknown_claim.classification == ClaimClassification.UNKNOWN
    assert unknown_claim.evidence_refs == ()
    assert isinstance(unknown_claim.evidence_refs, tuple)

    # Valid FACT claim
    valid_claim = Claim(
        id="claim-fact",
        subject="Stripe",
        predicate="provides_product",
        object_value="Payments",
        category=ClaimCategory.PRODUCT,
        classification=ClaimClassification.FACT,
        evidence_refs=["span_123"],
        supporting_quotes=["Payments for the internet"],
        confidence=0.85,
    )
    assert isinstance(valid_claim.evidence_refs, tuple)
    assert isinstance(valid_claim.supporting_quotes, tuple)
    assert valid_claim.supporting_quotes == ("Payments for the internet",)

    # Field reassignment fails
    with pytest.raises(ValidationError):
        valid_claim.confidence = 0.5

    with pytest.raises(ValidationError):
        valid_claim.supporting_quotes = ("tampered",)


# ── 3. Deterministic Extraction Tests ─────────────────────────────────────────

def test_deterministic_evidence_extractor_offsets():
    content = (
        "About Stripe\n\n"
        "Stripe is a financial infrastructure platform for businesses.\n"
        "Millions of companies from startups to Fortune 500s use our software.\n\n"
        "Responsibilities:\n"
        "- Build scalable distributed payment APIs.\n"
        "- Maintain 99.999% uptime guarantees.\n\n"
        "Qualifications:\n"
        "- 5+ years experience in backend systems."
    )
    
    doc = CrawledDocument(
        url="https://stripe.com/careers/backend",
        final_url="https://stripe.com/careers/backend",
        status_code=200,
        title="Backend Engineer | Stripe",
        content=content,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.JOB_LISTING,
        quality=DocumentQuality.VALID,
    )

    spans = DeterministicEvidenceExtractor.extract_document_spans(doc)
    assert len(spans) >= 4

    # INVARIANT: Every single extracted span's text matches doc.content[char_start:char_end] exactly
    for span in spans:
        exact_slice = doc.content[span.char_start:span.char_end]
        assert span.text == exact_slice
        assert span.document_hash == compute_document_hash(content)
        assert span.id == compute_span_id(span.document_hash, span.char_start, span.char_end)

    # Check section tracking
    sections = [s.section for s in spans]
    assert "About" in sections
    assert "Responsibilities" in sections
    assert "Qualifications" in sections

    # Repeat extraction to prove strict idempotence/determinism
    spans2 = DeterministicEvidenceExtractor.extract_document_spans(doc)
    assert [s.id for s in spans] == [s.id for s in spans2]
    assert [s.char_start for s in spans] == [s.char_start for s in spans2]
    assert [s.char_end for s in spans] == [s.char_end for s in spans2]


# ── 4. ClaimGraph Auto-Validation Invariants Tests ────────────────────────────

def test_claim_graph_valid_lifecycle():
    content = "Linear is the system for product development."
    doc = CrawledDocument(
        url="https://linear.app",
        final_url="https://linear.app",
        status_code=200,
        content=content,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )

    spans = DeterministicEvidenceExtractor.extract_document_spans(doc)
    assert len(spans) == 1
    span = spans[0]

    claim = Claim(
        id="claim_linear_overview",
        subject="Linear",
        predicate="is_system_for",
        object_value="product development",
        category=ClaimCategory.OVERVIEW,
        classification=ClaimClassification.FACT,
        evidence_refs=[span.id],
        confidence=0.85,
    )

    # Instantiation auto-validates without error
    graph = ClaimGraph(
        documents=[doc],
        evidence_spans=spans,
        claims=[claim],
    )
    assert isinstance(graph.documents, tuple)
    assert isinstance(graph.evidence_spans, tuple)
    assert isinstance(graph.claims, tuple)


def test_claim_graph_rejects_unresolved_evidence_ref():
    content = "Linear is the system for product development."
    doc = CrawledDocument(
        url="https://linear.app",
        final_url="https://linear.app",
        status_code=200,
        content=content,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    spans = DeterministicEvidenceExtractor.extract_document_spans(doc)

    # Claim points to a hallucinated / non-existent span ID
    invalid_claim = Claim(
        id="claim_hallucinated",
        subject="Linear",
        predicate="has_feature",
        object_value="Issue Tracking",
        category=ClaimCategory.PRODUCT,
        classification=ClaimClassification.FACT,
        evidence_refs=["span_hallucinated_id"],
        confidence=0.85,
    )

    # Auto-validation fails upon constructor call
    with pytest.raises(ClaimGraphValidationError, match="references non-existent EvidenceSpan"):
        ClaimGraph(
            documents=[doc],
            evidence_spans=spans,
            claims=[invalid_claim],
        )


def test_claim_graph_rejects_corrupted_span_text():
    content = "Linear is the system for product development."
    doc = CrawledDocument(
        url="https://linear.app",
        final_url="https://linear.app",
        status_code=200,
        content=content,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    doc_hash = compute_document_hash(content)
    
    # Span text tampered with after extraction
    corrupted_span = EvidenceSpan(
        id=compute_span_id(doc_hash, 0, len(content)),
        document_hash=doc_hash,
        source_url=doc.url,
        page_type=doc.page_type,
        section="Overview",
        char_start=0,
        char_end=len(content),
        text="Corrupted text that does not match slice",
        retrieved_at=datetime.now(timezone.utc),
    )

    with pytest.raises(ClaimGraphValidationError, match="text mismatch"):
        ClaimGraph(
            documents=[doc],
            evidence_spans=[corrupted_span],
            claims=[],
        )


def test_claim_graph_rejects_out_of_bounds_range():
    content = "Linear"
    doc = CrawledDocument(
        url="https://linear.app",
        final_url="https://linear.app",
        status_code=200,
        content=content,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    doc_hash = compute_document_hash(content)

    oob_span = EvidenceSpan(
        id=compute_span_id(doc_hash, 0, 100),
        document_hash=doc_hash,
        source_url=doc.url,
        page_type=doc.page_type,
        section="Overview",
        char_start=0,
        char_end=100,  # document only has 6 chars
        text="x" * 100,
        retrieved_at=datetime.now(timezone.utc),
    )

    with pytest.raises(ClaimGraphValidationError, match="exceeds doc content length"):
        ClaimGraph(
            documents=[doc],
            evidence_spans=[oob_span],
            claims=[],
        )


def test_claim_graph_rejects_ungrounded_supporting_quote():
    content = "Linear is the system for modern software development."
    doc = CrawledDocument(
        url="https://linear.app",
        final_url="https://linear.app",
        status_code=200,
        content=content,
        retrieved_at=datetime.now(timezone.utc),
        page_type=PageType.HOMEPAGE,
        quality=DocumentQuality.VALID,
    )
    spans = DeterministicEvidenceExtractor.extract_document_spans(doc)
    span = spans[0]

    # Claim has a valid evidence ref, but supporting_quote is NOT a substring of the span
    claim_with_fake_quote = Claim(
        id="claim_unsupported_quote",
        subject="Linear",
        predicate="customer_count",
        object_value="50,000 enterprise customers",
        category=ClaimCategory.TRACTION,
        classification=ClaimClassification.FACT,
        evidence_refs=[span.id],
        supporting_quotes=["Linear has 50,000 paying enterprise teams across 100 countries"],
        confidence=0.85,
    )

    with pytest.raises(ClaimGraphValidationError, match="supporting quote.*is not a substring"):
        ClaimGraph(
            documents=[doc],
            evidence_spans=spans,
            claims=[claim_with_fake_quote],
        )

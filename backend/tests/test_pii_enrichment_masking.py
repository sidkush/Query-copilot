"""Phase 1 Capability 3 — PII hardening for FEATURE_RETRIEVAL_DOC_ENRICHMENT
(landed 2026-04-28).

Two-layer defense in QueryEngine._extract_sample_values_for_table:
  Layer 1 — column-name filter: SENSITIVE_COLUMN_PATTERNS + admin-suppressed
            columns dropped BEFORE SELECT runs.
  Layer 2 — value-level redact: each extracted value passes through
            pii_masking.redact_pii_value (full-value '[REDACTED]' replacement
            on email/phone/ssn/cc/ip pattern match).

Plus suffix bump regression guard (_docv2 → _docv3) so pre-hardening unmasked
collections orphan rather than mix doc formats.
"""
from unittest.mock import patch, MagicMock

import pandas as pd


def _fresh_qe():
    """Construct QueryEngine with FEATURE_RETRIEVAL_DOC_ENRICHMENT=True +
    retrieval flags off (hash-v1 path). Mocks chromadb + SQLValidator so
    __init__ never touches real Chroma. Returns (qe, mock_client) so tests
    can inspect collection-name call args.
    """
    import query_engine as qe_module

    with patch.object(qe_module, "settings") as mock_s, \
         patch.object(qe_module.chromadb, "PersistentClient") as mock_client, \
         patch.object(qe_module, "SQLValidator") as mock_validator:
        mock_s.FEATURE_HYBRID_RETRIEVAL = False
        mock_s.FEATURE_MINILM_SCHEMA_COLLECTION = False
        mock_s.FEATURE_RETRIEVAL_DOC_ENRICHMENT = True
        mock_s.BENCHMARK_MODE = False
        mock_s.CHROMA_PERSIST_DIR = "/tmp/test_chroma_unused"
        mock_client.return_value = MagicMock()
        mock_validator.return_value = MagicMock()

        connector = MagicMock()
        connector.db_type.value = "sqlite"
        provider = MagicMock()
        provider.default_model = "test"
        provider.fallback_model = "test"

        qe = qe_module.QueryEngine(
            db_connector=connector, namespace="t1", provider=provider,
        )
        return qe, mock_client


def _stub_execute(qe, df: pd.DataFrame):
    """Return df verbatim from any execute_query call. Tests querying a
    column that should drop at Layer 1 will not hit this stub at all
    (drop happens before SELECT runs)."""
    qe.db.execute_query = MagicMock(return_value=df)


# ── 1. Layer 1 — sensitive column-name filter (SENSITIVE_COLUMN_PATTERNS) ──

def test_sensitive_column_email_dropped():
    """'email' substring matches SENSITIVE_COLUMN_PATTERNS; dropped before
    SELECT — never appears in enrichment output."""
    qe, _ = _fresh_qe()
    _stub_execute(qe, pd.DataFrame({"email": ["a@x.com", "b@y.com"]}))
    out = qe._extract_sample_values_for_table("users", [
        {"name": "email", "type": "VARCHAR"},
    ])
    assert "email" not in out, (
        f"sensitive column 'email' must be Layer-1 dropped; got {out!r}"
    )


def test_sensitive_column_ssn_dropped():
    qe, _ = _fresh_qe()
    _stub_execute(qe, pd.DataFrame({"ssn": ["123-45-6789"]}))
    out = qe._extract_sample_values_for_table("people", [
        {"name": "ssn", "type": "VARCHAR"},
    ])
    assert "ssn" not in out


def test_sensitive_column_phone_dropped():
    qe, _ = _fresh_qe()
    _stub_execute(qe, pd.DataFrame({"phone_number": ["555-555-1212"]}))
    out = qe._extract_sample_values_for_table("contacts", [
        {"name": "phone_number", "type": "VARCHAR"},
    ])
    assert "phone_number" not in out


def test_customer_name_passes_known_gap():
    """Documents known gap: 'name' / 'first_name' / 'customer_name' are NOT
    in SENSITIVE_COLUMN_PATTERNS. Per Capability 3 deferred decision —
    name-pattern expansion would over-mask benign 'table_name',
    'column_name', 'display_name', 'category_name'. Tracked separately.

    This test guards against a silent regression where someone adds 'name'
    to SENSITIVE_COLUMN_PATTERNS without the false-positive review.
    """
    qe, _ = _fresh_qe()
    _stub_execute(qe, pd.DataFrame({"customer_name": ["John Smith", "Jane Doe"]}))
    out = qe._extract_sample_values_for_table("customers", [
        {"name": "customer_name", "type": "VARCHAR"},
    ])
    assert "customer_name" in out, (
        "customer_name passes Layer 1 today (known gap deferred). If this "
        "starts failing, name-pattern expansion landed — confirm false-"
        "positive review (table_name, display_name etc.) and update tests."
    )


# ── 5. Layer 1 — admin-flagged columns (suppressed-set secondary check) ──

def test_admin_suppressed_column_dropped(monkeypatch):
    """Admin-flagged column 'internal_notes' (NOT in SENSITIVE_COLUMN_PATTERNS)
    must drop via the suppressed-set lookup. Confirms admin-flagged PII
    paths through the same Layer 1 gate."""
    import query_engine as qe_module
    monkeypatch.setattr(
        qe_module, "get_suppressed_set",
        lambda ns: {"internal_notes"},
    )
    qe, _ = _fresh_qe()
    _stub_execute(qe, pd.DataFrame({"internal_notes": ["secret info"]}))
    out = qe._extract_sample_values_for_table("entries", [
        {"name": "internal_notes", "type": "VARCHAR"},
    ])
    assert "internal_notes" not in out, (
        f"admin-suppressed column must be dropped; got {out!r}"
    )


# ── 6. Layer 2 — PII-bearing value in non-sensitive column redacted ───────

def test_pii_value_in_nonsensitive_column_redacted():
    """Column 'notes' passes Layer 1 (no sensitive pattern match). Layer 2
    full-value redact replaces values containing email/phone/ssn/cc/ip
    with '[REDACTED]'. Non-PII values pass through unchanged."""
    qe, _ = _fresh_qe()
    _stub_execute(qe, pd.DataFrame({
        "notes": ["contact: user@example.com", "follow-up call"],
    }))
    out = qe._extract_sample_values_for_table("tasks", [
        {"name": "notes", "type": "TEXT"},
    ])
    assert "notes" in out
    assert out["notes"][0] == "[REDACTED]", (
        f"value containing email must be Layer-2 redacted; got {out['notes'][0]!r}"
    )
    assert out["notes"][1] == "follow-up call", (
        "non-PII value must pass through unchanged"
    )


# ── 7. Non-PII column passes through (no false positives) ─────────────────

def test_non_pii_column_passes_through():
    """Column 'colour' (no sensitive substring, no PII regex match in values)
    passes both Layer 1 and Layer 2 unchanged."""
    qe, _ = _fresh_qe()
    _stub_execute(qe, pd.DataFrame({"colour": ["Red", "Blue", "Green"]}))
    out = qe._extract_sample_values_for_table("items", [
        {"name": "colour", "type": "VARCHAR"},
    ])
    assert out["colour"] == ["Red", "Blue", "Green"]


# ── 8. FK hint extraction unaffected by masking changes ───────────────────

def test_fk_hints_unaffected():
    """FK metadata extraction reads schema info only — never queries column
    values. Capability 3 PII layers cannot reach it. Format stays
    '(col) -> ref_table(ref_col)' (Tier 3 Fix #4 reverted format)."""
    from query_engine import QueryEngine
    info = {
        "foreign_keys": [
            {"constrained_columns": ["eye_colour_id"],
             "referred_table": "colours",
             "referred_columns": ["id"]},
        ],
    }
    hints = QueryEngine._extract_fk_hints(info, "heroes")
    assert hints == ["(eye_colour_id) -> colours(id)"]


# ── 9. Phase 1 default-flip regression guard ────────────────────────────

def test_phase1_doc_enrichment_default_True():
    """Phase 1 (2026-04-28) flip: production default for
    FEATURE_RETRIEVAL_DOC_ENRICHMENT is True post PII hardening.
    Asserts on Pydantic field metadata, decoupled from .env state so
    the test is stable across operator-supplied env files."""
    from config import Settings
    field = Settings.model_fields["FEATURE_RETRIEVAL_DOC_ENRICHMENT"]
    assert field.default is True, (
        "FEATURE_RETRIEVAL_DOC_ENRICHMENT must default True post Phase 1 Cap 3 flip"
    )


# ── 10. Suffix _docv3 regression guard ────────────────────────────────────

def test_collection_suffix_is_docv3_when_enriched():
    """Capability 3 suffix bump (_docv2 → _docv3) regression guard.
    Ensures pre-hardening unmasked collections orphan rather than mix
    doc formats with the post-hardening payload."""
    _, mock_client = _fresh_qe()
    names = [
        call.kwargs.get("name", "")
        for call in mock_client.return_value.get_or_create_collection.call_args_list
    ]
    schema_names = [n for n in names if n.startswith("schema_context_")]
    assert any("_docv3" in n for n in schema_names), (
        f"expected _docv3 suffix on at least one schema collection; "
        f"got {schema_names!r}"
    )
    assert not any("_docv2" in n for n in schema_names), (
        f"_docv2 suffix must not reappear; got {schema_names!r}"
    )

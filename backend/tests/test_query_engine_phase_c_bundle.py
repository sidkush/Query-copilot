"""Phase C bundle (2026-04-27 council Theme 1+2) behavioral tests.

Companion to test_query_engine_hybrid_retrieval.py (flag-gating /
collection-naming) and test_query_engine_schema_embedder_gating.py
(embedder selection). This file exercises the actual mechanism:
  - Theme 1A: snake_case-aware BM25 tokenizer
  - Theme 1B: zero-score guard excludes BM25 from RRF when no signal
  - Theme 2:  sample-value extraction + FK hint formatting + identifier
              quoting hardening
"""
from unittest.mock import MagicMock, patch
import pandas as pd
import pytest


# ── Theme 1A: snake_case tokenizer ────────────────────────────────


def test_bm25_tokenizer_splits_snake_case():
    """eye_colour_id should tokenize to ['eye','colour','id'] post-fix.
    Pre-fix r"\\w+" kept it as a single token → BM25 zero-score → RRF
    degenerated to insertion-order noise (preflight evidence)."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)  # bypass __init__ — only tokenizer needed
    out = qe._tokenize_for_bm25("eye_colour_id")
    assert out == ["eye", "colour", "id"], f"got {out!r}"


def test_bm25_tokenizer_handles_mixed_case_and_punctuation():
    """Lowercases, splits on non-alphanumeric runs, drops underscores."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    assert qe._tokenize_for_bm25("Hero_Eye-Color (RGB)") == [
        "hero", "eye", "color", "rgb"
    ]


def test_bm25_tokenizer_preserves_alphanumeric_runs():
    """Numeric-suffixed identifiers stay grouped (e.g. 'col_v2' → 'col','v2')."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    assert qe._tokenize_for_bm25("table_v2_id_123") == [
        "table", "v2", "id", "123"
    ]


# ── Theme 1B: zero-score guard ────────────────────────────────────


def _build_qe_with_mocked_indexes(bm25_scores_value, chroma_ids):
    """Construct a minimal QueryEngine with hybrid path active + mocked
    BM25 + Chroma collections, returning controlled score lists."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe._hybrid_enabled = True
    qe._doc_enriched = False
    # BM25 mock — every doc gets the same score
    qe._bm25_index = MagicMock()
    qe._bm25_index.get_scores = MagicMock(return_value=bm25_scores_value)
    qe._bm25_corpus = [
        {"id": f"schema_t{i}", "doc": f"Table: t{i}", "metadata": {}}
        for i in range(len(bm25_scores_value))
    ]
    # Chroma mock — counts + query
    qe.schema_collection = MagicMock()
    qe.schema_collection.count = MagicMock(return_value=len(chroma_ids))
    qe.schema_collection.query = MagicMock(return_value={
        "ids": [chroma_ids],
        "documents": [[f"Table: {tid.replace('schema_', '')}" for tid in chroma_ids]],
        "metadatas": [[{} for _ in chroma_ids]],
        "distances": [[0.5 for _ in chroma_ids]],
    })
    return qe


def test_zero_score_guard_excludes_bm25_when_all_zero():
    """All-zero BM25 → RRF must not include BM25 channel; output ranking
    must follow Chroma order verbatim (since BM25 contributes nothing)."""
    qe = _build_qe_with_mocked_indexes(
        bm25_scores_value=[0.0, 0.0, 0.0, 0.0],
        chroma_ids=["schema_t0", "schema_t1", "schema_t2", "schema_t3"],
    )
    out = qe.find_relevant_tables("any question", top_k=4)
    # When BM25 is excluded, RRF score = 1/(60+rank+1) for chroma only,
    # so output order matches chroma input order.
    assert out["ids"][0] == ["schema_t0", "schema_t1", "schema_t2", "schema_t3"]


def test_zero_score_guard_includes_bm25_when_signal_present():
    """One non-zero BM25 score above threshold → BM25 contributes to RRF.
    Useful-signal bar is _BM25_MIN_USEFUL_SCORE (0.1)."""
    from query_engine import QueryEngine
    # Reverse BM25 ranking vs Chroma: BM25 prefers t3, Chroma prefers t0.
    # If BM25 useful, fused output should pull t3 up.
    qe = _build_qe_with_mocked_indexes(
        bm25_scores_value=[0.0, 0.0, 0.0, 0.5],  # t3 wins BM25 strongly
        chroma_ids=["schema_t0", "schema_t1", "schema_t2", "schema_t3"],
    )
    out = qe.find_relevant_tables("any question", top_k=4)
    fused_ids = out["ids"][0]
    # t3 should outrank t1 and t2 because it's #1 in BM25 and #4 in Chroma.
    # Pure Chroma would have t3 last; fused must show BM25 lift.
    assert fused_ids.index("schema_t3") < fused_ids.index("schema_t1"), (
        f"BM25 signal must lift t3 above t1; got order {fused_ids}"
    )


def test_zero_score_guard_threshold_is_explicit_constant():
    """Regression guard: the threshold constant must be a named, non-zero
    float — not a bare magic number or `== 0` check that misses 0.001-noise.
    Documents the design choice in the test surface."""
    from query_engine import QueryEngine
    assert hasattr(QueryEngine, "_BM25_MIN_USEFUL_SCORE")
    assert QueryEngine._BM25_MIN_USEFUL_SCORE > 0.0
    assert QueryEngine._BM25_MIN_USEFUL_SCORE < 1.0


# ── Theme 2: sample-value extraction + FK hints ────────────────────


def test_extract_sample_values_categorical_only():
    """Numeric / date / boolean columns are skipped; only VARCHAR/TEXT/CHAR
    feed sample-value extraction (where lexical match against question
    tokens is meaningful)."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe.db = MagicMock()
    qe.db.db_type = MagicMock()
    qe.db.execute_query = MagicMock(return_value=pd.DataFrame({
        "colour": ["Amber", "Blue", "Green"],
    }))
    columns = [
        {"name": "id", "type": "INTEGER"},
        {"name": "colour", "type": "VARCHAR"},
        {"name": "rgb", "type": "INTEGER"},  # numeric — must be skipped
        {"name": "is_primary", "type": "BOOLEAN"},  # not categorical
    ]
    samples = qe._extract_sample_values_for_table("colour", columns)
    assert "colour" in samples
    assert samples["colour"] == ["Amber", "Blue", "Green"]
    assert "id" not in samples
    assert "rgb" not in samples
    assert "is_primary" not in samples


def test_extract_sample_values_caps_at_max_cols():
    """ENRICH_MAX_COLS_PER_TABLE bounds doc growth — first N categorical
    columns only. Without the cap, wide string-heavy schemas (e.g. CRM)
    would balloon Chroma docs into multi-KB blobs."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe.db = MagicMock()
    qe.db.db_type = MagicMock()
    qe.db.execute_query = MagicMock(return_value=pd.DataFrame({"x": ["v"]}))
    columns = [{"name": f"col{i}", "type": "VARCHAR"} for i in range(20)]
    samples = qe._extract_sample_values_for_table("wide", columns)
    assert len(samples) <= QueryEngine._ENRICH_MAX_COLS_PER_TABLE


def test_extract_sample_values_per_column_failure_drops_only_that_col():
    """Best-effort: a SQL error or timeout on one column must not abort
    the whole table's enrichment. Each column is wrapped in try/except."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe.db = MagicMock()
    qe.db.db_type = MagicMock()

    call_count = [0]
    def flaky_execute(sql, timeout=None):
        call_count[0] += 1
        if call_count[0] == 1:
            raise RuntimeError("simulated timeout on first column")
        return pd.DataFrame({"x": ["good_value"]})

    qe.db.execute_query = flaky_execute
    columns = [
        {"name": "first_col", "type": "VARCHAR"},  # will fail
        {"name": "second_col", "type": "TEXT"},    # will succeed
    ]
    samples = qe._extract_sample_values_for_table("t", columns)
    assert "first_col" not in samples, "failed column must be dropped, not error-out"
    assert samples.get("second_col") == ["good_value"]


def test_fk_hint_formatting_handles_partial_metadata():
    """FK metadata can have None / missing fields (BIRD's
    debit_card_specializing surfaces this). Must skip malformed entries
    without exception — same defensive pattern as inspect_schema.

    Tier 3 Fix #4 REVERTED (post-main-150-tier3 regression). Format restored
    to `(col) -> ref_table(col)` (no source-table prefix). table_name kwarg
    accepted as no-op for forward-compat with future comment-style addition.
    """
    from query_engine import QueryEngine
    info = {
        "foreign_keys": [
            {"constrained_columns": ["a"], "referred_table": "t2",
             "referred_columns": ["b"]},
            {"constrained_columns": ["c"], "referred_table": None,  # malformed
             "referred_columns": ["d"]},
            {"constrained_columns": ["e"], "referred_table": "t3",
             "referred_columns": [None]},  # None in list — defended
        ],
    }
    out = QueryEngine._extract_fk_hints(info, "t1")
    # table_name arg is accepted but ignored post-Tier-3-revert
    assert "(a) -> t2(b)" in out, f"format mismatch; got {out!r}"
    assert "(e) -> t3(?)" in out
    assert len(out) == 2  # second entry skipped (None ref_table)
    # No source table prefix in format
    assert "t1(a)" not in out[0]


def test_quote_identifier_escapes_embedded_quote():
    """Defense-in-depth: identifier with embedded quote char must double
    the quote, not break out of the wrapping quotes. Theme 2 SELECTs run
    via execute_query bypassing SQLValidator since SQL shape is fixed."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe.db = MagicMock()
    qe.db.db_type = MagicMock()  # default ANSI path
    out = qe._quote_identifier('odd"name')
    assert out == '"odd""name"', f"got {out!r}"


# ── Theme 2 train_schema integration ──────────────────────────────


def test_train_schema_injects_sample_values_when_enriched():
    """End-to-end: when self._doc_enriched=True, train_schema appends
    'Sample values:' block to each doc before upsert. This is the lever
    that closes the color↔colour vocab gap (Theme 2 mechanism)."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe._doc_enriched = True
    qe._hybrid_enabled = False
    qe.db = MagicMock()
    qe.db.db_type = MagicMock()
    qe.db.get_ddl = MagicMock(return_value=[])
    qe.db.get_schema_info = MagicMock(return_value={
        "colour": {
            "columns": [
                {"name": "id", "type": "INTEGER"},
                {"name": "colour", "type": "VARCHAR"},
            ],
            "foreign_keys": [],
        }
    })
    qe.db.execute_query = MagicMock(return_value=pd.DataFrame({
        "colour": ["Amber", "Blue", "Green"],
    }))
    qe.schema_collection = MagicMock()

    n = qe.train_schema()
    assert n == 1
    upsert_call = qe.schema_collection.upsert.call_args
    docs = upsert_call.kwargs["documents"]
    assert "Sample values:" in docs[0]
    assert "'Amber'" in docs[0]
    assert "'Blue'" in docs[0]


def test_train_schema_skips_enrichment_when_flag_off():
    """Production default (self._doc_enriched=False) must produce
    pre-bundle byte-identical doc — no Sample values, no FK block."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe._doc_enriched = False
    qe._hybrid_enabled = False
    qe.db = MagicMock()
    qe.db.get_ddl = MagicMock(return_value=[])
    qe.db.get_schema_info = MagicMock(return_value={
        "colour": {
            "columns": [{"name": "id", "type": "INTEGER"}],
            "foreign_keys": [{"constrained_columns": ["id"],
                              "referred_table": "x",
                              "referred_columns": ["y"]}],
        }
    })
    qe.schema_collection = MagicMock()

    qe.train_schema()
    upsert_call = qe.schema_collection.upsert.call_args
    doc = upsert_call.kwargs["documents"][0]
    assert "Sample values" not in doc
    assert "Foreign keys" not in doc

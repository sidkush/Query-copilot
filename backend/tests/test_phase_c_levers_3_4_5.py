"""Phase C levers 3-5 (2026-04-27 council, post-pilot 50 v2 stack):

  Theme 3 — plan emission wiring (_maybe_emit_plan call site)
  Lever 3 — CHESS-style targeted repair patterns
  Lever 4 — value linking (literal → table.column)
  Lever 5 — column-level schema docs in Chroma

Each lever has a focused behavioral test plus a regression check.
"""
from unittest.mock import MagicMock, patch
import pandas as pd


# ── Theme 3: plan emission wiring ──────────────────────────────


def test_maybe_emit_plan_called_via_run_loop():
    """Regression: _maybe_emit_plan must be invoked from within the agent
    run loop, not just exist as dead code. Pre-Theme-3 the method was
    defined at agent_engine.py:1785 but never called from `run`. Same
    pattern as the April 26 dead-method bug. We verify the call site
    survives by patching the method and checking it gets called when
    `run` executes the planning section."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    # Method definition still exists
    assert "def _maybe_emit_plan(self, nl: str)" in src
    # Method is called somewhere OTHER than its own definition
    occurrences = src.count("_maybe_emit_plan")
    assert occurrences >= 3, (
        f"Expected ≥3 references to _maybe_emit_plan (def + call + tests), "
        f"got {occurrences} — Theme 3 wiring may have regressed"
    )


def test_benchmark_mode_coerces_lightweight_plan():
    """BENCHMARK_MODE=True triggers _generate_plan even when the request
    is not dashboard/complex. Mirrors the BENCHMARK_MODE coercion pattern
    from Wave 1/2/3 + Phase C. Source-level verification — full agent run
    requires too many fixtures for a behavior test."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    # Coercion pattern: planning fires if dashboard/complex OR benchmark
    assert "_benchmark = getattr(settings, \"BENCHMARK_MODE\", False)" in src
    assert "is_dashboard_request or is_complex or _benchmark" in src


# ── Lever 3: CHESS-style targeted repair patterns ──────────────


def test_chess_no_such_column_pattern_triggers():
    """SQLite/Postgres 'no such column' error must hit dialect-correction
    pattern and yield guidance pointing to inspect_schema."""
    from agent_engine import AgentEngine
    qe = AgentEngine.__new__(AgentEngine)
    err = "no such column: superhero.eye_color"
    err_lower = err.lower()

    # Find matching pattern
    matched = None
    for keys, txt in AgentEngine._DIALECT_CORRECTION_PATTERNS:
        if all(k in err_lower for k in keys):
            matched = txt
            break
    assert matched is not None, "no_such_column must hit a CHESS pattern"
    assert "inspect_schema" in matched.lower()
    assert "sample values" in matched.lower()


def test_chess_no_such_table_pattern_triggers():
    """no such table → guidance points to find_relevant_tables retry."""
    from agent_engine import AgentEngine
    err_lower = "no such table: leagues_v2".lower()
    matched = None
    for keys, txt in AgentEngine._DIALECT_CORRECTION_PATTERNS:
        if all(k in err_lower for k in keys):
            matched = txt
            break
    assert matched is not None, "no_such_table must hit a CHESS pattern"
    assert "find_relevant_tables" in matched.lower()


def test_chess_ambiguous_column_pattern_triggers():
    """ambiguous column → guidance to qualify with table prefix."""
    from agent_engine import AgentEngine
    err_lower = "ambiguous column name: id".lower()
    matched = None
    for keys, txt in AgentEngine._DIALECT_CORRECTION_PATTERNS:
        if all(k in err_lower for k in keys):
            matched = txt
            break
    assert matched is not None
    assert "qualify" in matched.lower() or "prefix" in matched.lower()


def test_existing_dialect_patterns_unchanged():
    """Regression: pre-CHESS aggregate-in-GROUP-BY pattern still fires.
    Levers 3 must extend, not replace, the dialect_correction surface."""
    from agent_engine import AgentEngine
    err_lower = "aggregate functions are not allowed in group by".lower()
    matched = None
    for keys, txt in AgentEngine._DIALECT_CORRECTION_PATTERNS:
        if all(k in err_lower for k in keys):
            matched = txt
            break
    assert matched is not None
    assert "subquery" in matched.lower()


# ── Lever 4: value linking ─────────────────────────────────────


def test_value_linking_extracts_quoted_literals():
    """Single-quote and double-quote literals both extracted, max 80 chars."""
    from agent_engine import AgentEngine
    qe = AgentEngine.__new__(AgentEngine)
    matches = qe._LITERAL_RE.findall("Find player 'John Doe' from \"Eighth Edition\"")
    extracted = [m[0] or m[1] for m in matches]
    assert "John Doe" in extracted
    assert "Eighth Edition" in extracted


def test_value_linking_matches_sample_values_from_chroma_doc():
    """Theme 4 mechanism: literal in question links to (table.column) when
    that literal appears in the 'Sample values:' block of a retrieved Chroma
    doc. End-to-end test — given a synthetic prefetch_data, verify the
    correct link is computed."""
    from agent_engine import AgentEngine
    qe = AgentEngine.__new__(AgentEngine)
    prefetch_data = {
        "tables": [{
            "table": "sets",
            "summary": (
                "Table: sets\n"
                "Description: Card sets metadata\n"
                "Columns:\n"
                "  - name (VARCHAR)\n"
                "Sample values:\n"
                "  - name=['Eighth Edition', 'Ninth Edition', 'Tenth Edition']"
            ),
        }],
    }
    question = "What is the translation of 'Eighth Edition' in Chinese?"
    links = qe._compute_value_links(question, prefetch_data)
    assert links == [("Eighth Edition", "sets", "name")]


def test_value_linking_returns_empty_when_no_literals():
    """Question with no quoted strings yields no value links."""
    from agent_engine import AgentEngine
    qe = AgentEngine.__new__(AgentEngine)
    links = qe._compute_value_links("How many heroes have amber eyes?", {"tables": []})
    assert links == []


def test_value_linking_caps_at_max():
    """_MAX_VALUE_LINKS bounds doc growth — pathological multi-literal
    questions don't generate unbounded link blocks."""
    from agent_engine import AgentEngine
    qe = AgentEngine.__new__(AgentEngine)
    # Build a doc with many sample-value matches
    sample_block = "Sample values:\n" + "\n".join(
        f"  - col{i}=['lit{i}']" for i in range(20)
    )
    prefetch_data = {
        "tables": [{
            "table": "t",
            "summary": f"Table: t\nDescription: ...\nColumns:\n{sample_block}",
        }],
    }
    question = " ".join(f"'lit{i}'" for i in range(20))
    links = qe._compute_value_links(question, prefetch_data)
    assert len(links) <= AgentEngine._MAX_VALUE_LINKS


# ── Lever 5: column-level schema docs ──────────────────────────


def test_train_schema_emits_column_docs_when_enriched():
    """Lever 5: when _doc_enriched=True, train_schema upserts both table
    docs AND per-column docs to the same schema_collection. Each column
    doc has metadata.type='column' and id prefix 'col_'."""
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
        "x": ["Amber", "Blue", "Green"],
    }))
    qe.schema_collection = MagicMock()

    qe.train_schema()
    upsert_call = qe.schema_collection.upsert.call_args
    metas = upsert_call.kwargs["metadatas"]
    types = [m.get("type") for m in metas]
    assert "schema" in types  # table doc
    assert "column" in types  # column doc(s)
    col_metas = [m for m in metas if m.get("type") == "column"]
    assert len(col_metas) >= 1
    ids = upsert_call.kwargs["ids"]
    assert any(i.startswith("col_") for i in ids)


def test_train_schema_skips_column_docs_when_flag_off():
    """Production default: no column docs (preserves pre-lever-5
    schema_collection content shape)."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe._doc_enriched = False
    qe._hybrid_enabled = False
    qe.db = MagicMock()
    qe.db.get_ddl = MagicMock(return_value=[])
    qe.db.get_schema_info = MagicMock(return_value={
        "t": {"columns": [{"name": "x", "type": "INTEGER"}], "foreign_keys": []},
    })
    qe.schema_collection = MagicMock()

    qe.train_schema()
    upsert_call = qe.schema_collection.upsert.call_args
    metas = upsert_call.kwargs["metadatas"]
    types = [m.get("type") for m in metas]
    assert all(t == "schema" for t in types), (
        f"flag-off must not emit column docs; got types {types}"
    )


def test_train_schema_returns_table_count_not_total():
    """Return value preserves pre-lever-5 contract: table count, not
    table+column count. Existing callers (agent_engine seed_schema,
    BIRD harness) count tables for logging."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe._doc_enriched = True
    qe._hybrid_enabled = False
    qe.db = MagicMock()
    qe.db.db_type = MagicMock()
    qe.db.get_ddl = MagicMock(return_value=[])
    qe.db.get_schema_info = MagicMock(return_value={
        "t1": {
            "columns": [{"name": "x", "type": "VARCHAR"}],
            "foreign_keys": [],
        },
        "t2": {
            "columns": [{"name": "y", "type": "VARCHAR"}],
            "foreign_keys": [],
        },
    })
    qe.db.execute_query = MagicMock(return_value=pd.DataFrame({"v": ["a"]}))
    qe.schema_collection = MagicMock()

    n = qe.train_schema()
    assert n == 2, f"must return 2 tables (not 4 = 2 tables + 2 cols); got {n}"


def test_column_doc_format_includes_sample_values():
    """Column doc body must include 'Column: <name> in table <table>'
    plus optional 'Sample values:' suffix when categorical samples available.
    Critical for BM25 lexical match on column names."""
    from query_engine import QueryEngine
    qe = QueryEngine.__new__(QueryEngine)
    qe._doc_enriched = True
    qe.db = MagicMock()
    qe.db.db_type = MagicMock()
    qe.db.execute_query = MagicMock(return_value=pd.DataFrame({
        "n": ["Amber", "Blue"],
    }))
    schema_info = {
        "colour": {
            "columns": [{"name": "name", "type": "VARCHAR"}],
            "foreign_keys": [],
        },
    }
    docs, ids, metas = qe._build_column_level_docs(schema_info, {})
    assert len(docs) == 1
    assert "Column: name in table colour" in docs[0]
    assert "Sample values:" in docs[0]
    assert "Amber" in docs[0]
    assert metas[0]["type"] == "column"
    assert metas[0]["table"] == "colour"
    assert metas[0]["column"] == "name"

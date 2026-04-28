"""Tier 2 targeted fixes (2026-04-27, post main_150_tier1 measurement).

Tier 1 lesson: targeted/structural fixes (Fix 1 silent except, Fix 2 CHESS
budget, Fix 3 join_path auto-trigger, Fix 4 yearmonth date hint) had clean
attribution. Broad LLM-steering directives (Fix 5 JOIN cardinality)
self-cancelled with -0.7pts net. Tier 2 sticks to targeted/structural only.

  Fix A — compaction protection for schema (council R32, qid 125 189 89 136 137)
  Fix B — column_hints same-name disambiguation via value_links (council R8+R9, qid 440)
  Fix C — SQLite dialect hint expansion (council R10+R28, qid 31 665 1255)
  Fix D — DROPPED after audit: 0 of 18 LIMIT-mismatch candidates would pass
"""
from unittest.mock import MagicMock, patch
import json


# ── Fix A: compaction protection for schema results ──────────────


def test_fix_a_full_preservation_still_reverted():
    """Fix A (FULL schema-result preservation) was REVERTED post main_150_tier2
    (-4.7pts at scale; cost-cap pressure on challenging tier). Tier 3 Fix #2
    (compressed schema summary) was ALSO REVERTED post main_150_tier3 (-10pts;
    even ~10% preservation hit cost-cap on thrombosis_prediction). Both
    schema-preservation attempts failed under cost-cap budget. The compaction-
    bounds contract is currently load-bearing with no single-shot successor."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    # No Fix A or Fix #2 markers should remain active in code
    assert "skipped_schema" not in src
    assert "schema_compressed" not in src
    assert "[Schema:" not in src
    # Both reversion lessons preserved as comments
    assert "Tier 2 Fix A also REVERTED" in src or "Tier 3 Fix #2 REVERTED" in src
    assert "cost-cap" in src.lower()


def test_compaction_normal_behavior_restored():
    """Post-revert: long inspect_schema results MUST be compacted to a stub
    like other tool_results. This is the pre-Tier-2 contract that bounded
    cost-cap headroom on multi-iteration runs."""
    from agent_engine import AgentEngine
    eng = AgentEngine.__new__(AgentEngine)
    long_schema = (
        "Table: superhero\n"
        "Columns:\n  id INTEGER\n  name TEXT\n"
        + ("padding line\n" * 50)
    )
    assert len(long_schema) > 200

    messages = []
    for i in range(8):
        messages.append({"role": "assistant", "content": "..."})
        messages.append({
            "role": "user",
            "content": [{
                "type": "tool_result",
                "tool_use_id": f"id_{i}",
                "content": long_schema,
            }],
        })
    eng._compact_tool_context(messages)

    # The text-shape inspect_schema result hits the JSON-parse-fails fallback
    # → compacts to [Tool result: ...] stub
    compacted = 0
    for msg in messages[:-4]:
        if msg.get("role") != "user":
            continue
        for item in msg.get("content", []):
            if item.get("type") == "tool_result":
                if item["content"].startswith("[") and len(item["content"]) < 200:
                    compacted += 1
    assert compacted > 0, "post-revert, long schema must compact again"


# ── Fix B: column_hints same-name disambiguation ──────────────────


def test_column_hits_dropped_when_value_link_resolves_to_other_table():
    """qid 440 regression: literal 'A Pedra Fellwar' lives in foreign_data.name.
    cards.name also has 'A Pedra Fellwar' as sample, but the canonical
    table for translations IS foreign_data. column_hits surfacing cards.name
    steered agent wrong. Fix: when value_links pinpoints (foreign_data, name)
    for a literal, drop col_hits for cards.name (same column on diff table).
    Source-level check since the filter logic is inline in run()."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    # Filter logic must be present
    assert "Tier 2 fix B" in src
    assert "_compute_value_links(question, prefetch_data)" in src
    # Exact filter line — drops same-name col on different table
    assert "_vl_pairs" in src or "value_link_pairs" in src.lower()


def test_value_links_marks_ambiguous_literals():
    """When a literal matches multiple (table, col) pairs (e.g., literal in
    BOTH cards.name and foreign_data.name), the value_links block surfaces
    ALL matches with an 'ambiguous' tag, prompting agent to use other
    question constraints to disambiguate rather than committing to first."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    assert "_ambiguous_lits" in src
    assert "ambiguous" in src
    assert "use question context to disambiguate" in src


# ── Fix C: SQLite dialect hint expansion ──────────────────────────


def test_sqlite_hints_include_strftime_for_year_extraction():
    """qid 665 codebase_community runtime_error: agent used MySQL YEAR(col)
    instead of SQLite STRFTIME('%Y', col). Static dialect text — not LLM
    steering — adds the explicit no-YEAR()-use-STRFTIME hint."""
    from agent_engine import AgentEngine
    sqlite_hints = AgentEngine.DIALECT_HINTS.get("sqlite", [])
    joined = " ".join(sqlite_hints)
    assert "STRFTIME" in joined
    assert "YEAR()" in joined or "no YEAR" in joined.lower()


def test_sqlite_hints_warn_about_identifier_quoting():
    """qid 31 california_schools syntax_error: agent used bare 'School Name'
    column. Hint must explicitly tell agent to backtick-quote identifiers
    with spaces."""
    from agent_engine import AgentEngine
    sqlite_hints = AgentEngine.DIALECT_HINTS.get("sqlite", [])
    joined = " ".join(sqlite_hints)
    assert "backtick" in joined.lower() or "`" in joined


def test_sqlite_hints_cover_integer_division_pitfall():
    """SQLite INTEGER division truncates. CAST(... AS REAL) for ratios.
    Static text — not the broad-directive Fix 5 was. Hint applies to
    queries with ratio/percentage in NL."""
    from agent_engine import AgentEngine
    sqlite_hints = AgentEngine.DIALECT_HINTS.get("sqlite", [])
    joined = " ".join(sqlite_hints)
    assert "CAST" in joined and "REAL" in joined


def test_sqlite_hints_no_concat_function():
    """SQLite has no CONCAT() — must use || operator. Catches MySQL/Postgres
    transpile errors."""
    from agent_engine import AgentEngine
    sqlite_hints = AgentEngine.DIALECT_HINTS.get("sqlite", [])
    joined = " ".join(sqlite_hints)
    assert "||" in joined


# ── Fix D: LIMIT 5000 lever DROPPED ──────────────────────────────


def test_limit_5000_audit_decision_recorded():
    """Council R2 claimed 18-22 of 53 sql_logic failures were LIMIT-corrupted.
    Audit (scripts/audit_limit_5000.py) replayed predicted SQL without LIMIT
    against BIRD SQLite for all 18 candidates: 0 of 18 would pass. Lever
    DROPPED. This test exists so the decision is encoded — re-adding a
    blanket LIMIT-skip directive would be a regression to broad-steering."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    # No "skip LIMIT for COUNT/MAX/MIN/SUM" directive should exist
    assert "skip LIMIT for COUNT" not in src
    assert "no LIMIT for aggregate" not in src.lower()

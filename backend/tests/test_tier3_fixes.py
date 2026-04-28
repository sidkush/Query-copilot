"""Tier 3 fixes (2026-04-27, post main_150_tier2_minus_a 54.0%).

Stacked under the new "predict-before-implement, measure-once" protocol.
Predictions document: benchmarks/bird/tier3_predictions.md

  Fix #1 — Tighten Fix C INSTR + || concat hints (qid 866, 1464 regressions)
  Fix #2 — Compressed schema summary in compaction (council R32)
  Fix #3 — R20 RANK ties hint (council R20, qid 17/41/31)
  Fix #4 — R24 FK direction format (council R24, qid 906/1387/896)
  Fix #5 — Silent except audit expansion (council R5)
  Fix #6 — _set_final_answer investigation (no code change)
"""
from unittest.mock import MagicMock
import json


# ── Fix #1: tightened Fix C hints ──────────────────────────────


def test_fix1_tightening_reverted():
    """Fix #1 (tighten Fix C INSTR + || hints) was REVERTED post-main-150-tier3
    (-10pts net). Adding 'ONLY when explicit' qualifier weakened the directive
    enough that agent stopped applying SQLite-specific guidance even on
    questions where Fix C was winning (qid 563, 598, 1153 lost). Reversion
    restores original strong directive form."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    # Tightened qualifier strings must NOT be present
    assert "ONLY when the question explicitly asks" not in src
    assert "NOT interchangeable" not in src
    # Reversion comment retained
    assert "Tier 3 Fix #1 REVERTED" in src


# ── Fix #2: compressed schema summary ──────────────────────────


def test_fix2_compressed_schema_reverted():
    """Fix #2 (compressed schema summary) was REVERTED post-main-150-tier3
    (-10pts; 4 no_sql cluster on thrombosis_prediction). Even ~10% of full
    preservation hit cost-cap pressure on schema-heavy DBs. Cost-cap pressure
    is more sensitive than estimated. Fix #2 successor needs different
    mechanism (Tier 4 ticket spawned)."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    # Tier 3 Fix #2 markers must NOT be present
    assert "[Schema:" not in src
    assert "schema_compressed" not in src
    assert "_SCHEMA_COL_LINE_RE" not in src
    # Reversion comment retained
    assert "Tier 3 Fix #2 REVERTED" in src


# ── Fix #3: R20 RANK ties hint ─────────────────────────────────


def test_rank_ties_hint_present():
    """Static dialect text added to SQLite hint block. Targets qids 17, 41, 31."""
    from agent_engine import AgentEngine
    sqlite_hints = AgentEngine.DIALECT_HINTS["sqlite"]
    joined = " ".join(sqlite_hints)
    assert "RANK()" in joined
    assert "Top-N" in joined or "top-N" in joined
    assert "ROW_NUMBER" in joined


# ── Fix #4: R24 FK direction format ────────────────────────────


def test_fix4_fk_format_change_reverted():
    """Fix #4 (FK direction format `table(col) -> ref_table(col)`) was REVERTED
    post-main-150-tier3 (-10pts; column_linking regressions in student_club
    qid 1351, 1356). Format change confused agent on patterns it had right
    before. Original `(col) -> ref_table(col)` restored. Tier 4 ticket: try
    comment-style source addition that doesn't change canonical format."""
    from query_engine import QueryEngine
    info = {
        "foreign_keys": [
            {"constrained_columns": ["raceId"], "referred_table": "races",
             "referred_columns": ["raceId"]},
        ],
    }
    # Both calling forms should produce the ORIGINAL format (no source prefix)
    out_with_table = QueryEngine._extract_fk_hints(info, "driverStandings")
    out_no_table = QueryEngine._extract_fk_hints(info)
    assert "(raceId) -> races(raceId)" in out_with_table
    assert "(raceId) -> races(raceId)" in out_no_table
    # New format must NOT be present
    assert "driverStandings(raceId)" not in out_with_table[0]


# ── Fix #5: silent except expansion ────────────────────────────


def test_planner_init_failure_logs_warning():
    """AnalyticalPlanner init failure now logs WARNING. Pre-Tier-3 it
    silently set self._planner = None, repeating the dead-method-bug
    pattern from April 26."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    assert "AnalyticalPlanner init failed" in src
    assert "Theme 3 plan emission no-ops" in src


def test_safe_text_init_failure_logs_warning():
    """SafeText hallucination filter init failure now logs WARNING.
    Pre-Tier-3 silent disable hid Phase K critical-path failure."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    assert "SafeText hallucination filter init failed" in src
    assert "agent output will not be filtered" in src


def test_plan_cache_embedder_fallback_logs_warning():
    """Pre-Tier-3 silent embedder fallback (minilm-l6-v2 → hash-v1) hid
    semantic plan retrieval degradation."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    assert "PlanCache embedder minilm-l6-v2 unavailable" in src
    assert "semantic plan retrieval degraded" in src

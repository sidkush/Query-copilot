"""Unit tests for Ring-4 oracle types."""
from pathlib import Path

from tests.trap_grader import grade_trap, _resolve_db_path


def _db():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_emit_intent_echo_passes_on_marker_with_min_score():
    trap = {
        "id": "r4-t1", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.5},
    }
    sql = "-- intent_echo: ambiguity=0.72\nSELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_emit_intent_echo_fails_when_no_marker():
    trap = {
        "id": "r4-t2", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_emit_intent_echo", "min_ambiguity": 0.5},
    }
    sql = "SELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False


def test_must_not_emit_intent_echo_passes_on_clean_sql():
    trap = {
        "id": "r4-t3", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_not_emit_intent_echo", "max_ambiguity": 0.3},
    }
    sql = "SELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_include_clause_passes_on_marker():
    trap = {
        "id": "r4-t4", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_include_clause", "clause_kind": "groupby"},
    }
    sql = "-- clause: groupby\nSELECT 1 GROUP BY 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_include_clause_fails_when_missing():
    trap = {
        "id": "r4-t5", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_include_clause", "clause_kind": "temporal"},
    }
    sql = "SELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False

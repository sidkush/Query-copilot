"""Phase M-alt oracle types."""
from pathlib import Path

from tests.trap_grader import grade_trap, _resolve_db_path


def _db():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_transpile_clean_passes_when_marker_present():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_transpile_clean", "source": "bigquery", "targets": ["duckdb"]}}
    sql = "-- transpile_ok: bigquery->duckdb=true"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_transpile_clean_fails_when_marker_false():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_transpile_clean", "source": "bigquery", "targets": ["duckdb"]}}
    sql = "-- transpile_ok: bigquery->duckdb=false"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False


def test_must_route_capability_passes_when_block_matches_expect():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_route_capability", "engine": "postgresql",
                       "feature": "qualify_clause", "expect_block": True}}
    sql = "-- capability_route: postgresql.qualify_clause blocked=true"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_route_capability_fails_when_block_mismatch():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_route_capability", "engine": "duckdb",
                       "feature": "qualify_clause", "expect_block": False}}
    sql = "-- capability_route: duckdb.qualify_clause blocked=true"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False

"""Phase E trap grader oracles."""
from pathlib import Path

from tests.trap_grader import grade_trap, _resolve_db_path


def _db():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_force_live_tier_passes_on_marker():
    trap = {"id": "e-1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_force_live_tier"}}
    sql = "-- tier: live\nSELECT 1"
    assert grade_trap(trap, sql, _db()).passed


def test_must_force_live_tier_fails_without_marker():
    trap = {"id": "e-2", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_force_live_tier"}}
    sql = "SELECT 1"
    assert grade_trap(trap, sql, _db()).passed is False


def test_must_emit_chip_passes_for_matching_trust():
    trap = {"id": "e-3", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_emit_chip", "trust": "turbo"}}
    sql = "-- chip: turbo\nSELECT 1"
    assert grade_trap(trap, sql, _db()).passed


def test_must_emit_chip_fails_for_wrong_trust():
    trap = {"id": "e-4", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_emit_chip", "trust": "turbo"}}
    sql = "-- chip: live\nSELECT 1"
    assert grade_trap(trap, sql, _db()).passed is False


def test_must_use_tenant_composite_key_passes_with_marker():
    trap = {"id": "e-5", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_use_tenant_composite_key"}}
    sql = "-- tenant_key: tenant:t1/conn:c1/user:u1\nSELECT 1"
    assert grade_trap(trap, sql, _db()).passed

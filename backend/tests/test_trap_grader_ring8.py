"""Unit tests for the 4 Ring-8 oracle types."""
from pathlib import Path
import sys
sys.path.insert(0, ".")
from tests.trap_grader import grade_trap, _resolve_db_path


def _db():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_safe_abort_passes_when_marker_present():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_safe_abort", "reason_contains": "timeout"}}
    sql = "-- safe_abort: query timeout exceeded"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_safe_abort_fails_without_marker():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_safe_abort", "reason_contains": "timeout"}}
    sql = "SELECT 42"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False


def test_must_bound_steps_passes_under_cap():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_bound_steps", "max_steps": 10}}
    sql = "-- step_count: 7\nSELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_bound_steps_fails_over_cap():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_bound_steps", "max_steps": 10}}
    sql = "-- step_count: 81\nSELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False


def test_must_use_planner_passes_when_marker_present():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_use_planner", "max_ctes": 3}}
    sql = "-- plan_artifact: ctes=3\nSELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_use_planner_fails_when_too_many_ctes():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_use_planner", "max_ctes": 3}}
    sql = "-- plan_artifact: ctes=5\nSELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False


def test_must_escalate_model_passes_on_matching_tier():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_escalate_model", "expected_tier": "plan_emit"}}
    sql = "-- model_tier: plan_emit\nSELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_escalate_model_fails_on_wrong_tier():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_escalate_model", "expected_tier": "recovery"}}
    sql = "-- model_tier: step_exec\nSELECT 1"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False

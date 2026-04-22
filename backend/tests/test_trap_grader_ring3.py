"""Unit tests for the new Ring-3 oracle types."""
from pathlib import Path

from tests.trap_grader import grade_trap, _resolve_db_path


def _db():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_trigger_validator_rule_passes_on_matching_rule_fire():
    trap = {
        "id": "r3-t1", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_trigger_validator_rule", "rule": "range_mismatch"},
    }
    sql = "-- validator fired: range_mismatch"
    result = grade_trap(trap, sql, _db())
    assert result.passed is True


def test_must_trigger_validator_rule_fails_on_non_matching_rule():
    trap = {
        "id": "r3-t2", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_trigger_validator_rule", "rule": "range_mismatch"},
    }
    sql = "SELECT * FROM trips"
    result = grade_trap(trap, sql, _db())
    assert result.passed is False


def test_must_not_trigger_validator_rule_passes_on_clean_sql():
    trap = {
        "id": "r3-t3", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"},
    }
    sql = "SELECT COUNT(DISTINCT u.id) FROM users u JOIN orders o ON o.user_id=u.id"
    result = grade_trap(trap, sql, _db())
    assert result.passed is True


def test_must_not_trigger_validator_rule_fails_when_rule_present():
    trap = {
        "id": "r3-t4", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"},
    }
    sql = "-- validator fired: fanout_inflation\nSELECT COUNT(*) FROM orders o JOIN order_items oi ON oi.order_id=o.id"
    result = grade_trap(trap, sql, _db())
    assert result.passed is False

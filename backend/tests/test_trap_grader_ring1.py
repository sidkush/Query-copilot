"""Unit tests for the new Ring-1 oracle types."""
from pathlib import Path
from tests.trap_grader import grade_trap, _resolve_db_path


def _fixture_path():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_mention_full_range_passes_on_correct_min_max_sql():
    trap = {
        "id": "cov-002",
        "nl": "range",
        "expected_sql_contains": ["MIN", "MAX"],
        "oracle": {
            "type": "must_mention_full_range",
            "table": "january_trips",
            "column": "started_at",
            "min_before": "2024-01-01",
            "max_after": "2025-01-01",
        },
    }
    sql = "SELECT MIN(started_at), MAX(started_at) FROM january_trips"
    result = grade_trap(trap, sql, _fixture_path())
    assert result.passed is True


def test_must_not_claim_limited_fails_on_refusal_text():
    trap = {
        "id": "cov-001",
        "nl": "scope",
        "expected_sql_contains": [],
        "oracle": {
            "type": "must_not_claim_limited",
            "forbidden_phrases": ["only january", "limited to january"],
        },
    }
    sql = "-- data appears only january; limited scope noted."
    result = grade_trap(trap, sql, _fixture_path())
    assert result.passed is False
    assert "only january" in result.reason.lower()


def test_must_not_claim_limited_passes_on_clean_sql():
    trap = {
        "id": "cov-001",
        "nl": "scope",
        "expected_sql_contains": [],
        "oracle": {
            "type": "must_not_claim_limited",
            "forbidden_phrases": ["only january"],
        },
    }
    sql = "SELECT COUNT(*) FROM january_trips WHERE started_at >= '2023-12-01'"
    result = grade_trap(trap, sql, _fixture_path())
    assert result.passed is True

import json
from pathlib import Path
import pytest
from backend.tests.trap_grader import grade_trap, TrapResult


def test_grade_date_range_oracle_passes_on_correct_sql():
    trap = {
        "id": "t1",
        "nl": "range",
        "expected_sql_contains": ["MIN", "MAX"],
        "oracle": {
            "type": "date_range",
            "table": "january_trips",
            "column": "started_at",
            "min_should_be_before": "2024-01-01",
            "max_should_be_after": "2025-01-01",
        },
    }
    emitted_sql = "SELECT MIN(started_at), MAX(started_at) FROM january_trips"
    result = grade_trap(trap, emitted_sql, db_path=Path("/tmp/eval_fixture.sqlite"))
    assert result.passed is True


def test_grade_must_not_refuse_fails_on_refusal_sql():
    trap = {
        "id": "t2",
        "nl": "count",
        "expected_sql_contains": [],
        "oracle": {
            "type": "must_not_refuse",
            "forbidden_phrases": ["only january", "insufficient"],
        },
    }
    emitted_sql = "-- data only january, insufficient for analysis"
    result = grade_trap(trap, emitted_sql, db_path=Path("/tmp/eval_fixture.sqlite"))
    assert result.passed is False
    assert "forbidden phrase" in result.reason.lower()


def test_grade_missing_expected_substring_fails():
    trap = {
        "id": "t3",
        "nl": "whatever",
        "expected_sql_contains": ["GROUP BY"],
        "oracle": {"type": "must_query_table", "table": "january_trips"},
    }
    emitted_sql = "SELECT 1"
    result = grade_trap(trap, emitted_sql, db_path=Path("/tmp/eval_fixture.sqlite"))
    assert result.passed is False

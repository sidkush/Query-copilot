"""Rule 8 — Recursive view resolution; apply card check at base table."""
from datetime import datetime, timezone
from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from scope_validator import ScopeValidator, RuleId


def _card():
    return DataCoverageCard(
        table_name="trips",
        row_count=1000,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="sqlite",
    )


def test_fires_when_view_query_narrows_outside_base_card_range():
    sql = "SELECT * FROM v_recent_trips WHERE started_at < '2020-01-01'"
    ctx = {
        "coverage_cards": [_card()],
        "view_definitions": {"v_recent_trips": "SELECT * FROM trips WHERE started_at > '2024-01-01'"},
    }
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx=ctx)
    assert any(vio.rule_id is RuleId.VIEW_WALKER for vio in r.violations)


def test_does_not_fire_on_direct_base_table_query():
    sql = "SELECT * FROM trips WHERE started_at < '2020-01-01'"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={"coverage_cards": [_card()], "view_definitions": {}})
    assert not any(vio.rule_id is RuleId.VIEW_WALKER for vio in r.violations)

"""Rule 4 — DATE or DATE_TRUNC on TIMESTAMP_TZ without AT TIME ZONE."""
from datetime import datetime, timezone
from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from scope_validator import ScopeValidator, RuleId


def _card_with_tz_col():
    return DataCoverageCard(
        table_name="events",
        row_count=100,
        date_columns=[DateCoverage("occurred_at", "2024-01-01T00:00:00Z", "2025-10-28T00:00:00Z", 22, 670)],
        categorical_columns=[],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="postgresql",
    )


def test_fires_on_date_trunc_tz_col_without_at_time_zone():
    sql = "SELECT DATE_TRUNC('day', occurred_at) FROM events"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={"coverage_cards": [_card_with_tz_col()], "tz_aware_columns": {"events": ["occurred_at"]}})
    assert any(vio.rule_id is RuleId.TIMEZONE_NAIVE for vio in r.violations)


def test_does_not_fire_with_at_time_zone():
    sql = "SELECT DATE_TRUNC('day', occurred_at AT TIME ZONE 'UTC') FROM events"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={"tz_aware_columns": {"events": ["occurred_at"]}})
    assert not any(vio.rule_id is RuleId.TIMEZONE_NAIVE for vio in r.violations)


def test_does_not_fire_on_non_tz_column():
    sql = "SELECT DATE_TRUNC('day', created_at) FROM events"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={"tz_aware_columns": {"events": []}})
    assert not any(vio.rule_id is RuleId.TIMEZONE_NAIVE for vio in r.violations)

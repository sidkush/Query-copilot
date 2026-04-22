"""Rule 1 — Range mismatch: WHERE narrows outside card min/max."""
from datetime import datetime, timezone
from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from scope_validator import ScopeValidator, RuleId


def _card():
    return DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="sqlite",
    )


def test_fires_when_where_before_card_min():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql="SELECT * FROM january_trips WHERE started_at < '2020-01-01'", ctx={"coverage_cards": [_card()]})
    assert any(vio.rule_id is RuleId.RANGE_MISMATCH for vio in r.violations)


def test_fires_when_where_after_card_max():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql="SELECT * FROM january_trips WHERE started_at > '2099-01-01'", ctx={"coverage_cards": [_card()]})
    assert any(vio.rule_id is RuleId.RANGE_MISMATCH for vio in r.violations)


def test_does_not_fire_when_where_within_card_range():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql="SELECT * FROM january_trips WHERE started_at >= '2024-06-01'", ctx={"coverage_cards": [_card()]})
    assert not any(vio.rule_id is RuleId.RANGE_MISMATCH for vio in r.violations)


def test_does_not_fire_when_no_card_for_table():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql="SELECT * FROM unknown_table WHERE started_at < '1900-01-01'", ctx={"coverage_cards": [_card()]})
    assert not any(vio.rule_id is RuleId.RANGE_MISMATCH for vio in r.violations)

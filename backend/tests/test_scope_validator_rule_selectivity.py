"""Rule 9 — EXPLAIN-backed row estimate < 0.1% of card rowcount."""
from datetime import datetime, timezone
from unittest.mock import MagicMock
from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from scope_validator import _rule_conjunction_selectivity, ScopeValidator, RuleId


def _card(rows=10_000_000):
    return DataCoverageCard(
        table_name="trips",
        row_count=rows,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="postgresql",
    )


def test_fires_when_explain_estimate_tiny_vs_card():
    sql = "SELECT * FROM trips WHERE rider_type = 'unicorn' AND started_at = '1900-01-01'"
    connector = MagicMock()
    connector.execute_query.return_value = [(42,)]
    import sqlglot
    ast = sqlglot.parse_one(sql)
    vio = _rule_conjunction_selectivity(ast, sql, ctx={"coverage_cards": [_card()], "connector": connector}, dialect="postgresql")
    assert vio is not None
    assert vio.rule_id is RuleId.CONJUNCTION_SELECTIVITY


def test_does_not_fire_when_estimate_substantial():
    sql = "SELECT * FROM trips WHERE rider_type = 'member'"
    connector = MagicMock()
    connector.execute_query.return_value = [(5_000_000,)]
    import sqlglot
    ast = sqlglot.parse_one(sql)
    vio = _rule_conjunction_selectivity(ast, sql, ctx={"coverage_cards": [_card()], "connector": connector}, dialect="postgresql")
    assert vio is None

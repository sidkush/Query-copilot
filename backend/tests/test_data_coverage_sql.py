"""Per-dialect coverage SQL generator tests."""
import pytest

from data_coverage import (
    date_coverage_sql,
    categorical_coverage_sql,
    categorical_count_sql,
    row_count_sql,
    UnsupportedDialectError,
)


@pytest.mark.parametrize("dialect,expected_substrings", [
    ("sqlite",    ["MIN(", "MAX(", "strftime", "'%Y-%m'"]),
    ("postgresql",["MIN(", "MAX(", "date_trunc", "'month'"]),
    ("mysql",     ["MIN(", "MAX(", "DATE_FORMAT", "'%Y-%m'"]),
    ("duckdb",    ["MIN(", "MAX(", "strftime", "'%Y-%m'"]),
    ("bigquery",  ["MIN(", "MAX(", "FORMAT_DATE", "'%Y-%m'"]),
    ("snowflake", ["MIN(", "MAX(", "TO_CHAR", "'YYYY-MM'"]),
    ("mssql",     ["MIN(", "MAX(", "FORMAT(", "'yyyy-MM'"]),
])
def test_date_sql_per_dialect(dialect, expected_substrings):
    sql = date_coverage_sql(dialect, "january_trips", "started_at")
    for snippet in expected_substrings:
        assert snippet in sql, f"{dialect}: missing {snippet!r} in {sql!r}"


def test_categorical_sample_sql_emits_limit():
    sql = categorical_coverage_sql("sqlite", "january_trips", "rider_type")
    assert "rider_type" in sql
    assert "LIMIT 10" in sql or "TOP 10" in sql


def test_categorical_count_sql_emits_distinct():
    sql = categorical_count_sql("sqlite", "january_trips", "rider_type")
    assert "COUNT(DISTINCT" in sql
    assert "rider_type" in sql


def test_row_count_sql_exact_count():
    sql = row_count_sql("sqlite", "january_trips")
    assert sql.strip().upper().startswith("SELECT COUNT(*)")
    assert "january_trips" in sql


def test_unsupported_dialect_raises():
    with pytest.raises(UnsupportedDialectError):
        date_coverage_sql("acme_db", "t", "c")

"""Dialect bridge — pass-through, transpile, fallback."""
import pytest

from dialect_bridge import transpile, transpile_checked


def test_same_dialect_returns_source_unchanged():
    sql = "SELECT * FROM trips WHERE id = 1"
    out = transpile(sql, source="bigquery", target="bigquery")
    assert out == sql


def test_same_dialect_case_insensitive_pass_through():
    sql = "SELECT 1"
    out = transpile(sql, source="BigQuery", target="bigquery")
    assert out == sql


def test_bigquery_countif_to_duckdb_count_if():
    sql = "SELECT COUNTIF(x = 1) FROM t"
    out = transpile(sql, source="bigquery", target="duckdb")
    assert "COUNT_IF" in out.upper()


def test_bigquery_date_trunc_arg_reorder():
    sql = "SELECT DATE_TRUNC(ts, MONTH) FROM t"
    out = transpile(sql, source="bigquery", target="duckdb")
    # DuckDB expects ('MONTH', ts)
    assert "'MONTH'" in out
    assert out.index("'MONTH'") < out.index("ts")


def test_malformed_sql_returns_source_unchanged():
    """On sqlglot exception, return source SQL (Ring 3 catches semantic issues).

    ErrorLevel.WARN suppresses most parse errors; tokenizer failures still
    raise, which is exactly the class of faults this fallback exists for.
    """
    sql = "/* unterminated comment SELECT 1"
    out = transpile(sql, source="bigquery", target="duckdb")
    assert out == sql


def test_unknown_target_dialect_returns_source():
    """Unknown target → sqlglot raises → return source SQL."""
    sql = "SELECT 1"
    out = transpile(sql, source="bigquery", target="not_a_real_dialect")
    assert out == sql


def test_churn_query_transpiles():
    """The realistic multi-aggregate BI query must transpile."""
    sql = """
    SELECT start_station_name,
           COUNT(DISTINCT CASE WHEN member_casual = 'casual' THEN ride_id END) AS c,
           APPROX_COUNT_DISTINCT(ride_id) AS approx_total
    FROM january_trips
    GROUP BY start_station_name LIMIT 10
    """
    out = transpile(sql, source="bigquery", target="duckdb")
    assert "APPROX_COUNT_DISTINCT" in out.upper() or "APPROX_DISTINCT" in out.upper()
    assert "GROUP BY" in out.upper()


def test_transpile_checked_success_returns_false_failed():
    sql = "SELECT COUNTIF(x = 1) FROM t"
    out, failed = transpile_checked(sql, source="bigquery", target="duckdb")
    assert not failed
    assert "COUNT_IF" in out.upper()


def test_transpile_checked_same_dialect_returns_false_failed():
    sql = "SELECT 1"
    out, failed = transpile_checked(sql, source="bigquery", target="bigquery")
    assert out == sql
    assert not failed


def test_transpile_checked_exception_returns_true_failed():
    sql = "/* unterminated comment SELECT 1"
    out, failed = transpile_checked(sql, source="bigquery", target="duckdb")
    assert out == sql
    assert failed


def test_transpile_checked_identity_output_not_false_positive():
    """SELECT 1 transpiles to SELECT 1 in many dialects — must NOT mark as failed."""
    sql = "SELECT 1"
    out, failed = transpile_checked(sql, source="bigquery", target="postgres")
    assert not failed

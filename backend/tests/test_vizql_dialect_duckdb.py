"""Golden-file round-trip tests for DuckDBDialect.

Contract:
  1. Emit each scenario via DuckDBDialect().emit(qf).
  2. Strip whitespace runs to a single space.
  3. Compare against backend/tests/golden/vizql/duckdb/<stem>.sql.
  4. Execute the emitted SQL against an in-memory DuckDB with the
     fixture schema — a runtime parse error FAILS the scenario.
"""
from __future__ import annotations

import re
from pathlib import Path

import duckdb
import pytest

from vizql.dialects.duckdb import DuckDBDialect
from tests.vizql._fixtures import SCENARIOS


GOLDEN = Path(__file__).parent / "golden" / "vizql" / "duckdb"


def _norm(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


def _fixture_db() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    con.execute("""
        CREATE TABLE sales (id INT, category VARCHAR, region VARCHAR,
            segment VARCHAR, revenue DOUBLE, qty INT, order_date DATE,
            status VARCHAR, flag BOOLEAN);
        CREATE TABLE sales_archive AS SELECT * FROM sales;
        CREATE TABLE dim_region (region VARCHAR);
        CREATE TABLE orders (id INT, category VARCHAR, status VARCHAR,
            revenue DOUBLE);
        CREATE TABLE accounts (id INT, status VARCHAR, flag BOOLEAN);
    """)
    return con


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_duckdb_golden_roundtrip(stem):
    qf = SCENARIOS[stem]()
    emitted = DuckDBDialect().emit(qf)
    gold_path = GOLDEN / f"{stem}.sql"
    assert gold_path.exists(), f"missing golden: {gold_path}"
    assert _norm(emitted) == _norm(gold_path.read_text(encoding="utf-8"))

    # Parse/plan check — execute against fixture schema.
    con = _fixture_db()
    try:
        con.execute(f"EXPLAIN {emitted}")
    finally:
        con.close()


def test_table_calc_filter_is_not_emitted():
    qf = SCENARIOS["14_table_calc_flag_no_sql"]()
    emitted = DuckDBDialect().emit(qf)
    assert "rn" not in emitted, "client_side_filters must stay client-side"

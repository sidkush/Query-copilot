"""Golden-file round-trip tests for BigQueryDialect.

Contract:
  1. Emit each scenario via BigQueryDialect().emit(qf).
  2. Strip whitespace runs to a single space.
  3. Compare against backend/tests/golden/vizql/bigquery/<stem>.sql.
  4. Parse the emitted SQL with sqlglot's BigQuery dialect — a parse
     error FAILS the scenario. (No live BigQuery dependency.)
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest
import sqlglot

from vizql.dialects.bigquery import BigQueryDialect
from tests.vizql._fixtures import SCENARIOS


GOLDEN = Path(__file__).parent / "golden" / "vizql" / "bigquery"


def _norm(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_bigquery_golden_roundtrip(stem):
    qf = SCENARIOS[stem]()
    emitted = BigQueryDialect().emit(qf)
    gold_path = GOLDEN / f"{stem}.sql"
    assert gold_path.exists(), f"missing golden: {gold_path}"
    assert _norm(emitted) == _norm(gold_path.read_text(encoding="utf-8"))
    sqlglot.parse_one(emitted, dialect="bigquery")  # raises on parse error


def test_bigquery_identifier_uses_backticks():
    qf = SCENARIOS["01_simple_bar"]()
    assert "`" in BigQueryDialect().emit(qf)
    assert '"' not in BigQueryDialect().emit(qf)


def test_bigquery_date_trunc_argument_order():
    qf = SCENARIOS["10_relative_date"]()
    sql = BigQueryDialect().emit(qf)
    # BigQuery: DATE_TRUNC(ts, MONTH)  — NOT  DATE_TRUNC('month', ts)
    assert "DATE_TRUNC(" in sql
    assert "'month'" not in sql.lower()
    assert ", month" in sql.lower() or ", MONTH" in sql

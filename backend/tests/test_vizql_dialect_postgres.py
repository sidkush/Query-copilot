"""Golden-file round-trip tests for PostgresDialect.

Contract:
  1. Emit each scenario via PostgresDialect().emit(qf).
  2. Strip whitespace runs to a single space.
  3. Compare against backend/tests/golden/vizql/postgres/<stem>.sql.
  4. Parse the emitted SQL with sqlglot under the ``postgres`` dialect —
     a parse error FAILS the scenario (no live Postgres dependency).
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest
import sqlglot

from vizql.dialects.postgres import PostgresDialect
from tests.vizql._fixtures import SCENARIOS


GOLDEN = Path(__file__).parent / "golden" / "vizql" / "postgres"


def _norm(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_postgres_golden_roundtrip(stem):
    qf = SCENARIOS[stem]()
    emitted = PostgresDialect().emit(qf)
    gold_path = GOLDEN / f"{stem}.sql"
    assert gold_path.exists(), f"missing golden: {gold_path}"
    assert _norm(emitted) == _norm(gold_path.read_text(encoding="utf-8"))
    sqlglot.parse_one(emitted, dialect="postgres")  # raises on parse error


def test_postgres_cast_uses_double_colon_syntax():
    qf = SCENARIOS["15_cast_boolean"]()
    sql = PostgresDialect().emit(qf)
    assert "::" in sql and "CAST(" not in sql.upper() or "::BOOLEAN" in sql.upper()

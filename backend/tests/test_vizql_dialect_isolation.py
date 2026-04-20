"""Idempotency + dialect isolation guards."""
from __future__ import annotations

import pytest

from config import DBType
from vizql import emit_validated
from vizql.dialects.duckdb import DuckDBDialect
from vizql.dialects.postgres import PostgresDialect
from vizql.dialects.bigquery import BigQueryDialect
from vizql.dialects.snowflake import SnowflakeDialect
from tests.vizql._fixtures import SCENARIOS


ALL = [DuckDBDialect, PostgresDialect, BigQueryDialect, SnowflakeDialect]


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
@pytest.mark.parametrize("cls", ALL, ids=[c.__name__ for c in ALL])
def test_emit_is_idempotent(stem, cls):
    qf = SCENARIOS[stem]()
    a = cls().emit(qf)
    b = cls().emit(qf)
    assert a == b


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_dialects_produce_distinct_output_where_expected(stem):
    if stem in {"14_table_calc_flag_no_sql"}:
        # this scenario has no dialect-specific syntax
        return
    outs = {cls.__name__: cls().emit(SCENARIOS[stem]()) for cls in ALL}
    # BigQuery uses backticks; Snowflake/Postgres/DuckDB use double quotes.
    assert any("`" in s for s in outs.values())
    assert any('"' in s for s in outs.values())


def test_cross_dialect_state_is_not_shared():
    qf = SCENARIOS["15_cast_boolean"]()
    pg = PostgresDialect().emit(qf)
    assert "::BOOLEAN" in pg.upper()
    dk = DuckDBDialect().emit(qf)
    assert "CAST(" in dk.upper() and "::" not in dk
    pg2 = PostgresDialect().emit(qf)
    assert pg2 == pg  # Postgres output did not drift after DuckDB ran

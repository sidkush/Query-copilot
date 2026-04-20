"""Micro-benchmark: emission latency for a synthetic 200-node plan.

Target: < 10 ms per emit call (pure string build, no DB). Runs as a normal
pytest test — no pytest-benchmark dependency needed."""
from __future__ import annotations

import time

import pytest

from vizql import sql_ast as sa
from vizql.dialects.duckdb import DuckDBDialect
from vizql.dialects.postgres import PostgresDialect
from vizql.dialects.bigquery import BigQueryDialect
from vizql.dialects.snowflake import SnowflakeDialect


def _big_plan() -> sa.SQLQueryFunction:
    cols = tuple(
        sa.Projection(alias=f"c{i}", expression=sa.Column(name=f"c{i}", table_alias="t"))
        for i in range(100)
    )
    where = sa.Column(name="c0", table_alias="t")
    for i in range(1, 100):
        where = sa.BinaryOp(
            op="AND",
            left=where,
            right=sa.BinaryOp(op=">",
                              left=sa.Column(name=f"c{i}", table_alias="t"),
                              right=sa.Literal(value=i, data_type="int")))
    return sa.SQLQueryFunction(
        projections=cols,
        from_=sa.TableRef(name="t", alias="t"),
        where=where,
    )


@pytest.mark.parametrize("cls", [
    DuckDBDialect, PostgresDialect, BigQueryDialect, SnowflakeDialect,
])
def test_emit_under_10ms_for_200_node_plan(cls):
    qf = _big_plan()
    d = cls()
    best = float("inf")
    for _ in range(5):
        t0 = time.perf_counter()
        out = d.emit(qf)
        best = min(best, time.perf_counter() - t0)
    assert out
    assert best < 0.010, f"{cls.__name__} took {best*1000:.2f}ms (budget: 10ms)"

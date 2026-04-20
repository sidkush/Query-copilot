from __future__ import annotations

import pytest

from config import DBType
from waterfall_router import WaterfallRouter
from tests.vizql._fixtures import SCENARIOS


class _FakeTier:
    name = "fake"
    async def can_answer(self, *a, **kw): return False
    async def answer(self, *a, **kw): return None


@pytest.fixture
def router():
    return WaterfallRouter(tiers=[_FakeTier()])


@pytest.mark.parametrize("db_type", [
    DBType.DUCKDB, DBType.POSTGRESQL, DBType.BIGQUERY, DBType.SNOWFLAKE,
    DBType.CLICKHOUSE,  # fallback path
])
def test_router_emits_sql_for_any_db_type(router, db_type):
    qf = SCENARIOS["01_simple_bar"]()
    sql = router.emit_vizql_sql(qf, db_type)
    assert sql.strip().upper().startswith("SELECT")


def test_router_fallback_emits_duckdb_shape_for_unknown_db(router):
    qf = SCENARIOS["15_cast_boolean"]()
    sql = router.emit_vizql_sql(qf, DBType.SAP_HANA)
    assert 'CAST(' in sql.upper()  # DuckDB shape, not "::"

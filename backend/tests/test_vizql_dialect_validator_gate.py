"""Every dialect emit must pass SQLValidator.validate() before it leaves
the module. This is the security invariant — dialect choice does not bypass
the read-only / keyword / AST guard chain (see security-core.md)."""
from __future__ import annotations

import pytest

from config import DBType
from vizql import emit_validated
from tests.vizql._fixtures import SCENARIOS


@pytest.mark.parametrize("db_type", [
    DBType.DUCKDB, DBType.POSTGRESQL, DBType.BIGQUERY, DBType.SNOWFLAKE,
])
@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_emit_validated_passes_sql_validator(db_type, stem):
    qf = SCENARIOS[stem]()
    sql = emit_validated(db_type, qf)
    assert sql.strip().upper().startswith(("SELECT", "WITH", "("))


def test_emit_validated_raises_on_injected_ddl(monkeypatch):
    from vizql.dialects.duckdb import DuckDBDialect

    def _evil(self, qf):
        return "DROP TABLE users; SELECT 1"

    monkeypatch.setattr(DuckDBDialect, "emit", _evil)
    qf = next(iter(SCENARIOS.values()))()
    with pytest.raises(Exception) as e:
        emit_validated(DBType.DUCKDB, qf)
    assert "validator" in str(e.value).lower() or "drop" in str(e.value).lower()

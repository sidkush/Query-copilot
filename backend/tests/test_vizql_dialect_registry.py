"""Registry tests — DBType → BaseDialect dispatch + DuckDB fallback."""
import logging

import pytest

from config import DBType
from vizql.dialects import get_dialect
from vizql.dialects.duckdb import DuckDBDialect


@pytest.mark.parametrize("db_type, expected_name", [
    (DBType.DUCKDB, "duckdb"),
    (DBType.POSTGRESQL, "postgres"),
    (DBType.BIGQUERY, "bigquery"),
    (DBType.SNOWFLAKE, "snowflake"),
])
def test_registered_dialects(db_type, expected_name):
    assert get_dialect(db_type).name == expected_name


def test_unsupported_db_type_falls_back_to_duckdb(caplog):
    with caplog.at_level(logging.WARNING):
        d = get_dialect(DBType.CLICKHOUSE)
    assert isinstance(d, DuckDBDialect)
    assert any("falling back to DuckDB" in m for m in caplog.messages)


def test_fallback_warning_is_logged_only_once(caplog):
    caplog.clear()
    with caplog.at_level(logging.WARNING):
        get_dialect(DBType.ORACLE)
        get_dialect(DBType.ORACLE)
    assert sum("falling back to DuckDB" in m for m in caplog.messages) == 1


def test_same_dialect_instance_returned():
    assert get_dialect(DBType.DUCKDB) is get_dialect(DBType.DUCKDB)

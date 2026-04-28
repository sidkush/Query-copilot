"""Regression: db_connector.get_ddl must not crash when FK metadata
has None entries.

Discovered post-pilot 50 (Phase C bundle, 2026-04-27): 10/50 BIRD traces
hit `TypeError: sequence item 0: expected str instance, NoneType found`
at db_connector.py:507 inside `', '.join(fk['referred_columns'])`. Cause:
SQLAlchemy returns None for FK column names when SQLite metadata is
incomplete (european_football_2, debit_card_specializing). Same pattern
agent_engine._tool_inspect_schema already defends against — propagated
to db_connector.get_ddl as part of pilot 50 no_sql recovery.
"""
from unittest.mock import patch, MagicMock


def _make_connector():
    """Bare DatabaseConnector with mocked engine + minimal schema."""
    from db_connector import DatabaseConnector
    from config import DBType
    c = DatabaseConnector.__new__(DatabaseConnector)
    c.db_type = DBType.SQLITE
    c._engine = MagicMock()
    return c


def test_get_ddl_handles_none_in_referred_columns():
    """The exact crash: fk['referred_columns'] contains None. Must not raise."""
    c = _make_connector()
    schema_info = {
        "Player_Attributes": {
            "columns": [
                {"name": "id", "type": "INTEGER", "nullable": False},
                {"name": "player_api_id", "type": "INTEGER", "nullable": True},
            ],
            "primary_key": ["id"],
            "foreign_keys": [
                {
                    "columns": ["player_api_id"],
                    "referred_table": "Player",
                    "referred_columns": [None],  # the actual crash trigger
                },
            ],
        },
    }
    with patch.object(c, "get_schema_info", return_value=schema_info):
        ddl = c.get_ddl()
    assert len(ddl) == 1
    assert "FOREIGN KEY (player_api_id) REFERENCES Player(?)" in ddl[0]


def test_get_ddl_handles_none_referred_table():
    """Defensive: None ref_table substitutes '?' rather than crashing."""
    c = _make_connector()
    schema_info = {
        "t": {
            "columns": [{"name": "x", "type": "INTEGER", "nullable": True}],
            "primary_key": [],
            "foreign_keys": [
                {"columns": ["x"], "referred_table": None,
                 "referred_columns": ["y"]},
            ],
        },
    }
    with patch.object(c, "get_schema_info", return_value=schema_info):
        ddl = c.get_ddl()
    assert "FOREIGN KEY (x) REFERENCES ?(y)" in ddl[0]


def test_get_ddl_skips_fk_when_constrained_columns_empty():
    """Malformed FK with empty src cols is dropped, not emitted as broken DDL."""
    c = _make_connector()
    schema_info = {
        "t": {
            "columns": [{"name": "x", "type": "INTEGER", "nullable": True}],
            "primary_key": [],
            "foreign_keys": [
                {"columns": [], "referred_table": "u",
                 "referred_columns": ["y"]},
            ],
        },
    }
    with patch.object(c, "get_schema_info", return_value=schema_info):
        ddl = c.get_ddl()
    # FK clause was dropped; DDL still valid (no FK row at all)
    assert "FOREIGN KEY" not in ddl[0]
    assert "CREATE TABLE t" in ddl[0]


def test_get_ddl_clean_fk_unchanged_post_fix():
    """No regression: well-formed FK metadata produces same DDL as pre-fix."""
    c = _make_connector()
    schema_info = {
        "orders": {
            "columns": [
                {"name": "id", "type": "INTEGER", "nullable": False},
                {"name": "customer_id", "type": "INTEGER", "nullable": False},
            ],
            "primary_key": ["id"],
            "foreign_keys": [
                {"columns": ["customer_id"], "referred_table": "customers",
                 "referred_columns": ["id"]},
            ],
        },
    }
    with patch.object(c, "get_schema_info", return_value=schema_info):
        ddl = c.get_ddl()
    assert "FOREIGN KEY (customer_id) REFERENCES customers(id)" in ddl[0]


def test_get_ddl_supports_constrained_columns_alias():
    """SQLAlchemy uses 'constrained_columns' in some metadata shapes;
    accept both 'columns' and 'constrained_columns' as the source field
    so FK extraction stays robust across SQLAlchemy versions."""
    c = _make_connector()
    schema_info = {
        "t": {
            "columns": [{"name": "x", "type": "INTEGER", "nullable": True}],
            "primary_key": [],
            "foreign_keys": [
                {"constrained_columns": ["x"], "referred_table": "u",
                 "referred_columns": ["y"]},
            ],
        },
    }
    with patch.object(c, "get_schema_info", return_value=schema_info):
        ddl = c.get_ddl()
    assert "FOREIGN KEY (x) REFERENCES u(y)" in ddl[0]

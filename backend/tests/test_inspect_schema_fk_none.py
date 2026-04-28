"""Regression: _tool_inspect_schema must not crash on FK metadata with None entries.

Discovered during BIRD smoke 10 (2026-04-26). debit_card_specializing's FK
metadata has None in referred_columns, raising:
  TypeError: sequence item 0: expected str instance, NoneType found
Caught by the outer try/except so the whole DDL block was returned as
{"error": "..."} JSON — agent saw "error" and moved on without the
table info. Defensive fix: filter None entries, "?" placeholder for
unknown referred parts, skip FK if source is unusable.
"""
from unittest.mock import MagicMock


def _engine_with_schema(schema_info):
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    engine._schema_cache = {}
    engine.engine = MagicMock()
    engine.engine.db.get_schema_info = MagicMock(return_value=schema_info)
    # Sample-row fetch needs a validator; we stub it to fail-validate so the
    # test focuses on FK formatting, not sample rows.
    engine.engine.validator = MagicMock()
    engine.engine.validator.validate = MagicMock(return_value=(False, "", "skip"))
    return engine


def test_inspect_schema_handles_none_in_referred_columns():
    """FK with None in referred_columns: '?' placeholder, no crash."""
    engine = _engine_with_schema({
        "my_table": {
            "columns": [{"name": "id", "type": "INTEGER", "nullable": False}],
            "primary_key": ["id"],
            "foreign_keys": [
                {"columns": ["fk_col"], "referred_table": "other",
                 "referred_columns": [None]},
            ],
        },
    })
    result = engine._tool_inspect_schema("my_table")
    assert "TypeError" not in result, "FK formatting must not crash on None"
    assert "FK: fk_col -> other(?)" in result


def test_inspect_schema_handles_none_in_source_columns():
    """FK with None in source columns: skip silently (unactionable)."""
    engine = _engine_with_schema({
        "my_table": {
            "columns": [{"name": "id", "type": "INTEGER", "nullable": False}],
            "foreign_keys": [
                {"columns": [None], "referred_table": "other",
                 "referred_columns": ["id"]},
            ],
        },
    })
    result = engine._tool_inspect_schema("my_table")
    assert "TypeError" not in result
    assert "FK:" not in result, "FK with no usable source must be skipped"


def test_inspect_schema_handles_none_referred_table():
    """FK with None referred_table: '?' placeholder, no crash."""
    engine = _engine_with_schema({
        "my_table": {
            "columns": [{"name": "id", "type": "INTEGER", "nullable": False}],
            "foreign_keys": [
                {"columns": ["fk_col"], "referred_table": None,
                 "referred_columns": ["other_id"]},
            ],
        },
    })
    result = engine._tool_inspect_schema("my_table")
    assert "TypeError" not in result
    assert "FK: fk_col -> ?(other_id)" in result

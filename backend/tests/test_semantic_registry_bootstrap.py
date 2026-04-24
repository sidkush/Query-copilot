"""SemanticRegistryBootstrap unit tests."""
from unittest.mock import MagicMock

import pytest

from semantic_registry_bootstrap import SemanticRegistryBootstrap


def test_bootstrap_from_schema_emits_rowcount_measure_per_table():
    """Every table produces at least one measure: row_count(table)."""
    schema = {
        "tables": [
            {"name": "orders", "columns": [
                {"name": "id", "data_type": "INTEGER", "is_primary_key": True},
                {"name": "amount", "data_type": "NUMERIC"},
            ]},
        ],
    }
    bs = SemanticRegistryBootstrap()
    defns = bs.from_schema(conn_id="c1", schema_profile=schema)
    names = {d.name for d in defns}
    assert "orders_row_count" in names


def test_bootstrap_infers_date_range_dimension_per_date_column():
    schema = {
        "tables": [
            {"name": "trips", "columns": [
                {"name": "id", "data_type": "INTEGER", "is_primary_key": True},
                {"name": "started_at", "data_type": "TIMESTAMP"},
            ]},
        ],
    }
    bs = SemanticRegistryBootstrap()
    defns = bs.from_schema(conn_id="c1", schema_profile=schema)
    date_dims = [d for d in defns if d.kind == "dimension" and "started_at" in d.sql]
    assert len(date_dims) >= 1


def test_bootstrap_skips_pii_columns_from_categorical_dimensions():
    schema = {
        "tables": [
            {"name": "users", "columns": [
                {"name": "id", "data_type": "INTEGER", "is_primary_key": True},
                {"name": "email", "data_type": "TEXT"},
                {"name": "region", "data_type": "TEXT"},
            ]},
        ],
    }
    bs = SemanticRegistryBootstrap()
    defns = bs.from_schema(conn_id="c1", schema_profile=schema)
    assert not any("email" in d.sql for d in defns if d.kind == "dimension")
    assert any("region" in d.sql for d in defns if d.kind == "dimension")


def test_bootstrap_empty_schema_returns_empty_list():
    bs = SemanticRegistryBootstrap()
    defns = bs.from_schema(conn_id="c1", schema_profile={"tables": []})
    assert defns == []

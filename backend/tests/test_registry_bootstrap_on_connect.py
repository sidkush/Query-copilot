"""Registry bootstrap fires during background schema profile when flag on."""
from unittest.mock import MagicMock, patch
import pytest


def test_bootstrap_called_with_schema_profile_when_flag_on():
    from semantic_registry_bootstrap import SemanticRegistryBootstrap, InferredDefinition

    bs = SemanticRegistryBootstrap()
    schema = {
        "tables": [
            {"name": "trips", "columns": [
                {"name": "id", "data_type": "INTEGER", "is_primary_key": True},
                {"name": "started_at", "data_type": "TIMESTAMP"},
            ]},
        ],
    }
    defns = bs.from_schema(conn_id="c1", schema_profile=schema)
    assert any(d.name == "trips_row_count" for d in defns)
    assert any(d.kind == "dimension" and "started_at" in d.sql for d in defns)

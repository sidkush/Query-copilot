"""Plan 10a — dashboard migration + user_storage preserve `formatting` list."""
import json
from pathlib import Path

import pytest

from dashboard_migration import legacy_to_freeform_schema


def test_migration_preserves_formatting():
    legacy = {
        "id": "d1", "name": "Sales",
        "tiles": [{"id": "t1", "title": "Revenue"}],
        "formatting": [
            {"selector": {"kind": "workbook", "id": ""}, "properties": {"color": "#000000"}},
            {"selector": {"kind": "mark", "id": "t1"}, "properties": {"color": "#ff0000"}},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    assert "formatting" in result
    assert result["formatting"][1]["selector"]["id"] == "t1"


def test_migration_missing_formatting_ok():
    legacy = {"id": "d1", "name": "S", "tiles": []}
    result = legacy_to_freeform_schema(legacy)
    assert result.get("formatting") is None or result["formatting"] == []


def test_user_storage_roundtrip_preserves_formatting(tmp_path, monkeypatch):
    # NOTE: plan specifies `USER_DATA_DIR`, but the actual module constant is
    # `DATA_ROOT`, and storage I/O goes through a `_backend` FileStorage rooted
    # at `.data/` (parent of user_data). We redirect both so the round-trip
    # exercises the full `_save_dashboards` → `_load_dashboards` path.
    import user_storage as us
    from user_storage import FileStorage

    storage_root = tmp_path
    data_root = tmp_path / "user_data"
    data_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(us, "DATA_ROOT", data_root)
    monkeypatch.setattr(us, "_STORAGE_ROOT", storage_root)
    monkeypatch.setattr(us, "_backend", FileStorage(storage_root))

    email = "test-10a@example.com"
    payload = [{
        "schemaVersion": "askdb/dashboard/v1",
        "id": "d1", "name": "Sales", "archetype": "analyst-pro",
        "created_at": "2026-04-21T00:00:00+00:00",
        "updated_at": "2026-04-21T00:00:00+00:00",
        "formatting": [
            {"selector": {"kind": "workbook", "id": ""}, "properties": {"color": "#000000"}},
        ],
    }]
    us._save_dashboards(email, payload)  # noqa: SLF001

    # Also exercise the `update_dashboard` allowlist path — this is where
    # `formatting` would be dropped if missing from the key tuple.
    updated = us.update_dashboard(email, "d1", {
        "formatting": [
            {"selector": {"kind": "workbook", "id": ""}, "properties": {"color": "#123456"}},
        ],
    })
    assert updated is not None
    assert updated["formatting"][0]["properties"]["color"] == "#123456"

    loaded = us._load_dashboards(email)  # noqa: SLF001
    assert loaded[0]["formatting"][0]["properties"]["color"] == "#123456"

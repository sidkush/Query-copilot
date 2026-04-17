"""
Plan 4c T12 — regression guard: `parameters` persists through the freeform
dashboard path (migration + user_storage whitelist).

Mirrors the Plan 4b `test_sets_roundtrip.py` pattern — `user_storage` routes
through `_backend` (a `FileStorage` whose `root` is `_STORAGE_ROOT`), so to
isolate the filesystem we swap the backend root and write the seed through
the same key helper the read path uses.
"""

from __future__ import annotations

import json

import pytest

from dashboard_migration import legacy_to_freeform_schema


def test_freeform_schema_includes_empty_parameters_by_default():
    out = legacy_to_freeform_schema({"id": "d1", "name": "D", "tiles": []})
    assert out["parameters"] == []


def test_freeform_schema_preserves_existing_parameters_when_present():
    existing = [{
        "id": "p1",
        "name": "region",
        "type": "string",
        "value": "West",
        "domain": {"kind": "free"},
        "createdAt": "2026-04-16T00:00:00Z",
    }]
    out = legacy_to_freeform_schema(
        {"id": "d1", "name": "D", "tiles": [], "parameters": existing},
    )
    assert out["parameters"] == existing


def test_freeform_schema_coerces_non_list_parameters_to_empty():
    out = legacy_to_freeform_schema(
        {"id": "d1", "name": "D", "tiles": [], "parameters": "not-a-list"},
    )
    assert out["parameters"] == []


@pytest.fixture
def isolated_storage_root(monkeypatch, tmp_path):
    import user_storage

    fake_root = tmp_path / "storage_root"
    fake_root.mkdir()
    monkeypatch.setattr(user_storage._backend, "root", fake_root)
    return fake_root


def test_update_dashboard_preserves_parameters_field(isolated_storage_root):
    import user_storage

    email = "demo@askdb.dev"
    key = user_storage._dashboards_key(email)
    dashboards_path = isolated_storage_root / key
    dashboards_path.parent.mkdir(parents=True, exist_ok=True)
    seed = [{
        "id": "d1",
        "name": "D",
        "archetype": "analyst-pro",
        "schemaVersion": "askdb/dashboard/v1",
        "tiledRoot": {"id": "root", "type": "container-vert", "w": 100000, "h": 100000, "children": []},
        "floatingLayer": [],
        "worksheets": [],
        "parameters": [],
        "actions": [],
        "sets": [],
    }]
    dashboards_path.write_text(json.dumps(seed), encoding="utf-8")

    new_params = [{
        "id": "p1",
        "name": "region",
        "type": "string",
        "value": "West",
        "domain": {"kind": "free"},
        "createdAt": "2026-04-16T00:00:00Z",
    }]
    updated = user_storage.update_dashboard(email, "d1", {"parameters": new_params})
    assert updated is not None
    assert updated["parameters"] == new_params

    reloaded = user_storage.load_dashboard(email, "d1")
    assert reloaded["parameters"] == new_params

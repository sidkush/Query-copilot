"""
Plan 4b T8 — regression guard that `sets` persists through the freeform
dashboard path.

Two surfaces under test are pure-Python helpers (no FastAPI startup):

  1. dashboard_migration.legacy_to_freeform_schema  -> preserves input sets,
     defaults to [] when absent.
  2. user_storage.update_dashboard                  -> sets is in the field
     whitelist so a write-then-read cycle preserves it.

The user_storage test is filesystem-backed; we isolate it to a tmp_path.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


# --------------------------------------------------------------------------
# 1. legacy_to_freeform_schema
# --------------------------------------------------------------------------

from dashboard_migration import legacy_to_freeform_schema


def test_freeform_schema_includes_empty_sets_by_default():
    out = legacy_to_freeform_schema({"id": "d1", "name": "D", "tiles": []})
    assert out["sets"] == []


def test_freeform_schema_preserves_existing_sets_when_present():
    existing = [
        {
            "id": "s1",
            "name": "Top Regions",
            "dimension": "region",
            "members": ["East", "West"],
            "createdAt": "2026-04-16T00:00:00Z",
        }
    ]
    out = legacy_to_freeform_schema(
        {"id": "d1", "name": "D", "tiles": [], "sets": existing},
    )
    assert out["sets"] == existing


def test_freeform_schema_coerces_non_list_sets_to_empty():
    out = legacy_to_freeform_schema(
        {"id": "d1", "name": "D", "tiles": [], "sets": "not-a-list"},
    )
    assert out["sets"] == []


# --------------------------------------------------------------------------
# 2. user_storage.update_dashboard allowlist — sets round-trip
# --------------------------------------------------------------------------


@pytest.fixture
def isolated_user_dir(monkeypatch, tmp_path):
    """Redirect user_storage's filesystem root into tmp_path.

    `user_storage` routes through `_backend` (a `FileStorage` whose `root` is
    `_STORAGE_ROOT`, i.e. `backend/.data`). The per-dashboard key goes through
    `_user_prefix` (a sha256 hash), so to isolate we just swap the backend root.
    """
    import user_storage

    fake_root = tmp_path / "storage_root"
    fake_root.mkdir()

    monkeypatch.setattr(user_storage._backend, "root", fake_root)
    return fake_root


def test_update_dashboard_preserves_sets_field(isolated_user_dir):
    import user_storage

    email = "demo@askdb.dev"
    # Seed dashboards.json with one dashboard via the same key helper so the
    # read path finds it.
    key = user_storage._dashboards_key(email)
    dashboards_path = isolated_user_dir / key
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

    new_sets = [
        {
            "id": "s1",
            "name": "Top Regions",
            "dimension": "region",
            "members": ["East", "West"],
            "createdAt": "2026-04-16T00:00:00Z",
        }
    ]
    updated = user_storage.update_dashboard(
        email, "d1", {"sets": new_sets},
    )
    assert updated is not None
    assert updated["sets"] == new_sets

    # Read back through load path.
    reloaded = user_storage.load_dashboard(email, "d1")
    assert reloaded["sets"] == new_sets

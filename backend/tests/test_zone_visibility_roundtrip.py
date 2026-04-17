"""
Plan 4d T7 — confirm a zone's visibilityRule survives the
user_storage.update_dashboard read/write cycle. user_storage already
whitelists tiledRoot/floatingLayer as opaque blobs, so this is an
invariance test, not a code change.
"""

import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import user_storage  # noqa: E402


@pytest.fixture
def isolated_backend(monkeypatch):
    """Swap the module-level _backend to a temp-rooted FileStorage."""
    with tempfile.TemporaryDirectory() as td:
        backend = user_storage.FileStorage(Path(td))
        monkeypatch.setattr(user_storage, "_backend", backend)
        yield user_storage


def test_visibility_rule_survives_update_dashboard(isolated_backend):
    us = isolated_backend
    email = "vis-roundtrip@askdb.dev"

    created = us.create_dashboard(email, "Vis")
    dashboard_id = created["id"]

    tiled_root = {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": [
            {
                "id": "z1",
                "type": "blank",
                "w": 100000,
                "h": 100000,
                "visibilityRule": {
                    "kind": "parameterEquals",
                    "parameterId": "p1",
                    "value": "priority",
                },
            }
        ],
    }
    floating_layer = [
        {
            "id": "f1",
            "type": "blank",
            "floating": True,
            "x": 0,
            "y": 0,
            "pxW": 100,
            "pxH": 100,
            "zIndex": 0,
            "w": 100,
            "h": 100,
            "visibilityRule": {
                "kind": "hasActiveFilter",
                "sheetId": "sheet-1",
            },
        }
    ]

    us.update_dashboard(
        email,
        dashboard_id,
        {
            "schemaVersion": "askdb/dashboard/v1",
            "archetype": "analyst-pro",
            "size": {"mode": "automatic"},
            "tiledRoot": tiled_root,
            "floatingLayer": floating_layer,
            "worksheets": [],
            "parameters": [],
            "sets": [],
            "actions": [],
        },
    )

    after = us.load_dashboard(email, dashboard_id)
    assert after is not None
    assert after["tiledRoot"]["children"][0]["visibilityRule"] == {
        "kind": "parameterEquals",
        "parameterId": "p1",
        "value": "priority",
    }
    assert after["floatingLayer"][0]["visibilityRule"] == {
        "kind": "hasActiveFilter",
        "sheetId": "sheet-1",
    }


def test_full_tiledroot_replacement_preserves_rule(isolated_backend):
    us = isolated_backend
    email = "vis-roundtrip-2@askdb.dev"
    created = us.create_dashboard(email, "Vis2")
    dashboard_id = created["id"]

    new_root = {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": [
            {
                "id": "z2",
                "type": "blank",
                "w": 100000,
                "h": 100000,
                "visibilityRule": {
                    "kind": "setMembership",
                    "setId": "s1",
                    "mode": "isEmpty",
                },
            }
        ],
    }

    us.update_dashboard(email, dashboard_id, {"tiledRoot": new_root})
    after = us.load_dashboard(email, dashboard_id)
    assert after["tiledRoot"]["children"][0]["visibilityRule"] == {
        "kind": "setMembership",
        "setId": "s1",
        "mode": "isEmpty",
    }

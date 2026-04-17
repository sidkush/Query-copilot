"""
Plan 5d T5 — confirm every new zone property (innerPadding, outerPadding,
background, border, showTitle, showCaption, fitMode) survives the
user_storage.update_dashboard read/write cycle. user_storage whitelists
tiledRoot/floatingLayer as opaque blobs, so this is an invariance test.
"""

import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import user_storage  # noqa: E402


@pytest.fixture
def isolated_backend(monkeypatch):
    with tempfile.TemporaryDirectory() as td:
        backend = user_storage.FileStorage(Path(td))
        monkeypatch.setattr(user_storage, "_backend", backend)
        yield user_storage


def test_all_plan5d_fields_survive_update_dashboard(isolated_backend):
    us = isolated_backend
    email = "props-roundtrip@askdb.dev"

    created = us.create_dashboard(email, "Props")
    dashboard_id = created["id"]

    tiled_root = {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": [
            {
                "id": "z1",
                "type": "worksheet",
                "w": 100000,
                "h": 100000,
                "worksheetRef": "z1",
                "innerPadding": 12,
                "outerPadding": 4,
                "background": {"color": "#112233", "opacity": 0.5},
                "border": {
                    "weight": [1, 0, 2, 0],
                    "color": "#abcdef",
                    "style": "dashed",
                },
                "showTitle": False,
                "showCaption": True,
                "fitMode": "fit-width",
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
            "pxW": 200,
            "pxH": 200,
            "w": 0,
            "h": 0,
            "zIndex": 1,
            "innerPadding": 6,
            "fitMode": "entire",
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

    loaded = us.load_dashboard(email, dashboard_id)
    z = loaded["tiledRoot"]["children"][0]
    assert z["innerPadding"] == 12
    assert z["outerPadding"] == 4
    assert z["background"] == {"color": "#112233", "opacity": 0.5}
    assert z["border"] == {"weight": [1, 0, 2, 0], "color": "#abcdef", "style": "dashed"}
    assert z["showTitle"] is False
    assert z["showCaption"] is True
    assert z["fitMode"] == "fit-width"
    f = loaded["floatingLayer"][0]
    assert f["innerPadding"] == 6
    assert f["fitMode"] == "entire"


def test_missing_properties_are_not_default_filled_on_load(isolated_backend):
    """Defaults live in the frontend (zoneDefaults.ts) — the backend must
    NEVER rewrite a dashboard that did not carry these fields."""
    us = isolated_backend
    email = "no-default-fill@askdb.dev"
    created = us.create_dashboard(email, "Untouched")
    dashboard_id = created["id"]

    us.update_dashboard(
        email,
        dashboard_id,
        {
            "schemaVersion": "askdb/dashboard/v1",
            "archetype": "analyst-pro",
            "size": {"mode": "automatic"},
            "tiledRoot": {
                "id": "root",
                "type": "container-vert",
                "w": 100000,
                "h": 100000,
                "children": [
                    {"id": "z1", "type": "worksheet", "w": 100000, "h": 100000, "worksheetRef": "z1"},
                ],
            },
            "floatingLayer": [],
            "worksheets": [],
            "parameters": [],
            "sets": [],
            "actions": [],
        },
    )

    loaded = us.load_dashboard(email, dashboard_id)
    z = loaded["tiledRoot"]["children"][0]
    for field in ("innerPadding", "outerPadding", "background", "border",
                  "showTitle", "showCaption", "fitMode"):
        assert field not in z, f"{field} must not be default-filled on load"

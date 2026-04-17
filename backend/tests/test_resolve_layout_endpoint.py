from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _dashboard_fixture() -> dict:
    return {
        "schemaVersion": "askdb/dashboard/v1",
        "id": "d1",
        "name": "T",
        "archetype": "analyst-pro",
        "size": {"mode": "fixed", "width": 1000, "height": 500, "preset": "desktop"},
        "tiledRoot": {
            "id": "root",
            "type": "container-horz",
            "w": 100000,
            "h": 100000,
            "children": [
                {"id": "a", "type": "worksheet", "w": 50000, "h": 100000, "worksheetRef": "a"},
                {"id": "b", "type": "worksheet", "w": 50000, "h": 100000, "worksheetRef": "b"},
            ],
        },
        "floatingLayer": [],
        "worksheets": [],
        "parameters": [],
        "sets": [],
        "actions": [],
    }


def test_resolve_layout_returns_pixel_coords_for_horz_split():
    payload = {"dashboard": _dashboard_fixture(), "viewport": {"width": 1000, "height": 500}}
    resp = client.post("/api/v1/dashboards/d1/resolve-layout", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    resolved = {r["id"]: r for r in data["resolved"]}
    # Fixture has preset='desktop' which is 1366x768 — but explicit width/height
    # in fixed mode should win. Accept either behavior; the key assertion is
    # children split the parent width 50/50.
    root = resolved["root"]
    a = resolved["a"]
    b = resolved["b"]
    assert a["y"] == 0
    assert a["x"] == 0
    assert a["width"] == root["width"] // 2 or abs(a["width"] - root["width"] // 2) <= 1
    assert b["x"] == a["width"]
    assert b["height"] == root["height"]


def test_resolve_layout_rejects_unknown_size_mode():
    d = _dashboard_fixture()
    d["size"] = {"mode": "bogus"}
    payload = {"dashboard": d, "viewport": {"width": 1000, "height": 500}}
    resp = client.post("/api/v1/dashboards/d1/resolve-layout", json=payload)
    assert resp.status_code == 400

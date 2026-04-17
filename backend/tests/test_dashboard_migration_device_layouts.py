"""Plan 6a — device-layout round-trip tests."""
import inspect
from dashboard_migration import legacy_to_freeform_schema
import user_storage


def _legacy_dash_with_device_layouts() -> dict:
    return {
        "id": "d1",
        "name": "Test",
        "tiles": [
            {"id": "tile-1", "title": "A", "chart_spec": {"mark": "bar"}, "sql": "SELECT 1"},
            {"id": "tile-2", "title": "B", "chart_spec": {"mark": "line"}, "sql": "SELECT 2"},
        ],
        "deviceLayouts": {
            "phone": {
                "zoneOverrides": {
                    "tile-2": {"visible": False},
                    "tile-1": {"x": 0, "y": 0, "w": 375, "h": 300},
                }
            }
        },
    }


def test_migration_preserves_device_layouts():
    legacy = _legacy_dash_with_device_layouts()
    result = legacy_to_freeform_schema(legacy)
    assert "deviceLayouts" in result
    assert result["deviceLayouts"]["phone"]["zoneOverrides"]["tile-2"]["visible"] is False
    assert result["deviceLayouts"]["phone"]["zoneOverrides"]["tile-1"]["w"] == 375


def test_migration_omits_device_layouts_when_missing():
    legacy = {
        "id": "d2",
        "name": "No-device",
        "tiles": [{"id": "x", "chart_spec": {}, "sql": "SELECT 1"}],
    }
    result = legacy_to_freeform_schema(legacy)
    assert "deviceLayouts" not in result


def test_user_storage_allowlist_includes_device_layouts():
    src = inspect.getsource(user_storage.update_dashboard)
    assert '"deviceLayouts"' in src, "update_dashboard allowlist must include 'deviceLayouts' after Plan 6a T10"

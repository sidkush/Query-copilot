"""Tests for chart type schema versioning and auto-migration (v1 → v2).

Covers:
  - v1 type gains tier / version / capabilities on migration
  - v2 type passes through unchanged (no-op)
  - Custom fields on a v1 type survive migration intact
  - list_chart_types() auto-migrates types stored at v1
"""
import pytest

from chart_customization import (
    CURRENT_SCHEMA_VERSION,
    _customizations_path,
    _load_raw,
    _save_raw,
    list_chart_types,
    migrate_chart_type,
    save_chart_type,
)


TEST_USER = "migration-test@askdb.dev"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def cleanup():
    """Wipe the test user's customizations file before and after every test."""
    path = _customizations_path(TEST_USER)
    if path.exists():
        path.unlink()
    yield
    if path.exists():
        path.unlink()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _v1_type(extra: dict | None = None) -> dict:
    base = {
        "id": "org:bar",
        "name": "Bar",
        "schemaVersion": 1,
        "parameters": [],
        "specTemplate": {
            "$schema": "askdb/chart-spec/v1",
            "type": "cartesian",
            "mark": "bar",
        },
    }
    if extra:
        base.update(extra)
    return base


def _v2_type() -> dict:
    return {
        "id": "org:line",
        "name": "Line",
        "schemaVersion": 2,
        "tier": "spec",
        "version": "1.0.0",
        "capabilities": {"dataRoles": ["x", "y"]},
        "parameters": [],
        "specTemplate": {
            "$schema": "askdb/chart-spec/v1",
            "type": "cartesian",
            "mark": "line",
        },
    }


# ---------------------------------------------------------------------------
# Unit tests for migrate_chart_type()
# ---------------------------------------------------------------------------


class TestMigrateChartType:
    def test_v1_migrates_to_v2(self):
        result = migrate_chart_type(_v1_type())

        assert result["schemaVersion"] == 2
        assert result["tier"] == "spec"
        assert result["version"] == "1.0.0"
        assert result["capabilities"] == {"dataRoles": []}

    def test_v2_is_noop(self):
        original = _v2_type()
        result = migrate_chart_type(original)

        # Must be the same object (no copy for already-current types).
        assert result is original
        assert result["schemaVersion"] == 2
        assert result["capabilities"] == {"dataRoles": ["x", "y"]}

    def test_migration_preserves_existing_fields(self):
        ct = _v1_type({"customTag": "revenue-waterfall", "owner": "finance-team"})
        result = migrate_chart_type(ct)

        assert result["schemaVersion"] == 2
        assert result["customTag"] == "revenue-waterfall"
        assert result["owner"] == "finance-team"
        # Core fields were added.
        assert result["tier"] == "spec"
        assert result["version"] == "1.0.0"

    def test_v1_existing_tier_not_overwritten(self):
        ct = _v1_type({"tier": "custom-lane"})
        result = migrate_chart_type(ct)

        # Pre-existing `tier` must be preserved, not overwritten with "spec".
        assert result["tier"] == "custom-lane"

    def test_v1_existing_version_not_overwritten(self):
        ct = _v1_type({"version": "2.3.1"})
        result = migrate_chart_type(ct)

        assert result["version"] == "2.3.1"

    def test_v1_existing_capabilities_not_overwritten(self):
        ct = _v1_type({"capabilities": {"dataRoles": ["x"], "extras": True}})
        result = migrate_chart_type(ct)

        assert result["capabilities"] == {"dataRoles": ["x"], "extras": True}

    def test_migration_does_not_mutate_input(self):
        original = _v1_type()
        _ = migrate_chart_type(original)

        # The input dict must be untouched.
        assert original.get("schemaVersion") == 1
        assert "tier" not in original

    def test_current_schema_version_is_2(self):
        assert CURRENT_SCHEMA_VERSION == 2

    def test_missing_schema_version_treated_as_v1(self):
        ct = _v1_type()
        del ct["schemaVersion"]
        result = migrate_chart_type(ct)

        assert result["schemaVersion"] == 2
        assert result["tier"] == "spec"


# ---------------------------------------------------------------------------
# Integration test — list_chart_types() auto-migrates
# ---------------------------------------------------------------------------


class TestListChartTypesAutoMigrates:
    def test_list_chart_types_auto_migrates(self):
        """Save a raw v1 type directly to storage (bypassing save_chart_type
        validation), then verify list_chart_types() returns it at v2.
        """
        raw_v1 = _v1_type()
        # Bypass the public API to simulate a v1 type already on disk.
        data = _load_raw(TEST_USER)
        data["chart_types"] = [raw_v1]
        _save_raw(TEST_USER, data)

        result = list_chart_types(TEST_USER)

        assert len(result) == 1
        ct = result[0]
        assert ct["schemaVersion"] == 2
        assert ct["tier"] == "spec"
        assert ct["version"] == "1.0.0"
        assert ct["capabilities"] == {"dataRoles": []}

    def test_list_returns_v2_unchanged(self):
        """v2 type stored on disk comes back identical."""
        raw_v2 = _v2_type()
        data = _load_raw(TEST_USER)
        data["chart_types"] = [raw_v2]
        _save_raw(TEST_USER, data)

        result = list_chart_types(TEST_USER)

        assert result[0]["schemaVersion"] == 2
        assert result[0]["capabilities"] == {"dataRoles": ["x", "y"]}

    def test_save_v1_then_list_returns_v2(self):
        """End-to-end: save via public API (v1 input), list returns v2."""
        save_chart_type(TEST_USER, _v1_type())
        result = list_chart_types(TEST_USER)

        assert len(result) == 1
        assert result[0]["schemaVersion"] == 2
        assert result[0]["tier"] == "spec"

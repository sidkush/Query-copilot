"""Tests for chart_customization — per-user storage for user chart
types (Sub-project C) and semantic models (Sub-project D)."""
import json
from pathlib import Path

import pytest

from chart_customization import (
    delete_chart_type,
    delete_semantic_model,
    list_chart_types,
    list_semantic_models,
    migrate_chart_type,
    save_chart_type,
    save_semantic_model,
    _customizations_path,
)


TEST_USER = "chart-custom-test@askdb.dev"


@pytest.fixture(autouse=True)
def cleanup_customizations():
    """Remove the test user's customizations file before and after each test."""
    path = _customizations_path(TEST_USER)
    if path.exists():
        path.unlink()
    yield
    if path.exists():
        path.unlink()


def _waterfall_type():
    return {
        "id": "org:waterfall",
        "name": "Waterfall",
        "schemaVersion": 1,
        "parameters": [],
        "specTemplate": {
            "$schema": "askdb/chart-spec/v1",
            "type": "cartesian",
            "mark": "bar",
        },
    }


def _retail_model():
    return {
        "id": "org:retail",
        "name": "Retail",
        "version": 1,
        "dimensions": [],
        "measures": [],
        "metrics": [],
    }


class TestUserChartTypes:
    def test_list_empty_for_new_user(self):
        assert list_chart_types(TEST_USER) == []

    def test_save_and_list(self):
        save_chart_type(TEST_USER, _waterfall_type())
        result = list_chart_types(TEST_USER)
        assert len(result) == 1
        assert result[0]["id"] == "org:waterfall"

    def test_save_replaces_existing_by_id(self):
        save_chart_type(TEST_USER, _waterfall_type())
        updated = _waterfall_type()
        updated["name"] = "Waterfall v2"
        save_chart_type(TEST_USER, updated)
        result = list_chart_types(TEST_USER)
        assert len(result) == 1
        assert result[0]["name"] == "Waterfall v2"

    def test_save_multiple_distinct_ids(self):
        save_chart_type(TEST_USER, _waterfall_type())
        other = {**_waterfall_type(), "id": "org:funnel", "name": "Funnel"}
        save_chart_type(TEST_USER, other)
        assert len(list_chart_types(TEST_USER)) == 2

    def test_delete_existing(self):
        save_chart_type(TEST_USER, _waterfall_type())
        removed = delete_chart_type(TEST_USER, "org:waterfall")
        assert removed is True
        assert list_chart_types(TEST_USER) == []

    def test_delete_missing_returns_false(self):
        removed = delete_chart_type(TEST_USER, "org:nothing")
        assert removed is False

    def test_rejects_missing_id(self):
        bad = {**_waterfall_type(), "id": ""}
        with pytest.raises(ValueError):
            save_chart_type(TEST_USER, bad)

    def test_rejects_wrong_schema_version(self):
        bad = {**_waterfall_type(), "schemaVersion": 99}
        with pytest.raises(ValueError):
            save_chart_type(TEST_USER, bad)

    def test_accepts_schema_version_2(self):
        v2 = {**_waterfall_type(), "schemaVersion": 2}
        saved = save_chart_type(TEST_USER, v2)
        assert saved["schemaVersion"] == 2

    def test_atomic_write_yields_valid_json(self):
        save_chart_type(TEST_USER, _waterfall_type())
        path = _customizations_path(TEST_USER)
        raw = path.read_text(encoding="utf-8")
        parsed = json.loads(raw)
        assert "chart_types" in parsed
        assert "semantic_models" in parsed


class TestSemanticModels:
    def test_list_empty_for_new_user(self):
        assert list_semantic_models(TEST_USER) == []

    def test_save_and_list(self):
        save_semantic_model(TEST_USER, _retail_model())
        result = list_semantic_models(TEST_USER)
        assert len(result) == 1
        assert result[0]["id"] == "org:retail"

    def test_delete_existing(self):
        save_semantic_model(TEST_USER, _retail_model())
        removed = delete_semantic_model(TEST_USER, "org:retail")
        assert removed is True
        assert list_semantic_models(TEST_USER) == []

    def test_save_replaces_existing_by_id(self):
        save_semantic_model(TEST_USER, _retail_model())
        updated = {**_retail_model(), "name": "Retail v2"}
        save_semantic_model(TEST_USER, updated)
        result = list_semantic_models(TEST_USER)
        assert len(result) == 1
        assert result[0]["name"] == "Retail v2"

    def test_rejects_wrong_version(self):
        bad = {**_retail_model(), "version": 2}
        with pytest.raises(ValueError):
            save_semantic_model(TEST_USER, bad)


class TestCrossAsset:
    def test_chart_types_and_semantic_models_isolated(self):
        save_chart_type(TEST_USER, _waterfall_type())
        save_semantic_model(TEST_USER, _retail_model())
        assert len(list_chart_types(TEST_USER)) == 1
        assert len(list_semantic_models(TEST_USER)) == 1
        delete_chart_type(TEST_USER, "org:waterfall")
        assert list_chart_types(TEST_USER) == []
        assert len(list_semantic_models(TEST_USER)) == 1

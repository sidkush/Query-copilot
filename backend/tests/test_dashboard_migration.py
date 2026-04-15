"""Tests for dashboard_migration — legacy tile → ChartSpec conversion."""
import copy

import pytest

from dashboard_migration import (
    legacy_to_chart_spec,
    migrate_dashboard,
    MigrationStats,
)


def _bar_tile():
    return {
        "id": "tile-1",
        "title": "Revenue by region",
        "chartType": "bar",
        "columns": [
            {"name": "region", "dtype": "string"},
            {"name": "revenue", "dtype": "float"},
        ],
        "rows": [["North", 100], ["South", 80]],
        "selectedMeasure": "revenue",
        "palette": "default",
    }


def test_bar_tile_converts_to_cartesian_spec():
    spec = legacy_to_chart_spec(_bar_tile())
    assert spec is not None
    assert spec["$schema"] == "askdb/chart-spec/v1"
    assert spec["type"] == "cartesian"
    assert spec["mark"] == "bar"
    assert spec["encoding"]["x"] == {"field": "region", "type": "nominal"}
    assert spec["encoding"]["y"]["field"] == "revenue"
    assert spec["encoding"]["y"]["type"] == "quantitative"
    assert spec["encoding"]["y"]["aggregate"] == "sum"
    assert spec["title"] == "Revenue by region"


def test_line_tile_converts_to_line_mark():
    tile = _bar_tile()
    tile["chartType"] = "line"
    tile["columns"] = [
        {"name": "month", "dtype": "date"},
        {"name": "revenue", "dtype": "float"},
    ]
    spec = legacy_to_chart_spec(tile)
    assert spec is not None
    assert spec["mark"] == "line"
    assert spec["encoding"]["x"]["type"] == "temporal"


def test_pie_tile_converts_to_arc_mark():
    tile = _bar_tile()
    tile["chartType"] = "pie"
    spec = legacy_to_chart_spec(tile)
    assert spec is not None
    assert spec["mark"] == "arc"


def test_unknown_chart_type_defaults_to_bar():
    tile = _bar_tile()
    tile["chartType"] = "treemap-zoom"  # not in the map
    spec = legacy_to_chart_spec(tile)
    assert spec is not None
    assert spec["mark"] == "bar"


def test_tile_without_chart_type_returns_none():
    tile = _bar_tile()
    tile.pop("chartType")
    assert legacy_to_chart_spec(tile) is None


def test_tile_without_columns_returns_none():
    tile = _bar_tile()
    tile["columns"] = []
    assert legacy_to_chart_spec(tile) is None


def test_third_nominal_column_becomes_color_encoding():
    tile = {
        "id": "tile-multi",
        "chartType": "line",
        "columns": [
            {"name": "month", "dtype": "date"},
            {"name": "revenue", "dtype": "float"},
            {"name": "region", "dtype": "string"},
        ],
    }
    spec = legacy_to_chart_spec(tile)
    assert spec is not None
    assert spec["encoding"]["color"] == {"field": "region", "type": "nominal"}


def test_string_column_entries_accepted():
    """Legacy tiles can store columns as plain strings — converter tolerates."""
    tile = {
        "chartType": "bar",
        "columns": ["category", "value"],
    }
    spec = legacy_to_chart_spec(tile)
    assert spec is not None
    assert spec["encoding"]["x"]["field"] == "category"
    assert spec["encoding"]["y"]["field"] == "value"


def test_migrate_dashboard_idempotent_on_second_run():
    tile = _bar_tile()
    dashboard = {
        "id": "d1",
        "tabs": [
            {
                "sections": [
                    {
                        "tiles": [tile, _bar_tile(), _bar_tile()],
                    }
                ]
            }
        ],
    }
    first = migrate_dashboard(copy.deepcopy(dashboard))
    # Inject an already-migrated tile in a fresh run to verify skip-existing path.
    dashboard_with_existing = copy.deepcopy(dashboard)
    dashboard_with_existing["tabs"][0]["sections"][0]["tiles"][0]["chart_spec"] = {
        "$schema": "askdb/chart-spec/v1",
        "type": "cartesian",
        "mark": "bar",
    }
    second = migrate_dashboard(dashboard_with_existing)

    assert first.tiles_total == 3
    assert first.tiles_migrated == 3
    assert first.tiles_skipped_existing == 0

    assert second.tiles_total == 3
    assert second.tiles_migrated == 2
    assert second.tiles_skipped_existing == 1


def test_migrate_dashboard_handles_malformed_tile():
    dashboard = {
        "id": "d1",
        "tabs": [
            {
                "sections": [
                    {
                        "tiles": [
                            _bar_tile(),
                            {"id": "malformed", "chartType": "bar", "columns": []},
                            {"id": "no-type", "columns": ["a", "b"]},
                        ]
                    }
                ]
            }
        ],
    }
    stats = migrate_dashboard(dashboard)
    assert stats.tiles_total == 3
    assert stats.tiles_migrated == 1
    assert stats.tiles_skipped_unconvertible == 2

"""Integration tests for DuckDBTwin.query_twin_downsampled().

Creates a real DuckDB twin file in a temp directory, populates it with
synthetic data, and exercises each downsampling strategy end-to-end.

Tests are written to be resilient to DuckDB version quirks — they assert
row-count shape, not exact downsample output rows.
"""
import os
import shutil
import tempfile
from pathlib import Path

import duckdb
import pandas as pd
import pytest

from chart_downsampler import DownsampleStrategy
from config import settings
from duckdb_twin import DuckDBTwin


@pytest.fixture
def tmp_twin():
    """Create a DuckDBTwin pointed at a temp directory; populate one table."""
    tmp_dir = tempfile.mkdtemp(prefix="askdb_b1_twin_")
    original_twin_dir = settings.TURBO_TWIN_DIR
    settings.TURBO_TWIN_DIR = tmp_dir
    try:
        twin = DuckDBTwin()
        conn_id = "test_conn"
        twin_path = Path(tmp_dir) / f"{conn_id}.duckdb"
        # Populate with 5000 rows of numeric time series
        con = duckdb.connect(str(twin_path))
        con.execute("""
            CREATE TABLE metrics AS
            SELECT
                i AS ts,
                SIN(i / 100.0) * 100 + RANDOM() * 10 AS val,
                CASE WHEN i % 4 = 0 THEN 'north' ELSE 'south' END AS region
            FROM range(5000) t(i)
        """)
        con.close()
        yield twin, conn_id
    finally:
        settings.TURBO_TWIN_DIR = original_twin_dir
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_downsampled_returns_none_strategy_for_small_queries(tmp_twin):
    twin, conn_id = tmp_twin
    result = twin.query_twin_downsampled(
        conn_id,
        "SELECT ts, val FROM metrics LIMIT 100",
        target_points=4000,
        x_col="ts",
        x_type="quantitative",
        y_col="val",
        y_type="quantitative",
    )
    assert result.get("status") != "error", result
    assert result["downsampled"] is False
    assert result["downsample_method"] == "none"
    assert result["row_count"] == 100


def test_downsampled_applies_lttb_for_large_numeric_query(tmp_twin):
    twin, conn_id = tmp_twin
    result = twin.query_twin_downsampled(
        conn_id,
        "SELECT ts, val FROM metrics",
        target_points=500,
        x_col="ts",
        x_type="quantitative",
        y_col="val",
        y_type="quantitative",
    )
    assert result.get("status") != "error", result
    assert result["downsampled"] is True
    assert result["downsample_method"] == "lttb"
    # LTTB returns approximately target_points rows (first + last + middle buckets)
    # Allow ±10% tolerance for DuckDB NTILE bucketing edge cases
    assert 450 <= result["row_count"] <= 550, f"expected ~500, got {result['row_count']}"


def test_downsampled_applies_uniform_for_nominal_query(tmp_twin):
    twin, conn_id = tmp_twin
    result = twin.query_twin_downsampled(
        conn_id,
        "SELECT region, val FROM metrics",
        target_points=500,
        x_col="region",
        x_type="nominal",
        y_col="val",
        y_type="quantitative",
    )
    assert result.get("status") != "error", result
    assert result["downsampled"] is True
    assert result["downsample_method"] == "uniform"
    assert result["row_count"] == 500


def test_downsampled_applies_pixel_min_max_with_pixel_width(tmp_twin):
    twin, conn_id = tmp_twin
    result = twin.query_twin_downsampled(
        conn_id,
        "SELECT ts, val FROM metrics",
        target_points=4000,
        x_col="ts",
        x_type="quantitative",
        y_col="val",
        y_type="quantitative",
        pixel_width=200,
    )
    assert result.get("status") != "error", result
    assert result["downsampled"] is True
    assert result["downsample_method"] == "pixel_min_max"
    # pixel_min_max emits one row per pixel bucket. The FLOOR formula can produce
    # bucket 0..pixel_width inclusive (the max-x value hits the upper edge),
    # so the actual row count can be up to pixel_width + 1.
    assert result["row_count"] <= 201  # pixel_width + 1 for inclusive upper edge


def test_downsampled_falls_back_to_uniform_when_columns_missing(tmp_twin):
    twin, conn_id = tmp_twin
    # Ask for LTTB but don't supply x_col/y_col
    result = twin.query_twin_downsampled(
        conn_id,
        "SELECT * FROM metrics",
        target_points=500,
        x_col=None,
        y_col=None,
        strategy=DownsampleStrategy.LTTB,
    )
    assert result.get("status") != "error", result
    assert result["downsample_method"] == "uniform"  # downgraded fallback


def test_downsampled_rejects_invalid_target_points(tmp_twin):
    twin, conn_id = tmp_twin
    result = twin.query_twin_downsampled(
        conn_id,
        "SELECT * FROM metrics",
        target_points=0,
    )
    assert result.get("status") == "error"
    assert "target_points" in result["message"]


def test_downsampled_propagates_sql_validator_errors(tmp_twin):
    twin, conn_id = tmp_twin
    # Multi-statement SQL is blocked by SQLValidator
    result = twin.query_twin_downsampled(
        conn_id,
        "SELECT 1; DROP TABLE metrics",
        target_points=100,
    )
    assert result.get("status") == "error"

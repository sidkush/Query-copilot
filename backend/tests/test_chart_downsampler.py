"""Tests for chart_downsampler.py — sub-project B, Phase B1.

Pure unit tests on the strategy picker and SQL fragment generators.
No DuckDB execution — that happens in test_duckdb_twin_downsampled.py
(added in task B1.4).
"""
import pytest

from chart_downsampler import (
    DownsampleStrategy,
    pick_strategy,
    uniform_sql,
    aggregate_bin_sql,
    pixel_min_max_sql,
    lttb_sql,
)


# ─── pick_strategy() ──────────────────────────────────────────────────────


def test_pick_returns_none_when_row_count_under_target():
    assert pick_strategy(500, 4000, "t", "temporal", "y", "quantitative") is DownsampleStrategy.NONE


def test_pick_returns_aggregate_bin_when_bin_transform_present():
    assert pick_strategy(
        1_000_000, 4000, "t", "temporal", "y", "quantitative", has_bin_transform=True
    ) is DownsampleStrategy.AGGREGATE_BIN


def test_pick_returns_lttb_for_temporal_quantitative():
    assert pick_strategy(
        1_000_000, 4000, "t", "temporal", "y", "quantitative"
    ) is DownsampleStrategy.LTTB


def test_pick_returns_lttb_for_quantitative_quantitative():
    assert pick_strategy(
        500_000, 4000, "x", "quantitative", "y", "quantitative"
    ) is DownsampleStrategy.LTTB


def test_pick_returns_pixel_min_max_when_pixel_width_set():
    assert pick_strategy(
        10_000_000, 4000, "t", "temporal", "y", "quantitative", pixel_width=800
    ) is DownsampleStrategy.PIXEL_MIN_MAX


def test_pick_returns_uniform_for_nominal_x():
    assert pick_strategy(
        1_000_000, 4000, "region", "nominal", "sales", "quantitative"
    ) is DownsampleStrategy.UNIFORM


def test_pick_returns_uniform_for_missing_y_type():
    assert pick_strategy(
        1_000_000, 4000, "t", "temporal", None, None
    ) is DownsampleStrategy.UNIFORM


def test_pick_boundary_row_count_equals_target():
    # Exactly at target → NONE (≤ inclusive)
    assert pick_strategy(4000, 4000, "t", "temporal", "y", "quantitative") is DownsampleStrategy.NONE


def test_pick_target_just_above_row_count():
    assert pick_strategy(4001, 4000, "t", "temporal", "y", "quantitative") is DownsampleStrategy.LTTB


def test_pick_ignores_pixel_width_when_not_temporal_or_quant():
    # Nominal x + pixel_width → still uniform (pixel_min_max requires quant/temporal x)
    assert pick_strategy(
        1_000_000, 4000, "region", "nominal", "sales", "quantitative", pixel_width=800
    ) is DownsampleStrategy.UNIFORM


# ─── uniform_sql() ────────────────────────────────────────────────────────


def test_uniform_sql_wraps_input_and_uses_sample_repeatable():
    sql = uniform_sql("SELECT * FROM events", 1000)
    assert "WITH _src AS" in sql
    assert "SELECT * FROM events" in sql
    assert "USING SAMPLE 1000 ROWS REPEATABLE (42)" in sql


def test_uniform_sql_raises_on_non_positive_target():
    with pytest.raises(ValueError):
        uniform_sql("SELECT 1", 0)
    with pytest.raises(ValueError):
        uniform_sql("SELECT 1", -5)


# ─── aggregate_bin_sql() ──────────────────────────────────────────────────


def test_aggregate_bin_sql_uses_width_bucket():
    sql = aggregate_bin_sql("SELECT * FROM t", "age", 20)
    assert "width_bucket(age" in sql
    assert "20" in sql
    assert "GROUP BY bin_id" in sql


def test_aggregate_bin_sql_includes_y_avg_when_y_col_supplied():
    sql = aggregate_bin_sql("SELECT * FROM t", "age", 20, y_col="salary")
    assert "AVG(salary)" in sql


def test_aggregate_bin_sql_raises_on_bad_inputs():
    with pytest.raises(ValueError):
        aggregate_bin_sql("SELECT 1", "age", 0)
    with pytest.raises(ValueError):
        aggregate_bin_sql("SELECT 1", "", 20)


# ─── pixel_min_max_sql() ──────────────────────────────────────────────────


def test_pixel_min_max_sql_buckets_by_x_and_emits_min_max():
    sql = pixel_min_max_sql("SELECT * FROM metrics", "ts", "val", 800)
    assert "px_bucket" in sql
    assert "MIN(val)" in sql
    assert "MAX(val)" in sql
    assert "FLOOR" in sql


def test_pixel_min_max_sql_raises_on_bad_inputs():
    with pytest.raises(ValueError):
        pixel_min_max_sql("SELECT 1", "ts", "val", 0)
    with pytest.raises(ValueError):
        pixel_min_max_sql("SELECT 1", "", "val", 800)
    with pytest.raises(ValueError):
        pixel_min_max_sql("SELECT 1", "ts", "", 800)


# ─── lttb_sql() ───────────────────────────────────────────────────────────


def test_lttb_sql_uses_ntile_bucketing():
    sql = lttb_sql("SELECT * FROM metrics", "ts", "val", 500)
    assert "NTILE(" in sql
    assert "498" in sql  # middle_points = target - 2
    assert "_bucket_avg" in sql  # checks structural shape


def test_lttb_sql_preserves_first_and_last_points():
    sql = lttb_sql("SELECT * FROM metrics", "ts", "val", 500)
    assert "rn = 1" in sql  # first point
    assert "rn = total_rows" in sql  # last point


def test_lttb_sql_raises_on_small_target():
    with pytest.raises(ValueError):
        lttb_sql("SELECT 1", "ts", "val", 2)


def test_lttb_sql_raises_on_missing_columns():
    with pytest.raises(ValueError):
        lttb_sql("SELECT 1", "", "val", 100)
    with pytest.raises(ValueError):
        lttb_sql("SELECT 1", "ts", "", 100)


def test_lttb_sql_wraps_input():
    sql = lttb_sql("SELECT ts, val FROM metrics", "ts", "val", 500)
    assert "SELECT ts, val FROM metrics" in sql
    assert "WITH _src AS" in sql

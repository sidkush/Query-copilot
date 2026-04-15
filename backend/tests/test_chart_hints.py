"""Tests for chart_hints.py — sub-project B task B1.5.

The helper was extracted into its own module (backend/chart_hints.py)
precisely so these tests don't need to touch query_engine.py, which pulls
in chromadb at module scope and breaks under pytest collection-order
interactions with pandas-importing peer test files.
"""
import pandas as pd

from chart_hints import build_chart_hints, empty_hints


def test_empty_dataframe():
    df = pd.DataFrame()
    hints = build_chart_hints(df, 0)
    assert hints["x_column"] is None
    assert hints["y_column"] is None
    assert hints["row_count_estimate"] == 0


def test_none_dataframe():
    hints = build_chart_hints(None, 5)
    assert hints == empty_hints(5)


def test_temporal_x_quantitative_y():
    df = pd.DataFrame({
        "ts": pd.to_datetime(["2026-01-01", "2026-02-01", "2026-03-01"]),
        "val": [10.0, 20.0, 30.0],
    })
    hints = build_chart_hints(df, 3)
    assert hints["x_column"] == "ts"
    assert hints["x_type"] == "temporal"
    assert hints["y_column"] == "val"
    assert hints["y_type"] == "quantitative"
    assert hints["row_count_estimate"] == 3


def test_nominal_x_quantitative_y():
    df = pd.DataFrame({
        "region": ["north", "south", "east"],
        "sales": [100, 200, 150],
    })
    hints = build_chart_hints(df, 3)
    assert hints["x_column"] == "region"
    assert hints["x_type"] == "nominal"
    assert hints["y_column"] == "sales"
    assert hints["y_type"] == "quantitative"


def test_all_numeric_uses_first_as_x():
    df = pd.DataFrame({
        "a": [1.0, 2.0, 3.0],
        "b": [4.0, 5.0, 6.0],
    })
    hints = build_chart_hints(df, 3)
    assert hints["x_column"] == "a"
    assert hints["x_type"] == "quantitative"
    assert hints["y_column"] == "b"
    assert hints["y_type"] == "quantitative"


def test_no_numeric_y():
    df = pd.DataFrame({
        "region": ["n", "s"],
        "label": ["foo", "bar"],
    })
    hints = build_chart_hints(df, 2)
    assert hints["x_column"] == "region"
    assert hints["y_column"] is None
    assert hints["y_type"] is None


def test_temporal_wins_over_nominal():
    df = pd.DataFrame({
        "region": ["n", "s"],
        "ts": pd.to_datetime(["2026-01-01", "2026-02-01"]),
        "val": [10, 20],
    })
    hints = build_chart_hints(df, 2)
    assert hints["x_column"] == "ts"
    assert hints["x_type"] == "temporal"


def test_empty_hints_shape():
    h = empty_hints(42)
    assert h == {
        "row_count_estimate": 42,
        "x_column": None,
        "x_type": None,
        "y_column": None,
        "y_type": None,
    }

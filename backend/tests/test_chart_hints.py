"""Tests for QueryResult chart_hints field — sub-project B task B1.5."""
import pandas as pd
import pytest

from query_engine import QueryResult, _build_chart_hints


def test_chart_hints_empty_dataframe():
    df = pd.DataFrame()
    hints = _build_chart_hints(df, 0)
    assert hints["x_column"] is None
    assert hints["y_column"] is None
    assert hints["row_count_estimate"] == 0


def test_chart_hints_temporal_x_quantitative_y():
    df = pd.DataFrame({
        "ts": pd.to_datetime(["2026-01-01", "2026-02-01", "2026-03-01"]),
        "val": [10.0, 20.0, 30.0],
    })
    hints = _build_chart_hints(df, 3)
    assert hints["x_column"] == "ts"
    assert hints["x_type"] == "temporal"
    assert hints["y_column"] == "val"
    assert hints["y_type"] == "quantitative"
    assert hints["row_count_estimate"] == 3


def test_chart_hints_nominal_x_quantitative_y():
    df = pd.DataFrame({
        "region": ["north", "south", "east"],
        "sales": [100, 200, 150],
    })
    hints = _build_chart_hints(df, 3)
    assert hints["x_column"] == "region"
    assert hints["x_type"] == "nominal"
    assert hints["y_column"] == "sales"
    assert hints["y_type"] == "quantitative"


def test_chart_hints_all_numeric_uses_first_as_x():
    df = pd.DataFrame({
        "a": [1.0, 2.0, 3.0],
        "b": [4.0, 5.0, 6.0],
    })
    hints = _build_chart_hints(df, 3)
    assert hints["x_column"] == "a"
    assert hints["x_type"] == "quantitative"
    assert hints["y_column"] == "b"
    assert hints["y_type"] == "quantitative"


def test_chart_hints_no_numeric_y():
    df = pd.DataFrame({
        "region": ["n", "s"],
        "label": ["foo", "bar"],
    })
    hints = _build_chart_hints(df, 2)
    assert hints["x_column"] == "region"
    assert hints["y_column"] is None
    assert hints["y_type"] is None


def test_chart_hints_temporal_wins_over_nominal():
    df = pd.DataFrame({
        "region": ["n", "s"],
        "ts": pd.to_datetime(["2026-01-01", "2026-02-01"]),
        "val": [10, 20],
    })
    hints = _build_chart_hints(df, 2)
    assert hints["x_column"] == "ts"
    assert hints["x_type"] == "temporal"


def test_query_result_to_dict_includes_chart_hints():
    df = pd.DataFrame({
        "ts": pd.to_datetime(["2026-01-01", "2026-02-01"]),
        "val": [10.0, 20.0],
    })
    qr = QueryResult(
        question="trend",
        sql="SELECT ts, val FROM metrics",
        data=df,
        columns=["ts", "val"],
        row_count=2,
    )
    out = qr.to_dict()
    assert "chart_hints" in out
    assert out["chart_hints"]["x_column"] == "ts"
    assert out["chart_hints"]["y_column"] == "val"


def test_query_result_to_dict_no_data_still_safe():
    qr = QueryResult(
        question="noop",
        sql="SELECT 1",
        data=None,
        row_count=0,
    )
    out = qr.to_dict()
    # When data is None, to_dict skips the rows/chart_hints block entirely
    assert "chart_hints" not in out or out.get("chart_hints") is None

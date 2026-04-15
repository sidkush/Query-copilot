"""
chart_hints.py — sub-project B (task B1.5).

Infer x/y column + semantic type hints from a pandas DataFrame so the
frontend Render Strategy Router (RSR) can pick a rendering tier without
re-parsing rows. Hints are advisory — RSR re-validates on the client.

Extracted from query_engine.py so tests can import this helper without
pulling in query_engine's chromadb / LLM / ChromaDB dependencies, which
are fragile under pytest collection order on Windows (pandas DLL loads
before chromadb's Documents symbol resolves).
"""
from __future__ import annotations

from typing import Any, Dict, Optional


def empty_hints(row_count: int) -> Dict[str, Any]:
    """Return a safe default hints dict — used when inference fails or df is empty."""
    return {
        "row_count_estimate": row_count,
        "x_column": None,
        "x_type": None,
        "y_column": None,
        "y_type": None,
    }


def build_chart_hints(df, row_count: int) -> Dict[str, Any]:
    """Infer x/y column + semantic type hints from a pandas DataFrame.

    Heuristic:
    - first temporal column (dtype is datetime-like) → x, xType='temporal'
    - else first non-numeric column → x, xType='nominal'
    - else first numeric column → x, xType='quantitative'
    - first remaining numeric column → y, yType='quantitative'
    - if no y found, leave y_column/y_type as None

    Pandas is imported lazily here. Callers that already have pandas loaded
    pay zero additional cost; callers that haven't (e.g. query_engine.py in
    the chromadb DLL-sensitive path) avoid top-level pandas import.
    """
    import pandas as pd  # lazy — avoid chromadb DLL conflict on Windows

    if df is None or df.empty:
        return empty_hints(row_count)

    temporal_col: Optional[str] = None
    nominal_col: Optional[str] = None
    numeric_cols = []
    for col in df.columns:
        dtype = df[col].dtype
        if pd.api.types.is_datetime64_any_dtype(dtype):
            if temporal_col is None:
                temporal_col = col
        elif pd.api.types.is_numeric_dtype(dtype):
            numeric_cols.append(col)
        else:
            if nominal_col is None:
                nominal_col = col

    if temporal_col is not None:
        x_column = temporal_col
        x_type = "temporal"
    elif nominal_col is not None:
        x_column = nominal_col
        x_type = "nominal"
    elif numeric_cols:
        # All-numeric result: first numeric becomes x (quantitative)
        x_column = numeric_cols[0]
        x_type = "quantitative"
        numeric_cols = numeric_cols[1:]
    else:
        x_column = None
        x_type = None

    y_column = numeric_cols[0] if numeric_cols else None
    y_type = "quantitative" if y_column else None

    return {
        "row_count_estimate": row_count,
        "x_column": x_column,
        "x_type": x_type,
        "y_column": y_column,
        "y_type": y_type,
    }

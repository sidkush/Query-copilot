"""Arrow Data Bridge — zero-copy conversions between DuckDB, Arrow, Polars, and pandas.

All tier results flow through this module. JSON serialization happens ONLY at API
boundary (agent_routes.py, query_routes.py), never inside tiers.
"""
from typing import Any, Optional

import pyarrow as pa
import polars as pl
import pandas as pd


def arrow_to_polars(batch: pa.RecordBatch) -> pl.LazyFrame:
    """Convert Arrow RecordBatch to Polars LazyFrame (zero-copy)."""
    table = pa.Table.from_batches([batch])
    return pl.from_arrow(table).lazy()


def arrow_to_pandas(batch: pa.RecordBatch) -> pd.DataFrame:
    """Convert Arrow RecordBatch to pandas DataFrame."""
    return batch.to_pandas()


def arrow_to_json(batch: pa.RecordBatch) -> tuple[list[str], list[list[Any]]]:
    """Convert Arrow RecordBatch to (columns, rows) for JSON API responses.

    This is the ONLY place Arrow data gets serialized to Python lists.
    Call this at API boundary only — never inside tiers or agent engine.
    """
    columns = [field.name for field in batch.schema]
    rows = []
    for i in range(batch.num_rows):
        row = []
        for col_idx in range(batch.num_columns):
            val = batch.column(col_idx)[i].as_py()
            row.append(val)
        rows.append(row)
    return columns, rows


def polars_to_arrow(df: pl.DataFrame) -> pa.RecordBatch:
    """Convert Polars DataFrame to Arrow RecordBatch."""
    table = df.to_arrow()
    batches = table.to_batches()
    if not batches:
        return pa.RecordBatch.from_pydict({col: [] for col in df.columns})
    return batches[0] if len(batches) == 1 else pa.Table.from_batches(batches).to_batches()[0]


def pandas_to_arrow(df: pd.DataFrame) -> pa.RecordBatch:
    """Convert pandas DataFrame to Arrow RecordBatch."""
    table = pa.Table.from_pandas(df)
    batches = table.to_batches()
    if not batches:
        return pa.RecordBatch.from_pydict({col: [] for col in df.columns})
    return batches[0] if len(batches) == 1 else pa.Table.from_batches(batches).to_batches()[0]


def extract_columns_rows(data: Optional[dict]) -> tuple[list[str], list[list]]:
    """Extract (columns, rows) from TierResult.data — handles both Arrow and legacy formats.

    Arrow path: data["record_batch"] exists → convert via arrow_to_json
    Legacy path: data["columns"] and data["rows"] exist → pass through
    """
    if not data:
        return [], []
    if "record_batch" in data and data["record_batch"] is not None:
        return arrow_to_json(data["record_batch"])
    return data.get("columns", []), data.get("rows", [])

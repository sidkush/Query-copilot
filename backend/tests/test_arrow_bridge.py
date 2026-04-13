"""Tests for Arrow data bridge — zero-copy conversions between DuckDB, Polars, pandas, and JSON."""
import pytest
import pyarrow as pa
import polars as pl
import pandas as pd


def _sample_batch() -> pa.RecordBatch:
    """Create a sample Arrow RecordBatch for testing."""
    return pa.RecordBatch.from_pydict({
        "id": [1, 2, 3],
        "name": ["Alice", "Bob", "Charlie"],
        "revenue": [100.5, 200.3, 300.1],
    })


class TestArrowBridge:
    def test_arrow_to_polars_zero_copy(self):
        from arrow_bridge import arrow_to_polars
        batch = _sample_batch()
        lf = arrow_to_polars(batch)
        assert isinstance(lf, pl.LazyFrame)
        df = lf.collect()
        assert len(df) == 3
        assert df["name"][0] == "Alice"

    def test_arrow_to_pandas(self):
        from arrow_bridge import arrow_to_pandas
        batch = _sample_batch()
        df = arrow_to_pandas(batch)
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 3
        assert list(df.columns) == ["id", "name", "revenue"]

    def test_arrow_to_json(self):
        from arrow_bridge import arrow_to_json
        batch = _sample_batch()
        columns, rows = arrow_to_json(batch)
        assert columns == ["id", "name", "revenue"]
        assert len(rows) == 3
        assert rows[0] == [1, "Alice", 100.5]

    def test_polars_to_arrow(self):
        from arrow_bridge import polars_to_arrow
        df = pl.DataFrame({"x": [1, 2], "y": ["a", "b"]})
        batch = polars_to_arrow(df)
        assert isinstance(batch, pa.RecordBatch)
        assert batch.num_rows == 2

    def test_pandas_to_arrow(self):
        from arrow_bridge import pandas_to_arrow
        df = pd.DataFrame({"x": [1, 2], "y": ["a", "b"]})
        batch = pandas_to_arrow(df)
        assert isinstance(batch, pa.RecordBatch)
        assert batch.num_rows == 2

    def test_arrow_to_json_empty_batch(self):
        from arrow_bridge import arrow_to_json
        batch = pa.RecordBatch.from_pydict({"id": [], "name": []})
        columns, rows = arrow_to_json(batch)
        assert columns == ["id", "name"]
        assert rows == []

    def test_arrow_to_json_with_nulls(self):
        from arrow_bridge import arrow_to_json
        batch = pa.RecordBatch.from_pydict({"id": [1, None, 3], "name": ["a", "b", None]})
        columns, rows = arrow_to_json(batch)
        assert rows[1][0] is None
        assert rows[2][1] is None

    def test_extract_columns_and_rows_from_tier_data(self):
        """TierResult.data may have record_batch — extract_columns_rows handles both formats."""
        from arrow_bridge import extract_columns_rows
        batch = _sample_batch()
        # Arrow path
        cols, rows = extract_columns_rows({"record_batch": batch})
        assert cols == ["id", "name", "revenue"]
        assert len(rows) == 3
        # Legacy path (no record_batch key)
        cols2, rows2 = extract_columns_rows({"columns": ["a"], "rows": [[1]]})
        assert cols2 == ["a"]
        assert rows2 == [[1]]
        # None/empty
        cols3, rows3 = extract_columns_rows(None)
        assert cols3 == []
        assert rows3 == []

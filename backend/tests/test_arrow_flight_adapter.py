"""Tests for arrow_flight_adapter.py — Flight descriptor + batch builder.

Four focused tests:
  1. test_descriptor_round_trips              — to_bytes + from_bytes preserves all fields
  2. test_query_to_record_batches_returns_batches — mock twin, verify batches
  3. test_query_to_record_batches_handles_error  — mock error result → ValueError
  4. test_empty_result_returns_empty_batches     — 0 rows → empty batch list with schema
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pyarrow as pa
import pytest


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_twin(n_rows: int, status: str = "ok") -> MagicMock:
    """Return a MagicMock twin whose query_twin_downsampled() returns a canned result."""
    twin = MagicMock()
    if status == "ok":
        twin.query_twin_downsampled.return_value = {
            "status": "ok",
            "columns": ["ts", "value"],
            "rows": [[float(i), float(i * 2.5)] for i in range(n_rows)],
            "row_count": n_rows,
            "downsampled": n_rows > 0,
            "downsample_method": "lttb",
            "original_row_count_estimate": n_rows * 10,
        }
    elif status == "error":
        twin.query_twin_downsampled.return_value = {
            "status": "error",
            "message": "twin not found",
        }
    elif status == "error_no_msg":
        # Error result with no message key — default message exercised
        twin.query_twin_downsampled.return_value = {"status": "error"}
    return twin


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestChartFlightDescriptor:
    def test_descriptor_round_trips(self):
        """to_bytes() + from_bytes() must preserve all five fields exactly."""
        from arrow_flight_adapter import ChartFlightDescriptor

        original = ChartFlightDescriptor(
            conn_id="conn-abc",
            sql="SELECT ts, value FROM events",
            target_points=2000,
            x_col="ts",
            y_col="value",
        )

        raw = original.to_bytes()
        assert isinstance(raw, bytes), "to_bytes must return bytes"

        restored = ChartFlightDescriptor.from_bytes(raw)

        assert restored.conn_id == original.conn_id
        assert restored.sql == original.sql
        assert restored.target_points == original.target_points
        assert restored.x_col == original.x_col
        assert restored.y_col == original.y_col

    def test_descriptor_round_trips_none_cols(self):
        """Optional x_col/y_col default to None and survive the round-trip."""
        from arrow_flight_adapter import ChartFlightDescriptor

        desc = ChartFlightDescriptor(conn_id="c1", sql="SELECT 1", target_points=100)
        restored = ChartFlightDescriptor.from_bytes(desc.to_bytes())

        assert restored.x_col is None
        assert restored.y_col is None
        assert restored.target_points == 100

    def test_descriptor_to_bytes_is_json(self):
        """to_bytes() must produce valid UTF-8 JSON containing all keys."""
        import json

        from arrow_flight_adapter import ChartFlightDescriptor

        desc = ChartFlightDescriptor(conn_id="x", sql="SELECT 1", target_points=500)
        payload = json.loads(desc.to_bytes().decode("utf-8"))

        assert set(payload.keys()) == {"conn_id", "sql", "target_points", "x_col", "y_col"}


class TestQueryToRecordBatches:
    def test_query_to_record_batches_returns_batches(self):
        """Mock twin with 12 rows and batch_rows=5 → 3 batches, correct schema."""
        from arrow_flight_adapter import query_to_record_batches

        twin = _make_twin(12)
        schema, batches = query_to_record_batches(
            twin,
            conn_id="conn1",
            sql="SELECT ts, value FROM t",
            target_points=12,
            batch_rows=5,
        )

        # Schema must have 2 float64 fields (ts and value are floats in mock)
        assert isinstance(schema, pa.Schema)
        assert schema.names == ["ts", "value"]
        assert schema.field("ts").type == pa.float64()
        assert schema.field("value").type == pa.float64()

        # 3 batches: rows 0-4, 5-9, 10-11
        assert len(batches) == 3, f"expected 3 batches, got {len(batches)}"
        assert all(isinstance(b, pa.RecordBatch) for b in batches)

        # Row counts per batch
        assert batches[0].num_rows == 5
        assert batches[1].num_rows == 5
        assert batches[2].num_rows == 2

        # Total rows across all batches
        total = sum(b.num_rows for b in batches)
        assert total == 12

    def test_batches_have_correct_schema(self):
        """All returned batches share the same schema as the returned schema object."""
        from arrow_flight_adapter import query_to_record_batches

        twin = _make_twin(6)
        schema, batches = query_to_record_batches(
            twin, conn_id="c2", sql="SELECT 1", target_points=6, batch_rows=10
        )

        # Single batch for 6 rows with batch_rows=10
        assert len(batches) == 1
        assert batches[0].schema == schema

    def test_twin_called_with_correct_args(self):
        """query_to_record_batches must forward all args to query_twin_downsampled."""
        from arrow_flight_adapter import query_to_record_batches

        twin = _make_twin(3)
        query_to_record_batches(
            twin,
            conn_id="my-conn",
            sql="SELECT a, b FROM tbl",
            target_points=1500,
            x_col="a",
            y_col="b",
        )

        twin.query_twin_downsampled.assert_called_once_with(
            conn_id="my-conn",
            sql="SELECT a, b FROM tbl",
            target_points=1500,
            x_col="a",
            y_col="b",
        )

    def test_query_to_record_batches_handles_error(self):
        """When twin returns status=error, ValueError must be raised with the message."""
        from arrow_flight_adapter import query_to_record_batches

        twin = _make_twin(0, status="error")

        with pytest.raises(ValueError, match="twin not found"):
            query_to_record_batches(
                twin, conn_id="bad", sql="SELECT * FROM missing", target_points=100
            )

    def test_query_to_record_batches_handles_error_no_message(self):
        """ValueError uses a fallback message when the result has no 'message' key."""
        from arrow_flight_adapter import query_to_record_batches

        twin = _make_twin(0, status="error_no_msg")

        with pytest.raises(ValueError, match="Query failed"):
            query_to_record_batches(
                twin, conn_id="bad", sql="SELECT 1", target_points=10
            )

    def test_empty_result_returns_empty_batches(self):
        """0 rows → empty batch list; schema is still returned with utf8 columns."""
        from arrow_flight_adapter import query_to_record_batches

        twin = _make_twin(0)  # ok status, 0 rows
        schema, batches = query_to_record_batches(
            twin, conn_id="empty", sql="SELECT ts, value FROM t WHERE 1=0", target_points=100
        )

        assert isinstance(schema, pa.Schema), "schema must still be returned for 0-row results"
        assert len(batches) == 0, f"expected 0 batches, got {len(batches)}"

        # Schema columns must match the mock column names
        assert schema.names == ["ts", "value"]
        # Empty-result columns default to utf8
        assert schema.field("ts").type == pa.utf8()
        assert schema.field("value").type == pa.utf8()

    def test_single_batch_when_rows_fit(self):
        """Rows that fit within batch_rows produce exactly one batch."""
        from arrow_flight_adapter import query_to_record_batches

        twin = _make_twin(10)
        schema, batches = query_to_record_batches(
            twin, conn_id="c3", sql="SELECT ts, value FROM t", target_points=10, batch_rows=100
        )

        assert len(batches) == 1
        assert batches[0].num_rows == 10

    def test_schema_infers_int_and_string_types(self):
        """Type inference: int → int64, str → utf8 (in addition to float → float64)."""
        from arrow_flight_adapter import query_to_record_batches

        twin = MagicMock()
        twin.query_twin_downsampled.return_value = {
            "status": "ok",
            "columns": ["id", "label", "score"],
            "rows": [
                [1, "foo", 9.5],
                [2, "bar", 8.0],
            ],
        }

        schema, batches = query_to_record_batches(
            twin, conn_id="types", sql="SELECT id, label, score FROM t", target_points=2
        )

        assert schema.field("id").type == pa.int64()
        assert schema.field("label").type == pa.utf8()
        assert schema.field("score").type == pa.float64()
        assert len(batches) == 1
        assert batches[0].num_rows == 2

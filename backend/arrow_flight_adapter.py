"""
arrow_flight_adapter.py — Arrow Flight RPC bridge for chart streaming.

v1: defines the FlightInfo + FlightEndpoint descriptors and a
RecordBatchStream that wraps arrow_stream.stream_query() output.

The actual pyarrow.flight.FlightServer integration requires a separate
process (Flight runs on gRPC, not inside the FastAPI ASGI loop).
This module provides the building blocks; the server startup is
deferred to a future ops task.

Requires: pip install pyarrow[flight] (pyarrow already installed,
flight extra may need explicit install).
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import pyarrow as pa

logger = logging.getLogger(__name__)


class ChartFlightDescriptor:
    """Describes a chart streaming query for Arrow Flight."""

    def __init__(
        self,
        conn_id: str,
        sql: str,
        target_points: int = 4000,
        x_col: Optional[str] = None,
        y_col: Optional[str] = None,
    ) -> None:
        self.conn_id = conn_id
        self.sql = sql
        self.target_points = target_points
        self.x_col = x_col
        self.y_col = y_col

    def to_bytes(self) -> bytes:
        """Serialize descriptor to JSON bytes for use as a Flight ticket/descriptor."""
        return json.dumps(
            {
                "conn_id": self.conn_id,
                "sql": self.sql,
                "target_points": self.target_points,
                "x_col": self.x_col,
                "y_col": self.y_col,
            }
        ).encode("utf-8")

    @classmethod
    def from_bytes(cls, data: bytes) -> "ChartFlightDescriptor":
        """Deserialize descriptor from JSON bytes."""
        d = json.loads(data.decode("utf-8"))
        return cls(**d)


def query_to_record_batches(
    twin,
    conn_id: str,
    sql: str,
    target_points: int,
    x_col: Optional[str] = None,
    y_col: Optional[str] = None,
    batch_rows: int = 5000,
) -> tuple[pa.Schema, list[pa.RecordBatch]]:
    """Execute a downsampled query and return Arrow RecordBatches.

    Reuses the existing DuckDBTwin.query_twin_downsampled() path.
    Returns (schema, [batches]) for Flight streaming.

    Args:
        twin: DuckDBTwin instance with query_twin_downsampled().
        conn_id: Connection identifier for the twin.
        sql: SQL query to execute against the twin.
        target_points: Desired row count after downsampling.
        x_col: Optional x-axis column hint for downsampler.
        y_col: Optional y-axis column hint for downsampler.
        batch_rows: Max rows per RecordBatch (default 5000).

    Returns:
        (schema, batches) — Arrow schema and list of RecordBatches.

    Raises:
        ValueError: If the twin reports a query error.
    """
    result = twin.query_twin_downsampled(
        conn_id=conn_id,
        sql=sql,
        target_points=target_points,
        x_col=x_col,
        y_col=y_col,
    )

    if result.get("status") == "error":
        raise ValueError(result.get("message", "Query failed"))

    columns: list[str] = result.get("columns", [])
    rows: list[list] = result.get("rows") or []

    if not rows:
        # Return a typed schema even for empty results so Flight clients can
        # still inspect the stream schema without receiving any data.
        schema = pa.schema([pa.field(c, pa.utf8()) for c in columns])
        return schema, []

    # ── Schema inference from first row ────────────────────────────────────────
    # Mirrors the logic in arrow_stream._infer_schema() — bool checked before
    # int because bool is a subclass of int in Python.
    fields: list[pa.Field] = []
    for i, name in enumerate(columns):
        val = rows[0][i] if i < len(rows[0]) else None
        if isinstance(val, bool):
            fields.append(pa.field(name, pa.bool_()))
        elif isinstance(val, int):
            fields.append(pa.field(name, pa.int64()))
        elif isinstance(val, float):
            fields.append(pa.field(name, pa.float64()))
        else:
            fields.append(pa.field(name, pa.utf8()))
    schema = pa.schema(fields)

    # ── Build batches ───────────────────────────────────────────────────────────
    batches: list[pa.RecordBatch] = []
    for start in range(0, len(rows), batch_rows):
        end = min(start + batch_rows, len(rows))
        batch_slice = rows[start:end]

        arrays: list[pa.Array] = []
        for col_idx, field in enumerate(schema):
            values = [
                row[col_idx] if col_idx < len(row) else None
                for row in batch_slice
            ]
            arrays.append(pa.array(values, type=field.type))

        batches.append(pa.RecordBatch.from_arrays(arrays, schema=schema))

    logger.debug(
        "query_to_record_batches: conn_id=%s rows=%d batches=%d",
        conn_id,
        len(rows),
        len(batches),
    )
    return schema, batches

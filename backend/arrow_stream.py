"""Arrow IPC streaming generator — Phase B4.

Sits between query_twin_downsampled() and the SSE endpoint (Task 2).
Takes the twin result dict and streams it as base64-encoded Arrow IPC chunks.

Usage::

    async for event in stream_query(twin, conn_id, sql, target_points=2000):
        # event is one of:
        #   {"event": "chart_chunk",  "data": "<base64>",     "chunk_index": N}
        #   {"event": "chart_done",   "data": {...summary...}}
        #   {"event": "chart_error",  "data": {"message": "..."}}
        yield f"data: {json.dumps(event)}\n\n"
"""
from __future__ import annotations

import base64
import io
import math
import time
from typing import Any, AsyncIterator, Optional

import pyarrow as pa
import pyarrow.ipc as ipc


# ── Schema inference ───────────────────────────────────────────────────────────


def _infer_schema(columns: list[str], sample_row: list[Any]) -> pa.Schema:
    """Infer an Arrow schema from column names and a single sample row.

    Rules:
    - int   → pa.int64()
    - float → pa.float64()
    - bool  → pa.bool_()
    - None  → pa.float64() (safe default for chart data)
    - else  → pa.utf8()
    """
    fields: list[pa.Field] = []
    for col, val in zip(columns, sample_row):
        if isinstance(val, bool):
            # bool must be checked before int — bool is subclass of int in Python
            arrow_type = pa.bool_()
        elif isinstance(val, int):
            arrow_type = pa.int64()
        elif isinstance(val, float):
            arrow_type = pa.float64()
        elif val is None:
            arrow_type = pa.float64()
        else:
            arrow_type = pa.utf8()
        fields.append(pa.field(col, arrow_type))
    return pa.schema(fields)


# ── Row batch → RecordBatch ────────────────────────────────────────────────────


def _rows_to_record_batch(
    columns: list[str],
    rows: list[list[Any]],
    schema: pa.Schema,
) -> pa.RecordBatch:
    """Convert a list of rows into an Arrow RecordBatch using the provided schema.

    Each column is built as a Python list and cast to the inferred type.
    Handles None values by using pa.array's null support.
    """
    col_arrays: list[pa.Array] = []
    for col_idx, field in enumerate(schema):
        col_vals = [row[col_idx] for row in rows]
        col_arrays.append(pa.array(col_vals, type=field.type))
    return pa.RecordBatch.from_arrays(col_arrays, schema=schema)


# ── RecordBatch → IPC bytes ────────────────────────────────────────────────────


def _batch_to_ipc_bytes(batch: pa.RecordBatch, schema: pa.Schema) -> bytes:
    """Serialize a single RecordBatch to Arrow IPC stream format bytes.

    Uses the IPC stream format (not file format) so the consumer can read
    it with ipc.open_stream() without needing the full file.
    """
    buf = io.BytesIO()
    writer = ipc.new_stream(buf, schema)
    writer.write_batch(batch)
    writer.close()
    return buf.getvalue()


# ── Main async generator ───────────────────────────────────────────────────────


async def stream_query(
    twin: Any,
    conn_id: str,
    sql: str,
    target_points: int,
    x_col: Optional[str] = None,
    y_col: Optional[str] = None,
    x_type: Optional[str] = None,
    y_type: Optional[str] = None,
    batch_rows: int = 5000,
) -> AsyncIterator[dict[str, Any]]:
    """Async generator that streams query results as Arrow IPC chunks.

    Calls twin.query_twin_downsampled() synchronously, then splits the result
    into batch_rows-sized slices, serialising each as a base64-encoded Arrow
    IPC stream chunk.

    Yields:
        ``{"event": "chart_chunk",  "data": "<base64>",     "chunk_index": N}``
        ``{"event": "chart_done",   "data": {total_rows, chunks_sent,
                                             downsample_method,
                                             original_row_count_estimate,
                                             server_ms}}``
        ``{"event": "chart_error",  "data": {"message": "<reason>"}}``
    """
    t_start = time.monotonic()

    # ── 1. Call the twin ───────────────────────────────────────────────────────
    result: dict[str, Any] = twin.query_twin_downsampled(
        conn_id=conn_id,
        sql=sql,
        target_points=target_points,
        x_col=x_col,
        y_col=y_col,
        x_type=x_type,
        y_type=y_type,
    )

    # ── 2. Error path ──────────────────────────────────────────────────────────
    if result.get("status") == "error":
        yield {
            "event": "chart_error",
            "data": {"message": result.get("message", "Unknown error from twin")},
        }
        return

    columns: list[str] = result.get("columns", [])
    rows: list[list[Any]] = result.get("rows") or []
    total_rows: int = len(rows)
    downsample_method: str = result.get("downsample_method", "none")
    original_row_count_estimate: int = result.get("original_row_count_estimate", total_rows)

    # ── 3. Empty result path ───────────────────────────────────────────────────
    if total_rows == 0:
        server_ms = round((time.monotonic() - t_start) * 1000, 2)
        yield {
            "event": "chart_done",
            "data": {
                "total_rows": 0,
                "chunks_sent": 0,
                "downsample_method": downsample_method,
                "original_row_count_estimate": original_row_count_estimate,
                "server_ms": server_ms,
            },
        }
        return

    # ── 4. Infer schema from first row ─────────────────────────────────────────
    schema = _infer_schema(columns, rows[0])

    # ── 5. Stream batches ──────────────────────────────────────────────────────
    num_chunks = math.ceil(total_rows / batch_rows)
    chunks_sent = 0

    for chunk_index in range(num_chunks):
        start = chunk_index * batch_rows
        end = min(start + batch_rows, total_rows)
        batch_slice = rows[start:end]

        record_batch = _rows_to_record_batch(columns, batch_slice, schema)
        ipc_bytes = _batch_to_ipc_bytes(record_batch, schema)
        encoded = base64.b64encode(ipc_bytes).decode("ascii")

        yield {
            "event": "chart_chunk",
            "data": encoded,
            "chunk_index": chunk_index,
        }
        chunks_sent += 1

    # ── 6. Done summary ────────────────────────────────────────────────────────
    server_ms = round((time.monotonic() - t_start) * 1000, 2)
    yield {
        "event": "chart_done",
        "data": {
            "total_rows": total_rows,
            "chunks_sent": chunks_sent,
            "downsample_method": downsample_method,
            "original_row_count_estimate": original_row_count_estimate,
            "server_ms": server_ms,
        },
    }

"""Tests for arrow_stream.py — async Arrow IPC chunk generator.

TDD: these tests are written first (failing) then arrow_stream.py is implemented
to make them pass.
"""
from __future__ import annotations

import base64
import io
from typing import Any
from unittest.mock import MagicMock

import pyarrow as pa
import pyarrow.ipc as ipc
import pytest
import pytest_asyncio  # noqa: F401 — ensure plugin loads


def _make_twin_mock(n_rows: int, status: str = "ok") -> MagicMock:
    """Return a MagicMock twin whose query_twin_downsampled returns a canned result."""
    twin = MagicMock()
    if status == "ok":
        twin.query_twin_downsampled.return_value = {
            "status": "ok",
            "columns": ["ts", "value"],
            "rows": [[float(i), float(i * 2.5)] for i in range(n_rows)],
            "row_count": n_rows,
            "downsampled": True,
            "downsample_method": "lttb",
            "original_row_count_estimate": n_rows * 100,
        }
    else:
        twin.query_twin_downsampled.return_value = {
            "status": "error",
            "message": "twin not found",
        }
    return twin


async def _collect(gen) -> list[dict[str, Any]]:
    """Collect all events from an async generator into a list."""
    events = []
    async for event in gen:
        events.append(event)
    return events


# ── Tests ──────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_yields_base64_arrow_ipc_chunks():
    """50 rows, batch_rows=20 → 3 data chunks + 1 done chunk.

    Each data chunk must decode as valid Arrow IPC with 2 columns.
    """
    from arrow_stream import stream_query

    twin = _make_twin_mock(50)
    events = await _collect(
        stream_query(twin, "conn1", "SELECT * FROM t", target_points=50, batch_rows=20)
    )

    data_events = [e for e in events if e["event"] == "chart_chunk"]
    done_events = [e for e in events if e["event"] == "chart_done"]

    # Exactly 3 data chunks (ceil(50/20) = 3) + 1 done
    assert len(data_events) == 3, f"expected 3 data chunks, got {len(data_events)}"
    assert len(done_events) == 1, "expected exactly 1 done event"
    assert len(events) == 4

    # Each chunk decodes as valid Arrow IPC with 2 columns
    for chunk_event in data_events:
        raw = base64.b64decode(chunk_event["data"])
        reader = ipc.open_stream(raw)
        batch = reader.read_next_batch()
        assert batch.num_columns == 2, f"expected 2 columns, got {batch.num_columns}"
        assert "ts" in batch.schema.names
        assert "value" in batch.schema.names


@pytest.mark.asyncio
async def test_done_chunk_has_summary():
    """10 rows — done event must contain total_rows, downsample_method, server_ms."""
    from arrow_stream import stream_query

    twin = _make_twin_mock(10)
    events = await _collect(
        stream_query(twin, "conn2", "SELECT ts, value FROM t", target_points=10)
    )

    done_events = [e for e in events if e["event"] == "chart_done"]
    assert len(done_events) == 1
    summary = done_events[0]["data"]

    assert "total_rows" in summary, "done event missing total_rows"
    assert summary["total_rows"] == 10
    assert "downsample_method" in summary, "done event missing downsample_method"
    assert summary["downsample_method"] == "lttb"
    assert "server_ms" in summary, "done event missing server_ms"
    assert isinstance(summary["server_ms"], (int, float))


@pytest.mark.asyncio
async def test_error_result_yields_error_event():
    """When twin returns error status, assert single chart_error event is yielded."""
    from arrow_stream import stream_query

    twin = _make_twin_mock(0, status="error")
    events = await _collect(
        stream_query(twin, "conn3", "SELECT * FROM missing_table", target_points=100)
    )

    assert len(events) == 1, f"expected 1 event, got {len(events)}"
    assert events[0]["event"] == "chart_error"
    assert "message" in events[0]["data"]
    assert events[0]["data"]["message"] == "twin not found"


@pytest.mark.asyncio
async def test_single_row_produces_one_chunk_plus_done():
    """1 row, batch_rows=100 → 1 data chunk + 1 done chunk."""
    from arrow_stream import stream_query

    twin = _make_twin_mock(1)
    events = await _collect(
        stream_query(twin, "conn4", "SELECT * FROM t", target_points=100, batch_rows=100)
    )

    data_events = [e for e in events if e["event"] == "chart_chunk"]
    done_events = [e for e in events if e["event"] == "chart_done"]

    assert len(data_events) == 1, f"expected 1 data chunk, got {len(data_events)}"
    assert len(done_events) == 1, "expected exactly 1 done event"
    assert len(events) == 2

    # Verify the single chunk has 1 row
    raw = base64.b64decode(data_events[0]["data"])
    reader = ipc.open_stream(raw)
    batch = reader.read_next_batch()
    assert batch.num_rows == 1


@pytest.mark.asyncio
async def test_empty_result_yields_done_only():
    """0 rows — only done event with total_rows=0, no data chunks."""
    from arrow_stream import stream_query

    twin = _make_twin_mock(0)
    events = await _collect(
        stream_query(twin, "conn5", "SELECT * FROM t WHERE 1=0", target_points=100)
    )

    assert len(events) == 1, f"expected 1 event (done), got {len(events)}"
    assert events[0]["event"] == "chart_done"
    assert events[0]["data"]["total_rows"] == 0

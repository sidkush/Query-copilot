# Sub-project B Phase B4 — Progressive Arrow Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream large query results as Arrow IPC chunks over SSE so charts render progressively — first paint <500ms on 10M rows instead of waiting for the full result.

**Architecture:** New backend module `arrow_stream.py` wraps `DuckDBTwin.query_twin_downsampled()`, splits the Arrow Table into batches, yields each as base64 Arrow IPC via the existing SSE infrastructure. New frontend module `arrowChunkReceiver.ts` consumes the SSE, decodes Arrow batches, feeds them to `VegaRenderer` (via Vega's incremental `changeset().insert()`) and `DeckRenderer` (via accumulated data prop). RSR's T3 strategy enables streaming; T0–T2 continue using the synchronous path.

**Tech Stack:** Python `pyarrow` IPC serialization (already in deps), FastAPI `StreamingResponse` (existing agent SSE pattern), JS `apache-arrow` for decoding (new frontend dep), existing `chart-ir/rsr/` for strategy gating.

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-b-performance-design.md`](../specs/2026-04-15-chart-system-sub-project-b-performance-design.md) §3.6, §Phase B4.

**Depends on:** B0–B3 (RSR, InstancePool, FrameBudgetTracker, chart_downsampler, VegaRenderer real mount, DeckRenderer placeholder). VegaRenderer is fully wired. DeckRenderer is still a placeholder — B4 wires streaming into VegaRenderer only; DeckRenderer streaming wiring is a stub that logs until B3's deck.gl compiler ships (which was outlined but may not be fully implemented — check before Task 5).

---

## File Structure

### New backend files
```
backend/
  arrow_stream.py                        # Async Arrow IPC stream generator
  tests/
    test_arrow_stream.py                 # Unit tests for stream_query()
    test_adv_chart_stream_endpoint.py    # Adversarial: auth, malformed SQL, oversized batch
```

### Modified backend files
```
backend/
  routers/agent_routes.py                # +POST /api/v1/charts/stream SSE endpoint
  config.py                              # Already has CHART_STREAM_BATCH_ROWS (5000)
```

### New frontend files
```
frontend/src/
  chart-ir/perf/arrowChunkReceiver.ts    # SSE Arrow IPC receiver
  chart-ir/__tests__/perf/arrowChunkReceiver.test.ts
```

### Modified frontend files
```
frontend/src/
  components/editor/renderers/VegaRenderer.tsx  # +streaming mode via appendRows()
  package.json                                   # +apache-arrow dependency
```

---

## Task 1: Backend `arrow_stream.py` — async Arrow IPC generator

**Files:**
- Create: `backend/arrow_stream.py`
- Create: `backend/tests/test_arrow_stream.py`

- [ ] **Step 1: Write the test file**

```python
# backend/tests/test_arrow_stream.py
"""Tests for arrow_stream.stream_query() — Arrow IPC chunk generator."""
import asyncio
import base64
import pyarrow as pa
import pytest
from unittest.mock import MagicMock, patch

# stream_query is async — we need an event loop
pytestmark = pytest.mark.asyncio


def _make_twin_result(n_rows: int = 100) -> dict:
    """Fake a successful query_twin_downsampled result with n_rows rows."""
    return {
        "status": "ok",
        "columns": ["ts", "value"],
        "rows": [[float(i), float(i * 2.5)] for i in range(n_rows)],
        "row_count": n_rows,
        "downsampled": True,
        "downsample_method": "lttb",
        "original_row_count_estimate": n_rows * 100,
    }


async def _collect_chunks(agen):
    """Collect all chunks from an async generator."""
    chunks = []
    async for chunk in agen:
        chunks.append(chunk)
    return chunks


class TestStreamQuery:
    async def test_yields_base64_arrow_ipc_chunks(self):
        from arrow_stream import stream_query

        mock_twin = MagicMock()
        mock_twin.query_twin_downsampled.return_value = _make_twin_result(50)

        chunks = await _collect_chunks(
            stream_query(
                twin=mock_twin,
                conn_id="test",
                sql="SELECT ts, value FROM metrics",
                target_points=50,
                batch_rows=20,
            )
        )
        # Should produce 3 data chunks (20+20+10) + 1 done chunk
        data_chunks = [c for c in chunks if c["event"] == "chart_chunk"]
        done_chunks = [c for c in chunks if c["event"] == "chart_done"]
        assert len(data_chunks) == 3
        assert len(done_chunks) == 1

        # Each data chunk should be valid base64-encoded Arrow IPC
        for dc in data_chunks:
            ipc_bytes = base64.b64decode(dc["data"])
            reader = pa.ipc.open_stream(ipc_bytes)
            batch = reader.read_next_batch()
            assert batch.num_columns == 2
            assert batch.schema.names == ["ts", "value"]

    async def test_done_chunk_has_summary(self):
        from arrow_stream import stream_query

        mock_twin = MagicMock()
        mock_twin.query_twin_downsampled.return_value = _make_twin_result(10)

        chunks = await _collect_chunks(
            stream_query(
                twin=mock_twin,
                conn_id="test",
                sql="SELECT 1",
                target_points=10,
                batch_rows=100,
            )
        )
        done = [c for c in chunks if c["event"] == "chart_done"][0]
        assert done["data"]["total_rows"] == 10
        assert done["data"]["downsample_method"] == "lttb"
        assert "server_ms" in done["data"]

    async def test_error_result_yields_error_event(self):
        from arrow_stream import stream_query

        mock_twin = MagicMock()
        mock_twin.query_twin_downsampled.return_value = {
            "status": "error",
            "message": "SQL validation failed",
        }

        chunks = await _collect_chunks(
            stream_query(
                twin=mock_twin,
                conn_id="test",
                sql="DROP TABLE x",
                target_points=100,
                batch_rows=50,
            )
        )
        assert len(chunks) == 1
        assert chunks[0]["event"] == "chart_error"
        assert "SQL validation" in chunks[0]["data"]["message"]

    async def test_single_row_produces_one_chunk_plus_done(self):
        from arrow_stream import stream_query

        mock_twin = MagicMock()
        mock_twin.query_twin_downsampled.return_value = _make_twin_result(1)

        chunks = await _collect_chunks(
            stream_query(
                twin=mock_twin,
                conn_id="test",
                sql="SELECT 1",
                target_points=1,
                batch_rows=100,
            )
        )
        data_chunks = [c for c in chunks if c["event"] == "chart_chunk"]
        assert len(data_chunks) == 1

    async def test_empty_result_yields_done_only(self):
        from arrow_stream import stream_query

        mock_twin = MagicMock()
        mock_twin.query_twin_downsampled.return_value = {
            "status": "ok",
            "columns": ["ts", "value"],
            "rows": [],
            "row_count": 0,
            "downsampled": False,
            "downsample_method": "none",
        }

        chunks = await _collect_chunks(
            stream_query(
                twin=mock_twin,
                conn_id="test",
                sql="SELECT 1 WHERE 0",
                target_points=100,
                batch_rows=50,
            )
        )
        assert len(chunks) == 1
        assert chunks[0]["event"] == "chart_done"
        assert chunks[0]["data"]["total_rows"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_arrow_stream.py -v`
Expected: `ModuleNotFoundError: No module named 'arrow_stream'`

- [ ] **Step 3: Implement `arrow_stream.py`**

```python
# backend/arrow_stream.py
"""
arrow_stream.py — sub-project B Phase B4.

Async generator that wraps DuckDBTwin.query_twin_downsampled(), splits the
result into Arrow IPC frames, and yields SSE-ready event dicts.

Consumer: POST /api/v1/charts/stream in agent_routes.py.
"""
from __future__ import annotations

import base64
import io
import logging
import time
from typing import Any, AsyncIterator, Optional

import pyarrow as pa

logger = logging.getLogger(__name__)


async def stream_query(
    twin,
    conn_id: str,
    sql: str,
    target_points: int,
    x_col: Optional[str] = None,
    y_col: Optional[str] = None,
    x_type: Optional[str] = None,
    y_type: Optional[str] = None,
    batch_rows: int = 5000,
) -> AsyncIterator[dict[str, Any]]:
    """Yield SSE event dicts with Arrow IPC-encoded row batches.

    Each yielded dict has:
        {"event": "chart_chunk", "data": "<base64 Arrow IPC>", "chunk_index": N}
    or  {"event": "chart_done",  "data": {summary}}
    or  {"event": "chart_error", "data": {"message": "..."}}
    """
    t_start = time.monotonic()

    # Run the downsampled query synchronously (DuckDB twin is sync).
    result = twin.query_twin_downsampled(
        conn_id=conn_id,
        sql=sql,
        target_points=target_points,
        x_col=x_col,
        y_col=y_col,
        x_type=x_type,
        y_type=y_type,
    )

    if result.get("status") == "error":
        yield {
            "event": "chart_error",
            "data": {"message": result.get("message", "Unknown error")},
        }
        return

    columns = result.get("columns", [])
    rows = result.get("rows", [])
    total_rows = len(rows)

    if total_rows == 0:
        server_ms = round((time.monotonic() - t_start) * 1000, 2)
        yield {
            "event": "chart_done",
            "data": {
                "total_rows": 0,
                "chunks_sent": 0,
                "downsample_method": result.get("downsample_method", "none"),
                "server_ms": server_ms,
            },
        }
        return

    # Build Arrow schema from column names + inferred types.
    schema = _infer_schema(columns, rows[0] if rows else [])

    chunk_index = 0
    for start in range(0, total_rows, batch_rows):
        end = min(start + batch_rows, total_rows)
        batch_rows_slice = rows[start:end]
        batch = _rows_to_record_batch(columns, batch_rows_slice, schema)
        ipc_bytes = _batch_to_ipc_bytes(batch, schema)
        yield {
            "event": "chart_chunk",
            "data": base64.b64encode(ipc_bytes).decode("ascii"),
            "chunk_index": chunk_index,
        }
        chunk_index += 1

    server_ms = round((time.monotonic() - t_start) * 1000, 2)
    yield {
        "event": "chart_done",
        "data": {
            "total_rows": total_rows,
            "chunks_sent": chunk_index,
            "downsample_method": result.get("downsample_method", "none"),
            "original_row_count_estimate": result.get("original_row_count_estimate"),
            "server_ms": server_ms,
        },
    }


def _infer_schema(columns: list[str], sample_row: list) -> pa.Schema:
    """Infer Arrow schema from column names + a sample row."""
    fields = []
    for i, name in enumerate(columns):
        val = sample_row[i] if i < len(sample_row) else None
        if isinstance(val, (int,)):
            fields.append(pa.field(name, pa.int64()))
        elif isinstance(val, (float,)):
            fields.append(pa.field(name, pa.float64()))
        elif isinstance(val, bool):
            fields.append(pa.field(name, pa.bool_()))
        else:
            fields.append(pa.field(name, pa.utf8()))
    return pa.schema(fields)


def _rows_to_record_batch(
    columns: list[str], rows: list[list], schema: pa.Schema
) -> pa.RecordBatch:
    """Convert list-of-lists rows to an Arrow RecordBatch."""
    arrays = []
    for col_idx, field in enumerate(schema):
        values = [row[col_idx] if col_idx < len(row) else None for row in rows]
        arrays.append(pa.array(values, type=field.type))
    return pa.RecordBatch.from_arrays(arrays, schema=schema)


def _batch_to_ipc_bytes(batch: pa.RecordBatch, schema: pa.Schema) -> bytes:
    """Serialize a RecordBatch to Arrow IPC stream format bytes."""
    buf = io.BytesIO()
    writer = pa.ipc.new_stream(buf, schema)
    writer.write_batch(batch)
    writer.close()
    return buf.getvalue()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_arrow_stream.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add backend/arrow_stream.py backend/tests/test_arrow_stream.py && git commit -m "feat(b4): arrow_stream.py — async Arrow IPC chunk generator"
```

---

## Task 2: SSE endpoint `POST /api/v1/charts/stream`

**Files:**
- Modify: `backend/routers/agent_routes.py`
- Create: `backend/tests/test_adv_chart_stream_endpoint.py`

- [ ] **Step 1: Write the adversarial test file**

```python
# backend/tests/test_adv_chart_stream_endpoint.py
"""Adversarial tests for POST /api/v1/charts/stream SSE endpoint."""
import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a TestClient with mocked auth and app state."""
    from main import app

    # Patch auth to return a test user
    def _mock_user():
        return {"email": "test@example.com", "plan": "pro"}

    app.dependency_overrides = {}
    from routers.auth_routes import get_current_user
    app.dependency_overrides[get_current_user] = _mock_user

    with TestClient(app) as c:
        yield c

    app.dependency_overrides = {}


class TestChartStreamAuth:
    def test_rejects_unauthenticated_request(self):
        from main import app
        app.dependency_overrides = {}
        with TestClient(app) as c:
            resp = c.post("/api/v1/charts/stream", json={
                "conn_id": "test",
                "sql": "SELECT 1",
            })
            assert resp.status_code in (401, 403)


class TestChartStreamValidation:
    def test_rejects_missing_conn_id(self, client):
        resp = client.post("/api/v1/charts/stream", json={
            "sql": "SELECT 1",
        })
        assert resp.status_code == 422

    def test_rejects_missing_sql(self, client):
        resp = client.post("/api/v1/charts/stream", json={
            "conn_id": "test",
        })
        assert resp.status_code == 422

    def test_rejects_oversized_batch_rows(self, client):
        resp = client.post("/api/v1/charts/stream", json={
            "conn_id": "test",
            "sql": "SELECT 1",
            "batch_rows": 1_000_000,
        })
        # Should cap or reject — either 422 or capped silently
        assert resp.status_code in (200, 422)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_adv_chart_stream_endpoint.py -v`
Expected: failures (endpoint doesn't exist yet)

- [ ] **Step 3: Add the SSE endpoint to `agent_routes.py`**

Add this to `backend/routers/agent_routes.py` after the existing agent endpoints:

```python
# ─── Chart streaming (Sub-project B Phase B4) ────────────────────
from pydantic import BaseModel as _PydanticBase, Field as _PydanticField

class ChartStreamRequest(_PydanticBase):
    conn_id: str
    sql: str
    target_points: int = _PydanticField(default=4000, ge=3, le=100_000)
    x_col: str | None = None
    y_col: str | None = None
    x_type: str | None = None
    y_type: str | None = None
    batch_rows: int = _PydanticField(default=5000, ge=1, le=50_000)


@router.post("/charts/stream")
async def chart_stream(req: ChartStreamRequest, request: Request,
                        user: dict = Depends(get_current_user)):
    """Stream chart data as Arrow IPC chunks over SSE.

    Each SSE event is one of:
      event: chart_chunk  — base64 Arrow IPC RecordBatch
      event: chart_done   — JSON summary {total_rows, chunks_sent, server_ms, ...}
      event: chart_error  — JSON {message}
    """
    from main import app
    from arrow_stream import stream_query

    email = user.get("email", "")
    connections = getattr(app.state, "connections", {})
    user_conns = connections.get(email, {})
    conn_entry = user_conns.get(req.conn_id)

    if not conn_entry:
        return JSONResponse(
            status_code=404,
            content={"detail": f"Connection '{req.conn_id}' not found"},
        )

    twin = getattr(conn_entry, "duckdb_twin", None)
    if not twin:
        return JSONResponse(
            status_code=400,
            content={"detail": "Turbo Mode (DuckDB twin) not enabled for this connection"},
        )

    async def event_generator():
        try:
            async for event in stream_query(
                twin=twin,
                conn_id=req.conn_id,
                sql=req.sql,
                target_points=req.target_points,
                x_col=req.x_col,
                y_col=req.y_col,
                x_type=req.x_type,
                y_type=req.y_type,
                batch_rows=req.batch_rows,
            ):
                evt_type = event.get("event", "chart_chunk")
                data = event.get("data", "")
                if isinstance(data, dict):
                    data = json.dumps(data)
                yield f"event: {evt_type}\ndata: {data}\n\n"
        except Exception as exc:
            logger.error("chart_stream error: %s", exc, exc_info=True)
            yield f"event: chart_error\ndata: {json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

Make sure `json` and `StreamingResponse` are imported at the top of agent_routes.py (they should already be).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_adv_chart_stream_endpoint.py -v`
Expected: 3 passed (auth test may need the real app without override — adjust if needed)

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add backend/routers/agent_routes.py backend/tests/test_adv_chart_stream_endpoint.py && git commit -m "feat(b4): POST /api/v1/charts/stream SSE endpoint for Arrow IPC streaming"
```

---

## Task 3: Frontend `apache-arrow` dependency

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install `apache-arrow`**

```bash
cd "QueryCopilot V1/frontend" && npm install apache-arrow
```

- [ ] **Step 2: Verify install**

```bash
cd "QueryCopilot V1/frontend" && node -e "const arrow = require('apache-arrow'); console.log('arrow version:', arrow.util?.version || 'ok')"
```

Expected: prints version or "ok" without error.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/package.json frontend/package-lock.json && git commit -m "chore(b4): add apache-arrow frontend dependency for IPC decoding"
```

---

## Task 4: Frontend `arrowChunkReceiver.ts`

**Files:**
- Create: `frontend/src/chart-ir/perf/arrowChunkReceiver.ts`
- Create: `frontend/src/chart-ir/__tests__/perf/arrowChunkReceiver.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// frontend/src/chart-ir/__tests__/perf/arrowChunkReceiver.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ArrowChunkReceiver,
  type ChunkEvent,
  type DoneEvent,
} from '../../perf/arrowChunkReceiver';

// We'll mock the fetch API since the receiver uses fetch + ReadableStream
// (POST doesn't work with native EventSource, so we use fetch-based SSE).

function makeSSEResponse(events: string[]): Response {
  const body = events.join('');
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('ArrowChunkReceiver', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses chart_done events and calls onDone', async () => {
    const doneData = JSON.stringify({ total_rows: 100, chunks_sent: 2, server_ms: 42 });
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse([
        `event: chart_done\ndata: ${doneData}\n\n`,
      ]),
    );

    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const receiver = new ArrowChunkReceiver({
      url: '/api/v1/charts/stream',
      body: { conn_id: 'test', sql: 'SELECT 1' },
      onChunk,
      onDone,
      onError,
    });

    await receiver.start();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ total_rows: 100 }),
    );
  });

  it('calls onError for chart_error events', async () => {
    const errData = JSON.stringify({ message: 'bad sql' });
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse([
        `event: chart_error\ndata: ${errData}\n\n`,
      ]),
    );

    const onError = vi.fn();
    const receiver = new ArrowChunkReceiver({
      url: '/api/v1/charts/stream',
      body: { conn_id: 'test', sql: 'DROP TABLE x' },
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    await receiver.start();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('bad sql');
  });

  it('calls onChunk for chart_chunk events with raw data string', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse([
        `event: chart_chunk\ndata: AAAA\n\n`,
        `event: chart_done\ndata: {"total_rows":1,"chunks_sent":1,"server_ms":1}\n\n`,
      ]),
    );

    const onChunk = vi.fn();
    const receiver = new ArrowChunkReceiver({
      url: '/api/v1/charts/stream',
      body: { conn_id: 'test', sql: 'SELECT 1' },
      onChunk,
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    await receiver.start();
    expect(onChunk).toHaveBeenCalledTimes(1);
    // The chunk data is the raw base64 string — decoding to Arrow happens
    // in the caller (VegaRenderer) because it needs the apache-arrow import
    // which we don't want to make a hard dep of the receiver module.
    expect(onChunk).toHaveBeenCalledWith('AAAA', 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/perf/arrowChunkReceiver.test.ts`
Expected: `Cannot find module '../../perf/arrowChunkReceiver'`

- [ ] **Step 3: Implement `arrowChunkReceiver.ts`**

```typescript
// frontend/src/chart-ir/perf/arrowChunkReceiver.ts
/**
 * ArrowChunkReceiver — SSE client for POST /api/v1/charts/stream.
 *
 * Uses fetch + ReadableStream (not native EventSource, which only supports GET).
 * Parses SSE text protocol manually, dispatches typed callbacks.
 *
 * The receiver does NOT decode Arrow IPC — it hands the raw base64 string to
 * onChunk. The caller (VegaRenderer / DeckRenderer) decodes with apache-arrow
 * so the import is lazy-loaded only when streaming is active.
 */

export interface ChunkEvent {
  /** Base64-encoded Arrow IPC stream bytes. */
  data: string;
  chunkIndex: number;
}

export interface DoneEvent {
  total_rows: number;
  chunks_sent: number;
  downsample_method?: string;
  original_row_count_estimate?: number;
  server_ms: number;
}

export interface ArrowChunkReceiverOptions {
  url: string;
  body: Record<string, unknown>;
  onChunk: (base64Data: string, chunkIndex: number) => void;
  onDone: (summary: DoneEvent) => void;
  onError: (message: string) => void;
  /** JWT token. If omitted, reads from localStorage('token'). */
  token?: string;
}

export class ArrowChunkReceiver {
  private opts: ArrowChunkReceiverOptions;
  private abortController: AbortController | null = null;

  constructor(opts: ArrowChunkReceiverOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    this.abortController = new AbortController();
    const token = this.opts.token ?? localStorage.getItem('token') ?? '';

    let response: Response;
    try {
      response = await fetch(this.opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(this.opts.body),
        signal: this.abortController.signal,
      });
    } catch (err) {
      this.opts.onError(err instanceof Error ? err.message : String(err));
      return;
    }

    if (!response.ok) {
      this.opts.onError(`HTTP ${response.status}: ${response.statusText}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      this.opts.onError('Response body is not readable');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let chunkIndex = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events: split on double newline
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const event = parseSSEBlock(block);
          if (event) {
            if (event.type === 'chart_chunk') {
              this.opts.onChunk(event.data, chunkIndex);
              chunkIndex++;
            } else if (event.type === 'chart_done') {
              try {
                this.opts.onDone(JSON.parse(event.data));
              } catch {
                this.opts.onDone({ total_rows: 0, chunks_sent: 0, server_ms: 0 });
              }
            } else if (event.type === 'chart_error') {
              try {
                const parsed = JSON.parse(event.data);
                this.opts.onError(parsed.message || event.data);
              } catch {
                this.opts.onError(event.data);
              }
            }
          }

          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.opts.onError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  abort(): void {
    this.abortController?.abort();
  }
}

function parseSSEBlock(block: string): { type: string; data: string } | null {
  let type = '';
  let data = '';

  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) {
      type = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    } else if (line.startsWith('data:')) {
      data = line.slice(5);
    }
  }

  if (!type && !data) return null;
  return { type: type || 'message', data };
}
```

- [ ] **Step 4: Export from `chart-ir/index.ts`**

Add to `frontend/src/chart-ir/index.ts`:

```typescript
// Sub-project B Phase B4 — Arrow streaming
export { ArrowChunkReceiver } from './perf/arrowChunkReceiver';
export type {
  ArrowChunkReceiverOptions,
  ChunkEvent,
  DoneEvent,
} from './perf/arrowChunkReceiver';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/perf/arrowChunkReceiver.test.ts`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/chart-ir/perf/arrowChunkReceiver.ts frontend/src/chart-ir/__tests__/perf/arrowChunkReceiver.test.ts frontend/src/chart-ir/index.ts && git commit -m "feat(b4): arrowChunkReceiver.ts — SSE Arrow IPC client for progressive chart rendering"
```

---

## Task 5: Wire streaming into `VegaRenderer.tsx`

**Files:**
- Modify: `frontend/src/components/editor/renderers/VegaRenderer.tsx`

- [ ] **Step 1: Add streaming support to VegaRenderer**

Add a new `useStreamingData` hook inside `VegaRenderer.tsx` that activates when `strategy.streaming.enabled === true`. When streaming:

1. Instead of passing the full `downsampledRows` to `<VegaLite data={...}>`, start with an empty dataset
2. Mount an `ArrowChunkReceiver` pointed at `/api/v1/charts/stream`
3. On each `onChunk`, decode the base64 Arrow IPC with `apache-arrow`, convert to row objects, append to a `ref` accumulator
4. Call `view.change('askdb_data', vega.changeset().insert(newRows)).run()` for incremental Vega updates
5. On `onDone`, mark streaming complete in a state flag

The key change is to the render section — when streaming is enabled, pass initial empty data and use the Vega View's changeset API for progressive updates instead of re-rendering the whole spec.

Add this to the imports section:

```typescript
import { ArrowChunkReceiver } from '../../../chart-ir';
```

Add a helper at module level to decode Arrow IPC base64 to row objects:

```typescript
async function decodeArrowChunk(base64Data: string, columns: string[]): Promise<Row[]> {
  const { tableFromIPC } = await import('apache-arrow');
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const table = tableFromIPC(bytes);
  const rows: Row[] = [];
  for (let i = 0; i < table.numRows; i++) {
    const row: Row = {};
    for (const col of columns) {
      const vec = table.getChild(col);
      row[col] = vec ? vec.get(i) : null;
    }
    rows.push(row);
  }
  return rows;
}
```

Add the streaming hook. Inside the component body, after the `downsampledRows` memo, add:

```typescript
const viewRef = useRef<View | null>(null);
const streamingRef = useRef(false);
const [streamingComplete, setStreamingComplete] = useState(false);

const isStreaming = strategy?.streaming?.enabled === true;

// Store the view from onNewView so the streaming hook can insert rows.
const handleNewViewWrapped = useCallback((view: View) => {
  viewRef.current = view;
  handleNewView(view);
}, [handleNewView]);

useEffect(() => {
  if (!isStreaming || !resultSet?.columns) return;

  const columns = resultSet.columns;
  streamingRef.current = true;
  setStreamingComplete(false);

  // Build the request body from the spec's encoding hints.
  const connId = (window as any).__askdb_active_conn_id ?? '';
  const body = {
    conn_id: connId,
    sql: (window as any).__askdb_last_sql ?? '',
    target_points: strategy?.downsample?.targetPoints ?? 4000,
    x_col: spec.encoding?.x?.field,
    y_col: spec.encoding?.y?.field,
    x_type: spec.encoding?.x?.type,
    y_type: spec.encoding?.y?.type,
    batch_rows: strategy?.streaming?.batchRows ?? 5000,
  };

  const receiver = new ArrowChunkReceiver({
    url: '/api/v1/charts/stream',
    body,
    onChunk: async (base64Data) => {
      try {
        const newRows = await decodeArrowChunk(base64Data, columns);
        const view = viewRef.current;
        if (view && newRows.length > 0) {
          const changeset = (await import('vega')).changeset();
          view.change('askdb_data', changeset.insert(newRows)).run();
        }
      } catch (err) {
        console.warn('[VegaRenderer] streaming chunk decode error:', err);
      }
    },
    onDone: () => {
      streamingRef.current = false;
      setStreamingComplete(true);
    },
    onError: (msg) => {
      console.warn('[VegaRenderer] streaming error:', msg);
      streamingRef.current = false;
    },
  });

  receiver.start();
  return () => receiver.abort();
}, [isStreaming, resultSet?.columns, spec, strategy]);
```

Update the `<VegaLite>` data prop: when streaming, start with empty data so Vega paints the axes/grid immediately while chunks arrive:

```typescript
const vegaData = isStreaming && !streamingComplete
  ? { askdb_data: [] }
  : { askdb_data: downsampledRows };
```

Replace `handleNewView` with `handleNewViewWrapped` in the `<VegaLite>` `onNewView` prop.

- [ ] **Step 2: Add `useState` to the import line**

Make sure `useState` is in the React imports at the top of the file:

```typescript
import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
```

- [ ] **Step 3: Verify the component still compiles**

Run: `cd "QueryCopilot V1/frontend" && npx tsc --noEmit --skipLibCheck 2>&1 | head -20`
Expected: no errors in VegaRenderer.tsx

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/renderers/VegaRenderer.tsx && git commit -m "feat(b4): VegaRenderer progressive streaming via ArrowChunkReceiver + Vega changeset insert"
```

---

## Task 6: Phase B4 checkpoint

- [ ] **Step 1: Run all backend tests**

```bash
cd "QueryCopilot V1/backend" && python -m pytest tests/test_arrow_stream.py tests/test_adv_chart_stream_endpoint.py -v
```
Expected: all pass

- [ ] **Step 2: Run all frontend chart-ir tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/ 2>&1 | tail -20
```
Expected: all pass (existing + new arrowChunkReceiver tests)

- [ ] **Step 3: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -10
```
Expected: no new errors

- [ ] **Step 4: Tag checkpoint**

```bash
cd "QueryCopilot V1" && git tag b4-streaming
```

- [ ] **Step 5: Commit plan completion**

```bash
cd "QueryCopilot V1" && git add docs/superpowers/plans/2026-04-15-b4-progressive-arrow-streaming.md && git commit -m "docs(b4): implementation plan for progressive Arrow streaming"
```

---

## Notes for Phases B5 + B6

After B4 lands, the remaining work is:

**B5 (Telemetry + scroll polish, ~1 week):**
- `rendererTelemetry.ts` — per-render timing POST to `/api/v1/perf/telemetry`
- `POST /api/v1/perf/telemetry` fire-and-forget endpoint → `.data/audit/chart_perf.jsonl`
- `useViewportMount` hook wired into every renderer (off-screen tiles release pool slots)
- Dev-mode tier badge overlay (`Cmd+Alt+P`)
- 500-tile dashboard scroll benchmark
- Flip `CHART_PERF_ENABLED=true` in staging

**B6 (Production rollout, ~3 days):**
- Flip `CHART_PERF_ENABLED=true` in production
- Monitor telemetry 7 days
- Optional: brush-to-detail re-query spike
- Tag `chart-perf-v1`

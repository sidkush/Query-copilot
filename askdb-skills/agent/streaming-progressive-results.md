---
name: streaming-progressive-results
description: SSE streaming cadence, sampled-preview decisions, cancellation and progressive rendering rules for long-running queries and builds
priority: 3
tokens_budget: 1100
applies_to: multi-step-agent, dashboard-build, large-result-handling
---

# Streaming & Progressive Results — AskDB AgentEngine

## When to stream progressively

Every tool phase emits an SSE event via `agent_routes.py` — but whether the **user sees intermediate progress** depends on duration and action class.

| Class | Stream intermediate? | Cadence |
|---|---|---|
| Schema inspect | No (usually < 2 s) | Final result only |
| SQL generation | Yes — stream thinking tokens | Token-by-token |
| SQL execution < 5 s expected | No | Final table + chart |
| SQL execution 5–30 s expected | Yes | Progress updates every 2 s ("Scanning 3.2M rows…") |
| SQL execution > 30 s expected | Yes + offer cancel | Progress + cancel button |
| Multi-tile dashboard build | Yes | One SSE event per tile completion |
| ML training | Yes | Per-stage events (ingest → features → train → evaluate) |

## Progress phrasing

Short, concrete, truthful. Never fabricate progress.

- ✅ "Scanning orders table (3.2M rows)…"
- ✅ "Tile 2 of 5 complete: Top Customers by Revenue"
- ❌ "Working on your request…" (vague)
- ❌ "Almost done…" (lying if you don't know)

## Sampled-preview decisions

When expected result rows > `MAX_ROWS` (default 1000, ceiling 50000), do **not** stream every row. Instead:

1. Run a quick `SELECT COUNT(*)` pre-query (< 200 ms typical) to estimate size.
2. If count > `MAX_ROWS`:
   - Generate full SQL.
   - Run with `LIMIT MAX_ROWS`.
   - Return table with header: "Showing first 1,000 of ~45,000 rows — download full CSV?" (link to `/api/queries/export`).
3. For charts, stream aggregated version only (e.g., `GROUP BY` before charting); never render > 5,000 marks in Vega-Lite (see `visualization/vizql-capabilities-progressive-disclosure.md`).

## Cancellation

Every agent run is interruptible via `POST /api/v1/agent/cancel` (to be implemented in retrieval-infra plan). The agent MUST:
- Check `self._cancel_requested` before each tool call.
- On cancellation: abort the current tool (SQL execution via driver-level cancel if available), emit `{"type":"cancelled","reason":"user"}`, persist session state via `agent_session_store.save()`, and exit cleanly.
- Do **not** roll back already-completed tile creations (user asked to stop, not undo). Offer undo as a separate follow-up message.

## Partial result handling

If an SSE connection drops mid-stream:
- Session state must already be persisted in `agent_sessions.db` (WAL mode autosaves).
- `/api/v1/agent/sessions/{chat_id}` returns the full collected steps list on reconnect.
- Frontend reconstructs the UI from collected steps — never assumes streaming continuity.

## Progressive dashboard build

For multi-tile builds, follow the sequence in `agent/dashboard-build-protocol.md`:
1. Emit plan checklist (5 tiles).
2. Build tiles in parallel where data-independent (see `agent/batch-query-optimization.md`), sequential where dependent.
3. Per completed tile: emit `{"type":"tile_created","id":"...","insight":"..."}` + push to UI.
4. Final SSE event: `{"type":"complete","dashboard_id":"..."}`

If a tile errors: emit `{"type":"tile_error","index":i,"message":"..."}` and continue to next tile. Never fail the whole dashboard because one tile broke.

## Timeouts

- Per-tool soft timeout: 60 s (schema), 30 s (SQL gen), 300 s (DB exec), 30 s (summarize).
- Per-segment cap: 600 s.
- Session hard cap: 1800 s.
- On timeout: treat as cancellation + emit `{"type":"timeout","phase":"..."}`. Do NOT retry automatically — ask user.

See `backend/config.py` (`AGENT_SESSION_HARD_CAP` etc.) for authoritative values.

## What never to stream

- PII in progress messages ("Looking up user alice@corp.com…" → "Looking up user…").
- Raw SQL until it's passed validation.
- Prompt internals (never "I'm thinking about using <tool>…" verbatim; translate to action).

---

## Examples

**Input:** Agent starts SQL execution estimated 12 s.
**Output:** Emits every 2 s: `{"type":"progress","message":"Scanning orders table (3.2M rows)..."}`. On completion: `{"type":"result","rows":3247,"elapsed_ms":11420}`.

**Input:** User clicks cancel at t=4 s of a 12 s query.
**Output:** Agent calls driver cancel (`cursor.cancel()` for PG; `bq.cancel_job()` for BigQuery), emits `{"type":"cancelled","reason":"user"}`, saves session, returns.

**Input:** Query returns 45,000 rows.
**Output:** COUNT(*) pre-query returns 45823. Full SQL executes with `LIMIT 1000`. Table shows first 1000. Footer: "Showing first 1,000 of ~45,000 rows. [Download full CSV]".

**Input:** Dashboard build: 5 tiles, tile 3 errors.
**Output:** Tiles 1, 2 complete SSE; tile 3 emits `tile_error` with message; tiles 4, 5 continue and complete. Final SSE: `{"type":"complete","tiles_created":4,"tiles_failed":1}`.

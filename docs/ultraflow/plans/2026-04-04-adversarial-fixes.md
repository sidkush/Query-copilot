# Plan: Adversarial Testing Fixes — Dashboard System
**Spec**: Findings from 20-persona adversarial testing session
**Branch**: `master` (direct fixes)

## Tasks

### Task 1: C1+C2 — SQL Injection in Filters (~5 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify)
- **Intent**: Replace all string interpolation in field filters (IN/LIKE/string, lines 634-663) and date filters (`_inject_date_filter`, line 417) with safe value escaping. Sanitize filter values by escaping single quotes (`'` → `''`). For IN operator, split on comma, quote each element individually. For date values, validate format before injection.
- **Test**: Attempt filter with payload `{"column":"id","operator":"LIKE","value":"' OR 1=1--"}` → should be escaped, not injected
- **Commit**: `fix(security): parameterize SQL filter values to prevent injection`

### Task 2: H1+H2 — SSE Blocking Call + Connection Limits (~5 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify)
- **Intent**: Wrap `pubsub.get_message()` in `asyncio.to_thread()` to avoid blocking the event loop. Add module-level `_sse_connections: dict[str, int]` tracker with max 3 per user. Decrement on disconnect.
- **Test**: SSE endpoint no longer blocks other async handlers under load
- **Commit**: `fix(perf): non-blocking SSE + per-user connection cap`

### Task 3: H3 — Bounded Thread Pool for Refresh (~3 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify)
- **Intent**: Replace per-request `ThreadPoolExecutor` + `threading.Thread` with a module-level bounded executor. Add `_active_refreshes: set` to prevent duplicate refresh-all for the same dashboard.
- **Test**: Rapid refresh-all clicks don't spawn unlimited threads
- **Commit**: `fix(resource): bounded executor for background refresh`

### Task 4: H4 — Surgical Undo (~3 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Change undo from full-dashboard restore to surgical tile re-add. Store only `{tile, sectionId, tabId, dashboardId}` in undo stack. On undo, call `api.addTileToSection()` instead of `api.updateDashboard()`.
- **Test**: Delete tile A, edit tile B, undo A → tile B edit preserved
- **Commit**: `fix(ux): surgical undo preserves concurrent edits`

### Task 5: H5 — Redis Auto-Recovery (~3 min)
- **Files**: `backend/redis_client.py` (modify)
- **Intent**: Replace sticky `_unavailable` boolean with `_unavailable_until: float` timestamp. After failure, set to `time.time() + 30`. On next call, if past the timestamp, retry. Successful reconnect clears the timestamp.
- **Test**: Redis restart → backend automatically reconnects within 30s
- **Commit**: `fix(redis): TTL-based backoff replaces sticky failure flag`

### Task 6: H6 — Sanitize Error Messages (~2 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify)
- **Intent**: Replace 6 instances of `HTTPException(500, f"...{str(e)}")` with generic messages + `logger.exception()`. Also replace `print()` calls with `logger`.
- **Test**: 500 responses no longer contain internal error details
- **Commit**: `fix(security): sanitize error messages in HTTP responses`

### Task 7: H7+M5+M6 — Payload Caps + SSE Fallback + Silent Errors (~5 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify), `frontend/src/api.js` (modify)
- **Intent**: Backend: add 2MB size check before Redis publish (skip if over). Replace `except: pass` with `logger.warning()`. Frontend: add retry + exponential backoff in `subscribeTileUpdates`, fall back to interval polling on 503.
- **Test**: Large payloads don't crash Redis; 503 triggers polling fallback
- **Commit**: `fix(reliability): payload caps, SSE fallback, error logging`

### Task 8: M1-M4+M7 — Medium Severity Fixes (~5 min)
- **Files**: `frontend/src/pages/DashboardBuilder.jsx` (modify), `backend/routers/dashboard_routes.py` (modify)
- **Intent**:
  - M1: Skip drill-down when cross-filter is being toggled OFF
  - M2: Validate tab ID exists before applying bookmark
  - M3: Verify share token belongs to dashboard_id before revoking
  - M4: Add `updated_at` version check in auto-save (skip if stale)
  - M7: Strip `columns` from shared dashboard tiles
- **Test**: Each fix verified individually
- **Commit**: `fix(dashboard): medium-severity logic and security fixes`

## Parallelism
Tasks 1-3 (backend-only, different code sections) can run in parallel.
Task 4 (frontend-only) can run in parallel with 1-3.
Tasks 5-6 (backend, different files/sections) can run in parallel.
Task 7-8 (mixed) should run after 1-6.

## Fingerprint
All 2 critical + 7 high + 7 medium findings from adversarial testing resolved. No SQL injection, no event loop blocking, no unbounded resources, no data-loss undo.

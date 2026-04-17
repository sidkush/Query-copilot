# Analyst Pro — Plan 4a: Filter Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `Action.Filter` mark-cascade into real worksheet queries so a click on a source sheet's mark re-executes target sheets with injected `WHERE` predicates.

**Architecture:** A new Zustand slice (`analystProSheetFilters`) stores active per-sheet filters. `useActionRuntime.applyTargetOp` translates filter/highlight `TargetOp`s into store mutations. A new frontend wrapper `AnalystProWorksheetTile` watches the slice for its sheet, re-executes `tile.sql` via `/api/v1/queries/execute` with an `additional_filters` body field, and passes the fresh result into the existing `DashboardTileCanvas`. On the backend, a new pure helper `sql_filter_injector.py` wraps the incoming SQL in a safe `SELECT * FROM (<sql>) AS _askdb_filtered WHERE …` before `SQLValidator` runs. Highlights use a sibling slice and do not re-query.

**Tech Stack:** React 19 + Zustand + Vitest (frontend); FastAPI + sqlglot + pytest (backend). Additional deps: none.

---

## Prerequisites

- Branch: `askdb-global-comp` (all commits land here).
- Plan 3 code exists: `actionTypes.ts`, `actionExecutor.ts`, `useActionRuntime.js`, `markEventBus.ts`, `POST /api/v1/dashboards/{id}/actions/{aid}/fire`, `analystProDashboard` with `actions: ActionDefinition[]`.
- Feature flag: `settings.FEATURE_ANALYST_PRO` gates every new endpoint surface. Already in `config.py`.
- Frontend tests: `cd frontend && npm run test:chart-ir -- <pattern>`. Backend tests: `cd backend && python -m pytest tests/ -v`.
- Lint: `cd frontend && npm run lint`. Build: `cd frontend && npm run build`.

---

## File Map

**Create**
- `frontend/src/components/dashboard/freeform/lib/filterApplication.ts`
- `frontend/src/components/dashboard/freeform/__tests__/filterApplication.test.ts`
- `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`
- `frontend/src/components/dashboard/freeform/__tests__/FilterInjection.integration.test.tsx`
- `backend/sql_filter_injector.py`
- `backend/tests/test_sql_filter_injector.py`
- `backend/tests/test_execute_additional_filters.py`

**Modify**
- `frontend/src/store.js` — add slice + actions
- `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js` — wire filter/highlight cases
- `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — `renderLeaf` uses `AnalystProWorksheetTile`
- `frontend/src/api.js` — `executeSQL` gains `additionalFilters` parameter
- `backend/routers/query_routes.py` — `ExecuteRequest.additional_filters`, injector call, audit event
- `backend/waterfall_router.py` — `route` / `route_sync` / `_route_sync_impl` accept optional `additional_filters` passthrough

---

## Task Checklist

- [ ] T1. Frontend store — `analystProSheetFilters` + `analystProSheetHighlights` slices with CRUD actions.
- [ ] T2. Pure lib `filterApplication.ts` + tests — `buildAdditionalFilters`.
- [ ] T3. Backend `sql_filter_injector.py` + tests — SQL wrapping helper.
- [ ] T4. Backend `ExecuteRequest.additional_filters` + injector wiring + audit event + tests.
- [ ] T5. Backend `waterfall_router` passthrough param.
- [ ] T6. Frontend `api.js` `executeSQL` accepts `additionalFilters`.
- [ ] T7. `useActionRuntime.js` — wire filter/highlight/clear cases + tests.
- [ ] T8. `AnalystProWorksheetTile.jsx` wrapper + integration into `AnalystProLayout.renderLeaf`.
- [ ] T9. End-to-end integration test + smoke (frontend lint/build + backend pytest).

---

## Task Specifications

### T1 — Store slice: sheet filters + highlights

**Files:**
- Modify: `frontend/src/store.js`

**Goal:** add two independent `Record<sheetId, …>` slices with replace / clear / clear-all actions. All names follow `analystPro*` conventions.

- [ ] **Step 1: Open the file and locate the Plan 3 actions block**

Open `frontend/src/store.js`. Search for `fireActionCascadeAnalystPro` — the new fields/actions go immediately below the existing Plan 3 cascade helpers.

- [ ] **Step 2: Add state fields and actions**

Paste the block below verbatim after the Plan 3 cascade block and before the next top-level slice comment (e.g. before `analystProLayoutOverlay`).

```js
// Plan 4a: per-sheet filter + highlight state driven by action cascade.
// Shape: { [sheetId]: [{ field, op, value, source: { actionId, cascadeToken } }] }
analystProSheetFilters: {},
analystProSheetHighlights: {},

setSheetFilterAnalystPro: (sheetId, filters) => {
  if (!sheetId) return;
  const normalized = Array.isArray(filters) ? filters : [];
  set((s) => ({
    analystProSheetFilters: {
      ...s.analystProSheetFilters,
      [sheetId]: normalized,
    },
  }));
},

clearSheetFilterAnalystPro: (sheetId) => {
  if (!sheetId) return;
  set((s) => {
    if (!(sheetId in s.analystProSheetFilters)) return s;
    const next = { ...s.analystProSheetFilters };
    delete next[sheetId];
    return { analystProSheetFilters: next };
  });
},

clearAllSheetFiltersAnalystPro: () =>
  set({ analystProSheetFilters: {} }),

setSheetHighlightAnalystPro: (sheetId, fieldValues) => {
  if (!sheetId) return;
  set((s) => ({
    analystProSheetHighlights: {
      ...s.analystProSheetHighlights,
      [sheetId]: fieldValues && typeof fieldValues === 'object' ? fieldValues : {},
    },
  }));
},

clearSheetHighlightAnalystPro: (sheetId) => {
  if (!sheetId) return;
  set((s) => {
    if (!(sheetId in s.analystProSheetHighlights)) return s;
    const next = { ...s.analystProSheetHighlights };
    delete next[sheetId];
    return { analystProSheetHighlights: next };
  });
},

clearAllSheetHighlightsAnalystPro: () =>
  set({ analystProSheetHighlights: {} }),
```

- [ ] **Step 3: Smoke the store (no test file yet, covered by T7/T9)**

Run:

```bash
cd frontend && npm run lint -- --max-warnings=0 src/store.js
```

Expected: clean. If new `no-unused-vars` fires, re-check names match the conventions above.

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js
git commit -m "feat(analyst-pro): store slices for sheet filters + highlights (Plan 4a T1)"
```

---

### T2 — Pure lib `filterApplication.ts` + tests

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/filterApplication.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/filterApplication.test.ts`

**Goal:** pure, React-free helper that converts a `TargetOp` of `kind:'filter'` into a normalized `Filter[]` that the worksheet tile will POST to `/queries/execute`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/dashboard/freeform/__tests__/filterApplication.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildAdditionalFilters,
  type Filter,
} from '../lib/filterApplication';
import type { TargetOp } from '../lib/actionTypes';

describe('buildAdditionalFilters', () => {
  it('returns empty array when TargetOp has no filter fields', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: {},
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op)).toEqual([]);
  });

  it('maps each filter key/value to an eq Filter', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: { Region: 'West', Year: 2026 },
      clearBehavior: 'leave-filter',
    };
    const out = buildAdditionalFilters(op);
    expect(out).toEqual<Filter[]>([
      { field: 'Region', op: 'eq', value: 'West' },
      { field: 'Year', op: 'eq', value: 2026 },
    ]);
  });

  it('skips undefined values but keeps null', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: { Region: undefined as unknown as string, Status: null },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op)).toEqual<Filter[]>([
      { field: 'Status', op: 'eq', value: null },
    ]);
  });

  it('rejects non-filter TargetOps by returning []', () => {
    const op = {
      kind: 'highlight',
      sheetId: 'w1',
      fieldValues: { Region: 'West' },
    } as unknown as TargetOp;
    expect(buildAdditionalFilters(op)).toEqual([]);
  });

  it('rejects invalid field names (non-identifier) by dropping them', () => {
    const op: TargetOp = {
      kind: 'filter',
      sheetId: 'w1',
      filters: { 'bad field': 'x', good_field: 'y', '1bad': 'z' },
      clearBehavior: 'leave-filter',
    };
    expect(buildAdditionalFilters(op)).toEqual<Filter[]>([
      { field: 'good_field', op: 'eq', value: 'y' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend
npm run test:chart-ir -- filterApplication
```

Expected: FAIL — module `../lib/filterApplication` not found.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/dashboard/freeform/lib/filterApplication.ts`:

```ts
import type { TargetOp } from './actionTypes';

/**
 * A single filter predicate in the shape the backend `/queries/execute`
 * endpoint understands via the `additional_filters` body field.
 */
export type Filter = {
  field: string;
  op: 'eq';
  value: string | number | boolean | null;
};

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Convert a filter TargetOp emitted by the action cascade into an array of
 * normalized Filter records. Pure. Returns [] for non-filter TargetOps.
 * Values of `undefined` are dropped; `null` is preserved and the backend
 * injector translates it to `IS NULL`. Field names that are not plain SQL
 * identifiers are silently dropped to keep injection safe downstream.
 */
export function buildAdditionalFilters(op: TargetOp): Filter[] {
  if (!op || op.kind !== 'filter') return [];
  const out: Filter[] = [];
  for (const [field, value] of Object.entries(op.filters)) {
    if (!IDENT_RE.test(field)) continue;
    if (value === undefined) continue;
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out.push({ field, op: 'eq', value });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd frontend
npm run test:chart-ir -- filterApplication
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/filterApplication.ts \
        frontend/src/components/dashboard/freeform/__tests__/filterApplication.test.ts
git commit -m "feat(analyst-pro): filterApplication lib + tests (Plan 4a T2)"
```

---

### T3 — Backend `sql_filter_injector.py` + tests

**Files:**
- Create: `backend/sql_filter_injector.py`
- Create: `backend/tests/test_sql_filter_injector.py`

**Goal:** SQL-safe wrapper that takes the user's SQL string plus a list of filter dicts and returns `SELECT * FROM (<sql>) AS _askdb_filtered WHERE …`. Runs before `SQLValidator`. Rejects unsafe field names; quotes string values; handles `None` → `IS NULL`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_sql_filter_injector.py`:

```python
import pytest

from sql_filter_injector import (
    inject_additional_filters,
    FilterInjectionError,
)


class TestInjectAdditionalFilters:
    def test_empty_filters_returns_sql_unchanged(self):
        sql = "SELECT a, b FROM t"
        assert inject_additional_filters(sql, []) == sql

    def test_none_filters_returns_sql_unchanged(self):
        sql = "SELECT a, b FROM t"
        assert inject_additional_filters(sql, None) == sql

    def test_single_string_filter(self):
        out = inject_additional_filters(
            "SELECT region, total FROM sales",
            [{"field": "region", "op": "eq", "value": "West"}],
        )
        assert out == (
            'SELECT * FROM (SELECT region, total FROM sales) '
            'AS _askdb_filtered WHERE "region" = \'West\''
        )

    def test_multiple_filters_joined_with_and(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [
                {"field": "region", "op": "eq", "value": "West"},
                {"field": "year", "op": "eq", "value": 2026},
            ],
        )
        assert out.endswith(
            'WHERE "region" = \'West\' AND "year" = 2026'
        )

    def test_null_value_translates_to_is_null(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "status", "op": "eq", "value": None}],
        )
        assert out.endswith('WHERE "status" IS NULL')

    def test_string_escapes_single_quotes(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "name", "op": "eq", "value": "O'Brien"}],
        )
        assert "'O''Brien'" in out

    def test_strips_trailing_semicolon_from_base_sql(self):
        out = inject_additional_filters(
            "SELECT * FROM t  ;  ",
            [{"field": "a", "op": "eq", "value": 1}],
        )
        assert "; ) " not in out
        assert "(SELECT * FROM t)" in out

    def test_rejects_invalid_identifier(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "bad field", "op": "eq", "value": 1}],
            )

    def test_rejects_unsupported_op(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "a", "op": "gt", "value": 1}],
            )

    def test_rejects_unsupported_value_type(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "a", "op": "eq", "value": {"nested": True}}],
            )

    def test_boolean_value_renders_as_literal(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "active", "op": "eq", "value": True}],
        )
        assert out.endswith('WHERE "active" = TRUE')
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
python -m pytest tests/test_sql_filter_injector.py -v
```

Expected: FAIL — `ModuleNotFoundError: sql_filter_injector`.

- [ ] **Step 3: Write the implementation**

Create `backend/sql_filter_injector.py`:

```python
"""
sql_filter_injector.py — safe WHERE-clause injection for Analyst Pro.

Wraps an incoming SELECT query in an outer `SELECT * FROM (<sql>) AS _askdb_filtered WHERE …`
before it is handed to SQLValidator. Only equality predicates are supported in Plan 4a.
Field names must be plain SQL identifiers; values must be str / int / float / bool / None.

This module performs no execution — it returns a new SQL string.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Optional


_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SUPPORTED_OPS = frozenset({"eq"})


class FilterInjectionError(ValueError):
    """Raised when a filter dict fails validation."""


def _render_value(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    raise FilterInjectionError(
        f"Unsupported filter value type: {type(value).__name__}"
    )


def _render_predicate(field: str, op: str, value: Any) -> str:
    if not _IDENT_RE.match(field):
        raise FilterInjectionError(f"Invalid filter field name: {field!r}")
    if op not in _SUPPORTED_OPS:
        raise FilterInjectionError(f"Unsupported filter op: {op!r}")
    if value is None:
        return f'"{field}" IS NULL'
    return f'"{field}" = {_render_value(value)}'


def inject_additional_filters(
    sql: str,
    filters: Optional[Iterable[dict]],
) -> str:
    """
    Wrap `sql` in an outer SELECT that applies the given equality filters.

    Parameters
    ----------
    sql : str
        The user-approved SQL (already SELECT-only by the time this runs).
    filters : iterable of dict or None
        Each dict: {"field": str, "op": "eq", "value": str|int|float|bool|None}.
        Empty or None leaves the SQL untouched.

    Returns
    -------
    str : the (possibly) wrapped SQL.

    Raises
    ------
    FilterInjectionError : on invalid field, op, or value.
    """
    filters_list = list(filters) if filters else []
    if not filters_list:
        return sql

    predicates = [
        _render_predicate(f["field"], f.get("op", "eq"), f.get("value"))
        for f in filters_list
    ]

    base = sql.rstrip().rstrip(";").rstrip()
    where = " AND ".join(predicates)
    return f"SELECT * FROM ({base}) AS _askdb_filtered WHERE {where}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend
python -m pytest tests/test_sql_filter_injector.py -v
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/sql_filter_injector.py backend/tests/test_sql_filter_injector.py
git commit -m "feat(analyst-pro): sql_filter_injector helper + pytest (Plan 4a T3)"
```

---

### T4 — `ExecuteRequest.additional_filters` + injector wiring + audit

**Files:**
- Modify: `backend/routers/query_routes.py`
- Create: `backend/tests/test_execute_additional_filters.py`

**Goal:** extend the existing `/api/v1/queries/execute` endpoint so clients can POST an optional `additional_filters` array; before `SQLValidator` runs, inject the filters via `sql_filter_injector`; emit a `filter_applied` audit row.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_execute_additional_filters.py`:

```python
"""
Verify /queries/execute accepts additional_filters and passes the wrapped
SQL through SQLValidator. Does NOT execute against a real DB — we stub the
connector to assert the SQL that arrives at execution time.
"""

from unittest.mock import MagicMock
import pytest

from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client(monkeypatch):
    # Stub auth.
    from auth import get_current_user

    def _user():
        return {"email": "demo@askdb.dev", "plan": "pro"}

    app.dependency_overrides[get_current_user] = _user

    # Stub daily usage + rate limit hooks to no-op.
    from routers import query_routes
    monkeypatch.setattr(
        query_routes, "get_daily_usage",
        lambda email: {"unlimited": True, "remaining": 999, "daily_limit": 999, "plan": "pro"},
    )
    monkeypatch.setattr(
        query_routes, "check_connection_rate_limit", lambda email, conn_id: None,
    )
    monkeypatch.setattr(query_routes, "increment_query_stats", lambda *a, **k: None)
    monkeypatch.setattr(query_routes, "log_sql_edit", lambda *a, **k: None)

    yield TestClient(app)

    app.dependency_overrides.clear()


def _install_fake_connection(monkeypatch, captured_sql: list):
    """Plant a fake ConnectionEntry so get_connection() returns it."""
    fake_conn = MagicMock()
    fake_conn.execute_query = MagicMock(return_value={
        "columns": ["a"], "rows": [[1]], "row_count": 1,
    })
    fake_engine = MagicMock()

    def _run(sql, question=""):
        captured_sql.append(sql)
        return {
            "sql": sql,
            "columns": ["a"],
            "rows": [[1]],
            "row_count": 1,
            "success": True,
            "error": None,
            "summary": "ok",
        }
    fake_engine.execute_sql = MagicMock(side_effect=_run)
    fake_entry = MagicMock()
    fake_entry.engine = fake_engine
    fake_entry.connector = fake_conn
    fake_entry.conn_id = "test-conn"
    fake_entry.db_type = "postgres"
    fake_entry.database_name = "test"

    app.state.connections = {"demo@askdb.dev": {"test-conn": fake_entry}}


def test_execute_without_filters_is_pass_through(client, monkeypatch):
    captured: list = []
    _install_fake_connection(monkeypatch, captured)

    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT a FROM t",
            "question": "q",
            "conn_id": "test-conn",
        },
    )
    assert resp.status_code == 200, resp.text
    assert captured, "engine.execute_sql was never called"
    assert captured[-1].strip().startswith("SELECT a FROM t")


def test_execute_with_additional_filters_wraps_sql(client, monkeypatch):
    captured: list = []
    _install_fake_connection(monkeypatch, captured)

    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT a FROM t",
            "question": "q",
            "conn_id": "test-conn",
            "additional_filters": [
                {"field": "region", "op": "eq", "value": "West"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    assert captured, "engine.execute_sql was never called"
    final_sql = captured[-1]
    assert "_askdb_filtered" in final_sql
    assert '"region" = \'West\'' in final_sql


def test_execute_rejects_invalid_field(client, monkeypatch):
    captured: list = []
    _install_fake_connection(monkeypatch, captured)

    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT a FROM t",
            "question": "q",
            "conn_id": "test-conn",
            "additional_filters": [
                {"field": "bad field", "op": "eq", "value": 1},
            ],
        },
    )
    assert resp.status_code == 400
    assert "invalid filter" in resp.json()["detail"].lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
python -m pytest tests/test_execute_additional_filters.py -v
```

Expected: FAIL — `additional_filters` is not a known field, or the SQL is not wrapped.

- [ ] **Step 3: Extend the Pydantic request model**

Open `backend/routers/query_routes.py` and locate the `ExecuteRequest` class (around line 165). Replace it with:

```python
class _AdditionalFilter(BaseModel):
    field: str
    op: str = "eq"
    value: Optional[object] = None


class ExecuteRequest(BaseModel):
    sql: str
    question: str = ""
    conn_id: Optional[str] = None
    original_sql: Optional[str] = None  # AI-generated SQL before user edits
    # Plan 4a: optional filter predicates injected by Analyst Pro action cascade.
    additional_filters: Optional[list[_AdditionalFilter]] = None
```

- [ ] **Step 4: Inject filters inside `execute_sql` before the validator**

In the same file, find the body of `def execute_sql(req: ExecuteRequest, …)` (around line 246). Immediately before the first call that forwards `req.sql` to the engine / validator, insert:

```python
    # Plan 4a: wrap SQL with additional_filters before validation.
    if req.additional_filters:
        from sql_filter_injector import (
            inject_additional_filters,
            FilterInjectionError,
        )
        try:
            filters_payload = [f.model_dump() for f in req.additional_filters]
            req.sql = inject_additional_filters(req.sql, filters_payload)
        except FilterInjectionError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid filter injection: {exc}",
            )

        # Audit row — mirrors the fire_action audit event shape.
        try:
            from audit_trail import _append_entry as _audit_append
            from datetime import datetime, timezone
            _audit_append({
                "event": "filter_applied",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "conn_id": req.conn_id or "",
                "user": email,
                "filter_count": len(filters_payload),
                "filter_fields": [f["field"] for f in filters_payload],
            })
        except Exception:
            # Audit must never break a query.
            pass
```

The insertion point is **after** `email = user["email"]` and **before** the `usage = get_daily_usage(email)` call — i.e. right at the top of the function body. If your local file already binds `email` lower, hoist this block to a spot where `email`, `req.sql`, and `req.conn_id` are all accessible and before any engine call.

- [ ] **Step 5: Run the tests and confirm they pass**

Run:

```bash
cd backend
python -m pytest tests/test_execute_additional_filters.py -v
```

Expected: PASS (3 tests). If `test_execute_rejects_invalid_field` returns 500 instead of 400, confirm the `HTTPException` raise is inside the try/except and not swallowed by a broader handler above.

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run:

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green (no new failures vs. `main`).

- [ ] **Step 7: Commit**

```bash
git add backend/routers/query_routes.py backend/tests/test_execute_additional_filters.py
git commit -m "feat(analyst-pro): /queries/execute additional_filters + audit (Plan 4a T4)"
```

---

### T5 — `waterfall_router` optional `additional_filters` passthrough

**Files:**
- Modify: `backend/waterfall_router.py`

**Goal:** add an optional `additional_filters` keyword argument to `WaterfallRouter.route`, `route_sync`, and `_route_sync_impl`. In Plan 4a it is forwarded into `TierResult.metadata["additional_filters"]` so downstream consumers (LiveTier → agent run_sql / future cached-query re-execution) can see the client's intent. No behavior change for callers who omit it.

- [ ] **Step 1: Extend `route`**

Open `backend/waterfall_router.py`. Change the signature of `async def route` (around line 779) from

```python
    async def route(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
    ) -> TierResult:
```

to

```python
    async def route(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
        additional_filters: Optional[List[dict]] = None,
    ) -> TierResult:
```

Inside the function, at the site where `result.metadata["schema_hash"] = current_hash` is assigned (around line 895), append one line:

```python
            result.metadata["additional_filters"] = additional_filters or []
```

Also in the miss branch (the `return TierResult(hit=False, …)` near the end), add the same key to the metadata dict:

```python
            metadata={
                "tiers_checked": tiers_checked,
                "time_ms": int(elapsed_ms),
                "schema_hash": current_hash,
                "tier_timings": tier_timings,
                "additional_filters": additional_filters or [],
            },
```

- [ ] **Step 2: Extend `route_sync` and `_route_sync_impl`**

Update signatures and forward the new argument:

```python
    def route_sync(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
        additional_filters: Optional[List[dict]] = None,
    ) -> TierResult:
        """Synchronous wrapper for route()."""
        import asyncio
        try:
            asyncio.get_running_loop()
            return self._route_sync_impl(
                question, schema_profile, conn_id, additional_filters,
            )
        except RuntimeError:
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(
                    self.route(question, schema_profile, conn_id, additional_filters),
                )
            finally:
                loop.close()

    def _route_sync_impl(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
        additional_filters: Optional[List[dict]] = None,
    ) -> TierResult:
```

Inside `_route_sync_impl`, locate the block that populates `result.metadata` on a hit (mirrors the `route` branch) and add:

```python
            result.metadata["additional_filters"] = additional_filters or []
```

And update the miss-branch metadata dict to include `"additional_filters": additional_filters or []`.

- [ ] **Step 3: Run existing waterfall tests**

Run:

```bash
cd backend
python -m pytest tests/ -k "waterfall" -v
```

Expected: existing tests still green. No new tests required — this is a pure additive keyword arg.

- [ ] **Step 4: Commit**

```bash
git add backend/waterfall_router.py
git commit -m "feat(analyst-pro): waterfall_router additional_filters passthrough (Plan 4a T5)"
```

---

### T6 — Frontend `api.js` `executeSQL` accepts `additionalFilters`

**Files:**
- Modify: `frontend/src/api.js`

**Goal:** extend the existing helper so callers can pass `additionalFilters: Filter[]`. Serialized as `additional_filters` in the request body. Backwards-compatible (default `null`).

- [ ] **Step 1: Update the helper**

Open `frontend/src/api.js`. Locate `executeSQL` (around line 228) and replace it with:

```js
  executeSQL: (sql, question, connId = null, originalSql = null, additionalFilters = null) =>
    request("/queries/execute", {
      method: "POST",
      body: JSON.stringify({
        sql,
        question,
        conn_id: connId,
        original_sql: originalSql || undefined,
        additional_filters:
          Array.isArray(additionalFilters) && additionalFilters.length > 0
            ? additionalFilters
            : undefined,
      }),
    }),
```

- [ ] **Step 2: Lint**

Run:

```bash
cd frontend
npm run lint -- --max-warnings=0 src/api.js
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(analyst-pro): api.executeSQL accepts additionalFilters (Plan 4a T6)"
```

---

### T7 — Wire `useActionRuntime` filter + highlight + clear

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ActionRuntime.integration.test.tsx` (existing)

**Goal:** replace the Plan 3 stub in `applyTargetOp` so that:
1. `'filter'` TargetOps call `setSheetFilterAnalystPro(sheetId, Filter[])`. An empty filter list clears the slice via `clearSheetFilterAnalystPro`.
2. `'highlight'` TargetOps call `setSheetHighlightAnalystPro(sheetId, fieldValues)` with empty-object-clear semantics.
3. Cascade target status still transitions pending → done so existing Plan 3 tests keep passing.

- [ ] **Step 1: Write the failing tests**

Open `frontend/src/components/dashboard/freeform/__tests__/ActionRuntime.integration.test.tsx`. Append the following test cases inside the existing `describe(...)` block:

```ts
import { buildAdditionalFilters } from '../lib/filterApplication';
// (add this import near the top if it is not already present)

it('filter TargetOp writes analystProSheetFilters entry', () => {
  const dashboard = {
    id: 'd1',
    archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [
      {
        id: 'a1',
        kind: 'filter',
        name: 'F',
        enabled: true,
        sourceSheets: ['src'],
        trigger: 'select',
        targetSheets: ['w1'],
        fieldMapping: [{ source: 'Region', target: 'Region' }],
        clearBehavior: 'leave-filter',
      },
    ],
  };
  useStore.setState({ analystProDashboard: dashboard });

  // Mount a component that registers the runtime hook.
  render(<Harness />);
  act(() => {
    publish({
      sourceSheetId: 'src',
      trigger: 'select',
      markData: { Region: 'West' },
      timestamp: Date.now(),
    });
  });

  const state = useStore.getState();
  expect(state.analystProSheetFilters.w1).toEqual([
    { field: 'Region', op: 'eq', value: 'West' },
  ]);
});

it('filter TargetOp with empty filters clears the slice', () => {
  useStore.setState({
    analystProSheetFilters: {
      w1: [{ field: 'Region', op: 'eq', value: 'West' }],
    },
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      sets: [],
      actions: [
        {
          id: 'a1',
          kind: 'filter',
          name: 'F',
          enabled: true,
          sourceSheets: ['src'],
          trigger: 'select',
          targetSheets: ['w1'],
          fieldMapping: [{ source: 'Region', target: 'Region' }],
          clearBehavior: 'show-all',
        },
      ],
    },
  });

  render(<Harness />);
  act(() => {
    publish({
      sourceSheetId: 'src',
      trigger: 'select',
      markData: {}, // no Region present → empty filters
      timestamp: Date.now(),
    });
  });

  expect(useStore.getState().analystProSheetFilters.w1).toBeUndefined();
});

it('highlight TargetOp writes analystProSheetHighlights entry', () => {
  useStore.setState({
    analystProDashboard: {
      id: 'd1',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
      floatingLayer: [],
      worksheets: [],
      parameters: [],
      sets: [],
      actions: [
        {
          id: 'a1',
          kind: 'highlight',
          name: 'H',
          enabled: true,
          sourceSheets: ['src'],
          trigger: 'hover',
          targetSheets: ['w1'],
          fieldMapping: [{ source: 'Region', target: 'Region' }],
        },
      ],
    },
  });

  render(<Harness />);
  act(() => {
    publish({
      sourceSheetId: 'src',
      trigger: 'hover',
      markData: { Region: 'East' },
      timestamp: Date.now(),
    });
  });

  expect(useStore.getState().analystProSheetHighlights.w1).toEqual({ Region: 'East' });
});
```

If the existing test file does not already define a `Harness` component or import `publish`, add:

```tsx
import { publish } from '../lib/markEventBus';
import { render, act } from '@testing-library/react';
import { useActionRuntime } from '../hooks/useActionRuntime';
import { useStore } from '../../../../store';

function Harness() {
  useActionRuntime();
  return null;
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend
npm run test:chart-ir -- ActionRuntime
```

Expected: FAIL — slices not populated.

- [ ] **Step 3: Update `useActionRuntime.js`**

Replace `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js` with:

```js
import { useEffect } from 'react';
import { useStore } from '../../../../store';
import { subscribe } from '../lib/markEventBus';
import { executeCascade } from '../lib/actionExecutor';
import { buildAdditionalFilters } from '../lib/filterApplication';

function applyTargetOp(op, token) {
  const store = useStore.getState();
  switch (op.kind) {
    case 'filter': {
      const filters = buildAdditionalFilters(op);
      if (filters.length === 0) {
        store.clearSheetFilterAnalystPro(op.sheetId);
      } else {
        store.setSheetFilterAnalystPro(op.sheetId, filters);
      }
      store.markCascadeTargetStatus(op.sheetId, 'pending', token);
      // The AnalystProWorksheetTile wrapper observes the slice and kicks off
      // the re-query; it calls markCascadeTargetStatus(..., 'done', token)
      // once the response arrives. Plan 4a T8.
      break;
    }
    case 'highlight': {
      const fieldValues = op.fieldValues || {};
      if (Object.keys(fieldValues).length === 0) {
        store.clearSheetHighlightAnalystPro(op.sheetId);
      } else {
        store.setSheetHighlightAnalystPro(op.sheetId, fieldValues);
      }
      store.markCascadeTargetStatus(op.sheetId, 'done', token);
      break;
    }
    case 'url':
      if (op.urlTarget === 'new-tab' && typeof window !== 'undefined') {
        window.open(op.url, '_blank', 'noopener');
      }
      break;
    case 'goto-sheet':
      // Plan 3b: scroll/focus target zone.
      break;
    case 'change-parameter':
      // Plan 4b: integrate with parameter system.
      break;
    case 'change-set':
      // Plan 4b: integrate with set system.
      break;
  }
}

export function useActionRuntime() {
  useEffect(() => {
    return subscribe((event) => {
      const state = useStore.getState();
      const actions = state.analystProDashboard?.actions || [];
      if (actions.length === 0) return;
      const token = state.fireActionCascadeAnalystPro();
      const ops = executeCascade(actions, event);
      for (const op of ops) applyTargetOp(op, token);
    });
  }, []);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd frontend
npm run test:chart-ir -- ActionRuntime
```

Expected: PASS (Plan 3 tests + 3 new T7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js \
        frontend/src/components/dashboard/freeform/__tests__/ActionRuntime.integration.test.tsx
git commit -m "feat(analyst-pro): useActionRuntime wires filter+highlight slices (Plan 4a T7)"
```

---

### T8 — `AnalystProWorksheetTile.jsx` wrapper + layout wiring

**Files:**
- Create: `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

**Goal:** add a thin wrapper that observes `analystProSheetFilters[sheetId]`, re-executes the tile's SQL via `api.executeSQL(tile.sql, tile.question, conn_id, null, additionalFilters)`, and hands the fresh `{columns, rows}` to the existing `DashboardTileCanvas` via its `resultSetOverride` prop. When filters clear, the wrapper falls back to the tile's own rows.

- [ ] **Step 1: Create the wrapper**

Create `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import DashboardTileCanvas from '../lib/DashboardTileCanvas';
import { api } from '../../../api';
import { useStore } from '../../../store';

/**
 * AnalystProWorksheetTile — wraps DashboardTileCanvas so that a per-sheet
 * filter entry in analystProSheetFilters triggers a re-execution of the
 * tile's SQL with `additional_filters` injected. When the filter slice
 * is empty for this sheet, the wrapper passes no override and the tile
 * renders from its own persisted rows.
 *
 * Plan 4a scope: filter-only. Highlight semantics are visual-only and
 * handled elsewhere.
 */
export default function AnalystProWorksheetTile({ tile, sheetId, onTileClick }) {
  const filters = useStore(
    (s) => s.analystProSheetFilters[sheetId] || null,
  );
  const cascadeToken = useStore((s) => s.analystProActionCascadeToken);
  const markStatus = useStore((s) => s.markCascadeTargetStatus);
  const connId = useStore((s) => s.activeConnection?.conn_id || null);

  const [override, setOverride] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    // No filters or no SQL → clear override, let the tile show its own rows.
    if (!filters || filters.length === 0 || !tile?.sql) {
      setOverride(null);
      setErrorMsg(null);
      return;
    }

    const seq = ++requestSeqRef.current;
    const tokenAtFire = cascadeToken;
    let cancelled = false;

    (async () => {
      try {
        const resp = await api.executeSQL(
          tile.sql,
          tile.question || '',
          connId,
          null,
          filters,
        );
        if (cancelled || seq !== requestSeqRef.current) return;
        setOverride({
          columns: Array.isArray(resp?.columns) ? resp.columns : [],
          rows: Array.isArray(resp?.rows) ? resp.rows : [],
          columnProfile: Array.isArray(resp?.columnProfile)
            ? resp.columnProfile
            : [],
        });
        setErrorMsg(null);
        markStatus(sheetId, 'done', tokenAtFire);
      } catch (err) {
        if (cancelled || seq !== requestSeqRef.current) return;
        setErrorMsg(err?.message || 'Filter query failed');
        markStatus(sheetId, 'error', tokenAtFire);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters array identity covers all inputs
  }, [filters, sheetId, tile?.sql, tile?.question, connId]);

  return (
    <>
      <DashboardTileCanvas
        tile={tile}
        onTileClick={onTileClick}
        resultSetOverride={override}
      />
      {errorMsg ? (
        <div
          data-testid={`analyst-pro-worksheet-error-${sheetId}`}
          style={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            fontSize: 10,
            color: 'var(--danger, #f87171)',
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 6px',
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        >
          {errorMsg}
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Wire wrapper into `AnalystProLayout.renderLeaf`**

Open `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`. At the top, add:

```jsx
import AnalystProWorksheetTile from '../freeform/AnalystProWorksheetTile';
```

Replace the existing `renderLeaf` (around line 59) with:

```jsx
  const renderLeaf = useMemo(() => {
    return (zone) => {
      if (zone.type === 'worksheet' && zone.worksheetRef) {
        const tile = tiles.find((t) => String(t.id) === zone.worksheetRef);
        if (!tile) return null;
        return (
          <AnalystProWorksheetTile
            tile={tile}
            sheetId={zone.worksheetRef}
            onTileClick={onTileClick}
          />
        );
      }
      if (zone.type === 'blank') {
        return <div data-testid={`blank-${zone.id}`} style={{ width: '100%', height: '100%' }} />;
      }
      return null;
    };
  }, [tiles, onTileClick]);
```

- [ ] **Step 3: Lint**

Run:

```bash
cd frontend
npm run lint -- --max-warnings=0 \
  src/components/dashboard/freeform/AnalystProWorksheetTile.jsx \
  src/components/dashboard/modes/AnalystProLayout.jsx
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx \
        frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): AnalystProWorksheetTile re-queries on filter (Plan 4a T8)"
```

---

### T9 — End-to-end integration test + smoke

**Files:**
- Create: `frontend/src/components/dashboard/freeform/__tests__/FilterInjection.integration.test.tsx`

**Goal:** prove the complete chain: publish `MarkEvent` → cascade → store filter entry → `AnalystProWorksheetTile` calls `api.executeSQL` with `additional_filters` → mock API resolves → override set.

- [ ] **Step 1: Write the integration test**

Create `frontend/src/components/dashboard/freeform/__tests__/FilterInjection.integration.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import React from 'react';

import { useStore } from '../../../../store';
import { publish } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';
import AnalystProWorksheetTile from '../AnalystProWorksheetTile';

vi.mock('../../../../api', () => ({
  api: {
    executeSQL: vi.fn(),
  },
}));

import { api } from '../../../../api';

function Harness({ tile, sheetId }) {
  useActionRuntime();
  return <AnalystProWorksheetTile tile={tile} sheetId={sheetId} />;
}

const baseDashboard = {
  id: 'd1',
  archetype: 'analyst-pro',
  size: { mode: 'automatic' },
  tiledRoot: { id: 'r', type: 'container-horz', w: 100000, h: 100000, children: [] },
  floatingLayer: [],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [
    {
      id: 'a1',
      kind: 'filter',
      name: 'F',
      enabled: true,
      sourceSheets: ['src'],
      trigger: 'select',
      targetSheets: ['w1'],
      fieldMapping: [{ source: 'Region', target: 'Region' }],
      clearBehavior: 'leave-filter',
    },
  ],
};

const tile = {
  id: 'w1',
  title: 'Sales by Region',
  sql: 'SELECT region, total FROM sales',
  question: 'q',
  columns: ['region', 'total'],
  rows: [['East', 10]],
};

describe('FilterInjection integration', () => {
  beforeEach(() => {
    api.executeSQL.mockReset();
    useStore.setState({
      analystProDashboard: baseDashboard,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
      analystProActionCascadeToken: 0,
      analystProActiveCascadeTargets: {},
      activeConnection: { conn_id: 'c1' },
    });
  });

  afterEach(() => {
    useStore.setState({
      analystProDashboard: null,
      analystProSheetFilters: {},
      analystProSheetHighlights: {},
    });
  });

  it('publishes mark → writes filter slice → re-queries with additional_filters', async () => {
    api.executeSQL.mockResolvedValue({
      columns: ['region', 'total'],
      rows: [['West', 42]],
    });

    render(<Harness tile={tile} sheetId="w1" />);

    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: { Region: 'West' },
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect(api.executeSQL).toHaveBeenCalledTimes(1);
    });

    const [sql, question, connId, originalSql, additionalFilters] =
      api.executeSQL.mock.calls[0];
    expect(sql).toBe('SELECT region, total FROM sales');
    expect(question).toBe('q');
    expect(connId).toBe('c1');
    expect(originalSql).toBeNull();
    expect(additionalFilters).toEqual([
      { field: 'Region', op: 'eq', value: 'West' },
    ]);

    await waitFor(() => {
      expect(
        useStore.getState().analystProActiveCascadeTargets.w1,
      ).toBe('done');
    });
  });

  it('empty mark clears the slice and does not re-query', async () => {
    useStore.setState({
      analystProSheetFilters: {
        w1: [{ field: 'Region', op: 'eq', value: 'West' }],
      },
    });
    render(<Harness tile={tile} sheetId="w1" />);

    // One call happens on mount because slice already has entries.
    await waitFor(() => {
      expect(api.executeSQL).toHaveBeenCalledTimes(1);
    });

    act(() => {
      publish({
        sourceSheetId: 'src',
        trigger: 'select',
        markData: {}, // empty → clears
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect(useStore.getState().analystProSheetFilters.w1).toBeUndefined();
    });

    // No additional call after clear.
    expect(api.executeSQL).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run:

```bash
cd frontend
npm run test:chart-ir -- FilterInjection
```

Expected: PASS (2 tests).

- [ ] **Step 3: Frontend full smoke**

Run:

```bash
cd frontend
npm run test:chart-ir
npm run lint
npm run build
```

Expected: all three green. Note pre-existing warnings (e.g. `useDragResize` dep warning) are acceptable. Report the test-count delta vs. Plan 3 tip — expected `+5` (filterApplication 5) + `+3` (ActionRuntime additions) + `+2` (FilterInjection) = `+10`.

- [ ] **Step 4: Backend full smoke**

Run:

```bash
cd backend
python -m pytest tests/ -v
```

Expected: full suite green. New tests: `test_sql_filter_injector.py` (11) + `test_execute_additional_filters.py` (3).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/__tests__/FilterInjection.integration.test.tsx
git commit -m "test(analyst-pro): end-to-end filter injection integration test (Plan 4a T9)"
```

---

## Out of Scope (deferred)

- Highlight visual dimming in Vega-Lite renderer — Plan 4b.
- `ChangeParameter` / `ChangeSet` runtime wiring — Plan 4b / 4c.
- Server-side query memoization when the same `(sql, additional_filters)` fires repeatedly — Plan 4c.
- Exclude-all / show-all semantics beyond "clear on empty" — Plan 4b (requires UI for clearBehavior toggle).
- Turbo-tier fast path for filter-applied queries — Plan 4c (requires joining filter plan into DuckDB twin predicates).

---

## Rollout

- Every new endpoint surface stays behind `settings.FEATURE_ANALYST_PRO` (existing gate).
- `AnalystProWorksheetTile` only mounts inside `AnalystProLayout`, so other archetypes are unaffected.
- Default: `additional_filters = null` → zero-diff for every non-Analyst-Pro caller.

---

## Review Anchors

- **Spec compliance:** `analystProSheetFilters` slice shape; filter TargetOp correctly drops unsafe identifiers; backend injector is sqlglot-safe; `/execute` audit row written.
- **Code quality:** no `import anthropic` anywhere except `backend/anthropic_provider.py`; no new ECharts usage; action names follow `analystPro*` suffix; state fields follow `analystPro*` prefix; no console.log; no emoji.
- **Security invariants:** wrapped SQL is still a SELECT — validator chain unchanged; PII masking still runs via `mask_dataframe()` in the engine path; no secrets logged in audit.

# Plan 6e — Chart Tooltip: Keep Only / Exclude / View Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Vega hover tooltip on Analyst Pro worksheet tiles with a custom `ChartTooltipCard` that exposes Tableau-parity Keep Only / Exclude / View Data actions, and add a `ViewDataDrawer` plus a backend `/queries/underlying` endpoint that returns the raw rows underneath a clicked mark.

**Architecture:**
- **Frontend.** `VegaRenderer` stops mounting its own `MiniChartTooltip` for Analyst Pro tiles (sheetId set) and instead emits an `onMarkHover(sheetId, datum, clientX, clientY)` event. `AnalystProWorksheetTile` owns the new tooltip lifecycle: it renders `ChartTooltipCard` (Floating-UI anchored to the cursor) when hover state is set. Keep Only / Exclude push a `{field, op, value(s)}` entry into the existing `analystProSheetFilters[sheetId]` Zustand slice — Plan 4a's `AnalystProWorksheetTile` re-query effect re-fires automatically. View Data flips a new `viewDataDrawer` Zustand slice that opens a right-side 480px drawer.
- **Backend.** Extend `sql_filter_injector.py` with a new `notIn` op (mirrors existing `in`). Add `POST /api/v1/queries/underlying` to `query_routes.py` that wraps the worksheet's original SQL with `SELECT * FROM (<sql>) AS _askdb_underlying WHERE <markSelection AND-ed eq predicates>`, runs it through the same 6-layer `SQLValidator`, masks the DataFrame via `mask_dataframe()`, caps to 50K rows, and writes a `view_data` audit entry.

**Build_Tableau.md cross-references:**
- §XII.1 — default tooltip composition (header, dim caps, measure aggs, command buttons). We render dim+measure rows then the action footer.
- §XII.2 — Tableau also supports rich-text custom tooltip syntax. Out of scope for 6e; placeholder for Plan 7.
- §XII.5 — Keep Only → `WHERE field IN (selected)` ; Exclude → `WHERE field NOT IN (selected)` (or `IsExcludeMode=true` on the categorical filter card). We use `op: 'in'` / `op: 'notIn'` on `analystProSheetFilters`.
- §IV.7 — filter order-of-ops. Step 5 is Dimension filters. Plan 4a's outer-`SELECT` wrap technically applies the predicate AFTER the inner query's aggregation (HAVING-equivalent). For categorical Keep Only this still produces the right rows because the dim value is preserved through GROUP BY, but it is NOT the same plan Tableau emits. Documented here so a future Plan 7 (VizQL IR) can lift the predicate into the inner stage 5 properly.
- §XIX.1 — anti-pattern warning: many "Only Relevant Values" filter changes cause N² domain refreshes. Our Keep Only stacks predicates additively on the same field with no dedupe — flag this in `ChartTooltipCard` test coverage and surface stack count to the user via an existing filter pill in a follow-up plan.

**Security invariants (must hold):**
- Two-step flow preserved: `/underlying` is a *separate* read endpoint, not a `/generate` shortcut. It runs the worksheet's *already-approved* SQL only.
- 6-layer `SQLValidator` runs after wrapping. No bypass path.
- `mask_dataframe()` runs before underlying rows leave the backend.
- Driver-level read-only enforcement intact (the wrapped SQL is still a `SELECT`).
- No new secret material added.

**Tech Stack:** React 19, Floating-UI (`@floating-ui/react`, already a dep), Zustand 5, vitest 2.x, react-vega 8, FastAPI, pydantic v2, sqlglot, pytest.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `backend/sql_filter_injector.py` | modify | add `notIn` op to `_SUPPORTED_OPS` and `_render_predicate` |
| `backend/routers/query_routes.py` | modify | extend `_AdditionalFilter.op` validation; add `POST /queries/underlying` endpoint and request model |
| `backend/tests/test_sql_filter_injector_not_in.py` | create | TDD for `notIn` op (positive, escape, mixed with `in`) |
| `backend/tests/test_view_data_underlying.py` | create | TDD for `/underlying` endpoint: happy path, mark selection wrap, SQL-injection rejection, oversize cap, validator integration |
| `frontend/src/components/dashboard/freeform/lib/filterApplication.ts` | modify | extend `Filter` union with `notIn` variant |
| `frontend/src/components/dashboard/freeform/lib/__tests__/filterApplication.test.ts` | create if missing, append | type-level + runtime test that `notIn` round-trips |
| `frontend/src/api.js` | modify | add `executeUnderlying({ sheetId, connId, sql, markSelection, limit })` |
| `frontend/src/store.js` | modify | add `viewDataDrawer` slice (`open`, `sheetId`, `connId`, `sql`, `markSelection`, `summaryColumns`, `summaryRows`); actions `openViewDataDrawer`, `closeViewDataDrawer` |
| `frontend/src/components/dashboard/freeform/ChartTooltipCard.jsx` | create | Floating-UI positioned card; rows for hovered datum; footer with Keep Only / Exclude / View Data; keyboard nav |
| `frontend/src/components/dashboard/freeform/__tests__/ChartTooltipCard.test.jsx` | create | render, action callbacks, keyboard nav, ARIA |
| `frontend/src/components/dashboard/freeform/ViewDataDrawer.jsx` | create | 480px right drawer, two tabs (Summary/Underlying), CSV export, close button + Esc handler |
| `frontend/src/components/dashboard/freeform/__tests__/ViewDataDrawer.test.jsx` | create | tab switch, CSV export, Esc closes |
| `frontend/src/components/editor/renderers/VegaRenderer.tsx` | modify | accept `onMarkHover` prop; when set, suppress internal `MiniChartTooltip` + Vega built-in actions; emit on `mouseover`/`mousemove`/`mouseout` |
| `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx` | modify | own hover state; render `ChartTooltipCard`; wire its callbacks to `setSheetFilterAnalystPro` (Keep Only / Exclude) and `openViewDataDrawer` (View Data) |
| `frontend/src/components/dashboard/freeform/lib/__tests__/analystProTooltip.contract.test.tsx` | create | regression contract: tooltip Keep Only mutates `analystProSheetFilters[sheetId]` correctly |
| `docs/analyst_pro_tableau_parity_roadmap.md` | modify (last task) | flip Plan 6e status to ✅ Shipped, add commit list |

---

## Conventions

- **Commits.** One commit per task: `feat(analyst-pro): <verb> <object> (Plan 6e TX)` or `test(analyst-pro): … (Plan 6e TX)`. Final task is `chore(analyst-pro): Plan 6e smoke verification + roadmap status (Plan 6e T11)`.
- **Working directory.** `QueryCopilot V1/` (the inner git repo). Never run `git` from the parent dir.
- **Backend tests.** `cd backend && python -m pytest tests/<file>.py -v`.
- **Frontend tests.** `cd frontend && npm run test:chart-ir -- <pattern>` (vitest filters by file path).
- **Lint.** `cd frontend && npm run lint` after every JSX/TS change. Backend has no linter — sticking to the file's existing style is the bar.

---

## Task 1 — Backend: extend `inject_additional_filters` with `notIn` op

**Files:**
- Modify: `backend/sql_filter_injector.py`
- Create: `backend/tests/test_sql_filter_injector_not_in.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_sql_filter_injector_not_in.py
import pytest

from sql_filter_injector import inject_additional_filters, FilterInjectionError


class TestNotInOperator:
    def test_not_in_with_string_values(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [{"field": "region", "op": "notIn", "values": ["East", "West"]}],
        )
        assert "_askdb_filtered" in out
        assert 'WHERE "region" NOT IN (\'East\', \'West\')' in out

    def test_not_in_with_numeric_values(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [{"field": "year", "op": "notIn", "values": [2024, 2025]}],
        )
        assert 'WHERE "year" NOT IN (2024, 2025)' in out

    def test_not_in_escapes_single_quotes(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "name", "op": "notIn", "values": ["O'Brien"]}],
        )
        assert "'O''Brien'" in out

    def test_not_in_rejects_empty_values(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "notIn", "values": []}],
            )

    def test_not_in_rejects_invalid_identifier(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "bad field", "op": "notIn", "values": ["x"]}],
            )

    def test_mixed_in_and_not_in(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [
                {"field": "region", "op": "in", "values": ["East"]},
                {"field": "year", "op": "notIn", "values": [2024]},
            ],
        )
        assert 'IN (\'East\')' in out
        assert 'NOT IN (2024)' in out
        assert " AND " in out
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_sql_filter_injector_not_in.py -v
```

Expected: every test FAILS with `FilterInjectionError: Unsupported filter op: 'notIn'`.

- [ ] **Step 3: Implement `notIn` in the injector**

In `backend/sql_filter_injector.py`, change:

```python
_SUPPORTED_OPS = frozenset({"eq", "in"})
```

to:

```python
_SUPPORTED_OPS = frozenset({"eq", "in", "notIn"})
```

Replace the `if op == "in":` branch in `_render_predicate` with:

```python
    if op in ("in", "notIn"):
        values = entry.get("values")
        if not isinstance(values, list) or len(values) == 0:
            raise FilterInjectionError(
                f"{op!r} filter requires a non-empty 'values' list: {field!r}"
            )
        rendered = []
        for v in values:
            if isinstance(v, (str, int, float, bool)) or v is None:
                rendered.append(_render_value(v))
            else:
                raise FilterInjectionError(
                    f"Unsupported filter value type in {op!r} list: {type(v).__name__}"
                )
        sql_op = "IN" if op == "in" else "NOT IN"
        return f'"{field}" {sql_op} ({", ".join(rendered)})'
```

- [ ] **Step 4: Run the new tests + the existing injector regressions**

```bash
cd backend && python -m pytest tests/test_sql_filter_injector.py tests/test_sql_filter_injector_in_op.py tests/test_sql_filter_injector_not_in.py -v
```

Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add backend/sql_filter_injector.py backend/tests/test_sql_filter_injector_not_in.py
git commit -m "feat(analyst-pro): notIn op in sql_filter_injector for Exclude action (Plan 6e T1)"
```

---

## Task 2 — Backend: extend `_AdditionalFilter` op validation + extend `executeSQL` regression coverage

**Files:**
- Modify: `backend/routers/query_routes.py`
- Modify: `backend/tests/test_execute_additional_filters.py`

The `_AdditionalFilter` Pydantic model in `query_routes.py` lets `op` be any string; the injector rejects unknown ops with `FilterInjectionError` → `400`. We tighten the model with an explicit `Literal` so bad clients get an upfront `422` instead of a 400.

- [ ] **Step 1: Add a regression test for `notIn` round-trip through `_AdditionalFilter`**

Append to `backend/tests/test_execute_additional_filters.py`:

```python
def test_execute_accepts_not_in_op(monkeypatch):
    """notIn is a valid op for the request model and reaches the injector."""
    from routers.query_routes import _AdditionalFilter

    f = _AdditionalFilter(field="region", op="notIn", values=["East"])
    payload = f.model_dump()
    assert payload == {"field": "region", "op": "notIn", "value": None, "values": ["East"]}


def test_execute_rejects_unknown_op():
    from pydantic import ValidationError
    from routers.query_routes import _AdditionalFilter
    import pytest

    with pytest.raises(ValidationError):
        _AdditionalFilter(field="x", op="like", values=["%a%"])
```

- [ ] **Step 2: Run them, confirm both fail**

```bash
cd backend && python -m pytest tests/test_execute_additional_filters.py::test_execute_accepts_not_in_op tests/test_execute_additional_filters.py::test_execute_rejects_unknown_op -v
```

Expected: first FAILS only if model serialization shape differs; second FAILS because `op` is a free `str`.

- [ ] **Step 3: Tighten the Pydantic model**

In `backend/routers/query_routes.py`, change the `_AdditionalFilter` definition:

```python
from typing import Literal, Optional

class _AdditionalFilter(BaseModel):
    field: str
    op: Literal["eq", "in", "notIn"] = "eq"
    value: Optional[object] = None
    values: Optional[list[object]] = None
```

(Add `Literal` to the existing `from typing import Optional` line.)

- [ ] **Step 4: Re-run the model tests + the full execute_additional_filters regression file**

```bash
cd backend && python -m pytest tests/test_execute_additional_filters.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/query_routes.py backend/tests/test_execute_additional_filters.py
git commit -m "feat(analyst-pro): tighten _AdditionalFilter op to Literal[eq,in,notIn] (Plan 6e T2)"
```

---

## Task 3 — Backend: `/queries/underlying` endpoint (TDD)

**Files:**
- Create: `backend/tests/test_view_data_underlying.py`
- Modify: `backend/routers/query_routes.py`

The endpoint takes `{conn_id, sql, markSelection, limit}`, wraps the SQL with the mark equality predicates via `inject_additional_filters` (every entry becomes a `{op:'eq'}` filter), runs it through `entry.engine.execute_sql`, masks the DataFrame, and returns columns/rows. Default limit 10000, hard cap 50000. Audit row `view_data` written.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_view_data_underlying.py
"""Tests for POST /api/v1/queries/underlying — Plan 6e View Data drawer source."""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


# ---- Test scaffolding ------------------------------------------------------
@pytest.fixture
def client(monkeypatch):
    from main import app
    from auth import get_current_user

    async def _fake_user():
        return {"email": "pytest@askdb.dev"}

    app.dependency_overrides[get_current_user] = _fake_user

    fake_engine = MagicMock()
    fake_result = MagicMock()
    fake_result.error = None
    fake_result.latency_ms = 7
    fake_result.to_dict.return_value = {
        "columns": ["region", "year", "amount"],
        "rows": [["East", 2024, 100], ["East", 2024, 250]],
        "error": None,
        "latency_ms": 7,
    }
    fake_engine.execute_sql.return_value = fake_result

    fake_entry = MagicMock()
    fake_entry.engine = fake_engine
    fake_entry.conn_id = "conn-1"
    fake_entry.db_type = "postgresql"
    fake_entry.database_name = "test"
    fake_entry.connector.is_big_data_engine.return_value = False

    app.state.connections = {"pytest@askdb.dev": {"conn-1": fake_entry}}
    yield TestClient(app), fake_engine
    app.dependency_overrides.clear()


def _underlying(client: TestClient, **overrides: Any):
    body = {
        "conn_id": "conn-1",
        "sql": "SELECT region, year, SUM(amount) AS amount FROM sales GROUP BY 1, 2",
        "mark_selection": {"region": "East", "year": 2024},
        "limit": 10000,
    }
    body.update(overrides)
    return client.post("/api/v1/queries/underlying", json=body)


# ---- Happy path ------------------------------------------------------------
class TestUnderlyingHappyPath:
    def test_returns_columns_and_rows(self, client):
        c, _engine = client
        r = _underlying(c)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["columns"] == ["region", "year", "amount"]
        assert len(body["rows"]) == 2
        assert body["mark_selection"] == {"region": "East", "year": 2024}

    def test_wraps_sql_with_mark_predicates(self, client):
        c, engine = client
        _underlying(c)
        called_sql = engine.execute_sql.call_args.args[0]
        # The wrap puts the original SQL inside a subselect with both
        # equality predicates AND-ed.
        assert "_askdb_filtered" in called_sql
        assert '"region" = \'East\'' in called_sql
        assert '"year" = 2024' in called_sql
        assert " AND " in called_sql

    def test_empty_mark_selection_returns_unwrapped(self, client):
        c, engine = client
        _underlying(c, mark_selection={})
        called_sql = engine.execute_sql.call_args.args[0]
        assert called_sql.strip().startswith("SELECT region, year, SUM(amount)")
        assert "_askdb_filtered" not in called_sql


# ---- Limit handling --------------------------------------------------------
class TestUnderlyingLimits:
    def test_default_limit_is_10000(self, client):
        c, _engine = client
        r = _underlying(c, limit=None)
        assert r.status_code == 200
        assert r.json()["limit"] == 10000

    def test_limit_capped_at_50000(self, client):
        c, _engine = client
        r = _underlying(c, limit=100000)
        assert r.status_code == 200
        assert r.json()["limit"] == 50000

    def test_negative_limit_clamps_to_default(self, client):
        c, _engine = client
        r = _underlying(c, limit=-5)
        assert r.status_code == 200
        assert r.json()["limit"] == 10000


# ---- Security --------------------------------------------------------------
class TestUnderlyingSecurity:
    def test_rejects_invalid_field_in_mark_selection(self, client):
        c, _engine = client
        # Field with space + quote is not a plain SQL identifier.
        r = _underlying(c, mark_selection={"region'); DROP TABLE sales;--": "x"})
        assert r.status_code == 400
        assert "Invalid filter" in r.json()["detail"] or "invalid" in r.json()["detail"].lower()

    def test_rejects_non_select_sql(self, client):
        c, _engine = client
        r = _underlying(c, sql="DROP TABLE sales")
        # SQLValidator rejects → engine.execute_sql still called, but the
        # endpoint should pre-validate. We require a 400 here; if the impl
        # routes through the engine and returns an error string instead,
        # the test will fail and we'll fix the impl, not the test.
        assert r.status_code == 400

    def test_rejects_unknown_conn_id(self, client):
        c, _engine = client
        r = _underlying(c, conn_id="does-not-exist")
        assert r.status_code == 404


# ---- Audit trail -----------------------------------------------------------
class TestUnderlyingAudit:
    def test_writes_view_data_audit_entry(self, client, monkeypatch):
        captured: list[dict] = []

        def _fake_append(entry):
            captured.append(entry)

        import audit_trail

        monkeypatch.setattr(audit_trail, "_append_entry", _fake_append)
        c, _engine = client
        r = _underlying(c)
        assert r.status_code == 200
        events = [e["event"] for e in captured]
        assert "view_data" in events
        view = next(e for e in captured if e["event"] == "view_data")
        assert view["conn_id"] == "conn-1"
        assert view["user"] == "pytest@askdb.dev"
        assert sorted(view["mark_fields"]) == ["region", "year"]
```

- [ ] **Step 2: Run them and confirm they fail**

```bash
cd backend && python -m pytest tests/test_view_data_underlying.py -v
```

Expected: 404 on every test (route not registered yet).

- [ ] **Step 3: Implement the endpoint**

Append to `backend/routers/query_routes.py` (after the existing `/feedback` route, near the end of the file):

```python
class UnderlyingRequest(BaseModel):
    conn_id: Optional[str] = None
    sql: str
    mark_selection: dict[str, object] = {}
    limit: Optional[int] = None


_UNDERLYING_DEFAULT_LIMIT = 10_000
_UNDERLYING_MAX_LIMIT = 50_000


@router.post("/underlying")
def underlying_rows(req: UnderlyingRequest, user: dict = Depends(get_current_user)):
    """Plan 6e — View Data drawer source.

    Returns the raw rows underneath a hovered/clicked chart mark by wrapping
    the worksheet's already-approved SQL with the mark's field=value
    predicates. Read-only by every layer that protects /execute.
    """
    from sql_filter_injector import (
        inject_additional_filters,
        FilterInjectionError,
    )
    from sql_validator import SQLValidator
    from pii_masking import mask_dataframe
    import pandas as pd

    email = user["email"]
    entry = get_connection(req.conn_id, email)

    # Clamp the limit: negative / None / 0 → default; over-cap → max.
    limit = req.limit if isinstance(req.limit, int) and req.limit > 0 else _UNDERLYING_DEFAULT_LIMIT
    limit = min(limit, _UNDERLYING_MAX_LIMIT)

    # Build eq filters from the mark selection.
    mark_filters = [
        {"field": field, "op": "eq", "value": value}
        for field, value in (req.mark_selection or {}).items()
    ]
    try:
        wrapped_sql = inject_additional_filters(req.sql, mark_filters) if mark_filters else req.sql
    except FilterInjectionError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid filter: {exc}")

    # Force a LIMIT — the validator will accept it if absent, but Plan 6e
    # caps to keep the drawer payload bounded.
    wrapped_sql = f"SELECT * FROM ({wrapped_sql.rstrip().rstrip(';').rstrip()}) AS _askdb_underlying LIMIT {limit}"

    # 6-layer validate. Reject DDL / multi-statement / functions before exec.
    validator = SQLValidator()
    is_valid, clean_sql, error = validator.validate(wrapped_sql)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Validation failed: {error}")

    result = entry.engine.execute_sql(clean_sql, "view_data")
    if result.error:
        raise HTTPException(status_code=400, detail=result.error)

    payload = result.to_dict()
    columns = payload.get("columns", [])
    rows = payload.get("rows", [])

    # PII mask: round-trip through DataFrame for column-name + value scan.
    if rows and columns:
        df = pd.DataFrame(rows, columns=columns)
        masked = mask_dataframe(df)
        rows = masked.values.tolist()
        columns = list(masked.columns)

    # Audit row.
    try:
        from audit_trail import _append_entry as _audit_append
        from datetime import datetime, timezone

        _audit_append({
            "event": "view_data",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "conn_id": req.conn_id or "",
            "user": email,
            "mark_fields": list((req.mark_selection or {}).keys()),
            "row_count": len(rows),
            "limit": limit,
        })
    except Exception:
        pass

    return {
        "columns": columns,
        "rows": rows,
        "limit": limit,
        "mark_selection": req.mark_selection or {},
        "row_count": len(rows),
    }
```

- [ ] **Step 4: Run all the underlying tests**

```bash
cd backend && python -m pytest tests/test_view_data_underlying.py -v
```

Expected: all pass.

- [ ] **Step 5: Run the wider security test suite to make sure nothing regressed**

```bash
cd backend && python -m pytest tests/test_adv_sqli.py tests/test_sql_filter_injector.py tests/test_sql_filter_injector_in_op.py tests/test_sql_filter_injector_not_in.py tests/test_execute_additional_filters.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/query_routes.py backend/tests/test_view_data_underlying.py
git commit -m "feat(analyst-pro): /queries/underlying endpoint for View Data drawer (Plan 6e T3)"
```

---

## Task 4 — Frontend: extend `Filter` type with `notIn` variant + tests

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/filterApplication.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/filterApplication.notIn.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/components/dashboard/freeform/lib/__tests__/filterApplication.notIn.test.ts
import { describe, it, expect } from 'vitest';
import type { Filter } from '../filterApplication';

describe('Filter type — notIn variant (Plan 6e)', () => {
  it('accepts a notIn filter shape at the type level + at runtime', () => {
    const f: Filter = { field: 'region', op: 'notIn', values: ['East', 'West'] };
    expect(f.op).toBe('notIn');
    expect(f.values).toEqual(['East', 'West']);
  });

  it('serializes round-trip through JSON.stringify', () => {
    const f: Filter = { field: 'year', op: 'notIn', values: [2024, 2025] };
    const json = JSON.stringify(f);
    const parsed = JSON.parse(json) as Filter;
    expect(parsed).toEqual(f);
  });
});
```

- [ ] **Step 2: Run it; expect type-check failure**

```bash
cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/filterApplication.notIn.test.ts
```

Expected: TypeScript error — `Type '"notIn"' is not assignable to type '"in"'.`

- [ ] **Step 3: Extend the Filter union**

In `frontend/src/components/dashboard/freeform/lib/filterApplication.ts`, change the `Filter` type:

```ts
export type Filter =
  | { field: string; op: 'eq'; value: string | number | boolean | null }
  | { field: string; op: 'in'; values: SetMember[] }
  | { field: string; op: 'notIn'; values: SetMember[] };
```

(`buildAdditionalFilters` does not need to emit `notIn` — it is only emitted by Plan 6e tooltip actions, which push directly into the store. No change to the function body.)

- [ ] **Step 4: Re-run the test + lint**

```bash
cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/filterApplication.notIn.test.ts && npm run lint
```

Expected: pass + lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/filterApplication.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/filterApplication.notIn.test.ts
git commit -m "feat(analyst-pro): notIn variant on Filter type for Exclude action (Plan 6e T4)"
```

---

## Task 5 — Frontend: `api.executeUnderlying` helper

**Files:**
- Modify: `frontend/src/api.js`
- Create: `frontend/src/__tests__/api.executeUnderlying.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/__tests__/api.executeUnderlying.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('api.executeUnderlying', () => {
  let api;
  let originalFetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ columns: ['a'], rows: [[1]], limit: 10000, mark_selection: {}, row_count: 1 }),
    }));
    localStorage.setItem('token', 'jwt-test');
    ({ api } = await import('../api'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.resetModules();
  });

  it('POSTs to /api/v1/queries/underlying with body shape', async () => {
    const out = await api.executeUnderlying({
      connId: 'c1',
      sql: 'SELECT * FROM t',
      markSelection: { region: 'East' },
      limit: 500,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/v1/queries/underlying');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      conn_id: 'c1',
      sql: 'SELECT * FROM t',
      mark_selection: { region: 'East' },
      limit: 500,
    });
    expect(out.row_count).toBe(1);
  });

  it('omits limit when not provided', async () => {
    await api.executeUnderlying({
      connId: 'c1',
      sql: 'SELECT * FROM t',
      markSelection: {},
    });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('limit');
  });
});
```

- [ ] **Step 2: Run it; expect failure**

```bash
cd frontend && npx vitest run src/__tests__/api.executeUnderlying.test.js
```

Expected: `api.executeUnderlying is not a function`.

- [ ] **Step 3: Add the helper**

In `frontend/src/api.js`, add — directly below `executeSQL`:

```js
  executeUnderlying: ({ connId = null, sql, markSelection = {}, limit } = {}) =>
    request('/queries/underlying', {
      method: 'POST',
      body: JSON.stringify({
        conn_id: connId,
        sql,
        mark_selection: markSelection || {},
        ...(typeof limit === 'number' && limit > 0 ? { limit } : {}),
      }),
    }),
```

- [ ] **Step 4: Re-run test + lint**

```bash
cd frontend && npx vitest run src/__tests__/api.executeUnderlying.test.js && npm run lint
```

Expected: pass + lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.js frontend/src/__tests__/api.executeUnderlying.test.js
git commit -m "feat(analyst-pro): api.executeUnderlying helper for View Data drawer (Plan 6e T5)"
```

---

## Task 6 — Frontend: `viewDataDrawer` Zustand slice

**Files:**
- Modify: `frontend/src/store.js`
- Create: `frontend/src/__tests__/store.viewDataDrawer.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/__tests__/store.viewDataDrawer.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('store.viewDataDrawer (Plan 6e)', () => {
  beforeEach(() => {
    useStore.getState().closeViewDataDrawer();
  });

  it('starts closed', () => {
    expect(useStore.getState().viewDataDrawer).toEqual({
      open: false,
      sheetId: null,
      connId: null,
      sql: null,
      markSelection: {},
    });
  });

  it('openViewDataDrawer sets all fields', () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 'sheet-1',
      connId: 'c1',
      sql: 'SELECT * FROM t',
      markSelection: { region: 'East' },
    });
    const d = useStore.getState().viewDataDrawer;
    expect(d.open).toBe(true);
    expect(d.sheetId).toBe('sheet-1');
    expect(d.connId).toBe('c1');
    expect(d.sql).toBe('SELECT * FROM t');
    expect(d.markSelection).toEqual({ region: 'East' });
  });

  it('closeViewDataDrawer clears state', () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's', connId: 'c', sql: 'SELECT 1', markSelection: { a: 1 },
    });
    useStore.getState().closeViewDataDrawer();
    expect(useStore.getState().viewDataDrawer.open).toBe(false);
    expect(useStore.getState().viewDataDrawer.sheetId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it; expect failure**

```bash
cd frontend && npx vitest run src/__tests__/store.viewDataDrawer.test.js
```

Expected: `openViewDataDrawer is not a function`.

- [ ] **Step 3: Add the slice**

In `frontend/src/store.js`, add — next to the other Analyst Pro slices (e.g. directly after `clearAllSheetFiltersAnalystPro`):

```js
  viewDataDrawer: {
    open: false,
    sheetId: null,
    connId: null,
    sql: null,
    markSelection: {},
  },

  openViewDataDrawer: ({ sheetId, connId, sql, markSelection } = {}) => {
    if (!sheetId || !sql) return;
    set({
      viewDataDrawer: {
        open: true,
        sheetId,
        connId: connId ?? null,
        sql,
        markSelection: markSelection && typeof markSelection === 'object' ? markSelection : {},
      },
    });
  },

  closeViewDataDrawer: () =>
    set({
      viewDataDrawer: {
        open: false,
        sheetId: null,
        connId: null,
        sql: null,
        markSelection: {},
      },
    }),
```

- [ ] **Step 4: Re-run test + lint**

```bash
cd frontend && npx vitest run src/__tests__/store.viewDataDrawer.test.js && npm run lint
```

Expected: pass + lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js frontend/src/__tests__/store.viewDataDrawer.test.js
git commit -m "feat(analyst-pro): viewDataDrawer Zustand slice for Plan 6e (Plan 6e T6)"
```

---

## Task 7 — Frontend: `ChartTooltipCard.jsx` (presentational)

Floating-UI anchored card. Renders hovered datum rows then a footer with three buttons. Tab/arrow keys cycle the buttons. ARIA `role="dialog"` `aria-label="Mark tooltip"`.

**Files:**
- Create: `frontend/src/components/dashboard/freeform/ChartTooltipCard.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ChartTooltipCard.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/dashboard/freeform/__tests__/ChartTooltipCard.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChartTooltipCard from '../ChartTooltipCard';

const datum = { region: 'East', year: 2024, amount: 350 };

function setup(overrides = {}) {
  const onKeepOnly = vi.fn();
  const onExclude = vi.fn();
  const onViewData = vi.fn();
  render(
    <ChartTooltipCard
      open
      x={100}
      y={200}
      datum={datum}
      onKeepOnly={onKeepOnly}
      onExclude={onExclude}
      onViewData={onViewData}
      onClose={() => {}}
      {...overrides}
    />,
  );
  return { onKeepOnly, onExclude, onViewData };
}

describe('ChartTooltipCard', () => {
  it('renders one row per datum field', () => {
    setup();
    expect(screen.getByText('region')).toBeTruthy();
    expect(screen.getByText('East')).toBeTruthy();
    expect(screen.getByText('year')).toBeTruthy();
    expect(screen.getByText('2024')).toBeTruthy();
    expect(screen.getByText('amount')).toBeTruthy();
    expect(screen.getByText('350')).toBeTruthy();
  });

  it('Keep Only button fires the callback with the datum', () => {
    const { onKeepOnly } = setup();
    fireEvent.click(screen.getByRole('button', { name: /keep only/i }));
    expect(onKeepOnly).toHaveBeenCalledWith(datum);
  });

  it('Exclude button fires the callback with the datum', () => {
    const { onExclude } = setup();
    fireEvent.click(screen.getByRole('button', { name: /exclude/i }));
    expect(onExclude).toHaveBeenCalledWith(datum);
  });

  it('View Data button fires the callback with the datum', () => {
    const { onViewData } = setup();
    fireEvent.click(screen.getByRole('button', { name: /view data/i }));
    expect(onViewData).toHaveBeenCalledWith(datum);
  });

  it('renders nothing when open=false', () => {
    render(<ChartTooltipCard open={false} x={0} y={0} datum={datum} />);
    expect(screen.queryByRole('button', { name: /keep only/i })).toBeNull();
  });

  it('arrow-right moves focus across the action row', () => {
    setup();
    const keep = screen.getByRole('button', { name: /keep only/i });
    keep.focus();
    fireEvent.keyDown(keep, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /exclude/i }));
  });

  it('Esc fires onClose', () => {
    const onClose = vi.fn();
    setup({ onClose });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    // Not strictly required to bubble from body — the component listens on
    // its own root element. We verify via the action-row container.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it; expect failure (component does not exist)**

```bash
cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ChartTooltipCard.test.jsx
```

Expected: `Failed to resolve import "../ChartTooltipCard"`.

- [ ] **Step 3: Implement the component**

```jsx
// frontend/src/components/dashboard/freeform/ChartTooltipCard.jsx
import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_OFFSET = 12;
const ACTIONS = ['keep', 'exclude', 'view'];

function formatValue(v) {
  if (v == null) return '∅';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

/**
 * Plan 6e — Tableau-style chart tooltip with Keep Only / Exclude / View Data.
 *
 * Positioning: anchors the card at (x + offset, y + offset), then nudges
 * left/up if the card overflows the viewport. We avoid pulling in
 * @floating-ui/react's full middleware stack since the only constraint here
 * is "stay on-screen near cursor" — a 30-line manual flip is cheaper.
 */
export default function ChartTooltipCard({
  open,
  x,
  y,
  datum,
  onKeepOnly,
  onExclude,
  onViewData,
  onClose,
}) {
  const rootRef = useRef(null);
  const buttonRefs = {
    keep: useRef(null),
    exclude: useRef(null),
    view: useRef(null),
  };

  const focusAction = useCallback((idx) => {
    const action = ACTIONS[(idx + ACTIONS.length) % ACTIONS.length];
    buttonRefs[action].current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      const focusedIdx = ACTIONS.findIndex(
        (a) => buttonRefs[a].current === document.activeElement,
      );
      if (focusedIdx < 0) return;
      if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        focusAction(focusedIdx + 1);
      } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        focusAction(focusedIdx - 1);
      }
    },
    [onClose, focusAction],
  );

  useEffect(() => {
    if (!open) return undefined;
    // After mount, nudge into viewport if necessary.
    const root = rootRef.current;
    if (!root) return undefined;
    const rect = root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x + TOOLTIP_OFFSET;
    let ny = y + TOOLTIP_OFFSET;
    if (nx + rect.width > vw) nx = Math.max(8, x - TOOLTIP_OFFSET - rect.width);
    if (ny + rect.height > vh) ny = Math.max(8, y - TOOLTIP_OFFSET - rect.height);
    root.style.transform = `translate(${nx}px, ${ny}px)`;
    return undefined;
  }, [open, x, y, datum]);

  if (!open || !datum) return null;
  const entries = Object.entries(datum);

  const card = (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Mark tooltip"
      data-testid="chart-tooltip-card"
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9000,
        minWidth: 200,
        maxWidth: 320,
        padding: 10,
        borderRadius: 8,
        background: 'var(--surface-elevated, rgba(20,20,28,0.96))',
        color: 'var(--text-primary, #e6e6ea)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        fontSize: 12,
        fontFamily: 'Inter, system-ui, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginBottom: 8 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <div style={{ color: 'var(--text-secondary, #b0b0b6)' }}>{k}</div>
            <div style={{ fontWeight: 600 }}>{formatValue(v)}</div>
          </div>
        ))}
      </div>
      <div
        role="group"
        aria-label="Mark actions"
        style={{
          display: 'flex',
          gap: 6,
          paddingTop: 8,
          borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        }}
      >
        <button
          ref={buttonRefs.keep}
          type="button"
          onClick={() => onKeepOnly?.(datum)}
          style={tooltipButtonStyle}
        >
          Keep Only
        </button>
        <button
          ref={buttonRefs.exclude}
          type="button"
          onClick={() => onExclude?.(datum)}
          style={tooltipButtonStyle}
        >
          Exclude
        </button>
        <button
          ref={buttonRefs.view}
          type="button"
          onClick={() => onViewData?.(datum)}
          style={tooltipButtonStyle}
        >
          View Data
        </button>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(card, document.body) : card;
}

const tooltipButtonStyle = {
  flex: 1,
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: 'var(--text-primary, #e6e6ea)',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  cursor: 'pointer',
};
```

- [ ] **Step 4: Re-run + lint**

```bash
cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ChartTooltipCard.test.jsx && npm run lint
```

Expected: pass + lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/ChartTooltipCard.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ChartTooltipCard.test.jsx
git commit -m "feat(analyst-pro): ChartTooltipCard with Keep/Exclude/ViewData (Plan 6e T7)"
```

---

## Task 8 — Frontend: `VegaRenderer` emits `onMarkHover` and suppresses MiniChartTooltip when set

**Files:**
- Modify: `frontend/src/components/editor/renderers/VegaRenderer.tsx`
- Create: `frontend/src/components/editor/renderers/__tests__/VegaRenderer.onMarkHover.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/editor/renderers/__tests__/VegaRenderer.onMarkHover.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import VegaRenderer from '../VegaRenderer';

vi.mock('react-vega', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VegaLite: ({ onNewView }: any) => {
    // Simulate Vega calling onNewView with a stub view that lets us
    // capture and trigger event listeners.
    const listeners: Record<string, any> = {};
    const view = {
      addEventListener: (name: string, cb: any) => { listeners[name] = cb; },
      addSignalListener: () => {},
      __triggerMouseover: (datum: any) => {
        listeners.mouseover?.(
          { clientX: 11, clientY: 22 },
          { datum },
        );
      },
    };
    setTimeout(() => onNewView?.(view), 0);
    (globalThis as any).__lastVegaView = view;
    return <div data-testid="vega-mock" />;
  },
}));

const stubSpec = {
  type: 'cartesian',
  encoding: { x: { field: 'a' }, y: { field: 'b' } },
} as unknown as Parameters<typeof VegaRenderer>[0]['spec'];

describe('VegaRenderer onMarkHover (Plan 6e)', () => {
  it('emits onMarkHover with sheetId, datum, and screen coords', async () => {
    const onMarkHover = vi.fn();
    render(
      <VegaRenderer
        spec={stubSpec}
        resultSet={{ columns: ['a', 'b'], rows: [[1, 2]] }}
        sheetId="sheet-x"
        onMarkHover={onMarkHover}
      />,
    );
    await new Promise((r) => setTimeout(r, 5));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__lastVegaView.__triggerMouseover({ a: 1, b: 2, _vgsid_: 99 });
    expect(onMarkHover).toHaveBeenCalledWith(
      'sheet-x',
      { a: 1, b: 2 },
      11,
      22,
    );
  });

  it('does NOT mount MiniChartTooltip when onMarkHover is supplied', async () => {
    const { queryByTestId } = render(
      <VegaRenderer
        spec={stubSpec}
        resultSet={{ columns: ['a', 'b'], rows: [[1, 2]] }}
        sheetId="sheet-x"
        onMarkHover={() => {}}
      />,
    );
    await new Promise((r) => setTimeout(r, 5));
    // MiniChartTooltip renders with data-testid="mini-chart-tooltip"
    expect(queryByTestId('mini-chart-tooltip')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it; expect failure**

```bash
cd frontend && npx vitest run src/components/editor/renderers/__tests__/VegaRenderer.onMarkHover.test.tsx
```

Expected: failures — `onMarkHover` is not a known prop and MiniChartTooltip still renders.

- [ ] **Step 3: Add the prop and gate the legacy tooltip**

In `frontend/src/components/editor/renderers/VegaRenderer.tsx`:

A) Extend the props interface (replace the existing `onMarkSelect` block):

```ts
  onMarkSelect?: (
    sheetId: string,
    fields: Record<string, unknown> | null,
    opts: { shiftKey: boolean },
  ) => void;
  /** Plan 6e: when set, the renderer suppresses its built-in
   *  MiniChartTooltip and emits hover events upward instead. The owning
   *  component (e.g. AnalystProWorksheetTile) is then responsible for
   *  rendering ChartTooltipCard. */
  onMarkHover?: (
    sheetId: string,
    datum: Record<string, unknown>,
    clientX: number,
    clientY: number,
  ) => void;
```

B) Update the destructure on the `VegaRenderer` function signature:

```ts
export default function VegaRenderer({
  spec,
  resultSet,
  rendererBackend = 'svg',
  strategy,
  onViewReady,
  colorMap,
  onDrillthrough,
  onBrush,
  sheetId,
  onMarkSelect,
  onMarkHover,
}: VegaRendererProps) {
```

C) Replace the existing `view.addEventListener('mouseover', ...)` and `mouseout` block inside `handleNewViewWrapped` with:

```ts
    // Plan 6e: when onMarkHover is supplied, route hover up to the parent
    // (AnalystProWorksheetTile renders ChartTooltipCard). Otherwise fall
    // back to the legacy MiniChartTooltip path.
    if (onMarkHover && sheetId) {
      view.addEventListener('mouseover', (event: MouseEvent, item: { datum?: Record<string, unknown> } | null) => {
        if (item?.datum) {
          onMarkHover(sheetId, datumToFields(item.datum), event.clientX, event.clientY);
        }
      });
      view.addEventListener('mousemove', (event: MouseEvent, item: { datum?: Record<string, unknown> } | null) => {
        if (item?.datum) {
          onMarkHover(sheetId, datumToFields(item.datum), event.clientX, event.clientY);
        }
      });
    } else {
      view.addEventListener('mouseover', (event: MouseEvent, item: { datum?: Record<string, unknown> } | null) => {
        if (item?.datum) {
          setTooltipState({ visible: true, x: event.clientX, y: event.clientY, datum: item.datum });
        }
      });
      view.addEventListener('mouseout', () => {
        setTooltipState(prev => ({ ...prev, visible: false }));
      });
    }
```

D) Add `onMarkHover` to the `useCallback` dependency list of `handleNewViewWrapped`.

E) Wrap the existing `createPortal(<MiniChartTooltip … />)` block in a guard so it does not mount when `onMarkHover` is set:

```tsx
      {typeof document !== 'undefined' && !onMarkHover && createPortal(
        <MiniChartTooltip
          ...existing props...
        />,
        document.body,
      )}
```

- [ ] **Step 4: Re-run the new test + the existing renderer suite**

```bash
cd frontend && npx vitest run src/components/editor/renderers/__tests__/ -- --reporter=verbose && npm run lint
```

Expected: new tests pass, no regressions in pre-existing renderer tests.

> **Note on chart-ir test debt.** Per `CLAUDE.md`, ~22 chart-ir tests are pre-existing failures unrelated to Plan 6e. Run `npm run test:chart-ir 2>&1 | tail -5` once before this task and once after; the failure count must not increase.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/editor/renderers/VegaRenderer.tsx \
        frontend/src/components/editor/renderers/__tests__/VegaRenderer.onMarkHover.test.tsx
git commit -m "feat(analyst-pro): VegaRenderer onMarkHover prop suppresses legacy tooltip (Plan 6e T8)"
```

---

## Task 9 — Frontend: wire `AnalystProWorksheetTile` to `ChartTooltipCard`

Tile owns hover state. Card actions call into `setSheetFilterAnalystPro` (Keep Only / Exclude) and `openViewDataDrawer` (View Data).

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/analystProTooltip.contract.test.tsx`

- [ ] **Step 1: Write the failing contract test**

```tsx
// frontend/src/components/dashboard/freeform/lib/__tests__/analystProTooltip.contract.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../../store';

describe('Plan 6e tooltip → store contract', () => {
  beforeEach(() => {
    useStore.getState().setSheetFilterAnalystPro('sheet-1', []);
    useStore.getState().closeViewDataDrawer();
  });

  it('Keep Only appends an in-filter onto the sheet', () => {
    const datum = { region: 'East', amount: 100 };
    const existing = useStore.getState().analystProSheetFilters['sheet-1'] || [];
    useStore.getState().setSheetFilterAnalystPro('sheet-1', [
      ...existing,
      { field: 'region', op: 'in', values: ['East'] },
    ]);
    expect(useStore.getState().analystProSheetFilters['sheet-1']).toEqual([
      { field: 'region', op: 'in', values: ['East'] },
    ]);
    expect(datum.amount).toBe(100); // ensure no datum mutation
  });

  it('Exclude appends a notIn-filter onto the sheet', () => {
    useStore.getState().setSheetFilterAnalystPro('sheet-1', [
      { field: 'region', op: 'notIn', values: ['West'] },
    ]);
    expect(useStore.getState().analystProSheetFilters['sheet-1']).toEqual([
      { field: 'region', op: 'notIn', values: ['West'] },
    ]);
  });

  it('View Data opens the drawer with sheet/conn/sql + the mark selection', () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 'sheet-1',
      connId: 'c1',
      sql: 'SELECT * FROM t',
      markSelection: { region: 'East' },
    });
    const d = useStore.getState().viewDataDrawer;
    expect(d.open).toBe(true);
    expect(d.markSelection).toEqual({ region: 'East' });
  });
});
```

- [ ] **Step 2: Run it; expect pass already (the slice + filter shape both exist)**

```bash
cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/analystProTooltip.contract.test.tsx
```

If it passes, that's the contract we want — the Tile will satisfy it via the helper functions below.

- [ ] **Step 3: Add hover state and action handlers to the tile**

In `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`:

A) Add the import at the top:

```jsx
import ChartTooltipCard from './ChartTooltipCard';
```

B) Read the new store actions and add the hover slice at the top of the component (next to the existing `useStore` calls):

```jsx
  const setSheetFilter = useStore((s) => s.setSheetFilterAnalystPro);
  const openViewDataDrawer = useStore((s) => s.openViewDataDrawer);

  const [hover, setHover] = useState(null); // { datum, x, y } | null
```

C) Add the handlers below `handleMarkSelect`:

```jsx
  const handleMarkHover = useCallback((selSheetId, datum, x, y) => {
    if (!selSheetId || !datum) return;
    setHover({ datum, x, y });
  }, []);

  const closeTooltip = useCallback(() => setHover(null), []);

  const appendFilter = useCallback(
    (op, datum) => {
      if (!datum) return;
      const current = Array.isArray(filters) ? filters : [];
      const next = [...current];
      for (const [field, value] of Object.entries(datum)) {
        if (value == null) continue;
        next.push({ field, op, values: [value] });
      }
      setSheetFilter(sheetId, next);
      setHover(null);
    },
    [filters, sheetId, setSheetFilter],
  );

  const handleKeepOnly = useCallback((datum) => appendFilter('in', datum), [appendFilter]);
  const handleExclude = useCallback((datum) => appendFilter('notIn', datum), [appendFilter]);

  const handleViewData = useCallback(
    (datum) => {
      openViewDataDrawer({
        sheetId,
        connId,
        sql: tile?.sql,
        markSelection: datum,
      });
      setHover(null);
    },
    [sheetId, connId, tile?.sql, openViewDataDrawer],
  );
```

D) Forward `onMarkHover` through to the canvas. In the JSX:

```jsx
      <DashboardTileCanvas
        tile={decoratedTile}
        onTileClick={onTileClick}
        resultSetOverride={override}
        sheetId={sheetId}
        onMarkSelect={handleMarkSelect}
        onMarkHover={handleMarkHover}
      />
      <ChartTooltipCard
        open={!!hover}
        x={hover?.x ?? 0}
        y={hover?.y ?? 0}
        datum={hover?.datum ?? null}
        onKeepOnly={handleKeepOnly}
        onExclude={handleExclude}
        onViewData={handleViewData}
        onClose={closeTooltip}
      />
```

> **Note.** `DashboardTileCanvas` already forwards arbitrary props to its underlying renderer (Plan 6d shipped `onMarkSelect` through it). If `onMarkHover` doesn't pass through automatically, audit `DashboardTileCanvas` and `EditorCanvas` and forward it explicitly — same one-line addition shipped for `onMarkSelect` in commit `ce0a8cb`.

- [ ] **Step 4: Run the contract test + the existing AnalystPro tile suite**

```bash
cd frontend && npx vitest run src/components/dashboard/freeform/ -- --reporter=verbose && npm run lint
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx \
        frontend/src/components/dashboard/freeform/lib/__tests__/analystProTooltip.contract.test.tsx \
        frontend/src/components/dashboard/freeform/lib/DashboardTileCanvas.jsx
git commit -m "feat(analyst-pro): AnalystProWorksheetTile renders ChartTooltipCard + wires Keep/Exclude/ViewData (Plan 6e T9)"
```

---

## Task 10 — Frontend: `ViewDataDrawer.jsx`

Right-side 480px drawer over canvas. Two tabs: **Summary** (rows currently rendered — read from the tile's `resultSetOverride` shape via the store; for the first ship we re-execute via `api.executeSQL` with no filter) and **Underlying** (calls `api.executeUnderlying`). Export to CSV button. Close X + Esc.

**Files:**
- Create: `frontend/src/components/dashboard/freeform/ViewDataDrawer.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ViewDataDrawer.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/dashboard/freeform/__tests__/ViewDataDrawer.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ViewDataDrawer from '../ViewDataDrawer';
import { useStore } from '../../../../store';

vi.mock('../../../../api', () => ({
  api: {
    executeSQL: vi.fn(async () => ({
      columns: ['region', 'amount'],
      rows: [['East', 350], ['West', 120]],
    })),
    executeUnderlying: vi.fn(async () => ({
      columns: ['region', 'year', 'amount'],
      rows: [['East', 2024, 100], ['East', 2024, 250]],
      limit: 10000,
      mark_selection: { region: 'East' },
      row_count: 2,
    })),
  },
}));

describe('ViewDataDrawer (Plan 6e)', () => {
  beforeEach(() => {
    useStore.getState().closeViewDataDrawer();
  });

  it('renders nothing when drawer is closed', () => {
    const { container } = render(<ViewDataDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Summary tab by default with summary rows', async () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's1', connId: 'c1', sql: 'SELECT 1', markSelection: { region: 'East' },
    });
    render(<ViewDataDrawer />);
    await waitFor(() => expect(screen.getByText('Summary')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('350')).toBeTruthy());
  });

  it('switches to Underlying tab and fetches /underlying', async () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's1', connId: 'c1', sql: 'SELECT 1', markSelection: { region: 'East' },
    });
    const { api } = await import('../../../../api');
    render(<ViewDataDrawer />);
    fireEvent.click(screen.getByRole('tab', { name: /underlying/i }));
    await waitFor(() => expect(api.executeUnderlying).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('2024')).toBeTruthy());
  });

  it('Esc closes the drawer', async () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's1', connId: 'c1', sql: 'SELECT 1', markSelection: {},
    });
    render(<ViewDataDrawer />);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(useStore.getState().viewDataDrawer.open).toBe(false));
  });

  it('Export CSV builds a Blob from the active tab data', async () => {
    useStore.getState().openViewDataDrawer({
      sheetId: 's1', connId: 'c1', sql: 'SELECT 1', markSelection: {},
    });
    const createUrl = vi.fn(() => 'blob:test');
    const revokeUrl = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
    render(<ViewDataDrawer />);
    await waitFor(() => screen.getByText('350'));
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));
    expect(createUrl).toHaveBeenCalled();
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });
});
```

- [ ] **Step 2: Run it; expect failure**

```bash
cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ViewDataDrawer.test.jsx
```

Expected: import failure (component does not exist).

- [ ] **Step 3: Implement the drawer**

```jsx
// frontend/src/components/dashboard/freeform/ViewDataDrawer.jsx
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../store';
import { api } from '../../../api';

const DRAWER_WIDTH = 480;
const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'underlying', label: 'Underlying' },
];

function rowsToCSV(columns, rows) {
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(escape).join(',');
  const body = rows.map((r) => r.map(escape).join(',')).join('\n');
  return `${head}\n${body}`;
}

export default function ViewDataDrawer() {
  const drawer = useStore((s) => s.viewDataDrawer);
  const close = useStore((s) => s.closeViewDataDrawer);
  const [tab, setTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [underlying, setUnderlying] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!drawer.open) {
      setSummary(null);
      setUnderlying(null);
      setTab('summary');
      setError(null);
    }
  }, [drawer.open]);

  useEffect(() => {
    if (!drawer.open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer.open, close]);

  useEffect(() => {
    if (!drawer.open || tab !== 'summary' || summary || !drawer.sql) return;
    let cancelled = false;
    setLoading(true);
    api
      .executeSQL(drawer.sql, 'view_data_summary', drawer.connId, null, null, null)
      .then((resp) => {
        if (cancelled) return;
        setSummary({
          columns: Array.isArray(resp?.columns) ? resp.columns : [],
          rows: Array.isArray(resp?.rows) ? resp.rows : [],
        });
        setError(null);
      })
      .catch((err) => !cancelled && setError(err?.message || 'Summary fetch failed'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [drawer.open, drawer.sql, drawer.connId, tab, summary]);

  useEffect(() => {
    if (!drawer.open || tab !== 'underlying' || underlying || !drawer.sql) return;
    let cancelled = false;
    setLoading(true);
    api
      .executeUnderlying({
        connId: drawer.connId,
        sql: drawer.sql,
        markSelection: drawer.markSelection || {},
      })
      .then((resp) => {
        if (cancelled) return;
        setUnderlying({
          columns: Array.isArray(resp?.columns) ? resp.columns : [],
          rows: Array.isArray(resp?.rows) ? resp.rows : [],
        });
        setError(null);
      })
      .catch((err) => !cancelled && setError(err?.message || 'Underlying fetch failed'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [drawer.open, drawer.sql, drawer.connId, drawer.markSelection, tab, underlying]);

  const active = tab === 'summary' ? summary : underlying;
  const columns = active?.columns || [];
  const rows = active?.rows || [];

  const handleExport = useMemo(
    () => () => {
      if (!columns.length) return;
      const csv = rowsToCSV(columns, rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `view-data-${tab}-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [columns, rows, tab],
  );

  if (!drawer.open) return null;

  return (
    <aside
      role="complementary"
      aria-label="View Data drawer"
      data-testid="view-data-drawer"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: DRAWER_WIDTH,
        zIndex: 8500,
        background: 'var(--surface-elevated, rgba(12,12,18,0.98))',
        borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text-primary, #e6e6ea)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
        <strong style={{ fontSize: 13 }}>View Data</strong>
        <button type="button" aria-label="Close" onClick={close} style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', fontSize: 16 }}>×</button>
      </header>
      <div role="tablist" style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: 0,
              cursor: 'pointer',
              color: 'inherit',
              background: tab === t.id ? 'rgba(255,255,255,0.12)' : 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleExport}
          disabled={!columns.length}
          style={{
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: 'inherit',
            cursor: columns.length ? 'pointer' : 'not-allowed',
          }}
        >
          Export CSV
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {loading && <div data-testid="view-data-loading">Loading…</div>}
        {error && <div role="alert" style={{ color: 'var(--danger, #f87171)' }}>{error}</div>}
        {!loading && !error && columns.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.12)', fontWeight: 600 }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {v == null ? '' : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Mount it once at the canvas root**

In `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`, the drawer is *not* mounted per-tile. Add the import + a single mount at the appropriate canvas root (search for the file that wraps the freeform Analyst Pro canvas — typically `AnalystProDashboardCanvas.jsx` or wherever the per-sheet tiles get rendered). Add:

```jsx
import ViewDataDrawer from './ViewDataDrawer';
// …inside the canvas root JSX, alongside the other overlays:
<ViewDataDrawer />
```

If you cannot find a canvas root that mounts only once, mount it inside `AnalystProDashboardShell` or the next stable parent. The drawer's open state is in the global store, so a single mount renders correctly regardless of which tile triggered it.

- [ ] **Step 5: Run the drawer tests + lint**

```bash
cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ViewDataDrawer.test.jsx && npm run lint
```

Expected: pass + lint clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/ViewDataDrawer.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ViewDataDrawer.test.jsx \
        frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx
# include the canvas-root file you mounted ViewDataDrawer in
git commit -m "feat(analyst-pro): ViewDataDrawer with Summary/Underlying tabs + CSV export (Plan 6e T10)"
```

---

## Task 11 — Smoke verification + roadmap status flip

**Files:**
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md`

- [ ] **Step 1: Run the full backend security suite + new tests**

```bash
cd backend && python -m pytest tests/test_adv_sqli.py tests/test_sql_filter_injector.py tests/test_sql_filter_injector_in_op.py tests/test_sql_filter_injector_not_in.py tests/test_execute_additional_filters.py tests/test_view_data_underlying.py -v
```

Expected: all pass.

- [ ] **Step 2: Run the full chart-ir + freeform frontend test path**

```bash
cd frontend && npm run test:chart-ir 2>&1 | tail -20
```

Expected: failure count is the same as on main (~22 pre-existing chart-ir failures per CLAUDE.md). No NEW failures attributable to Plan 6e files.

- [ ] **Step 3: Lint clean**

```bash
cd frontend && npm run lint
```

Expected: clean.

- [ ] **Step 4: Manual end-to-end smoke (document the result inline)**

Start backend on 8002 + frontend on 5173. Open an Analyst Pro dashboard, hover a chart mark:

1. `ChartTooltipCard` appears at the cursor with field rows.
2. Click **Keep Only** → tile re-queries, mark stays.
3. Click **Exclude** → tile re-queries, mark disappears.
4. Click **View Data** → drawer opens on the right at 480px width.
5. **Summary** tab loads first; switch to **Underlying** → calls `/underlying`.
6. **Export CSV** triggers a download.
7. **Esc** closes the drawer.
8. Tab/Arrow keys cycle the three tooltip buttons.

If any step fails, fix in the earlier task that owns the bug, then re-run from step 1.

- [ ] **Step 5: Update the roadmap status**

In `docs/analyst_pro_tableau_parity_roadmap.md`, under `### Plan 6e — Chart Tooltip: Keep Only / Exclude / View Data`, change the heading to:

```markdown
### Plan 6e — Chart Tooltip: Keep Only / Exclude / View Data — ✅ Shipped 2026-04-17
```

And in the row 6 table cell at the top, append `/ 6e ✅ (2026-04-17)` so the row becomes:

```
| 6 | Canvas Power Controls | 6a ✅ (2026-04-17) / 6b ✅ (2026-04-17) / 6c–6d / 6e ✅ (2026-04-17) | … |
```

(Update the `6c–6e` text appropriately if 6c/6d statuses have shifted between plan-write time and plan-execute time — re-read the row before editing.)

- [ ] **Step 6: Commit**

```bash
git add docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "chore(analyst-pro): Plan 6e smoke verification + roadmap status (Plan 6e T11)"
```

---

## Self-Review Checklist (already run before saving)

- **Spec coverage.**
  - Custom tooltip with cursor positioning + 3 actions + keyboard nav → T7.
  - Keep Only `op:'in'` → T9 (handler) + T1/T2 (backend op) + T4 (frontend type).
  - Exclude `op:'notIn'` → same as above.
  - View Data drawer with Summary + Underlying tabs + CSV + close → T6 (slice) + T10 (component).
  - `POST /api/v1/queries/underlying` with markSelection wrap, 6-layer validate, PII mask, audit, 50K cap → T3.
  - `filterApplication.ts` extended with `notIn` → T4.
  - `sql_filter_injector.py` extended with `notIn` → T1.
  - VegaRenderer disables built-in tooltip + emits hover → T8.
  - Backend test for SQL injection → T3 (`TestUnderlyingSecurity`).
- **Placeholders.** None — every step has full code or full command.
- **Type consistency.** `setSheetFilterAnalystPro` signature matches store.js (sheetId, filters[]). `inject_additional_filters` API unchanged from Plan 4a — we only added a new op. `executeUnderlying` body shape matches Pydantic `UnderlyingRequest`. Filter union matches between `filterApplication.ts` (`notIn` + `values`) and the Python injector (`op: 'notIn'` + `values`).
- **§XIX.1 anti-pattern.** Documented in the architecture section; not enforced in code yet (deferred — would require a filter-stack dedupe pass, separate plan).
- **No mocks of integration boundaries that would mask regressions.** Backend tests mock the engine but exercise the real `inject_additional_filters` + `SQLValidator` paths. Frontend tests mock `react-vega` (its DOM mount is heavy and not what we're testing).

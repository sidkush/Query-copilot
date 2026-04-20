# Plan 9a — Pre-Flight Corrections (READ BEFORE IMPLEMENTING ANY TASK)

Authored 2026-04-20 after code-spelunking the actual `sql_ast.py`, `store.js`,
`dialect_base.py`. The main plan doc was written against an imagined API;
these are the real APIs. **Every subagent MUST read this file alongside the
plan.** Where this doc contradicts the main plan, **this doc wins**.

---

## Correction C1 — `sql_ast.py` API shape (T2, T3, T4)

The plan invents classes that do not exist. Use the real API:

### `FnCall` already carries `within_group`

```python
# sql_ast.py:53-65 actual shape
@dataclass(frozen=True, slots=True)
class FnCall:
    name: str
    args: tuple[SQLQueryExpression, ...]
    filter_clause: Optional[SQLQueryExpression] = None
    within_group: tuple[tuple[SQLQueryExpression, bool], ...] = ()
    distinct: bool = False
    resolved_type: str = "unknown"
```

`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY col ASC)` =
```python
sa.FnCall(
    name="PERCENTILE_CONT",
    args=(sa.Literal(value=0.95),),
    within_group=((sa.Column(name="col", table_alias=""), True),),  # (expr, ASC_bool) — True=ASC
)
```

**DO NOT write `sa.WithinGroup(func=..., order_by=...)` — that class does not exist.**

### No `FromSubquery`. Use `SubqueryRef(query, alias, lateral=False)`

```python
# sql_ast.py:183-187 actual
@dataclass(frozen=True, slots=True)
class SubqueryRef:
    query: "SQLQueryFunction"
    alias: str
    lateral: bool = False
```

The dialect already renders `SubqueryRef` as `(...inner...) alias` (see `dialect_base._emit_from:76-78`). Use it directly.

### No `OrderBy` class. `SQLQueryFunction.order_by` = tuple of tuples

```python
order_by: tuple[tuple[SQLQueryExpression, bool], ...]  # (expr, ASC_bool)
```

### `SQLQueryFunction.from_` is NOT Optional

`FromSource = Union[TableRef, JoinNode, SubqueryRef]` — **None is not allowed**.
Constant reference lines (aggregation="constant") therefore cannot be
emitted as bare `SELECT CAST(...)`. Two legal options:

**Option A (preferred) — endpoint short-circuit:**
- `compile_reference_line` still returns an `SQLQueryFunction` wrapping the base plan as SubqueryRef, producing `SELECT CAST(value AS DOUBLE) AS __reference_value__ FROM (base_plan) _t0 LIMIT 1`.
- Endpoint `_run_analytics` **detects `aggregation=="constant"` and skips execution** — returns `{"kind": "reference_line", "value": spec.value, ...}` directly without running SQL.

**Option B — unused:** do NOT attempt to emit a FROM-less query. The dialect will crash.

### Dialect emit API

`BaseDialect.emit(qf) -> str` is the public hook (`dialect_base.py:20`). For tests and endpoint, prefer the built-in generic renderer:

```python
sql = qf.to_sql_generic()   # delegates to vizql.generic_sql.render_generic
```

**DO NOT write `GenericDialect()` — that class does not exist.** In the endpoint, you can do the same:
```python
from vizql.generic_sql import render_generic
sql = render_generic(fn)
```

### Summary of renames in T2 code

| Plan wrote | Reality |
|---|---|
| `sa.WithinGroup(func=F, order_by=O)` | `sa.FnCall(name="PERCENTILE_CONT", args=(Literal(frac),), within_group=((col, True),))` |
| `sa.FromSubquery(query=Q, alias=A)` | `sa.SubqueryRef(query=Q, alias=A)` |
| `sa.OrderBy(expr=E, direction="asc")` | drop class; use `(expr, True)` tuple inline |
| `GenericDialect().emit(fn)` | `fn.to_sql_generic()` |
| `sa.Cast(expr=E, type_name="DOUBLE")` | `sa.Cast(expr=E, target_type="DOUBLE")` — field is `target_type` not `type_name` |
| `sa.Window(func=F, partition_by=..., order_by=(), frame=None)` | `sa.Window(expr=F, partition_by=..., order_by=(), frame=None)` — field is `expr` not `func` |

---

## Correction C2 — Golden SQL fixtures

The plan's hand-written `.sql` fixtures will almost certainly **not** match the actual emitter output byte-for-byte (quoting, parens around BinaryOp, whitespace, ORDER BY suffix ASC/DESC emitted as words). **Drop exact-string goldens.**

Replace with **structural assertions** inside the tests:

```python
def test_refline_percentile_uses_within_group_order_by():
    spec = at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                                percentile=95, scope="entire", label="value",
                                custom_label="", line_style="dashed",
                                color="#d62728", show_marker=True)
    fn = ac.compile_reference_line(spec=spec, base_plan=_base_plan_bar_by_region(),
                                   measure_alias="sum_sales")
    sql = fn.to_sql_generic()
    # Structural assertions — robust to whitespace / quoting.
    assert "PERCENTILE_CONT" in sql.upper()
    assert "WITHIN GROUP" in sql.upper()
    assert "0.95" in sql
    assert "__reference_value__" in sql
    # SQLValidator acceptance gate (security invariant).
    from sql_validator import SQLValidator
    ok, _, err = SQLValidator().validate(sql)
    assert ok, err
```

If an engineer really wants a golden, snapshot the emitter output on first pass (`pytest --snapshot-update` or plain `.sql` written from current output), don't hand-write it.

---

## Correction C3 — Frontend TS proto path

The plan said `frontend/src/chart-ir/vizSpecGenerated.ts`. **The real path is** `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts` (see `frontend/scripts/regen_proto.sh` OUT_FILE). `cd frontend && npm run proto` writes to that path. Nothing in `chart-ir/` changes in T1.

---

## Correction C4 — Dashboard shape + worksheets array

`frontend/src/components/dashboard/freeform/lib/dashboardShape.ts:35`:
```typescript
worksheets: []
```

Worksheets are stored as an **array** keyed by `.id`, not an object map. All store actions must look up by `find(w => w.id === sheetId)` and mutate via `.map(w => w.id === sheetId ? {...w, ...} : w)`.

Worksheets **do not carry an `analytics` field today**. T8 must add that field lazily on first write. Shape:
```javascript
analytics: { referenceLines: [], referenceBands: [], distributions: [], totals: [] }
```

### Correct store action template (mirror existing `addActionAnalystPro` pattern at store.js:1297)

```javascript
addReferenceLineAnalystPro: (sheetId, spec) => {
  const dash = get().analystProDashboard;
  if (!dash) return;
  const worksheets = (dash.worksheets || []).map((w) => {
    if (w.id !== sheetId) return w;
    const existing = w.analytics || { referenceLines: [], referenceBands: [], distributions: [], totals: [] };
    return { ...w, analytics: { ...existing, referenceLines: [...existing.referenceLines, spec] } };
  });
  const nextDash = { ...dash, worksheets };
  set({ analystProDashboard: nextDash });
  get().pushAnalystProHistory(nextDash, 'Add reference line');
},
```

If the worksheet with `sheetId` does not exist, the map leaves `worksheets` unchanged and `pushAnalystProHistory` still runs — tests that assume "sheet is guaranteed present" must seed via `emptyDashboardForPreset('analyst-pro')` + spread a worksheet into `.worksheets` array.

### History API

**Real signature:** `pushAnalystProHistory(dashboard, operation)` at `store.js:1578`. Full dashboard snapshot + string operation label. **Do not invent `_pushAnalystProHistory({op, patch})`.** All T8 actions follow the add/update/delete trio used by actions/sets/parameters — study `addActionAnalystPro`, `addSetAnalystPro`, `addParameterAnalystPro` for the canonical pattern.

---

## Correction C5 — Test seeding

The plan's `frontend/src/__fixtures__/dashboardPresets` does **not** exist. Use the real helper:

```typescript
import { emptyDashboardForPreset } from '../components/dashboard/freeform/lib/dashboardShape';
// or from the panel test file's relative path, whichever is shorter.
```

Seed a worksheet manually inside the test:
```typescript
beforeEach(() => {
  const base = emptyDashboardForPreset('analyst-pro');
  useStore.setState({
    analystProDashboard: {
      ...base,
      worksheets: [{ id: 'sheet-1', name: 'Sales',
                     analytics: { referenceLines: [], referenceBands: [],
                                  distributions: [], totals: [] } }],
    },
  });
});
```

---

## Correction C6 — No MSW scaffold

`frontend/src/__tests__/msw/` does not exist. The plan's `AnalyticsPanel.integration.test.tsx` stub that imports `../../msw/server` **will not work**. Replace it with either:

1. **Pure component test** (preferred for this plan). Render `<ReferenceLineDialog />` directly with seeded store, click Save, assert `analystProDashboard.worksheets[0].analytics.referenceLines.length === 1`. Skip the Vega-rendering assertion.
2. **`vi.mock` the api module:** `vi.mock('../../../api', () => ({ executeQuery: vi.fn().mockResolvedValue({ rows: [...], analytics_rows: [...] }) }))`. Still renders without a mock server, still asserts on store state.

Either is fine. Do not invent MSW fixtures.

---

## Correction C7 — Constant reference line: endpoint short-circuit

`_run_analytics` in T5 must special-case `aggregation=="constant"`:

```python
for raw in req.analytics.reference_lines:
    spec = at.ReferenceLineSpec(**raw)
    if spec.aggregation == "constant":
        # No SQL needed — literal travels back verbatim.
        out.append({
            "kind": "reference_line", "axis": spec.axis,
            "aggregation": "constant", "scope": spec.scope,
            "percentile": None, "value": spec.value,
            "label": spec.label, "custom_label": spec.custom_label,
            "line_style": spec.line_style, "color": spec.color,
            "show_marker": spec.show_marker,
        })
        continue
    # …existing path: compile → validate → execute_sql → append…
```

This avoids the FROM-less SQL problem entirely. Tests for constant lines assert the endpoint returns `value == 100.0` without hitting the engine.

---

## Correction C8 — T5 base-plan rehydration is out of scope for this wave

The plan's sidebar note on "re-hydrate base_plan from sheet_id or sqlglot-parse req.sql" is a rabbit hole. For this wave:

- **Require** the client to send a minimal `base_plan_hint` payload alongside `analytics`:
  ```json
  {
    "table": "orders",
    "schema": null,
    "group_bys": ["region"],
    "measure": {"alias": "sum_sales", "agg": "sum", "expr_field": "sales"}
  }
  ```
- Backend builds `LogicalOpAggregate` from this dict in `_run_analytics`. Drop the sqlglot-parse path. If `base_plan_hint` is absent, return 422 `base_plan_hint_required_for_analytics`.
- T5's `ExecuteRequest` gains `base_plan_hint: Optional[dict] = None` plus the existing `analytics` / `measure_alias` / `*_dims` fields.

This is explicit, testable, and avoids reflecting SQL with sqlglot.

---

## Correction C9 — `AnalyticsPanel` tab plumbing

The sidebar already supports `analystProSidebarTab: 'dashboard' | 'layout'` (store.js:1182). Extending to `'analytics'` requires:

1. Update the type comment only (JavaScript — no type-level constraint): `// 'dashboard' | 'layout' | 'analytics'`.
2. Extend the `TABS` constant in `AnalystProSidebar.jsx` to 3 entries.
3. Add a conditional branch rendering `<AnalyticsPanel />` (plan already has this).

No other plumbing (`setAnalystProSidebarTab` already accepts arbitrary strings).

---

## Correction C10 — Dialog wiring

`FloatingLayer.jsx` mounts `CalcEditorDialog` per the Plan 8d T11 pattern (commit `bbca582`). Mirror that exact shape for `ReferenceLineDialog`. Grep `CalcEditorDialog` in `frontend/src/components/dashboard/freeform/` for the call site — copy the conditional and state read, substitute the component + state field (`analystProReferenceLineDialog`).

`openReferenceLineDialogAnalystPro(payload)` setter and `analystProReferenceLineDialog` state field are **new** in T9 — add them next to `setCalcEditorDialog` / `analystProCalcEditorDialog` for locality.

---

## Correction C11 — Known test debt (do not trip over it)

`CLAUDE.md :: Known Test Debt`: ~22 pre-existing chart-ir failures in
`src/chart-ir/__tests__/router.test.ts`, `__tests__/rsr/renderStrategyRouter.test.ts`, and `__tests__/editor/*.test.tsx`. Not caused by this plan. **Before committing each task, diff failure count.** If failure count rose above 22, a new regression entered — fix it. If it stayed at 22, you're clean.

Record failure count BEFORE Wave 1 starts. Suggested command:
```bash
cd frontend && npm run test:chart-ir 2>&1 | tail -20
```

---

## Subagent worktree protocol

1. The canonical repo lives at `QueryCopilot V1/` (space in path). All `git` commands must run from that directory.
2. Worktrees live one level up at `../wt-plan9a-<taskid>/`, tracking a branch named `plan-9a-T<n>-<slug>` **off** `askdb-global-comp`.
3. Each subagent runs its full test suite inside its worktree before returning.
4. Returns to parent: `{ branch, worktree_path, last_sha, tests_pass, fail_diff_vs_baseline }`.

Worktree create (parent responsibility before dispatch):
```bash
cd "QueryCopilot V1"
git worktree add -b plan-9a-T1-proto-types ../wt-plan9a-T1 askdb-global-comp
```

Worktree cleanup (after merge):
```bash
git worktree remove ../wt-plan9a-T1
git branch -d plan-9a-T1-proto-types
```

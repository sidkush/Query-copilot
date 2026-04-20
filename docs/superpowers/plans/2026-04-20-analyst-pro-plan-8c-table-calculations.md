# Plan 8c — Table Calculations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Tableau-canonical table calculations (RUNNING_*, WINDOW_*, RANK_*, INDEX, FIRST, LAST, SIZE, LOOKUP, PREVIOUS_VALUE, TOTAL, PCT_TOTAL, DIFF, IS_DISTINCT, IS_STACKED) with user-configurable addressing + partitioning. Server-side SQL window-function lowering for window-representable calcs; client-side TS evaluator for row-state-dependent calcs (LOOKUP / PREVIOUS_VALUE / IS_DISTINCT / IS_STACKED). Compute Using UI dialog. Table-calc filters live at filter-stage 8 (client-side, per `Build_Tableau.md` §IV.7).

**Architecture.** New backend module `backend/vizql/table_calc.py` exposes `TableCalcSpec` + `compile_table_calc(spec, ctx) → CompiledTableCalc` returning either `ServerSideCalc(plan: LogicalOpOver)` or `ClientSideCalc(spec: TableCalcSpec)`. Plan 7b's `LogicalOpOver` is reused (partition_bys = partitioning, order_by = addressing + sort). Plan 7c's `sql_ast.Window` + `FrameClause` represent the SQL emission. Filter-stage 8 (`table_calc`) already exists in `filter_ordering.py` from Plan 7c; we add `place_table_calc_filter` helper that flags client-side. Frontend gains `frontend/src/components/dashboard/freeform/lib/tableCalcEvaluator.ts` (pure TS, no dynamic-code evaluation) for client-side resolution and `panels/ComputeUsingDialog.jsx` for addressing/partitioning UI. Wire format gains `VisualSpec.table_calc_specs` (proto field 16). API `/api/v1/queries/execute` response extended additively with `table_calc_specs` + `table_calc_filters` for client-side resolution.

**Tech Stack.** Python 3.10+ (`backend/vizql/`), pytest, FastAPI 8002. React 19 + Vite + Zustand + React Testing Library + Vitest (`frontend/src/`). Protobuf `backend/proto/askdb/vizdataservice/v1.proto` (regen via `bash backend/scripts/regen_proto.sh` + `bash frontend/scripts/regen_proto.sh`).

**Build_Tableau.md sections cited:**
- §V.1 — full Table-calc function list (verbatim used as catalogue source).
- §V.3 — addressing vs partitioning; `IDS_TABLECALC_ORD_PANEUNORDERED` default; `SortDirection`; "Specific Dimensions".
- §IV.7 — 9-stage filter order; step 8 (table_calc) is CLIENT-SIDE post-fetch.
- §IV.2 — `LogicalOpOver` (windowed expression).
- Appendix A.14 — agg function names referenced by WINDOW_*.

**Hard conventions.**
- Server-side preferred whenever calc is representable as a SQL window function.
- Client-side reserved for row-dependent state (LOOKUP, PREVIOUS_VALUE, IS_DISTINCT, IS_STACKED).
- Client-side evaluator pure TS — **no dynamic code evaluation**, dispatch by string match on canonical Tableau function name only (lookup table of named handlers).
- Addressing order matters: different addressing → different values. Golden-file tests for each canonical "Compute Using" mode.
- NULL semantics: NULLs form their own partition group (NULL-as-group); WINDOW_*/RANK_* respect SQL NULL ordering of the underlying dialect.
- TDD per calc function — failing test → impl → pass → commit.
- Commit per task. Format: `feat(analyst-pro): <verb> <object> (Plan 8c T<N>)`.
- Security: client-side path runs without bypassing PII masking — masked rows arrive from `/execute`, evaluator only re-shapes columns.

---

## File map

**Create**
- `backend/vizql/table_calc.py` — TableCalcSpec, CompiledTableCalc, compile_table_calc dispatcher, server-side lowering for WINDOW_* / RUNNING_* / RANK_* / INDEX / FIRST / LAST / SIZE / TOTAL / PCT_TOTAL.
- `backend/tests/test_table_calc.py` — per-function compile golden tests (server vs client routing) + addressing edge cases.
- `backend/tests/test_table_calc_filter_placement.py` — `place_table_calc_filter` produces stage 8 client-side bucket.
- `frontend/src/components/dashboard/freeform/lib/tableCalcEvaluator.ts` — pure-TS client-side evaluator for canonical Tableau function set.
- `frontend/src/components/dashboard/freeform/lib/__tests__/tableCalcEvaluator.test.ts` — 25+ unit tests (LOOKUP offsets, PREVIOUS_VALUE chain, DIFF lag, IS_DISTINCT, IS_STACKED, addressing edge cases).
- `frontend/src/components/dashboard/freeform/panels/ComputeUsingDialog.jsx` — addressing/partitioning UI dialog with reorder + sort direction.
- `frontend/src/components/dashboard/freeform/panels/__tests__/ComputeUsingDialog.test.jsx` — render + save flow.
- `docs/TABLE_CALC_GUIDE.md` — addressing vs partitioning visual guide.

**Modify**
- `backend/vizql/filter_ordering.py` — add `place_table_calc_filter(predicate, *, case_sensitive=True)` helper that returns a `StagedFilter(stage="table_calc")`.
- `backend/vizql/spec.py` — add `VisualSpec.table_calc_specs: list[TableCalcSpec]` field with `to_proto`/`from_proto` round-trip.
- `backend/proto/askdb/vizdataservice/v1.proto` — add field 16 `repeated TableCalcSpec table_calc_specs` + new `TableCalcSpec` message.
- `backend/vizql/__init__.py` — re-export `TableCalcSpec`, `compile_table_calc`, `CompiledTableCalc`, `ServerSideCalc`, `ClientSideCalc`.
- `backend/routers/query_routes.py` — `execute_sql` request + response gain `table_calc_specs` + `table_calc_filters` (additive; absent ⇒ empty list, behaves like today).
- `frontend/src/store.js` — add `setTableCalcComputeUsingAnalystPro(calcId, spec)` action + `analystProTableCalcSpecs` slice.
- `docs/analyst_pro_tableau_parity_roadmap.md` — mark Plan 8c shipped after T10.

---

## Task 1 — Scaffold `backend/vizql/table_calc.py` (TableCalcSpec + dispatcher)

**Files:**
- Create: `backend/vizql/table_calc.py`
- Create: `backend/tests/test_table_calc.py`
- Modify: `backend/vizql/__init__.py` (re-export)

- [ ] **Step 1.1 — Write failing test** for spec construction + dispatcher dispatch on unknown function.

```python
# backend/tests/test_table_calc.py
import pytest
from vizql.table_calc import (
    TableCalcSpec, ClientSideCalc, ServerSideCalc,
    TableCalcCtx, TableCalcCompileError, compile_table_calc,
)


def test_spec_defaults_match_v3_pane_unordered():
    """Default addressing per §V.3 = IDS_TABLECALC_ORD_PANEUNORDERED."""
    spec = TableCalcSpec(calc_id="c1", function="RUNNING_SUM",
                         arg_field="Sales")
    assert spec.addressing == ()
    assert spec.partitioning == ()
    assert spec.direction == "table"
    assert spec.sort is None
    assert spec.offset is None


def test_dispatch_unknown_function_raises():
    spec = TableCalcSpec(calc_id="c1", function="NOT_A_FN", arg_field="x")
    ctx = TableCalcCtx(viz_granularity=frozenset({"Year"}),
                       table_alias="t")
    with pytest.raises(TableCalcCompileError, match="unknown table-calc"):
        compile_table_calc(spec, ctx)
```

- [ ] **Step 1.2 — Run failing test.**

Run: `cd backend && python -m pytest tests/test_table_calc.py -v`
Expected: FAIL — `ImportError: cannot import name 'TableCalcSpec'`.

- [ ] **Step 1.3 — Create the module skeleton.**

```python
# backend/vizql/table_calc.py
"""Plan 8c — table-calc compiler. Build_Tableau.md §V.1 + §V.3.

Decides per-function whether the calc lowers to a SQL window
(`ServerSideCalc(plan=LogicalOpOver)`) or stays client-side as a
`TableCalcSpec` the frontend evaluator runs post-fetch
(`ClientSideCalc`).

§V.3 vocabulary:
  addressing   — dims the calc walks along    (ORDER BY in SQL).
  partitioning — dims inside which it resets  (PARTITION BY in SQL).
  direction    — "table" / "pane" + across/down sugar; "specific" =
                 user-picked addressing checklist.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal as _Lit, Optional, Union

from . import logical as lg
from . import sql_ast as sa


FieldId = str
Direction = _Lit["across", "down", "table", "pane", "specific"]
SortDir = _Lit["asc", "desc"]


class TableCalcCompileError(ValueError):
    """Raised on invalid TableCalcSpec or unknown function."""


@dataclass(frozen=True, slots=True)
class TableCalcSpec:
    calc_id: str
    function: str  # canonical Tableau spelling, e.g. "RUNNING_SUM"
    arg_field: str  # primary measure/dim referenced
    addressing: tuple[FieldId, ...] = ()
    partitioning: tuple[FieldId, ...] = ()
    direction: Direction = "table"
    sort: Optional[SortDir] = None  # per-addressing-field; uniform here
    offset: Optional[int] = None  # LOOKUP / DIFF / PREVIOUS_VALUE


@dataclass(frozen=True, slots=True)
class TableCalcCtx:
    viz_granularity: frozenset[FieldId]
    table_alias: str


@dataclass(frozen=True, slots=True)
class ServerSideCalc:
    plan: lg.LogicalOpOver
    output_alias: str


@dataclass(frozen=True, slots=True)
class ClientSideCalc:
    spec: TableCalcSpec  # forwarded to frontend evaluator verbatim


CompiledTableCalc = Union[ServerSideCalc, ClientSideCalc]


# Routing table — single source of truth for server vs client.
# Built per Plan 8c spec (roadmap §Plan 8c) + §V.1.
_SERVER_SIDE: frozenset[str] = frozenset({
    "RUNNING_SUM", "RUNNING_AVG", "RUNNING_MIN", "RUNNING_MAX", "RUNNING_COUNT",
    "WINDOW_SUM", "WINDOW_AVG", "WINDOW_MIN", "WINDOW_MAX", "WINDOW_MEDIAN",
    "WINDOW_STDEV", "WINDOW_VAR", "WINDOW_PERCENTILE",
    "WINDOW_CORR", "WINDOW_COVAR",
    "RANK", "RANK_DENSE", "RANK_MODIFIED", "RANK_UNIQUE", "RANK_PERCENTILE",
    "INDEX", "FIRST", "LAST", "SIZE",
    "TOTAL", "PCT_TOTAL",
})
_CLIENT_SIDE: frozenset[str] = frozenset({
    "LOOKUP", "PREVIOUS_VALUE", "DIFF", "IS_DISTINCT", "IS_STACKED",
})


def compile_table_calc(spec: TableCalcSpec, ctx: TableCalcCtx) -> CompiledTableCalc:
    fn = spec.function
    if fn in _CLIENT_SIDE:
        return ClientSideCalc(spec=spec)
    if fn in _SERVER_SIDE:
        # Specific server-side compile per family. Patched in T2-T5.
        raise TableCalcCompileError(
            f"server-side compile for {fn!r} not yet implemented")
    raise TableCalcCompileError(f"unknown table-calc {fn!r}")


__all__ = [
    "TableCalcSpec", "TableCalcCtx", "TableCalcCompileError",
    "ServerSideCalc", "ClientSideCalc", "CompiledTableCalc",
    "compile_table_calc",
]
```

- [ ] **Step 1.4 — Re-export in `__init__.py`.**

Open `backend/vizql/__init__.py`. Append the new symbols (splice into the table-calc section if one exists, otherwise add at the end of the file before `__all__` close):

```python
from .table_calc import (
    TableCalcSpec, TableCalcCtx, TableCalcCompileError,
    ServerSideCalc, ClientSideCalc, CompiledTableCalc,
    compile_table_calc,
)
```

And to `__all__`:

```python
"TableCalcSpec", "TableCalcCtx", "TableCalcCompileError",
"ServerSideCalc", "ClientSideCalc", "CompiledTableCalc",
"compile_table_calc",
```

- [ ] **Step 1.5 — Run tests; expect pass.**

Run: `cd backend && python -m pytest tests/test_table_calc.py -v`
Expected: 2 PASS.

- [ ] **Step 1.6 — Commit.**

```bash
cd "QueryCopilot V1"
git add backend/vizql/table_calc.py backend/vizql/__init__.py backend/tests/test_table_calc.py
git commit -m "feat(analyst-pro): scaffold table_calc compiler module + dispatcher (Plan 8c T1)"
```

---

## Task 2 — WINDOW_* server-side compile

**Files:**
- Modify: `backend/vizql/table_calc.py` (`_compile_window_family`)
- Modify: `backend/tests/test_table_calc.py`

- [ ] **Step 2.1 — Write failing tests.** Append to `backend/tests/test_table_calc.py`:

```python
from vizql import logical as lg
from vizql import sql_ast as sa


def _ctx() -> TableCalcCtx:
    return TableCalcCtx(viz_granularity=frozenset({"Year", "Region"}),
                        table_alias="t")


@pytest.mark.parametrize("fn,sql_agg", [
    ("WINDOW_SUM", "SUM"), ("WINDOW_AVG", "AVG"),
    ("WINDOW_MIN", "MIN"), ("WINDOW_MAX", "MAX"),
    ("WINDOW_MEDIAN", "MEDIAN"), ("WINDOW_STDEV", "STDDEV"),
    ("WINDOW_VAR", "VARIANCE"),
])
def test_window_family_emits_logical_over(fn, sql_agg):
    spec = TableCalcSpec(calc_id="c1", function=fn, arg_field="Sales",
                         addressing=("Year",), partitioning=("Region",),
                         sort="asc")
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert isinstance(out.plan, lg.LogicalOpOver)
    assert out.plan.partition_bys == ("Region",)
    # order_by stored as ((field, asc_bool), …)
    assert out.plan.order_by == (("Year", True),)
    # the aggregate function name lives in the named expression body
    assert sql_agg in str(out.plan.expressions)


def test_window_percentile_uses_pct_arg():
    spec = TableCalcSpec(calc_id="c2", function="WINDOW_PERCENTILE",
                         arg_field="Sales", addressing=("Month",),
                         offset=95)  # repurpose .offset for pct
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert "PERCENTILE_CONT" in str(out.plan.expressions)
    assert "95" in str(out.plan.expressions)
```

- [ ] **Step 2.2 — Run; expect fail** (`server-side compile for WINDOW_SUM not yet implemented`).

Run: `cd backend && python -m pytest tests/test_table_calc.py -v -k window`
Expected: FAIL.

- [ ] **Step 2.3 — Implement `_compile_window_family`.** Append to `backend/vizql/table_calc.py` ABOVE the `compile_table_calc` definition:

```python
# Mapping canonical Tableau WINDOW_* names → SQL aggregate.
_WINDOW_AGG: dict[str, str] = {
    "WINDOW_SUM":    "SUM",
    "WINDOW_AVG":    "AVG",
    "WINDOW_MIN":    "MIN",
    "WINDOW_MAX":    "MAX",
    "WINDOW_MEDIAN": "MEDIAN",
    "WINDOW_STDEV":  "STDDEV",
    "WINDOW_VAR":    "VARIANCE",
}


def _arg_col(spec: TableCalcSpec, ctx: TableCalcCtx) -> sa.Column:
    return sa.Column(name=spec.arg_field, table_alias=ctx.table_alias)


def _order_by_pairs(spec: TableCalcSpec) -> tuple[tuple[str, bool], ...]:
    """Return ((field, asc_bool), …) for LogicalOpOver.order_by.

    Default direction = ascending. `spec.sort='desc'` flips every
    addressing field. (Per-field sort lands in Task 9 UI.)
    """
    asc = spec.sort != "desc"
    return tuple((f, asc) for f in spec.addressing)


def _make_over(
    body: sa.SQLQueryExpression,
    spec: TableCalcSpec,
    ctx: TableCalcCtx,
    *,
    output_alias: str,
    frame: Optional[sa.FrameClause] = None,
) -> ServerSideCalc:
    plan = lg.LogicalOpOver(
        input=lg.LogicalOpRelation(table_name=ctx.table_alias),
        partition_bys=tuple(spec.partitioning),
        order_by=_order_by_pairs(spec),
        frame=frame,
        expressions=((output_alias, body),),
    )
    return ServerSideCalc(plan=plan, output_alias=output_alias)


def _compile_window_family(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    if spec.function in _WINDOW_AGG:
        agg = _WINDOW_AGG[spec.function]
        body = sa.FnCall(name=agg, args=(_arg_col(spec, ctx),))
        return _make_over(body, spec, ctx, output_alias=spec.calc_id)
    if spec.function == "WINDOW_PERCENTILE":
        if spec.offset is None:
            raise TableCalcCompileError("WINDOW_PERCENTILE requires offset (percentile)")
        body = sa.FnCall(
            name="PERCENTILE_CONT",
            args=(sa.Literal(spec.offset),
                  _arg_col(spec, ctx)),
        )
        return _make_over(body, spec, ctx, output_alias=spec.calc_id)
    if spec.function in ("WINDOW_CORR", "WINDOW_COVAR"):
        # arg_field carries `<measureA>,<measureB>` pair (UI splits)
        if "," not in spec.arg_field:
            raise TableCalcCompileError(
                f"{spec.function} requires arg_field='<a>,<b>'")
        a, b = (s.strip() for s in spec.arg_field.split(",", 1))
        sql_fn = "CORR" if spec.function == "WINDOW_CORR" else "COVAR_SAMP"
        body = sa.FnCall(
            name=sql_fn,
            args=(sa.Column(name=a, table_alias=ctx.table_alias),
                  sa.Column(name=b, table_alias=ctx.table_alias)),
        )
        return _make_over(body, spec, ctx, output_alias=spec.calc_id)
    raise TableCalcCompileError(f"WINDOW family fallthrough: {spec.function}")
```

Replace the `compile_table_calc` body to dispatch:

```python
def compile_table_calc(spec: TableCalcSpec, ctx: TableCalcCtx) -> CompiledTableCalc:
    fn = spec.function
    if fn in _CLIENT_SIDE:
        return ClientSideCalc(spec=spec)
    if fn.startswith("WINDOW_"):
        return _compile_window_family(spec, ctx)
    if fn in _SERVER_SIDE:
        raise TableCalcCompileError(
            f"server-side compile for {fn!r} not yet implemented")
    raise TableCalcCompileError(f"unknown table-calc {fn!r}")
```

- [ ] **Step 2.4 — Run tests; expect pass.**

Run: `cd backend && python -m pytest tests/test_table_calc.py -v -k window`
Expected: PASS (8 tests).

- [ ] **Step 2.5 — Commit.**

```bash
git add backend/vizql/table_calc.py backend/tests/test_table_calc.py
git commit -m "feat(analyst-pro): WINDOW_* family lowers to LogicalOpOver (Plan 8c T2)"
```

---

## Task 3 — RUNNING_* server-side compile

**Files:**
- Modify: `backend/vizql/table_calc.py`
- Modify: `backend/tests/test_table_calc.py`

- [ ] **Step 3.1 — Write failing tests.**

```python
@pytest.mark.parametrize("fn,sql_agg", [
    ("RUNNING_SUM", "SUM"), ("RUNNING_AVG", "AVG"),
    ("RUNNING_MIN", "MIN"), ("RUNNING_MAX", "MAX"),
    ("RUNNING_COUNT", "COUNT"),
])
def test_running_family_uses_unbounded_preceding_frame(fn, sql_agg):
    spec = TableCalcSpec(calc_id="c1", function=fn, arg_field="Sales",
                         addressing=("Year",), partitioning=())
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert out.plan.frame is not None
    assert out.plan.frame.kind == "ROWS"
    assert out.plan.frame.start == ("UNBOUNDED", 0)
    assert out.plan.frame.end == ("CURRENT_ROW", 0)
    assert sql_agg in str(out.plan.expressions)
```

- [ ] **Step 3.2 — Run; expect fail.**

Run: `cd backend && python -m pytest tests/test_table_calc.py -v -k running`
Expected: FAIL.

- [ ] **Step 3.3 — Implement.** Append to `table_calc.py`:

```python
_RUNNING_AGG: dict[str, str] = {
    "RUNNING_SUM": "SUM", "RUNNING_AVG": "AVG", "RUNNING_MIN": "MIN",
    "RUNNING_MAX": "MAX", "RUNNING_COUNT": "COUNT",
}


def _compile_running_family(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    agg = _RUNNING_AGG[spec.function]
    body = sa.FnCall(name=agg, args=(_arg_col(spec, ctx),))
    frame = sa.FrameClause(
        kind="ROWS",
        start=("UNBOUNDED", 0),
        end=("CURRENT_ROW", 0),
    )
    return _make_over(body, spec, ctx, output_alias=spec.calc_id, frame=frame)
```

Update dispatcher (insert above the `WINDOW_` branch):

```python
    if fn in _RUNNING_AGG:
        return _compile_running_family(spec, ctx)
```

- [ ] **Step 3.4 — Run tests; expect pass.**

Run: `cd backend && python -m pytest tests/test_table_calc.py -v -k running`
Expected: 5 PASS.

- [ ] **Step 3.5 — Commit.**

```bash
git add backend/vizql/table_calc.py backend/tests/test_table_calc.py
git commit -m "feat(analyst-pro): RUNNING_* family — UNBOUNDED PRECEDING → CURRENT ROW frame (Plan 8c T3)"
```

---

## Task 4 — RANK_* + INDEX/FIRST/LAST/SIZE server-side

**Files:**
- Modify: `backend/vizql/table_calc.py`
- Modify: `backend/tests/test_table_calc.py`

- [ ] **Step 4.1 — Write failing tests.**

```python
@pytest.mark.parametrize("fn,sql_fn", [
    ("RANK", "RANK"),                  # ties skip
    ("RANK_DENSE", "DENSE_RANK"),       # ties no-skip
    ("RANK_MODIFIED", "RANK"),          # alias of RANK in SQL; UI offset diff
    ("RANK_UNIQUE", "ROW_NUMBER"),      # always unique
    ("RANK_PERCENTILE", "PERCENT_RANK"),
])
def test_rank_family_emits_correct_sql_fn(fn, sql_fn):
    spec = TableCalcSpec(calc_id="c1", function=fn, arg_field="Sales",
                         addressing=("Sales",), sort="desc")
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert sql_fn in str(out.plan.expressions)
    # rank uses arg_field as ORDER BY column, descending
    assert out.plan.order_by == (("Sales", False),)


def test_index_emits_row_number():
    spec = TableCalcSpec(calc_id="c1", function="INDEX", arg_field="",
                         addressing=("Year",))
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert "ROW_NUMBER" in str(out.plan.expressions)


def test_first_last_size_use_dedicated_sql():
    f = compile_table_calc(TableCalcSpec(calc_id="c", function="FIRST",
                                         arg_field="", addressing=("Year",)),
                           _ctx())
    assert "ROW_NUMBER" in str(f.plan.expressions)
    s = compile_table_calc(TableCalcSpec(calc_id="c", function="SIZE",
                                         arg_field="", addressing=("Year",)),
                           _ctx())
    assert "COUNT" in str(s.plan.expressions)
```

- [ ] **Step 4.2 — Run; expect fail.**

- [ ] **Step 4.3 — Implement.** Append:

```python
_RANK_SQL: dict[str, str] = {
    "RANK":            "RANK",
    "RANK_DENSE":      "DENSE_RANK",
    "RANK_MODIFIED":   "RANK",
    "RANK_UNIQUE":     "ROW_NUMBER",
    "RANK_PERCENTILE": "PERCENT_RANK",
}


def _compile_rank_family(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    sql_fn = _RANK_SQL[spec.function]
    # RANK family takes no measure-arg in the call body; the measure is the
    # ORDER BY column. Spec.sort defaults desc=True for RANK per Tableau UX.
    body = sa.FnCall(name=sql_fn, args=())
    # Force the order_by to the measure (arg_field) when the user hasn't
    # picked an explicit addressing — matches Tableau's "rank by the measure
    # this is computing" default.
    if not spec.addressing and spec.arg_field:
        spec = TableCalcSpec(
            calc_id=spec.calc_id, function=spec.function,
            arg_field=spec.arg_field, addressing=(spec.arg_field,),
            partitioning=spec.partitioning,
            direction=spec.direction, sort=spec.sort or "desc",
            offset=spec.offset,
        )
    return _make_over(body, spec, ctx, output_alias=spec.calc_id)


def _compile_index_first_last_size(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    fn = spec.function
    if fn == "INDEX":
        body = sa.FnCall(name="ROW_NUMBER", args=())
    elif fn == "FIRST":
        # FIRST() = 1 - ROW_NUMBER() OVER(...)  — distance-from-first.
        body = sa.BinaryOp(
            op="-",
            left=sa.Literal(1),
            right=sa.FnCall(name="ROW_NUMBER", args=()),
        )
    elif fn == "LAST":
        # LAST() = COUNT(*) OVER(...) - ROW_NUMBER() OVER(...)
        body = sa.BinaryOp(
            op="-",
            left=sa.FnCall(name="COUNT", args=(sa.Literal("*"),)),
            right=sa.FnCall(name="ROW_NUMBER", args=()),
        )
    elif fn == "SIZE":
        body = sa.FnCall(name="COUNT", args=(sa.Literal("*"),))
    else:  # pragma: no cover
        raise TableCalcCompileError(f"unhandled INDEX/FIRST/LAST/SIZE: {fn}")
    return _make_over(body, spec, ctx, output_alias=spec.calc_id)
```

Update dispatcher above WINDOW branch:

```python
    if fn in _RANK_SQL:
        return _compile_rank_family(spec, ctx)
    if fn in ("INDEX", "FIRST", "LAST", "SIZE"):
        return _compile_index_first_last_size(spec, ctx)
```

- [ ] **Step 4.4 — Run tests; expect pass.**

Run: `cd backend && python -m pytest tests/test_table_calc.py -v -k "rank or index or first or last or size"`
Expected: PASS.

- [ ] **Step 4.5 — Commit.**

```bash
git add backend/vizql/table_calc.py backend/tests/test_table_calc.py
git commit -m "feat(analyst-pro): RANK_* + INDEX/FIRST/LAST/SIZE lower to window fns (Plan 8c T4)"
```

---

## Task 5 — TOTAL/PCT_TOTAL server-side; LOOKUP/PREVIOUS_VALUE/DIFF/IS_DISTINCT/IS_STACKED route to ClientSideCalc

**Files:**
- Modify: `backend/vizql/table_calc.py`
- Modify: `backend/tests/test_table_calc.py`

- [ ] **Step 5.1 — Write failing tests.**

```python
def test_total_uses_unbounded_to_unbounded_frame():
    spec = TableCalcSpec(calc_id="c1", function="TOTAL", arg_field="Sales",
                         addressing=("Year",))
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ServerSideCalc)
    assert out.plan.frame is not None
    assert out.plan.frame.start == ("UNBOUNDED", 0)
    assert out.plan.frame.end == ("UNBOUNDED", 0)
    assert "SUM" in str(out.plan.expressions)


def test_pct_total_divides_by_window_sum():
    spec = TableCalcSpec(calc_id="c1", function="PCT_TOTAL", arg_field="Sales",
                         addressing=("Year",))
    out = compile_table_calc(spec, _ctx())
    body = str(out.plan.expressions)
    assert "/" in body and "SUM" in body


@pytest.mark.parametrize("fn", ["LOOKUP", "PREVIOUS_VALUE", "DIFF",
                                "IS_DISTINCT", "IS_STACKED"])
def test_client_side_routes_return_clientsidecalc(fn):
    spec = TableCalcSpec(calc_id="c1", function=fn, arg_field="Sales",
                         offset=-1)
    out = compile_table_calc(spec, _ctx())
    assert isinstance(out, ClientSideCalc)
    assert out.spec.function == fn
```

- [ ] **Step 5.2 — Run; expect fail.**

- [ ] **Step 5.3 — Implement.** Append:

```python
def _compile_total_family(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    sum_body = sa.FnCall(name="SUM", args=(_arg_col(spec, ctx),))
    frame = sa.FrameClause(
        kind="ROWS",
        start=("UNBOUNDED", 0),
        end=("UNBOUNDED", 0),
    )
    if spec.function == "TOTAL":
        return _make_over(sum_body, spec, ctx, output_alias=spec.calc_id,
                          frame=frame)
    # PCT_TOTAL = arg_field / SUM(arg_field) OVER(...)
    body = sa.BinaryOp(
        op="/",
        left=_arg_col(spec, ctx),
        right=sum_body,
    )
    return _make_over(body, spec, ctx, output_alias=spec.calc_id, frame=frame)
```

Update dispatcher above WINDOW branch:

```python
    if fn in ("TOTAL", "PCT_TOTAL"):
        return _compile_total_family(spec, ctx)
```

(Client-side routes already handled by the existing `_CLIENT_SIDE` short-circuit at top of the dispatcher.)

- [ ] **Step 5.4 — Run tests; expect pass.**

Run: `cd backend && python -m pytest tests/test_table_calc.py -v`
Expected: ALL PASS (~26 tests at this point).

- [ ] **Step 5.5 — Commit.**

```bash
git add backend/vizql/table_calc.py backend/tests/test_table_calc.py
git commit -m "feat(analyst-pro): TOTAL/PCT_TOTAL window + client-side routes for LOOKUP/PREVIOUS_VALUE/DIFF/IS_DISTINCT/IS_STACKED (Plan 8c T5)"
```

---

## Task 6 — Client-side evaluator (`tableCalcEvaluator.ts`)

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/tableCalcEvaluator.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/tableCalcEvaluator.test.ts`

- [ ] **Step 6.1 — Write failing tests** (canonical Tableau function names; pure data fixtures).

```typescript
// frontend/src/components/dashboard/freeform/lib/__tests__/tableCalcEvaluator.test.ts
import { describe, expect, it } from 'vitest';
import { evaluateTableCalc, TableCalcSpec, Row } from '../tableCalcEvaluator';

const baseRows: Row[] = [
  { Region: 'East', Year: 2020, Sales: 100 },
  { Region: 'East', Year: 2021, Sales: 150 },
  { Region: 'East', Year: 2022, Sales: 175 },
  { Region: 'West', Year: 2020, Sales: 200 },
  { Region: 'West', Year: 2021, Sales: 250 },
  { Region: 'West', Year: 2022, Sales: 300 },
];

const ctx = (
  fn: string, opts: Partial<TableCalcSpec> = {},
): TableCalcSpec => ({
  calc_id: 'c1',
  function: fn,
  arg_field: 'Sales',
  addressing: ['Year'],
  partitioning: ['Region'],
  direction: 'specific',
  sort: 'asc',
  offset: null,
  ...opts,
});

describe('LOOKUP', () => {
  it('LOOKUP offset -1 returns prior row in addressing', () => {
    const out = evaluateTableCalc(ctx('LOOKUP', { offset: -1 }), baseRows);
    expect(out[0].c1).toBeNull();      // East/2020 — no prior
    expect(out[1].c1).toBe(100);        // East/2021 ← East/2020
    expect(out[2].c1).toBe(150);        // East/2022 ← East/2021
    expect(out[3].c1).toBeNull();      // West/2020 — partition reset
    expect(out[4].c1).toBe(200);
  });

  it('LOOKUP offset +1 returns next row', () => {
    const out = evaluateTableCalc(ctx('LOOKUP', { offset: 1 }), baseRows);
    expect(out[0].c1).toBe(150);
    expect(out[2].c1).toBeNull();
  });

  it('LOOKUP offset 0 returns same-row value', () => {
    const out = evaluateTableCalc(ctx('LOOKUP', { offset: 0 }), baseRows);
    expect(out[0].c1).toBe(100);
  });
});

describe('PREVIOUS_VALUE', () => {
  it('chains last computed value, seeded with current row', () => {
    const out = evaluateTableCalc(ctx('PREVIOUS_VALUE'), baseRows);
    // Tableau spec: PREVIOUS_VALUE(initial) yields the prior row's
    // calc result. Initial = arg_field of first row in partition.
    expect(out[0].c1).toBe(100);
    expect(out[1].c1).toBe(100);
    expect(out[2].c1).toBe(100);
  });
});

describe('DIFF', () => {
  it('DIFF lag=1 returns delta vs prior row', () => {
    const out = evaluateTableCalc(ctx('DIFF', { offset: -1 }), baseRows);
    expect(out[0].c1).toBeNull();
    expect(out[1].c1).toBe(50);
    expect(out[2].c1).toBe(25);
  });

  it('DIFF lag=2 looks two rows back', () => {
    const out = evaluateTableCalc(ctx('DIFF', { offset: -2 }), baseRows);
    expect(out[0].c1).toBeNull();
    expect(out[1].c1).toBeNull();
    expect(out[2].c1).toBe(75);
  });
});

describe('IS_DISTINCT', () => {
  it('returns true once per partition for the addressing field', () => {
    const dup: Row[] = [
      { Region: 'East', Year: 2020, Sales: 100 },
      { Region: 'East', Year: 2020, Sales: 100 },
      { Region: 'East', Year: 2021, Sales: 150 },
    ];
    const out = evaluateTableCalc(ctx('IS_DISTINCT'), dup);
    expect(out[0].c1).toBe(true);
    expect(out[1].c1).toBe(false);  // dup of (East, 2020)
    expect(out[2].c1).toBe(true);
  });
});

describe('IS_STACKED', () => {
  it('flags rows where >1 mark shares an addressing key', () => {
    const stacked: Row[] = [
      { Region: 'East', Year: 2020, Sales: 100 },
      { Region: 'West', Year: 2020, Sales: 200 },
    ];
    const spec: TableCalcSpec = {
      ...ctx('IS_STACKED'),
      partitioning: [],            // single global partition
      addressing: ['Year'],
    };
    const out = evaluateTableCalc(spec, stacked);
    // Both rows share Year=2020 → both stacked = true.
    expect(out[0].c1).toBe(true);
    expect(out[1].c1).toBe(true);
  });
});

describe('addressing edges', () => {
  it('empty partition = single global group', () => {
    const out = evaluateTableCalc(
      { ...ctx('LOOKUP', { offset: -1 }), partitioning: [] },
      baseRows,
    );
    expect(out[0].c1).toBeNull();
    expect(out[3].c1).toBe(175);  // crosses East→West because no partition
  });

  it('partition size 1 yields trivial calc', () => {
    const single: Row[] = [{ Region: 'X', Year: 2020, Sales: 42 }];
    const out = evaluateTableCalc(ctx('LOOKUP', { offset: -1 }), single);
    expect(out[0].c1).toBeNull();
  });

  it('NULL addressing values group together (NULL-as-group)', () => {
    const withNull: Row[] = [
      { Region: 'X', Year: null, Sales: 1 },
      { Region: 'X', Year: null, Sales: 2 },
    ];
    const out = evaluateTableCalc(
      { ...ctx('IS_DISTINCT'), partitioning: ['Region'] },
      withNull,
    );
    expect(out[0].c1).toBe(true);
    expect(out[1].c1).toBe(false);
  });

  it('rejects unknown function (no dynamic-code evaluation)', () => {
    expect(() =>
      evaluateTableCalc({ ...ctx('NOT_A_FN'), function: 'NOT_A_FN' }, baseRows),
    ).toThrow(/unknown table-calc/);
  });
});
```

- [ ] **Step 6.2 — Run; expect fail.**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/tableCalcEvaluator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6.3 — Create the evaluator** (pure TS, switch-on-name dispatch only — never builds executable code from input).

```typescript
// frontend/src/components/dashboard/freeform/lib/tableCalcEvaluator.ts
/**
 * Plan 8c — client-side table-calc evaluator.
 *
 * Runs only the calcs whose semantics depend on per-row state
 * (LOOKUP, PREVIOUS_VALUE, DIFF, IS_DISTINCT, IS_STACKED). All
 * window-representable calcs (RUNNING_*, WINDOW_*, RANK_*, INDEX,
 * FIRST, LAST, SIZE, TOTAL, PCT_TOTAL) are lowered to SQL by
 * `backend/vizql/table_calc.py`.
 *
 * Security: dispatch is a fixed lookup table keyed by the canonical
 * Tableau function name. The evaluator never compiles or evaluates
 * user-supplied code. Rows arrive PII-masked from /api/v1/queries/execute.
 *
 * Build_Tableau.md §V.3 — addressing = ORDER BY; partitioning =
 * PARTITION BY; default direction = pane-unordered.
 */
export type SortDir = 'asc' | 'desc';
export type Row = Record<string, unknown>;

export interface TableCalcSpec {
  calc_id: string;
  function: string;          // canonical Tableau name, e.g. 'LOOKUP'
  arg_field: string;
  addressing: string[];
  partitioning: string[];
  direction: 'across' | 'down' | 'table' | 'pane' | 'specific';
  sort: SortDir | null;
  offset: number | null;
}

const NULL_KEY = '\u0001NULL';

function partKey(row: Row, dims: string[]): string {
  if (dims.length === 0) return '';
  return dims.map(d => row[d] === null || row[d] === undefined ? NULL_KEY : String(row[d])).join('\u0000');
}

function addrCmp(a: Row, b: Row, addressing: string[], dir: SortDir): number {
  const sign = dir === 'desc' ? -1 : 1;
  for (const f of addressing) {
    const av = a[f], bv = b[f];
    if (av === bv) continue;
    if (av === null || av === undefined) return -1 * sign;
    if (bv === null || bv === undefined) return 1 * sign;
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
  }
  return 0;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface PartIndex { key: string; sortedIdx: number[]; }

function buildPartitions(rows: Row[], spec: TableCalcSpec): PartIndex[] {
  const map = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const k = partKey(rows[i], spec.partitioning);
    const bucket = map.get(k);
    if (bucket) bucket.push(i); else map.set(k, [i]);
  }
  const dir = spec.sort ?? 'asc';
  const out: PartIndex[] = [];
  for (const [key, idxs] of map.entries()) {
    idxs.sort((a, b) => addrCmp(rows[a], rows[b], spec.addressing, dir));
    out.push({ key, sortedIdx: idxs });
  }
  return out;
}

type ClientCalcFn = (rows: Row[], spec: TableCalcSpec) => unknown[];

const CALC_DISPATCH: Record<string, ClientCalcFn> = {
  LOOKUP(rows, spec) {
    const off = spec.offset ?? 0;
    const out: unknown[] = new Array(rows.length).fill(null);
    for (const part of buildPartitions(rows, spec)) {
      for (let pos = 0; pos < part.sortedIdx.length; pos++) {
        const tgt = pos + off;
        if (tgt < 0 || tgt >= part.sortedIdx.length) continue;
        out[part.sortedIdx[pos]] = rows[part.sortedIdx[tgt]][spec.arg_field];
      }
    }
    return out;
  },
  PREVIOUS_VALUE(rows, spec) {
    const out: unknown[] = new Array(rows.length).fill(null);
    for (const part of buildPartitions(rows, spec)) {
      let prev: unknown = null;
      for (let pos = 0; pos < part.sortedIdx.length; pos++) {
        const i = part.sortedIdx[pos];
        if (pos === 0) prev = rows[i][spec.arg_field];
        out[i] = prev;
      }
    }
    return out;
  },
  DIFF(rows, spec) {
    const lag = spec.offset ?? -1;
    const out: unknown[] = new Array(rows.length).fill(null);
    for (const part of buildPartitions(rows, spec)) {
      for (let pos = 0; pos < part.sortedIdx.length; pos++) {
        const tgt = pos + lag;
        if (tgt < 0 || tgt >= part.sortedIdx.length) continue;
        const cur = num(rows[part.sortedIdx[pos]][spec.arg_field]);
        const ref = num(rows[part.sortedIdx[tgt]][spec.arg_field]);
        out[part.sortedIdx[pos]] = (cur === null || ref === null) ? null : cur - ref;
      }
    }
    return out;
  },
  IS_DISTINCT(rows, spec) {
    const out: unknown[] = new Array(rows.length).fill(false);
    for (const part of buildPartitions(rows, spec)) {
      const seen = new Set<string>();
      for (const i of part.sortedIdx) {
        const k = partKey(rows[i], spec.addressing);
        if (seen.has(k)) { out[i] = false; continue; }
        seen.add(k); out[i] = true;
      }
    }
    return out;
  },
  IS_STACKED(rows, spec) {
    const out: unknown[] = new Array(rows.length).fill(false);
    for (const part of buildPartitions(rows, spec)) {
      const counts = new Map<string, number>();
      for (const i of part.sortedIdx) {
        const k = partKey(rows[i], spec.addressing);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      for (const i of part.sortedIdx) {
        const k = partKey(rows[i], spec.addressing);
        out[i] = (counts.get(k) ?? 0) > 1;
      }
    }
    return out;
  },
};

export function evaluateTableCalc(spec: TableCalcSpec, rows: Row[]): Row[] {
  const fn = CALC_DISPATCH[spec.function];
  if (!fn) throw new Error(`unknown table-calc ${spec.function}`);
  const values = fn(rows, spec);
  return rows.map((r, i) => ({ ...r, [spec.calc_id]: values[i] }));
}

export function evaluateTableCalcPipeline(
  specs: TableCalcSpec[], rows: Row[],
): Row[] {
  let out = rows;
  for (const s of specs) out = evaluateTableCalc(s, out);
  return out;
}
```

- [ ] **Step 6.4 — Run tests; expect pass.**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/tableCalcEvaluator.test.ts`
Expected: PASS (12 named cases).

- [ ] **Step 6.5 — Commit.**

```bash
git add frontend/src/components/dashboard/freeform/lib/tableCalcEvaluator.ts frontend/src/components/dashboard/freeform/lib/__tests__/tableCalcEvaluator.test.ts
git commit -m "feat(analyst-pro): client-side table-calc evaluator (LOOKUP/PREVIOUS_VALUE/DIFF/IS_DISTINCT/IS_STACKED) (Plan 8c T6)"
```

---

## Task 7 — `place_table_calc_filter` helper + tests

**Files:**
- Modify: `backend/vizql/filter_ordering.py`
- Create: `backend/tests/test_table_calc_filter_placement.py`

- [ ] **Step 7.1 — Write failing test.**

```python
# backend/tests/test_table_calc_filter_placement.py
import dataclasses
from vizql import sql_ast as sa
from vizql.filter_ordering import (
    StagedFilter, apply_filters_in_order, place_table_calc_filter,
)


def _trivial_plan() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                   expression=sa.Column(name="x",
                                                        table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
        where=None, group_by=(), having=None, order_by=(), limit=None,
    )


def test_place_table_calc_filter_returns_stage_8_staged_filter():
    pred = sa.BinaryOp(op=">",
                       left=sa.Column(name="rs", table_alias="t"),
                       right=sa.Literal(100))
    sf = place_table_calc_filter(pred)
    assert isinstance(sf, StagedFilter)
    assert sf.stage == "table_calc"
    assert sf.predicate is pred


def test_table_calc_filter_pushes_to_client_side_filters_bucket():
    pred = sa.BinaryOp(op=">",
                       left=sa.Column(name="rs", table_alias="t"),
                       right=sa.Literal(100))
    out = apply_filters_in_order(_trivial_plan(), [place_table_calc_filter(pred)])
    assert pred in out.client_side_filters
    # WHERE / HAVING untouched
    assert out.where is None
    assert out.having is None
```

- [ ] **Step 7.2 — Run; expect fail** — `place_table_calc_filter` does not exist yet.

Run: `cd backend && python -m pytest tests/test_table_calc_filter_placement.py -v`
Expected: FAIL.

- [ ] **Step 7.3 — Add helper to `filter_ordering.py`.** Append at end of file:

```python
def place_table_calc_filter(
    predicate: sa.SQLQueryExpression,
    *,
    case_sensitive: bool = True,
    should_affect_totals: bool = True,
) -> StagedFilter:
    """Plan 8c — wrap a table-calc filter predicate as a stage-8
    `StagedFilter`. Stage 8 lives in the client-side bucket per
    Build_Tableau.md §IV.7 step 8: the predicate never reaches SQL —
    `apply_filters_in_order` parks it in `client_side_filters` so the
    frontend evaluator can apply it post-fetch.
    """
    return StagedFilter(
        stage="table_calc",
        predicate=predicate,
        case_sensitive=case_sensitive,
        should_affect_totals=should_affect_totals,
    )
```

- [ ] **Step 7.4 — Run tests; expect pass.**

Run: `cd backend && python -m pytest tests/test_table_calc_filter_placement.py -v`
Expected: 2 PASS.

- [ ] **Step 7.5 — Commit.**

```bash
git add backend/vizql/filter_ordering.py backend/tests/test_table_calc_filter_placement.py
git commit -m "feat(analyst-pro): place_table_calc_filter helper — stage 8 client-side (Plan 8c T7)"
```

---

## Task 8 — Wire `VisualSpec.table_calc_specs` (proto field 16) + round-trip

**Files:**
- Modify: `backend/proto/askdb/vizdataservice/v1.proto`
- Regenerate: `backend/vizql/proto/v1_pb2.py` + `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts`
- Modify: `backend/vizql/spec.py`
- Modify: `backend/tests/test_table_calc.py`

- [ ] **Step 8.1 — Write failing round-trip test.** Append to `backend/tests/test_table_calc.py`:

```python
def test_visualspec_table_calc_specs_round_trip():
    from vizql.spec import VisualSpec
    ts = TableCalcSpec(calc_id="rs1", function="RUNNING_SUM",
                       arg_field="Sales", addressing=("Year",),
                       partitioning=("Region",), direction="specific",
                       sort="asc", offset=None)
    vs = VisualSpec(sheet_id="s1", table_calc_specs=[ts])
    blob = vs.serialize()
    restored = VisualSpec.deserialize(blob)
    assert len(restored.table_calc_specs) == 1
    rs = restored.table_calc_specs[0]
    assert rs.calc_id == "rs1"
    assert rs.function == "RUNNING_SUM"
    assert rs.arg_field == "Sales"
    assert rs.addressing == ("Year",)
    assert rs.partitioning == ("Region",)
    assert rs.sort == "asc"
```

- [ ] **Step 8.2 — Run; expect fail** (`VisualSpec` has no `table_calc_specs`).

- [ ] **Step 8.3 — Add proto message + field.** Open `backend/proto/askdb/vizdataservice/v1.proto`. Find the `message VisualSpec` block and append a new field after `join_lod_overrides` (which is field 15). Add a new top-level message:

```proto
message TableCalcSpec {
  string calc_id      = 1;
  string function     = 2;   // canonical Tableau spelling
  string arg_field    = 3;
  repeated string addressing   = 4;
  repeated string partitioning = 5;
  string direction    = 6;   // "across" | "down" | "table" | "pane" | "specific"
  string sort         = 7;   // "" | "asc" | "desc"
  int32  offset       = 8;   // 0 if unset (LOOKUP/DIFF/PREVIOUS_VALUE/PERCENTILE)
  bool   has_offset   = 9;   // discriminates legitimate 0 from unset
}
```

And inside `message VisualSpec`, add the new field after `repeated string join_lod_overrides = 15;`:

```proto
  repeated TableCalcSpec table_calc_specs = 16;
```

- [ ] **Step 8.4 — Regenerate protobuf bindings.**

Run: `cd "QueryCopilot V1" && bash backend/scripts/regen_proto.sh && bash frontend/scripts/regen_proto.sh`
Expected: regenerated `backend/vizql/proto/v1_pb2.py` + `frontend/.../vizSpecGenerated.ts`.

- [ ] **Step 8.5 — Add field to `VisualSpec` dataclass.** In `backend/vizql/spec.py`, locate the `@dataclass class VisualSpec:` block. After the `join_lod_overrides: list[str] = field(default_factory=list)` line, append:

```python
    # Plan 8c §V.3 — table-calc specs attached to this viz; resolution
    # is split per spec.function:
    #   server-side: lowered to LogicalOpOver by table_calc.compile_table_calc
    #   client-side: forwarded to frontend evaluator post-fetch
    table_calc_specs: list["TableCalcSpec"] = field(default_factory=list)
```

Add the import at the top of `spec.py` (after the existing `from vizql.proto import v1_pb2 as pb` line):

```python
from .table_calc import TableCalcSpec
```

In `to_proto`, append after `join_lod_overrides=list(self.join_lod_overrides),`:

```python
            table_calc_specs=[
                pb.TableCalcSpec(
                    calc_id=t.calc_id, function=t.function, arg_field=t.arg_field,
                    addressing=list(t.addressing), partitioning=list(t.partitioning),
                    direction=t.direction, sort=t.sort or "",
                    offset=t.offset if t.offset is not None else 0,
                    has_offset=t.offset is not None,
                ) for t in self.table_calc_specs
            ],
```

In `from_proto`, append after `join_lod_overrides=list(m.join_lod_overrides),`:

```python
            table_calc_specs=[
                TableCalcSpec(
                    calc_id=t.calc_id, function=t.function, arg_field=t.arg_field,
                    addressing=tuple(t.addressing),
                    partitioning=tuple(t.partitioning),
                    direction=t.direction or "table",  # type: ignore[arg-type]
                    sort=(t.sort if t.sort in ("asc", "desc") else None),  # type: ignore[arg-type]
                    offset=(t.offset if t.has_offset else None),
                ) for t in m.table_calc_specs
            ],
```

- [ ] **Step 8.6 — Run round-trip test; expect pass.**

Run: `cd backend && python -m pytest tests/test_table_calc.py::test_visualspec_table_calc_specs_round_trip -v`
Expected: PASS.

Then full suite: `cd backend && python -m pytest tests/test_table_calc.py tests/test_table_calc_filter_placement.py -v`
Expected: ALL PASS.

- [ ] **Step 8.7 — Commit.**

```bash
git add backend/proto/askdb/vizdataservice/v1.proto backend/vizql/proto/v1_pb2.py frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts backend/vizql/spec.py backend/tests/test_table_calc.py
git commit -m "feat(analyst-pro): VisualSpec.table_calc_specs proto field 16 + round-trip (Plan 8c T8)"
```

---

## Task 9 — Compute Using UI dialog + Zustand action

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/ComputeUsingDialog.jsx`
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/ComputeUsingDialog.test.jsx`
- Modify: `frontend/src/store.js`

- [ ] **Step 9.1 — Write failing test.**

```jsx
// frontend/src/components/dashboard/freeform/panels/__tests__/ComputeUsingDialog.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ComputeUsingDialog from '../ComputeUsingDialog';

const baseSpec = {
  calc_id: 'c1', function: 'RUNNING_SUM', arg_field: 'Sales',
  addressing: ['Year'], partitioning: ['Region'],
  direction: 'specific', sort: 'asc', offset: null,
};

const fields = [
  { id: 'Year', name: 'Year' },
  { id: 'Region', name: 'Region' },
  { id: 'Quarter', name: 'Quarter' },
];

describe('ComputeUsingDialog', () => {
  it('renders preset compute-using options', () => {
    render(<ComputeUsingDialog open spec={baseSpec} fields={fields}
                                onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/Table \(Across\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Table \(Down\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Specific Dimensions/i)).toBeInTheDocument();
  });

  it('Save fires onSave with updated spec', () => {
    const onSave = vi.fn();
    render(<ComputeUsingDialog open spec={baseSpec} fields={fields}
                                onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Table \(Down\)/i));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].direction).toBe('down');
  });

  it('Specific Dimensions exposes addressing checklist + sort picker', () => {
    render(<ComputeUsingDialog open
                                spec={{ ...baseSpec, direction: 'specific' }}
                                fields={fields}
                                onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /Year/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Quarter/ })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: /Sort direction/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 9.2 — Run; expect fail.**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/ComputeUsingDialog.test.jsx`

- [ ] **Step 9.3 — Implement dialog.**

```jsx
// frontend/src/components/dashboard/freeform/panels/ComputeUsingDialog.jsx
import { useState } from 'react';

const DIRECTIONS = [
  { value: 'across',   label: 'Table (Across)' },
  { value: 'down',     label: 'Table (Down)' },
  { value: 'pane',     label: 'Pane (Across)' },
  { value: 'pane_down', label: 'Pane (Down)' },
  { value: 'specific', label: 'Specific Dimensions' },
];

export default function ComputeUsingDialog({
  open, spec, fields, onSave, onCancel,
}) {
  const [draft, setDraft] = useState(spec);
  if (!open) return null;

  const setDirection = (value) => setDraft({ ...draft, direction: value });
  const toggleField = (fieldId) => {
    const has = draft.addressing.includes(fieldId);
    const addressing = has
      ? draft.addressing.filter(f => f !== fieldId)
      : [...draft.addressing, fieldId];
    const partitioning = fields
      .filter(f => !addressing.includes(f.id))
      .map(f => f.id);
    setDraft({ ...draft, addressing, partitioning });
  };

  return (
    <div role="dialog" aria-label="Compute Using" className="compute-using-dialog">
      <h3>Compute Using</h3>
      <fieldset>
        {DIRECTIONS.map(d => (
          <label key={d.value}>
            <input
              type="radio"
              name="direction"
              checked={draft.direction === d.value}
              onChange={() => setDirection(d.value)}
            />
            {d.label}
          </label>
        ))}
      </fieldset>

      {draft.direction === 'specific' && (
        <>
          <h4>At the level — addressing fields (in order)</h4>
          {fields.map(f => (
            <label key={f.id}>
              <input
                type="checkbox"
                aria-label={f.name}
                checked={draft.addressing.includes(f.id)}
                onChange={() => toggleField(f.id)}
              />
              {f.name}
            </label>
          ))}
          <h4>Restart every — partitioning fields (auto-derived)</h4>
          <ul>{draft.partitioning.map(p => <li key={p}>{p}</li>)}</ul>
          <label>
            Sort direction
            <select
              aria-label="Sort direction"
              value={draft.sort ?? 'asc'}
              onChange={e => setDraft({ ...draft, sort: e.target.value })}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </>
      )}

      <div className="compute-using-actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => onSave(draft)}>Save</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.4 — Add Zustand action.** Open `frontend/src/store.js`. Locate the analyst-pro slice (search for `analystPro` to locate the section). Add slice + action:

```javascript
// in initial state object
analystProTableCalcSpecs: {},  // calcId -> TableCalcSpec

// in actions
setTableCalcComputeUsingAnalystPro: (calcId, spec) =>
  set(state => ({
    analystProTableCalcSpecs: {
      ...state.analystProTableCalcSpecs,
      [calcId]: spec,
    },
  })),
```

- [ ] **Step 9.5 — Run UI tests; expect pass.**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/ComputeUsingDialog.test.jsx`
Expected: 3 PASS.

- [ ] **Step 9.6 — Commit.**

```bash
git add frontend/src/components/dashboard/freeform/panels/ComputeUsingDialog.jsx frontend/src/components/dashboard/freeform/panels/__tests__/ComputeUsingDialog.test.jsx frontend/src/store.js
git commit -m "feat(analyst-pro): Compute Using dialog + setTableCalcComputeUsingAnalystPro action (Plan 8c T9)"
```

---

## Task 10 — `/queries/execute` API extension + integration test + docs + roadmap shipped marker

**Files:**
- Modify: `backend/routers/query_routes.py`
- Create: `backend/tests/test_table_calc_integration.py`
- Create: `docs/TABLE_CALC_GUIDE.md`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` (mark shipped)

- [ ] **Step 10.1 — Write failing integration test.**

```python
# backend/tests/test_table_calc_integration.py
"""End-to-end: RUNNING_SUM lowers to a SQL window; LOOKUP routes to
the client-side evaluator. The /api/v1/queries/execute response
includes table_calc_specs for client-side resolution."""

from fastapi.testclient import TestClient
from main import app
from vizql.table_calc import (
    TableCalcSpec, TableCalcCtx, ServerSideCalc, ClientSideCalc,
    compile_table_calc,
)


def test_running_sum_compiles_to_server_window():
    spec = TableCalcSpec(calc_id="rs", function="RUNNING_SUM",
                         arg_field="Sales", addressing=("Year",))
    out = compile_table_calc(spec, TableCalcCtx(viz_granularity=frozenset({"Year"}),
                                                table_alias="t"))
    assert isinstance(out, ServerSideCalc)
    assert out.plan.frame is not None
    assert out.plan.frame.start == ("UNBOUNDED", 0)


def test_lookup_compiles_to_client_side():
    spec = TableCalcSpec(calc_id="lk", function="LOOKUP",
                         arg_field="Sales", addressing=("Year",), offset=-1)
    out = compile_table_calc(spec, TableCalcCtx(viz_granularity=frozenset({"Year"}),
                                                table_alias="t"))
    assert isinstance(out, ClientSideCalc)
    assert out.spec.offset == -1


def test_execute_request_accepts_table_calc_payload():
    """When the request carries table_calc_specs, the schema parses without
    422 — confirming the additive request fields landed.
    """
    client = TestClient(app)
    resp = client.post("/api/v1/queries/execute",
                       json={"sql": "SELECT 1", "question": "noop",
                             "table_calc_specs": [], "table_calc_filters": []})
    # 401 (no auth) or 200 (demo) both prove the schema accepted the payload.
    # 422 would indicate the new fields were rejected as unknown.
    assert resp.status_code in (200, 401)
```

- [ ] **Step 10.2 — Run; expect fail** (`table_calc_specs` not on `ExecuteRequest`).

Run: `cd backend && python -m pytest tests/test_table_calc_integration.py -v`
Expected: first two PASS, third FAIL on schema mismatch.

- [ ] **Step 10.3 — Extend `ExecuteRequest` and response.** Open `backend/routers/query_routes.py`. Locate `class ExecuteRequest(BaseModel):` (~line 174). Append fields:

```python
    table_calc_specs: list[dict] = Field(default_factory=list)
    table_calc_filters: list[dict] = Field(default_factory=list)
```

Locate the response dict at the end of `execute_sql` (~line 1241 — the dict starting `return {`). Append two keys to the dict:

```python
        "table_calc_specs": req.table_calc_specs,
        "table_calc_filters": req.table_calc_filters,
```

(The backend treats them as opaque pass-through here. Server-side compile of `table_calc_specs` is wired into the VizQL waterfall by Phase 9 plans; Plan 8c lands the wire format and the client-side evaluator.)

- [ ] **Step 10.4 — Run integration tests; expect pass.**

Run: `cd backend && python -m pytest tests/test_table_calc_integration.py -v`
Expected: 3 PASS.

Then full Plan 8c suite + adjacent regression:

Run: `cd backend && python -m pytest tests/test_table_calc.py tests/test_table_calc_filter_placement.py tests/test_table_calc_integration.py -v`
Expected: ALL PASS.

- [ ] **Step 10.5 — Write `docs/TABLE_CALC_GUIDE.md`.**

```markdown
# Table Calculations — Addressing vs Partitioning

> Plan 8c. Reference: `docs/Build_Tableau.md` §V.1 + §V.3.

## Mental model

Two axes control every table calc:

- **Addressing** = the dimensions the calc walks **along**.
  → SQL `ORDER BY` inside the window.
- **Partitioning** = the dimensions the calc **resets** at.
  → SQL `PARTITION BY` inside the window.

Default per §V.3: addressing = "all fields in pane, unordered"
(`IDS_TABLECALC_ORD_PANEUNORDERED`). UI label: "Compute using → Table (across)".

## Visual examples

### Running sum across Year, partitioned by Region

| Region | Year | Sales | RUNNING_SUM(Sales) |
|--------|------|-------|--------------------|
| East   | 2020 | 100   | 100 |
| East   | 2021 | 150   | 250 |
| East   | 2022 | 175   | 425 |
| West   | 2020 | 200   | 200 |  ← resets per Region
| West   | 2021 | 250   | 450 |
| West   | 2022 | 300   | 750 |

Spec:
```json
{ "function": "RUNNING_SUM", "arg_field": "Sales",
  "addressing": ["Year"], "partitioning": ["Region"],
  "direction": "specific", "sort": "asc" }
```

### LOOKUP offset -1 (prior row)

| Region | Year | Sales | LOOKUP(Sales, -1) |
|--------|------|-------|-------------------|
| East   | 2020 | 100   | NULL |
| East   | 2021 | 150   | 100  |
| East   | 2022 | 175   | 150  |
| West   | 2020 | 200   | NULL |  ← resets per Region

LOOKUP runs **client-side** (`tableCalcEvaluator.ts`) because the row-state
walk has no SQL window equivalent that matches Tableau's offset semantics
across all dialects.

## Routing table — server-side vs client-side

| Function family | Side | SQL fn |
|---|---|---|
| RUNNING_* | server | SUM/AVG/MIN/MAX/COUNT + ROWS UNBOUNDED PRECEDING → CURRENT ROW |
| WINDOW_*  | server | matching aggregate (`SUM`, `AVG`, `MEDIAN`, `STDDEV`, `VARIANCE`, `PERCENTILE_CONT`, `CORR`, `COVAR_SAMP`) |
| RANK_*    | server | RANK / DENSE_RANK / ROW_NUMBER / PERCENT_RANK |
| INDEX / FIRST / LAST / SIZE | server | ROW_NUMBER / 1-ROW_NUMBER / COUNT-ROW_NUMBER / COUNT |
| TOTAL / PCT_TOTAL | server | SUM with ROWS UNBOUNDED PRECEDING → UNBOUNDED FOLLOWING |
| LOOKUP / PREVIOUS_VALUE / DIFF / IS_DISTINCT / IS_STACKED | **client** | n/a — pure TS evaluator |

## Filter ordering

Table-calc filters are **stage 8** in the §IV.7 filter pipeline — applied
**after** SQL fetch, **before** render. They never leak into the SQL emitted
by `backend/vizql/logical_to_sql.py`. Use `place_table_calc_filter(predicate)`
in `backend/vizql/filter_ordering.py` to wire one in.

## Compute Using UI

`ComputeUsingDialog.jsx` exposes the §V.3 vocabulary:
- **Table (Across) / Table (Down)** — pane-unordered defaults.
- **Pane (Across) / Pane (Down)** — pane-local addressing.
- **Specific Dimensions** — explicit addressing checklist; remaining
  dimensions become partitioning automatically.

Right-click any table-calc pill → "Compute Using…" → Save calls
`setTableCalcComputeUsingAnalystPro(calcId, spec)`.
```

- [ ] **Step 10.6 — Mark Plan 8c shipped in roadmap.** Open `docs/analyst_pro_tableau_parity_roadmap.md`. Locate `### Plan 8c — Table Calculations` (~line 720). Insert below `**Task count target:** 10.`:

```markdown
**Status:** ✅ Shipped — 2026-04-20. 10 tasks. New modules: `backend/vizql/table_calc.py`, `frontend/src/components/dashboard/freeform/lib/tableCalcEvaluator.ts`, `frontend/src/components/dashboard/freeform/panels/ComputeUsingDialog.jsx`, `docs/TABLE_CALC_GUIDE.md`. Extended: `backend/vizql/filter_ordering.py` (`place_table_calc_filter`), `backend/vizql/spec.py` (`VisualSpec.table_calc_specs`), `backend/proto/askdb/vizdataservice/v1.proto` (field 16 `table_calc_specs` + new `TableCalcSpec` message), `backend/routers/query_routes.py` (`/queries/execute` accepts + echoes `table_calc_specs` + `table_calc_filters`), `frontend/src/store.js` (`setTableCalcComputeUsingAnalystPro`). Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8c-table-calculations.md`.
```

- [ ] **Step 10.7 — Final full-suite check.**

Run: `cd backend && python -m pytest tests/ -v -k "table_calc"`
Expected: ALL Plan 8c tests PASS; pre-existing suites unaffected.

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/tableCalcEvaluator.test.ts src/components/dashboard/freeform/panels/__tests__/ComputeUsingDialog.test.jsx`
Expected: ALL PASS.

- [ ] **Step 10.8 — Commit final task.**

```bash
git add backend/routers/query_routes.py backend/tests/test_table_calc_integration.py docs/TABLE_CALC_GUIDE.md docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "feat(analyst-pro): /queries/execute table_calc passthrough + TABLE_CALC_GUIDE + Plan 8c shipped marker (Plan 8c T10)"
```

---

## Self-review pass

**Spec coverage.** Roadmap §Plan 8c deliverables ↔ tasks:
- (1) Table calc module with addressing + partitioning → T1.
- (2) Functions: RUNNING_*, WINDOW_*, INDEX/FIRST/LAST/SIZE, LOOKUP, PREVIOUS_VALUE, RANK_*, TOTAL, PCT_TOTAL, DIFF, IS_DISTINCT, IS_STACKED → T2 (WINDOW), T3 (RUNNING), T4 (RANK + INDEX/FIRST/LAST/SIZE), T5 (TOTAL/PCT_TOTAL + client-side dispatch).
- (3) Client-side evaluator → T6.
- (4) Compute Using UI → T9.
- (5) Filter stage 8 helper → T7.
- (6) API extension → T10.
- (7) Tests → T2-T10 (TDD per task).
- (8) Documentation → T10.

**Placeholder scan.** No "TBD"/"similar to"/"add error handling" patterns. Every step contains exact code or exact command.

**Type consistency.** `TableCalcSpec` defined T1 with `(calc_id, function, arg_field, addressing, partitioning, direction, sort, offset)` — used identically in T2-T10 and TS counterpart in T6. `ServerSideCalc(plan, output_alias)` / `ClientSideCalc(spec)` consistent. `place_table_calc_filter(predicate, *, case_sensitive, should_affect_totals)` matches `StagedFilter` field set in `filter_ordering.py`.

**Routing-table coverage.** Every name in §V.1 Table calc row maps to exactly one route in `_SERVER_SIDE` / `_CLIENT_SIDE` / `_RUNNING_AGG` / `_WINDOW_AGG` / `_RANK_SQL` / TOTAL handler / INDEX-FIRST-LAST-SIZE handler. No silent fallthroughs (final `raise TableCalcCompileError("unknown table-calc")` covers anything not registered).

**Build_Tableau.md citations preserved.** §V.1 (function list), §V.3 (addressing/partitioning vocab + `IDS_TABLECALC_ORD_PANEUNORDERED` default + SortDirection), §IV.7 step 8 (table-calc filters client-side), §IV.2 (LogicalOpOver) — all referenced in module docstrings and the user-facing guide.

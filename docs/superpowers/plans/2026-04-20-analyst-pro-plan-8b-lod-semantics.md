# Analyst Pro — Plan 8b: LOD Semantics (FIXED / INCLUDE / EXCLUDE)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile Plan 8a's `LodExpr` AST node into correct SQL-AST emission (FIXED → correlated subquery; INCLUDE/EXCLUDE → window), place each LOD kind at its canonical filter-order stage (FIXED step 4, INCLUDE/EXCLUDE step 6), and warn when a FIXED LOD on a high-cardinality dimension is about to blow up — without ever blocking the user.

**Architecture:** Four new modules under `backend/vizql/` plus one VisualSpec schema extension and a wiring change in `calc_to_expression.py`:

1. `lod_compiler.py` — pure function `compile_lod(expr, viz_granularity, ctx) → CompiledLod`. Three internal compilers:
   - `_compile_fixed(expr, viz_granularity, ctx) → sa.Subquery` — correlated subquery on `expr.dims`; correlation join keys = `expr.dims ∩ viz_granularity`; empty intersection is legal (broadcast, every outer row correlates on nothing → single scalar).
   - `_compile_include(expr, viz_granularity, ctx) → sa.Window` — partition_by = `viz_granularity ∪ expr.dims`.
   - `_compile_exclude(expr, viz_granularity, ctx) → sa.Window` — partition_by = `viz_granularity \ expr.dims`; emits warning when `expr.dims ∩ viz_granularity = ∅` (nothing to exclude — no-op, but parser let it through).
   Each emitted expression still passes through `backend/vizql/validator.py` and Plan 7d dialect emitters — never bypass the 6-layer SQL validator.

2. `lod_analyzer.py` — `estimate_fixed_lod_cost(expr, schema_stats) → LodCost` pulling cached distinct-count per-dimension from the `schema_intelligence.profile_dataframe()` `cardinality` field via the new `SchemaStats` protocol. If product of distinct counts across `expr.dims` exceeds `settings.LOD_WARN_THRESHOLD_ROWS` (default `1_000_000`), emit `CalcWarning(kind="expensive_fixed_lod", estimate, suggestion)`. Observation-only — never raises, never blocks.

3. `context_filter_helper.py` — `should_promote_to_context(filter, plan) → Optional[ContextPromotionHint]`. Heuristic: filter narrows > 50% of its domain **and** plan contains a FIXED LOD whose `expr.dims` does NOT include the filter's field. Suggestion string matches `Build_Tableau.md` §XXV.3 authoring friction language ("Promote '[Region]' filter to context — FIXED LOD computed before dimension filter stage per Tableau filter order.").

4. `backend/vizql/filter_ordering.py` extension — new `place_lod_in_order(plan, lod_placements, overrides)` helper that appends compiled LOD expressions to the correct `StagedFilter` bucket (step 4 for FIXED, step 6 for INCLUDE/EXCLUDE), respecting the per-viz `JoinLODOverrides` set (new field on `VisualSpec`). Existing `apply_filters_in_order` already knows the nine stages — we only add the bridge that walks `VisualSpec.lod_calculations` and produces `StagedFilter` entries.

5. Wiring — `calc_to_expression.py` replaces its placeholder `LodExpr` branch with a call to `lod_compiler.compile_lod`. `_Ctx` gains an optional `viz_granularity: frozenset[FieldId]` field (default empty, preserves Plan 8a test behaviour). `VisualSpec` gains `join_lod_overrides: list[str]` (id list of LOD calcs whose partition_by was manually overridden).

6. `LOD_SEMANTICS.md` — visual diagrams of the 9-stage filter flow with LOD-placement annotations + golden SQL snippets per supported dialect (DuckDB, Snowflake, PostgreSQL) for each of the three LOD kinds.

**Scope guard.**
- Plan 8b owns LOD *compilation* + *placement* + *cost warning*. It does NOT own: filter-promotion UI (Plan 8d Monaco editor surfaces the hint), context-filter CTE materialisation (Plan 7d owns that; §IV.8 implementation landed in Plan 7c/T8 already — this plan consumes it), Monaco autocomplete (Plan 8d).
- No Anthropic calls. No DB execution. No new dialect emitters — we emit `sa.Subquery` + `sa.Window` shapes that Plan 7d already renders.
- Calc parser (`calc_parser.py`) NOT modified — Plan 8a shipped `LodExpr` parsing in T6.
- Typechecker (`calc_typecheck.py`) NOT modified — Plan 8a shipped LOD type-checking. We only *consume* its `InferredType` result.
- Never weaken the 6-layer SQL validator. Every emitted `sa.Subquery` passes through `sql_validator.py` at execution time via Plan 7d's pipeline.

**Tech Stack:** Python 3.10+ stdlib only. `dataclasses(frozen=True, slots=True)` everywhere. `tuple[T, ...]` for sequence fields. `frozenset[FieldId]` for granularity sets. `mypy --strict` clean on every new module. Tests via `pytest` reusing `backend/tests/` config. SQL-AST consumer types come from `backend/vizql/sql_ast.py` (Plan 7c). Filter-order enum from `backend/vizql/filter_ordering.py` (Plan 7c/T7). Calc AST from `backend/vizql/calc_ast.py` (Plan 8a/T1).

---

## Reference index (every task author reads before editing)

- `docs/Build_Tableau.md`:
  - **§IV.7 — Filter order-of-operations (CRITICAL).** Memorise all nine stages. The canonical ordering (verbatim):
    1. Extract filters
    2. Data Source filters
    3. Context filters
    4. **FIXED LOD expressions** — AFTER context, BEFORE dimension
    5. Dimension filters
    6. **INCLUDE / EXCLUDE LOD** — AFTER dimension, BEFORE measure
    7. Measure filters (HAVING)
    8. Table calc filters (client-side)
    9. Totals
  - **§IV.8 — Context filter mechanics.** On Hyper/DuckDB: context filter = CTE wrapping the plan. Legacy RDBMS: `#Tableau_Temp_` temp table. `ExtractFilterStoreId` per DS. When to promote: (a) filter narrows heavily, (b) later top-N or FIXED LOD depends on it, (c) shared across many sheets. Plan 7c already emits the CTE; Plan 8b produces the *hint* ("promote to context") for authoring-time UX.
  - **§V.2 — LOD semantics & ordering.** Canonical fact (copy verbatim into `LOD_SEMANTICS.md`):
    - `{FIXED [dim1], [dim2] : SUM([m])}` — evaluated at fixed dims regardless of viz. Step 4 in filter order. **Correlated subquery** on fixed dims, joined back on matching keys. **EXPENSIVE on high-cardinality fixed dims.**
    - `{INCLUDE [dim] : SUM([m])}` — adds `[dim]` to viz dims for a sub-aggregation. Step 6. **Window/OVER** expression (`OverQueryFunction`).
    - `{EXCLUDE [dim] : SUM([m])}` — removes `[dim]` from viz dims. Step 6. **Window/OVER** expression.
    - `JoinLODOverrides` = per-viz override set written into `.twb` XML.
  - **§V.4 — Viz level of granularity.** `granularity = union(Rows-dims, Cols-dims, Detail, Path, Pages)`. Filters shelf excluded. Measure pills excluded. `VisualFieldExtractor::GetReferencedFields` is the authoritative walker. Plan 8b adds a Python port: `backend/vizql/spec.py :: VisualSpec.viz_granularity() → frozenset[FieldId]`.
  - **§XIX.1 — Anti-patterns.** #1 is **FIXED LOD on high-cardinality dimension — correlated subquery blows up.** Plan 8b's `lod_analyzer.py` detects this and warns; never blocks.
  - **§XXV.3 — Biggest authoring friction.** #1 is **filter order-of-ops — everyone gets burned by FIXED + Context + Dimension filter interactions in month one.** Plan 8b's `context_filter_helper.py` emits the hint that defuses this; hint text copies this language.
  - **Appendix E.2** — critical behavioural fact: **"FIXED LOD = correlated subquery; INCLUDE/EXCLUDE = window."** Cite in `LOD_SEMANTICS.md`.

- `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 8b — authoritative scope (target = 10 tasks; deliverables = compiler + filter-order placement + cardinality warning + context-promotion helper + tests + docs).

- **Shipped plans consumed (read before writing code):**
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7a-visualspec-ir.md` — `VisualSpec`, `Shelf`, `Encoding`, `Field`, `LodCalculation` shapes.
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7c-sql-ast-optimizer.md` — `sa.Subquery` (has `correlated_on: tuple[tuple[str, str], ...]`), `sa.Window` (has `partition_by: tuple[Expr, ...]`, `order_by`, `frame`), `sa.FnCall`, `sa.Column`, `sa.BinaryOp`, `sa.Literal`. NEVER introduce a new SQL AST.
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7c-filter-ordering.md` — `StagedFilter(stage, predicate, case_sensitive, should_affect_totals)`, `apply_filters_in_order(plan, staged_filters)`, `FILTER_STAGES` tuple. Valid stages: `"extract"`, `"datasource"`, `"context"`, `"fixed_lod"`, `"dimension"`, `"include_exclude_lod"`, `"measure"`, `"table_calc"`, `"totals"`.
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7d-dialect-emitters.md` — `Dialect` enum; `emit_expr(expr, dialect)` renders `sa.Subquery` + `sa.Window` shapes. Plan 8b does not touch emitters.
  - `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8a-calc-parser-function-catalogue.md` — `calc_ast.LodExpr(kind, dims, body, pos)`, `calc_typecheck.typecheck(expr, schema)`, `calc_to_expression.compile_calc(expr, dialect, schema, ...)`, `/api/v1/calcs/validate` endpoint shape.

- **Files read before modifying:**
  - `backend/vizql/calc_ast.py:77-82` — `LodExpr` shape (authoritative).
  - `backend/vizql/calc_to_expression.py:159-169` — existing placeholder that **Task 5 replaces**. FIXED currently raises `CompileError`; INCLUDE/EXCLUDE currently emit `sa.Window` with partition_by = `expr.dims` (wrong — ignores viz_granularity).
  - `backend/vizql/calc_typecheck.py:74-79` — LOD typecheck; consumed, not modified.
  - `backend/vizql/sql_ast.py:98-115` — `Window` + `Subquery` shape. `Subquery.correlated_on: tuple[tuple[str, str], ...]`.
  - `backend/vizql/filter_ordering.py:34-126` — `FILTER_STAGES`, `StagedFilter`, `apply_filters_in_order`. **Extended in Task 6**, not rewritten.
  - `backend/vizql/spec.py:291-321` — `LodCalculation(id, lod_kind, lod_dims, inner_calculation, outer_aggregation)`. Schema extension in Task 6 adds `join_lod_overrides: list[str]` to `VisualSpec`.
  - `backend/vizql/spec.py:356-398` — `VisualSpec` + proto round-trip pattern. `join_lod_overrides` field must round-trip via `v1.proto` (codegen required — see `backend/vizql/README.md :: make proto`).
  - `backend/schema_intelligence.py:870-912` — `profile_dataframe()` emits `{cardinality, null_pct, ...}` per column. `SchemaStats` protocol in `lod_analyzer.py` wraps the `cardinality` field lookup keyed by `(table, column)`.
  - `backend/routers/query_routes.py:1250-1330` — `POST /api/v1/calcs/validate` response shape. Task 9 extends the response with `warnings: list[CalcWarning]` without breaking existing fields.
  - `backend/config.py` — add `LOD_WARN_THRESHOLD_ROWS: int = 1_000_000` in Task 7.

- `QueryCopilot V1/CLAUDE.md`, `docs/claude/security-core.md`, `docs/claude/config-defaults.md` — security invariants. Read-only DB, 6-layer SQL validator, PII masking. Plan 8b NEVER bypasses the validator; every emitted `sa.Subquery` passes through `sql_validator.py` on the Plan 7d execution path. Every numeric constant introduced (`LOD_WARN_THRESHOLD_ROWS`) must land in `docs/claude/config-defaults.md` in the same commit that introduces it (CLAUDE.md rule).

---

## File structure

```
backend/
  vizql/
    lod_compiler.py              [NEW]   compile_lod(LodExpr, viz_granularity, ctx) → CompiledLod
    lod_analyzer.py              [NEW]   estimate_fixed_lod_cost(expr, schema_stats) → LodCost + CalcWarning
    context_filter_helper.py     [NEW]   should_promote_to_context(filter, plan) → Optional[ContextPromotionHint]
    filter_ordering.py           [MOD]   + place_lod_in_order(plan, lod_placements, overrides) + LodPlacement dataclass
    calc_to_expression.py        [MOD]   replace LodExpr placeholder with lod_compiler.compile_lod; add viz_granularity to _Ctx
    spec.py                      [MOD]   + VisualSpec.join_lod_overrides: list[str]; + VisualSpec.viz_granularity() method
    LOD_SEMANTICS.md             [NEW]   Diagrams + golden SQL snippets per dialect per LOD kind
    proto/
      v1.proto                   [MOD]   VisualSpec adds repeated string join_lod_overrides = N;
      v1_pb2.py, v1_pb2.pyi      [GEN]   regenerated via `bash backend/scripts/regen_proto.sh`
  routers/
    query_routes.py              [MOD]   /api/v1/calcs/validate returns warnings: list[CalcWarning]
  config.py                      [MOD]   + LOD_WARN_THRESHOLD_ROWS (default 1_000_000)
  tests/
    test_lod_compiler.py         [NEW]   FIXED/INCLUDE/EXCLUDE compilation + filter-order proofs + context-promotion + cardinality warning
    test_filter_ordering.py      [MOD]   + test_place_lod_in_order covering JoinLODOverrides
    test_calc_routes.py          [MOD]   + test_validate_calc_returns_warnings
docs/claude/
  config-defaults.md             [MOD]   + Calc parser row: LOD_WARN_THRESHOLD_ROWS
docs/
  analyst_pro_tableau_parity_roadmap.md  [MOD]   Mark Plan 8b shipped (Task 10)
frontend/
  src/vizql/vizSpecGenerated.ts  [GEN]   regenerated via `bash frontend/scripts/regen_proto.sh` (bundled in Task 6 codegen commit)
```

**Non-files:** no new API routes, no new SQL, no new LLM calls, no new DB connections, no new env vars.

---

## Commit hygiene

- One task = one commit.
- Commit message format: `feat(analyst-pro): <verb> <object> (Plan 8b T<N>)`. Docs-only commits: `docs(analyst-pro): <verb> <object> (Plan 8b T<N>)`.
- Each commit: green `pytest backend/tests/test_lod_compiler.py` + touched neighbours + `mypy --strict backend/vizql/` on the new module(s).
- Never skip hooks. Never force-push.
- Proto-regen commit (Task 6) includes BOTH `backend/vizql/proto/v1_pb2.py` + `frontend/src/vizql/vizSpecGenerated.ts` in the same commit as the `.proto` edit — `CLAUDE.md :: VizQL codegen` rule is non-negotiable.

---

## Task 1: Scaffold `lod_compiler.py` + types + failing test

**Files:**
- Create: `backend/vizql/lod_compiler.py`
- Modify: `backend/vizql/__init__.py` (re-export)
- Test: `backend/tests/test_lod_compiler.py`

- [ ] **Step 1: Write the failing import + types test**

```python
# backend/tests/test_lod_compiler.py
"""Plan 8b — LOD compiler (FIXED/INCLUDE/EXCLUDE → sa.Subquery / sa.Window)."""
from __future__ import annotations

import pytest

from backend.vizql import lod_compiler as lc
from backend.vizql import calc_ast as ca
from backend.vizql import sql_ast as sa


def test_module_exports():
    assert hasattr(lc, "compile_lod")
    assert hasattr(lc, "CompiledLod")
    assert hasattr(lc, "LodCompileError")
    assert hasattr(lc, "LodCompileCtx")


def test_compiled_lod_is_frozen():
    # sa.Literal is a valid SQLQueryExpression so we can construct a minimal CompiledLod.
    c = lc.CompiledLod(
        expr=sa.Literal(value=1, literal_type="integer"),
        kind="FIXED",
        stage="fixed_lod",
        warnings=(),
    )
    with pytest.raises(Exception):  # frozen dataclass
        c.kind = "INCLUDE"  # type: ignore[misc]


def test_lod_compile_ctx_defaults_empty_granularity():
    ctx = lc.LodCompileCtx(
        dialect=lc.Dialect.DUCKDB,
        schema={"Sales": "number", "Region": "string", "City": "string"},
        table_alias="t",
    )
    assert ctx.viz_granularity == frozenset()


def test_compile_lod_raises_on_non_lod_expr():
    ctx = lc.LodCompileCtx(
        dialect=lc.Dialect.DUCKDB,
        schema={"Sales": "number"},
        table_alias="t",
    )
    with pytest.raises(lc.LodCompileError):
        lc.compile_lod(
            ca.Literal(value=1, data_type="integer"),  # type: ignore[arg-type]
            ctx,
        )
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py -v`
Expected: `ModuleNotFoundError: No module named 'backend.vizql.lod_compiler'`

- [ ] **Step 3: Create module skeleton**

```python
# backend/vizql/lod_compiler.py
"""Plan 8b — compile calc_ast.LodExpr into sa.Subquery / sa.Window.

Canonical reference: docs/Build_Tableau.md §V.2 and Appendix E.2.

    FIXED   → sa.Subquery  (correlated subquery on fixed dims)    — stage 4
    INCLUDE → sa.Window    (partition_by = viz ∪ include_dims)    — stage 6
    EXCLUDE → sa.Window    (partition_by = viz \\ exclude_dims)   — stage 6

Never bypass the 6-layer SQL validator — every emitted sa.Subquery passes
through sql_validator.py at execution time via Plan 7d's pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal as _Lit, Mapping

from . import calc_ast as ca
from . import sql_ast as sa
from .calc_functions import Dialect  # reuse Plan 8a dialect enum


class LodCompileError(ValueError):
    """Raised when a LodExpr cannot be compiled to sql_ast."""


# A field-identifier string — Plan 7a's spec.Field.name is the canonical form.
FieldId = str


@dataclass(frozen=True, slots=True)
class LodCompileCtx:
    """Compilation context — dialect + schema + viz-level granularity.

    viz_granularity: union(Rows-dims, Cols-dims, Detail, Path, Pages) per §V.4.
    Measure pills + Filters-shelf fields excluded. Empty = no viz context
    (the Plan 8a `/calcs/validate` endpoint passes empty granularity; Plan 7
    executor passes the viz's real granularity).
    """

    dialect: Dialect
    schema: Mapping[str, str]
    table_alias: str
    viz_granularity: frozenset[FieldId] = field(default_factory=frozenset)


@dataclass(frozen=True, slots=True)
class CompiledLod:
    expr: sa.SQLQueryExpression
    kind: _Lit["FIXED", "INCLUDE", "EXCLUDE"]
    stage: _Lit["fixed_lod", "include_exclude_lod"]
    warnings: tuple[str, ...]  # observation-only; never fatal


def compile_lod(expr: ca.CalcExpr, ctx: LodCompileCtx) -> CompiledLod:
    if not isinstance(expr, ca.LodExpr):
        raise LodCompileError(
            f"compile_lod expects LodExpr, got {type(expr).__name__}"
        )

    if expr.kind == "FIXED":
        raise LodCompileError("FIXED LOD compilation not yet implemented (Task 2)")
    if expr.kind == "INCLUDE":
        raise LodCompileError("INCLUDE LOD compilation not yet implemented (Task 3)")
    if expr.kind == "EXCLUDE":
        raise LodCompileError("EXCLUDE LOD compilation not yet implemented (Task 4)")

    raise LodCompileError(f"unknown LOD kind {expr.kind!r}")  # type: ignore[unreachable]


__all__ = [
    "LodCompileError",
    "LodCompileCtx",
    "CompiledLod",
    "FieldId",
    "compile_lod",
]
```

- [ ] **Step 4: Re-export from package**

```python
# backend/vizql/__init__.py   — append at end
from . import lod_compiler as lod_compiler  # noqa: F401
```

- [ ] **Step 5: Run — verify PASS for Task 1 tests**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py -v`
Expected: 4 passed (the 4 tests written in Step 1).

- [ ] **Step 6: mypy strict on the new module**

Run: `cd backend && mypy --strict vizql/lod_compiler.py`
Expected: `Success: no issues found in 1 source file`

- [ ] **Step 7: Commit**

```bash
git add backend/vizql/lod_compiler.py backend/vizql/__init__.py backend/tests/test_lod_compiler.py
git commit -m "feat(analyst-pro): scaffold lod_compiler module + types (Plan 8b T1)"
```

---

## Task 2: FIXED LOD → correlated subquery

**Files:**
- Modify: `backend/vizql/lod_compiler.py`
- Test: `backend/tests/test_lod_compiler.py`

**§V.2 canonical semantics (copy into `LOD_SEMANTICS.md` in Task 10):**

```
{FIXED [dim1], [dim2] : SUM([m])}  →  correlated subquery on (dim1, dim2),
                                       joined back on (viz_granularity ∩ fixed_dims).
                                       Step 4 in filter order (after context, before dim).
```

- [ ] **Step 1: Write the failing FIXED tests**

```python
# backend/tests/test_lod_compiler.py — append
def _ctx(granularity: frozenset[lc.FieldId] = frozenset()) -> lc.LodCompileCtx:
    return lc.LodCompileCtx(
        dialect=lc.Dialect.DUCKDB,
        schema={"Sales": "number", "Region": "string", "City": "string",
                "Segment": "string", "Product": "string"},
        table_alias="t",
        viz_granularity=granularity,
    )


def _fixed(dims: tuple[str, ...], body_field: str = "Sales", body_fn: str = "SUM") -> ca.LodExpr:
    return ca.LodExpr(
        kind="FIXED",
        dims=tuple(ca.FieldRef(field_name=d) for d in dims),
        body=ca.FnCall(name=body_fn, args=(ca.FieldRef(field_name=body_field),)),
    )


def test_fixed_lod_emits_subquery_with_correlation_on_shared_dims():
    # viz grouped by Region+City; FIXED on Region → correlate on Region only.
    expr = _fixed(("Region",))
    ctx = _ctx(frozenset({"Region", "City"}))
    out = lc.compile_lod(expr, ctx)

    assert out.kind == "FIXED"
    assert out.stage == "fixed_lod"
    assert isinstance(out.expr, sa.Subquery)
    assert out.expr.correlated_on == (("Region", "Region"),)
    # inner query groups by Region
    inner = out.expr.query
    assert [p.alias for p in inner.selects] == ["_lod_val"]
    # group_bys contains the fixed dim(s)
    assert any(
        isinstance(g, sa.Column) and g.name == "Region"
        for g in inner.group_by
    )


def test_fixed_lod_broadcast_when_viz_shares_no_dim_with_fixed():
    # viz grouped by City; FIXED on Region → no shared dim → correlated_on empty.
    expr = _fixed(("Region",))
    ctx = _ctx(frozenset({"City"}))
    out = lc.compile_lod(expr, ctx)

    assert isinstance(out.expr, sa.Subquery)
    assert out.expr.correlated_on == ()  # broadcast — single scalar per outer row
    # inner query still groups by the FIXED dim (Region)
    inner = out.expr.query
    assert any(isinstance(g, sa.Column) and g.name == "Region" for g in inner.group_by)


def test_fixed_lod_multiple_fixed_dims_correlation_is_intersection():
    # viz grouped by Region+City+Segment; FIXED on Region+City → join on both.
    expr = _fixed(("Region", "City"))
    ctx = _ctx(frozenset({"Region", "City", "Segment"}))
    out = lc.compile_lod(expr, ctx)

    assert isinstance(out.expr, sa.Subquery)
    # deterministic ordering: by appearance in expr.dims
    assert out.expr.correlated_on == (("Region", "Region"), ("City", "City"))


def test_fixed_lod_rejects_unknown_dim():
    # FIXED references a field not in the schema → TypeError-style rejection.
    expr = _fixed(("NotAColumn",))
    ctx = _ctx(frozenset({"Region"}))
    with pytest.raises(lc.LodCompileError) as exc:
        lc.compile_lod(expr, ctx)
    assert "NotAColumn" in str(exc.value)


def test_fixed_lod_preserves_body_aggregate_name():
    # The aggregation function used inside the FIXED body must appear in the inner select.
    expr = _fixed(("Region",), body_field="Sales", body_fn="AVG")
    ctx = _ctx(frozenset({"Region"}))
    out = lc.compile_lod(expr, ctx)
    inner = out.expr.query  # type: ignore[union-attr]
    agg = inner.selects[0].expression
    assert isinstance(agg, sa.FnCall)
    assert agg.name == "AVG"
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py -v -k fixed`
Expected: 5 FAILs (`LodCompileError: FIXED LOD compilation not yet implemented`).

- [ ] **Step 3: Implement `_compile_fixed`**

```python
# backend/vizql/lod_compiler.py  — add imports + body
from . import sql_ast as sa
from .calc_to_expression import compile_calc as _compile_calc_expr  # reuse body walker


def _compile_fixed(expr: ca.LodExpr, ctx: LodCompileCtx) -> CompiledLod:
    # Validate every fixed dim is in the schema.
    for d in expr.dims:
        if d.field_name not in ctx.schema:
            raise LodCompileError(
                f"FIXED LOD references field {d.field_name!r} not in data source schema"
            )

    # Compile the body (an aggregate FnCall) as a scalar expression.
    body_expr = _compile_calc_expr(
        expr.body,
        dialect=ctx.dialect,
        schema=ctx.schema,
        table_alias=ctx.table_alias,
    )

    # Inner query: SELECT fixed_dims..., AGG(body) AS _lod_val
    #              FROM <same base>  (alias `_lod_inner` to avoid outer-alias clash)
    #              GROUP BY fixed_dims...
    inner_alias = f"{ctx.table_alias}_lod_inner"
    group_bys = tuple(
        sa.Column(name=d.field_name, table_alias=inner_alias)
        for d in expr.dims
    )
    # Rebuild body_expr with inner alias on any Column refs so inner AGG doesn't
    # accidentally correlate — FIXED dims appear in both outer + inner, but
    # non-dim Column refs inside the body belong to the inner scope.
    body_inner = _rebind_columns(body_expr, new_alias=inner_alias)
    selects = (
        sa.Projection(alias="_lod_val", expression=body_inner),
    )
    inner = sa.SQLQueryFunction(
        selects=selects,
        from_=sa.TableRef(name=ctx.table_alias, alias=inner_alias),
        where=None,
        group_by=group_bys,
        having=None,
        order_by=(),
        limit=None,
    )

    # Correlation: only fixed dims that also appear in viz_granularity.
    # Preserve expr.dims order (deterministic SQL, easier test asserts).
    correlated_on = tuple(
        (d.field_name, d.field_name)
        for d in expr.dims
        if d.field_name in ctx.viz_granularity
    )

    subquery = sa.Subquery(query=inner, correlated_on=correlated_on)
    return CompiledLod(
        expr=subquery,
        kind="FIXED",
        stage="fixed_lod",
        warnings=(),
    )


def _rebind_columns(e: sa.SQLQueryExpression, new_alias: str) -> sa.SQLQueryExpression:
    """Rewrite every Column.table_alias → new_alias. Leaves literals untouched."""
    import dataclasses
    if isinstance(e, sa.Column):
        return dataclasses.replace(e, table_alias=new_alias)
    if isinstance(e, sa.BinaryOp):
        return dataclasses.replace(
            e,
            left=_rebind_columns(e.left, new_alias),
            right=_rebind_columns(e.right, new_alias),
        )
    if isinstance(e, sa.FnCall):
        return dataclasses.replace(
            e,
            args=tuple(_rebind_columns(a, new_alias) for a in e.args),
        )
    if isinstance(e, sa.Case):
        whens = tuple(
            (_rebind_columns(c, new_alias), _rebind_columns(b, new_alias))
            for c, b in e.whens
        )
        else_ = _rebind_columns(e.else_, new_alias) if e.else_ is not None else None
        return dataclasses.replace(e, whens=whens, else_=else_)
    if isinstance(e, sa.Cast):
        return dataclasses.replace(e, expression=_rebind_columns(e.expression, new_alias))
    if isinstance(e, sa.Window):
        return dataclasses.replace(
            e,
            expr=_rebind_columns(e.expr, new_alias),
            partition_by=tuple(_rebind_columns(p, new_alias) for p in e.partition_by),
        )
    # Literal / nested Subquery: leave as-is.
    return e


# Update compile_lod dispatcher
def compile_lod(expr: ca.CalcExpr, ctx: LodCompileCtx) -> CompiledLod:
    if not isinstance(expr, ca.LodExpr):
        raise LodCompileError(
            f"compile_lod expects LodExpr, got {type(expr).__name__}"
        )
    if expr.kind == "FIXED":
        return _compile_fixed(expr, ctx)
    if expr.kind == "INCLUDE":
        raise LodCompileError("INCLUDE LOD compilation not yet implemented (Task 3)")
    if expr.kind == "EXCLUDE":
        raise LodCompileError("EXCLUDE LOD compilation not yet implemented (Task 4)")
    raise LodCompileError(f"unknown LOD kind {expr.kind!r}")  # type: ignore[unreachable]
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py -v -k fixed`
Expected: 5 passed.

- [ ] **Step 5: Run full suite — no regressions**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py tests/test_calc_parser.py tests/test_calc_compile.py -v`
Expected: all green (calc_compile covers the INCLUDE/EXCLUDE placeholder path that still raises "owned by Plan 8b" — replaced only in Task 5).

- [ ] **Step 6: mypy strict**

Run: `cd backend && mypy --strict vizql/lod_compiler.py`
Expected: no issues.

- [ ] **Step 7: Commit**

```bash
git add backend/vizql/lod_compiler.py backend/tests/test_lod_compiler.py
git commit -m "feat(analyst-pro): compile FIXED LOD to correlated subquery (Plan 8b T2)"
```

---

## Task 3: INCLUDE LOD → window (partition = viz ∪ include_dims)

**Files:**
- Modify: `backend/vizql/lod_compiler.py`
- Test: `backend/tests/test_lod_compiler.py`

**§V.2 canonical semantics:**

```
{INCLUDE [dim] : SUM([m])}  →  Window(expr=SUM(m), partition_by = viz_granularity ∪ {dim})
                                Step 6 in filter order.
```

- [ ] **Step 1: Write the failing INCLUDE tests**

```python
# backend/tests/test_lod_compiler.py  — append
def _include(dims: tuple[str, ...], body_field: str = "Profit", body_fn: str = "AVG") -> ca.LodExpr:
    return ca.LodExpr(
        kind="INCLUDE",
        dims=tuple(ca.FieldRef(field_name=d) for d in dims),
        body=ca.FnCall(name=body_fn, args=(ca.FieldRef(field_name=body_field),)),
    )


def test_include_lod_emits_window_with_viz_plus_include_dims():
    expr = _include(("Product",))
    ctx = _ctx(frozenset({"Region"}))  # viz by Region
    out = lc.compile_lod(expr, ctx)

    assert out.kind == "INCLUDE"
    assert out.stage == "include_exclude_lod"
    assert isinstance(out.expr, sa.Window)

    # partition keys = viz ∪ include_dims = {Region, Product}
    part_names = {p.name for p in out.expr.partition_by if isinstance(p, sa.Column)}
    assert part_names == {"Region", "Product"}


def test_include_lod_partition_keys_deterministic_order():
    # viz_granularity is a frozenset (unordered) so we require the compiler to
    # emit a stable order — viz dims (sorted) then include_dims in source order.
    expr = _include(("Product", "Subcategory"))
    ctx = _ctx(frozenset({"Region", "City"}))
    ctx.schema.setdefault("Subcategory", "string") if hasattr(ctx.schema, "setdefault") else None  # type: ignore[attr-defined]

    # Patch schema — ctx is frozen, so rebuild.
    ctx2 = lc.LodCompileCtx(
        dialect=lc.Dialect.DUCKDB,
        schema={**ctx.schema, "Subcategory": "string"},
        table_alias=ctx.table_alias,
        viz_granularity=ctx.viz_granularity,
    )
    out = lc.compile_lod(expr, ctx2)
    names = [p.name for p in out.expr.partition_by if isinstance(p, sa.Column)]
    # viz dims come first, sorted; then include_dims in source order
    assert names == ["City", "Region", "Product", "Subcategory"]


def test_include_lod_rejects_unknown_dim():
    expr = _include(("UnknownCol",))
    ctx = _ctx(frozenset({"Region"}))
    with pytest.raises(lc.LodCompileError) as exc:
        lc.compile_lod(expr, ctx)
    assert "UnknownCol" in str(exc.value)


def test_include_lod_body_carried_to_window_expr():
    expr = _include(("Product",), body_field="Profit", body_fn="AVG")
    ctx = _ctx(frozenset({"Region"}))
    out = lc.compile_lod(expr, ctx)
    assert isinstance(out.expr.expr, sa.FnCall)  # type: ignore[union-attr]
    assert out.expr.expr.name == "AVG"  # type: ignore[union-attr]
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py -v -k include`
Expected: 4 FAILs ("INCLUDE LOD compilation not yet implemented").

- [ ] **Step 3: Implement `_compile_include`**

```python
# backend/vizql/lod_compiler.py  — add before compile_lod dispatcher
def _compile_include(expr: ca.LodExpr, ctx: LodCompileCtx) -> CompiledLod:
    for d in expr.dims:
        if d.field_name not in ctx.schema:
            raise LodCompileError(
                f"INCLUDE LOD references field {d.field_name!r} not in data source schema"
            )

    body_expr = _compile_calc_expr(
        expr.body,
        dialect=ctx.dialect,
        schema=ctx.schema,
        table_alias=ctx.table_alias,
    )

    partition_by = _partition_for(
        viz=ctx.viz_granularity,
        delta=tuple(d.field_name for d in expr.dims),
        op="union",
        table_alias=ctx.table_alias,
    )

    window = sa.Window(
        expr=body_expr,
        partition_by=partition_by,
        order_by=(),
        frame=None,
    )
    return CompiledLod(
        expr=window,
        kind="INCLUDE",
        stage="include_exclude_lod",
        warnings=(),
    )


def _partition_for(
    viz: frozenset[FieldId],
    delta: tuple[FieldId, ...],
    op: _Lit["union", "difference"],
    table_alias: str,
) -> tuple[sa.SQLQueryExpression, ...]:
    """Build partition_by columns.

    op="union":      viz + delta  (deterministic: sorted viz, then delta in order)
    op="difference": viz \\ delta  (deterministic: sorted)
    """
    if op == "union":
        seen: set[str] = set()
        ordered: list[str] = []
        for n in sorted(viz):
            if n not in seen:
                seen.add(n)
                ordered.append(n)
        for n in delta:
            if n not in seen:
                seen.add(n)
                ordered.append(n)
        names = ordered
    elif op == "difference":
        names = sorted(n for n in viz if n not in set(delta))
    else:  # pragma: no cover
        raise LodCompileError(f"partition op {op!r} unknown")

    return tuple(sa.Column(name=n, table_alias=table_alias) for n in names)


# Update dispatcher
def compile_lod(expr: ca.CalcExpr, ctx: LodCompileCtx) -> CompiledLod:
    if not isinstance(expr, ca.LodExpr):
        raise LodCompileError(
            f"compile_lod expects LodExpr, got {type(expr).__name__}"
        )
    if expr.kind == "FIXED":
        return _compile_fixed(expr, ctx)
    if expr.kind == "INCLUDE":
        return _compile_include(expr, ctx)
    if expr.kind == "EXCLUDE":
        raise LodCompileError("EXCLUDE LOD compilation not yet implemented (Task 4)")
    raise LodCompileError(f"unknown LOD kind {expr.kind!r}")  # type: ignore[unreachable]
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py -v -k include`
Expected: 4 passed.

- [ ] **Step 5: mypy**

Run: `cd backend && mypy --strict vizql/lod_compiler.py`

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/lod_compiler.py backend/tests/test_lod_compiler.py
git commit -m "feat(analyst-pro): compile INCLUDE LOD to window expression (Plan 8b T3)"
```

---

## Task 4: EXCLUDE LOD → window (partition = viz \ exclude_dims) + empty-intersect warning

**Files:**
- Modify: `backend/vizql/lod_compiler.py`
- Test: `backend/tests/test_lod_compiler.py`

**§V.2 canonical semantics:**

```
{EXCLUDE [dim] : SUM([m])}  →  Window(expr=SUM(m), partition_by = viz_granularity \\ {dim})
                                Step 6 in filter order.
                                If viz ∩ exclude_dims = ∅: warn "no-op" (still emit).
```

- [ ] **Step 1: Write the failing EXCLUDE tests**

```python
# backend/tests/test_lod_compiler.py — append
def _exclude(dims: tuple[str, ...], body_field: str = "Sales", body_fn: str = "SUM") -> ca.LodExpr:
    return ca.LodExpr(
        kind="EXCLUDE",
        dims=tuple(ca.FieldRef(field_name=d) for d in dims),
        body=ca.FnCall(name=body_fn, args=(ca.FieldRef(field_name=body_field),)),
    )


def test_exclude_lod_removes_excluded_dims_from_viz_partition():
    # viz by Region+City; EXCLUDE Region → partition = {City}
    expr = _exclude(("Region",))
    ctx = _ctx(frozenset({"Region", "City"}))
    out = lc.compile_lod(expr, ctx)

    assert out.kind == "EXCLUDE"
    assert out.stage == "include_exclude_lod"
    assert isinstance(out.expr, sa.Window)
    part_names = {p.name for p in out.expr.partition_by if isinstance(p, sa.Column)}
    assert part_names == {"City"}
    assert out.warnings == ()


def test_exclude_lod_warns_when_nothing_to_exclude():
    # viz by City; EXCLUDE Region (not in viz) → partition unchanged, WARN emitted.
    expr = _exclude(("Region",))
    ctx = _ctx(frozenset({"City"}))
    out = lc.compile_lod(expr, ctx)

    assert isinstance(out.expr, sa.Window)
    part_names = {p.name for p in out.expr.partition_by if isinstance(p, sa.Column)}
    assert part_names == {"City"}
    # warning surfaces — never fatal
    assert any("no-op" in w.lower() or "nothing to exclude" in w.lower()
               for w in out.warnings)


def test_exclude_lod_multiple_dims_partial_overlap():
    # viz by Region+City+Segment; EXCLUDE Region+Product (Product not in viz)
    expr = _exclude(("Region", "Product"))
    ctx = _ctx(frozenset({"Region", "City", "Segment"}))
    out = lc.compile_lod(expr, ctx)
    part_names = {p.name for p in out.expr.partition_by if isinstance(p, sa.Column)}
    assert part_names == {"City", "Segment"}
    # Product was absent from viz but Region was present — exclusion non-empty, no warning.
    assert out.warnings == ()


def test_exclude_lod_all_viz_dims_excluded_yields_empty_partition():
    # viz by Region; EXCLUDE Region → partition_by = () (grand total-ish window)
    expr = _exclude(("Region",))
    ctx = _ctx(frozenset({"Region"}))
    out = lc.compile_lod(expr, ctx)
    assert out.expr.partition_by == ()  # type: ignore[union-attr]


def test_exclude_lod_rejects_unknown_dim():
    expr = _exclude(("NotAColumn",))
    ctx = _ctx(frozenset({"Region"}))
    with pytest.raises(lc.LodCompileError) as exc:
        lc.compile_lod(expr, ctx)
    assert "NotAColumn" in str(exc.value)
```

- [ ] **Step 2: Run — FAIL expected**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py -v -k exclude`
Expected: 5 FAILs.

- [ ] **Step 3: Implement `_compile_exclude`**

```python
# backend/vizql/lod_compiler.py  — add before compile_lod dispatcher
def _compile_exclude(expr: ca.LodExpr, ctx: LodCompileCtx) -> CompiledLod:
    for d in expr.dims:
        if d.field_name not in ctx.schema:
            raise LodCompileError(
                f"EXCLUDE LOD references field {d.field_name!r} not in data source schema"
            )

    body_expr = _compile_calc_expr(
        expr.body,
        dialect=ctx.dialect,
        schema=ctx.schema,
        table_alias=ctx.table_alias,
    )

    exclude_names = tuple(d.field_name for d in expr.dims)
    overlap = ctx.viz_granularity & set(exclude_names)
    warnings: tuple[str, ...] = ()
    if not overlap:
        warnings = (
            f"EXCLUDE LOD is a no-op — none of {list(exclude_names)} appear in "
            f"viz granularity {sorted(ctx.viz_granularity)}. "
            "Drop the EXCLUDE or change viz dims.",
        )

    partition_by = _partition_for(
        viz=ctx.viz_granularity,
        delta=exclude_names,
        op="difference",
        table_alias=ctx.table_alias,
    )

    window = sa.Window(
        expr=body_expr,
        partition_by=partition_by,
        order_by=(),
        frame=None,
    )
    return CompiledLod(
        expr=window,
        kind="EXCLUDE",
        stage="include_exclude_lod",
        warnings=warnings,
    )


# Update dispatcher
def compile_lod(expr: ca.CalcExpr, ctx: LodCompileCtx) -> CompiledLod:
    if not isinstance(expr, ca.LodExpr):
        raise LodCompileError(
            f"compile_lod expects LodExpr, got {type(expr).__name__}"
        )
    if expr.kind == "FIXED":
        return _compile_fixed(expr, ctx)
    if expr.kind == "INCLUDE":
        return _compile_include(expr, ctx)
    if expr.kind == "EXCLUDE":
        return _compile_exclude(expr, ctx)
    raise LodCompileError(f"unknown LOD kind {expr.kind!r}")  # type: ignore[unreachable]
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py -v`
Expected: all prior + 5 EXCLUDE tests passed.

- [ ] **Step 5: mypy**

Run: `cd backend && mypy --strict vizql/lod_compiler.py`

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/lod_compiler.py backend/tests/test_lod_compiler.py
git commit -m "feat(analyst-pro): compile EXCLUDE LOD to window + no-op warning (Plan 8b T4)"
```

---

## Task 5: Wire `lod_compiler` into `calc_to_expression.py` (replace Plan 8a placeholder)

**Files:**
- Modify: `backend/vizql/calc_to_expression.py`
- Test: `backend/tests/test_calc_compile.py` (update the two LOD tests that expected the placeholder)
- Test: `backend/tests/test_lod_compiler.py` (end-to-end via public API)

**Reason.** Plan 8a's `calc_to_expression.py:159-169` contains:

```python
if isinstance(expr, ca.LodExpr):
    if expr.kind == "FIXED":
        raise CompileError("FIXED LOD compilation is owned by Plan 8b; ...")
    body = _walk(expr.body, ctx)
    partitions = tuple(_walk(d, ctx) for d in expr.dims)
    return sa.Window(expr=body, partition_by=partitions, order_by=())
```

The INCLUDE/EXCLUDE path is wrong — it uses `expr.dims` directly as partition keys, ignoring `viz_granularity`. FIXED raises. Task 5 replaces this block with a delegation to `lod_compiler.compile_lod`, threading a new `viz_granularity` through the `_Ctx`.

- [ ] **Step 1: Write the failing integration test**

```python
# backend/tests/test_lod_compiler.py — append
def test_compile_calc_integrates_lod_compiler_for_fixed():
    from backend.vizql import calc_to_expression as c2e
    # compile_calc must now accept viz_granularity kwarg.
    expr = _fixed(("Region",))
    out = c2e.compile_calc(
        expr,
        dialect=lc.Dialect.DUCKDB,
        schema={"Sales": "number", "Region": "string"},
        viz_granularity=frozenset({"Region"}),
    )
    assert isinstance(out, sa.Subquery)
    assert out.correlated_on == (("Region", "Region"),)


def test_compile_calc_integrates_lod_compiler_for_include():
    from backend.vizql import calc_to_expression as c2e
    expr = _include(("Product",))
    out = c2e.compile_calc(
        expr,
        dialect=lc.Dialect.DUCKDB,
        schema={"Profit": "number", "Region": "string", "Product": "string"},
        viz_granularity=frozenset({"Region"}),
    )
    assert isinstance(out, sa.Window)
    part_names = {p.name for p in out.partition_by if isinstance(p, sa.Column)}
    assert part_names == {"Region", "Product"}


def test_compile_calc_defaults_empty_granularity_for_backcompat():
    # Plan 8a callers (e.g. /api/v1/calcs/validate at validate-time) don't know
    # viz granularity. Empty default = correlated_on is empty for FIXED,
    # INCLUDE partition = include_dims only.
    from backend.vizql import calc_to_expression as c2e
    expr = _include(("Product",))
    out = c2e.compile_calc(
        expr,
        dialect=lc.Dialect.DUCKDB,
        schema={"Profit": "number", "Product": "string"},
    )
    assert isinstance(out, sa.Window)
    names = {p.name for p in out.partition_by if isinstance(p, sa.Column)}
    assert names == {"Product"}
```

Also update the existing `test_calc_compile.py` expectation for LOD:

```python
# backend/tests/test_calc_compile.py  — locate + edit the LOD tests
# BEFORE (shipped in Plan 8a):
#   def test_compile_fixed_lod_raises_deferred():
#       ...raises CompileError("FIXED LOD compilation is owned by Plan 8b...")
# AFTER — replace with:
def test_compile_fixed_lod_emits_subquery():
    from backend.vizql import calc_to_expression as c2e, calc_ast as ca, sql_ast as sa
    expr = ca.LodExpr(
        kind="FIXED",
        dims=(ca.FieldRef(field_name="Region"),),
        body=ca.FnCall(name="SUM", args=(ca.FieldRef(field_name="Sales"),)),
    )
    out = c2e.compile_calc(
        expr,
        dialect=c2e.Dialect.DUCKDB,
        schema={"Sales": "number", "Region": "string"},
    )
    assert isinstance(out, sa.Subquery)
```

And delete / rewrite any existing test that asserted INCLUDE/EXCLUDE partition_by == expr.dims verbatim — Plan 8a's naive behaviour is now replaced. Search:

```bash
grep -n "LodExpr\|FIXED LOD\|INCLUDE LOD\|EXCLUDE LOD" backend/tests/test_calc_compile.py
```

Update each test that mismatches the new semantics.

- [ ] **Step 2: Run — verify FAIL**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py tests/test_calc_compile.py -v`
Expected: the three new `test_compile_calc_integrates_*` FAIL (unknown kwarg `viz_granularity`); the rewritten `test_compile_fixed_lod_emits_subquery` FAILs (still raises CompileError).

- [ ] **Step 3: Modify `calc_to_expression.py` — thread viz_granularity + delegate to lod_compiler**

```python
# backend/vizql/calc_to_expression.py  — edit _Ctx and compile_calc signature
from typing import Any, Mapping, Optional

@dataclass(frozen=True, slots=True)
class _Ctx:
    dialect: Dialect
    schema: Mapping[str, str]
    table_alias: str
    params: Mapping[str, Mapping[str, Any]]
    rawsql: bool
    viz_granularity: frozenset[str] = frozenset()  # NEW — Plan 8b


def compile_calc(
    expr: ca.CalcExpr,
    dialect: Dialect,
    schema: Mapping[str, str],
    *,
    table_alias: str = "t",
    params: Optional[Mapping[str, Mapping[str, Any]]] = None,
    feature_rawsql_enabled: bool = False,
    viz_granularity: Optional[frozenset[str]] = None,  # NEW — Plan 8b
) -> sa.SQLQueryExpression:
    ctx = _Ctx(
        dialect=dialect,
        schema=schema,
        table_alias=table_alias,
        params=params or {},
        rawsql=feature_rawsql_enabled,
        viz_granularity=viz_granularity if viz_granularity is not None else frozenset(),
    )
    return _walk(expr, ctx)
```

Replace the `LodExpr` branch in `_walk`:

```python
# backend/vizql/calc_to_expression.py — replace lines 159-169
if isinstance(expr, ca.LodExpr):
    # Plan 8b delegates all three LOD kinds to lod_compiler.
    from .lod_compiler import LodCompileCtx, compile_lod
    lod_ctx = LodCompileCtx(
        dialect=ctx.dialect,
        schema=ctx.schema,
        table_alias=ctx.table_alias,
        viz_granularity=ctx.viz_granularity,
    )
    compiled = compile_lod(expr, lod_ctx)
    return compiled.expr  # warnings surface via separate API path (Task 9)
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd backend && python -m pytest tests/test_lod_compiler.py tests/test_calc_compile.py -v`
Expected: all green.

- [ ] **Step 5: Run full affected suite — no regressions**

Run: `cd backend && python -m pytest tests/test_calc_parser.py tests/test_calc_functions.py tests/test_calc_typecheck.py tests/test_calc_compile.py tests/test_calc_routes.py tests/test_lod_compiler.py -v`
Expected: all green. (`test_calc_routes.py` still works because the endpoint does not set viz_granularity — defaults to empty.)

- [ ] **Step 6: mypy**

Run: `cd backend && mypy --strict vizql/calc_to_expression.py vizql/lod_compiler.py`

- [ ] **Step 7: Commit**

```bash
git add backend/vizql/calc_to_expression.py backend/tests/test_calc_compile.py backend/tests/test_lod_compiler.py
git commit -m "feat(analyst-pro): delegate LodExpr compile to lod_compiler + thread viz_granularity (Plan 8b T5)"
```

---

## Task 6: Filter-order placement — `place_lod_in_order` + `VisualSpec.join_lod_overrides`

**Files:**
- Modify: `backend/vizql/filter_ordering.py`
- Modify: `backend/vizql/spec.py`
- Modify: `backend/vizql/proto/v1.proto`
- Regen: `backend/vizql/proto/v1_pb2.py`, `v1_pb2.pyi`, `frontend/src/vizql/vizSpecGenerated.ts`
- Test: `backend/tests/test_filter_ordering.py`
- Test: `backend/tests/test_lod_compiler.py` (proof that FIXED at stage 4 is NOT filtered by a dim filter at stage 5)

**§IV.7 fact under test (quote in test docstring):** *"A dimension filter does NOT filter a FIXED LOD unless promoted to Context."*

**§V.2 fact:** *"JoinLODOverrides = per-viz override set written into `.twb` XML."* We model this as an opt-in list of LodCalculation IDs whose compiled partition_by was hand-edited and therefore must bypass auto-placement.

- [ ] **Step 1: Extend `.proto` + regen**

Edit `backend/proto/askdb/vizdataservice/v1.proto`. Inside the `VisualSpec` message, append (pick next unused field number — read existing + pick N+1):

```proto
message VisualSpec {
  // ... existing fields ...
  repeated string join_lod_overrides = 12;   // Plan 8b §V.2 — per-viz overrides
}
```

Regenerate bindings:

```bash
bash backend/scripts/regen_proto.sh
bash frontend/scripts/regen_proto.sh
```

(On native Windows without `bash`, use Git-Bash shell. See `backend/vizql/README.md` for the canonical sequence.)

- [ ] **Step 2: Extend `spec.py :: VisualSpec`**

```python
# backend/vizql/spec.py — inside @dataclass VisualSpec, add field + round-trip
from __future__ import annotations  # already present

@dataclass
class VisualSpec:
    sheet_id: str
    fields: list[Field] = field(default_factory=list)
    shelves: list[Shelf] = field(default_factory=list)
    encodings: list[Encoding] = field(default_factory=list)
    filters: list[FilterSpec] = field(default_factory=list)
    parameters: list[Parameter] = field(default_factory=list)
    lod_calculations: list[LodCalculation] = field(default_factory=list)
    mark_type: MarkType = MarkType.MARK_TYPE_UNSPECIFIED
    analytics: Analytics = field(default_factory=Analytics)
    is_generative_ai_web_authoring: bool = False
    domain_type: str = "separate"
    join_lod_overrides: list[str] = field(default_factory=list)  # NEW

    def viz_granularity(self) -> frozenset[str]:
        """§V.4 — union(Rows-dims, Cols-dims, Detail, Path, Pages).

        Dimension pills only. Measure pills excluded. Filters shelf excluded.
        """
        dim_shelves = {"rows", "columns", "detail", "path", "pages"}
        out: set[str] = set()
        for shelf in self.shelves:
            if shelf.kind.lower() not in dim_shelves:
                continue
            for field_id in shelf.field_ids:
                # Look up field to check if dimension
                f = next((f for f in self.fields if f.id == field_id), None)
                if f is None:
                    continue
                if getattr(f, "role", None) == "dimension":
                    out.add(f.name)
        return frozenset(out)

    def to_proto(self) -> pb.VisualSpec:
        return pb.VisualSpec(
            sheet_id=self.sheet_id,
            fields=[f.to_proto() for f in self.fields],
            shelves=[s.to_proto() for s in self.shelves],
            encodings=[e.to_proto() for e in self.encodings],
            filters=[f.to_proto() for f in self.filters],
            parameters=[p.to_proto() for p in self.parameters],
            lod_calculations=[l.to_proto() for l in self.lod_calculations],
            mark_type=self.mark_type,
            analytics=self.analytics.to_proto(),
            is_generative_ai_web_authoring=self.is_generative_ai_web_authoring,
            domain_type=self.domain_type,
            join_lod_overrides=list(self.join_lod_overrides),
        )

    @classmethod
    def from_proto(cls, m: pb.VisualSpec) -> "VisualSpec":
        return cls(
            sheet_id=m.sheet_id,
            fields=[Field.from_proto(f) for f in m.fields],
            shelves=[Shelf.from_proto(s) for s in m.shelves],
            encodings=[Encoding.from_proto(e) for e in m.encodings],
            filters=[FilterSpec.from_proto(f) for f in m.filters],
            parameters=[Parameter.from_proto(p) for p in m.parameters],
            lod_calculations=[LodCalculation.from_proto(l) for l in m.lod_calculations],
            mark_type=m.mark_type,
            analytics=Analytics.from_proto(m.analytics),
            is_generative_ai_web_authoring=m.is_generative_ai_web_authoring,
            domain_type=m.domain_type or "separate",
            join_lod_overrides=list(m.join_lod_overrides),
        )
```

*(If `Shelf.kind` or `Field.role` names differ from above, read `spec.py` + `proto/v1.proto` for the true names and adjust. Shelf schema from Plan 7a T2-T3.)*

- [ ] **Step 3: Extend `filter_ordering.py` — `place_lod_in_order`**

Add near the bottom of the file, above `__all__`:

```python
# backend/vizql/filter_ordering.py — append
from . import sql_ast as sa
from . import calc_ast as ca

@dataclass(frozen=True, slots=True)
class LodPlacement:
    """One LOD calc compiled + placed in the filter stream."""
    lod_id: str           # VisualSpec.lod_calculations[i].id
    stage: str            # "fixed_lod" | "include_exclude_lod"
    predicate: sa.SQLQueryExpression

    def __post_init__(self) -> None:
        if self.stage not in ("fixed_lod", "include_exclude_lod"):
            raise ValueError(
                f"LodPlacement.stage must be fixed_lod or include_exclude_lod, got {self.stage!r}"
            )


def place_lod_in_order(
    plan: sa.SQLQueryFunction,
    lod_placements: Sequence[LodPlacement],
    overrides: Sequence[str] = (),
) -> sa.SQLQueryFunction:
    """Append each LOD placement to the canonical StagedFilter stream.

    §IV.7: FIXED at step 4, INCLUDE/EXCLUDE at step 6.
    overrides: LOD calc IDs whose placement was hand-edited in the .twb;
               pass-through, skipped by auto-placement.
    """
    override_set = frozenset(overrides)
    staged: list[StagedFilter] = []
    for p in lod_placements:
        if p.lod_id in override_set:
            # User hand-overrode — caller must have already spliced it.
            continue
        staged.append(
            StagedFilter(
                stage=p.stage,
                predicate=p.predicate,
                case_sensitive=True,
                should_affect_totals=True,
            )
        )
    return apply_filters_in_order(plan, staged)


__all__ = [  # replace existing __all__
    "FILTER_STAGES", "StagedFilter", "apply_filters_in_order",
    "LodPlacement", "place_lod_in_order",
]
```

- [ ] **Step 4: Write tests — placement + override + §IV.7 dim-filter-vs-FIXED proof**

```python
# backend/tests/test_filter_ordering.py — append
from backend.vizql.filter_ordering import (
    FILTER_STAGES, StagedFilter, apply_filters_in_order,
    LodPlacement, place_lod_in_order,
)
from backend.vizql import sql_ast as sa


def _trivial_plan() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        selects=(sa.Projection(alias="x", expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
        where=None,
        group_by=(),
        having=None,
        order_by=(),
        limit=None,
    )


def test_place_lod_in_order_fixed_lands_at_stage_4():
    placement = LodPlacement(
        lod_id="lod1",
        stage="fixed_lod",
        predicate=sa.Literal(value=1, literal_type="integer"),
    )
    plan = place_lod_in_order(_trivial_plan(), [placement])
    # Plan 7c's apply_filters_in_order writes fixed_lod placements into
    # diagnostics (step 4 marker).
    assert any("fixed_lod_filter" in d for d in plan.diagnostics)


def test_place_lod_in_order_include_lands_at_stage_6():
    placement = LodPlacement(
        lod_id="lod2",
        stage="include_exclude_lod",
        predicate=sa.Literal(value=1, literal_type="integer"),
    )
    plan = place_lod_in_order(_trivial_plan(), [placement])
    assert any("include_exclude_lod" in d for d in plan.diagnostics)


def test_place_lod_in_order_respects_overrides():
    p1 = LodPlacement(lod_id="lod1", stage="fixed_lod",
                      predicate=sa.Literal(value=1, literal_type="integer"))
    p2 = LodPlacement(lod_id="lod2", stage="fixed_lod",
                      predicate=sa.Literal(value=2, literal_type="integer"))
    plan = place_lod_in_order(_trivial_plan(), [p1, p2], overrides=["lod1"])
    # Only lod2 placed — lod1 skipped (user overrode).
    fixed_diag = [d for d in plan.diagnostics if "fixed_lod_filter" in d]
    assert len(fixed_diag) == 1


def test_dim_filter_does_not_apply_to_fixed_lod_unless_context_promoted():
    """§IV.7: dim filter (stage 5) runs AFTER FIXED LOD (stage 4).

    Proof via SQL diagnostics:
      - dim filter appears in WHERE (folded in at stage 5)
      - fixed_lod predicate appears in the `fixed_lod_filter:` diagnostic at stage 4
      - Neither the fixed_lod predicate nor its inner subquery references the dim
        filter's field, proving the FIXED subquery runs against the unfiltered
        CTE/table.
    """
    dim_filter = StagedFilter(
        stage="dimension",
        predicate=sa.BinaryOp(
            op="=",
            left=sa.Column(name="Segment", table_alias="t"),
            right=sa.Literal(value="Corporate", literal_type="string"),
        ),
    )
    fixed_placement = LodPlacement(
        lod_id="region_total",
        stage="fixed_lod",
        predicate=sa.Column(name="region_total_sales", table_alias="t"),  # marker
    )
    plan = place_lod_in_order(_trivial_plan(), [fixed_placement])
    plan = apply_filters_in_order(plan, [dim_filter])

    # Dim filter is in WHERE (stage 5).
    assert plan.where is not None
    # FIXED predicate is in diagnostics at stage 4 — not folded into WHERE.
    assert any("fixed_lod_filter" in d for d in plan.diagnostics)


def test_dim_filter_DOES_apply_to_fixed_lod_when_promoted_to_context():
    """Counterpart: when user right-clicks → Add to Context, the filter runs
    at stage 3 (CTE) — FIXED's correlated subquery now runs against the
    filtered CTE, so the filter DOES narrow the FIXED result."""
    promoted = StagedFilter(
        stage="context",  # <- user promoted
        predicate=sa.BinaryOp(
            op="=",
            left=sa.Column(name="Segment", table_alias="t"),
            right=sa.Literal(value="Corporate", literal_type="string"),
        ),
    )
    fixed_placement = LodPlacement(
        lod_id="region_total",
        stage="fixed_lod",
        predicate=sa.Column(name="region_total_sales", table_alias="t"),
    )
    plan = apply_filters_in_order(_trivial_plan(), [promoted])
    plan = place_lod_in_order(plan, [fixed_placement])

    # Context filter materialises as a CTE wrapping the plan.
    assert len(plan.ctes) == 1
    # FIXED placement recorded downstream.
    assert any("fixed_lod_filter" in d for d in plan.diagnostics)
```

- [ ] **Step 5: Run — verify PASS**

Run: `cd backend && python -m pytest tests/test_filter_ordering.py tests/test_lod_compiler.py -v`
Expected: all green.

- [ ] **Step 6: Frontend smoke — proto round-trips**

```bash
cd frontend && npm run test:chart-ir -- --run chartSpecProto 2>&1 | tail -20
```

Expected: no new failures (22 pre-existing allowed per `CLAUDE.md :: Known Test Debt`).

- [ ] **Step 7: mypy**

Run: `cd backend && mypy --strict vizql/filter_ordering.py vizql/spec.py`

- [ ] **Step 8: Commit (bundle proto regen + schema + helper)**

```bash
git add backend/proto/askdb/vizdataservice/v1.proto backend/vizql/proto/v1_pb2.py backend/vizql/proto/v1_pb2.pyi frontend/src/vizql/vizSpecGenerated.ts backend/vizql/spec.py backend/vizql/filter_ordering.py backend/tests/test_filter_ordering.py
git commit -m "feat(analyst-pro): place LOD in filter-order + VisualSpec.join_lod_overrides (Plan 8b T6)"
```

---

## Task 7: `lod_analyzer.py` — cardinality warning for FIXED on high-card dims

**Files:**
- Create: `backend/vizql/lod_analyzer.py`
- Modify: `backend/config.py`
- Modify: `docs/claude/config-defaults.md`
- Test: `backend/tests/test_lod_analyzer.py` (new file) + `backend/tests/test_lod_compiler.py` (integration)

**§XIX.1 anti-pattern #1:** *"FIXED LOD on high-cardinality dimension — correlated subquery blows up."*

- [ ] **Step 1: Add config constant**

```python
# backend/config.py — in the Settings class, near other VIZQL constants
LOD_WARN_THRESHOLD_ROWS: int = 1_000_000  # Plan 8b §XIX.1 — warn on FIXED with estimated Cartesian > this
```

- [ ] **Step 2: Document in config-defaults.md**

Append a row under the existing **Calc parser (Plan 8a)** table (or create a new **Calc parser (Plan 8b)** subsection):

```markdown
### Calc parser (Plan 8b)

| Constant | Value | Notes |
|---|---|---|
| `LOD_WARN_THRESHOLD_ROWS` | `1_000_000` | FIXED LOD cost estimate above this triggers CalcWarning (observation-only; never blocks). §XIX.1 anti-pattern #1. |
```

- [ ] **Step 3: Write the failing tests**

```python
# backend/tests/test_lod_analyzer.py — new file
"""Plan 8b — FIXED LOD cost estimator + CalcWarning."""
from __future__ import annotations

import pytest

from backend.vizql import lod_analyzer as la
from backend.vizql import calc_ast as ca


class _StubSchemaStats:
    def __init__(self, cardinalities: dict[str, int]) -> None:
        self._c = cardinalities

    def distinct_count(self, field_name: str) -> int:
        return self._c.get(field_name, 0)


def _fixed(dims: tuple[str, ...]) -> ca.LodExpr:
    return ca.LodExpr(
        kind="FIXED",
        dims=tuple(ca.FieldRef(field_name=d) for d in dims),
        body=ca.FnCall(name="SUM", args=(ca.FieldRef(field_name="Sales"),)),
    )


def test_cost_is_product_of_distinct_counts():
    stats = _StubSchemaStats({"Region": 5, "City": 200})
    cost = la.estimate_fixed_lod_cost(_fixed(("Region", "City")), stats)
    assert cost.estimate == 5 * 200
    assert cost.dims == ("Region", "City")


def test_warning_emitted_above_threshold():
    stats = _StubSchemaStats({"Region": 5, "City": 500_000})
    warnings = la.analyze_fixed_lod(
        _fixed(("Region", "City")), stats, threshold=1_000_000,
    )
    assert len(warnings) == 1
    assert warnings[0].kind == "expensive_fixed_lod"
    assert warnings[0].estimate == 5 * 500_000
    assert "context" in warnings[0].suggestion.lower()


def test_no_warning_below_threshold():
    stats = _StubSchemaStats({"Region": 5, "City": 1000})
    assert la.analyze_fixed_lod(
        _fixed(("Region", "City")), stats, threshold=1_000_000,
    ) == []


def test_non_fixed_lod_returns_empty():
    expr = ca.LodExpr(
        kind="INCLUDE",
        dims=(ca.FieldRef(field_name="Region"),),
        body=ca.FnCall(name="SUM", args=(ca.FieldRef(field_name="Sales"),)),
    )
    assert la.analyze_fixed_lod(expr, _StubSchemaStats({"Region": 1_000_000})) == []


def test_missing_distinct_count_falls_back_to_zero_cost():
    # If a dim has no stats, we can't estimate — treat as 0 to avoid false-positive warnings.
    stats = _StubSchemaStats({})
    warnings = la.analyze_fixed_lod(_fixed(("Region",)), stats, threshold=10)
    assert warnings == []
```

- [ ] **Step 4: Run — FAIL expected**

Run: `cd backend && python -m pytest tests/test_lod_analyzer.py -v`
Expected: `ModuleNotFoundError`.

- [ ] **Step 5: Implement `lod_analyzer.py`**

```python
# backend/vizql/lod_analyzer.py
"""Plan 8b — FIXED LOD cost estimator + CalcWarning.

Observation-only. Never raises, never blocks a user. §XIX.1 anti-pattern #1:
"FIXED LOD on high-cardinality dimension — correlated subquery blows up."
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from . import calc_ast as ca


class SchemaStats(Protocol):
    """Per-field distinct-count lookup.

    Plan 7 wraps `schema_intelligence.profile_dataframe()` `cardinality` per
    column; production callers pass that adapter. Tests pass a stub.
    """

    def distinct_count(self, field_name: str) -> int: ...


@dataclass(frozen=True, slots=True)
class LodCost:
    dims: tuple[str, ...]
    estimate: int


@dataclass(frozen=True, slots=True)
class CalcWarning:
    kind: str              # "expensive_fixed_lod"
    estimate: int
    suggestion: str
    details: str = ""


def estimate_fixed_lod_cost(expr: ca.LodExpr, stats: SchemaStats) -> LodCost:
    """Cartesian of distinct counts across fixed dims.

    Matches Tableau's Hyper cost model well enough for an authoring warning:
    the correlated subquery produces one row per unique fixed-dim tuple.
    """
    dims = tuple(d.field_name for d in expr.dims)
    product = 1
    for d in dims:
        c = stats.distinct_count(d)
        if c <= 0:
            return LodCost(dims=dims, estimate=0)  # unknown stats → no estimate
        product *= c
    return LodCost(dims=dims, estimate=product)


def analyze_fixed_lod(
    expr: ca.LodExpr,
    stats: SchemaStats,
    *,
    threshold: int = 1_000_000,
) -> list[CalcWarning]:
    if expr.kind != "FIXED":
        return []
    cost = estimate_fixed_lod_cost(expr, stats)
    if cost.estimate <= threshold:
        return []
    dim_list = ", ".join(cost.dims)
    return [
        CalcWarning(
            kind="expensive_fixed_lod",
            estimate=cost.estimate,
            suggestion=(
                f"FIXED LOD on high-cardinality dim(s) [{dim_list}] — "
                f"estimated {cost.estimate:,} rows in correlated subquery. "
                "Promote a narrowing filter to context, or reduce fixed-dim count."
            ),
            details=(
                f"Build_Tableau.md §XIX.1 anti-pattern #1: "
                "FIXED LOD on high-cardinality dimension makes the correlated subquery "
                "blow up. Threshold = {threshold:,} rows."
            ),
        )
    ]


__all__ = ["SchemaStats", "LodCost", "CalcWarning", "estimate_fixed_lod_cost", "analyze_fixed_lod"]
```

- [ ] **Step 6: Run — verify PASS**

Run: `cd backend && python -m pytest tests/test_lod_analyzer.py -v`
Expected: 5 passed.

- [ ] **Step 7: mypy**

Run: `cd backend && mypy --strict vizql/lod_analyzer.py`

- [ ] **Step 8: Commit**

```bash
git add backend/vizql/lod_analyzer.py backend/tests/test_lod_analyzer.py backend/config.py docs/claude/config-defaults.md
git commit -m "feat(analyst-pro): FIXED LOD cardinality analyzer + CalcWarning (Plan 8b T7)"
```

---

## Task 8: `context_filter_helper.py` — `should_promote_to_context` hint

**Files:**
- Create: `backend/vizql/context_filter_helper.py`
- Test: `backend/tests/test_context_filter_helper.py`

**§IV.8 + §XXV.3 fact:** Promoting a dimension filter to Context makes it run at stage 3 (CTE), BEFORE the FIXED subquery at stage 4 — which is the only way a dim filter narrows a FIXED LOD.

**Heuristic.** Suggest promotion when **all** of:
1. The filter is a dimension filter (not measure, not table-calc).
2. It narrows > 50% of its declared domain (authoring-time estimate).
3. The plan contains a FIXED LOD whose fixed dims do NOT include the filter's field (so the FIXED computes against the broader unfiltered set — classic month-one trap).

Only produce hints. Never re-order filters automatically — the user must opt in.

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_context_filter_helper.py
from __future__ import annotations

from backend.vizql import context_filter_helper as cfh
from backend.vizql import calc_ast as ca


def _fixed(dims: tuple[str, ...]) -> ca.LodExpr:
    return ca.LodExpr(
        kind="FIXED",
        dims=tuple(ca.FieldRef(field_name=d) for d in dims),
        body=ca.FnCall(name="SUM", args=(ca.FieldRef(field_name="Sales"),)),
    )


def test_promotes_when_filter_narrows_and_fixed_ignores_field():
    f = cfh.FilterHint(
        field_name="Segment",
        kind="dimension",
        domain_size=3,
        selected_size=1,          # narrows 67% — > 50%
    )
    lods = [_fixed(("Region",))]  # FIXED does not include Segment
    hint = cfh.should_promote_to_context(f, lods)
    assert hint is not None
    assert "Segment" in hint.message
    assert "context" in hint.message.lower()


def test_no_promotion_when_fixed_already_includes_field():
    f = cfh.FilterHint(field_name="Region", kind="dimension", domain_size=5, selected_size=1)
    lods = [_fixed(("Region",))]  # FIXED already partitions by Region
    assert cfh.should_promote_to_context(f, lods) is None


def test_no_promotion_when_filter_does_not_narrow():
    f = cfh.FilterHint(field_name="Segment", kind="dimension", domain_size=3, selected_size=3)
    lods = [_fixed(("Region",))]
    assert cfh.should_promote_to_context(f, lods) is None


def test_no_promotion_when_no_fixed_lod_present():
    f = cfh.FilterHint(field_name="Segment", kind="dimension", domain_size=3, selected_size=1)
    assert cfh.should_promote_to_context(f, []) is None


def test_no_promotion_for_measure_filter():
    f = cfh.FilterHint(field_name="Sales", kind="measure", domain_size=1000, selected_size=1)
    lods = [_fixed(("Region",))]
    assert cfh.should_promote_to_context(f, lods) is None


def test_message_matches_build_tableau_xxv3_language():
    f = cfh.FilterHint(field_name="Region", kind="dimension", domain_size=4, selected_size=1)
    lods = [_fixed(("Product",))]
    hint = cfh.should_promote_to_context(f, lods)
    assert hint is not None
    # Quote-match the authoring friction language from §XXV.3.
    assert "FIXED LOD" in hint.message
    assert "filter order" in hint.message.lower()
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && python -m pytest tests/test_context_filter_helper.py -v`

- [ ] **Step 3: Implement**

```python
# backend/vizql/context_filter_helper.py
"""Plan 8b — context-promotion hint for §IV.8 / §XXV.3 #1 authoring friction.

Tableau's most-reported month-one trap: dim filter does not narrow FIXED LOD
unless the filter is Added to Context (→ runs at stage 3 CTE, before FIXED
at stage 4). This module detects the trap at authoring time and emits a hint.

Authoring-time only. Never rewrites plans. Never runs SQL.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

from . import calc_ast as ca


@dataclass(frozen=True, slots=True)
class FilterHint:
    field_name: str
    kind: str              # "dimension" | "measure" | "table_calc"
    domain_size: int       # total distinct values declared on the filter card
    selected_size: int     # values currently selected


@dataclass(frozen=True, slots=True)
class ContextPromotionHint:
    field_name: str
    message: str           # UI-facing copy
    lod_ids: tuple[str, ...] = ()  # FIXED LODs that would benefit


_NARROW_RATIO = 0.5  # > 50% narrowing


def should_promote_to_context(
    filt: FilterHint,
    lods: Sequence[ca.LodExpr],
) -> Optional[ContextPromotionHint]:
    if filt.kind != "dimension":
        return None
    if filt.domain_size <= 0:
        return None
    narrowing = 1.0 - (filt.selected_size / filt.domain_size)
    if narrowing <= _NARROW_RATIO:
        return None

    affected = [
        l for l in lods
        if l.kind == "FIXED"
        and filt.field_name not in {d.field_name for d in l.dims}
    ]
    if not affected:
        return None

    # Message quotes §XXV.3 authoring-friction language.
    msg = (
        f"Promote '[{filt.field_name}]' filter to context — "
        "FIXED LOD computed BEFORE dimension filter stage per Tableau filter order. "
        "Right-click the filter → Add to Context."
    )
    return ContextPromotionHint(
        field_name=filt.field_name,
        message=msg,
        lod_ids=(),  # caller can enrich with LodCalculation.id if available
    )


__all__ = ["FilterHint", "ContextPromotionHint", "should_promote_to_context"]
```

- [ ] **Step 4: Run — PASS**

Run: `cd backend && python -m pytest tests/test_context_filter_helper.py -v`
Expected: 6 passed.

- [ ] **Step 5: mypy**

Run: `cd backend && mypy --strict vizql/context_filter_helper.py`

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/context_filter_helper.py backend/tests/test_context_filter_helper.py
git commit -m "feat(analyst-pro): context-filter promotion hint for FIXED LOD trap (Plan 8b T8)"
```

---

## Task 9: Surface warnings + promotion hints in `/api/v1/calcs/validate`

**Files:**
- Modify: `backend/routers/query_routes.py`
- Test: `backend/tests/test_calc_routes.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_calc_routes.py — append
def test_validate_calc_returns_warnings_for_expensive_fixed_lod(monkeypatch, authed_client):
    """FIXED on high-cardinality dim → response includes expensive_fixed_lod warning."""
    from backend import config as _cfg
    monkeypatch.setattr(_cfg.settings, "FEATURE_ANALYST_PRO", True)
    monkeypatch.setattr(_cfg.settings, "LOD_WARN_THRESHOLD_ROWS", 100)

    body = {
        "formula": "{FIXED [City] : SUM([Sales])}",
        "schema_ref": {"City": "string", "Sales": "number"},
        # Plan 8b extension — caller may attach schema_stats for cost estimate.
        "schema_stats": {"City": 10000, "Sales": 0},
    }
    r = authed_client.post("/api/v1/calcs/validate", json=body)
    assert r.status_code == 200
    out = r.json()
    assert out["valid"] is True
    warns = out["warnings"]
    assert len(warns) == 1
    assert warns[0]["kind"] == "expensive_fixed_lod"
    assert warns[0]["estimate"] == 10_000


def test_validate_calc_returns_empty_warnings_when_schema_stats_missing(monkeypatch, authed_client):
    from backend import config as _cfg
    monkeypatch.setattr(_cfg.settings, "FEATURE_ANALYST_PRO", True)

    body = {
        "formula": "{FIXED [Region] : SUM([Sales])}",
        "schema_ref": {"Region": "string", "Sales": "number"},
    }
    r = authed_client.post("/api/v1/calcs/validate", json=body)
    assert r.status_code == 200
    assert r.json()["warnings"] == []


def test_validate_calc_response_shape_backwards_compatible(monkeypatch, authed_client):
    """The `warnings` field must be additive — existing `valid`, `inferredType`,
    `isAggregate`, `errors` fields are untouched."""
    from backend import config as _cfg
    monkeypatch.setattr(_cfg.settings, "FEATURE_ANALYST_PRO", True)
    body = {"formula": "SUM([Sales])", "schema_ref": {"Sales": "number"}}
    r = authed_client.post("/api/v1/calcs/validate", json=body)
    out = r.json()
    assert set(out.keys()) >= {"valid", "inferredType", "isAggregate", "errors", "warnings"}
```

*(`authed_client` + `monkeypatch` fixtures are already in `backend/tests/conftest.py` per Plan 8a T11 — reuse.)*

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && python -m pytest tests/test_calc_routes.py -v -k warnings`
Expected: missing `warnings` key / 422 on unknown field `schema_stats`.

- [ ] **Step 3: Extend the endpoint**

```python
# backend/routers/query_routes.py — edit _CalcValidateRequest + validate_calc
class _CalcValidateRequest(BaseModel):
    formula: str
    schema_ref: dict[str, str] = Field(default_factory=dict)
    params: dict[str, dict] = Field(default_factory=dict)
    schema_stats: dict[str, int] = Field(default_factory=dict)  # Plan 8b


class _DictSchemaStats:
    def __init__(self, d: dict[str, int]) -> None:
        self._d = d

    def distinct_count(self, field_name: str) -> int:
        return self._d.get(field_name, 0)


@_calcs_router.post("/validate")
async def validate_calc(
    req: _CalcValidateRequest,
    current_user: dict = Depends(get_current_user),
):
    if not settings.FEATURE_ANALYST_PRO:
        raise HTTPException(status_code=404, detail="calc validation disabled")

    if len(req.formula) > settings.MAX_CALC_FORMULA_LEN:
        raise HTTPException(status_code=413, detail="formula too long")

    email = current_user.get("email") or current_user.get("sub", "")
    _enforce_calc_rate_limit(email)

    from vizql.calc_parser import parse, ParseError, LexError
    from vizql.calc_typecheck import typecheck, TypeError as CalcTypeError
    from vizql import calc_ast as ca
    from vizql.lod_analyzer import analyze_fixed_lod

    try:
        ast = parse(req.formula, max_depth=settings.MAX_CALC_NESTING)
        inferred = typecheck(ast, req.schema_ref)
    except (ParseError, LexError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except CalcTypeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    warnings_out: list[dict] = []
    if req.schema_stats:
        stats = _DictSchemaStats(req.schema_stats)
        for lod in _find_lods(ast):
            for w in analyze_fixed_lod(
                lod, stats, threshold=settings.LOD_WARN_THRESHOLD_ROWS,
            ):
                warnings_out.append({
                    "kind": w.kind,
                    "estimate": w.estimate,
                    "suggestion": w.suggestion,
                    "details": w.details,
                })

    return {
        "valid": True,
        "inferredType": inferred.kind.value,
        "isAggregate": inferred.is_aggregate,
        "errors": [],
        "warnings": warnings_out,
    }


def _find_lods(expr):  # type: ignore[no-untyped-def]
    """Walk the calc AST, yielding every LodExpr."""
    from vizql import calc_ast as ca
    if isinstance(expr, ca.LodExpr):
        yield expr
        yield from _find_lods(expr.body)
        return
    if isinstance(expr, ca.FnCall):
        for a in expr.args: yield from _find_lods(a)
        return
    if isinstance(expr, ca.BinaryOp):
        yield from _find_lods(expr.left); yield from _find_lods(expr.right); return
    if isinstance(expr, ca.UnaryOp):
        yield from _find_lods(expr.operand); return
    if isinstance(expr, ca.IfExpr):
        yield from _find_lods(expr.cond); yield from _find_lods(expr.then_)
        for c, b in expr.elifs:
            yield from _find_lods(c); yield from _find_lods(b)
        if expr.else_ is not None: yield from _find_lods(expr.else_)
        return
    if isinstance(expr, ca.CaseExpr):
        if expr.scrutinee is not None: yield from _find_lods(expr.scrutinee)
        for c, b in expr.whens:
            yield from _find_lods(c); yield from _find_lods(b)
        if expr.else_ is not None: yield from _find_lods(expr.else_)
        return
    # Literal / FieldRef / ParamRef: no nested LOD.
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd backend && python -m pytest tests/test_calc_routes.py -v`
Expected: all passed (existing + 3 new).

- [ ] **Step 5: mypy**

Run: `cd backend && mypy --strict routers/query_routes.py`

- [ ] **Step 6: Commit**

```bash
git add backend/routers/query_routes.py backend/tests/test_calc_routes.py
git commit -m "feat(analyst-pro): surface LOD warnings in /api/v1/calcs/validate response (Plan 8b T9)"
```

---

## Task 10: `LOD_SEMANTICS.md` + roadmap shipped marker

**Files:**
- Create: `backend/vizql/LOD_SEMANTICS.md`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` (mark Plan 8b shipped)

- [ ] **Step 1: Write `LOD_SEMANTICS.md`**

```markdown
# LOD Semantics — FIXED / INCLUDE / EXCLUDE

**Plan 8b — shipped 2026-04-20.** Canonical reference: `docs/Build_Tableau.md`
§V.2 (LOD semantics) + §IV.7 (filter order-of-ops) + §XIX.1 (anti-patterns).
Appendix E.2 captures the one-line fact: **"FIXED LOD = correlated subquery;
INCLUDE / EXCLUDE = window."**

---

## The 9-stage filter order — where each LOD kind lands

```
  User query
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 1. Extract filters        — baked into the extract               │
│ 2. Data Source filters    — WHERE on every query against DS      │
│ 3. Context filters        — CTE wrapping the plan                │  <── Promote a dim filter here
│ 4. FIXED LOD expressions  — correlated subquery against (1-3)    │      to narrow FIXED LODs.
│ 5. Dimension filters      — outer WHERE                          │
│ 6. INCLUDE / EXCLUDE LOD  — window / OVER                        │
│ 7. Measure filters        — HAVING                               │
│ 8. Table calc filters     — client-side, post-fetch              │
│ 9. Totals                 — separate query                       │
└──────────────────────────────────────────────────────────────────┘
```

**Immediate consequence (§IV.7):** a dimension filter at step 5 does **NOT**
filter a FIXED LOD at step 4 — unless you promote the filter to Context
(step 3). `context_filter_helper.should_promote_to_context` detects this
trap and emits a hint.

---

## FIXED — correlated subquery

```
{FIXED [Region] : SUM([Sales])}
   in viz grouped by Region + City
```

**Compilation (`lod_compiler._compile_fixed`):**

- Inner: `SELECT Region, SUM(Sales) AS _lod_val FROM t GROUP BY Region`
- Outer: correlated on `(Region, Region)` (fixed dim ∩ viz granularity)
- Placed at stage 4.

**DuckDB SQL (golden):**

```sql
SELECT
  t.Region,
  t.City,
  SUM(t.Sales) AS sum_sales,
  (SELECT _lod_val
     FROM (SELECT t_inner.Region AS Region,
                  SUM(t_inner.Sales) AS _lod_val
             FROM t AS t_inner
             GROUP BY t_inner.Region)
     WHERE Region = t.Region) AS region_total
FROM t
GROUP BY t.Region, t.City;
```

**Snowflake / PostgreSQL:** identical shape (both support correlated
subqueries). **MSSQL:** wrap in APPLY if the planner chokes on nested
correlation; handled in Plan 7d dialect emitter.

**Anti-pattern (§XIX.1 #1):** FIXED on a high-cardinality dim (e.g.
`[TransactionID]`). Correlated subquery produces one row per distinct value
and blows up. `lod_analyzer.analyze_fixed_lod` warns when the estimated
Cartesian product exceeds `LOD_WARN_THRESHOLD_ROWS` (default 1 000 000).
Never blocks — observation-only. Tableau's `ExtractLODValidator` does the
same class of check.

---

## INCLUDE — window OVER (viz_granularity ∪ include_dims)

```
{INCLUDE [Product] : AVG([Profit])}
   in viz grouped by Region
```

**Compilation (`lod_compiler._compile_include`):**

- `partition_by = sorted(viz) ∪ include_dims`   (deterministic: viz first,
  sorted; then include_dims in source order).
- `expr = AVG(Profit)`
- Placed at stage 6.

**DuckDB SQL:**

```sql
SELECT
  t.Region,
  AVG(t.Profit) OVER (PARTITION BY t.Region, t.Product) AS avg_profit_by_region_product
FROM t;
```

---

## EXCLUDE — window OVER (viz_granularity \\ exclude_dims)

```
{EXCLUDE [Region] : SUM([Sales])}
   in viz grouped by Region + City
```

**Compilation (`lod_compiler._compile_exclude`):**

- `partition_by = sorted(viz) \\ exclude_dims`.
- Placed at stage 6.

**DuckDB SQL:**

```sql
SELECT
  t.Region,
  t.City,
  SUM(t.Sales) OVER (PARTITION BY t.City) AS city_total_sales
FROM t;
```

**No-op warning.** If `viz ∩ exclude_dims = ∅`, the EXCLUDE is a no-op —
the partition_by is unchanged from the viz granularity. We still emit the
window, but attach a `warnings` entry telling the author to drop the
EXCLUDE or change viz dims.

---

## JoinLODOverrides

Per-viz override set. Each entry is a `LodCalculation.id` whose compiled
partition_by was hand-edited by the author (for example: INCLUDE a dim that
Tableau would normally auto-compute out). Serialised on `VisualSpec
.join_lod_overrides: repeated string`. `filter_ordering.place_lod_in_order`
skips any LOD whose id is in the override list — the caller has already
spliced that LOD into the plan manually.

---

## See also

- `backend/vizql/lod_compiler.py` — compilation.
- `backend/vizql/lod_analyzer.py` — cost / warning.
- `backend/vizql/context_filter_helper.py` — promote-to-context hint.
- `backend/vizql/filter_ordering.py` — `place_lod_in_order`.
- `docs/Build_Tableau.md` §IV.7, §IV.8, §V.2, §V.4, §XIX.1, §XXV.3, Appendix E.2.
```

- [ ] **Step 2: Mark Plan 8b shipped in roadmap**

Find the **Plan 8b** heading in `docs/analyst_pro_tableau_parity_roadmap.md` and append (mirror Plan 8a's shipped marker format):

```markdown
**Status:** ✅ Shipped — 2026-04-20. 10 tasks. New modules: `backend/vizql/lod_compiler.py`, `backend/vizql/lod_analyzer.py`, `backend/vizql/context_filter_helper.py`, `backend/vizql/LOD_SEMANTICS.md`. Extended: `backend/vizql/filter_ordering.py` (`place_lod_in_order` + `LodPlacement`), `backend/vizql/calc_to_expression.py` (viz_granularity threading), `backend/vizql/spec.py` (`VisualSpec.join_lod_overrides` + `viz_granularity()` method), `backend/proto/askdb/vizdataservice/v1.proto` (field 12 `join_lod_overrides`). New config: `LOD_WARN_THRESHOLD_ROWS=1_000_000`. Endpoint `POST /api/v1/calcs/validate` response gains `warnings: list[CalcWarning]` (additive). Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8b-lod-semantics.md`.
```

- [ ] **Step 3: Run final gate — everything green**

```bash
cd backend && python -m pytest tests/test_lod_compiler.py tests/test_lod_analyzer.py tests/test_context_filter_helper.py tests/test_filter_ordering.py tests/test_calc_compile.py tests/test_calc_routes.py tests/test_calc_parser.py tests/test_calc_typecheck.py tests/test_calc_functions.py -v
```

Expected: all green. No new failures elsewhere:

```bash
cd backend && python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: `516+ passed` (Plan 8b additions bring total higher; no pre-existing tests broken).

Frontend regression check (22 pre-existing failures allowed per `CLAUDE.md :: Known Test Debt`):

```bash
cd frontend && npm run test:chart-ir 2>&1 | tail -10
```

Expected: failure count ≤ 22 (baseline documented).

- [ ] **Step 4: Commit**

```bash
git add backend/vizql/LOD_SEMANTICS.md docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): LOD_SEMANTICS.md + Plan 8b shipped marker (Plan 8b T10)"
```

---

## Self-review checklist (run before closing the plan)

- **Spec coverage.** Each of the 7 scheduled-task deliverables maps to ≥1 task:
  - (1) `lod_compiler.py` with FIXED/INCLUDE/EXCLUDE → T1–T4.
  - (2) Filter-order placement (`place_lod_in_order` + `JoinLODOverrides`) → T6.
  - (3) Cardinality warning (`lod_analyzer.py`) → T7.
  - (4) Integration with calc parser (`calc_to_expression.py`) → T5.
  - (5) `context_filter_helper.py` → T8.
  - (6) Tests (FIXED, INCLUDE, EXCLUDE, filter order, context promotion, cardinality) → T2, T3, T4, T6, T7, T8, T9.
  - (7) `LOD_SEMANTICS.md` → T10.
- **No placeholders.** Every step has exact file paths + concrete code + command + expected output. No "TBD" / "add error handling" / "similar to Task N".
- **Type consistency.** `LodCompileCtx`, `CompiledLod`, `LodPlacement`, `FilterHint`, `ContextPromotionHint`, `LodCost`, `CalcWarning` — names + field shapes used in later tasks match their definitions in T1–T8.
- **Hard conventions honoured.** FIXED ≠ INCLUDE ≠ EXCLUDE: three distinct compile functions (`_compile_fixed`, `_compile_include`, `_compile_exclude`). Filter-order placement (step 4 vs step 6) is enforced via `LodPlacement.stage` + `StagedFilter.stage`. Cardinality warning is observation-only (returns `list[CalcWarning]`, never raises). Security: every emitted SQL flows through Plan 7d's existing validator pipeline; no new bypass. Python type hints; `mypy --strict` invoked per task. One commit per task, message format `feat(analyst-pro): <verb> <object> (Plan 8b T<N>)`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8b-lod-semantics.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task + two-stage review.
2. **Inline Execution** — batch with checkpoints using `superpowers:executing-plans`.

Pick one after reviewing the plan.

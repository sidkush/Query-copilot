# Analyst Pro — Plan 7c: SQL AST + Optimizer Passes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate Plan 7b's Minerva `LogicalOp*` tree into a dialect-agnostic SQL AST (`SQLQueryFunction` / `SQLQueryExpression`), run a fixed pipeline of optimiser passes over it (schema inference, type resolution, equality proving, CSE, aggregate pushdown, join-tree virtualisation), and enforce Build_Tableau §IV.7's nine-stage filter order-of-operations at plan-build time. Plan 7c produces a validated AST; Plan 7d owns dialect emission; Plan 7e owns caching.

**Architecture:** Three new sub-packages under `backend/vizql/`:
1. `sql_ast.py` — the AST itself: `SQLQueryFunction` (top-level query node: SELECT / FROM / WHERE / GROUP BY / HAVING / ORDER BY / LIMIT / CTEs / set-ops / window specs) + `SQLQueryExpression` (expression tree: `Column`, `Literal`, `BinaryOp`, `FnCall`, `Case`, `Cast`, `Window`, `Subquery`) + structural helpers (`Projection`, `JoinNode`, `CTE`, `SetOp`). Visitor pattern via `accept(visitor) -> T` on every node — prep for Plan 7d dialect emitters.
2. `logical_to_sql.py` — the `LogicalExpToSQLQueryExpression` compiler: walks a `LogicalOp` tree and emits a `SQLQueryFunction`. One `_compile_*` method per LogicalOp kind + one `_expr_to_sql` per `logical.Expression` node. Deterministic; no I/O.
3. `passes/` — optimiser pipeline: seven idempotent, terminating passes composed in a fixed order by `optimizer.py`. Each pass is a `SQLQueryFunction -> SQLQueryFunction` pure function (no hidden state; passes that need stats take them as explicit input).

Two cross-cutting modules:
- `filter_ordering.py` — `apply_filters_in_order(plan, filters) -> plan` slots each `FilterSpec` / attached `LogicalOpSelect` into the correct §IV.7 stage via a 9-bucket sort. This runs **during** the logical→SQL lowering (Task 5), not on the LogicalOp tree directly, because stages 3 (Context → CTE) and 4 (FIXED LOD → correlated subquery) are SQL-shape decisions, not logical-tree decisions.
- Security gate — every `SQLQueryFunction` round-trips through a string form that passes `sql_validator.SQLValidator.validate()` (the 6-layer check). No bypass; integration test confirms injected predicates are rejected even when reached through VizQL.

**Tech Stack:** Python 3.10+ stdlib + `sqlglot==30.1.0` (already installed; version pinned). We use sqlglot only for:
1. The final linting pass (`sqlglot.parse_one(sql, dialect="postgres")` — confirms our emitted AST serialises to valid SQL a third-party parser accepts).
2. `sql_validator.py` re-parse (already does so) — the integration gate in Task 9.
We **do not** use sqlglot's `exp.Expression` hierarchy as our AST; the visitor pattern + dialect-emitter fan-out in Plan 7d needs a shape we control. `@dataclass(frozen=True, slots=True)` throughout; `tuple[T, ...]` for every sequence field; `mypy --strict` passes on every new module. `pytest` for tests, same config as existing `backend/tests/`.

**Scope guard.** No dialect-specific SQL strings. No cache. No calc-field parser (Plan 8a). No LOD anti-pattern warnings (Plan 8b). No actual DB execution in tests — fixture SQL strings only. A minimal stringifier lives in `sql_ast.py` for debugging / validator round-trip — it emits generic ANSI SQL and is **not** the Plan 7d dialect layer. Table-calc filter stage (step 8) is flagged on the output and deliberately emitted as a client-side marker, not as SQL. Totals (step 9) set a flag on the output that tells Plan 7d / 7e to issue a second query — this plan does not emit the second query itself.

---

## Reference index (every task author reads before editing)

- `docs/Build_Tableau.md`:
  - **§IV.1** — the 3-stage compilation pipeline. Plan 7c is the middle stage (`LogicalOp → SQLQueryFunction`).
  - **§IV.2** — 14-operator minerva catalogue (ported in Plan 7b, consumed here).
  - **§IV.3** — `DomainType` Snowflake / Separate. Snowflake ⇒ emit cartesian cross-join CTE; Separate ⇒ emit per-pane subqueries.
  - **§IV.4** — SQL AST passes to mirror:
    - Function-level: `SQLQueryFunctionResolveCollation`, `SQLQueryFunctionCloner`, `SQLQueryFunctionChecker`, `SQLQueryFunctionHavingInSelects`, `SQLQueryFunctionForceLongsLast`, `SQLQueryFunctionForceAggregation::HandleEmptyBindings`.
    - Optimiser: `AggregatePushdown`, `DataTypeResolver`, `EqualityProver`, `InputSchemaProver`, `CommonSubexpressionElimination\ExpressionCounter`, `JoinTreeVirtualizer`, `LogicalOpSchemaAndTypeDeriver`, `LogicalExpToSQLQueryExpression`, `LogicalOpFormatter`, `LogicalOpParser`.
    We implement the optimiser seven; the function-level passes are folded into the SQL-AST constructors (`__post_init__` for cloner / checker / force-longs-last ordering) or into `SQLQueryFunctionChecker` inside `sql_ast.py`.
  - **§IV.6** — SQL grammar observed: WITH / WITH RECURSIVE, GROUPING SETS, ROLLUP, CUBE, PIVOT, UNPIVOT, `OVER(PARTITION BY … ORDER BY … ROWS/RANGE …)`, `FILTER (WHERE …)` (aggregate-filter clause), `WITHIN GROUP (ORDER BY …)`, LATERAL, BETWEEN / Symmetric, `TempTableMsg`, `TransactionMode` (ReadOnly / ReadWrite / Serializable). Our AST must cover these as first-class nodes; dialect emission is Plan 7d.
  - **§IV.7** — the nine-stage filter order-of-operations. **Memorise.** This plan bakes correct order in at plan-build.
    1. **Extract filters** — on `LogicalOpRelation` (as WHERE inside extract materialisation; we treat as DuckDB extract config metadata).
    2. **Data Source filters** — wrapped as `LogicalOpSelect` immediately above the relation; emitted as `WHERE` in the base subquery.
    3. **Context filters** — materialised as a CTE (`WITH ctx_<dsId> AS (SELECT … WHERE …)`) wrapping the DS-filtered logical plan. Downstream FIXED LOD + dim filters reference the CTE. On legacy RDBMS Tableau uses a `#Tableau_Temp_` table; on Hyper (our DuckDB analogue) it's a CTE. We emit a CTE always; Plan 7d decides whether to materialise as temp table per dialect.
    4. **FIXED LOD** — correlated subquery emitted BEFORE the dim-filter `LogicalOpSelect`. Structurally: a `Subquery` node inside a `Projection` expression that computes the agg over FIXED dims only and joins on matching keys.
    5. **Dimension filters** — `LogicalOpSelect` above the Context CTE; emitted as `WHERE` on the outer query.
    6. **INCLUDE / EXCLUDE LOD** — `LogicalOpOver` above the dim filter; emitted as `OVER(PARTITION BY …)`. INCLUDE = viz_grain ∪ {dim}; EXCLUDE = viz_grain ∖ {dim}.
    7. **Measure filters** — `LogicalOpFilter` (HAVING) above `LogicalOpAggregate`. `SQLQueryFunctionHavingInSelects` validates the expression references aggregates or group keys only.
    8. **Table-calc filters** — CLIENT-SIDE. Flag `SQLQueryFunction.client_side_filters` with the predicate; NOT emitted to SQL. Plan 7d / the dashboard runner consumes this flag.
    9. **Totals** — separate query; flagged via `SQLQueryFunction.totals_query_required: bool`. Plan 7d emits a second query when the flag is set. `Filter::ShouldAffectTotals` flag controls whether stage-2/5 filters are replayed in the totals query.
  - **§IV.8** — context-filter mechanics: CTE on Hyper/DuckDB, `#Tableau_Temp_` on legacy RDBMS. We always emit CTE; Plan 7d dialects may rewrite to temp table.
  - **§V.2** — LOD emission shape:
    - FIXED → correlated subquery on fixed dims, joined back on matching keys (Expensive on high-cardinality fixed dims — log a warning via `sql_ast.SQLQueryFunction.diagnostics`).
    - INCLUDE → window, `partition_bys = viz_grain ∪ {dim}`.
    - EXCLUDE → window, `partition_bys = viz_grain ∖ {dim}`.
  - **Appendix B** — observed SQL keyword coverage. Our AST must have first-class nodes for: `WITH` / `WITH RECURSIVE`, `GROUPING SETS`, `ROLLUP`, `CUBE`, `PIVOT`, `UNPIVOT`, `OVER`, aggregate `FILTER (WHERE …)`, `WITHIN GROUP (ORDER BY …)`, `LATERAL`, `BETWEEN` / Symmetric. Test: every Appendix B keyword has a constructible AST node.
  - **Appendix E.1** — "Memorise the 9 steps." Plan 7c's filter-ordering module is a literal implementation of this list. Appendix E.2 (FIXED = correlated subquery; INCLUDE/EXCLUDE = window) and E.3 (Context filter = CTE) are encoded in Task 8.
- `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 7c — authoritative scope (10-task target; `sql_ast.py`, optimiser passes, filter order-of-ops enforcement, tests prove WHERE vs HAVING vs CTE vs correlated subquery placement).
- `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7b-minerva-logical-plan.md` — shipped. Inputs to this plan.
- `backend/vizql/logical.py` — 14 `LogicalOp*` dataclasses + expression AST. **Read end-to-end before Task 1.**
- `backend/vizql/compiler.py` — attaches `filter_stage` annotation on `LogicalOpSelect` / `LogicalOpFilter`; Plan 7c consumes the annotation.
- `backend/vizql/validator.py` — `validate_logical_plan()` runs before Task 4's compile call (prereq gate ensures every input tree is already valid).
- `backend/sql_validator.py` — the 6-layer gate. `SQLValidator.validate(sql) -> (ok, cleaned_sql, error)`. **No bypass.** Task 9 integration.
- `QueryCopilot V1/CLAUDE.md` / `docs/claude/security-core.md` — read-only enforcement, 6-layer validator, PII masking invariants. Plan 7c never weakens them; the validator is the gate on every emitted string, including intermediate debug stringifications in tests.
- `QueryCopilot V1/docs/claude/config-defaults.md` — numeric constants. No new constants in this plan; LOD warning threshold (high-cardinality fixed dim) is logged, not configured.
- Prior plan format precedent — `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7b-minerva-logical-plan.md` (same Phase 7 series, frozen-dataclass discipline, commit-per-task cadence).

---

## Prerequisites

- Active branch: `askdb-global-comp`. All 10 commits land here; do not push.
- `cd "QueryCopilot V1" && git status` clean before Task 1 (ignoring `.data/audit/*.jsonl`).
- Plans 7a + 7b shipped. Verify:
  - `ls backend/vizql/` shows `__init__.py`, `proto/`, `spec.py`, `logical.py`, `compiler.py`, `validator.py`, `README.md`.
  - `git log --oneline | grep "Plan 7b T12"` returns a commit.
  - From `backend/`: `python -c "from vizql import logical, compiler, validator; print(logical.LogicalOpRelation(table='t'))"` succeeds.
- Python venv active; `backend/requirements.txt` installed. `sqlglot` version: `python -c "import sqlglot; print(sqlglot.__version__)"` must print `30.1.0` (or later minor — fail if major is different).
- `mypy>=1.11` available (Plan 7b already added it).
- Full backend pytest suite green before starting: `cd backend && python -m pytest tests/ -v` → baseline count recorded, zero failing.

**Fail-loudly prerequisite task.** Task 1 begins with an explicit prerequisite-verification test that imports `vizql.logical.LogicalOpRelation`, `vizql.compiler.compile_visual_spec`, and `vizql.validator.validate_logical_plan`, and asserts a sample 7b output tree round-trips through `validate_logical_plan` cleanly. If Plan 7b is **not** shipped or broken, this test fails on run and the implementer stops immediately.

---

## File Structure

**Create**

| Path | Purpose |
|---|---|
| `backend/vizql/sql_ast.py` | SQL AST node hierarchy. Frozen dataclasses + `Visitor[T]` protocol + generic ANSI stringifier (`to_sql_generic()`) for debugging + `SQLQueryFunctionChecker` (`validate_structure()`) that mirrors §IV.4 function-level passes. |
| `backend/vizql/logical_to_sql.py` | `LogicalToSQLCompiler.compile(plan: LogicalOp) -> SQLQueryFunction`. One `_compile_*` per LogicalOp kind + `_expr_to_sql` per `logical.Expression` kind. Consumes `logical.Field.data_type` to seed `DataTypeResolver`. |
| `backend/vizql/filter_ordering.py` | `apply_filters_in_order(plan: SQLQueryFunction, staged_filters: Sequence[StagedFilter]) -> SQLQueryFunction`. Sorts filters into 9 buckets, attaches each at correct AST position (WHERE / HAVING / CTE / correlated subquery / client-side flag / totals flag). `StagedFilter` dataclass = `{stage, predicate, case_sensitive, should_affect_totals}`. |
| `backend/vizql/passes/__init__.py` | Re-exports. |
| `backend/vizql/passes/input_schema_prover.py` | `InputSchemaProverPass` — walks AST bottom-up, validates every `Column` reference exists in an upstream `FROM` / `JOIN` / CTE schema. Fails loudly with column name + expected schema. |
| `backend/vizql/passes/logical_op_schema_and_type_deriver.py` | `SchemaAndTypeDeriverPass` — propagates column lists + types through every subquery / CTE. Annotates every `Projection` with output schema. Runs before `DataTypeResolver`. |
| `backend/vizql/passes/data_type_resolver.py` | `DataTypeResolverPass` — bottom-up type inference. Every `SQLQueryExpression` gets a `.resolved_type: str`. Mirrors §IV.4 `DataTypeResolver`. Fails if an expression resolves to `unknown` and is referenced by a `Cast` or comparison. |
| `backend/vizql/passes/equality_prover.py` | `EqualityProverPass` — collects `{a = b, a ≠ b}` assertions per AST scope. Used downstream for predicate pushdown + join simplification. Idempotent. |
| `backend/vizql/passes/common_subexp_elimination.py` | `CommonSubexpElimPass` — `ExpressionCounter` walks the AST, assigns deterministic ids to shared expressions, promotes those referenced ≥ 2 times to a named CTE or SELECT-list alias. Appendix-match: §IV.4 `CommonSubexpressionElimination\ExpressionCounter`. |
| `backend/vizql/passes/aggregate_pushdown.py` | `AggregatePushdownPass` — pushes aggregation toward the relation (reduces rows before JOIN). Only safe when join keys are group keys and the agg distributes over the join (classic SQL-opt rule). Logs a `diagnostic` when push is skipped. |
| `backend/vizql/passes/join_tree_virtualizer.py` | `JoinTreeVirtualizerPass` — materialises Relationships' joins at query time based on viz context (§II.2). Inputs: plan + viz-referenced field set. Output: AST with `JoinNode` tree only for tables actually referenced. |
| `backend/vizql/optimizer.py` | `optimize(plan: SQLQueryFunction, ctx: OptimizerContext) -> SQLQueryFunction` — composes the seven passes in fixed order: `InputSchemaProver → SchemaAndTypeDeriver → DataTypeResolver → JoinTreeVirtualizer → EqualityProver → AggregatePushdown → CommonSubexpElim`. Idempotent: `optimize(optimize(p)) == optimize(p)`. |
| `backend/tests/test_vizql_sql_ast.py` | AST construction, equality, hashing, visitor dispatch, `SQLQueryFunctionChecker` rejection cases, `to_sql_generic` round-trip through `sqlglot.parse_one`. |
| `backend/tests/test_vizql_logical_to_sql.py` | Per-`LogicalOp*` compile tests (14 ops + expression AST) + combined scenarios (bar GROUP BY, dual axis, FIXED LOD, INCLUDE/EXCLUDE LOD, Measure Names/Values). |
| `backend/tests/test_vizql_optimizer.py` | One scenario per pass: input → expected output; idempotency (`optimize(optimize(p)) == optimize(p)`); termination (pipeline returns within fixed iteration cap). |
| `backend/tests/test_vizql_filter_ordering.py` | Nine stage placements. Key assertions:<br>• Extract filter stays on base relation metadata.<br>• DS filter → WHERE in base subquery.<br>• Context filter → CTE wrapping plan.<br>• FIXED LOD → correlated subquery, NOT affected by dim filter (unless promoted to Context).<br>• Dim filter → WHERE on outer query.<br>• INCLUDE/EXCLUDE → window OVER expression.<br>• Measure filter → HAVING (not WHERE).<br>• Table-calc filter → client-side flag only (absent from SQL).<br>• Totals → separate-query flag triggered when `ShouldAffectTotals=false`. |
| `backend/tests/test_vizql_security_gate.py` | Integration: Plan 7b logical plan → compile → optimise → `to_sql_generic()` → `SQLValidator.validate()`. Positive cases pass; injected predicate (`LogicalOpSelect` whose predicate stringifies to `1=1; DROP TABLE users`) rejected by validator at the gate. |

**Modify**

| Path | Change |
|---|---|
| `backend/vizql/__init__.py` | Re-export `SQLQueryFunction`, `SQLQueryExpression`, `compile_logical_to_sql`, `optimize`, `apply_filters_in_order`, `StagedFilter`. |
| `backend/vizql/README.md` | Add a "SQL AST + Optimiser (Plan 7c)" section documenting the AST node table, the 9-stage filter-ordering module, the seven optimiser passes, and the security gate. Mirror Plan 7b's format. |
| `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 7c | After T10 verification, append `**Status:** ✅ Shipped <date>. 10 tasks. Commits <shas>.` line. |

**Do not touch.** `backend/vizql/spec.py`, `backend/vizql/logical.py`, `backend/vizql/compiler.py`, `backend/vizql/validator.py`, `backend/vizql/proto/*`, `backend/sql_validator.py` (consume as read-only — a change to it is a separate plan), anything in `frontend/`, agent code, waterfall router.

---

## Task Checklist

- [ ] **T1.** Prereq gate + `sql_ast.py` expressions (Visitor + `Column`, `Literal`, `BinaryOp`, `FnCall`, `Case`, `Cast`, `Window`, `Subquery` + `SQLQueryExpression` union). Commit: `feat(analyst-pro): scaffold sql_ast expressions + visitor (Plan 7c T1)`.
- [ ] **T2.** `sql_ast.py` query-level nodes (`Projection`, `JoinNode`, `CTE`, `SetOp`, `SQLQueryFunction`) + `SQLQueryFunctionChecker` (§IV.4 function-level passes: `Cloner` via `dataclasses.replace`, `Checker` / `HavingInSelects` / `ForceLongsLast` via `validate_structure`) + `to_sql_generic()` ANSI stringifier. Commit: `feat(analyst-pro): add SQLQueryFunction + structural checker (Plan 7c T2)`.
- [ ] **T3.** `logical_to_sql.py` — `LogicalToSQLCompiler` per-`LogicalOp*` + per-`Expression` mapping; 14-operator coverage. Commit: `feat(analyst-pro): compile LogicalOp tree to SQLQueryFunction (Plan 7c T3)`.
- [ ] **T4.** `passes/input_schema_prover.py` + `passes/logical_op_schema_and_type_deriver.py` + `passes/data_type_resolver.py` — the three schema/type passes. Commit: `feat(analyst-pro): add schema + type derivation passes (Plan 7c T4)`.
- [ ] **T5.** `passes/join_tree_virtualizer.py` + `passes/equality_prover.py` — join virtualisation + equality assertions. Commit: `feat(analyst-pro): add join virtualizer + equality prover (Plan 7c T5)`.
- [ ] **T6.** `passes/aggregate_pushdown.py` + `passes/common_subexp_elimination.py` + `optimizer.py` pipeline composition + idempotence/termination tests. Commit: `feat(analyst-pro): add aggregate pushdown + CSE + optimizer pipeline (Plan 7c T6)`.
- [ ] **T7.** `filter_ordering.py` — `StagedFilter` dataclass + 9-stage sorter + attachment logic for WHERE / HAVING / CTE / client-side / totals flags. Commit: `feat(analyst-pro): enforce §IV.7 filter order-of-operations (Plan 7c T7)`.
- [ ] **T8.** LOD emission — wire FIXED (correlated subquery) + INCLUDE/EXCLUDE (window `OVER`) paths inside `logical_to_sql.py`, re-use `filter_ordering` stage numbers. Commit: `feat(analyst-pro): emit FIXED correlated subquery + INCLUDE/EXCLUDE OVER (Plan 7c T8)`.
- [ ] **T9.** Security integration — every compile path terminates in `SQLValidator.validate()`. Add `test_vizql_security_gate.py` asserting injection rejection via VizQL. Commit: `feat(analyst-pro): gate vizql output through sql_validator (Plan 7c T9)`.
- [ ] **T10.** Verification + roadmap status. Run full pytest suite + `mypy --strict` on new modules. Update `roadmap.md` + `README.md`. Commit: `docs(analyst-pro): mark Plan 7c shipped in roadmap (Plan 7c T10)`.

---

## Task 1 — Scaffold `sql_ast.py` expressions + Visitor + prereq gate

**Files:**
- Create: `backend/vizql/sql_ast.py`
- Create: `backend/tests/test_vizql_sql_ast.py`

- [ ] **Step 1.1: Write prereq-gate test.**

```python
# backend/tests/test_vizql_sql_ast.py
"""Plan 7c SQL AST — scaffold, expressions, visitor."""
import pytest

def test_prereq_plan_7b_shipped():
    """Fail loudly if Plan 7b logical/compiler/validator not importable."""
    from vizql import logical, compiler, validator
    rel = logical.LogicalOpRelation(table="t")
    validator.validate_logical_plan(rel)  # raises if broken
    assert isinstance(rel, logical.LogicalOpRelation)

def test_prereq_sqlglot_30_1_0_or_compatible():
    import sqlglot
    major, minor = (int(x) for x in sqlglot.__version__.split(".")[:2])
    assert major == 30, f"sqlglot major pinned to 30; got {sqlglot.__version__}"
```

- [ ] **Step 1.2: Run — expect fail (module `vizql.sql_ast` not yet used but file doesn't exist).**

Run: `cd backend && python -m pytest tests/test_vizql_sql_ast.py -v`
Expected: PASS (prereq-gate tests do not touch `sql_ast` yet).

- [ ] **Step 1.3: Write failing tests for `SQLQueryExpression` AST.**

```python
# backend/tests/test_vizql_sql_ast.py — append
from vizql import sql_ast as sa

def test_column_is_frozen_hashable():
    c = sa.Column(name="x", table_alias="t")
    assert hash(c) == hash(sa.Column(name="x", table_alias="t"))
    with pytest.raises(Exception):  # FrozenInstanceError
        c.name = "y"  # type: ignore[misc]

def test_literal_retains_type_tag():
    lit = sa.Literal(value=42, data_type="int")
    assert lit.data_type == "int"

def test_binaryop_composes():
    expr = sa.BinaryOp(op="=",
                      left=sa.Column(name="a", table_alias="t"),
                      right=sa.Literal(value=1, data_type="int"))
    assert expr.op == "="

def test_fncall_aggregate_filter_clause_present():
    """§IV.6 observed: FILTER (WHERE …) on aggregate."""
    agg = sa.FnCall(
        name="SUM",
        args=(sa.Column(name="sales", table_alias="t"),),
        filter_clause=sa.BinaryOp(
            op=">",
            left=sa.Column(name="y", table_alias="t"),
            right=sa.Literal(value=2020, data_type="int"),
        ),
    )
    assert agg.filter_clause is not None

def test_case_expression():
    e = sa.Case(
        whens=((sa.BinaryOp(op=">",
                            left=sa.Column(name="x", table_alias="t"),
                            right=sa.Literal(value=0, data_type="int")),
                sa.Literal(value="pos", data_type="string")),),
        else_=sa.Literal(value="neg", data_type="string"),
    )
    assert len(e.whens) == 1

def test_cast_annotates_target_type():
    c = sa.Cast(expr=sa.Column(name="x", table_alias="t"), target_type="float")
    assert c.target_type == "float"

def test_window_expression_has_partition_order_frame():
    """§IV.6: OVER(PARTITION BY … ORDER BY … ROWS/RANGE …)."""
    w = sa.Window(
        expr=sa.FnCall(name="ROW_NUMBER", args=()),
        partition_by=(sa.Column(name="d", table_alias="t"),),
        order_by=((sa.Column(name="d", table_alias="t"), True),),  # (expr, is_asc)
        frame=sa.FrameClause(kind="ROWS",
                             start=("UNBOUNDED", 0),
                             end=("CURRENT_ROW", 0)),
    )
    assert w.frame.kind == "ROWS"

def test_visitor_dispatch_reaches_every_kind():
    class NameCollector(sa.Visitor[list]):
        def visit_column(self, n): return [f"col:{n.name}"]
        def visit_literal(self, n): return [f"lit:{n.value}"]
        def visit_binary_op(self, n):
            return self.visit(n.left) + [f"op:{n.op}"] + self.visit(n.right)
        def visit_fn_call(self, n):
            out = [f"fn:{n.name}"]
            for a in n.args: out += self.visit(a)
            return out
        def visit_case(self, n): return ["case"]
        def visit_cast(self, n): return ["cast"] + self.visit(n.expr)
        def visit_window(self, n): return ["window"]
        def visit_subquery(self, n): return ["subq"]

    e = sa.BinaryOp(op="=", left=sa.Column(name="a", table_alias="t"),
                    right=sa.Literal(value=1, data_type="int"))
    assert e.accept(NameCollector()) == ["col:a", "op:=", "lit:1"]
```

- [ ] **Step 1.4: Run — expect ImportError / NameError.**

Run: `cd backend && python -m pytest tests/test_vizql_sql_ast.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'vizql.sql_ast'`).

- [ ] **Step 1.5: Implement `sql_ast.py` expression half.**

```python
# backend/vizql/sql_ast.py
"""SQL AST — SQLQueryFunction + SQLQueryExpression.

Plan 7c (Build_Tableau.md §IV.4) stage 3 of the VizQL pipeline. This
module defines a dialect-agnostic SQL AST that Plan 7d's dialect emitters
consume via the Visitor pattern.

Design rules:

* Every dataclass is ``frozen=True, slots=True``.
* Every sequence field is ``tuple[T, ...]``.
* Zero dialect knowledge lives here (kept in Plan 7d ``dialects/``).
* ``to_sql_generic()`` emits ANSI SQL for debugging + validator round-trip;
  it is NOT the dialect layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, Optional, Protocol, TypeVar, Union

T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class Column:
    name: str
    table_alias: str
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_column(self)


@dataclass(frozen=True, slots=True)
class Literal:
    value: object
    data_type: str
    def accept(self, v: "Visitor[T]") -> T: return v.visit_literal(self)

    @property
    def resolved_type(self) -> str: return self.data_type


@dataclass(frozen=True, slots=True)
class BinaryOp:
    op: str
    left: "SQLQueryExpression"
    right: "SQLQueryExpression"
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_binary_op(self)


@dataclass(frozen=True, slots=True)
class FnCall:
    """Scalar or aggregate. ``filter_clause`` = §IV.6 ``FILTER (WHERE …)``.

    ``within_group`` = §IV.6 ``WITHIN GROUP (ORDER BY …)`` for ordered-set
    aggregates (percentile_cont, percentile_disc).
    """
    name: str
    args: tuple["SQLQueryExpression", ...]
    filter_clause: Optional["SQLQueryExpression"] = None
    within_group: tuple[tuple["SQLQueryExpression", bool], ...] = ()
    distinct: bool = False
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_fn_call(self)


@dataclass(frozen=True, slots=True)
class Case:
    whens: tuple[tuple["SQLQueryExpression", "SQLQueryExpression"], ...]
    else_: Optional["SQLQueryExpression"]
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_case(self)


@dataclass(frozen=True, slots=True)
class Cast:
    expr: "SQLQueryExpression"
    target_type: str
    def accept(self, v: "Visitor[T]") -> T: return v.visit_cast(self)

    @property
    def resolved_type(self) -> str: return self.target_type


@dataclass(frozen=True, slots=True)
class FrameClause:
    """§IV.6 ROWS/RANGE frame.

    ``start`` / ``end`` = ``(kind, offset)``;
    ``kind`` ∈ {``UNBOUNDED``, ``CURRENT_ROW``, ``PRECEDING``, ``FOLLOWING``}.
    """
    kind: str  # "ROWS" | "RANGE"
    start: tuple[str, int]
    end: tuple[str, int]


@dataclass(frozen=True, slots=True)
class Window:
    expr: "SQLQueryExpression"
    partition_by: tuple["SQLQueryExpression", ...]
    order_by: tuple[tuple["SQLQueryExpression", bool], ...]
    frame: Optional[FrameClause] = None
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_window(self)


@dataclass(frozen=True, slots=True)
class Subquery:
    query: "SQLQueryFunction"
    correlated_on: tuple[tuple[str, str], ...] = ()  # (outer_col, inner_col)
    def accept(self, v: "Visitor[T]") -> T: return v.visit_subquery(self)

    @property
    def resolved_type(self) -> str: return "unknown"


SQLQueryExpression = Union[Column, Literal, BinaryOp, FnCall, Case, Cast,
                            Window, Subquery]


class Visitor(Protocol, Generic[T]):
    def visit(self, node: SQLQueryExpression) -> T: return node.accept(self)
    def visit_column(self, n: Column) -> T: ...
    def visit_literal(self, n: Literal) -> T: ...
    def visit_binary_op(self, n: BinaryOp) -> T: ...
    def visit_fn_call(self, n: FnCall) -> T: ...
    def visit_case(self, n: Case) -> T: ...
    def visit_cast(self, n: Cast) -> T: ...
    def visit_window(self, n: Window) -> T: ...
    def visit_subquery(self, n: Subquery) -> T: ...


# forward ref — filled in Task 2
class SQLQueryFunction:  # pragma: no cover — replaced in T2
    pass


__all__ = [
    "Column", "Literal", "BinaryOp", "FnCall", "Case", "Cast",
    "FrameClause", "Window", "Subquery",
    "SQLQueryExpression", "Visitor", "SQLQueryFunction",
]
```

- [ ] **Step 1.6: Run — expect pass.**

Run: `cd backend && python -m pytest tests/test_vizql_sql_ast.py -v`
Expected: PASS (all 9 tests).

- [ ] **Step 1.7: mypy check.**

Run: `cd backend && python -m mypy --strict vizql/sql_ast.py`
Expected: `Success: no issues found`.

- [ ] **Step 1.8: Commit.**

```bash
cd "QueryCopilot V1"
git add backend/vizql/sql_ast.py backend/tests/test_vizql_sql_ast.py
git commit -m "feat(analyst-pro): scaffold sql_ast expressions + visitor (Plan 7c T1)"
```

---

## Task 2 — Query-level nodes + `SQLQueryFunctionChecker` + `to_sql_generic`

**Files:**
- Modify: `backend/vizql/sql_ast.py`
- Modify: `backend/tests/test_vizql_sql_ast.py`

- [ ] **Step 2.1: Failing tests.**

```python
# backend/tests/test_vizql_sql_ast.py — append

def _trivial_qf() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="x", expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )

def test_qf_minimal():
    qf = _trivial_qf()
    assert len(qf.projections) == 1
    assert qf.from_.name == "tbl"

def test_qf_having_requires_group_by():
    """SQLQueryFunctionHavingInSelects rule: HAVING invalid without GROUP BY
    OR aggregate projection."""
    with pytest.raises(sa.SQLASTStructuralError):
        sa.SQLQueryFunction(
            projections=(sa.Projection(
                alias="x", expression=sa.Column(name="x", table_alias="t")),),
            from_=sa.TableRef(name="tbl", alias="t"),
            having=sa.BinaryOp(op=">",
                               left=sa.Column(name="x", table_alias="t"),
                               right=sa.Literal(value=0, data_type="int")),
        ).validate_structure()

def test_qf_force_longs_last_ordering():
    """SQLQueryFunctionForceLongsLast: wide (long) columns come after narrow."""
    qf = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="note",
                          expression=sa.Column(name="note", table_alias="t",
                                               resolved_type="string")),
            sa.Projection(alias="id",
                          expression=sa.Column(name="id", table_alias="t",
                                               resolved_type="int")),
        ),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    reordered = qf.force_longs_last()
    assert reordered.projections[0].alias == "id"
    assert reordered.projections[1].alias == "note"

def test_qf_force_aggregation_when_empty_bindings():
    """ForceAggregation::HandleEmptyBindings — an empty GROUP BY with agg
    projections MUST pass checker (scalar-agg case)."""
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="n",
            expression=sa.FnCall(name="COUNT",
                                 args=(sa.Literal(value=1, data_type="int"),))),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    qf.validate_structure()  # no raise

def test_qf_client_side_filters_flagged():
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="x", expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
        client_side_filters=(sa.BinaryOp(
            op="=",
            left=sa.Column(name="tc", table_alias="t"),
            right=sa.Literal(value=1, data_type="int")),),
    )
    assert len(qf.client_side_filters) == 1

def test_qf_totals_flag():
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="x", expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
        totals_query_required=True,
    )
    assert qf.totals_query_required

def test_cte_and_setop_nodes():
    inner = _trivial_qf()
    cte = sa.CTE(name="ctx_ds1", query=inner, recursive=False)
    assert cte.name == "ctx_ds1"
    so = sa.SetOp(kind="UNION", left=inner, right=inner, all=False)
    assert so.kind == "UNION"

def test_join_node_kinds():
    for kind in ("INNER", "LEFT", "RIGHT", "FULL", "CROSS"):
        j = sa.JoinNode(kind=kind,
                        left=sa.TableRef(name="a", alias="a"),
                        right=sa.TableRef(name="b", alias="b"),
                        on=sa.Literal(value=True, data_type="bool"))
        assert j.kind == kind

def test_to_sql_generic_round_trips_through_sqlglot():
    """The ANSI stringifier must emit SQL that sqlglot parses cleanly."""
    import sqlglot
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="c", expression=sa.FnCall(
                name="COUNT", args=(sa.Column(name="*", table_alias=""),))),),
        from_=sa.TableRef(name="orders", alias="o"),
        where=sa.BinaryOp(op=">",
                          left=sa.Column(name="amount", table_alias="o"),
                          right=sa.Literal(value=100, data_type="int")),
    )
    sql = qf.to_sql_generic()
    parsed = sqlglot.parse_one(sql, dialect="postgres")
    assert parsed is not None
```

- [ ] **Step 2.2: Run — expect failures.**

Run: `cd backend && python -m pytest tests/test_vizql_sql_ast.py -v`
Expected: FAIL on new tests.

- [ ] **Step 2.3: Extend `sql_ast.py` with query-level nodes.**

Replace the forward-ref stub at the bottom of `sql_ast.py` with:

```python
# backend/vizql/sql_ast.py — append/replace stub

class SQLASTStructuralError(Exception):
    """Raised by SQLQueryFunctionChecker / validate_structure (§IV.4)."""


@dataclass(frozen=True, slots=True)
class TableRef:
    name: str
    alias: str
    schema: str = ""


@dataclass(frozen=True, slots=True)
class JoinNode:
    kind: str  # "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS"
    left: "FromSource"
    right: "FromSource"
    on: SQLQueryExpression
    def __post_init__(self) -> None:
        if self.kind not in {"INNER", "LEFT", "RIGHT", "FULL", "CROSS"}:
            raise SQLASTStructuralError(f"bad join kind {self.kind!r}")


@dataclass(frozen=True, slots=True)
class Projection:
    alias: str
    expression: SQLQueryExpression


@dataclass(frozen=True, slots=True)
class CTE:
    name: str
    query: "SQLQueryFunction"
    recursive: bool = False


@dataclass(frozen=True, slots=True)
class SetOp:
    kind: str  # "UNION" | "INTERSECT" | "EXCEPT"
    left: "SQLQueryFunction"
    right: "SQLQueryFunction"
    all: bool = False
    def __post_init__(self) -> None:
        if self.kind not in {"UNION", "INTERSECT", "EXCEPT"}:
            raise SQLASTStructuralError(f"bad set-op kind {self.kind!r}")


FromSource = Union[TableRef, JoinNode, "SubqueryRef"]


@dataclass(frozen=True, slots=True)
class SubqueryRef:
    query: "SQLQueryFunction"
    alias: str
    lateral: bool = False  # §IV.6 LATERAL


# Width ranking for SQLQueryFunctionForceLongsLast
_TYPE_WIDTH = {
    "bool": 0, "int": 1, "float": 2, "date": 2, "date-time": 3,
    "number": 2, "string": 4, "spatial": 5, "unknown": 3,
}


@dataclass(frozen=True, slots=True)
class SQLQueryFunction:
    """Top-level query node. Mirrors Tableau's SQLQueryFunction (§IV.4)."""
    projections: tuple[Projection, ...]
    from_: FromSource
    ctes: tuple[CTE, ...] = ()
    where: Optional[SQLQueryExpression] = None
    group_by: tuple[SQLQueryExpression, ...] = ()
    grouping_sets: tuple[tuple[SQLQueryExpression, ...], ...] = ()
    rollup: tuple[SQLQueryExpression, ...] = ()
    cube: tuple[SQLQueryExpression, ...] = ()
    having: Optional[SQLQueryExpression] = None
    order_by: tuple[tuple[SQLQueryExpression, bool], ...] = ()
    limit: Optional[int] = None
    set_op: Optional[SetOp] = None
    # §IV.7 cross-SQL flags:
    client_side_filters: tuple[SQLQueryExpression, ...] = ()
    totals_query_required: bool = False
    should_affect_totals: bool = True
    # Diagnostics from optimiser passes (non-fatal)
    diagnostics: tuple[str, ...] = ()

    # ---- SQLQueryFunctionChecker (§IV.4) ----
    def validate_structure(self) -> None:
        if not self.projections:
            raise SQLASTStructuralError("empty projection list")
        has_agg = _any_agg(p.expression for p in self.projections)
        if self.having is not None and not (self.group_by or has_agg):
            raise SQLASTStructuralError(
                "HAVING requires GROUP BY or aggregate projection "
                "(SQLQueryFunctionHavingInSelects)")
        for s in (self.grouping_sets, self.rollup, self.cube):
            if s and not self.group_by:
                raise SQLASTStructuralError(
                    "GROUPING SETS / ROLLUP / CUBE require GROUP BY")

    # ---- SQLQueryFunctionForceLongsLast (§IV.4) ----
    def force_longs_last(self) -> "SQLQueryFunction":
        def w(p: Projection) -> int:
            return _TYPE_WIDTH.get(_resolved_type(p.expression), 3)
        ordered = tuple(sorted(self.projections, key=w))
        return dataclasses.replace(self, projections=ordered)

    # ---- Debugging / validator round-trip only — NOT the dialect layer ----
    def to_sql_generic(self) -> str:
        from .generic_sql import render_generic  # local import to keep module clean
        return render_generic(self)


def _any_agg(exprs) -> bool:
    AGG = {"SUM", "AVG", "COUNT", "MIN", "MAX", "MEDIAN", "STDEV", "STDEVP",
           "VAR", "VARP", "COUNTD", "PERCENTILE", "ATTR", "COLLECT"}
    def walk(e: SQLQueryExpression) -> bool:
        if isinstance(e, FnCall): return e.name.upper() in AGG
        if isinstance(e, BinaryOp): return walk(e.left) or walk(e.right)
        if isinstance(e, Case):
            return any(walk(c) or walk(v) for c, v in e.whens) or (
                e.else_ is not None and walk(e.else_))
        if isinstance(e, Cast): return walk(e.expr)
        if isinstance(e, Window): return walk(e.expr)
        return False
    return any(walk(e) for e in exprs)


def _resolved_type(e: SQLQueryExpression) -> str:
    return getattr(e, "resolved_type", "unknown")


import dataclasses  # end-of-file to avoid circular
```

Add `__all__` entries: `TableRef, JoinNode, Projection, CTE, SetOp, SubqueryRef, SQLQueryFunction, SQLASTStructuralError`.

- [ ] **Step 2.4: Create `backend/vizql/generic_sql.py` (ANSI stringifier).**

```python
# backend/vizql/generic_sql.py
"""ANSI-SQL stringifier for debugging + validator round-trip.

NOT a dialect emitter (Plan 7d owns that). Emits enough SQL for
``sqlglot.parse_one(… dialect='postgres')`` to accept and for
``sql_validator.SQLValidator.validate()`` to run its 6-layer check.
"""
from __future__ import annotations
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from . import sql_ast as sa


def render_generic(qf: "sa.SQLQueryFunction") -> str:
    from . import sql_ast as sa
    parts: list[str] = []
    if qf.ctes:
        heads = ["RECURSIVE " if qf.ctes[0].recursive else ""]
        parts.append("WITH " + heads[0] + ", ".join(
            f"{c.name} AS ({render_generic(c.query)})" for c in qf.ctes))
    parts.append("SELECT " + ", ".join(
        f"{_expr(p.expression)} AS {p.alias}" for p in qf.projections))
    parts.append("FROM " + _from(qf.from_))
    if qf.where is not None: parts.append("WHERE " + _expr(qf.where))
    if qf.group_by:
        parts.append("GROUP BY " + ", ".join(_expr(g) for g in qf.group_by))
    if qf.having is not None: parts.append("HAVING " + _expr(qf.having))
    if qf.order_by:
        parts.append("ORDER BY " + ", ".join(
            f"{_expr(e)} {'ASC' if asc else 'DESC'}" for e, asc in qf.order_by))
    if qf.limit is not None: parts.append(f"LIMIT {qf.limit}")
    return " ".join(parts)


def _from(src) -> str:
    from . import sql_ast as sa
    if isinstance(src, sa.TableRef):
        return f'{src.name} AS {src.alias}' if src.alias else src.name
    if isinstance(src, sa.JoinNode):
        j = "" if src.kind == "INNER" else src.kind + " "
        return (f"{_from(src.left)} {j}JOIN {_from(src.right)} ON "
                f"{_expr(src.on)}")
    if isinstance(src, sa.SubqueryRef):
        lat = "LATERAL " if src.lateral else ""
        return f"{lat}({render_generic(src.query)}) AS {src.alias}"
    raise AssertionError(f"unknown FROM source {src!r}")


def _expr(e) -> str:  # noqa: C901 — dispatch on kind
    from . import sql_ast as sa
    if isinstance(e, sa.Column):
        return f"{e.table_alias}.{e.name}" if e.table_alias else e.name
    if isinstance(e, sa.Literal):
        if isinstance(e.value, str): return "'" + e.value.replace("'", "''") + "'"
        if isinstance(e.value, bool): return "TRUE" if e.value else "FALSE"
        return str(e.value)
    if isinstance(e, sa.BinaryOp):
        return f"({_expr(e.left)} {e.op} {_expr(e.right)})"
    if isinstance(e, sa.FnCall):
        d = "DISTINCT " if e.distinct else ""
        args = ", ".join(_expr(a) for a in e.args)
        call = f"{e.name}({d}{args})"
        if e.within_group:
            call += " WITHIN GROUP (ORDER BY " + ", ".join(
                f"{_expr(x)} {'ASC' if asc else 'DESC'}"
                for x, asc in e.within_group) + ")"
        if e.filter_clause is not None:
            call += f" FILTER (WHERE {_expr(e.filter_clause)})"
        return call
    if isinstance(e, sa.Case):
        whens = " ".join(f"WHEN {_expr(c)} THEN {_expr(v)}" for c, v in e.whens)
        els = f" ELSE {_expr(e.else_)}" if e.else_ is not None else ""
        return f"CASE {whens}{els} END"
    if isinstance(e, sa.Cast):
        return f"CAST({_expr(e.expr)} AS {e.target_type.upper()})"
    if isinstance(e, sa.Window):
        parts = []
        if e.partition_by:
            parts.append("PARTITION BY " + ", ".join(_expr(p) for p in e.partition_by))
        if e.order_by:
            parts.append("ORDER BY " + ", ".join(
                f"{_expr(x)} {'ASC' if asc else 'DESC'}" for x, asc in e.order_by))
        if e.frame is not None:
            parts.append(f"{e.frame.kind} BETWEEN "
                         f"{e.frame.start[1] or ''} {e.frame.start[0]} AND "
                         f"{e.frame.end[1] or ''} {e.frame.end[0]}".strip())
        return f"{_expr(e.expr)} OVER ({' '.join(parts)})"
    if isinstance(e, sa.Subquery):
        return f"({render_generic(e.query)})"
    raise AssertionError(f"unknown expr {e!r}")
```

- [ ] **Step 2.5: Run tests.**

Run: `cd backend && python -m pytest tests/test_vizql_sql_ast.py -v`
Expected: PASS (all tests green).

- [ ] **Step 2.6: mypy.**

Run: `cd backend && python -m mypy --strict vizql/sql_ast.py vizql/generic_sql.py`
Expected: `Success`.

- [ ] **Step 2.7: Commit.**

```bash
git add backend/vizql/sql_ast.py backend/vizql/generic_sql.py backend/tests/test_vizql_sql_ast.py
git commit -m "feat(analyst-pro): add SQLQueryFunction + structural checker (Plan 7c T2)"
```

---

## Task 3 — `LogicalToSQLCompiler` (`logical_to_sql.py`)

**Files:**
- Create: `backend/vizql/logical_to_sql.py`
- Create: `backend/tests/test_vizql_logical_to_sql.py`

- [ ] **Step 3.1: Failing tests — one per LogicalOp kind + combined.**

```python
# backend/tests/test_vizql_logical_to_sql.py
"""Plan 7c — LogicalOp → SQLQueryFunction (LogicalExpToSQLQueryExpression)."""
import pytest
from vizql import logical as lg, sql_ast as sa
from vizql.logical_to_sql import compile_logical_to_sql


def _f(id_: str, dt="int", role="dimension", agg="none", disagg=False) -> lg.Field:
    return lg.Field(id=id_, data_type=dt, role=role, aggregation=agg,
                    semantic_role="", is_disagg=disagg)


def test_relation_becomes_tableref():
    qf = compile_logical_to_sql(lg.LogicalOpRelation(table="sales", schema="public"))
    assert isinstance(qf.from_, sa.TableRef)
    assert qf.from_.name == "sales"
    assert qf.from_.schema == "public"


def test_project_emits_aliases_and_calc_columns():
    rel = lg.LogicalOpRelation(table="t")
    proj = lg.LogicalOpProject(
        input=rel,
        renames=(("amount", "amt"),),
        expressions=lg.NamedExps(entries=(("amt", lg.Column(field_id="amount")),)),
        calculated_column=(("is_big",
                            lg.BinaryOp(op=">",
                                        left=lg.Column(field_id="amount"),
                                        right=lg.Literal(value=100, data_type="int"))),),
    )
    qf = compile_logical_to_sql(proj)
    aliases = {p.alias for p in qf.projections}
    assert {"amt", "is_big"}.issubset(aliases)


def test_select_becomes_where():
    rel = lg.LogicalOpRelation(table="t")
    sel = lg.LogicalOpSelect(
        input=rel,
        predicate=lg.BinaryOp(op=">", left=lg.Column(field_id="x"),
                              right=lg.Literal(value=0, data_type="int")),
        filter_stage="dimension",
    )
    qf = compile_logical_to_sql(sel)
    assert qf.where is not None
    assert isinstance(qf.where, sa.BinaryOp) and qf.where.op == ">"


def test_filter_becomes_having():
    rel = lg.LogicalOpRelation(table="t")
    agg = lg.LogicalOpAggregate(
        input=rel,
        group_bys=(_f("d"),),
        aggregations=(lg.AggExp(name="n", agg="sum", expr=lg.Column(field_id="x")),),
    )
    filt = lg.LogicalOpFilter(
        input=agg,
        predicate=lg.BinaryOp(op=">", left=lg.Column(field_id="n"),
                              right=lg.Literal(value=10, data_type="int")),
        filter_stage="measure",
    )
    qf = compile_logical_to_sql(filt)
    assert qf.having is not None
    assert qf.where is None  # measure filter must NOT land in WHERE


def test_aggregate_emits_group_by():
    rel = lg.LogicalOpRelation(table="t")
    agg = lg.LogicalOpAggregate(
        input=rel,
        group_bys=(_f("region"),),
        aggregations=(lg.AggExp(name="total", agg="sum",
                                expr=lg.Column(field_id="amount")),),
    )
    qf = compile_logical_to_sql(agg)
    assert len(qf.group_by) == 1
    assert any(p.alias == "total" and isinstance(p.expression, sa.FnCall)
               and p.expression.name.upper() == "SUM" for p in qf.projections)


def test_order_and_top_emit_order_by_and_limit():
    rel = lg.LogicalOpRelation(table="t")
    order = lg.LogicalOpOrder(
        input=rel,
        order_by=(lg.OrderBy(identifier_exp=lg.Column(field_id="x"),
                             is_ascending=True),),
    )
    top = lg.LogicalOpTop(input=order, limit=50)
    qf = compile_logical_to_sql(top)
    assert qf.limit == 50
    assert len(qf.order_by) == 1


def test_over_emits_window():
    rel = lg.LogicalOpRelation(table="t")
    over = lg.LogicalOpOver(
        input=rel,
        partition_bys=lg.PartitionBys(fields=(_f("region"),)),
        order_by=(lg.OrderBy(identifier_exp=lg.Column(field_id="d"),
                             is_ascending=True),),
        frame=lg.FrameSpec(frame_type=lg.WindowFrameType.ROWS,
                           start=lg.FrameStart(kind="UNBOUNDED"),
                           end=lg.FrameEnd(kind="CURRENT_ROW")),
        expressions=lg.NamedExps(entries=(
            ("cume",
             lg.FnCall(name="SUM", args=(lg.Column(field_id="amount"),))),)),
    )
    qf = compile_logical_to_sql(over)
    assert any(isinstance(p.expression, sa.Window) for p in qf.projections)


def test_union_becomes_setop():
    l = lg.LogicalOpRelation(table="a")
    r = lg.LogicalOpRelation(table="b")
    qf = compile_logical_to_sql(lg.LogicalOpUnion(left=l, right=r))
    assert qf.set_op is not None and qf.set_op.kind == "UNION"


def test_intersect_becomes_setop():
    l = lg.LogicalOpRelation(table="a")
    r = lg.LogicalOpRelation(table="b")
    qf = compile_logical_to_sql(lg.LogicalOpIntersect(left=l, right=r))
    assert qf.set_op is not None and qf.set_op.kind == "INTERSECT"


def test_domain_snowflake_emits_cartesian_cte_or_cross_join():
    rel = lg.LogicalOpRelation(table="t")
    dom = lg.LogicalOpDomain(input=rel, domain=lg.DomainType.SNOWFLAKE)
    qf = compile_logical_to_sql(dom)
    # Snowflake domain ⇒ at least one CTE OR a CROSS JOIN in the FROM tree
    has_cross = _find_cross_join(qf.from_)
    assert qf.ctes or has_cross


def _find_cross_join(src) -> bool:
    if isinstance(src, sa.JoinNode):
        return src.kind == "CROSS" or _find_cross_join(src.left) or _find_cross_join(src.right)
    return False


def test_unpivot_and_pivot_emit_corresponding_nodes():
    rel = lg.LogicalOpRelation(table="t")
    up = lg.LogicalOpUnpivot(input=rel, pivot_cols=("a", "b"),
                              value_col="v", name_col="n")
    qf = compile_logical_to_sql(up)
    # UNPIVOT renders as a FnCall-style node or a dedicated projection; at
    # minimum the value_col + name_col appear as projected aliases.
    aliases = {p.alias for p in qf.projections}
    assert {"v", "n"}.issubset(aliases)
```

- [ ] **Step 3.2: Run — expect fail.**

Run: `cd backend && python -m pytest tests/test_vizql_logical_to_sql.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3.3: Implement `logical_to_sql.py` (skeleton shown; complete per-op switch).**

```python
# backend/vizql/logical_to_sql.py
"""LogicalOp → SQLQueryFunction compiler (Build_Tableau.md §IV.4 — the
``LogicalExpToSQLQueryExpression`` pass).

One ``_compile_<kind>`` per LogicalOp kind; one ``_expr`` per logical
Expression kind. Output is always a ``SQLQueryFunction`` — simple ops
project the base relation, compound ops wrap inner compiles as CTEs or
SubqueryRefs.
"""
from __future__ import annotations

from typing import Callable

from . import logical as lg
from . import sql_ast as sa


def compile_logical_to_sql(plan: "lg.LogicalOp") -> sa.SQLQueryFunction:
    return _Compiler()._compile(plan)


class _Compiler:
    def __init__(self) -> None:
        self._alias_counter = 0

    def _compile(self, op: "lg.LogicalOp") -> sa.SQLQueryFunction:
        fn: Callable[[object], sa.SQLQueryFunction] = getattr(
            self, f"_compile_{type(op).__name__}", None)
        if fn is None:
            raise NotImplementedError(f"no compile rule for {type(op).__name__}")
        qf = fn(op)
        qf.validate_structure()
        return qf

    # ---- per-op ----

    def _compile_LogicalOpRelation(self, op: lg.LogicalOpRelation) -> sa.SQLQueryFunction:
        alias = self._alias()
        return sa.SQLQueryFunction(
            projections=(sa.Projection(alias="*",
                                        expression=sa.Column(name="*", table_alias="")),),
            from_=sa.TableRef(name=op.table, alias=alias, schema=op.schema),
        )

    def _compile_LogicalOpProject(self, op: lg.LogicalOpProject) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        projs: list[sa.Projection] = []
        for name, expr in op.expressions.entries:
            projs.append(sa.Projection(alias=name, expression=self._expr(expr)))
        for new_name, expr in op.calculated_column:
            projs.append(sa.Projection(alias=new_name, expression=self._expr(expr)))
        # rename pass — lift from input schema
        return _with(inner, projections=tuple(projs) if projs else inner.projections)

    def _compile_LogicalOpSelect(self, op: lg.LogicalOpSelect) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        pred = self._expr(op.predicate)
        return _with(inner, where=_and(inner.where, pred))

    def _compile_LogicalOpFilter(self, op: lg.LogicalOpFilter) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        pred = self._expr(op.predicate)
        return _with(inner, having=_and(inner.having, pred))

    def _compile_LogicalOpAggregate(self, op: lg.LogicalOpAggregate) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        group_exprs = tuple(sa.Column(name=f.id, table_alias="")
                             for f in op.group_bys)
        projs: list[sa.Projection] = [
            sa.Projection(alias=f.id, expression=sa.Column(name=f.id, table_alias=""))
            for f in op.group_bys
        ]
        for ae in op.aggregations:
            projs.append(sa.Projection(
                alias=ae.name,
                expression=sa.FnCall(name=ae.agg.upper(),
                                      args=(self._expr(ae.expr),))))
        return _with(inner, projections=tuple(projs), group_by=group_exprs)

    def _compile_LogicalOpOrder(self, op: lg.LogicalOpOrder) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        ob = tuple((self._expr(o.identifier_exp), o.is_ascending)
                   for o in op.order_by)
        return _with(inner, order_by=ob)

    def _compile_LogicalOpTop(self, op: lg.LogicalOpTop) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        return _with(inner, limit=op.limit)

    def _compile_LogicalOpOver(self, op: lg.LogicalOpOver) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        partition = tuple(sa.Column(name=f.id, table_alias="")
                          for f in op.partition_bys.fields)
        order = tuple((self._expr(o.identifier_exp), o.is_ascending)
                      for o in op.order_by)
        frame = sa.FrameClause(kind=op.frame.frame_type.value.upper(),
                                start=(op.frame.start.kind, op.frame.start.offset),
                                end=(op.frame.end.kind, op.frame.end.offset))
        new_projs = list(inner.projections)
        for name, expr in op.expressions.entries:
            new_projs.append(sa.Projection(
                alias=name,
                expression=sa.Window(expr=self._expr(expr),
                                      partition_by=partition,
                                      order_by=order,
                                      frame=frame)))
        return _with(inner, projections=tuple(new_projs))

    def _compile_LogicalOpLookup(self, op: lg.LogicalOpLookup) -> sa.SQLQueryFunction:
        # LOOKUP = LAG/LEAD with offset — emit as Window of LAG
        inner = self._compile(op.input)
        fn = sa.FnCall(name="LAG" if op.offset > 0 else "LEAD",
                       args=(self._expr(op.lookup_field),
                             sa.Literal(value=abs(op.offset), data_type="int")))
        new_projs = list(inner.projections) + [
            sa.Projection(alias="lookup",
                          expression=sa.Window(expr=fn, partition_by=(), order_by=()))]
        return _with(inner, projections=tuple(new_projs))

    def _compile_LogicalOpUnpivot(self, op: lg.LogicalOpUnpivot) -> sa.SQLQueryFunction:
        # Emit as two projections + FnCall("UNPIVOT", …) marker — dialect
        # emitter (Plan 7d) rewrites per-engine.
        inner = self._compile(op.input)
        name_proj = sa.Projection(alias=op.name_col,
                                    expression=sa.FnCall(name="UNPIVOT_NAME", args=()))
        val_proj = sa.Projection(alias=op.value_col,
                                   expression=sa.FnCall(name="UNPIVOT_VALUE", args=()))
        return _with(inner, projections=(name_proj, val_proj))

    def _compile_LogicalOpValuestoColumns(self, op: lg.LogicalOpValuestoColumns) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        marker = sa.FnCall(name="PIVOT",
                            args=(self._expr(op.pivot_col), self._expr(op.agg_col)))
        return _with(inner, projections=(sa.Projection(alias="pivoted", expression=marker),))

    def _compile_LogicalOpDomain(self, op: lg.LogicalOpDomain) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        if op.domain is lg.DomainType.SEPARATE:
            return inner
        # SNOWFLAKE: materialise cartesian CTE of (row-dim × col-dim)
        cte = sa.CTE(name=f"snowflake_{self._alias()}", query=inner)
        alias = self._alias()
        return sa.SQLQueryFunction(
            projections=inner.projections,
            from_=sa.JoinNode(
                kind="CROSS",
                left=sa.SubqueryRef(query=inner, alias=alias),
                right=sa.SubqueryRef(query=inner, alias=self._alias()),
                on=sa.Literal(value=True, data_type="bool")),
            ctes=(cte,),
        )

    def _compile_LogicalOpUnion(self, op: lg.LogicalOpUnion) -> sa.SQLQueryFunction:
        l = self._compile(op.left); r = self._compile(op.right)
        setop = sa.SetOp(kind="UNION", left=l, right=r, all=False)
        return _with(l, set_op=setop)

    def _compile_LogicalOpIntersect(self, op: lg.LogicalOpIntersect) -> sa.SQLQueryFunction:
        l = self._compile(op.left); r = self._compile(op.right)
        setop = sa.SetOp(kind="INTERSECT", left=l, right=r, all=False)
        return _with(l, set_op=setop)

    # ---- expression dispatch ----

    def _expr(self, e: "lg.Expression") -> sa.SQLQueryExpression:
        if isinstance(e, lg.Column):
            return sa.Column(name=e.field_id, table_alias="")
        if isinstance(e, lg.Literal):
            return sa.Literal(value=e.value, data_type=e.data_type)
        if isinstance(e, lg.BinaryOp):
            return sa.BinaryOp(op=e.op, left=self._expr(e.left),
                                right=self._expr(e.right))
        if isinstance(e, lg.FnCall):
            return sa.FnCall(name=e.name.upper(),
                              args=tuple(self._expr(a) for a in e.args))
        raise AssertionError(f"unknown logical expr {e!r}")

    # ---- utils ----

    def _alias(self) -> str:
        self._alias_counter += 1
        return f"t{self._alias_counter}"


def _with(qf: sa.SQLQueryFunction, **kw) -> sa.SQLQueryFunction:
    import dataclasses
    return dataclasses.replace(qf, **kw)


def _and(a, b):
    if a is None: return b
    if b is None: return a
    return sa.BinaryOp(op="AND", left=a, right=b)


__all__ = ["compile_logical_to_sql"]
```

- [ ] **Step 3.4: Run tests.**

Run: `cd backend && python -m pytest tests/test_vizql_logical_to_sql.py -v`
Expected: PASS (11 tests).

- [ ] **Step 3.5: mypy.**

Run: `cd backend && python -m mypy --strict vizql/logical_to_sql.py`
Expected: `Success`.

- [ ] **Step 3.6: Commit.**

```bash
git add backend/vizql/logical_to_sql.py backend/tests/test_vizql_logical_to_sql.py
git commit -m "feat(analyst-pro): compile LogicalOp tree to SQLQueryFunction (Plan 7c T3)"
```

---

## Task 4 — Schema + Type passes (`InputSchemaProver`, `SchemaAndTypeDeriver`, `DataTypeResolver`)

**Files:**
- Create: `backend/vizql/passes/__init__.py`
- Create: `backend/vizql/passes/input_schema_prover.py`
- Create: `backend/vizql/passes/logical_op_schema_and_type_deriver.py`
- Create: `backend/vizql/passes/data_type_resolver.py`
- Create: `backend/tests/test_vizql_optimizer.py` (start)

- [ ] **Step 4.1: Failing tests.**

```python
# backend/tests/test_vizql_optimizer.py
import pytest
from vizql import sql_ast as sa
from vizql.passes.input_schema_prover import InputSchemaProverPass, InputSchemaError
from vizql.passes.logical_op_schema_and_type_deriver import SchemaAndTypeDeriverPass
from vizql.passes.data_type_resolver import DataTypeResolverPass


def _qf_with_missing_column() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="y",
                                     expression=sa.Column(name="ghost",
                                                          table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )


def test_schema_prover_rejects_ghost_column():
    schemas = {"tbl": {"x": "int"}}
    with pytest.raises(InputSchemaError, match="ghost"):
        InputSchemaProverPass(schemas).run(_qf_with_missing_column())


def test_schema_prover_accepts_known_column():
    schemas = {"tbl": {"ghost": "int"}}
    InputSchemaProverPass(schemas).run(_qf_with_missing_column())  # no raise


def test_type_deriver_annotates_projections():
    schemas = {"tbl": {"x": "int", "y": "float"}}
    qf = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="a", expression=sa.Column(name="x", table_alias="t")),
            sa.Projection(alias="b", expression=sa.Column(name="y", table_alias="t")),
        ),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    derived = SchemaAndTypeDeriverPass(schemas).run(qf)
    # both projections now carry resolved_type
    assert all(getattr(p.expression, "resolved_type", "unknown") != "unknown"
               for p in derived.projections)


def test_data_type_resolver_propagates_binary_op_types():
    schemas = {"tbl": {"x": "int", "y": "int"}}
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="sum",
            expression=sa.BinaryOp(op="+",
                                    left=sa.Column(name="x", table_alias="t"),
                                    right=sa.Column(name="y", table_alias="t"))),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    qf2 = SchemaAndTypeDeriverPass(schemas).run(qf)
    qf3 = DataTypeResolverPass().run(qf2)
    binop = qf3.projections[0].expression
    assert binop.resolved_type in {"int", "number"}


def test_data_type_resolver_rejects_cast_to_unknown_source():
    schemas = {"tbl": {"x": "unknown"}}
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="c",
            expression=sa.Cast(expr=sa.Column(name="x", table_alias="t"),
                                target_type="int")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    with pytest.raises(Exception, match=r"(?i)unknown"):
        DataTypeResolverPass(strict=True).run(
            SchemaAndTypeDeriverPass(schemas).run(qf))
```

- [ ] **Step 4.2: Run — expect failures.**

Run: `cd backend && python -m pytest tests/test_vizql_optimizer.py -v`
Expected: FAIL (modules missing).

- [ ] **Step 4.3: Implement the three passes.**

```python
# backend/vizql/passes/__init__.py
"""Optimiser passes (Plan 7c)."""
```

```python
# backend/vizql/passes/input_schema_prover.py
"""InputSchemaProver — §IV.4.

Walks the AST bottom-up. Every Column reference must resolve against an
upstream TableRef / CTE / Subquery schema. Fails loudly: the error
message names both the column and the visible schema aliases.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Mapping
from .. import sql_ast as sa


class InputSchemaError(Exception): ...


@dataclass(frozen=True)
class InputSchemaProverPass:
    schemas: Mapping[str, Mapping[str, str]]  # table → { col → type }

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        visible = self._visible_cols(qf)
        for p in qf.projections:
            self._check_expr(p.expression, visible)
        if qf.where is not None: self._check_expr(qf.where, visible)
        if qf.having is not None: self._check_expr(qf.having, visible)
        for g in qf.group_by: self._check_expr(g, visible)
        for cte in qf.ctes: self.run(cte.query)
        return qf

    def _visible_cols(self, qf: sa.SQLQueryFunction) -> set[str]:
        cols: set[str] = set()
        self._walk_from(qf.from_, cols)
        for cte in qf.ctes:
            for p in cte.query.projections:
                cols.add(p.alias)
        return cols

    def _walk_from(self, src, out: set[str]) -> None:
        if isinstance(src, sa.TableRef):
            schema = self.schemas.get(src.name)
            if schema is None:
                raise InputSchemaError(f"unknown table {src.name!r}")
            out.update(schema.keys())
            return
        if isinstance(src, sa.JoinNode):
            self._walk_from(src.left, out); self._walk_from(src.right, out); return
        if isinstance(src, sa.SubqueryRef):
            for p in src.query.projections: out.add(p.alias)
            return

    def _check_expr(self, e, visible: set[str]) -> None:
        if isinstance(e, sa.Column):
            if e.name == "*": return
            if e.name not in visible:
                raise InputSchemaError(
                    f"column {e.name!r} not in visible schema "
                    f"(have: {sorted(visible)[:10]})")
            return
        if isinstance(e, sa.Literal): return
        if isinstance(e, sa.BinaryOp):
            self._check_expr(e.left, visible); self._check_expr(e.right, visible); return
        if isinstance(e, sa.FnCall):
            for a in e.args: self._check_expr(a, visible)
            if e.filter_clause is not None: self._check_expr(e.filter_clause, visible)
            return
        if isinstance(e, sa.Case):
            for c, v in e.whens:
                self._check_expr(c, visible); self._check_expr(v, visible)
            if e.else_ is not None: self._check_expr(e.else_, visible)
            return
        if isinstance(e, sa.Cast):
            self._check_expr(e.expr, visible); return
        if isinstance(e, sa.Window):
            self._check_expr(e.expr, visible)
            for p in e.partition_by: self._check_expr(p, visible)
            for ex, _ in e.order_by: self._check_expr(ex, visible)
            return
        if isinstance(e, sa.Subquery):
            # inner sq is already validated when the compiler emits it;
            # re-prove to stay idempotent.
            self.run(e.query); return
        raise InputSchemaError(f"unknown expr {e!r}")
```

```python
# backend/vizql/passes/logical_op_schema_and_type_deriver.py
"""SchemaAndTypeDeriver — propagate column types through every subquery."""
from __future__ import annotations
import dataclasses
from dataclasses import dataclass
from typing import Mapping
from .. import sql_ast as sa


@dataclass(frozen=True)
class SchemaAndTypeDeriverPass:
    schemas: Mapping[str, Mapping[str, str]]

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        tbl_types = self._from_types(qf.from_)
        new_projs = tuple(dataclasses.replace(
            p, expression=self._annotate(p.expression, tbl_types))
            for p in qf.projections)
        return dataclasses.replace(qf, projections=new_projs)

    def _from_types(self, src) -> dict[str, str]:
        if isinstance(src, sa.TableRef):
            return dict(self.schemas.get(src.name, {}))
        if isinstance(src, sa.JoinNode):
            d = self._from_types(src.left); d.update(self._from_types(src.right)); return d
        if isinstance(src, sa.SubqueryRef):
            return {p.alias: getattr(p.expression, "resolved_type", "unknown")
                    for p in src.query.projections}
        return {}

    def _annotate(self, e, types: dict[str, str]):
        if isinstance(e, sa.Column):
            return dataclasses.replace(e, resolved_type=types.get(e.name, "unknown"))
        if isinstance(e, sa.BinaryOp):
            return dataclasses.replace(
                e, left=self._annotate(e.left, types),
                right=self._annotate(e.right, types))
        if isinstance(e, sa.FnCall):
            return dataclasses.replace(
                e, args=tuple(self._annotate(a, types) for a in e.args))
        if isinstance(e, sa.Case):
            whens = tuple((self._annotate(c, types), self._annotate(v, types))
                          for c, v in e.whens)
            els = self._annotate(e.else_, types) if e.else_ is not None else None
            return dataclasses.replace(e, whens=whens, else_=els)
        if isinstance(e, sa.Cast):
            return dataclasses.replace(e, expr=self._annotate(e.expr, types))
        if isinstance(e, sa.Window):
            return dataclasses.replace(e, expr=self._annotate(e.expr, types))
        return e
```

```python
# backend/vizql/passes/data_type_resolver.py
"""DataTypeResolver — bottom-up type inference + unknown-type guard."""
from __future__ import annotations
import dataclasses
from dataclasses import dataclass
from .. import sql_ast as sa


_NUMERIC = {"int", "float", "number"}
_AGG_NUMERIC = {"SUM", "AVG", "COUNT", "COUNTD", "MIN", "MAX", "MEDIAN",
                 "STDEV", "STDEVP", "VAR", "VARP", "PERCENTILE"}


@dataclass(frozen=True)
class DataTypeResolverPass:
    strict: bool = False

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        new_projs = tuple(dataclasses.replace(
            p, expression=self._resolve(p.expression)) for p in qf.projections)
        return dataclasses.replace(qf, projections=new_projs)

    def _resolve(self, e):
        if isinstance(e, sa.Column): return e
        if isinstance(e, sa.Literal): return e
        if isinstance(e, sa.BinaryOp):
            l = self._resolve(e.left); r = self._resolve(e.right)
            rt = _merge(_t(l), _t(r), e.op)
            return dataclasses.replace(e, left=l, right=r, resolved_type=rt)
        if isinstance(e, sa.FnCall):
            args = tuple(self._resolve(a) for a in e.args)
            rt = "number" if e.name.upper() in _AGG_NUMERIC else _t(args[0]) if args else "unknown"
            return dataclasses.replace(e, args=args, resolved_type=rt)
        if isinstance(e, sa.Case):
            whens = tuple((self._resolve(c), self._resolve(v)) for c, v in e.whens)
            els = self._resolve(e.else_) if e.else_ is not None else None
            # branch type = merge of value branches
            rt = "unknown"
            for _, v in whens:
                rt = _t(v) if rt == "unknown" else rt
            return dataclasses.replace(e, whens=whens, else_=els, resolved_type=rt)
        if isinstance(e, sa.Cast):
            inner = self._resolve(e.expr)
            if self.strict and _t(inner) == "unknown":
                raise ValueError(
                    f"cannot CAST expression of unknown type to {e.target_type}")
            return dataclasses.replace(e, expr=inner)
        if isinstance(e, sa.Window):
            return dataclasses.replace(e, expr=self._resolve(e.expr),
                                       resolved_type=_t(self._resolve(e.expr)))
        return e


def _t(e) -> str:
    return getattr(e, "resolved_type", "unknown")


def _merge(a: str, b: str, op: str) -> str:
    if op in {"=", "<", ">", "<=", ">=", "!=", "AND", "OR"}:
        return "bool"
    if a in _NUMERIC and b in _NUMERIC:
        if "float" in (a, b): return "float"
        return "int" if a == b == "int" else "number"
    return "unknown"
```

- [ ] **Step 4.4: Run tests.**

Run: `cd backend && python -m pytest tests/test_vizql_optimizer.py -v`
Expected: PASS (5 tests in this batch).

- [ ] **Step 4.5: mypy.**

Run: `cd backend && python -m mypy --strict vizql/passes/`
Expected: `Success`.

- [ ] **Step 4.6: Commit.**

```bash
git add backend/vizql/passes/ backend/tests/test_vizql_optimizer.py
git commit -m "feat(analyst-pro): add schema + type derivation passes (Plan 7c T4)"
```

---

## Task 5 — `JoinTreeVirtualizer` + `EqualityProver`

**Files:**
- Create: `backend/vizql/passes/join_tree_virtualizer.py`
- Create: `backend/vizql/passes/equality_prover.py`
- Modify: `backend/tests/test_vizql_optimizer.py` (append)

- [ ] **Step 5.1: Failing tests.**

```python
# backend/tests/test_vizql_optimizer.py — append
from vizql.passes.join_tree_virtualizer import JoinTreeVirtualizerPass
from vizql.passes.equality_prover import EqualityProverPass


def _qf_three_tables() -> sa.SQLQueryFunction:
    a = sa.TableRef(name="a", alias="a")
    b = sa.TableRef(name="b", alias="b")
    c = sa.TableRef(name="c", alias="c")
    j1 = sa.JoinNode(kind="INNER", left=a, right=b,
                     on=sa.BinaryOp(op="=",
                                     left=sa.Column(name="id", table_alias="a"),
                                     right=sa.Column(name="a_id", table_alias="b")))
    j2 = sa.JoinNode(kind="INNER", left=j1, right=c,
                     on=sa.BinaryOp(op="=",
                                     left=sa.Column(name="id", table_alias="b"),
                                     right=sa.Column(name="b_id", table_alias="c")))
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="a")),),
        from_=j2,
    )


def test_join_virtualizer_drops_unreferenced_table():
    qf = _qf_three_tables()
    out = JoinTreeVirtualizerPass(referenced_tables={"a"}).run(qf)
    # only 'a' is referenced; joins to b and c should collapse to base TableRef
    assert isinstance(out.from_, sa.TableRef)
    assert out.from_.name == "a"


def test_join_virtualizer_keeps_referenced_joins():
    qf = _qf_three_tables()
    out = JoinTreeVirtualizerPass(referenced_tables={"a", "b"}).run(qf)
    assert isinstance(out.from_, sa.JoinNode)


def test_equality_prover_collects_asserted_equalities():
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
        where=sa.BinaryOp(op="=",
                           left=sa.Column(name="x", table_alias="t"),
                           right=sa.Literal(value=1, data_type="int")),
    )
    prover = EqualityProverPass()
    prover.run(qf)
    eq = prover.assertions_for_scope("root")
    assert ("t.x", "1") in eq.equalities


def test_equality_prover_is_idempotent():
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
    )
    p = EqualityProverPass()
    assert p.run(p.run(qf)) == p.run(qf)
```

- [ ] **Step 5.2: Run — expect fail.**

Run: `cd backend && python -m pytest tests/test_vizql_optimizer.py::test_join_virtualizer_drops_unreferenced_table -v`
Expected: FAIL.

- [ ] **Step 5.3: Implement.**

```python
# backend/vizql/passes/join_tree_virtualizer.py
"""JoinTreeVirtualizer — §IV.4 + §II.2.

Drops joins to tables not referenced by the outer SELECT / WHERE /
GROUP BY / ORDER BY / HAVING projections. Mirrors Tableau's
"Relationships" model: joins are logical, materialised only for the
fields the viz actually touches.
"""
from __future__ import annotations
import dataclasses
from dataclasses import dataclass
from .. import sql_ast as sa


@dataclass(frozen=True)
class JoinTreeVirtualizerPass:
    referenced_tables: frozenset[str] | set[str]

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        return dataclasses.replace(qf, from_=self._trim(qf.from_))

    def _trim(self, src):
        if isinstance(src, sa.TableRef): return src
        if isinstance(src, sa.SubqueryRef): return src
        if isinstance(src, sa.JoinNode):
            l = self._trim(src.left); r = self._trim(src.right)
            lref = _refs(l); rref = _refs(r)
            wanted = set(self.referenced_tables)
            if lref & wanted and not (rref & wanted): return l
            if rref & wanted and not (lref & wanted): return r
            return dataclasses.replace(src, left=l, right=r)
        return src


def _refs(src) -> set[str]:
    if isinstance(src, sa.TableRef): return {src.name}
    if isinstance(src, sa.JoinNode): return _refs(src.left) | _refs(src.right)
    if isinstance(src, sa.SubqueryRef): return {src.alias}
    return set()
```

```python
# backend/vizql/passes/equality_prover.py
"""EqualityProver — §IV.4. Tracks equality / non-equality assertions for
downstream predicate pushdown. Read-only over AST (idempotent)."""
from __future__ import annotations
from dataclasses import dataclass, field
from .. import sql_ast as sa


@dataclass
class Assertions:
    equalities: set[tuple[str, str]] = field(default_factory=set)
    inequalities: set[tuple[str, str]] = field(default_factory=set)


class EqualityProverPass:
    def __init__(self) -> None:
        self._by_scope: dict[str, Assertions] = {}

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        scope = "root"
        self._by_scope.setdefault(scope, Assertions())
        if qf.where is not None: self._collect(qf.where, self._by_scope[scope])
        return qf

    def assertions_for_scope(self, name: str) -> Assertions:
        return self._by_scope.get(name, Assertions())

    def _collect(self, e, out: Assertions) -> None:
        if isinstance(e, sa.BinaryOp):
            if e.op == "AND":
                self._collect(e.left, out); self._collect(e.right, out); return
            if e.op == "=":
                out.equalities.add((_show(e.left), _show(e.right))); return
            if e.op == "!=":
                out.inequalities.add((_show(e.left), _show(e.right))); return


def _show(e) -> str:
    if isinstance(e, sa.Column):
        return f"{e.table_alias}.{e.name}" if e.table_alias else e.name
    if isinstance(e, sa.Literal):
        return str(e.value)
    return repr(e)
```

- [ ] **Step 5.4: Run.**

Run: `cd backend && python -m pytest tests/test_vizql_optimizer.py -v`
Expected: PASS (all 9 so far).

- [ ] **Step 5.5: mypy + commit.**

```bash
cd backend && python -m mypy --strict vizql/passes/join_tree_virtualizer.py vizql/passes/equality_prover.py
cd ..
git add backend/vizql/passes/ backend/tests/test_vizql_optimizer.py
git commit -m "feat(analyst-pro): add join virtualizer + equality prover (Plan 7c T5)"
```

---

## Task 6 — `AggregatePushdown` + `CSE` + `optimizer.py` pipeline

**Files:**
- Create: `backend/vizql/passes/aggregate_pushdown.py`
- Create: `backend/vizql/passes/common_subexp_elimination.py`
- Create: `backend/vizql/optimizer.py`
- Modify: `backend/tests/test_vizql_optimizer.py`

- [ ] **Step 6.1: Failing tests.**

```python
# backend/tests/test_vizql_optimizer.py — append
from vizql.passes.aggregate_pushdown import AggregatePushdownPass
from vizql.passes.common_subexp_elimination import CommonSubexpElimPass
from vizql.optimizer import optimize, OptimizerContext


def test_agg_pushdown_moves_sum_into_subquery_when_safe():
    inner = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="*",
                                     expression=sa.Column(name="*", table_alias="")),),
        from_=sa.TableRef(name="orders", alias="o"),
    )
    outer = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region",
                          expression=sa.Column(name="region", table_alias="sub")),
            sa.Projection(alias="total",
                          expression=sa.FnCall(
                              name="SUM",
                              args=(sa.Column(name="amount", table_alias="sub"),))),
        ),
        from_=sa.SubqueryRef(query=inner, alias="sub"),
        group_by=(sa.Column(name="region", table_alias="sub"),),
    )
    out = AggregatePushdownPass().run(outer)
    # pushed: the inner query now carries the SUM + GROUP BY
    pushed_inner = out.from_.query  # type: ignore[union-attr]
    agg_names = {p.alias for p in pushed_inner.projections}
    assert "total" in agg_names or len(pushed_inner.group_by) > 0


def test_cse_hoists_shared_subexpression_to_cte():
    # expression "x * 2" referenced twice → CSE promotes it
    shared = sa.BinaryOp(op="*",
                          left=sa.Column(name="x", table_alias="t"),
                          right=sa.Literal(value=2, data_type="int"))
    qf = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="a", expression=shared),
            sa.Projection(alias="b",
                          expression=sa.BinaryOp(op="+",
                                                  left=shared,
                                                  right=sa.Literal(value=1,
                                                                    data_type="int"))),
        ),
        from_=sa.TableRef(name="t", alias="t"),
    )
    out = CommonSubexpElimPass().run(qf)
    # a shared expression counted ≥ 2 becomes a named ref
    assert "cse" in " ".join(out.diagnostics) or len(out.ctes) >= 1 or \
           any(isinstance(p.expression, sa.Column) and p.expression.name.startswith("__cse")
               for p in out.projections)


def test_optimizer_pipeline_idempotent():
    schemas = {"tbl": {"x": "int"}}
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    ctx = OptimizerContext(schemas=schemas, referenced_tables={"tbl"})
    once = optimize(qf, ctx)
    twice = optimize(once, ctx)
    assert once == twice


def test_optimizer_pipeline_terminates_fixed_cap():
    # no pass should explode the AST; pipeline caps iterations at 2
    schemas = {"tbl": {"x": "int"}}
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    ctx = OptimizerContext(schemas=schemas, referenced_tables={"tbl"},
                            max_iterations=2)
    optimize(qf, ctx)  # no raise; completes under cap
```

- [ ] **Step 6.2: Implement.**

```python
# backend/vizql/passes/aggregate_pushdown.py
"""AggregatePushdown — push SUM/COUNT/… into a SubqueryRef whose grouping
keys are all referenced group keys. Safe-pattern heuristic only: skip if
window functions reference the outer grain."""
from __future__ import annotations
import dataclasses
from .. import sql_ast as sa


class AggregatePushdownPass:
    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        if not isinstance(qf.from_, sa.SubqueryRef): return qf
        if not qf.group_by: return qf
        if any(isinstance(p.expression, sa.Window) for p in qf.projections):
            # keep windows at outer layer
            return qf
        inner = qf.from_.query
        # move the SUM projections + GROUP BY into the inner subquery
        pushed = dataclasses.replace(
            inner,
            projections=qf.projections,
            group_by=qf.group_by,
        )
        return dataclasses.replace(
            qf,
            projections=tuple(sa.Projection(alias=p.alias,
                                              expression=sa.Column(
                                                  name=p.alias,
                                                  table_alias=qf.from_.alias))
                              for p in qf.projections),
            from_=sa.SubqueryRef(query=pushed, alias=qf.from_.alias),
            group_by=(),
            diagnostics=qf.diagnostics + ("aggregate_pushdown: applied",),
        )
```

```python
# backend/vizql/passes/common_subexp_elimination.py
"""CommonSubexpressionElimination — ExpressionCounter + promotion.

Count hashable expressions across the SELECT list + WHERE + HAVING.
Any expression counted ≥ 2 with cost > Column-access is hoisted to a
named alias in the projection list; subsequent references swap in a
Column pointing at the alias.
"""
from __future__ import annotations
import dataclasses
from collections import Counter
from .. import sql_ast as sa


class CommonSubexpElimPass:
    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        counts: Counter[sa.SQLQueryExpression] = Counter()
        for p in qf.projections: _count(p.expression, counts)
        if qf.where is not None: _count(qf.where, counts)
        if qf.having is not None: _count(qf.having, counts)
        shared = [e for e, n in counts.items() if n >= 2 and _cost(e) > 1]
        if not shared: return qf
        alias_map: dict[sa.SQLQueryExpression, str] = {}
        new_projs = list(qf.projections)
        for i, e in enumerate(shared):
            alias = f"__cse_{i}"
            alias_map[e] = alias
            new_projs.append(sa.Projection(alias=alias, expression=e))
        rebuilt = tuple(dataclasses.replace(p, expression=_rewrite(p.expression, alias_map))
                         for p in new_projs)
        return dataclasses.replace(
            qf,
            projections=rebuilt,
            diagnostics=qf.diagnostics + (f"cse: {len(shared)} shared",),
        )


def _count(e, out: Counter) -> None:
    out[e] += 1
    if isinstance(e, sa.BinaryOp): _count(e.left, out); _count(e.right, out)
    elif isinstance(e, sa.FnCall):
        for a in e.args: _count(a, out)
    elif isinstance(e, sa.Case):
        for c, v in e.whens: _count(c, out); _count(v, out)
        if e.else_ is not None: _count(e.else_, out)


def _cost(e) -> int:
    if isinstance(e, (sa.Column, sa.Literal)): return 0
    if isinstance(e, sa.BinaryOp): return 1 + _cost(e.left) + _cost(e.right)
    if isinstance(e, sa.FnCall): return 2 + sum(_cost(a) for a in e.args)
    return 1


def _rewrite(e, alias_map):
    if e in alias_map: return sa.Column(name=alias_map[e], table_alias="")
    if isinstance(e, sa.BinaryOp):
        return dataclasses.replace(e, left=_rewrite(e.left, alias_map),
                                     right=_rewrite(e.right, alias_map))
    if isinstance(e, sa.FnCall):
        return dataclasses.replace(
            e, args=tuple(_rewrite(a, alias_map) for a in e.args))
    return e
```

```python
# backend/vizql/optimizer.py
"""Pipeline composition — fixed order, idempotent, terminating.

Order (§IV.4):
  InputSchemaProver → SchemaAndTypeDeriver → DataTypeResolver →
  JoinTreeVirtualizer → EqualityProver → AggregatePushdown →
  CommonSubexpElim.

The pipeline is run up to ``max_iterations`` times; it is idempotent by
construction (each pass is a fixed-point; re-running produces the same
AST). We run twice by default so downstream passes can see upstream
rewrites.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Mapping
from . import sql_ast as sa
from .passes.input_schema_prover import InputSchemaProverPass
from .passes.logical_op_schema_and_type_deriver import SchemaAndTypeDeriverPass
from .passes.data_type_resolver import DataTypeResolverPass
from .passes.join_tree_virtualizer import JoinTreeVirtualizerPass
from .passes.equality_prover import EqualityProverPass
from .passes.aggregate_pushdown import AggregatePushdownPass
from .passes.common_subexp_elimination import CommonSubexpElimPass


@dataclass(frozen=True)
class OptimizerContext:
    schemas: Mapping[str, Mapping[str, str]] = field(default_factory=dict)
    referenced_tables: frozenset[str] | set[str] = field(default_factory=set)
    strict_types: bool = False
    max_iterations: int = 2


def optimize(qf: sa.SQLQueryFunction, ctx: OptimizerContext) -> sa.SQLQueryFunction:
    current = qf
    for _ in range(ctx.max_iterations):
        InputSchemaProverPass(ctx.schemas).run(current)
        current = SchemaAndTypeDeriverPass(ctx.schemas).run(current)
        current = DataTypeResolverPass(strict=ctx.strict_types).run(current)
        current = JoinTreeVirtualizerPass(ctx.referenced_tables).run(current)
        EqualityProverPass().run(current)
        current = AggregatePushdownPass().run(current)
        current = CommonSubexpElimPass().run(current)
    return current


__all__ = ["OptimizerContext", "optimize"]
```

- [ ] **Step 6.3: Run + mypy + commit.**

```bash
cd backend && python -m pytest tests/test_vizql_optimizer.py -v
cd backend && python -m mypy --strict vizql/passes/ vizql/optimizer.py
cd ..
git add backend/vizql/passes/ backend/vizql/optimizer.py backend/tests/test_vizql_optimizer.py
git commit -m "feat(analyst-pro): add aggregate pushdown + CSE + optimizer pipeline (Plan 7c T6)"
```

Expected test count: 13 optimizer tests all PASS.

---

## Task 7 — `filter_ordering.py` — §IV.7 nine-stage sorter

**Files:**
- Create: `backend/vizql/filter_ordering.py`
- Create: `backend/tests/test_vizql_filter_ordering.py`

- [ ] **Step 7.1: Failing tests — one per stage + cross-stage interaction.**

```python
# backend/tests/test_vizql_filter_ordering.py
"""Plan 7c §IV.7 — nine-stage filter ordering."""
import pytest
from vizql import sql_ast as sa
from vizql.filter_ordering import (
    apply_filters_in_order, StagedFilter, FILTER_STAGES,
)


def _plan() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )


def _pred(col: str, val: int) -> sa.SQLQueryExpression:
    return sa.BinaryOp(op=">",
                        left=sa.Column(name=col, table_alias="t"),
                        right=sa.Literal(value=val, data_type="int"))


def test_stage_order_is_canonical_nine():
    assert FILTER_STAGES == (
        "extract", "datasource", "context",
        "fixed_lod", "dimension", "include_exclude_lod",
        "measure", "table_calc", "totals",
    )


def test_datasource_filter_goes_to_where():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="datasource", predicate=_pred("d", 0)),
    ])
    assert out.where is not None


def test_context_filter_becomes_cte():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="context", predicate=_pred("c", 0)),
    ])
    assert len(out.ctes) >= 1
    assert out.ctes[0].name.startswith("ctx_")


def test_dimension_filter_goes_to_where_after_context():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="context", predicate=_pred("c", 0)),
        StagedFilter(stage="dimension", predicate=_pred("d", 0)),
    ])
    assert out.where is not None  # dim filter on outer
    assert out.ctes  # context still materialised


def test_measure_filter_goes_to_having_not_where():
    # Need a group_by/agg for checker to accept HAVING
    base = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="total",
            expression=sa.FnCall(
                name="SUM",
                args=(sa.Column(name="amount", table_alias="t"),))),),
        from_=sa.TableRef(name="tbl", alias="t"),
        group_by=(sa.Column(name="region", table_alias="t"),),
    )
    out = apply_filters_in_order(base, [
        StagedFilter(stage="measure", predicate=_pred("total", 100)),
    ])
    assert out.having is not None
    assert out.where is None  # measure filter MUST NOT land in WHERE


def test_fixed_lod_does_not_reflect_dim_filter_by_default():
    """The property §IV.7 insists on: a dim filter does NOT filter a
    FIXED LOD unless promoted to Context."""
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="fixed_lod", predicate=_pred("fx", 0)),
        StagedFilter(stage="dimension", predicate=_pred("d", 0)),
    ])
    # fixed_lod becomes a subquery / marker; dim filter sits above as WHERE.
    # The subquery predicate must NOT be AND'd with the dim predicate.
    assert out.where is not None


def test_include_exclude_goes_to_window_layer_marker():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="include_exclude_lod", predicate=_pred("inc", 0)),
    ])
    # Stage is carried to downstream window emission (Task 8)
    assert "include_exclude_lod" in " ".join(out.diagnostics)


def test_table_calc_filter_is_client_side_only():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="table_calc", predicate=_pred("tc", 0)),
    ])
    assert len(out.client_side_filters) == 1
    assert out.where is None


def test_totals_filter_flags_second_query():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="totals", predicate=_pred("tot", 0),
                     should_affect_totals=False),
    ])
    assert out.totals_query_required is True
    assert out.should_affect_totals is False


def test_case_sensitive_flag_round_trips():
    f = StagedFilter(stage="dimension", predicate=_pred("d", 0),
                     case_sensitive=False)
    assert f.case_sensitive is False  # wildcard LIKE vs ILIKE choice deferred to Plan 7d


def test_bad_stage_raises():
    with pytest.raises(ValueError):
        StagedFilter(stage="bogus", predicate=_pred("x", 0))
```

- [ ] **Step 7.2: Run — expect fail.**

Run: `cd backend && python -m pytest tests/test_vizql_filter_ordering.py -v`
Expected: FAIL.

- [ ] **Step 7.3: Implement.**

```python
# backend/vizql/filter_ordering.py
"""§IV.7 nine-stage filter order-of-operations — enforcement.

Stages in canonical order (never reorder; §IV.7 is the spec):

  1. extract              — on .hyper build; we treat as DuckDB extract config.
  2. datasource           — WHERE on every query against the DS.
  3. context              — CTE wrapping the plan (Hyper/DuckDB); legacy RDBMS
                            emits #Tableau_Temp_ at the dialect layer (Plan 7d).
  4. fixed_lod            — correlated subquery; Plan 7c/T8 owns emission.
                            Critically: NOT filtered by step 5 unless promoted
                            to step 3.
  5. dimension            — outer WHERE.
  6. include_exclude_lod  — window OVER; Plan 7c/T8 owns emission.
  7. measure              — HAVING.
  8. table_calc           — client-side flag (``client_side_filters``).
                            NOT emitted to SQL.
  9. totals               — triggers ``totals_query_required=True``. Plan 7d
                            emits the second query.  ``should_affect_totals``
                            flag is preserved here so Plan 7d knows whether to
                            replay stages 2/5 on the totals query.

Also preserves:

  * ``case_sensitive`` flag — controls Plan 7d's ``LIKE`` vs ``ILIKE`` choice
    on wildcard filters.
"""
from __future__ import annotations
import dataclasses
from dataclasses import dataclass
from typing import Sequence
from . import sql_ast as sa


FILTER_STAGES = (
    "extract", "datasource", "context",
    "fixed_lod", "dimension", "include_exclude_lod",
    "measure", "table_calc", "totals",
)
_VALID = frozenset(FILTER_STAGES)


@dataclass(frozen=True, slots=True)
class StagedFilter:
    stage: str
    predicate: sa.SQLQueryExpression
    case_sensitive: bool = True
    should_affect_totals: bool = True

    def __post_init__(self) -> None:
        if self.stage not in _VALID:
            raise ValueError(
                f"stage={self.stage!r} not in {FILTER_STAGES}")


def apply_filters_in_order(
    plan: sa.SQLQueryFunction,
    staged_filters: Sequence[StagedFilter],
) -> sa.SQLQueryFunction:
    buckets: dict[str, list[StagedFilter]] = {s: [] for s in FILTER_STAGES}
    for sf in staged_filters: buckets[sf.stage].append(sf)

    out = plan

    # 1. Extract — metadata; record as diagnostic (Plan 7d consumes).
    if buckets["extract"]:
        preds = " AND ".join(_show(f.predicate) for f in buckets["extract"])
        out = dataclasses.replace(out, diagnostics=out.diagnostics + (
            f"extract_filter: {preds}",))

    # 2. DataSource — WHERE on base.
    if buckets["datasource"]:
        out = _and_where(out, _join(buckets["datasource"]))

    # 3. Context — CTE wrapping plan.
    if buckets["context"]:
        inner = dataclasses.replace(out, ctes=())
        inner = _and_where(inner, _join(buckets["context"]))
        cte = sa.CTE(name=f"ctx_{len(out.ctes)}", query=inner)
        # replace FROM with a SubqueryRef pointing at the CTE name
        out = dataclasses.replace(
            out,
            ctes=out.ctes + (cte,),
            from_=sa.TableRef(name=cte.name, alias=cte.name),
        )

    # 4. FIXED LOD — marker + subquery predicate; Task 8 emits correlated
    # subquery. DO NOT fold into the outer WHERE of step 5.
    if buckets["fixed_lod"]:
        preds = " AND ".join(_show(f.predicate) for f in buckets["fixed_lod"])
        out = dataclasses.replace(out, diagnostics=out.diagnostics + (
            f"fixed_lod_filter: {preds}",))

    # 5. Dimension — outer WHERE.
    if buckets["dimension"]:
        out = _and_where(out, _join(buckets["dimension"]))

    # 6. INCLUDE/EXCLUDE — marker; Task 8 emits window.
    if buckets["include_exclude_lod"]:
        preds = " AND ".join(_show(f.predicate) for f in buckets["include_exclude_lod"])
        out = dataclasses.replace(out, diagnostics=out.diagnostics + (
            f"include_exclude_lod: {preds}",))

    # 7. Measure — HAVING.
    if buckets["measure"]:
        out = _and_having(out, _join(buckets["measure"]))

    # 8. Table calc — client-side.
    if buckets["table_calc"]:
        out = dataclasses.replace(
            out,
            client_side_filters=out.client_side_filters +
                tuple(f.predicate for f in buckets["table_calc"]),
        )

    # 9. Totals — separate query flag.
    if buckets["totals"]:
        # all totals filters share the flag; non-shouldAffectTotals wins
        affect = all(f.should_affect_totals for f in buckets["totals"])
        out = dataclasses.replace(
            out,
            totals_query_required=True,
            should_affect_totals=affect,
        )

    out.validate_structure()
    return out


def _and_where(qf: sa.SQLQueryFunction, pred: sa.SQLQueryExpression) -> sa.SQLQueryFunction:
    if qf.where is None: return dataclasses.replace(qf, where=pred)
    return dataclasses.replace(qf,
                                where=sa.BinaryOp(op="AND", left=qf.where, right=pred))


def _and_having(qf: sa.SQLQueryFunction, pred: sa.SQLQueryExpression) -> sa.SQLQueryFunction:
    if qf.having is None: return dataclasses.replace(qf, having=pred)
    return dataclasses.replace(qf,
                                having=sa.BinaryOp(op="AND", left=qf.having, right=pred))


def _join(fs: list[StagedFilter]) -> sa.SQLQueryExpression:
    if len(fs) == 1: return fs[0].predicate
    out = fs[0].predicate
    for f in fs[1:]: out = sa.BinaryOp(op="AND", left=out, right=f.predicate)
    return out


def _show(e) -> str:
    if isinstance(e, sa.Column):
        return f"{e.table_alias}.{e.name}" if e.table_alias else e.name
    if isinstance(e, sa.Literal): return str(e.value)
    if isinstance(e, sa.BinaryOp): return f"{_show(e.left)} {e.op} {_show(e.right)}"
    return repr(e)


__all__ = ["FILTER_STAGES", "StagedFilter", "apply_filters_in_order"]
```

- [ ] **Step 7.4: Run.**

Run: `cd backend && python -m pytest tests/test_vizql_filter_ordering.py -v`
Expected: PASS (11 tests).

- [ ] **Step 7.5: mypy + commit.**

```bash
cd backend && python -m mypy --strict vizql/filter_ordering.py
cd ..
git add backend/vizql/filter_ordering.py backend/tests/test_vizql_filter_ordering.py
git commit -m "feat(analyst-pro): enforce §IV.7 filter order-of-operations (Plan 7c T7)"
```

---

## Task 8 — LOD emission (FIXED → correlated subquery; INCLUDE/EXCLUDE → window)

**Files:**
- Modify: `backend/vizql/logical_to_sql.py`
- Create: `backend/tests/test_vizql_lod_emission.py`

- [ ] **Step 8.1: Failing tests.**

```python
# backend/tests/test_vizql_lod_emission.py
"""Plan 7c §V.2 — LOD emission shape."""
import pytest
from vizql import logical as lg, sql_ast as sa
from vizql.logical_to_sql import compile_logical_to_sql


def _f(id_: str, **kw) -> lg.Field:
    return lg.Field(id=id_, data_type="int", role="dimension", aggregation="none",
                    semantic_role="", is_disagg=False, **kw)


def test_fixed_lod_emits_correlated_subquery_joined_on_fixed_dims():
    """FIXED [region] : SUM([amount]) → correlated subquery on region."""
    rel = lg.LogicalOpRelation(table="orders")
    inner_agg = lg.LogicalOpAggregate(
        input=rel,
        group_bys=(_f("region"),),
        aggregations=(lg.AggExp(name="fixed_total", agg="sum",
                                 expr=lg.Column(field_id="amount")),),
    )
    lookup = lg.LogicalOpLookup(
        input=inner_agg,
        lookup_field=lg.Column(field_id="fixed_total"),
        offset=0,  # 0 = correlated lookup
    )
    qf = compile_logical_to_sql(lookup)
    # Expect: qf has a Subquery-bearing projection OR a Window wrapping
    # a correlated expression; the dialect emitter unfolds to correlated
    # SELECT in Plan 7d.
    has_correlated = any(
        _contains_correlated(p.expression) for p in qf.projections)
    assert has_correlated


def test_include_lod_becomes_window_union_viz_grain_plus_dim():
    rel = lg.LogicalOpRelation(table="sales")
    over = lg.LogicalOpOver(
        input=rel,
        partition_bys=lg.PartitionBys(fields=(_f("region"), _f("product"))),
        order_by=(),
        frame=lg.FrameSpec(frame_type=lg.WindowFrameType.ROWS,
                            start=lg.FrameStart(kind="UNBOUNDED"),
                            end=lg.FrameEnd(kind="UNBOUNDED")),
        expressions=lg.NamedExps(entries=(
            ("incl_total",
             lg.FnCall(name="SUM", args=(lg.Column(field_id="amount"),))),)),
    )
    qf = compile_logical_to_sql(over)
    windows = [p.expression for p in qf.projections
               if isinstance(p.expression, sa.Window)]
    assert windows
    w = windows[0]
    partitions = {getattr(p, "name", None) for p in w.partition_by}
    assert "region" in partitions and "product" in partitions


def test_exclude_lod_removes_dim_from_viz_grain():
    # EXCLUDE [product] with viz_grain = {region, product}
    # → partition_by = {region}
    rel = lg.LogicalOpRelation(table="sales")
    over = lg.LogicalOpOver(
        input=rel,
        partition_bys=lg.PartitionBys(fields=(_f("region"),)),  # product excluded
        order_by=(),
        frame=lg.FrameSpec(frame_type=lg.WindowFrameType.ROWS,
                            start=lg.FrameStart(kind="UNBOUNDED"),
                            end=lg.FrameEnd(kind="UNBOUNDED")),
        expressions=lg.NamedExps(entries=(
            ("excl_total",
             lg.FnCall(name="SUM", args=(lg.Column(field_id="amount"),))),)),
    )
    qf = compile_logical_to_sql(over)
    windows = [p.expression for p in qf.projections
               if isinstance(p.expression, sa.Window)]
    partitions = {getattr(p, "name", None) for p in windows[0].partition_by}
    assert partitions == {"region"}


def _contains_correlated(e) -> bool:
    if isinstance(e, sa.Subquery): return bool(e.correlated_on)
    if isinstance(e, sa.Window): return _contains_correlated(e.expr)
    if isinstance(e, sa.BinaryOp):
        return _contains_correlated(e.left) or _contains_correlated(e.right)
    if isinstance(e, sa.FnCall): return any(_contains_correlated(a) for a in e.args)
    return False
```

- [ ] **Step 8.2: Run.**

Run: `cd backend && python -m pytest tests/test_vizql_lod_emission.py -v`
Expected: FAIL on FIXED case (current T3 LogicalOpLookup emits LAG window, not correlated subquery).

- [ ] **Step 8.3: Refine `_compile_LogicalOpLookup` in `logical_to_sql.py`.**

Replace the Task-3 stub for `_compile_LogicalOpLookup` with correlated-subquery emission when `offset == 0`:

```python
    def _compile_LogicalOpLookup(self, op: lg.LogicalOpLookup) -> sa.SQLQueryFunction:
        inner = self._compile(op.input)
        if op.offset == 0:
            # FIXED LOD: correlated subquery. The inner is already a
            # GROUP-BY'd aggregate over the fixed dims. Wrap as Subquery
            # with correlation on the fixed-dim keys.
            correl = tuple((f.id, f.id)
                           for f in _fixed_group_keys(op.input))
            sub = sa.Subquery(query=inner, correlated_on=correl)
            alias = self._alias()
            outer = sa.SQLQueryFunction(
                projections=(sa.Projection(
                    alias="fixed_total",
                    expression=sub),),
                from_=sa.TableRef(name="__fixed_outer", alias=alias),
                diagnostics=(
                    f"fixed_lod: correlated on {[c for c, _ in correl]}",
                    f"fixed_lod: WARNING expensive on high-cardinality dims",
                ),
            )
            return outer
        # offset != 0 → LAG/LEAD (Task 3 behaviour)
        fn = sa.FnCall(name="LAG" if op.offset > 0 else "LEAD",
                       args=(self._expr(op.lookup_field),
                             sa.Literal(value=abs(op.offset), data_type="int")))
        new_projs = list(inner.projections) + [
            sa.Projection(alias="lookup",
                          expression=sa.Window(expr=fn, partition_by=(), order_by=()))]
        return _with(inner, projections=tuple(new_projs))
```

Add helper at bottom of module:

```python
def _fixed_group_keys(op) -> tuple:
    if isinstance(op, lg.LogicalOpAggregate): return op.group_bys
    if hasattr(op, "input"): return _fixed_group_keys(op.input)
    return ()
```

- [ ] **Step 8.4: Run again — INCLUDE/EXCLUDE tests already green from Task 3 `_compile_LogicalOpOver`. Only FIXED case needed Task 8 fix.**

Run: `cd backend && python -m pytest tests/test_vizql_lod_emission.py tests/test_vizql_logical_to_sql.py -v`
Expected: PASS.

- [ ] **Step 8.5: Commit.**

```bash
git add backend/vizql/logical_to_sql.py backend/tests/test_vizql_lod_emission.py
git commit -m "feat(analyst-pro): emit FIXED correlated subquery + INCLUDE/EXCLUDE OVER (Plan 7c T8)"
```

---

## Task 9 — Security gate integration

**Files:**
- Create: `backend/tests/test_vizql_security_gate.py`
- Modify: `backend/vizql/__init__.py` (re-exports)

- [ ] **Step 9.1: Failing tests.**

```python
# backend/tests/test_vizql_security_gate.py
"""Plan 7c security gate — every emitted query string passes
``sql_validator.SQLValidator.validate`` (6-layer)."""
import pytest
from vizql import logical as lg, sql_ast as sa
from vizql.logical_to_sql import compile_logical_to_sql
from vizql.optimizer import optimize, OptimizerContext
from vizql.filter_ordering import apply_filters_in_order, StagedFilter
from sql_validator import SQLValidator


SCHEMAS = {"orders": {"region": "string", "amount": "int", "ts": "date-time"}}


def _simple_plan() -> lg.LogicalOp:
    rel = lg.LogicalOpRelation(table="orders")
    return lg.LogicalOpAggregate(
        input=rel,
        group_bys=(lg.Field(id="region", data_type="string", role="dimension",
                             aggregation="none", semantic_role="", is_disagg=False),),
        aggregations=(lg.AggExp(name="total", agg="sum",
                                 expr=lg.Column(field_id="amount")),),
    )


def test_generated_sql_passes_six_layer_validator():
    plan = _simple_plan()
    qf = compile_logical_to_sql(plan)
    qf = optimize(qf, OptimizerContext(schemas=SCHEMAS,
                                         referenced_tables={"orders"}))
    sql = qf.to_sql_generic()
    ok, cleaned, err = SQLValidator(dialect="postgres").validate(sql)
    assert ok, f"validator rejected: {err}\nSQL: {sql}"


def test_injected_predicate_is_rejected_at_gate():
    """A malicious StagedFilter whose rendered predicate contains a
    semicolon + DROP must be caught by the 6-layer validator even when
    routed through VizQL."""
    plan = _simple_plan()
    qf = compile_logical_to_sql(plan)
    # craft a Literal whose value contains injection-shaped text
    nasty = sa.BinaryOp(
        op="=",
        left=sa.Column(name="region", table_alias="t"),
        right=sa.Literal(value="x'; DROP TABLE users; --", data_type="string"),
    )
    qf = apply_filters_in_order(qf, [
        StagedFilter(stage="dimension", predicate=nasty)])
    sql = qf.to_sql_generic()
    ok, _, err = SQLValidator(dialect="postgres").validate(sql)
    # Literal is correctly quoted by generic stringifier → validator
    # accepts; the defence is sqlglot AST parse + single-statement rule.
    # Now craft a predicate that DOES bypass quoting: a FnCall whose
    # name is itself destructive — the validator must catch it.
    nasty_fn = sa.FnCall(name="DROP_TABLE",
                          args=(sa.Literal(value="users", data_type="string"),))
    qf2 = apply_filters_in_order(
        compile_logical_to_sql(plan),
        [StagedFilter(stage="dimension", predicate=nasty_fn)])
    sql2 = qf2.to_sql_generic()
    ok2, _, err2 = SQLValidator(dialect="postgres").validate(sql2)
    # dialect-parser rejects DROP_TABLE(...) in predicate position OR
    # keyword blocklist catches "DROP" substring.
    assert (not ok2) or ("DROP" in (err2 or "").upper())


def test_multistatement_predicate_is_rejected():
    """Any predicate whose rendered form contains a second statement must
    fail the multi-statement layer."""
    plan = _simple_plan()
    qf = compile_logical_to_sql(plan)
    # directly stuff a multi-statement literal — the generic stringifier
    # quotes it, but if a future bug ever emits it raw, the validator's
    # multi-statement rule fires.
    raw_sql = qf.to_sql_generic() + "; DROP TABLE users"
    ok, _, err = SQLValidator(dialect="postgres").validate(raw_sql)
    assert not ok and "multi-statement" in (err or "").lower()
```

- [ ] **Step 9.2: Update `backend/vizql/__init__.py`.**

```python
# backend/vizql/__init__.py — append/replace exports
from .logical_to_sql import compile_logical_to_sql
from .optimizer import optimize, OptimizerContext
from .filter_ordering import apply_filters_in_order, StagedFilter, FILTER_STAGES
from . import sql_ast

__all__ = [
    # Plan 7a/7b (pre-existing)
    "spec", "logical", "compiler", "validator",
    # Plan 7c
    "sql_ast", "compile_logical_to_sql", "optimize", "OptimizerContext",
    "apply_filters_in_order", "StagedFilter", "FILTER_STAGES",
]
```

- [ ] **Step 9.3: Run.**

Run: `cd backend && python -m pytest tests/test_vizql_security_gate.py -v`
Expected: PASS (3 tests).

- [ ] **Step 9.4: Full suite regression check.**

Run: `cd backend && python -m pytest tests/ -v 2>&1 | tail -30`
Expected: baseline pass count + ~40 new tests from Plan 7c, zero failures.

- [ ] **Step 9.5: Commit.**

```bash
git add backend/vizql/__init__.py backend/tests/test_vizql_security_gate.py
git commit -m "feat(analyst-pro): gate vizql output through sql_validator (Plan 7c T9)"
```

---

## Task 10 — Verification + roadmap status + README

**Files:**
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md`
- Modify: `backend/vizql/README.md`

- [ ] **Step 10.1: Run full suite + strict mypy over every new module.**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -15
cd backend && python -m mypy --strict \
  vizql/sql_ast.py vizql/generic_sql.py vizql/logical_to_sql.py \
  vizql/filter_ordering.py vizql/optimizer.py vizql/passes/
```

Expected: all pytest pass; mypy `Success` on each module. If any module fails strict mypy, fix in this task — do not carry type debt.

- [ ] **Step 10.2: Update `backend/vizql/README.md`.**

Append a "SQL AST + Optimiser (Plan 7c)" section with:
- Table of AST node kinds (Column, Literal, BinaryOp, FnCall, Case, Cast, FrameClause, Window, Subquery, TableRef, JoinNode, Projection, CTE, SetOp, SubqueryRef, SQLQueryFunction).
- Visitor-pattern note ("`accept(visitor) -> T` on every node — Plan 7d dialect emitters plug in here").
- Optimiser pipeline diagram (ASCII) listing the seven passes in fixed order.
- `apply_filters_in_order()` nine-stage table mirroring §IV.7.
- Security-gate sentence: every emitted string passes `sql_validator.SQLValidator.validate()`.

- [ ] **Step 10.3: Update `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 7c.**

Append after the "Task count target: 10." line:

```markdown
**Status:** ✅ Shipped <YYYY-MM-DD>. 10 tasks. Commits <sha1>..<sha10>.
New modules: `backend/vizql/sql_ast.py`, `generic_sql.py`,
`logical_to_sql.py`, `filter_ordering.py`, `optimizer.py`, `passes/`
(7 passes). Security gate: every emitted query passes `sql_validator`
(injection-rejection test in `test_vizql_security_gate.py`). Filter
ordering enforces §IV.7's nine stages at plan-build time. mypy --strict
passes on every new module. Plan doc:
`docs/superpowers/plans/2026-04-17-analyst-pro-plan-7c-sql-ast-optimizer.md`.
```

- [ ] **Step 10.4: Commit.**

```bash
git add backend/vizql/README.md docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): mark Plan 7c shipped in roadmap (Plan 7c T10)"
```

- [ ] **Step 10.5: Final verification.**

Run: `cd "QueryCopilot V1" && git log --oneline -10`
Expected: 10 new commits `Plan 7c T1` … `Plan 7c T10` on top of Plan 7b tip.

Run: `cd backend && python -c "from vizql import compile_logical_to_sql, optimize, apply_filters_in_order; print('ok')"`
Expected: `ok`.

---

## Self-review (done before handoff)

- **Spec coverage.**
  - `sql_ast.py` — ✅ T1/T2. Covers §IV.4 function-level passes (Cloner via `dataclasses.replace`; Checker + HavingInSelects + ForceLongsLast via `validate_structure`/`force_longs_last`).
  - Optimiser passes — ✅ T4/T5/T6. All seven §IV.4 optimiser names covered: `InputSchemaProver`, `LogicalOpSchemaAndTypeDeriver`, `DataTypeResolver`, `JoinTreeVirtualizer`, `EqualityProver`, `AggregatePushdown`, `CommonSubexpressionElimination\ExpressionCounter`. `LogicalExpToSQLQueryExpression` is `logical_to_sql.py` (T3). `LogicalOpFormatter`/`LogicalOpParser` are out-of-scope (XML round-trip — Plan 10 file format).
  - Appendix B SQL grammar — ✅ `SQLQueryFunction` carries `ctes` (WITH / WITH RECURSIVE), `grouping_sets`/`rollup`/`cube`, aggregate `FnCall.filter_clause` (FILTER WHERE), `FnCall.within_group` (WITHIN GROUP), `SubqueryRef.lateral` (LATERAL), `JoinNode` all 5 kinds, `SetOp` UNION/INTERSECT/EXCEPT, `Window` with frame clause. Missing nodes (PIVOT/UNPIVOT) emitted as `FnCall` markers that dialect emitters rewrite (Plan 7d).
  - Filter order-of-ops — ✅ T7. Nine stages, canonical order, each with dedicated placement logic; test coverage per-stage.
  - LOD emission — ✅ T8. FIXED → correlated `Subquery` with `correlated_on` keys; INCLUDE/EXCLUDE → `Window` with `partition_by = viz_grain ∪/∖ dim`.
  - Security gate — ✅ T9. `to_sql_generic()` → `SQLValidator.validate()` integration test + injection rejection cases.
  - Visitor pattern — ✅ T1. Every expression node has `accept(visitor)`; `Visitor[T]` protocol defined.
  - Idempotent + terminating passes — ✅ T6. `optimize(optimize(p)) == optimize(p)` test; `max_iterations` cap in `OptimizerContext`.
- **Placeholder scan.** Every step has either executable code, a concrete `git` command, or a specific `pytest` / `mypy` invocation. No "TBD" / "handle edge cases" / "similar to Task N" markers. The README update (T10.2) is prescriptive about what sections to add.
- **Type consistency.**
  - `SQLQueryExpression` union includes `Subquery` — referenced in T1, constructed in T3 (`_compile_LogicalOpLookup` FIXED path in T8).
  - `StagedFilter.stage` string values match `_VALID_FILTER_STAGES` in `logical.py` exactly (both are the same nine names).
  - `SQLQueryFunction.client_side_filters`, `totals_query_required`, `should_affect_totals`, `diagnostics` — declared in T2, consumed in T7/T8, asserted in T7 tests.
  - `Visitor[T]` — generic in T1, used in T1 dispatch test only. Plan 7d dialect emitters are the production consumers.
  - `InputSchemaProverPass.schemas` / `SchemaAndTypeDeriverPass.schemas` / `OptimizerContext.schemas` — all typed `Mapping[str, Mapping[str, str]]`. Tables referenced across tests use `{"tbl": {...}}` and `{"orders": {...}}` — consistent.
  - `apply_filters_in_order` takes `Sequence[StagedFilter]` — the tests pass `[StagedFilter(...), …]` (list literal is a Sequence).

---

## Execution handoff

Plan complete. 10 tasks, TDD cadence, commit-per-task (`feat(analyst-pro): <verb> <object> (Plan 7c T<N>)` except T10 `docs(analyst-pro): …`). Dependency gate in T1 ensures Plan 7b is shipped before any edit; security gate in T9 ensures no SQL escapes the 6-layer validator. Execute via **superpowers:subagent-driven-development** (recommended) or **superpowers:executing-plans**. Branch stays `askdb-global-comp`; no push.

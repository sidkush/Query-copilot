# Analyst Pro — Plan 7b: Minerva Logical Plan Port

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Tableau's `minerva` logical-operator catalogue into AskDB's VizQL engine and build the compiler stage that lowers a Plan 7a `VisualSpec` into a logical-plan tree. This is stage 2 of the Build_Tableau §IV.1 3-stage pipeline (`VisualSpec → LogicalOp* → SQLQueryFunction → Dialect SQL`). Plan 7c owns the SQL-AST + order-of-ops enforcement; Plan 7b produces an IR with the correct structure and filter-stage annotations but emits no SQL.

**Architecture:** New pure-Python module `backend/vizql/logical.py` defines 14 logical operators as `@dataclass(frozen=True, slots=True)` wrappers over a small immutable expression AST. Companion `backend/vizql/compiler.py` walks a `VisualSpec` and returns a rooted `LogicalOp` tree. A `backend/vizql/validator.py` runs structural invariants (no cycles, every input present, aggregation↔grain consistency). Everything is Python-only; no wire format, no SQL generation, no Anthropic call. Immutability is the design anchor — operators are cheap to hash for the Plan 7e cache key and cheap to equality-compare for TDD.

**Tech Stack:** Python 3.10+ stdlib only. `dataclasses(frozen=True, slots=True)` for every operator + supporting type. `tuple[T, ...]` for every sequence field (tuples are hashable and respect frozen semantics; list fields on frozen dataclasses create silent mutation bugs). `typing.Union` alias `LogicalOp` at module scope. `mypy --strict` passes on the new modules. `pytest` for tests — same pytest config as existing `backend/tests/`.

**Scope guard.** This plan defines the logical IR + compiler only. No SQL, no dialects, no cache, no order-of-ops enforcement (Plan 7c), no calc-field parser (Plan 8a), no dialect emitters (Plan 7d). Filter-stage is recorded on `LogicalOpSelect`/`LogicalOpFilter` as an annotation; Plan 7c reads it to decide WHERE vs HAVING vs CTE placement. LOD semantics are emitted structurally (FIXED → `LogicalOpLookup` + inner `LogicalOpAggregate`; INCLUDE/EXCLUDE → `LogicalOpOver`); Plan 8b owns the production-grade LOD rewriter and anti-pattern detection.

---

## Reference index (every task author reads before editing)

- `docs/Build_Tableau.md`:
  - §I.2 PresModel per UI surface — confirms `VizDataPresModel` is the **output** shape (what the logical plan ultimately serves); VisualSpec is the **input** shape.
  - §III.3 Mark types — `bar`, `line`, `area`, `pie`, `circle`, `square`, `text`, `shape`, `map`, `polygon`, `heatmap`, `gantt-bar`, `viz-extension`. Mark type drives aggregation strategy (bar = SUM per group; scatter = disaggregated).
  - §III.5 Dual / combined / shared axis — two measures on same shelf, handled as two parallel projections (dual axis) or a `Measure Names`/`Measure Values` synthetic pair (combined axis).
  - §III.6 Measure Names / Measure Values — synthetic fields, both `VisualData` column class (`pb.ColumnClass.COLUMN_CLASS_VISUAL_DATA`). `Measure Names` = discrete dimension of measure names; `Measure Values` = continuous measure aggregating the current measure. Used to build multi-measure panes.
  - §IV.1 Three-stage compilation pipeline — authoritative picture of where this plan fits.
  - §IV.2 minerva logical operator catalogue — the 14 operators + supporting messages this plan ports. **This is the table to match.**
  - §IV.3 DomainType — `Snowflake | Separate`. `Snowflake` = cartesian product of row × column dim values materialised (empty cells for missing combos → "Show Empty Rows/Columns" toggle). `Separate` = per-pane sub-query (default).
  - §IV.7 Filter order-of-operations (CRITICAL). Nine stages:
    1. Extract filters (baked into `.hyper`)
    2. Data Source filters (`WHERE` on every query)
    3. Context filters (`#Tableau_Temp_` / CTE)
    4. FIXED LOD expressions (AFTER context, BEFORE dim)
    5. Dimension filters (`WHERE` from Filters-shelf dim pills)
    6. INCLUDE/EXCLUDE LOD (AFTER dim, BEFORE measure)
    7. Measure filters (`HAVING`)
    8. Table-calc filters (client-side, post-fetch)
    9. Totals (separate query)
    Stages 1–7 + 9 are DB-side; 8 is client-side. Plan 7b records the stage on each filter op as a string annotation (`"extract" | "datasource" | "context" | "fixed_lod" | "dimension" | "include_exclude_lod" | "measure" | "table_calc" | "totals"`); Plan 7c reads it to choose WHERE/HAVING/CTE placement.
  - §V.2 LOD semantics & ordering.
    - `FIXED [dim1], [dim2] : SUM([m])` → correlated subquery on fixed dims joined back on matching keys. Structurally: an inner `LogicalOpAggregate` over the fixed-dim grain wrapped with `LogicalOpLookup` that joins on the fixed dims.
    - `INCLUDE [dim] : SUM([m])` → window expression. Structurally: `LogicalOpOver` with `partition_bys = viz_grain ∪ {dim}`.
    - `EXCLUDE [dim] : SUM([m])` → window expression. Structurally: `LogicalOpOver` with `partition_bys = viz_grain \ {dim}`.
  - §V.4 Viz level of granularity. `granularity = union(Rows dim pills, Columns dim pills, Detail, Path, Pages)`. Excludes Filters shelf. Excludes measure pills.
  - §VIII.1 FilterType enum — `categorical | hierarchical | range | relativeDate`. Already in Plan 7a `spec.FilterKind`.
  - §VIII.2 Dimension vs Measure discrimination — `IsDisagg` flag. Already on `spec.Field.is_disagg`.
  - Appendix A.14 AggregationType — full enum. Already mirrored in `spec.AggType` / `pb.AggType`.
  - Appendix A.15 DomainType — `Snowflake`, `Separate`.
- `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 7b — authoritative scope (14 ops; 12-task target; dim/measure split, GROUP BY derivation, Measure Names/Values synthetic fields; unit tests per mark type).
- `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7a-visualspec-ir.md` — shipped. Protobuf messages + `backend/vizql/spec.py` dataclasses are inputs here.
- `backend/vizql/spec.py` — Plan 7a IR. `VisualSpec`, `Field`, `Shelf`, `Encoding`, `FilterSpec`, `LodCalculation`, `Parameter`, `AggType`, `FieldRole`, `ColumnClass`, `MarkType`, `ShelfKind`, `FilterKind`, `EncodingType`. **Read this file end-to-end before Task 1.**
- `backend/vizql/proto/v1_pb2.py` — generated enum integer constants. Logical plan does **not** depend on protobuf; it consumes `spec.py` dataclasses only.
- `QueryCopilot V1/CLAUDE.md` — golden rules: only `anthropic_provider.py` may `import anthropic` (irrelevant here, but don't break it); numeric constants live in `config-defaults.md`; backend 8002 local; read-only DB; 6-layer SQL validator.
- Prior plan format precedent — `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7a-visualspec-ir.md` (same Phase 7 series, same 8-task TDD cadence, same commit-per-task format).

---

## Prerequisites

- Active branch: `askdb-global-comp`. All 12 commits land here; do not push.
- `cd "QueryCopilot V1" && git status` clean before Task 1 (ignoring the usual `.data/audit/*.jsonl` runtime noise).
- Plan 7a shipped. Verify:
  - `ls backend/vizql/` shows `__init__.py`, `proto/`, `spec.py`, `README.md`.
  - `ls backend/vizql/proto/` shows `__init__.py`, `v1_pb2.py`, `v1_pb2.pyi`.
  - `ls backend/proto/askdb/vizdataservice/v1.proto` exists.
  - `git log --oneline | grep "Plan 7a T8"` returns a commit (sentinel `Plan 7a T8` commit exists — Plan 7a shipped 8 tasks including the verification task).
  - `python -c "from vizql import spec; print(spec.VisualSpec(sheet_id='x'))"` (run from `backend/`) succeeds.
- Python venv active with `backend/requirements.txt` installed.
- `mypy>=1.11` available (add to `requirements.txt` in Task 1 if absent).
- Full backend pytest suite green before starting: `cd backend && python -m pytest tests/ -v` → 688+ passing, zero failing.

**Fail-loudly prerequisite task.** Task 1 begins with an explicit prerequisite-verification test that imports `vizql.spec.VisualSpec` and asserts the `.proto` file + `v1_pb2` module are importable. If Plan 7a is **not** shipped, this test fails on run and the implementer stops immediately with a clear error rather than silently building on a missing foundation.

---

## File Structure

**Create**

| Path | Purpose |
|---|---|
| `backend/vizql/logical.py` | 14 `LogicalOp*` dataclasses + supporting types (`Field`, `NamedExps`, `OrderBy`, `PartitionBys`, `FrameSpec`, `AggExp`, `Expression` AST) + `DomainType`, `SqlSetType`, `WindowFrameType`, `WindowFrameExclusion` enums. |
| `backend/vizql/compiler.py` | `compile_visual_spec(spec: VisualSpec) -> LogicalOp` — the `VisualSpec → LogicalOp` lowering. Plus viz-grain derivation, dim/measure split, filter-stage annotation, LOD lowering, Measure Names/Values synthesis. |
| `backend/vizql/validator.py` | `validate_logical_plan(plan: LogicalOp) -> None` — raises `LogicalPlanError` on cycles, missing inputs, agg/grain mismatch. |
| `backend/tests/test_vizql_logical.py` | Operator unit tests: construction, equality, hashing, immutability, canonical-name pinning against §IV.2. |
| `backend/tests/test_vizql_compiler.py` | 12+ compile scenarios: bar, scatter disagg, dual axis, FIXED LOD, INCLUDE LOD, EXCLUDE LOD, context-filter marker, categorical filter, range filter, relative-date filter, Measure Names/Values, Snowflake domain. |
| `backend/tests/test_vizql_validator.py` | Cycle detection, missing-input rejection, agg mismatch, happy path acceptance. |

**Modify**

| Path | Change |
|---|---|
| `backend/requirements.txt` | Pin `mypy==1.11.2` under a `# type checking` comment if not already present. Do not reorder existing pins. |
| `backend/vizql/__init__.py` | Re-export `LogicalOp`, `DomainType`, `compile_visual_spec`, `validate_logical_plan`. |
| `backend/vizql/README.md` | Add a "Logical plan" section: 14 operators table + compiler contract + filter-stage annotation convention. |
| `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 7b | After T12 verification, append `**Status:** ✅ Shipped <date>. 12 tasks. Commits <shas>.` line (mirror Plan 7a format). |

**Do not touch.** `backend/vizql/spec.py`, `backend/vizql/proto/*`, `backend/proto/askdb/vizdataservice/v1.proto`, anything in `frontend/`, agent code, query waterfall. Plan 7b is backend-pure and consumes Plan 7a read-only.

---

## Task Checklist

- [ ] **T1.** Scaffold `logical.py`: enums (`DomainType`, `SqlSetType`, `WindowFrameType`, `WindowFrameExclusion`), supporting types (`Field`, `NamedExps`, `OrderBy`, `PartitionBys`, `FrameStart`, `FrameEnd`, `FrameSpec`, `AggExp`), `Expression` AST (`Column`, `Literal`, `BinaryOp`, `FnCall`). Prerequisite-verification test. Commit: `feat(analyst-pro): scaffold vizql logical module + expression AST (Plan 7b T1)`.
- [ ] **T2.** `LogicalOpRelation` + `LogicalOpProject`. TDD. Commit: `feat(analyst-pro): add LogicalOpRelation + LogicalOpProject (Plan 7b T2)`.
- [ ] **T3.** `LogicalOpSelect` (dim filter → WHERE) + `LogicalOpFilter` (measure filter → HAVING). Filter-stage string annotation field. TDD. Commit: `feat(analyst-pro): add LogicalOpSelect + LogicalOpFilter with stage annotation (Plan 7b T3)`.
- [ ] **T4.** `LogicalOpAggregate` (group_bys + aggregations). TDD. Commit: `feat(analyst-pro): add LogicalOpAggregate (Plan 7b T4)`.
- [ ] **T5.** `LogicalOpOrder` + `LogicalOpTop`. TDD. Commit: `feat(analyst-pro): add LogicalOpOrder + LogicalOpTop (Plan 7b T5)`.
- [ ] **T6.** `LogicalOpOver` (windowed) + `LogicalOpLookup` (cross-row). TDD. Commit: `feat(analyst-pro): add LogicalOpOver + LogicalOpLookup (Plan 7b T6)`.
- [ ] **T7.** `LogicalOpUnpivot` (columns → rows) + `LogicalOpValuestoColumns` (rows → columns / pivot). TDD. Commit: `feat(analyst-pro): add LogicalOpUnpivot + LogicalOpValuestoColumns (Plan 7b T7)`.
- [ ] **T8.** `LogicalOpDomain` (Snowflake|Separate) + `LogicalOpUnion` + `LogicalOpIntersect`. TDD. Commit: `feat(analyst-pro): add LogicalOpDomain + LogicalOpUnion + LogicalOpIntersect (Plan 7b T8)`.
- [ ] **T9.** `validator.py`: `validate_logical_plan` — cycle detection, missing inputs, aggregation/grain consistency. TDD. Commit: `feat(analyst-pro): add logical plan validator (Plan 7b T9)`.
- [ ] **T10.** `compiler.py` core: viz grain (§V.4), dim/measure split, simple bar scenario (1 dim + 1 measure → Relation → Select → Aggregate). TDD. Commit: `feat(analyst-pro): compile VisualSpec to logical plan — bar path (Plan 7b T10)`.
- [ ] **T11.** Compiler — filter-stage annotation (§IV.7), Measure Names/Measure Values synthesis, mark-type-aware aggregation (bar = SUM per grain; scatter = disaggregated via `is_disagg=True` fields), dual-axis, Snowflake domain. TDD. Commit: `feat(analyst-pro): compiler — filters + Measure Names/Values + mark-aware agg + domain (Plan 7b T11)`.
- [ ] **T12.** Compiler — LOD lowering (FIXED → inner Aggregate + Lookup; INCLUDE/EXCLUDE → Over); `mypy --strict backend/vizql/logical.py backend/vizql/compiler.py backend/vizql/validator.py`; full-suite verification; README update; roadmap status row. Commit: `feat(analyst-pro): compile LOD expressions + verify Plan 7b suite (Plan 7b T12)`.

---

## Task Specifications

### Task 1 — Scaffold `logical.py` + expression AST

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/vizql/__init__.py`
- Create: `backend/vizql/logical.py`
- Create: `backend/tests/test_vizql_logical.py`

- [ ] **Step 1.1: Prerequisite-verification test (fails loudly if Plan 7a absent)**

Create `backend/tests/test_vizql_logical.py` with content:

```python
"""Plan 7b - minerva logical plan port.

Exercises backend/vizql/logical.py operator dataclasses + expression AST
+ canonical-name pinning against docs/Build_Tableau.md §IV.2.
"""

from __future__ import annotations

import pytest


def test_plan_7a_prerequisites_satisfied():
    """Plan 7b depends on Plan 7a deliverables. Fail loudly if absent."""
    from vizql import spec  # noqa: F401
    from vizql.proto import v1_pb2  # noqa: F401

    assert hasattr(spec, "VisualSpec"), "Plan 7a VisualSpec missing"
    assert hasattr(spec, "AggType"), "Plan 7a AggType re-export missing"
    assert hasattr(v1_pb2, "VisualSpec"), "Plan 7a protobuf codegen missing"
```

- [ ] **Step 1.2: Run the test — expect ImportError on missing vizql.logical**

Run from `backend/`:

```bash
python -m pytest tests/test_vizql_logical.py -v
```

Expected: the prerequisite test PASSES (Plan 7a shipped). If it fails with `ModuleNotFoundError: No module named 'vizql'`, stop — Plan 7a is not installed in this environment.

- [ ] **Step 1.3: Pin mypy**

Open `backend/requirements.txt`. If `mypy` is not already pinned, append under the existing pins (do not reorder):

```text
mypy==1.11.2
```

Install:

```bash
pip install -r requirements.txt
```

- [ ] **Step 1.4: Write failing tests for the expression AST + enums**

Append to `backend/tests/test_vizql_logical.py`:

```python
def test_domain_type_enum_values():
    from vizql.logical import DomainType
    # Build_Tableau Appendix A.15 — Snowflake | Separate.
    assert DomainType.SNOWFLAKE.value == "snowflake"
    assert DomainType.SEPARATE.value == "separate"
    assert {d.value for d in DomainType} == {"snowflake", "separate"}


def test_window_frame_type_enum_values():
    from vizql.logical import WindowFrameType
    # Build_Tableau §IV.2 supporting types — rows / range frame.
    assert WindowFrameType.ROWS.value == "rows"
    assert WindowFrameType.RANGE.value == "range"


def test_window_frame_exclusion_enum_values():
    from vizql.logical import WindowFrameExclusion
    # Build_Tableau §IV.6 — exclude current_row / group / ties / no_others.
    assert {e.value for e in WindowFrameExclusion} == {
        "no_others", "current_row", "group", "ties",
    }


def test_sql_set_type_enum_values():
    from vizql.logical import SqlSetType
    # Build_Tableau §IV.2 supporting types.
    assert {s.value for s in SqlSetType} == {"union", "intersect", "except"}


def test_field_equality_and_hash():
    from vizql.logical import Field
    a = Field(id="orders.total", data_type="number", role="measure",
              aggregation="sum", semantic_role="", is_disagg=False)
    b = Field(id="orders.total", data_type="number", role="measure",
              aggregation="sum", semantic_role="", is_disagg=False)
    assert a == b
    assert hash(a) == hash(b)


def test_field_is_frozen():
    from vizql.logical import Field
    f = Field(id="x", data_type="number", role="measure",
              aggregation="sum", semantic_role="", is_disagg=False)
    with pytest.raises((AttributeError, Exception)):
        f.id = "y"  # type: ignore[misc]


def test_expression_ast_column():
    from vizql.logical import Column
    c = Column(field_id="orders.total")
    assert c.field_id == "orders.total"
    assert hash(c) == hash(Column(field_id="orders.total"))


def test_expression_ast_literal():
    from vizql.logical import Literal
    assert Literal(value=42, data_type="int").value == 42
    assert Literal(value="x", data_type="string") != Literal(value="y", data_type="string")


def test_expression_ast_binary_op():
    from vizql.logical import BinaryOp, Column, Literal
    expr = BinaryOp(op=">", left=Column(field_id="orders.total"),
                    right=Literal(value=100, data_type="int"))
    assert expr.op == ">"
    assert expr.left == Column(field_id="orders.total")


def test_expression_ast_fn_call():
    from vizql.logical import Column, FnCall
    expr = FnCall(name="CONTAINS", args=(Column(field_id="orders.region"),))
    assert expr.name == "CONTAINS"
    assert len(expr.args) == 1


def test_order_by_shape():
    from vizql.logical import Column, OrderBy
    ob = OrderBy(identifier_exp=Column(field_id="orders.total"), is_ascending=False)
    assert ob.is_ascending is False


def test_partition_bys_holds_fields():
    from vizql.logical import Field, PartitionBys
    f = Field(id="orders.region", data_type="string", role="dimension",
              aggregation="none", semantic_role="", is_disagg=False)
    p = PartitionBys(fields=(f,))
    assert p.fields == (f,)


def test_agg_exp_shape():
    from vizql.logical import AggExp, Column
    a = AggExp(name="total_sum", agg="sum", expr=Column(field_id="orders.total"))
    assert a.agg == "sum"
    assert a.name == "total_sum"


def test_named_exps_is_mapping_like():
    from vizql.logical import Column, NamedExps
    n = NamedExps(entries=(("total", Column(field_id="orders.total")),))
    assert dict(n.entries)["total"] == Column(field_id="orders.total")
```

- [ ] **Step 1.5: Run tests — expect failures (module not yet created)**

```bash
python -m pytest tests/test_vizql_logical.py -v
```

Expected: every test after `test_plan_7a_prerequisites_satisfied` fails with `ModuleNotFoundError: No module named 'vizql.logical'`.

- [ ] **Step 1.6: Implement `backend/vizql/logical.py`**

Create `backend/vizql/logical.py` with content:

```python
"""Minerva logical operator IR.

Plan 7b (Build_Tableau.md §IV.1 stage 2) lowers a VisualSpec into a tree
of LogicalOp* nodes. Plan 7c will translate that tree into a dialect-
agnostic SQL AST.

Design rules:

* Every dataclass is ``frozen=True, slots=True`` so nodes are hashable,
  cheap to equality-compare, and safe to use as cache keys in Plan 7e.
* Every sequence field is ``tuple[T, ...]`` (mutable list on a frozen
  dataclass is a silent-mutation bug; tuples participate in hashing).
* Enum values are short lowercase strings, not ints — the logical IR is
  human-readable in test fixtures and does not cross a wire boundary.
* This module imports nothing from ``vizql.proto``; the logical plan is
  deliberately wire-format-agnostic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Union


class DomainType(Enum):
    """Build_Tableau.md Appendix A.15."""
    SNOWFLAKE = "snowflake"
    SEPARATE = "separate"


class WindowFrameType(Enum):
    """Build_Tableau.md §IV.2 supporting types / §IV.6 frame clause."""
    ROWS = "rows"
    RANGE = "range"


class WindowFrameExclusion(Enum):
    """Build_Tableau.md §IV.6 frame clause exclusion."""
    NO_OTHERS = "no_others"
    CURRENT_ROW = "current_row"
    GROUP = "group"
    TIES = "ties"


class SqlSetType(Enum):
    """Build_Tableau.md §IV.2 supporting types."""
    UNION = "union"
    INTERSECT = "intersect"
    EXCEPT = "except"


@dataclass(frozen=True, slots=True)
class Field:
    """Logical-plan field descriptor. Mirrors spec.Field but string-typed.

    ``role`` values: ``"dimension" | "measure" | "unknown"`` (§A.2).
    ``data_type`` values: see §A.1.
    ``aggregation`` values: see §A.14 (lowercased, ``"none"`` when unagg).
    ``is_disagg`` mirrors spec.Field.is_disagg (§VIII.2).
    """
    id: str
    data_type: str
    role: str
    aggregation: str
    semantic_role: str
    is_disagg: bool


@dataclass(frozen=True, slots=True)
class Column:
    """Expression node: reference a Field by id."""
    field_id: str


@dataclass(frozen=True, slots=True)
class Literal:
    """Expression node: scalar literal with type tag."""
    value: object
    data_type: str


@dataclass(frozen=True, slots=True)
class BinaryOp:
    """Expression node: binary operator (comparison / arithmetic / logical)."""
    op: str  # "=", "!=", "<", "<=", ">", ">=", "+", "-", "*", "/", "AND", "OR"
    left: "Expression"
    right: "Expression"


@dataclass(frozen=True, slots=True)
class FnCall:
    """Expression node: scalar / aggregate / table function call."""
    name: str
    args: tuple["Expression", ...]


Expression = Union[Column, Literal, BinaryOp, FnCall]


@dataclass(frozen=True, slots=True)
class NamedExps:
    """Ordered { name -> expression } map. Tuple of pairs preserves order + hashability."""
    entries: tuple[tuple[str, Expression], ...]


@dataclass(frozen=True, slots=True)
class OrderBy:
    """Build_Tableau.md §IV.2 supporting type."""
    identifier_exp: Expression
    is_ascending: bool


@dataclass(frozen=True, slots=True)
class PartitionBys:
    """Build_Tableau.md §IV.2 supporting type — OVER partition."""
    fields: tuple[Field, ...]


@dataclass(frozen=True, slots=True)
class FrameStart:
    kind: str  # "unbounded_preceding" | "n_preceding" | "current_row"
    offset: int = 0


@dataclass(frozen=True, slots=True)
class FrameEnd:
    kind: str  # "unbounded_following" | "n_following" | "current_row"
    offset: int = 0


@dataclass(frozen=True, slots=True)
class FrameSpec:
    """ROWS/RANGE frame clause."""
    frame_type: WindowFrameType
    start: FrameStart
    end: FrameEnd
    exclusion: WindowFrameExclusion = WindowFrameExclusion.NO_OTHERS


@dataclass(frozen=True, slots=True)
class AggExp:
    """Named aggregation expression used by LogicalOpAggregate."""
    name: str
    agg: str  # one of AggregationType values (§A.14), lowercased
    expr: Expression


__all__ = [
    "DomainType", "WindowFrameType", "WindowFrameExclusion", "SqlSetType",
    "Field",
    "Column", "Literal", "BinaryOp", "FnCall", "Expression",
    "NamedExps", "OrderBy", "PartitionBys",
    "FrameStart", "FrameEnd", "FrameSpec",
    "AggExp",
]
```

- [ ] **Step 1.7: Re-export from `vizql/__init__.py`**

Open `backend/vizql/__init__.py` and append (do not remove Plan 7a content):

```python
from vizql.logical import (  # noqa: E402,F401
    DomainType, WindowFrameType, WindowFrameExclusion, SqlSetType,
    Field as LogicalField,
    Column, Literal, BinaryOp, FnCall,
    NamedExps, OrderBy, PartitionBys,
    FrameStart, FrameEnd, FrameSpec,
    AggExp,
)
```

Note the `Field` re-export is aliased to `LogicalField` to avoid clashing with `spec.Field`.

- [ ] **Step 1.8: Run tests — expect pass**

```bash
python -m pytest tests/test_vizql_logical.py -v
```

Expected: all 13 tests PASS.

- [ ] **Step 1.9: Commit**

```bash
git add backend/requirements.txt backend/vizql/__init__.py backend/vizql/logical.py backend/tests/test_vizql_logical.py
git commit -m "feat(analyst-pro): scaffold vizql logical module + expression AST (Plan 7b T1)"
```

---

### Task 2 — `LogicalOpRelation` + `LogicalOpProject`

**Files:**
- Modify: `backend/vizql/logical.py`
- Modify: `backend/tests/test_vizql_logical.py`

- [ ] **Step 2.1: Write failing tests**

Append to `backend/tests/test_vizql_logical.py`:

```python
def test_logical_op_relation_construction():
    from vizql.logical import LogicalOpRelation
    r = LogicalOpRelation(table="orders", schema="public")
    assert r.table == "orders"
    assert r.schema == "public"


def test_logical_op_relation_is_hashable():
    from vizql.logical import LogicalOpRelation
    a = LogicalOpRelation(table="orders", schema="public")
    b = LogicalOpRelation(table="orders", schema="public")
    assert a == b
    assert hash(a) == hash(b)
    assert {a, b} == {a}  # deduped via hash


def test_logical_op_project_renames_and_expressions():
    from vizql.logical import (
        Column, LogicalOpProject, LogicalOpRelation, NamedExps,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    proj = LogicalOpProject(
        input=base,
        renames=(("orders.total", "total"),),
        expressions=NamedExps(entries=(
            ("total", Column(field_id="orders.total")),
        )),
        calculated_column=(),
    )
    assert proj.input is base
    assert proj.renames == (("orders.total", "total"),)
    assert proj.expressions.entries[0][0] == "total"


def test_logical_op_project_carries_calculated_columns():
    from vizql.logical import (
        BinaryOp, Column, Literal, LogicalOpProject, LogicalOpRelation, NamedExps,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    calc = ("profit_margin", BinaryOp(
        op="/",
        left=Column(field_id="orders.profit"),
        right=Column(field_id="orders.revenue"),
    ))
    proj = LogicalOpProject(
        input=base,
        renames=(),
        expressions=NamedExps(entries=()),
        calculated_column=(calc,),
    )
    assert proj.calculated_column[0][0] == "profit_margin"
    # unused expr reference (no-op assertion — keeps Literal in scope for future calc shapes)
    assert Literal(value=0, data_type="int").value == 0
```

- [ ] **Step 2.2: Run — expect failure**

```bash
python -m pytest tests/test_vizql_logical.py -v -k "logical_op_relation or logical_op_project"
```

Expected: 4 failures — `ImportError: cannot import name 'LogicalOpRelation' from 'vizql.logical'`.

- [ ] **Step 2.3: Implement**

Append to `backend/vizql/logical.py` (before `__all__`):

```python
@dataclass(frozen=True, slots=True)
class LogicalOpRelation:
    """Build_Tableau.md §IV.2 — base table reference."""
    table: str
    schema: str = ""


@dataclass(frozen=True, slots=True)
class LogicalOpProject:
    """Build_Tableau.md §IV.2 — SELECT projection (rename / drop / add).

    ``renames``      : tuple of (source_field_id, new_name) pairs.
    ``expressions``  : NamedExps of output-column expressions.
    ``calculated_column`` : tuple of (output_name, Expression) pairs —
                            calculated fields attached at projection time.
    """
    input: "LogicalOp"
    renames: tuple[tuple[str, str], ...]
    expressions: NamedExps
    calculated_column: tuple[tuple[str, Expression], ...]
```

Extend `__all__`:

```python
__all__ = [
    # ... existing ...
    "LogicalOpRelation", "LogicalOpProject",
]
```

Add the `LogicalOp` Union alias at the bottom of the file (before `__all__`):

```python
LogicalOp = Union[
    "LogicalOpRelation",
    "LogicalOpProject",
]  # extended in subsequent tasks
```

- [ ] **Step 2.4: Run — expect pass**

```bash
python -m pytest tests/test_vizql_logical.py -v
```

Expected: all tests PASS (prior 13 + new 4).

- [ ] **Step 2.5: Commit**

```bash
git add backend/vizql/logical.py backend/tests/test_vizql_logical.py
git commit -m "feat(analyst-pro): add LogicalOpRelation + LogicalOpProject (Plan 7b T2)"
```

---

### Task 3 — `LogicalOpSelect` + `LogicalOpFilter` (with filter-stage annotation)

**Files:**
- Modify: `backend/vizql/logical.py`
- Modify: `backend/tests/test_vizql_logical.py`

Stage values (Build_Tableau.md §IV.7):

```
"extract" | "datasource" | "context" | "fixed_lod" | "dimension" |
"include_exclude_lod" | "measure" | "table_calc" | "totals"
```

`LogicalOpSelect` carries the dimension-level predicate (stages 2, 3, 5). `LogicalOpFilter` carries the measure-level predicate (stage 7). Plan 7c uses `filter_stage` to choose WHERE vs HAVING vs CTE placement; Plan 7b only stores the annotation.

- [ ] **Step 3.1: Write failing tests**

Append:

```python
FILTER_STAGES = {
    "extract", "datasource", "context", "fixed_lod", "dimension",
    "include_exclude_lod", "measure", "table_calc", "totals",
}


def test_logical_op_select_carries_predicate_and_stage():
    from vizql.logical import (
        BinaryOp, Column, Literal, LogicalOpRelation, LogicalOpSelect,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    pred = BinaryOp(op=">", left=Column(field_id="orders.total"),
                    right=Literal(value=100, data_type="int"))
    sel = LogicalOpSelect(input=base, predicate=pred, filter_stage="dimension")
    assert sel.predicate.op == ">"
    assert sel.filter_stage == "dimension"


def test_logical_op_select_rejects_unknown_stage():
    from vizql.logical import (
        Column, Literal, LogicalOpRelation, LogicalOpSelect, BinaryOp,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    pred = BinaryOp(op="=", left=Column(field_id="orders.id"),
                    right=Literal(value=1, data_type="int"))
    with pytest.raises(ValueError, match="filter_stage"):
        LogicalOpSelect(input=base, predicate=pred, filter_stage="bogus_stage")


def test_logical_op_filter_measure_stage_default():
    from vizql.logical import (
        BinaryOp, Column, Literal, LogicalOpFilter, LogicalOpRelation,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    pred = BinaryOp(op=">", left=Column(field_id="total_sum"),
                    right=Literal(value=1000, data_type="int"))
    f = LogicalOpFilter(input=base, predicate=pred)
    assert f.filter_stage == "measure"
```

- [ ] **Step 3.2: Run — expect failure**

```bash
python -m pytest tests/test_vizql_logical.py -v -k "select or filter"
```

- [ ] **Step 3.3: Implement**

Append to `backend/vizql/logical.py` (before `__all__`):

```python
_VALID_FILTER_STAGES = frozenset({
    "extract", "datasource", "context", "fixed_lod", "dimension",
    "include_exclude_lod", "measure", "table_calc", "totals",
})


@dataclass(frozen=True, slots=True)
class LogicalOpSelect:
    """Build_Tableau.md §IV.2 — WHERE filter (dim filter stage by default).

    ``filter_stage`` annotates §IV.7 position so Plan 7c can decide
    WHERE vs CTE vs correlated-subquery placement. Plan 7b records
    only; it does not enforce order.
    """
    input: "LogicalOp"
    predicate: Expression
    filter_stage: str = "dimension"

    def __post_init__(self) -> None:
        if self.filter_stage not in _VALID_FILTER_STAGES:
            raise ValueError(
                f"filter_stage={self.filter_stage!r} not in {sorted(_VALID_FILTER_STAGES)}"
            )


@dataclass(frozen=True, slots=True)
class LogicalOpFilter:
    """Build_Tableau.md §IV.2 — measure-level filter (HAVING)."""
    input: "LogicalOp"
    predicate: Expression
    filter_stage: str = "measure"

    def __post_init__(self) -> None:
        if self.filter_stage not in _VALID_FILTER_STAGES:
            raise ValueError(
                f"filter_stage={self.filter_stage!r} not in {sorted(_VALID_FILTER_STAGES)}"
            )
```

Extend `__all__` and the `LogicalOp` alias:

```python
LogicalOp = Union[
    "LogicalOpRelation", "LogicalOpProject",
    "LogicalOpSelect", "LogicalOpFilter",
]
__all__ += ["LogicalOpSelect", "LogicalOpFilter"]
```

- [ ] **Step 3.4: Run — expect pass**

```bash
python -m pytest tests/test_vizql_logical.py -v
```

- [ ] **Step 3.5: Commit**

```bash
git add backend/vizql/logical.py backend/tests/test_vizql_logical.py
git commit -m "feat(analyst-pro): add LogicalOpSelect + LogicalOpFilter with stage annotation (Plan 7b T3)"
```

---

### Task 4 — `LogicalOpAggregate`

**Files:**
- Modify: `backend/vizql/logical.py`
- Modify: `backend/tests/test_vizql_logical.py`

- [ ] **Step 4.1: Write failing tests**

Append:

```python
def test_logical_op_aggregate_carries_group_bys_and_aggregations():
    from vizql.logical import (
        AggExp, Column, Field, LogicalOpAggregate, LogicalOpRelation,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    region = Field(id="orders.region", data_type="string", role="dimension",
                   aggregation="none", semantic_role="", is_disagg=False)
    total_sum = AggExp(name="total_sum", agg="sum",
                        expr=Column(field_id="orders.total"))
    agg = LogicalOpAggregate(
        input=base,
        group_bys=(region,),
        aggregations=(total_sum,),
    )
    assert agg.group_bys == (region,)
    assert agg.aggregations[0].agg == "sum"


def test_logical_op_aggregate_empty_group_bys_allowed():
    """SELECT SUM(...) FROM orders  — no GROUP BY."""
    from vizql.logical import (
        AggExp, Column, LogicalOpAggregate, LogicalOpRelation,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    agg = LogicalOpAggregate(
        input=base,
        group_bys=(),
        aggregations=(AggExp(name="total", agg="sum",
                             expr=Column(field_id="orders.total")),),
    )
    assert agg.group_bys == ()
```

- [ ] **Step 4.2: Run — expect failure**

```bash
python -m pytest tests/test_vizql_logical.py -v -k "aggregate"
```

- [ ] **Step 4.3: Implement**

Append to `backend/vizql/logical.py` (before `__all__`):

```python
@dataclass(frozen=True, slots=True)
class LogicalOpAggregate:
    """Build_Tableau.md §IV.2 — GROUP BY + aggregation."""
    input: "LogicalOp"
    group_bys: tuple[Field, ...]
    aggregations: tuple[AggExp, ...]
```

Extend `LogicalOp` alias and `__all__`:

```python
LogicalOp = Union[
    "LogicalOpRelation", "LogicalOpProject",
    "LogicalOpSelect", "LogicalOpFilter",
    "LogicalOpAggregate",
]
__all__ += ["LogicalOpAggregate"]
```

- [ ] **Step 4.4: Run — expect pass**

```bash
python -m pytest tests/test_vizql_logical.py -v
```

- [ ] **Step 4.5: Commit**

```bash
git add backend/vizql/logical.py backend/tests/test_vizql_logical.py
git commit -m "feat(analyst-pro): add LogicalOpAggregate (Plan 7b T4)"
```

---

### Task 5 — `LogicalOpOrder` + `LogicalOpTop`

**Files:**
- Modify: `backend/vizql/logical.py`
- Modify: `backend/tests/test_vizql_logical.py`

- [ ] **Step 5.1: Write failing tests**

Append:

```python
def test_logical_op_order_preserves_tuple_order():
    from vizql.logical import (
        Column, LogicalOpOrder, LogicalOpRelation, OrderBy,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    order = LogicalOpOrder(
        input=base,
        order_by=(
            OrderBy(identifier_exp=Column(field_id="orders.total"), is_ascending=False),
            OrderBy(identifier_exp=Column(field_id="orders.region"), is_ascending=True),
        ),
    )
    assert len(order.order_by) == 2
    assert order.order_by[0].is_ascending is False
    assert order.order_by[1].is_ascending is True


def test_logical_op_top_limit_and_percentage_flag():
    from vizql.logical import LogicalOpRelation, LogicalOpTop
    base = LogicalOpRelation(table="orders", schema="public")
    top = LogicalOpTop(input=base, limit=10, is_percentage=False)
    assert top.limit == 10
    assert top.is_percentage is False

    pct = LogicalOpTop(input=base, limit=5, is_percentage=True)
    assert pct.is_percentage is True


def test_logical_op_top_rejects_negative_limit():
    from vizql.logical import LogicalOpRelation, LogicalOpTop
    base = LogicalOpRelation(table="orders", schema="public")
    with pytest.raises(ValueError, match="limit"):
        LogicalOpTop(input=base, limit=-1, is_percentage=False)
```

- [ ] **Step 5.2: Run — expect failure**

```bash
python -m pytest tests/test_vizql_logical.py -v -k "order or top"
```

- [ ] **Step 5.3: Implement**

Append:

```python
@dataclass(frozen=True, slots=True)
class LogicalOpOrder:
    """Build_Tableau.md §IV.2 — ORDER BY."""
    input: "LogicalOp"
    order_by: tuple[OrderBy, ...]


@dataclass(frozen=True, slots=True)
class LogicalOpTop:
    """Build_Tableau.md §IV.2 — TOP / LIMIT."""
    input: "LogicalOp"
    limit: int
    is_percentage: bool = False

    def __post_init__(self) -> None:
        if self.limit < 0:
            raise ValueError(f"LogicalOpTop.limit must be >= 0 (got {self.limit})")
```

Extend `LogicalOp` alias and `__all__`. Run tests. Commit:

```bash
git add backend/vizql/logical.py backend/tests/test_vizql_logical.py
git commit -m "feat(analyst-pro): add LogicalOpOrder + LogicalOpTop (Plan 7b T5)"
```

---

### Task 6 — `LogicalOpOver` + `LogicalOpLookup`

**Files:**
- Modify: `backend/vizql/logical.py`
- Modify: `backend/tests/test_vizql_logical.py`

- [ ] **Step 6.1: Write failing tests**

Append:

```python
def test_logical_op_over_window_expression():
    from vizql.logical import (
        AggExp, Column, Field, FrameEnd, FrameSpec, FrameStart,
        LogicalOpOver, LogicalOpRelation, NamedExps, OrderBy, PartitionBys,
        WindowFrameType,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    region = Field(id="orders.region", data_type="string", role="dimension",
                   aggregation="none", semantic_role="", is_disagg=False)
    frame = FrameSpec(
        frame_type=WindowFrameType.ROWS,
        start=FrameStart(kind="unbounded_preceding"),
        end=FrameEnd(kind="current_row"),
    )
    over = LogicalOpOver(
        input=base,
        partition_bys=PartitionBys(fields=(region,)),
        order_by=(OrderBy(identifier_exp=Column(field_id="orders.date"),
                          is_ascending=True),),
        frame=frame,
        expressions=NamedExps(entries=(
            ("running_total", Column(field_id="orders.total")),
        )),
    )
    assert over.partition_bys.fields == (region,)
    assert over.frame.frame_type == WindowFrameType.ROWS


def test_logical_op_lookup_cross_row_reference():
    from vizql.logical import (
        Column, LogicalOpLookup, LogicalOpRelation,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    look = LogicalOpLookup(
        input=base,
        lookup_field=Column(field_id="orders.total"),
        offset=-1,
    )
    assert look.offset == -1
```

- [ ] **Step 6.2: Run — expect failure**

```bash
python -m pytest tests/test_vizql_logical.py -v -k "over or lookup"
```

- [ ] **Step 6.3: Implement**

Append:

```python
@dataclass(frozen=True, slots=True)
class LogicalOpOver:
    """Build_Tableau.md §IV.2 — OVER (windowed expression)."""
    input: "LogicalOp"
    partition_bys: PartitionBys
    order_by: tuple[OrderBy, ...]
    frame: FrameSpec
    expressions: NamedExps


@dataclass(frozen=True, slots=True)
class LogicalOpLookup:
    """Build_Tableau.md §IV.2 — cross-row reference (LOOKUP)."""
    input: "LogicalOp"
    lookup_field: Expression
    offset: int
```

Extend alias + `__all__`. Run tests. Commit:

```bash
git add backend/vizql/logical.py backend/tests/test_vizql_logical.py
git commit -m "feat(analyst-pro): add LogicalOpOver + LogicalOpLookup (Plan 7b T6)"
```

---

### Task 7 — `LogicalOpUnpivot` + `LogicalOpValuestoColumns`

**Files:**
- Modify: `backend/vizql/logical.py`
- Modify: `backend/tests/test_vizql_logical.py`

- [ ] **Step 7.1: Write failing tests**

Append:

```python
def test_logical_op_unpivot_columns_to_rows():
    from vizql.logical import LogicalOpRelation, LogicalOpUnpivot
    base = LogicalOpRelation(table="sales_wide", schema="public")
    op = LogicalOpUnpivot(
        input=base,
        pivot_cols=("q1", "q2", "q3", "q4"),
        value_col="revenue",
        name_col="quarter",
    )
    assert op.pivot_cols == ("q1", "q2", "q3", "q4")
    assert op.value_col == "revenue"
    assert op.name_col == "quarter"


def test_logical_op_values_to_columns_rows_to_columns():
    from vizql.logical import (
        Column, LogicalOpRelation, LogicalOpValuestoColumns,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    op = LogicalOpValuestoColumns(
        input=base,
        pivot_col=Column(field_id="orders.region"),
        agg_col=Column(field_id="orders.total"),
    )
    assert op.pivot_col == Column(field_id="orders.region")
```

- [ ] **Step 7.2: Run — expect failure**

- [ ] **Step 7.3: Implement**

Append:

```python
@dataclass(frozen=True, slots=True)
class LogicalOpUnpivot:
    """Build_Tableau.md §IV.2 — columns → rows."""
    input: "LogicalOp"
    pivot_cols: tuple[str, ...]
    value_col: str
    name_col: str


@dataclass(frozen=True, slots=True)
class LogicalOpValuestoColumns:
    """Build_Tableau.md §IV.2 — rows → columns (PIVOT)."""
    input: "LogicalOp"
    pivot_col: Expression
    agg_col: Expression
```

Extend alias + `__all__`. Run tests. Commit:

```bash
git add backend/vizql/logical.py backend/tests/test_vizql_logical.py
git commit -m "feat(analyst-pro): add LogicalOpUnpivot + LogicalOpValuestoColumns (Plan 7b T7)"
```

---

### Task 8 — `LogicalOpDomain` + `LogicalOpUnion` + `LogicalOpIntersect`

**Files:**
- Modify: `backend/vizql/logical.py`
- Modify: `backend/tests/test_vizql_logical.py`

- [ ] **Step 8.1: Write failing tests**

Append:

```python
def test_logical_op_domain_snowflake_default_separate():
    from vizql.logical import DomainType, LogicalOpDomain, LogicalOpRelation
    base = LogicalOpRelation(table="orders", schema="public")

    sep = LogicalOpDomain(input=base, domain=DomainType.SEPARATE)
    snow = LogicalOpDomain(input=base, domain=DomainType.SNOWFLAKE)
    assert sep.domain == DomainType.SEPARATE
    assert snow.domain == DomainType.SNOWFLAKE


def test_logical_op_union_binary():
    from vizql.logical import LogicalOpRelation, LogicalOpUnion
    a = LogicalOpRelation(table="orders_2024", schema="public")
    b = LogicalOpRelation(table="orders_2025", schema="public")
    u = LogicalOpUnion(left=a, right=b)
    assert u.left is a
    assert u.right is b


def test_logical_op_intersect_binary():
    from vizql.logical import LogicalOpIntersect, LogicalOpRelation
    a = LogicalOpRelation(table="orders_east", schema="public")
    b = LogicalOpRelation(table="orders_west", schema="public")
    i = LogicalOpIntersect(left=a, right=b)
    assert i.left is a
    assert i.right is b
```

- [ ] **Step 8.2: Run — expect failure**

- [ ] **Step 8.3: Implement**

Append:

```python
@dataclass(frozen=True, slots=True)
class LogicalOpDomain:
    """Build_Tableau.md §IV.3 — Snowflake | Separate.

    ``SNOWFLAKE`` materialises the cartesian product of row × column
    dimension values (empty cells for missing combos) — the "Show Empty
    Rows/Columns" toggle. ``SEPARATE`` emits per-pane sub-queries.
    """
    input: "LogicalOp"
    domain: DomainType = DomainType.SEPARATE


@dataclass(frozen=True, slots=True)
class LogicalOpUnion:
    """Build_Tableau.md §IV.2 — set union."""
    left: "LogicalOp"
    right: "LogicalOp"


@dataclass(frozen=True, slots=True)
class LogicalOpIntersect:
    """Build_Tableau.md §IV.2 — set intersect."""
    left: "LogicalOp"
    right: "LogicalOp"
```

Finalise `LogicalOp` alias to cover all 14:

```python
LogicalOp = Union[
    "LogicalOpRelation",
    "LogicalOpProject",
    "LogicalOpSelect",
    "LogicalOpFilter",
    "LogicalOpAggregate",
    "LogicalOpOrder",
    "LogicalOpTop",
    "LogicalOpOver",
    "LogicalOpLookup",
    "LogicalOpUnpivot",
    "LogicalOpValuestoColumns",
    "LogicalOpDomain",
    "LogicalOpUnion",
    "LogicalOpIntersect",
]
```

Extend `__all__` with the three new ops and `LogicalOp`.

- [ ] **Step 8.4: Run — expect pass**

```bash
python -m pytest tests/test_vizql_logical.py -v
```

Expected: all tests PASS (~30+ tests across 14 ops + enums + expr AST + supporting types).

- [ ] **Step 8.5: Pin canonical operator names (regression guard)**

Append:

```python
def test_canonical_operator_names_match_build_tableau_iv2():
    """Pin against Build_Tableau.md §IV.2 operator table (14 ops)."""
    from vizql import logical
    expected = {
        "LogicalOpRelation", "LogicalOpProject", "LogicalOpSelect",
        "LogicalOpAggregate", "LogicalOpOrder", "LogicalOpTop",
        "LogicalOpOver", "LogicalOpLookup", "LogicalOpUnpivot",
        "LogicalOpValuestoColumns", "LogicalOpDomain", "LogicalOpUnion",
        "LogicalOpIntersect", "LogicalOpFilter",
    }
    for name in expected:
        assert hasattr(logical, name), f"missing canonical operator {name}"
    assert len(expected) == 14
```

- [ ] **Step 8.6: Commit**

```bash
git add backend/vizql/logical.py backend/tests/test_vizql_logical.py
git commit -m "feat(analyst-pro): add LogicalOpDomain + LogicalOpUnion + LogicalOpIntersect (Plan 7b T8)"
```

---

### Task 9 — `validator.py`: cycles, missing inputs, agg/grain consistency

**Files:**
- Create: `backend/vizql/validator.py`
- Create: `backend/tests/test_vizql_validator.py`

Validation rules (minimum viable, expand in Plan 7c):

1. **Cycle check.** Plans are trees (`LogicalOp`s are immutable, but `input` may reference any prior node). Use identity-based DFS with a `visiting` set; raise if a node re-enters.
2. **Missing input check.** Every unary operator (Project/Select/Aggregate/Order/Top/Over/Lookup/Unpivot/ValuestoColumns/Domain/Filter) must have `input is not None`. Every binary operator (Union/Intersect) must have both `left` and `right`.
3. **Aggregation/grain consistency.** If an `LogicalOpAggregate` has any `AggExp`, at least one of the following must hold: (a) `group_bys` is non-empty, or (b) the expression tree below contains no un-aggregated measure references. Simple heuristic for Plan 7b: an aggregate with empty `group_bys` and zero aggregations is invalid.

- [ ] **Step 9.1: Write failing tests**

Create `backend/tests/test_vizql_validator.py`:

```python
"""Plan 7b - logical plan validator."""

from __future__ import annotations

import pytest

from vizql.logical import (
    AggExp, Column, DomainType, Field, Literal, BinaryOp,
    LogicalOpAggregate, LogicalOpDomain, LogicalOpRelation, LogicalOpSelect,
    LogicalOpUnion,
)
from vizql.validator import LogicalPlanError, validate_logical_plan


def _region() -> Field:
    return Field(id="orders.region", data_type="string", role="dimension",
                 aggregation="none", semantic_role="", is_disagg=False)


def test_validator_accepts_valid_aggregate_plan():
    base = LogicalOpRelation(table="orders", schema="public")
    pred = BinaryOp(op=">", left=Column(field_id="orders.total"),
                    right=Literal(value=0, data_type="int"))
    sel = LogicalOpSelect(input=base, predicate=pred, filter_stage="dimension")
    agg = LogicalOpAggregate(
        input=sel,
        group_bys=(_region(),),
        aggregations=(AggExp(name="t", agg="sum",
                             expr=Column(field_id="orders.total")),),
    )
    validate_logical_plan(agg)  # no raise


def test_validator_rejects_aggregate_with_empty_grain_and_no_aggs():
    base = LogicalOpRelation(table="orders", schema="public")
    agg = LogicalOpAggregate(input=base, group_bys=(), aggregations=())
    with pytest.raises(LogicalPlanError, match="aggregation"):
        validate_logical_plan(agg)


def test_validator_rejects_union_with_none_branch():
    base = LogicalOpRelation(table="orders", schema="public")
    # Forge a broken plan via object.__setattr__ bypassing frozen=True.
    bad = LogicalOpUnion(left=base, right=base)
    object.__setattr__(bad, "right", None)
    with pytest.raises(LogicalPlanError, match="missing input"):
        validate_logical_plan(bad)


def test_validator_rejects_cycle():
    base = LogicalOpRelation(table="orders", schema="public")
    dom = LogicalOpDomain(input=base, domain=DomainType.SEPARATE)
    # Force a cycle: make dom.input point back to itself.
    object.__setattr__(dom, "input", dom)
    with pytest.raises(LogicalPlanError, match="cycle"):
        validate_logical_plan(dom)


def test_validator_accepts_relation_leaf():
    base = LogicalOpRelation(table="orders", schema="public")
    validate_logical_plan(base)
```

- [ ] **Step 9.2: Run — expect failure**

```bash
python -m pytest tests/test_vizql_validator.py -v
```

Expected: `ImportError: cannot import name 'validate_logical_plan' from 'vizql.validator'`.

- [ ] **Step 9.3: Implement**

Create `backend/vizql/validator.py`:

```python
"""Plan 7b - structural validator for logical plans.

Guarantees shipped by this validator:

* No reference cycles (every node visited at most once along any path).
* Every unary op has a non-None ``input``; every binary op has both
  ``left`` and ``right``.
* Every ``LogicalOpAggregate`` has either a non-empty ``group_bys`` tuple
  or at least one ``AggExp`` — never both empty (that's a grammar error
  from the compiler).

Deeper type/schema derivation is Plan 7c's responsibility.
"""

from __future__ import annotations

from typing import cast

from vizql.logical import (
    LogicalOp, LogicalOpAggregate, LogicalOpDomain, LogicalOpFilter,
    LogicalOpIntersect, LogicalOpLookup, LogicalOpOrder, LogicalOpOver,
    LogicalOpProject, LogicalOpRelation, LogicalOpSelect, LogicalOpTop,
    LogicalOpUnion, LogicalOpUnpivot, LogicalOpValuestoColumns,
)


class LogicalPlanError(ValueError):
    """Raised by validate_logical_plan on structural violations."""


_UNARY_OP_TYPES = (
    LogicalOpProject, LogicalOpSelect, LogicalOpAggregate, LogicalOpOrder,
    LogicalOpTop, LogicalOpOver, LogicalOpLookup, LogicalOpUnpivot,
    LogicalOpValuestoColumns, LogicalOpDomain, LogicalOpFilter,
)
_BINARY_OP_TYPES = (LogicalOpUnion, LogicalOpIntersect)


def validate_logical_plan(plan: LogicalOp) -> None:
    """Walk the plan; raise LogicalPlanError on any violation."""
    _walk(plan, visiting=set())


def _walk(node: object, visiting: set[int]) -> None:
    nid = id(node)
    if nid in visiting:
        raise LogicalPlanError(f"cycle detected at node {type(node).__name__}")
    visiting.add(nid)
    try:
        if isinstance(node, LogicalOpRelation):
            return
        if isinstance(node, _UNARY_OP_TYPES):
            child = getattr(node, "input", None)
            if child is None:
                raise LogicalPlanError(
                    f"{type(node).__name__} has missing input"
                )
            _walk(child, visiting)
            if isinstance(node, LogicalOpAggregate):
                _check_aggregate(node)
            return
        if isinstance(node, _BINARY_OP_TYPES):
            left = getattr(node, "left", None)
            right = getattr(node, "right", None)
            if left is None or right is None:
                raise LogicalPlanError(
                    f"{type(node).__name__} has missing input branch"
                )
            _walk(left, visiting)
            _walk(right, visiting)
            return
        raise LogicalPlanError(f"unknown logical op type: {type(node).__name__}")
    finally:
        visiting.discard(nid)


def _check_aggregate(node: LogicalOpAggregate) -> None:
    if not node.group_bys and not node.aggregations:
        raise LogicalPlanError(
            "LogicalOpAggregate with empty group_bys and no aggregations is invalid"
        )
    # Cast kept explicit so mypy --strict accepts the narrowing site.
    _ = cast(LogicalOpAggregate, node)
```

Re-export from `vizql/__init__.py`:

```python
from vizql.validator import LogicalPlanError, validate_logical_plan  # noqa: E402,F401
```

- [ ] **Step 9.4: Run — expect pass**

```bash
python -m pytest tests/test_vizql_validator.py -v
```

- [ ] **Step 9.5: Commit**

```bash
git add backend/vizql/__init__.py backend/vizql/validator.py backend/tests/test_vizql_validator.py
git commit -m "feat(analyst-pro): add logical plan validator (Plan 7b T9)"
```

---

### Task 10 — `compiler.py` core: viz grain + dim/measure split + bar scenario

**Files:**
- Create: `backend/vizql/compiler.py`
- Create: `backend/tests/test_vizql_compiler.py`

**Compiler contract (this task).**

```
compile_visual_spec(spec: VisualSpec) -> LogicalOp
```

1. Derive `viz_grain`: set of dim fields from `Rows`, `Columns`, `Detail`, `Path`, `Pages` shelves (§V.4). **Exclude** Filters-shelf fields and any field with `role != FIELD_ROLE_DIMENSION`.
2. Classify each shelf field: dimension if `role == DIMENSION`, measure if `role == MEASURE`. Unknown rejected.
3. Produce a plan tree of shape:

```
LogicalOpAggregate(
    input=LogicalOpSelect(   # 0+ nested, one per filter
        input=LogicalOpRelation(table=..., schema=...),
        predicate=...,
        filter_stage=...,
    ),
    group_bys=(<viz_grain fields>,),
    aggregations=(<one AggExp per measure>,),
)
```

Table name = `spec.sheet_id` (placeholder; Plan 7c resolves via connection metadata). Schema = `""` for now.

- [ ] **Step 10.1: Write failing tests**

Create `backend/tests/test_vizql_compiler.py`:

```python
"""Plan 7b - VisualSpec -> LogicalOp compiler."""

from __future__ import annotations

import pytest

from vizql import spec
from vizql.compiler import compile_visual_spec
from vizql.logical import (
    LogicalOpAggregate, LogicalOpRelation, LogicalOpSelect,
)
from vizql.validator import validate_logical_plan


def _dim(id_: str) -> spec.Field:
    return spec.Field(
        id=id_,
        data_type=spec.DataType.DATA_TYPE_STRING,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
        aggregation=spec.AggType.AGG_TYPE_UNSPECIFIED,
    )


def _measure(id_: str, agg: int = spec.AggType.AGG_TYPE_SUM) -> spec.Field:
    return spec.Field(
        id=id_,
        data_type=spec.DataType.DATA_TYPE_NUMBER,
        role=spec.FieldRole.FIELD_ROLE_MEASURE,
        aggregation=agg,
    )


def _bar_spec() -> spec.VisualSpec:
    region = _dim("orders.region")
    total = _measure("orders.total")
    return spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )


def test_compile_bar_1dim_1measure():
    plan = compile_visual_spec(_bar_spec())
    assert isinstance(plan, LogicalOpAggregate)
    assert len(plan.group_bys) == 1
    assert plan.group_bys[0].id == "orders.region"
    assert len(plan.aggregations) == 1
    assert plan.aggregations[0].agg == "sum"
    # Relation at the leaf
    node = plan.input
    while not isinstance(node, LogicalOpRelation):
        node = getattr(node, "input")
    assert node.table == "orders"


def test_compile_bar_plan_validates():
    plan = compile_visual_spec(_bar_spec())
    validate_logical_plan(plan)


def test_compile_excludes_filters_shelf_from_grain():
    region = _dim("orders.region")
    country = _dim("orders.country")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, country, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_FILTER, fields=[country]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    assert isinstance(plan, LogicalOpAggregate)
    grain_ids = {f.id for f in plan.group_bys}
    assert grain_ids == {"orders.region"}  # country excluded


def test_compile_detail_and_pages_included_in_grain():
    region = _dim("orders.region")
    page = _dim("orders.year")
    detail = _dim("orders.segment")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, page, detail, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_PAGES, fields=[page]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_DETAIL, fields=[detail]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    grain_ids = {f.id for f in plan.group_bys}
    assert grain_ids == {"orders.region", "orders.year", "orders.segment"}


def test_compile_rejects_unknown_role():
    unk = spec.Field(
        id="mystery",
        data_type=spec.DataType.DATA_TYPE_STRING,
        role=spec.FieldRole.FIELD_ROLE_UNSPECIFIED,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[unk],
        shelves=[spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[unk])],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    with pytest.raises(ValueError, match="role"):
        compile_visual_spec(s)


def test_compile_empty_filters_produces_no_select_nodes():
    plan = compile_visual_spec(_bar_spec())
    # Walk down from Aggregate; there should be no Select nodes when no filters exist.
    node = plan.input  # type: ignore[attr-defined]
    while not isinstance(node, LogicalOpRelation):
        assert not isinstance(node, LogicalOpSelect)
        node = getattr(node, "input")
```

- [ ] **Step 10.2: Run — expect failure**

```bash
python -m pytest tests/test_vizql_compiler.py -v
```

- [ ] **Step 10.3: Implement `backend/vizql/compiler.py`**

```python
"""Plan 7b - VisualSpec -> LogicalOp compiler.

Stage 2 of the Build_Tableau.md §IV.1 three-stage pipeline. Consumes a
Plan 7a VisualSpec and returns a root ``LogicalOp`` node. Produces NO
SQL; that is Plan 7d's job.

Compilation steps (this module):

1. Derive viz grain per §V.4: union of dimension pills on
   Rows / Columns / Detail / Path / Pages. Filters shelf is EXCLUDED.
2. Split shelf fields into dims (``group_bys``) + measures
   (``aggregations``). Unknown roles are rejected.
3. Lower filters into ``LogicalOpSelect`` (dim) / ``LogicalOpFilter``
   (measure) nodes stacked above ``LogicalOpRelation``. Filter-stage
   annotations per §IV.7 are attached here; Plan 7c enforces ordering.
4. Wrap in ``LogicalOpAggregate(group_bys=grain, aggregations=...)`` when
   the mark type calls for aggregation (see T11 for mark-aware policy).
5. LOD calculations (§V.2): FIXED / INCLUDE / EXCLUDE (T12).
6. Synthetic Measure Names / Measure Values columns (§III.6) (T11).
"""

from __future__ import annotations

from typing import Iterable

from vizql import spec
from vizql.logical import (
    AggExp, Column, Field as LField,
    LogicalOp, LogicalOpAggregate, LogicalOpRelation,
)


_GRAIN_SHELF_KINDS: frozenset[int] = frozenset({
    spec.ShelfKind.SHELF_KIND_ROW,
    spec.ShelfKind.SHELF_KIND_COLUMN,
    spec.ShelfKind.SHELF_KIND_DETAIL,
    spec.ShelfKind.SHELF_KIND_PATH,
    spec.ShelfKind.SHELF_KIND_PAGES,
})


_AGG_NAMES: dict[int, str] = {
    spec.AggType.AGG_TYPE_SUM: "sum",
    spec.AggType.AGG_TYPE_AVG: "avg",
    spec.AggType.AGG_TYPE_COUNT: "count",
    spec.AggType.AGG_TYPE_COUNTD: "countd",
    spec.AggType.AGG_TYPE_MIN: "min",
    spec.AggType.AGG_TYPE_MAX: "max",
    spec.AggType.AGG_TYPE_MEDIAN: "median",
    spec.AggType.AGG_TYPE_ATTR: "attr",
    spec.AggType.AGG_TYPE_UNSPECIFIED: "none",
}


def compile_visual_spec(v: spec.VisualSpec) -> LogicalOp:
    """Lower a VisualSpec into a LogicalOp tree."""
    _validate_roles(v.fields)

    grain = _derive_viz_grain(v)
    measures = _collect_measures(v)

    base: LogicalOp = LogicalOpRelation(table=v.sheet_id, schema="")

    # T10 does not attach filters yet — that is T11's scope. Stub call here
    # so T11 can extend without touching this function body.
    base = _apply_filters(base, v)

    if measures:
        aggs = tuple(_to_agg_exp(m) for m in measures)
        return LogicalOpAggregate(
            input=base,
            group_bys=tuple(_to_lfield(f) for f in grain),
            aggregations=aggs,
        )
    # No measures: scatter/disagg path is T11.
    return base


# ---- helpers ----------------------------------------------------------


def _validate_roles(fields: Iterable[spec.Field]) -> None:
    for f in fields:
        if f.role not in (
            spec.FieldRole.FIELD_ROLE_DIMENSION,
            spec.FieldRole.FIELD_ROLE_MEASURE,
        ):
            raise ValueError(
                f"Field {f.id!r} has unsupported role={f.role}; "
                "expected dimension or measure."
            )


def _derive_viz_grain(v: spec.VisualSpec) -> list[spec.Field]:
    """Union of dim pills on grain-bearing shelves (§V.4)."""
    seen: dict[str, spec.Field] = {}
    for shelf in v.shelves:
        if shelf.kind not in _GRAIN_SHELF_KINDS:
            continue
        for f in shelf.fields:
            if f.role != spec.FieldRole.FIELD_ROLE_DIMENSION:
                continue
            seen.setdefault(f.id, f)
    return list(seen.values())


def _collect_measures(v: spec.VisualSpec) -> list[spec.Field]:
    seen: dict[str, spec.Field] = {}
    for shelf in v.shelves:
        if shelf.kind == spec.ShelfKind.SHELF_KIND_FILTER:
            continue
        for f in shelf.fields:
            if f.role == spec.FieldRole.FIELD_ROLE_MEASURE and not f.is_disagg:
                seen.setdefault(f.id, f)
    return list(seen.values())


def _apply_filters(base: LogicalOp, v: spec.VisualSpec) -> LogicalOp:
    """Extended in T11; T10 returns base unchanged."""
    del v  # unused this task
    return base


def _to_lfield(f: spec.Field) -> LField:
    return LField(
        id=f.id,
        data_type=_data_type_name(f.data_type),
        role=_role_name(f.role),
        aggregation=_AGG_NAMES.get(f.aggregation, "none"),
        semantic_role=f.semantic_role,
        is_disagg=f.is_disagg,
    )


def _to_agg_exp(m: spec.Field) -> AggExp:
    agg_name = _AGG_NAMES.get(m.aggregation, "sum")
    return AggExp(
        name=f"{m.id}__{agg_name}",
        agg=agg_name,
        expr=Column(field_id=m.id),
    )


def _data_type_name(dt: int) -> str:
    mapping = {
        spec.DataType.DATA_TYPE_STRING: "string",
        spec.DataType.DATA_TYPE_NUMBER: "number",
        spec.DataType.DATA_TYPE_INT: "int",
        spec.DataType.DATA_TYPE_FLOAT: "float",
        spec.DataType.DATA_TYPE_BOOL: "bool",
        spec.DataType.DATA_TYPE_DATE: "date",
        spec.DataType.DATA_TYPE_DATETIME: "date-time",
        spec.DataType.DATA_TYPE_SPATIAL: "spatial",
    }
    return mapping.get(dt, "unknown")


def _role_name(r: int) -> str:
    if r == spec.FieldRole.FIELD_ROLE_DIMENSION:
        return "dimension"
    if r == spec.FieldRole.FIELD_ROLE_MEASURE:
        return "measure"
    return "unknown"


__all__ = ["compile_visual_spec"]
```

**Note on enum names.** The mapping functions above use the symbolic names from `vizql.proto.v1_pb2` as re-exported by `vizql.spec` (e.g., `spec.DataType.DATA_TYPE_STRING`). If a symbol is missing because Plan 7a's proto named it slightly differently, open `backend/vizql/proto/v1_pb2.pyi` first and adjust the mapping table to the actual generated names. Do **not** invent names; they must match the proto.

- [ ] **Step 10.4: Re-export from `__init__.py`**

```python
from vizql.compiler import compile_visual_spec  # noqa: E402,F401
```

- [ ] **Step 10.5: Run — expect pass**

```bash
python -m pytest tests/test_vizql_compiler.py -v
```

- [ ] **Step 10.6: Commit**

```bash
git add backend/vizql/__init__.py backend/vizql/compiler.py backend/tests/test_vizql_compiler.py
git commit -m "feat(analyst-pro): compile VisualSpec to logical plan — bar path (Plan 7b T10)"
```

---

### Task 11 — Compiler: filter stages + Measure Names/Values + mark-aware agg + domain + dual axis

**Files:**
- Modify: `backend/vizql/compiler.py`
- Modify: `backend/tests/test_vizql_compiler.py`

**Sub-features (each gets its own failing test before implementation).**

**A. Filter stage attachment (§IV.7).** Walk `v.filters` and produce one `LogicalOpSelect` (dim / context / datasource / extract / fixed_lod / include_exclude_lod stages) or `LogicalOpFilter` (measure / table_calc / totals stages) per filter. Determine stage from `FilterSpec.filter_stage` string (already present on `spec.FilterSpec`). Unknown values map to `"dimension"`. Categorical / range / relative-date filter predicates are lowered to `FnCall`/`BinaryOp` expressions (see code below). Stack filters atop the `LogicalOpRelation`; ordering is not enforced in Plan 7b (Plan 7c does that).

**B. Measure Names / Measure Values synthesis (§III.6).** If `spec.fields` contains a synthetic `Measure Names` field (`column_class == COLUMN_CLASS_VISUAL_DATA` and `id == "__measure_names__"`) OR more than one measure appears on a non-filter shelf and none of them are on dual-axis rows, synthesise a `Measure Names` dim in `group_bys` + a `Measure Values` aggregation that fans out one row per measure. Implemented as: measure list stays as multiple `AggExp` entries (the caller/frontend renders them via Measure Names); Plan 7b pins that multi-measure specs produce multiple `AggExp` and a synthetic `Measure Names` dim when explicitly requested via the synthetic field.

**C. Mark-aware aggregation.** If `spec.mark_type == MARK_TYPE_CIRCLE` (scatter default) OR any measure field has `is_disagg=True`, skip the `LogicalOpAggregate` wrapper and return a `LogicalOpProject` over the filtered relation instead. The measure expressions appear in the project's `expressions` NamedExps, un-aggregated. Bar / line / area / pie / heatmap / gantt / text / shape / map / polygon / square retain the aggregate wrapper.

**D. Dual-axis.** `spec.Encoding.encoding_type == ENCODING_TYPE_DUAL_AXIS` (or two measure pills on the same SHELF_KIND_ROW with the dual-axis marker on the second) produces TWO `AggExp` entries on the same `LogicalOpAggregate` — one per axis. Synchronize-axis is metadata only; Plan 7b preserves both measures as sibling aggregations.

**E. Snowflake domain.** If `spec.domain_type == "snowflake"`, wrap the aggregate in `LogicalOpDomain(domain=DomainType.SNOWFLAKE)`. Default `"separate"` → wrap in `LogicalOpDomain(domain=DomainType.SEPARATE)` only when the spec explicitly requests it; otherwise omit to keep simple plans unchanged. Rule for Plan 7b: wrap only when `domain_type == "snowflake"` (conservative).

- [ ] **Step 11.1: Write failing tests**

Append to `backend/tests/test_vizql_compiler.py`:

```python
from vizql.logical import (
    BinaryOp, Column, DomainType, FnCall, Literal,
    LogicalOpDomain, LogicalOpFilter, LogicalOpProject, LogicalOpSelect,
)


def _categorical_filter(field_id: str, values: list[str],
                         stage: str = "dimension") -> spec.FilterSpec:
    f = spec.Field(
        id=field_id,
        data_type=spec.DataType.DATA_TYPE_STRING,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
    )
    return spec.FilterSpec(
        filter_kind=spec.FilterKind.FILTER_KIND_CATEGORICAL,
        field=f,
        categorical=spec.CategoricalFilterProps(values=values),
        filter_stage=stage,
    )


def test_compile_attaches_categorical_dim_filter_as_select():
    region = _dim("orders.region")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[_categorical_filter("orders.region", ["East", "West"])],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    # Drill through Aggregate.input to find the Select.
    node = plan.input  # type: ignore[attr-defined]
    assert isinstance(node, LogicalOpSelect)
    assert node.filter_stage == "dimension"
    assert isinstance(node.predicate, FnCall)
    assert node.predicate.name == "IN"


def test_compile_attaches_range_filter_as_binary_op():
    region = _dim("orders.region")
    total = _measure("orders.total")
    price = spec.Field(
        id="orders.price",
        data_type=spec.DataType.DATA_TYPE_NUMBER,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
    )
    rf = spec.FilterSpec(
        filter_kind=spec.FilterKind.FILTER_KIND_RANGE,
        field=price,
        range=spec.RangeFilterProps(min=0.0, max=100.0),
        filter_stage="dimension",
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total, price],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[rf],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    node = plan.input  # type: ignore[attr-defined]
    assert isinstance(node, LogicalOpSelect)
    # BETWEEN lowered as AND of two comparisons.
    assert isinstance(node.predicate, BinaryOp)
    assert node.predicate.op == "AND"


def test_compile_relative_date_filter_lowers_to_fncall():
    date = spec.Field(
        id="orders.date",
        data_type=spec.DataType.DATA_TYPE_DATE,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
    )
    total = _measure("orders.total")
    rd = spec.FilterSpec(
        filter_kind=spec.FilterKind.FILTER_KIND_RELATIVE_DATE,
        field=date,
        relative_date=spec.RelativeDateFilterProps(
            anchor_date="2026-01-01", period_type="month",
            date_range_type="last_n", range_n=3,
        ),
        filter_stage="dimension",
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[date, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[date]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[rd],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    node = plan.input  # type: ignore[attr-defined]
    assert isinstance(node, LogicalOpSelect)
    assert isinstance(node.predicate, FnCall)
    assert node.predicate.name == "RELATIVE_DATE"


def test_compile_context_filter_marker_preserved():
    region = _dim("orders.region")
    total = _measure("orders.total")
    cf = _categorical_filter("orders.region", ["East"], stage="context")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[cf],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    node = plan.input  # type: ignore[attr-defined]
    assert isinstance(node, LogicalOpSelect)
    assert node.filter_stage == "context"


def test_compile_measure_filter_becomes_logical_op_filter():
    region = _dim("orders.region")
    total = _measure("orders.total")
    # Measure filter: HAVING SUM(total) > 1000.
    mf = spec.FilterSpec(
        filter_kind=spec.FilterKind.FILTER_KIND_RANGE,
        field=total,
        range=spec.RangeFilterProps(min=1000.0, max=1e18),
        filter_stage="measure",
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[mf],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    # Measure filter sits above the aggregate.
    assert isinstance(plan, LogicalOpFilter)
    assert plan.filter_stage == "measure"


def test_compile_scatter_disaggregates():
    x = _measure("orders.price")
    y = _measure("orders.profit")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[x, y],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[x]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[y]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_CIRCLE,  # scatter default
    )
    plan = compile_visual_spec(s)
    # No aggregate wrapper; Project instead.
    assert isinstance(plan, LogicalOpProject)
    names = [n for n, _ in plan.expressions.entries]
    assert "orders.price" in names and "orders.profit" in names


def test_compile_dual_axis_produces_two_aggregations():
    region = _dim("orders.region")
    sales = _measure("orders.sales")
    profit = _measure("orders.profit")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, sales, profit],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[sales, profit]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    assert isinstance(plan, LogicalOpAggregate)
    names = {a.name for a in plan.aggregations}
    assert {"orders.sales__sum", "orders.profit__sum"} <= names


def test_compile_measure_names_values_synthetic():
    region = _dim("orders.region")
    sales = _measure("orders.sales")
    profit = _measure("orders.profit")
    mn = spec.Field(
        id="__measure_names__",
        data_type=spec.DataType.DATA_TYPE_STRING,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
        column_class=spec.ColumnClass.COLUMN_CLASS_VISUAL_DATA,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, sales, profit, mn],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN,
                       fields=[region, mn]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW,
                       fields=[sales, profit]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    assert isinstance(plan, LogicalOpAggregate)
    grain_ids = {f.id for f in plan.group_bys}
    assert "__measure_names__" in grain_ids
    assert len(plan.aggregations) == 2


def test_compile_snowflake_domain_wraps_in_logical_op_domain():
    region = _dim("orders.region")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        domain_type="snowflake",
    )
    plan = compile_visual_spec(s)
    assert isinstance(plan, LogicalOpDomain)
    assert plan.domain == DomainType.SNOWFLAKE


def test_compile_separate_domain_does_not_wrap():
    region = _dim("orders.region")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        domain_type="separate",
    )
    plan = compile_visual_spec(s)
    # Default: no LogicalOpDomain wrap.
    assert not isinstance(plan, LogicalOpDomain)
```

- [ ] **Step 11.2: Run — expect failure on new tests**

```bash
python -m pytest tests/test_vizql_compiler.py -v
```

- [ ] **Step 11.3: Implement — filter lowering + mark-aware agg + MN/MV + dual-axis + domain**

In `backend/vizql/compiler.py`, replace `_apply_filters` and `compile_visual_spec` with:

```python
from vizql.logical import (
    AggExp, BinaryOp, Column, DomainType, Field as LField, FnCall, Literal,
    LogicalOp, LogicalOpAggregate, LogicalOpDomain, LogicalOpFilter,
    LogicalOpProject, LogicalOpRelation, LogicalOpSelect, NamedExps,
)


_MEASURE_NAMES_ID = "__measure_names__"
_DISAGG_MARKS: frozenset[int] = frozenset({
    spec.MarkType.MARK_TYPE_CIRCLE,
})


def compile_visual_spec(v: spec.VisualSpec) -> LogicalOp:
    _validate_roles(v.fields)

    grain = _derive_viz_grain(v)
    measures = _collect_measures(v)

    base: LogicalOp = LogicalOpRelation(table=v.sheet_id, schema="")
    dim_filters, measure_filters = _split_filters_by_stage(v.filters)
    for fs in dim_filters:
        base = LogicalOpSelect(
            input=base,
            predicate=_lower_filter_predicate(fs),
            filter_stage=_valid_stage(fs.filter_stage, default="dimension"),
        )

    if _is_disagg(v, measures):
        # Scatter / explicitly disaggregated: Project, no Aggregate.
        exprs = NamedExps(entries=tuple(
            (m.id, Column(field_id=m.id)) for m in measures
        ))
        body: LogicalOp = LogicalOpProject(
            input=base,
            renames=(),
            expressions=exprs,
            calculated_column=(),
        )
    else:
        aggs = tuple(_to_agg_exp(m) for m in measures)
        body = LogicalOpAggregate(
            input=base,
            group_bys=tuple(_to_lfield(f) for f in grain),
            aggregations=aggs,
        )

    for fs in measure_filters:
        body = LogicalOpFilter(
            input=body,
            predicate=_lower_filter_predicate(fs),
            filter_stage=_valid_stage(fs.filter_stage, default="measure"),
        )

    if v.domain_type == "snowflake":
        body = LogicalOpDomain(input=body, domain=DomainType.SNOWFLAKE)

    return body


# ---- filter helpers --------------------------------------------------


_DIM_FILTER_STAGES = frozenset({
    "extract", "datasource", "context", "fixed_lod", "dimension",
    "include_exclude_lod",
})
_MEASURE_FILTER_STAGES = frozenset({"measure", "table_calc", "totals"})


def _split_filters_by_stage(
    filters: list[spec.FilterSpec],
) -> tuple[list[spec.FilterSpec], list[spec.FilterSpec]]:
    dim, meas = [], []
    for f in filters:
        stage = f.filter_stage or "dimension"
        if stage in _MEASURE_FILTER_STAGES:
            meas.append(f)
        else:
            dim.append(f)
    return dim, meas


def _valid_stage(stage: str, *, default: str) -> str:
    return stage if stage in (_DIM_FILTER_STAGES | _MEASURE_FILTER_STAGES) else default


def _lower_filter_predicate(f: spec.FilterSpec):
    col = Column(field_id=f.field.id)
    if f.categorical is not None:
        args: list[object] = [col]
        for v in f.categorical.values:
            args.append(Literal(value=v, data_type="string"))
        pred = FnCall(name="IN", args=tuple(args))  # type: ignore[arg-type]
        if f.categorical.is_exclude_mode:
            return FnCall(name="NOT", args=(pred,))
        return pred
    if f.range is not None:
        lo = BinaryOp(op=">=", left=col,
                      right=Literal(value=f.range.min, data_type="number"))
        hi = BinaryOp(op="<=", left=col,
                      right=Literal(value=f.range.max, data_type="number"))
        return BinaryOp(op="AND", left=lo, right=hi)
    if f.relative_date is not None:
        rd = f.relative_date
        return FnCall(
            name="RELATIVE_DATE",
            args=(
                col,
                Literal(value=rd.anchor_date, data_type="string"),
                Literal(value=rd.period_type, data_type="string"),
                Literal(value=rd.date_range_type, data_type="string"),
                Literal(value=rd.range_n, data_type="int"),
            ),
        )
    if f.hierarchical is not None:
        return FnCall(
            name="HIER_IN",
            args=tuple(Literal(value=v, data_type="string")
                        for v in f.hierarchical.hier_val_selection_models),
        )
    # Unknown filter body: lower to a no-op predicate so the plan stays valid.
    return BinaryOp(op="=", left=Literal(value=1, data_type="int"),
                    right=Literal(value=1, data_type="int"))


# ---- mark / disagg / measure collection ------------------------------


def _is_disagg(v: spec.VisualSpec, measures: list[spec.Field]) -> bool:
    if v.mark_type in _DISAGG_MARKS:
        return True
    return any(m.is_disagg for m in measures)


def _collect_measures(v: spec.VisualSpec) -> list[spec.Field]:
    """Override T10 version to respect disagg marks (keeps every measure, flagged)."""
    seen: dict[str, spec.Field] = {}
    disagg = v.mark_type in _DISAGG_MARKS
    for shelf in v.shelves:
        if shelf.kind == spec.ShelfKind.SHELF_KIND_FILTER:
            continue
        for f in shelf.fields:
            if f.role != spec.FieldRole.FIELD_ROLE_MEASURE:
                continue
            if disagg and not f.is_disagg:
                # Clone with is_disagg=True so downstream code sees the flag.
                f = spec.Field(
                    id=f.id, data_type=f.data_type, role=f.role,
                    semantic_role=f.semantic_role, aggregation=f.aggregation,
                    is_disagg=True, column_class=f.column_class,
                )
            seen.setdefault(f.id, f)
    return list(seen.values())
```

**Important.** The revised `_collect_measures` replaces the T10 version (which silently dropped `is_disagg=True` measures). When pasting, delete the T10 definition entirely; do not leave two functions with the same name.

- [ ] **Step 11.4: Run — expect pass**

```bash
python -m pytest tests/test_vizql_compiler.py -v
```

- [ ] **Step 11.5: Commit**

```bash
git add backend/vizql/compiler.py backend/tests/test_vizql_compiler.py
git commit -m "feat(analyst-pro): compiler — filters + Measure Names/Values + mark-aware agg + domain (Plan 7b T11)"
```

---

### Task 12 — LOD lowering + mypy --strict + full verification + docs + roadmap status

**Files:**
- Modify: `backend/vizql/compiler.py`
- Modify: `backend/tests/test_vizql_compiler.py`
- Modify: `backend/vizql/README.md`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md`

**LOD contract (Build_Tableau.md §V.2).**

- `FIXED [d1, d2] : SUM([m])` → **inner** `LogicalOpAggregate(group_bys=(d1, d2), aggregations=(SUM(m),))` + **outer** `LogicalOpLookup(lookup_field=Column("m_fixed"), offset=0)` joining the inner result back onto the main plan by the fixed-dim keys. Plan 7b emits structurally; the actual correlated-subquery SQL is Plan 7c. Filter stage: `"fixed_lod"` on any dim filter that references the fixed dims.
- `INCLUDE [d] : SUM([m])` → `LogicalOpOver(partition_bys=PartitionBys(fields=viz_grain ∪ {d}), ...)`. Frame: `ROWS UNBOUNDED_PRECEDING .. UNBOUNDED_FOLLOWING`, `CURRENT_ROW` exclusion OFF.
- `EXCLUDE [d] : SUM([m])` → `LogicalOpOver(partition_bys=PartitionBys(fields=viz_grain \ {d}), ...)`. Same frame.

For Plan 7b, read `spec.VisualSpec.lod_calculations` (already typed via Plan 7a). Each entry has `lod_kind`, `lod_dims`, `inner_calculation`, `outer_aggregation`.

- [ ] **Step 12.1: Write failing tests**

Append to `backend/tests/test_vizql_compiler.py`:

```python
from vizql.logical import (
    LogicalOpLookup, LogicalOpOver, PartitionBys,
)


def test_compile_fixed_lod_emits_lookup_over_inner_aggregate():
    region = _dim("orders.region")
    country = _dim("orders.country")
    total = _measure("orders.total")
    lod = spec.LodCalculation(
        id="country_total_fixed",
        lod_kind="fixed",
        lod_dims=[country],
        inner_calculation=spec.Calculation(id="inner_sum",
                                          formula="SUM([orders.total])"),
        outer_aggregation=spec.AggType.AGG_TYPE_SUM,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, country, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        lod_calculations=[lod],
    )
    plan = compile_visual_spec(s)
    # Walk down from the root aggregate; there must be a Lookup somewhere
    # whose input is an inner Aggregate grouping on country.
    found = _find_first(plan, LogicalOpLookup)
    assert found is not None, "expected LogicalOpLookup from FIXED LOD"
    inner = found.input
    assert isinstance(inner, LogicalOpAggregate)
    inner_ids = {f.id for f in inner.group_bys}
    assert inner_ids == {"orders.country"}


def test_compile_include_lod_emits_over_with_grain_plus_dim():
    region = _dim("orders.region")
    segment = _dim("orders.segment")
    total = _measure("orders.total")
    lod = spec.LodCalculation(
        id="segment_include",
        lod_kind="include",
        lod_dims=[segment],
        inner_calculation=spec.Calculation(id="inner",
                                          formula="SUM([orders.total])"),
        outer_aggregation=spec.AggType.AGG_TYPE_AVG,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, segment, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        lod_calculations=[lod],
    )
    plan = compile_visual_spec(s)
    over = _find_first(plan, LogicalOpOver)
    assert over is not None
    ids = {f.id for f in over.partition_bys.fields}
    # viz_grain = {region}; INCLUDE adds segment.
    assert ids == {"orders.region", "orders.segment"}


def test_compile_exclude_lod_removes_dim_from_partition():
    region = _dim("orders.region")
    segment = _dim("orders.segment")
    total = _measure("orders.total")
    lod = spec.LodCalculation(
        id="exclude_region",
        lod_kind="exclude",
        lod_dims=[region],
        inner_calculation=spec.Calculation(id="inner",
                                          formula="SUM([orders.total])"),
        outer_aggregation=spec.AggType.AGG_TYPE_SUM,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, segment, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN,
                       fields=[region, segment]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        lod_calculations=[lod],
    )
    plan = compile_visual_spec(s)
    over = _find_first(plan, LogicalOpOver)
    assert over is not None
    ids = {f.id for f in over.partition_bys.fields}
    # viz_grain = {region, segment}; EXCLUDE removes region.
    assert ids == {"orders.segment"}


def _find_first(node, target_type):
    """DFS: return first subtree instance of target_type, else None."""
    from collections import deque
    q = deque([node])
    while q:
        cur = q.popleft()
        if isinstance(cur, target_type):
            return cur
        for attr in ("input", "left", "right"):
            child = getattr(cur, attr, None)
            if child is not None and not isinstance(child, (str, int, float, bool, tuple)):
                q.append(child)
    return None
```

- [ ] **Step 12.2: Run — expect failure**

```bash
python -m pytest tests/test_vizql_compiler.py -v -k "lod"
```

- [ ] **Step 12.3: Implement LOD lowering**

Append to `backend/vizql/compiler.py`:

```python
from vizql.logical import (
    FrameEnd, FrameSpec, FrameStart, LogicalOpLookup, LogicalOpOver,
    NamedExps, OrderBy, PartitionBys, WindowFrameType,
)


def _apply_lod(
    body: LogicalOp,
    grain_fields: list[spec.Field],
    lods: list[spec.LodCalculation],
) -> LogicalOp:
    for lod in lods:
        kind = (lod.lod_kind or "").lower()
        if kind == "fixed":
            body = _lower_fixed_lod(body, lod)
        elif kind == "include":
            body = _lower_include_lod(body, grain_fields, lod)
        elif kind == "exclude":
            body = _lower_exclude_lod(body, grain_fields, lod)
        # unknown kinds silently skipped; Plan 8a will enforce.
    return body


def _lower_fixed_lod(body: LogicalOp, lod: spec.LodCalculation) -> LogicalOp:
    inner_grain = tuple(_to_lfield(f) for f in lod.lod_dims)
    inner_agg_name = _AGG_NAMES.get(lod.outer_aggregation, "sum")
    inner_aggs = (AggExp(
        name=f"{lod.id}__inner",
        agg=inner_agg_name,
        expr=Column(field_id=lod.inner_calculation.id
                    if lod.inner_calculation is not None else lod.id),
    ),)
    inner = LogicalOpAggregate(
        input=_leaf_relation(body),
        group_bys=inner_grain,
        aggregations=inner_aggs,
    )
    return LogicalOpLookup(
        input=inner,
        lookup_field=Column(field_id=f"{lod.id}__inner"),
        offset=0,
    )


def _lower_include_lod(
    body: LogicalOp,
    grain_fields: list[spec.Field],
    lod: spec.LodCalculation,
) -> LogicalOp:
    extra = [_to_lfield(f) for f in lod.lod_dims]
    grain = [_to_lfield(f) for f in grain_fields]
    seen = {f.id: f for f in grain}
    for f in extra:
        seen.setdefault(f.id, f)
    return _build_over(body, tuple(seen.values()), lod)


def _lower_exclude_lod(
    body: LogicalOp,
    grain_fields: list[spec.Field],
    lod: spec.LodCalculation,
) -> LogicalOp:
    excluded = {f.id for f in lod.lod_dims}
    remaining = tuple(_to_lfield(f) for f in grain_fields if f.id not in excluded)
    return _build_over(body, remaining, lod)


def _build_over(
    body: LogicalOp,
    partition_fields: tuple,
    lod: spec.LodCalculation,
) -> LogicalOp:
    frame = FrameSpec(
        frame_type=WindowFrameType.ROWS,
        start=FrameStart(kind="unbounded_preceding"),
        end=FrameEnd(kind="unbounded_following"),
    )
    agg = _AGG_NAMES.get(lod.outer_aggregation, "sum")
    exprs = NamedExps(entries=((
        lod.id,
        FnCall(name=agg.upper(), args=(
            Column(field_id=lod.inner_calculation.id
                   if lod.inner_calculation is not None else lod.id),
        )),
    ),))
    return LogicalOpOver(
        input=body,
        partition_bys=PartitionBys(fields=partition_fields),
        order_by=(),
        frame=frame,
        expressions=exprs,
    )


def _leaf_relation(body: LogicalOp) -> LogicalOp:
    """Walk down ``input`` chain to the LogicalOpRelation leaf.

    FIXED-LOD inner subquery references the base table independently of
    the outer filter stack — consistent with §IV.7 stage 4 (AFTER
    Context, BEFORE Dim). Plan 7c will also thread Extract/DS/Context
    filters through the inner.
    """
    cur: object = body
    while True:
        inp = getattr(cur, "input", None)
        if inp is None:
            return cur  # type: ignore[return-value]
        cur = inp
```

Then wire `_apply_lod` into `compile_visual_spec` **before** the `LogicalOpDomain` wrap and **after** measure-filter stacking:

```python
    # right before the LogicalOpDomain wrap:
    if v.lod_calculations:
        body = _apply_lod(body, grain, v.lod_calculations)
```

- [ ] **Step 12.4: Run LOD tests — expect pass**

```bash
python -m pytest tests/test_vizql_compiler.py -v -k "lod"
```

- [ ] **Step 12.5: Run mypy --strict**

From `backend/`:

```bash
python -m mypy --strict vizql/logical.py vizql/validator.py vizql/compiler.py
```

Expected: zero errors. If mypy complains about `spec.*` attribute access returning `Any`, add a `# type: ignore[attr-defined]` at each site rather than loosening the strict flag. If mypy complains about the forward-referenced `LogicalOp` union in `logical.py`, promote the `Union` alias to a concrete `TypeAlias` with string-quoted members.

- [ ] **Step 12.6: Run full backend suite — expect pass, zero regressions**

```bash
python -m pytest tests/ -v
```

Expected: baseline (688+ passing) + all new Plan 7b tests pass. Zero failures.

- [ ] **Step 12.7: Update `backend/vizql/README.md`**

Append a new section after the existing Plan 7a content:

```markdown
## Logical plan (Plan 7b)

- `backend/vizql/logical.py` — 14 `LogicalOp*` dataclasses + expression AST (`Column`, `Literal`, `BinaryOp`, `FnCall`) + supporting types (`Field`, `OrderBy`, `PartitionBys`, `FrameSpec`, `AggExp`, `NamedExps`) + enums (`DomainType`, `WindowFrameType`, `WindowFrameExclusion`, `SqlSetType`).
- `backend/vizql/compiler.py` — `compile_visual_spec(spec) -> LogicalOp` lowers a `VisualSpec` into a logical-plan tree. Derives viz grain (§V.4), splits dim/measure, attaches filters with `filter_stage` annotation (§IV.7), handles mark-aware aggregation, Measure Names / Measure Values synthesis, dual-axis, Snowflake domain, and LOD lowering (`FIXED`/`INCLUDE`/`EXCLUDE`).
- `backend/vizql/validator.py` — `validate_logical_plan(plan)` catches cycles, missing inputs, and malformed aggregates.

Filter-stage convention (Build_Tableau.md §IV.7):

| Stage | On | Meaning |
|---|---|---|
| `"extract"` | `LogicalOpSelect` | Baked into `.hyper` at extract build. |
| `"datasource"` | `LogicalOpSelect` | WHERE on every query against the DS. |
| `"context"` | `LogicalOpSelect` | Context filter; CTE / `#Tableau_Temp_`. |
| `"fixed_lod"` | `LogicalOpSelect` | AFTER context, BEFORE dim. |
| `"dimension"` | `LogicalOpSelect` | `WHERE` from Filters-shelf dim pills. |
| `"include_exclude_lod"` | `LogicalOpSelect` | AFTER dim, BEFORE measure. |
| `"measure"` | `LogicalOpFilter` | `HAVING`. |
| `"table_calc"` | `LogicalOpFilter` | Client-side, post-fetch (Plan 7c). |
| `"totals"` | `LogicalOpFilter` | Totals-only; skippable via `ShouldAffectTotals`. |

Plan 7b records the stage; Plan 7c enforces ordering.
```

- [ ] **Step 12.8: Update roadmap**

Edit `docs/analyst_pro_tableau_parity_roadmap.md`. Under `### Plan 7b — Minerva Logical Plan Port`, after the deliverables block, insert a `**Status:** ✅ Shipped <today's date>. 12 tasks.` line. Replace `<today's date>` with the actual date of the final commit. Commit SHA list is optional — include it if the engineer has all 12 commit hashes on hand (mirror Plan 7a T7 format).

- [ ] **Step 12.9: Commit**

```bash
git add backend/vizql/compiler.py backend/vizql/README.md backend/tests/test_vizql_compiler.py docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "feat(analyst-pro): compile LOD expressions + verify Plan 7b suite (Plan 7b T12)"
```

- [ ] **Step 12.10: Final verification sweep**

```bash
python -m pytest tests/test_vizql_logical.py tests/test_vizql_compiler.py tests/test_vizql_validator.py -v
python -m mypy --strict vizql/logical.py vizql/validator.py vizql/compiler.py
python -m pytest tests/ -v
```

Every command exits zero. Plan 7b shipped.

---

## Self-review gate (engineer runs before declaring done)

- [ ] 14 canonical operators present in `logical.py` and `__all__`, names match §IV.2 exactly (including `LogicalOpValuestoColumns` — note the lowercase `t`).
- [ ] Every dataclass is `frozen=True, slots=True` and every sequence field is `tuple[T, ...]`.
- [ ] `filter_stage` annotation present on `LogicalOpSelect` + `LogicalOpFilter`; values restricted to the 9-stage vocabulary.
- [ ] `DomainType` has exactly `SNOWFLAKE` + `SEPARATE` per §A.15.
- [ ] All 12+ compiler scenarios from the roadmap are covered by named tests (bar, scatter, dual axis, FIXED, INCLUDE, EXCLUDE, context marker, categorical, range, relative-date, Measure Names/Values, Snowflake). Each scenario appears as its own `def test_...`.
- [ ] `mypy --strict` clean on the three new modules.
- [ ] No regressions in existing `backend/tests/` suite.
- [ ] No SQL-generation code introduced (that is Plan 7c).
- [ ] No change outside `backend/vizql/` + `backend/tests/` + the two doc files.
- [ ] 12 commits on `askdb-global-comp`, formatted `feat(analyst-pro): <verb> <object> (Plan 7b T<N>)` except T9 which uses the same format but starts with `feat(analyst-pro): add logical plan validator (Plan 7b T9)`.

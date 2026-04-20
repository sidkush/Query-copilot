# backend/vizql/

VizQL engine package - AskDB's answer to Tableau's `minerva` +
`tabquery` + `tabquerycache` stack. See
`docs/analyst_pro_tableau_parity_roadmap.md` Phase 7 for the full plan
series.

## Layout (Plan 7a - IR only)

```
backend/vizql/
├── __init__.py
├── spec.py                       # hand-authored VisualSpec dataclasses
├── proto/
│   ├── __init__.py
│   ├── v1_pb2.py                 # GENERATED - do not hand-edit
│   └── v1_pb2.pyi                # GENERATED - do not hand-edit
└── README.md                     # (this file)
```

Later plans add `logical.py` (7b), `sql_ast.py` + optimiser passes
(7c), `dialects/` (7d), `cache.py` (7e).

## VisualSpec IR

`VisualSpec` is the canonical description of a worksheet that will be
fed into the compiler in Plan 7b. It mirrors Tableau's
`tableau.vizdataservice.v1` protobuf semantics (`docs/Build_Tableau.md`
Section I.5, Section III.1-III.6, Appendix A.1-A.8, A.14).

**Fields:**

| Field | Purpose |
|---|---|
| `sheet_id` | Stable worksheet id (matches `dashboard_tile.id`). |
| `fields` | Pane-scope field catalogue. |
| `shelves` | Pill placements (Rows / Columns / Marks-card channels). |
| `encodings` | Marks-card bindings (`customEncodingTypeId` for viz extensions). |
| `filters` | 4-kind `FilterSpec` union - categorical / hierarchical / range / relativeDate. |
| `parameters` | Workbook-scoped typed scalars. |
| `lod_calculations` | FIXED / INCLUDE / EXCLUDE LOD (mapped in Plan 7b / 8b). |
| `mark_type` | Build_Tableau Section III.3 enum. |
| `analytics` | Reference lines, trend, forecast, cluster (Plan 9 fills in). |
| `is_generative_ai_web_authoring` | AI-origin marker (Build_Tableau Section I.5). |
| `domain_type` | Snowflake vs separate cross-product (Section IV.3). |

**Wire invariants:**

- Canonical enum names - matches `docs/Build_Tableau.md` Appendix A
  exactly. Integer tags pinned via
  `backend/tests/test_vizql_spec_roundtrip.py::test_enum_canonical_values_pinned_to_appendix_a`.
- Published Tableau typos - `hierachical-filter`, `paremeter-caption`,
  `quantitative-dmain`, `apply-relative-date-Filter` live in the
  command-verb layer (Plan 3 actions subsystem), not in this IR. The IR
  uses the canonical spellings from Appendix A.8 (`relativeDate`,
  `hierarchical`, etc.).
- Server-side eval forbidden - treat every string in a `VisualSpec` as
  untrusted; every downstream compiler pass MUST route literals through
  `sql_validator.py` or `param_substitution.FormatAsLiteral`.

## Codegen

```
make proto                         # regenerates both Python + TypeScript
make proto-py                      # Python only
make proto-ts                      # TypeScript only
make clean-proto                   # delete generated files

# Windows (no GNU make) - invoke the scripts directly:
bash backend/scripts/regen_proto.sh
bash frontend/scripts/regen_proto.sh
# or, from frontend/:
npm run proto
```

Requirements (auto-installed via `pip install -r backend/requirements.txt`
and `cd frontend && npm install`):

- Python: `protobuf>=5.29` + `grpcio-tools>=1.68`. The latter ships a
  bundled `protoc` binary that is used by BOTH the Python and the
  TypeScript codegen paths - no system `protoc` binary required.
- TypeScript: `ts-proto@^2.6.1` (devDependencies).

Generated files (committed - CI does not regenerate):

- `backend/vizql/proto/v1_pb2.py` + `v1_pb2.pyi`
- `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts`

Edit the `.proto` file, run the codegen, commit the diff together.

## Usage - Python

```python
from vizql import spec

v = spec.VisualSpec(
    sheet_id="sheet-1",
    mark_type=spec.MarkType.MARK_TYPE_BAR,
    is_generative_ai_web_authoring=True,
)
payload = v.serialize()
roundtrip = spec.VisualSpec.deserialize(payload)
```

## Usage - TypeScript

```ts
import { makeVisualSpec, MarkType, toJSON, fromJSON } from
  '@/components/dashboard/freeform/lib/vizSpec';

const v = makeVisualSpec({
  sheetId: 'sheet-1',
  markType: MarkType.MARK_TYPE_BAR,
  isGenerativeAiWebAuthoring: true,
});

const json = toJSON(v);
const rt = fromJSON(json);
```

Bridge from existing store state (Plan 4a/4b/4c):

```ts
import { bridgeToVisualSpec } from
  '@/components/dashboard/freeform/lib/vizSpecBridge';

const v = bridgeToVisualSpec({
  sheetId,
  sheetFilters: store.analystProSheetFilters[sheetId] ?? [],
  parameters: store.analystProParameters,
  sets: store.analystProSets,
});
```

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

## SQL AST + Optimiser (Plan 7c)

Plan 7c adds the Minerva-equivalent lowering layer on top of the 7b
logical plan:

- `backend/vizql/sql_ast.py` — hand-authored SQL AST dataclasses.
- `backend/vizql/generic_sql.py` — dialect-neutral stringifier used by
  the security gate + golden-diff tests.
- `backend/vizql/logical_to_sql.py` — `compile_logical_to_sql(plan) ->
  SQLQueryFunction` lowers a `LogicalOp` tree into a SQL AST.
- `backend/vizql/filter_ordering.py` — `apply_filters_in_order(qf,
  filters)` enforces `Build_Tableau.md` §IV.7's nine-stage order.
- `backend/vizql/optimizer.py` — seven-pass fixed-order pipeline with
  `optimize(qf, ctx) -> SQLQueryFunction`.
- `backend/vizql/passes/` — one module per optimiser pass.

### AST node kinds

| Node | Kind | Purpose |
|---|---|---|
| `Column` | expression | Column reference (`field_id` or `name`+`table_alias`). |
| `Literal` | expression | Typed scalar; generic stringifier quotes strings + doubles embedded `'`. |
| `BinaryOp` | expression | `left op right` — predicate / arithmetic. |
| `FnCall` | expression | Function call; carries `filter_clause` (FILTER WHERE) + `within_group` (WITHIN GROUP) for aggregates. |
| `Case` | expression | CASE WHEN / ELSE. |
| `Cast` | expression | CAST(expr AS type). |
| `FrameClause` | expression | ROWS/RANGE/GROUPS + start/end + exclusion. |
| `Window` | expression | Windowed expression; `partition_by` + `order_by` + `frame`. |
| `Subquery` | expression | Correlated or uncorrelated inner query; `correlated_on` keys for FIXED LOD emission. |
| `TableRef` | FROM item | Physical table reference. |
| `JoinNode` | FROM item | 5-kind join tree (INNER / LEFT / RIGHT / FULL / CROSS). |
| `Projection` | row shape | `NamedExps` emitted in SELECT list. |
| `CTE` | statement-part | WITH / WITH RECURSIVE named subquery. |
| `SetOp` | statement | UNION / INTERSECT / EXCEPT (with `ALL` modifier). |
| `SubqueryRef` | FROM item | Named sub-SELECT or LATERAL. |
| `SQLQueryFunction` | root | Compiled unit: ctes + FROM + projections + WHERE + group/rollup/cube + HAVING + ORDER + LIMIT + diagnostics. |

Every expression node implements `accept(visitor: Visitor[T]) -> T` —
Plan 7d dialect emitters plug in as `Visitor` implementations.

### Optimiser pipeline

Seven passes run in strict order (idempotent + terminating; `optimize(
optimize(qf)) == optimize(qf)`):

```
        ┌──────────────────────────────┐
input ─►│ 1. InputSchemaProver         │   (passes/input_schema_prover.py)
        ├──────────────────────────────┤
        │ 2. SchemaAndTypeDeriver      │   (passes/schema_type_deriver.py)
        ├──────────────────────────────┤
        │ 3. DataTypeResolver          │   (passes/data_type_resolver.py)
        ├──────────────────────────────┤
        │ 4. JoinTreeVirtualizer       │   (passes/join_virtualizer.py)
        ├──────────────────────────────┤
        │ 5. EqualityProver            │   (passes/equality_prover.py)
        ├──────────────────────────────┤
        │ 6. AggregatePushdown         │   (passes/agg_pushdown.py)
        ├──────────────────────────────┤
        │ 7. CommonSubexpElim          │   (passes/cse.py)
        └──────────────────────────────┘
                       │
                       ▼
                    output
```

`OptimizerContext(schemas, referenced_tables, max_iterations=4)` bounds
iteration and carries the resolved schema catalogue.

### Filter order-of-operations (§IV.7)

`apply_filters_in_order(qf, filters)` places each `StagedFilter` at the
exact stage below. Order is canonical; stages are `FILTER_STAGES`:

| # | Stage | Placement | Meaning |
|---|---|---|---|
| 1 | `extract` | ignored at runtime | Baked into `.hyper` at extract build. |
| 2 | `datasource` | outermost WHERE | Applied on every query against the DS. |
| 3 | `context` | CTE / `#Tableau_Temp_*` | Context filter — constrains subsequent stages. |
| 4 | `fixed_lod` | WHERE (post-context) | Applied AFTER context, BEFORE dim. FIXED LOD scope. |
| 5 | `dimension` | WHERE | Filters-shelf dim pills. |
| 6 | `include_exclude_lod` | WHERE (post-dim) | Applied AFTER dim, BEFORE measure. INCLUDE/EXCLUDE scope. |
| 7 | `measure` | HAVING | Post-aggregation predicate. |
| 8 | `table_calc` | `client_side_filters` | Post-fetch, client-side (VizQL router). |
| 9 | `totals` | `totals_query_required` flag | Totals-only; skippable via `ShouldAffectTotals`. |

The nine-stage invariant is test-enforced in
`backend/tests/test_vizql_filter_ordering.py`.

### Security gate

Every SQL string emitted by `SQLQueryFunction.to_sql_generic()` is
contractually required to pass `sql_validator.SQLValidator.validate()`
— the canonical 6-layer gate (multi-statement → keyword blocklist →
sqlglot AST → SELECT-only → LIMIT enforce → dangerous-function
detect). Integration + injection-rejection coverage lives in
`backend/tests/test_vizql_security_gate.py`.

## References

- `docs/Build_Tableau.md` Sections I.1-I.5 (wire-format invariants),
  III.1-III.6 (worksheet subsystem), IV.1 (compilation pipeline),
  Appendix A.1-A.8, A.14.
- `docs/analyst_pro_tableau_parity_roadmap.md` Plan 7a.
- `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7a-visualspec-ir.md`
  - the plan this README ships under.
- `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7c-sql-ast-optimizer.md`
  — Plan 7c (SQL AST + optimiser passes + security gate).

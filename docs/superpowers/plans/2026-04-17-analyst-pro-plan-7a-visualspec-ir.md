# Analyst Pro — Plan 7a: VisualSpec IR + Protobuf Schema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the canonical `VisualSpec` intermediate representation — the protobuf-wire, Python-typed, TS-typed description of a worksheet that will become the input of the VizQL compiler in Plans 7b–7e. Mirrors Tableau's `tableau.vizdataservice.v1` semantics.

**Architecture:** New protobuf schema at `backend/proto/askdb/vizdataservice/v1.proto` is the single source of truth. `protoc` + `grpcio-tools` emit Python classes to `backend/vizql/proto/v1_pb2.py`; `protoc` + `ts-proto` emit TS types to `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts`. Hand-authored ergonomic wrappers live beside the generated code: Python dataclasses in `backend/vizql/spec.py` and TS builders in `frontend/src/components/dashboard/freeform/lib/vizSpec.ts`. A `vizSpecBridge.ts` maps existing action/filter/parameter/set state into the IR without mutating the current store. A root `Makefile` target `make proto` regenerates both sides.

**Tech Stack:** Protobuf 3 (proto3 syntax); Python 3.10+ with `protobuf>=5` + `grpcio-tools>=1.62`; TypeScript 5.x with `ts-proto>=2`. No runtime protobuf dependency in the browser bundle (IR is compiled to TS types only, used structurally). Backend optional serialization uses the generated Python classes; in-process the IR travels as dataclasses.

**Scope guard.** This plan defines the IR only. No compiler, no SQL, no execution path. Plan 7b consumes `VisualSpec` and emits `LogicalOp*`. Plans 4a–4c stay in place — the bridge is read-only for now; the store does not yet serialise VisualSpec.

---

## Reference index (every task author reads before editing)

- `docs/Build_Tableau.md`:
  - §I.1 Command + Verb + Parameter triple — wire-stability rules (published typos kept: `hierachical-filter`, `paremeter-caption`, `quantitative-dmain`, `apply-relative-date-Filter`).
  - §I.2 PresModel per UI surface — `VizDataPresModel` shape.
  - §I.5 Protobuf wire format — `tableau.vizdataservice.v1` + `is_generative_ai_web_authoring` flag.
  - §III.1 Shelves — `Columns`, `Rows`, `Pages`, `Filters`, `Marks card` semantics.
  - §III.2 Marks card encodings — `EncodingType` enum + `customEncodingTypeId` escape hatch.
  - §III.3 Mark types — exact `MarkType` enum incl. `gantt-bar`, `viz-extension`.
  - §III.4 Show Me — chart recommender inputs (informs `analytics` field shape).
  - §III.5 Dual / combined / shared axis — dual-axis metadata.
  - §III.6 Measure Names / Measure Values synthetic fields.
  - §IV.1 Three-stage compilation pipeline — `VisualSpec` is stage 0.
  - §VIII.1 FilterType enum — categorical / hierarchical / range / relativeDate.
  - §VIII.2 Dimension vs Measure — `IsDisagg` flag.
  - Appendix A.1–A.8 — canonical enum names.
  - Appendix A.14 — `AggregationType`.
- `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 7a — authoritative scope.
- `QueryCopilot V1/CLAUDE.md` — `anthropic_provider.py` only place to `import anthropic`, read-only DB, 6-layer SQL validator, backend 8002 local, feature flag `FEATURE_ANALYST_PRO`.
- Prior plans — `docs/superpowers/plans/2026-04-16-analyst-pro-plan-4a-filter-injection.md` (Filter shape), `...-plan-4c-parameters-subsystem.md` (DashboardParameter), existing `frontend/src/components/dashboard/freeform/lib/setTypes.ts` (DashboardSet).

**Source-file nonexistence note.** The roadmap references `Tableau Public 2025.1/Tableau_response.md` Appendix S, which is **not** present in this repo (confirmed absent via `find -iname "Tableau_response*"`). All enum and message shapes in this plan are anchored in `docs/Build_Tableau.md` Appendix A plus the roadmap's Plan 7a section, which is authoritative per the task brief.

---

## Prerequisites

- Active branch: `askdb-global-comp`. All 8 commits land here; do not push.
- `cd "QueryCopilot V1" && git status` must be clean before Task 1.
- No prior `backend/vizql/` or `backend/proto/` directories (confirmed via `ls backend/`). Task 1 is first to create them.
- Python venv active with `backend/requirements.txt` installed.
- Node 18+ with `frontend/` `npm install` clean.
- `protoc` binary: use the `grpc_tools.protoc` Python entry point and the `ts-proto` npm binary (local via `npx`). No system `protoc` required.

---

## File Structure

**Create**

| Path | Purpose |
|---|---|
| `backend/proto/askdb/vizdataservice/v1.proto` | Canonical proto schema. Single source of truth. |
| `backend/vizql/__init__.py` | Package marker. |
| `backend/vizql/proto/__init__.py` | Package marker. |
| `backend/vizql/proto/v1_pb2.py` | Generated (committed; never hand-edited). |
| `backend/vizql/proto/v1_pb2.pyi` | Generated typing stubs (committed). |
| `backend/vizql/spec.py` | Hand-authored dataclass wrappers + `to_proto` / `from_proto`. |
| `backend/vizql/README.md` | IR reference + codegen commands. |
| `backend/tests/test_vizql_spec_roundtrip.py` | Python roundtrip tests. |
| `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts` | Generated TS types (committed; never hand-edited). |
| `frontend/src/components/dashboard/freeform/lib/vizSpec.ts` | Builders + re-exports. |
| `frontend/src/components/dashboard/freeform/lib/vizSpecBridge.ts` | Maps existing state → VisualSpec. |
| `frontend/src/components/dashboard/freeform/lib/__tests__/vizSpec.test.ts` | TS roundtrip + builder tests. |
| `frontend/src/components/dashboard/freeform/lib/__tests__/vizSpecBridge.test.ts` | Bridge unit tests. |
| `Makefile` | Root target `proto` regenerates both sides. |
| `backend/scripts/regen_proto.sh` | Python-side codegen shell command. |
| `frontend/scripts/regen_proto.sh` | TS-side codegen shell command. |

**Modify**

| Path | Change |
|---|---|
| `backend/requirements.txt` | Pin `protobuf==5.29.3`, `grpcio-tools==1.68.1`. |
| `frontend/package.json` | Add `ts-proto@2.6.1` as `devDependency`; add `"proto": "bash scripts/regen_proto.sh"` to `scripts`. |
| `.gitignore` (backend, if needed) | No change — generated files ARE committed. |
| `QueryCopilot V1/CLAUDE.md` | Add one-line reference to `make proto` under "Shared Conventions". |

---

## Task Checklist

- [ ] **T1.** Install protoc toolchains — pin backend + frontend deps; create `backend/vizql/` + `backend/proto/` scaffolding; add empty `Makefile`. Commit: `feat(analyst-pro): scaffold vizql package + protoc toolchain (Plan 7a T1)`.
- [ ] **T2.** Author canonical `v1.proto`. Commit: `feat(analyst-pro): add vizdataservice v1 protobuf schema (Plan 7a T2)`.
- [ ] **T3.** Write codegen scripts + `make proto` target; run once; commit generated files. Commit: `feat(analyst-pro): wire proto codegen for Python + TS (Plan 7a T3)`.
- [ ] **T4.** Hand-author `backend/vizql/spec.py` dataclasses + Python roundtrip tests. Commit: `feat(analyst-pro): python VisualSpec dataclasses + proto roundtrip (Plan 7a T4)`.
- [ ] **T5.** Author `frontend/.../lib/vizSpec.ts` builders + TS roundtrip tests. Commit: `feat(analyst-pro): ts VisualSpec builders + roundtrip (Plan 7a T5)`.
- [ ] **T6.** Author `vizSpecBridge.ts` mapping current store types → VisualSpec + tests. Commit: `feat(analyst-pro): bridge dashboard store state to VisualSpec IR (Plan 7a T6)`.
- [ ] **T7.** Write `backend/vizql/README.md`; add one-line reference to CLAUDE.md. Commit: `docs(analyst-pro): document vizql IR + make proto (Plan 7a T7)`.
- [ ] **T8.** Full verification — run `make proto` (idempotent), `python -m pytest tests/test_vizql_spec_roundtrip.py -v`, `npm run test:chart-ir -- vizSpec`, `npm run lint`. Commit any fixup-only changes: `chore(analyst-pro): verify Plan 7a suite green (Plan 7a T8)`.

---

## Task Specifications

### Task 1 — Scaffold the vizql package + protoc toolchain

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `frontend/package.json`
- Create: `backend/vizql/__init__.py`
- Create: `backend/vizql/proto/__init__.py`
- Create: `backend/proto/.gitkeep`
- Create: `Makefile` (at `QueryCopilot V1/Makefile`)
- Create: `backend/scripts/regen_proto.sh`
- Create: `frontend/scripts/regen_proto.sh`

- [ ] **Step 1.1: Pin Python deps**

Open `backend/requirements.txt`. Append two pinned lines below the last existing dependency (do not reorder; append at end):

```text
protobuf==5.29.3
grpcio-tools==1.68.1
```

- [ ] **Step 1.2: Install Python deps**

Run from `QueryCopilot V1/backend`:

```bash
pip install -r requirements.txt
```

Expected: both `protobuf==5.29.3` and `grpcio-tools==1.68.1` install without conflict. If pip reports a conflict with an existing pinned package, stop and surface the error — do not unpin any other dep to make this fit.

- [ ] **Step 1.3: Pin TS codegen dep**

Open `frontend/package.json`. Add to `devDependencies` (creating the block if absent) exactly:

```json
"ts-proto": "2.6.1"
```

Also add under `scripts` (after the existing `"test:chart-ir"` entry, comma-separated):

```json
"proto": "bash scripts/regen_proto.sh"
```

Example shape (locate both `scripts` and `devDependencies` — do not rename any existing key):

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:analyze": "cross-env ANALYZE=true vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test:chart-ir": "vitest run src/chart-ir/__tests__/",
    "proto": "bash scripts/regen_proto.sh"
  },
  "devDependencies": {
    "ts-proto": "2.6.1"
  }
}
```

If a `devDependencies` block already exists, merge the `"ts-proto": "2.6.1"` key into it without removing existing devDeps.

- [ ] **Step 1.4: Install TS deps**

Run from `frontend/`:

```bash
npm install
```

Expected: `ts-proto@2.6.1` present in `node_modules/.bin/protoc-gen-ts_proto`.

- [ ] **Step 1.5: Create backend package markers**

Create `backend/vizql/__init__.py` with content:

```python
"""VizQL engine package.

Plan 7a (this plan) introduces the VisualSpec IR. Plans 7b–7e add the
logical-plan port, SQL AST, dialect emitters, and query cache.
"""
```

Create `backend/vizql/proto/__init__.py` with content:

```python
"""Generated protobuf modules.

DO NOT HAND-EDIT. Regenerate via `make proto` from the repo root.
"""
```

Create `backend/proto/.gitkeep` as an empty file so the `backend/proto/` directory is tracked before Task 2 adds the `.proto` file.

- [ ] **Step 1.6: Create root Makefile**

Create `QueryCopilot V1/Makefile` with content:

```makefile
.PHONY: proto proto-py proto-ts clean-proto

# Regenerate Python + TypeScript bindings from backend/proto/*.proto.
# Idempotent — rerun after editing any .proto file.
proto: proto-py proto-ts

proto-py:
	bash backend/scripts/regen_proto.sh

proto-ts:
	bash frontend/scripts/regen_proto.sh

clean-proto:
	rm -f backend/vizql/proto/v1_pb2.py
	rm -f backend/vizql/proto/v1_pb2.pyi
	rm -f frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts
```

- [ ] **Step 1.7: Create backend regen script stub**

Create `backend/scripts/regen_proto.sh` with content (Task 3 fills the body; this step just creates the stub so `make proto` exits cleanly until then):

```bash
#!/usr/bin/env bash
# Regenerate Python bindings from backend/proto/askdb/vizdataservice/v1.proto.
# Invoked by `make proto-py`. Placeholder; populated in Plan 7a T3.
set -euo pipefail
echo "backend/scripts/regen_proto.sh: not yet implemented (Plan 7a T3 will populate)"
```

Mark executable:

```bash
chmod +x backend/scripts/regen_proto.sh
```

- [ ] **Step 1.8: Create frontend regen script stub**

Create `frontend/scripts/regen_proto.sh`:

```bash
#!/usr/bin/env bash
# Regenerate TypeScript bindings from ../backend/proto/askdb/vizdataservice/v1.proto.
# Invoked by `make proto-ts`. Placeholder; populated in Plan 7a T3.
set -euo pipefail
echo "frontend/scripts/regen_proto.sh: not yet implemented (Plan 7a T3 will populate)"
```

Mark executable:

```bash
chmod +x frontend/scripts/regen_proto.sh
```

- [ ] **Step 1.9: Sanity-check Makefile target runs**

Run from `QueryCopilot V1/`:

```bash
make proto
```

Expected output (both placeholder messages):
```
bash backend/scripts/regen_proto.sh
backend/scripts/regen_proto.sh: not yet implemented (Plan 7a T3 will populate)
bash frontend/scripts/regen_proto.sh
frontend/scripts/regen_proto.sh: not yet implemented (Plan 7a T3 will populate)
```

- [ ] **Step 1.10: Commit**

```bash
cd "QueryCopilot V1"
git add backend/requirements.txt \
        frontend/package.json frontend/package-lock.json \
        backend/vizql/__init__.py backend/vizql/proto/__init__.py \
        backend/proto/.gitkeep \
        Makefile \
        backend/scripts/regen_proto.sh frontend/scripts/regen_proto.sh
git commit -m "feat(analyst-pro): scaffold vizql package + protoc toolchain (Plan 7a T1)"
```

Note: include `frontend/package-lock.json` only if `npm install` wrote a diff.

---

### Task 2 — Author the canonical protobuf schema

**Files:**
- Create: `backend/proto/askdb/vizdataservice/v1.proto`

- [ ] **Step 2.1: Create the proto file**

Create `backend/proto/askdb/vizdataservice/v1.proto` with exactly the content below. All enum member names follow `SCREAMING_SNAKE_CASE` per proto3 convention; the wire-string mapping is retained via the hand-authored Python + TS layers in Tasks 4–5. Published Tableau typos (`hierachical-filter`, `paremeter-caption`, `quantitative-dmain`) are NOT carried into proto message names (those live in the action-verb layer, not in the spec IR) but the IR-level spelling is preserved — e.g. `RELATIVE_DATE` renders back to wire-string `relativeDate` (no space, camelCase, matching Appendix A.8).

```proto
// backend/proto/askdb/vizdataservice/v1.proto
//
// VisualSpec IR. Input to the VizQL compiler (Plans 7b–7e).
// Mirrors Tableau's tableau.vizdataservice.v1 shape as documented in
// docs/Build_Tableau.md §I.5 and Appendix A.
//
// Proto3. Field numbering is stable: never renumber, never repurpose.
// When adding fields: append with next free number, mark old as reserved
// if removed. Enum values also stable.
//
// Regenerate bindings: `make proto` from repo root.

syntax = "proto3";

package askdb.vizdataservice.v1;

// ----------------------------------------------------------------------------
// Enums (mirror docs/Build_Tableau.md Appendix A)
// ----------------------------------------------------------------------------

// A.1 DataType
enum DataType {
  DATA_TYPE_UNSPECIFIED = 0;
  DATA_TYPE_BOOL        = 1;
  DATA_TYPE_BOOLEAN     = 2;  // Tableau emits both `bool` and `boolean`
  DATA_TYPE_DATE        = 3;
  DATA_TYPE_DATE_TIME   = 4;
  DATA_TYPE_FLOAT       = 5;
  DATA_TYPE_INT         = 6;
  DATA_TYPE_NUMBER      = 7;
  DATA_TYPE_SPATIAL     = 8;
  DATA_TYPE_STRING      = 9;
  DATA_TYPE_UNKNOWN     = 10;
}

// A.2 FieldRoleType
enum FieldRole {
  FIELD_ROLE_UNSPECIFIED = 0;
  FIELD_ROLE_DIMENSION   = 1;
  FIELD_ROLE_MEASURE     = 2;
  FIELD_ROLE_UNKNOWN     = 3;
}

// A.3 ColumnClass (protobuf)
enum ColumnClass {
  COLUMN_CLASS_UNSPECIFIED     = 0;
  COLUMN_CLASS_CATEGORICAL_BIN = 1;
  COLUMN_CLASS_DANGLING        = 2;
  COLUMN_CLASS_DATABASE        = 3;
  COLUMN_CLASS_GROUP           = 4;
  COLUMN_CLASS_INSTANCE        = 5;
  COLUMN_CLASS_LOCAL_DATA      = 6;
  COLUMN_CLASS_MDX_CALC        = 7;
  COLUMN_CLASS_METADATA        = 8;
  COLUMN_CLASS_NUMERIC_BIN     = 9;
  COLUMN_CLASS_USER_CALC       = 10;
  COLUMN_CLASS_VISUAL_DATA     = 11;
}

// A.4 MarkType
enum MarkType {
  MARK_TYPE_UNSPECIFIED   = 0;
  MARK_TYPE_BAR           = 1;
  MARK_TYPE_LINE          = 2;
  MARK_TYPE_AREA          = 3;
  MARK_TYPE_PIE           = 4;
  MARK_TYPE_CIRCLE        = 5;
  MARK_TYPE_SQUARE        = 6;
  MARK_TYPE_TEXT          = 7;
  MARK_TYPE_SHAPE         = 8;
  MARK_TYPE_MAP           = 9;
  MARK_TYPE_POLYGON       = 10;
  MARK_TYPE_HEATMAP       = 11;
  MARK_TYPE_GANTT_BAR     = 12;  // wire string: "gantt-bar"
  MARK_TYPE_VIZ_EXTENSION = 13;  // wire string: "viz-extension"
}

// A.5 EncodingType
enum EncodingType {
  ENCODING_TYPE_UNSPECIFIED = 0;
  ENCODING_TYPE_COLOR       = 1;
  ENCODING_TYPE_SIZE        = 2;
  ENCODING_TYPE_SHAPE       = 3;
  ENCODING_TYPE_LABEL       = 4;
  ENCODING_TYPE_TOOLTIP     = 5;
  ENCODING_TYPE_DETAIL      = 6;
  ENCODING_TYPE_PATH        = 7;
  ENCODING_TYPE_ANGLE       = 8;
  ENCODING_TYPE_GEOMETRY    = 9;
  ENCODING_TYPE_CUSTOM      = 10;
}

// ShelfKind — from the Plan 7a brief (roadmap §Plan 7a deliverable 1).
// ROW/COLUMN are worksheet pill shelves; the marks-card channels mirror
// EncodingType but are addressed on the shelf axis (Part III.1 + III.2).
enum ShelfKind {
  SHELF_KIND_UNSPECIFIED = 0;
  SHELF_KIND_ROW         = 1;
  SHELF_KIND_COLUMN      = 2;
  SHELF_KIND_DETAIL      = 3;
  SHELF_KIND_COLOR       = 4;
  SHELF_KIND_SIZE        = 5;
  SHELF_KIND_SHAPE       = 6;
  SHELF_KIND_LABEL       = 7;
  SHELF_KIND_PATH        = 8;
  SHELF_KIND_ANGLE       = 9;
  SHELF_KIND_TOOLTIP     = 10;
}

// A.8 FilterType — 4 kinds, discriminator for FilterSpec.
enum FilterKind {
  FILTER_KIND_UNSPECIFIED   = 0;
  FILTER_KIND_CATEGORICAL   = 1;  // wire string: "categorical"
  FILTER_KIND_HIERARCHICAL  = 2;  // wire string: "hierarchical"
  FILTER_KIND_RANGE         = 3;  // wire string: "range"
  FILTER_KIND_RELATIVE_DATE = 4;  // wire string: "relativeDate"
}

// A.14 AggregationType — superset union of Appendix A.14.
enum AggType {
  AGG_TYPE_UNSPECIFIED = 0;
  AGG_TYPE_SUM         = 1;
  AGG_TYPE_AVG         = 2;
  AGG_TYPE_COUNT       = 3;
  AGG_TYPE_COUNTD      = 4;
  AGG_TYPE_MIN         = 5;
  AGG_TYPE_MAX         = 6;
  AGG_TYPE_MEDIAN      = 7;
  AGG_TYPE_VAR         = 8;
  AGG_TYPE_VARP        = 9;
  AGG_TYPE_STDEV       = 10;
  AGG_TYPE_STDEVP      = 11;
  AGG_TYPE_KURTOSIS    = 12;
  AGG_TYPE_SKEWNESS    = 13;
  AGG_TYPE_ATTR        = 14;
  AGG_TYPE_NONE        = 15;
  AGG_TYPE_PERCENTILE  = 16;
  AGG_TYPE_COLLECT     = 17;
  AGG_TYPE_IN_OUT      = 18;
  AGG_TYPE_END         = 19;
  AGG_TYPE_QUART1      = 20;
  AGG_TYPE_QUART3      = 21;
  AGG_TYPE_USER        = 22;
  // Date truncations (A.14 continuation)
  AGG_TYPE_YEAR         = 30;
  AGG_TYPE_QTR          = 31;
  AGG_TYPE_MONTH        = 32;
  AGG_TYPE_WEEK         = 33;
  AGG_TYPE_DAY          = 34;
  AGG_TYPE_HOUR         = 35;
  AGG_TYPE_MINUTE       = 36;
  AGG_TYPE_SECOND       = 37;
  AGG_TYPE_WEEKDAY      = 38;
  AGG_TYPE_MONTH_YEAR   = 39;
  AGG_TYPE_MDY          = 40;
  AGG_TYPE_TRUNC_YEAR   = 41;
  AGG_TYPE_TRUNC_QTR    = 42;
  AGG_TYPE_TRUNC_MONTH  = 43;
  AGG_TYPE_TRUNC_WEEK   = 44;
  AGG_TYPE_TRUNC_DAY    = 45;
  AGG_TYPE_TRUNC_HOUR   = 46;
  AGG_TYPE_TRUNC_MINUTE = 47;
  AGG_TYPE_TRUNC_SECOND = 48;
}

// ----------------------------------------------------------------------------
// Leaf messages
// ----------------------------------------------------------------------------

// Field reference. `id` is the stable column identifier (matches
// dashboard_tile.columns[].id on our side). `semantic_role` is optional
// (e.g. "[Geographical].[Latitude]"). `is_disagg=true` disables default
// aggregation (pill shows as dimension even for numeric fields;
// Build_Tableau §VIII.2).
message Field {
  string      id            = 1;
  DataType    data_type     = 2;
  FieldRole  role           = 3;
  string      semantic_role = 4;
  AggType     aggregation   = 5;
  bool        is_disagg     = 6;
  ColumnClass column_class  = 7;
}

// Calculation (Build_Tableau §II.3, §V). A calc field that references
// other Field ids plus a formula string. `is_adhoc=true` for pills that
// are not persisted to the workbook (e.g. typed into Column shelf).
message Calculation {
  string id        = 1;
  string formula   = 2;
  bool   is_adhoc = 3;
}

// Shelf — ordered list of Field refs placed on a given channel.
message Shelf {
  ShelfKind     kind   = 1;
  repeated Field fields = 2;
}

// Encoding — marks-card binding of a Field to an EncodingType with optional
// `custom_encoding_type_id` escape hatch (Build_Tableau §III.2 — drives
// Viz Extensions without a breaking wire change).
message Encoding {
  string       field_encoding_id       = 1;
  EncodingType encoding_type            = 2;
  string       custom_encoding_type_id = 3;  // non-empty when encoding_type=CUSTOM
  Field        field                    = 4;
}

// ----------------------------------------------------------------------------
// FilterSpec — discriminated union. The four sub-message fields are mutually
// exclusive by filter_kind. Wire encoding uses explicit fields (not `oneof`)
// to keep round-trip through intermediate JSON stable and to match the
// Tableau-side shape documented in Appendix A.8 + §VIII.1.
// ----------------------------------------------------------------------------

message CategoricalFilterProps {
  repeated string values          = 1;  // member list
  bool            is_exclude_mode = 2;
  bool            case_sensitive  = 3;
}

message HierarchicalFilterProps {
  repeated string filter_levels            = 1;  // ordered level names
  repeated string hier_val_selection_models = 2;  // serialized per-level selection
}

message RangeFilterProps {
  double min               = 1;
  double max               = 2;
  // Null-handling: "keep" (include nulls), "drop" (exclude), "only" (nulls only).
  string range_null_option = 3;
}

message RelativeDateFilterProps {
  // ISO-8601 anchor; empty = "now at query time".
  string anchor_date     = 1;
  // "years" | "quarters" | "months" | "weeks" | "days" | "hours" | "minutes"
  string period_type     = 2;
  // "last" | "next" | "current" | "toDate"
  string date_range_type = 3;
  int32  range_n         = 4;
}

message FilterSpec {
  FilterKind filter_kind = 1;

  // Targeted field.
  Field field = 2;

  // Exactly one of these is populated based on filter_kind.
  CategoricalFilterProps   categorical    = 3;
  HierarchicalFilterProps  hierarchical   = 4;
  RangeFilterProps         range          = 5;
  RelativeDateFilterProps  relative_date  = 6;

  // Null handling + level metadata shared across kinds
  // (Build_Tableau §VIII + §IV.7 filter order-of-ops).
  bool has_null                        = 7;
  bool include_null                    = 8;
  bool is_logical_table_scoped_filter  = 9;

  // Placement in the 9-stage filter pipeline (Build_Tableau §IV.7).
  // "extract" | "datasource" | "context" | "dimension" | "measure"
  // | "table_calc" | "totals". The LOD-tied stages ("fixed_lod",
  // "include_exclude_lod") are encoded separately in LodCalculation below.
  string filter_stage = 10;

  // Free-form properties bag for forward-compat (Viz Extensions, RLS).
  // Prefer adding a typed field before using this.
  map<string, string> filter_properties = 11;
}

// ----------------------------------------------------------------------------
// Parameters, LOD, Analytics
// ----------------------------------------------------------------------------

// Workbook-scoped parameter (Build_Tableau §VI). `value` carries the
// current scalar as a string; the TS/Python wrappers coerce to the
// declared `data_type`. Domain kinds: "list" | "range" | "free".
message Parameter {
  string   id           = 1;
  string   name         = 2;
  DataType data_type    = 3;
  string   value        = 4;
  string   domain_kind  = 5;
  repeated string domain_values = 6;  // when domain_kind == "list"
  double   domain_min   = 7;           // when domain_kind == "range"
  double   domain_max   = 8;           // when domain_kind == "range"
  double   domain_step  = 9;           // when domain_kind == "range"
}

// Level-of-detail calculation (Build_Tableau §V.2).
// lod_kind: "fixed" | "include" | "exclude".
message LodCalculation {
  string         id                  = 1;
  string         lod_kind            = 2;
  repeated Field lod_dims            = 3;
  Calculation    inner_calculation   = 4;
  AggType        outer_aggregation   = 5;
}

// Analytics pane slots (Build_Tableau §XIII). Extensible; plan 9 will
// typed-field these. Kept loose here so Plan 7a can serialise without
// committing to analytics shape.
message Analytics {
  // kind: "reference-line" | "reference-band" | "trend" | "forecast"
  // | "cluster" | "box-plot" | "totals"
  message Slot {
    string id      = 1;
    string kind    = 2;
    map<string, string> properties = 3;
  }
  repeated Slot slots = 1;
}

// ----------------------------------------------------------------------------
// Root message
// ----------------------------------------------------------------------------

// VisualSpec — the canonical IR.
//
// All list fields are ordered; order is load-bearing (pill placement,
// filter ordering, shelf ordering all depend on it).
//
// is_generative_ai_web_authoring mirrors Tableau's §I.5 flag. Set by any
// path that emits a VisualSpec from NL / Agent; read by audit layer and
// by the compiler (Plan 7b) to tag telemetry.
message VisualSpec {
  // Stable worksheet/sheet id (matches dashboard_tile.id on our side).
  string   sheet_id = 1;

  repeated Field          fields            = 2;  // pane-scope field catalogue
  repeated Shelf          shelves           = 3;  // pill placements
  repeated Encoding       encodings         = 4;  // marks-card bindings
  repeated FilterSpec     filters           = 5;  // full filter stack
  repeated Parameter      parameters        = 6;
  repeated LodCalculation lod_calculations  = 7;
  MarkType                mark_type         = 8;
  Analytics               analytics         = 9;

  // AI-origin marker — see Build_Tableau §I.5.
  bool   is_generative_ai_web_authoring = 10;

  // Domain emission for pivot/snowflake behaviour (Build_Tableau §IV.3).
  // "snowflake" | "separate". Default "separate".
  string domain_type = 11;

  // Reserved for dual-axis metadata (Plan 7b fills in).
  reserved 12, 13, 14;
  reserved "dual_axis", "shared_axis", "combined_axis";
}
```

- [ ] **Step 2.2: Syntax-check the proto**

Run from `QueryCopilot V1/backend/`:

```bash
python -c "from grpc_tools import protoc; import sys; \
sys.exit(protoc.main(['--proto_path=proto', '--descriptor_set_out=/tmp/askdb_v1.desc', 'proto/askdb/vizdataservice/v1.proto']))"
```

Expected: exit code 0, `/tmp/askdb_v1.desc` written. On Windows, swap `/tmp/askdb_v1.desc` for `%TEMP%\askdb_v1.desc` — use a bash shell (Git Bash or WSL) per `CLAUDE.md` shell guidance.

- [ ] **Step 2.3: Commit**

```bash
cd "QueryCopilot V1"
git add backend/proto/askdb/vizdataservice/v1.proto
git commit -m "feat(analyst-pro): add vizdataservice v1 protobuf schema (Plan 7a T2)"
```

---

### Task 3 — Wire codegen for Python + TS

**Files:**
- Modify: `backend/scripts/regen_proto.sh`
- Modify: `frontend/scripts/regen_proto.sh`
- Create: `backend/vizql/proto/v1_pb2.py` (generated — committed)
- Create: `backend/vizql/proto/v1_pb2.pyi` (generated — committed)
- Create: `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts` (generated — committed)

- [ ] **Step 3.1: Populate backend regen script**

Overwrite `backend/scripts/regen_proto.sh` with:

```bash
#!/usr/bin/env bash
# Regenerate Python bindings from backend/proto/askdb/vizdataservice/v1.proto.
# Run via `make proto-py`. Writes to backend/vizql/proto/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

OUT_DIR="vizql/proto"
PROTO_DIR="proto"
PROTO_FILE="proto/askdb/vizdataservice/v1.proto"

mkdir -p "$OUT_DIR"

python -m grpc_tools.protoc \
  --proto_path="$PROTO_DIR" \
  --python_out="$OUT_DIR" \
  --pyi_out="$OUT_DIR" \
  "$PROTO_FILE"

# The generator writes to $OUT_DIR/askdb/vizdataservice/v1_pb2.py because
# it mirrors the proto's package path. Flatten to $OUT_DIR/v1_pb2.py so
# imports stay `from backend.vizql.proto import v1_pb2`.
GENERATED="$OUT_DIR/askdb/vizdataservice/v1_pb2.py"
GENERATED_PYI="$OUT_DIR/askdb/vizdataservice/v1_pb2.pyi"

if [ -f "$GENERATED" ]; then
  mv "$GENERATED" "$OUT_DIR/v1_pb2.py"
fi
if [ -f "$GENERATED_PYI" ]; then
  mv "$GENERATED_PYI" "$OUT_DIR/v1_pb2.pyi"
fi

# Clean intermediate package dirs created by the generator.
rm -rf "$OUT_DIR/askdb"

# Replace the now-broken import inside v1_pb2.py with a flat name so the
# flattened layout imports cleanly.
# grpcio-tools writes: from askdb.vizdataservice import ... (none expected
# here since we have a single file, but guard anyway).
python - <<'PY'
import pathlib, re
p = pathlib.Path("vizql/proto/v1_pb2.py")
src = p.read_text(encoding="utf-8")
src = re.sub(r"^from askdb\\.vizdataservice import .*$", "", src, flags=re.M)
p.write_text(src, encoding="utf-8")
PY

echo "backend/scripts/regen_proto.sh: wrote $OUT_DIR/v1_pb2.py + v1_pb2.pyi"
```

- [ ] **Step 3.2: Run backend codegen**

From `QueryCopilot V1/`:

```bash
make proto-py
```

Expected: `backend/vizql/proto/v1_pb2.py` and `backend/vizql/proto/v1_pb2.pyi` present. Smoke-check:

```bash
cd backend && python -c "from vizql.proto import v1_pb2; spec = v1_pb2.VisualSpec(sheet_id='s1'); print(spec.SerializeToString())"
```

Expected: prints a non-empty bytes literal (at minimum the `sheet_id` encoded field).

- [ ] **Step 3.3: Populate frontend regen script**

Overwrite `frontend/scripts/regen_proto.sh` with:

```bash
#!/usr/bin/env bash
# Regenerate TypeScript bindings from ../backend/proto/askdb/vizdataservice/v1.proto.
# Run via `make proto-ts` or `npm run proto`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

OUT_FILE="src/components/dashboard/freeform/lib/vizSpecGenerated.ts"
PROTO_DIR="../backend/proto"
PROTO_FILE="../backend/proto/askdb/vizdataservice/v1.proto"

# Generate into a temp dir, then move to the flat output name so the
# single-file emit matches our import path.
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

npx --yes protoc \
  --plugin=protoc-gen-ts_proto="./node_modules/.bin/protoc-gen-ts_proto" \
  --ts_proto_out="$TMP_DIR" \
  --ts_proto_opt=esModuleInterop=true,forceLong=string,useOptionals=messages,outputEncodeMethods=true,outputJsonMethods=true,outputClientImpl=false,unrecognizedEnum=false \
  --proto_path="$PROTO_DIR" \
  "$PROTO_FILE"

# Generator path mirrors package: askdb/vizdataservice/v1.ts.
GENERATED="$TMP_DIR/askdb/vizdataservice/v1.ts"
if [ ! -f "$GENERATED" ]; then
  echo "ERROR: expected generator output at $GENERATED" >&2
  exit 1
fi

# Prepend a do-not-edit header.
{
  echo "/**"
  echo " * GENERATED FILE — do not hand-edit."
  echo " * Regenerate via \`make proto\` from repo root."
  echo " * Source: backend/proto/askdb/vizdataservice/v1.proto"
  echo " */"
  echo ""
  cat "$GENERATED"
} > "$OUT_FILE"

echo "frontend/scripts/regen_proto.sh: wrote $OUT_FILE"
```

Note: if the environment has no system `protoc` binary, `npx protoc` will fail. Install the `protoc` binary (`brew install protobuf` on mac, `apt install protobuf-compiler` on linux, `choco install protoc` on Windows). Document this in the README (Task 7). If CI picks this up, add `protoc` to the CI image.

- [ ] **Step 3.4: Run frontend codegen**

From `QueryCopilot V1/`:

```bash
make proto-ts
```

Expected: `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts` present, starts with the "GENERATED FILE" header. Smoke-check — open the file and grep for `export interface VisualSpec`:

```bash
grep -c "export interface VisualSpec" frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts
```

Expected: `1`.

- [ ] **Step 3.5: Verify frontend type-check does not regress**

Run from `frontend/`:

```bash
npm run lint
```

Expected: zero new lint errors attributable to `vizSpecGenerated.ts`. The file is generated — if lint complains about it, add it to `eslint.config.js` ignore list as part of this step (append `'src/components/dashboard/freeform/lib/vizSpecGenerated.ts'` to the `ignores` array in `eslint.config.js`).

- [ ] **Step 3.6: Verify `make proto` is idempotent**

Run `make proto` twice back-to-back. `git status` after the second run must show zero diff relative to the first. If diff appears, the script is non-deterministic — fix (typically an un-sorted import, timestamp, or UUID) before continuing.

- [ ] **Step 3.7: Commit**

```bash
cd "QueryCopilot V1"
git add backend/scripts/regen_proto.sh \
        frontend/scripts/regen_proto.sh \
        backend/vizql/proto/v1_pb2.py \
        backend/vizql/proto/v1_pb2.pyi \
        frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts \
        frontend/eslint.config.js
git commit -m "feat(analyst-pro): wire proto codegen for Python + TS (Plan 7a T3)"
```

(Omit `frontend/eslint.config.js` from the add if Step 3.5 found no lint complaints and you did not modify it.)

---

### Task 4 — Python dataclass wrappers + proto roundtrip

**Files:**
- Create: `backend/vizql/spec.py`
- Create: `backend/tests/test_vizql_spec_roundtrip.py`

- [ ] **Step 4.1: Author the dataclass wrapper**

Create `backend/vizql/spec.py` with:

```python
"""VisualSpec dataclass wrappers + protobuf round-trip.

The protobuf types generated at ``backend/vizql/proto/v1_pb2.py`` are the
wire format. Python code in the agent / compiler / tests works against
these ergonomic dataclasses, then serialises through ``to_proto`` when
crossing a wire boundary.

Design rules:

* Dataclasses mirror the proto messages 1:1.
* Enum values are the generated IntEnum-like classes from v1_pb2, not
  strings (keeps field_kind-sensitive branches tight).
* ``to_proto`` and ``from_proto`` are the *only* places that convert —
  callers never touch ``v1_pb2`` messages directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from backend.vizql.proto import v1_pb2 as pb

# Re-export enums so callers get a stable import path.
DataType = pb.DataType
FieldRole = pb.FieldRole
ColumnClass = pb.ColumnClass
MarkType = pb.MarkType
EncodingType = pb.EncodingType
ShelfKind = pb.ShelfKind
FilterKind = pb.FilterKind
AggType = pb.AggType


@dataclass
class Field:
    id: str
    data_type: int = DataType.DATA_TYPE_UNSPECIFIED
    role: int = FieldRole.FIELD_ROLE_UNSPECIFIED
    semantic_role: str = ""
    aggregation: int = AggType.AGG_TYPE_UNSPECIFIED
    is_disagg: bool = False
    column_class: int = ColumnClass.COLUMN_CLASS_UNSPECIFIED

    def to_proto(self) -> pb.Field:
        return pb.Field(
            id=self.id,
            data_type=self.data_type,
            role=self.role,
            semantic_role=self.semantic_role,
            aggregation=self.aggregation,
            is_disagg=self.is_disagg,
            column_class=self.column_class,
        )

    @classmethod
    def from_proto(cls, m: pb.Field) -> "Field":
        return cls(
            id=m.id,
            data_type=m.data_type,
            role=m.role,
            semantic_role=m.semantic_role,
            aggregation=m.aggregation,
            is_disagg=m.is_disagg,
            column_class=m.column_class,
        )


@dataclass
class Calculation:
    id: str
    formula: str
    is_adhoc: bool = False

    def to_proto(self) -> pb.Calculation:
        return pb.Calculation(id=self.id, formula=self.formula, is_adhoc=self.is_adhoc)

    @classmethod
    def from_proto(cls, m: pb.Calculation) -> "Calculation":
        return cls(id=m.id, formula=m.formula, is_adhoc=m.is_adhoc)


@dataclass
class Shelf:
    kind: int
    fields: list[Field] = field(default_factory=list)

    def to_proto(self) -> pb.Shelf:
        return pb.Shelf(kind=self.kind, fields=[f.to_proto() for f in self.fields])

    @classmethod
    def from_proto(cls, m: pb.Shelf) -> "Shelf":
        return cls(kind=m.kind, fields=[Field.from_proto(f) for f in m.fields])


@dataclass
class Encoding:
    field_encoding_id: str
    encoding_type: int
    field: Field
    custom_encoding_type_id: str = ""

    def to_proto(self) -> pb.Encoding:
        return pb.Encoding(
            field_encoding_id=self.field_encoding_id,
            encoding_type=self.encoding_type,
            custom_encoding_type_id=self.custom_encoding_type_id,
            field=self.field.to_proto(),
        )

    @classmethod
    def from_proto(cls, m: pb.Encoding) -> "Encoding":
        return cls(
            field_encoding_id=m.field_encoding_id,
            encoding_type=m.encoding_type,
            custom_encoding_type_id=m.custom_encoding_type_id,
            field=Field.from_proto(m.field),
        )


@dataclass
class CategoricalFilterProps:
    values: list[str] = field(default_factory=list)
    is_exclude_mode: bool = False
    case_sensitive: bool = True


@dataclass
class HierarchicalFilterProps:
    filter_levels: list[str] = field(default_factory=list)
    hier_val_selection_models: list[str] = field(default_factory=list)


@dataclass
class RangeFilterProps:
    min: float = 0.0
    max: float = 0.0
    range_null_option: str = "keep"  # "keep" | "drop" | "only"


@dataclass
class RelativeDateFilterProps:
    anchor_date: str = ""
    period_type: str = ""
    date_range_type: str = ""
    range_n: int = 0


@dataclass
class FilterSpec:
    filter_kind: int
    field: Field
    categorical: CategoricalFilterProps | None = None
    hierarchical: HierarchicalFilterProps | None = None
    range: RangeFilterProps | None = None
    relative_date: RelativeDateFilterProps | None = None
    has_null: bool = False
    include_null: bool = False
    is_logical_table_scoped_filter: bool = False
    filter_stage: str = "dimension"  # Build_Tableau §IV.7
    filter_properties: dict[str, str] = field(default_factory=dict)

    def to_proto(self) -> pb.FilterSpec:
        out = pb.FilterSpec(
            filter_kind=self.filter_kind,
            field=self.field.to_proto(),
            has_null=self.has_null,
            include_null=self.include_null,
            is_logical_table_scoped_filter=self.is_logical_table_scoped_filter,
            filter_stage=self.filter_stage,
        )
        for k, v in self.filter_properties.items():
            out.filter_properties[k] = v
        if self.categorical is not None:
            out.categorical.CopyFrom(pb.CategoricalFilterProps(
                values=list(self.categorical.values),
                is_exclude_mode=self.categorical.is_exclude_mode,
                case_sensitive=self.categorical.case_sensitive,
            ))
        if self.hierarchical is not None:
            out.hierarchical.CopyFrom(pb.HierarchicalFilterProps(
                filter_levels=list(self.hierarchical.filter_levels),
                hier_val_selection_models=list(self.hierarchical.hier_val_selection_models),
            ))
        if self.range is not None:
            out.range.CopyFrom(pb.RangeFilterProps(
                min=self.range.min,
                max=self.range.max,
                range_null_option=self.range.range_null_option,
            ))
        if self.relative_date is not None:
            out.relative_date.CopyFrom(pb.RelativeDateFilterProps(
                anchor_date=self.relative_date.anchor_date,
                period_type=self.relative_date.period_type,
                date_range_type=self.relative_date.date_range_type,
                range_n=self.relative_date.range_n,
            ))
        return out

    @classmethod
    def from_proto(cls, m: pb.FilterSpec) -> "FilterSpec":
        return cls(
            filter_kind=m.filter_kind,
            field=Field.from_proto(m.field),
            has_null=m.has_null,
            include_null=m.include_null,
            is_logical_table_scoped_filter=m.is_logical_table_scoped_filter,
            filter_stage=m.filter_stage,
            filter_properties=dict(m.filter_properties),
            categorical=(
                CategoricalFilterProps(
                    values=list(m.categorical.values),
                    is_exclude_mode=m.categorical.is_exclude_mode,
                    case_sensitive=m.categorical.case_sensitive,
                )
                if m.HasField("categorical")
                else None
            ),
            hierarchical=(
                HierarchicalFilterProps(
                    filter_levels=list(m.hierarchical.filter_levels),
                    hier_val_selection_models=list(m.hierarchical.hier_val_selection_models),
                )
                if m.HasField("hierarchical")
                else None
            ),
            range=(
                RangeFilterProps(
                    min=m.range.min,
                    max=m.range.max,
                    range_null_option=m.range.range_null_option,
                )
                if m.HasField("range")
                else None
            ),
            relative_date=(
                RelativeDateFilterProps(
                    anchor_date=m.relative_date.anchor_date,
                    period_type=m.relative_date.period_type,
                    date_range_type=m.relative_date.date_range_type,
                    range_n=m.relative_date.range_n,
                )
                if m.HasField("relative_date")
                else None
            ),
        )


@dataclass
class Parameter:
    id: str
    name: str
    data_type: int
    value: str
    domain_kind: str = "free"  # "list" | "range" | "free"
    domain_values: list[str] = field(default_factory=list)
    domain_min: float = 0.0
    domain_max: float = 0.0
    domain_step: float = 0.0

    def to_proto(self) -> pb.Parameter:
        return pb.Parameter(
            id=self.id,
            name=self.name,
            data_type=self.data_type,
            value=self.value,
            domain_kind=self.domain_kind,
            domain_values=list(self.domain_values),
            domain_min=self.domain_min,
            domain_max=self.domain_max,
            domain_step=self.domain_step,
        )

    @classmethod
    def from_proto(cls, m: pb.Parameter) -> "Parameter":
        return cls(
            id=m.id,
            name=m.name,
            data_type=m.data_type,
            value=m.value,
            domain_kind=m.domain_kind,
            domain_values=list(m.domain_values),
            domain_min=m.domain_min,
            domain_max=m.domain_max,
            domain_step=m.domain_step,
        )


@dataclass
class LodCalculation:
    id: str
    lod_kind: str  # "fixed" | "include" | "exclude"
    lod_dims: list[Field] = field(default_factory=list)
    inner_calculation: Calculation | None = None
    outer_aggregation: int = AggType.AGG_TYPE_SUM

    def to_proto(self) -> pb.LodCalculation:
        out = pb.LodCalculation(
            id=self.id,
            lod_kind=self.lod_kind,
            lod_dims=[d.to_proto() for d in self.lod_dims],
            outer_aggregation=self.outer_aggregation,
        )
        if self.inner_calculation is not None:
            out.inner_calculation.CopyFrom(self.inner_calculation.to_proto())
        return out

    @classmethod
    def from_proto(cls, m: pb.LodCalculation) -> "LodCalculation":
        return cls(
            id=m.id,
            lod_kind=m.lod_kind,
            lod_dims=[Field.from_proto(d) for d in m.lod_dims],
            inner_calculation=(
                Calculation.from_proto(m.inner_calculation)
                if m.HasField("inner_calculation")
                else None
            ),
            outer_aggregation=m.outer_aggregation,
        )


@dataclass
class AnalyticsSlot:
    id: str
    kind: str
    properties: dict[str, str] = field(default_factory=dict)


@dataclass
class Analytics:
    slots: list[AnalyticsSlot] = field(default_factory=list)

    def to_proto(self) -> pb.Analytics:
        out = pb.Analytics()
        for s in self.slots:
            slot = out.slots.add()
            slot.id = s.id
            slot.kind = s.kind
            for k, v in s.properties.items():
                slot.properties[k] = v
        return out

    @classmethod
    def from_proto(cls, m: pb.Analytics) -> "Analytics":
        return cls(
            slots=[
                AnalyticsSlot(id=s.id, kind=s.kind, properties=dict(s.properties))
                for s in m.slots
            ],
        )


@dataclass
class VisualSpec:
    sheet_id: str
    fields: list[Field] = field(default_factory=list)
    shelves: list[Shelf] = field(default_factory=list)
    encodings: list[Encoding] = field(default_factory=list)
    filters: list[FilterSpec] = field(default_factory=list)
    parameters: list[Parameter] = field(default_factory=list)
    lod_calculations: list[LodCalculation] = field(default_factory=list)
    mark_type: int = MarkType.MARK_TYPE_UNSPECIFIED
    analytics: Analytics = field(default_factory=Analytics)
    is_generative_ai_web_authoring: bool = False
    domain_type: str = "separate"  # "separate" | "snowflake"

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
        )

    def serialize(self) -> bytes:
        return self.to_proto().SerializeToString()

    @classmethod
    def deserialize(cls, data: bytes) -> "VisualSpec":
        m = pb.VisualSpec()
        m.ParseFromString(data)
        return cls.from_proto(m)


__all__ = [
    # enums
    "DataType", "FieldRole", "ColumnClass", "MarkType", "EncodingType",
    "ShelfKind", "FilterKind", "AggType",
    # messages
    "Field", "Calculation", "Shelf", "Encoding",
    "CategoricalFilterProps", "HierarchicalFilterProps",
    "RangeFilterProps", "RelativeDateFilterProps", "FilterSpec",
    "Parameter", "LodCalculation", "AnalyticsSlot", "Analytics",
    "VisualSpec",
]
```

- [ ] **Step 4.2: Write the failing roundtrip test**

Create `backend/tests/test_vizql_spec_roundtrip.py` with:

```python
"""Plan 7a — VisualSpec protobuf roundtrip.

Covers every message type in backend/vizql/spec.py. Each test constructs
a fully-populated instance, serialises to bytes, deserialises, and
compares structurally. Also pins canonical enum values against
docs/Build_Tableau.md Appendix A.
"""

from __future__ import annotations

import pytest

from backend.vizql import spec
from backend.vizql.proto import v1_pb2 as pb


def make_field(fid: str = "orders.total") -> spec.Field:
    return spec.Field(
        id=fid,
        data_type=spec.DataType.DATA_TYPE_NUMBER,
        role=spec.FieldRole.FIELD_ROLE_MEASURE,
        semantic_role="",
        aggregation=spec.AggType.AGG_TYPE_SUM,
        is_disagg=False,
        column_class=spec.ColumnClass.COLUMN_CLASS_DATABASE,
    )


def test_field_roundtrip():
    f = make_field()
    assert spec.Field.from_proto(f.to_proto()) == f


def test_calculation_roundtrip():
    c = spec.Calculation(id="calc1", formula="SUM([total])/COUNT([order_id])", is_adhoc=True)
    assert spec.Calculation.from_proto(c.to_proto()) == c


def test_shelf_roundtrip_preserves_order():
    s = spec.Shelf(
        kind=spec.ShelfKind.SHELF_KIND_COLUMN,
        fields=[make_field("a"), make_field("b"), make_field("c")],
    )
    rt = spec.Shelf.from_proto(s.to_proto())
    assert [f.id for f in rt.fields] == ["a", "b", "c"]
    assert rt.kind == spec.ShelfKind.SHELF_KIND_COLUMN


def test_encoding_roundtrip_custom_id_preserved():
    e = spec.Encoding(
        field_encoding_id="enc1",
        encoding_type=spec.EncodingType.ENCODING_TYPE_CUSTOM,
        field=make_field(),
        custom_encoding_type_id="org.askdb.treemap.v1",
    )
    rt = spec.Encoding.from_proto(e.to_proto())
    assert rt.custom_encoding_type_id == "org.askdb.treemap.v1"
    assert rt.encoding_type == spec.EncodingType.ENCODING_TYPE_CUSTOM


@pytest.mark.parametrize("kind,props_attr,props_obj", [
    (
        spec.FilterKind.FILTER_KIND_CATEGORICAL,
        "categorical",
        spec.CategoricalFilterProps(values=["NY", "CA"], is_exclude_mode=True, case_sensitive=False),
    ),
    (
        spec.FilterKind.FILTER_KIND_HIERARCHICAL,
        "hierarchical",
        spec.HierarchicalFilterProps(filter_levels=["country", "state"], hier_val_selection_models=["{}"]),
    ),
    (
        spec.FilterKind.FILTER_KIND_RANGE,
        "range",
        spec.RangeFilterProps(min=0.0, max=100.0, range_null_option="drop"),
    ),
    (
        spec.FilterKind.FILTER_KIND_RELATIVE_DATE,
        "relative_date",
        spec.RelativeDateFilterProps(anchor_date="2026-04-17", period_type="days", date_range_type="last", range_n=30),
    ),
])
def test_filter_spec_roundtrip_each_kind(kind, props_attr, props_obj):
    fs = spec.FilterSpec(
        filter_kind=kind,
        field=make_field(),
        has_null=True,
        include_null=False,
        is_logical_table_scoped_filter=True,
        filter_stage="context",
        filter_properties={"apply-to-totals": "true"},
        **{props_attr: props_obj},
    )
    rt = spec.FilterSpec.from_proto(fs.to_proto())
    assert rt.filter_kind == kind
    assert rt.has_null is True
    assert rt.filter_stage == "context"
    assert rt.filter_properties == {"apply-to-totals": "true"}
    assert getattr(rt, props_attr) == props_obj
    # Non-active variants remain None
    for other in ("categorical", "hierarchical", "range", "relative_date"):
        if other == props_attr:
            continue
        assert getattr(rt, other) is None, f"{other} should be None when kind={kind}"


def test_parameter_roundtrip_all_domain_kinds():
    for domain_kind in ("list", "range", "free"):
        p = spec.Parameter(
            id="p1",
            name="Region",
            data_type=spec.DataType.DATA_TYPE_STRING,
            value="NY",
            domain_kind=domain_kind,
            domain_values=["NY", "CA"] if domain_kind == "list" else [],
            domain_min=0.0 if domain_kind != "range" else 1.0,
            domain_max=0.0 if domain_kind != "range" else 100.0,
            domain_step=0.0 if domain_kind != "range" else 1.0,
        )
        assert spec.Parameter.from_proto(p.to_proto()) == p


def test_lod_calculation_roundtrip():
    l = spec.LodCalculation(
        id="lod1",
        lod_kind="fixed",
        lod_dims=[make_field("region"), make_field("year")],
        inner_calculation=spec.Calculation(id="inner", formula="SUM([sales])"),
        outer_aggregation=spec.AggType.AGG_TYPE_AVG,
    )
    rt = spec.LodCalculation.from_proto(l.to_proto())
    assert rt == l


def test_analytics_roundtrip_preserves_slot_properties():
    a = spec.Analytics(slots=[
        spec.AnalyticsSlot(id="ref1", kind="reference-line", properties={"value": "10", "axis": "y"}),
        spec.AnalyticsSlot(id="trend1", kind="trend", properties={"model": "linear"}),
    ])
    rt = spec.Analytics.from_proto(a.to_proto())
    assert rt == a


def test_visual_spec_full_roundtrip():
    v = spec.VisualSpec(
        sheet_id="sheet-1",
        fields=[make_field("a"), make_field("b")],
        shelves=[spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[make_field("a")])],
        encodings=[spec.Encoding(
            field_encoding_id="e1",
            encoding_type=spec.EncodingType.ENCODING_TYPE_COLOR,
            field=make_field("b"),
        )],
        filters=[spec.FilterSpec(
            filter_kind=spec.FilterKind.FILTER_KIND_CATEGORICAL,
            field=make_field("region"),
            categorical=spec.CategoricalFilterProps(values=["NY"]),
            filter_stage="dimension",
        )],
        parameters=[spec.Parameter(
            id="p1", name="Year", data_type=spec.DataType.DATA_TYPE_INT, value="2026",
            domain_kind="range", domain_min=2020.0, domain_max=2030.0, domain_step=1.0,
        )],
        lod_calculations=[],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        analytics=spec.Analytics(),
        is_generative_ai_web_authoring=True,
        domain_type="snowflake",
    )
    payload = v.serialize()
    assert isinstance(payload, bytes)
    assert len(payload) > 0
    rt = spec.VisualSpec.deserialize(payload)
    assert rt == v


def test_is_generative_ai_web_authoring_flag_default_false():
    v = spec.VisualSpec(sheet_id="s1")
    assert v.is_generative_ai_web_authoring is False
    rt = spec.VisualSpec.deserialize(v.serialize())
    assert rt.is_generative_ai_web_authoring is False


def test_enum_canonical_values_pinned_to_appendix_a():
    """Pin canonical integer tags so regenerated protos never silently renumber."""
    # A.1 DataType
    assert pb.DataType.DATA_TYPE_BOOL == 1
    assert pb.DataType.DATA_TYPE_STRING == 9
    # A.4 MarkType
    assert pb.MarkType.MARK_TYPE_VIZ_EXTENSION == 13
    # A.5 EncodingType
    assert pb.EncodingType.ENCODING_TYPE_CUSTOM == 10
    # A.8 FilterKind
    assert pb.FilterKind.FILTER_KIND_RELATIVE_DATE == 4
    # A.14 AggType — date truncations occupy 30+ range
    assert pb.AggType.AGG_TYPE_TRUNC_YEAR == 41
    assert pb.AggType.AGG_TYPE_TRUNC_SECOND == 48


def test_empty_spec_serialises_and_deserialises():
    v = spec.VisualSpec(sheet_id="")
    rt = spec.VisualSpec.deserialize(v.serialize())
    assert rt.sheet_id == ""
    assert rt.fields == []
    assert rt.mark_type == spec.MarkType.MARK_TYPE_UNSPECIFIED
```

- [ ] **Step 4.3: Run the tests**

From `QueryCopilot V1/backend`:

```bash
python -m pytest tests/test_vizql_spec_roundtrip.py -v
```

Expected: all ~15 test functions PASS (parametrized test expands to 4 cases). If any FAIL, the most likely cause is that `backend/vizql/spec.py` uses a qualified import path mismatching the generated module — fix the import in `spec.py`, not the test.

- [ ] **Step 4.4: Confirm no other tests regress**

```bash
python -m pytest tests/ -v
```

Expected: full suite still green. The full suite must include the new tests now, increasing the previously reported 516 count by the number of parametrized cases (>= 15 new assertions).

- [ ] **Step 4.5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/vizql/spec.py backend/tests/test_vizql_spec_roundtrip.py
git commit -m "feat(analyst-pro): python VisualSpec dataclasses + proto roundtrip (Plan 7a T4)"
```

---

### Task 5 — TS builders + roundtrip

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/vizSpec.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/vizSpec.test.ts`

- [ ] **Step 5.1: Author the TS wrapper**

Create `frontend/src/components/dashboard/freeform/lib/vizSpec.ts` with:

```ts
/**
 * VisualSpec IR — hand-authored builders + re-exports over the
 * generated protobuf types in ./vizSpecGenerated.
 *
 * App code never imports ./vizSpecGenerated directly — always via
 * this module so we can add ergonomic defaults + guard invariants in
 * one place (e.g. `makeVisualSpec` seeds an empty Analytics object).
 *
 * Protobuf round-trip lives in the __tests__ suite. The browser bundle
 * does NOT ship the protobuf runtime; server boundaries either use JSON
 * (via `VisualSpec.toJSON` / `.fromJSON` from the generated module) or
 * the Python side owns serialisation.
 */

import {
  VisualSpec as PbVisualSpec,
  Field as PbField,
  Shelf as PbShelf,
  Encoding as PbEncoding,
  FilterSpec as PbFilterSpec,
  Parameter as PbParameter,
  LodCalculation as PbLodCalculation,
  Analytics as PbAnalytics,
  Calculation as PbCalculation,
  CategoricalFilterProps as PbCategoricalFilterProps,
  HierarchicalFilterProps as PbHierarchicalFilterProps,
  RangeFilterProps as PbRangeFilterProps,
  RelativeDateFilterProps as PbRelativeDateFilterProps,
  DataType,
  FieldRole,
  ColumnClass,
  MarkType,
  EncodingType,
  ShelfKind,
  FilterKind,
  AggType,
} from './vizSpecGenerated';

// Re-export generated types under their natural names for app code.
export type VisualSpec = PbVisualSpec;
export type Field = PbField;
export type Shelf = PbShelf;
export type Encoding = PbEncoding;
export type FilterSpec = PbFilterSpec;
export type Parameter = PbParameter;
export type LodCalculation = PbLodCalculation;
export type Analytics = PbAnalytics;
export type Calculation = PbCalculation;
export type CategoricalFilterProps = PbCategoricalFilterProps;
export type HierarchicalFilterProps = PbHierarchicalFilterProps;
export type RangeFilterProps = PbRangeFilterProps;
export type RelativeDateFilterProps = PbRelativeDateFilterProps;

export {
  DataType,
  FieldRole,
  ColumnClass,
  MarkType,
  EncodingType,
  ShelfKind,
  FilterKind,
  AggType,
};

// --- Builders (return fully-populated defaults; all fields explicit). --------

export function makeField(init: Partial<Field> & { id: string }): Field {
  return {
    id: init.id,
    dataType: init.dataType ?? DataType.DATA_TYPE_UNSPECIFIED,
    role: init.role ?? FieldRole.FIELD_ROLE_UNSPECIFIED,
    semanticRole: init.semanticRole ?? '',
    aggregation: init.aggregation ?? AggType.AGG_TYPE_UNSPECIFIED,
    isDisagg: init.isDisagg ?? false,
    columnClass: init.columnClass ?? ColumnClass.COLUMN_CLASS_UNSPECIFIED,
  };
}

export function makeShelf(kind: ShelfKind, fields: Field[] = []): Shelf {
  return { kind, fields };
}

export function makeEncoding(init: {
  fieldEncodingId: string;
  encodingType: EncodingType;
  field: Field;
  customEncodingTypeId?: string;
}): Encoding {
  return {
    fieldEncodingId: init.fieldEncodingId,
    encodingType: init.encodingType,
    customEncodingTypeId: init.customEncodingTypeId ?? '',
    field: init.field,
  };
}

export function makeCategoricalFilter(init: {
  field: Field;
  values: string[];
  isExcludeMode?: boolean;
  caseSensitive?: boolean;
  filterStage?: string;
}): FilterSpec {
  return {
    filterKind: FilterKind.FILTER_KIND_CATEGORICAL,
    field: init.field,
    categorical: {
      values: init.values,
      isExcludeMode: init.isExcludeMode ?? false,
      caseSensitive: init.caseSensitive ?? true,
    },
    hierarchical: undefined,
    range: undefined,
    relativeDate: undefined,
    hasNull: false,
    includeNull: false,
    isLogicalTableScopedFilter: false,
    filterStage: init.filterStage ?? 'dimension',
    filterProperties: {},
  };
}

export function makeRangeFilter(init: {
  field: Field;
  min: number;
  max: number;
  rangeNullOption?: 'keep' | 'drop' | 'only';
  filterStage?: string;
}): FilterSpec {
  return {
    filterKind: FilterKind.FILTER_KIND_RANGE,
    field: init.field,
    categorical: undefined,
    hierarchical: undefined,
    range: {
      min: init.min,
      max: init.max,
      rangeNullOption: init.rangeNullOption ?? 'keep',
    },
    relativeDate: undefined,
    hasNull: false,
    includeNull: false,
    isLogicalTableScopedFilter: false,
    filterStage: init.filterStage ?? 'dimension',
    filterProperties: {},
  };
}

export function makeRelativeDateFilter(init: {
  field: Field;
  periodType: string;
  dateRangeType: string;
  rangeN: number;
  anchorDate?: string;
  filterStage?: string;
}): FilterSpec {
  return {
    filterKind: FilterKind.FILTER_KIND_RELATIVE_DATE,
    field: init.field,
    categorical: undefined,
    hierarchical: undefined,
    range: undefined,
    relativeDate: {
      anchorDate: init.anchorDate ?? '',
      periodType: init.periodType,
      dateRangeType: init.dateRangeType,
      rangeN: init.rangeN,
    },
    hasNull: false,
    includeNull: false,
    isLogicalTableScopedFilter: false,
    filterStage: init.filterStage ?? 'dimension',
    filterProperties: {},
  };
}

export function makeParameter(init: {
  id: string;
  name: string;
  dataType: DataType;
  value: string;
  domainKind?: 'list' | 'range' | 'free';
  domainValues?: string[];
  domainMin?: number;
  domainMax?: number;
  domainStep?: number;
}): Parameter {
  return {
    id: init.id,
    name: init.name,
    dataType: init.dataType,
    value: init.value,
    domainKind: init.domainKind ?? 'free',
    domainValues: init.domainValues ?? [],
    domainMin: init.domainMin ?? 0,
    domainMax: init.domainMax ?? 0,
    domainStep: init.domainStep ?? 0,
  };
}

export function makeVisualSpec(init: Partial<VisualSpec> & { sheetId: string }): VisualSpec {
  return {
    sheetId: init.sheetId,
    fields: init.fields ?? [],
    shelves: init.shelves ?? [],
    encodings: init.encodings ?? [],
    filters: init.filters ?? [],
    parameters: init.parameters ?? [],
    lodCalculations: init.lodCalculations ?? [],
    markType: init.markType ?? MarkType.MARK_TYPE_UNSPECIFIED,
    analytics: init.analytics ?? { slots: [] },
    isGenerativeAiWebAuthoring: init.isGenerativeAiWebAuthoring ?? false,
    domainType: init.domainType ?? 'separate',
  };
}

/**
 * JSON roundtrip via the generated `fromJSON` / `toJSON` — stable, no
 * protobuf runtime needed. The underlying helpers come from ts-proto
 * codegen with outputJsonMethods=true.
 */
export function toJSON(v: VisualSpec): unknown {
  return PbVisualSpec.toJSON(v);
}

export function fromJSON(j: unknown): VisualSpec {
  return PbVisualSpec.fromJSON(j);
}
```

- [ ] **Step 5.2: Write the TS roundtrip tests**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/vizSpec.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';

import {
  makeField,
  makeShelf,
  makeEncoding,
  makeCategoricalFilter,
  makeRangeFilter,
  makeRelativeDateFilter,
  makeParameter,
  makeVisualSpec,
  toJSON,
  fromJSON,
  DataType,
  FieldRole,
  AggType,
  ColumnClass,
  MarkType,
  EncodingType,
  ShelfKind,
  FilterKind,
} from '../vizSpec';

function sampleField(id = 'orders.total') {
  return makeField({
    id,
    dataType: DataType.DATA_TYPE_NUMBER,
    role: FieldRole.FIELD_ROLE_MEASURE,
    aggregation: AggType.AGG_TYPE_SUM,
    columnClass: ColumnClass.COLUMN_CLASS_DATABASE,
  });
}

describe('vizSpec builders', () => {
  it('makeField seeds all defaults explicitly', () => {
    const f = makeField({ id: 'x' });
    expect(f.id).toBe('x');
    expect(f.dataType).toBe(DataType.DATA_TYPE_UNSPECIFIED);
    expect(f.role).toBe(FieldRole.FIELD_ROLE_UNSPECIFIED);
    expect(f.semanticRole).toBe('');
    expect(f.isDisagg).toBe(false);
  });

  it('makeShelf preserves field order', () => {
    const s = makeShelf(ShelfKind.SHELF_KIND_ROW, [sampleField('a'), sampleField('b')]);
    expect(s.kind).toBe(ShelfKind.SHELF_KIND_ROW);
    expect(s.fields.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('makeEncoding carries customEncodingTypeId', () => {
    const e = makeEncoding({
      fieldEncodingId: 'e1',
      encodingType: EncodingType.ENCODING_TYPE_CUSTOM,
      field: sampleField(),
      customEncodingTypeId: 'org.askdb.sankey.v1',
    });
    expect(e.customEncodingTypeId).toBe('org.askdb.sankey.v1');
    expect(e.encodingType).toBe(EncodingType.ENCODING_TYPE_CUSTOM);
  });
});

describe('vizSpec filter builders', () => {
  it('makeCategoricalFilter produces correct discriminator', () => {
    const fs = makeCategoricalFilter({
      field: sampleField('region'),
      values: ['NY', 'CA'],
      isExcludeMode: true,
    });
    expect(fs.filterKind).toBe(FilterKind.FILTER_KIND_CATEGORICAL);
    expect(fs.categorical?.values).toEqual(['NY', 'CA']);
    expect(fs.categorical?.isExcludeMode).toBe(true);
    expect(fs.range).toBeUndefined();
    expect(fs.relativeDate).toBeUndefined();
    expect(fs.hierarchical).toBeUndefined();
  });

  it('makeRangeFilter defaults rangeNullOption to keep', () => {
    const fs = makeRangeFilter({ field: sampleField('amt'), min: 0, max: 100 });
    expect(fs.filterKind).toBe(FilterKind.FILTER_KIND_RANGE);
    expect(fs.range?.rangeNullOption).toBe('keep');
  });

  it('makeRelativeDateFilter pins all four slots', () => {
    const fs = makeRelativeDateFilter({
      field: sampleField('created_at'),
      periodType: 'days',
      dateRangeType: 'last',
      rangeN: 30,
    });
    expect(fs.filterKind).toBe(FilterKind.FILTER_KIND_RELATIVE_DATE);
    expect(fs.relativeDate?.periodType).toBe('days');
    expect(fs.relativeDate?.dateRangeType).toBe('last');
    expect(fs.relativeDate?.rangeN).toBe(30);
  });
});

describe('vizSpec parameter builder', () => {
  it('seeds all domain fields', () => {
    const p = makeParameter({
      id: 'p1',
      name: 'Year',
      dataType: DataType.DATA_TYPE_INT,
      value: '2026',
      domainKind: 'range',
      domainMin: 2020,
      domainMax: 2030,
      domainStep: 1,
    });
    expect(p.domainKind).toBe('range');
    expect(p.domainMin).toBe(2020);
    expect(p.domainMax).toBe(2030);
    expect(p.domainStep).toBe(1);
  });
});

describe('VisualSpec JSON roundtrip', () => {
  it('roundtrips a fully-populated spec', () => {
    const v = makeVisualSpec({
      sheetId: 'sheet-1',
      fields: [sampleField('a'), sampleField('b')],
      shelves: [makeShelf(ShelfKind.SHELF_KIND_COLUMN, [sampleField('a')])],
      encodings: [
        makeEncoding({
          fieldEncodingId: 'e1',
          encodingType: EncodingType.ENCODING_TYPE_COLOR,
          field: sampleField('b'),
        }),
      ],
      filters: [
        makeCategoricalFilter({ field: sampleField('region'), values: ['NY'] }),
      ],
      parameters: [
        makeParameter({
          id: 'p1',
          name: 'Year',
          dataType: DataType.DATA_TYPE_INT,
          value: '2026',
          domainKind: 'range',
          domainMin: 2020,
          domainMax: 2030,
          domainStep: 1,
        }),
      ],
      markType: MarkType.MARK_TYPE_BAR,
      isGenerativeAiWebAuthoring: true,
      domainType: 'snowflake',
    });
    const rt = fromJSON(toJSON(v));
    expect(rt).toEqual(v);
  });

  it('preserves is_generative_ai_web_authoring across JSON', () => {
    const v = makeVisualSpec({ sheetId: 's', isGenerativeAiWebAuthoring: true });
    const json = toJSON(v) as Record<string, unknown>;
    // ts-proto JSON uses camelCase by default; assert via roundtrip not field name
    // to stay resilient to codegen option tweaks.
    const rt = fromJSON(json);
    expect(rt.isGenerativeAiWebAuthoring).toBe(true);
  });

  it('empty spec roundtrips', () => {
    const v = makeVisualSpec({ sheetId: '' });
    const rt = fromJSON(toJSON(v));
    expect(rt).toEqual(v);
  });

  it('pins canonical enum tag values against Build_Tableau Appendix A', () => {
    // A.1 DataType
    expect(DataType.DATA_TYPE_BOOL).toBe(1);
    expect(DataType.DATA_TYPE_STRING).toBe(9);
    // A.4 MarkType
    expect(MarkType.MARK_TYPE_VIZ_EXTENSION).toBe(13);
    // A.5 EncodingType
    expect(EncodingType.ENCODING_TYPE_CUSTOM).toBe(10);
    // A.8 FilterType
    expect(FilterKind.FILTER_KIND_RELATIVE_DATE).toBe(4);
    // A.14 AggregationType
    expect(AggType.AGG_TYPE_TRUNC_YEAR).toBe(41);
    expect(AggType.AGG_TYPE_TRUNC_SECOND).toBe(48);
  });
});
```

- [ ] **Step 5.3: Extend the vitest chart-ir script to include the new tests**

The existing `test:chart-ir` script only scans `src/chart-ir/__tests__/`. Add a second script that picks up the freeform-lib tests. Open `frontend/package.json`, extend the `scripts` block:

```json
"test:freeform-lib": "vitest run src/components/dashboard/freeform/lib/__tests__/"
```

(Keep `test:chart-ir` untouched.)

- [ ] **Step 5.4: Run the new tests**

From `frontend/`:

```bash
npm run test:freeform-lib -- vizSpec.test
```

Expected: all cases PASS. If `fromJSON(toJSON(v))` reports inequality on nested filter fields, the most likely cause is ts-proto emitting `undefined` where we set `undefined` — adjust the builder to omit the key instead of writing `undefined`, or assert with `toMatchObject` on the shared structural subset. Prefer builder fix over test weakening.

- [ ] **Step 5.5: Lint**

```bash
npm run lint
```

Expected: zero new errors.

- [ ] **Step 5.6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/vizSpec.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/vizSpec.test.ts \
        frontend/package.json
git commit -m "feat(analyst-pro): ts VisualSpec builders + roundtrip (Plan 7a T5)"
```

---

### Task 6 — Bridge current store state → VisualSpec

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/vizSpecBridge.ts`
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/vizSpecBridge.test.ts`

**Goal.** One pure function `bridgeToVisualSpec({ sheetId, sheetFilters, parameters, sets, markType })` that reads the existing Plan 4a / 4b / 4c types (`Filter` from `filterApplication.ts`, `DashboardParameter` from `parameterTypes.ts`, `DashboardSet` from `setTypes.ts`) and returns a `VisualSpec`. Read-only — the store is not yet wired to consume VisualSpec; this bridge exists so Plan 7b can pull an IR without touching the store contract.

- [ ] **Step 6.1: Author the bridge**

Create `frontend/src/components/dashboard/freeform/lib/vizSpecBridge.ts` with:

```ts
/**
 * Bridge: existing Analyst Pro store types → VisualSpec IR.
 *
 * Read-only. Plan 7a ships the IR; Plan 7b's compiler will be the first
 * consumer. Until then, this module exists so callers can start producing
 * VisualSpec instances from current state without the store knowing.
 *
 * Isolation: never mutate inputs, never call into Zustand. Pure.
 */

import type { Filter } from './filterApplication';
import type { DashboardParameter, ParamType, ParamValue } from './parameterTypes';
import type { DashboardSet } from './setTypes';

import {
  makeField,
  makeCategoricalFilter,
  makeRangeFilter,
  makeRelativeDateFilter,
  makeParameter,
  makeVisualSpec,
  DataType,
  FieldRole,
  AggType,
  MarkType,
  ColumnClass,
  type VisualSpec,
  type FilterSpec,
  type Parameter as VizParameter,
} from './vizSpec';

export type BridgeInput = {
  sheetId: string;
  /** Plan 4a filters applied to the sheet. */
  sheetFilters: readonly Filter[];
  /** Plan 4c workbook parameters. */
  parameters: readonly DashboardParameter[];
  /** Plan 4b sets (currently carried for filter expansion parity with
   *  filterApplication.buildAdditionalFilters). */
  sets: readonly DashboardSet[];
  /** Mark type if the current worksheet has committed to one.
   *  Defaults to MARK_TYPE_UNSPECIFIED when omitted. */
  markType?: MarkType;
  /** AI-origin flag — true when this spec was built from an NL / Agent
   *  authoring path. Plan 7b will read it for telemetry. */
  isGenerativeAiWebAuthoring?: boolean;
};

/**
 * Map a Plan 4c ParamType onto our DataType enum. ParamType 'date' maps
 * to DATA_TYPE_DATE_TIME because our date-parameter UI stores ISO-8601
 * datetimes (not calendar-dates).
 */
function paramTypeToDataType(t: ParamType): DataType {
  switch (t) {
    case 'string':
      return DataType.DATA_TYPE_STRING;
    case 'number':
      return DataType.DATA_TYPE_NUMBER;
    case 'boolean':
      return DataType.DATA_TYPE_BOOL;
    case 'date':
      return DataType.DATA_TYPE_DATE_TIME;
  }
}

function paramValueToString(v: ParamValue): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function bridgeParameter(p: DashboardParameter): VizParameter {
  const dataType = paramTypeToDataType(p.type);
  if (p.domain.kind === 'list') {
    return makeParameter({
      id: p.id,
      name: p.name,
      dataType,
      value: paramValueToString(p.value),
      domainKind: 'list',
      domainValues: p.domain.values.map(paramValueToString),
    });
  }
  if (p.domain.kind === 'range') {
    return makeParameter({
      id: p.id,
      name: p.name,
      dataType,
      value: paramValueToString(p.value),
      domainKind: 'range',
      domainMin: p.domain.min,
      domainMax: p.domain.max,
      domainStep: p.domain.step,
    });
  }
  return makeParameter({
    id: p.id,
    name: p.name,
    dataType,
    value: paramValueToString(p.value),
    domainKind: 'free',
  });
}

function fieldFor(name: string): ReturnType<typeof makeField> {
  return makeField({
    id: name,
    dataType: DataType.DATA_TYPE_UNSPECIFIED,
    role: FieldRole.FIELD_ROLE_DIMENSION,
    aggregation: AggType.AGG_TYPE_NONE,
    columnClass: ColumnClass.COLUMN_CLASS_DATABASE,
  });
}

function coerceScalarToString(v: string | number | boolean | null): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/**
 * Map a single Plan 4a Filter onto a FilterSpec. Bag-of-strings: the
 * Plan 4a `Filter.op` is one of `'eq' | 'in' | 'notIn'`, all of which
 * land in the CATEGORICAL kind with `isExcludeMode` toggling for
 * `notIn`. Plan 7b will gain dedicated `range`/`relativeDate` mapping
 * when worksheet UI starts authoring those directly (roadmap Phase 7+).
 */
function bridgeFilter(f: Filter): FilterSpec {
  const field = fieldFor(f.field);
  if (f.op === 'eq') {
    return makeCategoricalFilter({
      field,
      values: [coerceScalarToString(f.value)],
      isExcludeMode: false,
    });
  }
  // op === 'in' | 'notIn'
  const values = f.values.map((v) => String(v));
  return makeCategoricalFilter({
    field,
    values,
    isExcludeMode: f.op === 'notIn',
  });
}

/**
 * Main entry. Pure: no store reads, no side effects.
 *
 * `sets` is currently carried for API parity and future set-as-filter
 * expansion (Plan 4b). It is intentionally unused today — the Plan 4a
 * runtime already expands set refs into concrete member lists before
 * the filter reaches this bridge.
 */
export function bridgeToVisualSpec(input: BridgeInput): VisualSpec {
  void input.sets; // reserved; see docstring.
  return makeVisualSpec({
    sheetId: input.sheetId,
    fields: [],
    shelves: [],
    encodings: [],
    filters: input.sheetFilters.map(bridgeFilter),
    parameters: input.parameters.map(bridgeParameter),
    lodCalculations: [],
    markType: input.markType ?? MarkType.MARK_TYPE_UNSPECIFIED,
    analytics: { slots: [] },
    isGenerativeAiWebAuthoring: input.isGenerativeAiWebAuthoring ?? false,
    domainType: 'separate',
  });
}
```

- [ ] **Step 6.2: Write bridge tests**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/vizSpecBridge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

import { bridgeToVisualSpec } from '../vizSpecBridge';
import type { Filter } from '../filterApplication';
import type { DashboardParameter } from '../parameterTypes';
import type { DashboardSet } from '../setTypes';
import {
  DataType,
  FilterKind,
  MarkType,
} from '../vizSpec';

const noSets: DashboardSet[] = [];

describe('bridgeToVisualSpec — empty', () => {
  it('maps empty state to an empty VisualSpec with defaults', () => {
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: [],
      sets: noSets,
    });
    expect(v.sheetId).toBe('s1');
    expect(v.fields).toEqual([]);
    expect(v.filters).toEqual([]);
    expect(v.parameters).toEqual([]);
    expect(v.markType).toBe(MarkType.MARK_TYPE_UNSPECIFIED);
    expect(v.isGenerativeAiWebAuthoring).toBe(false);
    expect(v.domainType).toBe('separate');
  });
});

describe('bridgeToVisualSpec — filter mapping', () => {
  it('maps eq filter to categorical with single value', () => {
    const filters: Filter[] = [{ field: 'region', op: 'eq', value: 'NY' }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(v.filters).toHaveLength(1);
    expect(v.filters[0]!.filterKind).toBe(FilterKind.FILTER_KIND_CATEGORICAL);
    expect(v.filters[0]!.categorical?.values).toEqual(['NY']);
    expect(v.filters[0]!.categorical?.isExcludeMode).toBe(false);
  });

  it('maps in filter to categorical include', () => {
    const filters: Filter[] = [{ field: 'region', op: 'in', values: ['NY', 'CA'] }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(v.filters[0]!.categorical?.values).toEqual(['NY', 'CA']);
    expect(v.filters[0]!.categorical?.isExcludeMode).toBe(false);
  });

  it('maps notIn filter to categorical exclude', () => {
    const filters: Filter[] = [{ field: 'region', op: 'notIn', values: ['NY'] }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(v.filters[0]!.categorical?.isExcludeMode).toBe(true);
    expect(v.filters[0]!.categorical?.values).toEqual(['NY']);
  });

  it('coerces non-string eq values to string', () => {
    const filters: Filter[] = [
      { field: 'n', op: 'eq', value: 42 },
      { field: 'b', op: 'eq', value: true },
      { field: 'z', op: 'eq', value: null },
    ];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(v.filters[0]!.categorical?.values).toEqual(['42']);
    expect(v.filters[1]!.categorical?.values).toEqual(['true']);
    expect(v.filters[2]!.categorical?.values).toEqual(['']);
  });
});

describe('bridgeToVisualSpec — parameter mapping', () => {
  it('maps list-domain parameter', () => {
    const params: DashboardParameter[] = [{
      id: 'p1', name: 'Region', type: 'string', value: 'NY',
      domain: { kind: 'list', values: ['NY', 'CA', 'TX'] },
      createdAt: '2026-04-17T00:00:00Z',
    }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: params,
      sets: noSets,
    });
    expect(v.parameters).toHaveLength(1);
    expect(v.parameters[0]!.dataType).toBe(DataType.DATA_TYPE_STRING);
    expect(v.parameters[0]!.domainKind).toBe('list');
    expect(v.parameters[0]!.domainValues).toEqual(['NY', 'CA', 'TX']);
  });

  it('maps range-domain numeric parameter', () => {
    const params: DashboardParameter[] = [{
      id: 'p2', name: 'Year', type: 'number', value: 2026,
      domain: { kind: 'range', min: 2020, max: 2030, step: 1 },
      createdAt: '2026-04-17T00:00:00Z',
    }];
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: params,
      sets: noSets,
    });
    expect(v.parameters[0]!.dataType).toBe(DataType.DATA_TYPE_NUMBER);
    expect(v.parameters[0]!.domainKind).toBe('range');
    expect(v.parameters[0]!.domainMin).toBe(2020);
    expect(v.parameters[0]!.domainMax).toBe(2030);
    expect(v.parameters[0]!.domainStep).toBe(1);
    expect(v.parameters[0]!.value).toBe('2026');
  });

  it('maps boolean and date parameters to expected DataTypes', () => {
    const params: DashboardParameter[] = [
      { id: 'pb', name: 'Enabled', type: 'boolean', value: true,
        domain: { kind: 'free' }, createdAt: '2026-04-17T00:00:00Z' },
      { id: 'pd', name: 'From', type: 'date', value: '2026-01-01',
        domain: { kind: 'free' }, createdAt: '2026-04-17T00:00:00Z' },
    ];
    const v = bridgeToVisualSpec({
      sheetId: 's1', sheetFilters: [], parameters: params, sets: noSets,
    });
    expect(v.parameters[0]!.dataType).toBe(DataType.DATA_TYPE_BOOL);
    expect(v.parameters[0]!.value).toBe('true');
    expect(v.parameters[1]!.dataType).toBe(DataType.DATA_TYPE_DATE_TIME);
    expect(v.parameters[1]!.value).toBe('2026-01-01');
  });
});

describe('bridgeToVisualSpec — AI flag + mark type', () => {
  it('propagates is_generative_ai_web_authoring', () => {
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: [],
      sets: noSets,
      isGenerativeAiWebAuthoring: true,
    });
    expect(v.isGenerativeAiWebAuthoring).toBe(true);
  });

  it('propagates explicit markType', () => {
    const v = bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: [],
      parameters: [],
      sets: noSets,
      markType: MarkType.MARK_TYPE_BAR,
    });
    expect(v.markType).toBe(MarkType.MARK_TYPE_BAR);
  });
});

describe('bridgeToVisualSpec — purity', () => {
  it('does not mutate inputs', () => {
    const filters: Filter[] = [{ field: 'region', op: 'in', values: ['NY'] }];
    const snapshot = JSON.stringify(filters);
    bridgeToVisualSpec({
      sheetId: 's1',
      sheetFilters: filters,
      parameters: [],
      sets: noSets,
    });
    expect(JSON.stringify(filters)).toBe(snapshot);
  });
});
```

- [ ] **Step 6.3: Run the bridge tests**

```bash
cd frontend
npm run test:freeform-lib -- vizSpecBridge.test
```

Expected: all cases PASS. If a TS type error surfaces against `filterApplication.Filter` (the union), that's a real mismatch — reconcile the bridge's discriminator before weakening the test. Do not use `as any`.

- [ ] **Step 6.4: Full freeform-lib suite green**

```bash
npm run test:freeform-lib
```

Expected: both `vizSpec.test.ts` and `vizSpecBridge.test.ts` pass; zero other regressions in that folder.

- [ ] **Step 6.5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/vizSpecBridge.ts \
        frontend/src/components/dashboard/freeform/lib/__tests__/vizSpecBridge.test.ts
git commit -m "feat(analyst-pro): bridge dashboard store state to VisualSpec IR (Plan 7a T6)"
```

---

### Task 7 — README + CLAUDE.md reference

**Files:**
- Create: `backend/vizql/README.md`
- Modify: `QueryCopilot V1/CLAUDE.md`

- [ ] **Step 7.1: Author README**

Create `backend/vizql/README.md` with:

```markdown
# backend/vizql/

VizQL engine package — AskDB's answer to Tableau's `minerva` +
`tabquery` + `tabquerycache` stack. See
`docs/analyst_pro_tableau_parity_roadmap.md` Phase 7 for the full plan
series.

## Layout (Plan 7a — IR only)

```
backend/vizql/
├── __init__.py
├── spec.py                       # hand-authored VisualSpec dataclasses
├── proto/
│   ├── __init__.py
│   ├── v1_pb2.py                 # GENERATED — do not hand-edit
│   └── v1_pb2.pyi                # GENERATED — do not hand-edit
└── README.md                     # (this file)
```

Later plans add `logical.py` (7b), `sql_ast.py` + optimiser passes
(7c), `dialects/` (7d), `cache.py` (7e).

## VisualSpec IR

`VisualSpec` is the canonical description of a worksheet that will be
fed into the compiler in Plan 7b. It mirrors Tableau's
`tableau.vizdataservice.v1` protobuf semantics (`docs/Build_Tableau.md`
§I.5, §III.1–III.6, Appendix A.1–A.8, A.14).

**Fields:**

| Field | Purpose |
|---|---|
| `sheet_id` | Stable worksheet id (matches `dashboard_tile.id`). |
| `fields` | Pane-scope field catalogue. |
| `shelves` | Pill placements (Rows / Columns / Marks-card channels). |
| `encodings` | Marks-card bindings (`customEncodingTypeId` for viz extensions). |
| `filters` | 4-kind `FilterSpec` union — categorical / hierarchical / range / relativeDate. |
| `parameters` | Workbook-scoped typed scalars. |
| `lod_calculations` | FIXED / INCLUDE / EXCLUDE LOD (mapped in Plan 7b / 8b). |
| `mark_type` | Build_Tableau §III.3 enum. |
| `analytics` | Reference lines, trend, forecast, cluster (Plan 9 fills in). |
| `is_generative_ai_web_authoring` | AI-origin marker (Build_Tableau §I.5). |
| `domain_type` | Snowflake vs separate cross-product (§IV.3). |

**Wire invariants:**

- Canonical enum names — matches `docs/Build_Tableau.md` Appendix A
  exactly. Integer tags pinned via
  `backend/tests/test_vizql_spec_roundtrip.py::test_enum_canonical_values_pinned_to_appendix_a`.
- Published Tableau typos — `hierachical-filter`, `paremeter-caption`,
  `quantitative-dmain`, `apply-relative-date-Filter` live in the
  command-verb layer (Plan 3 actions subsystem), not in this IR. The IR
  uses the canonical spellings from Appendix A.8 (`relativeDate`,
  `hierarchical`, etc.).
- Server-side eval forbidden — treat every string in a `VisualSpec` as
  untrusted; every downstream compiler pass MUST route literals through
  `sql_validator.py` or `param_substitution.FormatAsLiteral`.

## Codegen

```
make proto       # regenerates both Python + TypeScript
make proto-py    # Python only
make proto-ts    # TypeScript only
make clean-proto
```

Requirements:

- Python: `protobuf==5.29.3` + `grpcio-tools==1.68.1` (pinned in
  `backend/requirements.txt`).
- TypeScript: `ts-proto@2.6.1` (pinned in `frontend/package.json` as
  `devDependencies`).
- System `protoc` binary required for `make proto-ts`
  (`brew install protobuf` / `apt install protobuf-compiler` /
  `choco install protoc`).

Generated files:

- `backend/vizql/proto/v1_pb2.py` + `v1_pb2.pyi`
- `frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts`

Regenerated output is **committed** — CI does not regenerate. Edit the
`.proto` file, run `make proto`, commit the diff together.

## Usage — Python

```python
from backend.vizql import spec

v = spec.VisualSpec(
    sheet_id="sheet-1",
    mark_type=spec.MarkType.MARK_TYPE_BAR,
    is_generative_ai_web_authoring=True,
)
payload = v.serialize()
roundtrip = spec.VisualSpec.deserialize(payload)
```

## Usage — TypeScript

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

## References

- `docs/Build_Tableau.md` §I.1–I.5 (wire-format invariants), §III.1–III.6
  (worksheet subsystem), §IV.1 (compilation pipeline), Appendix A.1–A.8,
  A.14.
- `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 7a.
- `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7a-visualspec-ir.md`
  — this plan.
```

- [ ] **Step 7.2: Reference `make proto` from CLAUDE.md**

Open `QueryCopilot V1/CLAUDE.md`. Under the `## Always-loaded context` section, the file references deep-dive tables. The shortest diff that adds the codegen command without bloating is to append to the bottom of the file (after the final `## Golden rules` list) a new two-line block:

```markdown

## VizQL codegen

- `make proto` regenerates Python (`backend/vizql/proto/`) + TS
  (`frontend/.../vizSpecGenerated.ts`) bindings from
  `backend/proto/askdb/vizdataservice/v1.proto`. Edit the `.proto`,
  run `make proto`, commit the diff together. See
  `backend/vizql/README.md`.
```

Do not reorder or rename existing CLAUDE.md blocks.

- [ ] **Step 7.3: Commit**

```bash
cd "QueryCopilot V1"
git add backend/vizql/README.md CLAUDE.md
git commit -m "docs(analyst-pro): document vizql IR + make proto (Plan 7a T7)"
```

---

### Task 8 — Full verification

**Files:** none (read-only verification + optional fixup commit).

- [ ] **Step 8.1: Idempotency check**

```bash
cd "QueryCopilot V1"
make proto
git status
```

Expected: `git status` reports no modified files. If it does, commit the regenerated files with a fixup commit:

```bash
git add backend/vizql/proto/ frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts
git commit -m "chore(analyst-pro): refresh generated proto bindings (Plan 7a T8 fixup)"
```

- [ ] **Step 8.2: Full backend pytest**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: 516+ pre-existing tests still green, plus 15+ new assertions from `test_vizql_spec_roundtrip.py`. No failures or errors.

- [ ] **Step 8.3: Frontend tests — new freeform-lib suite**

```bash
cd frontend
npm run test:freeform-lib
```

Expected: zero failures across `vizSpec.test.ts` + `vizSpecBridge.test.ts` (8 + 12 = 20 test cases).

- [ ] **Step 8.4: Frontend tests — pre-existing chart-ir suite**

```bash
npm run test:chart-ir
```

Expected: failure count matches the known-debt baseline recorded in `CLAUDE.md` ("~22 pre-existing chart-ir failures"). Do not attempt to fix those — the Plan 7a diff must not change the number. If the number goes up, bisect into the Plan 7a changes.

- [ ] **Step 8.5: Lint + build**

```bash
npm run lint
npm run build
```

Expected: lint clean; build succeeds. The generated `vizSpecGenerated.ts` may need to be in the eslint ignores (already handled in Task 3 Step 3.5 if needed).

- [ ] **Step 8.6: Final commit (if T8 steps wrote no fixup)**

No-op — the verification-only case. If steps 8.1–8.5 passed first try with zero git diff, Task 8 has no commit.

- [ ] **Step 8.7: Report to roadmap**

Open `docs/analyst_pro_tableau_parity_roadmap.md`. Under the Phase 7 Plan 7a bullet, mark the plan as shipped with the date and the plan path (insert a new `**Status:** ✅ Shipped 2026-04-17.` line directly below the `**Task count target:** 8.` line, matching the shape already used for prior shipped plans in the doc). Commit:

```bash
git add docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): mark Plan 7a shipped in roadmap (Plan 7a T8)"
```

---

## Out-of-scope (explicitly deferred)

The following items are called out in the roadmap or the Task brief but are NOT attempted in Plan 7a. They live in Plan 7b or beyond.

- **Minerva logical-plan port** (`LogicalOpProject`, `LogicalOpSelect`, etc.) — Plan 7b.
- **Compiler** (`VisualSpec → LogicalPlan`) — Plan 7b.
- **Calc parser** — Plan 8a. `Calculation.formula` stays as an opaque string for now.
- **Filter-order-of-ops** staging beyond naming — Plan 7c. `filter_stage` accepts the 9-stage string but Plan 7a does not enforce ordering invariants.
- **Dual-axis / combined-axis / shared-axis** wiring — proto numbers 12–14 reserved in Task 2; filled by Plan 7b.
- **Store integration** — the bridge is pure and read-only. Zustand selectors that consume `bridgeToVisualSpec` land in Plan 7b when the compiler needs them.
- **Viz Extensions surface** — `customEncodingTypeId` is in the schema and roundtrips, but no consumer exists yet (Phase 12).
- **Tableau_response.md Appendix S** — referenced in the Task brief; file is not present in this repo. All enum + shape decisions anchor on `Build_Tableau.md` Appendix A as documented at the head of this plan.

---

## Self-review

Spec coverage check:

1. Proto schema with all required messages + enums — Task 2 ✔
2. TS codegen via ts-proto — Task 3 Step 3.3–3.6 ✔
3. Python codegen via grpcio-tools — Task 3 Step 3.1–3.2 ✔
4. `vizSpec.ts` types + builders — Task 5 ✔
5. `spec.py` dataclasses — Task 4 ✔
6. Roundtrip tests (both sides) — Task 4 Step 4.2 + Task 5 Step 5.2 ✔
7. `vizSpecBridge.ts` — Task 6 ✔
8. README — Task 7 Step 7.1 ✔
9. `make proto` target — Task 1 Step 1.6 + Task 3 scripts ✔
10. CLAUDE.md reference — Task 7 Step 7.2 ✔
11. 8 tasks target — Tasks T1–T8 ✔
12. Commit-per-task format — every Task ends with a `feat(analyst-pro): … (Plan 7a T<N>)` commit ✔
13. Canonical Tableau enum names — pinned in Task 2 proto + Task 4 `test_enum_canonical_values_pinned_to_appendix_a` + Task 5 "pins canonical enum tag values" test ✔
14. `is_generative_ai_web_authoring` flag — Task 2 field 10, Task 4 default-false test, Task 5 roundtrip test, Task 6 bridge propagation ✔
15. Security: no server-side eval on spec values — enforced in README + by holding compilation off to Plan 7b ✔

Placeholder scan: complete code blocks in every step; no "TODO" / "similar to Task N" / "add appropriate error handling" present.

Type consistency: `bridgeToVisualSpec` return signature matches `VisualSpec`; `makeField` / `makeShelf` / `makeVisualSpec` signatures unified; Python `spec.Field` ↔ pb `Field` field names aligned; `filter_stage` string typing consistent between proto (`string`), Python (`str`), and TS (`string`).

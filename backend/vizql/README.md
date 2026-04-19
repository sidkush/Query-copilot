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

## References

- `docs/Build_Tableau.md` Sections I.1-I.5 (wire-format invariants),
  III.1-III.6 (worksheet subsystem), IV.1 (compilation pipeline),
  Appendix A.1-A.8, A.14.
- `docs/analyst_pro_tableau_parity_roadmap.md` Plan 7a.
- `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7a-visualspec-ir.md`
  - the plan this README ships under.

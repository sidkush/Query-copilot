# Build Tableau — An Engineer's Bible

> **Purpose.** A single reference synthesising everything we know about how Tableau Desktop (2025.1) is architected, so a team can build a parity product from scratch. Everything here is grounded in evidence: exact DLL symbol names, enum literals, XML grammar samples, and protobuf field names mined from the shipped binaries, cross-referenced with behavioural answers from a Tableau expert.
>
> **Sources synthesised.**
> 1. `Tableau Public 2025.1/DASHBOARD_SHEET_ARCHITECTURE.md` — architecture reconstruction from shipped `.rcc` / `.tds` / `.tms` files and demangled DLL symbols.
> 2. `Tableau Public 2025.1/Tableau_response.md` — 4,400-line Q&A with 33 appendices (A–AI) covering engine internals, version migration, VizQL compilation, query cache, Virtual Connections, Workgroup (Server) API.
> 3. Our own Analyst Pro implementation experience (Plans 1–3 shipped on branch `askdb-global-comp`).
>
> **How to read.** Parts I–XXIII are the reference manual. Part XXIV is the step-by-step build order. Part XXV names Tableau's weaknesses (your leapfrog targets). Part XXVI is an ordered Analyst Pro plan sequence. Part XXVII lists what to deliberately skip. Appendix is enum/verb/keyword reference.
>
> **Notation.** `CamelCase` identifiers = exact symbol from Tableau binary; `kebab-case` strings in quotes = exact wire/serialisation strings; `.dll` / `.rcc` suffixes = real shipped files.

---

# Part I — Architectural Invariants (the five non-negotiables)

If you only copy five things from Tableau, copy these. Every feature downstream becomes easier once they're in place.

## I.1 — Command + Verb + Parameter triple

Every mutation — mouse drag, dashboard extension call, embedding API call — is dispatched as a tuple:
```
(VerbId, [CommandParameter(ParameterId, value), …]) → Editor → PresModel change
```
- `VerbId` is a stable string (e.g. `"range-filter"`, `"activate-sheet"`, `"move-and-resize-zones"`).
- `ParameterId` is a closed enum (156 values observed).
- Wire-stable: published typos (`hierachical-filter`, `paremeter-caption`, `quantitative-dmain`, `apply-relative-date-Filter`) are part of the protocol and cannot be fixed.
- Every verb is undoable because dispatch is log-structured.

**Implication.** Your client owns no mutable state model. It is a `PresModel` renderer that emits verbs. Server (or headless engine) owns state.

## I.2 — PresModel per UI surface

Server materialises the workbook into typed `*PresModel` trees and ships them to the client. The client converts via `PresLayerToSharedApiConverter` (shared) + surface-specific variants (`PresLayerToExtensionsApiConverter`, `PresLayerToEmbeddingApiConverter`).

Key PresModel types:

| PresModel | Carries |
|---|---|
| `VizDataPresModel` | Pane grid, columns, dictionary-encoded values/aliases |
| `DashboardPresModel` | Zone list, layout, device-layout selection |
| `StoryPresModel` | Story points + active index |
| `CategoricalFilterPresModel` / `HierarchicalFilterPresModel` / `QuantitativeFilterPresModel` / `RelativeDateFilterPresModel` | One per `FilterType` |
| `SelectTuplesInteractionPresModel` / `HoverTupleInteractionPresModel` | Mark-level pointer events |
| `EncodingTypePresModel` | Encoding kind, allows `customEncodingTypeId` for Viz Extensions |
| `AddInLocatorPresModel` | Locates an extension (worksheet- or dashboard-scoped) |
| `ShowDataTablePresModel` | "View Data" grid projection |
| `EmbeddingBootstrap` | Initial dump: workbook name, current sheet, sheet list, dashboard zones, story, chrome height, size constraints |

**Wire-format principle.** Every payload uses optional fields + `customEncodingTypeId`-style escape hatches so schemas evolve without versioning. This is how Viz Extensions added a new `MarkType.viz-extension` without a breaking change.

## I.3 — Three-layer column class system

Every field/column in the system carries a class. Behaviour switches on it.

| Layer | Classes | Meaning |
|---|---|---|
| Physical | `Database`, `LocalData`, `Metadata` | Comes from a data source |
| Logical | `Group`, `CategoricalBin`, `Numericbin`, `MdxCalc`, `UserCalc` | User-defined transform over physical |
| Runtime | `Dangling`, `Instance`, `VisualData` | Computed during query / render |

`Dangling` = reference to a column no longer bound to physical source (handles missing-data gracefully). `Instance` = multiple placements of same field on shelves. `VisualData` = viz-scope synthetic (Measure Names / Measure Values).

## I.4 — Delta coalescing + log-structured undo

User gesture → multiple fine-grained `Delta` records → coalesced into one `WorkbookCommittedEdit` that becomes one undo step.

Delta kinds observed: `HighlightDelta`, `PageDelta`, `ParameterDelta`, `ShelfSortDelta`, `StylesDelta`, `ZoneTextDelta`, `FilterDelta`, `FilterMsgEdit`. Common interface: `IHistoryElement`. Event flow: `HistoryUpdatedMsg` / `WorkbookCommittedEdit` / `WorkbookAnalyzerDocPendingEdit`.

**Implication for us.** The delta architecture is nearly CRDT-shaped — Tableau just didn't go concurrent. We can.

## I.5 — Protobuf wire format with AI authoring flag

Tableau's internal wire uses `tableau.vizdataservice.v1` protobuf. Observed field `is_generative_ai_web_authoring` marks payloads originating from AI authoring. Design your wire format with a similar origin flag from day one; we'll need the separation when NL authoring collides with manual authoring.

---

# Part II — Object Hierarchy & Data Model

## II.1 — Hierarchy

```
Workbook (.twb / .twbx)
├── Data Sources  (<datasource>)
├── Parameters    (workbook-scoped)
├── Sheets
│   ├── Worksheet   — one view, owns shelves + marks + filters
│   ├── Dashboard   — layout of Zones that embed Worksheets + objects
│   └── Story       — ordered list of Story Points
└── Windows         — per-sheet open-tab state (WindowDoc)
```

Three `SheetType` values form the hard enumeration used everywhere:
- `worksheet` — single-view viz, owns marks.
- `dashboard` — container of zones, no marks of its own.
- `story` — sequence of story points referencing sheet snapshots.

Sheet addressing: `{ workbookId, sheetName, storyPointId? }`. Stories carry `activeStoryPointIndex`.

## II.2 — Data Source vs Connection vs Relationship

- **Data Source** = `<datasource>` element in `.twb`, can contain multiple connections (federation).
- **Connection** = `<connection class="…">`, a driver-specific handle (Tableau-specific class name like `hyper`, `federated`, `MapboxVector`, not JDBC).
- **Relationship** (2020.2+) vs **Join** vs **Blending**:
  - Relationship = deferred join; query-time decides which tables are needed based on viz context (`JoinTreeVirtualizer` pass).
  - Join = classic static join tree `<relation type="join" join="inner|left|right|full">`.
  - Blending = client-side join at render time, for multi-source vizes.

## II.3 — Field metadata catalogue

Every `<column>` carries:
- `datatype` — `string`, `integer`, `real`, `bool`, `date`, `date-time`, `spatial` (plus `float`, `int`, `number`, `unknown` internal variants).
- `role` — `dimension` | `measure` (drives pill colour + default drag targets).
- `type` — `nominal` | `ordinal` | `quantitative` (measurement level, drives viz selection).
- `aggregation` — default aggregation when used as measure: `Sum`, `Avg`, `Count`, `Countd`, `Min`, `Max`, `Median`, `Var`, `Varp`, `Stdev`, `Stdevp`, `Kurtosis`, `Skewness`, `Attr`, `None`, plus date truncations (`Year`, `Qtr`, `Month`, `Week`, `Day`, `Hour`, `Minute`, `Second`, `Weekday`, `MonthYear`, `Mdy`, `TruncYear/Qtr/Month/Week/Day/Hour/Minute/Second`), plus `Collect`, `InOut`, `End`, `Quart1`, `Quart3`, `User`.
- `semantic-role` — optional tag for domain semantics: `[Geographical].[Latitude]`, `[Geographical].[Longitude]`, `[Geographical].[Geometry]`, `[Geographical].[Country]`, etc.
- Optional `<calculation class="tableau" formula="…"/>` for calculated fields.
- Optional `<server-captions><caption locale="…"/>` for localisation.

`FieldRoleType` discriminator: `dimension` | `measure` | `unknown`. Written into every field-bearing PresModel so client can render pill colours without re-querying.

## II.4 — Data Pane classification

Auto-classification rules (from `tabvizengine` heuristics):
- Numeric types → measure by default.
- Boolean → dimension (but can flip).
- Date → dimension, with aggregation available.
- String → dimension.
- Spatial → dimension, semantic-role auto-tagged if geo-recognisable.

Discrete (blue) vs Continuous (green) is the `type` axis (`nominal`/`ordinal` → discrete, `quantitative` → continuous). User can force: dropping a measure on Columns as continuous = axis; as discrete = header. Per-field default is `role` + `type`.

## II.5 — Folders vs Hierarchies

- **Folder** = data-pane organisation only. No query implication.
- **Hierarchy** = drill chain. Drag "City" onto a hierarchy containing "Country → State → City" and drill-down affordance auto-appears on every viz using the hierarchy.

## II.6 — Data Roles (Prep + Desktop)

Data Roles (2020.4+) = named value validators (e.g. "ISO Country Code"). Used in Tableau Prep for validation; Desktop mostly ignores them at viz time.

---

# Part III — Worksheet Subsystem (shelves, marks, encodings, VizQL)

A worksheet is the atomic viz. Its state is built from orthogonal axes: data binding + shelves + encodings + mark type + filters + parameters + sets + LOD + formatting.

## III.1 — Shelves

Shelves are ordered lists of field references. Placements drive query shape.

| Shelf | Role |
|---|---|
| Columns | Horizontal axis / column headers (dims create headers; measures create axes) |
| Rows | Vertical axis / row headers (same as Columns, transposed) |
| Pages | Animated/paged filter (plays through discrete values) |
| Filters | Predicates (see Part VIII) |
| Marks card | Per-mark encoding (Colour/Size/Shape/Label/Detail/Tooltip/Path/Angle) |

Decision: continuous measure on Columns = axis (chart-like); discrete measure = header with label. Discrete dimension = header; continuous dimension (rare — dates) = axis.

## III.2 — Marks card encodings

`EncodingType` enum:

| Channel | Notes |
|---|---|
| `color` | Mark colour |
| `size` | Mark size |
| `shape` | Mark shape (valid when mark type is `shape` or `square`) |
| `label` | Text label |
| `tooltip` | Tooltip-only (invisible) |
| `detail` | Raises granularity without visual mapping |
| `path` | Mark ordering on paths (line / polygon) |
| `angle` | Pie slice angle |
| `geometry` | Spatial geometry |
| `custom` | Viz-extension-defined |

Wire representation: `{ fieldEncodingId, encodingType, customEncodingTypeId? }` inside `fieldEncodingPairs`.

**Rules.**
- Same field on Color AND Detail = Color drives visual, Detail asserts granularity (mark count = product of all dim-valued channels including Detail).
- Dim on Detail adds to granularity but not to rows/cols; invisible pane-grid expansion.
- Mark count = |distinct combinations of dimensions on marks card|.

## III.3 — Mark types

Fixed `MarkType` enum:

| Mark | Notes |
|---|---|
| `bar`, `line`, `area`, `pie`, `circle`, `square`, `text`, `shape` | Standard |
| `map` | `PT_MULTIPOLYGON` internally |
| `polygon` | `PT_POLYGON` |
| `heatmap` | `PT_HEATMAP` (density) |
| `gantt-bar` | `PT_GANTT` (start + duration) |
| `viz-extension` | Rendering delegated to a Viz Extension |

Marks live inside **panes** (cartesian product of row-tuples × column-tuples). Wire format:

```
VizDataPresModel
└── paneColumnsData
    └── paneColumnsList[i]               // one per pane
        └── vizPaneColumns[0]            // tupleIds (mark identities)
        └── vizPaneColumns[j]            // one per bound data column
            ├── valueIndices[tupleIndex] // → dataDictionary[dataType]
            ├── aliasIndices[tupleIndex] // → dataDictionary[dataType] (aliased display)
            └── tupleIds, dataType
```

Dictionary encoding (`dataDictionary` keyed by `DataType`) keeps payloads small when values repeat.

## III.4 — Show Me (chart recommender)

Inputs: (#dims, #measures, dim cardinalities, whether spatial role present, date role). Outputs a ranked chart list via `ShowMeResolver`. Heuristics:
- 1 measure, 0 dim → text/scalar.
- 1 measure, 1 dim (discrete) → bar chart.
- 2 measures, 0 dim → scatter.
- 1 measure, 1 date → line.
- Spatial role present → map.

## III.5 — Dual axis / combined axis / shared axis

- **Shared axis** = two measures on same shelf, one axis, stacked.
- **Combined axis** = Measure Values field, multiple measures on one axis.
- **Dual axis** = same shelf, two measures, two independent axes; synchronize-axis optional.

Constructed by right-click on second measure pill → Dual Axis.

## III.6 — Measure Names / Measure Values

`Measure Names` = synthetic discrete dimension whose values are measure names (one per measure in use).
`Measure Values` = synthetic continuous measure whose value is the current measure's aggregation.
Both are VisualData column class. Used to build multi-measure panes.

---

# Part IV — Query Engine (VizQL 3-stage compilation, filter order-of-ops, cache)

This is Tableau's crown jewel. Our waterfall router maps 1:1 to the top of this pipeline.

## IV.1 — Three-stage compilation pipeline

```
Visual Spec (shelves + encodings + filters + params + LOD)
        │
        ▼  (VizQL compiler)
Logical Query Plan — `minerva.LogicalOp*` protobuf
        │
        ▼  (LogicalOp → SQL translator)
SQL Query Function — `SQLQueryFunction` / `SQLQueryExpression` (dialect-agnostic AST)
        │
        ▼  (Dialect formatter)
Dialect SQL — `BaseDialect` / `SQLDialect` / `BigQuerySQLDialect` / `MDXDialect`
        │
        ▼
Network — JDBC / ODBC / native protocol / Hyper in-process
```

## IV.2 — `minerva` logical operator catalogue

| Operator | Purpose |
|---|---|
| `LogicalOpRelation` | Base table reference |
| `LogicalOpProject` | SELECT projection (rename/drop/add) |
| `LogicalOpSelect` | WHERE filter |
| `LogicalOpAggregate` | GROUP BY + aggregation |
| `LogicalOpOrder` | ORDER BY |
| `LogicalOpTop` | TOP / LIMIT |
| `LogicalOpOver` | OVER (windowed) |
| `LogicalOpLookup` | LOOKUP (cross-row reference) |
| `LogicalOpUnpivot` | Columns → rows |
| `LogicalOpValuestoColumns` | Rows → columns (pivot) |
| `LogicalOpDomain` | Domain set (see IV.3) |
| `LogicalOpUnion` / `LogicalOpIntersect` / `LogicalOpFilter` | Set ops |

Supporting messages: `Field`, `NamedExps`, `OrderBy { identifier_exp, is_ascending }`, `SqlSetType`, `FrameType` (`WindowFrameType`), `FrameStart`/`FrameEnd`, `WindowFrameExclusion`, `PartitionBys`.

## IV.3 — DomainType (the key VizQL abstraction)

`DomainLogicalOp::domain` enum: `Snowflake` | `Separate`. Controls whether the cartesian product of row × column dimension values is materialised as a snowflake cross-join (empty cells for missing combos) or as separate sub-queries per pane.

- "Show Empty Rows / Columns" toggle → `Snowflake`.
- Default → `Separate`.

This one mechanism powers pivot tables, crosstabs, and any "show empty" viz behaviour.

## IV.4 — SQL AST — `SQLQueryFunction` / `SQLQueryExpression`

Passes observed:
- `SQLQueryFunctionResolveCollation` — collation inference.
- `SQLQueryFunctionCloner` — deep copy.
- `SQLQueryFunctionChecker` — validation.
- `SQLQueryFunctionHavingInSelects` — HAVING integration.
- `SQLQueryFunctionForceLongsLast` — reorder output columns.
- `SQLQueryFunctionForceAggregation::HandleEmptyBindings` — enforce agg when no bindings.

Optimiser passes:
- `AggregatePushdown` — push aggregation toward source.
- `DataTypeResolver` — infer output types bottom-up.
- `EqualityProver` — equality / non-equality assertions.
- `InputSchemaProver` — schema validation.
- `CommonSubexpressionElimination\ExpressionCounter` — CSE.
- `JoinTreeVirtualizer` — materialise joins at query time (drives Relationships).
- `LogicalOpSchemaAndTypeDeriver` — derive schema/type.
- `LogicalExpToSQLQueryExpression` — logical → SQL translation.
- `LogicalOpFormatter` / `LogicalOpParser` — XML round-trip.

## IV.5 — Dialect layer

Base: `BaseDialect` / `SQLDialect`.
Subclasses: `BigQuerySQLDialect`, `MDXDialect` (+ `MDXDataValueFormatter`), `GenericODBCDetectedDialect`.

Format functions each dialect overrides: `FormatSelect`, `FormatDelete`, `FormatUpdate`, `FormatInsert`, `FormatJoin`, `FormatCase`, `FormatAggregate`, `FormatWindow`, `FormatCast`, `FormatDropColumn`, `FormatTableDEE`, `FormatDefaultFromClause`, `FormatSetIsolationLevel`, `FormatSimpleCase`, `FormatSelectMember` (MDX), `FormatDAXAggregation` (DAX / Power BI Tabular), `FormatCurrentMember` (MDX), `FormatBooleanAttribute`/`FormatFloatAttribute`/`FormatIntegerAttribute`/`FormatInt64Attribute`.

**Principle.** One AST, many emit strategies. Visitor pattern. Analyst Pro should mirror: common logical plan, pluggable dialect emitters.

## IV.6 — SQL grammar observed in `tabquery`

Keywords in string table:
- `WITH`, `WITH RECURSIVE` — CTE.
- `GROUPING SETS`, `ROLLUP`, `CUBE`.
- `PIVOT`, `UNPIVOT`.
- `OVER(PARTITION BY … ORDER BY … ROWS/RANGE …)` — window functions.
- `FILTER (WHERE …)` — filter clause on aggregates.
- `WITHIN GROUP (ORDER BY …)` — ordered-set aggregates (percentile_cont).
- `LATERAL`, `for_locking_clause`, `sortby_list`.
- `BETWEEN` / `BetweenSymmetric` / `NotBetweenSymmetric`.
- `CREATE FUNCTION` options: `Strict`, `NotStrict`, `Immutable`, `Stable`, `Volatile`.
- `TempTableMsg` / `OptTempTableName` — for Context filters on legacy RDBMS.
- `TransactionMode`, `IsolationLevel`: `ReadOnly`, `ReadWrite`, `Serializable`.

## IV.7 — Filter order-of-operations (CRITICAL)

The single most important behavioural fact in Tableau. Memorise.

```
1. Extract filters          — baked into .hyper during extract build
2. Data Source filters      — WHERE on every query against that DS
3. Context filters          — promoted filters; #Tableau_Temp_ table on legacy RDBMS,
                              CTE on Hyper; caches the filtered set
4. FIXED LOD expressions    — AFTER context, BEFORE dimension
5. Dimension filters        — WHERE from Filters-shelf dim pills
6. INCLUDE / EXCLUDE LOD    — AFTER dimension, BEFORE measure
7. Measure filters          — HAVING
8. Table calc filters       — CLIENT-SIDE, post-fetch
9. Totals                   — separate query for grand-totals / subtotals
```

Side column (DB-side vs client-side): 1–7, 9 DB-side. 8 client-side.

Flags:
- `Filter::ShouldAffectTotals` → skip step 9 (the "Apply to Totals" UI toggle).
- `Filter::GetCaseSensitive` → `LIKE` vs `ILIKE` on wildcard filter.

**Immediate consequence.** A dimension filter does NOT filter a FIXED LOD unless promoted to Context. Every Tableau user burns themselves on this in month 1. See Part XXV for the UX implication.

## IV.8 — Context filter mechanics

- Shares storage with a *filter store* (`FilterStore`, `CreateFixedSetCmd`, `SetFilterScopeInFilterStoreCmd`). `ExtractFilterStoreId` per DS.
- Legacy RDBMS: `#Tableau_Temp_` materialised with filtered IDs; subsequent queries INNER JOIN to it. `TabProtosrv` orchestrates.
- Hyper: same plan expressed as CTE; no temp table (Hyper is in-process).
- When to promote to Context: (a) filter narrows heavily, (b) later top-N or FIXED LOD depends on it, (c) shared across many sheets.

## IV.9 — Filter-card domain modes

Quick Filter "show values" options:
- **All Values in Database** — `SELECT DISTINCT field FROM DS` (no filters).
- **All Values in Context** — applies Extract + DS + Context filters only.
- **Only Relevant Values** — applies all current-sheet filters *other than this one* + action filters.

## IV.10 — Query cache (two-tier, LRU)

`tabquerycache.dll`:
- `AbstractQueryCacheKey` = `{datasource, relation-tree, predicate, projection, groupBys, order, aggTypes}`.
- `LRUQueryCachePolicy(maxSize)` — LRU by byte budget.
- Tiers:
  - `InProcessLogicalQueryCache` — tabpublic.exe local.
  - `ExternalLogicalQueryCache` — Server-side.
- `HistoryTrackingCache` — tracks which upstream change invalidated which entry (invalidation reasoning).
- `ExternalQueryCacheFileBasedConnectionTTLSec` — per-connection TTL.
- `ExternalMetadataCacheTTLSec` — metadata TTL.
- Browser-side: `view-data-table-cache-id` per view.

Dashboard render path: 10 sheets → 10 queries dispatched → `tabquerycache` dedupes equivalent queries (same key) → wins become fan-in. `tabquerybatchproc` orchestrates a `QueryBatch` for related queries.

## IV.11 — Query categories (telemetry)

`QueryCategory` enum: `MDX_SETUP`, `MDX_VALIDATION`, `NOW`, `FILTER`, `IMPERSONATE` (RLS user impersonation), `HYPER_STREAM` (streaming Hyper reads).

---

# Part V — Calculated Fields + LOD + Table Calculations

## V.1 — Function catalogue (from `tabvizengine` symbols)

| Category | Functions |
|---|---|
| Aggregate | `SUM`, `AVG`, `COUNT`, `COUNTD`, `MIN`, `MAX`, `MEDIAN`, `ATTR`, `STDEV`, `STDEVP`, `VAR`, `VARP`, `PERCENTILE`, `KURTOSIS`, `SKEWNESS`, `COLLECT` (spatial) |
| Logical | `IF`, `CASE`, `IIF`, `IFNULL`, `ZN`, `ISNULL`, `NOT`, `IN` |
| String | `LEN`, `LEFT`, `RIGHT`, `MID`, `REPLACE`, `UPPER`, `LOWER`, `LTRIM`, `RTRIM`, `TRIM`, `STARTSWITH`, `ENDSWITH`, `CONTAINS`, `SPLIT`, `FIND`, `REGEXP_EXTRACT`, `REGEXP_MATCH`, `REGEXP_REPLACE` |
| Date | `DATEDIFF`, `DATETRUNC`, `DATEPART`, `DATEADD`, `DATENAME`, `MAKEDATE`, `MAKEDATETIME`, `MAKETIME`, `NOW`, `TODAY`, `YEAR`, `QUARTER`, `MONTH`, `WEEK`, `DAY`, `HOUR`, `MINUTE`, `SECOND`, `WEEKDAY` |
| Type conversion | `STR`, `INT`, `FLOAT`, `BOOL`, `DATE`, `DATETIME` |
| User | `USERNAME`, `FULLNAME`, `USERDOMAIN`, `ISFULLNAME`, `ISUSERNAME`, `ISMEMBEROF`, `USER` |
| Table calc | `RUNNING_SUM/AVG/MIN/MAX/COUNT`, `WINDOW_SUM/AVG/MIN/MAX/MEDIAN/STDEV/VAR/PERCENTILE/CORR/COVAR`, `INDEX`, `FIRST`, `LAST`, `SIZE`, `LOOKUP`, `PREVIOUS_VALUE`, `RANK`, `RANK_DENSE`, `RANK_MODIFIED`, `RANK_UNIQUE`, `RANK_PERCENTILE`, `TOTAL`, `PCT_TOTAL`, `DIFF`, `IS_DISTINCT`, `IS_STACKED` |
| LOD | `FIXED`, `INCLUDE`, `EXCLUDE` |
| Spatial | `MAKEPOINT`, `MAKELINE`, `DISTANCE`, `BUFFER`, `AREA`, `INTERSECTS`, `OVERLAPS`, `DIFFERENCE`, `UNION`, `COLLECT` |
| Passthrough | `RAWSQL_*` (dialect-specific literal) |
| Analytics ext | `SCRIPT_REAL`, `SCRIPT_STR`, … (for TabPy / Einstein / R / Generic API) |

## V.2 — LOD semantics & ordering

```
{FIXED [dim1], [dim2] : SUM([m])}   — evaluated at fixed dims regardless of viz
                                       Step 4 in filter order (after context, before dim)
                                       Emitted as correlated subquery on fixed dims,
                                       joined back on matching keys
                                       EXPENSIVE on high-cardinality fixed dims

{INCLUDE [dim] : SUM([m])}          — adds [dim] to viz dims for a sub-aggregation
                                       Step 6 in filter order (after dim, before measure)
                                       Emitted as window/OVER expression (OverQueryFunction)

{EXCLUDE [dim] : SUM([m])}          — removes [dim] from viz dims
                                       Step 6 in filter order
                                       Emitted as window/OVER expression
```

`JoinLODOverrides` = per-viz override set written into `.twb` XML.

Warn users: to make a dimension filter affect a FIXED LOD, right-click → Add to Context.

## V.3 — Table calculations (addressing vs partitioning)

From `tabdoctablecalc`:
- **Addressing** (`AddAddressingFieldSelection`) = dims the calc walks along.
- **Partitioning** (`AddRestartEveryOption`) = dims inside which the calc resets.
- Default addressing = `IDS_TABLECALC_ORD_PANEUNORDERED` (all fields in pane, unordered). This is "Compute using → Table (across)".
- "Specific Dimensions" = user picks addressing checklist explicitly; remaining = partitioning.
- `SortDirection` walker index: `SetSortDirectionIndex@RankTableCalcPresModel`.

## V.4 — Viz level of granularity

```
granularity = union(
    fields on Rows (dimension pills only),
    fields on Columns (dimension pills only),
    fields on Detail,
    fields on Path,
    fields on Pages,
)
```
Excludes Filters shelf. Measure pills excluded. Computed by `VisualFieldExtractor::GetReferencedFields`.

## V.5 — Null handling

Default null behaviour: NULL dim values show as "Null" indicator on axes (optional "hide null" indicator). NULL measures skipped from aggregation unless explicitly counted (`COUNT` excludes; `COUNTD` excludes; `ZN` coerces to 0).

---

# Part VI — Parameters

## VI.1 — Types and domains

```
ParamType   = string | integer | float | boolean | date | datetime
ParamDomain = { kind: 'all'    }
            | { kind: 'list',  values: [v…], source: 'static'|'fromField'|'fromParameter' }
            | { kind: 'range', min, max, step, bindTo?: FieldAggregate }
```

## VI.2 — Control UI per type

| Type | Valid controls |
|---|---|
| String | Type-in, Dropdown, Compact List, Radio |
| Integer / Float | Type-in, Dropdown, Compact List, Radio, Slider (range only) |
| Boolean | Dropdown, Radio |
| Date / DateTime | Type-in, Datepicker |

Anchored vs floating: parameter control placement on dashboard is a regular dashboard zone (`parameter-control` `DashboardObjectType`).

## VI.3 — Parameter Actions

On mark hover/select, set parameter to `<source field aggregate>`. Aggregations: `ATTR`, `SUM`, `AVG`, `COUNT`, `COUNTD`, `MIN`, `MAX`. Multi-mark: `ATTR` returns `*` on non-unique, others return the aggregate over selection.

## VI.4 — Reference in calcs

Textual substitution at query build time via `QueryExpressionFormatter::SetIncludeTypeInfo`. Substitution grammar: `<Parameters.ParamName>` in Custom SQL; `[Parameters].[ParamName]` in calc editor. Values formatted via `DataValue::FormatAsLiteral` (safe quoting).

**Security note.** String substitution (not prepared statement) means parameters can change query shape (GROUP BY, JOIN). Must go through `FormatAsLiteral` to avoid injection. Validator MUST re-validate substituted SQL.

## VI.5 — Reset vs Current vs From-field refresh

- "Current value" = what the parameter is right now.
- "Default value" = value stored in workbook; Reset returns here.
- "From field" refreshes: on workbook open + manual refresh only. Extract refresh does NOT refresh parameter domain.

## VI.6 — Per-user state on Server

Yes, Tableau Server persists per-user parameter state for a view ("Custom Views"), but NOT across sessions for an embedded view without JWT identity.

---

# Part VII — Sets

## VII.1 — Three kinds

From `HierarchySetFunction` / `NamedSetSetFunction` / `ExtractSetFunction` / `FilterSetFunction`:

| Kind | Storage | Membership computation |
|---|---|---|
| **Fixed** | `<set-function kind='Fixed' members='…'>` literal list | Pre-computed, cached per DS |
| **Conditional** | `FilterSetFunction::GetPredicate` calc-expression | Recomputed at query time (SQL predicate) |
| **Top N** | `TopOneSet`/`TopN` with measure + sort + N (or %) | Recomputed at query time |

## VII.2 — Set Actions

`GroupEditBehavior` enum:
- `Add` → append selected marks' keys.
- `Remove` → drop selected keys.
- `Assign` → replace set with exactly the new selection (= "Replace"; names are synonyms internally).

`OnClear` enum: `KeepInSet` | `RemoveFromSet` | `AssignMembership`.

## VII.3 — Combined sets

`BuildEditCombinedSetDialogPresModel`. Operators: **union**, **intersection**, **difference** (A−B). Same-dimension only. Combined set = new set entity in `<datasource>`, persisted separately. Membership recomputed lazily.

## VII.4 — IN/OUT indicator

Synthetic boolean dimension. `FieldAggregationType["InOut"] = "in-out"`. When a set is dragged onto any shelf, default is IN/OUT aggregation. Works on Color, Detail, Filter, Rows, Columns.

## VII.5 — Set as direct filter

- Categorical set → `WHERE field IN (…members…)` IN-list.
- Conditional / Top-N set → `WHERE EXISTS (…subquery…)`.

Cross-DS: sets are per-DS. Don't cross boundaries even under relationships.

---

# Part VIII — Filters (the four kinds)

## VIII.1 — FilterType enum (exhaustive)

| Kind | Driver | Key parameters |
|---|---|---|
| `categorical` | Set of member values | `FilterValues`, `IsExcludeMode`, `FilterUpdateType` |
| `hierarchical` | Path through hierarchy | `FilterLevels`, `HierValSelectionModels` |
| `range` | Continuous min/max | `FilterRangeMin`, `FilterRangeMax`, `FilterRangeNullOption` |
| `relativeDate` | Window relative to anchor | `AnchorDate`, `PeriodType`, `DateRangeType`, `RangeN` |

UI surfaces (dropdown / checkbox list / slider / relative-date picker) are **view presentations** of these four types, not separate classes.

## VIII.2 — Dimension vs Measure discrimination

`CategoricalFilterModel` vs `QuantitativeFilterModel` classes.
- `role='dimension'` → categorical (WHERE).
- `role='measure'` → quantitative (HAVING if aggregated, WHERE if disaggregated via `IsDisagg`).
- Same field used both ways → two distinct Filter records with different scopes.

## VIII.3 — Wildcard / By-formula

- **Wildcard** → `LIKE` (or `ILIKE` depending on `GetCaseSensitive`). Modes: contains / starts-with / ends-with / exactly matches.
- **By formula** → wraps Tableau-calc in `WHERE (formula)` translated to SQL.

## VIII.4 — Custom SQL + parameters

`<relation type='text'>` accepts Custom SQL. Parameter reference grammar: `<Parameters.ParamName>`. Binding = string substitution (not prepared statement). Must go through `FormatAsLiteral`.

---

# Part IX — Dashboard Layout System

## IX.1 — Zone on-wire shape

```ts
interface DashboardZone {
  zoneId: number;
  name: string;
  zoneType: "viz" | "filter" | "dashboard-object" | "legend" | "set-membership" | "layout";
  dashboardObjectType?: DashboardObjectType;  // if zoneType is dashboard-object
  x, y, w, h: number;                         // position in dashboard coordinate space
  isFloating: boolean;
  fieldId?: string;                            // for filter / legend / parameter zones
}
```

Pair validity: `IsValidZoneAndDashboardObjectTypeCombination(zt, objType)` — not every combo is legal.

## IX.2 — Tiled vs Floating

- **Tiled** (`isFloating=false`): participates in implicit container tree. Containers are horizontal / vertical; children partition the main axis. Fixed-size children consume pixels first; weighted children share the rest: `cellSize = (container - sum_fixed) × weight / sum_weights`. Response to resize via `FlowLayoutInfo::SetCellSize(w,h)`.
- **Floating** (`isFloating=true`): absolute `(x, y, w, h)` on top of tiled layer.

Batch resize via verb `MoveAndResizeZones` with `DashboardObjectPositionAndSizeUpdateList`.

## IX.3 — Containers

Horizontal / Vertical flow:
- `GetMinWidth/Height`, `GetMaxWidth/Height` per zone.
- "Distribute evenly" — ignores per-child weights, equal shares.
- "Fit width/height" (sheet zone) — forces worksheet viewport to match.

## IX.4 — Dashboard size modes

`DashboardSizingMode`:
- **Fixed** — absolute dimensions, presets (`Desktop Browser`, `Generic Mobile`, `Tablet`, `Laptop`, `Phone`) via `SetFixedSizePresetIndex`.
- **Range** — min/max, tiled zones redistribute inside range.
- **Automatic** — scales to viewport, reflows.

## IX.5 — Device layouts

Per-dashboard, per-device layout records: `LayoutDoc(SheetLocator, DashboardDeviceLayout)`. `DashboardDeviceLayout` enum: `Default`, `Desktop`, `Tablet`, `Phone`.

Each device layout is a separate layout tree **inheriting from base Desktop**. Overrides: zone positions, sizes, visibility. Zone present on Desktop but "hidden on Phone" → device layout marks `HiddenByUser=true` on zone; data pipeline still runs, only rendering suppressed.

Auto-gen: `AutoGeneratePhoneLayoutCmd` (stack-first heuristic). Switch to manual: `SetManualLayoutModeCmd`. Opt-out: `ToggleIncludePhoneLayoutsCmd`.

## IX.6 — Padding, background, border

- **InnerPadding** (default ~4px) — between zone border and content, also between container children.
- **OuterPadding** — between zone and container; reserved as `outer + cell + outer` per child by flow container.
- **StyledBox** per zone: background colour, border, shadow. Containers have their own StyledBox; per-child override possible.

## IX.7 — Show/hide container

First-class feature: `SetZoneVisibility` verb + `ZoneIdsVisibilityMap` parameter. Button dispatches the verb. Parameter-driven visibility uses a parameter-change action that fires `SetZoneVisibility`.

---

# Part X — Dashboard Objects Catalog

`DashboardObjectType` (exhaustive):

| Type | Role |
|---|---|
| `worksheet` | Embeds a worksheet |
| `quick-filter` | Interactive filter UI tied to a field |
| `parameter-control` | Parameter editor |
| `legend` | Color / size / shape legend |
| `page-filter` | Pages-shelf control (animated scrubber) |
| `title` | Sheet / dashboard title block |
| `text` | Static rich text (`formatted-text`) |
| `image` | Static or URL-referenced image |
| `web-page` | Embedded web view (`<webview>` via QtWebEngine) |
| `extension` | Dashboard Extension, loaded via `.trex` manifest |
| `blank` | Spacer |
| `navigation-button` | Go-to-sheet/dashboard button |
| `download-button` | Export button (PDF / image / crosstab / data) |
| `ask-data` | Ask Data launcher (deprecated 2024) |

Text object: rich text with inline parameter / field references via `<Parameters.Param>` / `<Field>` substitution. Rich formatting via `formatted-text` markup.

Image object: static file (embedded in `.twbx`) OR URL. Can trigger actions on click (image-as-navigation-button).

Web page: dynamic URL allowed, can reference parameters. Sandboxed by QtWebEngine; CSP applies.

Navigation button / Download button: configurable via `ButtonConfigDialogPresModel` + `DashboardButtonImageUtils`. Open in new tab supported.

---

# Part XI — Actions Subsystem

## XI.1 — Taxonomy (six kinds)

From `tabdocactions`:

| Kind | Dialog |
|---|---|
| Filter | `FilterActionDialogPresModel` |
| Highlight | `HighlightActionDialogPresModel`, `UpdateBrushActionPresModel` |
| Go to URL | `HyperlinkAction`, `LinkSpecification` |
| Change Parameter | `EditParameterActionPresModel` |
| Change Set | `EditSetAction` |
| Go to Sheet / Navigation | `EditNavigationActionPresModel`, `GoToSheetActionDialogPresModel`, `UpdateSheetLinkActionPresModel` |

## XI.2 — Trigger modes

`ActivationMethod`: `Hover` | `Select` | `Menu`.
- `Hover` — `OnHover.cpp`, debounced via `StartHoverTimer`.
- `Select` — `OnSelectAction.cpp`. `RunOnSingleSelect` flag: single-only vs any-selection.
- `Menu` — fires only from context menu.

Multi-select: if `RunOnSingleSelectIsChecked=false`, fires with all selected values.

## XI.3 — Source-field mapping

`UpdateActionSourcePresModel`:
- **Selected Fields** — explicit map `source → target`.
- **All Fields** — name-match; mismatched field = action silently skips; warning surfaced via `ComputeActionWarningsCommand`.

## XI.4 — Target filter on deselect

`OnClear` enum:

| Value | SQL effect |
|---|---|
| `KeepFilteredValues` | Filter stays as last-applied |
| `ShowAllValues` | Filter predicate dropped |
| `ExcludeAllValues` | `WHERE 1=0` on target sheet |

## XI.5 — Highlight mechanics

Primarily **client-side** mask:
- `VizDataPresModel` already has all marks; selection state applies as mask; non-matching marks render with reduced opacity via `InteractiveSceneRenderer::HoverRegion`.
- If source dim not present in target grain, target re-queries to fetch the dim, then masks locally.
- Target keeps its own colour encoding; only opacity / dim affected.

## XI.6 — Cascade + cycle guard

Actions can cascade. `HoverClearActionsFinishedMsg` fires after all settle. Cycle guard: action cannot re-apply to its source sheet with same payload in same tick. `AsyncCommandQueue` deduplicates queued commands.

## XI.7 — URL action template

From `LinkSpecification`:
- Placeholder: `<FIELD_NAME>` (angle brackets, not curly) or `<Parameters.ParamName>`.
- `ShouldURLEscape` default `true` → percent-encoding (space → `%20`).
- NULL → empty string.
- Multi-select → delimiter (`,` default) via `GetDelimiter`.
- Per-value escape char (`\` default) via `GetEscape`.
- `AllowsMultiSelect` — if false, single-select only.
- `UrlActionTargetType`: `BrowserNewTab` | `BrowserSameTab` | `InPlace` (embedded web object).

## XI.8 — Go to Sheet

Via `UpdateSheetLinkActionPresModel`:
- Target can be dashboard / worksheet / story.
- **Does NOT scroll within current dashboard.** Always navigates at workbook tab level.
- What people mistake for in-dashboard scroll is actually a `ShowHideContainerAction` driven by `SetZoneVisibility`.

## XI.9 — Action UI layer separation

`tabuiactions` (Qt widget layer) sits atop `tabdocactions` (headless semantics). Mirror this: action logic as pure state machine, UI on top.

---

# Part XII — Tooltips, Drill, Annotations

## XII.1 — Default tooltip

Ordered composition:
1. Header line: source sheet title.
2. Dimensions on marks card, in shelf-order, with field captions.
3. Measures on marks card, in order, with aggregation + value.
4. Command buttons: Keep Only / Exclude / View Data / Group Members.

## XII.2 — Custom tooltip

Syntax: rich-text grammar with inline field references `<Field>`, parameter references `<Parameters.Param>`, and conditional visibility via nested tags. Command buttons insertable.

## XII.3 — Viz in Tooltip

`<Sheet name='…' maxwidth='…' maxheight='…' filter='<AllFields>'/>` inline in tooltip markup. Renders the named worksheet inside the tooltip, inheriting the hover context's mark as a filter (or `<AllFields>` = all fields from source row).

## XII.4 — Drill down / up

Hierarchy drill: precomputed (data already returned for all levels). `+`/`-` affordance on header. Keyboard shortcut: Alt+Click.

## XII.5 — Keep Only / Exclude

Keep Only → `WHERE field IN (selected values)` added to filters shelf.
Exclude → `WHERE field NOT IN (selected values)` (or `IsExcludeMode=true` on categorical filter).
Merges with existing filter on that field.

## XII.6 — Annotations

`CreateAnnotation`, `GetAnnotations`, `RemoveAnnotation` verbs. Kinds: Mark (tied to specific mark), Point (axis coordinate), Area (rectangle). Persisted in `.twb`.

---

# Part XIII — Analytics Pane

## XIII.1 — Catalogue

From `tabdocaxis!ReferenceLineSpecification` + `tabdoctrendline` + `tabdocclusteranalysis` + `tabdocforecast`:

- Constant Line (fixed value)
- Average Line (axis avg)
- Median
- Reference Line (single value + aggregation)
- Reference Band (two values + shading)
- Reference Distribution (N percentiles + confidence %)
- Box Plot (via reference distribution + percentages)
- Totals / Grand Totals / Subtotals
- Trend Line
- Forecast
- Cluster
- Drop Lines (UI feature, not separate subsystem)

## XIII.2 — Trend line

`TrendLineFitType`: Linear | Logarithmic | Exponential | Power | Polynomial (degree 2–8). Fit: least-squares only. R² / p-value / SSE surfaced per factor via `FieldCaptionPairStatePresModel`. Confidence bands toggle via `GetEnableConfidenceBands`.

## XIII.3 — Forecast

Holt-Winters exponential smoothing. Models tried: level-only, level+trend, level+seasonality, level+trend+seasonality × additive/multiplicative. Auto-selected by AIC. Confidence interval via `GetConfidenceBands`.

## XIII.4 — Cluster

K-means. k auto-chosen by Calinski-Harabasz (exposes F-statistic, TotalSumOfSquares, WithinGroupSumOfSquares). Variables from marks card (minus Color/Shape which become output encoding), user-configurable. `SetDisaggregateFlag` allows per-row clustering.

## XIII.5 — Explain Data / Pulse

- **Explain Data** — curated regression + correlation rule set. Not LLM. Fails gracefully via `ExplainData_Invalid_*` error codes.
- **Pulse** — metric-focused summarisation. NL front-end via `ConversationRequestHandler` + `AINotionalSpecResponse` (LLM-backed 2024+). Scope restricted to declared metrics — why it hallucinates less.

---

# Part XIV — Formatting, Rich Text, Number/Date Grammar

## XIV.1 — Precedence

Most-specific wins: **Mark > Field > Worksheet > Data Source > Workbook**.

## XIV.2 — Number format grammar (Excel-derived)

| Pattern | Effect |
|---|---|
| `#,##0` | Integer with thousands separator |
| `#,##0.00` | Fixed 2 decimals |
| `0.0%` | Percent with 1 decimal (value × 100) |
| `$#,##0;($#,##0)` | Currency with negative in parens (two sections) |
| `0.##E+00` | Scientific |
| `[USD]#,##0.00` | Custom currency |

Sections separated by `;`: positive;negative;zero;text.

## XIV.3 — Date format grammar (ICU)

Tokens: `yyyy`, `yy`, `MM`, `MMM`, `MMMM`, `dd`, `E`/`EE`/`EEE`, `HH`, `hh`, `mm`, `ss`, `a`. Observed skeletons: `yyyyMd`, `yyyyMdhm`, `yyyyMdHm`, `yyyyMdhms`, `yyyyMdHms`, `yyyyMMMM`, `EEEEE`.

## XIV.4 — Conditional formatting

Two mechanisms only:
1. **Color → Edit Colors** → stepped / diverging palette. Numeric measures only. Native.
2. **Calculated field returning boolean/string** → placed on Color encoding.

No per-cell rule engine like Excel.

## XIV.5 — Shading / borders / dividers

Per container / sheet / field / pane. `ShowColumnBanding` / `ShowRowBanding`. Pane line thickness, axis ticks, zero lines, divider thickness — all configurable.

## XIV.6 — Rich text (formatted-text) grammar

From `tabstylemodel.dll`:
- Style properties: `font-family`, `font-size`, `font-weight`, `font-style`, `color`, `background-color`, `text-decoration`, `text-align`, `line-height`.
- Serialisation: `<formatted-text><run style='…'>text</run></formatted-text>` nested.
- Appears in: title blocks, text objects, tooltip custom text, caption, annotation content.
- `LineStyle` controls borders, axis lines, reference lines (weight, dash pattern, color).
- `StyledBox` controls zone / container chrome (background, border, shadow).

## XIV.7 — Theme system

`StyleTheme` enum + `StyleThemeTelemetry::CaptureApplyCustomThemeEvent`. Built-in themes ship; user can apply custom theme via a workbook-wide style pack.

---

# Part XV — Data Sources, Extracts, Refresh, RLS

## XV.1 — Extracts (.hyper)

Column-store, compressed. `hyperd.exe` in-process. Extract recommended when: live DB slow, offline work, cross-DB joins (pre-2020.2), Public workbooks (Public requires extract for most sources).

Refresh schedule: `extractUpdateTime` on DataSource. Server-driven on weekly/daily.

## XV.2 — Incremental refresh

Requires monotonic field (timestamp or increasing ID). Rows updated *after* the incremental window are silently missed. Full refresh to reconcile.

## XV.3 — Row Level Security via Virtual Connections (2021.4+)

**Architecture:**
```
User queries Workbook
  → VizQL emits query
  → QueryableResourceResolver wraps each referenced table with
    FilterOperation(predicate based on user context)
  → resolved table plan feeds minerva logical plan
  → SQL emitted → database
```

**Core types:**
- `QueryableResourceResolver::ObtainTable(TString, TString, TString, Permission, TString)`.
- `VirtualConnectionResolvedTable` = physical table + policy predicates.
- `VirtualConnectionTableInfo` + `DataPolicy` references.
- `Permission` enum: `Read`, `ReadWrite`, `Admin` (inferred).

**`tableau.queryableresource.v1` protobuf** operator set:

| Op | Purpose |
|---|---|
| `FromOperation` | Source table |
| `ProjectOperation` | Projection + renames + calculated columns |
| `FilterOperation` | Row filter (RLS predicate) |
| `JoinOperation` | Joins |
| `LimitOperation` | LIMIT |

Policy predicate = Tableau-calc syntax with user-context functions (`USERNAME`, `ISMEMBEROF`). Evaluated per-user on every query.

Data Catalog integration: `tabdocdatacatalog` surfaces Data Policy descriptions to authoring UI.

## XV.4 — Governance features (Server-only)

Data Quality Warnings, Certified Data Sources, Lineage — Server-side. Desktop has hooks but not UX.

---

# Part XVI — Extensions API

Two surfaces loaded by the hybrid host:

## XVI.1 — Dashboard Extensions

Iframe-hosted web apps embedded as an `extension` zone.
- Bootstrapped via `InitializeExtension`.
- Locator: `{ instanceId, sheetPath, addInType: 'dashboard' }`.
- See only Shared API (no workbook re-authoring).

## XVI.2 — Viz Extensions (worksheet-level)

Register as mark renderer.
- Locator: `{ instanceId, visualId, addInType: 'worksheet' }`.
- Signalled by `MarkType.viz-extension` + `EncodingType.custom` + `customEncodingTypeId`.
- Can declare bespoke encoding channels.

## XVI.3 — Analytics Extensions (external ML)

`AnalyticsExtensionTableInfoPresModel`. Connection types: `TABPY`, `EINSTEIN`, `GENERIC_API`. For external Python / R / REST ML services.

## XVI.4 — `.trex` manifest schema

Fields (from `plugin-host-desktop.rcc` parser):
- `manifest-version`, `type`, `dashboard-api-version`
- `name`, `description`, `author`, `author-email`
- `icon` (base64)
- `source-location` — URL of the extension host page
- `permissions` — `read-only` | `full-data`
- `configure-url` — right-click Configure dialog URL
- Context-menu entries

Signing: `.taco` via `tacosignatureverifier.jar` (JVM).

## XVI.5 — Verb gating

Host negotiates which `VerbId`s are callable. Default: read-only + shared subset (filters, selections, get-data, `DisplayDialog`, `SaveExtensionSettings`). Destructive verbs (`DownloadWorkbook`, `ExportPdf`, `SetVizStateWithDataModel`, `MoveAndResizeZones`) gated by user permission and extension trust level. `BlockExtension` toggles.

---

# Part XVII — Undo, Deltas, File-Format Migration

## XVII.1 — Undo stack

Single workbook-level stack. Granularity: per-command (one `Action*` class = one step). A shelf drag coalesces into one step via delta coalescing.

## XVII.2 — Revert

- `RevertWorkbook` — reverts to last saved `.twb` on disk.
- `RevertStoryPoint` — reverts current story point to saved state.

## XVII.3 — Delta primitives

`Deltas::` namespace: `HighlightDelta`, `PageDelta`, `ParameterDelta`, `ShelfSortDelta`, `StylesDelta`, `ZoneTextDelta`, `FilterDelta`, `FilterMsgEdit`. Common interface `IHistoryElement`.

Flow: user gesture → N deltas → coalesced into one `WorkbookCommittedEdit`.

## XVII.4 — File format version migration

```
.twb (version V_disk) → parse DOM (tabcorexml)
                       → Upgrade(DOM, XmlFileType, V_current)
                         applies each TransformNames::X migration in order
                       → workbook in memory (V_current)
                       → edits
                       → Downgrade(DOM, XmlFileType, V_target)
                         applies inverse migrations when saving-as-older
                       → .twb (V_target)
```

**Key API:**
- `FileFormatCompatibility::Upgrade(DOM, XmlFileType, VersionNumber)`.
- `FileFormatCompatibility::Downgrade(…)`.
- `FileFormatCompatibility::PreviewDowngrade` — dry-run, reports what is lost.

**`XmlFileType` enum:** `.twb`, `.tds`, `.tms`, `.twds`, `.tfl`.

**`TransformNames` examples:** `ParameterAction`, `CascadingFilters`, `Sankey`, `RefreshableParameterRanges`, `ObjectModelEncapsulateLegacy`, `MapAttribution2`, `AccessibilityEditableAltText`, `SheetIdentifierTracking`, `Hyper_NormalizedExtracts`, `VariableWidthTable`, `SymmetricLogAxis`, `SpatialKMZSupport`. Each is a named bidirectional migration.

**Principles.**
1. Migrations are **named**.
2. **Bidirectional** (Upgrade + Downgrade).
3. **Pluggable** (pre-downgrade + telemetered).
4. **Canonical serialisation** — same input in → same bytes out per version.

---

# Part XVIII — Server / Workgroup / Publishing

Tableau Server / Cloud internal name: "Workgroup server" (legacy).

## XVIII.1 — Desktop-side client (`tabworkgroup.dll`)

- `WorkgroupConnection` — one authenticated session.
- `GetServerTransformCapabilities` — which `TransformNames` the server supports.
- `SupportedServerFunctionality::MustDowngradeToPublish` — tells Desktop to downgrade before publishing.
- `WorkgroupAPICache` — per-endpoint URL spec cache, session ID, restricted-server flag.
- `TenantNameCache` — multi-tenant (Tableau Cloud).
- `PublishingMetrics` / `PublishingClientMetric` — telemetry on publish (bytes, durations, per-step).

## XVIII.2 — Auth providers

`PluginOAuthProvider`, `MSASOAuthProvider`, `SessionAuthProvider`. JWT / Connected Apps / OAuth shipped; protocol details not fully extractable from Public install.

## XVIII.3 — Permissions

Project → Workbook → View hierarchy. Roles: Viewer, Explorer, Creator, Site Admin. `Permission` enum gates `ObtainTable`.

## XVIII.4 — Subscriptions vs Data-Driven Alerts

Separate mechanisms:
- **Subscription** = time-based (email me this dashboard every Monday).
- **Alert** = threshold-based (email me when a metric crosses X).

---

# Part XIX — Performance, Cache, Telemetry

## XIX.1 — Anti-patterns (from `ExtractLODValidator` + `tabdocrecommendations`)

1. **FIXED LOD on high-cardinality dimension** — correlated subquery blows up.
2. **Many Quick Filters with "Only Relevant Values"** — N² domain queries per filter change.
3. **Unnecessary Context filter** — promotes a cheap filter into a materialised temp table, slowing things.
4. **Custom SQL with parameter substitution changing relation tree** — defeats cache.
5. **Dashboard with 20+ sheets on same DS without shared filters** — fan-out fetch.
6. **Blending across DSs when relationships work** — blending is client-side join.
7. **ATTR aggregation on high-cardinality dimension** — post-fetch reduce.

## XIX.2 — Recommended limits

- Max marks per viz: ~100k interactive, ~1M hard cap.
- Max sheets per dashboard: ~20 for acceptable load.
- Extract size (Public): 15M rows / 1 GB.

## XIX.3 — Performance recording

Desktop menu "Start Performance Recording" writes `.tlog`. Events: `QueryStart`/`QueryEnd`, `RenderStart`/`RenderEnd`, `LayoutStart`/`LayoutEnd`, per-sheet `ComputeLayout` / `Render` spans. Profiler UI is a workbook template (`Performance Analysis.twb`) that renders the recording.

## XIX.4 — Telemetry event catalogue

From `tabtelemetry`:
- `TelemetryEvent` (base: category, severity, flags, timestamp).
- `ProductUsageEvent` — user actions.
- `StartupEvent` — app launch.
- Standard properties: `tfbIndex` (feature bucket for A/B), OS name/version, machine ID, product version.

Separate pipeline: `tabtuaclient` (Tableau Usage Analytics) — customer-facing analytics (which dashboards/users/sheets accessed), distinct from product-engineering telemetry.

---

# Part XX — Animation Framework

From `tabanim`:

- `Animation` — time-based transition.
- `MarkAnimation` / `MarkAnimationController` — per-mark enter/exit/move/attribute-change.
- `NonMarksAnimationController` — axes, grid lines, labels.
- `AreaMarkAnimationHelper` — specialized for area marks (handles null-replacement during interpolation).
- `PaneAnimationInfo` — per-pane state.

## XX.1 — Animation parameters

- `AnimationType`, `AnimationStyle` (sequential/simultaneous), `Duration` (ms), `Delay` (ms), `FractionWarperCurve` (easing).
- `OverallTiming`, `AttributeOverrideTiming`.

## XX.2 — Animated quantities

Pane geometry: `PaneRectLeft/Right/Top/Bottom/OriginX/OriginY`. Heatmap: `HeatmapMinValue/MaxValue`. Axis ticks, sort direction, divider colour. Grid transitions (`CreateGridTransitionAnimation`). Axis re-scale (`GetAxisTransitionTimings`).

## XX.3 — Replay

`ReplayAnimation` verb with `ReplaySpeed` parameter. Same pipeline as initial fire.

---

# Part XXI — Rendering Pipeline (process chain)

```
tabpublic.exe (Qt5 widgets, main window, sheet tabs)
├── QtWebEngine (Chromium)
│   └── vizclient JS (HybridUI/vizclient-static-assets.rcc)
│       consumes PresModel → React/D3-ish DOM → <canvas>/SVG
│       extensions via plugin-host-desktop.rcc
├── hyperd.exe (Hyper DB) — backs .hyper extracts
├── tabprotosrv.exe — connector / protocol bridge (non-Hyper)
├── JVM services (bin/jre):
│   ├── jdbcserver.jar
│   ├── oauthservice.jar
│   └── tacosignatureverifier.jar
├── yaxcatd.exe — catalog / analytics side
└── tabcrashdumper.exe, tabcrashreporter.exe
```

Resource loading via Qt `.rcc` virtual filesystem. `bin/qt.conf` pins `Plugins=plugins`. Locale resources in `bin/res/<locale>/*.rcc` + `bin/res/tablangres.rcc`.

## XXI.1 — Scene model (from App P)

`tabvizrender` wraps the scene graph. Render passes: layout → draw (canvas/SVG) → hit-testing. `InteractiveSceneRenderer` owns pointer events (hover, click, pan, rect-drag, lasso, radial). Draw context backends: 2D canvas + SVG per-mark.

## XXI.2 — Export pipeline

Verbs: `ExportImage`, `ExportPdf`, `ExportPdfDownload`, `ExportPowerpoint`, `ExportCrosstab`, `ExportCrosstabCsvDownload`, `ExportCrosstabExcelDownload`, `ExportData`, `ExportDataDownload`, `DownloadWorkbook`. Options: `ExportPdfOptions`, `ExportCrosstabSheetMap`. PDF export is server-rendered to canonical PDF (not print-screen).

---

# Part XXII — File Format Grammar

## XXII.1 — Extensions

| Extension | Role | Root |
|---|---|---|
| `.twb` | Workbook (XML) | `<workbook>` |
| `.twbx` | Packaged workbook (ZIP: `.twb` + extracts + assets) | — |
| `.tds` | Data source descriptor | `<datasource>` |
| `.tdsx` | Packaged `.tds` (ZIP + extract) | — |
| `.hyper` | Hyper extract DB | binary |
| `.twds` | Web data source spec (OAuth/REST wizard) | `<twds-spec>` |
| `.tms` | Map source (tile server + styles) | `<mapsource>` |
| `.trex` | Dashboard extension manifest | — |
| `.taco` | Signed connector plugin | — |
| `.tfl` | Tableau Prep flow | — |

## XXII.2 — `.twb` shape

```xml
<workbook version='18.1'>
  <datasources>
    <datasource>...TDS grammar inline...</datasource>
  </datasources>
  <worksheets>
    <worksheet name='...'>
      <view>...shelves, marks, filters...</view>
      <style>...</style>
      <layout>...</layout>
    </worksheet>
  </worksheets>
  <dashboards>
    <dashboard name='...'>
      <zones>...zone tree with positions...</zones>
      <actions>...</actions>
      <style>...</style>
    </dashboard>
  </dashboards>
  <stories>...</stories>
  <windows>...open tab state...</windows>
</workbook>
```

Shelves reference data source columns by `<column>` / `<column-instance>` — never duplicate field definitions.

## XXII.3 — `.tds` example

```xml
<datasource version='18.1' formatted-name='Country' inline='true'>
  <connection class='hyper' dbname='GeocodingData.hyper' schema='public'>
    <relation type='join' join='left'>
      <clause type='join'>
        <expression op='AND'>
          <expression op='='>
            <expression op='[Country].[ID]'/>
            <expression op='[LocalData].[ParentID]'/>
          </expression>
        </expression>
      </clause>
      <relation type='join' join='inner'>...</relation>
      <relation name='LocalData' table='[public].[LocalDataCountry]' type='table'/>
    </relation>
    <cols>
      <map key='[Country_Name]' value='[CountrySynonyms].[Name]'/>
    </cols>
  </connection>
  <column name='[Latitude (generated)]' datatype='real' role='measure'
          type='quantitative' aggregation='Avg'
          semantic-role='[Geographical].[Latitude]'/>
  <column name='[Number of Records]' datatype='integer' role='measure'
          type='quantitative'>
    <calculation class='tableau' formula='1'/>
  </column>
  <layout dim-ordering='alphabetic' measure-ordering='alphabetic'
          dim-percentage='0.5' measure-percentage='0.4'
          show-structure='true'/>
</datasource>
```

## XXII.4 — `.tms` shape (map source)

```xml
<mapsource inline='false' version='18.1'>
  <connection class='MapboxVector' server='https://…' port='443'
              data-url='v4' url='styles/v1'
              params-url='https://mapsconfig.tableau.com/v1/config.json'/>
  <map-styles>
    <map-style display-name='Normal' name='normal' wait-tile-color='#f2f2f2'
               display-name-en_GB='…' display-name-es_ES='…'/>
    <map-style name='dark'>
      <map-layer-style name='background_color' request-string='#000000'/>
    </map-style>
  </map-styles>
  <mapsource-defaults version='18.1'>
    <style>
      <style-rule element='map'>
        <format attr='washout' value='0.0'/>
      </style-rule>
    </style>
  </mapsource-defaults>
  <map-attribution copyright-string='© %1 Mapbox' …/>
</mapsource>
```

Localisation via `display-name-<locale>` attributes on any user-facing string.

## XXII.5 — Data Source (`.twds`) shape

```xml
<twds-spec>
  <setup>
    <required>...</required>
    <collect>...</collect>
  </setup>
  <step-definition-s>
    <step-definition id='...'>
      <step action='hardwire_context_kvp'/>
    </step-definition>
  </step-definition-s>
</twds-spec>
```

Drives connection-wizard state machine.

---

# Part XXIII — Command / Verb API Surface

Every mutation goes through verb dispatch. ~100+ verbs grouped:

**Sheet navigation:** `ActivateSheet`, `ActivateStoryPoint`, `ActivateNextStoryPoint`, `ActivatePreviousStoryPoint`, `RevertStoryPoint`, `RevertWorkbook`, `SetSheetSize`, `SetZoneVisibility`, `MoveAndResizeZones`, `SetClickThrough`, `SetAutoUpdate`.

**Filters & parameters:** `ApplyCategoricalFilter`, `ApplyRangeFilter`, `ApplyRelativeDateFilter`, `HierarchicalFilter` (`hierachical-filter` on wire), `DashboardCategoricalFilter`, `ChangeSharedFilter`, `ClearFilter`, `GetFilters`, `GetDashboardFilters`, `GetSharedFilter`, `ChangeParameterValue`, `FindParameter`, `GetParametersForSheet`.

**Pulse (metrics):** `ApplyPulseFilters`, `ApplyPulseTimeDimension`, `ClearPulseFilters`, `GetPulseCategoricalDomain`, `GetPulseTimeDimension`.

**Marks interaction:** `RaiseHoverTupleNotification`, `RaiseSelectTuplesNotification`, `RaiseLeaveMarkNavNotification`, `SelectByValue`, `GetSelectedMarks`, `GetHighlightedMarks`, `ClearSelectedMarks`.

**Data access:** `GetAllDataSources`, `GetDataSource`, `GetDataSources`, `GetDataSourceData`, `GetLogicalTables`, `GetLogicalTableData`, `GetLogicalTableDataReader`, `GetJoinDescription`, `GetUnderlyingTables`, `GetUnderlyingTableData`, `GetUnderlyingData`, `GetDataSummaryData`, `GetDataSummaryDataReader`, `GetDataTableReaderPage`, `ReleaseDataTableReader`, `GetActiveTables`, `GetConnectionDescriptionSummaries`, `RefreshDataSource`.

**Shelf / viz manipulation:** `AddMarksCardFields`, `MoveMarksCardField`, `SpliceMarksCardFields`, `GetVisualSpecification`, `GetVizStateWithDataModel`, `SetVizStateWithDataModel`, `GetEmbeddingAbstractQueryWithDataModel`.

**Annotations:** `CreateAnnotation`, `GetAnnotations`, `RemoveAnnotation`.

**Custom views:** `GetCustomViews`, `ShowCustomView`, `UpdateCustomView`, `SaveWorkbookAsCustomView`, `SetActiveCustomViewAsDefault`, `RemoveCustomView`.

**Export:** `ExportImage`, `ExportPdf`, `ExportPdfDownload`, `ExportPowerpoint`, `ExportCrosstab`, `ExportData`, `DownloadWorkbook`, `GetExportPdfOptions`, `GetExportCrosstabSheetMap`.

**Extensions lifecycle:** `InitializeExtension`, `SaveExtensionSettings`, `BlockExtension`, `AppendExternalMenuItem`, `ExecuteExternalMenuItem`, `RemoveExternalMenuItem`, `RenameExternalMenu`, `DisplayDialog`, `CloseDialog`.

**Other:** `Undo`, `Redo`, `ReplayAnimation`, `GetTooltipText`, `GetFonts`, `GetCurrentSrc`, `GetEmbeddingClientInfo`, `Authenticate`, `Share`, `VizAPI`.

Verb stability is **string-based**. Published typos (`hierachical-filter`, `paremeter-caption`, `quantitative-dmain`, `apply-relative-date-Filter`) cannot be fixed.

---

# Part XXIV — Mental Model: Build a Dashboard End-to-End

1. **Start with a data source.** Write a `<datasource>` with a `<connection>` and a `<relation>` join tree. Define `<column>` entries with `datatype`/`role`/`type`/`aggregation`/`semantic-role`/`<calculation>`. Add `<layout>` for data-pane ordering.

2. **Author worksheets.**
   - Pin primary DS.
   - Populate Columns, Rows shelves (field references, ordered).
   - Populate Marks card encodings (`{fieldEncodingId, encodingType, customEncodingTypeId?}`).
   - Pick mark type.
   - Add Filters shelf items (respecting Part VIII filter-type taxonomy).
   - Add Analytics-pane items (reference lines / trend / forecast / cluster).

3. **Author a dashboard.**
   - Pick sizing mode (Fixed / Range / Automatic).
   - Add zones: worksheet zone per view, plus `quick-filter`, `parameter-control`, `legend`, `title`, `text`, `image`, `web-page`, `extension`, `blank`.
   - Tiled or floating per zone.
   - Optionally add device layouts (Phone / Tablet) that override zone positions / visibility.

4. **Wire interactions.**
   - Filter / Highlight / URL / Change-Parameter / Change-Set / Go-to-Sheet actions.
   - Trigger mode: Hover / Select / Menu.
   - Source-field mapping: Selected Fields (explicit) or All Fields (name-match).
   - Deselect mode: Keep / ShowAll / ExcludeAll.

5. **Story (optional).** Ordered story points, each referencing a sheet snapshot + caption + annotations.

6. **Persist.** Serialise to `.twb` (XML) or `.twbx` (zip with extracts). At runtime the engine re-materializes into PresModels and ships to the client.

**Architectural invariants enforced by this design:**
- Marks and data pipelines **only** live in worksheets.
- `.twb` XML is declarative; only `<calculation>` formulas are executable (evaluated by engine).
- Every mutation is a `VerbId` + typed `ParameterId`s.
- Wire payloads dictionary-encoded (`valueIndices`, `aliasIndices` into `dataDictionary`).
- Optional fields + `customEncodingTypeId` escape hatches permit additive protocol evolution without versioning.

---

# Part XXV — Where Tableau is Weak (Leapfrog Targets)

From the expert's opinion-level assessment:

## XXV.1 — Top 5 things Tableau still does poorly (2026)

1. **Calc editor ergonomics** — tiny textbox, no real autocomplete, no multi-line debug, no test values. Users bounce to external editors.
2. **Version control / diff** — `.twb` XML is technically diffable but not human-reviewable. No canonical serializer. `.twbx` is a zip → breaks git LFS cost curves. No branch / merge.
3. **Dashboard layout UX** — container manipulation is fiddly; Item Hierarchy tree is cramped; guide/snap system is weak; no Figma-like constraints.
4. **Multi-user collaboration** — single-author monolith. No real-time co-editing. Server check-out is not collaboration.
5. **Extract refresh pain on large DBs** — incremental is fragile; full-refresh windows huge; partitioning not native.

Honourable mentions: Ask Data deprecated (brittle NL), Prep/Desktop handoff ceremonies, Story Points underused (awkward authoring), auto-generated phone layout frequently wrong.

## XXV.2 — What power users still do in Excel

- Pivot tables with fast drag rearrangement (Tableau crosstab slower on small data).
- What-if modeling with cell references (parameters don't compose like cells).
- Ad-hoc column calcs without defining a named calculated field.
- Quick custom per-cell number formats.
- Mixed text + numbers + charts in one narrative doc. Story is not a report format.

## XXV.3 — Biggest authoring friction

- **Filter order-of-ops** (Part IV.7) — everyone gets burned by FIXED + Context + Dimension filter interactions in month one.
- **Relationships vs joins** — when to use which.
- **Measure Values** on the right axis with the right format across multiple measures.
- **Actions dialog** — Source/Target wiring is confusing, especially for Set and Parameter actions.
- **Formatting** — finding where a specific format lives (workbook vs sheet vs field vs mark) is hard.

## XXV.4 — AI / NL state

- **Ask Data**: high hallucination, rigid intent matching — deprecated 2024.
- **Pulse**: narrow scope (metric-definition summaries), better grounding because metric space is declared and small, but limited to pre-defined metrics.
- Fallback: both say "I can't answer that" when phrase mismatches. Neither attempts clarification dialog well.

## XXV.5 — Architectural gaps (directly exploitable)

1. **Per-user state as first-class** — not Custom Views bolted on. Workbook should separate authored content from per-user overlays by construction.
2. **Git-native** — canonicalise the proto serializer. Line-diffable workbooks. Proper branch/merge.
3. **Real-time collaboration** — delta/edit architecture is almost CRDT-shaped; make it concurrent.
4. **Modern calc editor** — Monaco everywhere; autocomplete; inline test values; LLM suggestion.
5. **Metrics-first NL** — ground every NL interaction on declared metric/dimension set (what makes Pulse less hallucinatory); apply same discipline broadly.

---

# Part XXVI — Analyst Pro Build Roadmap (ordered)

Given our current state (branch `askdb-global-comp`, Plans 1–3 shipped: foundation, canvas core, canvas polish, actions runtime), the following phases take us to Tableau parity + leapfrog.

## Phase 1 (DONE) — Foundation & Canvas

- Archetype shell, zone tree (tiled + floating), drag/resize, lock/group/align, Object Library, Layout Tree, Layout Overlay.

## Phase 2 (DONE) — Actions Runtime v1

- 6 action types (Filter, Highlight, URL, GoToSheet, ChangeParameter, ChangeSet) — 3 stubbed.
- Mark event bus, cascade executor, ActionsDialog, backend `/actions/fire` endpoint.
- Persistence round-trip.

## Phase 3 (PLANNED — see `docs/superpowers/plans/2026-04-16-*`)

- **4a** Filter injection — wire Filter actions into waterfall router; implement Part IV.7 order-of-ops on our side; 4-kind filter taxonomy (Part VIII.1).
- **4b** Sets subsystem — 3 kinds (Part VII.1), set actions, IN/OUT indicator, set-as-filter IN-list.
- **4c** Parameters subsystem — types + domains + controls + parameter actions + `<Parameters.Name>` substitution with `FormatAsLiteral`.
- **4d** Dynamic Zone Visibility — `SetZoneVisibility` verb equivalent, rule eval (setMembership / parameterEquals / hasActiveFilter).
- **4e** Canvas polish + migration — tree drag-reorder, GoToSheet scroll/focus, legacy→freeform migration.

## Phase 4 — VizQL Engine (new)

Target: our own minerva-equivalent 3-stage compilation pipeline (Part IV).

Tasks:
1. **VisualSpec IR** — struct matching Tableau's shelf + encoding + filter + mark state. Protobuf schema (`askdb.vizdataservice.v1`).
2. **Logical plan** — port `minerva.LogicalOp*` (Project, Select, Aggregate, Order, Top, Over, Union, Intersect, Unpivot, ValuestoColumns, Domain). `DomainType::Snowflake`|`Separate`.
3. **SQL AST** — `SQLQueryFunction` equivalent. Visitor for optimisation passes (AggregatePushdown, CSE, DataTypeResolver, JoinTreeVirtualizer).
4. **Dialect emitters** — DuckDB dialect first (our twin), Postgres, BigQuery, Snowflake. Common base + override pattern.
5. **Filter ordering** — enforce Part IV.7 explicitly at plan-build time.
6. **Query cache** — 2-tier LRU + HistoryTrackingCache for invalidation reasoning.

## Phase 5 — Calc Fields + LOD + Table Calcs

- Calc expression language (parser + evaluator) covering Part V.1 function catalogue.
- LOD semantics (FIXED = correlated subquery, INCLUDE/EXCLUDE = window).
- Table calc addressing/partitioning.
- Security: every calc goes through validator.

## Phase 6 — Analytics Pane

- Reference lines / bands / distributions.
- Trend (least-squares, polynomial up to degree 8).
- Forecast (Holt-Winters with AIC model selection).
- Cluster (K-means with Calinski-Harabasz k-selection).
- Use DuckDB extensions or Python subprocess for numerical work.

## Phase 7 — Formatting System

- Precedence chain Mark > Field > Worksheet > DS > Workbook.
- Number format grammar (Excel-style).
- Date format grammar (ICU tokens).
- Rich text (`formatted-text` markup).
- Theme system.

## Phase 8 — Extracts + Refresh + RLS

- DuckDB-backed extracts (our version of `.hyper`).
- Schedule + incremental refresh (with monotonic-field warning).
- RLS via Virtual-Connection-equivalent: `QueryableResourceResolver` pattern, protobuf `FromOperation/ProjectOperation/FilterOperation/JoinOperation/LimitOperation` wrapper. Policy predicate = our calc language.

## Phase 9 — Extensions API

- Iframe host for dashboard extensions. `.trex` manifest schema. Verb gating. Sandbox via CSP.
- Analytics extensions (TabPy equivalent) for external ML (Python, R, generic REST).
- Viz extensions via custom mark type + `customEncodingTypeId`.

## Phase 10 — File Format + Versioning

- Canonical serializer (Git-native). Sorted attribute order, deterministic whitespace.
- Named `TransformNames` catalogue. Bidirectional Upgrade/Downgrade. `PreviewDowngrade` with loss report.
- XmlFileType-equivalent for our formats.

## Phase 11 — Server / Multi-user + CRDT

- Workgroup-equivalent API. Tenant awareness.
- **CRDT on the delta model** — this is our differentiation. Concurrent authoring with real-time cursors.
- Publishing flow with capability negotiation.
- Permissions (Project → Workbook → View; roles Viewer/Explorer/Creator/Admin).

## Phase 12 — Performance + Cache + Telemetry

- Query cache parity (2-tier LRU + history tracking).
- Performance recording (our `.tlog`-equivalent) + profiler workbook template.
- Separate TUA-equivalent stream for customer-facing usage analytics.

## Phase 13 — Animation + Polish

- Mark enter/exit/update animations.
- Geometry tweens, attribute tweens.
- Easing curves per animation.
- Replay verb.

## Phase 14 — Calc Editor Modernisation

- Monaco editor, autocomplete grounded on data source schema + function catalogue.
- Inline test values + result preview.
- LLM suggestion (grounded on schema, NOT free NL).
- Multi-line debug.

## Phase 15 — NL Authoring (our differentiator)

- Metric-first grounding (match Pulse discipline).
- Dimension/measure declaration required before NL queries.
- Clarification dialog when confidence low.
- NL audit trail (every NL → generated spec stored with `is_generative_ai_web_authoring=true` flag).

---

# Part XXVII — What NOT to Reimplement

Decisions already made based on Tableau's actual implementations:

1. **Hyper** — use DuckDB instead. Don't try feature-for-feature match.
2. **MDX dialect** — cube support is decades old, low demand. Skip.
3. **Data Cloud Segments** — Salesforce-specific. Skip unless customer requires.
4. **Einstein Discovery integration** — Salesforce-specific. Skip.
5. **Explain Data / Linden curated ML** — build a simpler version (outlier + quantile regression) rather than matching feature set.
6. **CGAL spatial** — use DuckDB spatial extension (GEOS-based) instead. Roughly equivalent for our needs.
7. **Tableau Prep as separate app** — collapse prep into the same canvas. No separate tool.
8. **Story Points** — marginal value; can defer indefinitely or replace with narrative annotations on dashboards.
9. **Ask Data** — Tableau killed it. Learn from their failure: don't build unconstrained NL.

---

# Appendix A — Key Enum Reference

## A.1 — DataType

`bool`, `boolean`, `date`, `date-time`, `float`, `int`, `number`, `spatial`, `string`, `unknown`.

## A.2 — FieldRoleType

`dimension`, `measure`, `unknown`.

## A.3 — ColumnClass (protobuf)

`CategoricalBin`, `Dangling`, `Database`, `Group`, `Instance`, `LocalData`, `MdxCalc`, `Metadata`, `Numericbin`, `UserCalc`, `VisualData`.

## A.4 — MarkType

`bar`, `line`, `area`, `pie`, `circle`, `square`, `text`, `shape`, `map`, `polygon`, `heatmap`, `gantt-bar`, `viz-extension`.

## A.5 — EncodingType

`color`, `size`, `shape`, `label`, `tooltip`, `detail`, `path`, `angle`, `geometry`, `custom`.

## A.6 — ZoneType

`viz`, `filter`, `dashboard-object`, `legend`, `set-membership`, `layout`.

## A.7 — DashboardObjectType

`worksheet`, `quick-filter`, `parameter-control`, `legend`, `page-filter`, `title`, `text`, `image`, `web-page`, `extension`, `blank`, `navigation-button`, `download-button`, `ask-data`.

## A.8 — FilterType

`categorical`, `hierarchical`, `range`, `relativeDate`.

## A.9 — ActivationMethod

`Hover`, `Select`, `Menu`.

## A.10 — OnClear (target filter deselect)

`KeepFilteredValues`, `ShowAllValues`, `ExcludeAllValues`.

## A.11 — GroupEditBehavior (Set actions)

`Add`, `Remove`, `Assign`.

## A.12 — DashboardSizingMode

`Fixed`, `Range`, `Automatic`.

## A.13 — DashboardDeviceLayout

`Default`, `Desktop`, `Tablet`, `Phone`.

## A.14 — AggregationType

`Sum`, `Avg`, `Count`, `Countd`, `Min`, `Max`, `Median`, `Var`, `Varp`, `Stdev`, `Stdevp`, `Kurtosis`, `Skewness`, `Attr`, `None`, `Percentile`, `Collect`, `InOut`, `End`, `Quart1`, `Quart3`, `User`, plus date truncations (`Year`, `Qtr`, `Month`, `Week`, `Day`, `Hour`, `Minute`, `Second`, `Weekday`, `MonthYear`, `Mdy`, `TruncYear`, `TruncQtr`, `TruncMonth`, `TruncWeek`, `TruncDay`, `TruncHour`, `TruncMinute`, `TruncSecond`).

## A.15 — DomainType

`Snowflake`, `Separate`.

## A.16 — SheetType

`worksheet`, `dashboard`, `story`.

## A.17 — Permission (RLS)

`Read`, `ReadWrite`, `Admin` (inferred).

## A.18 — UrlActionTargetType

`BrowserNewTab`, `BrowserSameTab`, `InPlace`.

---

# Appendix B — Observed SQL Keyword Coverage

From `tabquery` string table:

`WITH`, `WITH RECURSIVE`, `CommonTableExp`, `CommonTableExpRecursive`, `GROUPING SETS`, `ROLLUP`, `CUBE`, `PIVOT`, `UNPIVOT`, `OVER(PARTITION BY … ORDER BY … ROWS/RANGE …)`, `FILTER (WHERE …)`, `WITHIN GROUP (ORDER BY …)`, `LATERAL`, `BETWEEN`, `BetweenSymmetric`, `NotBetween`, `NotBetweenSymmetric`, `CREATE FUNCTION` with `Strict`/`NotStrict`/`Immutable`/`Stable`/`Volatile`, `TempTableMsg`, `OptTempTableName`, `TransactionMode`, `IsolationLevel`, `ReadOnly`, `ReadWrite`, `Serializable`, `for_locking_clause`, `sortby_list`.

---

# Appendix C — Core Engine DLLs (for subsystem mirroring)

| DLL | Subsystem | Our equivalent |
|---|---|---|
| `tabdoc` | Workbook document model | `store.js` + `backend/user_storage.py` + `backend/dashboard_migration.py` |
| `tabdocactions` | Action semantics | `frontend/…/lib/actionTypes.ts`, `actionExecutor.ts`, `markEventBus.ts` |
| `tabdocfilter` | Filter models | Plan 4a `filterApplication.ts` + waterfall_router filter stage |
| `tabdocparameters` | Parameters | Plan 4c `parameterTypes.ts`, `parameterOps.ts` |
| `tabdocformatting` | Formatting | Phase 7 |
| `tabdocdashboard` | Dashboard layout | `zoneTree.ts`, `zoneTreeOps.ts`, `alignmentOps.ts`, `FreeformCanvas.jsx` |
| `tabdoctablecalc` | Table calculations | Phase 5 |
| `tabdocaxis` | Axes + reference lines | Phase 6 |
| `tabdoctrendline` | Trend lines | Phase 6 |
| `tabdocclusteranalysis` | K-means cluster | Phase 6 |
| `tabdocforecast` | Holt-Winters forecast | Phase 6 |
| `tabdocextension` | Extensions model | Phase 9 |
| `tabvizengine` | Calc evaluator + function catalogue | Phase 5 |
| `tabquery` | SQL AST + dialects | Phase 4 |
| `tabquerycache` | Query cache | Phase 12 |
| `tabquerybatchproc` | Batch orchestration | Phase 4 |
| `tabvizql` / `tabvizqlmodel` / `tabvizqlserver` | VizQL compiler | Phase 4 (minerva port) |
| `tabcoredata` | Data source + relation tree | `backend/user_storage.py` extended in Phase 4 |
| `tabtransforms` / `tabdomtransforms` | File format migrations | Phase 10 |
| `tabanim` | Animation | Phase 13 |
| `tabtelemetry` | Telemetry | Phase 12 |
| `tabtuaclient` | Usage analytics | Phase 12 (separate stream) |
| `tabworkgroup` | Server protocol | Phase 11 |
| `tabvconnresolverclient` | Virtual Connections / RLS | Phase 8 |
| `tabcorexml` | XML DOM parser | Phase 10 |
| `tabstylemodel` | Styles | Phase 7 |
| `tabcgal` | Spatial geometry | Skip (use DuckDB spatial) |

---

# Appendix D — `.trex` Manifest Schema

```
manifest-version: string (required)
type: "dashboard" | "viz" | "analytics"
dashboard-api-version: string (for dashboard type)
name: string
description: string
author: string
author-email: string
icon: base64-encoded png
source-location: URL (extension host page)
permissions: "read-only" | "full-data"
configure-url: URL (right-click Configure dialog)
context-menu-entries: [{ caption, command-id }]
```

Signing: `.taco` via JVM-based signature verifier.

---

# Appendix E — Critical Behavioural Facts (don't forget these)

1. **Filter order-of-ops (Part IV.7)** — memorise the 9 steps.
2. **FIXED LOD = correlated subquery; INCLUDE/EXCLUDE = window.**
3. **Context filter = CTE on Hyper, `#Tableau_Temp_` on legacy RDBMS.**
4. **Action cascade: AsyncCommandQueue serial; queries parallel; render in completion order.**
5. **Dashboard dedupes equivalent queries; cache key = `{DS, relation, predicate, projection, groupBys, order, aggTypes}`.**
6. **Parameter string-substitutes (not prepared) — must go through `FormatAsLiteral` + validator.**
7. **Set kinds = Fixed / Conditional / Top-N; combined sets = new entity, not view.**
8. **URL action placeholder is `<FIELD>` angle-bracket (NOT `{FIELD}`); `ShouldURLEscape` defaults true.**
9. **Go-to-Sheet action always navigates at workbook level, never scrolls in-dashboard.**
10. **Highlight is client-side mask; re-queries only if source dim absent from target grain.**
11. **Tiled zone redistribution = proportional by existing cell-size weights (NOT smallest-first).**
12. **Dim-filter tie-break = insertion order (NOT alphabetical).**
13. **Parameter "from field" domain refresh = workbook-open + manual only (NOT on extract refresh).**
14. **Extensions default to read-only verb subset; destructive verbs gated by trust level.**
15. **Device layouts inherit from base Desktop; "hide on Phone" keeps data pipeline running, suppresses render only.**

---

**End of document.**

*Maintained alongside `tableau_requirements.md` (residual open questions) and the source documents under `Tableau Public 2025.1/`. Update this file as new evidence surfaces or the build roadmap advances.*

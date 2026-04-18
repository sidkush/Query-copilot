# Tableau Requirements & Knowledge-Gap Questionnaire

> **Purpose:** We are building **Analyst Pro**, an AskDB archetype targeting Tableau Desktop/Server parity for dashboard authoring. This document enumerates every behavioural, architectural, and UX detail we need confirmed from a Tableau expert so we can (a) match Tableau where it matters, (b) identify where we can leapfrog. Questions are grouped by subsystem and tagged by priority.
>
> **Priority tags:**
> - **P0** — blocks parity; must answer before next plan phase.
> - **P1** — needed for feature completeness; can lag one phase behind.
> - **P2** — polish, edge cases, or "beyond Tableau" territory.
>
> **Answer format:** Please answer inline under each question. Bullet answers fine, diagrams welcome, short code/SQL snippets great. Any assumption you correct is pure gold — our mental model of Tableau is second-hand.
>
> **Context about us:** We are FastAPI + React 19 + Zustand + Vega-Lite + DuckDB + ChromaDB. We are NL-first (natural language to SQL) but are adding traditional drag-and-drop authoring for analysts who want full control. We already have: tiled + floating zones, 6 action types (Filter/Highlight/URL/GoToSheet/ChangeParameter/ChangeSet — last two stubbed), lock/group/align, Object Library, Layout Tree, Layout Overlay. We have NOT yet built: Sets subsystem, Parameters subsystem, calculated fields, LOD, shelves, marks card, formatting system, analytics pane, tooltip-in-viz, drill, dashboard device layouts, extensions, governance.

---

## 1. Data Model — workbook / sheet / dashboard hierarchy

1. **[P0]** What is the exact hierarchy of objects in a `.twb` / `.twbx` file? Please sketch:
   - Workbook → Data Source(s) → Field(s)
   - Workbook → Worksheet(s) → (Shelf state, Marks, Filters, Params bound)
   - Workbook → Dashboard(s) → (Layout, Actions, Objects referencing Worksheets)
   - Workbook → Story(s) → (Story points referencing Worksheets / Dashboards)
   - Do Parameters live on Workbook or per-Sheet? What about Sets and Groups?
2. **[P0]** What is the difference between a **Data Source** and a **Connection**? When do you see multiple connections in one data source (federation, cross-DB joins)?
3. **[P0]** **Relationships** (2020.2+) vs **Joins** vs **Blending** — when does Tableau choose each? What are the query-time implications (do relationships defer join until viz context determines grain)?
4. **[P1]** What is the "Data Pane" contract? How are fields auto-classified as **Dimension vs Measure** and **Discrete (blue) vs Continuous (green)**? What triggers a reclassification?
5. **[P1]** **Folders vs Hierarchies** in the data pane — behavioural difference? Does hierarchy auto-create drill affordance on every viz?
6. **[P1]** What does **field metadata** include? (data type, role, default aggregation, default number format, default sort, semantic role like geo/currency, comment, synonyms for Ask Data)
7. **[P2]** **Data roles** (Tableau Prep, Tableau Desktop 2020.4+) — how does Tableau validate values against a custom data role? Is this used in viz at all or only in Prep?

---

## 2. Worksheet internals — shelves, marks, VizQL

1. **[P0]** Map each **shelf** to its semantic role: Columns, Rows, Pages, Filters, Marks (Color/Size/Shape/Label/Detail/Tooltip/Path/Angle). What placements on Columns vs Rows produce which chart type? Give a decision table if possible.
2. **[P0]** **VizQL** — is this a separate declarative layer Tableau translates shelf-state into, or a direct renderer? What does the VizQL representation look like conceptually (pseudo-grammar)?
3. **[P0]** How does placing a **continuous measure on Columns** differ from a **discrete measure**? Axis vs header behaviour, aggregation behaviour.
4. **[P0]** **Marks card behaviour:**
   - What happens when you drop the same field on Color AND Detail?
   - What defines the mark count? (Every distinct combination of dimensions on the marks card?)
   - How does "Detail" differ from "Dimension on Rows/Columns" in terms of query granularity?
5. **[P1]** **Show Me** picker — how does it rank chart suggestions? What inputs does it use (#dims, #measures, dim cardinality, measure distribution)?
6. **[P1]** **Dual axis** vs **Combined axis** vs **Shared axis** — when is each used, how to construct?
7. **[P1]** **Measure Names / Measure Values** — what are these, mechanically? Is Measure Values a pseudo-column?
8. **[P2]** **Polygon marks**, **density marks**, **Gantt** — any special shelf requirements?

---

## 3. Query generation & filter order-of-operations

1. **[P0]** What is the **exact order of filter application** in Tableau? We have heard: Extract filters → Data source filters → Context filters → Dimension filters → LOD calc → Measure filters → Table calcs. Please confirm, correct, and indicate whether each is applied DB-side or in-memory.
2. **[P0]** What makes a filter a **Context filter** mechanically? Does Tableau write it to a `#Tableau_Temp_` table, or does it just change query order? When should an analyst promote a filter to context?
3. **[P0]** **Dimension filters vs Measure filters** — how does Tableau know? (is it field role alone, or placement?) What if the same field is used both ways in one viz?
4. **[P1]** **Only Relevant Values** vs **All Values in Database** vs **All Values in Context** on a filter card — what query does each run?
5. **[P1]** **Wildcard match** filter and **Condition: By formula** — how are these translated to SQL?
6. **[P2]** How does Tableau batch/cache queries for a dashboard render? One query per worksheet, or can it combine? Does it respect browser-side result caching?
7. **[P2]** **Custom SQL** — can it reference Tableau parameters? How are placeholders bound? (prepared statement vs string substitute)

---

## 4. Calculated fields & LOD expressions

1. **[P0]** List every calculated field **function category** and give 1 example per category: Aggregate (SUM, AVG), Logical (IF, CASE), String (LEFT, CONTAINS), Date (DATEDIFF, DATETRUNC), Type Conversion (STR, INT), User (USERNAME()), Table Calc (RUNNING_SUM, WINDOW_AVG), LOD, Spatial.
2. **[P0]** **LOD expressions** — semantic difference between `{FIXED [Region] : SUM([Sales])}`, `{INCLUDE [Product] : SUM([Sales])}`, `{EXCLUDE [Region] : SUM([Sales])}`. When in the filter order-of-operations does each evaluate?
3. **[P0]** What does Tableau do when an LOD references a field not in the viz? (materialise a subquery? do a window?)
4. **[P1]** **Table calculations** — addressing vs partitioning. What is the "current" addressing direction when none specified? How does "Compute using → Table (across)" differ from "Specific Dimensions"?
5. **[P1]** **Level of granularity** of a viz — what formally determines it? (Dimensions on Rows + Columns + Detail + Path + Pages, excluding filters?)
6. **[P1]** How does Tableau handle **NULLs** in calcs vs groupings vs axes by default? Indicator behaviour?
7. **[P2]** Are there **performance pitfalls** with LOD we should warn users about? (e.g. FIXED on high-cardinality dimension triggers massive subquery)

---

## 5. Parameters — deep dive

1. **[P0]** Parameter **data types** supported: String, Integer, Float, Boolean, Date, DateTime. Any others?
2. **[P0]** Parameter **Allowed values**: All, List, Range. For List — static vs "from field" vs "from parameter". For Range — min/max/step, can these be bound to field aggregates?
3. **[P0]** **Parameter control display**: Type in, Dropdown (single-select only?), Compact List, Radio Buttons, Slider. Which controls are valid for which data types?
4. **[P0]** **Parameter Actions** semantics: on mark click/hover, set parameter to `<source field aggregate>`. Aggregation options. What happens if multiple marks selected (AVG? SUM? first?)
5. **[P0]** Parameter reference in calculated fields: is it purely textual substitution, or typed binding? Can a parameter change the GROUP BY of a viz (swap dimensions)?
6. **[P1]** Parameter default value persistence: does "Reset" reload the workbook-default or the parameter's "Current value"?
7. **[P1]** Does Tableau Server persist per-user parameter state across sessions? What about embedded views?
8. **[P2]** **Anchored vs floating parameter controls** — any layout implications on dashboards?

---

## 6. Sets — deep dive

1. **[P0]** Three kinds of Sets: **Fixed**, **Conditional**, **Top N**. For each, how is membership computed at query time? Cached or recomputed?
2. **[P0]** **Set actions**: on mark event → Add to set / Remove from set / Assign values (replace). How is Assign different from Replace? Clearing on deselect behaviour.
3. **[P0]** **Combined Sets** — union / intersection / difference on two sets of the same dimension. Is the combined set a new set or a dynamic view?
4. **[P1]** **IN/OUT** indicator — mechanically, is it a synthetic boolean dimension derived from set membership? Can it be used on any shelf?
5. **[P1]** Can a set be used as a **filter** directly? What query does that emit? (IN-list vs exists-subquery?)
6. **[P1]** **Dynamic sets** (based on calculation) — evaluation frequency?
7. **[P2]** Can sets span data sources? What about with relationships?

---

## 7. Actions — every permutation

1. **[P0]** Confirm action taxonomy: Filter, Highlight, Go to URL, Change Parameter, Change Set, Go to Sheet (we have all six stubbed). Any we missed?
2. **[P0]** **Run action on** modes: Hover, Select, Menu. Exact triggers for each. Multi-select behaviour.
3. **[P0]** **Source fields** mapping:
   - **Selected Fields** (specify which source field → which target field)
   - **All Fields** (Tableau auto-matches by name)
   - What happens on a mismatch (target has no field with matching name)?
4. **[P0]** **Target filters** behavior on **deselect**:
   - Keep filtered values
   - Show all values  
   - Exclude all values
   What's the SQL effect of each?
5. **[P0]** **Highlight** — mechanically, is it client-side opacity dimming on non-matching marks, or does it re-run the query? Colour behaviour when source & target use different dim encoding.
6. **[P1]** **Cascade of actions** — if action A fires, updates sheet X, does sheet X's action B then fire? Is there a cycle guard? Event deduplication?
7. **[P1]** **URL action** template syntax — exact placeholder grammar. URL-encoding behaviour (field value with spaces, special chars, null).
8. **[P1]** **Go to Sheet** — when target is within same dashboard, does it scroll, or navigate to standalone worksheet view? Workbook-level navigation?
9. **[P2]** Can an action target a viz in tooltip, or extension? Any cross-dashboard action support?

---

## 8. Dashboards — layout system

1. **[P0]** **Tiled vs Floating** — exact layout math. For tiled: is it a flex-like proportional system summing to 100% per container? How does padding affect it?
2. **[P0]** **Layout containers** (Horizontal vs Vertical) — min size, max size, "Distribute evenly" command, "Fit width/height"?
3. **[P0]** **Dashboard size modes**: Fixed, Automatic, Range, Desktop Browser / Generic Mobile / Tablet presets. Behaviour on window resize per mode.
4. **[P0]** **Device-specific layouts** (Phone, Tablet) — separate tree per device, or overrides on the base? How does Tableau handle a zone that exists on Desktop but is hidden on Phone?
5. **[P1]** **Padding** — Inner padding vs Outer padding semantics. Default values. How do they affect sibling layout?
6. **[P1]** **Background color** and **Border** on an object — object-level or container-level?
7. **[P2]** **Show/hide container** using parameter value or button click — underlying mechanism?

---

## 9. Dashboard objects

1. **[P0]** Full object catalog: Sheet, Text, Image, Web Page, Blank, Horizontal Container, Vertical Container, Download Button, Extension, Navigation Button, Ask Data. Any missing? Any deprecated?
2. **[P0]** **Text object** — does it support rich text (bold/italic/colour)? Parameter/field references inline (e.g., `<Parameters.MyParam>`)?
3. **[P0]** **Image object** — is it a static file embedded, or URL? Can it trigger actions on click (e.g., image as navigation button)?
4. **[P1]** **Web Page object** — is URL dynamic (can it reference parameter)? Sandbox / CSP behaviour?
5. **[P1]** **Navigation Button / Download Button** — styling extent. Can click open target in new tab?
6. **[P2]** **Extensions** — how do dashboard extensions communicate with Tableau (postMessage API)? What is the Extensions API surface (getSheets, getMarks, applyFilter, subscribe)?

---

## 10. Tooltips, drill, annotations

1. **[P0]** **Default tooltip** construction — which fields show, in what order, formatted how?
2. **[P0]** **Custom tooltip** syntax — field insertion, conditional visibility, command buttons (Keep Only / Exclude / View Data / Group Members).
3. **[P0]** **Viz in Tooltip** — is the embedded viz a full worksheet reference or a template? Does it inherit filters from the hover context?
4. **[P1]** **Drill down/up** on hierarchy — does Tableau re-query or does it already have the data? Keyboard shortcut?
5. **[P1]** **Keep Only / Exclude** — what filter expression does each create? How does it interact with existing filters on that field?
6. **[P2]** **Annotations** — Mark, Point, Area. Persistence? Fixed to data coordinate or pixel coordinate?

---

## 11. Analytics pane

1. **[P1]** Full list of analytics pane items: Constant Line, Average Line, Median, Box Plot, Totals, Reference Line/Band/Distribution, Trend Line (linear/log/exp/polynomial/power), Forecast, Cluster, Drop Lines.
2. **[P1]** **Trend line** — how is it fit? (least-squares). R-squared / p-value surface.
3. **[P1]** **Forecast** — exponential smoothing, how many models does Tableau consider? Confidence interval math.
4. **[P1]** **Cluster** — K-means. How is k chosen? Which variables are used (measures on marks card?).
5. **[P2]** **Explain Data / Pulse** — what ML models power it? Is it a curated rule set plus regressions, or LLM now?

---

## 12. Formatting, styling, number/date formats

1. **[P0]** Formatting precedence: Workbook → Data Source → Worksheet → Field → Mark. What wins when conflicts?
2. **[P0]** Number format grammar (Tableau uses a custom format string — similar to Excel?). Give full grammar: `#,##0.00`, `0.0%`, `$#,##0;($#,##0)`, custom currency, scientific.
3. **[P0]** Date format grammar — tokens and combinations.
4. **[P1]** **Conditional formatting** — is it done via calculated field that returns colour/shape, or via Color → Edit Colors with stepped/diverging palette?
5. **[P1]** **Shading, borders, dividers** — container vs sheet. Pane lines, axis ticks, zero lines.
6. **[P2]** Theme system — is there one? Or is every workbook bespoke?

---

## 13. Data sources, extracts, refresh, security

1. **[P1]** Live vs Extract — extract is **Hyper** (columnar, compressed). When does Tableau recommend extract over live? Extract refresh schedule options.
2. **[P1]** **Incremental refresh** — requires monotonic field. What happens if the field is not monotonic?
3. **[P1]** **Row Level Security (RLS)** — options: User Filter (simple), Entitlement tables, Virtual Connections with data policies. Mechanics of each.
4. **[P2]** **Data Quality Warnings**, **Certified Data Sources**, **Lineage** — governance features. Structure?

---

## 14. Device & mobile

1. **[P1]** Touch interaction differences (tap = select, long-press = tooltip, pinch zoom behaviour on pan/zoom maps).
2. **[P1]** Phone layout offline / responsive rules.
3. **[P2]** Tableau Mobile app vs browser — feature parity gaps.

---

## 15. Accessibility

1. **[P1]** Keyboard navigation — tab order through marks, filters, params. Shortcuts list.
2. **[P1]** Screen reader — does Tableau emit an alt text / data table equivalent for charts? ARIA roles used on dashboards?
3. **[P2]** Colour-blind safe palettes — which are built in? How to mark a dashboard as a11y-compliant?

---

## 16. Undo / history / versioning

1. **[P1]** Undo stack scope — worksheet-level, or workbook-level? Granularity of an undo step (per shelf drag, per property change)?
2. **[P1]** **Revert** behaviour — revert to last saved workbook?
3. **[P2]** Tableau Server revision history — stored every save? LRU?

---

## 17. Extensions API

1. **[P2]** Dashboard Extensions — what is the manifest (`.trex`) schema? What capabilities does an extension declare?
2. **[P2]** Viz Extensions (newer) — can a third-party replace the VizQL renderer for a single viz?
3. **[P2]** Is there an Analytics Extension API (for calling external ML)?

---

## 18. Server / Cloud — governance, sharing, embed

1. **[P2]** Permissions model — Projects → Workbooks → Views. Roles (Viewer, Explorer, Creator, Site Admin).
2. **[P2]** Subscriptions vs Data-driven alerts.
3. **[P2]** Embedded analytics — JWT auth, connected apps, custom view URL params.

---

## 19. Performance & scaling

1. **[P1]** What is the **#1 performance anti-pattern** in Tableau that a new user commonly does? (LOD on big data? too many filter cards? unnecessary context filters?)
2. **[P1]** Recommended **max marks per viz**, **max sheets per dashboard** for acceptable interactivity.
3. **[P2]** **Performance recording** — what events does Tableau log (query time, render time, layout time)? Any exposed profiler UI?

---

## 20. Known weaknesses — where can Analyst Pro leapfrog?

> These are questions asking the expert for their **opinion**. Honest criticism of Tableau is most valuable here.

1. **[P0]** What are the **top 5 things Tableau Desktop still does poorly** in 2026? (e.g., dashboard layout UX, extract refresh pain, calc editor ergonomics, version control, collaboration.)
2. **[P0]** What workflows do power users **still do in Excel** because Tableau is clumsy?
3. **[P0]** What is the single biggest **authoring friction** you see new analysts hit?
4. **[P1]** Is there a **data prep gap** between Tableau Prep and Desktop that users hit?
5. **[P1]** How does Tableau handle **multi-user collaboration** on the same workbook? (It doesn't really — Workbook is single-author. Confirm.) This is a huge opening for us.
6. **[P1]** **AI / NL** — how does Tableau Pulse / Ask Data actually perform? Hallucination rate. When does it fall back to "I don't know"?
7. **[P2]** **Mobile authoring** — can you build a dashboard on a tablet? Or is Desktop a hard requirement?
8. **[P2]** **Git / version-control** — can Tableau workbooks be meaningfully diffed? Is there a text-based representation (XML) that reviewers use?

---

## 21. Specific behavioural edge cases we want confirmed

> These are hypotheses. Please mark each **TRUE / FALSE / PARTIAL** and correct.

1. Clicking a mark with a Filter Action active propagates the filter to ALL target sheets bound to that action, in parallel (not sequentially), within a single event tick.
2. A dashboard with 10 sheets issues 10 separate queries on initial load (or fewer if the underlying data source is the same and queries overlap — does Tableau dedupe?).
3. A parameter with allowed-values "From field" refreshes its value list **only on workbook open**, not on extract refresh, unless the user clicks "Refresh" on the parameter.
4. A Set Action with source-sheet multi-select and mode Assign replaces all prior set members with exactly the new selection.
5. Highlight action on a mark with 0 matching values in target sheet dims all marks (not none).
6. The filter order-of-ops is deterministic and documented; ties between two dimension filters on the same field are resolved lexically (alphabetical by field name).
7. A dashboard URL action's template `{FIELD_NAME}` placeholder URL-encodes the value by default.
8. Tiled zones in a horizontal container have proportional widths summing to 100%, and inserting a new zone redistributes proportionally to the smallest sibling first.
9. Changing a parameter whose value feeds a calculated field used in a filter triggers only the sheets that consume that filter to re-query — not every sheet on the dashboard.
10. Go to Sheet action inside a dashboard navigates out of the dashboard to the underlying worksheet view; it does not scroll within the current dashboard.

---

## 22. What we'd love to see (samples)

1. **[P0]** **A sample `.twb` file** of a moderately complex dashboard (5+ sheets, 2+ actions, 1+ parameter, 1+ set). We will diff XML structure against our freeform schema.
2. **[P0]** **Screen recording** of: (a) creating a dashboard from scratch, (b) adding a filter action, (c) a ChangeSet action demo, (d) a ChangeParameter-drives-LOD demo.
3. **[P1]** **Tableau's documented keyboard shortcuts** PDF.
4. **[P1]** **Tableau extensions sample code** — any `.trex` we can study.
5. **[P2]** **A "bad" dashboard** — one that exhibits common performance anti-patterns — so we can build our linter to detect them.

---

## 23. Meta — how we'd like to iterate

1. Please **batch answers** by section so we can review section-by-section. P0 first, then P1, then P2.
2. For any question you think is wrongly framed, please **reframe** it. We'd rather have the right question answered than the wrong question ticked off.
3. For any answer "it depends", please give 2-3 concrete examples of the different cases.
4. Where Tableau's behaviour has changed across versions (e.g., relationships in 2020.2, Pulse in 2023), please note the version boundary.
5. If the answer requires a screenshot or workbook sample, just link and move on — we can always follow up.

---

**Thank you.** Every answer here sharpens Analyst Pro. We are especially hungry for the **Known Weaknesses** (§20) and **Filter Order-of-Ops** (§3.1) details — those define where we can actually win.

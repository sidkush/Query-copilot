# Chart Systems Research — Tableau, Power BI, Looker, and the Path to a Better AskDB Chart UX

**Date:** 2026-04-14
**Author:** Research compiled by Claude Code via 5 parallel research agents
**Purpose:** Deep reverse-engineering of how the three dominant BI tools (Tableau, Power BI, Looker + Looker Studio) build, render, and let users customize charts. Used as the factual base for an AskDB chart UX redesign plan.
**Scope note:** All sources are public docs, engineering blogs, academic papers, GitHub, and developer portals. No paywalled, auth-walled, or copyrighted content was bypassed. Where a feature sits behind a paid tier, that's noted.

---

## Table of Contents

1. Executive Summary
2. Tableau — Reverse-Engineered Chart System
3. Power BI — Visualization Platform Deep Dive
4. Google Looker + Looker Studio
5. Chart Library Ecosystem (Vega-Lite, ECharts, Plotly, D3, Visx, Nivo, AntV, Superset, Deneb)
6. Compact BI Editor UI Patterns (property inspectors, on-object editing, density, keyboard)
7. Cross-Tool Synthesis — What AskDB Should Steal
8. Gap Analysis vs. Current AskDB State
9. Sources

---

## 1. Executive Summary

Three tools dominate BI charting and each solves a different piece of the same puzzle:

- **Tableau** invented the modern paradigm: a declarative visualization spec (VizQL, descended from Stolte/Tang/Hanrahan's 2002 Polaris paper) sitting between the user's drag-and-drop actions and the rendered pixels. The **Marks card** + **Show Me panel** + **pills on shelves** model is the most-copied UX in BI, and their 2007 Mackinlay/Hanrahan/Stolte "Show Me" paper spells out the exact rule system for automatic chart recommendation.
- **Power BI** operationalized the same ideas at Microsoft scale, added **on-object editing** (click any chart element for inline format), shipped **small multiples** natively, and built the most successful **NL Q&A** product via a linguistic schema keyed to a semantic model.
- **Looker Studio** compressed both tools into a **two-tab (Setup/Style) property panel** that non-analysts can use. Looker proper (the LookML-based enterprise product) ships a **JavaScript vis plugin API** and a **Chart Config Editor** that exposes the Highcharts layer underneath.

Underneath them all sit chart libraries with a shared intellectual lineage — Wilkinson's **Grammar of Graphics** — expressed as Vega-Lite (JSON), Observable Plot (JS), ggplot2 (R), AntV G2 (JS), and partially inside ECharts via its `dataset` + `encode` API. Power BI's community custom visual **Deneb** proves that raw Vega-Lite specs render cleanly inside a production BI tool.

The UX patterns that make all of this compact and fast come from Figma (contextual right-rail inspectors, floating toolbars), Notion (bubble menus), Linear (Cmd-K command palette, keyboard-first), Edward Tufte (sparklines, small multiples, data-ink ratio), ColorBrewer (sequential/diverging/categorical palettes), and the 2024–2025 cohort of BI startups (Hex, Mode, Count.co, Evidence.dev, Lightdash, Omni).

**The single biggest architectural insight:** AskDB currently emits ECharts option JSON directly from the LLM. The right move is to introduce an intermediate **grammar-of-graphics IR** (a small declarative spec: `{mark, encoding: {x, y, color, size, detail, ...}, transform, layer, facet, selection}`) that the LLM emits, and compile that IR into ECharts options at render time. This gets Vega-Lite ergonomics with ECharts performance — and unblocks every UX feature below.

---

## 2. Tableau — Reverse-Engineered Chart System

### 2.1 Chart Type Catalog

Tableau exposes its chart library through two layers:

**Layer A — Show Me panel (curated ~24 templates):**

| # | Type | Min data shape |
|---|---|---|
| 1 | Text table (crosstab) | 1+ dim, 1+ measure |
| 2 | Heat map | 1+ dim, 1+ measure |
| 3 | Highlight table | 1+ dim, 1 measure |
| 4 | Symbol map | 1 geo dim |
| 5 | Filled map (choropleth) | 1 geo dim |
| 6 | Pie chart | 1 dim, 1 measure |
| 7 | Horizontal bars | 0+ dims, 1+ measure |
| 8 | Stacked bars | 1+ dim, 1 measure |
| 9 | Side-by-side bars | 1+ dim, 1+ measure |
| 10 | Treemap | 1+ dim, 1+ measure |
| 11 | Circle view | 1+ dim, 1+ measure |
| 12 | Side-by-side circles | 1+ dim, 1+ measure |
| 13 | Line (continuous) | 1 date, 1+ measure |
| 14 | Line (discrete) | 1 date, 1+ measure |
| 15 | Dual lines | 1 date, 2 measures |
| 16 | Area chart (continuous) | 1 date, 1+ measure |
| 17 | Area chart (discrete) | 1 date, 1+ measure |
| 18 | Dual combination | 1 date, 2 measures |
| 19 | Scatter plot | 2+ measures |
| 20 | Histogram | 1 measure |
| 21 | Box-and-whisker | 0+ dims, 1 measure |
| 22 | Gantt | 1 date, 1+ dim |
| 23 | Bullet graph | 2 measures (target + actual) |
| 24 | Packed bubbles | 1+ dim, 1+ measure |

**Layer B — Mark type primitives (composable):** Automatic, Bar, Line, Area, Square, Circle, Shape, Text, Map, Pie, Gantt Bar, Polygon, Density, plus contextual variants.

**Layer C — Community-built via composition:** Sankey (polygon + table calcs + bins), radar/spider (polygons + path + angle), waffle (square mark on 10×10 grid), sunburst (concentric pies via dual axis), chord diagrams, hex maps (custom polygon shapefiles), dumbbell/DNA (dual axis line + circle), funnel, cycle plot, connected scatter. These are not distinct types — they're compositions of primitives.

**Key insight:** Two-layer design — curated templates for novices, composable primitives for experts. ECharts covers most primitives natively; the gap is the curated template layer and the composition rules.

### 2.2 "Show Me" Automatic Recommendation Algorithm

Source: **Mackinlay, Hanrahan, Stolte (2007), "Show Me: Automatic Presentation for Visual Analysis,"** IEEE TVCG 13(6). Extends Mackinlay's 1986 APT thesis.

Ranks chart types on two axes:

1. **Expressiveness** — can this chart encode all (and only) the selected fields?
2. **Effectiveness** — given multiple expressive options, which visual channels are best matched to the data types?

Effectiveness ranking per data type (from Mackinlay 1986, inherited by Show Me):

| Data type | Most → least effective channels |
|---|---|
| Quantitative | Position → Length → Angle/Slope → Area → Volume → Color (lightness/saturation) → Density |
| Ordinal | Position → Density → Color saturation → Color hue → Texture → Connection → Containment → Length → Angle → Slope → Area → Volume → Shape |
| Nominal | Position → Color hue → Texture → Connection → Containment → Density → Color saturation → Shape → Length → Angle → Slope → Area → Volume |

**Field-selection rules (from help docs + paper):**

- 0 dims + 1 measure → histogram, bar
- 1 dim + 1 measure → bars, lines (if date), text table, pie
- 1 dim + 2+ measures → side-by-side bars, stacked bars, heat map, scatter (if 2 measures), dual-axis
- 2+ dims + 1 measure → text table, heatmap, side-by-side bars, highlight table, treemap
- 2+ measures only → scatter plot
- 1 date dim + 1+ measure → line (continuous default), area
- 1 geographic dim → symbol map, filled map
- 2+ measures with 1 date → dual combination, dual lines

Tableau surrounds the recommended chart with an orange box — soft nudge, not hard choice. User can override by clicking any lit thumbnail.

**Marks card `Automatic` mode defaults:**
- Continuous date on Columns + measure on Rows → line
- Discrete dimension on Columns + measure on Rows → bar
- Measure on both Rows and Columns → circle (scatter)
- Geographic dimension present → map
- Text-only view → text table

**Key insight for AskDB:** Show Me is a decision tree over `(n_dimensions, n_measures, has_date, has_geo, cardinality)`. Directly portable: after SQL returns, inspect result set's column types and cardinalities, run the same rules to suggest a default chart.

### 2.3 Marks Card — Visual Encoding Heart

Compact panel (~240×320 px) in worksheet upper-left. Exposes every channel the grammar of graphics uses.

**Layout:**
- **Top row:** dropdown for mark type (Automatic, Bar, Line, Area, Square, Circle, Shape, Text, Map, Pie, Gantt Bar, Polygon, Density, etc.)
- **Channel buttons:** Color, Size, Label, Detail, Tooltip. Context-sensitive: **Shape** for Shape marks, **Path** for Line/Polygon, **Angle** for Pie.
- **Pill area:** shows which fields are dropped on each channel. Multiple pills per channel allowed for Color/Label/Detail/Tooltip; Size/Shape accept one.

**Channel semantics:**

| Channel | Accepts | Effect |
|---|---|---|
| **Color** | Dim (categorical) or measure (continuous/diverging) | Hue or lightness per mark |
| **Size** | Measure or dim | Scales mark dimensions |
| **Label** | Any | Text on/near marks; multiple compose |
| **Detail** | Dimension | Increases level-of-detail without visible encoding — splits marks without changing axes. Crucial for "show per-customer dots in an overall-revenue chart" |
| **Tooltip** | Any | Adds to hover popup; dozens of fields allowed without cluttering |
| **Shape** | Dimension | Glyph per category |
| **Path** | Line/polygon ordering | Critical for Sankey, radar, custom polygons |
| **Angle** | Measure | Pie-slice angle |

**Multi-mark cards (dual-axis):** each measure gets its own mark type, color, size, detail. A third "All" card sets common encodings. How bar+line combos work.

**Why it's compact but powerful:**
- Progressive disclosure: each channel button hides a format dialog
- Drag-drop-and-right-click: drag to bind, right-click to configure (aggregation, sort, filter, format, calc)
- One card structure drives every chart — learn it once

**Key insight:** The single most important UX invention in Tableau for charts. Collapses ~8 visual channels into one panel, uses drag-drop for binding and right-click for configuration, separates "Detail" (no visible encoding) from other channels. ECharts/Recharts have no equivalent.

### 2.4 Data Pane / Field Wells

**Layout:** left rail split by gray line into Dimensions (above, blue pills) and Measures (below, green pills). Additional sections: Calculated Fields, Groups, Sets, Hierarchies, Parameters.

**Blue-green distinction:** not about dimension vs. measure — it's about **discrete vs. continuous**. Dims default discrete (blue), measures default continuous (green), either can flip. Date dimension becomes green when on timeline (continuous), blue when per-month (discrete). Drives axis rendering: continuous → continuous axis; discrete → header chips.

**Pills carry state:** aggregation (SUM, AVG, MIN, MAX, COUNT, COUNTD, STDEV, VAR, MEDIAN, PERCENTILE, ATTR), filter context, sort spec, table calcs (running total, percent difference, moving average, rank).

**Drag-drop workflow:**
- Columns → horizontal axis/column header
- Rows → vertical axis/row header
- Filters → filter dialog
- Marks card channel → visual encoding
- Canvas → Tableau guesses
- Pages → animation frames

Multiple pills on one shelf **concatenate** (outer groups inner), producing nested/small-multiple layouts automatically.

### 2.5 VizQL + Polaris Grammar-of-Graphics Underpinnings

**Polaris paper (Stolte, Tang, Hanrahan 2002):** IEEE TVCG vol. 8, pp. 52–65. Won ACM SIGMOD Jim Gray Dissertation Award, inducted into CACM Research Highlights. Extends Wilkinson's Grammar of Graphics by grafting it onto relational algebra + interactive UI.

**Contributions:**
1. Table algebra for composing visualization layouts. Operators: nest ("/") and cross ("×") dimensions → hierarchical axes and small multiples. Operates on **shelves** bound to data columns.
2. Mapping from algebra expression to **SQL query** computing required aggregations.
3. Mapping from result set to **graphical marks** by type-based defaults.
4. Interactive UI builds the algebra by drag-drop, never hand-written.

**VizQL (Hanrahan 2006, SIGMOD):** evolution of Polaris algebra into production language. Compiles to SQL/MDX depending on data source. Handles LOD calcs, table calcs, blending.

**Compile pipeline:**
1. User drags fields onto shelves → UI state updates
2. UI state → VizQL expression
3. VizQL → SQL/MDX queries
4. Queries execute
5. Result rows bind to marks per encoding spec
6. Renderer draws

**Why it matters:** separates **what** (spec), **how to compute** (SQL), **how to draw** (renderer). Tableau can swap backends (Snowflake, Hyper, extracts) and renderers (desktop, server, mobile) without touching shelf logic.

**Key insight for AskDB:** NL → SQL layer exists. **Spec layer between SQL result and chart does NOT.** Introducing even a lightweight spec object (`{mark, rows, columns, color, size, detail, filters, ...}`) mapping to both (a) Marks-card-style UI and (b) ECharts option JSON is Tableau's most transferable architectural pattern.

### 2.6 Formatting / Editing Pane

Context-sensitive: contents depend on what was right-clicked (Font, Alignment, Shading, Borders, Lines, Axis, Reference Lines, Filters, Titles, Captions, Tooltips, Field Labels, Cell Size, Workbook Theme).

Scope tabs: Sheet, Rows, Columns, Total/Grand Total, Pane vs. Header split.

**Axis editing:** range (auto, uniform across rows/cols, independent, fixed min/max), scale (linear, log, reversed), tick marks, axis title/orientation, synchronized axis (dual-axis), show/hide.

**Color palettes:** 10+ built-in categorical (Tableau 10, Tableau 20, Color Blind, Seattle Grays, Traffic Light, Miller Stone, Superfishel Stone, Nuriel Stone, Jewel Bright, Summer, Winter, Green-Orange-Teal, Red-Blue-Brown, Purple-Pink-Gray, Hue Circle). Custom palettes via `Preferences.tps` XML. Continuous: sequential, diverging (two hues through neutral midpoint), custom stepped. User can set diverging center, reverse, clamp.

**Why not overwhelming (hundreds of props):**
1. Context-sensitive pane
2. Sensible defaults (90% of charts never need formatting)
3. Inheritance: workbook theme → worksheet format → per-mark → per-pill
4. Right-click-in-view as primary entry point
5. Pane/header split is only conceptually hard idea

### 2.7 Dashboard Composition

**Tiled vs. floating:** tiled snap into flexbox-like grid, floating hover at absolute coordinates with fixed w/h, can overlap.

**Layout containers:** horizontal + vertical containers are flexbox-like parents. Drop a worksheet, it stretches to fill. Containers nest. Critical for "one view filters another and neighbors reflow."

**Dashboard sizes:** Fixed (pixel-perfect), Range (min/max), Automatic (fluid).

**Device Designer:** separate layouts for Desktop, Tablet, Phone. Each device layout picks which worksheets/objects show or hide, can rearrange tile structure. Tableau Server/Public detects device and serves matching layout.

**Layout pane:** left rail tree showing object hierarchy + per-object position/size/padding/background/border. DOM-inspector analogue.

### 2.8 Data → Visual Compaction

**Small multiples:** drop a dimension on Rows/Cols in addition to existing axis → grid of plots with shared axes. Fall out naturally from table algebra. For grid (not row/col) arrangement, users compute INDEX() and MOD() table calcs.

**Analytics pane:** second pane toggling with Data pane, drag-drop like fields. Provides:
- Reference line (constant, avg, median, min, max, sum, percentile, parameter)
- Reference band (shaded region between two values)
- Reference distribution (2-sigma confidence, 95% percentile box)
- Box plot overlay
- Trend line (linear, log, exp, polynomial, power; reports R² and p-value)
- Forecast (ETS with confidence intervals)
- Cluster (k-means, adds cluster-id dimension on fly)

**Annotations:** right-click mark → Annotate → Mark/Point/Area. Callout with leader line, tokenizable fields (`<SUM(Sales)>`).

**Quick filter cards:** single-select/multi-select dropdown, checkbox list, radio, wildcard search, range slider, relative date.

**Viz in Tooltip (Tableau 10.5+):** embed another worksheet inside a tooltip, rendered on demand with hovered mark's context. Hover US state → popup with that state's metric over time. **Biggest single density multiplier.**

### 2.9 Interactivity — Dashboard Actions

Actions = declarative rules firing on click/hover/select. Authored via Dashboard → Actions → Add Action. Common properties: Source sheets, Target sheets, Run on (Hover/Select/Menu), Clearing behavior.

| Action | Effect |
|---|---|
| Filter | Selected marks become filter values in target |
| Highlight | Selected marks highlight matching marks in target (dims rest), no filtering |
| URL | Open URL with tokenized values (`<State>`, `<SUM(Sales)>`) |
| Go to Sheet | Jump between dashboards, passing filter context |
| Change Parameter | Selection rewrites parameter value, cascades into calcs |
| Change Set Values | Selection rewrites set members |

**Data highlighter:** search box card, type substring → highlights matching marks in real time.

**Pages shelf:** dim on Pages → animation control. One frame per dim member. Play/pause/scrub.

### 2.10 Extensibility — Dashboard Extensions + Viz Extensions

**Dashboard Extensions:** web apps (HTML+JS) placed on a dashboard. `.trex` manifest, hosted web page loads Tableau Extensions API, `tableau.extensions.initializeAsync()` bootstraps. Can read worksheet data via `getSummaryDataAsync()`, register filter/parameter change callbacks, apply filters via `applyFilterAsync`. Sandbox permission model.

**Viz Extensions (2024+):** ship new **mark types** appearing in Marks card dropdown. Receive data from channels, render via canvas/SVG/WebGL.

**Web Data Connectors (WDC):** JS modules declaring a schema, returning rows on demand. WDC 3.0 uses Node.js taco-like packaging.

**Tableau Exchange:** public marketplace for extensions, visuals, connectors.

---

## 3. Power BI — Visualization Platform Deep Dive

### 3.1 Visualization Catalog

**Comparison/column family:**
- Clustered bar/column, stacked bar/column, 100% stacked bar/column
- Line, area, stacked area, 100% stacked area
- Line and stacked column, line and clustered column (combo with separate "Column y-axis" / "Line y-axis" slots)
- Ribbon chart (stacked column with highest-ranked series on top; ribbons connect across periods showing rank changes)
- Waterfall (running total with +/- contributions; fields: Category, Breakdown, Y)
- Funnel (stage-to-stage proportion)

**Distribution:**
- Scatter, bubble (adds Size slot), dot plot (scatter with categorical axis)
- Play axis (date field, animation timeline)

**Part-to-whole:**
- Pie, donut
- Treemap (Group, Details, Values)

**Geospatial:**
- Map (Bing-based bubbles)
- Filled map (choropleth)
- Shape map (region color, custom TopoJSON)
- Azure Maps visual (bubble, 3D column, heat map, filled, reference, marker/path layers)
- ArcGIS Maps for Power BI (demographics, drive-time zones, clustering)

**Tables & grids:**
- Table (flat, conditional formatting: color scales, data bars, icons, web URLs, background)
- Matrix (pivot-style, Rows/Columns/Values; layouts: Compact indented, Outline, Tabular)

**Single-value:**
- Card, Multi-row card
- KPI (indicator + trend chart behind + traffic-light color)
- Gauge (arc with target)

**Slicers (all through one Slicer visual that morphs):**
- List, horizontal tile, dropdown, hierarchy, date (between/before/after/list/dropdown/relative), numeric range, button, image

**AI visuals:**
- Q&A (NL query box picks chart from question)
- Key influencers (logistic regression + decision trees on Analyze field vs. Explain by list)
- Decomposition tree (hierarchical drill with AI-pick-best-split mode)
- Smart narrative (auto-generates paragraph of insights, dynamic)

**Scripted:**
- R visual (runs R script, static PNG output, needs R runtime)
- Python visual (matplotlib/seaborn/plotly static, ~150k row / 250 MB limit)
- Paginated report visual (SSRS-style, 30k row limit, exports to Excel/PDF/CSV/Word/PPT/MHTML/XML)

### 3.2 Visualizations Pane + Fields Well

Right-side pane with 3 sub-tabs:
1. **Build visual** — visual picker grid + fields well for selected visual
2. **Format visual** — format pane
3. **Analytics** — trend lines, constant/min/max/avg lines, forecasting, symmetry shading, ratio lines

**Fields well slots (named per visual):** Axis/X-axis/Y-axis, Legend, Values, Tooltips, Small multiples, Details, Play axis, Location/Lat/Lng/Size (maps), Column y-axis/Line y-axis/Column series/Line values (combo), Rows/Columns/Values (matrix), Breakdown (waterfall), Target goals/Trend axis/Indicator (KPI).

**Drag-drop + auto-assign:** drop on canvas without targeting slot → auto-assigns based on type (numeric → Values, date → Axis, text → Legend). Drop on empty canvas → creates new column chart.

**Auto-aggregation:** numeric defaults to **Sum**. Pill displays "Sum of Revenue". Dropdown arrow changes to Avg, Min, Max, Count, Count Distinct, StdDev, Var, Median, "Don't summarize". Text → Count/Count Distinct. Date → Earliest/Latest.

**Implicit (per-visual) vs explicit (DAX) measures.** Quick measures dialog builds common DAX patterns (YoY growth, running total, rolling average, rank, % of total) via form, generated DAX is editable.

**Field context actions (right-click pill):** rename for this visual, remove, move up/down, show items with no data, show as → values in rows/columns (matrix), conditional formatting, summarization, sort order.

### 3.3 Format Pane — Classic + On-Object (2023+)

**Classic Format pane** — tree of collapsible property groups.

**General groups (most visuals):**
- Properties (position, size, padding, Responsive toggle, lock aspect, advanced)
- Title (text, font, color, alignment, background, top padding, divider)
- Effects (background, visual border with rounded corners, shadow with offset/blur/color/preset)
- Header icons (focus, more options, drill, filter — which show on hover)
- Tooltips (default vs report-page tooltip — a small custom report page replacing hover card)
- Alt text

**Visual groups (chart-specific):**
- X/Y axis (labels, font, title, min/max, concatenate labels, gridlines, category padding, invert)
- Y axis display units (thousands, millions, auto, decimal places, secondary axis)
- Legend (position with optional center, title, font)
- Data labels (on/off, font, color, display units, background, callouts)
- Plot area (background image, transparency)
- Data colors (per-series or categorical, conditional formatting by measure)
- Small multiples (rows x cols layout, headers, borders, padding)
- Zoom slider (end-user zoom bar)
- Markers/shapes/line width (line/scatter specific)
- Error bars

**On-object interaction (March 2023 preview → GA → default):**
- Click visual element → mini toolbar near element + inline contextual format panel
- Double-click opens text element for in-place edit (titles, axis labels, data labels)
- Right-click mini toolbar = floating toolbar with most-used props (font family/size/color)
- "+" handles on visual toggle elements (data labels) without opening pane
- "More options" link escalates to classic Format pane tree for deeper changes
- Initially rolled out for: bar, column, line, area, combo, scatter, card, pie, donut, treemap, table. AI/less-common visuals fall back to classic

**Effect:** reduces click cost of common tweaks (color, title, labels) by 3–5×.

### 3.4 Q&A, Smart Narrative, AI Visuals

**Q&A visual:** drop on canvas, user types English question, Power BI generates chart. Picks type heuristically: single value → card, one measure by one category → column, geo → map, two measures → scatter.

**Backed by Linguistic Schema:** YAML auto-generated from semantic model.
- **Entities** — tables/columns with parts of speech (noun, verb, adjective)
- **Synonyms** — alt names. Adding "customer" as synonym for "Account" table lets users ask "how many customers"
- **Phrasings** — grammatical templates. "Customers buy products" = verb-based relationship between customer dim, fact table, product dim → Q&A understands "what did Jane buy"
- **Weighting and disambiguation**

Editable two ways: Q&A tooling visual synonym manager + teach-Q&A workflow; or export YAML, edit, re-import.

**Smart narrative:** auto-writes paragraph about trends/outliers/max/min/segment comparisons/totals with dynamic measure bindings.

**Key influencers:** Analyze field + Explain by list → logistic regression + decision trees → ranked drivers ("When tenure <6 months, churn is 4x higher"). Two tabs: individual factors + top segments.

**Decomposition tree:** Analyze (measure) + Explain by (candidate dims). User clicks node, picks dim to split or uses "High value"/"Low value" AI auto-pick biggest swing. Visual root-cause analysis.

**Relevance for AskDB:** Q&A's trade-off is that it's narrower but safer — semantic model author pre-approves answerable questions. AskDB can borrow **semantic model enrichment** (synonyms, relationship phrasings, sample questions) while still letting users ask anything.

### 3.5 Custom Visuals SDK

**Toolchain:** `powerbi-visuals-tools` (pbiviz CLI). `pbiviz new myVisual` scaffolds, `pbiviz start` dev server, `pbiviz package` produces `.pbiviz` file. Webpack + TypeScript + React support.

**Project layout:**
- `pbiviz.json` — metadata
- `capabilities.json` — data roles + data view mappings + object schema + sort/drill/highlight/privacy support
- `src/visual.ts` — entry point implementing `IVisual` interface
- `style/visual.less`
- `assets/` — icon + screenshots

**capabilities.json sections:**
- **dataRoles** — array of `{name, displayName, kind: Grouping|Measure|GroupingOrMeasure, requiredTypes, preferredTypes}`. Become fields well slots.
- **dataViewMappings** — map roles to `dataView` shape. Options: `categorical`, `table`, `matrix`, `single`, `tree`. Each has `dataReductionAlgorithm` (`top`, `bottom`, `sample`, `window`) for 30k-point cap.
- **objects** — format pane schema. Each = named property group with `properties` map of type `fill`, `text`, `numeric`, `bool`, `enumeration`. Power BI auto-renders into Format pane.
- **supportsHighlight** — cross-highlight flag
- **privileges** — web access / local storage
- **drilldown, sorting, bookmark, filter** — feature flags

**IVisual interface:**
- `constructor(options)` — receives `host` (tooltips, selections, persistence, auth, locale), `element` DOM node. Create D3 root / React root here.
- `update(options)` — called on data/size/settings change. Receives `dataViews`, `viewport`, `type`, edit mode. All rendering here.
- `destroy()` — cleanup.
- `enumerateObjectInstances` (legacy) or `getFormattingModel` (modern) — drives format pane.

**Libraries:** D3 most common for SVG legacy; React, Preact, canvas libs (PixiJS, Chart.js), WebGL (three.js, deck.gl) all used. Microsoft's first-party visuals built on D3 for legacy, React/Canvas for new ones.

**AppSource + certification:** published via Partner Center. Automated validation + optional deeper certification (source provided to Microsoft, no external calls, security tests). Certified visuals get: export to PowerPoint, email subscription rendering, "Power BI Certified" badge.

### 3.6 Interactions Model

**Edit interactions:** Format ribbon → Edit interactions. Click source visual → icon set on every other visual showing 3 modes:
- **Filter** — target filtered down to selection
- **Highlight** — target keeps all data, dims non-matching (drawn in full color vs. fade)
- **None**

**Defaults by visual type:**
- Column/bar → cross-highlight (preserves visual stability)
- Line/scatter/map → cross-filter (removing non-matching > dimming)
- Tables/matrices/cards/slicers → cross-filter

**Drillthrough:** right-click data point → jump to detail page pre-filtered. Target page has "Drillthrough filters" well. Power BI wires filter context + "back" arrow automatically.

**Drill modes:**
- Drill down/up (hierarchies)
- Expand all down one level (keeps parent)
- Drillthrough (jumps to another page)
- Cross-report drillthrough (spans two reports)

**Bookmarks:** capture current state (filters, slicers, selections, sort, drill, visibility). Bookmark scopes: data-only, display-only, current-page-only. Paired with buttons + selection pane for tab experiences.

**Filter hierarchy (strict composition):**
1. Visual-level (narrowest)
2. Page-level
3. Report-level
4. Drillthrough filters (inherited)
5. Cross-filters from selection (temporary)
6. URL query-string filters

### 3.7 Small Multiples

Fields well gets **Small multiples** slot. Drop categorical field → one mini-chart per value. Shared X/Y axes. Format pane layout: grid rows × cols (up to 6×6), headers (label font/color/align above each panel), padding, borders, background per-panel. Lazy-loaded on scroll. Clicking a panel cross-filters the rest.

### 3.8 Layout, Dashboard Composition, Mobile

**Report pages:** sequence with fixed canvas (default 1280×720, 16:9). Alternatives: 4:3, letter, custom. Background image/color/wallpaper.

**Grid + snap:** View → Show gridlines + Snap objects to grid. 96×96 point lattice. Smart guides (dashed alignment lines) with snap-to-edge/center.

**Alignment tools (Format ribbon):** align left/center/right/top/middle/bottom, distribute h/v, match size, bring to front/send to back, group, lock objects.

**Responsive visuals:** Format → Properties → Advanced → Responsive toggle. Auto-hides axis labels, legends, titles as visual shrinks. Column chart → just colored bars at very small sizes.

**Mobile layout:** NOT responsive reflow — **authored layouts**. View → Mobile layout view → drag subset of visuals onto 320pt phone canvas. Separate from desktop canvas. "Auto-create mobile layout" generates first draft. Mobile-specific visual formatting pane (2024+) lets mobile font sizes/titles differ from desktop.

**vs. Tableau:** Power BI = fixed pixel first + responsive toggle + separate mobile layout. Tableau = container-based (reflows). Power BI easier for casual authors and pixel-precise; Tableau handles variable screens better.

### 3.9 Theming

JSON documents describing visual identity. Sections:
- `name`
- `dataColors` — ordered array of hex, default categorical palette, cycled through
- `background`, `foreground`, `tableAccent` — high-level shorthand
- **Structural colors** (advanced): `firstLevelElements`, `secondLevelElements`, `thirdLevelElements`, `fourthLevelElements`, `background`, `secondaryBackground`. Drive text, axis lines, gridlines, borders, slicer handles, countless UI details. Designer sets six → consistent look without enumerating every property.
- `good`, `neutral`, `bad` — sentiment colors (KPI, data bars, conditional formatting)
- `minimum`, `center`, `maximum` — divergent colors (filled maps, gradients)
- `textClasses` — typographic classes (title, header, label, callout value) with `fontSize`, `fontFace`, `color`
- `visualStyles` — nested tree keyed by visual type → `*` or style variant → property group → property. Runtime format pane schema mirror.

**Applying:** View → Browse for themes (JSON import) or pick built-in (Classic, Innovate, Executive, Bloom, Tidal, Burning). Custom themes publishable as **organizational themes** tenant-wide.

**Dev integration:** custom visuals read `host.colorPalette` in `update`. Palette exposes `accent1..accent10`. Well-behaved visuals never hardcode colors.

### 3.10 Rendering Stack

Heterogeneous — SVG for most legacy, Canvas for high-density, WebGL for maps and some custom visuals.

**SVG (D3-based):** most original core visuals. Easy CSS styling, scales cleanly, full DOM events, accessible. Limit: **DOM cost** ~1k-10k elements before browser layout bottleneck. Power BI caps most SVG visuals at ~30k points, uses data-reduction algorithms (`top`, `sample`, `window`).

**Canvas:** scatter in high-density mode, some map layers, some third-party. Sidesteps DOM cost — scales to 10k+ interactive points at 60fps. Trade-off: hit-testing + accessibility need custom implementation (in-memory spatial index + separate ARIA tree).

**WebGL:** Azure Maps (tile rendering, heat map, 3D column), ArcGIS, high-end custom (deck.gl). Hundreds of thousands of points with smooth interaction. GPU required.

**Data reduction:** every visual declares max point count (default 30k) + reduction algorithm sampling down from full semantic model result. Line → `window` (contiguous chunks). Scatter → `sample` (statistically representative). Bar with top-N → `top`.

**Sandboxing:** every visual runs inside sandboxed iframe. Host ↔ visual over postMessage. Can't read each other's DOM, can't access parent cookies, can't call external URLs unless declared in capabilities (visible to consumers + certification reviewers).

**Perf best practices:** Canvas/WebGL for animations + large datasets; SVG fine for static business charts; cache DOM selections; debounce resize; use DataReductionAlgorithm not client-side filter; virtualize lists; batch DOM changes in `requestAnimationFrame`.
## 4. Google Looker + Looker Studio

### 4.1 Looker (Enterprise) — Native Viz Catalog

Fixed roster in Explore's Visualization bar, 1:1 with LookML dashboard `type` parameter.

**Cartesian:** Column (`looker_column`), Bar (`looker_bar`), Line (`looker_line` — connected/stepped/smooth), Area (`looker_area` — stacked/%), Scatterplot (`looker_scatter`), Boxplot, Waterfall.

**Proportional:** Pie, Donut Multiples (small-multiples of donuts, one per category).

**Progression/flow:** Funnel, Timeline (Gantt-style).

**Text & table:** Single Value, Single Record, Table, Table (Legacy), Word Cloud.

**Maps:** Google Maps (modern), Map (Legacy), Static Map Regions (choropleth), Static Map Points.

**Chart Config Editor advanced tier** (requires `can_override_vis_config` permission): Bullet, Solid Gauge, Streamgraph, Treemap, Sankey, Dependency Wheel, Venn Diagram, Sunburst, Item.

All Cartesian charts use **Highcharts** under the hood — the hook that makes Chart Config Editor possible.

### 4.2 Chart Config Editor — The Escape Hatch

Accessed via **Edit → Plot → Edit Chart Config** inside any Cartesian viz. Two-pane JSON editor:
- **Chart Config (Source)** — read-only Highcharts JSON
- **Chart Config (Override)** — editable JSON, deep-merges over source

Users override any valid Highcharts attribute: chart background, axis tint, tooltip shape/content, series dash styles, annotations, plot bands, reference lines, data point formatting. **Series formatters** sugar: rules like `value > 100`, `max`, `min`, percentile thresholds, dimension name matches → declarative conditional color/format without custom JS. Advanced types (Treemap, Sankey, Venn, Sunburst) are preset override templates.

### 4.3 Custom Visualizations — LookML Vis API

JS plugin system, sandboxed iframe. Same artifact works across Explores, Looks, dashboards, embeds, PDF exports.

**Manifest registration** in LookML project manifest:
```
visualization: {
  id: "my_viz"
  label: "My Custom Viz"
  url: "https://..." # or file:
  sri_hash: "..."    # optional integrity
  dependencies: ["..."]
}
```

**Plugin entry:** `looker.plugins.visualizations.add({...})` at load. Lifecycle methods:
- `create(element, config)` — once, build DOM
- `updateAsync(data, element, config, queryResponse, details, done)` — called on data/config/resize change. Preferred because `done` callback signals complete — critical for server-side PDF capture + scheduled image exports
- `update(...)` — legacy synchronous
- `destroy()` — declared but not implemented v2

**Data shape in `updateAsync`:**
- `data` — array of row objects, each = map of field name → cell (value + metadata)
- `queryResponse` — field metadata: `queryResponse.fields.dimensions`, `.measures`, `.table_calculations`, `.pivots`
- `config` — current user-set option values
- `details` — env info (container size, PDF mode)

**Options DSL:** viz declares `options` property → Looker renders as Edit Visualization panel. Each option: type (`string`, `number`, `boolean`, `array`), display form (`text`, `select`, `radio`, `range`, `color`, `colors`), `label`, `default`, `section` (tabbed grouping), `order`, `display_size` (`normal`/`half`/`third`), conditional visibility via `values`/`display_conditions`.

**Error surface:** `this.addError({title, message})` + `this.clearErrors()` wired to Looker chrome.

**Cell rendering utility:** `LookerCharts.Utils.htmlForCell(cell)` renders with Looker's `value_format`, drill link wiring, link HTML.

### 4.4 Explore UI (Query Builder)

Three zones:

**Left — Field Picker.** Top-to-bottom: view → field type (dimensions → dimension groups → measures → filter-only fields → parameters). Field names formatted by converting underscores to spaces + title-casing. Clicking field adds to query; dedicated filter icon creates filter chip without selecting; pivot icon pivots dim horizontally (up to 200 pivot values). Selected fields get gray background + persistent action icons (no hover flicker).

**Top — filter row.** Filter chips with inline operator dropdowns + value editors.

**Main — results + visualization.** Table/data on top, viz stacked below, sharing in-memory query response.

**Field organization levers (LookML dev controls):**
- `label` on view → renames all appearances
- `view_label` on Explore → overrides view name within that Explore
- `view_label` on join → groups fields under custom header
- `group_label` on field → nested dropdowns (e.g., grouping `Created Day`, `Week`, `Month`)
- `group_item_label` → child field display name within group
- `view_label` on field → promotes field to different header
- `fields` parameter at Explore level → inclusion/exclusion via `ALL_FIELDS*` with `-` prefixes

### 4.5 Looker Dashboards

Two types:
- **User-defined** (UI drag-drop)
- **LookML dashboards** (YAML in LookML file, versioned with model)

**Layout modes:** Tile (legacy, one-chart-per-row), Static (fixed absolute), Grid (12-column responsive, modern default), Newspaper (older flow).

**Cross-filtering:** dashboard-level — clicking data point in one tile filters all other tiles that share same Explore origin. **Only works when every tile hangs off a single Explore** — forces designers to keep dashboards model-coherent.

**Drill-downs:** LookML `drill_field` parameter defines reachable fields from a measure. Clicking drillable value opens menu of drill paths. Developers customize drill menu HTML via `html` LookML parameter for embedded modals.

### 4.6 LookML Semantic Layer

Dimensions = groupable fields (always in SQL `GROUP BY`). Measures = aggregates (sum, count, avg, count_distinct, running_total, list, period_over_period, etc.). Parameters = filter-only inputs driving Liquid template substitution in SQL (query-time variables).

Dimension types: `string`, `number`, `date`, `yesno`, `tier`, `zipcode`, `location`, `distance`, derived types.

**Dimension groups:** one LookML definition → N timeframes from single timestamp (day/week/month/quarter/year). Why a single field in LookML often expands to nested timeframe group in Explore picker.

**For AskDB:** Looker's picker density comes from pre-curated semantic metadata. Can't replicate without metadata layer, but can borrow grouping/labeling conventions for flatter schema browser.

### 4.7 Looker Studio — Chart Catalog

Built-in charts (overlaps with Looker, different accent — more "business report" primitives):

Scorecard (single KPI), Time series (line/area over time, sparkline, smoothed variants), Table (sortable, paginated; variants with in-cell bars + heatmaps), Pivot table (hierarchical row/col grouping), Bar & Column (grouped/stacked/100%), Combo (column+line), Area (stacked, %), Line (categorical X), Pie (donut), Treemap, Sankey, Geo chart (country/region chloropleth), Google Maps (bubble, filled, heatmap, lines), Scatter (bubble with 3rd measure), Bullet (progress with bands), Gauge, Boxplot, Waterfall, Candlestick (OHLC), Timeline, Funnel, Community visualizations.

### 4.8 Property Panel (Right Rail) — SETUP + STYLE Tabs

**The primary editor paradigm and the single most borrowable pattern for AskDB.**

When chart selected, right panel opens with two tabs.

**SETUP tab (the "what"):**
- Data source selector (top)
- Date range dimension (if source has timestamp)
- Dimension drop zones (chart-type specific)
- Breakdown dimension (optional series split)
- Metric drop zones (numeric aggregates with per-metric aggregation override: Sum/Avg/Min/Max/Count/CountD + type override)
- Sort (metric or dim, asc/desc)
- Default date range (override report-wide)
- Filter (chart-level filter chips stacked at bottom)

Fields dragged from **Data panel** (separate column left of SETUP) listing current source's dimensions and metrics. Clicking data type icon on dropped field opens inline edit menu: rename, display format, comparison calculation (vs. previous period, vs. percent difference).

**STYLE tab (the "how"):**
- Per-series color, dash, marker, opacity
- Axis config (title, log scale, min/max, tick format)
- Reference lines (value, label, color, line style)
- Conditional formatting rules (scorecard/table/chart)
- Font family/size/weight per text role (chart title, axis labels, legend, data labels)
- Background/border/corner radius for chart tile
- Chart-specific options (legend position, missing data strategy, stacking mode, null handling, smoothing)

**Static components** (text, shape, image) have only Style tab — no data to set up. Panel dynamically shows only relevant tabs.

**Conditional formatting rules:** expression-driven. Each rule = color type (single or color scale) + condition expression + foreground/background colors + optional style. Scorecards support performance targets with auto reference-line rendering when thresholds set.

### 4.9 Community Visualizations — dscc-gen

Sandboxed HTML/JS widget hosted from Google Cloud Storage. Communicates with Looker Studio frame via `postMessage`.

**Tooling:** `npx @google/dscc-gen viz`. Requires Node, npm ≥5.2, `gsutil`. Scaffold:
- `src/index.js` — main viz code (webpacked, uses D3/Highcharts/ECharts/anything)
- `src/index.json` — config: declares `dataFields` (dim/metric drops the user sees), `style` sections (color, font, select, etc. in Style tab), `interactions`
- `src/index.css`
- `src/manifest.json` — name, icon, description, bucket locations
- `scripts/data/localData.js` — mock data for local dev

**Two-deployment model:** dev + prod in separate GCS locations. `npm run build:dev`+`push:dev` = non-minified, caching disabled. `build:prod`+`push:prod` = minified. `const LOCAL = true/false` toggles local data vs live dscc data.

**Data contract via `@google/dscc`:** `dscc.subscribeToData(callback, {transform})`. Transform options:
- **`objectTransform`** — rows as arrays of objects keyed by config ID. For libs taking row-of-objects input.
- **`tableTransform`** — headers + rows as arrays of cells. For table-like rendering.

Both produce object with six keys: `fields`, `style`, `interactions`, `theme`, `tables`, `dateRanges`. `fieldsByConfigId` indexes fields by IDs from `index.json`.

**Upshot for AskDB:** dscc split — config JSON declares drop zones + style sections; JS receives typed data message — is a clean way to specify a chart SDK.

### 4.10 Data Blending

Looker Studio lets single chart span up to **5 data sources** via **blend**. Visual join builder:
- Each source = table card with available fields listed
- Between adjacent cards: join configuration dropdown (operator: Inner, Left outer, Right outer, Full outer, Cross) + join condition (one or more field pairs)
- Output blend = new data source, usable as source for any chart
- Charts can create ad-hoc blends inline

Simpler than writing SQL but feature-poorer than LookML joins (no many-to-many, no symmetric aggregates).

### 4.11 Themes + Extract-from-Image

**Theme and Layout panel** = right rail when nothing selected. Global design controls:
- Text style (default font color + family)
- Accent style (table headers, filter headers, apply buttons)
- Chart palette (default series colors)
- Background + grid settings

~40 default fonts (Arial, Roboto, Montserrat, Lato, Open Sans, etc.). Google Fonts beyond roster require community viz.

**Extract Theme from Image:** right-click image → "Extract theme from image" → analyzes dominant colors → produces 3 theme variations. Colors only, not fonts.

### 4.12 Canvas Layout + Info Density

Pixel-oriented: 10×10 min to 2000×10000 max. ~1180px wide common desktop sweet spot. **Layout tab** exposes canvas size (preset/custom with responsive grid option added 2025), grid size (snap granularity), snap-to-grid toggle, default chart header visibility.

Static (pixel) is default. **Responsive layout** mode (newer) arranges components into column-based grid that reflows across screens.

**Info density comparison:** Looker Studio editor is LESS dense than Tableau (separate Rows/Cols/Marks/Filters shelves + Show Me + Pages shelf in one window) and Power BI (Visualizations + Fields + Format + Bookmarks panes, persistent). Looker Studio compresses into three right-rail columns: Data panel (fields), Setup/Style tabs (chart config), Panel manager (toggle visibility). **Trades depth for onboarding simplicity** — the compact two-tab property panel is the feature most cited as why non-analysts can use Looker Studio where they couldn't use Tableau.

**For AskDB's AI-first tool:** Tableau-like four-panel layout would blow past info budget; Looker Studio-like two-tab panel would fit under SSE agent chat stream without crowding.

### 4.13 Looker Gemini AI Features

**Looker (enterprise):**
- Conversational Analytics (NL queries hitting Explore, returning visualizations, GA 2026)
- Visualization Assistant (NL config of chart style: "make this a stacked area with brand colors")
- Formula Assistant (NL → calculated-field expression)
- LookML Code Assistant (NL → LookML model code)
- Automated Slide Generation (dashboard → text-summarized slide deck)

**Looker Studio:**
- Conversational Analytics — Pro only
- Insights panel (Gemini bullet-point observations on charts)
- Smart Guides (theme extraction from image, auto-suggestions while dragging)

**Market opening for AskDB:** NL query generation is behind Pro paywall in Looker Studio, enterprise-tier in Looker proper.

---

## 5. Chart Library Ecosystem

### 5.1 Grammar of Graphics — Intellectual Spine

Wilkinson 1999 *The Grammar of Graphics*. Decomposes chart into **data → transforms → scales → coordinates → geoms → guides**. Stanford Polaris implemented directly → became VizQL → Tableau. Wickham's ggplot2 re-expressed as layered R API. Vega/Vega-Lite, Observable Plot, AntV G2 continue lineage in JavaScript.

**Why it matters for AskDB:** when LLM generates chart from NL, much easier to emit declarative encoding (`x = order_date`, `y = sum(revenue)`, `color = region`, `mark = line`) than 200-line ECharts option with magic indexes. **Grammar = compressed, composable, model-friendly IR.**

### 5.2 Vega-Lite

JSON grammar compiling to Vega → D3 primitives. One spec = one chart. Apache-2.0. Portable: same JSON runs in browser, notebooks, Power BI (via Deneb), Jupyter (via Altair), server-side (VegaFusion Rust).

**Encoding channels:** `x, y, x2, y2, color, size, shape, opacity, strokeWidth, strokeDash, angle, text, tooltip, href, row, column, facet, order, detail, xOffset, yOffset`.

Minimal spec:
```json
{
  "data": {"url": "data/population.json"},
  "mark": "bar",
  "encoding": {
    "x": {"field": "age", "type": "ordinal"},
    "y": {"aggregate": "sum", "field": "people", "type": "quantitative"},
    "xOffset": {"field": "group"},
    "color": {"field": "group"}
  }
}
```

Change `"mark": "bar"` to `"line"`/`"point"` → different chart from same encoding. **ECharts does not have this.**

**Interactions as grammar:** selections are first-class grammar, not callbacks. `interval` selection + `filter` transform → brushing-and-linking in ~10 lines:
```json
"params": [{"name": "brush", "select": "interval"}],
"encoding": {
  "color": {
    "condition": {"param": "brush", "field": "Origin"},
    "value": "grey"
  }
}
```

Union/intersect/invert selections → dashboard-grade cross-filtering, declarative, no event handlers.

**Strengths:**
- Encoding-first mental model — LLMs produce fluently
- Composition via `layer`, `hconcat`, `vconcat`, `repeat`, `facet` — ECharts needs manual `grid` positions
- Automatic type inference — declare `type: "temporal"` → VL picks scale/format/tick strategy
- Portability — round-trips to Power BI (Deneb), Altair (Python), VegaFusion, Observable
- Interactions as data transforms

**Weaknesses:**
- Rendering speed — Vega-Lite → Vega → D3 → SVG/Canvas; not optimized for 100k+ points. ECharts beats on raw throughput
- Bundle: ~400–450 KB gzipped full. ECharts tree-shakes to ~170 KB gzip for common types
- No animation/3D vs. ECharts transitions + ECharts-GL
- Customization beyond grammar verbose (Vega lower layer is more verbose than D3 direct)

### 5.3 Observable Plot

Bostock's post-D3 JS library. Grammar-of-graphics as **function calls** (not JSON specs). Apache-2.0.

```javascript
Plot.plot({
  marks: [
    Plot.barY(sales, {x: "product", y: "revenue", fill: "quarter", tip: true}),
    Plot.ruleY([0])
  ],
  color: {legend: true}
})
```

**Strengths:** same grammar philosophy as VL with JS signatures (IDE autocomplete, LLM emits JS), faceting built in (`fx`, `fy`), channels + transforms (`binX`, `groupY`, `stackX`, `windowY`), D3 heritage escapes cleanly, no build step.

**Weaknesses vs VL for AskDB:** no JSON spec format — harder to persist/version/diff/send over wire from LLM tool call. Smaller ecosystem. Interactions less grammar-driven. React needs wrapper.

**Pick:** VL for JSON IR LLM emits; Plot for lighter-weight D3-compatible JS API.

### 5.4 Apache ECharts Deep Dive — What We're Leaving on Table

Apache-2.0. ~170 KB gzip tree-shaken, up to ~980 KB full.

**Series types (20+):** `line, bar, pie, scatter/effectScatter, radar, tree, treemap, sunburst, boxplot, candlestick, heatmap, map (geo choropleth), parallel, lines (flow/airline), graph (force/network), sankey, funnel, gauge, pictorialBar, themeRiver, calendar, custom`. ECharts-GL adds `bar3D, line3D, scatter3D, surface, map3D, globe, flowGL, graphGL`.

**Component model — BI features as components attached to existing series, not different chart types:**
- `grid` — stack multiple series on one canvas with shared axes (true multi-axis dashboards in one instance)
- `xAxis`/`yAxis` — `category`, `value`, `time`, `log`; multiple per grid
- `legend` — scrollable, paginated, filterable
- `tooltip` — per-trigger (`item`/`axis`), HTML formatter, shared axis pointer
- `dataZoom` — slider + inside types, drag to zoom, shift to pan; **critical for time-series BI, underused**
- `visualMap` — maps data dimension to color/size ramp with interactive legend; piecewise or continuous
- `toolbox` — PNG export, restore, data-view (table), magic type switcher, brush trigger
- `brush` — rect/polygon/lasso selection emitting events; **foundation for cross-filtering**
- `geo` — base map layer; overlay `scatter`, `lines`, `heatmap`, `map`
- `parallel` — parallel coordinates system
- `timeline` — animation between option snapshots — year-over-year playback
- `calendar` — GitHub-style calendar coordinate system; overlay heatmap/scatter/graph
- `graphic` — custom SVG/Canvas primitives in chart coordinate space (annotations, watermarks, drawings)

**Series-level richness underused:**
- `markPoint`/`markLine`/`markArea` on any series — min/max points, avg line, thresholds, highlight bands. Huge for BI, mostly free.
- `stack` with `emphasis.focus: 'series'` — fade non-hovered
- `encode` — near-grammar-of-graphics: `encode: {x: 'date', y: 'revenue', tooltip: ['date', 'revenue', 'region']}` reads a dataset by column name. Combined with `dataset` component, ECharts has **VL-lite mode widely underused**
- `renderItem` — custom series escape hatch
- `universalTransition` — morphing animations between chart types

**Custom series (ECharts 6):** standardized registrable custom series — pre-built visuals `npm install`'d and dropped in like built-ins. Closes much of "can't do X that VL can" gap.

**Performance modes — where ECharts is genuinely strong:**
- `large: true` + `largeThreshold: 2000` on line/scatter/bar — performance rendering batching draw calls
- `progressive: 400` / `progressiveThreshold: 3000` — chunked async rendering; UI stays responsive
- `sampling: 'lttb'` (or `'average'`, `'min'`, `'max'`, `'sum'`) — **Largest Triangle Three Buckets** downsampling on line series. LTTB preserves peaks/troughs while reducing N→K. Same trick Grafana, QuestDB, time-series UIs use
- Renderers: `canvas` (default), `svg` (accessibility, crisp exports), WebGL via ECharts-GL. **Swap renderer with one config line** — SSR snapshots (SVG), WebGL perf at scale

**Bottom line:** don't migrate. Build thin **grammar-of-graphics IR** LLM emits, compile into ECharts option objects (with `dataset` + `encode`). VL ergonomics + ECharts performance.

### 5.5 Plotly.js

MIT. ~800 KB+ gzipped "basic" slim, ~3.5 MB un-gzipped full.

**Strengths:** best for **statistical/scientific** — `violin, box, histogram2dcontour, splom, parcoords, sankey, carpet, candlestick, densitymapbox`. Only serious **3D** option — `scatter3d, surface, mesh3d, cone, streamtube, isosurface, volume`. Built-in mode bar. WebGL via `scattergl` backed by `regl`+`gl-plot`.

**Weaknesses:** bundle heavy. >10k points with tooltips/annotations visibly slower than ECharts. Imperative API (`Plotly.newPlot(div, data, layout, config)`). Per-tab WebGL context cap (~8–16) — old contexts recycled if many gl charts on one page. Fine for single big chart, painful for 20-tile dashboard.

**Verdict:** specialty lane for 3D, splom, parcoords, contour, scientific. Not dashboard replacement for ECharts.

### 5.6 Highcharts

Commercial. Not FOSS — free personal/non-commercial, paid commercial. Starts ~$168/dev/year Highcharts core; Stock/Maps/Gantt/Dashboards separate SKUs; SaaS/OEM priced higher.

**Strengths:** most polished commercial lib. Excellent accessibility (WAI-ARIA + sonification via a11y module). Best documentation in space. Sub-products: Stock (OHLC, technical indicators, navigator), Maps, Gantt, Dashboards. **A11y maturity alone sells into enterprise BI.**

**Verdict:** commercial safety net for accessibility + OHLC. Cost non-trivial but often justified in enterprise sales. Not worth rewriting unless customer needs OHLC or a11y certification.

### 5.7 D3.js

ISC. Modular, often <30 KB gzipped for real chart.

Not a chart library anymore. Toolkit of **scales, shapes, hierarchies, forces, geo projections, tick formats, color interpolators, transitions, drag/zoom behaviors**.

**Reach for directly when:** custom geo projections (`d3-geo` + `d3-geo-projection`), force-directed with custom physics, Sankey/chord/treemap layouts (many libs use `d3-sankey` under hood), bespoke annotation layers on Canvas/WebGL, one-offs where no higher-level idiom fits.

**Bostock's current recommendation:** use Observable Plot, drop to D3 only when Plot runs out.

### 5.8 Visx (Airbnb)

MIT. React + D3 primitives. Headless, tree-shakable. ~30–50 KB gzipped per chart.

**Strengths:** truly React-native, bundle-obsessed, composable primitives. Perfect when design-polish matters and no library's defaults fit.

**Weaknesses:** no charts out of box — ship line/bar/area yourself. Animation via `react-spring`. Interactions hand-wired. D3 + React learning curve.

**When wins:** hand-crafted branded BI tiles where every pixel matters (KPI cards, sparklines, custom tooltip). Not right for 40+ chart types from LLM.

### 5.9 Nivo

MIT. React + D3. ~25 chart types (Bar, Line, Pie, Radar, Sankey, Sunburst, Chord, Calendar, Stream, Radial Bar, Voronoi).

**Strengths:** beautiful defaults, three renderers (SVG/Canvas/HTML), SSR friendly, built-in legends/tooltips/animations via `@react-spring/web`.

**Weaknesses:** chunky bundle (~120–180 KB gzip per chart). Fewer types than ECharts. Less perf at 10k+ points. Less flexible than Visx.

**Visx vs Nivo:** Visx = lego bricks for custom shapes. Nivo = catalog charts, beautiful defaults.

### 5.10 AntV G2 / G2Plot / S2 (Alibaba)

MIT. Alibaba stack.
- **G2** — grammar of graphics JS library explicitly inspired by Wilkinson + ggplot2. Marks, encodings, scales, coordinates, compositions. Canvas/SVG/WebGL via `G` engine.
- **G2Plot** — pre-configured charts on G2
- **S2** — pivot table / sheet / spreadsheet-style (BI cross-tab territory)

**Strengths:** proper grammar. Polished defaults. **S2 is a unique asset** — almost no other OSS lib ships production-grade cross-tab for BI. Good large-dataset story via `G` renderer.

**Weaknesses:** English docs uneven (many examples in Chinese). Bundle similar to ECharts. React wrappers feel bolted on (`@ant-design/plots`).

**For AskDB:** G2 is closest philosophical match if you want "grammar of graphics as JS runtime not JSON." **S2 worth stealing for pivot/crosstab** — every BI tool needs cross-tab, writing one from scratch is painful.

### 5.11 Apache Superset — OSS BI Reference

Per SIP-50 (ECharts migration proposal): chose **Apache ECharts as primary chart library**. Migrating legacy NVD3/D3-direct to ECharts. Reasoning: widest type coverage, best raw perf, active maintenance, single consistent API.

But not only ECharts. Plugin architecture (`superset-frontend/packages/superset-ui-plugin-*`):
- **ECharts plugins** for common dashboard catalog
- **Plotly plugin** for scientific/statistical + Python-driven custom charts
- **deck.gl plugins** for large-scale geospatial (polygons, hex bins, screen grid, paths, 3D extrusion, arc maps). **Nothing else touches deck.gl for big geo data.**
- Legacy **NVD3** being migrated out

**Lesson:** right architecture is **chart adapters behind a grammar-of-graphics IR**, not single-library bet. ECharts default, Plotly for 3D/statistical, deck.gl for >50k-point geo, VL (or raw D3) as escape hatch for long tail. Superset validates this as mainstream.

### 5.12 Deneb for Power BI — The Vega-Lite Bridge To Study

Open-source Power BI custom visual by Daniel Marsh-Patrick + collaborators. Lets Power BI users write **raw Vega or Vega-Lite JSON** inside Power BI's visual container. Drop fields into field well, write VL spec referencing them. **The single best production example of "grammar of graphics inside mainstream BI tool."**

**Architecture bridging Power BI field well → VL encoding:**
1. Power BI's Values field well holds user-selected fields. Deneb reads as dataframe.
2. Deneb exposes dataframe as **internal named dataset** `"dataset"`. VL spec references with `"data": {"name": "dataset"}`.
3. Field display names become VL column names — drop "Order Date" into Values → spec writes `"field": "Order Date"`.
4. Deneb handles theming (light/dark from Power BI theme), cross-filtering (selections emit Power BI selection IDs back), tooltips (Power BI-native system), context menus.
5. Specs render **inside** Power BI client with no external deps — Deneb ships own Vega runtime.

**Why it's a model for AskDB:** exact same bridge exists:
1. AskDB has SQL query result — table with typed columns
2. LLM picks `mark + encoding` against those columns
3. Compiler turns into chart spec (VL or ECharts)
4. User edits spec in property inspector (Deneb's JSON editor equivalent)

Deneb validates that **declarative specs + field-well binding** is professional BI workflow — not toy. Template gallery shows VL at high end: radial bar, pictograms, complex annotations, hand-tuned storytelling visuals.

### 5.13 Canvas vs SVG vs WebGL Tradeoffs

| Criterion | SVG | Canvas 2D | WebGL |
|---|---|---|---|
| Elements before lag | ~1k–5k nodes | ~50k–100k primitives | 100k–10M primitives |
| Hit-testing | Free (DOM) | Manual | Manual + shader picking |
| Accessibility/SEO | Native | None | None |
| Crisp at any zoom | Yes (vector) | Raster | Raster (unless redrawn) |
| Text rendering | Excellent | OK | Hard |
| Animation cost | High (CSS/SMIL) | Low (redraw) | Very low (GPU) |
| Export to PNG/PDF | Easy | Easy | Read pixels |
| Learning curve | Low | Medium | High (shaders) |

**Library defaults:**
- SVG-first: D3, Visx, VL, Nivo (optional), Recharts, Highcharts
- Canvas-first: ECharts, AntV G, Chart.js, Plotly 2D non-gl
- WebGL-first: deck.gl, regl, Plotly `*gl`, ECharts-GL, sigma.js, PixiJS

**Hybrid is norm.** ECharts/AntV/Plotly do Canvas for marks + SVG/DOM for tooltips/overlays. deck.gl does WebGL for scene + DOM for controls.

**Rule of thumb for AskDB:**
- ≤5k points: anything; SVG for crisp exports
- 5k–100k: Canvas (ECharts default with `large: true`, `sampling: 'lttb'`)
- >100k: WebGL (deck.gl for geo, ECharts-GL for 3D, `scattergl` in Plotly for 2D)
- Millions of rows time-series: **server-side downsampling** (LTTB in DuckDB/Python) + Canvas. AskDB's waterfall DuckDB twin pays off here.

### 5.14 Property Inspector UI Libraries

- **Leva** (`pmndrs/leva`) — React-first, pmndrs, originally for r3f. Schema-driven (`useControls({x: "age", color: "#f00"})`), folders, context swap, themes. MIT. ~40 KB gzipped. Best for floating, always-visible panel with minimal setup.
- **Tweakpane** — vanilla JS, dat.gui descendant. React via community wrappers. Polished visuals, plugin system (color pickers, curve editors, camera).
- **dat.gui** — original, largely superseded by Tweakpane/Leva.
- **Theatric** (`theatrejs.com`) — Theatre.js React panel. Timeline/animation editing.
- **shadcn/ui + React Hook Form + Zod** — not a property inspector per se, but with schema validation you get themed form fields matching rest of product. Superset, Metabase, Retool, Grafana all build inspectors from primitives — they want design control + awareness of chart IR schema (which fields valid for `x`, legal aggregations for field type, applicable scales). **Smart form, not generic property grid.**

**Recommendation:** Leva/Tweakpane for prototype (one day). Production = custom panel on shadcn/ui + React Hook Form + Zod driven by chart IR schema.

### 5.15 Summary Matrix

| Library | License | Bundle (gzip) | Rendering | React | Types | Grammar? | AskDB fit |
|---|---|---|---|---|---|---|---|
| **ECharts** | Apache-2.0 | ~170–500 KB | Canvas/SVG/GL | Via wrapper | 20+ built-in, custom series | Partial (`dataset`+`encode`) | **Primary — keep, add IR layer** |
| **Vega-Lite** | BSD-3 | ~400 KB | SVG/Canvas | `react-vega` | Via grammar | Yes (JSON) | **LLM IR / escape hatch** |
| **Observable Plot** | ISC | ~110 KB | SVG | Wrapper | Via marks | Yes (JS API) | Notebooks/quick exploration |
| **Plotly.js** | MIT | ~800 KB+ | SVG/Canvas/WebGL | `react-plotly.js` | 40+, 3D, scientific | Spec-like | 3D, splom, parcoords |
| **Highcharts** | Commercial | ~110 KB core | SVG/Canvas | Official | Vast + Stock/Maps/Gantt | No | Enterprise a11y + OHLC |
| **D3.js** | ISC | ~30 KB modular | SVG/Canvas | No | Build your own | No | Custom geometry |
| **Visx** | MIT | ~30–50 KB | SVG/Canvas | Native | Primitives | No | Hand-crafted branded tiles |
| **Nivo** | MIT | ~120–180 KB | SVG/Canvas/HTML | Native | ~25 | No | React defaults, lower perf |
| **AntV G2/S2** | MIT | ~300 KB | Canvas/SVG/WebGL | Wrapper | G2 grammar; S2 pivot | Yes (JS API) | **S2 for cross-tabs** |
| **deck.gl** | MIT | ~400 KB | WebGL | Yes | Geo layers | No | >50k-point geo |
## 6. Compact BI Editor UI Patterns

### 6.1 Property Inspector / Side Panel

Right-rail inspector is workhorse of any editor. Surface hundreds of editable props without overwhelming.

**Figma pattern:** when layer selected, sidebar shows only props relevant to that layer type. Shape → fill/stroke/effects/export. Text layer → typography. Component instance → **component playground** with exposed nested-instance props. Irrelevance hidden by default, not greyed out.

**Patterns to steal:**

- **Contextual relevance.** Never render irrelevant props. Figma swaps inspector content by layer type. Dev Mode panel only shows code props when Dev Mode on. AskDB: select bar chart → don't show radial-only props; select y-axis → show axis-only.
- **Progressive disclosure via collapsed groups.** Figma: collapsible sections (Auto layout, Appearance, Constraints, Effects, Export). Section headers show summary glyph when collapsed. Atlassian's 8px spacing foundation is the grid these snap to.
- **Property labels toggle.** Figma lets power users hide labels for density — small menu in panel header toggles "Property labels" on/off. Hidden-but-critical density lever.
- **Search inside inspector.** Framer + newer Figma betas: "search properties" field at top, same Cmd-K muscle memory. Useful when user knows property name but not section.
- **Reset-to-default.** Every modified prop should have reset affordance. Figma: tiny blue dot next to modified values; right-click/alt-click reverts. Power BI: explicit "Reset to default" button per property card.
- **Multi-selection formatting.** Power BI Feb 2024 added multi-visual container formatting. Multi-select across different visual types → pane shows shared-only properties. Previously went blank. Baseline: multi-select shows intersection, not empty panel.
- **Pane Manager (one pane at a time).** Power BI March 2024 aligned with Office pattern: one pane open, others collapsed to icon strip. Maximizes canvas real estate — critical for density-first editors.
- **Recently-used section.** Notion + Linear surface "recently edited" at top of property lists. AskDB: "Recent formatting" group under chart title short-cuts most-common edits.

**Anti-patterns:** do NOT use tabs inside inspector as primary organizing axis. Power BI historically had Fields/Format/Analytics tabs; new on-object model moving away. Deeply-nested tabs cause users to lose place. Prefer accordion sections over tabs.

### 6.2 On-Object Editing

**Biggest BI UX shift of 2024.** Power BI preview 2023 → rollout through 2024 → May 2024 added small multiples, waterfall, matrix support. Core idea: click directly on chart element you want to edit — axis label, legend, bar, title — floating format popover appears at cursor, filtered to properties relevant to that element.

**Power BI:**
- Double-click opens text element for inline editing (titles, axis labels)
- Right-click visual component → context menu with formatting commands for that element
- Traditional Visualizations pane **removed** in favor of on-object menus — deliberate bet that contextual editing beats monolithic side panel
- Analytics elements (error bars, min/max/percentile lines, reference lines) still in format pane at bottom via "Reference line" card — additive rather than modifying

**Figma floating toolbar:** pill-shaped toolbar appearing below selection with most common actions (add comment, convert to component, create variant). Non-modal; inspector stays populated on right, floating toolbar offers shortcuts to 5–6 most-used actions.

**Notion bubble menu:** select text → pill of formatting options (bold, italic, link, color, turn-into) floats above selection. Dismisses on blur. Zero visual cost when nothing selected.

**For AskDB:**
- Every chart element addressable. Click axis → axis popover. Click legend → legend popover. Click bar series → series popover. Don't force hunt through nested tree in right rail.
- Keep right-rail inspector AS WELL AS on-object — they complement, not compete. Power BI kept Format pane even after adding on-object.
- Double-click for text editing universal convention (titles, axis labels, annotations)
- Floating popovers auto-dismiss on outside click, keyboard-escapable, reposition to avoid viewport-edge clipping

### 6.3 Field/Data Pill Paradigms

Tableau's pill-and-shelf is most-imitated direct-manipulation paradigm in BI because it makes mapping data → visual encoding **physical**. Drag fields from Data pane onto Columns, Rows, or **Marks card** slots (Color, Size, Label, Detail, Tooltip, Shape).

**What makes pills work:**
- **Pills carry state.** Blue = discrete (categorical); green = continuous (axes, quantitative). Color encodes variable type + what chart will do, before drop. Right-click → change aggregation. Pill shows current aggregation inline (`SUM(Sales)`).
- **Hierarchy by stacking.** Drag one pill on top of another → instant drillable hierarchy. Direct manipulation at best: visual operation = data operation.
- **Slot affordance.** On drag, drop zones highlight with dashed borders + labels ("Drop to add to Color"). Subtle trick: can drag pill directly onto chart element (bar) and it routes to most-likely channel — dropping on bar assigns color.
- **Shift-drag to add, drag to replace.** Holding Shift while dragging to Color adds new field without replacing existing. Tiny modifier, huge power-user win.
- **Auto-aggregation hints.** Pill label communicates operation: `YEAR(OrderDate)`, `SUM(Profit)`. No hidden state. AskDB: pills showing resolved expression (including unit if any) less error-prone than anonymous chips.

**Looker Studio + Metabase differ:** both use dropdown "field slots" instead of drag targets — less physical but easier on touch and beginners. Metabase query builder is stacked dropdowns (Data → Filter → Summarize → Breakout) that users add rather than drag. Tradeoff: discoverability (dropdowns win) vs speed-of-rebinding (pills win).

**For AskDB:** since NL-first, pills appear AFTER AI generates chart — user's next step is rebinding fields, adjusting aggregation, splitting by new dimension. Pills on visible "encoding tray" (Rows / Columns / Color / Size / Tooltip) is right abstraction for that edit step.

### 6.4 Chart Picker Patterns

Four dominant approaches:

**Tableau Show Me:** popover grid of 24 chart-type thumbnails. Each enabled/disabled based on current field selection. Only 1 dim + 1 measure selected → bars light up, geo maps greyed. Hovering greyed thumbnail tells you what you're missing ("Requires 1 date, 1 measure"). **Gold standard for teaching users which charts their data supports.**

**Power BI viz pane:** fixed icon grid of types in right rail. No recommendation logic — user picks, then drags fields to wells. More manual than Tableau, but Power BI auto-changes data types based on which well field lands in. New on-object mode de-emphasizes this pane.

**Superset gallery modal:** 40+ types forced 2021 redesign (SIP-67). Full modal with:
- Left sidebar: category filters (Popular, KPI, Table, Distribution, Time-series, Map, Part-of-a-whole, Ranking, Correlation, Evolution)
- Top: search input (name, tag, description)
- Center: thumbnail grid with hover previews
- Tags for discrete variations (donut vs pie, horizontal vs vertical)

**Metabase:** guesses chart type from query return. Metric grouped by time → line default. **Most NL-friendly pattern, closest to what AskDB already does.** Users can override via viz picker but rarely need to.

**For AskDB:** already auto-picks from NL. Keep. But offer Tableau-style Show Me popover for override path — grid of thumbnails filtered by what current result set supports, greyed options showing why unavailable. Add search + category tags per Superset. Respects beginner (auto-pick) + power user (deliberate override).

### 6.5 Editor Layouts for BI Tools

Canonical BI editor has **three or four panes**:

| Pane | Role | Width |
|---|---|---|
| Left: Data/Schema | Tables, fields, sample values | 200–280px |
| Center: Canvas | Chart + query result | fluid |
| Right: Inspector | Format / encoding / analytics | 280–360px |
| Bottom (optional): Query/Console | SQL, logs, results table | 30–50% viewport |

**Tableau:** Data pane (left), Shelves + Marks card (above canvas), worksheet canvas (center), format pane (right when invoked). No bottom console.

**Power BI Desktop:** Fields pane (right-right), Visualizations pane (right), Filters pane (middle-right), canvas (center), data/model switcher tabs (left edge). Three panes stacked right can feel claustrophobic — why Pane Manager introduced.

**Hex:** breaks BI pattern. Notebook: cells flow top-to-bottom, everything (SQL, Python, charts, text) in cells. Still left sidebar (data connections, files) + right sidebar (selected cell props), but center is vertical scroll of cells. Deliberate constraint forces linear storytelling. **App Builder tab:** take cells, arrange into dashboard-like layout for sharing.

**Count.co:** canvas. Instead of cells flowing vertically, infinite 2D whiteboard where SQL cells, charts, text, images can be freely arranged. Arrows between cells show data lineage. "Shows thinking, not just charts."

**Mode:** notebook-meets-SQL-editor. Top pane SQL editor, bottom result grid + viz. Separate Report tab composes multiple queries into dashboard with text editor.

**Evidence.dev:** code-first. Markdown files with embedded SQL queries and chart components. No GUI editor — layout is whatever markdown produces, rendered as static site. Opposite extreme but worth noting for dev-focused teams.

**Lightdash:** dbt-native. Left sidebar of dbt models, dim/metric picker in middle, chart preview on right. Semantic-layer-first Tableau clone with LookML-style metrics in YAML.

**Takeaway for AskDB:** 3-pane (data/canvas/inspector) is safe default, users have deep muscle memory. Differentiators:
1. Collapsible bottom console for SQL preview (users always see generated SQL without leaving editor)
2. Optional Hex-style notebook mode for analysts chaining multiple queries
3. Keep inspector collapsible (Cmd-B style) so users can enter focus mode

### 6.6 Dashboards vs Worksheets

Tableau distinguishes worksheets (single chart + shelves) from dashboards (layout of multiple worksheets) from stories (sequences of dashboards). Separate mode: drag worksheets from sidebar onto dashboard canvas, add filters, resize. Edit chart itself = double-click, go back to worksheet tab.

**Is distinction still needed?** Modern tools split:
- **Superset:** strict separation — charts in Explore, dashboards assemble charts. Edit chart from dashboard → opens new tab.
- **Metabase:** dissolves somewhat — build Questions (single charts), drop onto dashboards, tiles can be edited with click-through.
- **Looker Studio:** inline editing — click tile in dashboard, right-rail inspector shows that tile's settings without leaving dashboard.
- **Hex + Count.co:** blur entirely. One document; charts + text coexist.
- **Power BI:** one document (`.pbix`) with multiple pages. Each visual edited inline on its page. No worksheet/dashboard split.

**Recommendation:** inline editing is modern preference. Don't force mode switch. Click tile → right-rail inspector contextualizes to that tile. Users should never have to "enter worksheet mode" to fix axis label.

### 6.7 Responsive / Adaptive Dashboards

Two orthogonal axes: (a) layout response to viewport size, (b) density response to user preference.

**Density preference (Gmail pattern).** Gmail: Comfortable / Cozy / Compact. Atlassian Design System built on 8px base unit. Trick: density should be **global toggle** every component respects, not per-component prop. For AskDB: single density setting (Comfortable / Compact) scaling row height, padding, chart margins, font size, inspector section spacing in lockstep.

**Responsive layout.** Most BI tools struggle. Power BI: "mobile layout" as separate tab, manually rearrange tiles for phone viewport. Tableau: Device-Specific Dashboards same philosophy. Tedious but explicit. Looker Studio: viewport-based tile positioning. Modern SaaS (Metabase, Lightdash): responsive grid — tiles reflow like Bootstrap grid below breakpoints.

**Density techniques:**
- rem-based typography → single root font-size change rescales entire editor
- Scale chart padding + axis-tick density with density token — compact mode = fewer gridlines, tighter labels, thinner bars
- Respect `prefers-reduced-data`, `prefers-reduced-motion` OS-level settings
- Atlassian recommends 8px base with half-steps (4px) for tight contexts. Pick one, be consistent.

### 6.8 Information Density Techniques

Edward Tufte canonical source. Thesis: **"More information is better than less information."** Information overload = poor design, not too much data.

**Techniques to deploy:**
- **Sparklines in tables.** Inline word-sized charts show trends next to summary values. AskDB result tables should support sparkline columns — each row = category, sparkline = time-series for that category. Metabase + Lightdash have this. **10x density improvement over separate chart per row.**
- **Mini bullet charts.** Stephen Few's bullet-chart replaces gauges. 20x40px bullet chart encodes actual value + target + range thresholds in table-cell space. Better than gauge in every way: higher density, no wasted center, easier to compare.
- **Color-coded deltas.** When cell shows number, sign + color encode direction + magnitude (+12.4% green, -3.1% red). Combine with tiny arrow glyph for redundancy (helps colorblind users).
- **Small multiples.** Tufte: "small multiples, whether tabular or pictorial, move to the heart of visual reasoning — to see, distinguish, choose." 4x3 grid of tiny line charts, one per category, shows 12 time-series in space of one big chart. Much better than rainbow-line with 12 series.
- **Data-ink ratio.** Tufte's formula: maximize ratio of "ink" used for data / total ink. Delete gridlines you don't need. Thin axis lines. No chartjunk borders, no 3D, no shadows. AskDB default theme should aim for data-ink > 0.75.
- **Shrink principle.** Any chart should survive being halved in size. If not, over-decorated. Use as design check.
- **Datawords / word-sized graphics.** Sparklines one example. Tufte also inlines win/loss sparklines for sports, price sparklines next to stock tickers. Any inline context-reducer counts.

**Avoid:** Tufte explicitly criticizes executive dashboards showing "only current values of a few metrics taken out of context with little or no history." KPI card saying "Revenue: $1.2M" useless. Same card + sparkline behind showing 12 months trend + delta vs. last period = 10x more informative at almost no space cost.

### 6.9 Color Palette Management

**ColorBrewer** (Cynthia Brewer, colorbrewer2.org) canonical reference.

Three palette types:

| Type | Use for | Example |
|---|---|---|
| **Sequential** | Ordered low → high | Heatmaps, choropleths, "sales by state" |
| **Diverging** | Meaningful midpoint (zero, target) | Profit/loss, variance-from-target |
| **Categorical** | Nominal, unordered | Department, product line, country |

**Rules:**
- Never categorical for ordered data (rainbow colormap on heatmap = well-known anti-pattern)
- Never sequential for nominal (implies ordering where none exists)
- Diverging should have equal luminance at endpoints
- Colorblind-safe palettes exist for all three. ColorBrewer lets you filter to colorblind-friendly + print-friendly

**Implementation:**
- **Vega + Observable Plot themes:** JSON-defined schemes swappable at runtime. ECharts has built-in support for theme objects with `color: [...]` arrays. Build AskDB theme as token file, switchable at runtime.
- **Looker Studio + Tableau + Power BI:** presets (ColorBrewer-inspired), custom palettes, save as organizational themes. Metabase 48 added palette editor where you pick colors and app precomputes sequential/diverging scales from seed.
- **Semantic color assignment.** Smartest modern tools (Hex, Lightdash) let you assign color to category value once, persists across every chart in workspace. "Europe" always blue. Requires workspace-level color map keyed on column + value. Hugely powerful for consistency.
- **Expose accessibility.** Show WCAG contrast indicator when picking text-on-color combo. Vega `scheme` tokens include "blues", "reds", "viridis" — adopt these names so vocab shared.

**Quick win for AskDB:** ship three default palettes (categorical, sequential, diverging) from ColorBrewer-safe schemes. Default to **Tableau 10** or **Viridis** for continuous. User override + save as workspace theme.

### 6.10 Empty States + Onboarding

Three patterns dominate:

**Suggested next step** (Shopify Polaris, Atlassian). Blank dashboard → single illustration, one sentence of purpose, one or two action buttons: "Add your first chart" / "Import from template." Not tutorial modal; quiet callout with button.

**Skeleton states during loading** (Linear, Notion). Data loading → show chart outline with animated shimmer rectangles where bars will be. Users understand shape of what's coming, don't feel app is broken.

**Template galleries** (Metabase, Power BI). First-time dashboard creation offers pre-built templates: "Sales overview," "Weekly metrics," "Cohort analysis." Each template = starting point with placeholder charts. Powerful for NL-first tools: users often don't know what to ask; template gives vocabulary.

**For AskDB specifically:**
- New workbook with no data → show suggested NL prompts as chips ("Show me last month's revenue by product," "Which customers churned in Q1?"). Reduces blank-page problem.
- Query returns zero rows → don't show empty chart. Show message: "No rows matched. Try broadening date range." Include one-click "Relax filters" button.
- Connection fails → show error + "Reconnect" action, not dead state.
- First-time setup: do NOT require users to configure complex semantic layer upfront. Metabase "X-rays" auto-generate starter dashboard from any table. AskDB could do same from any connected schema.

### 6.11 Inline Formula Editors

Power users demand calculated fields. Every serious BI tool ships formula editor; good ones feel like real IDE.

**Power BI DAX formula editor:** Intellisense (tab-complete for functions, tables, columns), syntax highlighting, function signature hints, inline error highlighting as you type. Tab to accept. **DAX Query View** offers Monaco-like editor with multiline, keyboard shortcuts, integrated formatting. **DAX Formatter** (daxformatter.com, SQLBI) — good pattern to build in as "format on save."

**Tableau calc editor:** modal dialog. Function reference on right, syntax highlighting main area, validation indicator at bottom ("The calculation is valid" green, or error red). Autocomplete for fields + functions.

**Looker LookML editor:** full IDE experience. File-tree nav, syntax highlighting, validation on save, git integration, LookML-specific autocomplete for dims, measures, derived tables. Lightdash clones this in YAML.

**Hex cell-based formula model:** every cell is SQL/Python/markdown. Formulas = code. No separate formula language. Sidesteps learning curve for users who know SQL.

**For AskDB:**
- Use **Monaco Editor** (VS Code engine, React component available). Gets syntax highlighting, autocomplete infrastructure, multi-cursor, keyboard shortcuts free.
- Register language server for formula dialect OR register autocomplete providers with schema + available functions.
- Show function-signature hints on hover (parameter types, return type, one-line doc).
- Validate on-the-fly: lightweight parse against current schema, red squiggle errors.
- Type-check: `AVG(Name)` where Name is text → highlight. Tableau does this well.
- "Format" button (or format-on-save) running pretty-printer. DAX Formatter UX is reference.

### 6.12 Keyboard Shortcuts

Power users live on shortcuts.

**Tableau shortcuts worth stealing:**
- `Ctrl+Shift+B` / `Ctrl+B` — marks bigger/smaller
- `Ctrl+W` — swap rows and columns (transpose)
- `F7` — presentation mode
- `Ctrl+Z` / `Ctrl+Y` — undo/redo (unlimited undo stack)
- `Ctrl+M` — add new worksheet
- Drag with Ctrl — duplicate a pill/field

**Power BI:**
- `Ctrl+Shift+L` — toggle slicer panel
- `Ctrl+.` — selection pane
- Arrow keys to nudge visuals, Shift-arrow to nudge further
- `F11` — focus mode on single visual
- Right-click + menu shortcuts for format operations

**Hex keyboard-centric:**
- `Cmd-Enter` — run cell
- `Cmd-Shift-Enter` — run all
- `Cmd-/` — toggle comment
- `Cmd-K` — command palette
- `J`/`K` — cell nav (Vim-style)

**Command palette = biggest single power-user win.** Cmd-K is universal "any action, type the name" interface — Linear, Raycast, Notion, Hex, VS Code all ship it.

For AskDB Cmd-K should:
- Execute any menu action by name
- Jump to any workbook/chart by name
- Trigger new NL prompt
- Apply any format command
- Navigate to settings

**Recommendations for AskDB:**
- Ship Cmd-K day one
- `Cmd-B` toggle inspector, `Cmd-\` toggle left pane (Linear convention)
- `?` show shortcut cheat sheet modal (Gmail, Linear, GitHub all do)
- Arrow-key nav within data pane (J/K or up/down)
- Log shortcut usage — unused shortcuts either remove or move to memorable slot

### 6.13 Modern BI Startups (2024–2025)

**Hex (hex.tech):** notebook-first. SQL + Python + no-code cells flow top-to-bottom.
- Logic View vs App Builder: same doc, two lenses. Logic View = code notebook; App Builder = compose cells into shareable dashboard layout. One-tab switch.
- Cube integration for headless BI.
- Realtime collaboration (Figma-style multiplayer cursors on data notebook).
- Strong Cmd-K + Vim-style nav.

**Mode (mode.com):** SQL-first analyst workbench. Top pane SQL, bottom results + viz, separate Report tab for narrative. Cleanest SQL-first UX.

**Count.co (count.co):** infinite 2D canvas with SQL cells, visualizations, arrows showing lineage. See entire analytical journey spatially — raw table → filtered → aggregated → chart → annotation — connecting arrows show data flow. Genuinely new UX.

**Evidence.dev (evidence.dev):** anti-GUI. Write markdown with embedded SQL + chart components, rendered as static site. Version-controlled, code-review'd dashboards. Radical simplicity: dashboards are code, reviewable in GitHub PRs.

**Lightdash (lightdash.com):** dbt-native. If team uses dbt, Lightdash inherits models + metrics automatically. LookML-style semantic layer in YAML. UX looks like Looker but free + OSS.

**Omni Analytics:** combines dbt-style semantic modeling with Tableau-style drag-and-drop exploration. Governed metrics + ad-hoc without mode switching.

**Preset:** managed Superset. Superset founders commercialized.

**Common themes:**
1. **Semantic layer is table stakes.** Metrics defined once (dbt, LookML, Cube), referenced everywhere.
2. **Collaboration is realtime.** Multiplayer cursors, comments threaded on charts, @-mentions. Figma playbook applied to BI.
3. **Git is not optional.** Dashboards, notebooks, semantic models version-controlled. Hex has git sync, Evidence git-native, Lightdash publishes as PRs.
4. **AI assist everywhere.** Hex Magic, Mode AI, Count AI — all ship NL-to-SQL or NL-to-chart. **Where AskDB is natively strong.** Differentiator isn't that you have AI — it's that **entire editor built around AI assist, not bolted on.**
5. **Info density over prettiness.** Hex + Count.co feel dense compared to Looker Studio / Power BI. White space is precious.
6. **Dark mode is default.** Most ship dark mode first.
7. **Command palette.** Cmd-K everywhere.
8. **Keyboard-first nav.** Vim bindings or strong arrow-key for cells + tables.

---

## 7. Cross-Tool Synthesis — What AskDB Should Steal

Three themes recur across all three tools:

**1. Separate spec from render.** Tableau builds declarative VizQL spec, compiles to both SQL and pixels. Power BI emits via capabilities.json → format pane auto-generated. Looker's Chart Config Editor exposes Highcharts JSON as editable layer. Deneb bridges VL JSON directly. **AskDB has NL→SQL, has NO intermediate spec.** Introducing one (even small JSON) is highest-leverage architectural change.

**2. Expose schema as first-class UI.** Data pane + drag-drop + Marks card together are mechanism that lets non-engineers build complex views. AskDB already knows schema from NL-to-SQL; exposing as draggable rail next to chart replicates most of this value with couple days of React work.

**3. Layered disclosure with sane defaults.** Show Me gives recommended chart + 20+ alternates. Marks card shows only channels current mark supports. Format pane opens where you right-clicked. Power BI on-object routes every click to relevant popover. Every surface = decision tree rooted at element you care about. For NL-to-SQL product: auto-pick chart (Show Me rules on result-set shape), let users swap through related charts with one click, right-click as universal entry point for formatting.

**Concrete patterns to copy:**

| Pattern | Source | Why |
|---|---|---|
| Grammar-of-graphics IR between LLM and renderer | Tableau VizQL, Vega-Lite, Deneb | LLM emits concisely, compile to ECharts, easier to edit |
| Marks-card-style encoding tray (Rows / Cols / Color / Size / Detail / Tooltip pills) | Tableau | Direct manipulation of chart composition |
| Show Me popover with greyed-out explanations | Tableau | Teaches users what's available, why not |
| Two-tab (Setup/Style) right-rail inspector | Looker Studio | Compact, non-analyst friendly |
| Context-sensitive on-object editing with floating popover | Power BI on-object, Figma, Notion | Reduces click cost 3–5× for common edits |
| Q&A linguistic schema (synonyms, phrasings, sample questions) | Power BI Q&A | Safer, better NL understanding over time |
| Viz in Tooltip (embedded mini-charts on hover) | Tableau 10.5+ | Single highest-leverage density feature |
| Small multiples as native slot | Power BI, Tableau (via table algebra) | Compare trend across segments without dropdowns |
| Sparkline columns in result tables | Tufte, Metabase, Lightdash | 10× density in tabular result views |
| Bullet chart replacing gauges | Stephen Few | Higher density, better comparison |
| On-canvas semantic color assignment ("Europe always blue") | Hex, Lightdash | Workspace-level consistency |
| Color palette manager (categorical / sequential / diverging) from ColorBrewer | All modern tools | Avoids rainbow-for-ordered anti-pattern |
| Monaco-based SQL/formula editor with schema-aware autocomplete | DAX Query View, LookML, Hex | Real IDE feel for calcs |
| Cmd-K command palette | Linear, Hex, VS Code, Raycast, Notion | Universal power-user input |
| Density toggle (Comfortable / Compact) | Gmail, Atlassian | Global scaling via single token |
| Dashboard actions (filter, highlight, parameter, set) | Tableau | "Static chart viewer" → "mini-app" |
| Plugin / custom-viz SDK | Power BI pbiviz, Looker Vis API, Deneb | Long-tail ceiling without core bloat |

---

## 8. Gap Analysis vs. Current AskDB State

Based on `QueryCopilot V1/CLAUDE.md` and known codebase (`ResultsChart.jsx`, `DashboardBuilder.jsx`, `CanvasChart.jsx`, `tokens.js`, ECharts-for-React):

**What AskDB has:**
- ECharts primary render (wide type coverage)
- Zustand store, React Router v7
- Theme tokens in `dashboard/tokens.js`
- Agent SSE streaming
- BYOK provider layer
- Basic chart type selection (likely heuristic)
- DuckDB twin (waterfall) — powerful for server-side downsampling

**What AskDB lacks (based on "rigid UI" complaint):**
1. **No grammar-of-graphics IR.** LLM likely emits ECharts option JSON directly. Verbose, brittle, hard to edit in UI.
2. **No Marks-card-style encoding tray.** User can't rebind fields → color/size/detail without re-prompting.
3. **No on-object editing.** Probably all formatting in dialog or modal, not by clicking chart elements.
4. **Rigid property panel.** Monolithic, all props visible always, no context-sensitive collapse.
5. **No Show Me picker.** Chart type swap probably via dropdown, not thumbnail grid with greyed-out options.
6. **No sparkline columns.** Result tables are flat text.
7. **No Viz in Tooltip.** Static tooltips only.
8. **No Cmd-K command palette.** No keyboard-first power-user surface.
9. **No density toggle.** Comfortable is the only mode.
10. **No workspace-level semantic color map.** Per-chart palette selection only.
11. **No inline Monaco formula editor.** Calculated fields probably require new NL prompt.
12. **No small-multiples slot.** Trellis not a first-class feature.

This gap list directly drives the implementation plan in §9 below.

---

## 9. Sources

### Tableau

- [Polaris: A System for Query, Analysis, and Visualization of Multidimensional Relational Databases (Stolte, Tang, Hanrahan, 2002)](https://www.semanticscholar.org/paper/Polaris:-a-system-for-query,-analysis,-and-of-Stolte-Tang/4127c2801f92fab450489f2deec940d87f392401)
- [VizQL: A Language for Query, Analysis and Visualization (Hanrahan, 2006, ACM)](https://dl.acm.org/doi/abs/10.1145/1142473.1142560)
- [Show Me: Automatic Presentation for Visual Analysis (Mackinlay, Hanrahan, Stolte, 2007)](https://www.semanticscholar.org/paper/Show-Me:-Automatic-Presentation-for-Visual-Analysis-Mackinlay-Hanrahan/a66b19219b522efe7aa2225acf8bf7828305fdd7)
- [Automating the Design of Graphical Presentations (Mackinlay APT, 1986, ACM)](https://dl.acm.org/doi/10.1145/22949.22950)
- [What is VizQL? (tableau.com)](https://www.tableau.com/drive/what-is-vizql)
- [Parts of the View](https://help.tableau.com/current/pro/desktop/en-us/view_parts.htm)
- [Shelves and Cards Reference](https://help.tableau.com/current/pro/desktop/en-us/buildmanual_shelves.htm)
- [Control the Appearance of Marks in the View](https://help.tableau.com/current/pro/desktop/en-us/viewparts_marks_markproperties.htm)
- [Change the Type of Mark in the View](https://help.tableau.com/current/pro/desktop/en-us/viewparts_marks_marktypes.htm)
- [Color Palettes and Effects](https://help.tableau.com/current/pro/desktop/en-us/viewparts_marks_markproperties_color.htm)
- [Use Show Me to Start a View](https://help.tableau.com/current/pro/desktop/en-us/buildauto_showme.htm)
- [Work with Data Fields in the Data Pane](https://help.tableau.com/current/pro/desktop/en-us/datafields_understanddatawindow.htm)
- [Dimensions and Measures, Blue and Green](https://help.tableau.com/current/pro/desktop/en-us/datafields_typesandroles.htm)
- [Edit Axes](https://help.tableau.com/current/pro/desktop/en-us/formatting_editaxes.htm)
- [Size and Lay Out Your Dashboard](https://help.tableau.com/current/pro/desktop/en-us/dashboards_organize_floatingandtiled.htm)
- [Refine Your Dashboard](https://help.tableau.com/current/pro/desktop/en-us/dashboards_refine.htm)
- [Actions](https://help.tableau.com/current/pro/desktop/en-us//actions.htm)
- [Parameter Actions](https://help.tableau.com/current/pro/desktop/en-us/actions_parameters.htm)
- [Tableau Extensions API](https://www.tableau.com/developer/tools/extensions-api)
- [tableau/extensions-api (GitHub)](https://github.com/tableau/extensions-api)
- [Which Chart or Graph is Right for You? (Tableau whitepaper)](https://www.tableau.com/learn/whitepapers/which-chart-or-graph-is-right-for-you)

### Power BI

- [Overview of visualizations in Power BI — Microsoft Learn](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview)
- [Choose the best visual for your data](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-decision-guide)
- [Add a visualization to a Power BI report](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-report-add-visualizations)
- [Use on-object interaction with visuals](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-on-object-interaction)
- [On-object public preview announcement (blog)](https://powerbi.microsoft.com/en-us/blog/on-object-public-preview-opt-in/)
- [Intro to Q&A tooling](https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-tooling-intro)
- [Edit Q&A linguistic schema](https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-tooling-advanced)
- [Capabilities and properties of Power BI visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/capabilities)
- [Develop custom visuals in Power BI](https://learn.microsoft.com/en-us/power-bi/developer/visuals/develop-power-bi-visuals)
- [Performance tips for custom visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/performance-tips)
- [Create a React-based visual for Power BI](https://learn.microsoft.com/en-us/power-bi/developer/visuals/create-react-visual)
- [Change how visuals interact in a report](https://learn.microsoft.com/en-us/power-bi/create-reports/service-reports-visual-interactions)
- [Create small multiples in Power BI](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-small-multiples)
- [Mobile layout view](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-create-mobile-optimized-report-mobile-layout-view)
- [Use report themes in Power BI](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes)
- [Create custom report themes](https://learn.microsoft.com/en-us/power-bi/create-reports/report-themes-create-custom)
- [Power BI March 2024 Feature Summary](https://powerbi.microsoft.com/en-us/blog/power-bi-march-2024-feature-summary/)
- [Power BI May 2024 Feature Summary](https://powerbi.microsoft.com/en-us/blog/power-bi-may-2024-feature-summary/)
- [DAX Query View](https://learn.microsoft.com/en-us/power-bi/transform-model/dax-query-view)
- [DAX Formatter by SQLBI](https://www.daxformatter.com/)

### Looker + Looker Studio

- [Visualization types (Looker)](https://docs.cloud.google.com/looker/docs/visualization-types)
- [Chart Config Editor (Looker)](https://docs.cloud.google.com/looker/docs/chart-config-editor)
- [Manifest visualization parameter](https://docs.cloud.google.com/looker/docs/reference/param-manifest-visualization)
- [Custom Visualizations v2 — API reference](https://github.com/looker-open-source/custom_visualizations_v2/blob/master/docs/api_reference.md)
- [Custom Visualizations v2 — Getting started](https://github.com/looker-open-source/custom_visualizations_v2/blob/master/docs/getting_started.md)
- [LookML terms and concepts](https://cloud.google.com/looker/docs/lookml-terms-and-concepts)
- [Changing the Explore menu and field picker](https://docs.cloud.google.com/looker/docs/changing-explore-menu-and-field-picker)
- [Cross-filtering dashboards](https://docs.cloud.google.com/looker/docs/cross-filtering-dashboards)
- [Gemini in Looker overview](https://docs.cloud.google.com/looker/docs/gemini-overview-looker)
- [Types of charts in Looker Studio](https://docs.cloud.google.com/looker/docs/studio/types-of-charts-in-looker-studio)
- [Properties panel (Looker Studio)](https://docs.cloud.google.com/looker/docs/studio/properties-panel)
- [Configure report components](https://cloud.google.com/looker/docs/studio/configure-report-components)
- [Use conditional formatting rules](https://docs.cloud.google.com/looker/docs/studio/use-conditional-formatting-rules)
- [How blends work in Looker Studio](https://docs.cloud.google.com/looker/docs/studio/how-blends-work-in-looker-studio)
- [Themes (Looker Studio)](https://docs.cloud.google.com/looker/docs/studio/themes)
- [Report and page layout](https://docs.cloud.google.com/looker/docs/studio/report-and-page-layout)
- [Looker Studio Community Visualizations](https://developers.google.com/looker-studio/visualization)
- [dscc-gen local dev](https://developers.google.com/looker-studio/visualization/local-dev)
- [dscc library reference](https://developers.google.com/looker-studio/visualization/library-reference)

### Chart libraries

- [Vega-Lite docs](https://vega.github.io/vega-lite/)
- [Vega-Lite: A Grammar of Interactive Graphics (paper)](https://vis.mit.edu/pubs/vega-lite.pdf)
- [Vega-Lite Selection](https://vega.github.io/vega-lite/docs/selection.html)
- [Observable Plot + Vega-Lite comparison](https://observablehq.com/@observablehq/plot-vega-lite)
- [ggplot2 book — Grammar of Graphics](https://ggplot2-book.org/mastery.html)
- [Apache ECharts Features](https://echarts.apache.org/en/feature.html)
- [ECharts 6 — What's New](https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/)
- [ECharts Custom Series](https://echarts.apache.org/handbook/en/how-to/custom-series/)
- [ECharts LTTB sampling issue #9403](https://github.com/apache/echarts/issues/9403)
- [LTTB explainer — dev.to](https://dev.to/said96dev/optimizing-line-chart-performance-with-lttb-algorithm-21dj)
- [Plotly.js docs](https://plotly.com/javascript/)
- [Highcharts Shop / Licensing](https://shop.highcharts.com/)
- [D3 — What is D3?](https://d3js.org/what-is-d3)
- [Visx — Airbnb (github)](https://github.com/airbnb/visx)
- [Nivo — React + D3](https://nivo.rocks/)
- [AntV G2](https://g2.antv.antgroup.com/en)
- [AntV G2 GitHub](https://github.com/antvis/G2)
- [Superset SIP-50 — ECharts as primary library](https://github.com/apache/superset/issues/10418)
- [Preset — Why ECharts is the Future of Apache Superset](https://preset.io/blog/2021-4-1-why-echarts/)
- [Deneb — Declarative Visualization in Power BI](https://deneb-viz.github.io/)
- [Deneb — Dataset documentation](https://deneb.guide/docs/dataset)
- [deck.gl](https://deck.gl/)
- [SVG vs Canvas vs WebGL — yWorks blog](https://www.yworks.com/blog/svg-canvas-webgl)

### UI patterns + modern BI

- [Figma — Design, prototype, and explore layer properties](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar)
- [Figma — Component properties](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties)
- [Atlassian Design — Spacing](https://atlassian.design/foundations/spacing)
- [ColorBrewer: Color Advice for Maps](https://colorbrewer2.org/)
- [Tufte — Sparkline theory and practice](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/)
- [Tufte — Executive dashboards critique](https://www.edwardtufte.com/notebook/executive-dashboards/)
- [Better Know a Visualization: Small Multiples — Juice Analytics](https://www.juiceanalytics.com/writing/better-know-visualization-small-multiples)
- [Hex — Keyboard shortcuts](https://learn.hex.tech/docs/explore-data/notebook-view/keyboard-shortcuts)
- [Hex — Notebook view](https://learn.hex.tech/docs/explore-data/notebook-view/develop-your-notebook)
- [Mode vs. Hex](https://mode.com/lp/hex/)
- [Count.co compared to Hex](https://count.co/compare/hex)
- [Metabase — Visualization overview](https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results)
- [Metabase — Which chart should you use?](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/visualization/chart-guide)
- [Lightdash — Chart types overview](https://docs.lightdash.com/references/chart-types/overview)
- [Superset SIP-67 Gallery modal redesign](https://github.com/apache/superset/issues/14474)
- [shadcn/ui — Form component](https://ui.shadcn.com/docs/components/form)
- [Leva — pmndrs](https://github.com/pmndrs/leva)
- [Tweakpane docs](https://tweakpane.github.io/docs/)

---

**End of research document.** Implementation plan follows in plan mode.

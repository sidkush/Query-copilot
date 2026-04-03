# Dashboard Editing Freedom: Tableau/Power BI-Tier Customization

## Problem

QueryCopilot dashboards render data correctly but offer minimal design freedom. Users can pick from 6 color palettes and 12 chart types, but cannot control axis labels, per-series colors, data labels, legend position, tile styling, typography, reference lines, conditional coloring, or grid appearance. Compared to Tableau and Power BI, the current freedom score is ~40%. The selling point of this product is dashboard quality — this must reach ~90%.

## Success Criteria

- Users can customize every visual aspect of a chart without touching code
- Per-measure color assignment (Revenue = green, Costs = red, always)
- Conditional coloring (value > 100K = green, < 50K = red)
- Title/subtitle typography control (font size, weight, color, alignment)
- Legend position control (top, bottom, left, right, hidden)
- Data labels on/off with formatting
- Reference lines (target, average, custom value)
- Per-tile background, border, shadow, padding control
- Dashboard-level theme that cascades to all tiles
- All formatting persists across save/reload
- Zero regressions in existing functionality (chart types, data blending, freeform layout, custom metrics)

---

## Architecture

### Editing UX: Hybrid Toolbar + Tabbed Modal

**Rationale:** Agent 4 evaluated 4 UX patterns. A side-drawer (Power BI style) eats 380px of screen width, problematic on screens <1600px with the existing 280px sidebar. A hybrid approach — floating toolbar for quick edits + enhanced tabbed modal for deep settings — has zero layout impact and minimizes clicks for common tasks (2 clicks to change a color vs 4 with a modal-only approach).

**Pattern:**
- **Single-click** a tile in the dashboard → `FloatingToolbar` appears near the tile
  - Quick controls: palette picker (5 swatches), chart type selector, legend toggle, data labels toggle, "Format..." button
  - Changes auto-save immediately (no modal required)
- **Double-click** or click "Format..." → opens enhanced `TileEditor` modal with 4 tabs:
  - **Data** tab (existing: SQL editor, measures, blending, filters, annotations)
  - **Format** tab (new: title typography, axis labels, grid, legend position, data labels, reference lines, sort)
  - **Colors** tab (new: inherit/palette/custom mode, per-measure color picker, conditional rules)
  - **Style** tab (new: tile background, border, shadow, padding, radius)
- **Click empty canvas** → deselects tile, hides toolbar

**Mobile (<768px):** Hide toolbar, keep modal as sole editing path.

### Data Model: Hierarchical Properties with Null-Inheritance

**Rationale:** Agent 6 compared 3 approaches. Flat keys (Approach A) bloats the tile object. A separate file (Approach C from original proposals) adds sync complexity. Nested `visualConfig` with `null = inherit` (Approach B + the implementation guide's hierarchy) is the cleanest:

```
Rendered value = tile.visualConfig.X ?? dashboard.themeConfig.X ?? SCHEMA_DEFAULT.X
```

**Dashboard level** — `dashboard.themeConfig`:
```json
{
  "palette": "default",
  "typography": {
    "titleFontSize": 13,
    "titleFontWeight": 600,
    "titleColor": "#EDEDEF",
    "subtitleFontSize": 11,
    "subtitleColor": "#8A8F98",
    "titleAlign": "left",
    "axisFontSize": 11
  },
  "spacing": {
    "tilePadding": 18,
    "tileRadius": 14,
    "tileGap": 12
  },
  "borders": {
    "width": 1,
    "color": "rgba(255,255,255,0.06)",
    "style": "solid"
  },
  "background": {
    "tile": "#111114",
    "dashboard": "#050506"
  },
  "chart": {
    "showGrid": true,
    "gridColor": "#162032",
    "gridStyle": "dashed",
    "showLegend": true,
    "legendPosition": "bottom",
    "showDataLabels": false,
    "animationEnabled": true
  }
}
```

**Tile level** — `tile.visualConfig` (null values inherit from dashboard):
```json
{
  "palette": null,
  "typography": {
    "titleFontSize": null,
    "titleFontWeight": null,
    "titleColor": null,
    "subtitleFontSize": null,
    "subtitleColor": null,
    "titleAlign": null,
    "axisFontSize": null
  },
  "axis": {
    "showXLabel": true,
    "showYLabel": true,
    "xLabel": "",
    "yLabel": "",
    "tickFormat": "auto",
    "tickDecimals": null,
    "xLabelRotation": 0
  },
  "legend": {
    "show": null,
    "position": null,
    "fontSize": null,
    "color": null
  },
  "grid": {
    "show": null,
    "color": null,
    "style": null,
    "vertical": false
  },
  "dataLabels": {
    "show": false,
    "format": "auto",
    "position": "top",
    "fontSize": 11,
    "color": null
  },
  "referenceLines": [],
  "tooltip": {
    "show": true,
    "template": ""
  },
  "sort": {
    "field": null,
    "order": "desc"
  },
  "colors": {
    "mode": "inherit",
    "palette": null,
    "measureColors": {},
    "rules": []
  },
  "style": {
    "background": null,
    "borderColor": null,
    "borderWidth": null,
    "borderStyle": null,
    "radius": null,
    "padding": null,
    "shadow": false,
    "shadowBlur": 8
  }
}
```

**Reference line entry:**
```json
{ "value": 1000, "label": "Target", "stroke": "#F59E0B", "strokeDasharray": "5 5" }
```

Special values for `value`: `"avg"`, `"median"`, `"min"`, `"max"` — computed from data at render time.

**Conditional color rule entry:**
```json
{ "measure": "Revenue", "condition": ">", "value": 100000, "color": "#22C55E" }
```

Supported conditions: `>`, `>=`, `<`, `<=`, `===`, `!==`, `range` (uses `value` + `value2`).

**Color resolution cascade** (highest priority first):
1. Conditional rule match for (measure, dataValue)
2. `tile.visualConfig.colors.measureColors[measure]`
3. `tile.visualConfig.colors.palette` (tile-level palette override)
4. `dashboard.themeConfig.palette`
5. `CHART_PALETTES.default`

### ResultsChart Integration

**Rationale:** Agent 7 evaluated 3 refactoring strategies. Extracting each chart type into separate components (Option B) creates 8 new files for marginal benefit. A config-driven generic renderer (Option C) is premature abstraction. Keeping the existing switch/case but injecting `fmt.*` props (Option A) is minimal-change, zero-risk.

**New prop:** `formatting` (object, optional). Merged with `FORMATTING_DEFAULTS` via `mergeFormatting()` utility.

**Backwards compatibility:** Chat results (embedded=false) pass no `formatting` prop, so `mergeFormatting(null)` returns all defaults. Existing behavior unchanged. Dashboard tiles (embedded=true) pass `tile.visualConfig` as `formatting`.

**New Recharts imports needed:** `ReferenceLine` (already available in recharts, just not imported).

### Backend Changes

**Minimal.** Agent 6 confirmed:
- `update_tile()` in `user_storage.py` does `tile[key] = val` for any key — `visualConfig` persists automatically
- `update_dashboard()` already accepts `themeConfig` if added to allowed keys (same pattern as `customMetrics`)
- Add `themeConfig: Optional[dict] = None` to `UpdateDashboardBody` Pydantic model
- Add `visualConfig: Optional[dict] = None` to `UpdateTileBody` Pydantic model
- Add `"themeConfig"` to allowed keys in `update_dashboard()` (line 503 of user_storage.py)
- Add `"themeConfig": {}` to default dashboard in `create_dashboard()`

**Migration:** Existing dashboards without `themeConfig` or tiles without `visualConfig` render with schema defaults. No data migration needed — the `null = inherit = default` cascade handles it.

---

## 12 Features — Detailed Design

### Feature 1: Title/Subtitle Typography

**Location:** TileEditor → Format tab
**Controls:** Font size (12-32px slider), font weight (400/600/700 select), color (ColorPickerButton), alignment (left/center/right radio)
**Data:** `tile.visualConfig.typography.*`
**Render:** TileWrapper reads effective typography, applies to title/subtitle spans via inline style
**Cascade:** tile → dashboard → defaults (13px, 600, #EDEDEF, left)

### Feature 2: Axis Labels & Formatting

**Location:** TileEditor → Format tab
**Controls:** Show X/Y labels (checkbox), custom label text (input), tick format (auto/integer/decimal/currency/percent select), tick decimals (0-4 number input), X-axis label rotation (0/45/90 select)
**Data:** `tile.visualConfig.axis.*`
**Render:** ResultsChart applies `<XAxis label={...}>` and `<YAxis label={...}>` with positioning + custom `tickFormatter`
**Applicable to:** Bar, Line, Area, Stacked, Horizontal Bar, Scatter charts

### Feature 3: Data Labels

**Location:** TileEditor → Format tab + FloatingToolbar toggle
**Controls:** Show/hide (toggle), format (auto/currency/percent), position (top/inside for bars), font size
**Data:** `tile.visualConfig.dataLabels.*`
**Render:** `<Bar label={fmt.dataLabels.show ? { position, formatter, fill, fontSize } : undefined} />`
**Applicable to:** Bar, Line, Area charts. Pie already has labels.

### Feature 4: Legend Position & Visibility

**Location:** TileEditor → Format tab + FloatingToolbar toggle
**Controls:** Position radio (top/bottom/left/right/hidden), font size, color
**Data:** `tile.visualConfig.legend.*`
**Render:** `<Legend verticalAlign={position} layout={position === 'left' || position === 'right' ? 'vertical' : 'horizontal'} />`
**Cascade:** tile → dashboard chart.showLegend/legendPosition → defaults (bottom, shown)

### Feature 5: Grid Line Control

**Location:** TileEditor → Format tab
**Controls:** Show/hide (checkbox), color (ColorPickerButton), style (solid/dashed select), show vertical (checkbox)
**Data:** `tile.visualConfig.grid.*`
**Render:** `<CartesianGrid stroke={color} strokeDasharray={style === 'dashed' ? '5 5' : '0'} vertical={showVertical} />`
**Cascade:** tile → dashboard chart.showGrid/gridColor/gridStyle → defaults

### Feature 6: Per-Measure Color Assignment

**Location:** TileEditor → Colors tab (custom mode)
**Controls:** For each active measure: ColorPickerButton showing current color + hex input
**Data:** `tile.visualConfig.colors.measureColors = { "Revenue": "#22C55E", "Costs": "#EF4444" }`
**Render:** In ResultsChart, replace `colors[i % colors.length]` with `resolveColor(measure, null, tile, dashboard)` which checks measureColors first, then palette
**New dependency:** `react-colorful` (6.5KB, zero deps) — `npm install react-colorful`

### Feature 7: Conditional Coloring

**Location:** TileEditor → Colors tab (rules section)
**Controls:** Rule builder: measure dropdown, operator select (> >= < <= === !== range), value input(s), ColorPickerButton, delete button. "+ Add Rule" button.
**Data:** `tile.visualConfig.colors.rules = [{ measure, condition, value, value2?, color }]`
**Render:** Per-bar/cell: `<Cell fill={resolveColor(measure, row[measure], tile, dashboard)} />`. First matching rule wins.
**Applicable to:** Bar, Stacked Bar, Horizontal Bar, Pie/Donut cells. Not applicable to Line/Area strokes (whole-series color only).

### Feature 8: Reference Lines

**Location:** TileEditor → Format tab
**Controls:** "+ Add Reference Line" button. Each row: value input (number or "avg"/"median"/"min"/"max" select), label input, color picker, style select (solid/dashed).
**Data:** `tile.visualConfig.referenceLines = [{ value, label, stroke, strokeDasharray }]`
**Render:** `<ReferenceLine y={computedValue} stroke={stroke} strokeDasharray={dash} label={{ value: label }} />`
**Computation:** For special values ("avg", "median"), compute from data rows at render time using a `useMemo`.
**Applicable to:** Bar, Line, Area, Stacked, Horizontal Bar charts.

### Feature 9: Per-Tile Background & Border

**Location:** TileEditor → Style tab
**Controls:** Background color picker, border color picker, border width (0-5px slider), border style (solid/dashed/dotted), corner radius (0-24px slider), inner padding (8-32px slider), shadow toggle + blur slider
**Data:** `tile.visualConfig.style.*`
**Render:** TileWrapper applies effective style to its outer `<div>`:
```
background: style.background ?? themeConfig.background.tile ?? TOKENS.bg.elevated
border: `${style.borderWidth ?? 1}px ${style.borderStyle ?? 'solid'} ${style.borderColor ?? TOKENS.border.default}`
borderRadius: `${style.radius ?? 14}px`
padding: `${style.padding ?? 18}px`
boxShadow: style.shadow ? `0 4px ${style.shadowBlur ?? 8}px rgba(0,0,0,0.4)` : 'none'
```

### Feature 10: Sort Controls

**Location:** TileEditor → Format tab
**Controls:** Sort by (dimension/measure select), order (asc/desc radio)
**Data:** `tile.visualConfig.sort = { field, order }`
**Render:** Before passing data to Recharts, sort rows: `[...data].sort((a, b) => ...)`
**Applicable to:** All chart types except KPI.

### Feature 10b: Tooltip Customization

**Location:** TileEditor → Format tab
**Controls:** Show/hide toggle, format template textarea with `{field}` placeholder syntax (e.g., "Sales: ${revenue} | Region: {region}")
**Data:** `tile.visualConfig.tooltip = { show: true, template: "" }`
**Render:** When `template` is non-empty, ResultsChart uses a custom Tooltip renderer that replaces `{fieldName}` tokens with actual values from `payload[0].payload`. When empty, uses the existing `CustomTooltip` component (auto-generated from all values).
**Applicable to:** All chart types with tooltips (Bar, Line, Area, Pie, Donut, Scatter).

### Feature 11: Dashboard Chrome (Title, Background)

**Location:** Dashboard-level settings modal (accessible from DashboardHeader "Theme" button)
**Controls:** Dashboard background color picker, default tile palette select (6 presets + custom), default typography settings, default spacing
**Data:** `dashboard.themeConfig.*`
**Render:** DashboardBuilder applies `themeConfig.background.dashboard` to the main container. All tiles inherit via cascade.

### Feature 12: Tile Spacing & Layout Control

**Location:** Dashboard-level settings modal
**Controls:** Tile gap (4-24px slider), outer padding (0-40px slider), section title font size, section title color
**Data:** `dashboard.themeConfig.spacing.*`
**Render:** Section.jsx and GridLayout `margin` prop read from `themeConfig.spacing.tileGap`. DashboardBuilder padding reads from `themeConfig.spacing`.

---

## New Components

| Component | Location | Purpose |
|---|---|---|
| `FloatingToolbar.jsx` | `frontend/src/components/dashboard/` | Quick-edit toolbar on tile selection (palette, chart type, legend, data labels, "Format..." button) |
| `ColorPickerButton.jsx` | `frontend/src/components/dashboard/` | Wraps `react-colorful` HexColorPicker with swatch button + popover |
| `ReferenceLineEditor.jsx` | `frontend/src/components/dashboard/` | Add/remove/edit reference lines with value + label + color |
| `ConditionalRuleBuilder.jsx` | `frontend/src/components/dashboard/` | Rule builder for conditional coloring (measure, operator, value, color) |
| `DashboardThemeEditor.jsx` | `frontend/src/components/dashboard/` | Modal for editing dashboard.themeConfig (palette, typography, spacing, backgrounds) |

## Existing Components to Modify

| Component | Change |
|---|---|
| `TileEditor.jsx` | Reorganize into 4 tabs (Data/Format/Colors/Style). Add all new formatting controls. |
| `TileWrapper.jsx` | Apply effective typography + style from visualConfig. Show FloatingToolbar on selection. |
| `ResultsChart.jsx` | Accept `formatting` prop. Replace hardcoded values with `fmt.*`. Add ReferenceLine. Add data labels. Dynamic legend position. |
| `Section.jsx` | Read spacing from themeConfig for grid margin. |
| `DashboardHeader.jsx` | Add "Theme" button to open DashboardThemeEditor. |
| `DashboardBuilder.jsx` | Manage selectedTileId state for toolbar. Pass themeConfig + visualConfig through component tree. Handle theme updates. |
| `tokens.js` | Add `FORMATTING_DEFAULTS` export for the full default config. |

## Backend Changes

| File | Change |
|---|---|
| `backend/routers/dashboard_routes.py` | Add `themeConfig: Optional[dict] = None` to UpdateDashboardBody. Add `visualConfig: Optional[dict] = None` to UpdateTileBody. |
| `backend/user_storage.py` | Add `"themeConfig"` to allowed keys in `update_dashboard()`. Add `"themeConfig": {}` to default dashboard in `create_dashboard()`. |

## New Dependency

```bash
npm install react-colorful
```

---

## Implementation Questions for Review

> [!NOTE]
> These are decisions that affect implementation direction. Please review before we start coding.

**Q1: Conditional coloring on lines/areas?**
Conditional coloring maps naturally to per-bar `<Cell>` colors (each bar can be different). For Line/Area charts, Recharts doesn't support per-point stroke colors — only per-series. Should we:
- **(a)** Apply conditional rules to Bar/Pie only, keep Line/Area as whole-series colors
- **(b)** Add a "segmented line" renderer that breaks the line into colored segments (complex, 2+ weeks extra)
- **Recommendation:** (a) — matches how Tableau handles it. Line color = measure color, not per-point.

**Q2: Custom color palettes?**
The 3-tier color system supports "inherit" (from dashboard theme), "palette" (6 presets), and "custom" (per-measure picker). Should we also allow users to CREATE their own named palettes (e.g., "Company Brand") saved at dashboard level?
- **(a)** Yes — add a "Custom Palette Builder" in DashboardThemeEditor where users define 8 colors
- **(b)** No — per-measure custom colors are enough. Named palettes are over-engineering.
- **Recommendation:** (a) — low effort, high perceived value. Store as `themeConfig.customPalette: ['#hex1', ...]`

**Q3: Tooltip customization scope?**
Tooltip content is currently auto-generated (shows all values). Should we expose:
- **(a)** Just show/hide toggle (minimal)
- **(b)** show/hide + format template (e.g., "{measure}: ${value}") — medium complexity
- **(c)** Full custom tooltip builder — high complexity, low ROI
- **Decision:** (b) — show/hide toggle + format template. Template uses `{field}` syntax, rendered by a custom Tooltip component that replaces placeholders with actual values from the data point.

**Q4: Dashboard theme presets?**
Should we ship pre-built theme presets ("Dark Pro", "Light Clean", "Corporate Blue") that users can apply as a starting point?
- **(a)** Yes — 3-4 presets as a starting library
- **(b)** No — just the default dark theme + full customization
- **Recommendation:** (b) for MVP. Users can build their own via themeConfig. Presets are a nice Phase 2 addition.

**Q5: Export with formatting?**
When users export a dashboard (PDF/PNG via ExportModal), should formatting (custom colors, reference lines, data labels) be included in the export?
- **Answer:** Yes, absolutely — formatting is already rendered in the DOM. `html2canvas` captures what's visible. No extra work needed as long as all formatting is rendered via inline styles or Recharts props (not CSS classes that might not render in canvas).

---

## Stress Test Plan

### Test Category 1: State Mutation Matrix

**Setup:** Dashboard with 12 tiles (3 bar, 2 line, 2 pie, 2 KPI, 2 table, 1 donut).

| # | Test | Expected | Pass Criteria |
|---|---|---|---|
| 1.1 | Change Tile 1 palette to "ocean" | Only Tile 1 changes | Other 11 tiles unchanged |
| 1.2 | Set dashboard theme to "sunset" | All tiles without overrides adopt sunset | Tile 1 stays "ocean" (override) |
| 1.3 | Override Revenue color to green on Tile 3 | Only Tile 3's Revenue bar is green | Other tiles/measures unaffected |
| 1.4 | Change dashboard theme to "forest" | Tile 3's Revenue stays green (override), other measures follow forest | Override persists through theme change |
| 1.5 | Remove Revenue color override on Tile 3 | Revenue falls back to dashboard theme ("forest") | Cascade works |

### Test Category 2: Save/Load Integrity

| # | Test | Expected |
|---|---|---|
| 2.1 | Apply complex formatting to 5 tiles, reload page | All formatting persists exactly |
| 2.2 | Update only `titleColor` on a tile that has full visualConfig | Other visualConfig fields NOT dropped (verify shallow merge handles nested objects) |
| 2.3 | Rapid edits (4 changes in 800ms debounce window) | Only final state saved |

### Test Category 3: Cross-Feature Regression

| # | Test | Expected |
|---|---|---|
| 3.1 | Change chart type (bar -> line -> bar) with formatting applied | All formatting preserved through type switches |
| 3.2 | Toggle measures on/off | Per-measure colors preserved for toggled-off measures |
| 3.3 | Refresh tile data (re-run SQL) | Formatting intact, new data rendered with old formatting |
| 3.4 | Global filter change | Formatting persists, data updates |
| 3.5 | Data blending + formatting together | Blended columns render with formatting |
| 3.6 | Freeform layout + formatting | Position and formatting both persist |

### Test Category 4: Edge Cases

| # | Test | Expected |
|---|---|---|
| 4.1 | Formatting on tile with no data | No crash, formatting saved, applies when data arrives |
| 4.2 | 0 measures selected + data labels enabled | Graceful empty state |
| 4.3 | Reference line value outside data range | Y-axis scales to accommodate |
| 4.4 | Overlapping conditional rules | First match wins (documented) |
| 4.5 | 20 reference lines on one chart | Renders without lag (<100ms) |
| 4.6 | Very long axis labels (100+ chars) | Truncated with tooltip, no layout break |

### Test Category 5: Performance

| # | Test | Expected |
|---|---|---|
| 5.1 | 12 tiles with formatting + reference lines | Dashboard loads <2s, 30+ FPS |
| 5.2 | Rapid color picker drags (50 changes/2s) | UI responsive, debounce prevents save storm |
| 5.3 | Memory after 30 minutes of editing | Heap <250MB, no unbounded growth |

### Quick Regression Smoke Test (run every build)
1. Test 2.1 (save/load)
2. Test 3.1 (chart type switching)
3. Test 5.1 (12-tile performance)

---

## Implementation Phasing (Internal)

**Phase 1 (Must-Haves):** Features 1-5 + 9 (title typography, axis labels, data labels, legend position, grid control, tile styling)
**Phase 2 (Colors):** Features 6-7 (per-measure colors, conditional coloring) + install react-colorful
**Phase 3 (Power):** Features 8, 10, 11, 12 (reference lines, sort, dashboard chrome, spacing)
**Phase 4 (Quick Edit):** FloatingToolbar component for 2-click edits

Each phase produces a working, testable increment.

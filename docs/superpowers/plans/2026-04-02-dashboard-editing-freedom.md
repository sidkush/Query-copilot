# Dashboard Editing Freedom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tableau/Power BI-tier dashboard customization — per-measure colors, typography, axis labels, data labels, reference lines, conditional coloring, tile styling, dashboard themes, tooltip templates, and a quick-edit floating toolbar.

**Architecture:** Hierarchical `visualConfig` on tiles (null = inherit from `dashboard.themeConfig` = inherit from schema defaults). Hybrid UX: floating toolbar for 2-click quick edits + tabbed TileEditor modal for deep settings. ResultsChart gets a `formatting` prop merged with FORMATTING_DEFAULTS. New dependency: `react-colorful` for color pickers.

**Tech Stack:** React 19, Recharts (extended with ReferenceLine, dynamic props), react-colorful, existing TOKENS design system

**Note:** This project has no automated test suite. Each task verifies via `npx vite build` and manual browser checks. Steps marked [MANUAL] require visual verification.

---

## File Map

### New Files
| File | Responsibility |
|---|---|
| `frontend/src/lib/formatUtils.js` | `FORMATTING_DEFAULTS`, `mergeFormatting()`, `resolveColor()`, `getEffectiveValue()` utilities |
| `frontend/src/components/dashboard/ColorPickerButton.jsx` | Wraps `react-colorful` HexColorPicker with swatch + popover |
| `frontend/src/components/dashboard/FloatingToolbar.jsx` | Quick-edit toolbar on tile selection |
| `frontend/src/components/dashboard/DashboardThemeEditor.jsx` | Modal for editing dashboard.themeConfig |
| `frontend/src/components/dashboard/ReferenceLineEditor.jsx` | Add/remove reference lines UI |
| `frontend/src/components/dashboard/ConditionalRuleBuilder.jsx` | Conditional coloring rule builder UI |

### Modified Files
| File | Change Summary |
|---|---|
| `frontend/src/components/dashboard/tokens.js` | Export `FORMATTING_DEFAULTS` |
| `frontend/src/components/dashboard/TileEditor.jsx` | Restructure into 4 tabs (Data/Format/Colors/Style), add all new formatting controls |
| `frontend/src/components/dashboard/TileWrapper.jsx` | Apply effective typography + tile styling from visualConfig, pass formatting to ResultsChart |
| `frontend/src/components/ResultsChart.jsx` | Accept `formatting` prop, replace hardcoded values, add ReferenceLine, data labels, dynamic legend, tooltip template |
| `frontend/src/components/dashboard/Section.jsx` | Read spacing from themeConfig for grid margin |
| `frontend/src/components/dashboard/DashboardHeader.jsx` | Add "Theme" button |
| `frontend/src/pages/DashboardBuilder.jsx` | Manage selectedTileId, pass themeConfig through tree, handle theme updates, render FloatingToolbar + ThemeEditor |
| `backend/routers/dashboard_routes.py` | Add `themeConfig` to UpdateDashboardBody, `visualConfig` to UpdateTileBody |
| `backend/user_storage.py` | Add `themeConfig` to allowed keys + default dashboard |

---

## Implementation Phases

> **SUGGESTION FOR REVIEWER:** Each phase produces a working increment. If time is tight, Phase 1-3 alone delivers ~70% of the value (formatting + colors). Phases 4-7 add polish.

---

### Task 1: Install react-colorful + Backend Model Changes

**Files:**
- Modify: `frontend/package.json` (npm install)
- Modify: `backend/routers/dashboard_routes.py:27,59`
- Modify: `backend/user_storage.py:503,478`

- [ ] **Step 1: Install react-colorful**

```bash
cd "QueryCopilot V1/frontend" && npm install react-colorful
```

- [ ] **Step 2: Add themeConfig to UpdateDashboardBody**

In `backend/routers/dashboard_routes.py`, the `UpdateDashboardBody` class (around line 21-27) currently has `customMetrics`. Add `themeConfig`:

```python
class UpdateDashboardBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tabs: Optional[list] = None
    annotations: Optional[list] = None
    globalFilters: Optional[dict] = None
    customMetrics: Optional[list] = None
    themeConfig: Optional[dict] = None      # NEW
```

- [ ] **Step 3: Add visualConfig to UpdateTileBody**

In the same file, `UpdateTileBody` (around line 47-60). Add `visualConfig`:

```python
class UpdateTileBody(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    chartType: Optional[str] = None
    sql: Optional[str] = None
    selectedMeasure: Optional[str] = None
    activeMeasures: Optional[list] = None
    palette: Optional[str] = None
    filters: Optional[dict] = None
    columns: Optional[list] = None
    rows: Optional[list] = None
    dataSources: Optional[list] = None
    blendConfig: Optional[dict] = None
    visualConfig: Optional[dict] = None     # NEW
```

- [ ] **Step 4: Add themeConfig to allowed keys in update_dashboard**

In `backend/user_storage.py` line 503, the allowed-keys tuple:

```python
for key in ("name", "description", "tabs", "annotations", "sharing", "customMetrics", "globalFilters", "themeConfig"):
```

- [ ] **Step 5: Add themeConfig to default dashboard in create_dashboard**

In `backend/user_storage.py` around line 478, inside the `dashboard = {` dict:

```python
        dashboard = {
            "id": uuid.uuid4().hex[:12],
            "name": name[:200],
            "description": "",
            "created_at": now,
            "updated_at": now,
            "tabs": [default_tab],
            "annotations": [],
            "sharing": {"enabled": False, "token": None},
            "customMetrics": [],
            "themeConfig": {},              # NEW
        }
```

- [ ] **Step 6: Verify backend**

```bash
cd "QueryCopilot V1/backend" && python -c "from routers.dashboard_routes import router; print('OK')"
```

- [ ] **Step 7: Commit**

```bash
git add backend/routers/dashboard_routes.py backend/user_storage.py frontend/package.json frontend/package-lock.json
git commit -m "feat: add themeConfig/visualConfig to backend models + install react-colorful"
```

---

### Task 2: Formatting Utilities — FORMATTING_DEFAULTS + resolveColor + getEffectiveValue

**Files:**
- Create: `frontend/src/lib/formatUtils.js`

This is the core contract. Every other task depends on these utilities.

- [ ] **Step 1: Create formatUtils.js**

Create `frontend/src/lib/formatUtils.js`:

```javascript
/**
 * Dashboard formatting utilities.
 * Provides defaults, cascade resolution, and color logic.
 */

import { CHART_PALETTES } from '../components/dashboard/tokens';

// ── Schema Defaults ──────────────────────────────────────────

export const FORMATTING_DEFAULTS = {
  typography: {
    titleFontSize: 13,
    titleFontWeight: 600,
    titleColor: '#EDEDEF',
    subtitleFontSize: 11,
    subtitleColor: '#8A8F98',
    titleAlign: 'left',
    axisFontSize: 11,
  },
  axis: {
    showXLabel: true,
    showYLabel: true,
    xLabel: '',
    yLabel: '',
    tickFormat: 'auto',
    tickDecimals: null,
    xLabelRotation: 0,
  },
  legend: {
    show: true,
    position: 'bottom',
    fontSize: 11,
    color: '#9ca3af',
  },
  grid: {
    show: true,
    color: '#162032',
    style: 'dashed',
    vertical: false,
  },
  dataLabels: {
    show: false,
    format: 'auto',
    position: 'top',
    fontSize: 11,
    color: null,
  },
  tooltip: {
    show: true,
    template: '',
  },
  referenceLines: [],
  sort: {
    field: null,
    order: 'desc',
  },
  colors: {
    mode: 'inherit',
    palette: null,
    measureColors: {},
    rules: [],
  },
  style: {
    background: null,
    borderColor: null,
    borderWidth: null,
    borderStyle: null,
    radius: null,
    padding: null,
    shadow: false,
    shadowBlur: 8,
  },
};

// ── Cascade Resolution ───────────────────────────────────────

/**
 * Get effective value for a formatting property using the cascade:
 * tile.visualConfig -> dashboard.themeConfig -> FORMATTING_DEFAULTS
 *
 * @param {string} path - dot-separated path, e.g. "typography.titleFontSize"
 * @param {object} visualConfig - tile-level config (may have nulls)
 * @param {object} themeConfig - dashboard-level config
 * @returns {*} resolved value
 */
export function getEffectiveValue(path, visualConfig, themeConfig) {
  const keys = path.split('.');
  const resolve = (obj) => {
    let val = obj;
    for (const k of keys) {
      if (val == null || typeof val !== 'object') return undefined;
      val = val[k];
    }
    return val;
  };

  // 1. Tile-level
  const tileVal = resolve(visualConfig);
  if (tileVal !== null && tileVal !== undefined) return tileVal;

  // 2. Dashboard-level
  const dashVal = resolve(themeConfig);
  if (dashVal !== null && dashVal !== undefined) return dashVal;

  // 3. Schema default
  return resolve(FORMATTING_DEFAULTS);
}

/**
 * Merge a full formatting section with defaults.
 * Returns a complete formatting object with no nulls.
 */
export function mergeFormatting(visualConfig, themeConfig) {
  const get = (path) => getEffectiveValue(path, visualConfig, themeConfig);

  return {
    typography: {
      titleFontSize: get('typography.titleFontSize'),
      titleFontWeight: get('typography.titleFontWeight'),
      titleColor: get('typography.titleColor'),
      subtitleFontSize: get('typography.subtitleFontSize'),
      subtitleColor: get('typography.subtitleColor'),
      titleAlign: get('typography.titleAlign'),
      axisFontSize: get('typography.axisFontSize'),
    },
    axis: {
      showXLabel: get('axis.showXLabel'),
      showYLabel: get('axis.showYLabel'),
      xLabel: get('axis.xLabel'),
      yLabel: get('axis.yLabel'),
      tickFormat: get('axis.tickFormat'),
      tickDecimals: get('axis.tickDecimals'),
      xLabelRotation: get('axis.xLabelRotation'),
    },
    legend: {
      show: get('legend.show'),
      position: get('legend.position'),
      fontSize: get('legend.fontSize'),
      color: get('legend.color'),
    },
    grid: {
      show: get('grid.show'),
      color: get('grid.color'),
      style: get('grid.style'),
      vertical: get('grid.vertical'),
    },
    dataLabels: {
      show: get('dataLabels.show'),
      format: get('dataLabels.format'),
      position: get('dataLabels.position'),
      fontSize: get('dataLabels.fontSize'),
      color: get('dataLabels.color'),
    },
    tooltip: {
      show: get('tooltip.show'),
      template: get('tooltip.template'),
    },
    referenceLines: visualConfig?.referenceLines ?? themeConfig?.referenceLines ?? [],
    sort: {
      field: get('sort.field'),
      order: get('sort.order'),
    },
    colors: {
      mode: get('colors.mode'),
      palette: get('colors.palette'),
      measureColors: visualConfig?.colors?.measureColors ?? themeConfig?.colors?.measureColors ?? {},
      rules: visualConfig?.colors?.rules ?? themeConfig?.colors?.rules ?? [],
    },
    style: {
      background: get('style.background'),
      borderColor: get('style.borderColor'),
      borderWidth: get('style.borderWidth'),
      borderStyle: get('style.borderStyle'),
      radius: get('style.radius'),
      padding: get('style.padding'),
      shadow: get('style.shadow'),
      shadowBlur: get('style.shadowBlur'),
    },
  };
}

// ── Color Resolution ─────────────────────────────────────────

/**
 * Resolve the color for a specific measure and data value.
 * Cascade: conditional rules > measureColors > tile palette > dashboard palette > default
 *
 * @param {string} measure - column name
 * @param {number|null} dataValue - row value (null for series-level color, not per-cell)
 * @param {number} measureIndex - index in displayMeasures array
 * @param {object} colorsConfig - merged colors section { mode, palette, measureColors, rules }
 * @param {string} dashboardPalette - dashboard.themeConfig.palette
 * @returns {string} hex color
 */
export function resolveColor(measure, dataValue, measureIndex, colorsConfig, dashboardPalette) {
  // 1. Conditional rules (only when dataValue provided — for per-cell coloring)
  if (dataValue !== null && dataValue !== undefined && colorsConfig.rules?.length) {
    const rule = colorsConfig.rules.find(r => {
      if (r.measure !== measure) return false;
      const v = Number(dataValue);
      switch (r.condition) {
        case '>': return v > r.value;
        case '>=': return v >= r.value;
        case '<': return v < r.value;
        case '<=': return v <= r.value;
        case '===': return v === r.value;
        case '!==': return v !== r.value;
        case 'range': return v >= r.value && v <= (r.value2 ?? Infinity);
        default: return false;
      }
    });
    if (rule?.color) return rule.color;
  }

  // 2. Per-measure custom color
  if (colorsConfig.measureColors?.[measure]) return colorsConfig.measureColors[measure];

  // 3. Tile-level palette
  if (colorsConfig.mode === 'palette' && colorsConfig.palette) {
    const palette = CHART_PALETTES[colorsConfig.palette] || CHART_PALETTES.default;
    return palette[measureIndex % palette.length];
  }

  // 4. Dashboard-level palette
  const palette = CHART_PALETTES[dashboardPalette] || CHART_PALETTES.default;
  return palette[measureIndex % palette.length];
}

/**
 * Format a tick value based on format config.
 */
export function formatTickValue(value, format, decimals) {
  if (value == null) return '';
  const num = Number(value);
  if (!isFinite(num)) return String(value);

  switch (format) {
    case 'integer': return Math.round(num).toLocaleString();
    case 'decimal': return num.toFixed(decimals ?? 2);
    case 'currency': return '$' + num.toLocaleString(undefined, { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: decimals ?? 0 });
    case 'percent': return (num * 100).toFixed(decimals ?? 1) + '%';
    default: {
      // Auto-format: K/M/B
      const abs = Math.abs(num);
      if (abs >= 1e9) return (num / 1e9).toFixed(1) + 'B';
      if (abs >= 1e6) return (num / 1e6).toFixed(1) + 'M';
      if (abs >= 1e3) return (num / 1e3).toFixed(1) + 'K';
      if (Number.isInteger(num)) return num.toLocaleString();
      return num.toFixed(decimals ?? 1);
    }
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/formatUtils.js
git commit -m "feat: add FORMATTING_DEFAULTS, resolveColor, getEffectiveValue utilities"
```

---

### Task 3: ColorPickerButton Component

**Files:**
- Create: `frontend/src/components/dashboard/ColorPickerButton.jsx`

- [ ] **Step 1: Create ColorPickerButton.jsx**

```javascript
import { useState, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { TOKENS } from './tokens';

export default function ColorPickerButton({ color, onChange, size = 28 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: size, height: size, borderRadius: 6,
          background: color || '#888', cursor: 'pointer',
          border: `2px solid ${open ? TOKENS.accent : 'rgba(255,255,255,0.12)'}`,
          transition: `border-color ${TOKENS.transition}`,
        }}
        title={color || 'Pick color'}
      />
      {open && (
        <div style={{
          position: 'absolute', top: size + 6, left: 0, zIndex: 200,
          background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.hover}`,
          borderRadius: 12, padding: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        }} onClick={(e) => e.stopPropagation()}>
          <HexColorPicker color={color || '#2563EB'} onChange={onChange} />
          <input
            type="text"
            value={color || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            style={{
              marginTop: 8, width: '100%', padding: '6px 8px', boxSizing: 'border-box',
              background: TOKENS.bg.deep, border: `1px solid ${TOKENS.border.default}`,
              borderRadius: 4, color: '#fff', fontSize: 12, fontFamily: 'monospace',
              outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/ColorPickerButton.jsx
git commit -m "feat: add ColorPickerButton component wrapping react-colorful"
```

---

### Task 4: ResultsChart — Accept formatting prop + dynamic rendering

**Files:**
- Modify: `frontend/src/components/ResultsChart.jsx`

This is the most complex single task. ResultsChart needs to accept a `formatting` prop and replace all hardcoded values with resolved formatting.

> **SUGGESTION FOR IMPLEMENTER:** This task modifies ~150 lines across the 800-line file. Read the full file first. The changes are surgical — each chart case in the switch gets the same pattern of replacements. Don't refactor the switch structure; just inject `fmt.*` props.

- [ ] **Step 1: Add ReferenceLine import**

In `ResultsChart.jsx` line 2-8, add `ReferenceLine` to the Recharts imports:

```javascript
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ScatterChart, Scatter, ZAxis,
  ReferenceLine,
} from "recharts";
```

- [ ] **Step 2: Add formatting prop and merge logic**

After the existing imports (line 8), add:

```javascript
import { mergeFormatting, resolveColor, formatTickValue } from '../lib/formatUtils';
```

In the component signature (line ~310), add the `formatting` prop:

```javascript
export default function ResultsChart({
  columns, rows,
  embedded = false,
  defaultChartType = null,
  defaultPalette = "default",
  defaultMeasure = null,
  defaultMeasures = null,
  customMetrics = [],
  formatting = null,              // NEW: tile.visualConfig (merged by caller)
  dashboardPalette = "default",   // NEW: dashboard.themeConfig.palette
  onAddToDashboard = null,
  question = null,
  sql = null,
}) {
```

After the `augColumns`/`augRows` logic (around line 335), add formatting merge:

```javascript
  // Merge formatting config with defaults
  const fmt = useMemo(() => mergeFormatting(formatting, null), [formatting]);
```

- [ ] **Step 3: Add reference line helper and tooltip template renderer**

After the `fmt` declaration, add:

```javascript
  // Reference lines — compute special values (avg, median, min, max)
  const computedRefLines = useMemo(() => {
    if (!fmt.referenceLines?.length || !data.length) return [];
    return fmt.referenceLines.map((rl) => {
      let value = rl.value;
      if (typeof value === 'string' && displayMeasures.length > 0) {
        const measure = displayMeasures[0];
        const nums = data.map((r) => Number(r[measure])).filter(isFinite);
        if (value === 'avg') value = nums.reduce((a, b) => a + b, 0) / nums.length;
        else if (value === 'median') {
          const sorted = [...nums].sort((a, b) => a - b);
          value = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        }
        else if (value === 'min') value = Math.min(...nums);
        else if (value === 'max') value = Math.max(...nums);
      }
      return { ...rl, value: Number(value) };
    }).filter((rl) => isFinite(rl.value));
  }, [fmt.referenceLines, data, displayMeasures]);

  // Custom tooltip with template support
  const TemplateTooltip = useCallback(({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;

    if (fmt.tooltip.template) {
      let text = fmt.tooltip.template;
      for (const key of Object.keys(row)) {
        text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), row[key] ?? '');
      }
      return (
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#e2e8f0' }}>
          {text}
        </div>
      );
    }

    // Default tooltip (existing CustomTooltip logic)
    return null; // Returning null falls through to the existing CustomTooltip
  }, [fmt.tooltip.template]);
```

> **NOTE FOR IMPLEMENTER:** The `TemplateTooltip` returns `null` when no template is set, which means the existing `<CustomTooltip />` should be used as fallback. Wire this as: `<Tooltip content={fmt.tooltip.template ? <TemplateTooltip /> : <CustomTooltip />} />`

- [ ] **Step 4: Update the bar chart case (lines 407-419)**

Replace the bar chart case with formatting-aware version:

```javascript
      case "bar":
        return (
          <BarChart data={sortedData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            {fmt.grid.show && (
              <CartesianGrid
                stroke={fmt.grid.color}
                strokeDasharray={fmt.grid.style === 'dashed' ? '5 5' : fmt.grid.style === 'dotted' ? '2 2' : '0'}
                vertical={fmt.grid.vertical}
              />
            )}
            <XAxis
              dataKey={labelCol}
              tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }}
              axisLine={{ stroke: '#1e293b' }}
              tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmt.axis.tickFormat !== 'auto' ? (v) => formatTickValue(v, fmt.axis.tickFormat, fmt.axis.tickDecimals) : formatTick}
              interval={data.length > 12 ? 'preserveStartEnd' : 0}
              label={fmt.axis.xLabel ? { value: fmt.axis.xLabel, position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 } : undefined}
              angle={fmt.axis.xLabelRotation || 0}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }}
              axisLine={{ stroke: '#1e293b' }}
              tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmt.axis.tickFormat !== 'auto' ? (v) => formatTickValue(v, fmt.axis.tickFormat, fmt.axis.tickDecimals) : formatTick}
              width={55}
              label={fmt.axis.yLabel ? { value: fmt.axis.yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 11 } : undefined}
            />
            {fmt.tooltip.show && (
              <Tooltip content={fmt.tooltip.template ? <TemplateTooltip /> : <CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
            )}
            {fmt.legend.show && displayMeasures.length > 1 && (
              <Legend
                layout={fmt.legend.position === 'left' || fmt.legend.position === 'right' ? 'vertical' : 'horizontal'}
                align={fmt.legend.position === 'left' ? 'left' : fmt.legend.position === 'right' ? 'right' : 'center'}
                verticalAlign={fmt.legend.position === 'top' ? 'top' : fmt.legend.position === 'bottom' ? 'bottom' : 'middle'}
                wrapperStyle={{ fontSize: fmt.legend.fontSize, color: fmt.legend.color }}
              />
            )}
            {computedRefLines.map((rl, idx) => (
              <ReferenceLine key={`ref-${idx}`} y={rl.value} stroke={rl.stroke || '#F59E0B'} strokeDasharray={rl.strokeDasharray || '5 5'} strokeWidth={1.5}
                label={{ value: rl.label || '', position: 'right', fill: '#9ca3af', fontSize: 11 }} />
            ))}
            {displayMeasures.map((col, i) => {
              const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
              const hasRules = fmt.colors.rules?.some((r) => r.measure === col);
              return (
                <Bar key={col} dataKey={col} fill={baseColor} radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out"
                  label={fmt.dataLabels.show ? { position: fmt.dataLabels.position, fill: fmt.dataLabels.color || baseColor, fontSize: fmt.dataLabels.fontSize,
                    formatter: (v) => formatTickValue(v, fmt.dataLabels.format, null) } : undefined}
                >
                  {hasRules && data.map((row, idx) => (
                    <Cell key={idx} fill={resolveColor(col, row[col], i, fmt.colors, dashboardPalette)} />
                  ))}
                </Bar>
              );
            })}
          </BarChart>
        );
```

> **NOTE FOR IMPLEMENTER:** The `sortedData` variable should be computed before the switch. Add this after the `data` declaration:
> ```javascript
> const sortedData = useMemo(() => {
>   if (!fmt.sort.field) return data;
>   return [...data].sort((a, b) => {
>     const aV = a[fmt.sort.field], bV = b[fmt.sort.field];
>     return fmt.sort.order === 'asc' ? (aV > bV ? 1 : -1) : (aV < bV ? 1 : -1);
>   });
> }, [data, fmt.sort]);
> ```

- [ ] **Step 5: Apply same pattern to line, area, stacked_bar, horizontal_bar, pie, donut cases**

Each chart type gets the same changes:
- `CartesianGrid` → use `fmt.grid.*`
- `XAxis/YAxis` → use `fmt.axis.*`, `fmt.typography.axisFontSize`
- `Legend` → use `fmt.legend.*` (position, layout, align)
- `Tooltip` → template-aware: `fmt.tooltip.template ? TemplateTooltip : CustomTooltip`
- `ReferenceLine` → add `computedRefLines.map(...)` (for Cartesian charts only, not Pie/Radar)
- `Bar/Line/Area fill/stroke` → use `resolveColor(col, null, i, fmt.colors, dashboardPalette)` instead of `colors[i % colors.length]`
- `label` prop → conditional on `fmt.dataLabels.show`
- Conditional `<Cell>` for bars/pie when rules exist

> **QUESTION FOR REVIEWER:** Line charts don't support per-point conditional coloring in Recharts (stroke is per-series). Confirmed decision: conditional rules apply to Bar/Pie `<Cell>` only. Line/Area get measure-level colors but NOT per-point rules. Is this still acceptable?

- [ ] **Step 6: Verify build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ResultsChart.jsx
git commit -m "feat: ResultsChart accepts formatting prop — dynamic grid, legend, axis, colors, labels, ref lines"
```

---

### Task 5: TileWrapper — Apply formatting to tile chrome + pass to ResultsChart

**Files:**
- Modify: `frontend/src/components/dashboard/TileWrapper.jsx`

- [ ] **Step 1: Import formatting utilities**

Add after existing imports (line 5):

```javascript
import { mergeFormatting } from '../../lib/formatUtils';
```

- [ ] **Step 2: Compute effective formatting**

Inside the component, after the `chartColumns`/`chartRows` useMemo (around line 38), add:

```javascript
  // Merge formatting: tile.visualConfig → defaults
  const fmt = useMemo(() => mergeFormatting(tile?.visualConfig, null), [tile?.visualConfig]);
```

- [ ] **Step 3: Apply typography to title/subtitle**

Replace the title/subtitle rendering (lines 66-67):

```jsx
          <span style={{
            fontSize: `${fmt.typography.titleFontSize}px`,
            fontWeight: fmt.typography.titleFontWeight,
            color: fmt.typography.titleColor,
            textAlign: fmt.typography.titleAlign,
          }}>{tile?.title || 'Untitled'}</span>
          {tile?.subtitle && <span style={{
            fontSize: `${fmt.typography.subtitleFontSize}px`,
            color: fmt.typography.subtitleColor,
          }}>{tile.subtitle}</span>}
```

- [ ] **Step 4: Apply tile styling to outer container**

Replace the outer div style (lines 54-55):

```jsx
    <div className="relative overflow-visible rounded-group h-full flex flex-col"
      style={{
        background: fmt.style.background || TOKENS.bg.elevated,
        border: `${fmt.style.borderWidth ?? 1}px ${fmt.style.borderStyle || 'solid'} ${fmt.style.borderColor || TOKENS.border.default}`,
        borderRadius: `${fmt.style.radius ?? 14}px`,
        boxShadow: fmt.style.shadow ? `0 4px ${fmt.style.shadowBlur ?? 8}px rgba(0,0,0,0.4)` : 'none',
        transition: `all ${TOKENS.transition}`,
      }}>
```

Update the chart body div padding (line ~146):

```jsx
      <div className="flex-1 min-h-[160px] overflow-hidden"
        style={{ padding: `12px ${fmt.style.padding ?? 18}px ${fmt.style.padding ?? 18}px` }}>
```

- [ ] **Step 5: Pass formatting to ResultsChart**

Update the ResultsChart render (lines 148-153):

```jsx
          <ResultsChart
            key={`${tile.id}-${tile.chartType}-${tile.palette}-${tile.dataSources?.length || 0}-${JSON.stringify(tile.visualConfig?.colors?.measureColors || {})}`}
            columns={chartColumns} rows={chartRows} embedded
            defaultChartType={tile.chartType} defaultPalette={tile.palette}
            defaultMeasure={tile.selectedMeasure} defaultMeasures={tile.activeMeasures}
            customMetrics={customMetrics}
            formatting={tile.visualConfig}
          />
```

> **NOTE FOR IMPLEMENTER:** Adding `measureColors` to the key ensures ResultsChart remounts when per-measure colors change.

- [ ] **Step 6: Verify build + [MANUAL] check existing dashboard still renders**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/TileWrapper.jsx
git commit -m "feat: TileWrapper applies visualConfig typography + tile styling + passes formatting to ResultsChart"
```

---

### Task 6: TileEditor — Restructure into 4 tabs + add all formatting controls

**Files:**
- Modify: `frontend/src/components/dashboard/TileEditor.jsx`
- Create: `frontend/src/components/dashboard/ReferenceLineEditor.jsx`
- Create: `frontend/src/components/dashboard/ConditionalRuleBuilder.jsx`

This is the largest task. The current TileEditor has 8 sections in a single scroll. We restructure into 4 tabs and add all new formatting controls.

> **SUGGESTION FOR IMPLEMENTER:** This task is large. Consider splitting into sub-commits: (a) tab structure, (b) Format tab controls, (c) Colors tab, (d) Style tab. Each sub-commit should build successfully.

- [ ] **Step 1: Create ReferenceLineEditor.jsx**

```javascript
import { TOKENS } from './tokens';
import ColorPickerButton from './ColorPickerButton';

const inputStyle = {
  padding: '6px 10px',
  background: TOKENS.bg.surface,
  border: `1px solid ${TOKENS.border.default}`,
  borderRadius: TOKENS.radius.sm,
  color: TOKENS.text.primary,
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function ReferenceLineEditor({ lines = [], onChange }) {
  const addLine = () => onChange([...lines, { value: '', label: '', stroke: '#F59E0B', strokeDasharray: '5 5' }]);
  const updateLine = (idx, updates) => onChange(lines.map((l, i) => i === idx ? { ...l, ...updates } : l));
  const removeLine = (idx) => onChange(lines.filter((_, i) => i !== idx));

  return (
    <div>
      {lines.map((line, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <select value={typeof line.value === 'string' && ['avg', 'median', 'min', 'max'].includes(line.value) ? line.value : 'custom'}
            onChange={(e) => updateLine(idx, { value: e.target.value === 'custom' ? '' : e.target.value })}
            style={{ ...inputStyle, width: 80, cursor: 'pointer' }}>
            <option value="custom">Value</option>
            <option value="avg">Average</option>
            <option value="median">Median</option>
            <option value="min">Min</option>
            <option value="max">Max</option>
          </select>
          {(typeof line.value !== 'string' || !['avg', 'median', 'min', 'max'].includes(line.value)) && (
            <input type="number" value={line.value} onChange={(e) => updateLine(idx, { value: parseFloat(e.target.value) || 0 })}
              style={{ ...inputStyle, width: 80 }} placeholder="Value" />
          )}
          <input value={line.label || ''} onChange={(e) => updateLine(idx, { label: e.target.value })}
            style={{ ...inputStyle, flex: 1 }} placeholder="Label" />
          <ColorPickerButton color={line.stroke || '#F59E0B'} onChange={(c) => updateLine(idx, { stroke: c })} size={24} />
          <select value={line.strokeDasharray || '5 5'} onChange={(e) => updateLine(idx, { strokeDasharray: e.target.value })}
            style={{ ...inputStyle, width: 70, cursor: 'pointer' }}>
            <option value="0">Solid</option>
            <option value="5 5">Dashed</option>
            <option value="2 2">Dotted</option>
          </select>
          <button onClick={() => removeLine(idx)} style={{ background: 'none', border: 'none', color: TOKENS.danger, cursor: 'pointer', fontSize: 14 }}>x</button>
        </div>
      ))}
      <button onClick={addLine} style={{
        padding: '4px 12px', fontSize: 11, background: TOKENS.bg.surface,
        border: `1px dashed ${TOKENS.border.default}`, borderRadius: TOKENS.radius.sm,
        color: TOKENS.text.muted, cursor: 'pointer',
      }}>+ Add Reference Line</button>
    </div>
  );
}
```

- [ ] **Step 2: Create ConditionalRuleBuilder.jsx**

```javascript
import { TOKENS } from './tokens';
import ColorPickerButton from './ColorPickerButton';

const inputStyle = {
  padding: '6px 10px',
  background: TOKENS.bg.surface,
  border: `1px solid ${TOKENS.border.default}`,
  borderRadius: TOKENS.radius.sm,
  color: TOKENS.text.primary,
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function ConditionalRuleBuilder({ rules = [], measures = [], onChange }) {
  const addRule = () => onChange([...rules, { measure: measures[0] || '', condition: '>', value: 0, color: '#22C55E' }]);
  const updateRule = (idx, updates) => onChange(rules.map((r, i) => i === idx ? { ...r, ...updates } : r));
  const removeRule = (idx) => onChange(rules.filter((_, i) => i !== idx));

  return (
    <div>
      {rules.map((rule, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, padding: 8, background: TOKENS.bg.surface, borderRadius: TOKENS.radius.sm }}>
          <select value={rule.measure} onChange={(e) => updateRule(idx, { measure: e.target.value })}
            style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
            {measures.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={rule.condition} onChange={(e) => updateRule(idx, { condition: e.target.value })}
            style={{ ...inputStyle, width: 60, cursor: 'pointer' }}>
            {['>', '>=', '<', '<=', '===', '!==', 'range'].map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input type="number" value={rule.value ?? ''} onChange={(e) => updateRule(idx, { value: parseFloat(e.target.value) || 0 })}
            style={{ ...inputStyle, width: 80 }} placeholder="Value" />
          {rule.condition === 'range' && (
            <input type="number" value={rule.value2 ?? ''} onChange={(e) => updateRule(idx, { value2: parseFloat(e.target.value) || 0 })}
              style={{ ...inputStyle, width: 80 }} placeholder="Max" />
          )}
          <ColorPickerButton color={rule.color || '#22C55E'} onChange={(c) => updateRule(idx, { color: c })} size={24} />
          <button onClick={() => removeRule(idx)} style={{ background: 'none', border: 'none', color: TOKENS.danger, cursor: 'pointer', fontSize: 14 }}>x</button>
        </div>
      ))}
      <button onClick={addRule} disabled={measures.length === 0} style={{
        padding: '4px 12px', fontSize: 11, background: TOKENS.bg.surface,
        border: `1px dashed ${TOKENS.border.default}`, borderRadius: TOKENS.radius.sm,
        color: measures.length === 0 ? TOKENS.text.muted : TOKENS.text.secondary, cursor: measures.length === 0 ? 'not-allowed' : 'pointer',
      }}>+ Add Rule</button>
    </div>
  );
}
```

- [ ] **Step 3: Restructure TileEditor into 4 tabs**

This is the core TileEditor change. The full restructured component is large (~500 lines). Key changes:

1. Add new imports at top:
```javascript
import ColorPickerButton from './ColorPickerButton';
import ReferenceLineEditor from './ReferenceLineEditor';
import ConditionalRuleBuilder from './ConditionalRuleBuilder';
import { FORMATTING_DEFAULTS } from '../../lib/formatUtils';
```

2. Add new useState for formatting fields (after existing state, line ~73):
```javascript
  // Formatting state (initialized from tile.visualConfig or defaults)
  const vc = tile.visualConfig || {};
  const [activeTab, setActiveTab] = useState('data');
  const [titleFontSize, setTitleFontSize] = useState(vc.typography?.titleFontSize ?? null);
  const [titleFontWeight, setTitleFontWeight] = useState(vc.typography?.titleFontWeight ?? null);
  const [titleColor, setTitleColor] = useState(vc.typography?.titleColor ?? null);
  const [titleAlign, setTitleAlign] = useState(vc.typography?.titleAlign ?? null);
  const [subtitleFontSize, setSubtitleFontSize] = useState(vc.typography?.subtitleFontSize ?? null);
  const [subtitleColor, setSubtitleColor] = useState(vc.typography?.subtitleColor ?? null);
  const [axisXLabel, setAxisXLabel] = useState(vc.axis?.xLabel ?? '');
  const [axisYLabel, setAxisYLabel] = useState(vc.axis?.yLabel ?? '');
  const [tickFormat, setTickFormat] = useState(vc.axis?.tickFormat ?? 'auto');
  const [xLabelRotation, setXLabelRotation] = useState(vc.axis?.xLabelRotation ?? 0);
  const [legendShow, setLegendShow] = useState(vc.legend?.show ?? null);
  const [legendPosition, setLegendPosition] = useState(vc.legend?.position ?? null);
  const [gridShow, setGridShow] = useState(vc.grid?.show ?? null);
  const [gridColor, setGridColor] = useState(vc.grid?.color ?? null);
  const [gridStyle, setGridStyle] = useState(vc.grid?.style ?? null);
  const [dataLabelsShow, setDataLabelsShow] = useState(vc.dataLabels?.show ?? false);
  const [dataLabelsFormat, setDataLabelsFormat] = useState(vc.dataLabels?.format ?? 'auto');
  const [dataLabelsPosition, setDataLabelsPosition] = useState(vc.dataLabels?.position ?? 'top');
  const [tooltipShow, setTooltipShow] = useState(vc.tooltip?.show ?? true);
  const [tooltipTemplate, setTooltipTemplate] = useState(vc.tooltip?.template ?? '');
  const [referenceLines, setReferenceLines] = useState(vc.referenceLines ?? []);
  const [sortField, setSortField] = useState(vc.sort?.field ?? null);
  const [sortOrder, setSortOrder] = useState(vc.sort?.order ?? 'desc');
  const [colorMode, setColorMode] = useState(vc.colors?.mode ?? 'inherit');
  const [colorPalette, setColorPalette] = useState(vc.colors?.palette ?? null);
  const [measureColors, setMeasureColors] = useState(vc.colors?.measureColors ?? {});
  const [colorRules, setColorRules] = useState(vc.colors?.rules ?? []);
  const [tileBg, setTileBg] = useState(vc.style?.background ?? null);
  const [tileBorderColor, setTileBorderColor] = useState(vc.style?.borderColor ?? null);
  const [tileBorderWidth, setTileBorderWidth] = useState(vc.style?.borderWidth ?? null);
  const [tileRadius, setTileRadius] = useState(vc.style?.radius ?? null);
  const [tilePadding, setTilePadding] = useState(vc.style?.padding ?? null);
  const [tileShadow, setTileShadow] = useState(vc.style?.shadow ?? false);
```

3. Update `handleSave` to include visualConfig:
```javascript
  const handleSave = useCallback(() => {
    const updated = {
      ...tile,
      title, subtitle, chartType, selectedMeasure, activeMeasures,
      sql, palette, filters: { dateStart, dateEnd, where: whereClause },
      annotations, dataSources, blendConfig,
      visualConfig: {
        typography: { titleFontSize, titleFontWeight, titleColor, subtitleFontSize, subtitleColor, titleAlign, axisFontSize: null },
        axis: { xLabel: axisXLabel, yLabel: axisYLabel, tickFormat, xLabelRotation, showXLabel: true, showYLabel: true, tickDecimals: null },
        legend: { show: legendShow, position: legendPosition, fontSize: null, color: null },
        grid: { show: gridShow, color: gridColor, style: gridStyle, vertical: false },
        dataLabels: { show: dataLabelsShow, format: dataLabelsFormat, position: dataLabelsPosition, fontSize: 11, color: null },
        tooltip: { show: tooltipShow, template: tooltipTemplate },
        referenceLines,
        sort: { field: sortField, order: sortOrder },
        colors: { mode: colorMode, palette: colorPalette, measureColors, rules: colorRules },
        style: { background: tileBg, borderColor: tileBorderColor, borderWidth: tileBorderWidth, radius: tileRadius, padding: tilePadding, shadow: tileShadow, borderStyle: null, shadowBlur: 8 },
      },
    };
    onSave(updated);
  }, [/* all state variables */]);
```

4. Add tab navigation bar in the modal header area (after the header, before scrollable content):
```jsx
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${TOKENS.border.default}`, padding: '0 20px', flexShrink: 0 }}>
            {['data', 'format', 'colors', 'style'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '10px 16px', fontSize: 12, fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? TOKENS.accent : TOKENS.text.secondary,
                borderBottom: activeTab === tab ? `2px solid ${TOKENS.accent}` : '2px solid transparent',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textTransform: 'capitalize', transition: `all ${TOKENS.transition}`,
              }}>{tab}</button>
            ))}
          </div>
```

5. Wrap existing sections 1-5b (Title, Chart Type, Measures, Filters, SQL, Data Blending) in `{activeTab === 'data' && (...)}`.

6. Add Format tab content: `{activeTab === 'format' && (...)}` containing:
   - Typography controls (title size/weight/color/align, subtitle size/color)
   - Axis controls (X/Y label, tick format, rotation)
   - Legend controls (show/hide, position radio)
   - Grid controls (show/hide, color, style)
   - Data labels controls (show/hide, format, position)
   - Tooltip controls (show/hide toggle, template textarea)
   - Reference lines (ReferenceLineEditor component)
   - Sort controls (field dropdown, asc/desc radio)

7. Add Colors tab: `{activeTab === 'colors' && (...)}` containing:
   - Mode selector tabs (inherit / palette / custom)
   - Palette picker (existing, shown when mode='palette')
   - Per-measure color pickers (shown when mode='custom')
   - Conditional rules builder (ConditionalRuleBuilder)

8. Add Style tab: `{activeTab === 'style' && (...)}` containing:
   - Background color picker
   - Border color picker + width slider
   - Corner radius slider
   - Inner padding slider
   - Shadow toggle

> **QUESTION FOR REVIEWER:** The TileEditor modal is currently maxWidth 600px. With 4 tabs of controls, should we increase to 700px or keep 600px? The tab content scrolls independently so 600px works, but 700px gives more breathing room for color pickers.

- [ ] **Step 4: Verify build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/TileEditor.jsx frontend/src/components/dashboard/ReferenceLineEditor.jsx frontend/src/components/dashboard/ConditionalRuleBuilder.jsx
git commit -m "feat: restructure TileEditor into 4 tabs with full formatting controls"
```

---

### Task 7: DashboardThemeEditor + Dashboard Chrome

**Files:**
- Create: `frontend/src/components/dashboard/DashboardThemeEditor.jsx`
- Modify: `frontend/src/components/dashboard/DashboardHeader.jsx`
- Modify: `frontend/src/pages/DashboardBuilder.jsx`

- [ ] **Step 1: Create DashboardThemeEditor.jsx**

A modal for editing `dashboard.themeConfig`. Contains:
- Palette selector (6 presets + custom palette builder)
- Dashboard background color picker
- Default typography settings (tile title size, axis font size)
- Default spacing (tile gap, padding, border radius)

Key structure:
```javascript
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS, CHART_PALETTES } from './tokens';
import ColorPickerButton from './ColorPickerButton';

export default function DashboardThemeEditor({ themeConfig = {}, onSave, onClose }) {
  const [palette, setPalette] = useState(themeConfig.palette || 'default');
  const [customPalette, setCustomPalette] = useState(themeConfig.customPalette || [...CHART_PALETTES.default]);
  const [dashboardBg, setDashboardBg] = useState(themeConfig.background?.dashboard || null);
  const [tileBg, setTileBg] = useState(themeConfig.background?.tile || null);
  const [tileGap, setTileGap] = useState(themeConfig.spacing?.tileGap ?? 12);
  const [tilePadding, setTilePadding] = useState(themeConfig.spacing?.tilePadding ?? 18);
  const [tileRadius, setTileRadius] = useState(themeConfig.spacing?.tileRadius ?? 14);
  // ... more state for typography defaults

  const handleSave = useCallback(() => {
    onSave({
      palette,
      customPalette: palette === 'custom' ? customPalette : undefined,
      background: { dashboard: dashboardBg, tile: tileBg },
      spacing: { tileGap, tilePadding, tileRadius },
      // typography, borders, chart defaults...
    });
    onClose();
  }, [/* deps */]);

  // Modal UI with sections for palette, backgrounds, spacing, typography
  // ...
}
```

> **NOTE FOR IMPLEMENTER:** When `palette === 'custom'`, show 8 ColorPickerButton swatches that edit `customPalette[0..7]`. The custom palette is stored at `dashboard.themeConfig.customPalette`.

- [ ] **Step 2: Add "Theme" button to DashboardHeader.jsx**

In `DashboardHeader.jsx`, add `onOpenTheme` prop and a button next to the Metrics button:

```jsx
export default function DashboardHeader({ dashboard, saving, onNameChange, onOpenMetrics, onOpenTheme }) {
```

Add the button in the right-side div (after the Metrics button):

```jsx
        {onOpenTheme && (
          <button onClick={onOpenTheme} title="Dashboard Theme"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
            style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
            </svg>
            Theme
          </button>
        )}
```

- [ ] **Step 3: Wire up in DashboardBuilder.jsx**

Add state and handler:
```javascript
const [showThemeEditor, setShowThemeEditor] = useState(false);

const handleThemeUpdate = useCallback((newTheme) => {
  setActiveDashboard((prev) => {
    if (!prev) return prev;
    const updated = { ...prev, themeConfig: newTheme };
    autoSave(updated);
    return updated;
  });
}, [autoSave]);
```

Pass to DashboardHeader:
```jsx
<DashboardHeader
  dashboard={activeDashboard}
  saving={saving}
  onNameChange={handleNameChange}
  onOpenMetrics={() => setShowMetricEditor(true)}
  onOpenTheme={() => setShowThemeEditor(true)}
/>
```

Render the modal:
```jsx
{showThemeEditor && (
  <DashboardThemeEditor
    themeConfig={activeDashboard?.themeConfig || {}}
    onSave={handleThemeUpdate}
    onClose={() => setShowThemeEditor(false)}
  />
)}
```

- [ ] **Step 4: Verify build + Commit**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
git add frontend/src/components/dashboard/DashboardThemeEditor.jsx frontend/src/components/dashboard/DashboardHeader.jsx frontend/src/pages/DashboardBuilder.jsx
git commit -m "feat: add DashboardThemeEditor for global theme + chrome settings"
```

---

### Task 8: FloatingToolbar for Quick Edits

**Files:**
- Create: `frontend/src/components/dashboard/FloatingToolbar.jsx`
- Modify: `frontend/src/pages/DashboardBuilder.jsx`
- Modify: `frontend/src/components/dashboard/TileWrapper.jsx`

- [ ] **Step 1: Create FloatingToolbar.jsx**

```javascript
import { TOKENS, CHART_PALETTES } from './tokens';

const PALETTE_SWATCHES = ['default', 'ocean', 'sunset', 'forest', 'colorblind'];

export default function FloatingToolbar({ tile, onQuickUpdate, onOpenEditor }) {
  const vc = tile?.visualConfig || {};

  const update = (path, value) => {
    // Deep-set a single value in visualConfig and trigger save
    const newVc = JSON.parse(JSON.stringify(vc));
    const keys = path.split('.');
    let obj = newVc;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    onQuickUpdate({ ...tile, visualConfig: newVc });
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
      background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.hover}`,
      borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
      zIndex: 100,
    }}>
      {/* Palette swatches */}
      {PALETTE_SWATCHES.map((key) => (
        <button key={key} onClick={() => update('colors.palette', key)} title={key}
          style={{
            width: 18, height: 18, borderRadius: 4,
            background: CHART_PALETTES[key][0],
            border: (vc.colors?.palette || tile.palette) === key ? `2px solid ${TOKENS.accent}` : '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer',
          }} />
      ))}

      <div style={{ width: 1, height: 16, background: TOKENS.border.default, margin: '0 2px' }} />

      {/* Legend toggle */}
      <button onClick={() => update('legend.show', !(vc.legend?.show ?? true))} title="Toggle legend"
        style={{
          padding: '3px 8px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
          background: (vc.legend?.show ?? true) ? TOKENS.accentGlow : 'transparent',
          border: `1px solid ${(vc.legend?.show ?? true) ? TOKENS.accent : TOKENS.border.default}`,
          color: (vc.legend?.show ?? true) ? TOKENS.accent : TOKENS.text.muted,
        }}>Legend</button>

      {/* Data labels toggle */}
      <button onClick={() => update('dataLabels.show', !vc.dataLabels?.show)} title="Toggle data labels"
        style={{
          padding: '3px 8px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
          background: vc.dataLabels?.show ? TOKENS.accentGlow : 'transparent',
          border: `1px solid ${vc.dataLabels?.show ? TOKENS.accent : TOKENS.border.default}`,
          color: vc.dataLabels?.show ? TOKENS.accent : TOKENS.text.muted,
        }}>Labels</button>

      <div style={{ width: 1, height: 16, background: TOKENS.border.default, margin: '0 2px' }} />

      {/* Format button → opens full editor */}
      <button onClick={onOpenEditor} style={{
        padding: '3px 10px', fontSize: 10, fontWeight: 600, borderRadius: 4,
        background: TOKENS.accent, color: '#fff', border: 'none', cursor: 'pointer',
      }}>Format...</button>
    </div>
  );
}
```

- [ ] **Step 2: Add selectedTileId state to DashboardBuilder**

In DashboardBuilder.jsx, add:
```javascript
const [selectedTileId, setSelectedTileId] = useState(null);
```

Add a quick-update handler:
```javascript
const handleQuickTileUpdate = useCallback(async (updatedTile) => {
  try {
    await api.updateTile(activeDashboard.id, updatedTile.id, updatedTile);
    setActiveDashboard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tabs: prev.tabs.map((tab) => ({
          ...tab,
          sections: (tab.sections || []).map((sec) => ({
            ...sec,
            tiles: (sec.tiles || []).map((t) =>
              t.id === updatedTile.id ? { ...t, ...updatedTile } : t
            ),
          })),
        })),
      };
    });
  } catch (err) {
    console.error('Quick update failed:', err);
  }
}, [activeDashboard]);
```

- [ ] **Step 3: Pass tile selection callbacks through Section → TileWrapper**

In TileWrapper, add `onSelect` prop and call it on click:
```jsx
export default function TileWrapper({ tile, index, onEdit, onEditSQL, onChangeChart, onRemove, onRefresh, customMetrics = [], onSelect }) {
```

Add click handler to the outer div:
```jsx
onClick={() => onSelect?.(tile.id)}
```

Thread `onSelect` through Section.jsx → SectionGrid → TileWrapper.

- [ ] **Step 4: Render FloatingToolbar in DashboardBuilder**

Find the selected tile and render the toolbar:
```jsx
{selectedTileId && (() => {
  let selectedTile = null;
  for (const tab of activeDashboard?.tabs || [])
    for (const sec of tab.sections || [])
      for (const t of sec.tiles || [])
        if (t.id === selectedTileId) selectedTile = t;
  if (!selectedTile) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
      <FloatingToolbar
        tile={selectedTile}
        onQuickUpdate={handleQuickTileUpdate}
        onOpenEditor={() => { handleTileEdit(selectedTile); setSelectedTileId(null); }}
      />
    </div>
  );
})()}
```

Add click-away handler to deselect:
```jsx
// On the main content area div:
onClick={(e) => { if (e.target === e.currentTarget) setSelectedTileId(null); }}
```

- [ ] **Step 5: Verify build + Commit**

```bash
cd "QueryCopilot V1/frontend" && npx vite build --mode development 2>&1 | tail -3
git add frontend/src/components/dashboard/FloatingToolbar.jsx frontend/src/pages/DashboardBuilder.jsx frontend/src/components/dashboard/TileWrapper.jsx frontend/src/components/dashboard/Section.jsx
git commit -m "feat: add FloatingToolbar for 2-click quick edits on tile selection"
```

---

### Task 9: Section Spacing from ThemeConfig

**Files:**
- Modify: `frontend/src/components/dashboard/Section.jsx`

- [ ] **Step 1: Accept themeConfig prop and apply spacing**

In Section.jsx, add `themeConfig` prop:
```javascript
export default function Section({ section, connId, onLayoutChange, ..., themeConfig }) {
```

In SectionGrid, use `themeConfig.spacing.tileGap` for grid margin:
```jsx
<GridLayout
  className="layout"
  layout={layout}
  cols={12}
  rowHeight={80}
  width={width}
  margin={[themeConfig?.spacing?.tileGap ?? 12, themeConfig?.spacing?.tileGap ?? 12]}
  isDraggable
  isResizable
  draggableHandle=".cursor-grab"
  onLayoutChange={(newLayout) => onLayoutChange?.(sectionId, newLayout)}
>
```

Pass `themeConfig` from DashboardBuilder → Section.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/Section.jsx frontend/src/pages/DashboardBuilder.jsx
git commit -m "feat: section grid spacing reads from dashboard themeConfig"
```

---

### Task 10: Final Build Verification + Stress Test Checklist

- [ ] **Step 1: Full build**

```bash
cd "QueryCopilot V1/frontend" && npx vite build 2>&1
```

Confirm: No errors. Multiple chunks.

- [ ] **Step 2: Backend verification**

```bash
cd "QueryCopilot V1/backend" && python -c "from routers.dashboard_routes import router; print('Routes:', len(router.routes))"
```

- [ ] **Step 3: [MANUAL] Smoke test — run through stress test checklist**

Follow the stress test plan from the spec (section "Stress Test Plan"):

1. **State mutation matrix** — Create 12-tile dashboard. Change one tile's palette → verify only that tile changes. Override one measure color → verify cascade.
2. **Save/load** — Apply formatting to 5 tiles. Reload page. Verify all persists.
3. **Cross-feature regression** — Change chart type with formatting → verify preserved. Toggle measures → verify colors preserved. Refresh data → verify formatting intact.
4. **Edge cases** — Formatting on empty tile (no crash). Reference line outside range. Overlapping rules (first match wins).
5. **Performance** — 12 tiles with formatting + reference lines + data labels. Dashboard loads <2s.

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
git commit -m "feat: Tableau/Power BI-tier dashboard editing freedom — 12 formatting features"
```

---

## Open Questions for Reviewer

> **Before implementation begins, please confirm or adjust these:**

1. **TileEditor modal width:** Keep 600px or increase to 700px for tab layout breathing room?

2. **Custom palette storage:** The custom palette builder lets users define 8 colors. Should these be named and reusable across dashboards (stored in user profile), or scoped to one dashboard only?

3. **Formatting reset button:** Should each formatting section have a "Reset to default" button that clears tile-level overrides back to dashboard theme? (Recommended: yes)

4. **Color picker debounce:** When users drag the color picker, it fires onChange rapidly. Should we debounce saves to 200ms to prevent API storms, or save only on color picker close?

5. **Reference line limit:** Should we cap reference lines per tile at a reasonable number (e.g., 10) to prevent performance issues, or leave unlimited?

6. **Backward compatibility for `tile.palette`:** The old `tile.palette` field still exists. When a tile has both `tile.palette` and `tile.visualConfig.colors.palette`, which wins? Recommendation: `visualConfig` always wins; `tile.palette` is read as fallback for old tiles without visualConfig.

7. **Tooltip template syntax:** We're using `{fieldName}` placeholders. Should we also support basic formatting like `{revenue:$}` for currency or `{rate:%}` for percentage? Or keep templates simple (just substitution)?

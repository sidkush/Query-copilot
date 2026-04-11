import { useState, useRef, useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mergeFormatting, resolveColor, resolveCategoryColor, formatTickValue } from '../lib/formatUtils';
import { injectMetricColumns } from '../lib/metricEvaluator';
import { useStore } from "../store";

const ReactECharts = lazy(() => import('echarts-for-react'));

/* ── Color Palettes (corporate blue-first) ── */
const PALETTES = {
  default:    ["#2563EB", "#0369A1", "#0EA5E9", "#38BDF8", "#1E40AF", "#3B82F6", "#06B6D4", "#0284C7"],
  ocean:      ["#06b6d4", "#0ea5e9", "#38bdf8", "#7dd3fc", "#0284c7", "#0369a1", "#22d3ee", "#67e8f9"],
  sunset:     ["#f59e0b", "#ef4444", "#f97316", "#fb923c", "#dc2626", "#ea580c", "#d97706", "#fbbf24"],
  forest:     ["#059669", "#10b981", "#34d399", "#6ee7b7", "#047857", "#065f46", "#14b8a6", "#2dd4bf"],
  mono:       ["#94a3b8", "#cbd5e1", "#64748b", "#475569", "#334155", "#1e293b", "#e2e8f0", "#f1f5f9"],
  colorblind: ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#000000"],
};

/* ── Helpers ── */
function coerceNumericRows(columns, rows) {
  if (!rows.length) return rows;
  const numStrCols = columns.filter((c) =>
    rows.some((r) => typeof r[c] === "string" && r[c].trim() !== "" && !isNaN(Number(r[c])))
    && !rows.some((r) => typeof r[c] === "string" && r[c].trim() !== "" && isNaN(Number(r[c])))
  );
  if (numStrCols.length === 0) return rows;
  return rows.map((r) => {
    const copy = { ...r };
    for (const c of numStrCols) {
      if (typeof copy[c] === "string" && copy[c].trim() !== "") copy[c] = Number(copy[c]);
    }
    return copy;
  });
}

function formatTick(value) {
  if (typeof value !== "number") {
    const str = String(value);
    return str.length > 10 ? str.slice(0, 10) + ".." : str;
  }
  if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(1) + "B";
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + "M";
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(1) + "K";
  return value;
}

function formatNumber(value) {
  if (typeof value !== "number") return value;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/* ── Data analysis ── */
function analyzeData(columns, rows, labelCol) {
  const numericCols = columns.filter((c) => c !== labelCol && rows.some((r) => typeof r[c] === "number"));
  const rowCount = rows.length;
  const metricCount = numericCols.length;

  // Detect date-like dimension
  const firstVals = rows.slice(0, 5).map((r) => String(r[labelCol] || ""));
  const isDateLike = firstVals.some((v) => /\d{4}[-/]\d{2}/.test(v) || /^\d{4}$/.test(v));

  // Check if all metrics are positive (needed for pie/treemap)
  const allPositive = numericCols.every((c) => rows.every((r) => typeof r[c] !== "number" || r[c] >= 0));

  // Check label length for horizontal bar preference
  const avgLabelLen = firstVals.reduce((a, v) => a + v.length, 0) / Math.max(firstVals.length, 1);

  // Check if values differ significantly (good for pie) vs similar (bad for pie)
  let hasVariance = true;
  if (metricCount > 0 && rowCount >= 2) {
    const vals = rows.map((r) => r[numericCols[0]]).filter((v) => typeof v === "number");
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    if (max > 0) hasVariance = (max - min) / max > 0.1;
  }

  return { numericCols, rowCount, metricCount, isDateLike, allPositive, avgLabelLen, hasVariance };
}

/* ── Chart type definitions with relevance scoring ── */
const CHART_DEFS = [
  {
    key: "bar", label: "Bar", group: "comparison",
    icon: "M3 13h2v8H3zM8 8h2v13H8zM13 11h2v10h-2zM18 5h2v16h-2z",
    score: (a) => {
      let s = 60;
      if (a.rowCount >= 2 && a.rowCount <= 20) s += 20;
      if (a.metricCount >= 2) s += 15; // grouped bars are great for comparison
      if (a.isDateLike) s -= 10;
      if (a.rowCount > 20) s -= 20;
      return s;
    },
  },
  {
    key: "bar_h", label: "H-Bar", group: "comparison",
    icon: "M3 3v2h8V3zM3 8v2h13V8zM3 13v2h10V13zM3 18v2h16V18z",
    score: (a) => {
      let s = 40;
      if (a.avgLabelLen > 10) s += 25; // long labels work better horizontal
      if (a.rowCount >= 5 && a.rowCount <= 15) s += 15;
      if (a.metricCount === 1) s += 10;
      if (a.isDateLike) s -= 30;
      return s;
    },
  },
  {
    key: "stacked", label: "Stacked", group: "composition",
    icon: "M3 13h2v8H3zM8 6h2v15H8zM13 9h2v12h-2zM18 3h2v18h-2z",
    score: (a) => {
      let s = 30;
      if (a.metricCount >= 2) s += 35; // stacked needs multiple metrics
      if (a.rowCount >= 3 && a.rowCount <= 15) s += 15;
      if (a.metricCount < 2) s -= 50; // hide if only 1 metric
      return s;
    },
  },
  {
    key: "line", label: "Line", group: "trend",
    icon: "M3 17l6-6 4 4 8-8",
    score: (a) => {
      let s = 50;
      if (a.isDateLike) s += 35; // lines are ideal for time series
      if (a.rowCount > 5) s += 15;
      if (a.rowCount <= 2) s -= 30;
      return s;
    },
  },
  {
    key: "area", label: "Area", group: "trend",
    icon: "M3 17l6-6 4 4 8-8v11H3z",
    score: (a) => {
      let s = 40;
      if (a.isDateLike) s += 30;
      if (a.rowCount > 5) s += 15;
      if (a.metricCount === 1) s += 5;
      if (a.rowCount <= 2) s -= 30;
      return s;
    },
  },
  {
    key: "pie", label: "Pie", group: "proportion",
    icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18V12h10c0 5.52-4.48 10-10 10z",
    score: (a) => {
      let s = 30;
      if (a.rowCount >= 2 && a.rowCount <= 8 && a.allPositive) s += 40;
      if (a.hasVariance) s += 10;
      if (a.rowCount > 10) s -= 40;
      if (!a.allPositive) s -= 50;
      return s;
    },
  },
  {
    key: "donut", label: "Donut", group: "proportion",
    icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6z",
    score: (a) => {
      let s = 35;
      if (a.rowCount >= 2 && a.rowCount <= 8 && a.allPositive) s += 35;
      if (a.hasVariance) s += 10;
      if (a.rowCount > 10) s -= 40;
      if (!a.allPositive) s -= 50;
      return s;
    },
  },
  {
    key: "radar", label: "Radar", group: "comparison",
    icon: "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01z",
    score: (a) => {
      let s = 20;
      if (a.rowCount >= 3 && a.rowCount <= 10 && a.metricCount >= 2) s += 40;
      if (a.metricCount < 2) s -= 30;
      if (a.rowCount > 10) s -= 20;
      if (a.rowCount < 3) s -= 30;
      return s;
    },
  },
  {
    key: "treemap", label: "Treemap", group: "proportion",
    icon: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v3h-8zM3 13h5v8H3zM10 13h11v8H10z",
    score: (a) => {
      let s = 25;
      if (a.rowCount >= 4 && a.rowCount <= 20 && a.allPositive) s += 30;
      if (a.rowCount > 20) s -= 10;
      if (!a.allPositive) s -= 50;
      return s;
    },
  },
  {
    key: "scatter", label: "Scatter", group: "correlation",
    icon: "M7 14a2 2 0 100-4 2 2 0 000 4zM14 8a2 2 0 100-4 2 2 0 000 4zM18 16a2 2 0 100-4 2 2 0 000 4zM11 19a2 2 0 100-4 2 2 0 000 4z",
    score: (a) => {
      let s = 15;
      if (a.metricCount >= 2 && a.rowCount > 5) s += 35;
      if (a.metricCount < 2) s -= 50;
      return s;
    },
  },
];

/* Minimum relevance score to show a chart type */
const MIN_SCORE = 35;

/* (ECharts handles tooltips, pie labels, treemap content natively via option config) */

/* ── Chart Export (ECharts native) ── */
function exportChart(echartsRef, format = "png") {
  const instance = echartsRef.current?.getEchartsInstance?.();
  if (!instance) {
    console.warn("Chart not ready for export — try again in a moment.");
    return false;
  }
  const exportBg = getComputedStyle(document.documentElement).getPropertyValue('--chart-export-bg').trim() || '#111827';
  const url = instance.getDataURL({
    type: format === "jpg" ? "jpeg" : "png",
    pixelRatio: 2,
    backgroundColor: exportBg,
  });
  const link = document.createElement("a");
  link.download = `chart.${format}`;
  link.href = url;
  link.click();
  return true;
}

/* ── Measure Selector ── */
const COMBO_TYPES = [
  { key: 'bar', label: 'Bar', icon: '▮' },
  { key: 'line', label: 'Line', icon: '〰' },
  { key: 'area', label: 'Area', icon: '▧' },
];

function MeasureSelector({ measures, selected, onSelect, colors, mode = "single", seriesTypes = {}, onSeriesTypeChange = null }) {
  if (measures.length <= 1 && !onSeriesTypeChange) return null;
  const [openPicker, setOpenPicker] = useState(null);
  const pickerContainerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openPicker) return;
    const handler = (e) => {
      if (pickerContainerRef.current && !pickerContainerRef.current.contains(e.target)) setOpenPicker(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openPicker]);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--text-muted)' }}>Measure</span>
      {measures.map((m, i) => {
        const isActive = mode === "single" ? selected === m : selected.includes(m);
        const currentType = seriesTypes[m];
        return (
          <div key={m} className="relative flex items-center" ref={openPicker === m ? pickerContainerRef : undefined}>
            <button
              onClick={() => onSelect(m)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] transition-all duration-200 cursor-pointer ${
                isActive ? "border" : "border border-transparent"
              } ${onSeriesTypeChange && isActive ? "rounded-l-md" : "rounded-md"}`}
              style={isActive ? { background: 'var(--bg-hover)', color: 'var(--text-primary)', borderColor: 'var(--border-default)' } : { color: 'var(--text-muted)' }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length], opacity: isActive ? 1 : 0.4 }} />
              {m}
            </button>
            {/* Per-measure type picker — only for multi-measure active items */}
            {onSeriesTypeChange && isActive && mode === "multi" && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenPicker(openPicker === m ? null : m); }}
                  className="h-full px-1.5 py-1.5 text-[9px] font-bold border border-l-0 rounded-r-md cursor-pointer transition-colors"
                  style={{ background: 'var(--bg-surface)', color: currentType ? 'var(--accent)' : 'var(--text-muted)', borderColor: 'var(--border-default)' }}
                  title={`Chart type: ${currentType || 'default'}`}
                >
                  {currentType === 'line' ? '〰' : currentType === 'area' ? '▧' : '▮'}
                </button>
                {openPicker === m && (
                  <div className="absolute top-full left-0 mt-1 z-50 flex gap-0.5 p-1 rounded-lg shadow-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                    {COMBO_TYPES.map((ct) => (
                      <button
                        key={ct.key}
                        onClick={(e) => { e.stopPropagation(); onSeriesTypeChange(m, ct.key); setOpenPicker(null); }}
                        className="px-2 py-1 text-[10px] font-semibold rounded-md cursor-pointer transition-all"
                        style={{
                          background: (seriesTypes[m] || 'bar') === ct.key ? 'var(--accent-glow)' : 'transparent',
                          color: (seriesTypes[m] || 'bar') === ct.key ? 'var(--accent)' : 'var(--text-muted)',
                          border: (seriesTypes[m] || 'bar') === ct.key ? '1px solid var(--accent)' : '1px solid transparent',
                        }}
                        title={ct.label}
                      >
                        {ct.icon} {ct.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Main Component
   ════════════════════════════════════════════════════════════════════ */
export default function ResultsChart({
  columns, rows,
  embedded = false,                // compact mode for dashboard tiles
  defaultChartType = null,         // override auto-detection
  defaultPalette = "default",      // override palette
  defaultMeasure = null,           // override single measure
  defaultMeasures = null,          // override multi measures
  customMetrics = [],              // dashboard-level custom metrics
  formatting = null,              // tile.visualConfig (optional)
  dashboardPalette = "default",   // dashboard.themeConfig.palette
  onAddToDashboard = null,         // callback: ({ chartType, columns, rows, selectedMeasure, activeMeasures, palette }) => void
  question = null,                 // original question for tile title
  sql = null,                      // SQL for tile metadata
  crossFilter = null,              // { field, value } — cross-tile filter
  onCrossFilterClick = null,       // (field, value) => void — emit cross-filter click
}) {
  const chartRef = useRef(null);
  const resolvedTheme = useStore((s) => s.resolvedTheme);

  // Theme-aware chart colors (ECharts needs raw hex, not CSS vars)
  const chartColors = useMemo(() => resolvedTheme === 'light'
    ? { axis: '#6b7280', grid: '#e5e7eb', tooltipBg: '#ffffff', tooltipBorder: '#d1d5db', tooltipText: '#1f2937', pieBorder: '#ffffff', nameText: '#6b7280', labelText: '#6b7280', treemapBorder: '#f8fafc', axisLine: '#d1d5db', legendText: '#6b7280', splitAreaLine: '#e5e7eb' }
    : { axis: '#94a3b8', grid: '#1e293b', tooltipBg: '#0f172a', tooltipBorder: '#334155', tooltipText: '#e2e8f0', pieBorder: '#111827', nameText: '#94a3b8', labelText: '#9ca3af', treemapBorder: '#0B1120', axisLine: '#1e293b', legendText: '#9ca3af', splitAreaLine: '#1e293b' },
  [resolvedTheme]);

  // Coerce data
  const coercedRows = useMemo(() => coerceNumericRows(columns, rows), [columns, rows]);

  // Inject custom metric columns
  const { columns: augColumns, rows: augRows } = useMemo(() => {
    if (!customMetrics?.length) return { columns, rows: coercedRows };
    try {
      return injectMetricColumns(customMetrics, columns, coercedRows);
    } catch { return { columns, rows: coercedRows }; }
  }, [columns, coercedRows, customMetrics]);

  const labelCol = augColumns[0];
  const maxRows = embedded ? (augRows.length > 1000 ? 1000 : 500) : 200;
  const data = useMemo(() => augRows.slice(0, maxRows), [augRows, maxRows]);

  // Merge formatting config with defaults
  const fmt = useMemo(() => mergeFormatting(formatting, null), [formatting]);

  // Sort data if configured (supports field sort, custom manual order, and top-N limit)
  const sortedData = useMemo(() => {
    let result = data;

    if (fmt.sort.order === 'custom' && fmt.sort.customOrder?.length > 0) {
      // Custom manual order — sort by explicit category value sequence
      const orderMap = {};
      fmt.sort.customOrder.forEach((val, idx) => { orderMap[String(val)] = idx; });
      result = [...result].sort((a, b) => {
        const aIdx = orderMap[String(a[labelCol])] ?? 9999;
        const bIdx = orderMap[String(b[labelCol])] ?? 9999;
        return aIdx - bIdx;
      });
    } else if (fmt.sort.field) {
      // Standard field sort (asc/desc)
      result = [...result].sort((a, b) => {
        const aV = a[fmt.sort.field], bV = b[fmt.sort.field];
        if (aV == null) return 1;
        if (bV == null) return -1;
        return fmt.sort.order === 'asc' ? (aV > bV ? 1 : -1) : (aV < bV ? 1 : -1);
      });
    }

    // Top N limit
    if (fmt.sort.limit && fmt.sort.limit > 0) {
      result = result.slice(0, fmt.sort.limit);
    }

    return result;
  }, [data, fmt.sort, labelCol]);

  // Cross-filter: filter data when an external cross-filter is active
  // Only filter if this tile's data actually contains the cross-filter field
  const chartData = useMemo(() => {
    if (!crossFilter || !sortedData.length) return sortedData;
    const hasField = sortedData.length > 0 && crossFilter.field in sortedData[0];
    if (!hasField) return sortedData;
    return sortedData.filter(row => String(row[crossFilter.field]) === String(crossFilter.value));
  }, [sortedData, crossFilter]);

  // Build a stable color index map from original (unfiltered) data for pie/donut
  // so filtered slices keep their original color
  const pieColorMap = useMemo(() => {
    if (!labelCol || !sortedData.length) return {};
    const map = {};
    sortedData.forEach((row, i) => {
      const key = String(row[labelCol]);
      if (!(key in map)) map[key] = i;
    });
    return map;
  }, [sortedData, labelCol]);

  // Analyze data
  const analysis = useMemo(() => analyzeData(augColumns, data, labelCol), [augColumns, data, labelCol]);
  const { numericCols } = analysis;

  // Score & sort chart types, filter by relevance
  const rankedCharts = useMemo(() => {
    return CHART_DEFS
      .map((def) => ({ ...def, relevance: def.score(analysis) }))
      .filter((d) => d.relevance >= MIN_SCORE)
      .sort((a, b) => b.relevance - a.relevance);
  }, [analysis]);

  // State
  const [activeType, setActiveType] = useState(defaultChartType);
  const [selectedMeasure, setSelectedMeasure] = useState(defaultMeasure || numericCols[0] || "");
  const [activeMeasures, setActiveMeasures] = useState(
    defaultMeasures?.length ? defaultMeasures : numericCols
  );
  const [palette, setPalette] = useState(defaultPalette);
  const [measureSeriesTypes, setMeasureSeriesTypes] = useState(formatting?.seriesTypes || {});
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(!embedded);
  const [showSettings, setShowSettings] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Sync activeMeasures when the parent tile updates (e.g. after TileEditor save)
  useEffect(() => {
    if (defaultMeasures?.length) setActiveMeasures(defaultMeasures);
  }, [defaultMeasures]);

  // Sync seriesTypes when formatting changes (e.g. after TileEditor save)
  useEffect(() => {
    setMeasureSeriesTypes(formatting?.seriesTypes || {});
  }, [formatting?.seriesTypes]);

  const handleSeriesTypeChange = useCallback((measure, type) => {
    setMeasureSeriesTypes((prev) => ({ ...prev, [measure]: type }));
  }, []);
  const handleSingleSelect = useCallback((m) => setSelectedMeasure(m), []);
  const handleMultiToggle = useCallback((m) => {
    setActiveMeasures((prev) => {
      const next = prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m];
      return next.length === 0 ? [m] : next; // at least one must be selected
    });
  }, []);

  // Derived values — computed unconditionally so hooks below always run
  // Normalize aliases: stacked_bar → stacked (TileEditor/TileWrapper use stacked_bar)
  const rawType = activeType || rankedCharts[0]?.key || "bar";
  const chartType = rawType === "stacked_bar" ? "stacked" : rawType;
  const colors = PALETTES[palette] || PALETTES.default;
  const isSingleMeasureChart = ["pie", "donut", "treemap"].includes(chartType);
  const isMultiMeasureChart = ["bar", "bar_h", "stacked", "line", "area", "radar"].includes(chartType);
  const currentMeasure = numericCols.includes(selectedMeasure) ? selectedMeasure : (numericCols[0] || "");
  const currentMeasures = activeMeasures.filter((m) => numericCols.includes(m));
  const displayMeasures = currentMeasures.length > 0 ? currentMeasures : numericCols;

  // Check if we have mixed chart types (combo chart) — for dual Y-axis
  const hasMixedTypes = useMemo(() => {
    if (!isMultiMeasureChart || Object.keys(measureSeriesTypes).length === 0) return false;
    const types = new Set(displayMeasures.map((m) => measureSeriesTypes[m] || chartType));
    return types.size > 1;
  }, [isMultiMeasureChart, measureSeriesTypes, displayMeasures, chartType]);

  // Reference lines — compute special values (avg, median, min, max)
  const computedRefLines = useMemo(() => {
    if (!fmt.referenceLines?.length || !sortedData.length || !displayMeasures?.length) return [];
    return fmt.referenceLines.map((rl) => {
      let value = rl.value;
      if (typeof value === 'string') {
        const measure = displayMeasures[0];
        const nums = sortedData.map((r) => Number(r[measure])).filter(isFinite);
        if (!nums.length) return null;
        if (value === 'avg') value = nums.reduce((a, b) => a + b, 0) / nums.length;
        else if (value === 'median') {
          const sorted = [...nums].sort((a, b) => a - b);
          value = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        }
        else if (value === 'min') value = Math.min(...nums);
        else if (value === 'max') value = Math.max(...nums);
        else return null;
      }
      return { ...rl, value: Number(value) };
    }).filter(Boolean).filter((rl) => isFinite(rl.value));
  }, [fmt.referenceLines, sortedData, displayMeasures]);

  const fmtTickFn = fmt.axis.tickFormat !== 'auto'
    ? (v) => formatTickValue(v, fmt.axis.tickFormat, fmt.axis.tickDecimals)
    : formatTick;

  /* ── ECharts option builder ── */
  const echartsOption = useMemo(() => {
    const labels = chartData.map((r) => r[labelCol]);
    const axisLabelStyle = { color: chartColors.axis, fontSize: fmt.typography.axisFontSize };
    const axisLineStyle = { lineStyle: { color: chartColors.axisLine } };
    const splitLineStyle = showGrid && fmt.grid.show
      ? { show: true, lineStyle: { color: fmt.grid.color, type: fmt.grid.style === 'dotted' ? 'dotted' : fmt.grid.style === 'dashed' ? 'dashed' : 'solid' } }
      : { show: false };

    const tooltipCfg = fmt.tooltip.show ? {
      trigger: ['pie', 'donut', 'treemap', 'scatter'].includes(chartType) ? 'item' : 'axis',
      backgroundColor: chartColors.tooltipBg,
      borderColor: chartColors.tooltipBorder,
      textStyle: { color: chartColors.tooltipText, fontSize: 12 },
      ...(fmt.tooltip.template ? {
        formatter: (params) => {
          const row = Array.isArray(params) ? params[0]?.data : params.data;
          if (!row) return '';
          let text = fmt.tooltip.template;
          for (const key of Object.keys(row)) text = text.replaceAll(`{${key}}`, row[key] ?? '');
          return text;
        },
      } : {}),
    } : { show: false };

    const legendCfg = (showLegend && fmt.legend.show && displayMeasures.length > 1) ? {
      show: true,
      textStyle: { color: fmt.legend.color || chartColors.legendText, fontSize: fmt.legend.fontSize || 11 },
      ...(fmt.legend.position === 'top' ? { top: 0 } : fmt.legend.position === 'left' ? { left: 0, orient: 'vertical' } : fmt.legend.position === 'right' ? { right: 0, orient: 'vertical' } : { bottom: 0 }),
    } : { show: false };

    const markLineData = computedRefLines.map((rl) => ({
      yAxis: rl.value,
      label: { formatter: rl.label || '', color: chartColors.labelText, fontSize: 11 },
      lineStyle: { color: rl.stroke || '#F59E0B', type: rl.strokeDasharray?.includes('5') ? 'dashed' : 'solid', width: 1.5 },
    }));

    const dataLabelCfg = fmt.dataLabels.show ? {
      show: true,
      position: fmt.dataLabels.position || 'top',
      color: fmt.dataLabels.color || chartColors.labelText,
      fontSize: fmt.dataLabels.fontSize || 10,
      formatter: (p) => formatTickValue(p.value, fmt.dataLabels.format, null),
    } : { show: false };

    const baseGrid = { left: 60, right: 20, top: 30, bottom: 40 };

    switch (chartType) {
      case "bar":
      case "stacked": {
        // Dual Y-axis when mixing bar + line/area types
        const yAxes = hasMixedTypes ? [
          { type: 'value', axisLabel: { ...axisLabelStyle, formatter: fmtTickFn }, axisLine: axisLineStyle, splitLine: splitLineStyle, name: fmt.axis.yLabel || undefined, nameTextStyle: { color: chartColors.nameText, fontSize: 11 } },
          { type: 'value', axisLabel: { ...axisLabelStyle, formatter: fmtTickFn }, axisLine: { ...axisLineStyle, show: true }, splitLine: { show: false }, nameTextStyle: { color: chartColors.nameText, fontSize: 11 } },
        ] : {
          type: 'value', axisLabel: { ...axisLabelStyle, formatter: fmtTickFn }, axisLine: axisLineStyle, splitLine: splitLineStyle, name: fmt.axis.yLabel || undefined, nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
        };
        return {
          backgroundColor: 'transparent',
          tooltip: tooltipCfg,
          legend: legendCfg,
          grid: hasMixedTypes ? { ...baseGrid, right: 60 } : baseGrid,
          xAxis: {
            type: 'category',
            data: labels,
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn, rotate: fmt.axis.xLabelRotation || 0, interval: chartData.length > 12 ? 'auto' : 0 },
            axisLine: axisLineStyle,
            name: fmt.axis.xLabel || undefined,
            nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
          },
          yAxis: yAxes,
          series: displayMeasures.map((col, i) => {
            const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
            const hasRules = fmt.colors.rules?.some((r) => r.measure === col);
            const hasCatColors = Object.keys(fmt.colors.categoryColors || {}).length > 0;
            const perType = measureSeriesTypes[col] || (chartType === 'stacked' ? 'bar' : 'bar');
            const isLine = perType === 'line';
            const isArea = perType === 'area';
            const effectiveType = isArea ? 'line' : perType;
            return {
              type: effectiveType,
              name: col,
              stack: (chartType === 'stacked' && perType === 'bar') ? 'stack' : undefined,
              yAxisIndex: (hasMixedTypes && (isLine || isArea)) ? 1 : 0,
              data: hasRules
                ? chartData.map((row) => ({ value: row[col], itemStyle: { color: resolveColor(col, row[col], i, fmt.colors, dashboardPalette) } }))
                : (hasCatColors && displayMeasures.length === 1)
                  ? chartData.map((row, ri) => ({
                      value: row[col],
                      itemStyle: { color: resolveCategoryColor(row[labelCol], ri, fmt.colors, dashboardPalette) },
                    }))
                  : chartData.map((row) => row[col]),
              ...(isLine || isArea ? {
                lineStyle: { color: baseColor, width: 2.5 },
                symbolSize: 4,
                smooth: true,
                ...(isArea ? { areaStyle: { color: baseColor, opacity: 0.12 } } : {}),
              } : {
                itemStyle: { color: baseColor, borderRadius: chartType === 'stacked' ? 0 : [6, 6, 0, 0] },
              }),
              label: dataLabelCfg,
              markLine: i === 0 && markLineData.length ? { data: markLineData, silent: true, symbol: 'none' } : undefined,
              emphasis: isLine || isArea ? { focus: 'series' } : { itemStyle: { opacity: 0.85 } },
            };
          }),
          animationDuration: 800,
          animationEasing: 'cubicOut',
        };
      }

      case "bar_h": {
        // Reverse data for horizontal bars — ECharts renders y-axis bottom-to-top,
        // so we reverse to make visual top-to-bottom match the logical sort order.
        const hLabels = [...labels].reverse();
        const hChartData = [...chartData].reverse();
        return {
          backgroundColor: 'transparent',
          tooltip: tooltipCfg,
          legend: legendCfg,
          grid: { left: 100, right: 30, top: 20, bottom: 30 },
          yAxis: {
            type: 'category',
            data: hLabels,
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn },
            axisLine: axisLineStyle,
            name: fmt.axis.yLabel || undefined,
            nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
          },
          xAxis: {
            type: 'value',
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn },
            axisLine: axisLineStyle,
            splitLine: splitLineStyle,
            name: fmt.axis.xLabel || undefined,
            nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
          },
          series: displayMeasures.map((col, i) => {
            const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
            const hasRules = fmt.colors.rules?.some((r) => r.measure === col);
            const hasCatColors = Object.keys(fmt.colors.categoryColors || {}).length > 0;
            return {
              type: 'bar',
              name: col,
              data: hasRules
                ? hChartData.map((row) => ({ value: row[col], itemStyle: { color: resolveColor(col, row[col], i, fmt.colors, dashboardPalette) } }))
                : (hasCatColors && displayMeasures.length === 1)
                  ? hChartData.map((row, ri) => ({
                      value: row[col],
                      itemStyle: { color: resolveCategoryColor(row[labelCol], ri, fmt.colors, dashboardPalette) },
                    }))
                  : hChartData.map((row) => row[col]),
              itemStyle: { color: baseColor, borderRadius: [0, 6, 6, 0] },
              label: dataLabelCfg.show ? { ...dataLabelCfg, position: 'right' } : dataLabelCfg,
              markLine: i === 0 && markLineData.length ? { data: markLineData.map((ml) => ({ ...ml, xAxis: ml.yAxis, yAxis: undefined })), silent: true, symbol: 'none' } : undefined,
            };
          }),
          animationDuration: 800,
        };
      }

      case "line": {
        const lineYAxes = hasMixedTypes ? [
          { type: 'value', axisLabel: { ...axisLabelStyle, formatter: fmtTickFn }, axisLine: axisLineStyle, splitLine: splitLineStyle, name: fmt.axis.yLabel || undefined, nameTextStyle: { color: chartColors.nameText, fontSize: 11 } },
          { type: 'value', axisLabel: { ...axisLabelStyle, formatter: fmtTickFn }, axisLine: { ...axisLineStyle, show: true }, splitLine: { show: false }, nameTextStyle: { color: chartColors.nameText, fontSize: 11 } },
        ] : {
          type: 'value', axisLabel: { ...axisLabelStyle, formatter: fmtTickFn }, axisLine: axisLineStyle, splitLine: splitLineStyle, name: fmt.axis.yLabel || undefined, nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
        };
        return {
          backgroundColor: 'transparent',
          tooltip: tooltipCfg,
          legend: legendCfg,
          grid: hasMixedTypes ? { ...baseGrid, right: 60 } : baseGrid,
          xAxis: {
            type: 'category',
            data: labels,
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn, rotate: fmt.axis.xLabelRotation || 0 },
            axisLine: axisLineStyle,
            name: fmt.axis.xLabel || undefined,
            nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
          },
          yAxis: lineYAxes,
          series: displayMeasures.map((col, i) => {
            const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
            const perType = measureSeriesTypes[col] || 'line';
            const isBar = perType === 'bar';
            const isArea = perType === 'area';
            return {
              type: isBar ? 'bar' : 'line',
              name: col,
              yAxisIndex: (hasMixedTypes && !isBar) ? 1 : 0,
              data: chartData.map((row) => row[col]),
              ...(isBar ? {
                itemStyle: { color: baseColor, borderRadius: [6, 6, 0, 0] },
              } : {
                lineStyle: { color: baseColor, width: 2.5 },
                itemStyle: { color: baseColor, borderColor: chartColors.pieBorder, borderWidth: 2 },
                symbolSize: 6,
                smooth: true,
                ...(isArea ? { areaStyle: { color: baseColor, opacity: 0.12 } } : {}),
              }),
              label: dataLabelCfg,
              markLine: i === 0 && markLineData.length ? { data: markLineData, silent: true, symbol: 'none' } : undefined,
              emphasis: isBar ? { itemStyle: { opacity: 0.85 } } : { focus: 'series' },
            };
          }),
          animationDuration: 1000,
        };
      }

      case "area":
        return {
          backgroundColor: 'transparent',
          tooltip: tooltipCfg,
          legend: legendCfg,
          grid: baseGrid,
          xAxis: {
            type: 'category',
            data: labels,
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn, rotate: fmt.axis.xLabelRotation || 0 },
            axisLine: axisLineStyle,
            name: fmt.axis.xLabel || undefined,
            nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
          },
          yAxis: {
            type: 'value',
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn },
            axisLine: axisLineStyle,
            splitLine: splitLineStyle,
            name: fmt.axis.yLabel || undefined,
            nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
          },
          series: displayMeasures.map((col, i) => {
            const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
            const perType = measureSeriesTypes[col] || 'area';
            const isBar = perType === 'bar';
            const isLine = perType === 'line';
            return {
              type: isBar ? 'bar' : 'line',
              name: col,
              data: chartData.map((row) => row[col]),
              ...(isBar ? {
                itemStyle: { color: baseColor, borderRadius: [6, 6, 0, 0] },
              } : isLine ? {
                lineStyle: { color: baseColor, width: 2.5 },
                itemStyle: { color: baseColor },
                symbolSize: 4,
                smooth: true,
              } : {
                areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: baseColor + '59' }, { offset: 1, color: baseColor + '05' }] } },
                lineStyle: { color: baseColor, width: 2 },
                itemStyle: { color: baseColor },
                symbolSize: 4,
                smooth: true,
              }),
              label: dataLabelCfg,
              markLine: i === 0 && markLineData.length ? { data: markLineData, silent: true, symbol: 'none' } : undefined,
            };
          }),
          animationDuration: 1000,
        };

      case "pie":
      case "donut":
        return {
          backgroundColor: 'transparent',
          tooltip: { ...tooltipCfg, trigger: 'item' },
          legend: legendCfg,
          series: [{
            type: 'pie',
            radius: chartType === 'donut' ? ['40%', '70%'] : ['0%', '70%'],
            center: ['50%', '50%'],
            data: chartData.map((row, i) => {
              const origIdx = pieColorMap[String(row[labelCol])] ?? i;
              const catLabel = String(row[labelCol]);
              return {
                name: catLabel,
                value: row[currentMeasure],
                itemStyle: { color: resolveCategoryColor(catLabel, origIdx, fmt.colors, dashboardPalette), borderColor: chartColors.pieBorder, borderWidth: 2 },
              };
            }),
            label: {
              show: true,
              color: chartColors.labelText,
              fontSize: 11,
              formatter: (p) => p.percent < 4 ? '' : `${p.name?.length > 14 ? p.name.slice(0, 14) + '..' : p.name} ${p.percent.toFixed(0)}%`,
            },
            labelLine: { lineStyle: { color: chartColors.axis } },
            padAngle: chartType === 'donut' ? 3 : 2,
            itemStyle: chartType === 'donut' ? { borderRadius: 4 } : {},
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
          }],
          animationDuration: 800,
        };

      case "radar":
        return {
          backgroundColor: 'transparent',
          tooltip: { ...tooltipCfg, trigger: 'item' },
          legend: legendCfg,
          radar: {
            indicator: labels.map((name) => {
              const maxVal = Math.max(...displayMeasures.map((col) => Math.max(...chartData.map((r) => Number(r[col]) || 0))));
              return { name, max: maxVal * 1.2 || 100 };
            }),
            axisName: { color: chartColors.labelText, fontSize: fmt.typography.axisFontSize },
            splitLine: { lineStyle: { color: fmt.grid.color } },
            splitArea: { show: false },
            axisLine: { lineStyle: { color: chartColors.axisLine } },
          },
          series: [{
            type: 'radar',
            data: displayMeasures.map((col, i) => {
              const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
              return {
                name: col,
                value: chartData.map((r) => r[col]),
                lineStyle: { color: baseColor, width: 2 },
                areaStyle: { color: baseColor, opacity: 0.15 },
                itemStyle: { color: baseColor },
              };
            }),
          }],
          animationDuration: 800,
        };

      case "treemap":
        return {
          backgroundColor: 'transparent',
          tooltip: { ...tooltipCfg, trigger: 'item', formatter: (p) => `${p.name}: ${formatNumber(p.value)}` },
          series: [{
            type: 'treemap',
            data: chartData
              .map((r, i) => {
                const catLabel = String(r[labelCol] || `Item ${i + 1}`);
                return {
                  name: catLabel,
                  value: r[currentMeasure] || 0,
                  itemStyle: { color: resolveCategoryColor(catLabel, i, fmt.colors, dashboardPalette), borderColor: chartColors.treemapBorder, borderWidth: 2 },
                };
              })
              .filter((d) => d.value > 0),
            label: { show: true, color: '#fff', fontSize: 11, fontWeight: 600 },
            breadcrumb: { show: false },
            itemStyle: { borderRadius: 4, gapWidth: 2 },
          }],
          animationDuration: 800,
        };

      case "scatter": {
        const xMeasure = displayMeasures[0];
        const yMeasure = displayMeasures[1] || displayMeasures[0];
        return {
          backgroundColor: 'transparent',
          tooltip: {
            ...tooltipCfg,
            trigger: 'item',
            formatter: (p) => `${labelCol}: ${p.data[2] ?? ''}<br/>${xMeasure}: ${formatNumber(p.data[0])}<br/>${yMeasure}: ${formatNumber(p.data[1])}`,
          },
          legend: legendCfg,
          grid: baseGrid,
          xAxis: {
            type: 'value',
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn },
            axisLine: axisLineStyle,
            splitLine: splitLineStyle,
            name: fmt.axis.xLabel || xMeasure,
            nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
          },
          yAxis: {
            type: 'value',
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn },
            axisLine: axisLineStyle,
            splitLine: splitLineStyle,
            name: fmt.axis.yLabel || yMeasure,
            nameTextStyle: { color: chartColors.nameText, fontSize: 11 },
          },
          series: [{
            type: 'scatter',
            data: chartData.map((r) => [Number(r[xMeasure]) || 0, Number(r[yMeasure]) || 0, r[labelCol]]),
            symbolSize: Math.max(4, Math.min(12, 800 / Math.sqrt(chartData.length))),
            itemStyle: { color: resolveColor(labelCol, null, 0, fmt.colors, dashboardPalette), opacity: 0.7 },
            emphasis: { itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 1 } },
          }],
          animationDuration: 800,
        };
      }

      case "table":
      case "kpi":
        // Table/KPI types don't render as ECharts — fall through to bar as visual fallback
      default: {
        // Fallback: render as bar chart so the tile is never blank
        const fallbackGrid = { left: 60, right: 20, top: 30, bottom: 40 };
        return {
          backgroundColor: 'transparent',
          tooltip: tooltipCfg,
          legend: legendCfg,
          grid: fallbackGrid,
          xAxis: {
            type: 'category',
            data: labels,
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn, rotate: chartData.length > 8 ? 45 : 0, interval: 0 },
            axisLine: axisLineStyle,
          },
          yAxis: {
            type: 'value',
            axisLabel: { ...axisLabelStyle, formatter: fmtTickFn },
            axisLine: axisLineStyle,
            splitLine: splitLineStyle,
          },
          series: displayMeasures.map((col, i) => ({
            type: 'bar',
            name: col,
            data: chartData.map((row) => row[col]),
            itemStyle: { color: resolveColor(col, null, i, fmt.colors, dashboardPalette), borderRadius: [6, 6, 0, 0] },
          })),
          animationDuration: 800,
        };
      }
    }
  }, [chartType, chartData, labelCol, displayMeasures, currentMeasure, colors, fmt, showGrid, showLegend, computedRefLines, pieColorMap, dashboardPalette, fmtTickFn, chartColors, measureSeriesTypes, hasMixedTypes]);

  /* ── ECharts event handlers for cross-filter ── */
  const onChartEvents = useMemo(() => {
    if (!onCrossFilterClick) return {};
    return {
      click: (params) => {
        // Radar: params.name is the series name, not the category label [ADV-FIX H6]
        if (chartType === 'radar' && params.dataIndex != null && data[params.dataIndex]) {
          onCrossFilterClick(labelCol, data[params.dataIndex][labelCol]);
        } else if (params.name) {
          onCrossFilterClick(labelCol, params.name);
        } else if (params.data?.[2]) {
          onCrossFilterClick(labelCol, params.data[2]);
        }
      },
    };
  }, [onCrossFilterClick, labelCol, chartType, data]);

  /* ── Compute summary stats for selected measures ── */
  const statsFor = isSingleMeasureChart ? [currentMeasure] : displayMeasures;

  /* ── Build accessible summary ── */
  const chartSummary = useMemo(() => {
    if (!data.length || !labelCol) return "";
    const top = data.slice(0, 3);
    const measureLabel = isSingleMeasureChart ? currentMeasure : displayMeasures.join(", ");
    const topItems = top.map((r) => `${r[labelCol]}: ${formatNumber(r[isSingleMeasureChart ? currentMeasure : displayMeasures[0]])}`).join("; ");
    return `${rankedCharts[0]?.label || chartType} chart showing ${measureLabel} across ${data.length} items. Top entries: ${topItems}`;
  }, [data, labelCol, chartType, currentMeasure, displayMeasures, isSingleMeasureChart, rankedCharts]);

  // ── Early return for insufficient data (placed after all hooks) ──
  if (augColumns.length < 2 || data.length === 0 || numericCols.length === 0 || rankedCharts.length === 0) {
    if (embedded) {
      let msg = "Cannot render chart";
      if (data.length === 0) msg = "0 data rows";
      else if (augColumns.length < 2) msg = "Required: ≥ 2 columns";
      else if (numericCols.length === 0) msg = "Required: ≥ 1 numeric metric";

      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
           <svg className="w-8 h-8 mb-2" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{msg}</span>
        </div>
      );
    }
    return null;
  }

  /* ── ECharts renderer (shared by embedded and full modes) ── */
  const renderEChart = (height = '100%') => (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: 12 }}>Loading chart...</div>}>
      <ReactECharts
        ref={chartRef}
        option={echartsOption}
        style={{ width: '100%', height }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
        onEvents={onChartEvents}
      />
    </Suspense>
  );

  /* ── Embedded mode: compact chart only ── */
  if (embedded) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 min-h-0" role="img" aria-label={chartSummary}>
          <AnimatePresence mode="wait">
            <motion.div
              key={chartType}
              style={{ width: "100%", height: "100%" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              {renderEChart('100%')}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  /* ── Full mode with toolbar ── */
  return (
    <div className="rounded-2xl overflow-hidden backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.12)]" style={{ background: 'var(--glass-bg-card)', border: '1px solid var(--glass-border)' }}>
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-3 gap-2" style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-base)' }}>
        {/* Chart type selector */}
        <div className="flex gap-1.5 flex-wrap min-w-0">
          {rankedCharts.map(({ key, label, icon, relevance }) => (
            <button
              key={key}
              onClick={() => setActiveType(key)}
              title={`${label} (relevance: ${relevance})`}
              aria-label={`${label} chart type${chartType === key ? " (selected)" : ""}`}
              aria-pressed={chartType === key}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 cursor-pointer ${
                chartType === key
                  ? "bg-blue-600/15 text-blue-400 border border-blue-500/30"
                  : "border border-transparent"
              }`}
              style={chartType !== key ? { color: 'var(--text-muted)' } : undefined}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              {label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Add to dashboard button */}
          {onAddToDashboard && (
            <button
              onClick={() => onAddToDashboard({
                chartType,
                columns,
                rows: rows.slice(0, 100),
                selectedMeasure: currentMeasure,
                activeMeasures: displayMeasures,
                palette,
                question,
                sql,
                seriesTypes: Object.keys(measureSeriesTypes).length > 0 ? measureSeriesTypes : undefined,
              })}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/20 transition-colors duration-200 cursor-pointer"
              title="Add to dashboard"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Dashboard
            </button>
          )}

          <button
            onClick={() => { setShowSettings(!showSettings); setShowExportMenu(false); }}
            className={`p-2 rounded-lg transition-colors duration-200 cursor-pointer ${showSettings ? "text-blue-400" : ""}`}
            style={showSettings ? { background: 'var(--bg-hover)' } : { color: 'var(--text-muted)' }}
            title="Chart settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <div className="relative">
            <button
              onClick={() => { setShowExportMenu(!showExportMenu); setShowSettings(false); }}
              className={`p-2 rounded-lg transition-colors duration-200 cursor-pointer ${showExportMenu ? "text-blue-400" : ""}`}
              style={showExportMenu ? { background: 'var(--bg-hover)' } : { color: 'var(--text-muted)' }}
              title="Export chart"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 rounded-xl shadow-2xl z-50 overflow-hidden min-w-[150px]" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hover)' }}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' }}>Image</div>
                {[
                  { key: "png", label: "PNG", desc: "High quality" },
                  { key: "jpg", label: "JPG", desc: "Compressed" },
                ].map((fmt) => (
                  <button
                    key={fmt.key}
                    onClick={() => { const ok = exportChart(chartRef, fmt.key); if (!ok) setExportError('Chart not ready — try again'); setShowExportMenu(false); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-xs transition-colors duration-200 cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span className="font-medium">{fmt.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmt.desc}</span>
                  </button>
                ))}
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)' }}>Data</div>
                {[
                  { key: "csv", label: "CSV", desc: "Spreadsheet" },
                  { key: "json", label: "JSON", desc: "Structured" },
                ].map((fmt) => (
                  <button
                    key={fmt.key}
                    onClick={() => {
                      const content = fmt.key === "json"
                        ? JSON.stringify(data, null, 2)
                        : [columns.join(","), ...data.map((r) => columns.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
                      const blob = new Blob([content], { type: fmt.key === "json" ? "application/json" : "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `chart_data.${fmt.key}`;
                      a.click();
                      URL.revokeObjectURL(url);
                      setShowExportMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-xs transition-colors duration-200 cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span className="font-medium">{fmt.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmt.desc}</span>
                  </button>
                ))}
              </div>
            )}
            {exportError && (
              <div className="absolute right-0 top-full mt-1 px-3 py-1.5 rounded-lg text-xs bg-red-900/80 text-red-300 border border-red-800 z-50 whitespace-nowrap"
                ref={el => { if (el) setTimeout(() => setExportError(null), 3000); }}>
                {exportError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Measure Selector Row ── */}
      {numericCols.length > 1 && (
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
          {isSingleMeasureChart ? (
            <MeasureSelector measures={numericCols} selected={currentMeasure} onSelect={handleSingleSelect} colors={colors} mode="single" />
          ) : isMultiMeasureChart ? (
            <MeasureSelector measures={numericCols} selected={displayMeasures} onSelect={handleMultiToggle} colors={colors} mode="multi" seriesTypes={measureSeriesTypes} onSeriesTypeChange={handleSeriesTypeChange} />
          ) : null}
        </div>
      )}

      {/* ── Settings Panel ── */}
      {showSettings && (
        <div className="px-4 py-3 flex flex-wrap items-center gap-5" style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Palette</span>
            <div className="flex gap-1.5">
              {Object.entries(PALETTES).map(([key, cols]) => (
                <button
                  key={key}
                  onClick={() => setPalette(key)}
                  className={`w-5 h-5 rounded-full border-2 transition-all duration-200 cursor-pointer ${palette === key ? "scale-110 ring-2 ring-blue-500/20" : "border-transparent"}`}
                  style={palette === key ? { borderColor: 'var(--text-primary)' } : undefined}
                  style={{ background: `linear-gradient(135deg, ${cols[0]}, ${cols[1]})` }}
                  title={key}
                  aria-label={`${key} color palette${palette === key ? " (selected)" : ""}`}
                  aria-pressed={palette === key}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showGrid} onChange={() => setShowGrid(!showGrid)} className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-0 cursor-pointer" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Grid</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showLegend} onChange={() => setShowLegend(!showLegend)} className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-0 cursor-pointer" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Legend</span>
          </label>
        </div>
      )}

      {/* ── Chart Canvas ── */}
      <div className={embedded ? "px-1 py-1" : "px-2 py-4"} role="img" aria-label={chartSummary}>
        <AnimatePresence mode="wait">
          <motion.div
            key={chartType}
            style={{ width: "100%", height: "100%" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            {renderEChart(embedded ? 150 : 340)}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Data summary bar (hidden in embedded/dashboard mode) ── */}
      {!embedded && <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="tabular-nums">{data.length}</span> data point{data.length !== 1 ? "s" : ""} &middot; <span className="tabular-nums">{numericCols.length}</span> metric{numericCols.length !== 1 ? "s" : ""}
          {rankedCharts[0] && <> &middot; best fit: <span className="text-blue-400/70">{rankedCharts[0].label}</span></>}
        </span>
        {statsFor.length > 0 && (
          <div className="flex gap-4">
            {statsFor.slice(0, 3).map((col, i) => {
              const vals = data.map((d) => d[col]).filter((v) => typeof v === "number");
              const sum = vals.reduce((a, b) => a + b, 0);
              const avg = vals.length > 0 ? sum / vals.length : 0;
              return (
                <span key={col} className="text-xs text-slate-500">
                  <span style={{ color: colors[i % colors.length] }} className="font-medium">{col}</span>{" "}
                  avg: <span className="tabular-nums text-slate-400">{formatNumber(avg)}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>}
    </div>
  );
}

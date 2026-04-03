import { useState, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ScatterChart, Scatter, ZAxis,
  ReferenceLine,
} from "recharts";
import { mergeFormatting, resolveColor, formatTickValue } from '../lib/formatUtils';

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

/* ── Custom Tooltip ── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 shadow-lg shadow-black/40 max-w-[280px]">
      <p className="text-xs text-slate-400 mb-1.5 truncate font-semibold">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs py-0.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400 truncate">{entry.name}:</span>
          <span className="text-white font-semibold ml-auto tabular-nums">{formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Custom Pie Label ── */
function renderPieLabel({ cx, cy, midAngle, outerRadius, percent, name }) {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 22;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.04) return null;
  return (
    <text x={x} y={y} fill="#9ca3af" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11}>
      {name?.length > 14 ? name.slice(0, 14) + ".." : name} {(percent * 100).toFixed(0)}%
    </text>
  );
}

/* ── Treemap custom content ── */
function TreemapContent({ x, y, width, height, name, value, colors, index }) {
  if (width < 30 || height < 20) return null;
  const color = colors[index % colors.length];
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#0B1120" strokeWidth={2} rx={4} opacity={0.85} />
      {width > 50 && height > 35 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 7} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={600}>
            {name?.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7)) + ".." : name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 9} textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize={10}>
            {formatNumber(value)}
          </text>
        </>
      )}
    </g>
  );
}

/* ── Chart Export ── */
function exportChart(chartRef, format = "png") {
  const svgEl = chartRef.current?.querySelector("svg");
  if (!svgEl) return;
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    const link = document.createElement("a");
    link.download = `chart.${format}`;
    link.href = canvas.toDataURL(format === "jpg" ? "image/jpeg" : "image/png", 0.95);
    link.click();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/* ── Measure Selector ── */
function MeasureSelector({ measures, selected, onSelect, colors, mode = "single" }) {
  if (measures.length <= 1) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mr-1">Measure</span>
      {measures.map((m, i) => {
        const isActive = mode === "single" ? selected === m : selected.includes(m);
        return (
          <button
            key={m}
            onClick={() => onSelect(m)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md transition-all duration-200 cursor-pointer ${
              isActive
                ? "bg-slate-800 text-white border border-slate-600"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 border border-transparent"
            }`}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length], opacity: isActive ? 1 : 0.4 }} />
            {m}
          </button>
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

  // Coerce data
  const coercedRows = useMemo(() => coerceNumericRows(columns, rows), [columns, rows]);

  // Inject custom metric columns
  const { columns: augColumns, rows: augRows } = useMemo(() => {
    if (!customMetrics?.length) return { columns, rows: coercedRows };
    try {
      const { injectMetricColumns } = require('../lib/metricEvaluator');
      return injectMetricColumns(customMetrics, columns, coercedRows);
    } catch { return { columns, rows: coercedRows }; }
  }, [columns, coercedRows, customMetrics]);

  const labelCol = augColumns[0];
  const maxRows = embedded ? (augRows.length > 1000 ? 1000 : 500) : 200;
  const data = useMemo(() => augRows.slice(0, maxRows), [augRows, maxRows]);

  // Merge formatting config with defaults
  const fmt = useMemo(() => mergeFormatting(formatting, null), [formatting]);

  // Sort data if configured
  const sortedData = useMemo(() => {
    if (!fmt.sort.field) return data;
    return [...data].sort((a, b) => {
      const aV = a[fmt.sort.field], bV = b[fmt.sort.field];
      if (aV == null) return 1;
      if (bV == null) return -1;
      return fmt.sort.order === 'asc' ? (aV > bV ? 1 : -1) : (aV < bV ? 1 : -1);
    });
  }, [data, fmt.sort]);

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
  const [activeMeasures, setActiveMeasures] = useState(defaultMeasures || numericCols);
  const [palette, setPalette] = useState(defaultPalette);
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(!embedded);
  const [showSettings, setShowSettings] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleSingleSelect = useCallback((m) => setSelectedMeasure(m), []);
  const handleMultiToggle = useCallback((m) => {
    setActiveMeasures((prev) => {
      const next = prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m];
      return next.length === 0 ? [m] : next; // at least one must be selected
    });
  }, []);

  if (augColumns.length < 2 || data.length === 0 || numericCols.length === 0 || rankedCharts.length === 0) {
    if (embedded) {
      let msg = "Cannot render chart";
      if (data.length === 0) msg = "0 data rows";
      else if (augColumns.length < 2) msg = "Required: ≥ 2 columns";
      else if (numericCols.length === 0) msg = "Required: ≥ 1 numeric metric";

      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
           <svg className="w-8 h-8 text-slate-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           <span className="text-slate-400 text-xs font-medium">{msg}</span>
        </div>
      );
    }
    return null;
  }

  const chartType = activeType || rankedCharts[0]?.key || "bar";
  const colors = PALETTES[palette] || PALETTES.default;

  const isSingleMeasureChart = ["pie", "donut", "treemap"].includes(chartType);
  const isMultiMeasureChart = ["bar", "bar_h", "stacked", "line", "area", "radar"].includes(chartType);
  const currentMeasure = numericCols.includes(selectedMeasure) ? selectedMeasure : numericCols[0];
  const currentMeasures = activeMeasures.filter((m) => numericCols.includes(m));
  const displayMeasures = currentMeasures.length > 0 ? currentMeasures : numericCols;

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

  // Custom tooltip with template support
  const TemplateTooltip = useCallback(({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    let text = fmt.tooltip.template;
    for (const key of Object.keys(row)) {
      text = text.replaceAll(`{${key}}`, row[key] ?? '');
    }
    return (
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#e2e8f0', maxWidth: 280, whiteSpace: 'pre-wrap' }}>
        {text}
      </div>
    );
  }, [fmt.tooltip.template]);

  const tooltipElement = fmt.tooltip.show
    ? <Tooltip content={fmt.tooltip.template ? <TemplateTooltip /> : <CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
    : null;

  const legendElement = (showLegend && fmt.legend.show && displayMeasures.length > 1)
    ? <Legend
        layout={fmt.legend.position === 'left' || fmt.legend.position === 'right' ? 'vertical' : 'horizontal'}
        align={fmt.legend.position === 'left' ? 'left' : fmt.legend.position === 'right' ? 'right' : 'center'}
        verticalAlign={fmt.legend.position === 'top' ? 'top' : fmt.legend.position === 'bottom' ? 'bottom' : 'middle'}
        wrapperStyle={{ fontSize: fmt.legend.fontSize, color: fmt.legend.color }}
      />
    : null;

  const gridElement = (showGrid && fmt.grid.show)
    ? <CartesianGrid
        stroke={fmt.grid.color}
        strokeDasharray={fmt.grid.style === 'dashed' ? '5 5' : fmt.grid.style === 'dotted' ? '2 2' : '0'}
        vertical={fmt.grid.vertical}
      />
    : null;

  const refLineElements = computedRefLines.map((rl, idx) => (
    <ReferenceLine key={`ref-${idx}`} y={rl.value} stroke={rl.stroke || '#F59E0B'}
      strokeDasharray={rl.strokeDasharray || '5 5'} strokeWidth={1.5}
      label={{ value: rl.label || '', position: 'right', fill: '#9ca3af', fontSize: 11 }} />
  ));

  const fmtTickFn = fmt.axis.tickFormat !== 'auto'
    ? (v) => formatTickValue(v, fmt.axis.tickFormat, fmt.axis.tickDecimals)
    : formatTick;

  /* ── Render Charts ── */
  const renderChart = () => {
    switch (chartType) {
      case "bar":
        return (
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            {gridElement}
            <XAxis dataKey={labelCol} tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn} interval={chartData.length > 12 ? 'preserveStartEnd' : 0}
              label={fmt.axis.xLabel ? { value: fmt.axis.xLabel, position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 } : undefined}
              angle={fmt.axis.xLabelRotation || 0} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn} width={55}
              label={fmt.axis.yLabel ? { value: fmt.axis.yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 11 } : undefined} />
            {tooltipElement}
            {legendElement}
            {refLineElements}
            {displayMeasures.map((col, i) => {
              const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
              const hasRules = fmt.colors.rules?.some((r) => r.measure === col);
              return (
                <Bar key={col} dataKey={col} fill={baseColor} radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out"
                  onClick={(data) => onCrossFilterClick?.(labelCol, data?.[labelCol])}
                  style={{ cursor: onCrossFilterClick ? 'pointer' : 'default' }}
                  label={fmt.dataLabels.show ? { position: fmt.dataLabels.position, fill: fmt.dataLabels.color || baseColor, fontSize: fmt.dataLabels.fontSize,
                    formatter: (v) => formatTickValue(v, fmt.dataLabels.format, null) } : undefined}>
                  {hasRules && chartData.map((row, idx) => (
                    <Cell key={idx} fill={resolveColor(col, row[col], i, fmt.colors, dashboardPalette)} />
                  ))}
                </Bar>
              );
            })}
          </BarChart>
        );

      case "bar_h":
        return (
          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
            {gridElement}
            <YAxis dataKey={labelCol} type="category" tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn} width={90}
              label={fmt.axis.yLabel ? { value: fmt.axis.yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 11 } : undefined} />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn}
              label={fmt.axis.xLabel ? { value: fmt.axis.xLabel, position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 } : undefined} />
            {tooltipElement}
            {legendElement}
            {refLineElements}
            {displayMeasures.map((col, i) => {
              const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
              const hasRules = fmt.colors.rules?.some((r) => r.measure === col);
              return (
                <Bar key={col} dataKey={col} fill={baseColor} radius={[0, 6, 6, 0]} animationDuration={800}
                  onClick={(data) => onCrossFilterClick?.(labelCol, data?.[labelCol])}
                  style={{ cursor: onCrossFilterClick ? 'pointer' : 'default' }}
                  label={fmt.dataLabels.show ? { position: fmt.dataLabels.position, fill: fmt.dataLabels.color || baseColor, fontSize: fmt.dataLabels.fontSize,
                    formatter: (v) => formatTickValue(v, fmt.dataLabels.format, null) } : undefined}>
                  {hasRules && chartData.map((row, idx) => (
                    <Cell key={idx} fill={resolveColor(col, row[col], i, fmt.colors, dashboardPalette)} />
                  ))}
                </Bar>
              );
            })}
          </BarChart>
        );

      case "stacked":
        return (
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            {gridElement}
            <XAxis dataKey={labelCol} tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn} interval={chartData.length > 12 ? 'preserveStartEnd' : 0}
              label={fmt.axis.xLabel ? { value: fmt.axis.xLabel, position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 } : undefined}
              angle={fmt.axis.xLabelRotation || 0} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn} width={55}
              label={fmt.axis.yLabel ? { value: fmt.axis.yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 11 } : undefined} />
            {tooltipElement}
            {legendElement}
            {refLineElements}
            {displayMeasures.map((col, i) => {
              const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
              return (
                <Bar key={col} dataKey={col} stackId="stack" fill={baseColor} radius={i === displayMeasures.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} animationDuration={800}
                  onClick={(data) => onCrossFilterClick?.(labelCol, data?.[labelCol])}
                  style={{ cursor: onCrossFilterClick ? 'pointer' : 'default' }}
                  label={fmt.dataLabels.show ? { position: fmt.dataLabels.position, fill: fmt.dataLabels.color || baseColor, fontSize: fmt.dataLabels.fontSize,
                    formatter: (v) => formatTickValue(v, fmt.dataLabels.format, null) } : undefined} />
              );
            })}
          </BarChart>
        );

      case "line":
        return (
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            {gridElement}
            <XAxis dataKey={labelCol} tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn}
              label={fmt.axis.xLabel ? { value: fmt.axis.xLabel, position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 } : undefined}
              angle={fmt.axis.xLabelRotation || 0} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn} width={55}
              label={fmt.axis.yLabel ? { value: fmt.axis.yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 11 } : undefined} />
            {tooltipElement}
            {legendElement}
            {refLineElements}
            {displayMeasures.map((col, i) => {
              const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
              return (
                <Line
                  key={col} type="monotone" dataKey={col}
                  stroke={baseColor} strokeWidth={2.5}
                  dot={{ r: 3, fill: baseColor, stroke: "#111827", strokeWidth: 2 }}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                  animationDuration={1000}
                  label={fmt.dataLabels.show ? { position: fmt.dataLabels.position, fill: fmt.dataLabels.color || baseColor, fontSize: fmt.dataLabels.fontSize,
                    formatter: (v) => formatTickValue(v, fmt.dataLabels.format, null) } : undefined}
                />
              );
            })}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <defs>
              {displayMeasures.map((col, i) => {
                const gradColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
                return (
                  <linearGradient key={col} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={gradColor} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={gradColor} stopOpacity={0.02} />
                  </linearGradient>
                );
              })}
            </defs>
            {gridElement}
            <XAxis dataKey={labelCol} tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn}
              label={fmt.axis.xLabel ? { value: fmt.axis.xLabel, position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 } : undefined}
              angle={fmt.axis.xLabelRotation || 0} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn} width={55}
              label={fmt.axis.yLabel ? { value: fmt.axis.yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 11 } : undefined} />
            {tooltipElement}
            {legendElement}
            {refLineElements}
            {displayMeasures.map((col, i) => {
              const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
              return (
                <Area
                  key={col} type="monotone" dataKey={col}
                  stroke={baseColor} strokeWidth={2}
                  fill={`url(#grad-${i})`}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                  animationDuration={1000}
                  label={fmt.dataLabels.show ? { position: fmt.dataLabels.position, fill: fmt.dataLabels.color || baseColor, fontSize: fmt.dataLabels.fontSize,
                    formatter: (v) => formatTickValue(v, fmt.dataLabels.format, null) } : undefined}
                />
              );
            })}
          </AreaChart>
        );

      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData} dataKey={currentMeasure} nameKey={labelCol}
              cx="50%" cy="50%" outerRadius={110}
              label={renderPieLabel} labelLine={{ stroke: "#4b5563", strokeWidth: 1 }}
              paddingAngle={2} animationDuration={800}
              onClick={(_, idx) => onCrossFilterClick?.(labelCol, chartData[idx]?.[labelCol])}
              style={{ cursor: onCrossFilterClick ? 'pointer' : 'default' }}
            >
              {chartData.map((entry, i) => {
                const origIdx = pieColorMap[String(entry[labelCol])] ?? i;
                return <Cell key={i} fill={resolveColor(currentMeasure, null, origIdx, fmt.colors, dashboardPalette)} stroke="#111827" strokeWidth={2} />;
              })}
            </Pie>
            {tooltipElement}
            {legendElement}
          </PieChart>
        );

      case "donut":
        return (
          <PieChart>
            <Pie
              data={chartData} dataKey={currentMeasure} nameKey={labelCol}
              cx="50%" cy="50%" outerRadius={110} innerRadius={55}
              label={renderPieLabel} labelLine={{ stroke: "#4b5563", strokeWidth: 1 }}
              paddingAngle={3} cornerRadius={4} animationDuration={800}
              onClick={(_, idx) => onCrossFilterClick?.(labelCol, chartData[idx]?.[labelCol])}
              style={{ cursor: onCrossFilterClick ? 'pointer' : 'default' }}
            >
              {chartData.map((entry, i) => {
                const origIdx = pieColorMap[String(entry[labelCol])] ?? i;
                return <Cell key={i} fill={resolveColor(currentMeasure, null, origIdx, fmt.colors, dashboardPalette)} stroke="#111827" strokeWidth={2} />;
              })}
            </Pie>
            {tooltipElement}
            {legendElement}
          </PieChart>
        );

      case "radar": {
        return (
          <RadarChart cx="50%" cy="50%" outerRadius={100} data={chartData}>
            {showGrid && fmt.grid.show && <PolarGrid stroke={fmt.grid.color} />}
            <PolarAngleAxis dataKey={labelCol} tick={{ fill: "#9ca3af", fontSize: fmt.typography.axisFontSize }} />
            <PolarRadiusAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} />
            {displayMeasures.map((col, i) => {
              const baseColor = resolveColor(col, null, i, fmt.colors, dashboardPalette);
              return (
                <Radar
                  key={col} name={col} dataKey={col}
                  stroke={baseColor} fill={baseColor} fillOpacity={0.15}
                  strokeWidth={2} animationDuration={800}
                />
              );
            })}
            {tooltipElement}
            {legendElement}
          </RadarChart>
        );
      }

      case "treemap": {
        const treemapData = chartData
          .map((r, i) => ({ name: String(r[labelCol] || `Item ${i + 1}`), value: r[currentMeasure] || 0 }))
          .filter((d) => d.value > 0);
        const treemapColors = treemapData.map((_, i) => resolveColor(labelCol, null, i, fmt.colors, dashboardPalette));
        return (
          <Treemap
            data={treemapData} dataKey="value" nameKey="name"
            aspectRatio={4 / 3} stroke="#111827"
            content={<TreemapContent colors={treemapColors} />}
            animationDuration={800}
          />
        );
      }

      case "scatter": {
        const xMeasure = displayMeasures[0];
        const yMeasure = displayMeasures[1] || displayMeasures[0];
        return (
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            {gridElement}
            <XAxis dataKey={xMeasure} type="number" name={xMeasure} tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn}
              label={fmt.axis.xLabel ? { value: fmt.axis.xLabel, position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 } : undefined} />
            <YAxis dataKey={yMeasure} type="number" name={yMeasure} tick={{ fill: '#94a3b8', fontSize: fmt.typography.axisFontSize }} axisLine={{ stroke: '#1e293b' }} tickLine={{ stroke: '#1e293b' }}
              tickFormatter={fmtTickFn} width={55}
              label={fmt.axis.yLabel ? { value: fmt.axis.yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 11 } : undefined} />
            <ZAxis range={[40, 200]} />
            {tooltipElement}
            <Scatter data={chartData} fill={resolveColor(labelCol, null, 0, fmt.colors, dashboardPalette)} animationDuration={800}>
              {chartData.map((_, i) => <Cell key={i} fill={resolveColor(labelCol, null, i, fmt.colors, dashboardPalette)} />)}
            </Scatter>
          </ScatterChart>
        );
      }

      default:
        return null;
    }
  };

  /* ── Compute summary stats for selected measures ── */
  const statsFor = isSingleMeasureChart ? [currentMeasure] : displayMeasures;

  /* ── Build accessible summary ── */
  const chartSummary = useMemo(() => {
    const top = data.slice(0, 3);
    const measureLabel = isSingleMeasureChart ? currentMeasure : displayMeasures.join(", ");
    const topItems = top.map((r) => `${r[labelCol]}: ${formatNumber(r[isSingleMeasureChart ? currentMeasure : displayMeasures[0]])}`).join("; ");
    return `${rankedCharts[0]?.label || chartType} chart showing ${measureLabel} across ${data.length} items. Top entries: ${topItems}`;
  }, [data, labelCol, chartType, currentMeasure, displayMeasures, isSingleMeasureChart, rankedCharts]);

  /* ── Embedded mode: compact chart only ── */
  if (embedded) {
    return (
      <div className="h-full flex flex-col">
        <div ref={chartRef} className="flex-1 min-h-0" role="img" aria-label={chartSummary}>
          <AnimatePresence mode="wait">
            <motion.div
              key={chartType}
              style={{ width: "100%", height: "100%" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  /* ── Full mode with toolbar ── */
  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80 gap-2">
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
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 border border-transparent"
              }`}
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
            className={`p-2 rounded-lg transition-colors duration-200 cursor-pointer ${showSettings ? "bg-slate-800 text-blue-400" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"}`}
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
              className={`p-2 rounded-lg transition-colors duration-200 cursor-pointer ${showExportMenu ? "bg-slate-800 text-blue-400" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"}`}
              title="Export chart"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden min-w-[150px]">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">Image</div>
                {[
                  { key: "png", label: "PNG", desc: "High quality" },
                  { key: "jpg", label: "JPG", desc: "Compressed" },
                ].map((fmt) => (
                  <button
                    key={fmt.key}
                    onClick={() => { exportChart(chartRef, fmt.key); setShowExportMenu(false); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors duration-200 cursor-pointer"
                  >
                    <span className="font-medium">{fmt.label}</span>
                    <span className="text-slate-500">{fmt.desc}</span>
                  </button>
                ))}
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-t border-b border-slate-800">Data</div>
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
                    className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors duration-200 cursor-pointer"
                  >
                    <span className="font-medium">{fmt.label}</span>
                    <span className="text-slate-500">{fmt.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Measure Selector Row ── */}
      {numericCols.length > 1 && (
        <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/40">
          {isSingleMeasureChart ? (
            <MeasureSelector measures={numericCols} selected={currentMeasure} onSelect={handleSingleSelect} colors={colors} mode="single" />
          ) : isMultiMeasureChart ? (
            <MeasureSelector measures={numericCols} selected={displayMeasures} onSelect={handleMultiToggle} colors={colors} mode="multi" />
          ) : null}
        </div>
      )}

      {/* ── Settings Panel ── */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Palette</span>
            <div className="flex gap-1.5">
              {Object.entries(PALETTES).map(([key, cols]) => (
                <button
                  key={key}
                  onClick={() => setPalette(key)}
                  className={`w-5 h-5 rounded-full border-2 transition-all duration-200 cursor-pointer ${palette === key ? "border-white scale-110 ring-2 ring-blue-500/20" : "border-transparent hover:border-slate-600"}`}
                  style={{ background: `linear-gradient(135deg, ${cols[0]}, ${cols[1]})` }}
                  title={key}
                  aria-label={`${key} color palette${palette === key ? " (selected)" : ""}`}
                  aria-pressed={palette === key}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showGrid} onChange={() => setShowGrid(!showGrid)} className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0 cursor-pointer" />
            <span className="text-xs text-slate-400">Grid</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showLegend} onChange={() => setShowLegend(!showLegend)} className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0 cursor-pointer" />
            <span className="text-xs text-slate-400">Legend</span>
          </label>
        </div>
      )}

      {/* ── Chart Canvas ── */}
      <div ref={chartRef} className={embedded ? "px-1 py-1" : "px-2 py-4"} role="img" aria-label={chartSummary}>
        <AnimatePresence mode="wait">
          <motion.div
            key={chartType}
            style={{ width: "100%", height: "100%" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <ResponsiveContainer width="100%" height={embedded ? 150 : 340}>
              {renderChart()}
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Data summary bar (hidden in embedded/dashboard mode) ── */}
      {!embedded && <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800 bg-slate-900/40">
        <span className="text-xs text-slate-500">
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

import { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense, memo } from 'react';
import { TOKENS } from './tokens';
import ResultsChart from '../ResultsChart';
import KPICard from './KPICard';
import SparklineKPI from './tiles/SparklineKPI';
import ScorecardTable from './tiles/ScorecardTable';
import HBarCard from './tiles/HBarCard';
import HeatMatrix from './tiles/HeatMatrix';
import TileBoundary from './TileBoundary';
import { getChartDef } from '../charts/defs/chartDefs';
import { isEnabled as isChartTypeEnabled } from '../../lib/tileFeatureFlag';
import { blendSources } from '../../lib/dataBlender';
import { mergeFormatting } from '../../lib/formatUtils';
import { api } from '../../api';
import { downloadCSV } from '../../lib/exportUtils';
import { detectAnomalies, formatAnomalyBadge } from '../../lib/anomalyDetector';
import { isDateColumn } from '../../lib/fieldClassification';
import { useStore } from '../../store';
import { acknowledgeTile } from '../../lib/hotMetricDetector';

const CanvasChart = lazy(() => import('./CanvasChart'));

// Wow-factor family — each engine in its own lazy-loaded chunk so the
// initial tile render never pays the three.js / deck.gl cost unless
// a user actually opens a 3D or geo tile.
const ThreeScatter3D = lazy(() => import('../charts/engines/ThreeScatter3D'));

const DENSE_TILE_REGISTRY = {
  sparkline_kpi: SparklineKPI,
  scorecard_table: ScorecardTable,
  hbar_card: HBarCard,
  heat_matrix: HeatMatrix,
};

const WOW_TILE_REGISTRY = {
  scatter_3d: ThreeScatter3D,
};

const CHART_TYPES = [
  { id: 'bar',           label: 'Bar',          icon: 'M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z' },
  { id: 'line',          label: 'Line',         icon: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17' },
  { id: 'area',          label: 'Area',         icon: 'M3 3v16h18M7 16l4-8 4 5 3-3' },
  { id: 'pie',           label: 'Pie',          icon: 'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z' },
  { id: 'donut',         label: 'Donut',        icon: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 4a6 6 0 1 1 0 12A6 6 0 0 1 12 6z' },
  { id: 'table',         label: 'Table',        icon: 'M3 3h18v18H3V3zm0 6h18M3 15h18M9 3v18' },
  { id: 'kpi',           label: 'KPI',          icon: 'M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16' },
  { id: 'stacked_bar',   label: 'Stacked',      icon: 'M8 2v8h8V2H8zm0 10v8h8v-8H8zM2 6v4h4V6H2zm0 8v4h4v-4H2zm14-8v4h4V6h-4zm0 8v4h4v-4h-4z' },
  { id: 'bar_h',         label: 'H-Bar',        icon: 'M3 12h18M3 6h12M3 18h15' },
  { id: 'scatter',       label: 'Scatter',      icon: 'M3 3l7.07 14.14L12 3l4.95 11.05L19 3l-2 18H5L3 3z' },
];

function TileWrapper({ tile, index, onEdit, onChangeChart, onRemove, onMove, onCopy, onRefresh, customMetrics = [], onSelect, selectedTileId, crossFilter, onCrossFilterClick, dashboardId, themeConfig, allTabs = [] }) {
  const [chartPickerOpen, setChartPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(null); // null | "move" | "copy"
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef(null);
  const moveMenuRef = useRef(null);
  const [showComments, setShowComments] = useState(false);
  const [anomalyExplanation, setAnomalyExplanation] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const pickerRef = useRef(null);
  const commentsRef = useRef(null);
  const commentCount = (tile?.annotations || []).length;

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);


  const handleExplain = useCallback(async () => {
    if (explanation) { setExplanation(null); return; } // toggle off
    if (!tile?.columns?.length || !tile?.rows?.length) return;
    setExplainLoading(true);
    try {
      const res = await api.explainChart(tile.columns, tile.rows, tile.chartType, tile.question, tile.title);
      setExplanation(res.explanation);
    } catch { setExplanation('Could not generate explanation.'); }
    finally { setExplainLoading(false); }
  }, [tile, explanation]);

  // Close picker when clicking outside
  useEffect(() => {
    if (!chartPickerOpen) return;
    const handle = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setChartPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [chartPickerOpen]);
  useEffect(() => {
    if (!moveMenuOpen) return;
    const handle = (e) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target)) setMoveMenuOpen(null);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [moveMenuOpen]);

  // Close comments popover when clicking outside
  useEffect(() => {
    if (!showComments) return;
    const handle = (e) => {
      if (commentsRef.current && !commentsRef.current.contains(e.target)) {
        setShowComments(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showComments]);

  // Blend data sources if enabled
  const { chartColumns, chartRows } = useMemo(() => {
    let cols = tile?.columns || [];
    let rows = tile?.rows || [];
    if (tile?.blendConfig?.enabled && tile?.blendConfig?.joinKey && tile?.dataSources?.length > 0) {
      const blended = blendSources({ columns: cols, rows }, tile.dataSources, tile.blendConfig.joinKey);
      cols = blended.columns;
      rows = blended.rows;
    }
    return { chartColumns: cols, chartRows: rows };
  }, [tile?.columns, tile?.rows, tile?.dataSources, tile?.blendConfig]);

  const fmt = useMemo(() => mergeFormatting(tile?.visualConfig, null), [tile?.visualConfig]);

  // Trend indicator (local computation — no API call)
  const trend = useMemo(() => {
    if (!chartRows?.length || chartRows.length < 3) return null;

    // Only show trending on time-series charts
    const activeMeasureSet = new Set(tile?.activeMeasures || []);
    const xAxisCol = (tile?.columns || []).find(c => !activeMeasureSet.has(c));
    if (!xAxisCol || !isDateColumn(xAxisCol, chartRows)) return null;

    const measure = tile?.selectedMeasure || tile?.activeMeasures?.[0];
    if (!measure) return null;
    const values = chartRows.map(r => { const v = r[measure]; return v != null ? Number(v) : NaN; }).filter(v => !isNaN(v));
    if (values.length < 3) return null;
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const xMean = (n - 1) / 2;
    const num = values.reduce((s, v, i) => s + (i - xMean) * (v - mean), 0);
    const den = values.reduce((s, _, i) => s + (i - xMean) ** 2, 0);
    const slope = den ? num / den : 0;
    const stdev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    if (stdev === 0) return null;
    const dir = slope > stdev * 0.1 ? 'up' : slope < -stdev * 0.1 ? 'down' : null;
    return dir;
  }, [chartRows, tile?.selectedMeasure, tile?.activeMeasures, tile?.columns]);

  // Anomaly detection
  const anomaly = useMemo(() => {
    const anomalies = detectAnomalies(chartColumns, chartRows);
    return anomalies[0] || null;
  }, [chartColumns, chartRows]);

  useEffect(() => {
    if (!anomaly) { setAnomalyExplanation(null); return; }
    let cancelled = false;
    api.explainAnomaly({
      column: anomaly.column, value: anomaly.value,
      mean: anomaly.mean, stddev: anomaly.stddev, direction: anomaly.direction,
      tile_title: tile?.title || '', columns: chartColumns?.slice(0, 8) || [],
      sample_rows: chartRows?.slice(-5) || [],
    }).then(res => { if (!cancelled) setAnomalyExplanation(res.explanation); })
      .catch(() => { if (!cancelled) setAnomalyExplanation(formatAnomalyBadge(anomaly)); });
    return () => { cancelled = true; };
  }, [anomaly, tile?.title, chartColumns, chartRows]);

  const isKPI = tile?.chartType === 'kpi';
  const chartDef = getChartDef(tile?.chartType);
  const isDense = chartDef?.family === 'dense';
  const DenseTile = isDense ? DENSE_TILE_REGISTRY[tile.chartType] : null;
  const isWow = chartDef?.family === '3d' || chartDef?.family === 'geo';
  const WowTile = isWow ? WOW_TILE_REGISTRY[tile.chartType] : null;

  // Hot metric ambient pulse (Phase 2.4) — per-tile selector so tiles
  // only re-render when their own heat class flips
  const tileHeat = useStore((s) => s.tileHeatMap?.[tile?.id] || 'cold');
  const hotMetricsEnabled = useStore((s) => s.hotMetricsEnabled);
  const appliedHeat = hotMetricsEnabled ? tileHeat : 'cold';
  const hoverAckTimerRef = useRef(null);
  const handleHeatHoverEnter = useCallback(() => {
    if (!appliedHeat.startsWith('hot') || !dashboardId || !tile?.id) return;
    clearTimeout(hoverAckTimerRef.current);
    hoverAckTimerRef.current = setTimeout(() => {
      acknowledgeTile(dashboardId, tile.id);
    }, 2000);
  }, [appliedHeat, dashboardId, tile?.id]);
  const handleHeatHoverLeave = useCallback(() => {
    clearTimeout(hoverAckTimerRef.current);
  }, []);
  useEffect(() => () => clearTimeout(hoverAckTimerRef.current), []);

  return (
    <div className="relative overflow-visible group h-full flex flex-col dashboard-tile"
      data-selected={selectedTileId === tile?.id ? "true" : undefined}
      data-kpi={isKPI || undefined}
      data-heat={appliedHeat !== 'cold' ? appliedHeat : undefined}
      onClick={() => onSelect?.()}
      onMouseEnter={handleHeatHoverEnter}
      onMouseLeave={handleHeatHoverLeave}
      style={{
        background: fmt.style.background || themeConfig?.background?.tile || TOKENS.tile.surface,
        // Hairline border via CSS var — reads on both themes
        border: fmt.style.borderColor
          ? `${fmt.style.borderWidth ?? 1}px ${fmt.style.borderStyle || 'solid'} ${fmt.style.borderColor}`
          : `1px solid ${TOKENS.tile.border}`,
        borderRadius: `${fmt.style.radius ?? themeConfig?.spacing?.tileRadius ?? TOKENS.tile.radius}px`,
        // Premium shadow stack — theme-aware via CSS vars
        boxShadow: fmt.style.shadow
          ? `0 1px 0 var(--glass-highlight) inset, 0 28px 56px -28px var(--shadow-deep), 0 10px 22px -12px var(--shadow-mid)`
          : TOKENS.tile.shadow,
        backdropFilter: 'blur(14px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
        // Outline handled by .dashboard-tile[data-selected="true"] CSS rule — keep inline off to avoid double-ring
      }}>
      {/* Drag handle */}
      <div className="absolute top-3 left-1.5 w-4 flex flex-col gap-0.5 opacity-0 group-hover:opacity-70 cursor-grab rounded p-0.5 hover:opacity-100"
        style={{ transition: `opacity ${TOKENS.transition}` }}>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: TOKENS.tile.headerPad }}>
        <div className="flex items-center gap-2 min-w-0">
          {titleEditing ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                setTitleEditing(false);
                if (titleDraft.trim() && titleDraft.trim() !== tile?.title) {
                  api.updateTile(dashboardId, tile.id, { title: titleDraft.trim() }).catch(() => {});
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur();
                if (e.key === 'Escape') { setTitleEditing(false); }
              }}
              autoFocus
              className="bg-transparent outline-none border-b"
              style={{
                fontSize: `${fmt.typography.titleFontSize}px`,
                fontWeight: fmt.typography.titleFontWeight,
                color: fmt.typography.titleColor,
                fontFamily: TOKENS.tile.headerFont,
                letterSpacing: '-0.01em',
                borderColor: TOKENS.accent,
                width: Math.max(80, titleDraft.length * 8 + 20),
              }}
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setTitleDraft(tile?.title || ''); setTitleEditing(true); }}
              title="Double-click to rename"
              style={{
                fontSize: `${fmt.typography.titleFontSize}px`,
                fontWeight: fmt.typography.titleFontWeight,
                color: fmt.typography.titleColor,
                fontFamily: TOKENS.tile.headerFont,
                letterSpacing: '-0.01em',
                cursor: 'text',
              }}
            >{tile?.title || 'Untitled'}</span>
          )}
          {tile?.subtitle && <span style={{
            fontSize: `${fmt.typography.subtitleFontSize}px`,
            color: fmt.typography.subtitleColor,
          }}>{tile.subtitle}</span>}
          {trend && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
              color: trend === 'up' ? TOKENS.success : TOKENS.danger,
              background: trend === 'up' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            }}>
              {trend === 'up' ? '↑ Trending up' : '↓ Trending down'}
            </span>
          )}
          {anomaly && (
            <span title={anomalyExplanation || formatAnomalyBadge(anomaly)}
              style={{
                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                color: anomaly.direction === 'high' ? TOKENS.warning : TOKENS.danger,
                background: anomaly.direction === 'high' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
              {anomaly.direction === 'high' ? '▲' : '▼'} {anomalyExplanation || formatAnomalyBadge(anomaly)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100" style={{ transition: `opacity ${TOKENS.transition}` }}>
          {commentCount > 0 && (
            <div className="relative" ref={commentsRef}>
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setShowComments(o => !o); setChartPickerOpen(false); }}
                style={{ color: showComments ? TOKENS.accent : TOKENS.text.muted, background: showComments ? TOKENS.accentGlow : TOKENS.bg.surface }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[11px] h-[11px]"><path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293c.121-.233.362-.393.642-.413a41.1 41.1 0 003.55-.414c1.437-.232 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2z" clipRule="evenodd"/></svg>
                {commentCount}
              </span>
              {showComments && (
                <div className="absolute right-0 top-7 z-50 rounded-xl shadow-2xl p-3 w-64 max-h-60 overflow-y-auto"
                  style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.hover}`, boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}>
                  <div className="text-[11px] font-semibold mb-2" style={{ color: TOKENS.text.primary }}>{commentCount} annotation{commentCount !== 1 ? 's' : ''}</div>
                  {(tile?.annotations || []).map((ann, i) => (
                    <div key={ann.id || i} className="py-1.5 text-[11px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: TOKENS.text.secondary }}>
                      <span className="font-semibold" style={{ color: TOKENS.text.primary }}>{ann.authorName || 'Unknown'}</span>
                      <span className="ml-1.5" style={{ color: TOKENS.text.muted }}>{ann.created_at ? new Date(ann.created_at).toLocaleDateString() : ''}</span>
                      <p className="mt-0.5">{ann.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {[
            { title: refreshing ? 'Refreshing...' : 'Refresh',  icon: 'M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903H14.25a.75.75 0 000 1.5h6a.75.75 0 00.75-.75v-6a.75.75 0 00-1.5 0v2.553l-1.256-1.255a9 9 0 00-14.3 5.842.75.75 0 001.506-.429zM15.245 9.941a7.5 7.5 0 01-12.548 3.364L.794 11.402H5.75a.75.75 0 000-1.5h-6a.75.75 0 00-.75.75v6a.75.75 0 001.5 0v-2.553l1.256 1.255a9 9 0 0014.3-5.842.75.75 0 00-1.506.429z', onClick: handleRefresh },
            { title: explainLoading ? 'Explaining...' : (explanation ? 'Hide Insight' : 'Explain'), icon: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18', onClick: handleExplain },
            { title: 'Edit',     icon: 'M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z', onClick: () => onEdit?.(tile) },
            { title: 'Download CSV', icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3', onClick: () => downloadCSV(tile?.columns, tile?.rows, tile?.title) },
          ].map(({ title, icon, onClick }) => (
            <button key={title} onClick={onClick} title={title}
              className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
              style={{ color: title.startsWith('Refresh') && refreshing ? TOKENS.accent : TOKENS.text.muted, transition: `all ${TOKENS.transition}` }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                className="w-3.5 h-3.5"
                style={title.startsWith('Refresh') && refreshing ? { animation: 'spin 1s linear infinite' } : undefined}>
                <path fillRule="evenodd" d={icon} clipRule="evenodd"/>
              </svg>
            </button>
          ))}

          {/* Move / Copy */}
          <div className="relative" ref={moveMenuRef}>
            <button title="Move to..." onClick={() => setMoveMenuOpen(m => m === 'move' ? null : 'move')}
              className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
              style={{ color: moveMenuOpen === 'move' ? TOKENS.accent : TOKENS.text.muted, transition: `all ${TOKENS.transition}` }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 012 10z" clipRule="evenodd"/>
              </svg>
            </button>
            <button title="Copy to..." onClick={() => setMoveMenuOpen(m => m === 'copy' ? null : 'copy')}
              className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
              style={{ color: moveMenuOpen === 'copy' ? TOKENS.accent : TOKENS.text.muted, transition: `all ${TOKENS.transition}` }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z"/>
                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z"/>
              </svg>
            </button>
            {moveMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 32, zIndex: 60,
                background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.hover}`,
                borderRadius: 10, padding: 8, minWidth: 200, maxHeight: 250, overflowY: 'auto',
                boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TOKENS.text.muted, padding: '2px 8px 6px', letterSpacing: '0.05em' }}>
                  {moveMenuOpen === 'move' ? 'Move to' : 'Copy to'}
                </div>
                {allTabs.map(tab => (
                  <div key={tab.id}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: TOKENS.text.secondary, padding: '4px 8px 2px' }}>{tab.name || tab.id}</div>
                    {(tab.sections || []).map(sec => (
                      <button key={sec.id}
                        onClick={() => {
                          if (moveMenuOpen === 'move') onMove?.(tab.id, sec.id);
                          else onCopy?.(tab.id, sec.id);
                          setMoveMenuOpen(null);
                        }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '5px 8px 5px 16px', fontSize: 12, color: TOKENS.text.primary,
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          borderRadius: 4,
                        }}
                        onMouseEnter={e => { e.target.style.background = TOKENS.accentGlow; }}
                        onMouseLeave={e => { e.target.style.background = 'transparent'; }}
                      >
                        {sec.name || sec.id}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chart type picker */}
          <div className="relative" ref={pickerRef}>
            <button
              title="Chart type"
              onClick={() => setChartPickerOpen(o => !o)}
              className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
              style={{
                color: chartPickerOpen ? TOKENS.accent : TOKENS.text.muted,
                background: chartPickerOpen ? TOKENS.accentGlow : 'transparent',
                transition: `all ${TOKENS.transition}`,
              }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" clipRule="evenodd"/>
              </svg>
            </button>
            {chartPickerOpen && (
              <div
                className="absolute right-0 top-8 z-50 grid grid-cols-2 gap-1 p-2 rounded-xl shadow-2xl"
                style={{
                  background: TOKENS.bg.elevated,
                  border: `1px solid ${TOKENS.border.hover}`,
                  minWidth: 180,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                }}>
                {CHART_TYPES.map(ct => (
                  <button
                    key={ct.id}
                    onClick={() => { onChangeChart?.(tile.id, ct.id); setChartPickerOpen(false); }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left cursor-pointer"
                    style={{
                      color: tile?.chartType === ct.id ? TOKENS.accent : TOKENS.text.secondary,
                      background: tile?.chartType === ct.id ? TOKENS.accentGlow : 'transparent',
                      fontSize: 12,
                      fontWeight: tile?.chartType === ct.id ? 600 : 400,
                      transition: `all ${TOKENS.transition}`,
                    }}
                    onMouseEnter={e => { if (tile?.chartType !== ct.id) e.currentTarget.style.background = TOKENS.bg.hover; }}
                    onMouseLeave={e => { if (tile?.chartType !== ct.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d={ct.icon}/>
                    </svg>
                    {ct.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={onRemove} title="Remove"
            className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
            style={{ color: TOKENS.danger, transition: `all ${TOKENS.transition}` }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5z" clipRule="evenodd"/></svg>
          </button>
        </div>
      </div>
      {/* AI Explanation panel */}
      {(explanation || explainLoading) && (
        <div style={{
          padding: '6px 14px', fontSize: 11, lineHeight: 1.5,
          color: TOKENS.text.secondary,
          background: 'rgba(37,99,235,0.06)',
          borderBottom: `1px solid ${TOKENS.border.default}`,
        }}>
          {explainLoading ? (
            <span style={{ color: TOKENS.text.muted, fontStyle: 'italic' }}>Generating insight...</span>
          ) : (
            <span>{explanation}</span>
          )}
        </div>
      )}
      {/* Parameter sliders */}
      {tile?.parameters?.length > 0 && (
        <div style={{ padding: '2px 12px 4px', display: 'flex', gap: 12, flexWrap: 'wrap', borderBottom: `1px solid ${TOKENS.border.default}` }}>
          {tile.parameters.filter(p => p.name).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ color: TOKENS.text.muted, fontWeight: 500 }}>{p.name}</span>
              <input type="range"
                min={p.min ?? 0} max={p.max ?? 100} step={p.step ?? 1}
                defaultValue={p.value ?? ((p.min ?? 0) + (p.max ?? 100)) / 2}
                onChange={e => {
                  const val = Number(e.target.value);
                  // Debounced refresh with parameter value
                  if (tile._paramTimer) clearTimeout(tile._paramTimer);
                  tile._paramTimer = setTimeout(() => {
                    const params = {};
                    tile.parameters.forEach((pp, j) => { params[pp.name] = j === i ? val : (pp.value ?? ((pp.min ?? 0) + (pp.max ?? 100)) / 2); });
                    onRefresh?.(params);
                  }, 300);
                }}
                style={{ width: 80, accentColor: TOKENS.accent }}
              />
              <span style={{ color: TOKENS.text.secondary, minWidth: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                id={`param-${tile.id}-${i}`}>
                {p.value ?? ((p.min ?? 0) + (p.max ?? 100)) / 2}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Chart body — wrapped in TileBoundary so one broken tile can't crash the dashboard */}
      <div className="flex-1 min-h-0 overflow-hidden"
        style={{ padding: `4px ${fmt.style.padding ?? 12}px ${fmt.style.padding ?? 8}px` }}>
        <TileBoundary>
        {!isChartTypeEnabled(tile?.chartType) ? (
          <div
            className="h-full flex flex-col items-center justify-center"
            style={{
              color: TOKENS.text.muted,
              fontSize: 12,
              fontFamily: TOKENS.fontBody,
              textAlign: 'center',
              padding: 16,
              gap: 6,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx={12} cy={12} r={10} />
              <path d="M4.93 4.93l14.14 14.14" />
            </svg>
            <span style={{ fontWeight: 600, color: TOKENS.text.secondary }}>Chart type disabled</span>
            <span style={{ fontSize: 10.5, opacity: 0.75 }}>
              The <code style={{ fontFamily: TOKENS.fontMono }}>{tile?.chartType}</code> renderer is currently killed via feature flag.
            </span>
          </div>
        ) : isKPI ? (
          <KPICard tile={tile} index={index} onEdit={onEdit} formatting={tile.visualConfig} />
        ) : isDense && DenseTile ? (
          <DenseTile tile={{ ...tile, columns: chartColumns, rows: chartRows }} index={index} formatting={tile.visualConfig} />
        ) : isWow && WowTile ? (
          <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: TOKENS.text.muted, fontSize: 11 }}>Loading 3D engine…</div>}>
            <WowTile tile={{ ...tile, columns: chartColumns, rows: chartRows }} index={index} formatting={tile.visualConfig} />
          </Suspense>
        ) : chartRows?.length > 0 ? (
          chartRows.length > 1000 && ['scatter', 'heatmap'].includes(tile?.chartType) ? (
            <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><span style={{ color: '#5C5F66', fontSize: 12 }}>Loading...</span></div>}>
              <CanvasChart
                columns={chartColumns}
                rows={chartRows}
                chartType={tile.chartType}
                formatting={tile.visualConfig}
              />
            </Suspense>
          ) : (
            <ResultsChart
              key={`${tile.id}-${tile.chartType}-${tile.palette}-${tile.dataSources?.length || 0}-${JSON.stringify(tile.visualConfig?.colors?.measureColors || {})}-${JSON.stringify(tile.visualConfig?.colors?.categoryColors || {})}-${themeConfig?.palette || ''}-${(tile.activeMeasures || []).join(',')}`}
              columns={chartColumns} rows={chartRows} embedded
              defaultChartType={tile.chartType} defaultPalette={tile.palette}
              defaultMeasure={tile.selectedMeasure} defaultMeasures={tile.activeMeasures}
              customMetrics={customMetrics}
              formatting={tile.visualConfig}
              dashboardPalette={themeConfig?.palette || 'default'}
              crossFilter={crossFilter}
              onCrossFilterClick={onCrossFilterClick} />
          )
        ) : tile?.sql && tile?.columns?.length > 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <svg className="w-5 h-5 mb-2" style={{ color: TOKENS.text.muted }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
            </svg>
            <span className="text-sm font-medium" style={{ color: TOKENS.text.muted }}>No matching data</span>
            <span className="text-[11px] mt-1" style={{ color: TOKENS.text.muted, opacity: 0.6 }}>Try adjusting filters or date range</span>
          </div>
        ) : tile?.sql ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin mb-3" />
            <span className="text-sm font-medium text-slate-400">Loading data...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <svg className="w-8 h-8 text-slate-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <span className="text-sm font-medium text-slate-400">No data</span>
            <span className="text-xs text-slate-500 mt-1 max-w-[200px] text-center">Add SQL to this tile or use the command bar</span>
          </div>
        )}
        </TileBoundary>
      </div>
      {/* Resize handle */}
      <div className="absolute bottom-1 right-1 w-3 h-3 opacity-0 group-hover:opacity-40 cursor-se-resize"
        style={{ transition: `opacity ${TOKENS.transition}` }}>
        <div className="absolute bottom-0 right-0 w-2.5 h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <div className="absolute bottom-0 right-0 w-0.5 h-2.5 rounded" style={{ background: TOKENS.text.muted }}/>
      </div>
    </div>
  );
}

export default memo(TileWrapper, (prev, next) => {
  return (
    prev.tile?.id === next.tile?.id &&
    prev.tile?.rows === next.tile?.rows &&
    prev.tile?.columns === next.tile?.columns &&
    prev.tile?.chartType === next.tile?.chartType &&
    prev.tile?.palette === next.tile?.palette &&
    prev.tile?.visualConfig === next.tile?.visualConfig &&
    prev.tile?.title === next.tile?.title &&
    prev.tile?.annotations === next.tile?.annotations &&
    prev.selectedTileId === next.selectedTileId &&
    prev.crossFilter === next.crossFilter &&
    prev.themeConfig === next.themeConfig
  );
});

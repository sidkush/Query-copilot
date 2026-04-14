import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS, CHART_PALETTES } from './tokens';
import { api } from '../../api';
import DataSourceEditor from './DataSourceEditor';
import ColorPickerButton from './ColorPickerButton';
import ReferenceLineEditor from './ReferenceLineEditor';
import ConditionalRuleBuilder from './ConditionalRuleBuilder';
import { FORMATTING_DEFAULTS } from '../../lib/formatUtils';
import { classifyColumns } from '../../lib/fieldClassification';

/* ── Chart type definitions with mini SVG icons ── */
const CHART_TYPES = [
  { key: 'bar',            label: 'Bar',            icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="10" width="4" height="10" rx="1" fill="currentColor" opacity=".5"/><rect x="10" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="17" y="8" width="4" height="12" rx="1" fill="currentColor" opacity=".7"/></svg> },
  { key: 'line',           label: 'Line',           icon: <svg viewBox="0 0 24 24" width="20" height="20"><polyline points="3,17 8,9 13,13 21,5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { key: 'area',           label: 'Area',           icon: <svg viewBox="0 0 24 24" width="20" height="20"><polygon points="3,18 8,10 13,14 21,6 21,18" fill="currentColor" opacity=".3"/><polyline points="3,18 8,10 13,14 21,6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { key: 'pie',            label: 'Pie',            icon: <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2a10 10 0 0 1 0 20 10 10 0 0 1 0-20z" fill="currentColor" opacity=".3"/><path d="M12 2v10h10a10 10 0 0 0-10-10z" fill="currentColor"/></svg> },
  { key: 'donut',          label: 'Donut',          icon: <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="4" opacity=".3"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg> },
  { key: 'table',          label: 'Table',          icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="2"/><line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="1.5"/></svg> },
  { key: 'kpi',            label: 'KPI',            icon: <svg viewBox="0 0 24 24" width="20" height="20"><text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">#</text></svg> },
  { key: 'stacked_bar',    label: 'Stacked',        icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="12" width="4" height="8" rx="1" fill="currentColor" opacity=".5"/><rect x="3" y="6" width="4" height="6" rx="1" fill="currentColor"/><rect x="10" y="8" width="4" height="12" rx="1" fill="currentColor" opacity=".5"/><rect x="10" y="3" width="4" height="5" rx="1" fill="currentColor"/><rect x="17" y="10" width="4" height="10" rx="1" fill="currentColor" opacity=".5"/><rect x="17" y="5" width="4" height="5" rx="1" fill="currentColor"/></svg> },
  { key: 'bar_h', label: 'H-Bar',          icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="14" height="4" rx="1" fill="currentColor"/><rect x="3" y="10" width="10" height="4" rx="1" fill="currentColor" opacity=".7"/><rect x="3" y="17" width="16" height="4" rx="1" fill="currentColor" opacity=".5"/></svg> },
  { key: 'radar',          label: 'Radar',          icon: <svg viewBox="0 0 24 24" width="20" height="20"><polygon points="12,3 20,9 18,18 6,18 4,9" fill="currentColor" opacity=".2" stroke="currentColor" strokeWidth="1.5"/><polygon points="12,7 17,11 15,16 9,16 7,11" fill="currentColor" opacity=".4"/></svg> },
  { key: 'scatter',        label: 'Scatter',        icon: <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="6" cy="16" r="2" fill="currentColor"/><circle cx="10" cy="10" r="2" fill="currentColor" opacity=".7"/><circle cx="16" cy="14" r="2" fill="currentColor" opacity=".5"/><circle cx="18" cy="6" r="2" fill="currentColor"/></svg> },
  { key: 'treemap',        label: 'Treemap',        icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor"/><rect x="15" y="3" width="6" height="10" rx="1" fill="currentColor" opacity=".6"/><rect x="3" y="15" width="6" height="6" rx="1" fill="currentColor" opacity=".4"/><rect x="11" y="15" width="10" height="6" rx="1" fill="currentColor" opacity=".7"/></svg> },

  /* ── Dense family — Tableau-class compact tiles ── */
  { key: 'sparkline_kpi', label: 'Sparkline KPI', family: 'dense', icon: <svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 17l4-4 3 3 5-7 6 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 20h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".4"/></svg> },
  { key: 'scorecard_table', label: 'Scorecard', family: 'dense', icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="14" height="2" rx="1" fill="currentColor"/><rect x="19" y="5" width="2" height="2" rx="1" fill="currentColor" opacity=".7"/><rect x="3" y="10" width="10" height="2" rx="1" fill="currentColor" opacity=".75"/><rect x="15" y="10" width="6" height="2" rx="1" fill="currentColor" opacity=".55"/><rect x="3" y="15" width="8" height="2" rx="1" fill="currentColor" opacity=".55"/><rect x="13" y="15" width="8" height="2" rx="1" fill="currentColor" opacity=".35"/></svg> },
  { key: 'hbar_card', label: 'Bar Card', family: 'dense', icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="4" width="16" height="4" rx="1.5" fill="currentColor"/><rect x="3" y="10" width="11" height="4" rx="1.5" fill="currentColor" opacity=".75"/><rect x="3" y="16" width="18" height="4" rx="1.5" fill="currentColor" opacity=".5"/></svg> },
  { key: 'heat_matrix', label: 'Heat Matrix', family: 'dense', icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="5" height="5" rx="1" fill="currentColor" opacity=".9"/><rect x="10" y="3" width="5" height="5" rx="1" fill="currentColor" opacity=".5"/><rect x="17" y="3" width="4" height="5" rx="1" fill="currentColor" opacity=".7"/><rect x="3" y="10" width="5" height="5" rx="1" fill="currentColor" opacity=".3"/><rect x="10" y="10" width="5" height="5" rx="1" fill="currentColor" opacity=".85"/><rect x="17" y="10" width="4" height="5" rx="1" fill="currentColor" opacity=".45"/><rect x="3" y="17" width="5" height="4" rx="1" fill="currentColor" opacity=".6"/><rect x="10" y="17" width="5" height="4" rx="1" fill="currentColor" opacity=".4"/><rect x="17" y="17" width="4" height="4" rx="1" fill="currentColor" opacity=".8"/></svg> },

  /* ── Wow-factor family — flagship Phase 4 charts ── */
  { key: 'scatter_3d', label: '3D Scatter', family: 'wow', icon: <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 20L12 4L20 20Z" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".35"/><circle cx="7" cy="16" r="1.4" fill="currentColor"/><circle cx="12" cy="7" r="1.4" fill="currentColor" opacity=".75"/><circle cx="17" cy="17" r="1.4" fill="currentColor" opacity=".85"/><circle cx="13" cy="13" r="1.4" fill="currentColor" opacity=".55"/><circle cx="9" cy="11" r="1.4" fill="currentColor" opacity=".65"/></svg> },
  { key: 'hologram_scatter', label: 'Hologram', family: 'wow', icon: <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2l10 6v8l-10 6L2 16V8z" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="8" cy="10" r="1.1" fill="currentColor" opacity=".75"/><circle cx="16" cy="14" r="1.1" fill="currentColor" opacity=".75"/><circle cx="10" cy="15" r="0.9" fill="currentColor" opacity=".55"/></svg> },
  { key: 'geo_map', label: 'Geo Map', family: 'wow', icon: <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 7l5-2 6 2 5-2v12l-5 2-6-2-5 2V7z" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".5"/><path d="M9 5v14M15 7v14" fill="none" stroke="currentColor" strokeWidth="1" opacity=".35"/><circle cx="9" cy="11" r="2.2" fill="currentColor"/><circle cx="15" cy="14" r="1.6" fill="currentColor" opacity=".8"/><circle cx="12" cy="9" r="1.2" fill="currentColor" opacity=".65"/></svg> },
  { key: 'ridgeline', label: 'Ridgeline', family: 'wow', icon: <svg viewBox="0 0 24 24" width="20" height="20"><path d="M2 14c2-4 4-4 6 0s4 4 6 0 4-4 6 0 4 4 2 0" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".45"/><path d="M2 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0 4 4 2 0" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".65"/><path d="M2 20c2-4 4-4 6 0s4 4 6 0 4-4 6 0 4 4 2 0" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg> },
  { key: 'particle_flow', label: 'Particle Flow', family: 'wow', icon: <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="5" cy="8" r="1" fill="currentColor"/><circle cx="9" cy="6" r="1" fill="currentColor" opacity=".8"/><circle cx="14" cy="9" r="1" fill="currentColor" opacity=".9"/><circle cx="18" cy="7" r="1" fill="currentColor" opacity=".7"/><circle cx="6" cy="14" r="1" fill="currentColor" opacity=".85"/><circle cx="11" cy="16" r="1" fill="currentColor"/><circle cx="16" cy="14" r="1" fill="currentColor" opacity=".75"/><circle cx="20" cy="17" r="1" fill="currentColor" opacity=".8"/><circle cx="8" cy="20" r="1" fill="currentColor" opacity=".6"/><circle cx="13" cy="21" r="1" fill="currentColor" opacity=".55"/></svg> },
  { key: 'liquid_gauge', label: 'Liquid Gauge', family: 'wow', icon: <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M4 14c2-1 4 1 6 0s4-1 6 0 4 1 4 0v8H4z" fill="currentColor" opacity=".55"/></svg> },
];

const PALETTE_KEYS = Object.keys(CHART_PALETTES);

/* ── Shared inline styles ── */
const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: TOKENS.bg.surface,
  border: `1px solid ${TOKENS.border.default}`,
  borderRadius: TOKENS.radius.sm,
  color: TOKENS.text.primary,
  fontSize: '14px',
  outline: 'none',
  transition: TOKENS.transition,
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: TOKENS.text.secondary,
  marginBottom: '6px',
};

const sectionStyle = {
  padding: '16px 0',
  borderBottom: `1px solid ${TOKENS.border.default}`,
};

/* ── Component ── */
export default function TileEditor({ tile, dashboardId, onSave, onClose, onRefresh, onDelete, customMetrics = [], connId = null }) {
  // Local editing state
  const [title, setTitle] = useState(tile.title || '');
  const [subtitle, setSubtitle] = useState(tile.subtitle || '');
  const [chartType, setChartType] = useState(tile.chartType || 'bar');
  const [selectedMeasure, setSelectedMeasure] = useState(tile.selectedMeasure || '');
  const [activeMeasures, setActiveMeasures] = useState(
    tile.activeMeasures?.length ? tile.activeMeasures : [...(tile.columns || [])]
  );
  const [seriesTypes, setSeriesTypes] = useState(tile.visualConfig?.seriesTypes || {});
  const [sql, setSql] = useState(tile.sql || '');
  const [palette, setPalette] = useState(tile.palette || 'default');
  const [dateStart, setDateStart] = useState(tile.filters?.dateStart || '');
  const [dateEnd, setDateEnd] = useState(tile.filters?.dateEnd || '');
  const [whereClause, setWhereClause] = useState(tile.filters?.where || '');
  const [annotations, setAnnotations] = useState(tile.annotations || []);
  const [newNote, setNewNote] = useState('');
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [dataSources, setDataSources] = useState(tile.dataSources || []);
  const [blendConfig, setBlendConfig] = useState(tile.blendConfig || { joinKey: '', enabled: false });
  const [blendOpen, setBlendOpen] = useState((tile.dataSources || []).length > 0);
  const [parameters, setParameters] = useState(tile.parameters || []);

  // Schema columns + field classification
  const [schemaColumns, setSchemaColumns] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState('');
  const [loadingColumns, setLoadingColumns] = useState(new Set());
  const [fieldClassifications, setFieldClassifications] = useState(() =>
    classifyColumns(tile.columns || [], tile.rows || [], tile.fieldClassifications || {})
  );

  // Fetch schema columns on mount
  useEffect(() => {
    if (!connId) return;
    let cancelled = false;
    setSchemaLoading(true);
    api.getTables(connId).then(res => {
      if (cancelled) return;
      const cols = [];
      const seen = new Set();
      for (const table of (res?.tables || [])) {
        for (const col of (table.columns || [])) {
          const name = typeof col === 'string' ? col : col.name || col.column_name || '';
          if (name && !seen.has(name)) {
            seen.add(name);
            cols.push({ name, table: table.name, type: typeof col === 'object' ? (col.type || col.data_type || '') : '' });
          }
        }
        if (cols.length >= 200) break; // FM-1: cap at 200 columns
      }
      setSchemaColumns(cols);
      // Re-classify with schema type info
      const schemaNames = cols.map(c => c.name);
      const allCols = [...new Set([...(tile.columns || []), ...schemaNames])];
      setFieldClassifications(prev => classifyColumns(allCols, tile.rows || [], { ...prev, ...(tile.fieldClassifications || {}) }));
    }).catch(() => {}).finally(() => { if (!cancelled) setSchemaLoading(false); });
    return () => { cancelled = true; };
  }, [connId]);

  const vc = tile.visualConfig || {};
  const [activeTab, setActiveTab] = useState('data');

  // Typography
  const [titleFontSize, setTitleFontSize] = useState(vc.typography?.titleFontSize ?? null);
  const [titleFontWeight, setTitleFontWeight] = useState(vc.typography?.titleFontWeight ?? null);
  const [titleColor, setTitleColor] = useState(vc.typography?.titleColor ?? null);
  const [titleAlign, setTitleAlign] = useState(vc.typography?.titleAlign ?? null);
  const [subtitleFontSize, setSubtitleFontSize] = useState(vc.typography?.subtitleFontSize ?? null);
  const [subtitleColor, setSubtitleColor] = useState(vc.typography?.subtitleColor ?? null);

  // Axis
  const [axisXLabel, setAxisXLabel] = useState(vc.axis?.xLabel ?? '');
  const [axisYLabel, setAxisYLabel] = useState(vc.axis?.yLabel ?? '');
  const [tickFormat, setTickFormat] = useState(vc.axis?.tickFormat ?? 'auto');
  const [xLabelRotation, setXLabelRotation] = useState(vc.axis?.xLabelRotation ?? 0);

  // Legend
  const [legendShow, setLegendShow] = useState(vc.legend?.show ?? null);
  const [legendPosition, setLegendPosition] = useState(vc.legend?.position ?? null);
  const [legendFontSize, setLegendFontSize] = useState(vc.legend?.fontSize ?? 12);
  const [legendColor, setLegendColor] = useState(vc.legend?.color ?? null);

  // Grid
  const [gridShow, setGridShow] = useState(vc.grid?.show ?? null);
  const [gridColor, setGridColor] = useState(vc.grid?.color ?? null);
  const [gridStyle, setGridStyle] = useState(vc.grid?.style ?? null);

  // Data labels
  const [dataLabelsShow, setDataLabelsShow] = useState(vc.dataLabels?.show ?? false);
  const [dataLabelsFormat, setDataLabelsFormat] = useState(vc.dataLabels?.format ?? 'auto');
  const [dataLabelsPosition, setDataLabelsPosition] = useState(vc.dataLabels?.position ?? 'top');

  // Tooltip
  const [tooltipShow, setTooltipShow] = useState(vc.tooltip?.show ?? true);
  const [tooltipTemplate, setTooltipTemplate] = useState(vc.tooltip?.template ?? '');

  // Reference lines
  const [referenceLines, setReferenceLines] = useState(vc.referenceLines ?? []);

  // Sort
  const [sortField, setSortField] = useState(vc.sort?.field ?? null);
  const [sortOrder, setSortOrder] = useState(vc.sort?.order ?? 'desc');
  const [customOrder, setCustomOrder] = useState(vc.sort?.customOrder ?? []);
  const [sortLimit, setSortLimit] = useState(vc.sort?.limit ?? null);

  // Colors
  const [colorMode, setColorMode] = useState(vc.colors?.mode ?? 'inherit');
  const [colorPalette, setColorPalette] = useState(vc.colors?.palette ?? null);
  // Pre-populate measureColors for every column so the color picker display
  // always matches what the chart will render (avoids palette index mismatch
  // between TileEditor's all-column index vs chart's numeric-only index).
  const [measureColors, setMeasureColors] = useState(() => {
    const existing = vc.colors?.measureColors ?? {};
    const pal = CHART_PALETTES[vc.colors?.palette || tile.palette || 'default'] || CHART_PALETTES.default;
    const seeded = { ...existing };
    (tile.columns || []).forEach((col, idx) => {
      if (!seeded[col]) seeded[col] = pal[idx % pal.length];
    });
    return seeded;
  });
  const [categoryColors, setCategoryColors] = useState(vc.colors?.categoryColors ?? {});
  const [colorRules, setColorRules] = useState(vc.colors?.rules ?? []);

  // Tile style
  const [tileBg, setTileBg] = useState(vc.style?.background ?? null);
  const [tileBorderColor, setTileBorderColor] = useState(vc.style?.borderColor ?? null);
  const [tileBorderWidth, setTileBorderWidth] = useState(vc.style?.borderWidth ?? null);
  const [tileRadius, setTileRadius] = useState(vc.style?.radius ?? null);
  const [tilePadding, setTilePadding] = useState(vc.style?.padding ?? null);
  const [tileShadow, setTileShadow] = useState(vc.style?.shadow ?? false);

  const baseColumns = tile.columns || [];
  const metricNames = (customMetrics || []).map(m => m.name).filter(n => n && !baseColumns.includes(n));
  const schemaNames = schemaColumns.map(c => c.name).filter(n => !baseColumns.includes(n) && !metricNames.includes(n));
  const allColumns = [...baseColumns, ...metricNames, ...schemaNames];
  const columns = allColumns; // backward compat alias

  // Split by classification
  const dimensionCols = allColumns.filter(c => fieldClassifications[c] === 'dimension' && !metricNames.includes(c));
  const measureCols = allColumns.filter(c => fieldClassifications[c] === 'measure' || metricNames.includes(c));

  // Filtered by search
  const filteredDimensions = schemaSearch
    ? dimensionCols.filter(c => c.toLowerCase().includes(schemaSearch.toLowerCase()))
    : dimensionCols;
  const filteredMeasures = schemaSearch
    ? measureCols.filter(c => c.toLowerCase().includes(schemaSearch.toLowerCase()))
    : measureCols;

  // Derive unique category values from the label column (first column) for per-value color control
  const categoryValues = (() => {
    if (!tile.rows?.length || !baseColumns.length) return [];
    const labelCol = baseColumns[0];
    const seen = new Set();
    const values = [];
    for (const row of tile.rows) {
      const v = Array.isArray(row) ? row[0] : row[labelCol];
      const s = String(v ?? '');
      if (s && !seen.has(s)) { seen.add(s); values.push(s); }
    }
    return values.slice(0, 50); // cap for sanity
  })();

  /* ── Handlers ── */
  const toggleMeasure = useCallback((col) => {
    setActiveMeasures((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }, []);

  const toggleClassification = useCallback((col) => {
    setFieldClassifications(prev => ({
      ...prev,
      [col]: prev[col] === 'measure' ? 'dimension' : 'measure',
    }));
  }, []);

  const handleSchemaColumnAdd = useCallback(async (colName) => {
    // If column is already in tile data, just toggle it normally
    if (baseColumns.includes(colName)) {
      toggleMeasure(colName);
      return;
    }

    // Column not in current data — need SQL regen
    if (!connId || !sql) {
      // No connection or SQL — just add to active measures visually
      toggleMeasure(colName);
      return;
    }

    setLoadingColumns(prev => new Set(prev).add(colName));
    try {
      const result = await api.generateColumnSQL(connId, sql, [colName]);
      if (result.error === 'complex_sql') {
        // Show prompt to use agent
        setQueryError('Complex SQL — use the Agent Panel to add columns to this query.');
        return;
      }
      if (result.error) {
        setQueryError(result.message || 'Failed to generate SQL');
        return;
      }
      // Update SQL and persist tile with new SQL
      setSql(result.sql);
      try {
        await api.updateTile(dashboardId, tile.id, { sql: result.sql });
        const refreshResult = await api.refreshTile(dashboardId, tile.id, connId);
        if (refreshResult?.columns) {
          tile.columns = refreshResult.columns;
          tile.rows = refreshResult.rows || [];
        }
        toggleMeasure(colName);
        setQueryError('');
      } catch (refreshErr) {
        setQueryError('Query ran but failed: ' + (refreshErr.message || '').slice(0, 100));
      }
    } catch (err) {
      setQueryError('Failed to add column: ' + (err.message || '').slice(0, 100));
    } finally {
      setLoadingColumns(prev => { const s = new Set(prev); s.delete(colName); return s; });
    }
  }, [connId, sql, dashboardId, tile, baseColumns, toggleMeasure]);

  const handleRunQuery = useCallback(async () => {
    setQueryRunning(true);
    setQueryError('');
    try {
      await api.refreshTile(dashboardId, tile.id);
      onRefresh(tile.id, null, null);
    } catch (err) {
      setQueryError(err.message || 'Query execution failed');
    } finally {
      setQueryRunning(false);
    }
  }, [dashboardId, tile.id, onRefresh]);

  const handleAddNote = useCallback(async () => {
    const text = newNote.trim();
    if (!text) return;
    try {
      await api.addTileAnnotation(dashboardId, tile.id, text, 'User');
      setAnnotations((prev) => [...prev, { text, authorName: 'User', createdAt: new Date().toISOString() }]);
      setNewNote('');
    } catch {
      /* silently fail */
    }
  }, [dashboardId, tile.id, newNote]);

  // Merge formatting section: keep existing values when new value is null/undefined
  const mergeSection = useCallback((existing, updates) => {
    if (!existing && !updates) return {};
    if (!existing) return updates;
    if (!updates) return existing;
    const result = { ...existing };
    for (const [k, v] of Object.entries(updates)) {
      if (v !== null && v !== undefined) {
        result[k] = v;
      }
      // If v is null/undefined, keep existing[k] (don't overwrite)
    }
    return result;
  }, []);

  const handleSave = useCallback(() => {
    const existingVC = tile.visualConfig || {};
    const updated = {
      ...tile,
      title, subtitle, chartType, selectedMeasure, activeMeasures,
      fieldClassifications,
      sql, palette, filters: { dateStart, dateEnd, where: whereClause },
      annotations, dataSources, blendConfig, parameters,
      visualConfig: {
        typography: mergeSection(existingVC.typography, {
          titleFontSize, titleFontWeight, titleColor,
          subtitleFontSize, subtitleColor, titleAlign,
          axisFontSize: existingVC.typography?.axisFontSize ?? null,
        }),
        axis: mergeSection(existingVC.axis, {
          xLabel: axisXLabel, yLabel: axisYLabel, tickFormat, xLabelRotation,
          showXLabel: true, showYLabel: true,
          tickDecimals: existingVC.axis?.tickDecimals ?? null,
        }),
        legend: mergeSection(existingVC.legend, { show: legendShow, position: legendPosition, fontSize: legendFontSize, color: legendColor }),
        grid: mergeSection(existingVC.grid, { show: gridShow, color: gridColor, style: gridStyle }),
        dataLabels: mergeSection(existingVC.dataLabels, {
          show: dataLabelsShow, format: dataLabelsFormat, position: dataLabelsPosition,
        }),
        tooltip: { show: tooltipShow, template: tooltipTemplate },
        referenceLines,
        sort: { field: sortField, order: sortOrder, customOrder, limit: sortLimit },
        colors: { mode: colorMode, palette: colorPalette, measureColors, categoryColors, rules: colorRules },
        seriesTypes: Object.keys(seriesTypes).length > 0 ? seriesTypes : undefined,
        style: mergeSection(existingVC.style, {
          background: tileBg, borderColor: tileBorderColor,
          borderWidth: tileBorderWidth, radius: tileRadius,
          padding: tilePadding, shadow: tileShadow,
        }),
      },
    };
    onSave(updated);
  }, [tile, title, subtitle, chartType, selectedMeasure, activeMeasures, fieldClassifications, sql, palette, dateStart, dateEnd, whereClause, annotations, dataSources, blendConfig, parameters,
      titleFontSize, titleFontWeight, titleColor, titleAlign, subtitleFontSize, subtitleColor,
      axisXLabel, axisYLabel, tickFormat, xLabelRotation,
      legendShow, legendPosition, legendFontSize, legendColor, gridShow, gridColor, gridStyle,
      dataLabelsShow, dataLabelsFormat, dataLabelsPosition,
      tooltipShow, tooltipTemplate, referenceLines,
      sortField, sortOrder, customOrder, sortLimit, colorMode, colorPalette, measureColors, categoryColors, colorRules,
      tileBg, tileBorderColor, tileBorderWidth, tileRadius, tilePadding, tileShadow, seriesTypes, mergeSection, onSave]);

  return (
    <AnimatePresence>
      {/* Overlay */}
      <motion.div
        key="tile-editor-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'var(--modal-overlay)',
          zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* Modal */}
        <motion.div
          key="tile-editor-modal"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 680, maxHeight: '85vh',
            background: TOKENS.bg.elevated,
            border: `1px solid ${TOKENS.border.default}`,
            borderRadius: TOKENS.radius.xl,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* ── Header ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${TOKENS.border.default}`,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '16px', fontWeight: 600, color: TOKENS.text.primary }}>Edit Tile</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} style={{
                padding: '6px 16px', borderRadius: TOKENS.radius.sm,
                background: TOKENS.accent, color: '#fff', border: 'none',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>Save Changes</button>
              <button onClick={onClose} style={{
                padding: '6px 12px', borderRadius: TOKENS.radius.sm,
                background: TOKENS.bg.surface, color: TOKENS.text.secondary,
                border: `1px solid ${TOKENS.border.default}`, fontSize: '13px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>

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

          {/* ── Scrollable content ── */}
          <div style={{ overflowY: 'auto', padding: '0 20px 20px', flex: 1 }}>

            {/* ════════════════════════ DATA TAB ════════════════════════ */}
            {activeTab === 'data' && (<>

            {/* 1. Title & Subtitle */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Tile title" />
              <label style={{ ...labelStyle, marginTop: 12 }}>Subtitle</label>
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={inputStyle} placeholder="Optional subtitle" />
            </div>

            {/* 2. Chart Type Selector — Standard + Dense families */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Chart Type</label>
              {['standard', 'dense', 'wow'].map((familyKey) => {
                const familyCharts = CHART_TYPES.filter((ct) => (ct.family || 'standard') === familyKey);
                if (familyCharts.length === 0) return null;
                const familyHeadings = {
                  dense: 'Dense · Tableau-class',
                  wow: 'Wow Factor · 3D + Geo + Premium',
                };
                const heading = familyHeadings[familyKey];
                return (
                  <div key={familyKey} style={{ marginTop: familyKey === 'standard' ? 0 : 14 }}>
                    {heading && (
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '0.22em',
                          textTransform: 'uppercase',
                          color: TOKENS.text.muted,
                          marginBottom: 8,
                          fontFamily: TOKENS.fontDisplay,
                        }}
                      >
                        {heading}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {familyCharts.map((ct) => (
                        <button
                          key={ct.key}
                          onClick={() => setChartType(ct.key)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            padding: '10px 4px', borderRadius: TOKENS.radius.md,
                            background: chartType === ct.key ? TOKENS.accentGlow : TOKENS.bg.surface,
                            border: chartType === ct.key
                              ? `2px solid ${TOKENS.accent}`
                              : `1px solid ${TOKENS.border.default}`,
                            color: chartType === ct.key ? TOKENS.accentLight : TOKENS.text.secondary,
                            cursor: 'pointer', fontSize: '11px', fontWeight: 500,
                            transition: TOKENS.transition,
                          }}
                        >
                          {ct.icon}
                          {ct.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 3. Dimensions & Measures */}
            <div style={sectionStyle}>
              {/* Search filter for large schemas */}
              {allColumns.length > 10 && (
                <div style={{ marginBottom: 10 }}>
                  <input
                    value={schemaSearch}
                    onChange={(e) => setSchemaSearch(e.target.value)}
                    placeholder="Search fields..."
                    style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
                  />
                </div>
              )}
              {schemaLoading && (
                <div style={{ fontSize: 11, color: TOKENS.text.muted, marginBottom: 8 }}>Loading schema columns...</div>
              )}

              {/* Dimensions */}
              <label style={labelStyle}>Dimensions</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                {filteredDimensions.length === 0 && (
                  <span style={{ fontSize: 12, color: TOKENS.text.muted }}>No dimensions{schemaSearch ? ' matching filter' : ''}</span>
                )}
                {filteredDimensions.map((col) => (
                  <div key={col} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: TOKENS.text.primary }}>
                    {loadingColumns.has(col) ? (
                      <span style={{ fontSize: 10, color: TOKENS.text.muted, width: 16, textAlign: 'center' }}>...</span>
                    ) : (
                      <input type="checkbox" checked={activeMeasures.includes(col)} onChange={() => handleSchemaColumnAdd(col)}
                        style={{ accentColor: TOKENS.accent, cursor: 'pointer' }} />
                    )}
                    <button onClick={() => toggleClassification(col)} title="Toggle dimension/measure"
                      style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, cursor: 'pointer',
                        border: `1px solid ${TOKENS.border.default}`, background: 'rgba(59,130,246,0.1)',
                        color: '#60a5fa',
                      }}>D</button>
                    <span style={{ cursor: 'pointer', opacity: loadingColumns.has(col) ? 0.5 : 1 }} onClick={() => !loadingColumns.has(col) && handleSchemaColumnAdd(col)}>{col}</span>
                    {!baseColumns.includes(col) && !metricNames.includes(col) && (
                      <span style={{ fontSize: 9, color: TOKENS.text.muted, fontStyle: 'italic' }}>schema</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Measures */}
              <label style={labelStyle}>Measures</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredMeasures.length === 0 && (
                  <span style={{ fontSize: 12, color: TOKENS.text.muted }}>No measures{schemaSearch ? ' matching filter' : ''}</span>
                )}
                {filteredMeasures.map((col, idx) => (
                  <div key={col} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: TOKENS.text.primary }}>
                    {loadingColumns.has(col) ? (
                      <span style={{ fontSize: 10, color: TOKENS.text.muted, width: 16, textAlign: 'center' }}>...</span>
                    ) : (
                      <input type="checkbox" checked={activeMeasures.includes(col)} onChange={() => handleSchemaColumnAdd(col)}
                        style={{ accentColor: TOKENS.accent, cursor: 'pointer' }} />
                    )}
                    <ColorPickerButton size={18}
                      color={measureColors[col] || CHART_PALETTES[colorPalette || palette || 'default'][idx % 8]}
                      onChange={(c) => setMeasureColors((prev) => ({ ...prev, [col]: c }))} />
                    {/* Per-measure chart type */}
                    <select
                      value={seriesTypes[col] || ''}
                      onChange={(e) => setSeriesTypes((prev) => ({ ...prev, [col]: e.target.value || undefined }))}
                      title="Chart type for this measure"
                      style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 4, cursor: 'pointer',
                        border: `1px solid ${TOKENS.border.default}`, background: TOKENS.bg.surface,
                        color: seriesTypes[col] ? TOKENS.accent : TOKENS.text.muted,
                        outline: 'none', width: 42,
                      }}
                    >
                      <option value="">Auto</option>
                      <option value="bar">Bar</option>
                      <option value="line">Line</option>
                      <option value="area">Area</option>
                    </select>
                    {!metricNames.includes(col) ? (
                      <button onClick={() => toggleClassification(col)} title="Toggle dimension/measure"
                        style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, cursor: 'pointer',
                          border: `1px solid ${TOKENS.border.default}`, background: 'rgba(34,197,94,0.1)',
                          color: '#4ade80',
                        }}>M</button>
                    ) : (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.15)', padding: '1px 5px', borderRadius: 4 }}>fx</span>
                    )}
                    <span style={{ cursor: 'pointer', opacity: loadingColumns.has(col) ? 0.5 : 1 }} onClick={() => !loadingColumns.has(col) && handleSchemaColumnAdd(col)}>{col}</span>
                    {!baseColumns.includes(col) && !metricNames.includes(col) && (
                      <span style={{ fontSize: 9, color: TOKENS.text.muted, fontStyle: 'italic' }}>schema</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Primary Measure — only shows measures */}
              {measureCols.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Primary Measure</label>
                  <select value={selectedMeasure} onChange={(e) => setSelectedMeasure(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">-- select --</option>
                    {measureCols.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 3b. Category Colors — per-value color control */}
            {categoryValues.length > 0 && (
              <div style={sectionStyle}>
                <label style={labelStyle}>Category Colors</label>
                <div style={{ fontSize: 11, color: TOKENS.text.muted, marginBottom: 8 }}>
                  Color each {baseColumns[0] || 'category'} value individually
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {categoryValues.map((val, vi) => {
                    const pal = CHART_PALETTES[colorPalette || palette || 'default'] || CHART_PALETTES.default;
                    return (
                      <div key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TOKENS.text.primary }}>
                        <ColorPickerButton
                          size={20}
                          color={categoryColors[val] || pal[vi % pal.length]}
                          onChange={(c) => setCategoryColors((prev) => ({ ...prev, [val]: c }))}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Filters */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Filters</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Start Date</label>
                  <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>End Date</label>
                  <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <label style={{ ...labelStyle, marginTop: 12 }}>Custom WHERE clause</label>
              <input
                value={whereClause}
                onChange={(e) => setWhereClause(e.target.value)}
                style={inputStyle}
                placeholder='e.g. status = "active"'
              />
            </div>

            {/* 4b. What-If Parameters */}
            <div style={sectionStyle}>
              <label style={labelStyle}>What-If Parameters</label>
              <p style={{ fontSize: 11, color: TOKENS.text.muted, marginBottom: 8 }}>
                Add numeric sliders bound to SQL placeholders ($1, $2 or :param).
              </p>
              {parameters.map((p, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <input value={p.name} onChange={e => {
                    const next = [...parameters]; next[idx] = { ...next[idx], name: e.target.value }; setParameters(next);
                  }} style={{ ...inputStyle, fontSize: 12 }} placeholder="param name" />
                  <input type="number" value={p.min ?? 0} onChange={e => {
                    const next = [...parameters]; next[idx] = { ...next[idx], min: Number(e.target.value) }; setParameters(next);
                  }} style={{ ...inputStyle, fontSize: 12 }} placeholder="min" />
                  <input type="number" value={p.max ?? 100} onChange={e => {
                    const next = [...parameters]; next[idx] = { ...next[idx], max: Number(e.target.value) }; setParameters(next);
                  }} style={{ ...inputStyle, fontSize: 12 }} placeholder="max" />
                  <input type="number" value={p.step ?? 1} onChange={e => {
                    const next = [...parameters]; next[idx] = { ...next[idx], step: Number(e.target.value) }; setParameters(next);
                  }} style={{ ...inputStyle, fontSize: 12 }} placeholder="step" />
                  <button onClick={() => setParameters(parameters.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', color: TOKENS.danger, cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ))}
              <button onClick={() => setParameters([...parameters, { name: '', min: 0, max: 100, step: 1, value: 50 }])}
                style={{ fontSize: 11, color: TOKENS.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                + Add parameter
              </button>
            </div>

            {/* 5. SQL Editor */}
            <div style={sectionStyle}>
              <label style={labelStyle}>SQL Editor</label>
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                rows={6}
                style={{
                  ...inputStyle,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '13px',
                  background: TOKENS.bg.deep,
                  resize: 'vertical',
                  lineHeight: 1.5,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <button
                  onClick={handleRunQuery}
                  disabled={queryRunning}
                  style={{
                    padding: '6px 14px', borderRadius: TOKENS.radius.sm,
                    background: TOKENS.success, color: '#fff', border: 'none',
                    fontSize: '13px', fontWeight: 600, cursor: queryRunning ? 'wait' : 'pointer',
                    opacity: queryRunning ? 0.6 : 1,
                  }}
                >
                  {queryRunning ? 'Running...' : 'Run Query'}
                </button>
                {queryError && (
                  <span style={{ fontSize: '12px', color: TOKENS.danger }}>{queryError}</span>
                )}
              </div>
            </div>

            {/* 5b. Data Blending */}
            <div style={sectionStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setBlendOpen(o => !o)}>
                <label style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>Data Blending</label>
                <svg style={{ width: 14, height: 14, color: TOKENS.text.muted, transform: blendOpen ? 'rotate(0)' : 'rotate(-90deg)', transition: `transform ${TOKENS.transition}` }}
                  xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
                </svg>
              </div>
              {blendOpen && (
                <div style={{ marginTop: 10 }}>
                  <DataSourceEditor
                    dataSources={dataSources}
                    blendConfig={blendConfig}
                    primaryColumns={baseColumns}
                    dashboardId={dashboardId}
                    tileId={tile.id}
                    connId={null}
                    onChange={setDataSources}
                    onBlendConfigChange={setBlendConfig}
                  />
                </div>
              )}
            </div>

            {/* 7. Tile Notes */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Tile Notes</label>
              {annotations.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {annotations.map((a, i) => (
                    <div key={i} style={{
                      padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                      background: TOKENS.bg.surface, fontSize: '13px',
                      color: TOKENS.text.primary,
                    }}>
                      <span style={{ color: TOKENS.text.muted, fontSize: '11px' }}>
                        {a.authorName || 'User'}
                        {a.createdAt && ` - ${new Date(a.createdAt).toLocaleDateString()}`}
                      </span>
                      <div style={{ marginTop: 2 }}>{a.text}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Add a note..."
                />
                <button onClick={handleAddNote} style={{
                  padding: '6px 14px', borderRadius: TOKENS.radius.sm,
                  background: TOKENS.bg.surface, color: TOKENS.text.primary,
                  border: `1px solid ${TOKENS.border.default}`,
                  fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>Add</button>
              </div>
            </div>

            {/* 8. Delete */}
            <div style={{ paddingTop: 16 }}>
              <button
                onClick={() => onDelete(tile.id)}
                style={{
                  width: '100%', padding: '10px',
                  borderRadius: TOKENS.radius.sm,
                  background: 'rgba(239,68,68,0.1)',
                  border: `1px solid ${TOKENS.danger}`,
                  color: TOKENS.danger,
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  transition: TOKENS.transition,
                }}
              >
                Delete Tile
              </button>
            </div>

            </>)}

            {/* ════════════════════════ FORMAT TAB ════════════════════════ */}
            {activeTab === 'format' && (<>

            {/* Typography */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Typography</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Title Font Size (12-32)</label>
                  <input type="number" min={12} max={32} value={titleFontSize ?? ''} onChange={(e) => setTitleFontSize(e.target.value ? Number(e.target.value) : null)} style={inputStyle} placeholder={String(FORMATTING_DEFAULTS.typography.titleFontSize)} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Title Font Weight</label>
                  <select value={titleFontWeight ?? ''} onChange={(e) => setTitleFontWeight(e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Default</option>
                    <option value="400">400 (Normal)</option>
                    <option value="600">600 (Semi-Bold)</option>
                    <option value="700">700 (Bold)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Title Color</label>
                  <ColorPickerButton color={titleColor} onChange={setTitleColor} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Title Alignment</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['left', 'center', 'right'].map((a) => (
                      <button key={a} onClick={() => setTitleAlign(a)} style={{
                        padding: '5px 12px', fontSize: 11, borderRadius: TOKENS.radius.sm, cursor: 'pointer',
                        background: titleAlign === a ? TOKENS.accentGlow : TOKENS.bg.surface,
                        border: titleAlign === a ? `1px solid ${TOKENS.accent}` : `1px solid ${TOKENS.border.default}`,
                        color: titleAlign === a ? TOKENS.accentLight : TOKENS.text.secondary,
                        transition: TOKENS.transition, textTransform: 'capitalize',
                      }}>{a}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Subtitle Font Size (10-20)</label>
                  <input type="number" min={10} max={20} value={subtitleFontSize ?? ''} onChange={(e) => setSubtitleFontSize(e.target.value ? Number(e.target.value) : null)} style={inputStyle} placeholder={String(FORMATTING_DEFAULTS.typography.subtitleFontSize)} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Subtitle Color</label>
                  <ColorPickerButton color={subtitleColor} onChange={setSubtitleColor} />
                </div>
              </div>
            </div>

            {/* Axis Labels */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Axis Labels</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>X-Axis Label</label>
                  <input value={axisXLabel} onChange={(e) => setAxisXLabel(e.target.value)} style={inputStyle} placeholder="Auto" />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Y-Axis Label</label>
                  <input value={axisYLabel} onChange={(e) => setAxisYLabel(e.target.value)} style={inputStyle} placeholder="Auto" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Tick Format</label>
                  <select value={tickFormat} onChange={(e) => setTickFormat(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="auto">Auto</option>
                    <option value="integer">Integer</option>
                    <option value="decimal">Decimal</option>
                    <option value="currency">Currency</option>
                    <option value="percent">Percent</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>X-Axis Rotation</label>
                  <select value={xLabelRotation} onChange={(e) => setXLabelRotation(Number(e.target.value))} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value={0}>0</option>
                    <option value={45}>45</option>
                    <option value={90}>90</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Legend</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: TOKENS.text.primary, cursor: 'pointer' }}>
                  <input type="checkbox" checked={legendShow ?? true} onChange={(e) => setLegendShow(e.target.checked)} style={{ accentColor: TOKENS.accent }} />
                  Show Legend
                </label>
              </div>
              {(legendShow ?? true) && (
                <>
                <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                  {['top', 'bottom', 'left', 'right'].map((pos) => (
                    <button key={pos} onClick={() => setLegendPosition(pos)} style={{
                      padding: '5px 12px', fontSize: 11, borderRadius: TOKENS.radius.sm, cursor: 'pointer',
                      background: legendPosition === pos ? TOKENS.accentGlow : TOKENS.bg.surface,
                      border: legendPosition === pos ? `1px solid ${TOKENS.accent}` : `1px solid ${TOKENS.border.default}`,
                      color: legendPosition === pos ? TOKENS.accentLight : TOKENS.text.secondary,
                      transition: TOKENS.transition, textTransform: 'capitalize',
                    }}>{pos}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Font Size</label>
                    <input type="number" min={8} max={20} value={legendFontSize} onChange={(e) => setLegendFontSize(Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Color</label>
                    <ColorPickerButton color={legendColor || TOKENS.text.secondary} onChange={setLegendColor} />
                  </div>
                </div>
                </>
              )}
            </div>

            {/* Grid Lines */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Grid Lines</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: TOKENS.text.primary, cursor: 'pointer' }}>
                  <input type="checkbox" checked={gridShow ?? true} onChange={(e) => setGridShow(e.target.checked)} style={{ accentColor: TOKENS.accent }} />
                  Show Grid
                </label>
              </div>
              {(gridShow ?? true) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Color</label>
                    <ColorPickerButton color={gridColor} onChange={setGridColor} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Style</label>
                    <select value={gridStyle ?? 'solid'} onChange={(e) => setGridStyle(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Data Labels */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Data Labels</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: TOKENS.text.primary, cursor: 'pointer' }}>
                  <input type="checkbox" checked={dataLabelsShow} onChange={(e) => setDataLabelsShow(e.target.checked)} style={{ accentColor: TOKENS.accent }} />
                  Show Data Labels
                </label>
              </div>
              {dataLabelsShow && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Format</label>
                    <select value={dataLabelsFormat} onChange={(e) => setDataLabelsFormat(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="auto">Auto</option>
                      <option value="integer">Integer</option>
                      <option value="decimal">Decimal</option>
                      <option value="currency">Currency</option>
                      <option value="percent">Percent</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Position</label>
                    <select value={dataLabelsPosition} onChange={(e) => setDataLabelsPosition(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="top">Top</option>
                      <option value="inside">Inside (bars)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Tooltip */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Tooltip</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: TOKENS.text.primary, cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={tooltipShow} onChange={(e) => setTooltipShow(e.target.checked)} style={{ accentColor: TOKENS.accent }} />
                Show Tooltip
              </label>
              {tooltipShow && (
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Template</label>
                  <textarea
                    value={tooltipTemplate}
                    onChange={(e) => setTooltipTemplate(e.target.value)}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', fontSize: '13px' }}
                    placeholder='Use {fieldName} for values, e.g. Revenue: {revenue}'
                  />
                </div>
              )}
            </div>

            {/* Reference Lines */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Reference Lines</label>
              <ReferenceLineEditor lines={referenceLines} onChange={setReferenceLines} />
            </div>

            {/* Sort & Order */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Sort & Order</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Sort By</label>
                  <select value={sortField ?? ''} onChange={(e) => setSortField(e.target.value || null)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">None</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Order</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['asc', 'desc', 'custom'].map((o) => (
                      <button key={o} onClick={() => {
                        setSortOrder(o);
                        if (o === 'custom' && customOrder.length === 0 && categoryValues.length > 0) {
                          setCustomOrder([...categoryValues]);
                        }
                      }} style={{
                        padding: '5px 10px', fontSize: 11, borderRadius: TOKENS.radius.sm, cursor: 'pointer',
                        background: sortOrder === o ? TOKENS.accentGlow : TOKENS.bg.surface,
                        border: sortOrder === o ? `1px solid ${TOKENS.accent}` : `1px solid ${TOKENS.border.default}`,
                        color: sortOrder === o ? TOKENS.accentLight : TOKENS.text.secondary,
                        transition: TOKENS.transition, textTransform: 'uppercase',
                      }}>{o}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Top N Limit */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ ...labelStyle, fontSize: '10px', marginBottom: 0, whiteSpace: 'nowrap' }}>Show Top</label>
                <input
                  type="number" min={1} max={1000}
                  value={sortLimit ?? ''}
                  onChange={(e) => setSortLimit(e.target.value ? Number(e.target.value) : null)}
                  placeholder="All"
                  style={{ ...inputStyle, width: 70 }}
                />
                {sortLimit && (
                  <button onClick={() => setSortLimit(null)} style={{
                    padding: '3px 8px', fontSize: 10, borderRadius: TOKENS.radius.sm, cursor: 'pointer',
                    background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`,
                    color: TOKENS.text.secondary, transition: TOKENS.transition,
                  }}>Clear</button>
                )}
              </div>

              {/* Custom Manual Order */}
              {sortOrder === 'custom' && categoryValues.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Drag Order</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(customOrder.length > 0 ? customOrder : categoryValues).map((val, idx, arr) => (
                      <div key={val} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 8px', borderRadius: 6,
                        background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`,
                        fontSize: 12, color: TOKENS.text.primary,
                      }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                        <button
                          disabled={idx === 0}
                          onClick={() => {
                            const next = [...arr];
                            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                            setCustomOrder(next);
                          }}
                          style={{
                            background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                            color: idx === 0 ? TOKENS.text.muted : TOKENS.text.secondary, fontSize: 14, padding: '0 2px',
                            opacity: idx === 0 ? 0.3 : 1,
                          }}
                        >▲</button>
                        <button
                          disabled={idx === arr.length - 1}
                          onClick={() => {
                            const next = [...arr];
                            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                            setCustomOrder(next);
                          }}
                          style={{
                            background: 'none', border: 'none', cursor: idx === arr.length - 1 ? 'default' : 'pointer',
                            color: idx === arr.length - 1 ? TOKENS.text.muted : TOKENS.text.secondary, fontSize: 14, padding: '0 2px',
                            opacity: idx === arr.length - 1 ? 0.3 : 1,
                          }}
                        >▼</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            </>)}

            {/* ════════════════════════ COLORS TAB ════════════════════════ */}
            {activeTab === 'colors' && (<>

            {/* Color Mode Selector */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Color Mode</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {['inherit', 'palette', 'custom'].map((m) => (
                  <button key={m} onClick={() => setColorMode(m)} style={{
                    padding: '6px 16px', fontSize: 12, borderRadius: TOKENS.radius.sm, cursor: 'pointer',
                    background: colorMode === m ? TOKENS.accentGlow : TOKENS.bg.surface,
                    border: colorMode === m ? `1px solid ${TOKENS.accent}` : `1px solid ${TOKENS.border.default}`,
                    color: colorMode === m ? TOKENS.accentLight : TOKENS.text.secondary,
                    transition: TOKENS.transition, textTransform: 'capitalize', fontWeight: colorMode === m ? 600 : 400,
                  }}>{m}</button>
                ))}
              </div>
            </div>

            {/* Inherit mode */}
            {colorMode === 'inherit' && (
              <div style={sectionStyle}>
                <span style={{ fontSize: 13, color: TOKENS.text.secondary }}>Using dashboard theme palette</span>
                <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
                  {CHART_PALETTES[palette || 'default'].map((c, i) => (
                    <span key={i} style={{
                      width: 22, height: 22, borderRadius: '4px',
                      background: c, display: 'inline-block',
                    }} />
                  ))}
                </div>
              </div>
            )}

            {/* Palette mode */}
            {colorMode === 'palette' && (
              <div style={sectionStyle}>
                <label style={labelStyle}>Color Palette</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {PALETTE_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => { setPalette(key); setColorPalette(key); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                        background: (colorPalette || palette) === key ? TOKENS.accentGlow : 'transparent',
                        border: (colorPalette || palette) === key
                          ? `2px solid ${TOKENS.accent}`
                          : `1px solid ${TOKENS.border.default}`,
                        cursor: 'pointer', transition: TOKENS.transition,
                      }}
                    >
                      <span style={{ fontSize: '12px', color: TOKENS.text.secondary, minWidth: 70, textAlign: 'left', textTransform: 'capitalize' }}>
                        {key}
                      </span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {CHART_PALETTES[key].map((c, i) => (
                          <span key={i} style={{
                            width: 18, height: 18, borderRadius: '4px',
                            background: c, display: 'inline-block',
                          }} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom mode */}
            {colorMode === 'custom' && (
              <div style={sectionStyle}>
                <label style={labelStyle}>Per-Measure Colors</label>
                {columns.length === 0 && (
                  <span style={{ fontSize: 13, color: TOKENS.text.muted }}>No columns available</span>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {columns.map((col) => (
                    <div key={col} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ColorPickerButton
                        color={measureColors[col] || CHART_PALETTES['default'][columns.indexOf(col) % 8]}
                        onChange={(c) => setMeasureColors((prev) => ({ ...prev, [col]: c }))}
                      />
                      <span style={{ fontSize: 13, color: TOKENS.text.primary }}>{col}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conditional Rules */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Conditional Color Rules</label>
              <ConditionalRuleBuilder
                rules={colorRules}
                measures={columns}
                onChange={setColorRules}
              />
            </div>

            </>)}

            {/* ════════════════════════ STYLE TAB ════════════════════════ */}
            {activeTab === 'style' && (<>

            {/* Background */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Background</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ColorPickerButton color={tileBg} onChange={setTileBg} />
                <button onClick={() => setTileBg(null)} style={{
                  padding: '4px 10px', fontSize: 11, borderRadius: TOKENS.radius.sm,
                  background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`,
                  color: TOKENS.text.secondary, cursor: 'pointer', transition: TOKENS.transition,
                }}>Reset</button>
                <span style={{ fontSize: 12, color: TOKENS.text.muted }}>{tileBg || 'Theme default'}</span>
              </div>
            </div>

            {/* Border */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Border</label>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Color</label>
                  <ColorPickerButton color={tileBorderColor} onChange={setTileBorderColor} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, fontSize: '10px' }}>Width (0-5px)</label>
                  <input type="number" min={0} max={5} value={tileBorderWidth ?? ''} onChange={(e) => setTileBorderWidth(e.target.value ? Number(e.target.value) : null)} style={inputStyle} placeholder="Default" />
                </div>
              </div>
              <span style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 6, display: 'block' }}>Border style is solid by default</span>
            </div>

            {/* Corner Radius */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Corner Radius</label>
              <input type="number" min={0} max={24} value={tileRadius ?? ''} onChange={(e) => setTileRadius(e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, maxWidth: 140 }} placeholder="Default" />
              <span style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 4, display: 'block' }}>0-24px</span>
            </div>

            {/* Inner Padding */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Inner Padding</label>
              <input type="number" min={8} max={32} value={tilePadding ?? ''} onChange={(e) => setTilePadding(e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, maxWidth: 140 }} placeholder="Default" />
              <span style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 4, display: 'block' }}>8-32px</span>
            </div>

            {/* Shadow */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Shadow</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: TOKENS.text.primary, cursor: 'pointer' }}>
                <input type="checkbox" checked={tileShadow} onChange={(e) => setTileShadow(e.target.checked)} style={{ accentColor: TOKENS.accent }} />
                Enable drop shadow
              </label>
            </div>

            </>)}

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

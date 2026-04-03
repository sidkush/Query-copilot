import { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { TOKENS } from './tokens';
import ResultsChart from '../ResultsChart';
import KPICard from './KPICard';
import { blendSources } from '../../lib/dataBlender';
import { mergeFormatting } from '../../lib/formatUtils';
import { api } from '../../api';

const CanvasChart = lazy(() => import('./CanvasChart'));

const CHART_TYPES = [
  { id: 'bar',           label: 'Bar',          icon: 'M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z' },
  { id: 'line',          label: 'Line',         icon: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17' },
  { id: 'area',          label: 'Area',         icon: 'M3 3v16h18M7 16l4-8 4 5 3-3' },
  { id: 'pie',           label: 'Pie',          icon: 'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z' },
  { id: 'donut',         label: 'Donut',        icon: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 4a6 6 0 1 1 0 12A6 6 0 0 1 12 6z' },
  { id: 'table',         label: 'Table',        icon: 'M3 3h18v18H3V3zm0 6h18M3 15h18M9 3v18' },
  { id: 'kpi',           label: 'KPI',          icon: 'M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16' },
  { id: 'stacked_bar',   label: 'Stacked',      icon: 'M8 2v8h8V2H8zm0 10v8h8v-8H8zM2 6v4h4V6H2zm0 8v4h4v-4H2zm14-8v4h4V6h-4zm0 8v4h4v-4h-4z' },
  { id: 'horizontal_bar',label: 'H-Bar',        icon: 'M3 12h18M3 6h12M3 18h15' },
  { id: 'scatter',       label: 'Scatter',      icon: 'M3 3l7.07 14.14L12 3l4.95 11.05L19 3l-2 18H5L3 3z' },
];

export default function TileWrapper({ tile, index, onEdit, onEditSQL, onChangeChart, onRemove, onRefresh, customMetrics = [], onSelect, selectedTileId, crossFilter, onCrossFilterClick, dashboardId, themeConfig }) {
  const [chartPickerOpen, setChartPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const pickerRef = useRef(null);
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

  const handleAISuggest = useCallback(async () => {
    if (!tile?.columns?.length || !tile?.rows?.length) return;
    setAiLoading(true);
    try {
      const result = await api.aiSuggestChart(
        dashboardId, tile.id, tile.columns, tile.rows.slice(0, 5), tile.question
      );
      setAiSuggestion(result);
      // Auto-apply: change chart type
      if (result?.recommendedType && result.recommendedType !== tile.chartType) {
        onChangeChart?.(tile.id, result.recommendedType);
      }
    } catch (err) {
      console.error('AI suggest failed:', err);
    } finally {
      setAiLoading(false);
    }
  }, [tile, dashboardId, onChangeChart]);

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

  if (tile?.chartType === 'kpi') {
    return <KPICard tile={tile} index={index} onEdit={onEdit} />;
  }

  return (
    <div className="relative overflow-visible group h-full flex flex-col"
      onClick={() => onSelect?.()}
      style={{
        background: fmt.style.background || themeConfig?.background?.tile || TOKENS.bg.elevated,
        border: `${fmt.style.borderWidth ?? 1}px ${fmt.style.borderStyle || 'solid'} ${fmt.style.borderColor || TOKENS.border.default}`,
        borderRadius: `${fmt.style.radius ?? themeConfig?.spacing?.tileRadius ?? 14}px`,
        boxShadow: fmt.style.shadow ? `0 4px ${fmt.style.shadowBlur ?? 8}px rgba(0,0,0,0.4)` : 'none',
        outline: selectedTileId === tile?.id ? '2px solid #2563EB' : 'none',
        outlineOffset: selectedTileId === tile?.id ? '2px' : '0',
        transition: `all ${TOKENS.transition}`,
      }}>
      {/* Drag handle */}
      <div className="absolute top-3.5 left-2 w-3 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 cursor-grab"
        style={{ transition: `opacity ${TOKENS.transition}` }}>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-[14px] pt-[10px]">
        <div className="flex items-center gap-2">
          <span style={{
            fontSize: `${fmt.typography.titleFontSize}px`,
            fontWeight: fmt.typography.titleFontWeight,
            color: fmt.typography.titleColor,
          }}>{tile?.title || 'Untitled'}</span>
          {tile?.subtitle && <span style={{
            fontSize: `${fmt.typography.subtitleFontSize}px`,
            color: fmt.typography.subtitleColor,
          }}>{tile.subtitle}</span>}
          {aiSuggestion?.reasoning && (
            <span style={{ fontSize: 10, color: TOKENS.accentLight, marginTop: 2, display: 'block', fontStyle: 'italic' }}>
              AI: {aiSuggestion.reasoning}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100" style={{ transition: `opacity ${TOKENS.transition}` }}>
          {commentCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer"
              style={{ color: TOKENS.text.muted, background: TOKENS.bg.surface }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[11px] h-[11px]"><path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293c.121-.233.362-.393.642-.413a41.1 41.1 0 003.55-.414c1.437-.232 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2z" clipRule="evenodd"/></svg>
              {commentCount}
            </span>
          )}
          {[
            { title: refreshing ? 'Refreshing...' : 'Refresh',  icon: 'M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903H14.25a.75.75 0 000 1.5h6a.75.75 0 00.75-.75v-6a.75.75 0 00-1.5 0v2.553l-1.256-1.255a9 9 0 00-14.3 5.842.75.75 0 001.506-.429zM15.245 9.941a7.5 7.5 0 01-12.548 3.364L.794 11.402H5.75a.75.75 0 000-1.5h-6a.75.75 0 00-.75.75v6a.75.75 0 001.5 0v-2.553l1.256 1.255a9 9 0 0014.3-5.842.75.75 0 00-1.506.429z', onClick: handleRefresh },
            { title: aiLoading ? 'Thinking...' : 'AI Suggest', icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z', onClick: handleAISuggest },
            { title: 'Edit SQL', icon: 'M6.28 5.22a.75.75 0 010 1.06L2.56 10l3.72 3.72a.75.75 0 01-1.06 1.06L.97 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0zm7.44 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L17.44 10l-3.72-3.72a.75.75 0 010-1.06zM11.377 2.011a.75.75 0 01.612.867l-2.5 14.5a.75.75 0 01-1.478-.255l2.5-14.5a.75.75 0 01.866-.612z', onClick: onEditSQL },
            { title: 'Edit',     icon: 'M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z', onClick: () => onEdit?.(tile) },
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
      {/* Chart body */}
      <div className="flex-1 min-h-[80px] overflow-hidden"
        style={{ padding: `4px ${fmt.style.padding ?? 12}px ${fmt.style.padding ?? 8}px` }}>
        {chartRows?.length > 0 ? (
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
              key={`${tile.id}-${tile.chartType}-${tile.palette}-${tile.dataSources?.length || 0}-${JSON.stringify(tile.visualConfig?.colors?.measureColors || {})}-${themeConfig?.palette || ''}`}
              columns={chartColumns} rows={chartRows} embedded
              defaultChartType={tile.chartType} defaultPalette={tile.palette}
              defaultMeasure={tile.selectedMeasure} defaultMeasures={tile.activeMeasures}
              customMetrics={customMetrics}
              formatting={tile.visualConfig}
              dashboardPalette={themeConfig?.palette || 'default'}
              crossFilter={crossFilter}
              onCrossFilterClick={onCrossFilterClick} />
          )
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

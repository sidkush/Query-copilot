import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS, CHART_PALETTES } from './tokens';
import { api } from '../../api';

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
  { key: 'horizontal_bar', label: 'H-Bar',          icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="14" height="4" rx="1" fill="currentColor"/><rect x="3" y="10" width="10" height="4" rx="1" fill="currentColor" opacity=".7"/><rect x="3" y="17" width="16" height="4" rx="1" fill="currentColor" opacity=".5"/></svg> },
  { key: 'radar',          label: 'Radar',          icon: <svg viewBox="0 0 24 24" width="20" height="20"><polygon points="12,3 20,9 18,18 6,18 4,9" fill="currentColor" opacity=".2" stroke="currentColor" strokeWidth="1.5"/><polygon points="12,7 17,11 15,16 9,16 7,11" fill="currentColor" opacity=".4"/></svg> },
  { key: 'scatter',        label: 'Scatter',        icon: <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="6" cy="16" r="2" fill="currentColor"/><circle cx="10" cy="10" r="2" fill="currentColor" opacity=".7"/><circle cx="16" cy="14" r="2" fill="currentColor" opacity=".5"/><circle cx="18" cy="6" r="2" fill="currentColor"/></svg> },
  { key: 'treemap',        label: 'Treemap',        icon: <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor"/><rect x="15" y="3" width="6" height="10" rx="1" fill="currentColor" opacity=".6"/><rect x="3" y="15" width="6" height="6" rx="1" fill="currentColor" opacity=".4"/><rect x="11" y="15" width="10" height="6" rx="1" fill="currentColor" opacity=".7"/></svg> },
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
export default function TileEditor({ tile, dashboardId, onSave, onClose, onRefresh, onDelete }) {
  // Local editing state
  const [title, setTitle] = useState(tile.title || '');
  const [subtitle, setSubtitle] = useState(tile.subtitle || '');
  const [chartType, setChartType] = useState(tile.chartType || 'bar');
  const [selectedMeasure, setSelectedMeasure] = useState(tile.selectedMeasure || '');
  const [activeMeasures, setActiveMeasures] = useState(tile.activeMeasures || []);
  const [sql, setSql] = useState(tile.sql || '');
  const [palette, setPalette] = useState(tile.palette || 'default');
  const [dateStart, setDateStart] = useState(tile.filters?.dateStart || '');
  const [dateEnd, setDateEnd] = useState(tile.filters?.dateEnd || '');
  const [whereClause, setWhereClause] = useState(tile.filters?.where || '');
  const [annotations, setAnnotations] = useState(tile.annotations || []);
  const [newNote, setNewNote] = useState('');
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryError, setQueryError] = useState('');

  const columns = tile.columns || [];

  /* ── Handlers ── */
  const toggleMeasure = useCallback((col) => {
    setActiveMeasures((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }, []);

  const handleRunQuery = useCallback(async () => {
    setQueryRunning(true);
    setQueryError('');
    try {
      const result = await api.refreshTile(dashboardId, tile.id);
      onRefresh(tile.id, { columns: result.columns, rows: result.rows });
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

  const handleSave = useCallback(() => {
    const updated = {
      ...tile,
      title,
      subtitle,
      chartType,
      selectedMeasure,
      activeMeasures,
      sql,
      palette,
      filters: { dateStart, dateEnd, where: whereClause },
      annotations,
    };
    onSave(updated);
  }, [tile, title, subtitle, chartType, selectedMeasure, activeMeasures, sql, palette, dateStart, dateEnd, whereClause, annotations, onSave]);

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
          background: 'rgba(0,0,0,0.60)',
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
            width: '100%', maxWidth: 600, maxHeight: '85vh',
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

          {/* ── Scrollable content ── */}
          <div style={{ overflowY: 'auto', padding: '0 20px 20px', flex: 1 }}>

            {/* 1. Title & Subtitle */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Tile title" />
              <label style={{ ...labelStyle, marginTop: 12 }}>Subtitle</label>
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={inputStyle} placeholder="Optional subtitle" />
            </div>

            {/* 2. Chart Type Selector */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Chart Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {CHART_TYPES.map((ct) => (
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

            {/* 3. Measures */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Measures</label>
              {columns.length === 0 && (
                <span style={{ fontSize: '13px', color: TOKENS.text.muted }}>No columns available</span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {columns.map((col) => (
                  <label key={col} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: '13px', color: TOKENS.text.primary, cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={activeMeasures.includes(col)}
                      onChange={() => toggleMeasure(col)}
                      style={{ accentColor: TOKENS.accent }}
                    />
                    {col}
                  </label>
                ))}
              </div>
              {columns.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Primary Measure</label>
                  <select
                    value={selectedMeasure}
                    onChange={(e) => setSelectedMeasure(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">-- select --</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

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

            {/* 6. Palette Picker */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Color Palette</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PALETTE_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setPalette(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                      background: palette === key ? TOKENS.accentGlow : 'transparent',
                      border: palette === key
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

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

import { useState, useEffect, useRef } from 'react';
import { TOKENS } from './tokens';
import { api } from '../../api';

const RANGES = [
  { id: 'all_time', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This Week' },
  { id: 'last_week', label: 'Last Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'last_quarter', label: 'Last Quarter' },
  { id: 'this_year', label: 'This Year' },
  { id: 'last_year', label: 'Last Year' },
  { id: 'custom', label: 'Custom Range' },
];

const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];

const inputStyle = {
  background: TOKENS.bg.elevated,
  border: `1px solid ${TOKENS.border.default}`,
  borderRadius: TOKENS.radius.md,
  padding: '5px 10px',
  color: TOKENS.text.primary,
  fontSize: 13,
  outline: 'none',
  transition: `border-color ${TOKENS.transition}`,
};

const DATE_PATTERNS = /^(date|created_at|updated_at|order_date|timestamp|time|datetime|purchased_at|shipped_at|delivered_at|cancelled_at|modified_at|event_date|start_date|end_date|due_date|birth_date|registered_at|signup_date|last_login|trip_date|started_at|ended_at)/i;

function detectDateColumns(dashboard) {
  if (!dashboard?.tabs) return [];
  const found = new Set();
  for (const tab of dashboard.tabs) {
    for (const sec of tab.sections || []) {
      for (const tile of sec.tiles || []) {
        for (const col of tile.columns || []) {
          if (DATE_PATTERNS.test(col)) found.add(col);
        }
        if (tile.sql) {
          const matches = tile.sql.match(/\b\w*\.?(created_at|updated_at|order_date|date|timestamp|datetime|purchased_at|shipped_at|trip_date|started_at|ended_at|start_date|end_date)\b/gi);
          if (matches) {
            for (const m of matches) {
              const col = m.includes('.') ? m.split('.').pop() : m;
              found.add(col);
            }
          }
        }
      }
    }
  }
  return [...found].sort();
}

// Migrate old single-dateColumn format to dateFilters array
function migrateFilters(globalFilters) {
  if (globalFilters?.dateFilters) {
    return { dateFilters: globalFilters.dateFilters, fields: globalFilters.fields || [] };
  }
  // Old format: { dateColumn, range, dateStart, dateEnd, fields }
  const dateFilters = [];
  if (globalFilters?.dateColumn) {
    dateFilters.push({
      id: 'df_migrated',
      dateColumn: globalFilters.dateColumn,
      range: globalFilters.range || 'all_time',
      dateStart: globalFilters.dateStart || '',
      dateEnd: globalFilters.dateEnd || '',
    });
  }
  return { dateFilters, fields: globalFilters?.fields || [] };
}

let _nextId = 1;
function genId() { return `df_${Date.now()}_${_nextId++}`; }

export default function GlobalFilterBar({ globalFilters, connId, onChange, dashboard }) {
  const migrated = migrateFilters(globalFilters);
  const [dateFilters, setDateFilters] = useState(migrated.dateFilters);
  const [fields, setFields] = useState(migrated.fields);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [allColumns, setAllColumns] = useState([]);
  const [colSearch, setColSearch] = useState('');
  const [loadingCols, setLoadingCols] = useState(false);
  const [newFilter, setNewFilter] = useState({ column: '', operator: '=', value: '', tileIds: [] });
  const [editingFilterIdx, setEditingFilterIdx] = useState(null);
  const pickerRef = useRef(null);
  const [dirty, setDirty] = useState(false);

  // Sync local state when globalFilters prop changes
  useEffect(() => {
    const m = migrateFilters(globalFilters);
    setDateFilters(m.dateFilters);
    setFields(m.fields);
    setDirty(false);
  }, [globalFilters]);

  const allTiles = (() => {
    if (!dashboard?.tabs) return [];
    const tiles = [];
    for (const tab of dashboard.tabs) {
      for (const sec of tab.sections || []) {
        for (const tile of sec.tiles || []) {
          tiles.push({ id: tile.id, title: tile.title || tile.id });
        }
      }
    }
    return tiles;
  })();

  const detectedDateCols = dashboard ? detectDateColumns(dashboard) : [];

  // Load schema columns when picker opens
  useEffect(() => {
    if (!showFieldPicker || allColumns.length > 0) return;
    setLoadingCols(true);
    api.getTables(connId)
      .then(res => {
        const cols = [];
        (res?.tables || []).forEach(tbl => {
          (tbl.columns || []).forEach(col => {
            const name = typeof col === 'string' ? col : col.name || col.column_name || String(col);
            if (name && !cols.includes(name)) cols.push(name);
          });
        });
        setAllColumns(cols.sort());
      })
      .catch(() => {})
      .finally(() => setLoadingCols(false));
  }, [showFieldPicker, connId, allColumns.length]);

  // Close picker on outside click
  useEffect(() => {
    if (!showFieldPicker) return;
    const handle = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowFieldPicker(false);
        setEditingFilterIdx(null);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showFieldPicker]);

  const filteredCols = allColumns.filter(c => c.toLowerCase().includes(colSearch.toLowerCase()));

  // ── Date filter CRUD ──
  const addDateFilter = () => {
    setDateFilters(prev => [...prev, { id: genId(), dateColumn: '', range: 'all_time', dateStart: '', dateEnd: '' }]);
    setDirty(true);
  };

  const updateDateFilter = (id, updates) => {
    setDateFilters(prev => prev.map(df => df.id === id ? { ...df, ...updates } : df));
    setDirty(true);
  };

  const removeDateFilter = (id) => {
    setDateFilters(prev => prev.filter(df => df.id !== id));
    setDirty(true);
  };

  // ── Field filter CRUD ──
  const addField = () => {
    if (!newFilter.column || !newFilter.value) return;
    const filter = { column: newFilter.column, operator: newFilter.operator, value: newFilter.value };
    if (newFilter.tileIds.length > 0 && newFilter.tileIds.length < allTiles.length) {
      filter.tileIds = newFilter.tileIds;
    }
    if (editingFilterIdx !== null) {
      setFields(prev => prev.map((f, i) => i === editingFilterIdx ? filter : f));
    } else {
      setFields(prev => [...prev, filter]);
    }
    setNewFilter({ column: '', operator: '=', value: '', tileIds: [] });
    setEditingFilterIdx(null);
    setShowFieldPicker(false);
    setDirty(true);
  };

  const removeField = (idx) => {
    const updatedFields = fields.filter((_, i) => i !== idx);
    setFields(updatedFields);
    onChange({ dateFilters, fields: updatedFields });
    setDirty(false);
  };

  const applyFilters = () => {
    onChange({ dateFilters: dateFilters.filter(df => df.dateColumn), fields });
    setDirty(false);
  };

  const hasActiveFilters = dateFilters.some(df => df.dateColumn) || fields.length > 0;

  return (
    <div style={{
      margin: '0 24px 14px',
      padding: '10px 16px',
      borderRadius: 18,
      background: 'var(--glass-bg-card)',
      border: `1px solid ${TOKENS.border.default}`,
      boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 6px 20px -8px rgba(0,0,0,0.18)',
      backdropFilter: 'blur(14px) saturate(1.3)',
      WebkitBackdropFilter: 'blur(14px) saturate(1.3)',
    }}>
      <div className="flex flex-col gap-2">
        {/* ── Date Filters Section ── */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-shrink-0 pt-1">
            {hasActiveFilters && <span className="eyebrow-dot" style={{ background: TOKENS.accent }} aria-hidden="true" />}
            <span className="eyebrow" style={{ color: hasActiveFilters ? TOKENS.accent : TOKENS.text.muted }}>
              Filters
            </span>
          </div>

          <div className="w-px h-6 flex-shrink-0 mt-0.5" style={{ background: TOKENS.border.default }} />

          {/* Date filter rows */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            {dateFilters.map((df) => (
              <div key={df.id} className="flex items-center gap-2 flex-wrap">
                {/* Date column */}
                <div className="relative flex-shrink-0">
                  {detectedDateCols.length > 0 ? (
                    <select
                      style={{ ...inputStyle, width: 150, paddingRight: 28, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
                      value={df.dateColumn}
                      onChange={e => updateDateFilter(df.id, { dateColumn: e.target.value })}
                      aria-label="Date filter column"
                    >
                      <option value="">Date column…</option>
                      {detectedDateCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input
                      style={{ ...inputStyle, width: 130 }}
                      placeholder="Date column…"
                      value={df.dateColumn}
                      onChange={e => updateDateFilter(df.id, { dateColumn: e.target.value })}
                      aria-label="Date filter column"
                    />
                  )}
                  {detectedDateCols.length > 0 && (
                    <svg className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: TOKENS.text.muted }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  )}
                </div>

                {/* Range */}
                <div className="relative flex-shrink-0">
                  <select
                    style={{ ...inputStyle, paddingRight: 28, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
                    value={df.range}
                    onChange={e => updateDateFilter(df.id, { range: e.target.value })}
                    aria-label="Date range"
                  >
                    {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  <svg className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: TOKENS.text.muted }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>

                {/* Custom dates */}
                {df.range === 'custom' && (
                  <>
                    <input type="date" style={inputStyle}
                      value={df.dateStart} onChange={e => updateDateFilter(df.id, { dateStart: e.target.value })}
                      aria-label="Date range start" />
                    <span style={{ color: TOKENS.text.muted, fontSize: 12 }}>to</span>
                    <input type="date" style={inputStyle}
                      value={df.dateEnd} onChange={e => updateDateFilter(df.id, { dateEnd: e.target.value })}
                      aria-label="Date range end" />
                  </>
                )}

                {/* Remove date filter */}
                <button onClick={() => removeDateFilter(df.id)}
                  className="flex items-center justify-center w-6 h-6 rounded-md cursor-pointer"
                  style={{ color: TOKENS.text.muted, border: `1px solid ${TOKENS.border.default}`, background: 'transparent', fontSize: 14, lineHeight: 1 }}
                  title="Remove date filter"
                  aria-label="Remove date filter">
                  ×
                </button>
              </div>
            ))}

          </div>
        </div>

        {/* ── Field Filters Row ── */}
        {(fields.length > 0 || showFieldPicker) && (
          <div className="flex items-center gap-2 flex-wrap pl-[72px]">
            {fields.map((f, i) => {
              const editFilter = () => {
                setNewFilter({ column: f.column, operator: f.operator, value: f.value, tileIds: f.tileIds || [] });
                setColSearch(f.column);
                setEditingFilterIdx(i);
                setShowFieldPicker(true);
              };
              return (
                <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs flex-shrink-0 cursor-pointer"
                  style={{ background: TOKENS.accentGlow, border: `1px solid ${TOKENS.accent}30`, color: TOKENS.text.primary }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit filter: ${f.column} ${f.operator} ${f.value}`}
                  onClick={editFilter}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editFilter(); } }}
                >
                  <span style={{ color: TOKENS.accentLight }}>{f.column}</span>
                  <span style={{ color: TOKENS.text.muted }}>{f.operator}</span>
                  <span>{f.value}</span>
                  {f.tileIds && f.tileIds.length > 0 && (
                    <span style={{ color: TOKENS.text.muted, fontSize: 10, marginLeft: 2 }}
                      title={f.tileIds.map(tid => allTiles.find(t => t.id === tid)?.title || tid).join(', ')}>
                      ({f.tileIds.length} tiles)
                    </span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); removeField(i); }}
                    aria-label={`Remove ${f.column} filter`}
                    style={{ color: TOKENS.text.muted, marginLeft: 2, cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Action buttons row ── */}
        <div className="flex items-center gap-2 pl-[72px]">
          {/* Add date filter button */}
          <button onClick={addDateFilter}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg cursor-pointer text-xs"
            style={{
              background: TOKENS.bg.elevated,
              border: `1px solid ${TOKENS.border.default}`,
              color: TOKENS.text.secondary,
              transition: `all ${TOKENS.transition}`,
            }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Date Filter
          </button>

          {/* Add field filter button + popover */}
          <div className="relative flex-shrink-0" ref={pickerRef}>
            <button
              onClick={() => { setShowFieldPicker(o => !o); setEditingFilterIdx(null); setNewFilter({ column: '', operator: '=', value: '', tileIds: [] }); setColSearch(''); }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg cursor-pointer text-xs"
              style={{
                background: showFieldPicker ? TOKENS.accentGlow : TOKENS.bg.elevated,
                border: `1px solid ${showFieldPicker ? TOKENS.accent : TOKENS.border.default}`,
                color: showFieldPicker ? TOKENS.accent : TOKENS.text.secondary,
                transition: `all ${TOKENS.transition}`,
              }}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Field Filter
            </button>

            {showFieldPicker && (
              <div className="absolute left-0 top-9 z-50 rounded-xl shadow-2xl p-3"
                style={{
                  background: TOKENS.bg.elevated,
                  border: `1px solid ${TOKENS.border.hover}`,
                  width: 280,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: TOKENS.text.muted }}>{editingFilterIdx !== null ? 'Edit Filter' : 'Add Field Filter'}</p>

                <input
                  style={{ ...inputStyle, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
                  placeholder="Search columns…"
                  value={colSearch}
                  onChange={e => { setColSearch(e.target.value); setNewFilter(f => ({ ...f, column: e.target.value })); }}
                  autoFocus
                  aria-label="Search columns"
                />

                {loadingCols ? (
                  <p style={{ color: TOKENS.text.muted, fontSize: 12, textAlign: 'center', padding: '8px 0' }}>Loading schema…</p>
                ) : filteredCols.length > 0 ? (
                  <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 8 }}>
                    {filteredCols.slice(0, 50).map(col => (
                      <button key={col}
                        onClick={() => { setNewFilter(f => ({ ...f, column: col })); setColSearch(col); }}
                        className="w-full text-left px-2 py-1 rounded-md text-xs cursor-pointer"
                        style={{
                          color: newFilter.column === col ? TOKENS.accent : TOKENS.text.secondary,
                          background: newFilter.column === col ? TOKENS.accentGlow : 'transparent',
                        }}>
                        {col}
                      </button>
                    ))}
                  </div>
                ) : allColumns.length === 0 ? (
                  <p style={{ color: TOKENS.text.muted, fontSize: 12, marginBottom: 8 }}>
                    Connect a database to see columns, or type a column name above.
                  </p>
                ) : null}

                <div className="flex gap-2 mb-2">
                  <select
                    style={{ ...inputStyle, flex: '0 0 80px', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}
                    value={newFilter.operator}
                    onChange={e => setNewFilter(f => ({ ...f, operator: e.target.value }))}
                    aria-label="Filter operator">
                    {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Value…"
                    value={newFilter.value}
                    onChange={e => setNewFilter(f => ({ ...f, value: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addField()}
                    aria-label="Filter value"
                  />
                </div>

                {allTiles.length > 1 && (
                  <div style={{ marginBottom: 8 }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                      style={{ color: TOKENS.text.muted }}>Apply to tiles</p>
                    <div style={{ maxHeight: 100, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {allTiles.map(t => (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: TOKENS.text.secondary, cursor: 'pointer' }}>
                          <input type="checkbox"
                            checked={newFilter.tileIds.length === 0 || newFilter.tileIds.includes(t.id)}
                            onChange={(e) => {
                              setNewFilter(f => {
                                if (f.tileIds.length === 0) {
                                  return { ...f, tileIds: allTiles.filter(x => x.id !== t.id).map(x => x.id) };
                                }
                                if (e.target.checked) {
                                  const next = [...f.tileIds, t.id];
                                  return { ...f, tileIds: next.length >= allTiles.length ? [] : next };
                                }
                                return { ...f, tileIds: f.tileIds.filter(id => id !== t.id) };
                              });
                            }}
                            style={{ accentColor: TOKENS.accent, width: 12, height: 12 }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        </label>
                      ))}
                    </div>
                    <span style={{ fontSize: 9, color: TOKENS.text.muted }}>
                      {newFilter.tileIds.length === 0 ? 'All tiles' : `${newFilter.tileIds.length} of ${allTiles.length} tiles`}
                    </span>
                  </div>
                )}

                <button
                  onClick={addField}
                  disabled={!newFilter.column || !newFilter.value}
                  style={{
                    width: '100%',
                    background: (!newFilter.column || !newFilter.value) ? TOKENS.bg.surface : 'var(--accent)',
                    color: (!newFilter.column || !newFilter.value) ? TOKENS.text.muted : 'var(--text-on-accent)',
                    border: 'none',
                    borderRadius: TOKENS.radius.md,
                    padding: '7px 0',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: (!newFilter.column || !newFilter.value) ? 'not-allowed' : 'pointer',
                    transition: `all ${TOKENS.transition}`,
                  }}>
                  {editingFilterIdx !== null ? 'Update Filter' : 'Add Filter'}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1" />

          {dirty && (
            <button onClick={applyFilters}
              style={{
                background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none',
                borderRadius: TOKENS.radius.md, padding: '5px 16px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              }}>
              Apply Filters
            </button>
          )}

          {hasActiveFilters && (
            <button
              onClick={() => {
                setDateFilters([]);
                setFields([]);
                setDirty(false);
                onChange({ dateFilters: [], fields: [] });
              }}
              style={{
                background: 'transparent', color: TOKENS.text.muted,
                border: `1px solid ${TOKENS.border.default}`,
                borderRadius: TOKENS.radius.md, padding: '5px 12px',
                fontSize: 12, cursor: 'pointer', flexShrink: 0,
              }}>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

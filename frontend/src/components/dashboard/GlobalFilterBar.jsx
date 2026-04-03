import { useState, useEffect, useRef } from 'react';
import { TOKENS } from './tokens';
import { api } from '../../api';

const RANGES = [
  { id: 'all_time',     label: 'All Time' },
  { id: 'today',        label: 'Today' },
  { id: 'yesterday',    label: 'Yesterday' },
  { id: 'this_week',    label: 'This Week' },
  { id: 'last_week',    label: 'Last Week' },
  { id: 'this_month',   label: 'This Month' },
  { id: 'last_month',   label: 'Last Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'last_quarter', label: 'Last Quarter' },
  { id: 'this_year',    label: 'This Year' },
  { id: 'last_year',    label: 'Last Year' },
  { id: 'custom',       label: 'Custom Range' },
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

export default function GlobalFilterBar({ globalFilters, connId, onChange }) {
  const [dateColumn, setDateColumn]   = useState(globalFilters?.dateColumn || '');
  const [range, setRange]             = useState(globalFilters?.range || 'all_time');
  const [dateStart, setDateStart]     = useState(globalFilters?.dateStart || '');
  const [dateEnd, setDateEnd]         = useState(globalFilters?.dateEnd || '');
  const [fields, setFields]           = useState(globalFilters?.fields || []);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [allColumns, setAllColumns]   = useState([]);
  const [colSearch, setColSearch]     = useState('');
  const [loadingCols, setLoadingCols] = useState(false);
  const [newFilter, setNewFilter]     = useState({ column: '', operator: '=', value: '' });
  const pickerRef = useRef(null);

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
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showFieldPicker]);

  const filteredCols = allColumns.filter(c => c.toLowerCase().includes(colSearch.toLowerCase()));

  const addField = () => {
    if (!newFilter.column || !newFilter.value) return;
    setFields(prev => [...prev, { ...newFilter }]);
    setNewFilter({ column: '', operator: '=', value: '' });
    setShowFieldPicker(false);
  };

  const removeField = (idx) => setFields(prev => prev.filter((_, i) => i !== idx));

  const handleApply = () => {
    onChange({ dateColumn, range, dateStart, dateEnd, fields });
  };

  const hasActiveFilters = dateColumn || fields.length > 0;

  return (
    <div style={{
      borderBottom: `1px solid ${TOKENS.border.default}`,
      background: TOKENS.bg.surface,
      padding: '8px 24px',
    }}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter icon + label */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <svg className="w-3.5 h-3.5" style={{ color: hasActiveFilters ? TOKENS.accent : TOKENS.text.muted }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-wider flex-shrink-0"
            style={{ color: hasActiveFilters ? TOKENS.accent : TOKENS.text.muted }}>
            Filters
          </span>
        </div>

        <div className="w-px h-4 flex-shrink-0" style={{ background: TOKENS.border.default }} />

        {/* Date column input with column picker */}
        <div className="relative flex-shrink-0">
          <input
            style={{ ...inputStyle, width: 130 }}
            placeholder="Date column…"
            value={dateColumn}
            onChange={e => setDateColumn(e.target.value)}
            onFocus={e => { e.target.style.borderColor = TOKENS.accent; }}
            onBlur={e => { e.target.style.borderColor = TOKENS.border.default; }}
            list="date-col-list"
          />
          {allColumns.length > 0 && (
            <datalist id="date-col-list">
              {allColumns.map(c => <option key={c} value={c} />)}
            </datalist>
          )}
        </div>

        {/* Range picker */}
        <div className="relative flex-shrink-0">
          <select
            style={{ ...inputStyle, paddingRight: 28, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
            value={range}
            onChange={e => setRange(e.target.value)}
          >
            {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <svg className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: TOKENS.text.muted }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>

        {/* Custom date range */}
        {range === 'custom' && (
          <>
            <input type="date" style={{ ...inputStyle, colorScheme: 'dark' }}
              value={dateStart} onChange={e => setDateStart(e.target.value)} />
            <span style={{ color: TOKENS.text.muted, fontSize: 12 }}>to</span>
            <input type="date" style={{ ...inputStyle, colorScheme: 'dark' }}
              value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
          </>
        )}

        {/* Active field filter chips */}
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs flex-shrink-0"
            style={{ background: TOKENS.accentGlow, border: `1px solid ${TOKENS.accent}30`, color: TOKENS.text.primary }}>
            <span style={{ color: TOKENS.accentLight }}>{f.column}</span>
            <span style={{ color: TOKENS.text.muted }}>{f.operator}</span>
            <span>{f.value}</span>
            <button onClick={() => removeField(i)} style={{ color: TOKENS.text.muted, marginLeft: 2, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        ))}

        {/* Add filter button + popover */}
        <div className="relative flex-shrink-0" ref={pickerRef}>
          <button
            onClick={() => setShowFieldPicker(o => !o)}
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
            Add Filter
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
                style={{ color: TOKENS.text.muted }}>Add Field Filter</p>

              {/* Column search */}
              <input
                style={{ ...inputStyle, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
                placeholder="Search columns…"
                value={colSearch}
                onChange={e => { setColSearch(e.target.value); setNewFilter(f => ({ ...f, column: e.target.value })); }}
                autoFocus
              />

              {/* Column list */}
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

              {/* Operator + value row */}
              <div className="flex gap-2 mb-2">
                <select
                  style={{ ...inputStyle, flex: '0 0 80px', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}
                  value={newFilter.operator}
                  onChange={e => setNewFilter(f => ({ ...f, operator: e.target.value }))}>
                  {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Value…"
                  value={newFilter.value}
                  onChange={e => setNewFilter(f => ({ ...f, value: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addField()}
                />
              </div>

              <button
                onClick={addField}
                disabled={!newFilter.column || !newFilter.value}
                style={{
                  width: '100%',
                  background: (!newFilter.column || !newFilter.value) ? TOKENS.bg.surface : TOKENS.accent,
                  color: (!newFilter.column || !newFilter.value) ? TOKENS.text.muted : '#fff',
                  border: 'none',
                  borderRadius: TOKENS.radius.md,
                  padding: '7px 0',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (!newFilter.column || !newFilter.value) ? 'not-allowed' : 'pointer',
                  transition: `all ${TOKENS.transition}`,
                }}>
                Add Filter
              </button>
            </div>
          )}
        </div>

        {/* Divider + Apply */}
        <div className="flex-1" />
        <button
          onClick={handleApply}
          style={{
            background: TOKENS.accent,
            color: '#fff',
            border: 'none',
            borderRadius: TOKENS.radius.md,
            padding: '5px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            transition: `opacity ${TOKENS.transition}`,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
          Apply
        </button>

        {hasActiveFilters && (
          <button
            onClick={() => {
              setDateColumn(''); setRange('all_time'); setDateStart(''); setDateEnd(''); setFields([]);
              onChange({ dateColumn: '', range: 'all_time', dateStart: '', dateEnd: '', fields: [] });
            }}
            style={{
              background: 'transparent',
              color: TOKENS.text.muted,
              border: `1px solid ${TOKENS.border.default}`,
              borderRadius: TOKENS.radius.md,
              padding: '5px 12px',
              fontSize: 12,
              cursor: 'pointer',
              flexShrink: 0,
            }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../../store';
import { api } from '../../../api';

const DRAWER_WIDTH = 480;
const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'underlying', label: 'Underlying' },
];

function rowsToCSV(columns, rows) {
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(escape).join(',');
  const body = rows.map((r) => r.map(escape).join(',')).join('\n');
  return `${head}\n${body}`;
}

// Single-state fetch result. status: 'idle' | 'loading' | 'ok' | 'error'.
const IDLE = { status: 'idle', columns: [], rows: [], error: null };

export default function ViewDataDrawer() {
  const drawer = useStore((s) => s.viewDataDrawer);
  const close = useStore((s) => s.closeViewDataDrawer);
  const [tab, setTab] = useState('summary');
  const [summary, setSummary] = useState(IDLE);
  const [underlying, setUnderlying] = useState(IDLE);
  // Track in-flight requests by a generation token so out-of-date responses
  // can be ignored without using effect cleanup (which would re-cancel on the
  // very setState that flips status to 'loading').
  const summaryGen = useRef(0);
  const underlyingGen = useRef(0);

  // Reset via render-time sync (React docs "adjusting state while rendering"
  // pattern, also used in DiffOnLoadBanner and useTimeAnimation in this repo).
  // Avoids react-hooks/set-state-in-effect on a close transition.
  // Refs must NOT be mutated during render; the next fetch effect bumps the
  // gen counter when it kicks off, which is sufficient invalidation.
  const [prevOpen, setPrevOpen] = useState(drawer.open);
  if (prevOpen !== drawer.open) {
    setPrevOpen(drawer.open);
    if (!drawer.open) {
      setSummary(IDLE);
      setUnderlying(IDLE);
      setTab('summary');
    }
  }

  useEffect(() => {
    if (!drawer.open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer.open, close]);

  // Treat fetch kickoff as a side-effect that subscribes to an external
  // resource. setState only fires from inside the promise callback (the
  // "subscribe + setState in callback" shape react-hooks/set-state-in-effect
  // expects). The 'idle' state itself implicitly means "not yet fetched";
  // render derives loading from (status === 'idle' || 'loading').
  useEffect(() => {
    if (!drawer.open || tab !== 'summary' || summary.status !== 'idle' || !drawer.sql) {
      return;
    }
    summaryGen.current += 1;
    const myGen = summaryGen.current;
    api
      .executeSQL(drawer.sql, 'view_data_summary', drawer.connId, null, null, null)
      .then((resp) => {
        if (myGen !== summaryGen.current) return;
        setSummary({
          status: 'ok',
          columns: Array.isArray(resp?.columns) ? resp.columns : [],
          rows: Array.isArray(resp?.rows) ? resp.rows : [],
          error: null,
        });
      })
      .catch((err) => {
        if (myGen !== summaryGen.current) return;
        setSummary({ status: 'error', columns: [], rows: [], error: err?.message || 'Summary fetch failed' });
      });
  }, [drawer.open, drawer.sql, drawer.connId, tab, summary.status]);

  useEffect(() => {
    if (!drawer.open || tab !== 'underlying' || underlying.status !== 'idle' || !drawer.sql) {
      return;
    }
    underlyingGen.current += 1;
    const myGen = underlyingGen.current;
    api
      .executeUnderlying({
        connId: drawer.connId,
        sql: drawer.sql,
        markSelection: drawer.markSelection || {},
      })
      .then((resp) => {
        if (myGen !== underlyingGen.current) return;
        setUnderlying({
          status: 'ok',
          columns: Array.isArray(resp?.columns) ? resp.columns : [],
          rows: Array.isArray(resp?.rows) ? resp.rows : [],
          error: null,
        });
      })
      .catch((err) => {
        if (myGen !== underlyingGen.current) return;
        setUnderlying({ status: 'error', columns: [], rows: [], error: err?.message || 'Underlying fetch failed' });
      });
  }, [drawer.open, drawer.sql, drawer.connId, drawer.markSelection, tab, underlying.status]);

  const active = tab === 'summary' ? summary : underlying;
  const columns = useMemo(() => active.columns || [], [active]);
  const rows = useMemo(() => active.rows || [], [active]);
  // 'idle' counts as loading because the fetch effect kicks off a request
  // immediately on mount/tab-switch and we never explicitly set a 'loading'
  // status inside the effect body (lint constraint).
  const loading = active.status === 'idle' || active.status === 'loading';
  const error = active.error;

  const handleExport = useMemo(
    () => () => {
      if (!columns.length) return;
      const csv = rowsToCSV(columns, rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `view-data-${tab}-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [columns, rows, tab],
  );

  if (!drawer.open) return null;

  return (
    <aside
      role="complementary"
      aria-label="View Data drawer"
      data-testid="view-data-drawer"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: DRAWER_WIDTH,
        zIndex: 8500,
        background: 'var(--surface-elevated, rgba(12,12,18,0.98))',
        borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text-primary, #e6e6ea)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
        <strong style={{ fontSize: 13 }}>View Data</strong>
        <button type="button" aria-label="Close" onClick={close} style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', fontSize: 16 }}>×</button>
      </header>
      <div role="tablist" style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: 0,
              cursor: 'pointer',
              color: 'inherit',
              background: tab === t.id ? 'rgba(255,255,255,0.12)' : 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleExport}
          disabled={!columns.length}
          style={{
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: 'inherit',
            cursor: columns.length ? 'pointer' : 'not-allowed',
          }}
        >
          Export CSV
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {loading && <div data-testid="view-data-loading">Loading…</div>}
        {error && <div role="alert" style={{ color: 'var(--danger, #f87171)' }}>{error}</div>}
        {!loading && !error && columns.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.12)', fontWeight: 600 }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {v == null ? '' : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}

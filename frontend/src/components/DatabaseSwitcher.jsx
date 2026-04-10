import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const DB_TYPE_LABELS = {
  postgresql: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MariaDB',
  sqlite: 'SQLite', mssql: 'SQL Server', cockroachdb: 'CockroachDB',
  snowflake: 'Snowflake', bigquery: 'BigQuery', redshift: 'Redshift',
  databricks: 'Databricks', clickhouse: 'ClickHouse', duckdb: 'DuckDB',
  trino: 'Trino', oracle: 'Oracle', 'sap hana': 'SAP HANA',
  'ibm db2': 'IBM Db2', supabase: 'Supabase',
};

const DB_COLORS = {
  postgresql: '#336791', mysql: '#4479A1', mariadb: '#C0765A',
  sqlite: '#003B57', mssql: '#CC2927', snowflake: '#29B5E8',
  bigquery: '#4285F4', redshift: '#8C4FFF', clickhouse: '#FFCC00',
  duckdb: '#FFC300', oracle: '#F80000', supabase: '#3ECF8E',
};

function StatusDot({ isLive }) {
  return (
    <span className="relative flex-shrink-0" style={{ width: 8, height: 8 }}>
      {isLive ? (
        <>
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: '#22c55e', opacity: 0.75,
            animation: 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite',
          }} />
          <span style={{ position: 'relative', display: 'block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
        </>
      ) : (
        <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
      )}
    </span>
  );
}

function DbIcon({ dbType, size = 14 }) {
  const color = DB_COLORS[dbType] || '#6366f1';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size + 4, height: size + 4, borderRadius: 4,
      background: color + '22', color, flexShrink: 0, fontSize: size - 2, fontWeight: 700,
    }}>
      {(DB_TYPE_LABELS[dbType] || dbType || 'DB').charAt(0).toUpperCase()}
    </span>
  );
}

export default function DatabaseSwitcher({ connections, activeConnId, onSwitch, liveConnIds = null }) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const ref = useRef(null);
  const navigate = useNavigate();

  const activeConn = connections.find((c) => c.conn_id === activeConnId) || connections[0];
  const dbLabel = activeConn
    ? `${activeConn.database_name} (${DB_TYPE_LABELS[activeConn.db_type] || activeConn.db_type})`
    : 'No database';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Keyboard nav
  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); setFocusIdx(0); }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, connections.length)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (focusIdx >= 0 && focusIdx < connections.length) {
        onSwitch(connections[focusIdx].conn_id);
        setOpen(false);
      } else if (focusIdx === connections.length) {
        navigate('/dashboard');
        setOpen(false);
      }
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Trigger pill */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px 6px 8px',
          borderRadius: 12,
          background: open ? 'var(--overlay-light)' : 'transparent',
          border: 'none',
          color: 'var(--text-primary)', cursor: 'pointer',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap', maxWidth: 220,
          outline: 'none',
        }}
      >
        {activeConn ? (
          <>
            <StatusDot isLive={!liveConnIds || liveConnIds.has(activeConn?.conn_id)} />
            <DbIcon dbType={activeConn?.db_type} />
            <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
              {dbLabel}
            </span>
          </>
        ) : (
          <>
            <svg style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
            </svg>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No database</span>
          </>
        )}
        {/* Chevron */}
        <svg style={{
          width: 12, height: 12, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 2,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
        }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0,
            minWidth: 240, maxWidth: 320,
            background: 'var(--bg-elevated)',
            backdropFilter: 'blur(30px) saturate(1.5)',
            border: '1px solid var(--border-default)',
            borderRadius: 14,
            boxShadow: '0 20px 48px rgba(0,0,0,0.7)',
            zIndex: 100,
            overflow: 'hidden',
            padding: '6px',
          }}
        >
          {/* Header label */}
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', padding: '4px 10px 8px' }}>
            Connected Databases
          </p>

          {connections.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 10px 8px' }}>No active connections</p>
          )}

          {connections.map((conn, idx) => {
            const isActive = conn.conn_id === (activeConnId || connections[0]?.conn_id);
            const label = DB_TYPE_LABELS[conn.db_type] || conn.db_type;
            return (
              <button
                key={conn.conn_id}
                role="option"
                aria-selected={isActive}
                onClick={() => { onSwitch(conn.conn_id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '8px 10px',
                  borderRadius: 9,
                  background: focusIdx === idx ? 'rgba(99,102,241,0.1)' : isActive ? 'rgba(99,102,241,0.08)' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  transition: 'background 0.12s',
                  textAlign: 'left',
                }}
                onMouseEnter={() => setFocusIdx(idx)}
                onMouseLeave={() => setFocusIdx(-1)}
              >
                <StatusDot isLive={!liveConnIds || liveConnIds.has(conn.conn_id)} />
                <DbIcon dbType={conn.db_type} size={14} />
                <span style={{ flex: 1, overflow: 'hidden' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: isActive ? '#a5b4fc' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conn.database_name}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{label}</span>
                </span>
                {isActive && (
                  <svg style={{ width: 14, height: 14, color: '#818cf8', flexShrink: 0 }} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}

          {/* Divider + Connect new */}
          <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />
          <button
            onClick={() => { navigate('/dashboard'); setOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 10px',
              borderRadius: 9,
              background: focusIdx === connections.length ? 'rgba(99,102,241,0.1)' : 'transparent',
              border: 'none', cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={() => setFocusIdx(connections.length)}
            onMouseLeave={() => setFocusIdx(-1)}
          >
            <svg style={{ width: 14, height: 14, color: '#6366f1', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 500 }}>Connect New Database</span>
          </button>
        </div>
      )}
    </div>
  );
}

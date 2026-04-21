import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import './DashboardPicker.css';

/**
 * DashboardPicker — the dashboard-name button in the TopBar becomes a
 * dropdown that lists every saved dashboard + a "+ New dashboard" footer
 * action. Replaces the Plan-TSS UX gap where a newly-saved dashboard
 * was only reachable via ⌘K command palette.
 *
 * Props:
 *   - dashboardName: string — active dashboard name
 *   - dashboardId:   string — active dashboard id
 *   - dashboardList: Array<{ id, name, boundConnId?, updated_at? }>
 *   - onSwitch:      (id) => void
 *   - onRename:      (next) => void  — fired when the user double-clicks to rename
 *   - connections:   Array<{ conn_id, name, db_type }>
 */
export default function DashboardPicker({
  dashboardName,
  dashboardId,
  dashboardList = [],
  onSwitch,
  onRename,
  connections = [],
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(dashboardName || '');
  const anchorRef = useRef(null);
  const panelRef = useRef(null);
  const openSaveDialog = useStore((s) => s.openSaveDashboardDialog);

  // async-init failure path — standard React pattern
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDraftName(dashboardName || ''); }, [dashboardName]);

  // Outside-click + Escape dismiss
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const connectionLabel = (connId) => {
    if (!connId) return null;
    const c = connections.find((x) => x.conn_id === connId);
    if (!c) return connId;
    return c.name || c.database_name || c.conn_id;
  };

  const orderedList = useMemo(() => {
    // Active first, then alphabetical by name
    const arr = [...(dashboardList || [])];
    arr.sort((a, b) => {
      if (a.id === dashboardId) return -1;
      if (b.id === dashboardId) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return arr;
  }, [dashboardList, dashboardId]);

  const commitRename = () => {
    setEditing(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== dashboardName) onRename?.(trimmed);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRename();
          if (e.key === 'Escape') { setDraftName(dashboardName || ''); setEditing(false); }
        }}
        className="dashboard-picker__rename-input"
        aria-label="Rename dashboard"
      />
    );
  }

  return (
    <div className="dashboard-picker">
      <button
        ref={anchorRef}
        type="button"
        className="dashboard-picker__trigger"
        onClick={() => setOpen((v) => !v)}
        onDoubleClick={() => setEditing(true)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Dashboard: ${dashboardName || 'Untitled'}. Click to switch, double-click to rename.`}
        data-testid="dashboard-picker-trigger"
        title={dashboardName || 'Untitled dashboard'}
      >
        <span className="dashboard-picker__name">{dashboardName || 'Untitled dashboard'}</span>
        <svg
          className={'dashboard-picker__chevron' + (open ? ' dashboard-picker__chevron--open' : '')}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
        >
          <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="listbox"
          aria-label="Saved dashboards"
          className="dashboard-picker__panel"
          data-testid="dashboard-picker-panel"
        >
          <div className="dashboard-picker__panel-header">
            {orderedList.length === 0 ? 'No saved dashboards yet' : `${orderedList.length} saved`}
          </div>

          <ul className="dashboard-picker__list">
            {orderedList.map((d) => {
              const active = d.id === dashboardId;
              const connName = connectionLabel(d.boundConnId);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={'dashboard-picker__item' + (active ? ' dashboard-picker__item--active' : '')}
                    onClick={() => {
                      if (!active) onSwitch?.(d.id);
                      setOpen(false);
                    }}
                    data-testid={`dashboard-picker-item-${d.id}`}
                  >
                    <span className="dashboard-picker__item-name">{d.name || 'Untitled'}</span>
                    {connName && (
                      <span className="dashboard-picker__item-conn" title={`Bound to ${connName}`}>
                        {connName}
                      </span>
                    )}
                    {active && <span className="dashboard-picker__item-active-badge">active</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="dashboard-picker__footer">
            <button
              type="button"
              className="dashboard-picker__new-btn"
              data-testid="dashboard-picker-new-btn"
              onClick={() => {
                setOpen(false);
                openSaveDialog?.();
              }}
            >
              + New dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

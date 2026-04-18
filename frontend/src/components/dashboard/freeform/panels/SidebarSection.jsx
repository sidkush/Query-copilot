import React from 'react';
import { useStore } from '../../../../store';

/**
 * Plan 6c — collapsible section primitive used by the Tableau-style sidebar.
 * Collapse state lives in the Zustand store (`analystProSidebarCollapsed`)
 * so it survives re-mounts and can be toggled from anywhere.
 */
export default function SidebarSection({ id, heading, children, 'data-testid': dtid }) {
  const collapsed = useStore((s) => s.analystProSidebarCollapsed.has(id));
  const toggle = useStore((s) => s.toggleSidebarSectionAnalystPro);
  const panelId = `sidebar-section-${id}`;
  return (
    <section
      data-testid={dtid || `sidebar-section-${id}`}
      style={{ borderTop: '1px solid var(--chrome-bar-border, var(--border-default))' }}
    >
      <button
        type="button"
        onClick={() => toggle(id)}
        aria-expanded={!collapsed}
        aria-controls={panelId}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: 'transparent',
          border: 'none',
          color: 'var(--fg)',
          textAlign: 'left',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.75,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true" style={{ width: 10, display: 'inline-block' }}>
          {collapsed ? '\u25B8' : '\u25BE'}
        </span>
        <span>{heading}</span>
      </button>
      {!collapsed && (
        <div id={panelId} role="region" aria-label={heading}>
          {children}
        </div>
      )}
    </section>
  );
}

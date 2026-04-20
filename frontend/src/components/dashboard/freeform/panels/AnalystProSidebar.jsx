import React from 'react';
import { useStore } from '../../../../store';
import SidebarSection from './SidebarSection';
import ObjectLibraryPanel from './ObjectLibraryPanel';
import SheetsInsertPanel from './SheetsInsertPanel';
import SetsPanel from './SetsPanel';
import ParametersPanel from './ParametersPanel';
import LayoutTreePanel from './LayoutTreePanel';
import SelectedItemMini from './SelectedItemMini';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'layout',    label: 'Layout' },
];

/**
 * Plan 6c — Tableau-style two-tab sidebar.
 *
 *   Dashboard tab  → Objects | Sheets | Sets | Parameters
 *   Layout tab     → Item Hierarchy | Selected Item
 *
 * Right rail (`HistoryInspectorPanel` + `ZonePropertiesPanel`) is unchanged;
 * this component only replaces the left rail.
 */
export default function AnalystProSidebar() {
  const active = useStore((s) => s.analystProSidebarTab) || 'dashboard';
  const setTab = useStore((s) => s.setSidebarTabAnalystPro);

  const tabId = (id) => `analyst-pro-sidebar-tab-${id}`;
  const panelId = (id) => `analyst-pro-sidebar-panel-${id}`;

  return (
    <div
      data-testid="analyst-pro-sidebar"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      <div
        role="tablist"
        aria-label="Analyst Pro sidebar"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--chrome-bar-border, var(--border-default))',
        }}
      >
        {TABS.map((t) => {
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              id={tabId(t.id)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId(t.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '8px 10px',
                background: selected ? 'var(--bg-elevated)' : 'transparent',
                color: 'var(--fg)',
                border: 'none',
                borderBottom: selected
                  ? '2px solid var(--accent, #6c63ff)'
                  : '2px solid transparent',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId(active)}
        aria-labelledby={tabId(active)}
        style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
      >
        {active === 'dashboard' ? (
          <>
            <SidebarSection id="objects"    heading="Objects"><ObjectLibraryPanel /></SidebarSection>
            <SidebarSection id="sheets"     heading="Sheets"><SheetsInsertPanel /></SidebarSection>
            <SidebarSection id="sets"       heading="Sets"><SetsPanel /></SidebarSection>
            <SidebarSection id="parameters" heading="Parameters"><ParametersPanel /></SidebarSection>
            <div style={{ padding: '8px 10px' }}>
              <button
                type="button"
                className="analyst-pro-sidebar__button"
                onClick={() => useStore.getState().openCalcEditorAnalystPro()}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'var(--bg-elevated)',
                  color: 'var(--fg)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 4,
                }}
              >
                New Calculated Field…
              </button>
            </div>
          </>
        ) : (
          <>
            <SidebarSection id="hierarchy" heading="Item Hierarchy"><LayoutTreePanel /></SidebarSection>
            <SidebarSection id="selected"  heading="Selected Item"><SelectedItemMini /></SidebarSection>
          </>
        )}
      </div>
    </div>
  );
}

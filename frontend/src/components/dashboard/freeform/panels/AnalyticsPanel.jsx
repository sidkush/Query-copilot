import React from 'react';
import { useStore } from '../../../../store';
import SidebarSection from './SidebarSection';

/**
 * Plan 9a T9 — Analytics-pane catalogue tab.
 *
 * Build_Tableau §XIII.1 catalogue order preserved. Items marked with
 * `disabled` are parked for Plans 9b (trend), 9c (forecast), 9d (cluster),
 * 9e (box plot); they render but refuse drag and cannot open the dialog.
 *
 * Each draggable item sets a `application/askdb-analytics` dataTransfer
 * payload with `{ kind, preset }`. Double-click opens the reference line
 * dialog via the `openReferenceLineDialogAnalystPro` store setter (T10
 * mounts the dialog component).
 */
const ITEMS = [
  { id: 'constant_line',          label: 'Constant Line',          kind: 'reference_line',         preset: { aggregation: 'constant' } },
  { id: 'average_line',           label: 'Average Line',           kind: 'reference_line',         preset: { aggregation: 'mean' } },
  { id: 'median_line',            label: 'Median',                 kind: 'reference_line',         preset: { aggregation: 'median' } },
  { id: 'reference_line',         label: 'Reference Line',         kind: 'reference_line' },
  { id: 'reference_band',         label: 'Reference Band',         kind: 'reference_band' },
  { id: 'reference_distribution', label: 'Reference Distribution', kind: 'reference_distribution' },
  { id: 'totals',                 label: 'Totals',                 kind: 'totals' },
  { id: 'trend_line',             label: 'Trend Line',             kind: 'trend',    disabled: true },
  { id: 'forecast',               label: 'Forecast',               kind: 'forecast', disabled: true },
  { id: 'cluster',                label: 'Cluster',                kind: 'cluster',  disabled: true },
  { id: 'box_plot',               label: 'Box Plot',               kind: 'box_plot', disabled: true },
];

const MIME = 'application/askdb-analytics';

export default function AnalyticsPanel() {
  const openDialog = useStore((s) => s.openReferenceLineDialogAnalystPro);

  return (
    <SidebarSection id="analytics" heading="Analytics">
      <ul
        className="analytics-catalogue"
        role="list"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {ITEMS.map((it) => {
          const disabled = !!it.disabled;
          return (
            <li
              key={it.id}
              data-analytics-item=""
              data-kind={it.kind}
              data-disabled={disabled ? 'true' : 'false'}
              draggable={!disabled}
              onDragStart={(e) => {
                if (disabled) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData(
                  MIME,
                  JSON.stringify({ kind: it.kind, preset: it.preset ?? {} }),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onDoubleClick={() => {
                if (disabled) return;
                if (typeof openDialog === 'function') {
                  openDialog({ kind: it.kind, preset: it.preset ?? {} });
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: disabled ? 'not-allowed' : 'grab',
                opacity: disabled ? 0.55 : 1,
                fontSize: 12,
                color: 'var(--fg)',
                userSelect: 'none',
              }}
            >
              <span>{it.label}</span>
              {disabled && (
                <span
                  className="analytics-catalogue__badge"
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Coming soon
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </SidebarSection>
  );
}

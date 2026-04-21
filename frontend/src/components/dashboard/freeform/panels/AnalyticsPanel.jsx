import React, { useMemo, useState } from 'react';
import { useStore } from '../../../../store';
import SidebarSection from './SidebarSection';

/**
 * Plan 9e T8 — Analytics-pane catalogue with section grouping, icons,
 * collapsible families, empty-state copy, and hover tooltip previews.
 *
 * Families (Build_Tableau §XIII.1):
 *   Summarise — Constant/Average/Median/Reference Line/Band/Distribution/Totals
 *   Model     — Trend Line / Forecast / Cluster / Box Plot
 *   Custom    — Drop Lines
 */
const SECTIONS = [
  {
    id: 'summarise',
    heading: 'Summarise',
    items: [
      { id: 'constant_line',          label: 'Constant Line',          icon: 'const', kind: 'reference_line',         preset: { aggregation: 'constant' }, tip: 'Fixed value ruled across the axis.' },
      { id: 'average_line',           label: 'Average Line',           icon: 'avg',   kind: 'reference_line',         preset: { aggregation: 'mean' },     tip: 'Axis mean across the selected scope.' },
      { id: 'median_line',            label: 'Median',                 icon: 'med',   kind: 'reference_line',         preset: { aggregation: 'median' },   tip: 'Median of the measure.' },
      { id: 'reference_line',         label: 'Reference Line',         icon: 'ref',   kind: 'reference_line',                                              tip: 'Single aggregated value with full styling.' },
      { id: 'reference_band',         label: 'Reference Band',         icon: 'band',  kind: 'reference_band',                                              tip: 'Two values shaded between them.' },
      { id: 'reference_distribution', label: 'Reference Distribution', icon: 'dist',  kind: 'reference_distribution',                                      tip: 'N percentiles or ±σ overlay.' },
      { id: 'totals',                 label: 'Totals',                 icon: 'sum',   kind: 'totals',                                                      tip: 'Grand / subtotal rows or columns.' },
    ],
  },
  {
    id: 'model',
    heading: 'Model',
    items: [
      { id: 'trend_line', label: 'Trend Line', icon: 'trend',    kind: 'trend_line', tip: 'Least-squares fit — linear / log / exp / power / polynomial.' },
      { id: 'forecast',   label: 'Forecast',   icon: 'forecast', kind: 'forecast',   tip: 'Holt-Winters with AIC model selection.' },
      { id: 'cluster',    label: 'Cluster',    icon: 'cluster',  kind: 'cluster',    tip: 'K-means with auto-k by Calinski-Harabasz.' },
      { id: 'box_plot',   label: 'Box Plot',   icon: 'box',      kind: 'box_plot',   tip: 'Quartiles + whiskers + outliers.' },
    ],
  },
  {
    id: 'custom',
    heading: 'Custom',
    items: [
      { id: 'drop_lines', label: 'Drop Lines', icon: 'drop', kind: 'drop_lines', tip: 'Hover rule from mark to axis. Applies to the whole sheet.' },
    ],
  },
];

const MIME = 'application/askdb-analytics';

const ICONS = {
  const: '▬', avg: '─', med: '—', ref: '╎', band: '▥', dist: '⋮', sum: 'Σ',
  trend: '↗', forecast: '⟶', cluster: '◉', box: '▭', drop: '↧',
};

export default function AnalyticsPanel() {
  const openDialog = useStore((s) => s.openReferenceLineDialogAnalystPro);
  const openTrendLineDialog = useStore((s) => s.openTrendLineDialogAnalystPro);
  const openForecastDialog = useStore((s) => s.openForecastDialogAnalystPro);
  const openClusterDialog = useStore((s) => s.openClusterDialogAnalystPro);
  const openBoxPlotDialog = useStore((s) => s.openBoxPlotDialogAnalystPro);
  const openDropLinesDialog = useStore((s) => s.openDropLinesDialogAnalystPro);

  const [collapsed, setCollapsed] = useState({});
  const [hoverId, setHoverId] = useState(null);

  const totalItems = useMemo(
    () => SECTIONS.reduce((a, s) => a + s.items.length, 0),
    [],
  );

  const activate = (item) => {
    if (item.kind === 'trend_line') return openTrendLineDialog?.({ kind: item.kind, preset: item.preset ?? {} });
    if (item.kind === 'forecast')   return openForecastDialog?.({ kind: item.kind, preset: item.preset ?? {} });
    if (item.kind === 'cluster')    return openClusterDialog?.({});
    if (item.kind === 'box_plot')   return openBoxPlotDialog?.({ kind: item.kind });
    if (item.kind === 'drop_lines') return openDropLinesDialog?.({ sheetId: 'current' });
    openDialog?.({ kind: item.kind, preset: item.preset ?? {} });
  };

  return (
    <SidebarSection id="analytics" heading="Analytics">
      <p
        className="analytics-catalogue__help"
        style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}
      >
        Drag onto an axis to add a reference. {totalItems} items available.
      </p>

      {SECTIONS.map((section) => {
        const isCollapsed = !!collapsed[section.id];
        return (
          <div key={section.id} className="analytics-catalogue__section">
            <button
              type="button"
              name={section.heading}
              onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
              style={{
                display: 'flex', alignItems: 'center', width: '100%',
                padding: '4px 0', border: 0, background: 'transparent',
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              <span role="heading" aria-level={3}>{section.heading}</span>
              <span style={{ marginLeft: 'auto' }}>{isCollapsed ? '▸' : '▾'}</span>
            </button>

            {!isCollapsed && (
              <ul
                className="analytics-catalogue"
                role="list"
                style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                {section.items.map((it) => (
                  <li
                    key={it.id}
                    data-analytics-item=""
                    data-kind={it.kind}
                    data-disabled="false"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        MIME,
                        JSON.stringify({ kind: it.kind, preset: it.preset ?? {} }),
                      );
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDoubleClick={() => activate(it)}
                    onMouseEnter={() => setHoverId(it.id)}
                    onMouseLeave={() => setHoverId(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 4,
                      cursor: 'grab', fontSize: 12, color: 'var(--fg)',
                      userSelect: 'none', position: 'relative',
                    }}
                  >
                    <span
                      className="analytics-catalogue__icon"
                      aria-hidden
                      style={{ width: 16, textAlign: 'center' }}
                    >
                      {ICONS[it.icon] ?? '•'}
                    </span>
                    <span>{it.label}</span>
                    {hoverId === it.id && (
                      <span
                        role="tooltip"
                        aria-label={it.tip}
                        style={{
                          position: 'absolute', left: '100%', top: 0,
                          marginLeft: 8, whiteSpace: 'nowrap',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 4, padding: '4px 8px',
                          fontSize: 11, zIndex: 10,
                        }}
                      >
                        {it.tip}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </SidebarSection>
  );
}

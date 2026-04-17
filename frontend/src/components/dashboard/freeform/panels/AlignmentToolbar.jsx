import React, { useMemo } from 'react';
import { useStore } from '../../../../store';

const ALIGN_OPS = [
  { op: 'left',     label: 'Align Left',     glyph: '⇤' },
  { op: 'h-center', label: 'Align H-center', glyph: '⇆' },
  { op: 'right',    label: 'Align Right',    glyph: '⇥' },
  { op: 'top',      label: 'Align Top',      glyph: '⇧' },
  { op: 'v-center', label: 'Align V-center', glyph: '⇕' },
  { op: 'bottom',   label: 'Align Bottom',   glyph: '⇩' },
];

const DIST_OPS = [
  { axis: 'horizontal', label: 'Distribute Horizontally', glyph: '⇔' },
  { axis: 'vertical',   label: 'Distribute Vertically',   glyph: '⇳' },
];

export default function AlignmentToolbar() {
  const selection = useStore((s) => s.analystProSelection);
  const dashboard = useStore((s) => s.analystProDashboard);
  const align = useStore((s) => s.alignSelectionAnalystPro);
  const distribute = useStore((s) => s.distributeSelectionAnalystPro);

  const floatingSelectedCount = useMemo(() => {
    if (!dashboard) return 0;
    let n = 0;
    for (const z of dashboard.floatingLayer) if (selection.has(z.id)) n++;
    return n;
  }, [dashboard, selection]);

  const alignDisabled = floatingSelectedCount < 2;
  const distributeDisabled = floatingSelectedCount < 3;

  const btnStyle = (disabled) => ({
    background: 'transparent',
    border: 'none',
    color: disabled ? 'var(--text-muted, #9ca3af)' : 'var(--fg)',
    padding: '4px 8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    opacity: disabled ? 0.4 : 1,
  });

  return (
    <div
      role="toolbar"
      aria-label="Alignment toolbar"
      style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}
    >
      {ALIGN_OPS.map(({ op, label, glyph }) => (
        <button
          key={op}
          type="button"
          aria-label={label}
          title={label}
          disabled={alignDisabled}
          onClick={() => align(op)}
          style={btnStyle(alignDisabled)}
        >
          {glyph}
        </button>
      ))}
      <span style={{ width: 1, height: 18, background: 'var(--chrome-bar-border)', margin: '0 4px' }} aria-hidden="true" />
      {DIST_OPS.map(({ axis, label, glyph }) => (
        <button
          key={axis}
          type="button"
          aria-label={label}
          title={label}
          disabled={distributeDisabled}
          onClick={() => distribute(axis)}
          style={btnStyle(distributeDisabled)}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}

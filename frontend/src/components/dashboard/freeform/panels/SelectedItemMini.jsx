import React, { useMemo } from 'react';
import { useStore } from '../../../../store';

function findZone(dashboard, zoneId) {
  if (!dashboard || !zoneId) return null;
  const float = dashboard.floatingLayer?.find((z) => z.id === zoneId);
  if (float) return float;
  const walk = (z) => {
    if (!z) return null;
    if (z.id === zoneId) return z;
    if (!z.children) return null;
    for (const c of z.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(dashboard.tiledRoot);
}

function fmtColor(c) {
  if (!c) return '—';
  if (typeof c === 'string') return c;
  if (c.color) return c.color;
  return '—';
}

function fmtBorder(b) {
  if (!b) return '—';
  const w = b.width ?? 0;
  const s = b.style || 'solid';
  const c = b.color || 'var(--border-default)';
  return `${w}px ${s} ${c}`;
}

const dtStyle = { opacity: 0.65, margin: 0 };
const ddStyle = { margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/**
 * Plan 6c — compact Layout echo shown in the Layout sidebar tab.
 * Read-only; users edit in the right-rail `ZonePropertiesPanel`.
 * Hidden unless exactly one zone is selected.
 */
export default function SelectedItemMini() {
  const dashboard = useStore((s) => s.analystProDashboard);
  const selection = useStore((s) => s.analystProSelection);

  const id = selection?.size === 1 ? Array.from(selection)[0] : null;
  const zone = useMemo(() => findZone(dashboard, id), [dashboard, id]);
  if (!id || !zone) return null;

  const floating = zone.floating === true;
  const inner = typeof zone.innerPadding === 'number' ? zone.innerPadding : 4;
  const outer = typeof zone.outerPadding === 'number' ? zone.outerPadding : 0;

  return (
    <dl
      data-testid="selected-item-mini"
      style={{
        margin: 0,
        padding: '6px 12px',
        display: 'grid',
        gridTemplateColumns: '90px 1fr',
        rowGap: 4,
        columnGap: 6,
        fontSize: 11,
        color: 'var(--fg)',
      }}
    >
      <dt style={dtStyle}>Position</dt>
      <dd style={ddStyle}>{floating ? `${zone.x ?? 0}, ${zone.y ?? 0}` : 'tiled'}</dd>

      <dt style={dtStyle}>Size</dt>
      <dd style={ddStyle}>{floating ? `${zone.pxW ?? 0} \u00D7 ${zone.pxH ?? 0}` : '—'}</dd>

      <dt style={dtStyle}>Padding</dt>
      <dd style={ddStyle}>{`${inner} / ${outer}`}</dd>

      <dt style={dtStyle}>Background</dt>
      <dd style={ddStyle}>{fmtColor(zone.background)}</dd>

      <dt style={dtStyle}>Border</dt>
      <dd style={ddStyle}>{fmtBorder(zone.border)}</dd>
    </dl>
  );
}

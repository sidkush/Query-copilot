import React, { useMemo } from 'react';
import { useStore } from '../../../../store';

export default function StructureToolbar() {
  const selection = useStore((s) => s.analystProSelection);
  const dashboard = useStore((s) => s.analystProDashboard);
  const groupSel = useStore((s) => s.groupSelectionAnalystPro);
  const ungroup = useStore((s) => s.ungroupAnalystPro);
  const toggleLock = useStore((s) => s.toggleLockAnalystPro);

  const { canGroup, canUngroup, canLock, singleSelectedId } = useMemo(() => {
    if (!dashboard) return { canGroup: false, canUngroup: false, canLock: false, singleSelectedId: null };
    if (selection.size === 0) return { canGroup: false, canUngroup: false, canLock: false, singleSelectedId: null };
    // canGroup: ≥2 tiled zones selected (floating-only can't group)
    let tiledCount = 0;
    const findTiled = (zone) => {
      if (selection.has(zone.id)) {
        tiledCount++;
      }
      if (zone.children) zone.children.forEach(findTiled);
    };
    findTiled(dashboard.tiledRoot);
    const canGroup = tiledCount >= 2;
    // canUngroup: exactly 1 zone selected AND it's a container AND not the root
    let single = null;
    if (selection.size === 1) single = [...selection][0];
    let canUngroup = false;
    if (single) {
      const findContainerNotRoot = (zone, isRoot) => {
        if (zone.id === single && !isRoot && zone.children) return true;
        if (zone.children) return zone.children.some((c) => findContainerNotRoot(c, false));
        return false;
      };
      canUngroup = findContainerNotRoot(dashboard.tiledRoot, true);
    }
    const canLock = selection.size >= 1;
    return { canGroup, canUngroup, canLock, singleSelectedId: single };
  }, [dashboard, selection]);

  const btnStyle = (disabled) => ({
    background: 'transparent',
    border: 'none',
    color: disabled ? 'var(--text-muted)' : 'var(--fg)',
    padding: '4px 8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '13px',
    opacity: disabled ? 0.4 : 1,
  });

  return (
    <div role="toolbar" aria-label="Structure toolbar" style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      <button type="button" aria-label="Group" title="Group (Cmd+G)" disabled={!canGroup} onClick={() => groupSel()} style={btnStyle(!canGroup)}>⊞</button>
      <button type="button" aria-label="Ungroup" title="Ungroup (Cmd+Shift+G)" disabled={!canUngroup} onClick={() => singleSelectedId && ungroup(singleSelectedId)} style={btnStyle(!canUngroup)}>⊟</button>
      <button type="button" aria-label="Toggle lock" title="Lock (Cmd+L)" disabled={!canLock} onClick={() => {
        selection.forEach((id) => toggleLock(id));
      }} style={btnStyle(!canLock)}>🔒</button>
    </div>
  );
}

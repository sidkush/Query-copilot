import React, { useMemo } from 'react';
import { useStore } from '../../../../store';

export default function StructureToolbar() {
  const selection = useStore((s) => s.analystProSelection);
  const dashboard = useStore((s) => s.analystProDashboard);
  const groupSel = useStore((s) => s.groupSelectionAnalystPro);
  const ungroup = useStore((s) => s.ungroupAnalystPro);
  const toggleLock = useStore((s) => s.toggleLockAnalystPro);
  const distributeEvenly = useStore((s) => s.distributeEvenlyAnalystPro);
  const fitContainer = useStore((s) => s.fitContainerToContentAnalystPro);
  const removeContainer = useStore((s) => s.removeContainerAnalystPro);

  const state = useMemo(() => {
    const empty = {
      canGroup: false, canUngroup: false, canLock: false,
      singleSelectedId: null, selectedContainerId: null,
      selectedContainerHasTwoKids: false, selectedIsRoot: false,
    };
    if (!dashboard) return empty;
    if (selection.size === 0) return empty;
    let tiledCount = 0;
    const findTiled = (zone) => {
      if (selection.has(zone.id)) tiledCount++;
      if (zone.children) zone.children.forEach(findTiled);
    };
    findTiled(dashboard.tiledRoot);
    const canGroup = tiledCount >= 2;

    let single = null;
    if (selection.size === 1) single = [...selection][0];

    let selectedContainerId = null;
    let selectedContainerHasTwoKids = false;
    const selectedIsRoot = single === dashboard.tiledRoot.id;
    if (single) {
      const walk = (zone) => {
        if (zone.id === single && zone.children) {
          selectedContainerId = zone.id;
          selectedContainerHasTwoKids = zone.children.length >= 2;
        }
        if (zone.children) zone.children.forEach(walk);
      };
      walk(dashboard.tiledRoot);
    }

    const canUngroup = !!selectedContainerId && !selectedIsRoot;
    const canLock = selection.size >= 1;
    return { canGroup, canUngroup, canLock, singleSelectedId: single, selectedContainerId, selectedContainerHasTwoKids, selectedIsRoot };
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

  const canDistribute = !!state.selectedContainerId && state.selectedContainerHasTwoKids;
  const canFit = !!state.selectedContainerId;
  const canRemoveContainer = !!state.selectedContainerId && !state.selectedIsRoot;

  return (
    <div role="toolbar" aria-label="Structure toolbar" style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      <button type="button" aria-label="Group" title="Group (Cmd+G)" disabled={!state.canGroup} onClick={() => groupSel()} style={btnStyle(!state.canGroup)}>⊞</button>
      <button type="button" aria-label="Ungroup" title="Ungroup (Cmd+Shift+G)" disabled={!state.canUngroup} onClick={() => state.singleSelectedId && ungroup(state.singleSelectedId)} style={btnStyle(!state.canUngroup)}>⊟</button>
      <button type="button" aria-label="Toggle lock" title="Lock (Cmd+L)" disabled={!state.canLock} onClick={() => {
        selection.forEach((id) => toggleLock(id));
      }} style={btnStyle(!state.canLock)}>🔒</button>
      <button type="button" aria-label="Distribute Evenly" title="Distribute Evenly" disabled={!canDistribute} onClick={() => state.selectedContainerId && distributeEvenly(state.selectedContainerId)} style={btnStyle(!canDistribute)}>⇹</button>
      <button type="button" aria-label="Fit to Content" title="Fit Container to Content" disabled={!canFit} onClick={() => state.selectedContainerId && fitContainer(state.selectedContainerId)} style={btnStyle(!canFit)}>⇲</button>
      <button type="button" aria-label="Remove Container" title="Remove Container" disabled={!canRemoveContainer} onClick={() => state.selectedContainerId && removeContainer(state.selectedContainerId)} style={btnStyle(!canRemoveContainer)}>⬚</button>
    </div>
  );
}

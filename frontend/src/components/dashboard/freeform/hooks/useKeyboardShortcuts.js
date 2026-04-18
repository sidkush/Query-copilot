// frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js
import { useEffect } from 'react';
import { useStore } from '../../../../store';

/**
 * Keyboard shortcuts for Analyst Pro authoring:
 *   - Cmd/Ctrl+Z  → undo
 *   - Cmd/Ctrl+Shift+Z → redo
 *   - Cmd/Ctrl+A  → select all (top-level tiled children + all floating)
 *   - Delete/Backspace → delete selected (Plan 2b — stub logs for now)
 *   - Escape      → clear selection
 *   - Arrow keys  → nudge selected floating zones by 1px (Shift+arrow = 10px)
 *   - ] / [       → bring forward / send backward (floating z-order)
 *
 * Installs a window-level keydown listener; ignores keys when focus is in an
 * input/textarea/contenteditable.
 */
export function useKeyboardShortcuts({ canvasRef } = {}) {
  const undo = useStore((s) => s.undoAnalystPro);
  const redo = useStore((s) => s.redoAnalystPro);
  const selection = useStore((s) => s.analystProSelection);
  const clearSelection = useStore((s) => s.clearSelection);
  const setSelection = useStore((s) => s.setAnalystProSelection);
  const dashboard = useStore((s) => s.analystProDashboard);
  const setDashboard = useStore((s) => s.setAnalystProDashboard);
  const pushHistory = useStore((s) => s.pushAnalystProHistory);

  useEffect(() => {
    const handler = (e) => {
      // Ignore when typing in inputs
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if (mod && (e.key.toLowerCase() === 'z' && e.shiftKey || e.key.toLowerCase() === 'y')) {
        e.preventDefault(); redo(); return;
      }
      // Plan 6a — canvas zoom shortcuts
      if (mod && e.key === '0') {
        e.preventDefault();
        useStore.getState().setCanvasZoomAnalystPro(1.0);
        useStore.getState().setCanvasPanAnalystPro(0, 0);
        return;
      }
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const z = useStore.getState().analystProCanvasZoom;
        useStore.getState().setCanvasZoomAnalystPro(z * 1.2);
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        const z = useStore.getState().analystProCanvasZoom;
        useStore.getState().setCanvasZoomAnalystPro(z / 1.2);
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (!dashboard) return;
        const ids = [];
        for (const c of dashboard.tiledRoot?.children ?? []) ids.push(c.id);
        for (const f of dashboard.floatingLayer ?? []) ids.push(f.id);
        setSelection(ids);
        return;
      }
      if (e.key === 'Escape') { clearSelection(); return; }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && dashboard) {
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        // Only nudge unlocked floating zones — consistent with drag/resize/delete lock semantics.
        const unlockedSelectedFloating = (dashboard.floatingLayer || []).filter(
          (z) => selection.has(z.id) && !z.locked,
        );
        if (unlockedSelectedFloating.length === 0) return;
        const unlockedIds = new Set(unlockedSelectedFloating.map((z) => z.id));
        const floats = (dashboard.floatingLayer || []).map((f) => unlockedIds.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f);
        if (floats.some((f, i) => f !== dashboard.floatingLayer[i])) {
          e.preventDefault();
          const next = { ...dashboard, floatingLayer: floats };
          setDashboard(next);
          pushHistory(next, 'Nudge zone');
        }
      }

      // T5: Delete/Backspace — remove selected zones, but skip locked ones.
      if ((e.key === 'Delete' || e.key === 'Backspace') && dashboard && selection.size > 0) {
        e.preventDefault();
        // Build a set of locked ids so we can skip them.
        const lockedIds = new Set([
          ...(dashboard.floatingLayer || []).filter((z) => z.locked === true).map((z) => z.id),
        ]);
        // Helper to find locked tiled zone ids inside the tiled tree.
        const collectLockedTiled = (zone) => {
          if (zone.locked === true) lockedIds.add(zone.id);
          if (zone.children) zone.children.forEach(collectLockedTiled);
        };
        if (dashboard.tiledRoot) collectLockedTiled(dashboard.tiledRoot);

        const idsToDelete = [...selection].filter((id) => !lockedIds.has(id));
        if (idsToDelete.length === 0) return;

        // Remove from floatingLayer.
        const deleteSet = new Set(idsToDelete);
        let nextFloating = (dashboard.floatingLayer || []).filter((z) => !deleteSet.has(z.id));

        // Remove from tiledRoot (walk and filter).
        const removeFromTree = (zone) => {
          if (!zone.children) return zone;
          const nextChildren = zone.children
            .filter((c) => !deleteSet.has(c.id))
            .map(removeFromTree);
          return { ...zone, children: nextChildren };
        };
        const nextRoot = removeFromTree(dashboard.tiledRoot);

        const nextDash = { ...dashboard, floatingLayer: nextFloating, tiledRoot: nextRoot };
        setDashboard(nextDash);
        pushHistory(nextDash, 'Delete zone');
        // Clear deleted ids from selection; keep locked ones still selected.
        const nextSel = [...selection].filter((id) => !deleteSet.has(id));
        setSelection(nextSel);
        return;
      }

      // Cmd/Ctrl+; — toggle layout overlay
      if (mod && e.key === ';') {
        e.preventDefault();
        const toggle = useStore.getState().toggleLayoutOverlayAnalystPro;
        if (toggle) toggle();
        return;
      }

      // Plan 6b — Cmd/Ctrl+H toggles history inspector
      if (mod && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        const toggle = useStore.getState().toggleHistoryPanelAnalystPro;
        if (toggle) toggle();
        return;
      }

      // Plan 5e: Cmd/Ctrl+Shift+F — toggle tiled <-> floating on every selected zone.
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const toggleFloat = useStore.getState().toggleZoneFloatAnalystPro;
        if (!toggleFloat || selection.size === 0) return;
        selection.forEach((id) => toggleFloat(id));
        return;
      }

      if ((e.key === ']' || e.key === '[') && dashboard) {
        const forward = e.key === ']';
        const big = e.shiftKey;
        const layer = [...(dashboard.floatingLayer || [])];
        const changed = layer.map((f) => {
          if (!selection.has(f.id)) return f;
          const cur = f.zIndex ?? 0;
          return { ...f, zIndex: big ? (forward ? 9999 : -9999) : cur + (forward ? 1 : -1) };
        });
        const next = { ...dashboard, floatingLayer: changed };
        setDashboard(next);
        pushHistory(next, 'Change z-order');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dashboard, selection, undo, redo, clearSelection, setSelection, setDashboard, pushHistory, canvasRef]);
}

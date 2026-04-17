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
        const floats = (dashboard.floatingLayer || []).map((f) => selection.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f);
        if (floats.some((f, i) => f !== dashboard.floatingLayer[i])) {
          e.preventDefault();
          const next = { ...dashboard, floatingLayer: floats };
          setDashboard(next);
          pushHistory(next);
        }
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
        pushHistory(next);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dashboard, selection, undo, redo, clearSelection, setSelection, setDashboard, pushHistory, canvasRef]);
}

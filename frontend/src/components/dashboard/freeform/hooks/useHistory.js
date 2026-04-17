// frontend/src/components/dashboard/freeform/hooks/useHistory.js
import { useCallback } from 'react';
import { useStore } from '../../../../store';

export function useHistory() {
  const undo = useStore((s) => s.undoAnalystPro);
  const redo = useStore((s) => s.redoAnalystPro);
  const push = useStore((s) => s.pushAnalystProHistory);
  const init = useStore((s) => s.initAnalystProHistory);
  const history = useStore((s) => s.analystProHistory);

  const canUndo = !!(history && history.past.length > 0);
  const canRedo = !!(history && history.future.length > 0);

  return {
    undo: useCallback(() => undo(), [undo]),
    redo: useCallback(() => redo(), [redo]),
    pushSnapshot: useCallback((dash) => push(dash), [push]),
    initHistory: useCallback((dash) => init(dash), [init]),
    canUndo,
    canRedo,
  };
}

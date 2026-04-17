// frontend/src/components/dashboard/freeform/hooks/useHistory.js
import { useCallback } from 'react';
import { useStore } from '../../../../store';

export function useHistory() {
  const undo = useStore((s) => s.undoAnalystPro);
  const redo = useStore((s) => s.redoAnalystPro);
  const push = useStore((s) => s.pushAnalystProHistory);
  const init = useStore((s) => s.initAnalystProHistory);
  const history = useStore((s) => s.analystProHistory);

  const pastLen = history?.past.length ?? 0;
  const futureLen = history?.future.length ?? 0;
  const canUndo = pastLen > 0;
  const canRedo = futureLen > 0;
  const lastOperation = canUndo ? history.present.operation : null;
  const nextOperation = canRedo ? history.future[0].operation : null;

  return {
    undo: useCallback(() => undo(), [undo]),
    redo: useCallback(() => redo(), [redo]),
    pushSnapshot: useCallback((dash, operation) => push(dash, operation), [push]),
    initHistory: useCallback((dash) => init(dash), [init]),
    canUndo,
    canRedo,
    pastLen,
    futureLen,
    lastOperation,
    nextOperation,
  };
}

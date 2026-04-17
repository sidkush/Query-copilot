import { useEffect } from 'react';
import { useStore } from '../../../../store';
import { subscribe } from '../lib/markEventBus';
import { executeCascade } from '../lib/actionExecutor';

function applyTargetOp(op, token) {
  const store = useStore.getState();
  switch (op.kind) {
    case 'filter':
      store.markCascadeTargetStatus(op.sheetId, 'pending', token);
      // Plan 3b: actual query fire via waterfall router. For now, mark done on next tick.
      queueMicrotask(() => store.markCascadeTargetStatus(op.sheetId, 'done', token));
      break;
    case 'highlight':
      store.markCascadeTargetStatus(op.sheetId, 'done', token);
      break;
    case 'url':
      if (op.urlTarget === 'new-tab' && typeof window !== 'undefined') {
        window.open(op.url, '_blank', 'noopener');
      }
      break;
    case 'goto-sheet':
      // Plan 3b: scroll/focus target zone.
      break;
    case 'change-parameter':
      // Plan 4: integrate with parameter system.
      break;
    case 'change-set':
      // Plan 4: integrate with set system.
      break;
  }
}

export function useActionRuntime() {
  useEffect(() => {
    return subscribe((event) => {
      const state = useStore.getState();
      const actions = state.analystProDashboard?.actions || [];
      if (actions.length === 0) return;
      const token = state.fireActionCascadeAnalystPro();
      const ops = executeCascade(actions, event);
      for (const op of ops) applyTargetOp(op, token);
    });
  }, []);
}

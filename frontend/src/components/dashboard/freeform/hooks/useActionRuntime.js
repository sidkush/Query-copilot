import { useEffect } from 'react';
import { useStore } from '../../../../store';
import { subscribe } from '../lib/markEventBus';
import { executeCascade } from '../lib/actionExecutor';
import { buildAdditionalFilters } from '../lib/filterApplication';

function applyTargetOp(op, token) {
  const store = useStore.getState();
  switch (op.kind) {
    case 'filter': {
      const snapshot = store.analystProDashboard?.sets || [];
      const filters = buildAdditionalFilters(op, snapshot);
      if (filters.length === 0) {
        store.clearSheetFilterAnalystPro(op.sheetId);
      } else {
        store.setSheetFilterAnalystPro(op.sheetId, filters);
      }
      store.markCascadeTargetStatus(op.sheetId, 'pending', token);
      // AnalystProWorksheetTile (Plan 4a T8) observes the slice, kicks off
      // the re-query, and calls markCascadeTargetStatus(..., 'done', token)
      // once the response arrives.
      break;
    }
    case 'highlight': {
      const fieldValues = op.fieldValues || {};
      if (Object.keys(fieldValues).length === 0) {
        store.clearSheetHighlightAnalystPro(op.sheetId);
      } else {
        store.setSheetHighlightAnalystPro(op.sheetId, fieldValues);
      }
      store.markCascadeTargetStatus(op.sheetId, 'done', token);
      break;
    }
    case 'url':
      if (op.urlTarget === 'new-tab' && typeof window !== 'undefined') {
        window.open(op.url, '_blank', 'noopener');
      }
      break;
    case 'goto-sheet': {
      if (typeof document === 'undefined') break;
      const el = document.querySelector(`[data-zone="${op.sheetId}"]`);
      if (!el) break;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('analyst-pro-zone-pulse');
      setTimeout(() => el.classList.remove('analyst-pro-zone-pulse'), 1200);
      break;
    }
    case 'change-parameter': {
      if (op.value === undefined) break;
      store.setParameterValueAnalystPro(op.parameterId, op.value);
      break;
    }
    case 'change-set': {
      const existing = store.analystProDashboard?.sets || [];
      const target = existing.find((x) => x.id === op.setId);
      if (!target) break;
      let mode = op.operation;
      if (mode === 'toggle') {
        const first = op.members[0];
        mode = first !== undefined && target.members.includes(first) ? 'remove' : 'add';
      }
      store.applySetChangeAnalystPro(op.setId, mode, op.members);
      break;
    }
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

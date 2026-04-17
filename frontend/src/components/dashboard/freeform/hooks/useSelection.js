// frontend/src/components/dashboard/freeform/hooks/useSelection.js
import { useStore } from '../../../../store';

/**
 * Selection state + helpers for Analyst Pro canvas.
 *
 * Returns: { selection, isSelected(id), select(id), addToSelection(id),
 *            removeFromSelection(id), toggleSelection(id), clearSelection(),
 *            selectMany(ids) }
 *
 * `selection` is a Set<string> of zone ids. Mutations via the returned
 * helpers go through the store, so components re-render reactively.
 */
export function useSelection() {
  const selection = useStore((s) => s.analystProSelection);
  const set = useStore((s) => s.setAnalystProSelection);
  const add = useStore((s) => s.addToSelection);
  const remove = useStore((s) => s.removeFromSelection);
  const clear = useStore((s) => s.clearSelection);

  return {
    selection,
    isSelected: (id) => selection.has(id),
    select: (id) => set(id),
    addToSelection: (id) => add(id),
    removeFromSelection: (id) => remove(id),
    toggleSelection: (id) => {
      if (selection.has(id)) remove(id);
      else add(id);
    },
    clearSelection: () => clear(),
    selectMany: (ids) => set(ids),
  };
}

// frontend/src/components/dashboard/freeform/lib/commandHistory.ts
/**
 * Undo/redo history as an immutable ring buffer of state snapshots.
 *
 * Shape: { past: T[], present: T, future: T[] }
 *   - past: states older than current (most recent first)
 *   - present: current state
 *   - future: states newer than current (result of undos)
 *
 * pushSnapshot(new) → past = [present, ...past], present = new, future = []
 * undo()            → past[0] becomes present, present joins future
 * redo()            → future[0] becomes present, present joins past
 *
 * Immutable: every op returns a new history object.
 */

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  maxEntries: number;
};

export function createHistory<T>(initial: T, options?: { maxEntries?: number }): History<T> {
  return {
    past: [],
    present: initial,
    future: [],
    maxEntries: options?.maxEntries ?? 500,
  };
}

export function pushSnapshot<T>(h: History<T>, next: T): History<T> {
  const newPast = [h.present, ...h.past].slice(0, h.maxEntries);
  return { ...h, past: newPast, present: next, future: [] };
}

export function undo<T>(h: History<T>): { history: History<T>; state: T } {
  if (h.past.length === 0) return { history: h, state: h.present };
  const [prev, ...restPast] = h.past;
  const newHistory: History<T> = {
    ...h,
    past: restPast,
    present: prev,
    future: [h.present, ...h.future],
  };
  return { history: newHistory, state: prev };
}

export function redo<T>(h: History<T>): { history: History<T>; state: T } {
  if (h.future.length === 0) return { history: h, state: h.present };
  const [next, ...restFuture] = h.future;
  const newHistory: History<T> = {
    ...h,
    past: [h.present, ...h.past],
    present: next,
    future: restFuture,
  };
  return { history: newHistory, state: next };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}

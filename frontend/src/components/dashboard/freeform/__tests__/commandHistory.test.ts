// frontend/src/components/dashboard/freeform/__tests__/commandHistory.test.ts
import { describe, it, expect } from 'vitest';
import { createHistory, pushSnapshot, undo, redo, canUndo, canRedo } from '../lib/commandHistory';

describe('commandHistory', () => {
  it('starts empty; cannot undo or redo', () => {
    const h = createHistory({ a: 1 });
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('pushes a snapshot and can undo it', () => {
    let h = createHistory({ n: 0 });
    h = pushSnapshot(h, { n: 1 });
    expect(canUndo(h)).toBe(true);
    const { history: h2, state } = undo(h);
    expect(state).toEqual({ n: 0 });
    expect(canUndo(h2)).toBe(false);
    expect(canRedo(h2)).toBe(true);
  });

  it('redo restores the most recently undone state', () => {
    let h = createHistory({ n: 0 });
    h = pushSnapshot(h, { n: 1 });
    h = pushSnapshot(h, { n: 2 });
    const afterUndo = undo(h);
    expect(afterUndo.state).toEqual({ n: 1 });
    const afterRedo = redo(afterUndo.history);
    expect(afterRedo.state).toEqual({ n: 2 });
  });

  it('pushing after undo discards the redo stack', () => {
    let h = createHistory({ n: 0 });
    h = pushSnapshot(h, { n: 1 });
    h = pushSnapshot(h, { n: 2 });
    const afterUndo = undo(h);
    const afterPush = pushSnapshot(afterUndo.history, { n: 5 });
    expect(canRedo(afterPush)).toBe(false);
  });

  it('caps history at maxEntries', () => {
    let h = createHistory({ n: 0 }, { maxEntries: 3 });
    for (let i = 1; i <= 5; i++) h = pushSnapshot(h, { n: i });
    // Last 3 push-states retained. Can undo 3 times before history exhausted.
    let state;
    ({ history: h, state } = undo(h));
    ({ history: h, state } = undo(h));
    ({ history: h, state } = undo(h));
    expect(canUndo(h)).toBe(false);
    expect(state).toEqual({ n: 2 }); // oldest retained previous state
  });
});

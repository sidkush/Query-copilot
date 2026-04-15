/**
 * FrameBudgetTracker tests (vitest).
 */
import { FrameBudgetTracker } from '../../perf/frameBudgetTracker';

test('starts in normal state', () => {
  const t = new FrameBudgetTracker();
  expect(t.getState()).toBe('normal');
});

test('transitions to loose when all frames are fast', () => {
  const t = new FrameBudgetTracker({ holdMs: 0 });
  for (let i = 0; i < 60; i++) t.recordFrameTime(8);
  expect(t.getState()).toBe('loose');
});

test('transitions to tight when p95 frame time crosses 28ms', () => {
  const t = new FrameBudgetTracker({ holdMs: 0 });
  for (let i = 0; i < 60; i++) t.recordFrameTime(40);
  expect(t.getState()).toBe('tight');
});

test('hysteresis prevents single-frame flapping', () => {
  const t = new FrameBudgetTracker({ holdMs: 200 });
  for (let i = 0; i < 60; i++) t.recordFrameTime(40);
  // Hold time hasn't elapsed at wall-clock t=0 — state still normal
  expect(t.getState()).toBe('normal');
});

test('listener is called on state change', () => {
  const t = new FrameBudgetTracker({ holdMs: 0 });
  let lastState = '';
  t.subscribe((s) => {
    lastState = s;
  });
  for (let i = 0; i < 60; i++) t.recordFrameTime(8);
  expect(lastState).toBe('loose');
});

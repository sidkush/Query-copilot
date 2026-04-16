/**
 * FrameBudgetTracker tests (vitest).
 */
import { FrameBudgetTracker, PerTileTracker } from '../../perf/frameBudgetTracker';

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

// PerTileTracker tests

test('test_per_tile_records_and_returns_state — fast frames → loose, slow frames → tight', () => {
  const tracker = new PerTileTracker();

  // 10 fast frames (8ms each) → p95 = 8ms < 12ms → 'loose'
  for (let i = 0; i < 10; i++) tracker.recordTileFrame('tile-fast', 8);
  expect(tracker.getTileBudgetState('tile-fast')).toBe('loose');

  // 10 slow frames (40ms each) → p95 = 40ms ≥ 28ms → 'tight'
  for (let i = 0; i < 10; i++) tracker.recordTileFrame('tile-slow', 40);
  expect(tracker.getTileBudgetState('tile-slow')).toBe('tight');
});

test('test_per_tile_remove_clears_buffer — getTileBudgetState returns normal after remove', () => {
  const tracker = new PerTileTracker();

  // Seed a tile with slow frames so it would return 'tight'
  for (let i = 0; i < 10; i++) tracker.recordTileFrame('tile-a', 40);
  expect(tracker.getTileBudgetState('tile-a')).toBe('tight');

  // Remove the tile — buffer gone, unknown tile → 'normal'
  tracker.removeTile('tile-a');
  expect(tracker.getTileBudgetState('tile-a')).toBe('normal');
  expect(tracker.activeTileCount()).toBe(0);
});

test('test_per_tile_independent_tiles — tile-a fast + tile-b slow → different states', () => {
  const tracker = new PerTileTracker();

  // tile-a: fast
  for (let i = 0; i < 10; i++) tracker.recordTileFrame('tile-a', 8);
  // tile-b: slow
  for (let i = 0; i < 10; i++) tracker.recordTileFrame('tile-b', 40);

  expect(tracker.getTileBudgetState('tile-a')).toBe('loose');
  expect(tracker.getTileBudgetState('tile-b')).toBe('tight');
  expect(tracker.activeTileCount()).toBe(2);
});

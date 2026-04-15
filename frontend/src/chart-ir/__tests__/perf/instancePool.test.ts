/**
 * InstancePool tests (vitest).
 */
import { InstancePool } from '../../perf/instancePool';

test('acquires and releases slots', () => {
  const p = new InstancePool({ max: 4 });
  p.acquireSlot('vega-canvas', 'a', () => {});
  p.acquireSlot('deck', 'b', () => {});
  expect(p.activeWebglContexts()).toBe(1);
  expect(p.estimatedMemoryMb()).toBe(12 + 80);
  p.releaseSlot('a');
  p.releaseSlot('b');
  expect(p.activeWebglContexts()).toBe(0);
});

test('LRU eviction prefers WebGL kinds when contexts are tight', () => {
  const p = new InstancePool({ max: 3 });
  let evicted = '';
  p.acquireSlot('vega-canvas', 'older-vega', () => {
    evicted += 'older-vega,';
  });
  p.acquireSlot('deck', 'older-deck', () => {
    evicted += 'older-deck,';
  });
  p.acquireSlot('vega-canvas', 'newer-vega', () => {
    evicted += 'newer-vega,';
  });
  p.acquireSlot('deck', 'fresh-deck', () => {
    evicted += 'fresh-deck,';
  });
  // `older-deck` should be evicted preferentially (LRU AND WebGL kind)
  expect(evicted).toMatch(/older-deck/);
});

test('touchSlot updates LRU position', () => {
  const p = new InstancePool({ max: 2 });
  let evicted = '';
  p.acquireSlot('vega-canvas', 'a', () => {
    evicted += 'a,';
  });
  p.acquireSlot('vega-canvas', 'b', () => {
    evicted += 'b,';
  });
  p.touchSlot('a'); // a is now newer than b
  p.acquireSlot('vega-canvas', 'c', () => {
    evicted += 'c,';
  });
  expect(evicted).toMatch(/b/);
  expect(evicted).not.toMatch(/a/);
});

test('pressureRatio reflects max(webglRatio, memoryRatio)', () => {
  const p = new InstancePool({ max: 4, memoryCapMb: 200 });
  p.acquireSlot('deck', 'a', () => {});
  p.acquireSlot('deck', 'b', () => {});
  // 2/4 = 0.5 webgl, 160/200 = 0.8 memory
  expect(p.pressureRatio()).toBe(0.8);
});

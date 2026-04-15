/**
 * InstancePool tests. Runs via `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstancePool } from './instancePool.js';

test('acquires and releases slots', () => {
  const p = new InstancePool({ max: 4 });
  p.acquireSlot('vega-canvas', 'a', () => {});
  p.acquireSlot('deck', 'b', () => {});
  assert.equal(p.activeWebglContexts(), 1);
  assert.equal(p.estimatedMemoryMb(), 12 + 80);
  p.releaseSlot('a');
  p.releaseSlot('b');
  assert.equal(p.activeWebglContexts(), 0);
});

test('LRU eviction prefers WebGL kinds when contexts are tight', () => {
  const p = new InstancePool({ max: 3 });
  let evicted = '';
  p.acquireSlot('vega-canvas', 'older-vega', () => { evicted += 'older-vega,'; });
  p.acquireSlot('deck', 'older-deck', () => { evicted += 'older-deck,'; });
  p.acquireSlot('vega-canvas', 'newer-vega', () => { evicted += 'newer-vega,'; });
  p.acquireSlot('deck', 'fresh-deck', () => { evicted += 'fresh-deck,'; });
  // `older-deck` should be evicted preferentially (LRU AND WebGL kind)
  assert.match(evicted, /older-deck/);
});

test('touchSlot updates LRU position', () => {
  const p = new InstancePool({ max: 2 });
  let evicted = '';
  p.acquireSlot('vega-canvas', 'a', () => { evicted += 'a,'; });
  p.acquireSlot('vega-canvas', 'b', () => { evicted += 'b,'; });
  // Now touch 'a' so 'b' becomes LRU
  p.touchSlot('a');
  p.acquireSlot('vega-canvas', 'c', () => { evicted += 'c,'; });
  assert.match(evicted, /b/);
  assert.doesNotMatch(evicted, /a/);
});

test('pressureRatio reflects max(webglRatio, memoryRatio)', () => {
  const p = new InstancePool({ max: 4, memoryCapMb: 200 });
  p.acquireSlot('deck', 'a', () => {});
  p.acquireSlot('deck', 'b', () => {});
  // 2/4 = 0.5 webgl, 160/200 = 0.8 memory
  assert.equal(p.pressureRatio(), 0.8);
});

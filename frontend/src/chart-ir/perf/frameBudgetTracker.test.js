/**
 * FrameBudgetTracker tests. Runs via `node --test` — no experimental flags.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameBudgetTracker } from './frameBudgetTracker.js';

test('starts in normal state', () => {
  const t = new FrameBudgetTracker();
  assert.equal(t.getState(), 'normal');
});

test('transitions to loose when all frames are fast', () => {
  const t = new FrameBudgetTracker({ holdMs: 0 });
  for (let i = 0; i < 60; i++) t.recordFrameTime(8);
  assert.equal(t.getState(), 'loose');
});

test('transitions to tight when p95 frame time crosses 28ms', () => {
  const t = new FrameBudgetTracker({ holdMs: 0 });
  for (let i = 0; i < 60; i++) t.recordFrameTime(40);
  assert.equal(t.getState(), 'tight');
});

test('hysteresis prevents single-frame flapping', () => {
  const t = new FrameBudgetTracker({ holdMs: 200 });
  for (let i = 0; i < 60; i++) t.recordFrameTime(40);
  // Even though p95 is high, hold time hasn't elapsed — state still normal at t=0
  assert.equal(t.getState(), 'normal');
});

test('listener is called on state change', () => {
  const t = new FrameBudgetTracker({ holdMs: 0 });
  let lastState = '';
  t.subscribe((s) => { lastState = s; });
  for (let i = 0; i < 60; i++) t.recordFrameTime(8);
  assert.equal(lastState, 'loose');
});

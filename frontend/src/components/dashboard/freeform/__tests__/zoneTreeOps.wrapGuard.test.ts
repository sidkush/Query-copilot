// Plan 7 T4 — wrapInContainer wrap-rejection guard.
//
// Context: dragging a worksheet into a tiny cell creates a wrap that produces
// children smaller than 120 px on either axis. At that size, the chart content
// renders as unreadable noise. The guard treats the wrap as a no-op and
// returns tree identity so the drag system's history skip fires.
import { describe, it, expect, vi } from 'vitest';
import { wrapInContainer } from '../lib/zoneTreeOps';
import type { ContainerZone, LeafZone } from '../lib/types';

function makeLeaf(id: string, w = 100000, h = 100000): LeafZone {
  return { id, type: 'blank', w, h };
}

function makeHorzRoot(leaves: LeafZone[]): ContainerZone {
  const even = Math.floor(100000 / leaves.length);
  const drift = 100000 - even * leaves.length;
  const children = leaves.map((l, i) => ({
    ...l,
    w: i === leaves.length - 1 ? even + drift : even,
    h: 100000,
  })) as LeafZone[];
  return { id: 'root', type: 'container-horz', w: 100000, h: 100000, children };
}

describe('Plan 7 T4 — wrapInContainer guard rejects sub-120px cells', () => {
  it('rejects a left-edge wrap that would produce <120 px child width', () => {
    // 8-col horz root at 1000 px canvas → each col ≈ 125 px wide.
    // Wrapping a col at 50/50 → 62 px children. Must be rejected.
    const leaves = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'].map((id) => makeLeaf(id));
    const root = makeHorzRoot(leaves);
    const source = makeLeaf('DRAG_SRC');
    const result = wrapInContainer(root, 'L3', source, 'left', { canvasWPx: 1000, canvasHPx: 800 });
    expect(result).toBe(root); // identity — no-op
  });

  it('rejects a top-edge wrap that would produce <120 px child height on a narrow row', () => {
    // Single-tile root at canvas 2000 × 200. Vertical wrap splits 200/2 = 100 px.
    const root = makeHorzRoot([makeLeaf('L1')]);
    const source = makeLeaf('S1');
    const result = wrapInContainer(root, 'L1', source, 'top', { canvasWPx: 2000, canvasHPx: 200 });
    expect(result).toBe(root);
  });

  it('allows the wrap when resulting children are >= 120 px on both axes', () => {
    const leaves = ['A', 'B', 'C'].map((id) => makeLeaf(id)); // 3-col, ~333 px each at 1000 px
    const root = makeHorzRoot(leaves);
    const source = makeLeaf('SRC');
    const result = wrapInContainer(root, 'B', source, 'left', { canvasWPx: 1000, canvasHPx: 800 });
    expect(result).not.toBe(root); // wrap executed
  });

  it('defaults to Infinity canvas (no rejection) when canvas px omitted — legacy callers unaffected', () => {
    // Even if the proportional split looks tiny, without canvas px we cannot
    // evaluate the guard; legacy tests + callers that don't pass canvas size
    // get the pre-T4 behaviour.
    const leaves = Array.from({ length: 10 }, (_, i) => makeLeaf(`L${i}`));
    const root = makeHorzRoot(leaves);
    const source = makeLeaf('SRC');
    const result = wrapInContainer(root, 'L3', source, 'left');
    expect(result).not.toBe(root);
  });

  it('logs a debug message when the guard rejects a wrap', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const leaves = Array.from({ length: 10 }, (_, i) => makeLeaf(`L${i}`));
    const root = makeHorzRoot(leaves);
    const source = makeLeaf('SRC');
    wrapInContainer(root, 'L3', source, 'left', { canvasWPx: 1000, canvasHPx: 800 });
    const calls = spy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((msg) => msg.includes('Plan 7 T4') && /reject/i.test(msg))).toBe(true);
    spy.mockRestore();
  });
});

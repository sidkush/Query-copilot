// Plan 7 T5 — floating-drag viewport clamp.
//
// Floating zones can currently drag to negative coordinates or past the
// right/bottom canvas edge, rendering them off-screen and appearing to
// "disappear". Tableau clamps floating coordinates to the dashboard rect
// (Build_Tableau.md §E.14). We exercise the pure math via a slim extract
// of applyDragDelta's float-move branch: `clampFloatingMove`.
import { describe, it, expect } from 'vitest';
import { clampFloatingMove } from '../hooks/useDragResize';

describe('Plan 7 T5 — clampFloatingMove (floating-drag viewport clamp)', () => {
  const canvas = { width: 1200, height: 800 };

  it('clamps negative x to 0 (dragged off the left edge)', () => {
    const { x, y } = clampFloatingMove({ nx: -50, ny: 100, pxW: 200, pxH: 150 }, canvas);
    expect(x).toBe(0);
    expect(y).toBe(100);
  });

  it('clamps negative y to 0 (dragged off the top edge)', () => {
    const { x, y } = clampFloatingMove({ nx: 100, ny: -9999, pxW: 200, pxH: 150 }, canvas);
    expect(x).toBe(100);
    expect(y).toBe(0);
  });

  it('clamps x so zone right edge stays inside canvas', () => {
    // nx=1200 would put right edge at 1400 > 1200. Clamp to 1200-200 = 1000.
    const { x } = clampFloatingMove({ nx: 1200, ny: 100, pxW: 200, pxH: 150 }, canvas);
    expect(x).toBe(1000);
  });

  it('clamps y so zone bottom edge stays inside canvas', () => {
    const { y } = clampFloatingMove({ nx: 100, ny: 900, pxW: 200, pxH: 150 }, canvas);
    // 900 would put bottom at 1050 > 800. Clamp to 800-150 = 650.
    expect(y).toBe(650);
  });

  it('passes coords through unchanged when zone fits inside canvas', () => {
    const { x, y } = clampFloatingMove({ nx: 400, ny: 300, pxW: 200, pxH: 150 }, canvas);
    expect(x).toBe(400);
    expect(y).toBe(300);
  });

  it('skips clamping when canvas size is missing (safe fallback)', () => {
    const { x, y } = clampFloatingMove({ nx: -50, ny: 2000, pxW: 200, pxH: 150 }, null);
    expect(x).toBe(-50);
    expect(y).toBe(2000);
  });

  it('handles a zone bigger than the canvas (pin to 0 rather than negative)', () => {
    // pxW=1400 > canvas.width=1200. No non-negative x keeps right edge inside.
    const { x, y } = clampFloatingMove({ nx: 50, ny: 50, pxW: 1400, pxH: 1000 }, canvas);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { computeFlyoutPosition } from '../lib/flyoutPosition';

describe('computeFlyoutPosition — submenu flyout placement', () => {
  const viewport = { width: 1000, height: 800 };
  const flyoutSize = { width: 200, height: 260 };

  it('places flyout to the right of the parent row when there is room', () => {
    const parentRect = { left: 100, right: 320, top: 200, bottom: 230 };
    const { x, y } = computeFlyoutPosition(parentRect, flyoutSize, viewport);
    expect(x).toBe(322); // right + 2
    expect(y).toBe(200);
  });

  it('flips flyout to the left when right placement would overflow viewport', () => {
    // Parent row hugs the right edge: right=900. Right placement would be 902 + 200 = 1102 > 1000.
    const parentRect = { left: 760, right: 900, top: 300, bottom: 330 };
    const { x, y } = computeFlyoutPosition(parentRect, flyoutSize, viewport);
    expect(x).toBe(760 - 2 - 200); // left - gap - width
    expect(y).toBe(300);
  });

  it('clamps y upward when flyout bottom would overflow viewport', () => {
    const parentRect = { left: 100, right: 300, top: 700, bottom: 730 };
    const { x, y } = computeFlyoutPosition(parentRect, flyoutSize, viewport);
    expect(x).toBe(302);
    // top=700, height=260 → bottom=960 > 800. Shift up so bottom = 800 → y = 540.
    expect(y).toBe(540);
  });

  it('pins to 0 when both left and right placements overflow (narrow viewport)', () => {
    const narrow = { width: 150, height: 800 };
    const parentRect = { left: 20, right: 100, top: 10, bottom: 40 };
    const { x } = computeFlyoutPosition(parentRect, flyoutSize, narrow);
    expect(x).toBe(0);
  });
});

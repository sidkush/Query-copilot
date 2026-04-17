import { describe, it, expect } from 'vitest';
import { screenToSheet, sheetToScreen, zoomAtAnchor } from '../lib/canvasTransform';

const rect = { left: 50, top: 80, width: 1200, height: 800 } as DOMRect;

describe('screenToSheet', () => {
  it('identity transform (zoom=1, pan={0,0}) subtracts the rect origin', () => {
    expect(screenToSheet({ clientX: 250, clientY: 280 }, rect, 1, { x: 0, y: 0 }))
      .toEqual({ x: 200, y: 200 });
  });

  it('accounts for pan', () => {
    expect(screenToSheet({ clientX: 250, clientY: 280 }, rect, 1, { x: 40, y: 30 }))
      .toEqual({ x: 160, y: 170 });
  });

  it('accounts for zoom', () => {
    expect(screenToSheet({ clientX: 250, clientY: 280 }, rect, 2, { x: 0, y: 0 }))
      .toEqual({ x: 100, y: 100 });
  });

  it('screenToSheet ∘ sheetToScreen == identity', () => {
    const zoom = 1.75;
    const pan = { x: -42, y: 17 };
    const sheetPt = { x: 321, y: 654 };
    const screen = sheetToScreen(sheetPt, rect, zoom, pan);
    const back = screenToSheet({ clientX: screen.clientX, clientY: screen.clientY }, rect, zoom, pan);
    expect(back.x).toBeCloseTo(sheetPt.x, 6);
    expect(back.y).toBeCloseTo(sheetPt.y, 6);
  });
});

describe('zoomAtAnchor', () => {
  it('keeps sheet point under cursor fixed after zoom change', () => {
    const cursor = { clientX: 250, clientY: 280 };
    const currentZoom = 1;
    const currentPan = { x: 0, y: 0 };
    const before = screenToSheet(cursor, rect, currentZoom, currentPan);
    expect(before).toEqual({ x: 200, y: 200 });

    const { zoom, pan } = zoomAtAnchor(currentZoom, currentPan, 2, cursor, rect);
    expect(zoom).toBe(2);
    const after = screenToSheet(cursor, rect, zoom, pan);
    expect(after.x).toBeCloseTo(200, 6);
    expect(after.y).toBeCloseTo(200, 6);
  });

  it('clamps zoom to [0.1, 4.0]', () => {
    const cursor = { clientX: 250, clientY: 280 };
    expect(zoomAtAnchor(1, { x: 0, y: 0 }, 99, cursor, rect).zoom).toBe(4.0);
    expect(zoomAtAnchor(1, { x: 0, y: 0 }, 0.001, cursor, rect).zoom).toBe(0.1);
  });
});

import { describe, it, expect } from 'vitest';
import { applyDeviceOverrides, resolveDeviceCanvasSize } from '../lib/deviceLayout';

const baseDashboard = {
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1',
  name: 'T',
  archetype: 'analyst-pro',
  size: { mode: 'fixed', preset: 'desktop', width: 1366, height: 768 },
  tiledRoot: {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children: [
      { id: 'z1', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 's1' },
      { id: 'z2', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 's2' },
    ],
  },
  floatingLayer: [
    { id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 100, y: 100, pxW: 200, pxH: 100, zIndex: 1 },
  ],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [],
  deviceLayouts: {
    phone: {
      zoneOverrides: {
        z2: { visible: false },
        f1: { x: 10, y: 10, w: 300, h: 200 },
      },
    },
  },
};

describe('applyDeviceOverrides', () => {
  it('returns the dashboard unchanged for device=desktop', () => {
    const out = applyDeviceOverrides(baseDashboard, 'desktop');
    expect(out).toBe(baseDashboard);
  });

  it('returns the dashboard unchanged when deviceLayouts[device] missing', () => {
    const out = applyDeviceOverrides(baseDashboard, 'tablet');
    expect(out).toBe(baseDashboard);
  });

  it('applies visibility override for a tiled zone without mutating the tree', () => {
    const out = applyDeviceOverrides(baseDashboard, 'phone');
    expect(out).not.toBe(baseDashboard);
    expect(baseDashboard.tiledRoot.children[1].id).toBe('z2');
    expect(baseDashboard.tiledRoot.children[1]).not.toHaveProperty('hidden');
    const z2 = out.tiledRoot.children.find((c: any) => c.id === 'z2');
    expect(z2.hidden).toBe(true);
    expect(z2.worksheetRef).toBe('s2');
  });

  it('applies {x,y,w,h} override to a floating zone', () => {
    const out = applyDeviceOverrides(baseDashboard, 'phone');
    const f1 = out.floatingLayer.find((z: any) => z.id === 'f1');
    expect(f1).toMatchObject({ x: 10, y: 10, pxW: 300, pxH: 200 });
    expect(baseDashboard.floatingLayer[0]).toMatchObject({ x: 100, y: 100, pxW: 200, pxH: 100 });
  });

  it('ignores override keys that do not name an existing zone', () => {
    const dash = {
      ...baseDashboard,
      deviceLayouts: { phone: { zoneOverrides: { ghost: { visible: false } } } },
    };
    const out = applyDeviceOverrides(dash, 'phone');
    expect(out.tiledRoot.children.length).toBe(2);
  });
});

describe('resolveDeviceCanvasSize', () => {
  it('desktop returns dashboard.size unchanged', () => {
    expect(resolveDeviceCanvasSize(baseDashboard.size as any, 'desktop')).toEqual(baseDashboard.size);
  });

  it('tablet returns 1024x768 fixed preset', () => {
    expect(resolveDeviceCanvasSize(baseDashboard.size as any, 'tablet'))
      .toEqual({ mode: 'fixed', preset: 'ipad-landscape', width: 1024, height: 768 });
  });

  it('phone returns 375x667 fixed preset', () => {
    expect(resolveDeviceCanvasSize(baseDashboard.size as any, 'phone'))
      .toEqual({ mode: 'fixed', preset: 'phone', width: 375, height: 667 });
  });
});

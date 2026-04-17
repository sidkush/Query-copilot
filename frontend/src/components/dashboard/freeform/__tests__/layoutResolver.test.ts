import { describe, it, expect } from 'vitest';
import { resolveLayout } from '../lib/layoutResolver';
import type { ContainerZone, FloatingZone } from '../lib/types';

describe('resolveLayout', () => {
  it('resolves a flat horz container split 50/50 in a 1000x500 canvas', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 50000, h: 100000 },
        { id: 'b', type: 'blank', w: 50000, h: 100000 },
      ],
    };
    const result = resolveLayout(root, [], 1000, 500);
    expect(result).toHaveLength(3); // root + 2 children
    const rootResolved = result.find((r) => r.zone.id === 'root');
    expect(rootResolved).toMatchObject({ x: 0, y: 0, width: 1000, height: 500 });
    const a = result.find((r) => r.zone.id === 'a');
    expect(a).toMatchObject({ x: 0, y: 0, width: 500, height: 500 });
    const b = result.find((r) => r.zone.id === 'b');
    expect(b).toMatchObject({ x: 500, y: 0, width: 500, height: 500 });
  });

  it('resolves vert container splitting height by children h', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'top', type: 'blank', w: 100000, h: 25000 },
        { id: 'bot', type: 'blank', w: 100000, h: 75000 },
      ],
    };
    const result = resolveLayout(root, [], 800, 600);
    const top = result.find((r) => r.zone.id === 'top');
    const bot = result.find((r) => r.zone.id === 'bot');
    expect(top).toMatchObject({ x: 0, y: 0, width: 800, height: 150 });
    expect(bot).toMatchObject({ x: 0, y: 150, width: 800, height: 450 });
  });

  it('resolves nested containers recursively', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'kpi-row',
          type: 'container-horz',
          w: 100000,
          h: 25000,
          children: [
            { id: 'kpi1', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'w1' },
            { id: 'kpi2', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'w2' },
          ],
        },
      ],
    };
    const result = resolveLayout(root, [], 1000, 800);
    const kpi1 = result.find((r) => r.zone.id === 'kpi1');
    expect(kpi1).toMatchObject({ x: 0, y: 0, width: 500, height: 200 });
    const kpi2 = result.find((r) => r.zone.id === 'kpi2');
    expect(kpi2).toMatchObject({ x: 500, y: 0, width: 500, height: 200 });
  });

  it('passes through floating zones as-is (pixel coords)', () => {
    const root: ContainerZone = { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] };
    const floats: FloatingZone[] = [
      { id: 'f1', type: 'legend', floating: true, x: 100, y: 50, pxW: 200, pxH: 300, zIndex: 10, w: 0, h: 0 },
    ];
    const result = resolveLayout(root, floats, 1000, 800);
    const f = result.find((r) => r.zone.id === 'f1');
    expect(f).toMatchObject({ x: 100, y: 50, width: 200, height: 300 });
  });
});

import { describe, it, expect } from 'vitest';
import { findZoneById, traverseZones, isContainer } from '../lib/zoneTree';
import type { ContainerZone } from '../lib/types';

const sample: ContainerZone = {
  id: 'root',
  type: 'container-vert',
  w: 100000,
  h: 100000,
  children: [
    {
      id: 'r1',
      type: 'container-horz',
      w: 100000,
      h: 50000,
      children: [
        { id: 'kpi1', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'ws1' },
        { id: 'kpi2', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'ws2' },
      ],
    },
    { id: 'chart', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws3' },
  ],
};

describe('findZoneById', () => {
  it('finds the root', () => {
    expect(findZoneById(sample, 'root')?.id).toBe('root');
  });
  it('finds a nested leaf', () => {
    expect(findZoneById(sample, 'kpi2')?.id).toBe('kpi2');
  });
  it('returns null for missing id', () => {
    expect(findZoneById(sample, 'nonexistent')).toBeNull();
  });
});

describe('traverseZones', () => {
  it('visits every node depth-first', () => {
    const ids: string[] = [];
    traverseZones(sample, (z) => ids.push(z.id));
    expect(ids).toEqual(['root', 'r1', 'kpi1', 'kpi2', 'chart']);
  });
});

describe('isContainer', () => {
  it('returns true for containers', () => {
    expect(isContainer(sample)).toBe(true);
  });
  it('returns false for leaves', () => {
    expect(isContainer(sample.children[1])).toBe(false);
  });
});

import { normalizeContainer } from '../lib/zoneTree';

describe('normalizeContainer', () => {
  it('normalizes horz children w values to sum 100000', () => {
    const c: ContainerZone = {
      id: 'c',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 30000, h: 100000 },
        { id: 'b', type: 'blank', w: 30000, h: 100000 },
        { id: 'c', type: 'blank', w: 40000, h: 100000 },
      ],
    };
    const result = normalizeContainer(c);
    const sum = result.children.reduce((s, ch) => s + ch.w, 0);
    expect(sum).toBe(100000);
  });

  it('normalizes off-balance values proportionally', () => {
    const c: ContainerZone = {
      id: 'c',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 20000, h: 100000 },
        { id: 'b', type: 'blank', w: 30000, h: 100000 },
      ],
    };
    const result = normalizeContainer(c);
    // 20000 : 30000 ratio preserved, scaled to sum 100000 → 40000 : 60000
    expect(result.children[0].w).toBe(40000);
    expect(result.children[1].w).toBe(60000);
  });

  it('vert container normalizes h, leaves w untouched', () => {
    const c: ContainerZone = {
      id: 'c',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 100000, h: 25000 },
        { id: 'b', type: 'blank', w: 100000, h: 25000 },
      ],
    };
    const result = normalizeContainer(c);
    const sumH = result.children.reduce((s, ch) => s + ch.h, 0);
    expect(sumH).toBe(100000);
  });

  it('returns zero-sum container unchanged (edge case)', () => {
    const c: ContainerZone = {
      id: 'c',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [],
    };
    expect(normalizeContainer(c)).toEqual(c);
  });
});

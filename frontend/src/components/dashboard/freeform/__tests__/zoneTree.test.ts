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

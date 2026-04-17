import { describe, it, expect } from 'vitest';
import {
  dedupMembers,
  applySetChange,
  validateDimension,
  validateSetName,
} from '../lib/setOps';
import { MAX_SET_MEMBERS, type DashboardSet } from '../lib/setTypes';

const mkSet = (members: (string | number)[] = []): DashboardSet => ({
  id: 's1',
  name: 'Top Regions',
  dimension: 'region',
  members,
  createdAt: '2026-04-16T00:00:00Z',
});

describe('dedupMembers', () => {
  it('preserves first-seen order', () => {
    expect(dedupMembers(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('treats string and number as distinct', () => {
    expect(dedupMembers([1, '1', 2, '2', 1])).toEqual([1, '1', 2, '2']);
  });

  it('returns a new array even when input is already unique', () => {
    const input = ['a', 'b'];
    const out = dedupMembers(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('drops non-primitive members silently', () => {
    // @ts-expect-error — runtime guard for stray values
    expect(dedupMembers(['a', null, undefined, { x: 1 }, 'b'])).toEqual(['a', 'b']);
  });
});

describe('applySetChange', () => {
  it('add appends new members, preserves existing order', () => {
    const out = applySetChange(mkSet(['East', 'West']), ['West', 'North'], 'add');
    expect(out.members).toEqual(['East', 'West', 'North']);
  });

  it('remove drops matching members, preserves remaining order', () => {
    const out = applySetChange(mkSet(['East', 'West', 'North']), ['West'], 'remove');
    expect(out.members).toEqual(['East', 'North']);
  });

  it('replace swaps entire member list, deduped', () => {
    const out = applySetChange(mkSet(['East']), ['West', 'North', 'West'], 'replace');
    expect(out.members).toEqual(['West', 'North']);
  });

  it('clear empties members regardless of second arg', () => {
    const out = applySetChange(mkSet(['East', 'West']), ['ignored'], 'clear');
    expect(out.members).toEqual([]);
  });

  it('returns a new set object (no mutation)', () => {
    const before = mkSet(['East']);
    const after = applySetChange(before, ['West'], 'add');
    expect(after).not.toBe(before);
    expect(before.members).toEqual(['East']);
  });

  it('truncates add at MAX_SET_MEMBERS', () => {
    const existing = Array.from({ length: MAX_SET_MEMBERS - 1 }, (_, i) => `m${i}`);
    const out = applySetChange(mkSet(existing), ['x', 'y', 'z'], 'add');
    expect(out.members.length).toBe(MAX_SET_MEMBERS);
    expect(out.members[MAX_SET_MEMBERS - 1]).toBe('x');
  });

  it('truncates replace at MAX_SET_MEMBERS', () => {
    const giant = Array.from({ length: MAX_SET_MEMBERS + 10 }, (_, i) => i);
    const out = applySetChange(mkSet(), giant, 'replace');
    expect(out.members.length).toBe(MAX_SET_MEMBERS);
  });

  it('drops non-primitive incoming members', () => {
    // @ts-expect-error — runtime guard
    const out = applySetChange(mkSet(), ['a', null, { bad: true }, 1], 'replace');
    expect(out.members).toEqual(['a', 1]);
  });
});

describe('validateDimension', () => {
  it('accepts plain identifiers', () => {
    expect(validateDimension('region')).toBe(true);
    expect(validateDimension('customer_segment')).toBe(true);
    expect(validateDimension('_x1')).toBe(true);
  });

  it('rejects whitespace, punctuation, leading digits, empty', () => {
    expect(validateDimension('bad field')).toBe(false);
    expect(validateDimension('1bad')).toBe(false);
    expect(validateDimension('x.y')).toBe(false);
    expect(validateDimension('')).toBe(false);
  });
});

describe('validateSetName', () => {
  it('rejects empty / whitespace-only names', () => {
    expect(validateSetName('', [])).toEqual({ ok: false, reason: 'empty' });
    expect(validateSetName('   ', [])).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects case-insensitive duplicates', () => {
    const existing = [mkSet()]; // name 'Top Regions'
    expect(validateSetName('top regions', existing)).toEqual({ ok: false, reason: 'duplicate' });
    expect(validateSetName('TOP REGIONS', existing)).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('accepts a unique name', () => {
    expect(validateSetName('Bottom Regions', [mkSet()])).toEqual({ ok: true });
  });

  it('ignores the set being renamed when its own id is passed', () => {
    const existing = [mkSet()];
    expect(validateSetName('Top Regions', existing, 's1')).toEqual({ ok: true });
  });
});

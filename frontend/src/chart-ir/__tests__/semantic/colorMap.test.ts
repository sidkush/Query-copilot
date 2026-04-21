import { describe, it, expect } from 'vitest';
import {
  resolveColor,
  validateColorMap,
} from '../../semantic/colorMap';
import type { ColorMap } from '../../semantic/colorMap';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMap(overrides: Partial<ColorMap> = {}): ColorMap {
  return {
    version: 1,
    conn_id: 'conn-abc123',
    updated_at: '2026-04-15T00:00:00Z',
    assignments: {
      'region:Europe': '#4a8fe7',
      'region:Asia': '#e74c3c',
      'orders.region:Europe': '#1a2bcc',
      'status:shipped': '#2ecc71',
    },
    changelog: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveColor (5 tests)
// ---------------------------------------------------------------------------

describe('resolveColor', () => {
  it('returns hex for exact column:value match', () => {
    const map = makeMap();
    expect(resolveColor(map, 'status', 'shipped')).toBe('#2ecc71');
  });

  it('returns undefined for unassigned value', () => {
    const map = makeMap();
    expect(resolveColor(map, 'region', 'Africa')).toBeUndefined();
  });

  it('prefers table-qualified match when tableName provided', () => {
    const map = makeMap();
    // 'orders.region:Europe' (#1a2bcc) should win over 'region:Europe' (#4a8fe7)
    expect(resolveColor(map, 'region', 'Europe', 'orders')).toBe('#1a2bcc');
  });

  it('falls back to unqualified when no table-qualified match exists', () => {
    const map = makeMap();
    // 'orders.region:Asia' is NOT in assignments, falls back to 'region:Asia'
    expect(resolveColor(map, 'region', 'Asia', 'orders')).toBe('#e74c3c');
  });

  it('returns undefined for empty assignments', () => {
    const map = makeMap({ assignments: {} });
    expect(resolveColor(map, 'region', 'Europe')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// validateColorMap (4 tests)
// ---------------------------------------------------------------------------

describe('validateColorMap', () => {
  it('accepts a well-formed color map', () => {
    const result = validateColorMap(makeMap());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects empty conn_id', () => {
    const result = validateColorMap(makeMap({ conn_id: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /conn_id/.test(e))).toBe(true);
  });

  it('rejects non-hex color values', () => {
    const result = validateColorMap(
      makeMap({ assignments: { 'region:Europe': 'blue' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /hex color/.test(e))).toBe(true);
  });

  it('rejects keys without colon separator', () => {
    const result = validateColorMap(
      makeMap({ assignments: { regionEurope: '#4a8fe7' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /":"/.test(e))).toBe(true);
  });
});

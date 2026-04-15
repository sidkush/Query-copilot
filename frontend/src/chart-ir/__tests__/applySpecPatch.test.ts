import { describe, it, expect } from 'vitest';
import {
  applySpecPatch,
  parsePointer,
  PatchError,
  type Patch,
} from '../applySpecPatch';
import type { ChartSpec } from '../types';
import { SIMPLE_BAR, TIME_SERIES_LINE } from './fixtures/canonical-charts';

describe('parsePointer', () => {
  it('returns an empty array for the empty pointer', () => {
    expect(parsePointer('')).toEqual([]);
  });

  it('parses a single-level pointer', () => {
    expect(parsePointer('/mark')).toEqual(['mark']);
  });

  it('parses a nested pointer', () => {
    expect(parsePointer('/encoding/color/field')).toEqual([
      'encoding',
      'color',
      'field',
    ]);
  });

  it('unescapes ~1 to / and ~0 to ~', () => {
    expect(parsePointer('/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
  });

  it('throws on a pointer that does not start with /', () => {
    expect(() => parsePointer('mark')).toThrow();
  });
});

describe('applySpecPatch — replace', () => {
  it('replaces a top-level mark', () => {
    const patch: Patch = [{ op: 'replace', path: '/mark', value: 'line' }];
    const next = applySpecPatch(SIMPLE_BAR, patch);
    expect(next.mark).toBe('line');
    expect(SIMPLE_BAR.mark).toBe('bar'); // original unchanged
  });

  it('replaces a nested encoding channel', () => {
    const newColor = { field: 'region', type: 'nominal' as const };
    const patch: Patch = [
      { op: 'replace', path: '/encoding/x', value: newColor },
    ];
    const next = applySpecPatch(SIMPLE_BAR, patch);
    expect(next.encoding?.x).toEqual(newColor);
    // Other encoding channels still present
    expect(next.encoding?.y).toEqual(SIMPLE_BAR.encoding?.y);
  });

  it('throws when replacing a missing key', () => {
    const patch: Patch = [
      { op: 'replace', path: '/encoding/size', value: { field: 'n', type: 'quantitative' } },
    ];
    expect(() => applySpecPatch(SIMPLE_BAR, patch)).toThrow(PatchError);
  });
});

describe('applySpecPatch — add', () => {
  it('adds a new encoding channel to an existing spec', () => {
    const size = { field: 'population', type: 'quantitative' as const };
    const patch: Patch = [{ op: 'add', path: '/encoding/size', value: size }];
    const next = applySpecPatch(SIMPLE_BAR, patch);
    expect(next.encoding?.size).toEqual(size);
  });

  it('auto-creates intermediate objects when adding to a missing path', () => {
    const bare: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
    };
    const patch: Patch = [
      {
        op: 'add',
        path: '/encoding/x',
        value: { field: 'category', type: 'nominal' },
      },
    ];
    const next = applySpecPatch(bare, patch);
    expect(next.encoding?.x).toEqual({ field: 'category', type: 'nominal' });
  });

  it('inserts into an array at a specific index', () => {
    const layered: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      layer: [SIMPLE_BAR],
    };
    const patch: Patch = [
      { op: 'add', path: '/layer/0', value: TIME_SERIES_LINE },
    ];
    const next = applySpecPatch(layered, patch);
    expect(next.layer?.[0]).toEqual(TIME_SERIES_LINE);
    expect(next.layer?.[1]).toEqual(SIMPLE_BAR);
  });

  it('appends to an array via the `-` terminator', () => {
    const layered: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      layer: [SIMPLE_BAR],
    };
    const patch: Patch = [
      { op: 'add', path: '/layer/-', value: TIME_SERIES_LINE },
    ];
    const next = applySpecPatch(layered, patch);
    expect(next.layer?.length).toBe(2);
    expect(next.layer?.[1]).toEqual(TIME_SERIES_LINE);
  });
});

describe('applySpecPatch — remove', () => {
  it('removes an encoding channel', () => {
    const patch: Patch = [{ op: 'remove', path: '/encoding/color' }];
    const next = applySpecPatch(TIME_SERIES_LINE, patch);
    expect(next.encoding?.color).toBeUndefined();
    expect(next.encoding?.x).toBeDefined(); // siblings untouched
  });

  it('removes an array element', () => {
    const layered: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      layer: [SIMPLE_BAR, TIME_SERIES_LINE],
    };
    const patch: Patch = [{ op: 'remove', path: '/layer/0' }];
    const next = applySpecPatch(layered, patch);
    expect(next.layer?.length).toBe(1);
    expect(next.layer?.[0]).toEqual(TIME_SERIES_LINE);
  });

  it('throws when removing a missing key', () => {
    const patch: Patch = [{ op: 'remove', path: '/encoding/size' }];
    expect(() => applySpecPatch(SIMPLE_BAR, patch)).toThrow(PatchError);
  });
});

describe('applySpecPatch — move + copy', () => {
  it('moves a channel from one key to another', () => {
    const patch: Patch = [
      { op: 'move', from: '/encoding/color', path: '/encoding/shape' },
    ];
    const next = applySpecPatch(TIME_SERIES_LINE, patch);
    expect(next.encoding?.shape).toEqual(TIME_SERIES_LINE.encoding?.color);
    expect(next.encoding?.color).toBeUndefined();
  });

  it('copies a channel without removing the source', () => {
    const patch: Patch = [
      { op: 'copy', from: '/encoding/color', path: '/encoding/shape' },
    ];
    const next = applySpecPatch(TIME_SERIES_LINE, patch);
    expect(next.encoding?.shape).toEqual(TIME_SERIES_LINE.encoding?.color);
    expect(next.encoding?.color).toEqual(TIME_SERIES_LINE.encoding?.color);
  });
});

describe('applySpecPatch — immutability + sequencing', () => {
  it('does not mutate the input spec', () => {
    const frozen = JSON.stringify(SIMPLE_BAR);
    applySpecPatch(SIMPLE_BAR, [{ op: 'replace', path: '/mark', value: 'line' }]);
    expect(JSON.stringify(SIMPLE_BAR)).toBe(frozen);
  });

  it('applies operations sequentially', () => {
    const patch: Patch = [
      { op: 'replace', path: '/mark', value: 'point' },
      {
        op: 'add',
        path: '/encoding/size',
        value: { field: 'value', type: 'quantitative' },
      },
      { op: 'remove', path: '/encoding/x' },
    ];
    const next = applySpecPatch(SIMPLE_BAR, patch);
    expect(next.mark).toBe('point');
    expect(next.encoding?.size).toEqual({ field: 'value', type: 'quantitative' });
    expect(next.encoding?.x).toBeUndefined();
  });

  it('returns the same object when the patch is empty', () => {
    const next = applySpecPatch(SIMPLE_BAR, []);
    expect(next).toBe(SIMPLE_BAR);
  });
});

describe('applySpecPatch — root replace', () => {
  it('replaces the root document when the path is empty', () => {
    const patch: Patch = [{ op: 'replace', path: '', value: TIME_SERIES_LINE }];
    const next = applySpecPatch(SIMPLE_BAR, patch);
    expect(next).toEqual(TIME_SERIES_LINE);
  });
});

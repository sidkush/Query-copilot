/**
 * TSS Phase 4 / Wave 2-B — formatValue pure helper.
 *
 * Deterministic value formatter for bound slot data. KPI kind collapses
 * a single-value result into `{ value, delta? }`; chart / table return
 * rows; narrative returns renderedMarkdown or template.
 */
import { describe, it, expect } from 'vitest';
import { formatValue } from '../formatValue';

describe('formatValue — KPI', () => {
  it('formats a single numeric row into a compact currency string', () => {
    const out = formatValue(
      {
        slotId: 'bp.hero-number',
        tileId: 't1',
        kind: 'kpi',
        measure: { column: 'revenue', agg: 'SUM' },
        isUserPinned: false,
      },
      { columns: ['value'], rows: [{ value: 2_470_000 }] },
      'kpi'
    );
    expect(out).toMatchObject({ value: expect.stringContaining('$') });
    expect((out as { value: string }).value).toContain('M');
  });

  it('returns K suffix for values between 1k and 1M', () => {
    const out = formatValue(
      {
        slotId: 'x',
        tileId: 't1',
        kind: 'kpi',
        measure: { column: 'revenue', agg: 'SUM' },
        isUserPinned: false,
      },
      { columns: ['v'], rows: [{ v: 478_000 }] },
      'kpi'
    );
    expect((out as { value: string }).value).toMatch(/\$?478K/);
  });

  it('emits a delta when two rows (current, prior) supplied', () => {
    const out = formatValue(
      {
        slotId: 'x',
        tileId: 't1',
        kind: 'kpi',
        measure: { column: 'revenue', agg: 'SUM' },
        isUserPinned: false,
      },
      { columns: ['value'], rows: [{ value: 2_470_000 }, { value: 2_200_000 }] },
      'kpi'
    );
    expect(out).toHaveProperty('delta');
    const delta = (out as { delta: string }).delta;
    expect(delta).toMatch(/\+?\d/);
    expect(delta).toContain('%');
  });

  it('negative delta renders with a minus sign', () => {
    const out = formatValue(
      {
        slotId: 'x',
        tileId: 't1',
        kind: 'kpi',
        isUserPinned: false,
      },
      { columns: ['v'], rows: [{ v: 90 }, { v: 100 }] },
      'kpi'
    );
    expect((out as { delta: string }).delta).toContain('−');
  });

  it('percent agg renders with % suffix, no currency', () => {
    const out = formatValue(
      {
        slotId: 'x',
        tileId: 't1',
        kind: 'kpi',
        measure: { column: 'churn_rate', agg: 'AVG' },
        isUserPinned: false,
      },
      { columns: ['value'], rows: [{ value: 2.31 }] },
      'kpi'
    );
    expect((out as { value: string }).value).toContain('%');
    expect((out as { value: string }).value).not.toContain('$');
  });
});

describe('formatValue — Chart', () => {
  it('returns raw rows for chart kind', () => {
    const rows = [{ month: 'Aug', value: 1 }, { month: 'Sep', value: 2 }];
    const out = formatValue(
      {
        slotId: 'x',
        tileId: 't1',
        kind: 'chart',
        isUserPinned: false,
      },
      { columns: ['month', 'value'], rows },
      'chart'
    );
    expect(out).toMatchObject({ rows });
  });
});

describe('formatValue — Table', () => {
  it('returns raw rows for table kind', () => {
    const rows = [{ name: 'Amberline', mrr: 124800 }];
    const out = formatValue(
      {
        slotId: 'x',
        tileId: 't1',
        kind: 'table',
        isUserPinned: false,
      },
      { columns: ['name', 'mrr'], rows },
      'table'
    );
    expect(out).toMatchObject({ rows });
  });
});

describe('formatValue — Narrative', () => {
  it('returns renderedMarkdown when present', () => {
    const out = formatValue(
      {
        slotId: 'x',
        tileId: 't1',
        kind: 'narrative',
        renderedMarkdown: 'Hello **world**',
        isUserPinned: false,
      },
      undefined,
      'narrative'
    );
    expect(out).toBe('Hello **world**');
  });

  it('falls back to markdownTemplate when renderedMarkdown absent', () => {
    const out = formatValue(
      {
        slotId: 'x',
        tileId: 't1',
        kind: 'narrative',
        markdownTemplate: 'hello {x}',
        isUserPinned: false,
      },
      undefined,
      'narrative'
    );
    expect(out).toBe('hello {x}');
  });
});

describe('formatValue — unbound', () => {
  it('returns null when no binding given', () => {
    expect(formatValue(undefined, undefined, 'kpi')).toBeNull();
  });
});

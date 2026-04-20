// frontend/src/components/dashboard/freeform/lib/__tests__/tableCalcEvaluator.test.ts
import { describe, expect, it } from 'vitest';
import { evaluateTableCalc, TableCalcSpec, Row } from '../tableCalcEvaluator';

const baseRows: Row[] = [
  { Region: 'East', Year: 2020, Sales: 100 },
  { Region: 'East', Year: 2021, Sales: 150 },
  { Region: 'East', Year: 2022, Sales: 175 },
  { Region: 'West', Year: 2020, Sales: 200 },
  { Region: 'West', Year: 2021, Sales: 250 },
  { Region: 'West', Year: 2022, Sales: 300 },
];

const ctx = (
  fn: string, opts: Partial<TableCalcSpec> = {},
): TableCalcSpec => ({
  calc_id: 'c1',
  function: fn,
  arg_field: 'Sales',
  addressing: ['Year'],
  partitioning: ['Region'],
  direction: 'specific',
  sort: 'asc',
  offset: null,
  ...opts,
});

describe('LOOKUP', () => {
  it('LOOKUP offset -1 returns prior row in addressing', () => {
    const out = evaluateTableCalc(ctx('LOOKUP', { offset: -1 }), baseRows);
    expect(out[0].c1).toBeNull();      // East/2020 — no prior
    expect(out[1].c1).toBe(100);        // East/2021 ← East/2020
    expect(out[2].c1).toBe(150);        // East/2022 ← East/2021
    expect(out[3].c1).toBeNull();      // West/2020 — partition reset
    expect(out[4].c1).toBe(200);
  });

  it('LOOKUP offset +1 returns next row', () => {
    const out = evaluateTableCalc(ctx('LOOKUP', { offset: 1 }), baseRows);
    expect(out[0].c1).toBe(150);
    expect(out[2].c1).toBeNull();
  });

  it('LOOKUP offset 0 returns same-row value', () => {
    const out = evaluateTableCalc(ctx('LOOKUP', { offset: 0 }), baseRows);
    expect(out[0].c1).toBe(100);
  });
});

describe('PREVIOUS_VALUE', () => {
  it('chains last computed value, seeded with current row', () => {
    const out = evaluateTableCalc(ctx('PREVIOUS_VALUE'), baseRows);
    // Tableau spec: PREVIOUS_VALUE(initial) yields the prior row's
    // calc result. Initial = arg_field of first row in partition.
    expect(out[0].c1).toBe(100);
    expect(out[1].c1).toBe(100);
    expect(out[2].c1).toBe(100);
  });
});

describe('DIFF', () => {
  it('DIFF lag=1 returns delta vs prior row', () => {
    const out = evaluateTableCalc(ctx('DIFF', { offset: -1 }), baseRows);
    expect(out[0].c1).toBeNull();
    expect(out[1].c1).toBe(50);
    expect(out[2].c1).toBe(25);
  });

  it('DIFF lag=2 looks two rows back', () => {
    const out = evaluateTableCalc(ctx('DIFF', { offset: -2 }), baseRows);
    expect(out[0].c1).toBeNull();
    expect(out[1].c1).toBeNull();
    expect(out[2].c1).toBe(75);
  });
});

describe('IS_DISTINCT', () => {
  it('returns true once per partition for the addressing field', () => {
    const dup: Row[] = [
      { Region: 'East', Year: 2020, Sales: 100 },
      { Region: 'East', Year: 2020, Sales: 100 },
      { Region: 'East', Year: 2021, Sales: 150 },
    ];
    const out = evaluateTableCalc(ctx('IS_DISTINCT'), dup);
    expect(out[0].c1).toBe(true);
    expect(out[1].c1).toBe(false);  // dup of (East, 2020)
    expect(out[2].c1).toBe(true);
  });
});

describe('IS_STACKED', () => {
  it('flags rows where >1 mark shares an addressing key', () => {
    const stacked: Row[] = [
      { Region: 'East', Year: 2020, Sales: 100 },
      { Region: 'West', Year: 2020, Sales: 200 },
    ];
    const spec: TableCalcSpec = {
      ...ctx('IS_STACKED'),
      partitioning: [],            // single global partition
      addressing: ['Year'],
    };
    const out = evaluateTableCalc(spec, stacked);
    // Both rows share Year=2020 → both stacked = true.
    expect(out[0].c1).toBe(true);
    expect(out[1].c1).toBe(true);
  });
});

describe('addressing edges', () => {
  it('empty partition = single global group', () => {
    const out = evaluateTableCalc(
      { ...ctx('LOOKUP', { offset: -1 }), partitioning: [] },
      baseRows,
    );
    expect(out[0].c1).toBeNull();
    // No partition + stable sort by Year asc interleaves regions:
    // sorted = [E2020, W2020, E2021, W2021, E2022, W2022].
    // baseRows[3] = W2020 at sorted pos 1; offset -1 → E2020 (Sales=100).
    expect(out[3].c1).toBe(100);  // crosses East→West because no partition
  });

  it('partition size 1 yields trivial calc', () => {
    const single: Row[] = [{ Region: 'X', Year: 2020, Sales: 42 }];
    const out = evaluateTableCalc(ctx('LOOKUP', { offset: -1 }), single);
    expect(out[0].c1).toBeNull();
  });

  it('NULL addressing values group together (NULL-as-group)', () => {
    const withNull: Row[] = [
      { Region: 'X', Year: null, Sales: 1 },
      { Region: 'X', Year: null, Sales: 2 },
    ];
    const out = evaluateTableCalc(
      { ...ctx('IS_DISTINCT'), partitioning: ['Region'] },
      withNull,
    );
    expect(out[0].c1).toBe(true);
    expect(out[1].c1).toBe(false);
  });

  it('rejects unknown function (no dynamic-code evaluation)', () => {
    expect(() =>
      evaluateTableCalc({ ...ctx('NOT_A_FN'), function: 'NOT_A_FN' }, baseRows),
    ).toThrow(/unknown table-calc/);
  });
});

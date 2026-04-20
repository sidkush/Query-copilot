import { describe, it, expect } from 'vitest';
import { applyTotalsToCrosstab } from '../../analytics/totalsToVega';

const baseRows = [
  { region: 'West',  category: 'Tech',     sum_sales: 100 },
  { region: 'West',  category: 'Apparel',  sum_sales: 40  },
  { region: 'East',  category: 'Tech',     sum_sales: 80  },
  { region: 'East',  category: 'Apparel',  sum_sales: 60  },
];

describe('applyTotalsToCrosstab', () => {
  it('appends grand total row with __is_grand_total__ marker', () => {
    const analytics = [{ kind: 'grand_total', value: 280, aggregation: 'sum', position: 'after' }];
    const out = applyTotalsToCrosstab(baseRows, analytics, {
      measure_alias: 'sum_sales', row_dims: ['region'], column_dims: ['category'],
    });
    const last = out[out.length - 1];
    expect(last.__is_grand_total__).toBe(true);
    expect(last.sum_sales).toBe(280);
  });

  it('inserts subtotal rows at region boundary', () => {
    const analytics = [{
      kind: 'subtotal',
      rows: [
        { region: 'West', __subtotal_value__: 140 },
        { region: 'East', __subtotal_value__: 140 },
      ],
      aggregation: 'sum',
      position: 'after',
    }];
    const out = applyTotalsToCrosstab(baseRows, analytics, {
      measure_alias: 'sum_sales', row_dims: ['region'], column_dims: ['category'],
    });
    const westSub = out.find(r => r.__is_subtotal__ && r.region === 'West');
    expect(westSub).toBeDefined();
    expect(westSub!.sum_sales).toBe(140);
    // Sub-total must appear after West's two detail rows and before East's.
    const westIdx = out.findIndex(r => r === westSub);
    expect(out[westIdx - 1]).toMatchObject({ region: 'West' });
    expect(out[westIdx + 1].region).toBe('East');
  });

  it('position=before puts grand total at the head', () => {
    const analytics = [{ kind: 'grand_total', value: 280, aggregation: 'sum', position: 'before' }];
    const out = applyTotalsToCrosstab(baseRows, analytics, {
      measure_alias: 'sum_sales', row_dims: ['region'], column_dims: ['category'],
    });
    expect(out[0].__is_grand_total__).toBe(true);
  });

  it('no analytics → input rows unchanged (referential)', () => {
    const out = applyTotalsToCrosstab(baseRows, [], {
      measure_alias: 'sum_sales', row_dims: ['region'], column_dims: ['category'],
    });
    expect(out).toEqual(baseRows);
  });
});

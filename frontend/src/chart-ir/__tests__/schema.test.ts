import { describe, it, expect } from 'vitest';
import { validateChartSpec, chartSpecSchema } from '../schema';

describe('ChartSpec JSON Schema validation', () => {
  it('exports a JSON Schema object with $schema and properties', () => {
    expect(chartSpecSchema).toBeDefined();
    expect(chartSpecSchema.type).toBe('object');
    expect(chartSpecSchema.properties).toBeDefined();
  });

  it('validates a minimal valid cartesian spec', () => {
    const result = validateChartSpec({
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'product', type: 'nominal' },
        y: { field: 'revenue', type: 'quantitative' },
      },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a spec missing $schema', () => {
    const result = validateChartSpec({
      type: 'cartesian',
      mark: 'bar',
    } as unknown);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a spec with invalid type discriminator', () => {
    const result = validateChartSpec({
      $schema: 'askdb/chart-spec/v1',
      type: 'invalid-type',
    } as unknown);
    expect(result.valid).toBe(false);
  });

  it('rejects a spec with invalid mark', () => {
    const result = validateChartSpec({
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'pyramid',
    } as unknown);
    expect(result.valid).toBe(false);
  });
});

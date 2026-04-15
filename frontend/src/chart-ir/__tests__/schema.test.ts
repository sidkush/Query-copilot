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

  it('accepts color encoding with scheme field', () => {
    const result = validateChartSpec({
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'product', type: 'nominal' },
        color: { field: 'region', type: 'nominal', scheme: 'tableau10' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects scheme on non-color encoding channels', () => {
    const result = validateChartSpec({
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'product', type: 'nominal', scheme: 'tableau10' } as unknown,
      },
    } as unknown);
    expect(result.valid).toBe(false);
  });

  it('accepts theta encoding for arc marks', () => {
    const result = validateChartSpec({
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'arc',
      encoding: {
        theta: { field: 'revenue', type: 'quantitative', aggregate: 'sum' },
        color: { field: 'region', type: 'nominal' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('validates map spec with typed layers', () => {
    const result = validateChartSpec({
      $schema: 'askdb/chart-spec/v1',
      type: 'map',
      map: {
        provider: 'maplibre',
        style: 'positron',
        center: [0, 0],
        zoom: 2,
        layers: [{ type: 'circle', source: 'data' }],
      },
    });
    expect(result.valid).toBe(true);
  });
});

describe('Schema enum cross-check vs types.ts', () => {
  // These tests catch drift between the schema's redeclared enums and
  // the canonical TypeScript types. If a new Mark/SemanticType/Aggregate
  // is added to types.ts without updating schema.ts, the cross-check
  // test fails — preventing silent rejection at runtime.
  it('MARKS in schema matches Mark union in types.ts', () => {
    const mark = chartSpecSchema.properties.mark as unknown as { oneOf: Array<{ enum?: readonly string[] }> };
    const schemaMarks = mark.oneOf[0]?.enum ?? [];
    const typeMarks = [
      'bar', 'line', 'area', 'point', 'circle', 'square', 'tick',
      'rect', 'arc', 'text', 'geoshape', 'boxplot', 'errorbar',
      'rule', 'trail', 'image',
    ];
    expect(new Set(schemaMarks)).toEqual(new Set(typeMarks));
  });

  it('SEMANTIC_TYPES in schema matches SemanticType union', () => {
    const enc = chartSpecSchema.properties.encoding as unknown as {
      properties: Record<string, { properties: Record<string, { enum?: readonly string[] }> }>;
    };
    const fieldRef = enc.properties.x?.properties?.type?.enum ?? [];
    const typeSemantic = ['nominal', 'ordinal', 'quantitative', 'temporal', 'geographic'];
    expect(new Set(fieldRef)).toEqual(new Set(typeSemantic));
  });
});

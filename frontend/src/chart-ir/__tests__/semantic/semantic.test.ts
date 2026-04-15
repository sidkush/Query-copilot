import { describe, it, expect } from 'vitest';
import {
  validateSemanticModel,
  resolveSemanticRef,
  compileSemanticSpec,
  SemanticResolutionError,
} from '../../index';
import type { ChartSpec } from '../../types';
import type { SemanticModel } from '../../semantic/types';

function sampleModel(): SemanticModel {
  return {
    id: 'org:retail',
    name: 'Retail',
    version: 1,
    dataset: 'orders',
    dimensions: [
      { id: 'region', label: 'Region', field: 'region_name', semanticType: 'nominal' },
      { id: 'order_month', label: 'Order month', field: 'order_date', semanticType: 'temporal' },
    ],
    measures: [
      { id: 'revenue', label: 'Revenue', field: 'revenue', aggregate: 'sum', format: '$,.0f' },
      { id: 'users', label: 'Users', field: 'user_id', aggregate: 'distinct' },
    ],
    metrics: [
      {
        id: 'arpu',
        label: 'ARPU',
        formula: 'datum.revenue / datum.users',
        dependencies: ['revenue', 'users'],
        format: '$,.2f',
      },
    ],
  };
}

describe('validateSemanticModel', () => {
  it('accepts a well-formed model', () => {
    const result = validateSemanticModel(sampleModel());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing top-level fields', () => {
    const result = validateSemanticModel({ id: '', name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /id/.test(e))).toBe(true);
    expect(result.errors.some((e) => /name/.test(e))).toBe(true);
  });

  it('rejects duplicate measure ids', () => {
    const model = sampleModel();
    model.measures.push({ ...model.measures[0]! });
    const result = validateSemanticModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Duplicate measure/.test(e))).toBe(true);
  });

  it('rejects metric dependency on an unknown measure', () => {
    const model = sampleModel();
    model.metrics[0]!.dependencies = ['mystery'];
    const result = validateSemanticModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /mystery/.test(e))).toBe(true);
  });

  it('detects cyclic metric dependencies', () => {
    const model = sampleModel();
    model.metrics.push({
      id: 'a',
      label: 'A',
      formula: 'datum.b',
      dependencies: ['b'],
    });
    model.metrics.push({
      id: 'b',
      label: 'B',
      formula: 'datum.a',
      dependencies: ['a'],
    });
    const result = validateSemanticModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Cyclic/.test(e))).toBe(true);
  });
});

describe('resolveSemanticRef', () => {
  it('resolves a dimension ref to a FieldRef', () => {
    const model = sampleModel();
    const { fieldRef, extraTransforms } = resolveSemanticRef(model, {
      dimension: 'region',
    });
    expect(fieldRef.field).toBe('region_name');
    expect(fieldRef.type).toBe('nominal');
    expect(extraTransforms).toEqual([]);
  });

  it('resolves a measure ref to a FieldRef with aggregate', () => {
    const model = sampleModel();
    const { fieldRef } = resolveSemanticRef(model, { measure: 'revenue' });
    expect(fieldRef.field).toBe('revenue');
    expect(fieldRef.aggregate).toBe('sum');
    expect(fieldRef.type).toBe('quantitative');
    expect(fieldRef.format).toBe('$,.0f');
  });

  it('resolves a metric ref to a calculate transform + synthetic field', () => {
    const model = sampleModel();
    const { fieldRef, extraTransforms } = resolveSemanticRef(model, {
      metric: 'arpu',
    });
    expect(fieldRef.field).toBe('arpu');
    expect(extraTransforms).toHaveLength(1);
    expect(extraTransforms[0]?.calculate?.as).toBe('arpu');
    expect(extraTransforms[0]?.calculate?.expr).toContain('datum.revenue');
  });

  it('throws on unknown id', () => {
    const model = sampleModel();
    expect(() => resolveSemanticRef(model, { metric: 'unknown' })).toThrow(
      SemanticResolutionError,
    );
  });

  it('throws when ref has no dimension/measure/metric', () => {
    const model = sampleModel();
    expect(() => resolveSemanticRef(model, {})).toThrow(SemanticResolutionError);
  });
});

describe('compileSemanticSpec', () => {
  it('replaces semantic encoding refs with concrete FieldRefs', () => {
    const model = sampleModel();
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { dimension: 'region' } as unknown as ChartSpec['encoding'] extends infer _ ? any : never,
        y: { measure: 'revenue' } as unknown as ChartSpec['encoding'] extends infer _ ? any : never,
      },
    };
    const compiled = compileSemanticSpec(spec, model);
    expect(compiled.encoding?.x?.field).toBe('region_name');
    expect(compiled.encoding?.y?.field).toBe('revenue');
    expect(compiled.encoding?.y?.aggregate).toBe('sum');
    expect(compiled.transform ?? []).toHaveLength(0);
  });

  it('compiles metric encodings into calculate transforms', () => {
    const model = sampleModel();
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'line',
      encoding: {
        x: { dimension: 'order_month' } as unknown as any,
        y: { metric: 'arpu' } as unknown as any,
      },
    };
    const compiled = compileSemanticSpec(spec, model);
    expect(compiled.encoding?.y?.field).toBe('arpu');
    expect(compiled.transform).toHaveLength(1);
    expect(compiled.transform?.[0]?.calculate?.as).toBe('arpu');
  });

  it('leaves non-semantic encoding refs alone', () => {
    const model = sampleModel();
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'value', type: 'quantitative', aggregate: 'sum' },
      },
    };
    const compiled = compileSemanticSpec(spec, model);
    expect(compiled.encoding?.x?.field).toBe('category');
    expect(compiled.encoding?.y?.field).toBe('value');
  });

  it('does not duplicate calculate transforms already present in the spec', () => {
    const model = sampleModel();
    const spec: ChartSpec = {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'line',
      transform: [{ calculate: { as: 'arpu', expr: 'datum.revenue / datum.users' } }],
      encoding: {
        y: { metric: 'arpu' } as unknown as any,
      },
    };
    const compiled = compileSemanticSpec(spec, model);
    expect(compiled.transform).toHaveLength(1);
  });
});

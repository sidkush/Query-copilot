import { describe, it, expect } from 'vitest';
import {
  validateUserChartType,
  collectPlaceholders,
  instantiateUserChartType,
  InstantiationError,
  UserChartTypeRegistry,
} from '../../index';
import type { UserChartType } from '../../userTypes/types';

function waterfallType(): UserChartType {
  return {
    id: 'org:revenue-waterfall',
    name: 'Revenue Waterfall',
    description: 'Period-over-period waterfall for revenue',
    category: 'Custom',
    schemaVersion: 1,
    parameters: [
      { name: 'period', kind: 'field', semanticType: 'temporal' },
      { name: 'amount', kind: 'field', semanticType: 'quantitative' },
    ],
    specTemplate: {
      $schema: 'askdb/chart-spec/v1',
      type: 'cartesian',
      mark: 'bar',
      encoding: {
        x: { field: '${period}', type: 'temporal' },
        y: { field: '${amount}', type: 'quantitative', aggregate: 'sum' },
      },
    },
  };
}

describe('validateUserChartType', () => {
  it('accepts a well-formed type', () => {
    const result = validateUserChartType(waterfallType());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing required fields', () => {
    const bad = { schemaVersion: 1, parameters: [], specTemplate: {} };
    const result = validateUserChartType(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /id/.test(e))).toBe(true);
    expect(result.errors.some((e) => /name/.test(e))).toBe(true);
  });

  it('rejects wrong schemaVersion', () => {
    const def = waterfallType();
    (def as unknown as { schemaVersion: number }).schemaVersion = 99;
    const result = validateUserChartType(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /schemaVersion/.test(e))).toBe(true);
  });

  it('rejects duplicate parameter names', () => {
    const def = waterfallType();
    def.parameters.push({ name: 'period', kind: 'field' });
    const result = validateUserChartType(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Duplicate/.test(e))).toBe(true);
  });

  it('rejects placeholders that reference undeclared parameters', () => {
    const def = waterfallType();
    def.specTemplate.encoding!.y!.field = '${mystery}';
    const result = validateUserChartType(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /undeclared/.test(e))).toBe(true);
  });

  it('rejects unknown parameter kinds', () => {
    const def = waterfallType();
    (def.parameters[0] as unknown as { kind: string }).kind = 'mystery';
    const result = validateUserChartType(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /kind/.test(e))).toBe(true);
  });
});

describe('collectPlaceholders', () => {
  it('finds ${name} references recursively across objects + arrays', () => {
    const tree = {
      a: '${foo}',
      b: ['literal', '${bar}'],
      c: { d: 'prefix ${baz} suffix' },
    };
    const found = collectPlaceholders(tree);
    expect(found.has('foo')).toBe(true);
    expect(found.has('bar')).toBe(true);
    expect(found.has('baz')).toBe(true);
  });

  it('returns an empty set for a placeholder-free tree', () => {
    expect(collectPlaceholders({ a: 'plain', b: 1 }).size).toBe(0);
  });
});

describe('instantiateUserChartType', () => {
  it('replaces ${field} placeholders with supplied params', () => {
    const def = waterfallType();
    const spec = instantiateUserChartType(def, {
      period: 'month',
      amount: 'revenue',
    });
    expect(spec.encoding?.x?.field).toBe('month');
    expect(spec.encoding?.y?.field).toBe('revenue');
    // Original spec template untouched
    expect(def.specTemplate.encoding?.x?.field).toBe('${period}');
  });

  it('preserves non-string values in the spec template', () => {
    const def = waterfallType();
    const spec = instantiateUserChartType(def, {
      period: 'month',
      amount: 'revenue',
    });
    expect(spec.type).toBe('cartesian');
    expect(spec.mark).toBe('bar');
  });

  it('throws InstantiationError on missing required param', () => {
    const def = waterfallType();
    expect(() => instantiateUserChartType(def, { period: 'month' })).toThrow(
      InstantiationError,
    );
  });

  it('uses param default when the caller omits the value', () => {
    const def = waterfallType();
    def.parameters[0] = {
      name: 'period',
      kind: 'field',
      required: false,
      default: 'month',
    };
    const spec = instantiateUserChartType(def, { amount: 'revenue' });
    expect(spec.encoding?.x?.field).toBe('month');
  });

  it('supports partial-string substitution', () => {
    const def = waterfallType();
    def.specTemplate.title = 'Waterfall of ${amount} by ${period}';
    const spec = instantiateUserChartType(def, {
      period: 'month',
      amount: 'revenue',
    });
    expect(spec.title).toBe('Waterfall of revenue by month');
  });
});

describe('UserChartTypeRegistry', () => {
  it('register adds valid types and rejects invalid ones', () => {
    const reg = new UserChartTypeRegistry();
    const ok = reg.register(waterfallType());
    expect(ok.ok).toBe(true);
    const bad = reg.register({ ...waterfallType(), id: '' });
    expect(bad.ok).toBe(false);
  });

  it('get / list / remove round-trip', () => {
    const reg = new UserChartTypeRegistry();
    const def = waterfallType();
    reg.register(def);
    expect(reg.get(def.id)).toBeDefined();
    expect(reg.list()).toHaveLength(1);
    reg.remove(def.id);
    expect(reg.get(def.id)).toBeUndefined();
    expect(reg.list()).toHaveLength(0);
  });

  it('listByCategory groups types by category', () => {
    const reg = new UserChartTypeRegistry();
    reg.register(waterfallType());
    const def2 = { ...waterfallType(), id: 'org:funnel', name: 'Funnel', category: 'Growth' };
    reg.register(def2);
    const byCategory = reg.listByCategory();
    expect(byCategory.Custom).toHaveLength(1);
    expect(byCategory.Growth).toHaveLength(1);
  });

  it('instantiate builds a ChartSpec via the registry', () => {
    const reg = new UserChartTypeRegistry();
    reg.register(waterfallType());
    const spec = reg.instantiate('org:revenue-waterfall', {
      period: 'month',
      amount: 'revenue',
    });
    expect(spec.encoding?.x?.field).toBe('month');
  });

  it('hydrate imports a list and reports per-type errors', () => {
    const reg = new UserChartTypeRegistry();
    const valid = waterfallType();
    const invalid = { ...waterfallType(), id: 'bad:1', schemaVersion: 99 as unknown as 1 };
    const result = reg.hydrate([valid, invalid]);
    expect(result.added).toBe(1);
    expect(Object.keys(result.errors)).toContain('bad:1');
  });
});

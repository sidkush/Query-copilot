import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateRule,
  buildEvaluationContext,
  __resetWarnCacheForTests,
} from '../lib/visibilityRules';
import type { DashboardSet } from '../lib/setTypes';
import type { DashboardParameter } from '../lib/parameterTypes';
import type { EvaluationContext, VisibilityRule } from '../lib/types';

const mkSet = (id: string, members: (string | number)[] = []): DashboardSet => ({
  id,
  name: `Set-${id}`,
  dimension: 'region',
  members,
  createdAt: '2026-04-16T00:00:00Z',
});

const mkParam = (
  id: string,
  type: DashboardParameter['type'],
  value: DashboardParameter['value'],
): DashboardParameter => ({
  id,
  name: `p_${id}`,
  type,
  value,
  domain: { kind: 'free' },
  createdAt: '2026-04-16T00:00:00Z',
});

const ctx = (over: Partial<EvaluationContext> = {}): EvaluationContext => ({
  sets: [],
  parameters: [],
  sheetFilters: {},
  ...over,
});

beforeEach(() => {
  __resetWarnCacheForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluateRule — undefined / always', () => {
  it('returns true for undefined rule', () => {
    expect(evaluateRule(undefined, ctx())).toBe(true);
  });

  it('returns true for { kind: "always" }', () => {
    expect(evaluateRule({ kind: 'always' }, ctx())).toBe(true);
  });

  it('returns true for an unknown future kind (forward-compat)', () => {
    // @ts-expect-error — runtime guard for unknown kinds
    expect(evaluateRule({ kind: 'fieldRange', x: 1 }, ctx())).toBe(true);
  });
});

describe('evaluateRule — setMembership', () => {
  it('hasAny returns true when set has members', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 's1', mode: 'hasAny' };
    expect(evaluateRule(rule, ctx({ sets: [mkSet('s1', ['East'])] }))).toBe(true);
  });

  it('hasAny returns false when set is empty', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 's1', mode: 'hasAny' };
    expect(evaluateRule(rule, ctx({ sets: [mkSet('s1', [])] }))).toBe(false);
  });

  it('isEmpty returns true when set is empty', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 's1', mode: 'isEmpty' };
    expect(evaluateRule(rule, ctx({ sets: [mkSet('s1', [])] }))).toBe(true);
  });

  it('isEmpty returns false when set has members', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 's1', mode: 'isEmpty' };
    expect(evaluateRule(rule, ctx({ sets: [mkSet('s1', ['East'])] }))).toBe(false);
  });

  it('returns true and warns once when set is missing', () => {
    const rule: VisibilityRule = { kind: 'setMembership', setId: 'gone', mode: 'hasAny' };
    expect(evaluateRule(rule, ctx())).toBe(true);
    expect(evaluateRule(rule, ctx())).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('evaluateRule — parameterEquals', () => {
  it('returns true when string param equals literal', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' };
    expect(evaluateRule(rule, ctx({ parameters: [mkParam('p1', 'string', 'priority')] }))).toBe(true);
  });

  it('returns false when string param differs', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'p1', value: 'priority' };
    expect(evaluateRule(rule, ctx({ parameters: [mkParam('p1', 'string', 'normal')] }))).toBe(false);
  });

  it('returns true for boolean equality', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'p1', value: true };
    expect(evaluateRule(rule, ctx({ parameters: [mkParam('p1', 'boolean', true)] }))).toBe(true);
  });

  it('uses strict equality — number 1 ≠ string "1"', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'p1', value: 1 };
    expect(evaluateRule(rule, ctx({ parameters: [mkParam('p1', 'string', '1')] }))).toBe(false);
  });

  it('returns true and warns once when parameter is missing', () => {
    const rule: VisibilityRule = { kind: 'parameterEquals', parameterId: 'gone', value: 'x' };
    expect(evaluateRule(rule, ctx())).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('evaluateRule — hasActiveFilter', () => {
  it('returns true when sheet has at least one filter entry', () => {
    const rule: VisibilityRule = { kind: 'hasActiveFilter', sheetId: 'sheet-1' };
    const c = ctx({ sheetFilters: { 'sheet-1': [{ field: 'region', op: '=', value: 'East' }] } });
    expect(evaluateRule(rule, c)).toBe(true);
  });

  it('returns false when sheet entry is missing', () => {
    const rule: VisibilityRule = { kind: 'hasActiveFilter', sheetId: 'sheet-1' };
    expect(evaluateRule(rule, ctx())).toBe(false);
  });

  it('returns false when sheet entry is an empty array', () => {
    const rule: VisibilityRule = { kind: 'hasActiveFilter', sheetId: 'sheet-1' };
    expect(evaluateRule(rule, ctx({ sheetFilters: { 'sheet-1': [] } }))).toBe(false);
  });

  it('does NOT warn for missing sheet — empty filter set is a normal state', () => {
    const rule: VisibilityRule = { kind: 'hasActiveFilter', sheetId: 'sheet-1' };
    evaluateRule(rule, ctx());
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('buildEvaluationContext', () => {
  it('returns a frozen-shaped object with the supplied slices', () => {
    const sets = [mkSet('s1')];
    const parameters = [mkParam('p1', 'string', 'x')];
    const sheetFilters = { 'sheet-1': [{ field: 'r', op: '=', value: 'E' }] };
    const c = buildEvaluationContext({ sets, parameters, sheetFilters });
    expect(c.sets).toBe(sets);
    expect(c.parameters).toBe(parameters);
    expect(c.sheetFilters).toBe(sheetFilters);
  });

  it('substitutes empty defaults for missing slices', () => {
    const c = buildEvaluationContext({});
    expect(c.sets).toEqual([]);
    expect(c.parameters).toEqual([]);
    expect(c.sheetFilters).toEqual({});
  });
});

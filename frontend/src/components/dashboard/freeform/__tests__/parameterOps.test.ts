import { describe, it, expect } from 'vitest';
import {
  validateParamName,
  coerceValue,
  validateAgainstDomain,
  substituteParamTokens,
  ParamSubstitutionError,
} from '../lib/parameterOps';
import type { DashboardParameter } from '../lib/parameterTypes';

const mkParam = (over: Partial<DashboardParameter> = {}): DashboardParameter => ({
  id: 'p1',
  name: 'region',
  type: 'string',
  value: 'West',
  domain: { kind: 'free' },
  createdAt: '2026-04-16T00:00:00Z',
  ...over,
});

describe('validateParamName', () => {
  it('accepts plain identifiers', () => {
    expect(validateParamName('region', [])).toEqual({ ok: true });
    expect(validateParamName('_year', [])).toEqual({ ok: true });
    expect(validateParamName('x1', [])).toEqual({ ok: true });
  });

  it('rejects empty / whitespace / punctuation / leading digit', () => {
    expect(validateParamName('', []).ok).toBe(false);
    expect(validateParamName('  ', []).ok).toBe(false);
    expect(validateParamName('bad name', []).ok).toBe(false);
    expect(validateParamName('1bad', []).ok).toBe(false);
    expect(validateParamName('a.b', []).ok).toBe(false);
  });

  it('rejects names longer than MAX_PARAM_TOKEN_LENGTH', () => {
    const long = 'x'.repeat(65);
    expect(validateParamName(long, []).ok).toBe(false);
  });

  it('rejects case-insensitive duplicates', () => {
    const existing = [mkParam()];
    expect(validateParamName('REGION', existing)).toEqual({ ok: false, reason: 'duplicate' });
    expect(validateParamName('Region', existing)).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('ignores the param being renamed when its own id is passed', () => {
    const existing = [mkParam()];
    expect(validateParamName('region', existing, 'p1')).toEqual({ ok: true });
  });
});

describe('coerceValue', () => {
  it('string: accepts strings, stringifies numbers/booleans', () => {
    expect(coerceValue('string', 'hi')).toBe('hi');
    expect(coerceValue('string', 42)).toBe('42');
    expect(coerceValue('string', true)).toBe('true');
  });

  it('number: accepts finite numbers; parses numeric strings; rejects NaN/Infinity', () => {
    expect(coerceValue('number', 12)).toBe(12);
    expect(coerceValue('number', '3.14')).toBeCloseTo(3.14);
    expect(() => coerceValue('number', 'abc')).toThrow();
    expect(() => coerceValue('number', Number.POSITIVE_INFINITY)).toThrow();
    expect(() => coerceValue('number', Number.NaN)).toThrow();
  });

  it('boolean: normalises "true"/"false" strings and booleans', () => {
    expect(coerceValue('boolean', true)).toBe(true);
    expect(coerceValue('boolean', 'true')).toBe(true);
    expect(coerceValue('boolean', 'FALSE')).toBe(false);
    expect(() => coerceValue('boolean', 'maybe')).toThrow();
  });

  it('date: accepts ISO-8601, rejects free-form garbage', () => {
    expect(coerceValue('date', '2026-04-16')).toBe('2026-04-16');
    expect(coerceValue('date', '2026-04-16T12:00:00Z')).toBe('2026-04-16T12:00:00Z');
    expect(() => coerceValue('date', 'not-a-date')).toThrow();
  });
});

describe('validateAgainstDomain', () => {
  it('list domain: accepts listed values, rejects others', () => {
    const p = mkParam({ domain: { kind: 'list', values: ['East', 'West'] } });
    expect(validateAgainstDomain(p, 'West')).toEqual({ ok: true });
    expect(validateAgainstDomain(p, 'North')).toEqual({ ok: false, error: 'not-in-list' });
  });

  it('range domain: accepts within range, rejects outside', () => {
    const p = mkParam({ type: 'number', value: 5, domain: { kind: 'range', min: 0, max: 10, step: 1 } });
    expect(validateAgainstDomain(p, 5)).toEqual({ ok: true });
    expect(validateAgainstDomain(p, 11)).toEqual({ ok: false, error: 'out-of-range' });
    expect(validateAgainstDomain(p, -1)).toEqual({ ok: false, error: 'out-of-range' });
  });

  it('range domain: rejects non-number value types', () => {
    const p = mkParam({ type: 'number', value: 5, domain: { kind: 'range', min: 0, max: 10, step: 1 } });
    // @ts-expect-error — runtime guard
    expect(validateAgainstDomain(p, 'five').ok).toBe(false);
  });

  it('free domain: accepts any value whose type matches param.type', () => {
    const p = mkParam({ type: 'string', domain: { kind: 'free' } });
    expect(validateAgainstDomain(p, 'anything')).toEqual({ ok: true });
  });
});

describe('substituteParamTokens', () => {
  it('replaces {{name}} with a quoted string value', () => {
    const sql = 'SELECT * FROM sales WHERE region = {{region}}';
    const out = substituteParamTokens(sql, [mkParam()]);
    expect(out).toBe("SELECT * FROM sales WHERE region = 'West'");
  });

  it('replaces {{name}} with a number literal', () => {
    const sql = 'SELECT * FROM sales WHERE year = {{year}}';
    const out = substituteParamTokens(sql, [mkParam({ id: 'p2', name: 'year', type: 'number', value: 2026 })]);
    expect(out).toBe('SELECT * FROM sales WHERE year = 2026');
  });

  it('replaces {{name}} with a boolean literal', () => {
    const sql = 'SELECT * FROM t WHERE active = {{active}}';
    const out = substituteParamTokens(sql, [mkParam({ id: 'p3', name: 'active', type: 'boolean', value: true })]);
    expect(out).toBe('SELECT * FROM t WHERE active = TRUE');
  });

  it('escapes single-quotes in string values', () => {
    const sql = 'SELECT * FROM t WHERE name = {{n}}';
    const out = substituteParamTokens(sql, [mkParam({ id: 'p4', name: 'n', type: 'string', value: "O'Brien" })]);
    expect(out).toBe("SELECT * FROM t WHERE name = 'O''Brien'");
  });

  it('tolerates whitespace inside the token', () => {
    const sql = 'SELECT {{ region }} FROM t';
    const out = substituteParamTokens(sql, [mkParam()]);
    expect(out).toBe("SELECT 'West' FROM t");
  });

  it('throws on unknown token names', () => {
    const sql = 'SELECT * FROM t WHERE x = {{ghost}}';
    expect(() => substituteParamTokens(sql, [mkParam()])).toThrow(ParamSubstitutionError);
  });

  it('leaves SQL untouched when no tokens exist', () => {
    const sql = 'SELECT * FROM t';
    const out = substituteParamTokens(sql, [mkParam()]);
    expect(out).toBe(sql);
  });

  it('renders a malicious string value as a safely-quoted literal', () => {
    const sql = 'SELECT * FROM t WHERE x = {{n}}';
    const bad = "'; DROP TABLE users--";
    const out = substituteParamTokens(sql, [mkParam({ id: 'p5', name: 'n', type: 'string', value: bad })]);
    expect(out).toBe("SELECT * FROM t WHERE x = '''; DROP TABLE users--'");
    // Attack payload is fully contained inside the string literal — no unescaped
    // single-quote breaks out. Every apostrophe from input is doubled.
    const literalBody = out.slice(out.indexOf("'") + 1, out.lastIndexOf("'"));
    expect(literalBody.replace(/''/g, '')).not.toContain("'");
  });

  it('replaces multiple occurrences of the same token', () => {
    const sql = 'SELECT {{region}} AS a, {{region}} AS b';
    const out = substituteParamTokens(sql, [mkParam()]);
    expect(out).toBe("SELECT 'West' AS a, 'West' AS b");
  });

  it('throws when the post-substitution SQL exceeds MAX_SUBSTITUTED_SQL_LEN', () => {
    const sql = 'SELECT {{n}} FROM t';
    const giant = 'x'.repeat(200_000);
    expect(() =>
      substituteParamTokens(sql, [mkParam({ id: 'p6', name: 'n', type: 'string', value: giant })]),
    ).toThrow(ParamSubstitutionError);
  });
});

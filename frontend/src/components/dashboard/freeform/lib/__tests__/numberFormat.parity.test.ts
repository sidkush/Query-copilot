// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatNumber, parseNumberFormat } from '../numberFormat';

const FIXTURE_PATH = resolve(
  __dirname,
  '../../../../../../../backend/vizql/tests/fixtures/number_format_parity/cases.json',
);

const fixtureExists = existsSync(FIXTURE_PATH);

interface Case { id: string; pattern: string; value: number; locale?: string; expected: string }

// Python's `json.load` is lenient by default and emits bare `NaN`, `Infinity`, `-Infinity`
// literals which are valid Python but not valid per the strict ECMA-404 JSON spec.
// `JSON.parse` rejects them. Pre-process the source text so the parity fixture can
// round-trip through both runtimes without mutating the fixture itself (the fixture is
// the contract; see Plan 10b T6). Each sentinel is wrapped in a unique string marker
// and revived to the corresponding Number value.
const parseLenientJson = (raw: string): unknown => {
  const replaced = raw
    .replace(/(?<=[\s,\[:])-Infinity(?=\s*[,\}\]])/g, '"__NEG_INF__"')
    .replace(/(?<=[\s,\[:])Infinity(?=\s*[,\}\]])/g, '"__POS_INF__"')
    .replace(/(?<=[\s,\[:])NaN(?=\s*[,\}\]])/g, '"__NAN__"');
  return JSON.parse(replaced, (_key, value) => {
    if (value === '__NAN__') return Number.NaN;
    if (value === '__POS_INF__') return Number.POSITIVE_INFINITY;
    if (value === '__NEG_INF__') return Number.NEGATIVE_INFINITY;
    return value;
  });
};

const cases: Case[] = fixtureExists
  ? (parseLenientJson(readFileSync(FIXTURE_PATH, 'utf-8')) as Case[])
  : [];

const D = fixtureExists ? describe : describe.skip;

D('number-format parity with Python (deferred to integration)', () => {
  it('has >= 200 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(200);
  });
  it.each(cases)('[$id] $pattern($value) == $expected', (c) => {
    const ast = parseNumberFormat(c.pattern);
    const got = formatNumber(c.value, ast, c.locale ?? 'en-US');
    expect(got).toBe(c.expected);
  });
});

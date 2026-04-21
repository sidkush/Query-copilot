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

const cases: Case[] = fixtureExists
  ? JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'))
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

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { coerce, FormatResolver } from '../formatResolver';
import { StyleProp, type Selector, type StyleRule } from '../formattingTypes';

const FIXTURE_DIR = path.resolve(
  __dirname,
  '../../../../../../../backend/vizql/tests/fixtures/format_parity',
);

function toSelector(raw: { kind: string; id: string }): Selector {
  switch (raw.kind) {
    case 'mark': return { kind: 'mark', markId: raw.id };
    case 'field': return { kind: 'field', fieldId: raw.id };
    case 'sheet': return { kind: 'sheet', sheetId: raw.id };
    case 'ds': return { kind: 'ds', dsId: raw.id };
    case 'workbook': return { kind: 'workbook' };
    default: throw new Error(`bad selector kind: ${raw.kind}`);
  }
}

function toRules(raw: Array<{ selector: { kind: string; id: string }; properties: Record<string, string> }>): StyleRule[] {
  return raw.map((r) => {
    const coerced: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(r.properties)) {
      const prop = k as StyleProp;
      coerced[prop] = coerce(prop, v);
    }
    return {
      selector: toSelector(r.selector),
      properties: coerced as StyleRule['properties'],
    };
  });
}

describe('Plan 10a — Python <-> TS parity', () => {
  const files = fs.readdirSync(FIXTURE_DIR).filter((n) => n.endsWith('.json'));
  for (const name of files) {
    it(name, () => {
      const spec = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
      const resolver = new FormatResolver(toRules(spec.rules));
      for (const q of spec.queries) {
        const got = resolver.resolve(q.mark, q.field, q.sheet, q.ds, q.prop as StyleProp);
        expect(got).toBe(q.expected);
      }
    });
  }
});

describe('FormatResolver behaviour', () => {
  it('mark overrides sheet overrides workbook', () => {
    const resolver = new FormatResolver([
      { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#000000' } as StyleRule['properties'] },
      { selector: { kind: 'sheet', sheetId: 's1' }, properties: { [StyleProp.Color]: '#0000ff' } as StyleRule['properties'] },
      { selector: { kind: 'mark', markId: 'm1' }, properties: { [StyleProp.Color]: '#ff0000' } as StyleRule['properties'] },
    ]);
    expect(resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color)).toBe('#ff0000');
    expect(resolver.resolve('m2', 'f1', 's1', 'd1', StyleProp.Color)).toBe('#0000ff');
    expect(resolver.resolve('m9', 'f1', 's9', 'd1', StyleProp.Color)).toBe('#000000');
  });

  it('memoises and invalidates on updateRules', () => {
    const resolver = new FormatResolver([
      { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#000000' } as StyleRule['properties'] },
    ]);
    expect(resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color)).toBe('#000000');
    for (let i = 0; i < 1000; i += 1) resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color);
    expect(resolver.cacheInfo().hits).toBeGreaterThanOrEqual(1000);
    resolver.updateRules([
      { selector: { kind: 'workbook' }, properties: { [StyleProp.Color]: '#111111' } as StyleRule['properties'] },
    ]);
    expect(resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color)).toBe('#111111');
  });

  it('default returned when no rule matches', () => {
    const resolver = new FormatResolver([]);
    expect(resolver.resolve('m1', 'f1', 's1', 'd1', StyleProp.Color, 'inherit')).toBe('inherit');
  });
});

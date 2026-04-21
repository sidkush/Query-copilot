// Plan 10a — TS port of backend/vizql/format_resolver.py.
// CONTRACT: bit-for-bit identical output to Python resolver for the
// fixtures under backend/vizql/tests/fixtures/format_parity.
import {
  BOOL_STYLE_PROPS,
  NUMERIC_STYLE_PROPS,
  type Selector,
  StyleProp,
  type StyleRule,
  type StyleValue,
} from './formattingTypes';

export type ResolveResult<T = StyleValue> = { value: T; layer: string } | null;

const LAYER_ORDER: ReadonlyArray<'mark' | 'field' | 'sheet' | 'ds' | 'workbook'> = [
  'mark',
  'field',
  'sheet',
  'ds',
  'workbook',
];

export class FormatResolverError extends Error {}

export class FormatResolver {
  private byMark = new Map<string, StyleRule[]>();
  private byField = new Map<string, StyleRule[]>();
  private bySheet = new Map<string, StyleRule[]>();
  private byDs = new Map<string, StyleRule[]>();
  private workbook: StyleRule[] = [];
  private cache = new Map<string, StyleValue | undefined>();
  private hits = 0;
  private misses = 0;

  constructor(rules: readonly StyleRule[], private readonly cacheEnabled = true) {
    this.updateRules(rules);
  }

  updateRules(rules: readonly StyleRule[]) {
    this.byMark.clear(); this.byField.clear();
    this.bySheet.clear(); this.byDs.clear();
    this.workbook = [];
    for (const rule of rules) this.bucket(rule);
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  resolve(
    markId: string | null,
    fieldId: string | null,
    sheetId: string | null,
    dsId: string | null,
    prop: StyleProp,
    defaultValue?: StyleValue,
  ): StyleValue | undefined {
    const key = `${markId}|${fieldId}|${sheetId}|${dsId}|${prop}`;
    if (this.cacheEnabled && this.cache.has(key)) {
      this.hits += 1;
      const cached = this.cache.get(key);
      return cached === undefined ? defaultValue : cached;
    }
    this.misses += 1;
    const found = this.walk(markId, fieldId, sheetId, dsId, prop);
    const value = found?.value;
    if (this.cacheEnabled) this.cache.set(key, value);
    return value === undefined ? defaultValue : value;
  }

  resolveWithSource(
    markId: string | null, fieldId: string | null,
    sheetId: string | null, dsId: string | null,
    prop: StyleProp,
  ): ResolveResult | null {
    return this.walk(markId, fieldId, sheetId, dsId, prop);
  }

  resolveAll(
    markId: string | null, fieldId: string | null,
    sheetId: string | null, dsId: string | null,
  ): Partial<Record<StyleProp, StyleValue>> {
    const out: Partial<Record<StyleProp, StyleValue>> = {};
    for (const prop of Object.values(StyleProp)) {
      const v = this.resolve(markId, fieldId, sheetId, dsId, prop as StyleProp);
      if (v !== undefined) out[prop as StyleProp] = v;
    }
    return out;
  }

  cacheInfo() {
    return { hits: this.hits, misses: this.misses, size: this.cache.size };
  }

  // --- internal -------------------------------------------------------

  private bucket(rule: StyleRule) {
    const s = rule.selector as Selector;
    switch (s.kind) {
      case 'mark': this.push(this.byMark, s.markId, rule); break;
      case 'field': this.push(this.byField, s.fieldId, rule); break;
      case 'sheet': this.push(this.bySheet, s.sheetId, rule); break;
      case 'ds': this.push(this.byDs, s.dsId, rule); break;
      case 'workbook': this.workbook.push(rule); break;
      default: throw new FormatResolverError(`unknown selector: ${JSON.stringify(s)}`);
    }
  }
  private push(m: Map<string, StyleRule[]>, k: string, r: StyleRule) {
    const arr = m.get(k); if (arr) arr.push(r); else m.set(k, [r]);
  }

  private walk(
    markId: string | null, fieldId: string | null,
    sheetId: string | null, dsId: string | null, prop: StyleProp,
  ): ResolveResult | null {
    const bucketFor = (layer: string): StyleRule[] => {
      if (layer === 'mark') return (markId && this.byMark.get(markId)) || [];
      if (layer === 'field') return (fieldId && this.byField.get(fieldId)) || [];
      if (layer === 'sheet') return (sheetId && this.bySheet.get(sheetId)) || [];
      if (layer === 'ds') return (dsId && this.byDs.get(dsId)) || [];
      return this.workbook;
    };
    for (const layer of LAYER_ORDER) {
      const bucket = bucketFor(layer);
      for (let i = bucket.length - 1; i >= 0; i -= 1) {
        const rule = bucket[i];
        if (prop in rule.properties) {
          const raw = rule.properties[prop];
          return { value: coerce(prop, raw), layer };
        }
      }
    }
    return null;
  }
}

export function coerce(prop: StyleProp, raw: StyleValue): StyleValue {
  if (BOOL_STYLE_PROPS.has(prop)) return typeof raw === 'boolean' ? raw : raw === 'true' || raw === true;
  if (NUMERIC_STYLE_PROPS.has(prop)) return typeof raw === 'number' ? raw : Number(raw);
  return raw;
}

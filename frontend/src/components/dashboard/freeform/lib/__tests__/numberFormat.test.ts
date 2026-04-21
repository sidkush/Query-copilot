import { describe, expect, it } from 'vitest';
import {
  formatNumber,
  NumberFormatError,
  parseNumberFormat,
} from '../numberFormat';

describe('parseNumberFormat', () => {
  it('parses integer with thousands', () => {
    const ast = parseNumberFormat('#,##0');
    expect(ast.sections.length).toBe(1);
    expect(ast.sections[0].integerPart.thousandsSeparator).toBe(true);
    expect(ast.sections[0].integerPart.minDigits).toBe(1);
  });

  it('parses two-decimal', () => {
    const ast = parseNumberFormat('#,##0.00');
    expect(ast.sections[0].decimalPart).toEqual({ minDigits: 2, maxDigits: 2 });
  });

  it('parses percent with x100 scale', () => {
    const ast = parseNumberFormat('0.0%');
    expect(ast.sections[0].scale).toBe(100);
  });

  it('parses scientific', () => {
    const ast = parseNumberFormat('0.##E+00');
    expect(ast.sections[0].exponentPart).toEqual({ minDigits: 2, plusSign: true });
  });

  it('parses two-section paren negative', () => {
    const ast = parseNumberFormat('$#,##0;($#,##0)');
    expect(ast.sections.length).toBe(2);
    expect(ast.sections[1].negativeStyle).toBe('parens');
  });

  it('parses bracketed currency', () => {
    const ast = parseNumberFormat('[USD]#,##0.00');
    expect(ast.sections[0].prefix[0].text).toBe('USD');
  });

  it('parses quoted literal', () => {
    const ast = parseNumberFormat('#,##0 "items"');
    expect(ast.sections[0].suffix.some(l => l.text === 'items')).toBe(true);
  });

  it('rejects five sections', () => {
    expect(() => parseNumberFormat('0;0;0;0;0')).toThrow(NumberFormatError);
  });

  it('rejects unmatched quote', () => {
    expect(() => parseNumberFormat('0 "unterminated')).toThrow(NumberFormatError);
  });

  it('rejects invalid scientific', () => {
    expect(() => parseNumberFormat('0E')).toThrow(NumberFormatError);
  });

  it('rejects empty', () => {
    expect(() => parseNumberFormat('')).toThrow(NumberFormatError);
  });

  it('NumberFormatError carries 1-based column', () => {
    try {
      parseNumberFormat('0;0;0;0;0');
    } catch (e) {
      expect(e).toBeInstanceOf(NumberFormatError);
      expect((e as NumberFormatError).column).toBeGreaterThan(0);
    }
  });
});

describe('formatNumber', () => {
  const f = (p: string, v: number | string, locale = 'en-US') =>
    formatNumber(v as number, parseNumberFormat(p), locale);

  it('integer thousands', () => { expect(f('#,##0', 1234567)).toBe('1,234,567'); });
  it('two decimals', () => { expect(f('#,##0.00', 1234.5)).toBe('1,234.50'); });
  it('percent', () => { expect(f('0.0%', 0.125)).toBe('12.5%'); });
  it('scientific', () => { expect(f('0.##E+00', 12345)).toBe('1.23E+04'); });
  it('currency parens negative', () => {
    expect(f('$#,##0;($#,##0)', -1234)).toBe('($1,234)');
  });
  it('bracketed currency', () => { expect(f('[USD]#,##0.00', 1234.5)).toBe('USD1,234.50'); });
  it('quoted literal', () => { expect(f('#,##0 "items"', 7)).toBe('7 items'); });
  it('zero section', () => { expect(f('#,##0;-#,##0;"zero"', 0)).toBe('zero'); });
  it('rounding half-up', () => { expect(f('0', 0.5)).toBe('1'); });
  it('rounding 999.995', () => { expect(f('#,##0.00', 999.995)).toBe('1,000.00'); });
  it('NaN', () => { expect(f('#,##0', Number.NaN)).toBe('NaN'); });
  it('Infinity', () => { expect(f('#,##0', Number.POSITIVE_INFINITY)).toBe('Infinity'); });
  it('-Infinity', () => { expect(f('#,##0', Number.NEGATIVE_INFINITY)).toBe('-Infinity'); });
  it('locale de-DE', () => { expect(f('#,##0.00', 1234.5, 'de-DE')).toBe('1.234,50'); });
  it('minimum integer digits', () => { expect(f('0000', 12)).toBe('0012'); });
  it('10k values under 50ms', () => {
    const ast = parseNumberFormat('#,##0.00');
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) formatNumber(i * 1.5, ast);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });
});

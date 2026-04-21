import { describe, expect, it } from 'vitest';
import {
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

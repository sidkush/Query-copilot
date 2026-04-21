// Plan 10b — TS port of backend/vizql/number_format.py.
// Parity guaranteed by the shared fixture at
// backend/vizql/tests/fixtures/number_format_parity/cases.json.

export enum TokenKind {
  DIGIT_OPTIONAL = '#',
  DIGIT_REQUIRED = '0',
  THOUSANDS_SEP = ',',
  DECIMAL_POINT = '.',
  PERCENT = '%',
  PER_MILLE = '\u2030',
  EXPONENT = 'E',
  LITERAL = 'literal',
  QUOTED_LITERAL = 'quoted',
  CURRENCY = 'currency',
  BRACKETED_CURRENCY = 'bracketed_currency',
  SECTION_SEP = ';',
}

export interface Literal { readonly text: string }
export interface IntegerSpec { readonly minDigits: number; readonly thousandsSeparator: boolean }
export interface DecimalSpec { readonly minDigits: number; readonly maxDigits: number }
export interface ExponentSpec { readonly minDigits: number; readonly plusSign: boolean }

export type NegativeStyle = 'minus' | 'parens';

export interface FormatSection {
  readonly integerPart: IntegerSpec;
  readonly decimalPart: DecimalSpec | null;
  readonly exponentPart: ExponentSpec | null;
  readonly prefix: readonly Literal[];
  readonly suffix: readonly Literal[];
  readonly scale: number;
  readonly negativeStyle: NegativeStyle;
}

export interface NumberFormatAST { readonly sections: readonly FormatSection[] }

export class NumberFormatError extends Error {
  readonly column: number;
  constructor(message: string, column: number) {
    super(`${message} (at column ${column})`);
    this.name = 'NumberFormatError';
    this.column = column;
  }
}

const CURRENCY_CHARS = new Set(['$', '\u20ac', '\u00a5', '\u00a3']);

export function parseNumberFormat(spec: string): NumberFormatAST {
  if (spec === '') throw new NumberFormatError('empty format string', 1);
  const raw = splitSections(spec);
  if (raw.length > 4) {
    throw new NumberFormatError('too many sections (max 4)', spec.indexOf(';') + 1);
  }
  const sections = raw.map(([text, baseCol], idx) => parseSection(text, baseCol, idx));
  return { sections };
}

function splitSections(spec: string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  let buf = '';
  let start = 1;
  let inQuote = false;
  for (let i = 0; i < spec.length; ) {
    const c = spec[i];
    if (c === '\\' && i + 1 < spec.length) {
      buf += spec.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '"') {
      inQuote = !inQuote;
      buf += c;
      i += 1;
      continue;
    }
    if (c === ';' && !inQuote) {
      out.push([buf, start]);
      buf = '';
      start = i + 2;
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  if (inQuote) {
    throw new NumberFormatError('unmatched quote', spec.lastIndexOf('"') + 1);
  }
  out.push([buf, start]);
  return out;
}

function parseSection(text: string, baseCol: number, sectionIndex: number): FormatSection {
  const prefix: Literal[] = [];
  const suffix: Literal[] = [];
  let intMinReq = 0;
  let thousands = false;
  let decMin = 0;
  let decMax = 0;
  let inDecimal = false;
  let expDigits = 0;
  let expPlus = false;
  let haveExp = false;
  let scale = 1;
  let negativeStyle: NegativeStyle = 'minus';
  let seenDigit = false;

  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    const col = baseCol + i;
    const push = (l: Literal) => (seenDigit ? suffix : prefix).push(l);

    if (c === '\\' && i + 1 < n) { push({ text: text[i + 1] }); i += 2; continue; }
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      if (end === -1) throw new NumberFormatError('unmatched quote', col);
      push({ text: text.slice(i + 1, end) });
      i = end + 1; continue;
    }
    if (c === '[') {
      const end = text.indexOf(']', i + 1);
      if (end === -1) throw new NumberFormatError('unmatched bracket', col);
      prefix.push({ text: text.slice(i + 1, end) });
      i = end + 1; continue;
    }
    if (CURRENCY_CHARS.has(c)) { push({ text: c }); i += 1; continue; }
    if (c === '#') { if (!inDecimal); else decMax += 1; seenDigit = true; i += 1; continue; }
    if (c === '0') {
      if (!inDecimal) intMinReq += 1;
      else { decMin += 1; decMax += 1; }
      seenDigit = true; i += 1; continue;
    }
    if (c === ',') {
      if (seenDigit && !inDecimal) { thousands = true; i += 1; continue; }
      push({ text: ',' }); i += 1; continue;
    }
    if (c === '.') {
      if (inDecimal) throw new NumberFormatError('multiple decimal points', col);
      inDecimal = true; i += 1; continue;
    }
    if (c === '%') { scale *= 100; suffix.push({ text: '%' }); i += 1; continue; }
    if (c === '\u2030') { scale *= 1000; suffix.push({ text: '\u2030' }); i += 1; continue; }
    if (c === 'E') {
      if (i + 1 >= n || (text[i + 1] !== '+' && text[i + 1] !== '-')) {
        throw new NumberFormatError('scientific exponent must be E+ or E-', col);
      }
      expPlus = text[i + 1] === '+';
      let j = i + 2;
      let d = 0;
      while (j < n && text[j] === '0') { d += 1; j += 1; }
      if (d === 0) throw new NumberFormatError('scientific exponent needs at least one 0', baseCol + j);
      expDigits = d; haveExp = true; i = j; continue;
    }
    if (c === '(' && sectionIndex === 1) { negativeStyle = 'parens'; prefix.push({ text: '(' }); i += 1; continue; }
    if (c === ')' && sectionIndex === 1 && negativeStyle === 'parens') { suffix.push({ text: ')' }); i += 1; continue; }
    if (c === '@') { suffix.push({ text: '@' }); i += 1; continue; }
    push({ text: c }); i += 1;
  }

  if (!seenDigit && sectionIndex < 3) {
    throw new NumberFormatError('section must contain at least one digit placeholder', baseCol);
  }

  return {
    integerPart: { minDigits: Math.max(intMinReq, seenDigit ? 1 : 0), thousandsSeparator: thousands },
    decimalPart: inDecimal ? { minDigits: decMin, maxDigits: decMax } : null,
    exponentPart: haveExp ? { minDigits: expDigits, plusSign: expPlus } : null,
    prefix,
    suffix,
    scale,
    negativeStyle,
  };
}

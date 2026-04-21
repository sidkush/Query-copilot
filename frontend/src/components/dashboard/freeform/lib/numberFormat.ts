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

  if (!seenDigit && sectionIndex < 2) {
    // Positive (0) + negative (1) sections must have a digit placeholder.
    // Zero (2) and text (3) sections may be literal-only (e.g. `"zero"`, `@`).
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

// --- Formatter ---

const LOCALE_SEPS: Record<string, [string, string]> = {
  'en-US': [',', '.'],
  'en-GB': [',', '.'],
  'de-DE': ['.', ','],
  'fr-FR': ['\u202f', ','],
  'es-ES': ['.', ','],
  'ja-JP': [',', '.'],
  'zh-CN': [',', '.'],
};

function seps(locale: string): [string, string] {
  return LOCALE_SEPS[locale] ?? LOCALE_SEPS['en-US'];
}

function pickSection(ast: NumberFormatAST, value: number):
  { section: FormatSection; addMinus: boolean } {
  const sections = ast.sections;
  const n = sections.length;
  const isNaN_ = Number.isNaN(value);
  const isNeg = !isNaN_ && value < 0;
  const isZero = !isNaN_ && value === 0;
  if (isNaN_) return { section: sections[0], addMinus: false };
  if (n === 1) return { section: sections[0], addMinus: isNeg };
  if (n === 2) return { section: isNeg ? sections[1] : sections[0], addMinus: false };
  if (n === 3) return {
    section: isZero ? sections[2] : isNeg ? sections[1] : sections[0],
    addMinus: false,
  };
  return {
    section: isZero ? sections[2] : isNeg ? sections[1] : sections[0],
    addMinus: false,
  };
}

function roundHalfUp(value: number, decimals: number): string {
  // String-based scaled-integer rounding to guarantee ROUND_HALF_UP parity
  // with Python's Decimal.quantize(..., rounding=ROUND_HALF_UP). JS floats
  // misround .5 edges otherwise (e.g. 1.005 → 1.00).
  if (!Number.isFinite(value)) return String(value);
  const neg = value < 0;
  const abs = Math.abs(value);
  // Render with enough digits that the (decimals+1)th fractional digit is accurate.
  // 20 digits is well past IEEE-754 double precision (15-17 sig digits), so this
  // never accidentally introduces trailing spurious non-zero noise.
  const raw = abs.toFixed(Math.max(decimals + 1, 20));
  // Split on '.'
  const dotIdx = raw.indexOf('.');
  const intPart = dotIdx === -1 ? raw : raw.slice(0, dotIdx);
  const fracPart = dotIdx === -1 ? '' : raw.slice(dotIdx + 1);

  // Combine to a single digit string scaled by 10^(decimals+1), then look at the
  // last digit to decide half-up.
  let digits: string;
  if (decimals >= fracPart.length) {
    // No rounding needed: pad the fraction with zeros.
    digits = intPart + fracPart.padEnd(decimals, '0');
    const result = decimals === 0 ? digits : digits.slice(0, digits.length - decimals) + '.' + digits.slice(digits.length - decimals);
    return neg ? '-' + result : result;
  }
  const keepFrac = fracPart.slice(0, decimals);
  const nextDigit = fracPart[decimals];
  let combined = intPart + keepFrac; // scaled integer representation
  if (combined === '') combined = '0';
  if (nextDigit !== undefined && nextDigit >= '5') {
    // Add 1 via string math.
    combined = addOneToDigitString(combined);
  }
  // Reinsert decimal point.
  let result: string;
  if (decimals === 0) {
    result = combined;
  } else {
    const pad = combined.padStart(decimals + 1, '0');
    result = pad.slice(0, pad.length - decimals) + '.' + pad.slice(pad.length - decimals);
  }
  return neg ? '-' + result : result;
}

function addOneToDigitString(s: string): string {
  const arr = s.split('');
  let i = arr.length - 1;
  let carry = 1;
  while (i >= 0 && carry) {
    const d = arr[i].charCodeAt(0) - 48 + carry;
    if (d === 10) {
      arr[i] = '0';
      carry = 1;
    } else {
      arr[i] = String.fromCharCode(48 + d);
      carry = 0;
    }
    i -= 1;
  }
  if (carry) arr.unshift('1');
  return arr.join('');
}

function formatInteger(absIntStr: string, spec: IntegerSpec, locale: string): string {
  const [thousands] = seps(locale);
  let padded = absIntStr.replace(/^0+/, '') || '0';
  if (padded.length < spec.minDigits) padded = padded.padStart(spec.minDigits, '0');
  if (!spec.thousandsSeparator) return padded;
  const rev = padded.split('').reverse().join('');
  const groups: string[] = [];
  for (let i = 0; i < rev.length; i += 3) groups.push(rev.slice(i, i + 3));
  return groups.join(thousands).split('').reverse().join('');
}

export function formatNumber(
  value: number,
  ast: NumberFormatAST,
  locale: string = 'en-US',
): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return 'Infinity';
  if (value === Number.NEGATIVE_INFINITY) return '-Infinity';

  const { section, addMinus } = pickSection(ast, value);
  const scaled = value * section.scale;
  const absScaled = Math.abs(scaled);
  const [, decimalSep] = seps(locale);

  // Literal-only sections (zero / text slots with no digit placeholders)
  // render just their prefix + suffix.
  const hasDigitPlaceholder =
    section.integerPart.minDigits > 0 || section.decimalPart !== null || section.exponentPart !== null;
  if (!hasDigitPlaceholder) {
    const pfx = section.prefix.map(l => l.text).join('');
    const sfx = section.suffix.map(l => l.text).join('');
    return pfx + sfx;
  }

  let core: string;
  if (section.exponentPart) {
    core = formatScientific(absScaled, section, decimalSep);
  } else {
    const maxDec = section.decimalPart?.maxDigits ?? 0;
    const rounded = roundHalfUp(absScaled, maxDec);
    const [intPart, fracPartRaw = ''] = rounded.split('.');
    const intRendered = formatInteger(intPart, section.integerPart, locale);
    if (section.decimalPart) {
      let frac = fracPartRaw.slice(0, maxDec);
      const minD = section.decimalPart.minDigits;
      if (frac.length < minD) frac = frac.padEnd(minD, '0');
      if (maxDec > minD) {
        frac = frac.replace(/0+$/, '');
        if (frac.length < minD) frac = frac.padEnd(minD, '0');
      }
      core = frac ? intRendered + decimalSep + frac : intRendered;
    } else {
      core = intRendered;
    }
  }

  const prefix = section.prefix.map(l => l.text).join('');
  const suffix = section.suffix.map(l => l.text).join('');
  let result = prefix + core + suffix;
  if (addMinus) result = '-' + result;
  return result;
}

function formatScientific(abs: number, section: FormatSection, decimalSep: string): string {
  const exp = section.exponentPart!;
  if (abs === 0) {
    const sign = exp.plusSign ? '+' : '';
    return `0E${sign}${'0'.repeat(exp.minDigits)}`;
  }
  const e = Math.floor(Math.log10(abs));
  const mantissa = abs / Math.pow(10, e);
  const maxDec = section.decimalPart?.maxDigits ?? 0;
  const minDec = section.decimalPart?.minDigits ?? 0;
  const mStr = roundHalfUp(mantissa, maxDec);
  const [mi, mfRaw = ''] = mStr.split('.');
  let mf = mfRaw;
  if (maxDec > minDec) {
    mf = mf.replace(/0+$/, '');
    if (mf.length < minDec) mf = mf.padEnd(minDec, '0');
  } else if (mf.length < minDec) {
    mf = mf.padEnd(minDec, '0');
  }
  const body = mi + (mf ? decimalSep + mf : '');
  const sign = e >= 0 ? (exp.plusSign ? '+' : '') : '-';
  const expBody = Math.abs(e).toString().padStart(exp.minDigits, '0');
  return `${body}E${sign}${expBody}`;
}

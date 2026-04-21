import type { NumberFormatAST } from '../../components/dashboard/freeform/lib/numberFormat';

export interface VegaFormatSpec {
  readonly format: string;
  readonly formatType: 'number' | 'time';
}

/**
 * Map a parsed `NumberFormatAST` to a Vega-Lite format spec. If the AST
 * can be expressed exactly in D3-format, return that. Otherwise return
 * a sentinel `askdb:<raw-pattern>` string and rely on the registered
 * `askdbFormatNumber` Vega expression function to do the work.
 */
export function toVegaFormat(ast: NumberFormatAST, rawPattern?: string): VegaFormatSpec {
  // Only single-section patterns without paren-negative + without
  // bracketed literals map cleanly to D3.
  if (ast.sections.length !== 1) {
    return askdbFallback(ast, rawPattern);
  }
  const s = ast.sections[0];
  const hasBracket = s.prefix.some(l => l.text.length > 1 && !/^[$€¥£]$/.test(l.text));
  const hasParens = s.negativeStyle === 'parens';
  if (hasBracket || hasParens) return askdbFallback(ast, rawPattern);

  const dec = s.decimalPart?.maxDigits ?? 0;
  if (s.exponentPart) return { format: `.${dec}e`, formatType: 'number' };
  if (s.scale === 100) return { format: `.${dec}%`, formatType: 'number' };
  const thousands = s.integerPart.thousandsSeparator ? ',' : '';
  return { format: `${thousands}.${dec}f`, formatType: 'number' };
}

function askdbFallback(_ast: NumberFormatAST, rawPattern?: string): VegaFormatSpec {
  return { format: `askdb:${rawPattern ?? ''}`, formatType: 'number' };
}

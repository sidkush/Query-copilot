import * as vega from 'vega';

import {
  formatNumber,
  NumberFormatError,
  parseNumberFormat,
} from '../../components/dashboard/freeform/lib/numberFormat';

const astCache = new Map<string, ReturnType<typeof parseNumberFormat>>();

export function askdbFormatNumberImpl(value: number, pattern: string): string {
  if (!pattern) return '#ERR';
  let ast = astCache.get(pattern);
  if (!ast) {
    try {
      ast = parseNumberFormat(pattern);
      astCache.set(pattern, ast);
    } catch (e) {
      if (e instanceof NumberFormatError) return '#ERR';
      throw e;
    }
  }
  return formatNumber(Number(value), ast);
}

// Register once at module load. Safe to import multiple times — re-registration
// is an idempotent overwrite in vega's registry.
(vega as any).expressionFunction('askdbFormatNumber', askdbFormatNumberImpl);

import { describe, expect, it } from 'vitest';

import { parseNumberFormat } from '../../../components/dashboard/freeform/lib/numberFormat';
import { toVegaFormat } from '../vegaFormatAdapter';

describe('toVegaFormat', () => {
  it('maps #,##0 to d3 `,.0f`', () => {
    const out = toVegaFormat(parseNumberFormat('#,##0'));
    expect(out).toEqual({ format: ',.0f', formatType: 'number' });
  });

  it('maps #,##0.00 to d3 `,.2f`', () => {
    const out = toVegaFormat(parseNumberFormat('#,##0.00'));
    expect(out).toEqual({ format: ',.2f', formatType: 'number' });
  });

  it('maps 0.0% to d3 `.1%`', () => {
    const out = toVegaFormat(parseNumberFormat('0.0%'));
    expect(out).toEqual({ format: '.1%', formatType: 'number' });
  });

  it('maps 0.##E+00 to d3 `.2e`', () => {
    const out = toVegaFormat(parseNumberFormat('0.##E+00'));
    expect(out).toEqual({ format: '.2e', formatType: 'number' });
  });

  it('falls back to askdbFormatNumber for paren-negative', () => {
    const out = toVegaFormat(parseNumberFormat('$#,##0;($#,##0)'), '$#,##0;($#,##0)');
    expect(out.formatType).toBe('number');
    expect(out.format).toBe('askdb:$#,##0;($#,##0)');
  });

  it('falls back to askdbFormatNumber for bracketed currency', () => {
    const out = toVegaFormat(parseNumberFormat('[USD]#,##0.00'), '[USD]#,##0.00');
    expect(out.format).toBe('askdb:[USD]#,##0.00');
  });
});

describe('askdbFormatNumber Vega expression fn', () => {
  it('registers on vega global', async () => {
    const mod = await import('../registerVegaFormat');
    const vega = await import('vega');
    const vegaHost = vega as unknown as {
      expressionFunction: (name: string, fn?: (...args: unknown[]) => unknown) => unknown;
    };
    expect(typeof vegaHost.expressionFunction).toBe('function');
    // After import, askdbFormatNumber must be callable via the registry.
    const expr = vegaHost.expressionFunction('askdbFormatNumber');
    expect(typeof expr).toBe('function');
    // Smoke: call through the registered fn.
    const out = mod.askdbFormatNumberImpl(1234.5, '#,##0.00');
    expect(out).toBe('1,234.50');
    // Invalid pattern → bubble up as string "#ERR" (non-throwing to keep chart from blanking).
    expect(mod.askdbFormatNumberImpl(1, '')).toBe('#ERR');
  });
});

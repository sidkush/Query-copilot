import { describe, expect, it } from 'vitest';
import { compileTrendLine, type TrendLineSpec, type TrendFit, type VegaLiteLayer } from '../../analytics/trendLineToVega';

import linearFixture from './__fixtures__/trend-line-linear.json';
import polyFactorFixture from './__fixtures__/trend-line-polynomial-factor.json';
import logBandFixture from './__fixtures__/trend-line-log-band.json';

describe('compileTrendLine', () => {
  it('emits a single line mark + tooltip for linear no-factor', () => {
    const spec: TrendLineSpec = linearFixture.spec as TrendLineSpec;
    const fits: TrendFit[] = linearFixture.fits as TrendFit[];
    const layers = compileTrendLine(spec, fits);
    expect(layers).toHaveLength(1);
    expect(layers[0].mark.type).toBe('line');
    expect(layers[0].mark.tooltip).toBe(true);
    expect(layers[0].data.values).toEqual(
      fits[0].result.predictions.map((p) => ({
        ...p,
        equation: fits[0].result.equation,
        r_squared: fits[0].result.r_squared,
        p_value: fits[0].result.p_value,
        n: fits[0].result.predictions.length,
        factor: fits[0].factor_value,
      })),
    );
  });

  it('emits line + band layers per factor when confidence bands enabled', () => {
    const { spec, fits } = logBandFixture as { spec: TrendLineSpec; fits: TrendFit[] };
    const layers = compileTrendLine(spec, fits);
    // One band + one line per factor group. Fixture has 2 groups.
    expect(layers.filter((l: VegaLiteLayer) => l.mark.type === 'area')).toHaveLength(2);
    expect(layers.filter((l: VegaLiteLayer) => l.mark.type === 'line')).toHaveLength(2);
  });

  it('colors by factor when color_by_factor is set', () => {
    const { spec, fits } = polyFactorFixture as { spec: TrendLineSpec; fits: TrendFit[] };
    const layers = compileTrendLine(spec, fits);
    // Each line layer carries a constant color encoding derived from factor_value.
    const lines = layers.filter((l: VegaLiteLayer) => l.mark.type === 'line');
    const colors = lines.map((l: VegaLiteLayer) => {
      const color = l.encoding?.color as { value?: string } | undefined;
      return color?.value;
    });
    expect(new Set(colors).size).toBe(lines.length);
  });

  it('surfaces equation + R² + p-value in tooltip channel', () => {
    const spec: TrendLineSpec = linearFixture.spec as TrendLineSpec;
    const fits: TrendFit[] = linearFixture.fits as TrendFit[];
    const layers = compileTrendLine(spec, fits);
    const tooltip = layers[0].encoding?.tooltip;
    expect(Array.isArray(tooltip)).toBe(true);
    const fields = (tooltip as Array<{ field?: string; title?: string }>).map((t) => t.field ?? t.title);
    expect(fields.some((f: string) => /equation/i.test(f))).toBe(true);
    expect(fields.some((f: string) => /r.?squared/i.test(f))).toBe(true);
  });
});

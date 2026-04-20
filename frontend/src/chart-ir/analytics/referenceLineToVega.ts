/**
 * Plan 9a — compile analytics rows (from /api/v1/queries/execute response
 * `analytics_rows`) into Vega-Lite layer specs. Pure function. No React.
 *
 * Every reference-line/band/distribution is rendered as its own layer so
 * the caller (VegaRenderer) appends them to a base ChartSpec's `layer`.
 */

export type RefLineRow = {
  kind: 'reference_line';
  axis: 'x' | 'y';
  aggregation: 'constant' | 'mean' | 'median' | 'sum' | 'min' | 'max' | 'percentile';
  scope: 'entire' | 'pane' | 'cell';
  percentile: number | null;
  value: number | null;
  label: 'value' | 'computation' | 'custom' | 'none';
  custom_label: string;
  line_style: 'solid' | 'dashed' | 'dotted';
  color: string;
  show_marker: boolean;
};

export type RefBandRow = {
  kind: 'reference_band';
  axis: 'x' | 'y';
  from_value: number | null;
  to_value: number | null;
  fill: string;
  fill_opacity: number;
};

export type RefDistRow = {
  kind: 'reference_distribution';
  axis: 'x' | 'y';
  scope: 'entire' | 'pane' | 'cell';
  style: 'confidence' | 'quantile' | 'stddev';
  percentiles: number[];
  values: (number | null)[];
  color: string;
};

export type AnalyticsRow = RefLineRow | RefBandRow | RefDistRow;

export type VegaLayer = {
  mark: Record<string, unknown>;
  encoding: Record<string, unknown>;
};

const DASH: Record<RefLineRow['line_style'], number[] | undefined> = {
  solid: undefined,
  dashed: [4, 4],
  dotted: [1, 3],
};

function labelText(row: RefLineRow): string | null {
  if (row.label === 'none') return null;
  if (row.label === 'custom') return row.custom_label || '';
  if (row.label === 'value') return row.value == null ? '' : String(row.value);
  // "computation"
  const v = row.value == null ? '' : String(row.value);
  const word =
    row.aggregation === 'mean' ? 'Average' :
    row.aggregation === 'median' ? 'Median' :
    row.aggregation === 'percentile' ? `P${row.percentile}` :
    row.aggregation.charAt(0).toUpperCase() + row.aggregation.slice(1);
  return `${word} ${v}`.trim();
}

function refLineLayers(row: RefLineRow): VegaLayer[] {
  if (row.value == null) return [];
  const axis = row.axis;
  const dash = DASH[row.line_style];
  const ruleMark: Record<string, unknown> = {
    type: 'rule',
    color: row.color,
    size: 2,
  };
  if (dash !== undefined) ruleMark.strokeDash = dash;
  const layers: VegaLayer[] = [{
    mark: ruleMark,
    encoding: { [axis]: { datum: row.value, type: 'quantitative' } },
  }];
  const text = labelText(row);
  if (text) {
    layers.push({
      mark: { type: 'text', align: 'left', dx: 4, dy: -4, color: row.color },
      encoding: {
        [axis]: { datum: row.value, type: 'quantitative' },
        text: { value: text },
      },
    });
  }
  return layers;
}

function refBandLayers(row: RefBandRow): VegaLayer[] {
  if (row.from_value == null || row.to_value == null) return [];
  const [lo, hi] = row.from_value <= row.to_value
    ? [row.from_value, row.to_value]
    : [row.to_value, row.from_value];
  const axis = row.axis;
  const axis2 = (axis === 'y' ? 'y2' : 'x2') as 'x2' | 'y2';
  return [{
    mark: { type: 'rect', color: row.fill, opacity: row.fill_opacity },
    encoding: {
      [axis]:  { datum: lo, type: 'quantitative' },
      [axis2]: { datum: hi },
    },
  }];
}

function refDistLayers(row: RefDistRow): VegaLayer[] {
  const axis = row.axis;
  const n = row.percentiles.length;
  const out: VegaLayer[] = [];
  for (let i = 0; i < n; i++) {
    const v = row.values[i];
    if (v == null) continue;
    // Outer percentiles drawn lighter, middle stronger.
    const edgeDistance = Math.min(i, n - 1 - i) / Math.max(1, Math.floor(n / 2));
    const opacity = 0.4 + 0.3 * edgeDistance;
    out.push({
      mark: { type: 'rule', color: row.color, opacity, size: 1 },
      encoding: { [axis]: { datum: v, type: 'quantitative' } },
    });
  }
  return out;
}

export function compileAnalyticsToVegaLayers(rows: AnalyticsRow[]): VegaLayer[] {
  const out: VegaLayer[] = [];
  for (const row of rows) {
    if (row.kind === 'reference_line') out.push(...refLineLayers(row));
    else if (row.kind === 'reference_band') out.push(...refBandLayers(row));
    else if (row.kind === 'reference_distribution') out.push(...refDistLayers(row));
  }
  return out;
}

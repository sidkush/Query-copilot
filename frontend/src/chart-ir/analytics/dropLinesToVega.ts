/**
 * Plan 9e — Client-side Drop Lines overlay.
 *
 * A drop line is a 1px dashed (or dotted) rule connecting an active
 * (hovered / selected) mark to the nearest axis — x-axis (bottom),
 * y-axis (left), or both. See Build_Tableau.md §XIII.1 ("UI feature,
 * not separate subsystem"). Zero query overhead; pure Vega-Lite layer
 * injection.
 */

export interface DropLinesSpec {
  mode: 'x' | 'y' | 'both' | 'off';
  color: string;
  line_style: 'dashed' | 'dotted';
}

export interface ActiveMark {
  x: number;
  y: number;
  xField: string;
  yField: string;
}

export type VegaLiteLayer = Record<string, unknown>;

const DASH_PATTERN: Record<DropLinesSpec['line_style'], number[]> = {
  dashed: [4, 3],
  dotted: [1, 2],
};

export function compileDropLines(
  spec: DropLinesSpec,
  mark: ActiveMark,
): VegaLiteLayer[] {
  if (spec.mode === 'off') return [];

  const strokeDash = DASH_PATTERN[spec.line_style];
  const layers: VegaLiteLayer[] = [];

  // Drop to x-axis — vertical line from (mark.x, mark.y) down to (mark.x, 0).
  if (spec.mode === 'x' || spec.mode === 'both') {
    layers.push({
      data: { values: [{ x: mark.x, y_start: mark.y, y_end: 0 }] },
      mark: { type: 'rule', color: spec.color, strokeWidth: 1, strokeDash },
      encoding: {
        x:  { field: 'x',       type: 'quantitative', title: mark.xField },
        y:  { field: 'y_start', type: 'quantitative', title: mark.yField },
        y2: { field: 'y_end' },
      },
    });
  }

  // Drop to y-axis — horizontal line from (mark.x, mark.y) to (0, mark.y).
  if (spec.mode === 'y' || spec.mode === 'both') {
    layers.push({
      data: { values: [{ y: mark.y, x_start: mark.x, x_end: 0 }] },
      mark: { type: 'rule', color: spec.color, strokeWidth: 1, strokeDash },
      encoding: {
        y:  { field: 'y',       type: 'quantitative', title: mark.yField },
        x:  { field: 'x_start', type: 'quantitative', title: mark.xField },
        x2: { field: 'x_end' },
      },
    });
  }

  return layers;
}

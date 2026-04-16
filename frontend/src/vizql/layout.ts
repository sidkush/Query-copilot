/**
 * Layout engine — computes axis bounds, margins, legend position, facet panes.
 */

import type {
  ChartLayout, AxisLayout, LegendLayout, Rect,
  CompiledSpec, ScaleSet, AggregatedData, Scale,
  LinearScale, BandScale, TimeScale,
} from './types';

const DEFAULT_MARGIN = { top: 30, right: 20, bottom: 50, left: 60 };
const LEGEND_WIDTH = 120;
const LEGEND_ITEM_HEIGHT = 18;
const FONT_SIZE = 11;

function formatTick(value: unknown, type: string): string {
  if (type === 'temporal' && typeof value === 'number') {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value ?? '');
}

function buildAxisLayout(
  scale: Scale,
  position: 'bottom' | 'left',
  title: string | undefined,
  channelType: string,
): AxisLayout {
  const ticks: AxisLayout['ticks'] = [];
  const gridLines: number[] = [];

  if (scale.kind === 'band') {
    const bs = scale as BandScale;
    for (const val of bs.domain) {
      const px = bs.map(val) + bs.bandwidth / 2;
      ticks.push({ value: val, pixel: px, label: String(val) });
    }
  } else if (scale.kind === 'linear') {
    const ls = scale as LinearScale;
    for (const val of ls.ticks(6)) {
      const px = ls.map(val);
      ticks.push({ value: val, pixel: px, label: formatTick(val, 'quantitative') });
      gridLines.push(px);
    }
  } else if (scale.kind === 'time') {
    const ts = scale as TimeScale;
    for (const d of ts.ticks(6)) {
      const px = ts.map(d);
      ticks.push({ value: d, pixel: px, label: formatTick(d.getTime(), 'temporal') });
      gridLines.push(px);
    }
  }

  return { position, scale, title, ticks, gridLines };
}

/**
 * Compute the full layout from spec + scales + canvas dimensions.
 */
export function computeLayout(
  spec: CompiledSpec,
  scales: ScaleSet,
  data: AggregatedData,
  width: number,
  height: number,
): ChartLayout {
  const enc = spec.encoding;
  const hasLegend = !!(enc.color && data.domains.get(enc.color.field)?.values);
  const margin = { ...DEFAULT_MARGIN };

  if (hasLegend) margin.right += LEGEND_WIDTH;

  const plot: Rect = {
    x: margin.left,
    y: margin.top,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  // Build axes
  let xAxis: AxisLayout | undefined;
  let yAxis: AxisLayout | undefined;

  if (scales.x) {
    xAxis = buildAxisLayout(
      scales.x,
      'bottom',
      enc.x?.title ?? enc.x?.field,
      enc.x?.type ?? 'quantitative',
    );
  }

  if (scales.y) {
    yAxis = buildAxisLayout(
      scales.y,
      'left',
      enc.y?.title ?? enc.y?.field,
      enc.y?.type ?? 'quantitative',
    );
  }

  // Build legend
  let legend: LegendLayout | undefined;
  if (hasLegend && enc.color && scales.color) {
    const domain = data.domains.get(enc.color.field);
    const entries = (domain?.values ?? []).map((v) => ({
      label: String(v),
      color: scales.color!.map(v),
    }));
    legend = {
      rect: {
        x: width - margin.right + 20,
        y: margin.top,
        width: LEGEND_WIDTH - 30,
        height: entries.length * LEGEND_ITEM_HEIGHT + 24,
      },
      title: enc.color.title ?? enc.color.field,
      entries,
      type: 'categorical',
    };
  }

  // Handle facet panes
  let panes: { rect: Rect; value: string }[] | undefined;
  if (spec.facet) {
    const facetDomain = data.domains.get(spec.facet.field);
    const values = (facetDomain?.values ?? []).map(String);
    const cols = spec.facet.columns ?? Math.ceil(Math.sqrt(values.length));
    const rows = Math.ceil(values.length / cols);
    const paneW = plot.width / cols;
    const paneH = plot.height / rows;
    const gap = 10;

    panes = values.map((v, i) => ({
      rect: {
        x: plot.x + (i % cols) * paneW + gap / 2,
        y: plot.y + Math.floor(i / cols) * paneH + gap / 2,
        width: paneW - gap,
        height: paneH - gap,
      },
      value: v,
    }));
  }

  return {
    canvas: { x: 0, y: 0, width, height },
    plot,
    xAxis,
    yAxis,
    legend,
    panes,
    margin,
  };
}

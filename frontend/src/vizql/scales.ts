/**
 * Scale system — linear, band, time, color.
 *
 * Minimal, zero-dependency implementations tuned for chart rendering speed.
 * No D3 — we implement just what we need with tight loops.
 */

import type {
  LinearScale, BandScale, TimeScale, ColorScale, ScaleSet,
  CompiledSpec, AggregatedData, EncodingChannel,
} from './types';
import { categoricalColor, sequentialColor, DEFAULT_MARK_COLOR } from './palettes';

// ── Linear scale ────────────────────────────────────────────

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice: number;
  if (round) {
    nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  } else {
    nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  }
  return nice * Math.pow(10, exp);
}

export function createLinearScale(
  domain: [number, number],
  range: [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const dSpan = d1 - d0 || 1;
  const rSpan = r1 - r0;

  // Pre-compute factor + offset: map(v) = v * factor + offset
  // Eliminates division from the hot path (1 mul + 1 add vs sub + div + mul + add)
  const factor = rSpan / dSpan;
  const offset = r0 - d0 * factor;

  const scale: LinearScale = {
    kind: 'linear',
    domain: [...domain],
    range: [...range],
    map(value: number) {
      return value * factor + offset;
    },
    ticks(count = 5) {
      const range = niceNum(d1 - d0, false);
      const step = niceNum(range / (count - 1), true);
      const lo = Math.floor(d0 / step) * step;
      const hi = Math.ceil(d1 / step) * step;
      const ticks: number[] = [];
      for (let v = lo; v <= hi + step * 0.5; v += step) {
        ticks.push(Math.round(v * 1e10) / 1e10); // avoid float artifacts
      }
      return ticks;
    },
    nice() {
      const range = niceNum(d1 - d0, false);
      const step = niceNum(range / 4, true);
      const newD0 = Math.floor(d0 / step) * step;
      const newD1 = Math.ceil(d1 / step) * step;
      return createLinearScale([newD0, newD1], [r0, r1]);
    },
  };
  return scale;
}

// ── Band scale ──────────────────────────────────────────────

export function createBandScale(
  domain: string[],
  range: [number, number],
  padding = 0.1,
): BandScale {
  const n = domain.length || 1;
  const totalRange = range[1] - range[0];
  const step = totalRange / (n + padding * 2);
  const bandwidth = step * (1 - padding);
  const offset = step * padding;

  const indexMap = new Map<string, number>();
  domain.forEach((v, i) => indexMap.set(String(v), i));

  return {
    kind: 'band',
    domain: [...domain],
    range: [...range],
    bandwidth,
    step,
    padding,
    map(value: string) {
      const idx = indexMap.get(String(value)) ?? 0;
      return range[0] + offset + idx * step;
    },
  };
}

// ── Time scale ──────────────────────────────────────────────

export function createTimeScale(
  domain: [number, number],
  range: [number, number],
): TimeScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const dSpan = d1 - d0 || 1;
  const rSpan = r1 - r0;

  // Pre-compute factor + offset (same optimization as linear scale)
  const factor = rSpan / dSpan;
  const offset = r0 - d0 * factor;

  return {
    kind: 'time',
    domain: [...domain],
    range: [...range],
    map(value: number | string | Date) {
      const ms = value instanceof Date ? value.getTime() : typeof value === 'string' ? new Date(value).getTime() : value;
      return ms * factor + offset;
    },
    ticks(count = 5) {
      const step = (d1 - d0) / count;
      const ticks: Date[] = [];
      for (let i = 0; i <= count; i++) {
        ticks.push(new Date(d0 + i * step));
      }
      return ticks;
    },
  };
}

// ── Color scale ─────────────────────────────────────────────

export function createCategoricalColorScale(domain: unknown[]): ColorScale {
  const indexMap = new Map<string, number>();
  domain.forEach((v, i) => indexMap.set(String(v), i));

  return {
    kind: 'color',
    type: 'nominal',
    domain: [...domain],
    map(value: unknown) {
      const idx = indexMap.get(String(value)) ?? 0;
      return categoricalColor(idx);
    },
  };
}

export function createSequentialColorScale(
  domain: [number, number],
): ColorScale {
  const [min, max] = domain;
  const span = max - min || 1;

  return {
    kind: 'color',
    type: 'sequential',
    domain: [min, max],
    map(value: unknown) {
      const t = (Number(value) - min) / span;
      return sequentialColor(t);
    },
  };
}

// ── Build scales from compiled spec + aggregated data ───────

export function buildScales(
  data: AggregatedData,
  spec: CompiledSpec,
  plotWidth: number,
  plotHeight: number,
): ScaleSet {
  const enc = spec.encoding;
  const scales: ScaleSet = {};

  // X scale
  if (enc.x) {
    scales.x = buildSingleScale(enc.x, data, [0, plotWidth]);
  }

  // Y scale (inverted: 0 = top, height = bottom)
  if (enc.y) {
    scales.y = buildSingleScale(enc.y, data, [plotHeight, 0]);
  }

  // Color scale
  if (enc.color) {
    const domain = data.domains.get(enc.color.field);
    if (domain) {
      if (domain.values) {
        scales.color = createCategoricalColorScale(domain.values);
      } else if (domain.min != null && domain.max != null) {
        scales.color = createSequentialColorScale([domain.min, domain.max]);
      }
    }
  }

  // Size scale
  if (enc.size) {
    const domain = data.domains.get(enc.size.field);
    if (domain?.min != null && domain.max != null) {
      scales.size = createLinearScale([domain.min, domain.max], [4, 30]);
    }
  }

  // Theta scale (for pie/arc)
  if (enc.theta) {
    const domain = data.domains.get(enc.theta.field);
    if (domain?.min != null) {
      // Total sum for theta
      const total = data.rows.reduce((s, r) => s + Number(r[enc.theta!.field] ?? 0), 0);
      scales.theta = createLinearScale([0, total], [0, Math.PI * 2]);
    }
  }

  // xOffset scale (for grouped bars)
  if (enc.xOffset) {
    const domain = data.domains.get(enc.xOffset.field);
    if (domain?.values && scales.x?.kind === 'band') {
      scales.xOffset = createBandScale(
        domain.values.map(String),
        [0, (scales.x as BandScale).bandwidth],
        0.05,
      );
    }
  }

  return scales;
}

function buildSingleScale(
  ch: EncodingChannel,
  data: AggregatedData,
  range: [number, number],
) {
  const domain = data.domains.get(ch.field);
  if (!domain) return createLinearScale([0, 1], range);

  if (ch.type === 'nominal' || ch.type === 'ordinal') {
    return createBandScale((domain.values ?? []).map(String), range);
  }
  if (ch.type === 'temporal') {
    return createTimeScale(
      [domain.min ?? 0, domain.max ?? 1],
      range,
    ).kind === 'time'
      ? createTimeScale([domain.min ?? 0, domain.max ?? 1], range)
      : createLinearScale([0, 1], range);
  }
  // Quantitative — nice the domain, include 0 for bar charts
  const min = Math.min(0, domain.min ?? 0);
  const max = domain.max ?? 1;
  return createLinearScale([min, max], range).nice();
}

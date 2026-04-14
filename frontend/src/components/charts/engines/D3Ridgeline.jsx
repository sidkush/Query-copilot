import { useMemo } from 'react';
import * as d3shape from 'd3-shape';
import * as d3scale from 'd3-scale';
import { gaussianKDE, silvermanBandwidth } from '../../../lib/kernelDensity';
import { CHART_PALETTES, TOKENS } from '../../dashboard/tokens';

/**
 * D3Ridgeline — Joy Division / joy plot ridgeline chart.
 *
 * Each ridge is a KDE over the numeric values of one category, drawn
 * as a filled path. Ridges are stacked vertically with partial overlap
 * so the shapes interlock — that's the visual signature. Pure React
 * SVG rendering (no imperative DOM mutation) so re-renders stay
 * predictable and there's no d3-selection attached anywhere.
 *
 * Data contract:
 *   - columns[0]: category (each unique value becomes a ridge)
 *   - first numeric column: the samples
 *
 * Edge cases:
 *   - < 2 unique categories → message, not chart
 *   - single-value ridge → KDE returns flat, fillOpacity reveals nothing
 *     (acceptable degenerate case, still renders the baseline)
 */

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 260;
const LEFT_PAD = 90;
const RIGHT_PAD = 24;
const TOP_PAD = 24;
const BOTTOM_PAD = 30;
const MAX_RIDGES = 12;
const KDE_POINTS = 60;

export default function D3Ridgeline({ tile }) {
  const ridges = useMemo(() => {
    const columns = tile?.columns || [];
    const rows = tile?.rows || [];
    const catCol = columns[0];
    const valCol = columns.find(
      (c, i) => i > 0 && rows.some((r) => Number.isFinite(Number(r[c])))
    );
    if (!catCol || !valCol || rows.length === 0) return [];

    const groups = new Map();
    for (const r of rows) {
      const cat = r[catCol];
      if (cat == null) continue;
      const v = Number(r[valCol]);
      if (!Number.isFinite(v)) continue;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(v);
    }

    const entries = [...groups.entries()]
      .filter(([, data]) => data.length >= 2)
      .sort((a, b) => {
        // Sort by median descending so the densest ridge is on top —
        // reads like a hierarchy the way Joy Division intended.
        const med = (arr) => {
          const s = [...arr].sort((x, y) => x - y);
          const n = s.length;
          return n % 2 ? s[Math.floor(n / 2)] : (s[n / 2 - 1] + s[n / 2]) / 2;
        };
        return med(b[1]) - med(a[1]);
      })
      .slice(0, MAX_RIDGES);

    return entries.map(([name, data]) => ({
      name: String(name),
      count: data.length,
      kde: gaussianKDE(data, silvermanBandwidth(data), KDE_POINTS),
    }));
  }, [tile?.columns, tile?.rows]);

  const paths = useMemo(() => {
    if (!ridges.length) return [];
    const palette = CHART_PALETTES.default;

    const allX = ridges.flatMap((r) => r.kde.map((p) => p.x));
    const allY = ridges.flatMap((r) => r.kde.map((p) => p.density));
    if (!allX.length) return [];

    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);
    const yMax = Math.max(...allY) || 1;
    const x = d3scale
      .scaleLinear()
      .domain([xMin, xMax])
      .range([LEFT_PAD, DEFAULT_WIDTH - RIGHT_PAD]);

    const innerH = DEFAULT_HEIGHT - TOP_PAD - BOTTOM_PAD;
    const rowH = innerH / ridges.length;
    // Ridges reach up to 1.8× their row height — this is the overlap
    // that gives Joy Division its interlock.
    const ridgeAmp = rowH * 1.8;

    return ridges.map((ridge, i) => {
      const yOffset = TOP_PAD + i * rowH + rowH;
      const scaleY = d3scale.scaleLinear().domain([0, yMax]).range([0, -ridgeAmp]);
      const area = d3shape
        .area()
        .x((p) => x(p.x))
        .y0(yOffset)
        .y1((p) => yOffset + scaleY(p.density))
        .curve(d3shape.curveBasis);
      const line = d3shape
        .line()
        .x((p) => x(p.x))
        .y((p) => yOffset + scaleY(p.density))
        .curve(d3shape.curveBasis);

      return {
        name: ridge.name,
        count: ridge.count,
        fill: area(ridge.kde),
        stroke: line(ridge.kde),
        color: palette[i % palette.length],
        labelY: yOffset - 2,
      };
    });
  }, [ridges]);

  if (!ridges.length) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{
          color: TOKENS.text.muted,
          fontSize: 11,
          fontFamily: TOKENS.fontBody,
          textAlign: 'center',
          padding: 20,
        }}
      >
        Ridgeline needs a category column + numeric column with at least 2 values per group.
      </div>
    );
  }

  return (
    <div
      className="h-full w-full"
      style={{
        padding: 8,
        fontFamily: TOKENS.fontBody,
        minHeight: 180,
      }}
    >
      <svg
        viewBox={`0 0 ${DEFAULT_WIDTH} ${DEFAULT_HEIGHT}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Ridgeline chart: ${paths.length} categories`}
      >
        <defs>
          {paths.map((p, i) => (
            <linearGradient key={`ridge-grad-${i}`} id={`ridge-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.color} stopOpacity="0.58" />
              <stop offset="90%" stopColor={p.color} stopOpacity="0.12" />
            </linearGradient>
          ))}
        </defs>

        {/* Render each ridge from bottom up so stacks draw top-most last
            and the upper ridge always stencils cleanly on the one below. */}
        {paths.map((p, i) => (
          <g key={`${p.name}-${i}`}>
            <path d={p.fill} fill={`url(#ridge-grad-${i})`} />
            <path d={p.stroke} fill="none" stroke={p.color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
            <text
              x={LEFT_PAD - 8}
              y={p.labelY}
              textAnchor="end"
              fontSize={10}
              fontWeight={600}
              fill={TOKENS.text.secondary}
              style={{ letterSpacing: '-0.005em' }}
            >
              {p.name}
            </text>
            <text
              x={LEFT_PAD - 8}
              y={p.labelY + 10}
              textAnchor="end"
              fontSize={8}
              fill={TOKENS.text.muted}
              style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}
            >
              n = {p.count}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

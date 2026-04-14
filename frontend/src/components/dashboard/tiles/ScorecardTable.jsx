import { useMemo } from 'react';
import { TOKENS } from '../tokens';

/**
 * Dense Scorecard Table — ranked list tile with inline metric bars.
 *
 * No axis chrome, no headers, no borders. Each row is a label + inline
 * mini-bar + tabular value. Sorted descending by the leading numeric
 * metric. Optimized for 5-20 rows, ~4 grid columns wide, 2 rows tall.
 *
 * Props match KPICard / SparklineKPI: { tile, index, formatting }.
 */
export default function ScorecardTable({ tile, formatting }) {
  const columns = tile?.columns || [];
  const labelCol = columns[0];
  const valueCol = columns.find((c, i) => i > 0) || columns[0];

  const { ranked, maxValue } = useMemo(() => {
    const rawRows = tile?.rows;
    if (!rawRows?.length || !labelCol || !valueCol) return { ranked: [], maxValue: 0 };

    const parsed = rawRows
      .map((r) => {
        const v = Number(r[valueCol]);
        return { label: r[labelCol], value: isNaN(v) ? 0 : v };
      })
      .filter((r) => r.label != null);

    parsed.sort((a, b) => b.value - a.value);
    const top = parsed.slice(0, 20);
    const maxValue = top.length ? Math.max(Math.abs(top[0].value), 0.00001) : 0;
    return { ranked: top, maxValue };
  }, [tile?.rows, labelCol, valueCol]);

  const dense = TOKENS.tile.dense;
  const vc = formatting || tile?.visualConfig || {};
  const accentOverride = vc.colors?.measureColors?.[valueCol];

  const formatValue = (v) => {
    if (v == null) return '—';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    if (n % 1 !== 0) return n.toFixed(1);
    return n.toLocaleString();
  };

  if (!ranked.length) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{
          color: TOKENS.text.muted,
          fontSize: dense.labelSize,
          fontFamily: TOKENS.fontBody,
        }}
      >
        No ranked data
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col"
      style={{
        padding: dense.bodyPad,
        fontFamily: TOKENS.fontBody,
        gap: dense.innerGap,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Eyebrow — leading column name as column header in miniature */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: dense.eyebrowSize,
          fontWeight: 700,
          letterSpacing: dense.eyebrowLetterSpacing,
          textTransform: 'uppercase',
          color: TOKENS.text.muted,
          fontFamily: TOKENS.fontDisplay,
          lineHeight: 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelCol}</span>
        <span style={{ flexShrink: 0, marginLeft: 8 }}>{valueCol}</span>
      </div>

      {/* Rows */}
      <div
        className="flex-1 min-h-0"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: dense.rowGap,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {ranked.map((row, i) => {
          const pct = maxValue > 0 ? Math.max(0, Math.min(100, (row.value / maxValue) * 100)) : 0;
          return (
            <div
              key={`${row.label}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: `${dense.rankSize + 6}px 1fr auto`,
                alignItems: 'center',
                gap: 8,
                minHeight: dense.rowHeight,
                lineHeight: 1.2,
              }}
            >
              {/* Rank */}
              <span
                style={{
                  color: dense.rankFg,
                  fontSize: dense.rankSize,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'right',
                }}
              >
                {i + 1}
              </span>

              {/* Label + inline bar track */}
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span
                  style={{
                    fontSize: dense.labelSize + 1,
                    fontWeight: 550,
                    color: TOKENS.text.primary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={String(row.label)}
                >
                  {String(row.label)}
                </span>
                <div
                  style={{
                    width: '100%',
                    height: dense.barHeight,
                    background: dense.barTrack,
                    borderRadius: dense.barRadius,
                    overflow: 'hidden',
                  }}
                  aria-hidden="true"
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: accentOverride || dense.barFill,
                      borderRadius: dense.barRadius,
                      transition: TOKENS.transition,
                    }}
                  />
                </div>
              </div>

              {/* Value */}
              <span
                style={{
                  fontSize: dense.labelSize + 1,
                  fontWeight: 700,
                  color: TOKENS.text.primary,
                  fontVariantNumeric: 'tabular-nums',
                  fontFamily: TOKENS.fontDisplay,
                }}
              >
                {formatValue(row.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

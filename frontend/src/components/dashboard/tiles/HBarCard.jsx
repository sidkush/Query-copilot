import { useMemo } from 'react';
import { TOKENS } from '../tokens';

/**
 * Dense H-Bar Card — inline horizontal-bar list with label overlay.
 *
 * Unlike ScorecardTable (which uses a separate rank column + track
 * below the label), HBarCard overlays the label directly on the bar
 * and treats each row as a single fat bar. Best for 3-10 rows where
 * the bar length IS the story and ranks don't matter.
 *
 * Single numeric metric, variable label length. No axis, no rank,
 * no inline value column chrome.
 */
export default function HBarCard({ tile, formatting }) {
  const columns = tile?.columns || [];
  const labelCol = columns[0];
  const valueCol = columns.find((c, i) => i > 0) || columns[0];

  const { rows, maxValue } = useMemo(() => {
    const rawRows = tile?.rows;
    if (!rawRows?.length || !labelCol || !valueCol) return { rows: [], maxValue: 0 };

    const parsed = rawRows
      .map((r) => {
        const v = Number(r[valueCol]);
        return { label: r[labelCol], value: isNaN(v) ? 0 : v };
      })
      .filter((r) => r.label != null);

    parsed.sort((a, b) => b.value - a.value);
    const top = parsed.slice(0, 10);
    const maxValue = top.length ? Math.max(Math.abs(top[0].value), 0.00001) : 0;
    return { rows: top, maxValue };
  }, [tile?.rows, labelCol, valueCol]);

  const dense = TOKENS.dense;
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

  if (!rows.length) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{
          color: TOKENS.text.muted,
          fontSize: dense.labelSize,
          fontFamily: TOKENS.fontBody,
        }}
      >
        No bar data
      </div>
    );
  }

  const barRowHeight = 26;

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
      <div
        className="flex-1 min-h-0"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: dense.rowGap + 2,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {rows.map((row, i) => {
          const pct = maxValue > 0 ? Math.max(0, Math.min(100, (row.value / maxValue) * 100)) : 0;
          const fill = accentOverride || dense.barFill;
          return (
            <div
              key={`${row.label}-${i}`}
              style={{
                position: 'relative',
                height: barRowHeight,
                width: '100%',
                borderRadius: dense.barRadius + 1,
                overflow: 'hidden',
                background: dense.barTrack,
              }}
            >
              {/* Fill */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${fill}, color-mix(in oklab, ${fill} 85%, transparent))`,
                  borderRadius: dense.barRadius + 1,
                  transition: TOKENS.transition,
                }}
              />

              {/* Overlay: label left, value right */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 9px',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: dense.labelSize + 1.5,
                    fontWeight: 600,
                    color: TOKENS.text.primary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    letterSpacing: '-0.005em',
                    // Text-shadow gives readability on both inside-fill and outside-fill
                    // regions without hard-coded palette assumptions.
                    textShadow: '0 1px 0 var(--bg-elevated)',
                  }}
                  title={String(row.label)}
                >
                  {String(row.label)}
                </span>
                <span
                  style={{
                    fontSize: dense.labelSize + 1.5,
                    fontWeight: 700,
                    color: TOKENS.text.primary,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: TOKENS.fontDisplay,
                    flexShrink: 0,
                    textShadow: '0 1px 0 var(--bg-elevated)',
                  }}
                >
                  {formatValue(row.value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

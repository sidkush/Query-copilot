import { useMemo, useId } from 'react';
import { TOKENS } from '../tokens';

/**
 * Dense Sparkline-KPI — Tableau-class compact metric tile.
 *
 * Four of these fit across a cols=12 dashboard row (minW=3 each).
 * Designed to read at ~120x60 but fills any parent flex box gracefully.
 *
 * Visual language: eyebrow label · big tabular metric · delta chip ·
 * compact line sparkline with terminal dot. No axes, no legend, no chrome.
 *
 * Props match KPICard so TileWrapper can route dense vs. standard KPIs
 * through the same tile contract.
 */
export default function SparklineKPI({ tile, formatting }) {
  const columns = tile?.columns || [];
  const gradientId = useId();
  const valIdx = columns.length > 1 ? 1 : 0;

  const { currentVal, deltaPct, deltaDir, series } = useMemo(() => {
    const rawRows = tile?.rows;
    if (!rawRows?.length) return { currentVal: null, deltaPct: null, deltaDir: 'flat', series: [] };

    const series = rawRows
      .map((r) => Number(Object.values(r)[valIdx]))
      .filter((n) => !isNaN(n));
    if (!series.length) return { currentVal: null, deltaPct: null, deltaDir: 'flat', series: [] };

    const currentVal = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;

    let deltaPct = null;
    let deltaDir = 'flat';
    if (prev !== null && prev !== 0) {
      const pct = ((currentVal - prev) / Math.abs(prev)) * 100;
      deltaPct = pct;
      deltaDir = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
    }

    return { currentVal, deltaPct, deltaDir, series };
  }, [tile?.rows, valIdx]);

  const label = tile?.title || columns[0] || 'Metric';

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

  const sparkline = useMemo(() => {
    if (series.length < 2) return null;
    const w = 100;
    const h = 24;
    const pad = 1.5;
    const maxV = Math.max(...series);
    const minV = Math.min(...series);
    const range = maxV - minV || 1;
    const stepX = (w - pad * 2) / (series.length - 1);

    const pts = series.map((v, i) => ({
      x: pad + i * stepX,
      y: h - pad - ((v - minV) / range) * (h - pad * 2),
    }));

    let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const cx = (a.x + b.x) / 2;
      line += ` Q ${cx.toFixed(2)} ${a.y.toFixed(2)} ${cx.toFixed(2)} ${((a.y + b.y) / 2).toFixed(2)}`;
      line += ` T ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
    }
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${h} L ${pts[0].x.toFixed(2)} ${h} Z`;
    return { line, area, w, h, tip: pts[pts.length - 1] };
  }, [series]);

  const dense = TOKENS.tile.dense;
  const vc = formatting || tile?.visualConfig || {};
  const valueColor = vc.colors?.measureColors?.[columns[valIdx]] || TOKENS.text.primary;

  const deltaBg = deltaDir === 'up' ? dense.deltaUpBg : deltaDir === 'down' ? dense.deltaDownBg : dense.deltaFlatBg;
  const deltaFg = deltaDir === 'up' ? dense.deltaUpFg : deltaDir === 'down' ? dense.deltaDownFg : dense.deltaFlatFg;

  return (
    <div
      className="relative h-full flex flex-col"
      style={{
        padding: dense.bodyPad,
        fontFamily: TOKENS.fontBody,
        gap: dense.innerGap,
        minHeight: 0,
      }}
    >
      {/* Eyebrow label */}
      <div
        style={{
          fontSize: dense.eyebrowSize,
          fontWeight: 700,
          letterSpacing: dense.eyebrowLetterSpacing,
          textTransform: 'uppercase',
          color: TOKENS.text.muted,
          fontFamily: TOKENS.fontDisplay,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1,
        }}
      >
        {label}
      </div>

      {/* Value + delta row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <div
          style={{
            fontSize: dense.valueSize,
            fontWeight: dense.valueWeight,
            letterSpacing: dense.valueLetterSpacing,
            color: valueColor,
            fontFamily: TOKENS.fontDisplay,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: '0 1 auto',
            minWidth: 0,
          }}
        >
          {formatValue(currentVal)}
        </div>

        {deltaPct !== null && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              fontSize: dense.deltaSize,
              fontWeight: dense.deltaWeight,
              padding: '1.5px 5px',
              borderRadius: 9999,
              color: deltaFg,
              background: deltaBg,
              fontFamily: TOKENS.fontDisplay,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-label={`${deltaDir === 'up' ? 'Up' : deltaDir === 'down' ? 'Down' : 'Flat'} ${Math.abs(deltaPct).toFixed(1)} percent`}
          >
            <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {deltaDir === 'up' ? (
                <path d="M2 7L5 3L8 7" />
              ) : deltaDir === 'down' ? (
                <path d="M2 3L5 7L8 3" />
              ) : (
                <path d="M2 5H8" />
              )}
            </svg>
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Sparkline fills remaining vertical space */}
      <div style={{ flex: 1, minHeight: 14, display: 'flex', alignItems: 'flex-end' }}>
        {sparkline ? (
          <svg
            viewBox={`0 0 ${sparkline.w} ${sparkline.h}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`dense-spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={dense.sparkStroke} stopOpacity="0.35" />
                <stop offset="100%" stopColor={dense.sparkStroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={sparkline.area} fill={`url(#dense-spark-${gradientId})`} />
            <path
              d={sparkline.line}
              fill="none"
              stroke={dense.sparkStroke}
              strokeWidth={dense.sparkStrokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {sparkline.tip && (
              <circle cx={sparkline.tip.x} cy={sparkline.tip.y} r="1.8" fill={dense.sparkStroke} />
            )}
          </svg>
        ) : (
          <div
            style={{
              width: '100%',
              height: 1,
              background: dense.barTrack,
              opacity: 0.4,
            }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

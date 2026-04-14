import { useMemo, useEffect, useState, useRef } from 'react';
import { TOKENS } from '../../dashboard/tokens';

/**
 * LiquidGauge — SVG circular gauge with animated liquid fill.
 *
 * Single-metric wow tile. Shows percent fill of a value against a target,
 * with a live sine-wave crest on the liquid surface. Pure SVG +
 * requestAnimationFrame, no three.js, 60fps on every device including
 * low-end phones. Apple Weather / Overcast aesthetic.
 *
 * Data contract:
 *   - rows[rows.length - 1][valueCol] → the current value
 *   - tile.visualConfig.target (optional) → denominator. Default 100.
 *   - If rows has only one row, that's the value.
 *
 * Theme safety: circle fill uses var(--glass-bg-card) so it reads on
 * both themes. Liquid gradient is a fixed accent blue — deliberately
 * not theme-shifted because the liquid IS the visual signal.
 */
export default function LiquidGauge({ tile }) {
  const columns = tile?.columns || [];
  const valueCol = columns.length > 1 ? columns[1] : columns[0];
  const targetVal = Number(tile?.visualConfig?.target) || 100;

  const { pct, rawValue } = useMemo(() => {
    const rows = tile?.rows;
    if (!rows?.length || !valueCol) return { pct: 0, rawValue: 0 };
    const v = Number(rows[rows.length - 1][valueCol]) || 0;
    return { pct: Math.max(0, Math.min(1, v / targetVal)), rawValue: v };
  }, [tile?.rows, valueCol, targetVal]);

  const [wavePhase, setWavePhase] = useState(0);
  const rafRef = useRef(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    try {
      reducedMotion.current = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    } catch {
      reducedMotion.current = false;
    }
    if (reducedMotion.current) return;
    const tick = () => {
      setWavePhase((p) => (p + 0.035) % (Math.PI * 2));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;

  // Animate the fill level with exponential smoothing (one-pass per frame
  // via the same raf). For now we just use the memoized pct directly —
  // framer-motion would be overkill for this single value.
  const waveY = cy + r - pct * r * 2;

  const wavePath = useMemo(() => {
    const segments = [];
    const step = 3;
    for (let x = cx - r; x <= cx + r + step; x += step) {
      const y = waveY + Math.sin((x / 18) + wavePhase) * 3.5 + Math.cos((x / 30) + wavePhase * 1.4) * 1.5;
      segments.push([x, y]);
    }
    const first = segments[0];
    const d = [
      `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`,
      ...segments.slice(1).map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`),
      `L ${cx + r} ${cy + r}`,
      `L ${cx - r} ${cy + r}`,
      'Z',
    ].join(' ');
    return d;
  }, [waveY, wavePhase, cx, cy, r]);

  const label = tile?.title || valueCol || 'Fill Rate';
  const pctLabel = (pct * 100).toFixed(pct * 100 >= 100 ? 0 : 1);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: TOKENS.fontDisplay,
        padding: 8,
      }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width="80%" height="80%" aria-label={`${label}: ${pctLabel}%`}>
        <defs>
          <clipPath id={`liquid-clip-${tile?.id || 'default'}`}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
          <linearGradient id={`liquid-grad-${tile?.id || 'default'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.92" />
            <stop offset="70%" stopColor="#3b82f6" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.82" />
          </linearGradient>
          <filter id={`liquid-glow-${tile?.id || 'default'}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
          </filter>
        </defs>

        {/* Beaker shell */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="var(--glass-bg-card)"
          stroke="var(--glass-border)"
          strokeWidth="1"
        />

        {/* Liquid fill — clipped to the circle */}
        <g clipPath={`url(#liquid-clip-${tile?.id || 'default'})`}>
          <path d={wavePath} fill={`url(#liquid-grad-${tile?.id || 'default'})`} />
          {/* Highlight ripple on top of the wave */}
          <path
            d={wavePath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="1.2"
            filter={`url(#liquid-glow-${tile?.id || 'default'})`}
          />
        </g>

        {/* Outer ring — slight glow to feel like glass */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="color-mix(in oklab, var(--accent) 55%, transparent)"
          strokeWidth="1.8"
        />

        {/* Value text */}
        <text
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          fontSize="30"
          fontWeight="800"
          fill={TOKENS.text.primary}
          style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.028em' }}
        >
          {pctLabel}%
        </text>
        {/* Label */}
        <text
          x={cx}
          y={cy + 30}
          textAnchor="middle"
          fontSize="9.5"
          fill={TOKENS.text.muted}
          style={{ letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}
        >
          {label}
        </text>
        {/* Raw value subtitle (kept small so it doesn't fight the percent) */}
        {rawValue !== 0 && (
          <text
            x={cx}
            y={cy + 46}
            textAnchor="middle"
            fontSize="8.5"
            fill={TOKENS.text.muted}
            style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}
          >
            {rawValue.toLocaleString()} / {targetVal.toLocaleString()}
          </text>
        )}
      </svg>
    </div>
  );
}

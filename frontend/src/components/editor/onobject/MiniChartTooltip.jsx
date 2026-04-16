import { useMemo } from 'react';

/**
 * MiniChartTooltip — floating tooltip with a mini sparkline chart.
 *
 * Renders a small (200×80) inline SVG sparkline for the hovered dimension value.
 * Uses simple SVG polyline — no Vega overhead for the mini-chart.
 *
 * Props:
 *   - x: number — viewport X position
 *   - y: number — viewport Y position
 *   - visible: boolean
 *   - datum: object — the hovered data point
 *   - seriesData: array — all rows for the hovered dimension value (for sparkline)
 *   - xField: string — field for sparkline X axis
 *   - yField: string — field for sparkline Y axis
 *   - label: string — dimension value label
 */
export default function MiniChartTooltip({ x, y, visible, datum, seriesData, xField, yField, label }) {
  if (!visible || !datum) return null;

  const sparklinePoints = useMemo(() => {
    if (!seriesData?.length || !xField || !yField) return '';
    const values = seriesData.map((r, i) => ({
      x: i,
      y: typeof r[yField] === 'number' ? r[yField] : 0,
    }));
    if (values.length < 2) return '';
    const maxY = Math.max(...values.map(v => v.y));
    const minY = Math.min(...values.map(v => v.y));
    const rangeY = maxY - minY || 1;
    const w = 180;
    const h = 60;
    return values.map((v, i) =>
      `${(i / (values.length - 1)) * w},${h - ((v.y - minY) / rangeY) * h}`
    ).join(' ');
  }, [seriesData, xField, yField]);

  return (
    <div
      data-testid="mini-chart-tooltip"
      style={{
        position: 'fixed',
        left: x + 12,
        top: y - 60,
        zIndex: 1000,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(20, 20, 40, 0.95)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        minWidth: 200,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>
        {label}
      </div>
      {datum && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
          {Object.entries(datum).slice(0, 4).map(([k, v]) => (
            <div key={k}>{k}: <strong>{String(v)}</strong></div>
          ))}
        </div>
      )}
      {sparklinePoints && (
        <svg width={180} height={60} style={{ display: 'block' }}>
          <polyline
            points={sparklinePoints}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

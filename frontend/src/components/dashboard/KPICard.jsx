import { useMemo, useId } from 'react';
import { TOKENS, KPI_ACCENTS } from './tokens';

/**
 * Premium KPI card — editorial display typography, gradient area sparkline,
 * tabular numerics, delta pill, bottom context strip. Theme-aware.
 */
export default function KPICard({ tile, index = 0, formatting }) {
  const rows = tile?.rows || [];
  const columns = tile?.columns || [];
  const gradientId = useId();

  const valIdx = columns.length > 1 ? 1 : 0;

  const { currentVal, trendStr, isPositive, trendPct, trendData } = useMemo(() => {
    let currentVal = '--';
    let trendStr = null;
    let isPositive = null;
    let trendPct = null;
    let trendData = [];

    if (rows.length === 0) return { currentVal, trendStr, isPositive, trendPct, trendData };

    trendData = rows.map((r, i) => ({
      name: `T${i}`,
      value: Number(Object.values(r)[valIdx]) || 0,
    }));

    const latestRow = rows[rows.length - 1];
    const prevRow = rows.length > 1 ? rows[rows.length - 2] : null;
    const rawCurrent = Object.values(latestRow)[valIdx];
    currentVal = rawCurrent;

    if (prevRow) {
      const c = Number(rawCurrent);
      const p = Number(Object.values(prevRow)[valIdx]);
      if (!isNaN(c) && !isNaN(p) && p !== 0) {
        const diff = c - p;
        const pct = (diff / Math.abs(p)) * 100;
        isPositive = pct >= 0;
        trendPct = Math.abs(pct).toFixed(1) + '%';
        trendStr = 'vs previous';
      }
    }

    return { currentVal, trendStr, isPositive, trendPct, trendData };
  }, [rows, valIdx]);

  const label = tile?.title || columns[0] || 'Metric';
  const hasPrefix = tile?.subtitle?.startsWith('$') || String(currentVal).startsWith('$');

  const formatValue = (v) => {
    if (v == null || v === '--') return '--';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    if (n % 1 !== 0) return n.toFixed(1);
    return n.toLocaleString();
  };

  // Pick accent by index; extract first color for sparkline stroke
  const accentGradient = KPI_ACCENTS[index % KPI_ACCENTS.length];
  const accentMatch = accentGradient.match(/#[0-9a-fA-F]{6}/g) || ['#2563EB'];
  const accentStart = accentMatch[0];
  const accentEnd = accentMatch[1] || accentStart;

  // Read visual formatting overrides
  const vc = formatting || tile?.visualConfig || {};
  const valueColName = columns[valIdx] || '';
  const customValueColor = vc.colors?.measureColors?.[valueColName];
  const valueColor = customValueColor || TOKENS.text.primary;
  const valueFontSize = vc.typography?.titleFontSize || TOKENS.kpi.valueFontSize;

  // Sparkline path — smooth area fill
  const sparklinePath = useMemo(() => {
    if (trendData.length < 2) return null;
    const w = 120;
    const h = 44;
    const pad = 2;
    const maxVal = Math.max(...trendData.map(d => d.value), 1);
    const minVal = Math.min(...trendData.map(d => d.value), 0);
    const range = maxVal - minVal || 1;
    const stepX = (w - pad * 2) / (trendData.length - 1);

    const points = trendData.map((d, i) => ({
      x: pad + i * stepX,
      y: h - pad - ((d.value - minVal) / range) * (h - pad * 2),
    }));

    // Smooth cardinal-ish curve using quadratic midpoint
    let line = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const cx = (p0.x + p1.x) / 2;
      line += ` Q ${cx} ${p0.y} ${cx} ${(p0.y + p1.y) / 2}`;
      line += ` T ${p1.x} ${p1.y}`;
    }

    const area = `${line} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;
    return { line, area, w, h, lastPoint: points[points.length - 1] };
  }, [trendData]);

  return (
    <div
      className="relative overflow-hidden h-full flex flex-col"
      style={{
        padding: TOKENS.kpi.pad,
        fontFamily: TOKENS.fontBody,
      }}
    >
      {/* Gradient accent line — single fade, not a heavy bar */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 14,
          right: 14,
          height: 1.5,
          background: `linear-gradient(90deg, transparent, ${accentStart} 40%, ${accentEnd} 60%, transparent)`,
          borderRadius: 9999,
          opacity: 0.85,
        }}
      />

      {/* Eyebrow label */}
      <div
        style={{
          fontSize: TOKENS.kpi.labelFontSize,
          fontWeight: 700,
          letterSpacing: TOKENS.kpi.labelLetterSpacing,
          textTransform: 'uppercase',
          color: TOKENS.text.muted,
          fontFamily: TOKENS.fontDisplay,
          marginBottom: 10,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>

      {/* Value + delta + sparkline */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 14,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Value */}
          <div
            style={{
              fontSize: valueFontSize,
              fontWeight: TOKENS.kpi.valueFontWeight,
              letterSpacing: TOKENS.kpi.valueLetterSpacing,
              lineHeight: 0.95,
              color: valueColor,
              fontFamily: TOKENS.fontDisplay,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {hasPrefix && (
              <span style={{ fontSize: '0.55em', fontWeight: 700, opacity: 0.55, marginRight: 2, verticalAlign: '0.35em' }}>$</span>
            )}
            {formatValue(currentVal).replace('$', '')}
          </div>

          {/* Delta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {trendPct && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: 9999,
                  letterSpacing: '0.02em',
                  color: isPositive ? TOKENS.success : TOKENS.danger,
                  background: isPositive ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  border: `1px solid ${isPositive ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'}`,
                  fontFamily: TOKENS.fontDisplay,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  {isPositive ? (
                    <>
                      <path d="M7 17L17 7" />
                      <path d="M7 7h10v10" />
                    </>
                  ) : (
                    <>
                      <path d="M17 7L7 17" />
                      <path d="M17 17H7V7" />
                    </>
                  )}
                </svg>
                {trendPct}
              </span>
            )}
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                color: TOKENS.text.muted,
                fontFamily: TOKENS.fontBody,
                letterSpacing: '-0.005em',
              }}
            >
              {trendStr || tile?.subtitle || ''}
            </span>
          </div>
        </div>

        {/* Gradient area sparkline */}
        {sparklinePath && (
          <div
            style={{
              width: 120,
              height: 44,
              flexShrink: 0,
              opacity: 0.9,
            }}
          >
            <svg viewBox={`0 0 ${sparklinePath.w} ${sparklinePath.h}`} className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`kpi-grad-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={accentStart} stopOpacity="0.45" />
                  <stop offset="100%" stopColor={accentStart} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={sparklinePath.area} fill={`url(#kpi-grad-${gradientId})`} />
              <path d={sparklinePath.line} fill="none" stroke={accentStart} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              {sparklinePath.lastPoint && (
                <circle cx={sparklinePath.lastPoint.x} cy={sparklinePath.lastPoint.y} r="2.5" fill={accentStart} />
              )}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

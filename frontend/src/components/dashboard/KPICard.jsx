import { useMemo } from 'react';
import { TOKENS, KPI_ACCENTS } from './tokens';

export default function KPICard({ tile, index = 0, onEdit, formatting }) {
  const rows = tile?.rows || [];
  const columns = tile?.columns || [];
  
  // Try to find value index (assume column 0 is dimension/date, column 1 is measure if >1 cols)
  const valIdx = columns.length > 1 ? 1 : 0;
  
  // Calculate trend using the last two rows if available
  const { currentVal, trendStr, isPositive, trendPct, trendData } = useMemo(() => {
    let currentVal = '--';
    let trendStr = null;
    let isPositive = null;
    let trendPct = null;
    let trendData = [];

    if (rows.length === 0) return { currentVal, trendStr, isPositive, trendPct, trendData };

    // Format data for sparkline (we map the value column)
    trendData = rows.map((r, i) => ({
      name: `T${i}`,
      value: Number(Object.values(r)[valIdx]) || 0
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

  const label = tile?.title || (columns[0] || 'Metric');

  const formatValue = (v) => {
    if (v == null || v === '--') return '--';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    if (Math.abs(n) >= 1e6) return `${(n/1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `${(n/1e3).toFixed(1)}K`;
    if (n % 1 !== 0) return n.toFixed(1);
    return n.toLocaleString();
  };

  const accentColor = KPI_ACCENTS[index % KPI_ACCENTS.length];

  // Read visual formatting for KPI value styling
  // Value color: check measureColors for the value column, then fallback to default
  const vc = formatting || tile?.visualConfig || {};
  const valueColName = columns[valIdx] || '';
  const valueColor = vc.colors?.measureColors?.[valueColName] || TOKENS.text.primary;
  const valueFontSize = vc.typography?.titleFontSize || 32;

  return (
    <div className="relative overflow-hidden p-[20px_22px] flex flex-col h-full">

      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[4px]" style={{ background: accentColor }} />

      {/* Label */}
      <div className="flex items-center justify-between mb-2 mt-1">
        <span className="text-sm font-semibold" style={{ color: TOKENS.text.muted }}>{label}</span>
      </div>

      {/* Main value and sparkline wrapper */}
      <div className="flex items-end justify-between flex-1">
        <div>
          {/* Main KPI Value */}
          <div className="font-bold tracking-tight mb-2" style={{ color: valueColor, fontSize: valueFontSize, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', fontFamily: TOKENS.tile.headerFont }}>
            {tile?.subtitle?.startsWith('$') || String(currentVal).startsWith('$') ? '$' : ''}{formatValue(currentVal).replace('$', '')}
          </div>

          {/* Trend Indicator */}
          <div className="flex items-center gap-2">
            {trendPct && (
              <span className="flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-md"
                style={{
                  color: isPositive ? TOKENS.success : TOKENS.danger,
                  backgroundColor: isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                }}>
                <svg className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={isPositive ? "M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" : "M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"} />
                </svg>
                {trendPct}
              </span>
            )}
            <span className="text-[11px] font-medium" style={{ color: TOKENS.text.muted }}>
              {trendStr || tile?.subtitle || ''}
            </span>
          </div>
        </div>

        {/* Sparkline */}
        {trendData.length > 2 && (
          <div className="w-[80px] h-[40px] opacity-70 group-hover:opacity-100 transition-opacity">
            <svg viewBox={`0 0 ${trendData.length * 12} 40`} className="w-full h-full">
              {(() => {
                const maxVal = Math.max(...trendData.map(d => d.value), 1);
                return trendData.map((entry, idx) => {
                  const barH = Math.max((entry.value / maxVal) * 36, 1);
                  return (
                    <rect key={idx} x={idx * 12 + 1} y={40 - barH} width={10} height={barH}
                      rx={2} fill={accentColor} fillOpacity={idx === trendData.length - 1 ? 1 : 0.4} />
                  );
                });
              })()}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

import { TOKENS, KPI_ACCENTS } from './tokens';

export default function KPICard({ tile, index = 0, onEdit }) {
  const rows = tile?.rows || [];
  const columns = tile?.columns || [];
  const value = rows[0] ? Object.values(rows[0])[columns.length > 1 ? 1 : 0] : '--';
  const label = tile?.title || (columns[0] || 'Metric');

  const formatValue = (v) => {
    if (v == null || v === '--') return '--';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    if (Math.abs(n) >= 1e6) return `${(n/1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `${(n/1e3).toFixed(1)}K`;
    if (n % 1 !== 0) return n.toFixed(1);
    return n.toLocaleString();
  };

  return (
    <div className="relative overflow-hidden rounded-[14px] p-[18px_20px] cursor-pointer group"
      onClick={() => onEdit?.(tile)}
      style={{
        background: TOKENS.bg.elevated,
        border: `1px solid ${TOKENS.border.default}`,
        transition: `all ${TOKENS.transition}`,
      }}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: KPI_ACCENTS[index % KPI_ACCENTS.length] }} />
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: TOKENS.text.muted }}>{label}</span>
      </div>
      <div className="text-[28px] font-bold mb-1.5" style={{ color: TOKENS.text.primary, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
        {tile?.subtitle?.startsWith('$') ? '$' : ''}{formatValue(value)}
      </div>
      {tile?.subtitle && (
        <span className="text-xs" style={{ color: TOKENS.text.muted }}>{tile.subtitle}</span>
      )}
    </div>
  );
}

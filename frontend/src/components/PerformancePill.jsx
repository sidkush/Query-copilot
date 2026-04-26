import { motion } from 'framer-motion';
import { TOKENS } from './dashboard/tokens';

const TIER_COLORS = {
  schema:     { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa', label: 'Schema Cache' },
  memory:     { bg: 'rgba(59,130,246,0.15)',   text: '#60a5fa', label: 'Query Memory' },
  turbo:      { bg: 'rgba(16,185,129,0.15)',   text: '#34d399', label: 'Turbo Mode' },
  datafusion: { bg: 'rgba(16,185,129,0.15)',   text: '#34d399', label: 'DataFusion' },
  live:       { bg: 'rgba(251,191,36,0.15)',   text: '#fbbf24', label: 'Live Query' },
};

export default function PerformancePill({ queryMs, tierName, rowsScanned, arrowEnabled }) {
  if (queryMs == null || !Number.isFinite(Number(queryMs))) return null;

  const tier = TIER_COLORS[tierName] || TIER_COLORS.live;
  const formattedMs = queryMs < 1000
    ? `${Math.round(queryMs)}ms`
    : `${(queryMs / 1000).toFixed(1)}s`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mt-2"
      style={{
        background: tier.bg,
        color: tier.text,
        backdropFilter: 'blur(8px)',
        border: `1px solid ${tier.text}22`,
      }}
    >
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6.5 1L2 7h3.5L5 11l5-6H6.5L7 1z" />
      </svg>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: TOKENS.tile.headerFont }}>{formattedMs}</span>
      <span style={{ opacity: 0.35 }}>&middot;</span>
      <span>{tier.label}</span>
      {arrowEnabled && (
        <>
          <span style={{ opacity: 0.35 }}>&middot;</span>
          <span style={{ opacity: 0.75 }}>Arrow zero-copy</span>
        </>
      )}
      {rowsScanned != null && rowsScanned > 0 && (
        <>
          <span style={{ opacity: 0.35 }}>&middot;</span>
          <span style={{ opacity: 0.75 }}>{rowsScanned.toLocaleString()} rows</span>
        </>
      )}
    </motion.div>
  );
}

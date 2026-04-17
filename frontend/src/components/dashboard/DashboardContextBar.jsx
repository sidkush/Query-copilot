import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { SPRINGS } from './motion';
import { TOKENS } from './tokens';

const T = TOKENS.contextBar;

/**
 * DashboardContextBar — SP-1 shell chrome.
 *
 * Sits below TopBar. Shows business-context summary computed from
 * dashboard tiles (KPI values if present, else tile count) and a
 * relative refresh timestamp.
 *
 * Auto-hides when dashboard has no tiles.
 */
export default function DashboardContextBar({ tiles = [], lastRefreshed }) {
  const [now, setNow] = useState(() => Date.now());

  // Tick every 30s for relative timestamp
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Extract business context from KPI tiles
  const summary = useMemo(() => {
    if (!tiles || tiles.length === 0) return null;

    // Look for KPI-type tiles with values
    const kpiTiles = tiles.filter(
      (t) => t.chartType === 'kpi' || t.chart_spec?.type === 'kpi' || t.type === 'kpi'
    );

    if (kpiTiles.length > 0) {
      // Pull the first 3 KPI labels + values
      const parts = kpiTiles.slice(0, 3).map((t) => {
        const val = t.kpiValue || t.value || t.chart_spec?.value || '';
        const label = t.title || t.name || '';
        if (val && label) return `${val} ${label.toLowerCase()}`;
        if (val) return String(val);
        return label;
      }).filter(Boolean);

      if (parts.length > 0) return parts.join(' \u00b7 ');
    }

    // Fallback: tile + section count
    const sectionSet = new Set(tiles.map((t) => t.sectionId || t.tab || 'default'));
    const sectionCount = sectionSet.size;
    return `${tiles.length} tile${tiles.length !== 1 ? 's' : ''}${sectionCount > 1 ? ` \u00b7 ${sectionCount} sections` : ''}`;
  }, [tiles]);

  const relTime = useMemo(() => {
    if (!lastRefreshed) return null;
    const ts = typeof lastRefreshed === 'number' ? lastRefreshed : new Date(lastRefreshed).getTime();
    if (isNaN(ts)) return null;
    const diff = (now - ts) / 1000;
    if (diff < 60) return 'Refreshed just now';
    if (diff < 3600) return `Refreshed ${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `Refreshed ${Math.floor(diff / 3600)}h ago`;
    return `Refreshed ${new Date(ts).toLocaleDateString()}`;
  }, [lastRefreshed, now]);

  // Hide when empty
  if (!summary) return null;

  // Split summary on " · " so each segment can respond individually to hover
  const summaryParts = summary.split(' \u00b7 ');

  return (
    <div
      data-testid="dashboard-context-bar"
      className="premium-liquid-glass"
      style={{
        height: T.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: T.bg,
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}
    >
      {/* Business summary — each segment is a spring-hover chip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {summaryParts.map((part, idx) => (
          <motion.span
            key={`${part}-${idx}`}
            whileHover={{ scale: 1.04, color: 'var(--text-secondary)' }}
            transition={SPRINGS.snappy}
            style={{
              fontSize: T.fontSize,
              color: T.color,
              fontFamily: TOKENS.fontBody,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              cursor: 'default',
              display: 'inline-flex',
              alignItems: 'center',
              transformOrigin: 'center',
            }}
          >
            {idx > 0 && (
              <span aria-hidden style={{ opacity: 0.4, margin: '0 8px' }}>&middot;</span>
            )}
            {part}
          </motion.span>
        ))}
      </div>

      {/* Refresh timestamp */}
      {relTime && (
        <span
          style={{
            fontSize: T.fontSize,
            color: T.color,
            fontFamily: TOKENS.fontMono,
            fontWeight: 400,
            flexShrink: 0,
            marginLeft: 16,
            letterSpacing: '0.01em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {relTime}
        </span>
      )}
    </div>
  );
}

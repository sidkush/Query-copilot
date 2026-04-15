import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { diffSnapshot, snapshotTile } from '../../lib/diffOnLoad';

const DISMISS_KEY_PREFIX = 'askdb.diffBanner.dismiss.';
const DISMISS_TTL_HOURS = 24;
const DELTA_THRESHOLD_PCT = 5;
const MAX_CHIPS = 3;

/**
 * "While you were away" banner — top-of-dashboard glass pill that surfaces
 * the biggest metric deltas since the user's last visit.
 *
 * Utility-first engagement:
 *   - Hidden if no tile delta exceeds DELTA_THRESHOLD_PCT (±5%)
 *   - Caps at MAX_CHIPS (3) so it never crosses the noise threshold
 *   - 24h dismiss persists per-dashboard — one click silences this visit
 *   - Also re-snapshots current values on mount so the NEXT visit has
 *     a fresh baseline. Single data source for both read and write.
 *   - No notifications, no toasts, no dark patterns
 */
function readDismissState(dashboardId) {
  if (!dashboardId) return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY_PREFIX + dashboardId);
    if (!raw) return false;
    const hoursSince = (Date.now() - parseInt(raw, 10)) / 1000 / 3600;
    return hoursSince < DISMISS_TTL_HOURS;
  } catch {
    return false;
  }
}

export default function DiffOnLoadBanner({ dashboardId, tiles }) {
  // Dismiss state derived from props via render-time sync (React docs pattern).
  // Previously a useEffect; ran afoul of react-hooks/set-state-in-effect.
  const [dismissed, setDismissed] = useState(() => readDismissState(dashboardId));
  const [prevDashboardId, setPrevDashboardId] = useState(dashboardId);
  if (dashboardId !== prevDashboardId) {
    setPrevDashboardId(dashboardId);
    setDismissed(readDismissState(dashboardId));
  }

  const deltas = useMemo(() => {
    if (!dashboardId || !tiles?.length) return [];
    return tiles
      .map((t) => {
        const valueCol = t.columns?.[1] || t.columns?.[0];
        const latestRow = t.rows?.[t.rows.length - 1];
        if (!latestRow || !valueCol) return null;
        const currentValue = Number(latestRow[valueCol]);
        if (!isFinite(currentValue)) return null;
        const delta = diffSnapshot(dashboardId, t.id, currentValue);
        if (delta === null || Math.abs(delta) < DELTA_THRESHOLD_PCT) return null;
        return { tileId: t.id, title: t.title || valueCol || 'Metric', delta };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, MAX_CHIPS);
  }, [dashboardId, tiles]);

  // Re-snapshot after reading deltas so the next visit gets a fresh baseline.
  useEffect(() => {
    if (!dashboardId || !tiles?.length) return;
    for (const t of tiles) {
      const valueCol = t.columns?.[1] || t.columns?.[0];
      const latestRow = t.rows?.[t.rows.length - 1];
      if (!latestRow || !valueCol) continue;
      const currentValue = Number(latestRow[valueCol]);
      if (isFinite(currentValue)) snapshotTile(dashboardId, t.id, currentValue);
    }
  }, [dashboardId, tiles]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY_PREFIX + dashboardId, String(Date.now()));
    } catch {
      // ignore
    }
  }, [dashboardId]);

  const formatValue = (v) => {
    const abs = Math.abs(v);
    if (abs >= 100) return v.toFixed(0);
    if (abs >= 10) return v.toFixed(1);
    return v.toFixed(1);
  };

  const visible = !dismissed && deltas.length > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          className="diff-on-load-banner"
          role="status"
          aria-live="polite"
        >
          <div className="diff-on-load-banner__content">
            <span className="diff-on-load-banner__eyebrow">While you were away</span>
            <span className="diff-on-load-banner__title">
              {deltas.length} metric{deltas.length !== 1 ? 's' : ''} changed
            </span>
            <div className="diff-on-load-banner__chips">
              {deltas.map((d) => {
                const isUp = d.delta >= 0;
                return (
                  <span
                    key={d.tileId}
                    className="diff-on-load-banner__chip"
                    data-dir={isUp ? 'up' : 'down'}
                    title={d.title}
                  >
                    <span className="diff-on-load-banner__chip-label">{d.title}</span>
                    <span className="diff-on-load-banner__chip-value">
                      {isUp ? '+' : ''}{formatValue(d.delta)}%
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss banner for 24 hours"
            className="diff-on-load-banner__dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


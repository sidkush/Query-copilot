import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * SavedDbPill — premium "machined hardware" card for a saved database
 * connection. Uses the Double-Bezel architecture (.db-pill-shell +
 * .db-pill-core) with a recessed icon well, magnetic hover physics,
 * and a cinematic Turbo wow-factor:
 *
 *   1. Click the Turbo button → a radial shockwave ripples out from
 *      the click point, and the entire pill lights up with a diagonal
 *      shimmer sweep that runs left→right on a 1.8s loop.
 *   2. During sync → the shimmer keeps running, the lightning bolt
 *      pulses, and the syncing status is clearly visible.
 *   3. On completion → the shimmer fades out, the "TURBO" badge
 *      snap-springs in with a 3-stage scale animation (0 → 1.2 → 1),
 *      the pill gains a persistent breathing cyan halo, and the
 *      stat-well ribbon below slides open revealing tables count,
 *      disk size, and query speed in three premium "hardware wells".
 *
 * All props are controlled from the parent (Dashboard.jsx) so the
 * business logic (polling, API calls, connection lookup) stays there.
 * This component is purely presentational.
 */
export default function SavedDbPill({
  saved,
  dbName,
  icon,                  // ReactNode — already-colored DB type icon
  live,
  isReconnecting,
  turboEnabled,
  turboSyncing,
  turboInfo,
  liveConnId,
  onReconnect,
  onDisconnect,
  onTurboToggle,
  deleteConfirm,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}) {
  const [shockwaves, setShockwaves] = useState([]); // active ripple animations
  const turboBtnRef = useRef(null);
  // The turbo badge's snap-in animation replays automatically every time the
  // badge (re-)mounts — which happens naturally when (turboEnabled &&
  // !turboSyncing) becomes true. No effect needed, no state needed.

  // Spawn a shockwave ripple at the click point of the Turbo button
  const handleTurboClick = (e) => {
    const btn = turboBtnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now() + Math.random();
      setShockwaves((s) => [...s, { id, x, y }]);
      setTimeout(() => {
        setShockwaves((s) => s.filter((w) => w.id !== id));
      }, 750);
    }
    onTurboToggle?.(liveConnId, turboEnabled);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="db-pill-shell"
      data-turbo={turboEnabled && !turboSyncing ? "active" : undefined}
    >
      {/* Diagonal shimmer sweep — only visible during sync */}
      <div className="turbo-shimmer" data-active={turboSyncing || undefined} aria-hidden="true" />

      <div className="db-pill-core">
        {/* Main row */}
        <div className="flex items-center justify-between px-4 py-3.5 gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Recessed icon well — rotates on hover */}
            <span className="db-pill-icon-well">
              {icon}
            </span>

            <div className="min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="font-semibold truncate"
                  style={{
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    letterSpacing: '-0.005em',
                    fontFamily: "'Outfit', system-ui, sans-serif",
                  }}
                >
                  {saved.label || saved.database}
                </span>
                {turboEnabled && !turboSyncing && (
                  <span className="turbo-badge">
                    <svg className="turbo-badge__bolt" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
                    </svg>
                    Turbo
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="eyebrow"
                  style={{ fontSize: 9, color: 'var(--text-muted)' }}
                >
                  {dbName}
                </span>
                {saved.database && saved.label && saved.database !== saved.label && (
                  <>
                    <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>·</span>
                    <span
                      className="truncate text-[11px]"
                      style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                    >
                      {saved.database}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action cluster */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Connection status button */}
            {live ? (
              <motion.button
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => onDisconnect?.(saved)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full ease-spring cursor-pointer"
                style={{
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  color: 'var(--status-success)',
                }}
                aria-label={`Disconnect ${saved.label || saved.database}`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                Connected
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => onReconnect?.(saved)}
                disabled={isReconnecting}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full ease-spring cursor-pointer disabled:opacity-50"
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: 'var(--status-danger)',
                }}
                aria-label={`Reconnect ${saved.label || saved.database}`}
              >
                {isReconnecting ? (
                  <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                )}
                {isReconnecting ? "Connecting..." : "Reconnect"}
              </motion.button>
            )}

            {/* ═════ Turbo button — the wow button ═════ */}
            {live && liveConnId && (
              <button
                ref={turboBtnRef}
                onClick={handleTurboClick}
                disabled={turboSyncing}
                className="relative flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full ease-spring cursor-pointer disabled:opacity-80 overflow-hidden"
                style={{
                  background: turboEnabled
                    ? 'rgba(6, 182, 212, 0.14)'
                    : turboSyncing
                      ? 'rgba(245, 158, 11, 0.12)'
                      : 'var(--overlay-faint)',
                  border: `1px solid ${
                    turboEnabled
                      ? 'rgba(6, 182, 212, 0.4)'
                      : turboSyncing
                        ? 'rgba(245, 158, 11, 0.35)'
                        : 'var(--border-default)'
                  }`,
                  color: turboEnabled
                    ? '#67e8f9'
                    : turboSyncing
                      ? '#fbbf24'
                      : 'var(--text-secondary)',
                  transition: 'background 400ms cubic-bezier(0.32,0.72,0,1), border-color 400ms cubic-bezier(0.32,0.72,0,1), color 400ms cubic-bezier(0.32,0.72,0,1), transform 300ms cubic-bezier(0.32,0.72,0,1)',
                  boxShadow: turboEnabled
                    ? '0 0 0 3px rgba(6, 182, 212, 0.08), 0 6px 18px -6px rgba(6, 182, 212, 0.4)'
                    : 'none',
                }}
                title={
                  turboEnabled
                    ? 'Disable Turbo Mode'
                    : turboSyncing
                      ? 'Syncing local DuckDB replica…'
                      : 'Enable DuckDB Turbo Mode — <100ms queries'
                }
                aria-label={`${turboEnabled ? 'Disable' : 'Enable'} Turbo Mode`}
                aria-pressed={turboEnabled}
              >
                {/* Click shockwaves */}
                {shockwaves.map((w) => (
                  <span
                    key={w.id}
                    className="turbo-shockwave"
                    style={{
                      left: w.x - 6,
                      top: w.y - 6,
                      width: 12,
                      height: 12,
                    }}
                  />
                ))}
                {turboSyncing ? (
                  <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin relative z-10" />
                ) : (
                  <svg
                    className="w-3.5 h-3.5 relative z-10"
                    viewBox="0 0 24 24"
                    fill={turboEnabled ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
                  </svg>
                )}
                <span className="relative z-10">
                  {turboSyncing ? 'Charging…' : turboEnabled ? 'Turbo on' : 'Turbo'}
                </span>
              </button>
            )}

            {/* Delete */}
            {deleteConfirm ? (
              <div className="flex items-center gap-1.5 pl-1">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sure?</span>
                <button
                  onClick={onConfirmDelete}
                  className="px-2 py-0.5 text-xs font-medium rounded-lg ease-spring cursor-pointer"
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: 'var(--status-danger)',
                  }}
                  aria-label="Confirm delete connection"
                >
                  Yes
                </button>
                <button
                  onClick={onCancelDelete}
                  className="px-2 py-0.5 text-xs font-medium rounded-lg glass ease-spring cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Cancel delete connection"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={onRequestDelete}
                className="p-1.5 rounded-lg ease-spring cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--status-danger)';
                  e.currentTarget.style.background = 'var(--overlay-faint)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Remove saved connection"
                aria-label="Delete saved connection"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ═════ Turbo detail ribbon — expanding reveal ═════ */}
        <div
          className="turbo-detail-ribbon"
          data-open={(turboEnabled && !turboSyncing && turboInfo) || undefined}
          aria-hidden={!(turboEnabled && !turboSyncing && turboInfo)}
        >
          <div className="turbo-detail-ribbon__inner">
            <div
              className="flex items-stretch gap-2 px-4 pb-3.5 pt-0.5"
              style={{ borderTop: '1px dashed var(--border-default)', marginTop: 0 }}
            >
              <StatWell
                icon={
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
                  </svg>
                }
                label="Tables"
                value={turboInfo?.tables ?? '—'}
              />
              <StatWell
                icon={
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                    <path d="M3 12a9 3 0 0 0 18 0" />
                  </svg>
                }
                label="Replica"
                value={turboInfo?.size_mb != null ? `${turboInfo.size_mb.toFixed(1)} MB` : '—'}
              />
              <StatWell
                icon={
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
                  </svg>
                }
                label="Query p50"
                value="<100ms"
                live
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** One recessed hardware "well" showing a labeled metric. */
function StatWell({ icon, label, value, live = false }) {
  return (
    <div className="stat-well">
      <span className="stat-well__icon" aria-hidden="true">{icon}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="stat-well__label">{label}</span>
        <span className="stat-well__value truncate">
          {value}
          {live && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full ml-1.5 align-middle chip-blink"
              style={{ background: '#06b6d4' }}
              aria-hidden="true"
            />
          )}
        </span>
      </div>
    </div>
  );
}

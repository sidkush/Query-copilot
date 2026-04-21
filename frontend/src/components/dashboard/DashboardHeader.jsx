import { useState, useRef, useEffect } from 'react';
import { TOKENS } from './tokens';

/**
 * DashboardHeader — Fluid Island chrome for the dashboard builder.
 *
 * Design language: Ethereal Glass + Editorial Luxury. The title zone breathes on
 * the left with a pulsing eyebrow tag, and all action buttons live inside a
 * single floating pill on the right (Arc/Linear-style), grouped with hairline
 * separators. The primary Share button uses the Button-in-Button pattern with
 * a nested arrow circle.
 *
 * Keyboard: ⌘K hint is shown on the action island — it surfaces the command
 * palette which is owned by DashboardBuilder.jsx.
 */
export default function DashboardHeader({
  dashboard,
  saving,
  onNameChange,
  onOpenMetrics,
  onOpenTheme,
  onOpenBookmarks,
  onToggleFullscreen,
  onShare,
  onOpenVersions,
  onOpenAlerts,
  onOpenSettings,
  onOpenCommandPalette,
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dashboard?.name || '');
  // Ticking "now" so the relative timestamp stays fresh without pulling Date.now() during render.
  const [now, setNow] = useState(() => Date.now());
  // Width-aware compact tiers — derived via ResizeObserver on the header itself.
  // The header lives inside <main>, so its width = the dashboard area's width.
  // As the agent panel grows and squeezes the dashboard, the header shrinks
  // and we collapse non-essential controls so the title stays readable.
  const [headerWidth, setHeaderWidth] = useState(1200);
  const inputRef = useRef(null);
  const headerRef = useRef(null);

  // state must mirror prop on prop change — derived-state guard
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setName(dashboard?.name || ''); }, [dashboard?.name]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  // Watch the header's own width — gives us perfect awareness of dashboard area
  // size, regardless of why it changed (panel resize, window resize, sidebar).
  useEffect(() => {
    if (!headerRef.current) return;
    let rafId = null;
    const observer = new ResizeObserver((entries) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        for (const entry of entries) {
          setHeaderWidth(entry.contentRect.width);
        }
      });
    });
    observer.observe(headerRef.current);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  // Compact thresholds — tuned empirically.
  // < 900: hide the "Search actions" text (icon + ⌘K only)
  // < 700: hide the entire command palette pill
  // < 560: hide "Present" text (icon only)
  // < 480: ultra compact — title gets smaller font
  const compactSearchText  = headerWidth < 900;
  const hideCommandPalette = headerWidth < 700;
  const hidePresentText    = headerWidth < 560;
  const ultraCompact       = headerWidth < 480;

  // Update the "relative time" clock every 30s — cheap, and React-pure.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const save = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== dashboard?.name) onNameChange?.(name.trim());
  };

  const relTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = (now - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };

  // Detect cmd vs ctrl for the keyboard hint
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

  return (
    <div ref={headerRef} className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
      {/* ═══════════ LEFT · Editorial title zone ═══════════ */}
      <div className="flex flex-col gap-2 min-w-0 flex-1" style={{ minWidth: 0 }}>
        {/* Eyebrow tag */}
        <div className="eyebrow" style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
          <span className="eyebrow-dot" aria-hidden="true" />
          <span>Dashboard</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: saving ? TOKENS.warning : TOKENS.success, letterSpacing: '0.18em' }}>
            {saving ? 'Saving' : 'Live'}
          </span>
          {!saving && !ultraCompact && dashboard?.updated_at && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ letterSpacing: '0.1em', textTransform: 'none', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {relTime(dashboard.updated_at)}
              </span>
            </>
          )}
        </div>

        {/* Editable title — flex chain ensures the h1 can truncate cleanly */}
        <div className="flex items-center gap-3 group" style={{ minWidth: 0 }}>
          {editing ? (
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') { setName(dashboard?.name || ''); setEditing(false); }
              }}
              className="bg-transparent outline-none flex-1"
              style={{
                fontSize: ultraCompact ? 22 : 30,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: TOKENS.text.primary,
                fontFamily: TOKENS.tile.headerFont,
                borderBottom: `2px solid ${TOKENS.accent}`,
                minWidth: 0,
              }}
            />
          ) : (
            <h1
              onClick={() => setEditing(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'F2' || e.key === ' ') {
                  e.preventDefault();
                  setEditing(true);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Dashboard name: ${dashboard?.name || 'Untitled dashboard'}. Press Enter to rename.`}
              className="cursor-text truncate flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-sm"
              style={{
                fontSize: ultraCompact ? 22 : 30,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: TOKENS.text.primary,
                fontFamily: TOKENS.tile.headerFont,
                lineHeight: 1.1,
                margin: 0,
                minWidth: 0,
              }}
              title={dashboard?.name || 'Untitled dashboard'}
            >
              {dashboard?.name || 'Untitled dashboard'}
            </h1>
          )}
          <svg
            onClick={() => setEditing(true)}
            className="w-4 h-4 cursor-pointer opacity-0 group-hover:opacity-60 ease-spring flex-shrink-0"
            style={{ color: TOKENS.text.muted, transition: 'opacity 300ms cubic-bezier(0.32,0.72,0,1)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </div>
      </div>

      {/* ═══════════ RIGHT · Fluid Island action cluster ═══════════ */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Command palette trigger (⌘K) — a dedicated island.
            Hidden entirely when the dashboard area gets narrow; users can
            still hit ⌘K from the keyboard shortcut, and the action island
            below has a Search button anyway. */}
        {onOpenCommandPalette && !hideCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="dash-island flex items-center gap-2 ease-spring"
            style={{ padding: compactSearchText ? '8px 10px' : '8px 14px' }}
            aria-label="Open command palette"
            title="Command palette"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: TOKENS.text.muted }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            {!compactSearchText && (
              <span style={{ fontSize: 11, color: TOKENS.text.muted, fontWeight: 500 }}>Search actions</span>
            )}
            <span className="cmd-k-kbd" style={{ margin: 0 }}>{isMac ? '⌘' : 'Ctrl'} K</span>
          </button>
        )}

        {/* Main action island */}
        <div className="dash-island flex items-center px-1.5 py-1">
          {/* Metrics */}
          {onOpenMetrics && (
            <button className="dash-action" onClick={onOpenMetrics} title="Custom metrics" aria-label="Custom metrics">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l4-4 4 4 5-6" />
              </svg>
            </button>
          )}
          {/* Theme */}
          {onOpenTheme && (
            <button className="dash-action" onClick={onOpenTheme} title="Theme" aria-label="Theme">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M12 3a9 9 0 019 9h-9V3z" fill="currentColor" opacity="0.5" stroke="none" />
              </svg>
            </button>
          )}
          {/* Alerts */}
          {onOpenAlerts && (
            <button className="dash-action" onClick={onOpenAlerts} title="Alerts" aria-label="Alerts">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </button>
          )}

          <span className="dash-island-sep" aria-hidden="true" />

          {/* Bookmarks */}
          {onOpenBookmarks && (
            <button className="dash-action" onClick={onOpenBookmarks} title="Saved views" aria-label="Saved views">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
              </svg>
            </button>
          )}
          {/* Version history */}
          {onOpenVersions && (
            <button className="dash-action" onClick={onOpenVersions} title="Version history" aria-label="Version history">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
          {/* Settings */}
          {onOpenSettings && (
            <button className="dash-action" onClick={onOpenSettings} title="Dashboard settings" aria-label="Dashboard settings">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          )}

          <span className="dash-island-sep" aria-hidden="true" />

          {/* Present (fullscreen) — text label hides at narrow widths */}
          {onToggleFullscreen && (
            <button className="dash-action" onClick={onToggleFullscreen} title="Present" aria-label="Present">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
              {!hidePresentText && <span>Present</span>}
            </button>
          )}
        </div>

        {/* Primary CTA — Share with Button-in-Button */}
        {onShare && (
          <button
            onClick={onShare}
            className="group inline-flex items-center gap-2 pl-5 pr-1.5 py-1.5 rounded-full text-xs font-semibold ease-spring cursor-pointer"
            style={{
              background: 'var(--accent)',
              color: 'var(--text-on-accent)',
              boxShadow: '0 8px 24px -8px var(--accent-shadow), 0 1px 0 rgba(255,255,255,0.15) inset',
            }}
            title="Share dashboard"
            aria-label="Share dashboard"
          >
            <span>Share</span>
            <span className="flex items-center justify-center w-7 h-7 rounded-full ease-spring transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-[1px]" style={{ background: 'var(--on-accent-overlay)' }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

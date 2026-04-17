import { useState, useRef, useEffect } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { TOKENS } from './tokens';
import { SPRINGS } from './motion';

/**
 * VoiceModeSelector — SP-5b popover for choosing voice input mode.
 *
 * Triggered by right-click or long-press on the mic button in StatusBar.
 * Three modes: PTT (default), Wake Word, Hot Mic.
 * Per-workspace persistence via localStorage keyed by dashboardId.
 */

const MODES = [
  {
    id: 'ptt',
    label: 'Push-to-Talk',
    desc: 'Hold mic button or spacebar to record',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="6" y="4" width="12" height="16" rx="3" />
        <circle cx="12" cy="14" r="2" />
      </svg>
    ),
  },
  {
    id: 'wakeword',
    label: 'Wake Word',
    desc: 'Say "Hey Ask" to activate',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M2 12a10 10 0 0 1 10-10" /><path d="M2 12a6 6 0 0 1 6-6" /><path d="M2 12a2 2 0 0 1 2-2" />
      </svg>
    ),
  },
  {
    id: 'hotmic',
    label: 'Hot Mic',
    desc: 'Always listening — speak naturally',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="9" y="1" width="6" height="11" rx="3" />
        <path d="M19 10a7 7 0 01-14 0" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <circle cx="12" cy="12" r="11" strokeDasharray="3 3" />
      </svg>
    ),
    warn: 'Privacy: mic stays open',
  },
];

export default function VoiceModeSelector({ open, onClose, anchorRect, anchorRef, dashboardId }) {
  const voiceMode = useStore((s) => s.voiceMode);
  const setVoiceMode = useStore((s) => s.setVoiceMode);
  const popoverRef = useRef(null);
  // Shadow the incoming anchorRect so we can re-compute it on viewport resize
  // (fixes stale position when the window is resized while the popover is open).
  const [liveAnchorRect, setLiveAnchorRect] = useState(anchorRect || null);

  // Keep liveAnchorRect in sync when the prop updates (re-open at new position)
  useEffect(() => {
    setLiveAnchorRect(anchorRect || null);
  }, [anchorRect]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Re-compute anchorRect on window resize so the popover stays pinned to the
  // trigger button — prevents stale position when the status bar reflows.
  useEffect(() => {
    if (!open) return;
    const handler = () => {
      const el = anchorRef?.current;
      if (el && typeof el.getBoundingClientRect === 'function') {
        setLiveAnchorRect(el.getBoundingClientRect());
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [open, anchorRef]);

  const handleSelect = (modeId) => {
    setVoiceMode(modeId);
    // Persist per-workspace
    if (dashboardId) {
      try {
        const key = `askdb-voice-mode-${dashboardId}`;
        localStorage.setItem(key, modeId);
      } catch { /* quota */ }
    }
    onClose();
  };

  // Position above the mic button (use liveAnchorRect so resize updates reflow)
  const rect = liveAnchorRect || anchorRect;
  const popoverStyle = {
    position: 'fixed',
    bottom: rect ? window.innerHeight - rect.top + 6 : 40,
    right: rect ? window.innerWidth - rect.right : 16,
    zIndex: 100,
  };

  return (
    <AnimatePresence>
      {open && (
        <Motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={SPRINGS.snappy}
          className="premium-liquid-glass"
          style={{
            ...popoverStyle,
            borderRadius: 13,
            padding: '6px 0',
            minWidth: 220,
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 12px 40px var(--shadow-deep), 0 0 1px var(--border-default) inset',
          }}
          role="menu"
          aria-label="Voice mode selector"
        >
          <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid var(--chrome-bar-border-subtle)' }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: TOKENS.text.muted }}>
              Voice Mode
            </span>
          </div>
          {MODES.map((m) => {
            const active = voiceMode === m.id;
            return (
              <button
                key={m.id}
                role="menuitem"
                onClick={() => handleSelect(m.id)}
                className="premium-btn"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'color 200ms cubic-bezier(0.16,1,0.3,1)',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                {active && (
                  <Motion.span
                    layoutId="voice-mode-pill"
                    transition={SPRINGS.snappy}
                    style={{
                      position: 'absolute',
                      inset: '2px 4px',
                      borderRadius: 8,
                      background: 'rgba(99,102,241,0.14)',
                      border: '1px solid rgba(99,102,241,0.24)',
                      zIndex: 0,
                    }}
                  />
                )}
                <span style={{ position: 'relative', zIndex: 1, display: 'contents' }}>
                <span style={{ color: active ? '#6366f1' : TOKENS.text.secondary, marginTop: 1, flexShrink: 0 }}>
                  {m.icon}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: active ? '#a5b4fc' : TOKENS.text.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.label}
                    {active && (
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>
                        Active
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: TOKENS.text.muted, marginTop: 1 }}>{m.desc}</div>
                  {m.warn && (
                    <div style={{ fontSize: 9, color: TOKENS.warning, marginTop: 2, opacity: 0.8 }}>{m.warn}</div>
                  )}
                </div>
                </span>
              </button>
            );
          })}
        </Motion.div>
      )}
    </AnimatePresence>
  );
}

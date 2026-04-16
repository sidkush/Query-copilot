import { useState, useRef, useEffect } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { TOKENS } from './tokens';

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

export default function VoiceModeSelector({ open, onClose, anchorRect, dashboardId }) {
  const voiceMode = useStore((s) => s.voiceMode);
  const setVoiceMode = useStore((s) => s.setVoiceMode);
  const popoverRef = useRef(null);

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

  // Position above the mic button
  const popoverStyle = {
    position: 'fixed',
    bottom: anchorRect ? window.innerHeight - anchorRect.top + 6 : 40,
    right: anchorRect ? window.innerWidth - anchorRect.right : 16,
    zIndex: 9999,
  };

  return (
    <AnimatePresence>
      {open && (
        <Motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          style={{
            ...popoverStyle,
            background: 'rgba(24,24,27,0.97)',
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
            border: '1px solid rgba(63,63,70,0.5)',
            borderRadius: 12,
            padding: '6px 0',
            minWidth: 220,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.08) inset',
          }}
          role="menu"
          aria-label="Voice mode selector"
        >
          <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid rgba(63,63,70,0.3)' }}>
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
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
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
              </button>
            );
          })}
        </Motion.div>
      )}
    </AnimatePresence>
  );
}

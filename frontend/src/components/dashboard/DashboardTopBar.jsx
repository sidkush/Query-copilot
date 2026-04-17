import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import DashboardModeToggle from './DashboardModeToggle';
import { BreathingDot, SPRINGS } from './motion';
import { TOKENS } from './tokens';

/**
 * Auto-map table: archetype → default edit mode.
 * Override persists per-dashboard until archetype changes.
 */
const ARCHETYPE_EDIT_MAP = {
  briefing:  'default',
  workbench: 'pro',
  ops:       'default',
  story:     'default',
  pitch:     'stage',
  tableau:   'pro',
};

const EDIT_MODES = [
  { id: 'default', label: 'Default' },
  { id: 'pro',     label: 'Pro' },
  { id: 'stage',   label: 'Stage' },
];

const T = TOKENS.topBar;

/**
 * DashboardTopBar — SP-1 shell chrome.
 *
 * Layout: [Logo + Breadcrumb] ... [Archetype Pill] [Edit Badge] ... [Share] [Save]
 * Height: 52px. Glass morphism background.
 */
export default function DashboardTopBar({
  dashboardName,
  orgName,
  workspaceName,
  archetypeMode,
  archetypeModes,
  onArchetypeChange,
  editMode,
  onEditModeChange,
  onNameChange,
  onShare,
  onSave,
  saving,
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dashboardName || '');
  const [badgeOpen, setBadgeOpen] = useState(false);
  const inputRef = useRef(null);
  const badgeRef = useRef(null);
  const agentLoading = useStore((s) => s.agentLoading);

  useEffect(() => { setName(dashboardName || ''); }, [dashboardName]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  // Close badge dropdown on outside click
  useEffect(() => {
    if (!badgeOpen) return;
    const handle = (e) => {
      if (badgeRef.current && !badgeRef.current.contains(e.target)) setBadgeOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [badgeOpen]);

  const saveName = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== dashboardName) onNameChange?.(name.trim());
  };

  const modeColors = T.editMode[editMode] || T.editMode.default;

  return (
    <div
      data-testid="dashboard-topbar"
      style={{
        position: 'relative',
        height: T.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: T.bg,
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
        gap: 12,
      }}
    >
      {/* Premium 1px gradient border strip — catches the eye */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -1,
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(124,58,237,0.35) 22%, rgba(168,85,247,0.55) 50%, rgba(124,58,237,0.35) 78%, transparent 100%)',
          pointerEvents: 'none',
          opacity: 0.7,
        }}
      />
      {/* ═══ LEFT: Logo + Breadcrumb ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
        {/* Logo icon — 28px gradient purple rounded (brand mark, background gradient
            on a div — NOT background-clip:text, so .impeccable gradient-text ban
            does not apply). Second stop references TOKENS.brandPurple. */}
        <div
          style={{
            position: 'relative',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `linear-gradient(135deg, #7c3aed, ${TOKENS.brandPurple})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 14px -4px rgba(124,58,237,0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          {/* Tiny breathing status dot — shows the brand mark is "alive" */}
          <span
            className="premium-breathe"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -1,
              right: -1,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px #22c55e, 0 0 0 1.5px var(--bg-elevated, #18181b)',
            }}
          />
        </div>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
          {orgName && (
            <>
              <span style={{ fontSize: 13, color: T.breadcrumbMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{orgName}</span>
              <span style={{ fontSize: 11, color: T.breadcrumbMuted, opacity: 0.5 }}>/</span>
            </>
          )}
          {workspaceName && (
            <>
              <span style={{ fontSize: 13, color: T.breadcrumbMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{workspaceName}</span>
              <span style={{ fontSize: 11, color: T.breadcrumbMuted, opacity: 0.5 }}>/</span>
            </>
          )}

          {/* Editable dashboard name */}
          {editing ? (
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') { setName(dashboardName || ''); setEditing(false); }
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${TOKENS.accent}`,
                outline: 'none',
                fontSize: 13,
                fontWeight: 700,
                color: T.breadcrumbActive,
                fontFamily: TOKENS.fontDisplay,
                letterSpacing: '-0.01em',
                minWidth: 80,
                maxWidth: 240,
              }}
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'text',
                fontSize: 13,
                fontWeight: 700,
                color: T.breadcrumbActive,
                fontFamily: TOKENS.fontDisplay,
                letterSpacing: '-0.01em',
                padding: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 240,
              }}
              title={dashboardName || 'Untitled dashboard'}
              aria-label={`Dashboard: ${dashboardName || 'Untitled'}. Click to rename.`}
            >
              {dashboardName || 'Untitled dashboard'}
            </button>
          )}

          {/* AI activity indicator — breathing dot + label when agent is active */}
          <AnimatePresence>
            {agentLoading && (
              <motion.span
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={SPRINGS.snappy}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  marginLeft: 10,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'color-mix(in oklab, var(--accent, #a855f7) 14%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--accent, #a855f7) 28%, transparent)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--accent, #a78bfa)',
                  fontFamily: TOKENS.fontDisplay,
                }}
              >
                <BreathingDot color="var(--accent, #a78bfa)" size={6} />
                AI
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ═══ CENTER-RIGHT: Archetype Pill + Edit Mode Badge ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <DashboardModeToggle
          modes={archetypeModes}
          activeMode={archetypeMode}
          onChange={onArchetypeChange}
        />

        {/* Edit mode badge */}
        <div ref={badgeRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setBadgeOpen((v) => !v)}
            className="premium-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 6,
              background: modeColors.bg,
              border: `1px solid ${modeColors.border}`,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            aria-label={`Edit mode: ${editMode}. Click to change.`}
            title="Click to override edit mode"
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: modeColors.dot,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: modeColors.label, letterSpacing: '0.02em' }}>
              {editMode === 'default' ? 'Default' : editMode === 'pro' ? 'Pro' : 'Stage'}
            </span>
          </button>

          {/* Override dropdown */}
          <AnimatePresence>
            {badgeOpen && (
              <>
                <div onClick={() => setBadgeOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    minWidth: 140,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 8,
                    boxShadow: '0 12px 32px -8px var(--shadow-deep)',
                    zIndex: 100,
                    padding: 4,
                  }}
                >
                  <div style={{ padding: '4px 8px 2px', fontSize: 9, fontWeight: 600, color: TOKENS.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Edit Mode
                  </div>
                  {EDIT_MODES.map((m) => {
                    const c = T.editMode[m.id];
                    const active = m.id === editMode;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { onEditModeChange?.(m.id); setBadgeOpen(false); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 5,
                          background: active ? c.bg : 'transparent',
                          border: 'none',
                          color: active ? c.label : TOKENS.text.secondary,
                          fontSize: 11.5,
                          fontWeight: active ? 600 : 400,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 100ms ease',
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                        {m.label}
                        {active && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', opacity: 0.7 }}>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ═══ RIGHT: Share + Save ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {onShare && (
          <button
            onClick={onShare}
            className="premium-btn premium-sheen"
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 150ms ease',
              letterSpacing: '-0.01em',
              fontFamily: TOKENS.fontDisplay,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            aria-label="Share dashboard"
          >
            Share
          </button>
        )}
        {onSave && (
          <button
            onClick={onSave}
            disabled={saving}
            className="premium-btn premium-sheen"
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              background: saving ? 'rgba(124,58,237,0.5)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              border: 'none',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              transition: 'all 150ms ease',
              letterSpacing: '-0.01em',
              fontFamily: TOKENS.fontDisplay,
              boxShadow: saving
                ? 'none'
                : '0 2px 8px rgba(124,58,237,0.3), inset 0 1px 0 rgba(255,255,255,0.16)',
            }}
            aria-label={saving ? 'Saving...' : 'Save dashboard'}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}

export { ARCHETYPE_EDIT_MAP };

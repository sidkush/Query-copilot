import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { BreathingDot, SPRINGS } from './motion';
import { TOKENS } from './tokens';
import DashboardPresetSwitcher from './DashboardPresetSwitcher';
import DashboardPicker from './DashboardPicker';

const T = TOKENS.topBar;

/**
 * DashboardTopBar — SP-1 shell chrome.
 *
 * Layout: [Logo + Breadcrumb] ... [Share] [Save]
 * Height: 52px. Glass morphism background.
 *
 * Wave 2-A (2026-04-18 preset infrastructure plan) removed the archetype
 * pill + edit-mode badge. Wave 3 reintroduces a preset switcher in the
 * center slot driven by the preset registry.
 */
export default function DashboardTopBar({
  dashboardName,
  dashboardId,
  dashboardList = [],
  onSwitchDashboard,
  orgName,
  workspaceName,
  onNameChange,
  onShare,
  onSave,
  saving,
  /**
   * TSS W2-C — optional content slotted next to Save (AutogenProgressChip
   * lives here). Keeps the chip inside the TopBar's right cluster without
   * coupling TopBar to the autogen slice.
   */
  rightSlot = null,
}) {
  const connections = useStore((s) => s.connections);
  const [editing] = useState(false);
  const [, setName] = useState(dashboardName || '');
  const inputRef = useRef(null);
  const agentLoading = useStore((s) => s.agentLoading);

  // state must mirror prop on prop change — derived-state guard
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setName(dashboardName || ''); }, [dashboardName]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

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

          {/* TSS — DashboardPicker: dropdown listing saved dashboards +
              double-click to rename. Replaces the inline rename button. */}
          <DashboardPicker
            dashboardName={dashboardName}
            dashboardId={dashboardId}
            dashboardList={dashboardList}
            onSwitch={onSwitchDashboard}
            onRename={(next) => onNameChange?.(next)}
            connections={connections}
          />

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

      {/* ═══ CENTER-RIGHT slot — DashboardPresetSwitcher (Wave 3) ═══ */}
      <DashboardPresetSwitcher />

      {/* ═══ RIGHT: chip slot + New + Share + Save ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {rightSlot}
        {/* TSS W3-A — New Dashboard ghost button. Kicks the
            SaveDashboardDialog → SemanticTagWizard → autogen flow. */}
        <NewDashboardButton />
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

/**
 * NewDashboardButton — TSS W3-A.
 *
 * Ghost "+ New Dashboard" trigger that lives in the right cluster to the
 * left of Share. Fires the store's `openSaveDashboardDialog` action; the
 * dialog itself is mounted in DashboardShell's tail.
 */
function NewDashboardButton() {
  const openSaveDashboardDialog = useStore((s) => s.openSaveDashboardDialog);
  return (
    <button
      type="button"
      onClick={() => openSaveDashboardDialog?.()}
      className="premium-btn premium-sheen"
      data-testid="topbar-new-dashboard"
      style={{
        padding: '6px 12px',
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
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-hover)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
      aria-label="Create new dashboard"
    >
      <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>+</span>
      New Dashboard
    </button>
  );
}


import { useRef, useState, useEffect } from 'react';
import { useStore } from '../../store';

/**
 * RebuildButton — Typed-Seeking-Spring W2-C.
 *
 * Toolbar button that re-runs the preset-autogen orchestrator for the
 * active dashboard. Pinned narrative/slot edits are preserved — the
 * confirm copy makes that promise explicit so the user knows their
 * edits won't be clobbered.
 *
 * Mounts the confirm as an inline popover anchored to the button. The
 * popover has role="dialog" + aria-modal="false" (non-blocking). Esc
 * and click-outside both dismiss.
 *
 * Intentionally NOT mounted inside DashboardShell by default — W3 wires
 * this into the preset switcher row so it sits next to the preset
 * pills. Export-only today.
 */
export default function RebuildButton({
  disabled = false,
  onRebuildStart,
}) {
  const rebuildAllPresets = useStore((s) => s.rebuildAllPresets);
  const bindingAutogenState = useStore(
    (s) => s.analystProDashboard?.bindingAutogenState,
  );
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);

  // Close on outside click + Escape so the popover doesn't strand focus.
  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isRunning = bindingAutogenState === 'running';
  const btnDisabled = disabled || isRunning;

  const handleConfirm = async () => {
    setOpen(false);
    onRebuildStart?.();
    try {
      await rebuildAllPresets?.({ skipPinned: true });
    } catch {
      // Errors are surfaced through store.bindingAutogenError; the
      // chip + banner react automatically.
    }
  };

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        data-testid="rebuild-button"
        aria-label="Rebuild dashboard bindings"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={btnDisabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          appearance: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 28,
          padding: '0 12px',
          borderRadius: 6,
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
          background: 'var(--glass-bg-card, rgba(20,20,32,0.72))',
          color: 'var(--text-primary, #e7e7ea)',
          fontSize: 12,
          fontWeight: 500,
          cursor: btnDisabled ? 'not-allowed' : 'pointer',
          opacity: btnDisabled ? 0.5 : 1,
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 11-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
        Rebuild
      </button>

      {open ? (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="rebuild-popover-title"
          data-testid="rebuild-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 280,
            padding: 12,
            borderRadius: 8,
            background: 'var(--glass-bg-card-elevated, rgba(18,18,26,0.96))',
            border: '1px solid var(--border-default, rgba(255,255,255,0.14))',
            boxShadow: '0 8px 28px rgba(0,0,0,0.48)',
            color: 'var(--text-primary, #e7e7ea)',
            fontSize: 12,
            lineHeight: 1.4,
            zIndex: 50,
          }}
        >
          <div
            id="rebuild-popover-title"
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Regenerate bindings?
          </div>
          <div
            style={{
              color: 'var(--text-secondary, #b0b0b6)',
              marginBottom: 12,
            }}
          >
            Your pinned edits will be preserved.
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 6,
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                appearance: 'none',
                height: 26,
                padding: '0 10px',
                borderRadius: 5,
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
                background: 'transparent',
                color: 'var(--text-secondary, #b0b0b6)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              aria-label="Confirm rebuild"
              style={{
                appearance: 'none',
                height: 26,
                padding: '0 12px',
                borderRadius: 5,
                border: '1px solid rgba(124,58,237,0.6)',
                background:
                  'linear-gradient(135deg, rgba(124,58,237,0.32), rgba(168,85,247,0.2))',
                color: '#f5f1ff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Regenerate
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}

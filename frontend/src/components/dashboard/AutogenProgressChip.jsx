import { useStore } from '../../store';

/**
 * AutogenProgressChip — Typed-Seeking-Spring W2-C.
 *
 * Non-blocking status chip mounted in the DashboardShell TopBar's
 * right slot (next to Save / Share). Surfaces the preset autogen
 * lifecycle so the user sees the work happening without being blocked
 * by a spinner or modal.
 *
 * Renders iff `bindingAutogenState === 'running'`. Shape matches the
 * plan's "Building · 3/5 modes" wording — `done` and `total` come from
 * `store.autogenProgress` which is written to by the SSE consumer in
 * `rebuildAllPresets` (and by the server autogen stream in W2-A).
 *
 * @param {{ bindingAutogenState?: string }} props
 */
export default function AutogenProgressChip({ bindingAutogenState }) {
  const progress = useStore((s) => s.autogenProgress);

  if (bindingAutogenState !== 'running') return null;

  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;

  return (
    <div
      data-testid="autogen-progress-chip"
      role="status"
      aria-live="polite"
      aria-label={`Building dashboard modes: ${done} of ${total} complete`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 26,
        padding: '0 10px',
        borderRadius: 999,
        background: 'var(--glass-bg-chip, rgba(124,58,237,0.14))',
        border: '1px solid var(--border-subtle, rgba(124,58,237,0.35))',
        color: 'var(--text-primary, #e7e7ea)',
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#a855f7',
          boxShadow: '0 0 8px rgba(168,85,247,0.55)',
          animation: 'pulse 1.5s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
      <span>
        Building
        <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {done}/{total}
        </span>{' '}
        modes
      </span>
    </div>
  );
}

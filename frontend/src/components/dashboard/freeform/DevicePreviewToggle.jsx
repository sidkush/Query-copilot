// frontend/src/components/dashboard/freeform/DevicePreviewToggle.jsx
// Plan 6a — Desktop / Tablet / Phone segmented toggle.
// Mirrors Tableau's DashboardDeviceLayout (Build_Tableau.md §IX.5, Appendix A.13).
import { useStore } from '../../../store';
import { TOKENS } from '../tokens';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', hint: '≥ 1366 px' },
  { id: 'tablet', label: 'Tablet', hint: '1024 × 768' },
  { id: 'phone', label: 'Phone', hint: '375 × 667' },
];

export default function DevicePreviewToggle() {
  const active = useStore((s) => s.analystProActiveDevice);
  const setActive = useStore((s) => s.setActiveDeviceAnalystPro);

  return (
    <div
      data-testid="device-preview-toggle"
      role="radiogroup"
      aria-label="Device preview"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 2,
        fontFamily: TOKENS.fontMono,
        fontSize: 11,
      }}
    >
      {DEVICES.map((d) => {
        const activeBtn = d.id === active;
        return (
          <button
            key={d.id}
            type="button"
            data-testid={`device-${d.id}`}
            role="radio"
            aria-checked={activeBtn}
            aria-pressed={activeBtn}
            onClick={() => setActive(d.id)}
            title={`${d.label} — ${d.hint}`}
            style={{
              padding: '4px 10px',
              background: activeBtn ? 'var(--accent)' : 'transparent',
              color: activeBtn ? 'var(--text-on-accent)' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

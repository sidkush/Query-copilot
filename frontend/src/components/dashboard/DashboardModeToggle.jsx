import { motion } from "framer-motion";

/**
 * DashboardModeToggle — segmented pill for switching between dashboard
 * archetypes (Briefing / Workbench / Ops / Story / Pitch / Workbook).
 *
 * Uses Framer Motion layoutId for the active-pill slide transition
 * matching the chart editor's mode toggle.
 */
export default function DashboardModeToggle({ modes, activeMode, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard mode"
      data-testid="dashboard-mode-toggle"
      style={{
        display: "flex",
        padding: 2,
        borderRadius: 6,
        background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
        position: "relative",
      }}
    >
      {modes.map((m) => {
        const active = m.id === activeMode;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            data-testid={`dashboard-mode-${m.id}`}
            onClick={() => onChange && onChange(m.id)}
            style={{
              position: "relative",
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 4,
              background: "transparent",
              color: active ? "var(--text-primary, #e7e7ea)" : "var(--text-secondary, #b0b0b6)",
              cursor: "pointer",
              border: "none",
              minWidth: 64,
            }}
          >
            {active && (
              <motion.span
                layoutId="dashboard-mode-toggle-bg"
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 4,
                  background: "var(--accent, rgba(96,165,250,0.22))",
                  zIndex: 0,
                }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

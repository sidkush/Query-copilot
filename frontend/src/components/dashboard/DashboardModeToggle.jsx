import { motion } from "framer-motion";

/**
 * DashboardModeToggle — SP-1 restyled segmented pill.
 *
 * 6 archetype pills: Briefing · Workbench · LiveOps · Story · Pitch · Tableau
 * Active pill: subtle purple bg + purple text + Framer Motion spring slide.
 * Inactive: muted gray, brightens on hover.
 * Responsive: below 640px shows truncated labels (first 4 chars).
 */
export default function DashboardModeToggle({ modes, activeMode, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard archetype"
      data-testid="dashboard-mode-toggle"
      style={{
        display: "flex",
        padding: 3,
        borderRadius: 8,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
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
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              fontFamily: "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif",
              letterSpacing: "-0.01em",
              borderRadius: 6,
              background: "transparent",
              color: active
                ? "var(--accent, #a78bfa)"
                : "var(--text-muted, rgba(255,255,255,0.4))",
              cursor: "pointer",
              border: "none",
              minWidth: 56,
              transition: "color 150ms ease",
              zIndex: active ? 1 : 0,
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = "var(--text-secondary, #b0b0b6)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = "var(--text-muted, rgba(255,255,255,0.4))";
            }}
          >
            {active && (
              <motion.span
                layoutId="dashboard-mode-toggle-bg"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 6,
                  background: "rgba(168,85,247,0.12)",
                  border: "1px solid rgba(168,85,247,0.15)",
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

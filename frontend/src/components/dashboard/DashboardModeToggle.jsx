import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SPRINGS, TWEENS } from "./motion";
import { TOKENS } from "./tokens";

/**
 * DashboardModeToggle — premium morphing capsule.
 *
 * 6 archetype pills arranged in a row. The active pill is a single
 * `layoutId` element that morphs between slots on select, tuned with
 * SPRINGS.snappy (no overshoot per `.impeccable.md`). Each pill carries
 * .premium-sheen for a hover light-sweep and .premium-btn for a tactile
 * press translate. Active pill gets a subtle accent glow ring. Hover
 * raises a tooltip above the pill via AnimatePresence + spring.
 */
export default function DashboardModeToggle({ modes, activeMode, onChange }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div
      role="tablist"
      aria-label="Dashboard archetype"
      data-testid="dashboard-mode-toggle"
      style={{
        display: "flex",
        padding: 3,
        borderRadius: 8,
        background: "var(--overlay-subtle)",
        border: "1px solid var(--border-default)",
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
            onMouseEnter={(e) => {
              setHoveredId(m.id);
              if (!active) e.currentTarget.style.color = "var(--text-secondary)";
            }}
            onMouseLeave={(e) => {
              setHoveredId((prev) => (prev === m.id ? null : prev));
              if (!active) e.currentTarget.style.color = "var(--text-muted)";
            }}
            onFocus={() => setHoveredId(m.id)}
            onBlur={() => setHoveredId((prev) => (prev === m.id ? null : prev))}
            className="premium-btn premium-sheen"
            style={{
              position: "relative",
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              fontFamily: TOKENS.fontDisplay,
              letterSpacing: "-0.01em",
              borderRadius: 6,
              background: "transparent",
              color: active
                ? "var(--accent)"
                : "var(--text-muted)",
              cursor: "pointer",
              border: "none",
              minWidth: 56,
              transition: "color 150ms ease",
              zIndex: active ? 1 : 0,
            }}
          >
            {active && (
              <motion.span
                layoutId="mode-toggle-active-pill"
                transition={SPRINGS.snappy}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 6,
                  background: "rgba(168,85,247,0.12)",
                  border: "1px solid rgba(168,85,247,0.22)",
                  boxShadow: TOKENS.shadow.accentGlow,
                  zIndex: 0,
                }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>{m.label}</span>

            {/* Hover tooltip — reveals above on hover/focus */}
            <AnimatePresence>
              {hoveredId === m.id && !active && (
                <motion.span
                  role="tooltip"
                  initial={{ opacity: 0, y: 2, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 2, scale: 0.96 }}
                  transition={TWEENS.quick}
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 8px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "4px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    color: "var(--text-primary)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    boxShadow: "0 8px 20px -8px var(--shadow-deep)",
                    zIndex: 4,
                  }}
                >
                  {m.label}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}
    </div>
  );
}

import { motion } from "framer-motion";

/**
 * Top bar: breadcrumb + mode toggle + Save/Share buttons.
 * Buttons are Phase 1 stubs — wired to agent/save pipeline in later phases.
 */
const MODES = [
  { id: "default", label: "Default" },
  { id: "pro", label: "Pro" },
  { id: "stage", label: "Stage" },
];

export default function ChartEditorTopbar({ mode = "default", onModeChange }) {
  return (
    <div
      data-testid="chart-editor-topbar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 40,
        padding: "0 12px",
        borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
        fontSize: 13,
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
      }}
    >
      <div
        data-testid="chart-editor-breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-secondary, #b0b0b6)",
        }}
      >
        <span>Dashboard</span>
        <span style={{ opacity: 0.5 }}>/</span>
        <span style={{ color: "var(--text-primary, #e7e7ea)" }}>Untitled chart</span>
      </div>

      <div
        role="tablist"
        aria-label="Editor mode"
        style={{
          display: "flex",
          padding: 2,
          borderRadius: 6,
          background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          position: "relative",
        }}
      >
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={active}
              data-testid={`mode-toggle-${m.id}`}
              onClick={() => onModeChange && onModeChange(m.id)}
              style={{
                position: "relative",
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                background: "transparent",
                color: active ? "var(--text-primary, #e7e7ea)" : "var(--text-secondary, #b0b0b6)",
                cursor: onModeChange ? "pointer" : "default",
                border: "none",
                minWidth: 56,
              }}
            >
              {active && (
                <motion.span
                  layoutId="mode-toggle-bg"
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

      <div style={{ display: "flex", gap: 8 }}>
        <button
          data-testid="topbar-save"
          disabled
          style={topbarButton}
        >
          Save
        </button>
        <button
          data-testid="topbar-share"
          disabled
          style={topbarButton}
        >
          Share
        </button>
      </div>
    </div>
  );
}

const topbarButton = {
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 4,
  background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
  color: "var(--text-secondary, #b0b0b6)",
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
  cursor: "not-allowed",
  opacity: 0.7,
};

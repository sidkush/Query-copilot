import { motion } from "framer-motion";
import TitleInlineEditor from "./onobject/TitleInlineEditor";
import { TOKENS } from "../dashboard/tokens";
import { BreathingDot, SPRINGS } from "../dashboard/motion";

/**
 * Top bar: breadcrumb + mode toggle + Save/Share buttons.
 * Buttons are Phase 1 stubs — wired to agent/save pipeline in later phases.
 *
 * Phase 2b: the "Untitled chart" crumb is replaced by a click-to-edit
 * TitleInlineEditor driven by spec.title and onSpecChange.
 *
 * Premium pass: morphing layoutId pill, accent glow on active, breadcrumb
 * breathing dot indicating current mode, premium-btn/premium-sheen surfaces.
 */
const MODES = [
  { id: "default", label: "Default" },
  { id: "pro", label: "Pro" },
  { id: "stage", label: "Stage" },
];

export default function ChartEditorTopbar({ mode = "default", onModeChange, spec, onSpecChange }) {
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
        fontFamily: TOKENS.fontDisplay,
      }}
    >
      <div
        data-testid="chart-editor-breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: "var(--text-secondary, #b0b0b6)",
          letterSpacing: "-0.005em",
        }}
      >
        <BreathingDot color="var(--accent, #2563EB)" size={5} />
        <span style={{ fontWeight: 600 }}>Data</span>
        <span style={{ opacity: 0.45 }}>→</span>
        <TitleInlineEditor spec={spec} onSpecChange={onSpecChange} />
      </div>

      <div
        role="tablist"
        aria-label="Editor mode"
        style={{
          display: "flex",
          padding: 2,
          borderRadius: 7,
          background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          position: "relative",
          boxShadow: TOKENS.shadow.innerGlass,
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
              className="premium-btn premium-sheen"
              style={{
                position: "relative",
                padding: "4px 14px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 5,
                background: "transparent",
                color: active ? "var(--text-primary, #e7e7ea)" : "var(--text-secondary, #b0b0b6)",
                cursor: onModeChange ? "pointer" : "default",
                border: "none",
                minWidth: 60,
                letterSpacing: "-0.005em",
                fontFamily: TOKENS.fontDisplay,
                boxShadow: active ? TOKENS.shadow.accentGlow : "none",
                transition: "color 200ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              {active && (
                <motion.span
                  layoutId="editor-mode-pill"
                  transition={SPRINGS.snappy}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 5,
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
          className="premium-btn"
          style={topbarButton}
        >
          Save
        </button>
        <button
          data-testid="topbar-share"
          disabled
          className="premium-btn"
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
  fontWeight: 600,
  borderRadius: 5,
  background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
  color: "var(--text-secondary, #b0b0b6)",
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
  cursor: "not-allowed",
  opacity: 0.7,
  letterSpacing: "-0.005em",
};

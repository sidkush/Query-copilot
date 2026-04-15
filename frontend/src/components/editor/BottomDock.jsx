import { useState } from "react";

/**
 * BottomDock — 44px dock with text input, mock mic button, step pill row.
 * Phase 1 stub: no voice, no agent wiring. Phase 3 connects this to the
 * voice pipeline + AgentPanel.
 */
export default function BottomDock() {
  const [text, setText] = useState("");
  const [micOn, setMicOn] = useState(false);

  return (
    <div
      data-testid="bottom-dock"
      style={{
        height: 44,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
      }}
    >
      <button
        type="button"
        data-testid="bottom-dock-mic"
        aria-pressed={micOn}
        onClick={() => setMicOn((v) => !v)}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
          background: micOn
            ? "var(--accent, rgba(96,165,250,0.22))"
            : "var(--bg-elev-2, rgba(255,255,255,0.04))",
          color: "var(--text-primary, #e7e7ea)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          flexShrink: 0,
        }}
        title="Voice — Phase 3"
      >
        <span aria-hidden>🎤</span>
      </button>

      <input
        data-testid="bottom-dock-input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask the agent to edit this chart…"
        style={{
          flex: 1,
          height: 28,
          padding: "0 10px",
          fontSize: 13,
          background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
          borderRadius: 4,
          color: "var(--text-primary, #e7e7ea)",
          outline: "none",
        }}
      />

      <div
        data-testid="bottom-dock-steps"
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          flexShrink: 0,
          minWidth: 120,
          justifyContent: "flex-end",
        }}
      >
        <StepPill label="Plan" status="idle" />
        <StepPill label="Edit" status="idle" />
        <StepPill label="Save" status="idle" />
      </div>
    </div>
  );
}

function StepPill({ label, status }) {
  return (
    <span
      data-testid={`step-pill-${label.toLowerCase()}`}
      data-status={status}
      style={{
        padding: "2px 8px",
        fontSize: 10,
        borderRadius: 10,
        background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
        color: "var(--text-secondary, #b0b0b6)",
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </span>
  );
}

import { useState } from "react";
import { BreathingDot } from "../dashboard/motion";
import { TOKENS } from "../dashboard/tokens";

/**
 * BottomDock — 44px dock with text input, mock mic button, step pill row.
 * Phase 1 stub: no voice, no agent wiring. Phase 3 connects this to the
 * voice pipeline + AgentPanel.
 *
 * Premium pass:
 *   - Input sits in a liquid-glass shell
 *   - Mic button reveals a breathing dot when listening
 *   - `processing` class adds a shimmer perimeter
 *   - Send affordance is tactile via premium-btn + premium-sheen
 */
export default function BottomDock() {
  const [text, setText] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [processing] = useState(false); // wired in Phase 3 agent pipeline

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
        fontFamily: TOKENS.fontDisplay,
      }}
    >
      <button
        type="button"
        data-testid="bottom-dock-mic"
        aria-pressed={micOn}
        aria-label={micOn ? "Stop listening" : "Start listening"}
        onClick={() => setMicOn((v) => !v)}
        className="premium-btn"
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
          flexShrink: 0,
          boxShadow: micOn ? TOKENS.shadow.statusGlow("#ef4444") : "none",
          transition: "background 200ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms cubic-bezier(0.16,1,0.3,1)",
        }}
        title={micOn ? "Listening — tap to stop" : "Voice — Phase 3"}
      >
        {micOn ? <BreathingDot color="#ef4444" size={8} /> : <span aria-hidden>🎤</span>}
      </button>

      <div
        className={`${processing ? "premium-shimmer-surface " : ""}premium-liquid-glass`}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          padding: 1,
          borderRadius: 7,
        }}
      >
        <input
          data-testid="bottom-dock-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask the agent to edit this chart…"
          style={{
            flex: 1,
            height: 26,
            padding: "0 10px",
            fontSize: 13,
            background: "transparent",
            border: "none",
            borderRadius: 6,
            color: "var(--text-primary, #e7e7ea)",
            outline: "none",
            fontFamily: TOKENS.fontDisplay,
            letterSpacing: "-0.005em",
          }}
        />
        <button
          type="button"
          data-testid="bottom-dock-send"
          aria-label="Send"
          disabled={!text.trim()}
          className="premium-btn premium-sheen"
          style={{
            height: 24,
            padding: "0 10px",
            marginRight: 2,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.02em",
            borderRadius: 5,
            border: "none",
            background: text.trim()
              ? "var(--accent, #2563eb)"
              : "var(--bg-elev-2, rgba(255,255,255,0.04))",
            color: text.trim() ? "#fff" : "var(--text-muted, rgba(255,255,255,0.4))",
            cursor: text.trim() ? "pointer" : "not-allowed",
            boxShadow: text.trim() ? TOKENS.shadow.accentGlow : "none",
          }}
        >
          Send
        </button>
      </div>

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
        fontFamily: TOKENS.fontMono,
      }}
    >
      {label}
    </span>
  );
}

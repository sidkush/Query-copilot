import { useState } from "react";

/**
 * AgentPanel — editor-scoped agent conversation surface.
 *
 * This is a NEW panel separate from the existing dashboard-wide
 * `src/components/agent/AgentPanel.jsx` — that one owns the whole
 * streaming session for the Chat + Dashboard pages. The editor panel
 * is lighter: it's an inline sidebar that shows the chart-editing
 * conversation and dispatches edit prompts through onSubmit(). The
 * caller (ChartEditor or DevChartEditor) is responsible for actually
 * calling the agent backend + streaming steps back.
 *
 * Phase 3 scope:
 *   - Text input + suggestion chips
 *   - Rendered step feed (plan, thinking, tool calls, user questions,
 *     tile edits, errors)
 *   - Optional voice mic button that starts a VoiceProvider session
 *
 * Not in Phase 3:
 *   - Actual backend wiring to the agent SSE endpoint (that lives in
 *     the caller — this component is presentational)
 *   - Voice wake word integration (Phase 5)
 *   - Dockable float/right/bottom/left placement (reuses the dashboard
 *     panel's infrastructure at Phase 4 cutover)
 */
const SUGGESTION_CHIPS = [
  "Make this a stacked bar",
  "Switch to a line chart",
  "Color by region",
  "Sort by revenue descending",
  "Add a trend line",
];

export default function AgentPanel({
  steps = [],
  onSubmit,
  onSuggestionClick,
  loading = false,
}) {
  const [text, setText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !onSubmit) return;
    onSubmit(trimmed);
    setText("");
  };

  return (
    <div
      data-testid="editor-agent-panel"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
        borderLeft: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {steps.length === 0 ? (
          <EmptyState onSuggestionClick={onSuggestionClick || onSubmit} />
        ) : (
          steps.map((step, i) => <StepCard key={step.id || i} step={step} />)
        )}
        {loading && <LoadingIndicator />}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: 6,
          padding: 10,
          borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
        }}
      >
        <input
          data-testid="editor-agent-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask the agent to edit this chart…"
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 12,
            borderRadius: 4,
            background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            color: "var(--text-primary, #e7e7ea)",
            outline: "none",
          }}
        />
        <button
          type="submit"
          data-testid="editor-agent-submit"
          disabled={!text.trim() || loading}
          style={{
            padding: "4px 12px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 4,
            background: "var(--accent, rgba(96,165,250,0.22))",
            color: "var(--text-primary, #e7e7ea)",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
            cursor: !text.trim() || loading ? "not-allowed" : "pointer",
            opacity: !text.trim() || loading ? 0.55 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function StepCard({ step }) {
  const type = step.type || "info";
  return (
    <div
      data-testid={`agent-step-${type}`}
      style={{
        padding: "6px 10px",
        fontSize: 11,
        borderRadius: 4,
        background: STEP_BG[type] || "var(--bg-elev-2, rgba(255,255,255,0.04))",
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
        color: "var(--text-primary, #e7e7ea)",
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted, rgba(255,255,255,0.5))",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {type}
      </div>
      {step.text || step.content || ""}
    </div>
  );
}

const STEP_BG = {
  plan: "rgba(96,165,250,0.08)",
  thinking: "rgba(255,255,255,0.025)",
  tool_call: "rgba(45,191,113,0.08)",
  tile_edit: "rgba(168,85,247,0.09)",
  error: "rgba(229,62,62,0.09)",
  ask_user: "rgba(245,158,11,0.10)",
};

function LoadingIndicator() {
  return (
    <div
      data-testid="agent-loading"
      style={{
        fontSize: 10,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontStyle: "italic",
      }}
    >
      Agent is thinking…
    </div>
  );
}

function EmptyState({ onSuggestionClick }) {
  return (
    <div style={{ padding: "8px 0" }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted, rgba(255,255,255,0.45))",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Try asking
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            data-testid={`agent-suggestion-${chip.replace(/\s+/g, "-").toLowerCase()}`}
            onClick={() => onSuggestionClick && onSuggestionClick(chip)}
            style={{
              textAlign: "left",
              padding: "5px 8px",
              fontSize: 11,
              borderRadius: 3,
              background: "var(--bg-elev-2, rgba(255,255,255,0.04))",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
              color: "var(--text-secondary, #b0b0b6)",
              cursor: "pointer",
            }}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { api } from "../../api";
import { useStore } from "../../store";
import { TOKENS } from "../dashboard/tokens";

export default function AgentQuestion({ question, options, chatId }) {
  const [textInput, setTextInput] = useState("");
  const [responded, setResponded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const clearAgentWaiting = useStore((s) => s.clearAgentWaiting);

  const handleRespond = async (response) => {
    if (responded || sending) return;
    if (!chatId) {
      setError("No active session — please start a new conversation.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.agentRespond(chatId, response);
      setResponded(true);
      clearAgentWaiting();
    } catch (err) {
      console.error("Agent respond failed:", err);
      setSending(false);
      setError("Failed to send response. Click to retry.");
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: "rgba(245, 158, 11, 0.08)",
        border: `1px solid rgba(245, 158, 11, 0.25)`,
        borderRadius: TOKENS.radius.md,
        padding: "12px 16px",
      }}
    >
      <p style={{ color: "#FDE68A", fontSize: "13px", marginBottom: "10px" }}>
        {question}
      </p>

      {error && (
        <p style={{ color: TOKENS.danger, fontSize: "11px", marginBottom: "6px" }}>{error}</p>
      )}

      {options && options.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "160px", overflowY: "auto" }}>
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleRespond(opt)}
              disabled={responded || sending}
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 500,
                borderRadius: TOKENS.radius.sm,
                border: "1px solid rgba(245, 158, 11, 0.3)",
                background: responded ? "transparent" : "rgba(245, 158, 11, 0.1)",
                color: responded ? TOKENS.text.muted : "#FCD34D",
                cursor: responded || sending ? "default" : "pointer",
                opacity: sending ? 0.6 : 1,
                transition: TOKENS.transition,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && textInput.trim() && handleRespond(textInput.trim())}
            disabled={responded || sending}
            placeholder="Type your answer..."
            aria-label="Response to agent question"
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: "12px",
              borderRadius: TOKENS.radius.sm,
              border: `1px solid ${TOKENS.border.default}`,
              background: TOKENS.bg.base,
              color: TOKENS.text.primary,
              outline: "none",
            }}
          />
          <button
            onClick={() => textInput.trim() && handleRespond(textInput.trim())}
            disabled={responded || sending || !textInput.trim()}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              borderRadius: TOKENS.radius.sm,
              background: TOKENS.accent,
              color: "#fff",
              border: "none",
              cursor: responded || sending ? "default" : "pointer",
              opacity: responded || sending || !textInput.trim() ? 0.5 : 1,
            }}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}

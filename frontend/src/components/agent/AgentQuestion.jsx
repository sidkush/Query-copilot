import { useState, useRef } from "react";
import { api } from "../../api";
import { useStore } from "../../store";
import { TOKENS } from "../dashboard/tokens";
import ReactMarkdown from "react-markdown";

export default function AgentQuestion({ question, options, chatId }) {
  const [textInput, setTextInput] = useState("");
  const [responded, setResponded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const clearAgentWaiting = useStore((s) => s.clearAgentWaiting);
  const textInputRef = useRef(null);

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
      void err;
      setSending(false);
      setError("Failed to send response. Click to retry.");
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="agent-bubble-assistant"
      style={{
        borderRadius: TOKENS.radius.md,
        padding: "14px 16px",
        border: `1px solid ${TOKENS.accent}`,
        background: 'rgba(37, 99, 235, 0.04)',
      }}
    >
      <div style={{ color: TOKENS.text.primary, fontSize: "13px", marginBottom: "10px", lineHeight: 1.5 }}>
        <ReactMarkdown components={{
          h1: ({children}) => <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, marginBottom: 3 }}>{children}</div>,
          h2: ({children}) => <div style={{ fontSize: 14, fontWeight: 600, marginTop: 5, marginBottom: 2 }}>{children}</div>,
          h3: ({children}) => <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, marginBottom: 2 }}>{children}</div>,
          p: ({children}) => <div style={{ marginBottom: 4 }}>{children}</div>,
          strong: ({children}) => <span style={{ fontWeight: 600, color: TOKENS.accent }}>{children}</span>,
          ul: ({children}) => <ul style={{ paddingLeft: 16, margin: "3px 0" }}>{children}</ul>,
          ol: ({children}) => <ol style={{ paddingLeft: 16, margin: "3px 0" }}>{children}</ol>,
          li: ({children}) => <li style={{ marginBottom: 2, fontSize: 12 }}>{children}</li>,
          code: ({children}) => <span style={{ fontSize: 11, background: "var(--overlay-light)", padding: "1px 4px", borderRadius: 3 }}>{children}</span>,
        }}>{question || ""}</ReactMarkdown>
      </div>

      {error && (
        <p style={{ color: TOKENS.danger, fontSize: "11px", marginBottom: "6px" }}>{error}</p>
      )}

      {/* Option buttons (when available) */}
      {options && options.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "160px", overflowY: "auto", marginBottom: "8px" }}>
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleRespond(opt)}
              disabled={responded || sending}
              style={{
                padding: "5px 14px",
                fontSize: "12px",
                fontWeight: 500,
                borderRadius: "9999px",
                border: `1px solid ${responded ? TOKENS.border.default : 'rgba(37, 99, 235, 0.25)'}`,
                background: responded ? "transparent" : "rgba(37, 99, 235, 0.08)",
                color: responded ? TOKENS.text.muted : TOKENS.accent,
                cursor: responded || sending ? "default" : "pointer",
                opacity: sending ? 0.6 : 1,
                transition: TOKENS.transition,
              }}
            >
              {opt}
            </button>
          ))}
          {/* "Other..." button to focus text input */}
          <button
            onClick={() => textInputRef.current?.focus()}
            disabled={responded || sending}
            style={{
              padding: "4px 12px",
              fontSize: "12px",
              fontWeight: 500,
              borderRadius: "9999px",
              border: `1px dashed ${responded ? TOKENS.border.default : 'rgba(37, 99, 235, 0.20)'}`,
              background: "transparent",
              color: responded ? TOKENS.text.muted : TOKENS.text.secondary,
              cursor: responded || sending ? "default" : "pointer",
              opacity: sending ? 0.6 : 1,
              transition: TOKENS.transition,
            }}
          >
            Other...
          </button>
        </div>
      )}

      {/* Text input — always visible */}
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          ref={textInputRef}
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && textInput.trim() && handleRespond(textInput.trim())}
          disabled={responded || sending}
          placeholder={options && options.length > 0 ? "Or type a custom response..." : "Type your answer..."}
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
    </div>
  );
}

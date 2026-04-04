import { useState } from "react";
import { api } from "../../api";
import { useStore } from "../../store";
import { TOKENS } from "../dashboard/tokens";

export default function AgentQuestion({ question, options, chatId }) {
  const [textInput, setTextInput] = useState("");
  const [responded, setResponded] = useState(false);
  const clearAgentWaiting = useStore((s) => s.clearAgentWaiting);

  const handleRespond = async (response) => {
    if (responded) return;
    setResponded(true);
    clearAgentWaiting();
    try {
      await api.agentRespond(chatId, response);
    } catch (err) {
      console.error("Agent respond failed:", err);
    }
  };

  return (
    <div
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

      {options && options.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleRespond(opt)}
              disabled={responded}
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 500,
                borderRadius: TOKENS.radius.sm,
                border: "1px solid rgba(245, 158, 11, 0.3)",
                background: responded ? "transparent" : "rgba(245, 158, 11, 0.1)",
                color: responded ? TOKENS.text.muted : "#FCD34D",
                cursor: responded ? "default" : "pointer",
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
            disabled={responded}
            placeholder="Type your answer..."
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
            disabled={responded || !textInput.trim()}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              borderRadius: TOKENS.radius.sm,
              background: TOKENS.accent,
              color: "#fff",
              border: "none",
              cursor: responded ? "default" : "pointer",
              opacity: responded || !textInput.trim() ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

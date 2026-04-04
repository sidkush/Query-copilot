import { useRef, useEffect } from "react";
import { useStore } from "../../store";
import { TOKENS } from "../dashboard/tokens";
import AgentQuestion from "./AgentQuestion";

const TOOL_ICONS = {
  find_relevant_tables: "search",
  inspect_schema: "schema",
  run_sql: "play",
  suggest_chart: "chart",
  ask_user: "question",
  summarize_results: "summary",
};

function StepIcon({ type, toolName }) {
  if (type === "thinking") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.text.muted }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" opacity="0.3" />
          <path d="M12 6v6l4 2" />
        </svg>
      </span>
    );
  }
  if (type === "tool_call") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.accentLight }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      </span>
    );
  }
  if (type === "result") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.success }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </span>
    );
  }
  if (type === "error") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.danger }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </span>
    );
  }
  return null;
}

export default function AgentStepFeed() {
  const steps = useStore((s) => s.agentSteps);
  const waiting = useStore((s) => s.agentWaiting);
  const chatId = useStore((s) => s.agentChatId);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps, waiting]);

  if (!steps.length && !waiting) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: TOKENS.text.muted, fontSize: "13px",
      }}>
        Ask a question to start the agent
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1, overflowY: "auto", padding: "8px 12px",
        display: "flex", flexDirection: "column", gap: "6px",
      }}
    >
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <StepIcon type={step.type} toolName={step.tool_name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {step.type === "thinking" && (
              <span style={{ fontSize: "12px", color: TOKENS.text.muted, fontStyle: "italic" }}>
                {step.content || "Analyzing..."}
                <span className="animate-pulse"> ...</span>
              </span>
            )}

            {step.type === "tool_call" && (
              <div>
                <span style={{ fontSize: "12px", color: TOKENS.accentLight, fontWeight: 500 }}>
                  {step.tool_name}
                </span>
                {step.tool_result && (
                  <details style={{ marginTop: "2px" }}>
                    <summary style={{ fontSize: "11px", color: TOKENS.text.muted, cursor: "pointer" }}>
                      Result
                    </summary>
                    <pre style={{
                      fontSize: "10px", color: TOKENS.text.secondary,
                      background: TOKENS.bg.base, padding: "6px 8px",
                      borderRadius: TOKENS.radius.sm, marginTop: "4px",
                      overflow: "auto", maxHeight: "120px",
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {typeof step.tool_result === "string"
                        ? step.tool_result.slice(0, 500)
                        : JSON.stringify(step.tool_result, null, 2).slice(0, 500)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {step.type === "result" && (
              <div style={{ fontSize: "13px", color: TOKENS.text.primary }}>
                {step.content}
                {step.sql && (
                  <pre style={{
                    fontSize: "11px", color: TOKENS.accentLight,
                    background: TOKENS.bg.base, padding: "8px",
                    borderRadius: TOKENS.radius.sm, marginTop: "6px",
                    overflow: "auto", maxHeight: "150px",
                  }}>
                    {step.sql}
                  </pre>
                )}
              </div>
            )}

            {step.type === "error" && (
              <span style={{ fontSize: "12px", color: TOKENS.danger }}>
                {step.content}
              </span>
            )}
          </div>
        </div>
      ))}

      {waiting && (
        <AgentQuestion question={waiting} options={null} chatId={chatId} />
      )}
    </div>
  );
}

import { useRef, useEffect, Component } from "react";
import { useStore } from "../../store";
import { TOKENS } from "../dashboard/tokens";
import AgentQuestion from "./AgentQuestion";

// Error boundary to prevent malformed step data from crashing the host page
class StepFeedErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", textAlign: "center" }}>
          <div>
            <div style={{ color: TOKENS.danger, fontSize: "13px", marginBottom: "8px" }}>Agent feed encountered an error</div>
            <button onClick={() => { useStore.getState().clearAgent(); this.setState({ error: null }); }} style={{
              fontSize: "12px", padding: "4px 12px", borderRadius: TOKENS.radius.sm,
              border: `1px solid ${TOKENS.border.default}`, background: "transparent",
              color: TOKENS.text.muted, cursor: "pointer",
            }}>Retry</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function StepIcon({ type }) {
  if (type === "user_query") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.accent }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </span>
    );
  }
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
  if (type === "tier_routing") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: "#f59e0b" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </span>
    );
  }
  if (type === "progress") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.accentLight }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </span>
    );
  }
  if (type === "tier_hit") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.success }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
    );
  }
  if (type === "cached_result") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: "#06b6d4" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      </span>
    );
  }
  if (type === "live_correction") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.success }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.text.muted }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
      </svg>
    </span>
  );
}

export default function AgentStepFeed() {
  return <StepFeedErrorBoundary><AgentStepFeedInner /></StepFeedErrorBoundary>;
}

function AgentStepFeedInner() {
  const steps = useStore((s) => s.agentSteps);
  const waiting = useStore((s) => s.agentWaiting);
  const waitingOptions = useStore((s) => s.agentWaitingOptions);
  const chatId = useStore((s) => s.agentChatId);
  const scrollRef = useRef(null);
  const userScrolledUp = useRef(false);

  // Track whether user has scrolled away from bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      userScrolledUp.current = !atBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Reset scroll tracking when steps are cleared (new conversation)
  const prevStepsLen = useRef(steps.length);
  useEffect(() => {
    if (prevStepsLen.current > 0 && steps.length <= 1) {
      userScrolledUp.current = false;
    }
    prevStepsLen.current = steps.length;
  }, [steps.length]);

  // Auto-scroll only if user hasn't scrolled up
  useEffect(() => {
    if (scrollRef.current && !userScrolledUp.current) {
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
        <div key={step.tool_use_id || `${step.type}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <StepIcon type={step.type} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {step.type === "user_query" && (
              <div style={{
                fontSize: "13px", color: TOKENS.text.primary, fontWeight: 500,
                padding: "6px 10px", borderRadius: TOKENS.radius.sm,
                background: `${TOKENS.accent}15`, borderLeft: `2px solid ${TOKENS.accent}`,
              }}>
                {step.content}
              </div>
            )}

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
              <div style={{ fontSize: "13px", color: TOKENS.text.primary, maxHeight: "300px", overflowY: "auto", wordBreak: "break-word" }}>
                {step.content}
                {step.sql && (
                  <pre style={{
                    fontSize: "11px", color: TOKENS.accentLight,
                    background: TOKENS.bg.base, padding: "8px",
                    borderRadius: TOKENS.radius.sm, marginTop: "6px",
                    overflow: "auto", maxHeight: "150px",
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {step.sql}
                  </pre>
                )}
              </div>
            )}

            {step.type === "tier_routing" && (
              <div style={{
                fontSize: "12px", color: "#f59e0b", fontWeight: 500,
                padding: "4px 8px", borderRadius: TOKENS.radius.sm,
                background: "rgba(245, 158, 11, 0.08)",
                display: "inline-flex", alignItems: "center", gap: "6px",
              }}>
                <span>{step.content || "Checking intelligence tiers..."}</span>
                <span className="animate-pulse" style={{ fontSize: "10px" }}>...</span>
              </div>
            )}

            {step.type === "progress" && (
              <div style={{ fontSize: "12px", color: TOKENS.text.secondary }}>
                <div style={{ marginBottom: "4px" }}>{step.content || "Processing..."}</div>
                {/* Decomposition sub-query progress */}
                {step.total_sub_queries > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{
                      height: "3px", borderRadius: "2px", background: TOKENS.bg.base,
                      overflow: "hidden", flex: 1, maxWidth: "180px",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: "2px", background: TOKENS.success,
                        transition: "width 0.3s ease",
                        width: `${Math.min(100, (((step.sub_query_index || 0) + 1) / step.total_sub_queries) * 100)}%`,
                      }} />
                    </div>
                    <span style={{ fontSize: "10px", color: TOKENS.text.muted }}>
                      {(step.sub_query_index || 0) + 1}/{step.total_sub_queries}
                    </span>
                  </div>
                ) : step.estimated_total_ms > 0 ? (
                  /* Standard elapsed/estimated progress bar */
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{
                      height: "3px", borderRadius: "2px", background: TOKENS.bg.base,
                      overflow: "hidden", flex: 1, maxWidth: "180px",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: "2px", background: TOKENS.accent,
                        transition: "width 0.5s ease",
                        width: `${Math.min(100, ((step.elapsed_ms || 0) / step.estimated_total_ms) * 100)}%`,
                      }} />
                    </div>
                    <span style={{ fontSize: "10px", color: TOKENS.text.muted }}>
                      {Math.round((step.elapsed_ms || 0) / 1000)}s / ~{Math.round(step.estimated_total_ms / 1000)}s
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {step.type === "tier_hit" && (
              <div style={{
                fontSize: "11px", color: TOKENS.success, fontWeight: 500,
                padding: "3px 8px", borderRadius: "10px",
                background: "rgba(34, 197, 94, 0.1)",
                display: "inline-flex", alignItems: "center", gap: "4px",
              }}>
                {step.tier === "schema" && "Answered from schema cache"}
                {step.tier === "memory" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity="0.3"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    Answered from team knowledge
                  </span>
                )}
                {step.tier === "turbo" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Answered from Turbo Mode
                  </span>
                )}
                {step.tier === "live" && "Querying live database"}
                {step.cache_age_seconds > 0 && (
                  <span style={{ color: TOKENS.text.muted, fontWeight: 400 }}>
                    ({step.cache_age_seconds < 60 ? `${step.cache_age_seconds}s ago` :
                      step.cache_age_seconds < 3600 ? `${Math.round(step.cache_age_seconds / 60)}m ago` :
                      `${Math.round(step.cache_age_seconds / 3600)}h ago`})
                  </span>
                )}
              </div>
            )}

            {step.type === "cached_result" && (
              <div style={{
                fontSize: "13px", color: TOKENS.text.primary,
                padding: "8px 12px", borderRadius: TOKENS.radius.sm,
                background: "rgba(6, 182, 212, 0.06)",
                borderLeft: "3px solid #06b6d4",
              }}>
                <div style={{ fontSize: "11px", color: "#06b6d4", fontWeight: 600, marginBottom: "6px",
                  display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  Instant Answer
                  {step.cache_age_seconds != null && (() => {
                    const age = step.cache_age_seconds;
                    const color = age < 60 ? TOKENS.success : age < 300 ? "#f59e0b" : TOKENS.danger;
                    const label = age < 60 ? `Fresh (${Math.round(age)}s ago)` : age < 300 ? `Cached (${Math.round(age / 60)}m ago)` : `Stale (${Math.round(age / 60)}m ago)`;
                    return (
                      <span style={{ fontWeight: 500, color, fontSize: "10px",
                        padding: "1px 6px", borderRadius: "8px",
                        background: color === TOKENS.success ? "rgba(34,197,94,0.1)" : color === "#f59e0b" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)" }}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ wordBreak: "break-word" }}>{step.content}</div>
                <div style={{ fontSize: "10px", color: TOKENS.text.muted, marginTop: "6px",
                  display: "flex", alignItems: "center", gap: "4px" }}>
                  <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%",
                    background: "#06b6d4", display: "inline-block" }}/>
                  Live verification in progress...
                </div>
              </div>
            )}

            {step.type === "live_correction" && (
              <div style={{
                fontSize: "13px", color: TOKENS.text.primary,
                padding: "8px 12px", borderRadius: TOKENS.radius.sm,
                background: step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed")
                  ? "rgba(34, 197, 94, 0.06)" : "rgba(245, 158, 11, 0.06)",
                borderLeft: `3px solid ${step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed")
                  ? TOKENS.success : "#f59e0b"}`,
              }}>
                <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "4px",
                  color: step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed")
                    ? TOKENS.success : "#f59e0b",
                  display: "flex", alignItems: "center", gap: "6px" }}>
                  {step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed") ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                      Verified
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      Updated
                    </>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: TOKENS.text.secondary, marginBottom: step.content ? "6px" : 0 }}>
                  {step.diff_summary}
                </div>
                {step.content && step.diff_summary && !step.diff_summary.toLowerCase().startsWith("confirmed") && (
                  <div style={{ wordBreak: "break-word" }}>{step.content}</div>
                )}
              </div>
            )}

            {step.type === "error" && (
              <span style={{ fontSize: "12px", color: TOKENS.danger }}>
                {step.content}
              </span>
            )}

            {!["user_query","thinking","tool_call","result","tier_routing","progress","tier_hit",
               "error","cached_result","live_correction","ask_user"].includes(step.type) && (
              <div style={{ fontSize: "11px", color: TOKENS.text.muted, fontStyle: "italic", padding: "2px 8px" }}>
                Processing...
              </div>
            )}
          </div>
        </div>
      ))}

      {waiting && (
        <AgentQuestion question={waiting} options={waitingOptions} chatId={chatId} />
      )}
    </div>
  );
}

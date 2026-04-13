import { useRef, useEffect, Component, lazy, Suspense, useState } from "react";
import { useStore } from "../../store";
import { TOKENS } from "../dashboard/tokens";
import AgentQuestion from "./AgentQuestion";
import ReactMarkdown from "react-markdown";
const ResultsChart = lazy(() => import("../ResultsChart"));

function ChecklistPanel({ checklist, elapsedMs, estimatedMs }) {
  if (!checklist || checklist.length === 0) return null;
  const pct = estimatedMs > 0 ? Math.min(100, (elapsedMs / estimatedMs) * 100) : 0;
  const etaSec = estimatedMs > 0 ? Math.max(0, Math.round((estimatedMs - elapsedMs) / 1000)) : null;

  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${TOKENS.border.default}`, background: 'var(--overlay-faint)' }}>
      <div style={{ height: 3, borderRadius: 2, background: 'var(--overlay-light)', marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: TOKENS.success, width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
      {checklist.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13 }}>
          {item.status === 'done' && <span style={{ color: TOKENS.success, fontSize: 14 }}>&#10003;</span>}
          {item.status === 'active' && <span className="animate-pulse" style={{ color: TOKENS.warning, fontSize: 10 }}>&#9679;</span>}
          {item.status === 'pending' && <span style={{ color: 'var(--overlay-medium)', fontSize: 10 }}>&#9675;</span>}
          <span style={{
            color: item.status === 'done' ? TOKENS.text.muted :
                   item.status === 'active' ? TOKENS.warning : TOKENS.text.muted,
            textDecoration: item.status === 'done' ? 'line-through' : 'none',
            opacity: item.status === 'pending' ? 0.7 : 1,
          }}>{item.label}</span>
        </div>
      ))}
      {etaSec != null && etaSec > 0 && (
        <div style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 6 }}>~{etaSec}s remaining</div>
      )}
    </div>
  );
}

function VerificationBadge({ verification }) {
  if (!verification) return null;
  const colors = { HIGH: TOKENS.success, MEDIUM: TOKENS.warning, LOW: TOKENS.danger };
  const icons = { HIGH: '\u2713', MEDIUM: '\u2139', LOW: '\u26A0' };
  const labels = {
    HIGH: 'Verified against data',
    MEDIUM: 'Partially verified',
    LOW: 'Discrepancy detected \u2014 review data',
  };
  const c = verification.confidence || 'MEDIUM';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginTop: 8,
      borderRadius: 8, border: `1px solid ${colors[c]}33`, background: `${colors[c]}0d`,
    }}>
      <span style={{ fontSize: 16, color: colors[c] }}>{icons[c]}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors[c] }}>{c} Confidence</div>
        <div style={{ fontSize: 12, color: TOKENS.text.secondary }}>{labels[c]}</div>
        {verification.summary && (
          <div style={{ fontSize: 11, color: TOKENS.text.muted, marginTop: 2 }}>{verification.summary}</div>
        )}
      </div>
    </div>
  );
}

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
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.warning }}>
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
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.info }}>
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
  if (type === "plan") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: "#3B82F6" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
    );
  }
  if (type === "budget_extension") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: TOKENS.warning }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M2 12h20" />
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

function ChatBubble({ align = 'left', color, timestamp, compact = false, children }) {
  const isUser = align === 'right';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      width: '100%',
    }}>
      <div
        className={isUser ? 'agent-bubble-user' : 'agent-bubble-assistant'}
        style={{
          maxWidth: compact ? '85%' : '92%',
          padding: compact ? '5px 11px' : '10px 14px',
          borderRadius: '14px',
          borderTopRightRadius: isUser ? '4px' : '14px',
          borderTopLeftRadius: isUser ? '14px' : '4px',
          wordBreak: 'break-word',
        }}
      >
        {children}
      </div>
      {timestamp && (
        <span style={{
          fontSize: '9px', color: TOKENS.text.muted,
          marginTop: '3px', padding: '0 4px',
        }}>
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

/** Renders run_sql results with inline chart/table + "Add to Dashboard" button.
 *  For other tools, shows compact collapsed result text. */
function RunSqlStepRenderer({ step }) {
  const [viewMode, setViewMode] = useState("chart"); // "chart" | "table" | "hidden"
  const [added, setAdded] = useState(false);
  const activeDashboardId = useStore(s => s.activeDashboardId);

  // Parse tool_result — may be string or object
  let parsed = null;
  if (step.tool_name === "run_sql" && step.tool_result) {
    try {
      parsed = typeof step.tool_result === "string" ? JSON.parse(step.tool_result) : step.tool_result;
    } catch { parsed = null; }
  }

  const hasData = parsed && parsed.columns?.length > 0 && parsed.rows?.length > 0 && !parsed.error;
  const sql = step.tool_input?.sql || (typeof step.tool_input === "string" ? step.tool_input : "");

  if (!hasData) {
    // Non-run_sql tools: compact display
    if (step.tool_name === "run_sql" && parsed?.error) {
      return (
        <div style={{ fontSize: 11, color: TOKENS.danger, padding: "4px 0" }}>
          Query failed: {parsed.error.slice(0, 150)}
        </div>
      );
    }
    return (
      <div>
        <span style={{ fontSize: "11px", color: TOKENS.text.muted }}>{step.tool_name}</span>
        {step.tool_result && (
          <details style={{ marginTop: "2px" }}>
            <summary style={{ fontSize: "10px", color: TOKENS.text.muted, cursor: "pointer" }}>details</summary>
            <pre style={{ fontSize: "9px", color: TOKENS.text.secondary, background: TOKENS.bg.base, padding: "4px 6px", borderRadius: 4, marginTop: 2, overflow: "auto", maxHeight: 80, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {typeof step.tool_result === "string" ? step.tool_result.slice(0, 300) : JSON.stringify(step.tool_result, null, 2).slice(0, 300)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  const rows = parsed.rows.map(r =>
    Array.isArray(r) ? Object.fromEntries(parsed.columns.map((c, i) => [c, r[i]])) : r
  );
  const rowCount = parsed.row_count || rows.length;

  const handleAddToDashboard = async () => {
    if (!activeDashboardId || added) return;
    try {
      const { api } = await import("../../api");
      const dash = await api.getDashboard(activeDashboardId);
      const tab = dash?.tabs?.[0];
      const section = tab?.sections?.[0];
      if (!tab || !section) return;
      const title = sql.replace(/^SELECT\s+/i, "").split(/\s+FROM/i)[0]?.slice(0, 50) || "Agent Query";
      await api.addTileToSection(dash.id, tab.id, section.id, {
        title, sql, chartType: rowCount <= 1 ? "kpi" : "bar",
        columns: parsed.columns, rows,
      });
      setAdded(true);
    } catch (e) { void e; }
  };

  // Pill toggle style — used for Chart/Table/Hide
  const pillStyle = (active) => ({
    fontSize: 10,
    fontWeight: 500,
    padding: "3px 10px",
    borderRadius: 9999,
    cursor: "pointer",
    border: `1px solid ${active ? "rgba(37, 99, 235, 0.3)" : "var(--border-default)"}`,
    background: active ? "var(--accent-glow)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-muted)",
    transition: "background 300ms cubic-bezier(0.32,0.72,0,1), color 300ms cubic-bezier(0.32,0.72,0,1), border-color 300ms cubic-bezier(0.32,0.72,0,1), transform 300ms cubic-bezier(0.32,0.72,0,1)",
  });

  return (
    <div className="agent-step">
      {/* Premium head bar — eyebrow + tool tag + stat */}
      <div className="agent-step__head">
        <span className="agent-step__label">
          <span className="eyebrow-dot" aria-hidden="true" />
          Tool
        </span>
        <span className="agent-tool-tag">run_sql</span>
        <span className="agent-step__stat">
          {rowCount.toLocaleString()} row{rowCount !== 1 ? "s" : ""} · {parsed.columns.length} col{parsed.columns.length !== 1 ? "s" : ""}
        </span>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button onClick={() => setViewMode("chart")} style={pillStyle(viewMode === "chart")} className="ease-spring">Chart</button>
          <button onClick={() => setViewMode("table")} style={pillStyle(viewMode === "table")} className="ease-spring">Table</button>
          <button onClick={() => setViewMode(v => v === "hidden" ? "chart" : "hidden")} style={pillStyle(false)} className="ease-spring">
            {viewMode === "hidden" ? "Show" : "Hide"}
          </button>
          {activeDashboardId && (
            <button onClick={handleAddToDashboard} disabled={added} className="ease-spring" style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 9999,
              cursor: added ? "default" : "pointer",
              background: added ? "transparent" : "var(--accent)",
              color: added ? "var(--text-muted)" : "#fff",
              border: added ? "1px solid var(--border-default)" : "none",
              boxShadow: added ? "none" : "0 6px 18px -8px rgba(37, 99, 235, 0.55), 0 1px 0 rgba(255,255,255,0.18) inset",
              opacity: added ? 0.55 : 1,
              transition: "transform 300ms cubic-bezier(0.32,0.72,0,1), background 300ms cubic-bezier(0.32,0.72,0,1)",
            }}>
              {added ? "Added" : "+ Dashboard"}
            </button>
          )}
        </div>
      </div>

      {/* Chart view */}
      {viewMode === "chart" && (
        <div style={{ height: 220, padding: 4 }}>
          <Suspense fallback={<div style={{ padding: 16, color: TOKENS.text.muted, fontSize: 11 }}>Loading chart...</div>}>
            <ResultsChart columns={parsed.columns} rows={rows} embedded defaultChartType={rowCount <= 1 ? "kpi" : "bar"} />
          </Suspense>
        </div>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <div style={{ maxHeight: 240, overflowY: "auto", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                {parsed.columns.map(col => (
                  <th
                    key={col}
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid var(--border-default)",
                      whiteSpace: "nowrap",
                      position: "sticky",
                      top: 0,
                      background: "var(--bg-base)",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid var(--overlay-faint)",
                    background: i % 2 === 1 ? "var(--overlay-faint)" : undefined,
                    transition: "background 200ms cubic-bezier(0.32,0.72,0,1)",
                  }}
                >
                  {parsed.columns.map(col => (
                    <td
                      key={col}
                      style={{
                        padding: "6px 12px",
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row[col] != null ? String(row[col]) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && (
            <div style={{
              padding: "6px 12px",
              fontSize: 10,
              color: "var(--text-muted)",
              fontStyle: "italic",
              borderTop: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              textAlign: "center",
            }}>
              Showing first 50 of {rows.length.toLocaleString()} rows
            </div>
          )}
        </div>
      )}

      {/* SQL collapsible — premium pill chrome */}
      {sql && (
        <details style={{ padding: "8px 12px", borderTop: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
          <summary style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            cursor: "pointer",
            listStyle: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            userSelect: "none",
          }}>
            <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: 9999, background: "var(--text-muted)" }} />
            View SQL
          </summary>
          <pre style={{
            fontSize: 10,
            color: "var(--accent-light)",
            marginTop: 6,
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--bg-base)",
            border: "1px solid var(--border-default)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            lineHeight: 1.5,
          }}>{sql}</pre>
        </details>
      )}
    </div>
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
  const agentChecklist = useStore((s) => s.agentChecklist);
  const agentElapsedMs = useStore((s) => s.agentElapsedMs);
  const agentEstimatedMs = useStore((s) => s.agentEstimatedMs);
  const agentVerification = useStore((s) => s.agentVerification);
  const agentLoading = useStore((s) => s.agentLoading);
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
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: "10px", padding: "24px 16px",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: TOKENS.accentGlow,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.accent} strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: TOKENS.text.primary, fontFamily: "'Outfit', system-ui, sans-serif", marginBottom: 4 }}>
            Ready to help
          </div>
          <div style={{ fontSize: "12px", color: TOKENS.text.muted, maxWidth: 220, lineHeight: 1.5 }}>
            Ask about your data, build dashboards, or explore insights
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      aria-live="polite"
      aria-label="Agent execution steps"
      style={{
        flex: 1, overflowY: "auto", padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: "12px",
      }}
    >
      {agentLoading && agentChecklist.length > 0 && (
        <ChecklistPanel checklist={agentChecklist} elapsedMs={agentElapsedMs} estimatedMs={agentEstimatedMs} />
      )}
      {steps.map((step, i) => {
        if (["phase_start", "phase_complete", "checklist_update", "verification"].includes(step.type)) return null;

        // Dedup: skip result steps that duplicate a recent live_correction or cached_result
        // Only check the last 5 steps to avoid suppressing legitimately repeated answers across turns
        if (step.type === "result" && step.content) {
          const recentStart = Math.max(0, i - 5);
          const isDuplicate = steps.slice(recentStart, i).some((prev) =>
            (prev.type === "live_correction" || prev.type === "cached_result") &&
            prev.content === step.content
          );
          if (isDuplicate) return null;
        }

        const ts = step.timestamp || step._ts || null;

        // User messages: right-aligned blue bubble
        if (step.type === 'user_query') {
          return (
            <ChatBubble key={step.tool_use_id || `${step.type}-${i}`} align="right" color={`${TOKENS.accent}18`} timestamp={ts}>
              <div style={{ fontSize: '13px', color: TOKENS.text.primary, fontWeight: 500 }}>
                {step.content}
              </div>
            </ChatBubble>
          );
        }

        // Thinking: animated while working, static checkmark once done
        if (step.type === 'thinking') {
          const isActivePulse = agentLoading && i === steps.length - 1;
          return (
            <div key={step.tool_use_id || `${step.type}-${i}`} style={{ display: 'flex' }}>
              {isActivePulse ? (
                <span className="agent-thinking">
                  <span className="agent-thinking__dots" aria-hidden="true">
                    <span /><span /><span />
                  </span>
                  {step.content || 'Analyzing'}
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.35rem 0.75rem', borderRadius: 9999,
                  fontSize: 12, color: 'var(--text-muted)',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0 }}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {step.content || 'Analyzed'}
                </span>
              )}
            </div>
          );
        }

        // Tool calls: only show run_sql with data; hide intermediate tools whose output
        // is always repeated in the agent's final result (avoids duplicate information)
        if (step.type === 'tool_call') {
          const toolName = step.tool_name || 'tool';

          // Hide tools whose output is always summarized in the agent's final result.
          // Only run_sql (with charts/data) and ask_user (interactive) are shown.
          const HIDDEN_TOOLS = new Set([
            'summarize_results', 'suggest_chart', 'find_relevant_tables', 'inspect_schema',
            'create_dashboard_tile', 'update_dashboard_tile', 'delete_dashboard_tile',
            'list_dashboards', 'get_dashboard_tiles', 'create_custom_metric',
            'create_section', 'move_tile', 'rename_section',
          ]);
          if (HIDDEN_TOOLS.has(toolName)) {
            return null; // Don't render — agent's result bubble contains this info
          }

          // run_sql with data: show collapsed with row count hint
          let rowHint = '';
          if (toolName === 'run_sql' && step.tool_result) {
            try {
              const p = typeof step.tool_result === 'string' ? JSON.parse(step.tool_result) : step.tool_result;
              if (p?.rows?.length) rowHint = ` — ${p.row_count || p.rows.length} rows`;
            } catch {}
          }

          return (
            <div key={step.tool_use_id || `${step.type}-${i}`} style={{ width: '100%' }}>
              <details style={{ width: '100%' }} open>
                <summary style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px 0 6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  listStyle: 'none',
                  userSelect: 'none',
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}>
                  <StepIcon type="tool_call" />
                  Tool call
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span className="agent-tool-tag">{toolName}</span>
                  {rowHint && (
                    <span style={{ letterSpacing: '0.04em', textTransform: 'none', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {rowHint}
                    </span>
                  )}
                </summary>
                <div style={{ marginTop: 0 }}>
                  <RunSqlStepRenderer step={step} />
                </div>
              </details>
            </div>
          );
        }

        // All other step types: left-aligned bubble wrapping existing renderer
        return (
          <ChatBubble key={step.tool_use_id || `${step.type}-${i}`} align="left" color={TOKENS.bg.surface} timestamp={ts}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <StepIcon type={step.type} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {step.type === "result" && (
                  <div className="agent-result-md" style={{ fontSize: "13px", color: TOKENS.text.primary, maxHeight: "400px", overflowY: "auto", wordBreak: "break-word" }}>
                    <ReactMarkdown components={{
                      h1: ({children}) => <div style={{ fontSize: 15, fontWeight: 700, color: TOKENS.text.primary, marginTop: 8, marginBottom: 4 }}>{children}</div>,
                      h2: ({children}) => <div style={{ fontSize: 14, fontWeight: 600, color: TOKENS.text.primary, marginTop: 6, marginBottom: 3 }}>{children}</div>,
                      h3: ({children}) => <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text.secondary, marginTop: 4, marginBottom: 2 }}>{children}</div>,
                      p: ({children}) => <div style={{ marginBottom: 4, lineHeight: 1.5 }}>{children}</div>,
                      strong: ({children}) => <span style={{ fontWeight: 600, color: TOKENS.text.primary }}>{children}</span>,
                      ul: ({children}) => <ul style={{ paddingLeft: 16, margin: "4px 0" }}>{children}</ul>,
                      ol: ({children}) => <ol style={{ paddingLeft: 16, margin: "4px 0" }}>{children}</ol>,
                      li: ({children}) => <li style={{ marginBottom: 2, fontSize: 12 }}>{children}</li>,
                      code: ({children}) => <span style={{ fontSize: 11, background: TOKENS.bg.base, padding: "1px 4px", borderRadius: 3, color: TOKENS.accentLight }}>{children}</span>,
                    }}>{step.content || ""}</ReactMarkdown>
                  </div>
                )}

                {step.type === "result" && agentVerification && (
                  <VerificationBadge verification={agentVerification} />
                )}

                {step.type === "tier_routing" && (() => {
                  const isActivePulse = agentLoading && i === steps.length - 1;
                  return (
                    <span className="agent-status-pill agent-status-pill--routing">
                      {isActivePulse ? (
                        <span className="agent-thinking__dots" aria-hidden="true">
                          <span /><span /><span />
                        </span>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.6 }}>
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                      {step.content || "Checked tiers"}
                    </span>
                  );
                })()}

                {step.type === "plan" && (
                  <div className="agent-plan-card" style={{
                    fontSize: "12px",
                    padding: "12px 14px",
                    borderRadius: 12,
                  }}>
                    <div className="agent-step__label" style={{ marginBottom: 8 }}>
                      <span className="eyebrow-dot" aria-hidden="true" />
                      Plan
                      {Array.isArray(step.tool_input) && (
                        <>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span style={{ letterSpacing: '0.04em', textTransform: 'none', fontWeight: 500 }}>
                            {step.tool_input.length} step{step.tool_input.length !== 1 ? "s" : ""}
                          </span>
                        </>
                      )}
                    </div>
                    {step.content && (
                      <div style={{
                        color: 'var(--text-secondary)',
                        marginBottom: 10,
                        fontSize: 12,
                        lineHeight: 1.55,
                      }}>
                        {step.content}
                      </div>
                    )}
                    {step.tool_input && Array.isArray(step.tool_input) && (
                      <ol style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        margin: 0,
                        padding: 0,
                        listStyle: "none",
                      }}>
                        {step.tool_input.map((task, j) => (
                          <li key={j} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 9,
                            fontSize: 11.5,
                            padding: "3px 0",
                          }}>
                            <span style={{
                              flexShrink: 0,
                              width: 18,
                              height: 18,
                              borderRadius: 9999,
                              background: 'var(--accent-glow)',
                              border: '1px solid rgba(37, 99, 235, 0.25)',
                              color: 'var(--accent)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 9,
                              fontWeight: 700,
                              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {String(j + 1).padStart(2, '0')}
                            </span>
                            <span style={{ color: 'var(--text-primary)', flex: 1, lineHeight: 1.45 }}>
                              {task.title || task}
                            </span>
                            {task.chart_type && (
                              <span className="agent-tool-tag" style={{ flexShrink: 0 }}>
                                {task.chart_type}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                {step.type === "budget_extension" && (
                  <div style={{
                    fontSize: "11px", color: TOKENS.warning, fontStyle: "italic",
                    padding: "3px 8px", borderRadius: TOKENS.radius.sm,
                    background: "rgba(245, 158, 11, 0.06)",
                  }}>
                    {step.content || "Tool budget extended"}
                  </div>
                )}

                {step.type === "progress" && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <div style={{ marginBottom: 6, fontStyle: 'italic' }}>{step.content || "Processing"}</div>
                    {/* Decomposition sub-query progress */}
                    {step.total_sub_queries > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="agent-progress agent-progress--success">
                          <div
                            className="agent-progress__fill"
                            style={{
                              transform: `scaleX(${Math.min(1, ((step.sub_query_index || 0) + 1) / step.total_sub_queries)})`,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                          {(step.sub_query_index || 0) + 1}/{step.total_sub_queries}
                        </span>
                      </div>
                    ) : step.estimated_total_ms > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="agent-progress">
                          <div
                            className="agent-progress__fill"
                            style={{
                              transform: `scaleX(${Math.min(1, (step.elapsed_ms || 0) / step.estimated_total_ms)})`,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                          {Math.round((step.elapsed_ms || 0) / 1000)}s / ~{Math.round(step.estimated_total_ms / 1000)}s
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}

                {step.type === "tier_hit" && (
                  <span className="agent-status-pill agent-status-pill--hit">
                    {step.tier === "schema" && (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7" /></svg>
                        Answered from schema cache
                      </>
                    )}
                    {step.tier === "memory" && (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity="0.3"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        Answered from team knowledge
                      </>
                    )}
                    {step.tier === "turbo" && (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        Answered from Turbo Mode
                      </>
                    )}
                    {step.tier === "live" && (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                        Querying live database
                      </>
                    )}
                    {step.cache_age_seconds > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
                        ({step.cache_age_seconds < 60 ? `${step.cache_age_seconds}s ago` :
                          step.cache_age_seconds < 3600 ? `${Math.round(step.cache_age_seconds / 60)}m ago` :
                          `${Math.round(step.cache_age_seconds / 3600)}h ago`})
                      </span>
                    )}
                  </span>
                )}

                {step.type === "cached_result" && (
                  <div style={{
                    fontSize: "13px", color: TOKENS.text.primary,
                    padding: "10px 14px", borderRadius: TOKENS.radius.sm,
                    background: "rgba(6, 182, 212, 0.06)",
                    border: "1px solid rgba(6, 182, 212, 0.35)",
                  }}>
                    <div style={{ fontSize: "11px", color: TOKENS.info, fontWeight: 600, marginBottom: "6px",
                      display: "flex", alignItems: "center", gap: "6px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                      </svg>
                      Instant answer
                      {step.cache_age_seconds != null && (() => {
                        const age = step.cache_age_seconds;
                        const color = age < 60 ? TOKENS.success : age < 300 ? TOKENS.warning : TOKENS.danger;
                        const label = age < 60 ? `Fresh (${Math.round(age)}s ago)` : age < 300 ? `Cached (${Math.round(age / 60)}m ago)` : `Stale (${Math.round(age / 60)}m ago)`;
                        return (
                          <span style={{ fontWeight: 500, color, fontSize: "10px",
                            padding: "1px 6px", borderRadius: "8px",
                            background: color === TOKENS.success ? "rgba(34,197,94,0.1)" : color === TOKENS.warning ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)" }}>
                            {label}
                          </span>
                        );
                      })()}
                    </div>
                    <div style={{ wordBreak: "break-word" }}>{step.content}</div>
                    <div style={{ fontSize: "10px", color: TOKENS.text.muted, marginTop: "6px",
                      display: "flex", alignItems: "center", gap: "4px" }}>
                      {agentLoading ? (
                        <>
                          <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%",
                            background: TOKENS.info, display: "inline-block" }}/>
                          Verifying with live data…
                        </>
                      ) : (
                        <>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={TOKENS.success} strokeWidth="2.5">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          Verified
                        </>
                      )}
                    </div>
                  </div>
                )}

                {step.type === "live_correction" && (
                  <div style={{
                    fontSize: "13px", color: TOKENS.text.primary,
                    padding: "10px 14px", borderRadius: TOKENS.radius.sm,
                    background: step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed")
                      ? "rgba(34, 197, 94, 0.06)" : "rgba(245, 158, 11, 0.06)",
                    border: `1px solid ${step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed")
                      ? "rgba(34, 197, 94, 0.35)" : "rgba(245, 158, 11, 0.35)"}`,
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "4px",
                      color: step.diff_summary && step.diff_summary.toLowerCase().startsWith("confirmed")
                        ? TOKENS.success : TOKENS.warning,
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
                      <div style={{ wordBreak: "break-word", fontSize: 12 }}>
                        <ReactMarkdown components={{
                          p: ({children}) => <div style={{ marginBottom: 3, lineHeight: 1.4 }}>{children}</div>,
                          strong: ({children}) => <span style={{ fontWeight: 600, color: TOKENS.text.primary }}>{children}</span>,
                          ul: ({children}) => <ul style={{ paddingLeft: 14, margin: "3px 0" }}>{children}</ul>,
                          li: ({children}) => <li style={{ marginBottom: 2 }}>{children}</li>,
                        }}>{step.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}

                {step.type === "error" && (
                  <span style={{ fontSize: "12px", color: TOKENS.danger }}>
                    {step.content}
                  </span>
                )}

                {!["user_query","thinking","tool_call","result","tier_routing","progress","tier_hit",
                   "error","cached_result","live_correction","ask_user","plan","budget_extension"].includes(step.type) && (
                  <div style={{ fontSize: "11px", color: TOKENS.text.muted, fontStyle: "italic", padding: "2px 8px" }}>
                    Processing...
                  </div>
                )}
              </div>
            </div>
          </ChatBubble>
        );
      })}

      {waiting && (
        <AgentQuestion question={waiting} options={waitingOptions} chatId={chatId} />
      )}
    </div>
  );
}

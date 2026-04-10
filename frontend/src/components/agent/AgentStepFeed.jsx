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
        <div style={{ height: '100%', borderRadius: 2, background: '#22c55e', width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
      {checklist.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13 }}>
          {item.status === 'done' && <span style={{ color: '#22c55e', fontSize: 14 }}>&#10003;</span>}
          {item.status === 'active' && <span className="animate-pulse" style={{ color: '#f59e0b', fontSize: 10 }}>&#9679;</span>}
          {item.status === 'pending' && <span style={{ color: 'var(--overlay-medium)', fontSize: 10 }}>&#9675;</span>}
          <span style={{
            color: item.status === 'done' ? TOKENS.text.muted :
                   item.status === 'active' ? '#f59e0b' : TOKENS.text.muted,
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
  const colors = { HIGH: '#22c55e', MEDIUM: '#f59e0b', LOW: '#ef4444' };
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
  if (type === "plan") {
    return (
      <span style={{ display: "inline-block", width: 16, height: 16, color: "#a78bfa" }}>
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
      <span style={{ display: "inline-block", width: 16, height: 16, color: "#f59e0b" }}>
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
      <div style={{
        maxWidth: compact ? '85%' : '92%',
        padding: compact ? '4px 10px' : '8px 12px',
        borderRadius: '12px',
        borderTopRightRadius: isUser ? '4px' : '12px',
        borderTopLeftRadius: isUser ? '12px' : '4px',
        background: 'var(--glass-bg-card)',
        border: `1px solid ${isUser ? TOKENS.accent + '30' : 'var(--glass-border)'}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        wordBreak: 'break-word',
      }}>
        {children}
      </div>
      {timestamp && (
        <span style={{
          fontSize: '9px', color: TOKENS.text.muted,
          marginTop: '2px', padding: '0 4px',
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
    } catch (e) { console.error("Add to dashboard failed:", e); }
  };

  const btnStyle = (active) => ({
    fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
    border: `1px solid ${active ? TOKENS.accent + '60' : TOKENS.border.default}`,
    background: active ? TOKENS.accentGlow : "transparent",
    color: active ? TOKENS.accentLight : TOKENS.text.muted,
  });

  return (
    <div style={{ background: TOKENS.bg.base, borderRadius: 8, overflow: "hidden", border: `1px solid ${TOKENS.border.default}` }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderBottom: `1px solid ${TOKENS.border.default}` }}>
        <span style={{ fontSize: 11, color: TOKENS.text.secondary }}>
          {rowCount} row{rowCount !== 1 ? "s" : ""} · {parsed.columns.length} col{parsed.columns.length !== 1 ? "s" : ""}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setViewMode("chart")} style={btnStyle(viewMode === "chart")}>Chart</button>
          <button onClick={() => setViewMode("table")} style={btnStyle(viewMode === "table")}>Table</button>
          <button onClick={() => setViewMode(v => v === "hidden" ? "chart" : "hidden")} style={btnStyle(false)}>
            {viewMode === "hidden" ? "Show" : "Hide"}
          </button>
          {activeDashboardId && (
            <button onClick={handleAddToDashboard} disabled={added} style={{
              ...btnStyle(false),
              background: added ? "transparent" : TOKENS.accentGlow,
              color: added ? TOKENS.text.muted : TOKENS.accentLight,
              border: `1px solid ${added ? TOKENS.border.default : TOKENS.accent + '60'}`,
              fontWeight: 600, opacity: added ? 0.5 : 1,
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
        <div style={{ maxHeight: 220, overflowY: "auto", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                {parsed.columns.map(col => (
                  <th key={col} style={{ padding: "4px 8px", textAlign: "left", color: TOKENS.text.secondary, fontWeight: 600, borderBottom: `1px solid ${TOKENS.border.default}`, whiteSpace: "nowrap", position: "sticky", top: 0, background: TOKENS.bg.base }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${TOKENS.border.default}10` }}>
                  {parsed.columns.map(col => (
                    <td key={col} style={{ padding: "3px 8px", color: TOKENS.text.primary, whiteSpace: "nowrap" }}>{row[col] != null ? String(row[col]) : ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SQL collapsible */}
      {sql && (
        <details style={{ padding: "4px 10px 6px", borderTop: `1px solid ${TOKENS.border.default}` }}>
          <summary style={{ fontSize: 9, color: TOKENS.text.muted, cursor: "pointer" }}>SQL</summary>
          <pre style={{ fontSize: 9, color: TOKENS.accentLight, marginTop: 2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{sql}</pre>
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
        display: "flex", flexDirection: "column", gap: "10px",
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

        // Thinking: compact left bubble
        if (step.type === 'thinking') {
          return (
            <ChatBubble key={step.tool_use_id || `${step.type}-${i}`} align="left" color={TOKENS.bg.base} timestamp={null} compact>
              <span style={{ fontSize: '12px', color: TOKENS.text.muted, fontStyle: 'italic' }}>
                {step.content || 'Analyzing...'}
                <span className="animate-pulse"> ...</span>
              </span>
            </ChatBubble>
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
              <details style={{ width: '100%' }}>
                <summary style={{
                  fontSize: 11, color: TOKENS.text.muted, cursor: 'pointer',
                  padding: '3px 8px', borderRadius: TOKENS.radius.sm,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  listStyle: 'none', userSelect: 'none',
                }}>
                  <StepIcon type="tool_call" />
                  <span>Used: <strong style={{ color: TOKENS.text.secondary }}>{toolName}</strong>{rowHint}</span>
                </summary>
                <div style={{ marginTop: 4 }}>
                  <ChatBubble align="left" color={TOKENS.bg.base} timestamp={ts} compact>
                    <RunSqlStepRenderer step={step} />
                  </ChatBubble>
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

                {step.type === "plan" && (
                  <div style={{
                    fontSize: "12px", padding: "8px 10px", borderRadius: TOKENS.radius.sm,
                    background: "rgba(167, 139, 250, 0.08)", border: "1px solid rgba(167, 139, 250, 0.2)",
                  }}>
                    <div style={{ color: "#a78bfa", fontWeight: 600, marginBottom: "4px" }}>
                      Execution Plan
                    </div>
                    <div style={{ color: TOKENS.text.secondary, marginBottom: "6px" }}>
                      {step.content}
                    </div>
                    {step.tool_input && Array.isArray(step.tool_input) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {step.tool_input.map((task, j) => (
                          <div key={j} style={{
                            display: "flex", alignItems: "center", gap: "6px",
                            fontSize: "11px", padding: "2px 0",
                          }}>
                            <span style={{ color: TOKENS.text.muted, flexShrink: 0 }}>
                              {j + 1}.
                            </span>
                            <span style={{ color: TOKENS.text.primary }}>
                              {task.title || task}
                            </span>
                            {task.chart_type && (
                              <span style={{
                                fontSize: "9px", color: TOKENS.text.muted, padding: "1px 4px",
                                borderRadius: "3px", background: TOKENS.bg.base,
                              }}>
                                {task.chart_type}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {step.type === "budget_extension" && (
                  <div style={{
                    fontSize: "11px", color: "#f59e0b", fontStyle: "italic",
                    padding: "3px 8px", borderRadius: TOKENS.radius.sm,
                    background: "rgba(245, 158, 11, 0.06)",
                  }}>
                    {step.content || "Tool budget extended"}
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

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useStore } from "../../store";
import { api } from "../../api";
import { TOKENS } from "../dashboard/tokens";
import AgentStepFeed from "./AgentStepFeed";

const DOCK_POSITIONS = ["float", "right", "bottom", "left"];
const MIN_W = 280;
const MIN_H = 200;
const MAX_W_RATIO = 0.6;
const MAX_H_RATIO = 0.7;
const DEFAULT_W = 380;
const DEFAULT_H = 500;
const APP_SIDEBAR_W = 56;

// ── localStorage with schema migration ──
function loadPanelState() {
  try {
    const raw = JSON.parse(localStorage.getItem("qc_agent_panel") || "null");
    if (!raw || typeof raw !== "object") return null;
    // Migrate old schema: {size: {w, h}} → {width, height}
    if (raw.size && typeof raw.size === "object") {
      raw.width = raw.size.w;
      raw.height = raw.size.h;
      delete raw.size;
    }
    return raw;
  } catch { return null; }
}

let _saveTimer = null;
function savePanelState(state) {
  // Debounce: 300ms — avoids 60Hz localStorage writes during resize
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { localStorage.setItem("qc_agent_panel", JSON.stringify(state)); } catch { /* quota exceeded / private mode */ }
  }, 300);
}

// ── Validation helpers ──
function clampWidth(w) {
  const n = Number(w);
  if (!Number.isFinite(n)) return DEFAULT_W;
  return Math.max(MIN_W, Math.min(window.innerWidth * MAX_W_RATIO, n));
}
function clampHeight(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return DEFAULT_H;
  return Math.max(MIN_H, Math.min(window.innerHeight * MAX_H_RATIO, n));
}
function clampPos(pos) {
  if (!pos || typeof pos !== "object") return { x: 60, y: 60 };
  const x = Number(pos.x), y = Number(pos.y);
  return {
    x: Number.isFinite(x) ? Math.max(0, Math.min(x, window.innerWidth - MIN_W)) : 60,
    y: Number.isFinite(y) ? Math.max(0, Math.min(y, window.innerHeight - 42)) : 60,
  };
}
function validDock(d) {
  return DOCK_POSITIONS.includes(d) ? d : "float";
}

export default function AgentPanel({ connId, onClose, defaultDock = "float" }) {
  // Read localStorage once on mount via lazy initializer
  const [saved] = useState(() => loadPanelState());

  // Shared dock/size via store so DashboardBuilder can react
  const dock = useStore((s) => s.agentDock);
  const setDock = useStore((s) => s.setAgentDock);
  const panelWidth = useStore((s) => s.agentPanelWidth);
  const setPanelWidth = useStore((s) => s.setAgentPanelWidth);
  const panelHeight = useStore((s) => s.agentPanelHeight);
  const setPanelHeight = useStore((s) => s.setAgentPanelHeight);
  const setAgentPanelOpen = useStore((s) => s.setAgentPanelOpen);
  const setAgentResizing = useStore((s) => s.setAgentResizing);

  // Local-only state
  const [pos, setPos] = useState(() => clampPos(saved?.pos));
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [dragging, setDragging] = useState(false);
  const [edgeResizing, setEdgeResizing] = useState(null);
  const [floatResizing, setFloatResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ mousePos: 0, dim: 0 });
  const panelRef = useRef(null);
  const streamRef = useRef(null); // SSE abort handle

  const agentLoading = useStore((s) => s.agentLoading);
  const setAgentLoading = useStore((s) => s.setAgentLoading);
  const agentSteps = useStore((s) => s.agentSteps);
  const addAgentStep = useStore((s) => s.addAgentStep);
  const clearAgent = useStore((s) => s.clearAgent);
  const setAgentWaiting = useStore((s) => s.setAgentWaiting);
  const agentWaiting = useStore((s) => s.agentWaiting);
  const setAgentChatId = useStore((s) => s.setAgentChatId);
  const agentChatId = useStore((s) => s.agentChatId);
  // Double-submit protected by: agentLoading guard + setInput("") clearing input
  const saveAgentHistory = useStore((s) => s.saveAgentHistory);
  const loadAgentHistory = useStore((s) => s.loadAgentHistory);
  const getAgentHistoryList = useStore((s) => s.getAgentHistoryList);
  const deleteAgentHistory = useStore((s) => s.deleteAgentHistory);
  const agentPersona = useStore((s) => s.agentPersona);
  const agentPermissionMode = useStore((s) => s.agentPermissionMode);

  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [inputFocused, setInputFocused] = useState(false);

  // Initialize dock from saved/default on mount + load history + abort SSE on unmount
  useEffect(() => {
    const initial = validDock(saved?.dock || defaultDock);
    setDock(initial);
    if (saved?.width != null) setPanelWidth(clampWidth(saved.width));
    if (saved?.height != null) setPanelHeight(clampHeight(saved.height));

    // Load previous conversation if we have a chatId
    if (agentChatId) {
      loadAgentHistory(agentChatId);
    }

    return () => {
      // Abort any in-flight SSE stream on unmount
      if (streamRef.current?.close) {
        streamRef.current.close();
        streamRef.current = null;
      }
      setAgentLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save agent history whenever a run completes (loading transitions to false with steps present)
  const prevLoadingRef = useRef(agentLoading);
  useEffect(() => {
    if (prevLoadingRef.current && !agentLoading && agentSteps.length > 0) {
      saveAgentHistory();
    }
    prevLoadingRef.current = agentLoading;
  }, [agentLoading, agentSteps.length, saveAgentHistory]);

  // Refresh history list when panel toggles to history view (now async — server-side)
  useEffect(() => {
    if (showHistory) {
      (async () => {
        const list = await getAgentHistoryList();
        setHistoryList(list);
      })();
    }
  }, [showHistory, getAgentHistoryList]);

  // Debounced persist to localStorage
  useEffect(() => {
    savePanelState({ dock, pos, width: panelWidth, height: panelHeight });
  }, [dock, pos, panelWidth, panelHeight]);

  // Reactive viewport clamp — re-clamp on window resize
  useEffect(() => {
    const onResize = () => {
      setPanelWidth((prev) => clampWidth(prev));
      setPanelHeight((prev) => clampHeight(prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setPanelWidth, setPanelHeight]);

  // Dock transition guard — reset minimized, clamp float pos on dock change
  const prevDockRef = useRef(dock);
  useEffect(() => {
    if (prevDockRef.current !== dock) {
      setMinimized(false); // Always un-minimize on dock change
      if (dock === "float") {
        // Clamp float position to viewport
        setPos((p) => clampPos(p));
      }
      prevDockRef.current = dock;
    }
  }, [dock]);

  // ── Float drag handlers ──
  const onDragStart = useCallback((e) => {
    if (dock !== "float") return;
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  }, [dock]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      setPos({
        x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - MIN_W)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - 42)),
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // ── Edge resize for docked modes (throttled via rAF) ──
  const onEdgeResizeStart = useCallback((edge, e) => {
    e.preventDefault();
    e.stopPropagation();
    const isHorizontal = edge === "top";
    resizeStart.current = {
      mousePos: isHorizontal ? e.clientY : e.clientX,
      dim: isHorizontal ? panelHeight : panelWidth,
    };
    setEdgeResizing(edge);
  }, [panelWidth, panelHeight]);

  useEffect(() => {
    if (!edgeResizing) return;
    let rafId = null;
    const onMove = (e) => {
      if (rafId) return; // Skip until previous frame completes
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const { mousePos, dim } = resizeStart.current;
        if (edgeResizing === "left" || edgeResizing === "right") {
          const delta = edgeResizing === "left" ? mousePos - e.clientX : e.clientX - mousePos;
          setPanelWidth(Math.max(MIN_W, Math.min(window.innerWidth * MAX_W_RATIO, dim + delta)));
        } else if (edgeResizing === "top") {
          const delta = mousePos - e.clientY;
          setPanelHeight(Math.max(MIN_H, Math.min(window.innerHeight * MAX_H_RATIO, dim + delta)));
        }
      });
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setEdgeResizing(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [edgeResizing, setPanelWidth, setPanelHeight]);

  // ── Float corner resize (throttled via rAF, with upper bounds) ──
  useEffect(() => {
    if (!floatResizing) return;
    let rafId = null;
    const onMove = (e) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return;
        setPanelWidth(Math.max(MIN_W, Math.min(window.innerWidth * MAX_W_RATIO, e.clientX - rect.left)));
        setPanelHeight(Math.max(MIN_H, Math.min(window.innerHeight * MAX_H_RATIO, e.clientY - rect.top)));
      });
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setFloatResizing(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [floatResizing, setPanelWidth, setPanelHeight]);

  // ── Submit question to agent ──
  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    const q = input.trim();
    // Guard: block if empty, already loading, or waiting for user response
    if (!q || agentLoading || agentWaiting) return;
    setInput("");
    // Save current conversation before starting new one
    if (agentSteps.length > 0) saveAgentHistory();
    clearAgent();
    setAgentLoading(true);
    setShowHistory(false);

    // Add user question as first step so it shows in history
    addAgentStep({ type: "user_query", content: q });

    // Abort previous stream if any
    if (streamRef.current?.close) streamRef.current.close();

    // Always start a fresh session — clearAgent() above set agentChatId to null,
    // but the closure captured the OLD value. Use null explicitly.
    const chatIdForRun = null;

    const stream = api.agentRun(q, connId, chatIdForRun, (step) => {
      if (step.chat_id) setAgentChatId(step.chat_id);

      if (step.type === "ask_user") {
        setAgentWaiting(step.content, step.tool_input || step.options);
      } else if (step.type === "error") {
        addAgentStep(step);
        useStore.getState().clearAgentWaiting();
        setAgentLoading(false);
      } else if (step.final_answer || step.type === "result") {
        // ONLY treat as final result when explicitly marked — NOT for any step with sql field.
        // Tool calls with sql (create_dashboard_tile, etc.) must flow to the else branch
        // so HIDDEN_TOOLS in AgentStepFeed can filter them properly.
        addAgentStep({ type: "result", content: step.final_answer || step.content, sql: step.sql });
        setAgentLoading(false);
        // Reload dashboard after agent finishes (covers all tile modifications)
        const dashId = useStore.getState().activeDashboardId;
        if (dashId) api.getDashboard(dashId).then(fresh => {
          if (fresh) window.dispatchEvent(new CustomEvent('dashboard-reload', { detail: { dashboard: fresh } }));
        }).catch(() => {});
      } else {
        addAgentStep(step);
      }
    }, { persona: agentPersona, permissionMode: agentPermissionMode });
    streamRef.current = stream;
  }, [input, connId, agentChatId, agentLoading, agentWaiting, agentSteps, clearAgent, setAgentLoading, addAgentStep, setAgentWaiting, setAgentChatId, saveAgentHistory, agentPersona, agentPermissionMode]);

  // ── Quick action — same as handleSubmit but accepts text directly ──
  const handleQuickAction = useCallback((text) => {
    if (!text || agentLoading || agentWaiting) return;
    // Save current conversation before starting new one
    if (agentSteps.length > 0) saveAgentHistory();
    clearAgent();
    setAgentLoading(true);
    setShowHistory(false);
    setInput("");

    addAgentStep({ type: "user_query", content: text });

    if (streamRef.current?.close) streamRef.current.close();

    const chatIdForRun = null;

    const stream = api.agentRun(text, connId, chatIdForRun, (step) => {
      if (step.chat_id) setAgentChatId(step.chat_id);

      if (step.type === "ask_user") {
        setAgentWaiting(step.content, step.tool_input || step.options);
      } else if (step.type === "error") {
        addAgentStep(step);
        useStore.getState().clearAgentWaiting();
        setAgentLoading(false);
      } else if (step.final_answer || step.type === "result") {
        addAgentStep({ type: "result", content: step.final_answer || step.content, sql: step.sql });
        setAgentLoading(false);
        const dashId = useStore.getState().activeDashboardId;
        if (dashId) api.getDashboard(dashId).then(fresh => {
          if (fresh) window.dispatchEvent(new CustomEvent('dashboard-reload', { detail: { dashboard: fresh } }));
        }).catch(() => {});
      } else {
        addAgentStep(step);
      }
    }, { persona: agentPersona, permissionMode: agentPermissionMode });
    streamRef.current = stream;
  }, [connId, agentChatId, agentLoading, agentWaiting, agentSteps, clearAgent, setAgentLoading, addAgentStep, setAgentWaiting, setAgentChatId, saveAgentHistory, agentPersona, agentPermissionMode]);

  // Close handler — save history + abort stream + clear waiting + toggle panel off
  const handleClose = useCallback(() => {
    if (agentSteps.length > 0) saveAgentHistory();
    if (streamRef.current?.close) streamRef.current.close();
    // Clear waiting state to prevent orphaned backend polling
    if (agentWaiting) useStore.getState().clearAgentWaiting();
    if (onClose) {
      onClose();
    } else {
      setAgentPanelOpen(false);
    }
  }, [onClose, setAgentPanelOpen, agentSteps, agentWaiting, saveAgentHistory]);

  const isActive = dragging || edgeResizing || floatResizing;

  // Sync resize state to store so DashboardBuilder can disable transitions
  useEffect(() => {
    setAgentResizing(!!isActive);
    return () => setAgentResizing(false);
  }, [isActive, setAgentResizing]);

  // ── Panel positioning styles (memoized) ──
  const panelStyle = useMemo(() => {
    const base = {
      display: "flex",
      flexDirection: "column",
      background: TOKENS.bg.elevated,
      overflow: "hidden",
      transition: isActive ? "none" : "width 0.2s ease, height 0.2s ease",
    };

    const validatedDock = DOCK_POSITIONS.includes(dock) ? dock : "float";

    if (validatedDock === "float") {
      return {
        ...base,
        position: "fixed",
        zIndex: 9998,
        left: pos.x,
        top: pos.y,
        width: panelWidth,
        height: minimized ? 42 : panelHeight,
        borderRadius: TOKENS.radius.lg,
        border: `1px solid ${TOKENS.border.default}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      };
    }
    if (validatedDock === "right") {
      return {
        ...base,
        position: "fixed",
        right: 0,
        top: 0,
        width: panelWidth,
        height: "100vh",
        zIndex: 50,
        borderLeft: `1px solid ${TOKENS.border.default}`,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
      };
    }
    if (validatedDock === "left") {
      return {
        ...base,
        position: "fixed",
        left: APP_SIDEBAR_W,
        top: 0,
        width: panelWidth,
        height: "100vh",
        zIndex: 50,
        borderRight: `1px solid ${TOKENS.border.default}`,
        boxShadow: "4px 0 24px rgba(0,0,0,0.3)",
      };
    }
    // bottom
    return {
      ...base,
      position: "fixed",
      left: APP_SIDEBAR_W,
      bottom: 0,
      width: `calc(100vw - ${APP_SIDEBAR_W}px)`,
      height: minimized ? 42 : panelHeight,
      zIndex: 50,
      borderTop: `1px solid ${TOKENS.border.default}`,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
    };
  }, [dock, pos.x, pos.y, panelWidth, panelHeight, minimized, isActive]);

  // Edge resize handle component
  const edgeHandle = (edge) => {
    const isTop = edge === "top";
    const isLeft = edge === "left";
    const style = {
      position: "absolute",
      zIndex: 60,
      ...(isTop && { top: -3, left: 0, right: 0, height: 6, cursor: "ns-resize" }),
      ...(isLeft && { left: -3, top: 0, bottom: 0, width: 6, cursor: "ew-resize" }),
      ...(!isTop && !isLeft && { right: -3, top: 0, bottom: 0, width: 6, cursor: "ew-resize" }),
    };
    return (
      <div
        style={style}
        onMouseDown={(e) => onEdgeResizeStart(edge, e)}
      />
    );
  };

  return (
    <div ref={panelRef} style={panelStyle} role="dialog" aria-label="Agent panel"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) handleClose();
      }}>
      {/* Edge resize handles for docked modes */}
      {dock === "right" && edgeHandle("left")}
      {dock === "left" && edgeHandle("right")}
      {dock === "bottom" && !minimized && edgeHandle("top")}

      {/* Header */}
      <div
        onMouseDown={onDragStart}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "6px 10px", background: TOKENS.bg.surface,
          borderBottom: `1px solid ${TOKENS.border.default}`,
          cursor: dock === "float" ? "grab" : "default",
          userSelect: "none", flexShrink: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOKENS.accent} strokeWidth="2">
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        <span style={{ fontSize: "12px", fontWeight: 600, color: TOKENS.text.primary }}>
          Agent
        </span>

        {/* Spacer pushes controls right */}
        <span style={{ flex: 1 }} />

        {/* Primary controls — always visible */}
        <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
          {/* History toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            title={showHistory ? "Back to chat" : "Chat history"}
            aria-pressed={showHistory}
            style={{
              width: 24, height: 24, borderRadius: "4px",
              border: showHistory ? `1px solid ${TOKENS.accent}` : `1px solid ${TOKENS.border.default}`,
              background: showHistory ? TOKENS.accentGlow : "transparent",
              color: showHistory ? TOKENS.accent : TOKENS.text.muted,
              fontSize: "10px", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* Persona selector */}
          <select
            value={agentPersona || ""}
            onChange={(e) => useStore.getState().setAgentPersona(e.target.value || null)}
            title="Analyst persona"
            aria-label="Analyst persona"
            style={{
              height: 24, borderRadius: "4px", fontSize: "9px", maxWidth: "62px",
              border: `1px solid ${agentPersona ? TOKENS.accent : TOKENS.border.default}`,
              background: agentPersona ? TOKENS.accentGlow : "transparent",
              color: agentPersona ? TOKENS.accent : TOKENS.text.muted,
              cursor: "pointer", padding: "0 2px", outline: "none",
            }}
          >
            <option value="" style={{ background: "var(--bg-elevated)" }}>Mode</option>
            <option value="explorer" style={{ background: "var(--bg-elevated)" }}>Explorer</option>
            <option value="auditor" style={{ background: "var(--bg-elevated)" }}>Auditor</option>
            <option value="storyteller" style={{ background: "var(--bg-elevated)" }}>Storyteller</option>
          </select>

          {/* Permission mode toggle */}
          <button
            onClick={() => useStore.getState().setAgentPermissionMode(agentPermissionMode === "supervised" ? "autonomous" : "supervised")}
            title={agentPermissionMode === "supervised" ? "Supervised mode — asks before dashboard changes" : "Autonomous mode — creates freely, still asks before modify/delete"}
            aria-label={`Permission: ${agentPermissionMode}`}
            style={{
              height: 24, borderRadius: "4px", fontSize: "9px", padding: "0 4px",
              border: `1px solid ${agentPermissionMode === "autonomous" ? "#f59e0b" : TOKENS.border.default}`,
              background: agentPermissionMode === "autonomous" ? "rgba(245,158,11,0.1)" : "transparent",
              color: agentPermissionMode === "autonomous" ? "#f59e0b" : TOKENS.text.muted,
              cursor: "pointer", display: "flex", alignItems: "center", gap: "2px",
            }}
          >
            {agentPermissionMode === "supervised" ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 019.9-1" /></svg>
            )}
            {agentPermissionMode === "supervised" ? "Safe" : "Auto"}
          </button>

          {/* New conversation */}
          <button
            onClick={() => {
              if (streamRef.current?.close) streamRef.current.close();
              if (agentSteps.length > 0) saveAgentHistory();
              clearAgent();
              setShowHistory(false);
            }}
            title="New conversation"
            aria-label="New conversation"
            style={{
              width: 24, height: 24, borderRadius: "4px",
              border: `1px solid ${TOKENS.border.default}`,
              background: "transparent", color: TOKENS.text.muted,
              fontSize: "13px", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
          >
            +
          </button>
        </div>

        {/* Secondary controls — dock, minimize, close */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0, marginLeft: "3px" }}>
          {/* Dock buttons */}
          {DOCK_POSITIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDock(validDock(d))}
              title={`Dock ${d}`}
              aria-pressed={dock === d}
              aria-label={`Dock ${d}`}
              style={{
                width: 20, height: 20, borderRadius: "3px",
                border: dock === d ? `1px solid ${TOKENS.accent}` : `1px solid ${TOKENS.border.default}`,
                background: dock === d ? TOKENS.accentGlow : "transparent",
                color: dock === d ? TOKENS.accent : TOKENS.text.muted,
                fontSize: "8px", cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
              }}
            >
              {d[0].toUpperCase()}
            </button>
          ))}

          {/* Minimize (float and bottom only) */}
          {(dock === "float" || dock === "bottom") && (
            <button
              onClick={() => setMinimized(!minimized)}
              aria-expanded={!minimized}
              aria-label={minimized ? "Expand panel" : "Minimize panel"}
              style={{
                width: 20, height: 20, borderRadius: "3px",
                border: `1px solid ${TOKENS.border.default}`,
                background: "transparent", color: TOKENS.text.muted,
                fontSize: "13px", cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
              }}
            >
              {minimized ? "+" : "\u2013"}
            </button>
          )}

          {/* Cancel */}
          {agentLoading && agentChatId && (
            <button
              onClick={async () => {
                try {
                  await api.agentCancel(agentChatId);
                } catch (e) { /* ignore - best effort */ }
                if (streamRef.current?.close) streamRef.current.close();
                setAgentLoading(false);
                useStore.getState().clearAgentWaiting();
              }}
              style={{
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                marginRight: 8,
              }}
            >
              Cancel
            </button>
          )}

          {/* Close */}
          <button
            onClick={handleClose}
            aria-label="Close agent panel"
            style={{
              width: 20, height: 20, borderRadius: "3px",
              border: `1px solid ${TOKENS.border.default}`,
              background: "transparent", color: TOKENS.text.muted,
              fontSize: "13px", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
          >
            x
          </button>
        </div>
      </div>

      {/* Body */}
      {!minimized && (
        <>
          {showHistory ? (
            /* ── History List ── */
            <div style={{
              flex: 1, overflowY: "auto", padding: "8px 12px",
              display: "flex", flexDirection: "column", gap: "4px",
            }}>
              {historyList.length === 0 ? (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  color: TOKENS.text.muted, fontSize: "13px",
                }}>
                  No previous conversations
                </div>
              ) : historyList.map((item) => (
                <div
                  key={item.chatId}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "8px 10px", borderRadius: TOKENS.radius.sm,
                    border: `1px solid ${item.chatId === agentChatId ? TOKENS.accent : TOKENS.border.default}`,
                    background: item.chatId === agentChatId ? TOKENS.accentGlow : TOKENS.bg.surface,
                    cursor: "pointer",
                  }}
                  onClick={async () => {
                    await loadAgentHistory(item.chatId);
                    setShowHistory(false);
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "12px", color: TOKENS.text.primary,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.preview}
                    </div>
                    <div style={{ fontSize: "10px", color: TOKENS.text.muted, marginTop: "2px" }}>
                      {item.stepCount} steps · {item.updatedAt > 0 ? new Date(item.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unknown"}
                      {item.hasPending && (
                        <span style={{ color: "#f59e0b", marginLeft: "6px" }}>
                          (has pending tasks)
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Continue button for sessions with pending tasks */}
                  {item.hasPending && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await loadAgentHistory(item.chatId);
                        setShowHistory(false);
                        // Trigger continue via SSE
                        if (streamRef.current?.close) streamRef.current.close();
                        setAgentLoading(true);
                        addAgentStep({ type: "thinking", content: "Resuming previous task..." });
                        const { api } = await import("../../api");
                        const stream = api.agentContinue(item.chatId, connId, (step) => {
                          if (step.chat_id) setAgentChatId(step.chat_id);
                          if (step.type === "error") {
                            addAgentStep(step);
                            useStore.getState().clearAgentWaiting();
                            setAgentLoading(false);
                          } else if (step.final_answer || step.sql || step.type === "result") {
                            addAgentStep({ type: "result", content: step.final_answer || step.content, sql: step.sql });
                            setAgentLoading(false);
                          } else {
                            addAgentStep(step);
                          }
                        }, { persona: agentPersona, permissionMode: agentPermissionMode });
                        streamRef.current = stream;
                      }}
                      title="Continue this task"
                      aria-label="Continue task"
                      style={{
                        padding: "3px 8px", borderRadius: "3px", fontSize: "10px",
                        border: `1px solid #f59e0b`, background: "rgba(245,158,11,0.1)",
                        color: "#f59e0b", cursor: "pointer", flexShrink: 0, fontWeight: 600,
                      }}
                    >
                      Continue
                    </button>
                  )}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm("Delete this conversation?")) return;
                      await deleteAgentHistory(item.chatId);
                      setHistoryList((prev) => prev.filter((h) => h.chatId !== item.chatId));
                      if (item.chatId === agentChatId) {
                        clearAgent();
                      }
                    }}
                    title="Delete conversation"
                    aria-label="Delete conversation"
                    style={{
                      width: 24, height: 24, borderRadius: "3px",
                      border: "none", background: "transparent",
                      color: TOKENS.text.muted, fontSize: "12px",
                      cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <AgentStepFeed />
          )}

          {/* Quick-action buttons after agent completes a result */}
          {!agentLoading && !agentWaiting && agentSteps.length > 0 &&
           agentSteps[agentSteps.length - 1]?.type === 'result' && !showHistory && (
            <div style={{
              display: 'flex', gap: 6, padding: '6px 12px',
              borderTop: `1px solid ${TOKENS.border.default}`,
              flexWrap: 'wrap',
            }}>
              {['Continue', 'Tell me more', 'Add to dashboard'].map(label => (
                <button key={label} onClick={() => handleQuickAction(label)}
                  style={{
                    fontSize: 11, padding: '4px 12px', borderRadius: '20px',
                    border: `1px solid ${TOKENS.border.default}`,
                    background: 'transparent', color: TOKENS.text.secondary,
                    cursor: 'pointer', transition: TOKENS.transition,
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = TOKENS.accent; e.target.style.color = TOKENS.accentLight; }}
                  onMouseLeave={e => { e.target.style.borderColor = TOKENS.border.default; e.target.style.color = TOKENS.text.secondary; }}
                >{label}</button>
              ))}
            </div>
          )}

          {/* Footer input */}
          <form onSubmit={handleSubmit} style={{ padding: '8px 12px', borderTop: `1px solid ${TOKENS.border.default}`, flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 4px 4px 14px',
              borderRadius: '24px',
              background: TOKENS.bg.base,
              border: `1px solid ${inputFocused ? TOKENS.accent : TOKENS.border.default}`,
              transition: TOKENS.transition,
            }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={agentWaiting ? "Respond to the agent..." : "Ask the agent..."}
                disabled={agentLoading || !!agentWaiting}
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  background: 'transparent', color: TOKENS.text.primary,
                  fontSize: '13px', padding: '6px 0',
                }}
              />
              {agentLoading ? (
                <button type="button" onClick={() => {
                  if (streamRef.current?.close) streamRef.current.close();
                  setAgentLoading(false);
                  useStore.getState().clearAgentWaiting();
                }} title="Stop agent" aria-label="Stop" style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: TOKENS.danger || '#ef4444', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
              ) : (
                <button type="submit" disabled={!input.trim() || !!agentWaiting} style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: input.trim() && !agentWaiting ? TOKENS.accent : TOKENS.bg.surface,
                  border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !agentWaiting ? 'pointer' : 'default',
                  flexShrink: 0, transition: TOKENS.transition,
                  opacity: input.trim() && !agentWaiting ? 1 : 0.4,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              )}
            </div>
          </form>

          {/* Resize handle (float only) */}
          {dock === "float" && (
            <div
              onMouseDown={(e) => { e.preventDefault(); setFloatResizing(true); }}
              style={{
                position: "absolute", bottom: 0, right: 0,
                width: 16, height: 16, cursor: "nwse-resize",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" style={{ position: "absolute", bottom: 2, right: 2 }}>
                <path d="M11 1L1 11M11 5L5 11M11 9L9 11" stroke={TOKENS.text.muted} strokeWidth="1" />
              </svg>
            </div>
          )}
        </>
      )}
    </div>
  );
}

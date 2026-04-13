import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store";
import { api } from "../../api";
import { TOKENS } from "../dashboard/tokens";
import AgentStepFeed from "./AgentStepFeed";
import VoiceButton from "../voice/VoiceButton";
import VoiceIndicator from "../voice/VoiceIndicator";
import useSpeechRecognition from "../../hooks/useSpeechRecognition";
import useSpeechSynthesis from "../../hooks/useSpeechSynthesis";

const DOCK_POSITIONS = ["float", "right", "bottom", "left"];
const MIN_W = 280;
const MIN_H = 200;
const MAX_W_RATIO = 0.6;
const MAX_H_RATIO = 0.7;
const DEFAULT_W = 380;
const DEFAULT_H = 500;
const APP_SIDEBAR_W = 56;

// ── Workspace protection ──
// When the panel is docked left/right, the dashboard MUST keep at least this
// many pixels of horizontal room. Otherwise tiles get squeezed under their
// minimum-column width and the layout looks broken. Float mode bypasses this
// because it overlays the dashboard instead of compressing it.
const DASHBOARD_MIN_W = 720;
// Threshold below which the header collapses secondary controls into a "..."
// overflow popover. Picked empirically: at ~360px the inline controls start
// clipping the close button.
const HEADER_COLLAPSE_W = 380;

/**
 * Compute the maximum panel width that still leaves the dashboard with
 * `DASHBOARD_MIN_W` pixels of usable space. Used for left/right docks.
 * Float mode uses the looser MAX_W_RATIO ceiling because the panel overlays.
 */
function maxDockedWidth() {
  const cap = Math.max(MIN_W, window.innerWidth - APP_SIDEBAR_W - DASHBOARD_MIN_W);
  return Math.min(window.innerWidth * MAX_W_RATIO, cap);
}

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
// `dockMode` lets the clamp protect the dashboard's minimum width when
// the panel is docked left/right. Float panels can extend further because
// they overlay the dashboard rather than compressing it.
function clampWidth(w, dockMode) {
  const n = Number(w);
  if (!Number.isFinite(n)) return DEFAULT_W;
  const max = (dockMode === "left" || dockMode === "right")
    ? maxDockedWidth()
    : window.innerWidth * MAX_W_RATIO;
  return Math.max(MIN_W, Math.min(max, n));
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
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowAnchor, setOverflowAnchor] = useState(null); // { top, right } in viewport coords
  const overflowRef = useRef(null);
  const overflowTriggerRef = useRef(null);

  // Header collapses secondary controls into an overflow popover when narrow.
  // Bottom dock is always wide so it doesn't need collapsing.
  const headerCompact = dock !== "bottom" && panelWidth < HEADER_COLLAPSE_W;

  // Re-anchor the portaled overflow popover when it opens or when the panel
  // moves/resizes. The popover lives in document.body so it escapes the
  // panel's stacking context — but that means we have to position it manually.
  useEffect(() => {
    if (!overflowOpen) { setOverflowAnchor(null); return; }
    const update = () => {
      const el = overflowTriggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setOverflowAnchor({ top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [overflowOpen, dock, panelWidth, panelHeight, pos]);
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

  // ── Voice mode hooks ──
  const handleQuickActionRef = useRef(null);
  const { isSpeaking, speak, stop: stopSpeaking, supported: ttsSupported } = useSpeechSynthesis();
  const { isListening, interimTranscript, startListening, stopListening, supported: sttSupported } = useSpeechRecognition({
    onTranscript: (text) => {
      if (text.trim() && handleQuickActionRef.current) handleQuickActionRef.current(text.trim());
    },
  });

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

  // Close the header overflow popover on outside click or Escape
  useEffect(() => {
    if (!overflowOpen) return;
    const onClick = (e) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) {
        setOverflowOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === "Escape") setOverflowOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [overflowOpen]);

  // Reactive viewport clamp — re-clamp on window resize
  useEffect(() => {
    const onResize = () => {
      setPanelWidth((prev) => clampWidth(prev, dock));
      setPanelHeight((prev) => clampHeight(prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setPanelWidth, setPanelHeight, dock]);

  // Dock transition guard — reset minimized, clamp float pos on dock change.
  // ALSO re-clamp width when switching INTO a docked mode, so a panel that
  // was wider than the new max (e.g. floating at 900px) gets compressed
  // before it can squish the dashboard.
  const prevDockRef = useRef(dock);
  useEffect(() => {
    if (prevDockRef.current !== dock) {
      setMinimized(false); // Always un-minimize on dock change
      if (dock === "float") {
        // Clamp float position to viewport
        setPos((p) => clampPos(p));
      } else if (dock === "left" || dock === "right") {
        // Protect dashboard min width: shrink panel if it's too wide for the new dock
        setPanelWidth((prev) => clampWidth(prev, dock));
      }
      prevDockRef.current = dock;
    }
  }, [dock, setPanelWidth]);

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
          setPanelWidth(clampWidth(dim + delta, dock));
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
  }, [edgeResizing, setPanelWidth, setPanelHeight, dock]);

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
        // Float panels overlay the dashboard, so they use the loose ratio
        // ceiling — they don't need to protect dashboard width.
        setPanelWidth(clampWidth(e.clientX - rect.left, "float"));
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
        const resultText = step.final_answer || step.content;
        addAgentStep({ type: "result", content: resultText, sql: step.sql });
        setAgentLoading(false);
        // Auto-speak result when voice mode is active
        if (resultText && ttsSupported) speak(resultText.slice(0, 500));
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
  }, [input, connId, agentChatId, agentLoading, agentWaiting, agentSteps, clearAgent, setAgentLoading, addAgentStep, setAgentWaiting, setAgentChatId, saveAgentHistory, agentPersona, agentPermissionMode, ttsSupported, speak]);

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
        const resultText = step.final_answer || step.content;
        addAgentStep({ type: "result", content: resultText, sql: step.sql });
        setAgentLoading(false);
        // Auto-speak result when voice mode is active
        if (resultText && ttsSupported) speak(resultText.slice(0, 500));
        const dashId = useStore.getState().activeDashboardId;
        if (dashId) api.getDashboard(dashId).then(fresh => {
          if (fresh) window.dispatchEvent(new CustomEvent('dashboard-reload', { detail: { dashboard: fresh } }));
        }).catch(() => {});
      } else {
        addAgentStep(step);
      }
    }, { persona: agentPersona, permissionMode: agentPermissionMode });
    streamRef.current = stream;
  }, [connId, agentChatId, agentLoading, agentWaiting, agentSteps, clearAgent, setAgentLoading, addAgentStep, setAgentWaiting, setAgentChatId, saveAgentHistory, agentPersona, agentPermissionMode, ttsSupported, speak]);

  // Keep ref in sync so the speech recognition callback always calls the latest version
  useEffect(() => { handleQuickActionRef.current = handleQuickAction; }, [handleQuickAction]);

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
      overflow: "hidden",
      transition: isActive ? "none" : "width 0.2s ease, height 0.2s ease",
    };

    const validatedDock = DOCK_POSITIONS.includes(dock) ? dock : "float";

    if (validatedDock === "float") {
      return {
        ...base,
        position: "fixed",
        zIndex: 1000,
        left: pos.x,
        top: pos.y,
        width: panelWidth,
        height: minimized ? 42 : panelHeight,
        borderRadius: TOKENS.radius.lg,
        border: `1px solid ${TOKENS.border.default}`,
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

  const dockClass = dock === "float" ? "float" : "docked";
  return (
    <div ref={panelRef} style={panelStyle} className={`agent-panel-shell ${dockClass}`} role="dialog" aria-label="Agent panel"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) handleClose();
      }}>
      {/* Edge resize handles for docked modes */}
      {dock === "right" && edgeHandle("left")}
      {dock === "left" && edgeHandle("right")}
      {dock === "bottom" && !minimized && edgeHandle("top")}

      {/* Header — premium editorial chrome */}
      <div
        onMouseDown={onDragStart}
        style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 14px", background: "transparent",
          borderBottom: `1px solid ${TOKENS.border.default}`,
          cursor: dock === "float" ? "grab" : "default",
          userSelect: "none", flexShrink: 0,
        }}
      >
        <span className="eyebrow-dot" aria-hidden="true" />
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            Live agent
          </span>
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: "'Outfit', system-ui, sans-serif",
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
          }}>
            AskDB
          </span>
        </div>

        {/* Spacer pushes controls right */}
        <span style={{ flex: 1 }} />

        {/* Primary controls — collapse into overflow popover when panel is narrow */}
        {headerCompact ? (
          /* ── Collapsed: single "···" button that opens a popover with all controls.
              The popover is portaled to document.body to escape the panel's
              stacking context (which would otherwise clip it behind the
              dashboard when right-docked). ── */
          <div style={{ flexShrink: 0 }}>
            <button
              ref={overflowTriggerRef}
              onClick={() => setOverflowOpen((v) => !v)}
              title="More controls"
              aria-label="More controls"
              aria-expanded={overflowOpen}
              className="agent-dock-pill"
              data-active={(overflowOpen || agentPersona || agentPermissionMode === "autonomous" || showHistory) || undefined}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
              </svg>
            </button>
            {overflowOpen && overflowAnchor && createPortal(
              <div
                ref={overflowRef}
                className="agent-overflow-popover"
                role="menu"
                style={{
                  position: "fixed",
                  top: overflowAnchor.top,
                  right: overflowAnchor.right,
                  // Override the absolute positioning from the CSS class
                  left: "auto",
                }}
              >
                <button
                  className="agent-overflow-row"
                  data-active={showHistory || undefined}
                  onClick={() => { setShowHistory(!showHistory); setOverflowOpen(false); }}
                >
                  <span className="agent-overflow-row__icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  {showHistory ? "Back to chat" : "Chat history"}
                </button>
                <button
                  className="agent-overflow-row"
                  onClick={() => {
                    if (streamRef.current?.close) streamRef.current.close();
                    if (agentSteps.length > 0) saveAgentHistory();
                    clearAgent();
                    setShowHistory(false);
                    setOverflowOpen(false);
                  }}
                >
                  <span className="agent-overflow-row__icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  New conversation
                </button>
                <button
                  className="agent-overflow-row"
                  data-active={agentPermissionMode === "autonomous" || undefined}
                  onClick={() => {
                    useStore.getState().setAgentPermissionMode(agentPermissionMode === "supervised" ? "autonomous" : "supervised");
                  }}
                >
                  <span className="agent-overflow-row__icon">
                    {agentPermissionMode === "supervised" ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 019.9-1" /></svg>
                    )}
                  </span>
                  {agentPermissionMode === "supervised" ? "Mode: Safe (supervised)" : "Mode: Auto (autonomous)"}
                </button>
                <div style={{ height: 1, background: "var(--border-default)", margin: "4px 6px" }} aria-hidden="true" />
                <div style={{ padding: "6px 10px 4px", fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Persona
                </div>
                {[{ v: "", l: "None" }, { v: "explorer", l: "Explorer" }, { v: "auditor", l: "Auditor" }, { v: "storyteller", l: "Storyteller" }].map((opt) => (
                  <button
                    key={opt.v || "none"}
                    className="agent-overflow-row"
                    data-active={(agentPersona || "") === opt.v || undefined}
                    onClick={() => {
                      useStore.getState().setAgentPersona(opt.v || null);
                    }}
                  >
                    <span className="agent-overflow-row__icon" />
                    {opt.l}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
        ) : (
          /* ── Expanded: full inline control rail ── */
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {/* History toggle */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              title={showHistory ? "Back to chat" : "Chat history"}
              aria-pressed={showHistory}
              className="agent-dock-pill"
              data-active={showHistory || undefined}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {/* Persona selector */}
            <select
              value={agentPersona || ""}
              onChange={(e) => useStore.getState().setAgentPersona(e.target.value || null)}
              title="Analyst persona"
              aria-label="Analyst persona"
              className="ease-spring"
              style={{
                height: 26,
                borderRadius: 7,
                fontSize: 9,
                maxWidth: 70,
                border: `1px solid ${agentPersona ? 'rgba(37, 99, 235, 0.3)' : 'var(--border-default)'}`,
                background: agentPersona ? 'var(--accent-glow)' : 'transparent',
                color: agentPersona ? 'var(--accent)' : 'var(--text-muted)',
                cursor: "pointer",
                padding: "0 4px",
                outline: "none",
                fontWeight: 600,
                letterSpacing: '0.04em',
                transition: 'background 300ms cubic-bezier(0.32,0.72,0,1), color 300ms cubic-bezier(0.32,0.72,0,1)',
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
              className="ease-spring"
              style={{
                height: 26,
                borderRadius: 7,
                fontSize: 9,
                padding: '0 7px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                border: `1px solid ${agentPermissionMode === "autonomous" ? 'rgba(245, 158, 11, 0.32)' : 'var(--border-default)'}`,
                background: agentPermissionMode === "autonomous" ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                color: agentPermissionMode === "autonomous" ? '#f59e0b' : 'var(--text-muted)',
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: 'background 300ms cubic-bezier(0.32,0.72,0,1), color 300ms cubic-bezier(0.32,0.72,0,1)',
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
              className="agent-dock-pill"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        )}

        {/* Secondary controls — voice, dock, minimize, close */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, marginLeft: 4 }}>
          {/* Voice mode */}
          <VoiceButton
            isListening={isListening}
            onToggle={() => { if (isListening) { stopListening(); stopSpeaking(); } else startListening(); }}
            supported={sttSupported}
            size="sm"
          />
          {/* Dock buttons */}
          {DOCK_POSITIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDock(validDock(d))}
              title={`Dock ${d}`}
              aria-pressed={dock === d}
              aria-label={`Dock ${d}`}
              className="agent-dock-pill"
              data-active={dock === d || undefined}
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
              className="agent-dock-pill"
              style={{ fontSize: 13, fontFamily: "system-ui, sans-serif" }}
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
              className="ease-spring"
              style={{
                background: 'var(--status-danger)',
                color: '#fff',
                border: 'none',
                borderRadius: 9999,
                padding: '5px 14px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                marginLeft: 4,
                boxShadow: '0 6px 18px -8px rgba(239, 68, 68, 0.55), 0 1px 0 rgba(255,255,255,0.18) inset',
                transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1)',
              }}
            >
              Cancel
            </button>
          )}

          {/* Close */}
          <button
            onClick={handleClose}
            aria-label="Close agent panel"
            className="agent-dock-pill"
            style={{ fontSize: 13, fontFamily: "system-ui, sans-serif" }}
          >
            ×
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
            <>
              <VoiceIndicator isListening={isListening} isSpeaking={isSpeaking} interimTranscript={interimTranscript} />
              <AgentStepFeed compact={panelWidth < 400} />
            </>
          )}

          {/* Quick-action buttons after agent completes a result */}
          {!agentLoading && !agentWaiting && agentSteps.length > 0 &&
           agentSteps[agentSteps.length - 1]?.type === 'result' && !showHistory && (
            <div style={{
              display: 'flex',
              gap: 6,
              padding: '10px 14px',
              borderTop: `1px solid ${TOKENS.border.default}`,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginRight: 4,
              }}>
                Next
              </span>
              {['Continue', 'Tell me more', 'Add to dashboard'].map(label => (
                <button
                  key={label}
                  onClick={() => handleQuickAction(label)}
                  className="agent-quick-chip"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Footer input — premium glass composer */}
          <form onSubmit={handleSubmit} style={{ padding: '12px 14px', borderTop: `1px solid ${TOKENS.border.default}`, flexShrink: 0 }}>
            <div className="agent-composer" data-focused={inputFocused || undefined}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={agentWaiting ? "Respond to the agent…" : "Ask the agent anything…"}
                disabled={agentLoading || !!agentWaiting}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: TOKENS.text.primary,
                  fontSize: 13,
                  padding: '7px 0',
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              />
              {agentLoading ? (
                <button
                  type="button"
                  onClick={() => {
                    if (streamRef.current?.close) streamRef.current.close();
                    setAgentLoading(false);
                    useStore.getState().clearAgentWaiting();
                  }}
                  title="Stop agent"
                  aria-label="Stop"
                  className="ease-spring"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: 'var(--status-danger)',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    boxShadow: '0 8px 22px -8px rgba(239, 68, 68, 0.55), 0 1px 0 rgba(255,255,255,0.18) inset',
                    transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1)',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || !!agentWaiting}
                  className="ease-spring group"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: input.trim() && !agentWaiting ? 'var(--accent)' : 'var(--bg-hover)',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: input.trim() && !agentWaiting ? 'pointer' : 'default',
                    flexShrink: 0,
                    boxShadow: input.trim() && !agentWaiting
                      ? '0 8px 22px -8px rgba(37, 99, 235, 0.55), 0 1px 0 rgba(255,255,255,0.18) inset'
                      : 'none',
                    transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1), background 300ms cubic-bezier(0.32,0.72,0,1)',
                    opacity: input.trim() && !agentWaiting ? 1 : 0.4,
                  }}
                  onMouseEnter={(e) => {
                    if (input.trim() && !agentWaiting) {
                      e.currentTarget.style.transform = 'scale(1.06) translateY(-1px)';
                    }
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

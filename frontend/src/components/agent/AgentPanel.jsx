import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store";
import { api } from "../../api";
import { TOKENS } from "../dashboard/tokens";
import AgentStepFeed from "./AgentStepFeed";
import VoiceIndicator from "../voice/VoiceIndicator";
import useSpeechRecognition from "../../hooks/useSpeechRecognition";
import useSpeechSynthesis from "../../hooks/useSpeechSynthesis";
import useConfirmAction from "../../lib/useConfirmAction";

const DOCK_POSITIONS = ["float", "right"];
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

export default function AgentPanel({ connId, onClose, defaultDock = "float", embedded = false }) {
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

  // All secondary controls live in the Tools popover now — no compact branching.

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
  const agentContext = useStore((s) => s.agentContext);
  const softClearAgent = useStore((s) => s.softClearAgent);

  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [inputFocused, setInputFocused] = useState(false);

  // Confirm handlers for destructive actions
  const newConvoConfirm = useConfirmAction(() => {
    if (streamRef.current?.close) streamRef.current.close();
    if (agentSteps.length > 0) saveAgentHistory();
    clearAgent();
    setShowHistory(false);
    setOverflowOpen(false);
  }, { timeoutMs: 3500 });

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

  // SP-2: When embedded on dashboard, set agent context to "dashboard"
  useEffect(() => {
    if (embedded) {
      useStore.getState().setAgentContext("dashboard");
      return () => useStore.getState().setAgentContext("query");
    }
  }, [embedded]);

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
    if (embedded || dock !== "float") return;
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  }, [dock, embedded]);

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

  // ── SP-2b: Intercept dashboard tool results for real-time tile CRUD ──
  const handleDashboardToolStep = useCallback((step) => {
    if (step.type !== "tool_call" || !step.tool_result || !step.tool_name) return;
    const store = useStore.getState();
    const name = step.tool_name;
    let parsed;
    try {
      parsed = typeof step.tool_result === "string" ? JSON.parse(step.tool_result) : step.tool_result;
    } catch { return; }
    if (parsed?.error) return;

    if (name === "create_dashboard_tile") {
      const tileId = parsed.tile_id || parsed.id;
      if (tileId) {
        // Mark as agent-editing briefly
        store.setAgentEditingTile(tileId, true);
        store.addDashboardTile({
          id: tileId,
          title: step.tool_input?.title || parsed.title || "Untitled",
          chart_spec: parsed.chart_spec || step.tool_input?.chart_spec,
          columns: parsed.columns || [],
          rows: parsed.rows || [],
          sql: step.tool_input?.sql || parsed.sql,
        });
        // Generate suggested chips
        const title = step.tool_input?.title || parsed.title || "tile";
        store.setAgentSuggestedChips([
          { label: `Enlarge ${title}`, action: `Make the ${title} tile larger` },
          { label: "Add related tile", action: `Add another tile related to ${title}` },
          { label: "Add forecast", action: `Add a forecast tile based on ${title}` },
        ]);
        setTimeout(() => store.setAgentEditingTile(tileId, false), 3000);
      }
    } else if (name === "update_dashboard_tile") {
      const tileId = step.tool_input?.tile_id || parsed.tile_id;
      if (tileId) {
        store.setAgentEditingTile(tileId, true);
        store.updateDashboardTile(tileId, {
          title: step.tool_input?.title || parsed.title,
          chart_spec: parsed.chart_spec || step.tool_input?.chart_spec,
          columns: parsed.columns,
          rows: parsed.rows,
          sql: step.tool_input?.sql || parsed.sql,
        });
        const title = step.tool_input?.title || parsed.title || "tile";
        store.setAgentSuggestedChips([
          { label: `Resize ${title}`, action: `Resize the ${title} tile` },
          { label: "Change chart type", action: `Change the ${title} chart type` },
          { label: "Add color encoding", action: `Add color encoding to ${title}` },
        ]);
        setTimeout(() => store.setAgentEditingTile(tileId, false), 3000);
      }
    } else if (name === "delete_dashboard_tile") {
      const tileId = step.tool_input?.tile_id || parsed.tile_id;
      if (tileId) {
        store.removeDashboardTile(tileId);
        store.clearAgentSuggestedChips();
      }
    }
  }, []);

  // ── Submit question to agent ──
  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    const q = input.trim();
    // Guard: block if empty, already loading, or waiting for user response
    if (!q || agentLoading || agentWaiting) return;
    setInput("");
    // Save current conversation before starting new one
    if (agentSteps.length > 0) saveAgentHistory();

    // Capture existing chat ID for continuation BEFORE clearing steps
    const existingChatId = agentChatId;

    // Clear UI state but preserve agentChatId for continuous conversation
    softClearAgent();
    setAgentLoading(true);
    setShowHistory(false);

    // Add user question as first step so it shows immediately
    addAgentStep({ type: "user_query", content: q });

    // Abort previous stream if any
    if (streamRef.current?.close) streamRef.current.close();

    // Reuse existing chat ID for continuous conversation
    const chatIdForRun = existingChatId;

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
        // Auto-speak result ONLY when voice mode is active (user clicked mic)
        if (resultText && ttsSupported && isListening) speak(resultText.slice(0, 500));
        // Reload dashboard after agent finishes (covers all tile modifications)
        const dashId = useStore.getState().activeDashboardId;
        if (dashId) api.getDashboard(dashId).then(fresh => {
          if (fresh) window.dispatchEvent(new CustomEvent('dashboard-reload', { detail: { dashboard: fresh } }));
        }).catch(() => {});
      } else {
        addAgentStep(step);
        // SP-2b: intercept dashboard tool results for real-time tile mutations
        handleDashboardToolStep(step);
      }
    }, { persona: agentPersona, permissionMode: agentPermissionMode, agentContext });
    streamRef.current = stream;
  }, [input, connId, agentChatId, agentLoading, agentWaiting, agentSteps, softClearAgent, setAgentLoading, addAgentStep, setAgentWaiting, setAgentChatId, saveAgentHistory, agentPersona, agentPermissionMode, agentContext, ttsSupported, speak, handleDashboardToolStep]);

  // ── Quick action — same as handleSubmit but accepts text directly ──
  const handleQuickAction = useCallback((text) => {
    if (!text || agentLoading || agentWaiting) return;
    // Save current conversation before starting new one
    if (agentSteps.length > 0) saveAgentHistory();

    // Capture existing chat ID for continuation BEFORE clearing steps
    const existingChatId = agentChatId;

    // Clear UI state but preserve agentChatId for continuous conversation
    softClearAgent();
    setAgentLoading(true);
    setShowHistory(false);
    setInput("");

    addAgentStep({ type: "user_query", content: text });

    if (streamRef.current?.close) streamRef.current.close();

    // Reuse existing chat ID for continuous conversation
    const chatIdForRun = existingChatId;

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
        // Auto-speak result ONLY when voice mode is active (user clicked mic)
        if (resultText && ttsSupported && isListening) speak(resultText.slice(0, 500));
        const dashId = useStore.getState().activeDashboardId;
        if (dashId) api.getDashboard(dashId).then(fresh => {
          if (fresh) window.dispatchEvent(new CustomEvent('dashboard-reload', { detail: { dashboard: fresh } }));
        }).catch(() => {});
      } else {
        addAgentStep(step);
        handleDashboardToolStep(step);
      }
    }, { persona: agentPersona, permissionMode: agentPermissionMode, agentContext });
    streamRef.current = stream;
  }, [connId, agentChatId, agentLoading, agentWaiting, agentSteps, softClearAgent, setAgentLoading, addAgentStep, setAgentWaiting, setAgentChatId, saveAgentHistory, agentPersona, agentPermissionMode, agentContext, ttsSupported, speak, handleDashboardToolStep]);

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
  // NOTE: No width/height CSS transitions. Animating size triggers layout
  // reflow every frame (not GPU-accelerated). Dock changes snap instantly;
  // drag-resize already updates via rAF throttling. Matches native windowed UI.
  const panelStyle = useMemo(() => {
    const base = {
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    };

    // Embedded mode — in-flow flex child, no position:fixed
    if (embedded) {
      return {
        ...base,
        position: "relative",
        width: panelWidth,
        height: "100%",
        flexShrink: 0,
        borderLeft: `1px solid ${TOKENS.border.default}`,
      };
    }

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
    // bottom — centered with equal margins from content edges
    const hPad = 24; // horizontal inset from content edges
    return {
      ...base,
      position: "fixed",
      left: APP_SIDEBAR_W + hPad,
      bottom: 12,
      width: `calc(100vw - ${APP_SIDEBAR_W + hPad * 2}px)`,
      height: minimized ? 42 : panelHeight,
      zIndex: 50,
      borderRadius: TOKENS.radius.lg,
      border: `1px solid ${TOKENS.border.default}`,
      boxShadow: "0 -8px 32px -8px rgba(0,0,0,0.3), 0 -2px 8px rgba(0,0,0,0.15)",
    };
  }, [dock, pos.x, pos.y, panelWidth, panelHeight, minimized, embedded]);

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

  const dockClass = embedded ? "docked embedded" : dock === "float" ? "float" : "docked";
  return (
    <div ref={panelRef} style={panelStyle} className={`agent-panel-shell ${dockClass}`} role="dialog" aria-label="Agent panel"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) handleClose();
      }}>
      {/* Edge resize handles for docked modes */}
      {(dock === "right" || embedded) && edgeHandle("left")}
      {dock === "left" && !embedded && edgeHandle("right")}
      {dock === "bottom" && !minimized && !embedded && edgeHandle("top")}

      {/* Header — premium editorial chrome */}
      <div
        onMouseDown={onDragStart}
        style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "13px 16px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.025), transparent)",
          borderBottom: `1px solid ${TOKENS.border.default}`,
          cursor: dock === "float" ? "grab" : "default",
          userSelect: "none", flexShrink: 0,
        }}
      >
        {/* Title — single visual unit, no competing eyebrow */}
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: "'Outfit', system-ui, sans-serif",
            letterSpacing: "-0.022em",
            lineHeight: 1.05,
            minWidth: 0,
          }}
        >
          AskDB
        </span>

        {/* Status chip — live context, only when meaningful */}
        {(isListening || agentPermissionMode === "autonomous" || agentPersona) && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '3px 9px',
              borderRadius: 9999,
              fontFamily: "'Outfit', system-ui, sans-serif",
              background: isListening
                ? 'rgba(239,68,68,0.12)'
                : agentPermissionMode === "autonomous"
                  ? 'rgba(245,158,11,0.12)'
                  : 'rgba(37,99,235,0.12)',
              color: isListening
                ? '#f87171'
                : agentPermissionMode === "autonomous"
                  ? '#f59e0b'
                  : 'var(--accent)',
              border: `1px solid ${isListening
                ? 'rgba(239,68,68,0.28)'
                : agentPermissionMode === "autonomous"
                  ? 'rgba(245,158,11,0.28)'
                  : 'rgba(37,99,235,0.28)'}`,
            }}
          >
            {isListening
              ? 'Listening'
              : agentPermissionMode === "autonomous"
                ? 'Auto'
                : agentPersona ? agentPersona : ''}
          </span>
        )}

        {/* Spacer pushes controls right */}
        <span style={{ flex: 1 }} />

        {/* ── Primary controls — Tools popover, Cancel, Close ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* Cancel — only while agent is running */}
          {agentLoading && agentChatId && (
            <button
              onClick={async () => {
                try {
                  await api.agentCancel(agentChatId);
                } catch { /* ignore - best effort */ }
                if (streamRef.current?.close) streamRef.current.close();
                setAgentLoading(false);
                useStore.getState().clearAgentWaiting();
              }}
              title="Stop the agent"
              aria-label="Stop agent"
              className="ease-spring"
              style={{
                background: 'var(--status-danger)',
                color: '#fff',
                border: 'none',
                borderRadius: 9999,
                padding: '5px 14px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontFamily: "'Outfit', system-ui, sans-serif",
                cursor: 'pointer',
                boxShadow: '0 6px 18px -8px rgba(239, 68, 68, 0.55), 0 1px 0 rgba(255,255,255,0.18) inset',
                transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1)',
              }}
            >
              Stop
            </button>
          )}

          {/* Tools — single popover with everything */}
          <button
            ref={overflowTriggerRef}
            onClick={() => setOverflowOpen((v) => !v)}
            title="Tools (history, persona, mode, voice, dock)"
            aria-label="Open tools menu"
            aria-expanded={overflowOpen}
            className="agent-dock-pill"
            data-active={(overflowOpen || agentPersona || agentPermissionMode === "autonomous" || showHistory || isListening) || undefined}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" />
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
                left: "auto",
                minWidth: 220,
              }}
            >
              {/* SECTION — Conversation */}
              <div className="agent-overflow-section">Conversation</div>
              <button
                className="agent-overflow-row"
                data-active={showHistory || undefined}
                onClick={() => { setShowHistory(!showHistory); setOverflowOpen(false); }}
              >
                <span className="agent-overflow-row__icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                {showHistory ? "Back to chat" : "Chat history"}
              </button>
              <button
                className="agent-overflow-row"
                data-armed={newConvoConfirm.armed || undefined}
                onClick={() => {
                  // Only require confirm if there's actually a conversation to lose
                  if (agentSteps.length === 0) {
                    clearAgent();
                    setShowHistory(false);
                    setOverflowOpen(false);
                    return;
                  }
                  newConvoConfirm.trigger();
                }}
              >
                <span className="agent-overflow-row__icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span style={{ flex: 1 }}>
                  {newConvoConfirm.armed ? "Confirm new chat?" : "New conversation"}
                </span>
                {agentSteps.length > 0 && !newConvoConfirm.armed && (
                  <span className="agent-overflow-row__hint">saved to history</span>
                )}
              </button>

              <div className="agent-overflow-divider" aria-hidden="true" />

              {/* SECTION — Agent behavior */}
              <div className="agent-overflow-section">Behavior</div>
              <button
                className="agent-overflow-row"
                data-active={agentPermissionMode === "autonomous" || undefined}
                onClick={() => {
                  useStore.getState().setAgentPermissionMode(agentPermissionMode === "supervised" ? "autonomous" : "supervised");
                }}
              >
                <span className="agent-overflow-row__icon">
                  {agentPermissionMode === "supervised" ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 019.9-1" /></svg>
                  )}
                </span>
                <span style={{ flex: 1 }}>{agentPermissionMode === "supervised" ? "Safe mode" : "Autonomous mode"}</span>
                <span className="agent-overflow-row__hint">
                  {agentPermissionMode === "supervised" ? "asks first" : "acts freely"}
                </span>
              </button>

              <div className="agent-overflow-section agent-overflow-section--sub">Persona</div>
              {[
                { v: "", l: "Default", desc: "balanced" },
                { v: "explorer", l: "Explorer", desc: "curious, broad" },
                { v: "auditor", l: "Auditor", desc: "strict, precise" },
                { v: "storyteller", l: "Storyteller", desc: "narrative" },
              ].map((opt) => (
                <button
                  key={opt.v || "none"}
                  className="agent-overflow-row"
                  data-active={(agentPersona || "") === opt.v || undefined}
                  onClick={() => {
                    useStore.getState().setAgentPersona(opt.v || null);
                  }}
                >
                  <span className="agent-overflow-row__icon" />
                  <span style={{ flex: 1 }}>{opt.l}</span>
                  <span className="agent-overflow-row__hint">{opt.desc}</span>
                </button>
              ))}

              {sttSupported && (
                <>
                  <div className="agent-overflow-divider" aria-hidden="true" />
                  <div className="agent-overflow-section">Voice</div>
                  <button
                    className="agent-overflow-row"
                    data-active={isListening || undefined}
                    onClick={() => {
                      if (isListening) { stopListening(); stopSpeaking(); }
                      else startListening();
                      setOverflowOpen(false);
                    }}
                  >
                    <span className="agent-overflow-row__icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="3" width="6" height="12" rx="3" />
                        <path d="M5 11a7 7 0 0014 0M12 18v3" />
                      </svg>
                    </span>
                    {isListening ? "Stop listening" : "Start voice mode"}
                  </button>
                </>
              )}

              {!embedded && (
                <>
                  <div className="agent-overflow-divider" aria-hidden="true" />

                  {/* SECTION — Dock */}
                  <div className="agent-overflow-section">Dock position</div>
                  <div className="agent-overflow-dock-grid">
                    {DOCK_POSITIONS.map((d) => {
                      const LABELS = { float: "Float", right: "Right", bottom: "Bottom", left: "Left" };
                      return (
                        <button
                          key={d}
                          onClick={() => { setDock(validDock(d)); setOverflowOpen(false); }}
                          className="agent-overflow-dock-btn"
                          data-active={dock === d || undefined}
                          title={`Dock ${d}`}
                          aria-pressed={dock === d}
                        >
                          <span className={`agent-dock-glyph agent-dock-glyph--${d}`} aria-hidden="true" />
                          {LABELS[d]}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {(dock === "float" || dock === "bottom") && (
                <>
                  <div className="agent-overflow-divider" aria-hidden="true" />
                  <button
                    className="agent-overflow-row"
                    onClick={() => { setMinimized(!minimized); setOverflowOpen(false); }}
                  >
                    <span className="agent-overflow-row__icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d={minimized ? "M5 12h14M12 5v14" : "M5 12h14"} />
                      </svg>
                    </span>
                    {minimized ? "Expand panel" : "Minimize panel"}
                  </button>
                </>
              )}
            </div>,
            document.body
          )}

          {/* Close */}
          <button
            onClick={handleClose}
            title="Close agent panel"
            aria-label="Close agent panel"
            className="agent-dock-pill"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
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

          {/* Quick-action buttons + suggested chips after agent completes a result */}
          {!agentLoading && !agentWaiting && agentSteps.length > 0 &&
           agentSteps[agentSteps.length - 1]?.type === 'result' && !showHistory && (
            <QuickActionsBar
              onAction={handleQuickAction}
              embedded={embedded}
            />
          )}

          {/* Footer input — premium glass composer */}
          <form onSubmit={handleSubmit} style={{ padding: '14px 16px 18px', borderTop: `1px solid ${TOKENS.border.default}`, flexShrink: 0 }}>
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
                  fontSize: 13.5,
                  fontWeight: 500,
                  padding: '8px 0',
                  fontFamily: "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif",
                  letterSpacing: '-0.005em',
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
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: input.trim() && !agentWaiting
                      ? 'linear-gradient(180deg, #3b82f6, #2563eb 60%, #1d4ed8)'
                      : 'var(--bg-hover)',
                    border: input.trim() && !agentWaiting ? '1px solid rgba(37, 99, 235, 0.55)' : '1px solid var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: input.trim() && !agentWaiting ? 'pointer' : 'default',
                    flexShrink: 0,
                    boxShadow: input.trim() && !agentWaiting
                      ? '0 14px 30px -10px rgba(37, 99, 235, 0.65), 0 1px 0 rgba(255,255,255,0.28) inset, 0 -1px 0 rgba(0,0,0,0.18) inset'
                      : 'none',
                    transition: 'transform 380ms cubic-bezier(0.32,0.72,0,1), background 380ms cubic-bezier(0.32,0.72,0,1), box-shadow 380ms cubic-bezier(0.32,0.72,0,1)',
                    opacity: input.trim() && !agentWaiting ? 1 : 0.42,
                  }}
                  onMouseEnter={(e) => {
                    if (input.trim() && !agentWaiting) {
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 20px 40px -12px rgba(37, 99, 235, 0.75), 0 1px 0 rgba(255,255,255,0.32) inset, 0 -1px 0 rgba(0,0,0,0.18) inset';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    if (input.trim() && !agentWaiting) {
                      e.currentTarget.style.boxShadow = '0 14px 30px -10px rgba(37, 99, 235, 0.65), 0 1px 0 rgba(255,255,255,0.28) inset, 0 -1px 0 rgba(0,0,0,0.18) inset';
                    }
                  }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(0.96)'; }}
                  onMouseUp={(e) => {
                    if (input.trim() && !agentWaiting) e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </form>

          {/* Resize handle (float only) */}
          {dock === "float" && !embedded && (
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

/** SP-2c: Quick actions bar with default chips + agent-suggested contextual chips */
function QuickActionsBar({ onAction, embedded }) {
  const suggestedChips = useStore((s) => s.agentSuggestedChips);
  const clearChips = useStore((s) => s.clearAgentSuggestedChips);

  const defaultChips = embedded
    ? ['Continue', 'Tell me more']
    : ['Continue', 'Tell me more', 'Add to dashboard'];

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      padding: '14px 18px 16px',
      borderTop: `1px solid ${TOKENS.border.default}`,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      {/* Suggested chips from agent tile operations (SP-2c) */}
      {suggestedChips.length > 0 && (
        <>
          <span style={{
            fontSize: 10, fontWeight: 500, color: '#a78bfa',
            marginRight: 4,
            fontFamily: "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif",
            letterSpacing: '-0.005em',
          }}>
            Suggested
          </span>
          {suggestedChips.map((chip, i) => (
            <button
              key={`sug-${i}`}
              onClick={() => { onAction(chip.action); clearChips(); }}
              className="agent-quick-chip"
              style={{
                background: 'rgba(139,92,246,0.1)',
                borderColor: 'rgba(139,92,246,0.25)',
                color: '#c4b5fd',
              }}
            >
              {chip.label}
            </button>
          ))}
          <span style={{ width: '100%', height: 0 }} />
        </>
      )}
      <span style={{
        fontSize: 10, fontWeight: 500, color: 'var(--text-muted)',
        marginRight: 4,
        fontFamily: "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif",
        letterSpacing: '-0.005em',
      }}>
        Try next
      </span>
      {defaultChips.map(label => (
        <button
          key={label}
          onClick={() => onAction(label)}
          className="agent-quick-chip"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

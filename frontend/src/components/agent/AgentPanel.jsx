import { useState, useRef, useCallback, useEffect } from "react";
import { useStore } from "../../store";
import { api } from "../../api";
import { TOKENS } from "../dashboard/tokens";
import AgentStepFeed from "./AgentStepFeed";

const DOCK_POSITIONS = ["float", "right", "bottom", "left"];
const MIN_W = 300;
const MIN_H = 300;
const DEFAULT_W = 380;
const DEFAULT_H = 500;

function loadPanelState() {
  try {
    return JSON.parse(localStorage.getItem("qc_agent_panel") || "null");
  } catch { return null; }
}

function savePanelState(state) {
  localStorage.setItem("qc_agent_panel", JSON.stringify(state));
}

export default function AgentPanel({ connId, onClose, defaultDock = "float" }) {
  const saved = loadPanelState();
  const [dock, setDock] = useState(saved?.dock || defaultDock);
  const [pos, setPos] = useState(saved?.pos || { x: 60, y: 60 });
  const [size, setSize] = useState(saved?.size || { w: DEFAULT_W, h: DEFAULT_H });
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);

  const agentLoading = useStore((s) => s.agentLoading);
  const setAgentLoading = useStore((s) => s.setAgentLoading);
  const addAgentStep = useStore((s) => s.addAgentStep);
  const clearAgent = useStore((s) => s.clearAgent);
  const setAgentWaiting = useStore((s) => s.setAgentWaiting);
  const setAgentChatId = useStore((s) => s.setAgentChatId);
  const agentChatId = useStore((s) => s.agentChatId);

  // Save state on change
  useEffect(() => {
    savePanelState({ dock, pos, size });
  }, [dock, pos, size]);

  // Drag handlers
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
        x: Math.max(0, e.clientX - dragOffset.current.x),
        y: Math.max(0, e.clientY - dragOffset.current.y),
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

  // Resize handlers
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSize({
        w: Math.max(MIN_W, e.clientX - rect.left),
        h: Math.max(MIN_H, e.clientY - rect.top),
      });
    };
    const onUp = () => setResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);

  // Submit question to agent
  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q || agentLoading) return;
    setInput("");
    clearAgent();
    setAgentLoading(true);

    api.agentRun(q, connId, agentChatId, (step) => {
      if (step.chat_id) setAgentChatId(step.chat_id);

      if (step.type === "ask_user") {
        setAgentWaiting(step.content);
      } else if (step.type === "error") {
        addAgentStep(step);
        setAgentLoading(false);
      } else if (step.final_answer || step.sql || step.type === "result") {
        addAgentStep({ type: "result", content: step.final_answer, sql: step.sql });
        setAgentLoading(false);
      } else {
        addAgentStep(step);
      }
    });
  }, [input, connId, agentChatId, agentLoading, clearAgent, setAgentLoading, addAgentStep, setAgentWaiting, setAgentChatId]);

  // Panel positioning styles
  const panelStyle = (() => {
    const base = {
      position: "fixed",
      zIndex: 9998,
      display: "flex",
      flexDirection: "column",
      background: TOKENS.bg.elevated,
      border: `1px solid ${TOKENS.border.default}`,
      borderRadius: dock === "float" ? TOKENS.radius.lg : "0",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      overflow: "hidden",
      transition: dragging || resizing ? "none" : "all 0.2s ease",
    };

    if (dock === "float") {
      return { ...base, left: pos.x, top: pos.y, width: size.w, height: minimized ? 42 : size.h };
    }
    if (dock === "right") {
      return { ...base, right: 0, top: 0, width: size.w, height: "100vh" };
    }
    if (dock === "bottom") {
      return { ...base, left: 0, bottom: 0, width: "100vw", height: minimized ? 42 : size.h };
    }
    if (dock === "left") {
      return { ...base, left: 0, top: 0, width: size.w, height: "100vh" };
    }
    return base;
  })();

  return (
    <div ref={panelRef} style={panelStyle}>
      {/* Header */}
      <div
        onMouseDown={onDragStart}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "8px 12px", background: TOKENS.bg.surface,
          borderBottom: `1px solid ${TOKENS.border.default}`,
          cursor: dock === "float" ? "grab" : "default",
          userSelect: "none", flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TOKENS.accent} strokeWidth="2">
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: TOKENS.text.primary }}>
          Agent
        </span>

        {/* Dock buttons */}
        {DOCK_POSITIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDock(d)}
            title={`Dock ${d}`}
            style={{
              width: 22, height: 22, borderRadius: "4px",
              border: dock === d ? `1px solid ${TOKENS.accent}` : `1px solid ${TOKENS.border.default}`,
              background: dock === d ? TOKENS.accentGlow : "transparent",
              color: dock === d ? TOKENS.accent : TOKENS.text.muted,
              fontSize: "9px", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
          >
            {d[0].toUpperCase()}
          </button>
        ))}

        {/* Minimize */}
        <button
          onClick={() => setMinimized(!minimized)}
          style={{
            width: 22, height: 22, borderRadius: "4px",
            border: `1px solid ${TOKENS.border.default}`,
            background: "transparent", color: TOKENS.text.muted,
            fontSize: "14px", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
        >
          {minimized ? "+" : "\u2013"}
        </button>

        {/* Close */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              width: 22, height: 22, borderRadius: "4px",
              border: `1px solid ${TOKENS.border.default}`,
              background: "transparent", color: TOKENS.text.muted,
              fontSize: "14px", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
          >
            x
          </button>
        )}
      </div>

      {/* Body */}
      {!minimized && (
        <>
          <AgentStepFeed />

          {/* Footer input */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex", gap: "8px", padding: "10px 12px",
              borderTop: `1px solid ${TOKENS.border.default}`,
              background: TOKENS.bg.surface, flexShrink: 0,
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent..."
              disabled={agentLoading}
              style={{
                flex: 1, padding: "7px 10px", fontSize: "12px",
                borderRadius: TOKENS.radius.sm,
                border: `1px solid ${TOKENS.border.default}`,
                background: TOKENS.bg.base, color: TOKENS.text.primary,
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={agentLoading || !input.trim()}
              style={{
                padding: "7px 14px", fontSize: "12px", fontWeight: 500,
                borderRadius: TOKENS.radius.sm,
                background: TOKENS.accent, color: "#fff",
                border: "none", cursor: agentLoading ? "wait" : "pointer",
                opacity: agentLoading || !input.trim() ? 0.5 : 1,
              }}
            >
              {agentLoading ? "..." : "Send"}
            </button>
          </form>

          {/* Resize handle (float only) */}
          {dock === "float" && (
            <div
              onMouseDown={(e) => { e.preventDefault(); setResizing(true); }}
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

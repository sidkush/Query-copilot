import { useState, useRef, useEffect, useCallback, useMemo, Suspense, Component, lazy } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useStore } from "../store";
import AnimatedBackground from "../components/animation/AnimatedBackground";

class WebGLErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e) { console.warn("WebGL fallback:", e); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}
const Background3D = lazy(() => import("../components/animation/Background3D"));
import SQLPreview from "../components/SQLPreview";
import ResultsTable from "../components/ResultsTable";
import ResultsChart from "../components/ResultsChart";
import SchemaExplorer from "../components/SchemaExplorer";
import ERDiagram from "../components/ERDiagram";
import UserDropdown from "../components/UserDropdown";
import DatabaseSwitcher from "../components/DatabaseSwitcher";

// ── Message timestamp formatting ──
function formatMessageTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return "Just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Toast notification component ──
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="glass rounded-lg px-4 py-2.5 text-sm text-white shadow-lg pointer-events-auto flex items-center gap-2"
            role="status"
          >
            <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const DASHBOARD_RE = /\b(create|build|make|generate|design|set\s*up)\b.{0,30}\bdashboard\b/i;

const DB_ICONS = {
  postgresql: <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>,
  mysql: <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>,
  snowflake: <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>,
  bigquery: <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>,
};

const DB_LABELS = {
  postgresql: { name: "PostgreSQL" },
  mysql: { name: "MySQL" },
  snowflake: { name: "Snowflake" },
  bigquery: { name: "BigQuery" },
};

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}



function DashboardChips({ question, onGenerate }) {
  const [focus, setFocus] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [audience, setAudience] = useState('');
  const [phase, setPhase] = useState('focus');

  const focusOptions = ['Sales', 'Customers', 'Orders', 'Revenue', 'Products', 'Operations'];
  const timeOptions = ['Last 7 days', 'Last 30 days', 'This quarter', 'This year', 'All time'];
  const audienceOptions = ['Executive summary', 'Operational detail', 'Technical deep-dive'];

  const handleChip = (value) => {
    if (phase === 'focus') {
      setFocus(value);
      setPhase('time');
    } else if (phase === 'time') {
      setTimeRange(value);
      setPhase('audience');
    } else {
      setAudience(value);
      onGenerate(question, { focus, timeRange, audience: value });
    }
  };

  const chips = phase === 'focus' ? focusOptions : phase === 'time' ? timeOptions : audienceOptions;
  const label = phase === 'focus' ? 'What area should this focus on?' : phase === 'time' ? 'What time range?' : "Who's the audience?";

  return (
    <div className="bg-[#111114]/70 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        <span className="text-sm font-medium text-white">{label}</span>
        {focus && <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{focus}</span>}
        {timeRange && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{timeRange}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map(chip => (
          <button key={chip} onClick={() => handleChip(chip)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/[0.08] text-[#8A8F98] hover:border-blue-500/40 hover:text-blue-300 hover:bg-blue-500/10 transition-all duration-200 cursor-pointer">
            {chip}
          </button>
        ))}
      </div>
      <button onClick={() => onGenerate(question, { focus: focus || '', timeRange: timeRange || 'All time', audience: audience || 'Executive summary' })}
        className="mt-3 text-xs text-blue-400 hover:text-blue-300 cursor-pointer transition-colors duration-200">
        Skip and generate with defaults
      </button>
    </div>
  );
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [generatingDashboard, setGeneratingDashboard] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [showER, setShowER] = useState(false);
  const [erTables, setErTables] = useState([]);
  const [erSavedPositions, setErSavedPositions] = useState(null);
  const erSaveTimerRef = useRef(null);
  const [erPanelWidth, setErPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [hoveredChatId, setHoveredChatId] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  // Dashboard integration
  const [dashboards, setDashboards] = useState([]);
  const [showDashboardPicker, setShowDashboardPicker] = useState(false);
  const [pendingTileData, setPendingTileData] = useState(null);
  const [addingTile, setAddingTile] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState("");
  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const showToast = useCallback((message, duration = 2000) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, duration }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);
  // Timestamp tick — re-render timestamps every 10s
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(iv);
  }, []);
  const messages = useStore((s) => s.messages);
  const _addMessage = useStore((s) => s.addMessage);
  const addMessage = useCallback((msg) => _addMessage({ timestamp: Date.now(), ...msg }), [_addMessage]);
  const clearMessages = useStore((s) => s.clearMessages);
  const setMessages = useStore((s) => s.setMessages);
  const user = useStore((s) => s.user);
  const connections = useStore((s) => s.connections);
  const addConnection = useStore((s) => s.addConnection);
  const removeConnection = useStore((s) => s.removeConnection);
  const activeConnId = useStore((s) => s.activeConnId);
  const setActiveConnId = useStore((s) => s.setActiveConnId);
  const chats = useStore((s) => s.chats);
  const setChats = useStore((s) => s.setChats);
  const activeChatId = useStore((s) => s.activeChatId);
  const setActiveChatId = useStore((s) => s.setActiveChatId);
  const navigate = useNavigate();
  const location = useLocation();
  const bottomRef = useRef(null);

  // Sync connections from the backend on mount — track live vs saved
  const setConnections = useStore((s) => s.setConnections);
  const [liveConnIds, setLiveConnIds] = useState(new Set());
  const [savedDbs, setSavedDbs] = useState([]); // saved configs for badge display
  useEffect(() => {
    // Fetch live connections
    const livePromise = api.listConnections()
      .then((data) => {
        const live = (data.connections || []).map((c) => ({
          conn_id: c.conn_id,
          db_type: c.db_type,
          database_name: c.database_name,
        }));
        setLiveConnIds(new Set(live.map((c) => c.conn_id)));
        if (live.length > 0) {
          setConnections(live);
          const liveIds = live.map((c) => c.conn_id);
          if (activeConnId && !liveIds.includes(activeConnId)) {
            setActiveConnId(live[0].conn_id);
          } else if (!activeConnId) {
            setActiveConnId(live[0].conn_id);
          }
        } else {
          setConnections([]);
        }
        return live;
      })
      .catch(() => []);

    // Fetch saved configs for showing disconnected badges
    api.getSavedConnections()
      .then((data) => setSavedDbs(data.configs || data.connections || []))
      .catch((e) => console.error("appendMessage failed:", e));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch chat list on mount
  useEffect(() => {
    api.listChats()
      .then((data) => setChats(data.chats || []))
      .catch((e) => console.error("appendMessage failed:", e));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load tables and saved positions for ER diagram when panel opens
  useEffect(() => {
    if (showER && erTables.length === 0) {
      api.getTables(activeConnId)
        .then((data) => {
          setErTables(data.tables || []);
          if (data.conn_id) {
            api.getERPositions(data.conn_id)
              .then((res) => setErSavedPositions(res.positions || null))
              .catch(() => {});
          }
        })
        .catch((e) => console.error("loadERTables failed:", e));
    }
  }, [showER, erTables.length, activeConnId]);

  const handleERPositionsChange = useCallback((positions) => {
    if (erSaveTimerRef.current) clearTimeout(erSaveTimerRef.current);
    erSaveTimerRef.current = setTimeout(() => {
      api.saveERPositions(positions, activeConnId).catch(() => {});
    }, 500);
  }, [activeConnId]);

  // Accept prefilled question from SchemaView navigation
  useEffect(() => {
    if (location.state?.prefill) {
      setInput(location.state.prefill);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ER panel resize
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e) => {
      const newWidth = window.innerWidth - e.clientX;
      setErPanelWidth(Math.max(280, Math.min(800, newWidth)));
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  // Resolve what conn_id to send to the API
  const resolvedConnId = activeConnId
    || (connections.length > 0 ? connections[0].conn_id : null);

  // Create chat on first message, then append messages incrementally
  const ensureChatId = useRef(activeChatId);
  useEffect(() => {
    ensureChatId.current = activeChatId;
  }, [activeChatId]);

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading || generatingDashboard) return;

    const question = input.trim();
    setInput("");
    addMessage({ type: "user", content: question });

    // Detect dashboard creation requests
    if (DASHBOARD_RE.test(question)) {
      return handleDashboardRequest(question);
    }

    setLoading(true);

    // If no active chat, create one
    let chatId = ensureChatId.current;
    if (!chatId) {
      try {
        const activeConn = connections.find((c) => c.conn_id === resolvedConnId);
        const chatData = await api.createChat(
          question.slice(0, 80),
          resolvedConnId,
          activeConn?.db_type,
          activeConn?.database_name,
        );
        chatId = chatData.chat_id;
        setActiveChatId(chatId);
        // Refresh chat list
        api.listChats().then((d) => setChats(d.chats || [])).catch((e) => console.error("appendMessage failed:", e));
      } catch {
        // Non-critical: continue without persistence
      }
    }

    // Append user message in background
    if (chatId) {
      api.appendMessage(chatId, { type: "user", content: question }).catch((e) => console.error("appendMessage failed:", e));
    }

    // ── Agent streaming flow ──
    try {
      let agentFailed = false;
      let agentChatId = chatId;
      const agentStepMsg = { type: "agent_steps", steps: [], status: "running" };
      addMessage(agentStepMsg);

      await new Promise((resolve, reject) => {
        const stream = api.agentRun(question, resolvedConnId, agentChatId, (step) => {
          if (step.chat_id && !agentChatId) agentChatId = step.chat_id;

          if (step.type === "error") {
            agentFailed = true;
            reject(new Error(step.content || "Agent error"));
            return;
          }

          if (step.type === "thinking" || step.type === "tool_call") {
            // Update the agent_steps message in-place
            agentStepMsg.steps = [...(agentStepMsg.steps || []), step];
            setMessages((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((m) => m === agentStepMsg);
              if (idx >= 0) updated[idx] = { ...agentStepMsg };
              return updated;
            });
          }

          if (step.type === "ask_user") {
            const askMsg = {
              type: "agent_ask",
              content: step.content,
              options: step.tool_input,
              chatId: agentChatId,
            };
            addMessage(askMsg);
          }

          // Final result with SQL/data
          if (step.final_answer || step.sql) {
            agentStepMsg.status = "done";
            setMessages((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((m) => m === agentStepMsg);
              if (idx >= 0) updated[idx] = { ...agentStepMsg, status: "done" };
              return updated;
            });

            if (step.sql) {
              const sqlMsg = {
                type: "sql_preview",
                question,
                sql: step.sql,
                rawSQL: step.sql,
                model: "agent",
                connId: resolvedConnId,
              };
              addMessage(sqlMsg);
              if (chatId) api.appendMessage(chatId, sqlMsg).catch(() => {});
            }
            if (step.final_answer) {
              const ansMsg = { type: "assistant", content: step.final_answer };
              addMessage(ansMsg);
              if (chatId) api.appendMessage(chatId, ansMsg).catch(() => {});
            }
            if (step.columns && step.rows && step.rows.length > 0) {
              const resMsg = {
                type: "result",
                question,
                sql: step.sql,
                columns: step.columns,
                data: step.rows,
                rowCount: step.rows.length,
                summary: step.final_answer || "",
                chartSuggestion: step.chart_suggestion,
              };
              addMessage(resMsg);
              if (chatId) api.appendMessage(chatId, resMsg).catch(() => {});
            }
            resolve();
          }

          if (step.type === "result" && !step.final_answer && !step.sql) {
            resolve();
          }
        });

        // Timeout fallback
        setTimeout(() => {
          if (!agentFailed) resolve();
        }, 35000);
      }).catch(async (err) => {
        // Fallback to single-shot generate if agent fails
        console.warn("Agent failed, falling back to generateSQL:", err.message);
        try {
          const result = await api.generateSQL(question, resolvedConnId);
          if (result.error) {
            addMessage({ type: "error", content: result.error });
          } else {
            const sqlMsg = {
              type: "sql_preview",
              question,
              sql: result.formatted_sql || result.sql,
              rawSQL: result.sql,
              model: result.model_used,
              latency: result.latency_ms,
              connId: result.conn_id,
              dbLabel: result.database_name,
            };
            addMessage(sqlMsg);
            if (chatId) api.appendMessage(chatId, sqlMsg).catch(() => {});
          }
        } catch (fallbackErr) {
          addMessage({ type: "error", content: fallbackErr.message });
        }
      });
    } catch (err) {
      const errMsg = { type: "error", content: err.message };
      addMessage(errMsg);
      if (chatId) api.appendMessage(chatId, errMsg).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  // ── Auto-dashboard generation ──
  const handleDashboardRequest = async (question) => {
    // Phase 1: Show guided question chips
    const chipMsg = {
      type: "dashboard_chips",
      question,
      phase: "focus",
    };
    addMessage(chipMsg);
  };

  const handleDashboardChipSelect = async (question, preferences) => {
    setGeneratingDashboard(true);
    addMessage({ type: "system", content: `Building your dashboard with preferences: ${preferences.focus || 'auto'}, ${preferences.timeRange || 'all time'}, ${preferences.audience || 'general'}...` });

    try {
      const result = await api.generateDashboardV2(question, resolvedConnId, preferences);
      const tabs = result.tabs || [];
      const totalTiles = tabs.reduce((sum, tab) =>
        sum + tab.sections?.reduce((s, sec) => s + (sec.tiles?.length || 0), 0) || 0, 0);

      if (totalTiles === 0) {
        addMessage({ type: "error", content: "Could not generate dashboard tiles from the available data." });
        return;
      }

      // Extract a dashboard name from the question
      const m = question.match(/(?:create|build|make|generate|design)\s+(?:a\s+|me\s+a\s+)?(?:professional\s+)?(.+?)\s+dashboard/i);
      const dashName = m ? m[1].trim().replace(/^(a|an|the|my)\s+/i, "") + " Dashboard" : "Analytics Dashboard";

      addMessage({ type: "system", content: `Saving dashboard "${dashName}"...` });

      // Create new dashboard in the backend
      const d = await api.createDashboard(dashName);

      // Add guaranteed IDs if missing and build properly formatted tabs
      const generateId = () => Math.random().toString(36).substring(2, 10);

      const updatedTabs = tabs.map((tab, tIdx) => ({
        ...tab,
        id: tab.id || generateId(),
        order: tab.order || tIdx,
        sections: (tab.sections || []).map((sec, sIdx) => {
          let currentX = 0;
          let currentY = 0;
          let rowMaxH = 0;

          return {
            ...sec,
            id: sec.id || generateId(),
            order: sec.order || sIdx,
            collapsed: false,
            layout: [],
            tiles: (sec.tiles || []).map((tile, i) => {
              const tileId = tile.id || generateId();
              const cType = tile.chartType || "bar";
              const w = cType === "kpi" ? 3 : 6;
              const h = cType === "kpi" ? 2 : 4;

              if (currentX + w > 12) {
                currentX = 0;
                currentY += rowMaxH;
                rowMaxH = 0;
              }

              const x = currentX;
              const y = currentY;

              currentX += w;
              rowMaxH = Math.max(rowMaxH, h);

              // populate layout inline as well to guarantee it works in Dashboards UI
              return {
                ...tile,
                id: tileId,
                chartType: cType,
                question: tile.question || question,
                _layout: {
                  i: tileId,
                  x,
                  y,
                  w,
                  h,
                  minW: cType === "kpi" ? 2 : 3,
                  minH: cType === "kpi" ? 1 : 3,
                }
              };
            })
          };
        })
      }));

      // Extract layout elements back out into section root
      updatedTabs.forEach(tab => {
        tab.sections.forEach(sec => {
          sec.layout = sec.tiles.map(t => t._layout).filter(Boolean);
          sec.tiles.forEach(t => delete t._layout);
        });
      });

      await api.updateDashboard(d.id, { tabs: updatedTabs });

      // Update local state if needed
      setDashboards(prev => [...prev, { id: d.id, name: d.name, tile_count: totalTiles }]);
      
      const successMsg = {
        type: "system",
        content: `Dashboard "${dashName}" successfully created!`
      };
      addMessage(successMsg);
      if (ensureChatId.current) api.appendMessage(ensureChatId.current, successMsg).catch(() => {});

      // Navigate to Analytics
      setTimeout(() => {
        navigate("/dashboard");
      }, 1000);

    } catch (err) {
      addMessage({ type: "error", content: "Dashboard generation failed: " + (err.message || "Unknown error") });
    } finally {
      setGeneratingDashboard(false);
    }
  };

  const handleApprove = async (sql, question, connId, originalSql = null) => {
    setExecuting(true);
    try {
      const cid = connId || resolvedConnId;
      const result = await api.executeSQL(sql, question, cid, originalSql);
      if (result.error) {
        const errMsg = { type: "error", content: result.error };
        addMessage(errMsg);
        if (ensureChatId.current) api.appendMessage(ensureChatId.current, errMsg).catch((e) => console.error("appendMessage failed:", e));
      } else {
        const resMsg = {
          type: "result",
          question,
          sql,
          summary: result.summary,
          columns: result.columns || [],
          rows: result.rows || [],
          rowCount: result.row_count,
          latency: result.latency_ms,
          dbLabel: result.database_name,
          connId: result.conn_id,
          dailyUsage: result.daily_usage || null,
        };
        addMessage(resMsg);
        if (ensureChatId.current) api.appendMessage(ensureChatId.current, resMsg).catch((e) => console.error("appendMessage failed:", e));
      }
    } catch (err) {
      const errMsg = { type: "error", content: err.message };
      addMessage(errMsg);
      if (ensureChatId.current) api.appendMessage(ensureChatId.current, errMsg).catch((e) => console.error("appendMessage failed:", e));
    } finally {
      setExecuting(false);
    }
  };

  // ── Dashboard integration ──
  useEffect(() => {
    api.getDashboards().then((res) => setDashboards(res.dashboards || [])).catch(() => {});
  }, []);

  const handleAddToDashboard = useCallback((tileData) => {
    setPendingTileData(tileData);
    setShowDashboardPicker(true);
    // Refresh dashboards list
    api.getDashboards().then((res) => setDashboards(res.dashboards || [])).catch(() => {});
  }, []);

  const handlePickDashboard = useCallback(async (dashboardId) => {
    if (!pendingTileData || addingTile) return;
    setAddingTile(true);
    try {
      await api.addDashboardTile(dashboardId, {
        title: pendingTileData.question || "Query Result",
        chartType: pendingTileData.chartType,
        columns: pendingTileData.columns,
        rows: pendingTileData.rows,
        selectedMeasure: pendingTileData.selectedMeasure,
        activeMeasures: pendingTileData.activeMeasures,
        palette: pendingTileData.palette,
        question: pendingTileData.question,
        sql: pendingTileData.sql,
      });
      setShowDashboardPicker(false);
      setPendingTileData(null);
      addMessage({ type: "system", text: "Chart added to dashboard!" });
    } catch (err) {
      addMessage({ type: "system", text: "Failed to add to dashboard: " + err.message });
    } finally {
      setAddingTile(false);
    }
  }, [pendingTileData, addingTile, addMessage]);

  const handleCreateAndAdd = useCallback(async () => {
    if (!newDashboardName.trim() || !pendingTileData || addingTile) return;
    setAddingTile(true);
    try {
      const d = await api.createDashboard(newDashboardName.trim());
      await api.addDashboardTile(d.id, {
        title: pendingTileData.question || "Query Result",
        chartType: pendingTileData.chartType,
        columns: pendingTileData.columns,
        rows: pendingTileData.rows,
        selectedMeasure: pendingTileData.selectedMeasure,
        activeMeasures: pendingTileData.activeMeasures,
        palette: pendingTileData.palette,
        question: pendingTileData.question,
        sql: pendingTileData.sql,
      });
      setDashboards((prev) => [...prev, { id: d.id, name: d.name, tile_count: 1 }]);
      setShowDashboardPicker(false);
      setPendingTileData(null);
      setNewDashboardName("");
      addMessage({ type: "system", text: `Chart added to "${d.name}"!` });
    } catch (err) {
      addMessage({ type: "system", text: "Failed: " + err.message });
    } finally {
      setAddingTile(false);
    }
  }, [newDashboardName, pendingTileData, addingTile, addMessage]);

  const handleFeedback = async (question, sql, isCorrect) => {
    try {
      await api.sendFeedback(question, sql, isCorrect);
      addMessage({
        type: "system",
        content: isCorrect
          ? "Thanks! This query has been saved as a training example."
          : "Thanks for the feedback. We'll improve.",
      });
    } catch {}
  };

  // Chat history operations
  const handleNewChat = () => {
    setActiveChatId(null);
    clearMessages();
    setShowSidebar(false);
  };

  const handleLoadChat = async (chatId) => {
    try {
      const data = await api.loadChat(chatId);
      setActiveChatId(chatId);
      // Normalize messages: handle legacy format where `role` was used instead of `type`
      const normalized = (data.messages || []).map((msg) => {
        if (msg.type) return msg; // Already has type — no conversion needed
        // Legacy messages with `role` field: map to frontend's type format
        if (msg.role === "user") return { type: "user", content: msg.content };
        if (msg.role === "assistant") return { type: "system", content: msg.content };
        if (msg.role === "error") return { type: "error", content: msg.content };
        return { type: "system", content: msg.content || "" };
      });
      setMessages(normalized);
      setShowSidebar(false);
    } catch (err) {
      console.error("Failed to load chat:", err);
    }
  };

  const handleDeleteChat = async (chatId) => {
    try {
      await api.deleteChat(chatId);
      setChats(chats.filter((c) => c.chat_id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        clearMessages();
      }
    } catch {}
  };

  return (
    <div className="flex flex-1 h-full bg-black text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Chat history sidebar */}
      <AnimatePresence>
      {showSidebar && (
        <motion.div
          initial={{ x: -288, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -288, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-72 bg-[#0a0a0c] border-r border-white/[0.06] flex-shrink-0 flex flex-col overflow-hidden relative z-30 shadow-2xl">
          <div className="p-3 border-b border-white/[0.06] space-y-2 flex-shrink-0">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-lg transition-all duration-300 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5C5F66] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search chats..."
                className="w-full rounded-lg bg-white/5 pl-8 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {chats.length === 0 && (
              <p className="text-xs text-[#5C5F66] text-center mt-4">No chat history yet</p>
            )}
            {chats.filter((chat) => {
              if (!historySearch.trim()) return true;
              const term = historySearch.toLowerCase();
              const title = (chat.title || "Untitled").toLowerCase();
              return title.includes(term);
            }).length === 0 && chats.length > 0 && historySearch.trim() && (
              <p className="text-xs text-[#5C5F66] text-center mt-4">No matching chats</p>
            )}
            {chats.filter((chat) => {
              if (!historySearch.trim()) return true;
              const term = historySearch.toLowerCase();
              const title = (chat.title || "Untitled").toLowerCase();
              return title.includes(term);
            }).map((chat) => {
              const isActive = activeChatId === chat.chat_id;
              const isHovered = hoveredChatId === chat.chat_id;
              const dbInfo = DB_LABELS[chat.db_type] || null;
              return (
                <motion.div
                  key={chat.chat_id}
                  whileHover={{ x: 4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={`relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                    isActive
                      ? "bg-white/10 border border-white/5"
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                  onClick={() => handleLoadChat(chat.chat_id)}
                  onMouseEnter={() => setHoveredChatId(chat.chat_id)}
                  onMouseLeave={() => setHoveredChatId(null)}
                >
                  {dbInfo && (
                    <span className="text-sm flex-shrink-0">{DB_ICONS[chat.db_type]}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-300 truncate">{chat.title || "Untitled"}</p>
                    <p className="text-[10px] text-[#5C5F66]">{relativeTime(chat.updated_at)}</p>
                  </div>
                  {isHovered && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChat(chat.chat_id);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 text-[#5C5F66] hover:text-red-400 transition cursor-pointer"
                      aria-label="Delete chat"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Schema sidebar (toggled separately) */}
      <AnimatePresence>
      {showSchema && !showSidebar && (
        <motion.div
          initial={{ x: -288, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -288, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-72 bg-[#0a0a0c] border-r border-white/[0.06] flex-shrink-0"
        >
          <SchemaExplorer />
        </motion.div>
      )}
      </AnimatePresence>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 z-20">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (showSidebar) {
                  setShowSidebar(false);
                } else {
                  setShowSidebar(true);
                  setShowSchema(false);
                }
              }}
              className={`p-2 rounded-lg hover:bg-white/10 transition-all duration-200 cursor-pointer ${showSidebar ? "bg-white/10" : ""}`}
              title="Toggle chat history"
              aria-label="Toggle chat history"
            >
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
              </svg>
            </button>

            <h1 className="text-lg font-semibold text-white tracking-tight">Query<span className="text-indigo-400">Copilot</span></h1>

            <DatabaseSwitcher
              connections={connections}
              activeConnId={activeConnId || connections[0]?.conn_id || null}
              onSwitch={setActiveConnId}
            />
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowER(!showER)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer ${
                showER
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-[#8A8F98] hover:text-white hover:bg-white/[0.07]"
              }`}
              title="Toggle ER Diagram"
              aria-label="Toggle ER Diagram"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 7h4M7 10v5M17 10v9" />
              </svg>
              ER Diagram
            </button>
            <button
              onClick={() => { clearMessages(); setActiveChatId(null); }}
              className="text-xs text-[#5C5F66] hover:text-[#8A8F98] transition cursor-pointer"
            >
              Clear chat
            </button>
            <UserDropdown />
          </div>
        </header>

        {/* 3D ambient background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.32, zIndex: 0 }}>
          <WebGLErrorBoundary fallback={<AnimatedBackground />}>
            <Suspense fallback={null}>
              <Background3D />
            </Suspense>
          </WebGLErrorBoundary>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 relative z-10 pb-32">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Ask your data anything</h2>
              <p className="text-[#5C5F66] max-w-md">
                Type a question in plain English. QueryCopilot will generate SQL,
                show it for your review, and run it on approval.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
                {[
                  "How many orders were placed last month?",
                  "What are the top 5 products by revenue?",
                  "Show me daily signups for the past week",
                  "Average order value by customer segment",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="text-left text-sm text-[#8A8F98] bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/[0.1] rounded-2xl px-5 py-4 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="max-w-4xl mx-auto"
            >
              {msg.type === "user" && (
                <div className="flex flex-col items-end">
                  <div className="bg-white/[0.06] backdrop-blur-md border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.4)] text-slate-100 rounded-2xl rounded-tr-sm px-5 py-3 max-w-xl text-[15px] font-medium leading-relaxed">
                    {msg.content}
                  </div>
                  {msg.timestamp && <span className="text-[10px] text-[#5C5F66] mt-1 mr-1">{formatMessageTime(msg.timestamp)}</span>}
                </div>
              )}

              {msg.type === "sql_preview" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="space-y-2"
                >
                  <div className="text-xs text-[#5C5F66]">
                    {msg.dbLabel && <span className="text-blue-400 font-medium">[{msg.dbLabel}] </span>}
                    Generated with {msg.model} in {Math.round(msg.latency)}ms
                  </div>
                  <SQLPreview
                    sql={msg.sql}
                    onApprove={(sql, origSql) => handleApprove(sql, msg.question, msg.connId, origSql)}
                    onReject={() => addMessage({ type: "system", content: "Query rejected." })}
                    loading={executing}
                    onCopySQL={() => showToast("Copied to clipboard!")}
                  />
                  {msg.timestamp && <span className="text-[10px] text-[#5C5F66]">{formatMessageTime(msg.timestamp)}</span>}
                </motion.div>
              )}

              {msg.type === "result" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="space-y-3"
                >
                  {msg.summary && (
                    <div className="bg-transparent border-l-2 border-white/20 pl-4 py-1">
                      {msg.dbLabel && <p className="text-xs text-slate-400 font-medium mb-1">[{msg.dbLabel}]</p>}
                      <p className="text-slate-200 text-[15px] leading-relaxed">{msg.summary}</p>
                      <p className="text-[11px] text-[#5C5F66] mt-2">
                        {msg.rowCount} rows in {Math.round(msg.latency)}ms
                      </p>
                    </div>
                  )}
                  {msg.rows.length > 0 && (
                    <>
                      <ResultsChart
                        columns={msg.columns}
                        rows={msg.rows}
                        onAddToDashboard={handleAddToDashboard}
                        question={msg.question}
                        sql={msg.sql}
                      />
                      <ResultsTable columns={msg.columns} rows={msg.rows} />
                    </>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#5C5F66]">Was this correct?</span>
                    <button
                      onClick={() => handleFeedback(msg.question, msg.sql, true)}
                      className="text-xs px-2.5 py-1 rounded-lg glass hover:bg-emerald-900/30 text-[#8A8F98] hover:text-green-400 transition-all duration-200 cursor-pointer"
                      aria-label="Query result was correct"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => handleFeedback(msg.question, msg.sql, false)}
                      className="text-xs px-2.5 py-1 rounded-lg glass hover:bg-red-900/30 text-[#8A8F98] hover:text-red-400 transition-all duration-200 cursor-pointer"
                      aria-label="Query result was incorrect"
                    >
                      No
                    </button>
                  </div>
                  {msg.timestamp && <span className="text-[10px] text-[#5C5F66]">{formatMessageTime(msg.timestamp)}</span>}
                  {/* Daily usage remaining */}
                  {msg.dailyUsage && !msg.dailyUsage.unlimited && (
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.dailyUsage.remaining <= 2 ? "bg-red-900/20 border border-red-800/50" : msg.dailyUsage.remaining <= 5 ? "bg-amber-900/20 border border-amber-800/50" : "bg-slate-800/50 border border-white/[0.08]/50"}`}>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                      </svg>
                      <span className={msg.dailyUsage.remaining <= 2 ? "text-red-400" : msg.dailyUsage.remaining <= 5 ? "text-amber-400" : "text-[#8A8F98]"}>
                        {msg.dailyUsage.remaining === 0
                          ? `Daily limit reached (${msg.dailyUsage.daily_limit}/${msg.dailyUsage.daily_limit}). Upgrade for more.`
                          : `${msg.dailyUsage.remaining} of ${msg.dailyUsage.daily_limit} queries remaining today`}
                        <span className="text-[#5C5F66] ml-1">({msg.dailyUsage.plan} plan)</span>
                      </span>
                    </div>
                  )}
                </motion.div>
              )}

              {msg.type === "dashboard_chips" && (
                <DashboardChips question={msg.question} onGenerate={handleDashboardChipSelect} />
              )}



              {msg.type === "agent_steps" && (
                <div className="bg-[#111114]/70 border border-white/[0.06] rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-blue-400 font-medium mb-1">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {msg.status === "done" ? "Agent completed" : "Agent working..."}
                  </div>
                  {(msg.steps || []).map((step, si) => (
                    <div key={si} className="text-xs text-[#6B6F76] pl-4 flex items-center gap-1.5">
                      {step.type === "thinking" && <span className="italic text-[#5C5F66]">Analyzing...</span>}
                      {step.type === "tool_call" && (
                        <span>
                          <span className="text-blue-400/70">{step.tool_name}</span>
                          {step.tool_result && <span className="text-emerald-500/60 ml-1">done</span>}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {msg.type === "agent_ask" && (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
                  <p className="text-sm text-amber-200 mb-2">{msg.content}</p>
                  {msg.options && msg.options.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {msg.options.map((opt, oi) => (
                        <button key={oi}
                          onClick={() => api.agentRespond(msg.chatId, opt)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
                        >{opt}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {msg.type === "error" && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm" role="alert">
                  {msg.content}
                  {msg.timestamp && <div className="text-[10px] text-[#5C5F66] mt-1">{formatMessageTime(msg.timestamp)}</div>}
                </div>
              )}

              {msg.type === "system" && (
                <div className="text-center text-xs text-[#5C5F66]">
                  {msg.content || msg.text}
                  {msg.timestamp && <span className="ml-2 text-[10px] text-slate-700">{formatMessageTime(msg.timestamp)}</span>}
                </div>
              )}
            </motion.div>
          ))}

          <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="max-w-4xl mx-auto"
              role="status"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg">
                  <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div className="bg-transparent pl-4 py-1 flex items-center max-w-md">
                  <div className="flex items-center gap-3 text-[#8A8F98] text-[15px]">
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((dot) => (
                        <motion.div
                          key={dot}
                          className="w-1.5 h-1.5 bg-slate-400 rounded-full"
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
                        />
                      ))}
                    </div>
                    {executing ? "Analyzing results..." : "Generating SQL..."}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          <AnimatePresence>
          {generatingDashboard && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="max-w-4xl mx-auto"
            >
              <div className="flex items-center gap-3 text-[#8A8F98] text-sm glass-card border-blue-500/20 rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map((dot) => (
                    <motion.div
                      key={dot}
                      className="w-2 h-2 bg-blue-500 rounded-full"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
                    />
                  ))}
                </div>
                Building dashboard — analyzing schema, generating queries, executing...
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>

        {/* Floating Minimalist Input Pill */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-3xl z-50">
          <motion.form 
            onSubmit={handleAsk} 
            className="flex items-center gap-2 rounded-full p-2 shadow-2xl transition-all duration-300 pointer-events-auto"
            style={{ 
              background: 'rgba(20, 20, 22, 0.4)', 
              backdropFilter: 'blur(40px) saturate(1.8)', 
              WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: isInputFocused ? '0 20px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.15)' : '0 10px 30px rgba(0,0,0,0.6)'
            }}
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: isInputFocused ? 1.02 : 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder="Ask anything..."
              aria-label="Ask a question about your data"
              className="flex-1 bg-transparent px-5 py-2.5 text-[15px] text-white placeholder-[#8A8F98] focus:outline-none transition-all duration-200"
              disabled={loading}
              style={{ paddingLeft: '24px' }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex items-center justify-center w-[42px] h-[42px] shrink-0 rounded-full bg-white text-black hover:scale-105 disabled:opacity-30 disabled:hover:scale-100 transition-all duration-300 cursor-pointer"
              aria-label="Send question"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          </motion.form>
        </div>
      </div>

      {/* ER Diagram side panel (resizable) */}
      {showER && (
        <>
          {/* Resize handle */}
          <div
            onMouseDown={handleResizeStart}
            className="w-1.5 flex-shrink-0 bg-slate-800/40 hover:bg-blue-500/40 transition-colors cursor-col-resize relative group"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-600 group-hover:bg-blue-400 transition-colors" />
          </div>
          <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex-shrink-0 glass flex flex-col"
            style={{ width: erPanelWidth }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                ER Diagram
              </h3>
              <button
                onClick={() => setShowER(false)}
                className="p-1 rounded hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close ER Diagram"
              >
                <svg className="w-4 h-4 text-[#5C5F66]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {erTables.length > 0 ? (
                <ERDiagram tables={erTables} compact savedPositions={erSavedPositions} onPositionsChange={handleERPositionsChange} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-2 text-[#5C5F66] text-sm">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Loading schema...
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} />

      {/* ── Dashboard Picker Modal ── */}
      {showDashboardPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setShowDashboardPicker(false); setPendingTileData(null); }}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-sm shadow-2xl fade-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">Add to Dashboard</h3>
            <p className="text-xs text-[#5C5F66] mb-4">Choose a dashboard or create a new one</p>

            {/* Existing dashboards */}
            {dashboards.length > 0 && (
              <div className="space-y-1.5 mb-4 max-h-48 overflow-auto">
                {dashboards.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handlePickDashboard(d.id)}
                    disabled={addingTile}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg glass hover:bg-white/[0.07] hover:border-blue-500/20 text-left transition-all duration-200 cursor-pointer disabled:opacity-50"
                  >
                    <div>
                      <p className="text-sm text-white font-medium">{d.name}</p>
                      <p className="text-xs text-[#5C5F66]">{d.tile_count || 0} tile{d.tile_count !== 1 ? "s" : ""}</p>
                    </div>
                    <svg className="w-4 h-4 text-[#5C5F66]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* Create new */}
            <div className="border-t border-white/[0.06] pt-3">
              <p className="text-xs text-[#8A8F98] mb-2">Or create new dashboard</p>
              <div className="flex gap-2">
                <input
                  value={newDashboardName}
                  onChange={(e) => setNewDashboardName(e.target.value)}
                  placeholder="e.g., Marketing Dashboard"
                  className="flex-1 glass-input rounded-lg px-3 py-2 text-sm text-white focus:outline-none input-glow"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateAndAdd()}
                />
                <button
                  onClick={handleCreateAndAdd}
                  disabled={!newDashboardName.trim() || addingTile}
                  className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm rounded-lg hover:from-indigo-500 hover:to-violet-500 transition-all duration-200 disabled:opacity-40 cursor-pointer shadow-lg shadow-indigo-500/20 btn-glow"
                >
                  {addingTile ? "..." : "Create"}
                </button>
              </div>
            </div>

            <button
              onClick={() => { setShowDashboardPicker(false); setPendingTileData(null); }}
              className="mt-3 w-full text-center text-xs text-[#5C5F66] hover:text-[#8A8F98] transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

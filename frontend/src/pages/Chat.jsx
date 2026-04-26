import { useState, useRef, useEffect, useCallback, Suspense, Component, lazy } from "react";
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
import ReactMarkdown from "react-markdown";
import { MD_COMPONENTS_COMFY, REMARK_PLUGINS } from "../lib/agentMarkdown";
import SQLPreview from "../components/SQLPreview";
import AgentStepRenderer from "../components/agent/AgentStepRenderer";
import ProvenanceChip from "../components/agent/ProvenanceChip";
import PlanArtifact from "../components/agent/PlanArtifact";
import ResultPreview from "../components/agent/ResultPreview";
import SafeTextWrapper from "../components/agent/SafeTextWrapper";
import ClaimChip from "../components/agent/ClaimChip";
import ResultsTable from "../components/ResultsTable";
import LegacyResultChart from "../components/dashboard/lib/LegacyResultChart";
import ChartEditModal from "../components/dashboard/lib/ChartEditModal";
import SchemaExplorer from "../components/SchemaExplorer";
import ERDiagram from "../components/ERDiagram";
import UserDropdown from "../components/UserDropdown";
import DatabaseSwitcher from "../components/DatabaseSwitcher";
import AskDBLogo from "../components/AskDBLogo";
import behaviorEngine from "../lib/behaviorEngine";
import VoiceButton from "../components/voice/VoiceButton";
import VoiceIndicator from "../components/voice/VoiceIndicator";
import useSpeechRecognition from "../hooks/useSpeechRecognition";
import useSpeechSynthesis from "../hooks/useSpeechSynthesis";

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
function ToastContainer({ toasts, onDismiss: _onDismiss }) {
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

// Live timer shown inside the agent step card while working.
// Ticks once per second; freezes automatically when active=false.
function AgentElapsedTimer({ startTime, active }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active || !startTime) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime, active]);
  if (!active) return null;
  return (
    <span className="tabular-nums" style={{ color: 'var(--text-muted)', fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>
      {elapsed}s
      {elapsed >= 20 && (
        <span style={{ color: 'rgba(245,158,11,0.7)', marginLeft: 6 }}>
          complex query…
        </span>
      )}
    </span>
  );
}

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



function DashboardChips({ question, onGenerate, schemaFocusOptions }) {
  const [focus, setFocus] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [audience, setAudience] = useState('');
  const [phase, setPhase] = useState('focus');

  const focusOptions = schemaFocusOptions && schemaFocusOptions.length > 0
    ? schemaFocusOptions
    : ['General Overview'];
  const timeOptions = ['Last 7 days', 'Last 30 days', 'This quarter', 'This year', 'All time'];
  const audienceOptions = ['Executive summary', 'Operational detail', 'Technical deep-dive'];

  const handleCancel = async () => {
    if (!currentPlan?.plan_id) return;
    try {
      await fetch(`/api/v1/agent/cancel?plan_id=${encodeURIComponent(currentPlan.plan_id)}`, { method: 'POST' });
    } catch (err) {
      console.error('cancel failed', err);
    }
  };

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
    <div className="border rounded-xl p-4" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)', borderColor: 'var(--border-default)' }}>
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {focus && <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{focus}</span>}
        {timeRange && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{timeRange}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map(chip => (
          <button key={chip} onClick={() => handleChip(chip)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border text-[var(--text-secondary)] hover:border-blue-500/40 hover:text-blue-300 hover:bg-blue-500/10 transition-all duration-200 cursor-pointer" style={{ borderColor: 'var(--border-default)' }}>
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
  const [currentPlan, setCurrentPlan] = useState(null);
  const [currentPreview, setCurrentPreview] = useState(null);
  const [cancelled, setCancelled] = useState(false);
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
  // Dynamic AI-generated starter suggestions based on connected DB schema
  const [starterSuggestions, setStarterSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionsConnRef = useRef(null);
  // Predictive suggestions — 3 next-action predictions after every response
  const [predictions, setPredictions] = useState([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  // Autocomplete suggestions
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const autocompleteTimer = useRef(null);
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
  const connections = useStore((s) => s.connections);
  const activeConnId = useStore((s) => s.activeConnId);
  const setActiveConnId = useStore((s) => s.setActiveConnId);
  const turboStatus = useStore((s) => s.turboStatus);
  const chats = useStore((s) => s.chats);
  const setChats = useStore((s) => s.setChats);
  const activeChatId = useStore((s) => s.activeChatId);
  const setActiveChatId = useStore((s) => s.setActiveChatId);
  const navigate = useNavigate();
  const location = useLocation();
  const bottomRef = useRef(null);
  const [editChart, setEditChart] = useState(null);
  const agentPersona = useStore((s) => s.agentPersona);
  const agentPermissionMode = useStore((s) => s.agentPermissionMode);
  const pendingProvenanceChip = useStore((s) => s.pendingProvenanceChip);

  // ── Voice mode hooks ──
  const chatFormRef = useRef(null);
  const voiceInputRef = useRef(null); // stash voice text for handleAsk to pick up
  const { isSpeaking, speak, stop: stopSpeaking, supported: ttsSupported } = useSpeechSynthesis();
  const { isListening, interimTranscript, startListening, stopListening, supported: sttSupported } = useSpeechRecognition({
    onTranscript: (text) => {
      if (text.trim()) {
        voiceInputRef.current = text.trim();
        setInput(text.trim());
        // Submit on next tick so the state has settled
        setTimeout(() => {
          if (chatFormRef.current) {
            chatFormRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }, 50);
      }
    },
  });

  // Sync connections from the backend on mount — track live vs saved
  const setConnections = useStore((s) => s.setConnections);
  const [liveConnIds, setLiveConnIds] = useState(new Set());
  const [_savedDbs, setSavedDbs] = useState([]); // saved configs for badge display
  useEffect(() => {
    // Fetch live connections
    api.listConnections()
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
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch chat list on mount
  useEffect(() => {
    api.listChats()
      .then((data) => setChats(data.chats || []))
      .catch(() => {});
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
        .catch((e) => void e);
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

  // Fetch turbo status for active connection
  const setTurboStatus = useStore((s) => s.setTurboStatus);
  useEffect(() => {
    if (!resolvedConnId) return;
    api.getTurboStatus(resolvedConnId)
      .then((status) => setTurboStatus(resolvedConnId, status))
      .catch(() => {}); // turbo not available — ignore
  }, [resolvedConnId, setTurboStatus]);

  // Fetch dynamic starter suggestions when connection changes
  useEffect(() => {
    if (!resolvedConnId) {
      // No connection — clear stale suggestions
      setStarterSuggestions([]);
      suggestionsConnRef.current = null;
      return;
    }
    if (resolvedConnId === suggestionsConnRef.current) return;
    suggestionsConnRef.current = resolvedConnId;
    setStarterSuggestions([]); // Clear old suggestions before fetching new ones
    setSuggestionsLoading(true);
    api.getSuggestions(resolvedConnId)
      .then((data) => {
        // Only update if this is still the active connection
        if (suggestionsConnRef.current !== resolvedConnId) return;
        if (data.suggestions && data.suggestions.length > 0) {
          setStarterSuggestions(data.suggestions.slice(0, 4));
        }
      })
      .catch(() => {
        // Clear ref so user can retry by switching away and back
        if (suggestionsConnRef.current === resolvedConnId) {
          suggestionsConnRef.current = null;
        }
      })
      .finally(() => setSuggestionsLoading(false));
  }, [resolvedConnId]);

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
    setPredictions([]); // Clear predictions on new message
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
        api.listChats().then((d) => setChats(d.chats || [])).catch(() => {});
      } catch {
        // Non-critical: continue without persistence
      }
    }

    // Append user message in background
    if (chatId) {
      api.appendMessage(chatId, { type: "user", content: question }).catch(() => {});
    }

    // ── Agent streaming flow ──
    // Hoisted out of try{} so the finally{} safety net can still see the binding
    // when an early throw happens inside the streaming setup.
    // Stable ID for this agent_steps message. Reference-identity breaks as
    // soon as we spread the object back into the messages array, so every
    // push/mark uses __id to locate the live copy in state.
    const stepMsgId = `agent-steps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agentStepMsg = {
      __id: stepMsgId,
      type: "agent_steps",
      steps: [],
      status: "running",
      startTime: Date.now(),
      chatId,
    };

    // Event types we render inline within the agent step feed. Every one lands
    // in agentStepMsg.steps so chat history replay has the full reasoning trail.
    const STEP_TYPES = new Set([
      "thinking", "tool_call", "tool_result", "tier_routing", "tier_hit",
      "plan", "progress", "cached_result", "live_correction",
      "budget_extension", "ask_user", "agent_checkpoint",
      "signature_delta", "verification", "phase_start", "phase_complete", "sql-generation",
    ]);

    // Push a step into the message feed. Locate by stable __id because the
    // previous entry was already replaced with a spread copy on the last push.
    const pushStep = (step) => {
      agentStepMsg.steps = [...(agentStepMsg.steps || []), step];
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m && m.__id === stepMsgId);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...agentStepMsg };
        return updated;
      });
    };

    // Mark the step feed done so the live timer halts + status glyph flips to ✓.
    const markStepsDone = () => {
      agentStepMsg.status = "done";
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m && m.__id === stepMsgId);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...agentStepMsg, status: "done" };
        return updated;
      });
    };

    try {
      let agentFailed = false;
      let agentChatId = chatId;
      // When turbo/memory tier answers instantly, resolve early and skip the
      // redundant final_answer message that the backend may still emit.
      let resolvedViaTurbo = false;
      // Cross-event dedupe: backend can emit the same final_answer on more
      // than one SSE step (e.g. an interim `synthesizing` step carrying
      // final_answer + a trailing `result` step with the same text). Without
      // this guard, addMessage(ansMsg) fires twice and the chat shows the
      // analysis card stacked on itself.
      let _lastFinalAnswerAdded = null;
      let _lastSqlAdded = null;
      addMessage(agentStepMsg);

      await new Promise((resolve, reject) => {
        api.agentRun(question, resolvedConnId, agentChatId, (step) => {
          if (step.chat_id && !agentChatId) {
            agentChatId = step.chat_id;
            agentStepMsg.chatId = agentChatId;
          }

          if (step.type === "error") {
            agentFailed = true;
            // Surface the error inside the step feed first so the user sees
            // where it broke, then reject to trigger the fallback path.
            pushStep(step);
            markStepsDone();
            useStore.getState().clearProvenanceChip();
            reject(new Error(step.content || "Agent error"));
            return;
          }

          if (step.__event === "provenance_chip") {
            const chipData = typeof step.data === "string" ? JSON.parse(step.data) : step;
            useStore.getState().setProvenanceChip(chipData);
            return;
          }

          if (step.type === "plan_artifact") {
            setCurrentPlan(step);
            return;
          }

          if (step.type === "cancel_ack") {
            setCancelled(true);
            return;
          }

          if (STEP_TYPES.has(step.type)) {
            pushStep(step);
          }

          // Turbo Mode instant answer — show immediately and stop the spinner.
          // DuckDB twin answered sub-100ms; don't make the user wait for the
          // live-verification pass before seeing the result.
          if (step.type === "cached_result" && step.content) {
            resolvedViaTurbo = true;
            setLoading(false);
            const turboMsg = {
              type: "assistant",
              content: step.content,
              turboInstant: true,
              cacheAge: step.cache_age_seconds,
              timestamp: Date.now(),
            };
            addMessage(turboMsg);
            if (chatId) api.appendMessage(chatId, turboMsg).catch(() => {});
            markStepsDone();
            resolve();
          }

          // Live correction — update the existing turboInstant message in-place
          // instead of adding a second near-identical message.
          if (step.type === "live_correction") {
            setMessages((prev) => {
              const updated = [...prev];
              // Find the most recent turboInstant message and update it
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].turboInstant) {
                  const isConfirmed = step.diff_summary?.toLowerCase().startsWith("confirmed");
                  updated[i] = {
                    ...updated[i],
                    turboInstant: false,          // remove pulsing "verifying" dot
                    turboVerified: isConfirmed,   // show ✓ badge
                    // Only overwrite content when live query returned different data
                    ...((!isConfirmed && step.content) ? { content: step.content, turboUpdated: true } : {}),
                  };
                  break;
                }
              }
              return updated;
            });
          }

          // ask_user: also persist a dedicated agent_ask message so the question
          // itself is browseable in history separate from the step feed.
          if (step.type === "ask_user") {
            const askMsg = {
              type: "agent_ask",
              content: step.content,
              options: Array.isArray(step.tool_input) ? step.tool_input : [],
              chatId: agentChatId,
              parkId: step?.metadata?.park_id || null,
            };
            if (chatId) api.appendMessage(chatId, askMsg).catch(() => {});
          }

          // Final result with SQL/data — skip if turbo already answered
          if (step.final_answer || step.sql) {
            markStepsDone();
            useStore.getState().clearProvenanceChip();

            if (!resolvedViaTurbo) {
              if (step.sql && step.sql !== _lastSqlAdded) {
                _lastSqlAdded = step.sql;
                const _agentLatency =
                  step.elapsed_ms ?? step.metadata?.query_ms ?? null;
                const sqlMsg = {
                  type: "sql_preview",
                  question,
                  sql: step.sql,
                  rawSQL: step.sql,
                  model: "agent",
                  connId: resolvedConnId,
                  ...(Number.isFinite(_agentLatency) ? { latency: _agentLatency } : {}),
                };
                addMessage(sqlMsg);
                if (chatId) api.appendMessage(chatId, sqlMsg).catch(() => {});
              }
              if (step.final_answer && step.final_answer !== _lastFinalAnswerAdded) {
                _lastFinalAnswerAdded = step.final_answer;
                const ansMsg = {
                  type: "assistant",
                  content: step.final_answer,
                  chartSuggestion: step.chart_suggestion || null,
                };
                addMessage(ansMsg);
                // Auto-speak agent answer ONLY when voice mode is active (user clicked mic)
                if (ttsSupported && isListening) speak(step.final_answer.slice(0, 500));
                if (chatId) api.appendMessage(chatId, ansMsg).catch(() => {});
              }
            }
            // Note: No pre-execution "result" message here — chart + table
            // only render after the user clicks Execute on the SQL preview.
            // The handleApprove flow (line ~717) creates the real result message.
            resolve();
          }

          if (step.type === "result" && !step.final_answer && !step.sql) {
            markStepsDone();
            resolve();
          }
        }, { persona: agentPersona, permissionMode: agentPermissionMode, onEnd: () => {
          markStepsDone();
          resolve();
        }});

        // Timeout fallback — 35s for no-event path (stream_end resolves earlier via onEnd)
        setTimeout(() => {
          if (!agentFailed) {
            markStepsDone();
            resolve();
          }
        }, 35000);
      }).catch(async (_err) => {
        // Fallback to single-shot generate if agent fails
        // Fallback to single-shot SQL generation
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
      // Safety net: any path that didn't explicitly set done still stops the spinner
      setMessages((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((m) => m && m.__id === stepMsgId);
        if (idx >= 0 && updated[idx].status !== "done") {
          updated[idx] = { ...updated[idx], status: "done" };
        }
        return updated;
      });
      agentStepMsg.status = "done";
      // Persist the full agent reasoning trail so chat history replay shows
      // every thinking step, tool call, plan, and question the agent emitted.
      // Skip empty trails (nothing to persist).
      if (chatId && (agentStepMsg.steps || []).length > 0) {
        api.appendMessage(chatId, {
          type: "agent_steps",
          steps: agentStepMsg.steps,
          status: "done",
          startTime: agentStepMsg.startTime,
          chatId: agentStepMsg.chatId,
        }).catch(() => {});
      }
    }
  };

  // ── Auto-dashboard generation ──
  const [dashboardFocusOptions, setDashboardFocusOptions] = useState([]);

  const handleDashboardRequest = async (question) => {
    // Derive focus options from actual schema tables
    let focusOpts = [];
    if (resolvedConnId) {
      try {
        const profile = await api.getSchemaProfile(resolvedConnId);
        if (profile?.tables?.length) {
          focusOpts = profile.tables
            .slice(0, 6)
            .map(t => t.name
              .replace(/[_-]/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase())
            );
        }
      } catch { /* schema unavailable — will fallback to General Overview */ }
    }
    setDashboardFocusOptions(focusOpts);

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
      // Priority 1: explicit "Name the dashboard '...'" or 'Name it "..."'
      const nameMatch = question.match(/name\s+(?:the\s+dashboard|it|this)\s+[""'']([^""'']+)[""'']/i);
      let dashName;
      if (nameMatch) {
        dashName = nameMatch[1].trim();
      } else {
        // Priority 2: infer from "create a <X> dashboard" pattern
        const m = question.match(/(?:create|build|make|generate|design)\s+(?:a\s+|me\s+a\s+)?(?:professional\s+)?(.+?)\s+dashboard/i);
        dashName = m ? m[1].trim().replace(/^(a|an|the|my)\s+/i, "") + " Dashboard" : "Analytics Dashboard";
      }

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
            tiles: (sec.tiles || []).map((tile, _i) => {
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
        content: `Dashboard "${dashName}" created`
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

  // Fetch predictive suggestions after a query/agent response
  const fetchPredictions = useCallback((question = "", sql = "") => {
    setPredictions([]);
    setPredictionsLoading(true);
    api.getPredictions(resolvedConnId, question, sql)
      .then((data) => {
        if (data.predictions?.length) {
          setPredictions(data.predictions.slice(0, 3));
        }
      })
      .catch(() => {})
      .finally(() => setPredictionsLoading(false));
  }, [resolvedConnId]);

  // Debounced autocomplete fetch (300ms)
  const handleInputChange = useCallback((value) => {
    setInput(value);
    setAutocompleteIndex(-1);
    if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
    if (!value.trim() || value.trim().length < 2) {
      setAutocompleteSuggestions([]);
      setAutocompleteVisible(false);
      return;
    }
    autocompleteTimer.current = setTimeout(() => {
      api.getAutocomplete(value.trim(), resolvedConnId)
        .then((data) => {
          if (data.suggestions?.length) {
            setAutocompleteSuggestions(data.suggestions);
            setAutocompleteVisible(true);
          } else {
            setAutocompleteVisible(false);
          }
        })
        .catch(() => setAutocompleteVisible(false));
    }, 300);
  }, [resolvedConnId]);

  const handleAutocompleteSelect = useCallback((text) => {
    setInput(text);
    setAutocompleteVisible(false);
    setAutocompleteSuggestions([]);
  }, []);

  const handleAutocompleteKeyDown = useCallback((e) => {
    if (!autocompleteVisible || !autocompleteSuggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAutocompleteIndex((prev) => Math.min(prev + 1, autocompleteSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAutocompleteIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Tab" || (e.key === "Enter" && autocompleteIndex >= 0)) {
      e.preventDefault();
      const idx = autocompleteIndex >= 0 ? autocompleteIndex : 0;
      handleAutocompleteSelect(autocompleteSuggestions[idx].text);
    } else if (e.key === "Escape") {
      setAutocompleteVisible(false);
    }
  }, [autocompleteVisible, autocompleteSuggestions, autocompleteIndex, handleAutocompleteSelect]);

  const handleApprove = async (sql, question, connId, originalSql = null) => {
    setExecuting(true);
    try {
      // The stored connId may be stale: chat history persists the conn_id
      // from when the query first ran, but `app.state.connections` is
      // in-memory and re-keys on every backend restart. After a restart
      // (or a manual disconnect), the historical UUID no longer maps to
      // any live registration → 404 on /execute.
      // Prefer the stored connId ONLY if it's still alive — preserves
      // intent when the user has multiple connections open. Otherwise
      // fall back to the currently active connection.
      const storedAlive = connId && liveConnIds.has(connId);
      const cid = storedAlive ? connId : (resolvedConnId || connId);
      const result = await api.executeSQL(sql, question, cid, originalSql);
      if (result.error) {
        const errMsg = { type: "error", content: result.error };
        addMessage(errMsg);
        if (ensureChatId.current) api.appendMessage(ensureChatId.current, errMsg).catch(() => {});
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
        if (ensureChatId.current) api.appendMessage(ensureChatId.current, resMsg).catch(() => {});
        // Track query for behavior engine
        behaviorEngine.trackQuery(question, [], result.conn_id || "");
        // Fetch predictive next-action suggestions
        fetchPredictions(question, sql);
      }
    } catch (err) {
      const errMsg = { type: "error", content: err.message };
      addMessage(errMsg);
      if (ensureChatId.current) api.appendMessage(ensureChatId.current, errMsg).catch(() => {});
    } finally {
      setExecuting(false);
    }
  };

  // ── Dashboard integration ──
  useEffect(() => {
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
      addMessage({ type: "system", text: "Chart added to dashboard" });
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
      addMessage({ type: "system", text: `Chart added to "${d.name}"` });
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
    } catch { /* noop */ }
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

      // Agent Panel parity: the authoritative agent reasoning trail lives in
      // SQLite (agent_sessions.db — backend auto-saves on every step flush).
      // chat_history.json only stores what the frontend manually appended, so
      // a turbo-early-resolve or disconnect can leave it with just 1 step.
      // Pull from SQLite and overlay the full trail.
      try {
        const session = await api.agentSessionLoad(chatId);
        const fullSteps = Array.isArray(session?.steps) ? session.steps : [];
        if (fullSteps.length > 0) {
          const stepsMsgIdx = normalized.findIndex((m) => m?.type === "agent_steps");
          const fullStepsMsg = {
            __id: `agent-steps-loaded-${chatId}`,
            type: "agent_steps",
            steps: fullSteps,
            status: "done",
            startTime: session.started_at ? session.started_at * 1000 : Date.now(),
            chatId,
          };
          if (stepsMsgIdx >= 0) {
            normalized[stepsMsgIdx] = fullStepsMsg;
          } else {
            // No agent_steps placeholder in chat_history — append one right after
            // the user question so the trail renders in the correct order.
            const userIdx = normalized.findIndex((m) => m?.type === "user");
            const insertAt = userIdx >= 0 ? userIdx + 1 : normalized.length;
            normalized.splice(insertAt, 0, fullStepsMsg);
          }
        }
      } catch {
        // SQLite session may not exist for older chats — fall back to chat_history only.
      }

      setMessages(normalized);
      setShowSidebar(false);
    } catch {
      // Silent — chat load failure is recoverable
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
    } catch { /* noop */ }
  };

  return (
    <div className="flex flex-1 h-full font-sans selection:bg-blue-500/30" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Chat history sidebar */}
      <AnimatePresence>
      {showSidebar && (
        <motion.div
          initial={{ x: -288, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -288, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-72 flex-shrink-0 flex flex-col overflow-hidden relative z-30 shadow-2xl" style={{ background: 'var(--bg-base)', borderRight: '1px solid var(--border-default)' }}>
          <div className="p-3 space-y-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-default)' }}>
            <motion.button
              onClick={handleNewChat}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-full ease-spring cursor-pointer" style={{ background: 'var(--overlay-subtle)', color: 'var(--text-primary)' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New chat
            </motion.button>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search chats..."
                aria-label="Search chat history"
                className="w-full rounded-lg pl-8 pr-3 py-2 text-xs placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all duration-200" style={{ background: 'var(--overlay-subtle)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {chats.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] text-center mt-4">No chat history yet</p>
            )}
            {chats.filter((chat) => {
              if (!historySearch.trim()) return true;
              const term = historySearch.toLowerCase();
              const title = (chat.title || "Untitled").toLowerCase();
              return title.includes(term);
            }).length === 0 && chats.length > 0 && historySearch.trim() && (
              <p className="text-xs text-[var(--text-muted)] text-center mt-4">No matching chats</p>
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
                      ? "bg-white/10 border border-[var(--border-default)]"
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleLoadChat(chat.chat_id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleLoadChat(chat.chat_id); } }}
                  onMouseEnter={() => setHoveredChatId(chat.chat_id)}
                  onMouseLeave={() => setHoveredChatId(null)}
                >
                  {dbInfo && (
                    <span className="text-sm flex-shrink-0">{DB_ICONS[chat.db_type]}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{chat.title || "Untitled"}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{relativeTime(chat.updated_at)}</p>
                  </div>
                  {isHovered && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChat(chat.chat_id);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-red-400 transition cursor-pointer"
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
          className="w-72 flex-shrink-0" style={{ background: 'var(--bg-base)', borderRight: '1px solid var(--border-default)' }}
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
              <svg className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
              </svg>
            </button>

            <div className="flex items-center" style={{ color: 'var(--text-primary)' }}>
              <AskDBLogo size="sm" />
            </div>

            <DatabaseSwitcher
              connections={connections}
              activeConnId={activeConnId || connections[0]?.conn_id || null}
              onSwitch={setActiveConnId}
              liveConnIds={liveConnIds}
            />
            {/* Turbo Mode badge — shows when active connection has turbo enabled */}
            {resolvedConnId && turboStatus[resolvedConnId]?.enabled && !turboStatus[resolvedConnId]?.syncing && (
              <span className="turbo-header-badge" title="DuckDB Turbo Mode active — queries may use local replica for <100ms speed" aria-label="DuckDB Turbo Mode active">
                <svg className="turbo-header-badge__bolt" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" /></svg>
                <span className="turbo-header-badge__label">TURBO</span>
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowER(!showER)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer ${
                showER
                  ? "bg-blue-600 text-white"
                  : "text-[var(--text-secondary)] hover:bg-white/[0.07]"
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
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition cursor-pointer"
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
              <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-5">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2 font-heading" style={{ color: 'var(--text-primary)' }}>What would you like to know?</h2>
              <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Describe what you need in plain English. The agent finds tables, writes SQL, and builds visualizations.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
                {suggestionsLoading ? (
                  <>
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="animate-pulse border rounded-2xl px-5 py-4" style={{ background: 'var(--overlay-faint)', borderColor: 'var(--border-default)' }}>
                        <div className="h-3 rounded w-3/4 mb-2" style={{ background: 'var(--overlay-subtle)' }} />
                        <div className="h-3 rounded w-1/2" style={{ background: 'var(--overlay-faint)' }} />
                      </div>
                    ))}
                  </>
                ) : (
                  (starterSuggestions.length > 0 ? starterSuggestions : [
                    "Explore my database and show me the most interesting patterns you can find",
                    "What are the key metrics I should be tracking? Build me a KPI summary",
                    "Find anomalies or outliers in the recent data that I should know about",
                    "Which areas are trending up vs down? Give me a growth analysis with charts",
                  ]).map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="group text-left text-sm rounded-2xl px-5 py-4 transition-all duration-300 cursor-pointer glass-card hover:translate-y-[-2px]"
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>{q}</span>
                      <svg className="w-4 h-4 mt-2 opacity-0 group-hover:opacity-60 transition-opacity duration-200" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {currentPlan && (
            <PlanArtifact
              plan={currentPlan}
              cancellable={!cancelled}
              onCancel={handleCancel}
            />
          )}
          {currentPreview && <ResultPreview preview={currentPreview} />}

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
                  <div className="chat-bubble-user rounded-2xl rounded-tr-md px-5 py-3 max-w-xl text-[15px] leading-relaxed">
                    {msg.content}
                  </div>
                  {msg.timestamp && <span className="text-[10px] mt-1 mr-1" style={{ color: 'var(--text-muted)' }}>{formatMessageTime(msg.timestamp)}</span>}
                </div>
              )}

              {msg.type === "sql_preview" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="space-y-2"
                >
                  <div className="text-xs text-[var(--text-muted)]">
                    {msg.dbLabel && <span className="text-blue-400 font-medium">[{msg.dbLabel}] </span>}
                    Generated with {msg.model}
                    {(() => {
                      // Tight guard: render only on a finite, non-negative number.
                      // Number(undefined) = NaN handled; Number(null) = 0 also
                      // suppressed (don't render "in 0ms" for unknown latency).
                      const _lat = Number(msg.latency);
                      return Number.isFinite(_lat) && _lat > 0
                        ? ` in ${Math.round(_lat)}ms`
                        : null;
                    })()}
                  </div>
                  <SQLPreview
                    sql={msg.sql}
                    onApprove={(sql, origSql) => handleApprove(sql, msg.question, msg.connId, origSql)}
                    onReject={() => addMessage({ type: "system", content: "Query rejected." })}
                    loading={executing}
                    onCopySQL={() => showToast("Copied to clipboard")}
                  />
                  {msg.timestamp && <span className="text-[10px] text-[var(--text-muted)]">{formatMessageTime(msg.timestamp)}</span>}
                </motion.div>
              )}

              {msg.type === "assistant" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <div className="backdrop-blur-md border rounded-2xl rounded-tl-sm px-5 py-4 msg-shadow-assistant" style={{
                    background: msg.turboInstant
                      ? 'rgba(6, 182, 212, 0.06)'
                      : msg.turboUpdated
                      ? 'rgba(245, 158, 11, 0.05)'
                      : msg.turboVerified
                      ? 'rgba(34, 197, 94, 0.04)'
                      : 'var(--glass-bg-card)',
                    borderColor: msg.turboInstant
                      ? 'rgba(6, 182, 212, 0.35)'
                      : msg.turboUpdated
                      ? 'rgba(245, 158, 11, 0.28)'
                      : msg.turboVerified
                      ? 'rgba(34, 197, 94, 0.2)'
                      : 'var(--glass-border)',
                  }}>
                    {/* Phase E — ProvenanceChip: trust stamp before first token */}
                    {pendingProvenanceChip && (
                      <ProvenanceChip chip={pendingProvenanceChip} />
                    )}
                    {/* Verifying state — pulsing dot while live query runs */}
                    {msg.turboInstant && (
                      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-cyan-400">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        Turbo
                        {msg.cacheAge != null && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-normal">
                            {msg.cacheAge < 60 ? `${Math.round(msg.cacheAge)}s ago` : `${Math.round(msg.cacheAge / 60)}m ago`}
                          </span>
                        )}
                        <span className="ml-auto animate-pulse w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" title="Verifying with live data…" />
                      </div>
                    )}
                    {/* Live verification confirmed — same data */}
                    {msg.turboVerified && (
                      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-emerald-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        Verified live
                        {msg.cacheAge != null && (
                          <span className="text-[9px] font-normal text-emerald-500/70 ml-1">
                            {msg.cacheAge < 60 ? `(${Math.round(msg.cacheAge)}s ago)` : `(${Math.round(msg.cacheAge / 60)}m ago)`}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Live query returned fresher data — show updated badge */}
                    {msg.turboUpdated && (
                      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-amber-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        Refreshed
                      </div>
                    )}
                    <div className={`agent-result-md chat-md-comfy${(msg.content || '').length > 240 ? ' chat-md-comfy--longform' : ''}`}>
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS_COMFY}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    {msg.rowCount > 0 && (
                      <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--border-default)' }}>
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Query will return ~{msg.rowCount} rows — approve the SQL above to see results
                        </span>
                      </div>
                    )}
                  </div>
                  {msg.timestamp && <span className="text-[10px] text-[var(--text-muted)] mt-1 block">{formatMessageTime(msg.timestamp)}</span>}
                </motion.div>
              )}

              {msg.type === "result" && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="space-y-5"
                >
                  {msg.summary && (
                    <motion.div
                      className="chat-artifact"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0 }}
                    >
                      <div className="chat-artifact__header">
                        <span className="chat-artifact__label">
                          <span className="eyebrow-dot" aria-hidden="true" />
                          Summary
                          {msg.dbLabel && (
                            <>
                              <span style={{ opacity: 0.4 }}>·</span>
                              <span>{msg.dbLabel}</span>
                            </>
                          )}
                        </span>
                        <span className="chat-artifact__stat ml-auto">
                          {msg.rowCount.toLocaleString()} row{msg.rowCount !== 1 ? 's' : ''}
                          {(() => {
                            const _lat = Number(msg.latency);
                            return Number.isFinite(_lat) && _lat > 0
                              ? ` · ${Math.round(_lat)}ms`
                              : null;
                          })()}
                        </span>
                      </div>
                      <div className="px-5 py-4 agent-result-md chat-md-comfy">
                        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS_COMFY}>
                          {msg.summary}
                        </ReactMarkdown>
                      </div>
                    </motion.div>
                  )}
                  {msg.rows?.length > 0 && (
                    <>
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.08 }}
                      >
                        <div className="chat-artifact" style={{ overflow: "hidden" }}>
                          <div style={{ height: 360 }}>
                            <LegacyResultChart
                              columns={msg.columns}
                              rows={msg.rows}
                              title={msg.question}
                              subtitle={msg.sql}
                              hideToolbar={false}
                              onEdit={() => setEditChart({
                                columns: msg.columns,
                                rows: msg.rows,
                                title: msg.question,
                                sql: msg.sql,
                              })}
                            />
                          </div>
                        </div>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.16 }}
                      >
                        <ResultsTable columns={msg.columns} rows={msg.rows} />
                      </motion.div>
                    </>
                  )}
                  <motion.div
                    className="flex items-center gap-2 pt-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.28 }}
                  >
                    <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: 'var(--text-muted)' }}>Helpful?</span>
                    <button
                      onClick={() => handleFeedback(msg.question, msg.sql, true)}
                      className="ease-spring cursor-pointer inline-flex items-center gap-1.5"
                      style={{
                        padding: '0.35rem 0.85rem',
                        fontSize: 11,
                        fontWeight: 500,
                        borderRadius: 9999,
                        color: 'var(--text-secondary)',
                        background: 'var(--overlay-faint)',
                        border: '1px solid var(--border-default)',
                        transition: 'background 300ms cubic-bezier(0.32,0.72,0,1), color 300ms cubic-bezier(0.32,0.72,0,1), transform 300ms cubic-bezier(0.32,0.72,0,1)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--status-success)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                      aria-label="Query result was correct"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Yes
                    </button>
                    <button
                      onClick={() => handleFeedback(msg.question, msg.sql, false)}
                      className="ease-spring cursor-pointer inline-flex items-center gap-1.5"
                      style={{
                        padding: '0.35rem 0.85rem',
                        fontSize: 11,
                        fontWeight: 500,
                        borderRadius: 9999,
                        color: 'var(--text-secondary)',
                        background: 'var(--overlay-faint)',
                        border: '1px solid var(--border-default)',
                        transition: 'background 300ms cubic-bezier(0.32,0.72,0,1), color 300ms cubic-bezier(0.32,0.72,0,1), transform 300ms cubic-bezier(0.32,0.72,0,1)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--status-danger)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                      aria-label="Query result was incorrect"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      No
                    </button>
                  </motion.div>
                  {msg.timestamp && <span className="text-[10px] text-[var(--text-muted)]">{formatMessageTime(msg.timestamp)}</span>}
                  {/* Daily usage remaining */}
                  {msg.dailyUsage && !msg.dailyUsage.unlimited && (
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.dailyUsage.remaining <= 2 ? "bg-red-900/20 border border-red-800/50" : msg.dailyUsage.remaining <= 5 ? "bg-amber-900/20 border border-amber-800/50" : "bg-slate-800/50 border border-white/[0.08]/50"}`}>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                      </svg>
                      <span className={msg.dailyUsage.remaining <= 2 ? "text-red-400" : msg.dailyUsage.remaining <= 5 ? "text-amber-400" : "text-[var(--text-secondary)]"}>
                        {msg.dailyUsage.remaining === 0
                          ? `Daily limit reached (${msg.dailyUsage.daily_limit}/${msg.dailyUsage.daily_limit}). Upgrade for more.`
                          : `${msg.dailyUsage.remaining} of ${msg.dailyUsage.daily_limit} queries remaining today`}
                        <span className="text-[var(--text-muted)] ml-1">({msg.dailyUsage.plan} plan)</span>
                      </span>
                    </div>
                  )}
                </motion.div>
              )}

              {msg.type === "dashboard_chips" && (
                <DashboardChips question={msg.question} onGenerate={handleDashboardChipSelect} schemaFocusOptions={dashboardFocusOptions} />
              )}



              {msg.type === "agent_steps" && (
                <div
                  className="agent-step-feed"
                  style={{
                    borderRadius: 14,
                    padding: '14px 16px',
                    background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)',
                    border: '1px solid var(--border-default)',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px -16px rgba(0,0,0,0.6)',
                  }}
                >
                  {/* Premium eyebrow header: status dot · label · live timer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 12,
                      paddingBottom: 10,
                      borderBottom: '1px solid color-mix(in srgb, var(--border-default) 60%, transparent)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 6, height: 6, borderRadius: 9999, flexShrink: 0,
                        background: msg.status === 'done' ? 'rgb(52, 211, 153)' : 'rgb(96, 165, 250)',
                        boxShadow: msg.status === 'done'
                          ? '0 0 0 3px rgba(52,211,153,0.15)'
                          : '0 0 0 3px rgba(96,165,250,0.18)',
                        animation: msg.status === 'done' ? 'none' : 'pulse 1.6s ease-in-out infinite',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: '0.22em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {msg.status === 'done' ? 'Reasoning · Complete' : 'Reasoning · Live'}
                    </span>
                    <span style={{ flex: 1 }} />
                    {msg.status !== 'done' && (
                      <AgentElapsedTimer startTime={msg.startTime} active={true} />
                    )}
                    {msg.status === 'done' && (msg.steps || []).length > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                        }}
                      >
                        {(msg.steps || []).length} step{(msg.steps || []).length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <AgentStepRenderer
                      steps={msg.steps || []}
                      loading={msg.status !== 'done'}
                      chatId={msg.chatId}
                    />
                  </div>
                </div>
              )}

              {msg.type === "agent_ask" && (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
                  <p className="text-sm text-amber-200 mb-2">{msg.content}</p>
                  {msg.options && msg.options.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {msg.options.map((opt, oi) => (
                        <button key={oi}
                          onClick={() => api.agentRespond(msg.chatId, opt, msg.parkId || null)}
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
                  {msg.timestamp && <div className="text-[10px] text-[var(--text-muted)] mt-1">{formatMessageTime(msg.timestamp)}</div>}
                </div>
              )}

              {msg.type === "system" && (
                <div className="text-center text-xs text-[var(--text-muted)]">
                  {msg.content || msg.text}
                  {msg.timestamp && <span className="ml-2 text-[10px] text-slate-700">{formatMessageTime(msg.timestamp)}</span>}
                </div>
              )}
            </motion.div>
          ))}

          {/* Predictive next-action suggestions */}
          <AnimatePresence>
            {!loading && !executing && predictions.length > 0 && messages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.3 }}
                className="max-w-4xl mx-auto"
              >
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <span className="text-xs text-blue-400/80 font-medium">Predicted next steps</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {predictions.map((pred, idx) => (
                    <motion.button
                      key={idx}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + idx * 0.1 }}
                      onClick={() => { setInput(pred.question); setPredictions([]); behaviorEngine.trackPredictionFeedback(idx, true); }}
                      className="text-left text-sm text-[var(--text-secondary)] bg-blue-500/[0.04] hover:bg-blue-500/[0.1] border border-blue-400/[0.08] hover:border-blue-400/[0.2] rounded-xl px-4 py-3 transition-all duration-300 cursor-pointer group"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-blue-400/40 text-xs font-mono mt-0.5 group-hover:text-blue-400/70">{idx + 1}</span>
                        <div>
                          <p className="transition-colors" style={{ color: 'var(--text-primary)' }}>{pred.question}</p>
                          {pred.reasoning && (
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">{pred.reasoning}</p>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {predictionsLoading && messages.length > 0 && (
            <div className="max-w-4xl mx-auto flex items-center gap-2 text-xs text-blue-400/50">
              <div className="flex gap-1">
                {[0, 1, 2].map((d) => (
                  <motion.div key={d} className="w-1 h-1 bg-blue-400/40 rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: d * 0.2 }}
                  />
                ))}
              </div>
              Predicting next steps...
            </div>
          )}

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
                  <svg className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div className="bg-transparent pl-4 py-1 flex items-center max-w-md">
                  <div className="flex items-center gap-3 text-[var(--text-secondary)] text-[15px]">
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
              <div className="flex items-center gap-3 text-[var(--text-secondary)] text-sm glass-card border-blue-500/20 rounded-xl px-4 py-3">
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
          <VoiceIndicator isListening={isListening} isSpeaking={isSpeaking} interimTranscript={interimTranscript} />
          <motion.form
            ref={chatFormRef}
            onSubmit={handleAsk}
            className={`flex items-center gap-2 rounded-full p-2 transition-all duration-300 pointer-events-auto chat-input-pill${isInputFocused ? ' focused' : ''}`}
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: isInputFocused ? 1.02 : 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleAutocompleteKeyDown}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => { setIsInputFocused(false); setTimeout(() => setAutocompleteVisible(false), 200); }}
                placeholder="Ask anything..."
                aria-label="Ask a question about your data"
                className="w-full bg-transparent px-5 py-2.5 text-[15px] focus:outline-none transition-all duration-200"
                disabled={loading}
                style={{ color: 'var(--text-primary)', paddingLeft: '24px' }}
                autoComplete="off"
              />
              {/* Autocomplete dropdown */}
              {autocompleteVisible && autocompleteSuggestions.length > 0 && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-xl overflow-hidden chat-autocomplete"
                >
                  {autocompleteSuggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onMouseDown={() => handleAutocompleteSelect(s.text)}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2"
                      style={idx === autocompleteIndex
                        ? { background: 'var(--overlay-light)', color: 'var(--text-primary)' }
                        : { color: 'var(--text-secondary)' }
                      }
                    >
                      <span className="text-[10px] opacity-40 uppercase tracking-wider w-12 shrink-0">
                        {s.source === "history" ? "prev" : s.source === "schema" ? "table" : "idea"}
                      </span>
                      <span className="truncate">{s.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <VoiceButton
              isListening={isListening}
              onToggle={() => { if (isListening) { stopListening(); stopSpeaking(); } else startListening(); }}
              supported={sttSupported}
              size="md"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex items-center justify-center w-[44px] h-[44px] shrink-0 rounded-full text-white disabled:opacity-30 ease-spring cursor-pointer group"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 10px 28px -10px rgba(37, 99, 235, 0.6), 0 1px 0 rgba(255,255,255,0.18) inset',
                transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1), box-shadow 300ms cubic-bezier(0.32,0.72,0,1), background 300ms cubic-bezier(0.32,0.72,0,1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-light)';
                e.currentTarget.style.transform = 'scale(1.05) translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent)';
                e.currentTarget.style.transform = 'scale(1) translateY(0)';
              }}
              aria-label="Send question"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 ease-spring transition-transform duration-300 group-hover:translate-x-0.5"
              >
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
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                ER Diagram
              </h3>
              <button
                onClick={() => setShowER(false)}
                className="p-1 rounded hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close ER Diagram"
              >
                <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {erTables.length > 0 ? (
                <ERDiagram tables={erTables} compact savedPositions={erSavedPositions} onPositionsChange={handleERPositionsChange} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md" style={{ background: 'rgba(6, 6, 14, 0.72)' }} onClick={() => { setShowDashboardPicker(false); setPendingTileData(null); }}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-sm shadow-2xl fade-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Add to Dashboard</h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">Choose a dashboard or create a new one</p>

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
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{d.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{d.tile_count || 0} tile{d.tile_count !== 1 ? "s" : ""}</p>
                    </div>
                    <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* Create new */}
            <div className="pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
              <p className="text-xs text-[var(--text-secondary)] mb-2">Or create new dashboard</p>
              <div className="flex gap-2">
                <input
                  value={newDashboardName}
                  onChange={(e) => setNewDashboardName(e.target.value)}
                  placeholder="e.g., Marketing Dashboard"
                  className="flex-1 glass-input rounded-lg px-3 py-2 text-sm focus:outline-none input-glow" style={{ color: 'var(--text-primary)' }}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateAndAdd()}
                />
                <button
                  onClick={handleCreateAndAdd}
                  disabled={!newDashboardName.trim() || addingTile}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-all duration-200 disabled:opacity-40 cursor-pointer shadow-lg shadow-blue-600/15 btn-glow"
                >
                  {addingTile ? "..." : "Create"}
                </button>
              </div>
            </div>

            <button
              onClick={() => { setShowDashboardPicker(false); setPendingTileData(null); }}
              className="mt-3 w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ChartEditModal
        open={!!editChart}
        onClose={() => setEditChart(null)}
        columns={editChart?.columns || []}
        rows={editChart?.rows || []}
        title={editChart?.title || "Chart"}
      />
    </div>
  );
}

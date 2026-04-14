import { useState, useEffect, useCallback, useRef, Suspense, Component, lazy } from "react";
import { useSearchParams } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import AnimatedBackground from "../components/animation/AnimatedBackground";

class WebGLBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e) { console.warn("WebGL fallback:", e); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}
const SectionBackground3D = lazy(() => import("../components/animation/SectionBackground3D"));
import { api } from "../api";
import { useStore } from "../store";
import behaviorEngine from "../lib/behaviorEngine";
import { TOKENS } from "../components/dashboard/tokens";
import AgentPanel from "../components/agent/AgentPanel";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import DiffOnLoadBanner from "../components/dashboard/DiffOnLoadBanner";
import { detectHotMetrics } from "../lib/hotMetricDetector";
import { emitTileCreated, emitTileDeleted, emitTilesSurvived24h } from "../lib/tileSurvivalTelemetry";
import TabBar from "../components/dashboard/TabBar";
import Section from "../components/dashboard/Section";
import GlobalFilterBar from "../components/dashboard/GlobalFilterBar";
import FloatingToolbar from "../components/dashboard/FloatingToolbar";
import CrossFilterBadge from "../components/dashboard/CrossFilterBadge";
import CommandPalette from "../components/dashboard/CommandPalette";
import { evaluateVisibilityRule } from "../lib/visibilityRules";
import { classifyColumns } from "../lib/fieldClassification";

// Lazy-loaded modals — only fetched when opened
const TileEditor = lazy(() => import("../components/dashboard/TileEditor"));
const ExportModal = lazy(() => import("../components/dashboard/ExportModal"));
const MetricEditor = lazy(() => import("../components/dashboard/MetricEditor"));
const DashboardThemeEditor = lazy(() => import("../components/dashboard/DashboardThemeEditor"));
const BookmarkManager = lazy(() => import("../components/dashboard/BookmarkManager"));
const SettingsModal = lazy(() => import("../components/dashboard/SettingsModal"));
const PresentationEngine = lazy(() => import("../components/dashboard/PresentationEngine"));
const ShareModal = lazy(() => import("../components/dashboard/ShareModal"));
const VersionHistory = lazy(() => import("../components/dashboard/VersionHistory"));
const AlertManager = lazy(() => import("../components/dashboard/AlertManager"));
const NotesPanel = lazy(() => import("../components/dashboard/NotesPanel"));

/* ── Animation variants ── */
const undoToastVariants = {
  hidden: { opacity: 0, x: 120, scale: 0.9 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 320, damping: 26 },
  },
  exit: {
    opacity: 0,
    x: 120,
    scale: 0.9,
    transition: { duration: 0.25, ease: "easeIn" },
  },
};

/* ════════════════════════════════════════════════════════════════
   DashboardBuilder — full rewrite with tabs, sections, command bar
   ════════════════════════════════════════════════════════════════ */
export default function DashboardBuilder() {
  const { activeDashboardId, setActiveDashboardId, activeConnId } = useStore();
  const setPrefetchData = useStore(s => s.setPrefetchData);
  const getPrefetchData = useStore(s => s.getPrefetchData);
  const clearPrefetchCache = useStore(s => s.clearPrefetchCache);
  const applyGlobalFilters = useStore(s => s.applyGlobalFilters);
  const resetGlobalFilters = useStore(s => s.resetGlobalFilters);
  const dashboardGlobalFilters = useStore(s => s.dashboardGlobalFilters);
  const tileEditVersion = useStore(s => s.tileEditVersion);
  const bumpTileEditVersion = useStore(s => s.bumpTileEditVersion);
  const agentLoading = useStore(s => s.agentLoading);
  const agentSteps = useStore(s => s.agentSteps);
  const agentDock = useStore(s => s.agentDock);
  const agentPanelWidth = useStore(s => s.agentPanelWidth);
  const agentPanelHeight = useStore(s => s.agentPanelHeight);
  const agentPanelOpen = useStore(s => s.agentPanelOpen);
  const setAgentPanelOpen = useStore(s => s.setAgentPanelOpen);
  const agentResizing = useStore(s => s.agentResizing);

  // ── State ──
  const [dashboards, setDashboards] = useState([]);
  const [activeDashboard, setActiveDashboard] = useState(null);
  const [activeTabId, setActiveTabId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTile, setEditingTile] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // 'export'|'metrics'|'theme'|'bookmarks'|'settings'|'share'|'versions'|'alerts'|null
  const [shareToken, setShareToken] = useState(null);
  const [undoStack, setUndoStack] = useState([]); // [{tile, sectionId, dashboard}]
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);
  const [newDashName, setNewDashName] = useState("");
  const [templates, setTemplates] = useState([]);
  // globalFilters now lives in Zustand store as dashboardGlobalFilters
  const globalFilters = dashboardGlobalFilters;
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [crossFilter, setCrossFilter] = useState(null); // { field, value }
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("qc_sidebar_collapsed")) === true; } catch { return false; }
  });
  // Viewport-aware state — drives responsive collapse of the sidebar and
  // the "desktop recommended" hint when the window is narrower than the
  // dashboard builder comfortably supports.
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1920
  );
  useEffect(() => {
    let rafId = null;
    const onResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setViewportWidth(window.innerWidth);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  // Auto-collapse the sidebar when the viewport is too narrow to comfortably
  // show it alongside the dashboard. User can still manually expand via the
  // « button — the auto-logic only kicks in once per crossover.
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (viewportWidth < 900 && !sidebarCollapsed && !autoCollapsedRef.current) {
      setSidebarCollapsed(true);
      autoCollapsedRef.current = true;
    } else if (viewportWidth >= 1100 && autoCollapsedRef.current) {
      // When the user grows the viewport past the safe point, remember
      // their previous manual preference from localStorage if set.
      autoCollapsedRef.current = false;
    }
  }, [viewportWidth, sidebarCollapsed]);
  // Ultra-narrow viewports — show a "desktop recommended" notice since the
  // builder is a power-user tool and a touch-optimized layout would require
  // a completely different UX.
  const showNarrowViewportHint = viewportWidth < 700 && !fullscreenMode;
  const [aiCommandLoading, setAiCommandLoading] = useState(false);
  const [aiCommandError, setAiCommandError] = useState(null);
  const [filterError, setFilterError] = useState(null);
  const [drillDown, setDrillDown] = useState(null); // { loading, data, error, dimension, value, sql }
  const [drillSuggestions, setDrillSuggestions] = useState([]); // [{ question, dimension }]
  const [schemaColumns, setSchemaColumns] = useState([]);
  const [defaultClassifications, setDefaultClassifications] = useState({});
  const [searchParams] = useSearchParams();

  const saveTimer = useRef(null);
  const viewportSaveTimer = useRef(null);
  const undoTimers = useRef([]);
  const dashboardRef = useRef(activeDashboard);
  dashboardRef.current = activeDashboard;

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("qc_sidebar_collapsed", JSON.stringify(next)); } catch { /* Safari private */ }
      return next;
    });
    // Trigger resize after CSS transition completes so grid recalculates column widths
    setTimeout(() => window.dispatchEvent(new Event("resize")), 250);
  }, []);

  // ── Derived: active tab and its sections ──
  const activeTab =
    activeDashboard?.tabs?.find((t) => t.id === activeTabId) || null;
  const sections = activeTab?.sections || [];

  // ── Hot metric heat map (Phase 2.4) ──
  // Recomputed when the active tab's tile data changes. Must run AFTER
  // tile.rows load so snapshots have real numbers, not placeholders.
  // Note: diffSnapshot is called by detectHotMetrics BEFORE the banner
  // re-snapshots — this ordering is intentional so the banner sees the
  // same delta picture the pulse is reacting to.
  const setTileHeatMap = useStore((s) => s.setTileHeatMap);
  useEffect(() => {
    if (!activeDashboard?.id || !activeTab?.tiles?.length) {
      setTileHeatMap({});
      return;
    }
    const heatMap = detectHotMetrics(activeDashboard.id, activeTab.tiles);
    setTileHeatMap(heatMap);
  }, [activeDashboard?.id, activeTab?.tiles, setTileHeatMap]);

  // ── Tile survival telemetry 24h sweep (Phase 2.5) ──
  // Once per dashboard load, walk the active tab's tiles and emit a
  // survived_24h event for any tile whose createdAt is > 24h ago.
  // emitTilesSurvived24h internally dedupes per tile per session.
  useEffect(() => {
    if (!activeDashboard?.id || !activeTab?.tiles?.length) return;
    emitTilesSurvived24h(activeDashboard.id, activeTab.tiles);
  }, [activeDashboard?.id, activeTab?.id, activeTab?.tiles]);

  // ── Load dashboards on mount ──
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getDashboards();
        const list = res.dashboards || [];
        setDashboards(list);
        if (list.length > 0) {
          const targetId = activeDashboardId || list[0].id;
          const full = await api.getDashboard(targetId);
          // Reset filters on session start — prevent stale filtered data from prior sessions
          const emptyFilters = { dateColumn: '', range: 'all_time', dateStart: '', dateEnd: '', fields: [] };
          applyGlobalFilters(emptyFilters);
          if (full.globalFilters?.fields?.length > 0 || (full.globalFilters?.range && full.globalFilters.range !== 'all_time')) {
            api.updateDashboard(targetId, { globalFilters: emptyFilters }).catch(() => {});
            full.globalFilters = emptyFilters;
          }
          setActiveDashboard(full);
          setActiveDashboardId(full.id);
          if (full.tabs?.length > 0) setActiveTabId(full.tabs[0].id);
        }
      } catch (err) {
        void err;
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset filters when leaving the Analytics page
  useEffect(() => {
    return () => resetGlobalFilters();
  }, [resetGlobalFilters]);

  // ── Reload dashboard when agent creates/updates/deletes tiles ──
  useEffect(() => {
    const handler = (e) => {
      const fresh = e.detail?.dashboard;
      if (fresh && fresh.id === dashboardRef.current?.id) {
        setActiveDashboard(fresh);
      }
    };
    window.addEventListener('dashboard-reload', handler);
    return () => window.removeEventListener('dashboard-reload', handler);
  }, []);

  // ── Fetch dashboard templates when connected ──
  useEffect(() => {
    if (!activeConnId) return;
    api.getDashboardTemplates(activeConnId).then(r => setTemplates(r.templates || [])).catch(() => {});
  }, [activeConnId]);

  // ── Fetch schema columns once for active connection (shared by TileEditor & MetricEditor) ──
  useEffect(() => {
    if (!activeConnId) return;
    let cancelled = false;
    api.getTables(activeConnId).then(res => {
      if (cancelled) return;
      const cols = [];
      const seen = new Set();
      for (const table of (res?.tables || [])) {
        for (const col of (table.columns || [])) {
          const name = typeof col === 'string' ? col : col.name || col.column_name || '';
          if (name && !seen.has(name)) {
            seen.add(name);
            cols.push({ name, table: table.name, type: typeof col === 'object' ? (col.type || col.data_type || '') : '' });
          }
        }
        if (cols.length >= 200) break;
      }
      setSchemaColumns(cols);
      setDefaultClassifications(classifyColumns(cols, [], {}));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeConnId]);

  // ── Auto-refresh all tiles with SQL on dashboard load ──
  // This ensures stale filtered data from prior sessions is replaced with fresh unfiltered results.
  const dashRefreshedRef = useRef(null);
  useEffect(() => {
    if (!activeDashboard?.tabs) return;
    // Only auto-refresh once per dashboard ID
    if (dashRefreshedRef.current === activeDashboard.id) return;
    dashRefreshedRef.current = activeDashboard.id;

    const stale = [];
    for (const tab of activeDashboard.tabs) {
      for (const sec of tab.sections || []) {
        for (const tile of sec.tiles || []) {
          if (tile.sql) {
            stale.push(tile.id);
          }
        }
      }
    }
    if (stale.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const tileId of stale) {
        if (cancelled) break;
        try {
          const res = await api.refreshTile(activeDashboard.id, tileId, null, null);
          if (cancelled) break;
          setActiveDashboard(prev => {
            if (!prev || prev.id !== activeDashboard.id) return prev;
            return {
              ...prev,
              tabs: prev.tabs.map(tab => ({
                ...tab,
                sections: (tab.sections || []).map(sec => ({
                  ...sec,
                  tiles: (sec.tiles || []).map(t =>
                    t.id === tileId ? { ...t, ...res } : t
                  ),
                })),
              })),
            };
          });
        } catch (err) {
          void 0;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeDashboard?.id, getPrefetchData]); // only re-run when dashboard changes, not on every tile update

  // ── Auto-refresh tiles that have SQL but no data (e.g., agent-created tiles) ──
  // This catches tiles added AFTER the initial dashboard load, which miss the one-shot refresh above.
  const refreshingTilesRef = useRef(new Set());
  useEffect(() => {
    if (!activeDashboard?.tabs || !activeConnId) return;
    const dataless = [];
    for (const tab of activeDashboard.tabs) {
      for (const sec of tab.sections || []) {
        for (const tile of sec.tiles || []) {
          if (tile.sql && (!tile.columns || tile.columns.length === 0) && (!tile.rows || tile.rows.length === 0)) {
            if (!refreshingTilesRef.current.has(tile.id)) {
              dataless.push(tile.id);
            }
          }
        }
      }
    }
    if (dataless.length === 0) return;
    let cancelled = false;
    // Mark as in-flight to prevent duplicate refresh
    dataless.forEach(id => refreshingTilesRef.current.add(id));
    (async () => {
      for (const tileId of dataless) {
        if (cancelled) break;
        try {
          const res = await api.refreshTile(activeDashboard.id, tileId, activeConnId, null);
          if (cancelled) break;
          setActiveDashboard(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              tabs: prev.tabs.map(tab => ({
                ...tab,
                sections: (tab.sections || []).map(sec => ({
                  ...sec,
                  tiles: (sec.tiles || []).map(t =>
                    t.id === tileId ? { ...t, ...res, columns: res.columns || t.columns, rows: res.rows || t.rows } : t
                  ),
                })),
              })),
            };
          });
        } catch (err) {
          void 0;
        } finally {
          refreshingTilesRef.current.delete(tileId);
        }
      }
    })();
    return () => { cancelled = true; };
  });

  // ── Background prefetch: refresh inactive tab tiles ──
  useEffect(() => {
    if (!activeDashboard?.tabs || !activeTabId || !activeConnId) return;

    const inactiveTabs = activeDashboard.tabs.filter(t => t.id !== activeTabId);
    if (inactiveTabs.length === 0) return;

    let cancelled = false;
    const prefetchInactive = async () => {
      for (const tab of inactiveTabs) {
        for (const sec of tab.sections || []) {
          for (const tile of sec.tiles || []) {
            if (cancelled) return;
            if (!tile.sql || (tile.rows && tile.rows.length > 0)) continue;
            try {
              const res = await api.refreshTile(activeDashboard.id, tile.id, activeConnId, null);
              if (cancelled) return;
              setPrefetchData(activeDashboard.id, tile.id, { columns: res.columns, rows: res.rows });
            } catch {
              // Silently fail — prefetch is best-effort
            }
          }
        }
      }
    };

    // Delay prefetch by 2 seconds to let active tab finish first
    const timer = setTimeout(prefetchInactive, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeDashboard?.id, activeTabId, activeConnId, setPrefetchData]);

  // ── SSE: live tile updates via Redis pub/sub ──
  useEffect(() => {
    if (!activeDashboard?.id) return;
    const sub = api.subscribeTileUpdates(activeDashboard.id, (update) => {
      // Merge live tile data into the active dashboard state
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabs = prev.tabs.map((tab) => ({
          ...tab,
          sections: tab.sections.map((sec) => ({
            ...sec,
            tiles: sec.tiles.map((tile) =>
              tile.id === update.tile_id
                ? { ...tile, columns: update.columns, rows: update.rows }
                : tile
            ),
          })),
        }));
        return { ...prev, tabs };
      });
    });
    return () => sub.close();
  }, [activeDashboard?.id]);

  // ── Auto-save (debounced 800ms) ──
  const autoSave = useCallback(
    (dashboard) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          setSaving(true);
          await api.updateDashboard(dashboard.id, {
            name: dashboard.name,
            description: dashboard.description,
            tabs: dashboard.tabs,
            annotations: dashboard.annotations,
            // globalFilters excluded — filters are session-only, not persisted across sessions
          });
        } catch (err) {
          void 0;
        } finally {
          setSaving(false);
        }
      }, 800);
    },
    []
  );

  // ── Dashboard CRUD ──
  const handleCreateDashboard = useCallback(
    async (name) => {
      try {
        const d = await api.createDashboard(name);
        setDashboards((prev) => [
          ...prev,
          {
            id: d.id,
            name: d.name,
            created_at: d.created_at,
            updated_at: d.updated_at,
            tile_count: 0,
            tab_count: d.tabs?.length || 0,
          },
        ]);
        setActiveDashboard(d);
        setActiveDashboardId(d.id);
        if (d.tabs?.length > 0) setActiveTabId(d.tabs[0].id);
        setShowCreatePrompt(false);
        setNewDashName("");
      } catch (err) {
        void 0;
      }
    },
    [setActiveDashboardId]
  );

  const dashSelectVersion = useRef(0);
  const handleSelectDashboard = useCallback(
    async (id) => {
      const version = ++dashSelectVersion.current;
      try {
        const full = await api.getDashboard(id);
        // Ignore stale response if user clicked another dashboard [ADV-FIX M2]
        if (version !== dashSelectVersion.current) return;
        // Reset filters when switching dashboards — start with clean slate
        const emptyFilters = { dateColumn: '', range: 'all_time', dateStart: '', dateEnd: '', fields: [] };
        applyGlobalFilters(emptyFilters);
        if (full.globalFilters?.fields?.length > 0 || (full.globalFilters?.range && full.globalFilters.range !== 'all_time')) {
          api.updateDashboard(full.id, { globalFilters: emptyFilters }).catch(() => {});
          full.globalFilters = emptyFilters;
        }
        setActiveDashboard(full);
        setActiveDashboardId(full.id);
        if (full.tabs?.length > 0) setActiveTabId(full.tabs[0].id);
        else setActiveTabId(null);
      } catch (err) {
        void 0;
      }
    },
    [setActiveDashboardId, applyGlobalFilters]
  );

  const handleDeleteDashboard = useCallback(
    async (id) => {
      if (!confirm("Delete this dashboard? This cannot be undone.")) return;
      try {
        await api.deleteDashboard(id);
        setDashboards((prev) => prev.filter((d) => d.id !== id));
        if (dashboardRef.current?.id === id) {
          setActiveDashboard(null);
          setActiveDashboardId(null);
          setActiveTabId(null);
        }
      } catch (err) {
        void 0;
      }
    },
    [setActiveDashboardId]
  );

  // ── Dashboard name change ──
  const handleNameChange = useCallback(
    (newName) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, name: newName };
        setDashboards((list) =>
          list.map((d) => (d.id === prev.id ? { ...d, name: newName } : d))
        );
        autoSave(updated);
        return updated;
      });
    },
    [autoSave]
  );

  // ── Tab operations ──
  const handleTabSelect = useCallback((tabId) => {
    setActiveTabId(tabId);
  }, []);

  const handleTabAdd = useCallback(async () => {
    const dash = dashboardRef.current;
    if (!dash) return;
    try {
      const res = await api.addTab(dash.id, "New Tab");
      setActiveDashboard(res);
      const newTab = res.tabs[res.tabs.length - 1];
      if (newTab) setActiveTabId(newTab.id);
    } catch (err) {
      void 0;
    }
  }, []);

  const handleTabRename = useCallback(
    (tabId, newName) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabs = prev.tabs.map((t) =>
          t.id === tabId ? { ...t, name: newName } : t
        );
        const updated = { ...prev, tabs };
        api.updateDashboard(prev.id, { tabs }).catch(() => {});
        return updated;
      });
    },
    []
  );

  const handleTabDelete = useCallback(
    async (tabId) => {
      const dash = dashboardRef.current;
      if (!dash) return;
      try {
        const res = await api.deleteTab(dash.id, tabId);
        setActiveDashboard(res);
        setActiveTabId((prev) => (prev === tabId ? (res.tabs?.[0]?.id || null) : prev));
      } catch (err) {
        void 0;
      }
    },
    []
  );

  // ── Section layout change ──
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  const layoutSaveTimer = useRef(null);

  const handleLayoutChange = useCallback(
    (sectionId, newLayout) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabId = activeTabIdRef.current;
        const tabs = prev.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          return {
            ...tab,
            sections: tab.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, layout: newLayout } : sec
            ),
          };
        });
        return { ...prev, tabs };
      });
      // [ADV-FIX C3, H4] Debounced auto-save
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
      layoutSaveTimer.current = setTimeout(() => {
        const current = dashboardRef.current;
        if (current) autoSave(current);
      }, 800);
    },
    [autoSave]
  );

  const handleFreeformLayoutChange = useCallback(
    (sectionId, newLayout) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabId = activeTabIdRef.current;
        const tabs = prev.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          return {
            ...tab,
            sections: tab.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, freeformLayout: newLayout } : sec
            ),
          };
        });
        return { ...prev, tabs };
      });
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
      layoutSaveTimer.current = setTimeout(() => {
        const current = dashboardRef.current;
        if (current) autoSave(current);
      }, 800);
    },
    [autoSave]
  );

  const handleToggleLayoutMode = useCallback(
    (sectionId, mode) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabId = activeTabIdRef.current;
        const tabs = prev.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          return {
            ...tab,
            sections: tab.sections.map((sec) => {
              if (sec.id !== sectionId) return sec;
              const update = { ...sec, layoutMode: mode };
              // Auto-convert grid to freeform on first switch
              if (mode === 'freeform' && (!sec.freeformLayout || sec.freeformLayout.length === 0)) {
                const containerWidth = 900; // approximate
                update.freeformLayout = (sec.layout || []).map((item) => ({
                  i: item.i,
                  x: item.x * (containerWidth / 12),
                  y: item.y * 80,
                  width: item.w * (containerWidth / 12),
                  height: item.h * 80,
                  zIndex: 1,
                }));
              }
              return update;
            }),
          };
        });
        const updated = { ...prev, tabs };
        autoSave(updated);
        return updated;
      });
    },
    [autoSave]
  );

  const handleCanvasViewportChange = useCallback(
    (sectionId, viewport) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabId = activeTabIdRef.current;
        const tabs = prev.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          return {
            ...tab,
            sections: tab.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, canvasViewport: viewport } : sec
            ),
          };
        });
        const updated = { ...prev, tabs };
        // Debounced save (2s) — read fresh ref to avoid stale snapshot [ADV-FIX]
        if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
        viewportSaveTimer.current = setTimeout(() => {
          const current = dashboardRef.current;
          if (current) autoSave(current);
        }, 2000);
        return updated;
      });
    },
    [autoSave]
  );

  // ── Add section ──
  const handleAddSection = useCallback(
    async (name = "New Section") => {
      const dash = dashboardRef.current;
      const tabId = activeTabIdRef.current;
      if (!dash || !tabId) return;
      try {
        const res = await api.addSection(dash.id, tabId, name);
        setActiveDashboard(res);
      } catch (err) {
        void 0;
      }
    },
    []
  );

  // ── Edit section (rename, etc.) ──
  const handleEditSection = useCallback(
    (sectionId, updates) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabId = activeTabIdRef.current;
        const tabs = prev.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          return {
            ...tab,
            sections: tab.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, ...updates } : sec
            ),
          };
        });
        const updated = { ...prev, tabs };
        autoSave(updated);
        return updated;
      });
    },
    [autoSave]
  );

  const handleDeleteSection = useCallback(
    (sectionId) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabId = activeTabIdRef.current;
        const tabs = prev.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          return { ...tab, sections: tab.sections.filter((sec) => sec.id !== sectionId) };
        });
        const updated = { ...prev, tabs };
        autoSave(updated);
        return updated;
      });
    },
    [autoSave]
  );

  const handleReorderSection = useCallback(
    (sectionId, direction) => {
      setActiveDashboard((prev) => {
        if (!prev) return prev;
        const tabId = activeTabIdRef.current;
        const tabs = prev.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          const secs = [...tab.sections];
          const idx = secs.findIndex((s) => s.id === sectionId);
          if (idx < 0) return tab;
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= secs.length) return tab;
          [secs[idx], secs[swapIdx]] = [secs[swapIdx], secs[idx]];
          return { ...tab, sections: secs };
        });
        const updated = { ...prev, tabs };
        autoSave(updated);
        return updated;
      });
    },
    [autoSave]
  );

  const handleRenameSection = useCallback(
    (sectionId, newName) => {
      if (!newName?.trim()) return;
      handleEditSection(sectionId, { name: newName.trim() });
    },
    [handleEditSection]
  );

  // ── Mutual exclusion helpers for overlays [ADV-FIX] ──
  const openModal = useCallback((modal) => {
    setEditingTile(null);
    setActiveModal(modal);
  }, []);

  const openTileEditor = useCallback((tile) => {
    setActiveModal(null);
    setEditingTile(tile);
  }, []);

  const enterFullscreen = useCallback(() => {
    setEditingTile(null);
    setActiveModal(null);
    setFullscreenMode(true);
  }, []);

  // ── ⌘K / Ctrl+K — open the command palette from anywhere in the builder ──
  useEffect(() => {
    const handler = (e) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && (e.key === 'k' || e.key === 'K')) {
        // Don't hijack when the user is typing in an input/textarea (except our own palette trigger)
        const t = e.target;
        const tag = t?.tagName;
        const inField = tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable;
        if (inField && !t?.classList?.contains('cmd-k-input')) return;
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Tile operations ──
  const handleTileEdit = useCallback(
    (tile) => {
      openTileEditor(tile);
      behaviorEngine.trackDashboardInteraction(tile?.id || "unknown", "edit");
    },
    [openTileEditor]
  );


  const handleTileChartChange = useCallback(
    async (tileId, chartType) => {
      const dash = dashboardRef.current;
      if (!dash) return;
      try {
        await api.updateTile(dash.id, tileId, { chartType });
        setActiveDashboard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tabs: prev.tabs.map((tab) => ({
              ...tab,
              sections: tab.sections.map((sec) => ({
                ...sec,
                tiles: sec.tiles.map((t) =>
                  t.id === tileId ? { ...t, chartType } : t
                ),
              })),
            })),
          };
        });
      } catch (err) {
        void 0;
      }
    },
    []
  );

  const handleTileRemove = useCallback(
    async (tileId) => {
      const dash = dashboardRef.current;
      const tabId = activeTabIdRef.current;
      if (!dash || !tabId) return;
      // Find the tile and its section for undo
      let removedTile = null;
      let removedSectionId = null;
      const curTab = dash.tabs?.find((t) => t.id === tabId);
      for (const sec of curTab?.sections || []) {
        const found = sec.tiles?.find((t) => t.id === tileId);
        if (found) {
          removedTile = found;
          removedSectionId = sec.id;
          break;
        }
      }

      try {
        await api.removeDashboardTile(dash.id, tileId);
        setActiveDashboard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tabs: prev.tabs.map((tab) => {
              if (tab.id !== tabId) return tab;
              return {
                ...tab,
                sections: tab.sections.map((sec) => ({
                  ...sec,
                  tiles: sec.tiles.filter((t) => t.id !== tileId),
                  layout: (sec.layout || []).filter((l) => l.i !== tileId),
                })),
              };
            }),
          };
        });

        // Survival telemetry — fire and forget
        if (removedTile) {
          const ageMs = Date.now() - (Number(removedTile.createdAt) || Date.now());
          emitTileDeleted(dash.id, tileId, removedTile.chartType, ageMs);
        }

        // Show undo toast with 5s timeout — surgical restore (only re-add the tile)
        if (removedTile) {
          const undoEntry = {
            id: Date.now(),
            tile: removedTile,
            sectionId: removedSectionId,
            tabId,
            dashboardId: dash.id,
          };
          setUndoStack((prev) => [...prev, undoEntry]);
          const timer = setTimeout(() => {
            setUndoStack((prev) => prev.filter((u) => u.id !== undoEntry.id));
            undoTimers.current = undoTimers.current.filter(t => t !== timer);
          }, 5000);
          undoTimers.current.push(timer);
        }
      } catch (err) {
        void 0;
      }
    },
    []
  );

  const handleUndoRemove = useCallback(
    async (undoEntry) => {
      try {
        // Surgical undo: re-add just the deleted tile instead of restoring full snapshot
        const res = await api.addTileToSection(
          undoEntry.dashboardId,
          undoEntry.tabId,
          undoEntry.sectionId,
          undoEntry.tile
        );
        if (res) setActiveDashboard(res);
        setUndoStack((prev) => prev.filter((u) => u.id !== undoEntry.id));
      } catch (err) {
        void 0;
      }
    },
    []
  );

  const handleTileMove = useCallback(
    async (tileId, targetTabId, targetSectionId) => {
      const dash = dashboardRef.current;
      if (!dash) return;
      try {
        const result = await api.moveTile(dash.id, tileId, targetTabId, targetSectionId);
        if (result) setActiveDashboard(result);
      } catch (err) {
        void 0;
      }
    },
    []
  );

  const handleTileCopy = useCallback(
    async (tileId, targetTabId, targetSectionId) => {
      const dash = dashboardRef.current;
      if (!dash) return;
      try {
        const result = await api.copyTile(dash.id, tileId, targetTabId, targetSectionId);
        if (result) setActiveDashboard(result);
      } catch (err) {
        void 0;
      }
    },
    []
  );

  const globalFiltersRef = useRef(globalFilters);
  globalFiltersRef.current = globalFilters;

  const handleTileRefresh = useCallback(
    async (tileId, connId, filtersOverride = null) => {
      const dash = dashboardRef.current;
      if (!dash) return;
      const filtersUrl = filtersOverride || globalFiltersRef.current;
      await api.refreshTile(dash.id, tileId, connId, filtersUrl);
      // Single-tile refresh: re-fetch full dashboard for fresh state
      const fresh = await api.getDashboard(dash.id);
      if (fresh) setActiveDashboard(fresh);
    },
    []
  );

  // ── Helper: refresh all tiles in the active tab with given filters (parallel) ──
  const refreshAllTiles = useCallback((filtersOverride) => {
    const dash = dashboardRef.current;
    const tabId = activeTabIdRef.current;
    if (!dash || !tabId) return;

    const currentTab = dash.tabs.find(t => t.id === tabId);
    if (!currentTab) return;

    const tiles = [];
    currentTab.sections.forEach(s => s.tiles.forEach(t => tiles.push({ id: t.id, title: t.title || t.id })));
    if (tiles.length === 0) return;

    (async () => {
      const tileIds = tiles.map(t => t.id);
      const tileLookup = Object.fromEntries(tiles.map(t => [t.id, t.title]));
      const failedNames = [];
      let batchResults = null;

      try {
        const batchResult = await api.batchRefreshTiles(
          dash.id, tileIds, activeConnId || null, filtersOverride || globalFiltersRef.current
        );
        batchResults = batchResult.results || {};
        if (batchResult.errors) {
          Object.keys(batchResult.errors).forEach(tid => failedNames.push(tileLookup[tid] || tid));
        }
      } catch {
        // Fallback to individual refresh
        const BATCH_SIZE = 5;
        for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
          const batch = tiles.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(
            batch.map(tile => api.refreshTile(dash.id, tile.id, activeConnId || null, filtersOverride || globalFiltersRef.current))
          );
        }
      }

      // Apply results directly to local state (preserves runtime data)
      if (batchResults && Object.keys(batchResults).length > 0) {
        setActiveDashboard(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            tabs: prev.tabs.map(tab => ({
              ...tab,
              sections: (tab.sections || []).map(sec => ({
                ...sec,
                tiles: (sec.tiles || []).map(tile => {
                  const result = batchResults[tile.id];
                  if (result && result.columns) {
                    return { ...tile, columns: result.columns, rows: result.rows || [] };
                  }
                  return tile;
                }),
              })),
            })),
          };
        });
      } else {
        // Fallback: re-fetch dashboard
        try {
          const fresh = await api.getDashboard(dash.id);
          if (fresh) setActiveDashboard(fresh);
        } catch (e) {
          void 0;
        }
      }

      if (failedNames.length > 0) {
        setFilterError(`${failedNames.length} tile(s) failed: ${failedNames.join(', ')}`);
        setTimeout(() => setFilterError(null), 10000);
      }
    })();
  }, [activeConnId]);

  const handleGlobalFiltersChange = useCallback((newFilters) => {
    clearPrefetchCache(dashboardRef.current?.id);
    applyGlobalFilters(newFilters);
    const dash = dashboardRef.current;

    // Save ONLY globalFilters to backend immediately (without stale tabs/rows).
    if (dash) {
      api.updateDashboard(dash.id, { globalFilters: newFilters }).catch(() => { });
    }

    // Refresh all tiles with the new filters
    refreshAllTiles(newFilters);
  }, [clearPrefetchCache, applyGlobalFilters, refreshAllTiles]);

  // ── Auto-refresh tiles when switching tabs (apply active filters to new tab) ──
  const prevTabIdRef = useRef(activeTabId);
  useEffect(() => {
    if (activeTabId === prevTabIdRef.current) return;
    prevTabIdRef.current = activeTabId;
    // If global filters are active, refresh the new tab's tiles
    const filters = globalFiltersRef.current;
    const hasDateFilter = filters?.dateColumn && filters?.range && filters.range !== 'all_time';
    const hasFieldFilters = filters?.fields?.length > 0;
    if (hasDateFilter || hasFieldFilters) {
      refreshAllTiles(filters);
    }
  }, [activeTabId, refreshAllTiles]);

  // ── Reactive tile refresh for tile edit saves (version counter watch) ──
  const editVersionRef = useRef(tileEditVersion);
  useEffect(() => {
    if (tileEditVersion === editVersionRef.current) return;
    editVersionRef.current = tileEditVersion;
    refreshAllTiles(globalFiltersRef.current);
  }, [tileEditVersion, refreshAllTiles]);

  const crossFilterRef = useRef(crossFilter);
  crossFilterRef.current = crossFilter;

  const drillDownVersion = useRef(0);
  const handleCrossFilterClick = useCallback((field, value, tileSql) => {
    // Check if toggling OFF before updating state [ADV-FIX M1]
    const prev = crossFilterRef.current;
    const isTogglingOff = prev?.field === field && prev?.value === value;

    setCrossFilter(p => {
      if (p?.field === field && p?.value === value) return null;
      return { field, value };
    });

    // Clear drill-down state on toggle-OFF
    if (isTogglingOff) {
      setDrillDown(null);
      setDrillSuggestions([]);
    }

    // Only trigger drill-down on toggle-ON, not toggle-OFF
    if (!isTogglingOff && tileSql && field && value != null) {
      const version = ++drillDownVersion.current;
      setDrillDown({ loading: true, dimension: field, value: String(value), data: null, error: null, sql: null });
      setDrillSuggestions([]);
      api.drillDown(tileSql, field, String(value), activeConnId)
        .then(result => {
          if (version !== drillDownVersion.current) return; // stale response
          if (result?.error) {
            setDrillDown(prev => prev ? { ...prev, loading: false, error: result.error } : null);
          } else {
            setDrillDown(prev => prev ? {
              ...prev,
              loading: false,
              data: { columns: result.columns || [], rows: result.data || [] },
              sql: result.sql,
            } : null);
            // Fetch drill-down suggestions in the background
            api.drillDownSuggestions(result.sql || tileSql, result.columns || [], result.data || [], '')
              .then(res => { if (version === drillDownVersion.current) setDrillSuggestions(res.suggestions || []); })
              .catch(() => {});
          }
        })
        .catch(err => {
          if (version !== drillDownVersion.current) return; // stale response
          setDrillDown(prev => prev ? { ...prev, loading: false, error: err?.message || 'Drill-down failed' } : null);
        });
    }
  }, [activeConnId]);

  const clearCrossFilter = useCallback(() => {
    setCrossFilter(null);
    setDrillDown(null);
    setDrillSuggestions([]);
  }, []);

  const handleTileSave = useCallback(
    async (updatedTile) => {
      const dash = dashboardRef.current;
      if (!dash) return;
      try {
        await api.updateTile(dash.id, updatedTile.id, updatedTile);
        // Optimistically merge the updated tile into local state.
        // Re-fetching from backend would lose runtime rows/columns data
        // (not persisted on disk), causing charts to go blank until refresh.
        setActiveDashboard(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            tabs: prev.tabs.map(tab => ({
              ...tab,
              sections: (tab.sections || []).map(sec => ({
                ...sec,
                tiles: (sec.tiles || []).map(tile =>
                  tile.id === updatedTile.id
                    ? { ...tile, ...updatedTile, rows: tile.rows, columns: tile.columns }
                    : tile
                ),
              })),
            })),
          };
        });
        setEditingTile(null);
        bumpTileEditVersion();
      } catch (err) {
        void 0;
      }
    },
    [bumpTileEditVersion]
  );

  const handleTileDelete = useCallback(
    async (tileId) => {
      setEditingTile(null);
      await handleTileRemove(tileId);
    },
    [handleTileRemove]
  );

  const handleMetricsUpdate = useCallback((newMetrics) => {
    setActiveDashboard((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, customMetrics: newMetrics };
      autoSave(updated);
      return updated;
    });
  }, [autoSave]);

  const handleThemeUpdate = useCallback((newTheme) => {
    setActiveDashboard((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, themeConfig: newTheme };
      autoSave(updated);
      return updated;
    });
  }, [autoSave]);

  // ── Bookmark helpers ──
  const getCurrentBookmarkState = useCallback(() => ({
    activeTabId,
    globalFilters,
    crossFilter,
  }), [activeTabId, globalFilters, crossFilter]);

  const applyBookmarkState = useCallback((state) => {
    // Validate tab ID still exists before switching [ADV-FIX M2]
    if (state.activeTabId) {
      const dash = dashboardRef.current;
      const tabExists = dash?.tabs?.some(t => t.id === state.activeTabId);
      if (tabExists) setActiveTabId(state.activeTabId);
    }
    if (state.globalFilters) {
      applyGlobalFilters(state.globalFilters);
      // Refresh tiles with the restored filters so dashboard data updates
      clearPrefetchCache(dashboardRef.current?.id);
      refreshAllTiles(state.globalFilters);
    }
    if (state.crossFilter !== undefined) setCrossFilter(state.crossFilter);
  }, [applyGlobalFilters, clearPrefetchCache, refreshAllTiles]);

  // ── Apply bookmark from URL search params ──
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId || !activeDashboard) return;
    const bookmark = activeDashboard.bookmarks?.find(b => b.id === viewId);
    if (bookmark?.state) {
      applyBookmarkState(bookmark.state);
    }
  }, [activeDashboard?.id, searchParams, applyBookmarkState]);

  const handleQuickTileUpdate = useCallback(async (updatedTile) => {
    if (!activeDashboard) return;
    try {
      await api.updateTile(activeDashboard.id, updatedTile.id, updatedTile);
      // Always re-fetch full dashboard to guarantee fresh state
      const fresh = await api.getDashboard(activeDashboard.id);
      if (fresh) setActiveDashboard(fresh);
    } catch (err) {
      void 0;
    }
  }, [activeDashboard]);

  // ── Add tile (from CommandBar) ──
  const handleAddTile = useCallback(
    async (sectionId) => {
      const dash = dashboardRef.current;
      const tabId = activeTabIdRef.current;
      if (!dash || !tabId) return;
      const curTab = dash.tabs?.find((t) => t.id === tabId);
      const targetSectionId = sectionId || curTab?.sections?.[0]?.id;
      if (!targetSectionId) return;
      try {
        const tile = {
          title: "New Tile",
          chartType: "bar",
          columns: [],
          rows: [],
        };
        const res = await api.addTileToSection(
          dash.id,
          tabId,
          targetSectionId,
          tile
        );
        setActiveDashboard(res);
        // Survival telemetry — locate newly added tile to get its id
        const newTile = res?.tabs
          ?.find((t) => t.id === tabId)
          ?.sections?.find((s) => s.id === targetSectionId)
          ?.tiles?.slice(-1)?.[0];
        if (newTile?.id) {
          emitTileCreated(dash.id, newTile.id, newTile.chartType || 'bar');
        }
      } catch (err) {
        void 0;
      }
    },
    []
  );

  // ── Annotations ──
  const handleAddAnnotation = useCallback(
    async (text, authorName) => {
      const dash = dashboardRef.current;
      if (!dash) return;
      try {
        const res = await api.addDashboardAnnotation(dash.id, text, authorName);
        setActiveDashboard((prev) => ({
          ...prev,
          annotations: res.annotations || [
            ...(prev.annotations || []),
            { text, author: authorName, created_at: new Date().toISOString() },
          ],
        }));
      } catch (err) {
        void 0;
      }
    },
    []
  );

  // ── Export ──
  const handleExport = useCallback(
    () => {
      // ExportModal handles the actual export via html2canvas + jsPDF
      // This callback fires after successful export
      setActiveModal(null);
    },
    []
  );

  // ── AI Command — generate tiles from natural language ──
  const handleAICommand = useCallback(async (command) => {
    const dash = dashboardRef.current;
    const tabId = activeTabIdRef.current;
    if (!dash || !tabId) {
      setAiCommandError('No dashboard or tab selected.');
      return;
    }

    // Snapshot for rollback on partial failure [ADV-FIX H9]
    const snapshot = JSON.parse(JSON.stringify(dash));

    setAiCommandLoading(true);
    setAiCommandError(null);

    try {
      // ── Conversational editing: if a tile is selected, edit it [ADV-FIX C8] ──
      if (selectedTileId) {
        let selectedTile = null;
        for (const tab of dash.tabs || [])
          for (const sec of tab.sections || [])
            for (const t of sec.tiles || [])
              if (t.id === selectedTileId) selectedTile = t;

        if (selectedTile) {
          const result = await api.editTileNL(command, selectedTile, activeConnId);
          if (result?.patch && Object.keys(result.patch).length > 0) {
            await api.updateTile(dash.id, selectedTileId, result.patch);
            const fresh = await api.getDashboard(dash.id);
            if (fresh) setActiveDashboard(fresh);
            setSelectedTileId(null);
            return; // Done — tile was edited
          }
        }
      }

      // ── Otherwise: create new tiles ──
      // 1. Find or create a section in the active tab
      let curTab = dash.tabs?.find((t) => t.id === tabId);
      let targetSectionId = curTab?.sections?.[0]?.id;

      if (!targetSectionId) {
        // Auto-create a section so the tile has a home
        const sectionRes = await api.addSection(dash.id, tabId, 'AI Generated');
        if (sectionRes) {
          setActiveDashboard(sectionRes);
          dashboardRef.current = sectionRes;
          curTab = sectionRes.tabs?.find((t) => t.id === tabId);
          targetSectionId = curTab?.sections?.[0]?.id;
        }
        if (!targetSectionId) {
          setAiCommandError('Could not create section for new tiles.');
          return;
        }
      }

      // 2. Call the AI dashboard generation endpoint
      const res = await api.generateDashboard(command, activeConnId);

      // 3. Extract tiles from the nested response structure
      const tiles = res?.tabs?.flatMap(tab =>
        (tab.sections || []).flatMap(sec => sec.tiles || [])
      ) || res?.tiles || [];

      if (tiles.length === 0) {
        setAiCommandError('AI could not generate charts for this query. Try rephrasing or check your database connection.');
        return;
      }

      // 4. Add each tile to the dashboard
      let latest = dashboardRef.current;
      for (const tile of tiles.slice(0, 4)) {
        const updated = await api.addTileToSection(latest.id, tabId, targetSectionId, {
          title: tile.title || command,
          chartType: tile.chart_type || tile.chartType || 'bar',
          sql: tile.sql || '',
          columns: tile.columns || [],
          rows: tile.rows || [],
          question: command,
        });
        if (updated) {
          latest = updated;
          dashboardRef.current = updated;
        }
      }

      // 5. Re-fetch fresh state to guarantee consistency
      const fresh = await api.getDashboard(dash.id);
      if (fresh) setActiveDashboard(fresh);
    } catch (err) {
      void 0;
      // Rollback to snapshot on partial failure — also revert backend [ADV-FIX H9, H4]
      setActiveDashboard(snapshot);
      dashboardRef.current = snapshot;
      try { await api.updateDashboard(snapshot.id, { tabs: snapshot.tabs }); } catch { /* best-effort rollback */ }
      const msg = err?.message || 'Unknown error';
      if (msg.includes('No active database')) {
        setAiCommandError('Connect a database first to use AI chart generation.');
      } else {
        setAiCommandError(`AI generation failed: ${msg}`);
      }
    } finally {
      setAiCommandLoading(false);
    }
  }, [activeConnId]);

  // ── Settings ──
  const handleSettings = useCallback(() => {
    openModal('settings');
  }, [openModal]);

  const handleSettingsSave = useCallback(async (newSettings) => {
    const dash = dashboardRef.current;
    if (!dash) return;
    try {
      await api.updateDashboard(dash.id, { settings: newSettings });
      setActiveDashboard(prev => prev ? { ...prev, settings: newSettings } : prev);
    } catch (err) {
      void 0;
    }
  }, []);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
      undoTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // ── Loading state ──
  if (loading) {
    return (
      <div
        style={{
          background: TOKENS.bg.deep,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: `2px solid ${TOKENS.accent}`,
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Empty state: no dashboards ──
  if (dashboards.length === 0 && !activeDashboard) {
    return (
      <div
        style={{
          background: TOKENS.bg.deep,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 16,
            background: TOKENS.bg.elevated,
            border: `1px solid ${TOKENS.border.default}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="40"
            height="40"
            fill="none"
            viewBox="0 0 24 24"
            stroke={TOKENS.text.muted}
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z"
            />
          </svg>
        </div>
        <p style={{ color: TOKENS.text.primary, fontSize: 20, fontWeight: 600, fontFamily: "'Outfit', system-ui, sans-serif" }}>
          Create your first dashboard
        </p>
        <p
          style={{
            color: TOKENS.text.muted,
            fontSize: 14,
            maxWidth: 400,
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Pin query results, add KPI cards, and build visual analytics that update in real time.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", marginTop: 8 }}>
          <input
            value={newDashName}
            onChange={(e) => setNewDashName(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              newDashName.trim() &&
              handleCreateDashboard(newDashName.trim())
            }
            placeholder="Dashboard name..."
            style={{
              background: TOKENS.bg.elevated,
              border: `1px solid ${TOKENS.border.default}`,
              borderRadius: 8,
              padding: "8px 14px",
              color: TOKENS.text.primary,
              fontSize: 14,
              width: 260,
              outline: "none",
            }}
            autoFocus
          />
          <button
            onClick={() =>
              newDashName.trim() && handleCreateDashboard(newDashName.trim())
            }
            disabled={!newDashName.trim()}
            style={{
              background: TOKENS.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: newDashName.trim() ? "pointer" : "not-allowed",
              opacity: newDashName.trim() ? 1 : 0.4,
              transition: "opacity 0.15s",
            }}
          >
            Create Your First Dashboard
          </button>
        </div>

        {/* Dashboard Templates */}
        {templates.length > 0 && (
          <div style={{ marginTop: 32, maxWidth: 700, width: '100%', padding: '0 24px' }}>
            <p style={{ color: TOKENS.text.muted, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
              Or start from a template:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {templates.map(t => (
                <button key={t.id}
                  onClick={async () => {
                    const d = await api.createDashboard(t.name);
                    setDashboards(prev => [...prev, { id: d.id, name: d.name, created_at: d.created_at, tile_count: 0, tab_count: 1 }]);
                    setActiveDashboard(d);
                    setActiveDashboardId(d.id);
                    if (d.tabs?.length > 0) setActiveTabId(d.tabs[0].id);
                    setShowCreatePrompt(false);
                    // Auto-generate tiles from template prompt
                    try {
                      const res = await api.generateDashboard(t.prompt, activeConnId);
                      if (res.tabs) {
                        const tab = d.tabs?.[0];
                        const sec = tab?.sections?.[0];
                        if (tab && sec) {
                          for (const genTab of res.tabs) {
                            for (const genSec of genTab.sections || []) {
                              for (const tile of (genSec.tiles || []).slice(0, 4)) {
                                await api.addTileToSection(d.id, tab.id, sec.id, tile);
                              }
                            }
                          }
                          const fresh = await api.getDashboard(d.id);
                          if (fresh) setActiveDashboard(fresh);
                        }
                      }
                    } catch { /* template generation is best-effort */ }
                  }}
                  style={{
                    background: TOKENS.bg.elevated,
                    border: `1px solid ${TOKENS.border.default}`,
                    borderRadius: 12,
                    padding: '16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: `all ${TOKENS.transition}`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = TOKENS.accent; e.currentTarget.style.background = TOKENS.bg.hover; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = TOKENS.border.default; e.currentTarget.style.background = TOKENS.bg.elevated; }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: TOKENS.text.primary, marginBottom: 4 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: TOKENS.text.muted, lineHeight: 1.4 }}>{t.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Build command palette entries from live state ──
  // Commands are a flat list, ordered: global actions → dashboards → tabs → sections.
  // Each entry closes the palette on execution via CommandPalette's onClose.
  const commandList = [];
  if (activeDashboard) {
    commandList.push(
      { id: 'act-share', label: 'Share dashboard', kind: 'Action', hint: 'Generate a link', action: () => openModal('share') },
      { id: 'act-present', label: 'Enter presentation mode', kind: 'Action', hint: 'Fullscreen slides', action: enterFullscreen },
      { id: 'act-theme', label: 'Change theme', kind: 'Action', hint: 'Colors & typography', action: () => openModal('theme') },
      { id: 'act-metrics', label: 'Edit custom metrics', kind: 'Action', hint: 'Define formulas', action: () => openModal('metrics') },
      { id: 'act-bookmarks', label: 'Saved views', kind: 'Action', hint: 'Bookmarked filter states', action: () => openModal('bookmarks') },
      { id: 'act-alerts', label: 'Manage alerts', kind: 'Action', hint: 'Notify on thresholds', action: () => openModal('alerts') },
      { id: 'act-versions', label: 'Version history', kind: 'Action', hint: 'View & restore', action: () => openModal('versions') },
      { id: 'act-settings', label: 'Dashboard settings', kind: 'Action', action: () => openModal('settings') },
      { id: 'act-new-tab', label: 'Create new tab', kind: 'Action', action: () => handleTabAdd() },
      { id: 'act-new-section', label: 'Add new section', kind: 'Action', action: () => handleAddSection() },
      { id: 'act-toggle-sidebar', label: sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar', kind: 'View', action: () => toggleSidebar() },
      { id: 'act-toggle-agent', label: agentPanelOpen ? 'Hide AI agent panel' : 'Show AI agent panel', kind: 'View', action: () => setAgentPanelOpen(!agentPanelOpen) },
    );
  }
  // All dashboards (quick-switch)
  (dashboards || []).forEach((d) => {
    if (d.id !== activeDashboard?.id) {
      commandList.push({
        id: `dash-${d.id}`,
        label: d.name || 'Untitled dashboard',
        kind: 'Dashboard',
        hint: 'Open',
        action: () => handleSelectDashboard(d.id),
      });
    }
  });
  // Tabs in the active dashboard
  (activeDashboard?.tabs || []).forEach((t) => {
    if (t.id !== activeTabId) {
      commandList.push({
        id: `tab-${t.id}`,
        label: t.name || 'Untitled tab',
        kind: 'Tab',
        hint: 'Jump to tab',
        action: () => handleTabSelect(t.id),
      });
    }
  });
  // Sections in the active tab
  sections.forEach((s) => {
    commandList.push({
      id: `sec-${s.id}`,
      label: s.name || 'Untitled section',
      kind: 'Section',
      hint: `${(s.tiles || []).length} tiles`,
      action: () => {
        const el = document.querySelector(`[data-section-id="${s.id}"]`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
    });
  });

  return (
    <div
      style={{
        background: TOKENS.bg.deep,
        minHeight: agentPanelOpen && agentDock === "bottom" && !fullscreenMode ? `calc(100dvh - ${agentPanelHeight}px)` : "100dvh",
        display: "flex",
        position: "relative",
        marginLeft: agentPanelOpen && agentDock === "left" && !fullscreenMode ? agentPanelWidth : 0,
        marginRight: agentPanelOpen && agentDock === "right" && !fullscreenMode ? agentPanelWidth : 0,
        transition: agentResizing ? "none" : "margin 0.2s ease, min-height 0.2s ease",
      }}
    >
      {/* Ambient 3D background */}
      <div style={{ position: "fixed", inset: 0, opacity: 0.08, pointerEvents: "none", zIndex: 0 }}>
        <WebGLBoundary fallback={<AnimatedBackground />}>
          <Suspense fallback={null}>
            <SectionBackground3D mode="stats" />
          </Suspense>
        </WebGLBoundary>
      </div>

      {/* ── Sidebar: Dashboard List (hidden in fullscreen) ── */}
      {!fullscreenMode && <aside
        style={{
          width: sidebarCollapsed ? 48 : 280,
          background: TOKENS.bg.surface,
          borderRight: `1px solid ${TOKENS.border.default}`,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "sticky",
          top: 0,
          zIndex: 20,
          transition: "width 0.2s ease",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {sidebarCollapsed ? (
          /* ── Collapsed: thin strip with expand button ── */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 8 }}>
            <button
              onClick={toggleSidebar}
              style={{
                background: "transparent",
                border: "none",
                color: TOKENS.text.secondary,
                cursor: "pointer",
                fontSize: 18,
                padding: "6px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = TOKENS.text.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = TOKENS.text.secondary; }}
              title="Expand sidebar"
            >
              »
            </button>
          </div>
        ) : (
          /* ── Expanded: full sidebar ── */
          <>
            {/* Sidebar header */}
            <div
              style={{
                padding: "16px 16px 12px",
                borderBottom: `1px solid ${TOKENS.border.default}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={toggleSidebar}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: TOKENS.text.secondary,
                    cursor: "pointer",
                    fontSize: 16,
                    padding: "2px 4px",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = TOKENS.text.primary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = TOKENS.text.secondary; }}
                  title="Collapse sidebar"
                >
                  «
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span className="eyebrow" style={{ fontSize: 9, letterSpacing: "0.2em" }}>Workspace</span>
                  <span
                    style={{
                      color: TOKENS.text.primary,
                      fontWeight: 700,
                      fontSize: 15,
                      letterSpacing: "-0.01em",
                      fontFamily: TOKENS.tile.headerFont,
                    }}
                  >
                    Dashboards
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowCreatePrompt(true)}
                className="ease-spring cursor-pointer flex items-center justify-center"
                style={{
                  background: TOKENS.accent,
                  color: "#fff",
                  border: "none",
                  borderRadius: 9999,
                  width: 28,
                  height: 28,
                  fontSize: 16,
                  lineHeight: 1,
                  boxShadow: "0 6px 18px -6px rgba(37, 99, 235, 0.55), 0 1px 0 rgba(255,255,255,0.18) inset",
                  transition: "transform 300ms cubic-bezier(0.32,0.72,0,1)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                title="Create dashboard"
                aria-label="Create dashboard"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>

            {/* Create inline prompt */}
            {showCreatePrompt && (
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${TOKENS.border.default}` }}>
                <input
                  value={newDashName}
                  onChange={(e) => setNewDashName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newDashName.trim()) {
                      handleCreateDashboard(newDashName.trim());
                    }
                    if (e.key === "Escape") {
                      setShowCreatePrompt(false);
                      setNewDashName("");
                    }
                  }}
                  placeholder="Dashboard name..."
                  style={{
                    background: TOKENS.bg.elevated,
                    border: `1px solid ${TOKENS.accent}`,
                    borderRadius: 6,
                    padding: "6px 10px",
                    color: TOKENS.text.primary,
                    fontSize: 13,
                    width: "100%",
                    outline: "none",
                  }}
                  autoFocus
                />
              </div>
            )}

            {/* Dashboard list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
              {dashboards.map((d) => {
                const active = activeDashboard?.id === d.id;
                return (
                  <div
                    key={d.id}
                    onClick={() => handleSelectDashboard(d.id)}
                    className="dash-side-item group"
                    data-active={active || undefined}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectDashboard(d.id); } }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {d.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDashboard(d.id);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: TOKENS.text.muted,
                        cursor: "pointer",
                        padding: 4,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        opacity: 0,
                        transition: "opacity 300ms cubic-bezier(0.32,0.72,0,1), color 200ms ease",
                      }}
                      className="group-hover:!opacity-60 hover:!opacity-100"
                      onMouseEnter={(e) => { e.currentTarget.style.color = TOKENS.danger; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = TOKENS.text.muted; }}
                      title="Delete dashboard"
                      aria-label={`Delete ${d.name}`}
                    >
                      <svg
                        width="13"
                        height="13"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Sidebar footer — count + ⌘K hint */}
            <div
              style={{
                padding: "12px 16px",
                borderTop: `1px solid ${TOKENS.border.default}`,
                color: TOKENS.text.muted,
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                letterSpacing: "0.02em",
              }}
            >
              <span>
                {dashboards.length} {dashboards.length === 1 ? "dashboard" : "dashboards"}
              </span>
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="ease-spring cursor-pointer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: TOKENS.bg.hover,
                  border: `1px solid ${TOKENS.border.default}`,
                  color: TOKENS.text.muted,
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  transition: "color 300ms cubic-bezier(0.32,0.72,0,1), background 300ms cubic-bezier(0.32,0.72,0,1)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = TOKENS.text.primary; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = TOKENS.text.muted; }}
                title="Open command palette"
              >
                ⌘K
              </button>
            </div>
          </>
        )}
      </aside>}

      {/* Agent Panel (always available when toggled, independent of dashboard selection) */}
      {!fullscreenMode && agentPanelOpen && (
        <AgentPanel connId={activeConnId} defaultDock="right" onClose={() => setAgentPanelOpen(false)} />
      )}

      {/* ── Main Content ── */}
      <main
        id="dashboard-export-area"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,                // ← critical: lets the flex item shrink below its intrinsic content width
          minHeight: agentPanelOpen && agentDock === "bottom" && !fullscreenMode ? `calc(100dvh - ${agentPanelHeight}px)` : "100dvh",
          maxHeight: agentPanelOpen && agentDock === "bottom" && !fullscreenMode ? `calc(100dvh - ${agentPanelHeight}px)` : undefined,
          // Explicit "hidden auto" — vertical scrolls, horizontal NEVER scrolls.
          // Without this, CSS spec promotes overflow-x to "auto" when overflow-y is "auto",
          // which causes a phantom horizontal scrollbar that visually clips the rightmost
          // tile column behind it.
          overflowX: "hidden",
          overflowY: "auto",
          position: "relative",
          zIndex: 10,
          transition: agentResizing ? "none" : "min-height 0.2s ease, max-height 0.2s ease",
        }}
      >
        {!activeDashboard ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 32px",
              gap: 20,
              minHeight: "70vh",
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                background: `radial-gradient(ellipse at center, ${TOKENS.accentGlow} 0%, transparent 70%)`,
                border: `1px solid ${TOKENS.border.default}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={TOKENS.accent} strokeWidth="1.4" aria-hidden="true">
                <rect x="3" y="3" width="7" height="9" rx="1.5" />
                <rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" />
                <rect x="3" y="16" width="7" height="5" rx="1.5" />
              </svg>
            </div>
            <div className="eyebrow"><span className="eyebrow-dot" /> Workspace ready</div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: TOKENS.text.primary,
                fontFamily: TOKENS.tile.headerFont,
                textAlign: "center",
                margin: 0,
                lineHeight: 1.1,
                maxWidth: 520,
              }}
            >
              Pick a dashboard or make a new one.
            </h1>
            <p
              style={{
                fontSize: 14,
                color: TOKENS.text.secondary,
                lineHeight: 1.6,
                maxWidth: 460,
                textAlign: "center",
                margin: 0,
              }}
            >
              Build, connect, and orchestrate data stories for any team — finance, healthcare,
              e‑commerce, product. Press{" "}
              <span className="cmd-k-kbd" style={{ margin: 0 }}>⌘K</span> anytime to jump anywhere.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <button
                onClick={() => setShowCreatePrompt(true)}
                className="group inline-flex items-center gap-2 pl-5 pr-1.5 py-2 rounded-full ease-spring cursor-pointer"
                style={{
                  background: TOKENS.accent,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: "0 10px 28px -10px rgba(37, 99, 235, 0.6), 0 1px 0 rgba(255,255,255,0.18) inset",
                  border: "none",
                }}
              >
                <span>New dashboard</span>
                <span className="flex items-center justify-center w-7 h-7 rounded-full ease-spring transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-[1px]" style={{ background: "rgba(255,255,255,0.18)" }}>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </button>
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="ease-spring cursor-pointer"
                style={{
                  background: "transparent",
                  color: TOKENS.text.secondary,
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "0.5rem 1rem",
                  borderRadius: 9999,
                  border: `1px solid ${TOKENS.border.default}`,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Browse all
                <span className="cmd-k-kbd" style={{ margin: 0 }}>⌘K</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Fullscreen mode now handled by PresentationEngine overlay */}

            {/* Dashboard Header (hidden in fullscreen) */}
            {!fullscreenMode && (
              <DashboardHeader
                dashboard={activeDashboard}
                saving={saving}
                onNameChange={handleNameChange}
                onOpenMetrics={() => openModal('metrics')}
                onOpenTheme={() => openModal('theme')}
                onOpenBookmarks={() => openModal('bookmarks')}
                onShare={() => openModal('share')}
                onOpenVersions={() => openModal('versions')}
                onOpenAlerts={() => openModal('alerts')}
                onOpenSettings={() => openModal('settings')}
                onToggleFullscreen={enterFullscreen}
                onOpenCommandPalette={() => setCommandPaletteOpen(true)}
              />
            )}

            {/* Diff-on-load banner — shows top-3 deltas since last visit */}
            {!fullscreenMode && (
              <DiffOnLoadBanner
                dashboardId={activeDashboard?.id}
                tiles={activeTab?.tiles || []}
              />
            )}

            {/* Tab Bar */}
            <TabBar
              tabs={activeDashboard.tabs || []}
              activeTabId={activeTabId}
              onSelect={handleTabSelect}
              onAdd={handleTabAdd}
              onRename={handleTabRename}
              onDelete={handleTabDelete}
            />

            {/* Global Filters */}
            <GlobalFilterBar
              globalFilters={globalFilters}
              dashboard={activeDashboard}
              connId={activeConnId}
              onChange={handleGlobalFiltersChange}
            />

            {/* Filter error banner */}
            {filterError && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
                borderRadius: 8, padding: '8px 16px', margin: '0 24px',
                color: '#fca5a5', fontSize: 13, display: 'flex',
                alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontWeight: 600 }}>Filter Error:</span> {filterError}
                <button onClick={() => setFilterError(null)} style={{
                  marginLeft: 'auto', color: '#fca5a5', background: 'none',
                  border: 'none', cursor: 'pointer', fontSize: 16,
                }}>×</button>
              </div>
            )}

            {/* Layout auto-saves on drag/resize — no Apply button needed */}

            {/* Sections */}
            <div id="dashboard-content" key={activeTabId} style={{ flex: 1, padding: "16px 0 48px", background: activeDashboard?.themeConfig?.background?.dashboard || 'transparent' }}>
              {sections.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "96px 24px",
                    gap: 16,
                  }}
                >
                  <div className="eyebrow"><span className="eyebrow-dot" /> Empty tab</div>
                  <h2
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: TOKENS.text.primary,
                      fontFamily: TOKENS.tile.headerFont,
                      margin: 0,
                      textAlign: "center",
                    }}
                  >
                    A blank canvas awaits.
                  </h2>
                  <p style={{ fontSize: 13, color: TOKENS.text.secondary, maxWidth: 380, textAlign: "center", margin: 0, lineHeight: 1.6 }}>
                    Organize your tiles into sections — overview, deep‑dive, cohort splits.
                    Each section can have its own layout mode.
                  </p>
                  <button
                    onClick={() => handleAddSection()}
                    className="group inline-flex items-center gap-2 pl-5 pr-1.5 py-2 rounded-full ease-spring cursor-pointer"
                    style={{
                      background: TOKENS.accent,
                      color: "#fff",
                      border: "none",
                      fontSize: 13,
                      fontWeight: 600,
                      boxShadow: "0 10px 28px -10px rgba(37, 99, 235, 0.6), 0 1px 0 rgba(255,255,255,0.18) inset",
                    }}
                  >
                    <span>Add first section</span>
                    <span className="flex items-center justify-center w-7 h-7 rounded-full ease-spring transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-[1px]" style={{ background: "rgba(255,255,255,0.18)" }}>
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </button>
                </div>
              ) : (
                <>
                  <CrossFilterBadge crossFilter={crossFilter} onClear={clearCrossFilter} />
                  {sections
                    .filter(section => evaluateVisibilityRule(section.visibilityRule, globalFilters, crossFilter))
                    .map((section, idx) => (
                      <motion.div
                        key={section.id}
                        data-section-id={section.id}
                        initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        transition={{ duration: 0.6, delay: idx * 0.08, ease: [0.32, 0.72, 0, 1] }}
                        style={{ scrollMarginTop: 96 }}
                      >
                        <Section
                          section={section}
                          sectionNumber={idx + 1}
                          connId={activeConnId}
                          onLayoutChange={handleLayoutChange}
                          onTileEdit={handleTileEdit}
                          onTileChartChange={handleTileChartChange}
                          onTileRemove={handleTileRemove}
                          onTileMove={handleTileMove}
                          onTileCopy={handleTileCopy}
                          onTileRefresh={handleTileRefresh}
                          allTabs={activeDashboard?.tabs || []}
                          onAddTile={handleAddTile}
                          onEditSection={handleEditSection}
                          onDeleteSection={handleDeleteSection}
                          onReorderSection={handleReorderSection}
                          onRenameSection={handleRenameSection}
                          customMetrics={activeDashboard?.customMetrics || []}
                          onToggleLayoutMode={handleToggleLayoutMode}
                          onFreeformLayoutChange={handleFreeformLayoutChange}
                          onCanvasViewportChange={handleCanvasViewportChange}
                          onTileSelect={setSelectedTileId}
                          selectedTileId={selectedTileId}
                          themeConfig={activeDashboard?.themeConfig}
                          crossFilter={crossFilter}
                          onCrossFilterClick={handleCrossFilterClick}
                          dashboardId={activeDashboard?.id}
                          fullscreenMode={fullscreenMode}
                        />
                      </motion.div>
                    ))}
                </>
              )}

              {sections.length > 0 && !fullscreenMode && (
                <div style={{ textAlign: "center", padding: "24px 0 8px" }}>
                  <button
                    onClick={() => handleAddSection()}
                    className="ease-spring cursor-pointer inline-flex items-center gap-2"
                    style={{
                      background: "transparent",
                      color: TOKENS.text.muted,
                      border: `1px dashed ${TOKENS.border.default}`,
                      borderRadius: 9999,
                      padding: "10px 22px",
                      fontSize: 12,
                      fontWeight: 500,
                      letterSpacing: "0.02em",
                      transition: "color 300ms cubic-bezier(0.32,0.72,0,1), border-color 300ms cubic-bezier(0.32,0.72,0,1), background 300ms cubic-bezier(0.32,0.72,0,1)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = TOKENS.accent;
                      e.currentTarget.style.borderColor = TOKENS.accent;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = TOKENS.text.muted;
                      e.currentTarget.style.borderColor = TOKENS.border.default;
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add section
                  </button>
                </div>
              )}
              {(() => {
                const hiddenCount = sections.length - sections.filter(s => evaluateVisibilityRule(s.visibilityRule, globalFilters, crossFilter)).length;
                if (hiddenCount === 0) return null;
                return (
                  <p style={{ textAlign: 'center', fontSize: 11, color: TOKENS.text.muted, padding: '8px 0' }}>
                    {hiddenCount} section{hiddenCount > 1 ? 's' : ''} hidden by visibility rules
                  </p>
                );
              })()}
            </div>

            {/* Notes Panel (hidden in fullscreen) */}
            {!fullscreenMode && <NotesPanel
              annotations={activeDashboard.annotations || []}
              userName={
                useStore.getState().user?.name ||
                useStore.getState().user?.email ||
                "Anonymous"
              }
              onAdd={handleAddAnnotation}
              onDelete={async (annotationId) => {
                try {
                  const updated = await api.deleteDashboardAnnotation(activeDashboard.id, annotationId);
                  if (updated) setActiveDashboard(updated);
                } catch (err) {
                  void 0;
                }
              }}
            />}
          </>
        )}
      </main>

      {/* ── Drill-Down Panel ── */}
      <AnimatePresence>
        {drillDown && (
          <motion.div
            key="drill-down-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 h-full z-40 shadow-2xl flex flex-col"
            style={{
              width: 480,
              background: TOKENS.bg.elevated,
              borderLeft: `1px solid ${TOKENS.border.default}`,
            }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${TOKENS.border.default}` }}>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: TOKENS.text.primary }}>
                  Drill-Down: {drillDown.dimension} = {drillDown.value}
                </h3>
                {drillDown.data && (
                  <span className="text-[11px]" style={{ color: TOKENS.text.muted }}>{drillDown.data.rows?.length || 0} rows</span>
                )}
              </div>
              <button onClick={() => setDrillDown(null)} className="cursor-pointer"
                style={{ color: TOKENS.text.muted, background: 'none', border: 'none', fontSize: 18 }}>×</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {drillDown.loading && (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-6 h-6 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
                  <span className="text-sm" style={{ color: TOKENS.text.muted }}>Generating drill-down query...</span>
                </div>
              )}
              {drillDown.error && (
                <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                  {drillDown.error}
                </div>
              )}
              {drillDown.data && drillDown.data.columns?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {drillDown.data.columns.map(col => (
                          <th key={col} className="text-left px-3 py-2 font-semibold sticky top-0"
                            style={{ background: TOKENS.bg.surface, color: TOKENS.text.secondary, borderBottom: `1px solid ${TOKENS.border.default}` }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(drillDown.data.rows || []).slice(0, 100).map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${TOKENS.border.default}` }}>
                          {drillDown.data.columns.map(col => (
                            <td key={col} className="px-3 py-1.5" style={{ color: TOKENS.text.primary }}>
                              {row[col] != null ? String(row[col]) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Drill-down suggestion chips */}
            {drillSuggestions.length > 0 && (
              <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderTop: `1px solid ${TOKENS.border.default}` }}>
                <span className="text-[11px] w-full mb-1" style={{ color: TOKENS.text.muted }}>Explore further:</span>
                {drillSuggestions.map((s, i) => (
                  <button key={i}
                    className="px-3 py-1.5 rounded-full text-[11px] cursor-pointer"
                    style={{
                      background: TOKENS.accentGlow, color: TOKENS.accent,
                      border: `1px solid ${TOKENS.accent}33`,
                      transition: `all ${TOKENS.transition}`,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = TOKENS.accent; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = TOKENS.accentGlow; e.currentTarget.style.color = TOKENS.accent; }}
                    onClick={() => { setDrillDown(null); setDrillSuggestions([]); handleAICommand(s.question); }}
                  >
                    {s.question}
                  </button>
                ))}
              </div>
            )}
            {drillDown.sql && (
              <div className="px-5 py-3" style={{ borderTop: `1px solid ${TOKENS.border.default}` }}>
                <details>
                  <summary className="text-[11px] cursor-pointer" style={{ color: TOKENS.text.muted }}>View SQL</summary>
                  <pre className="mt-2 p-2 rounded-lg text-[11px] overflow-x-auto"
                    style={{ background: TOKENS.bg.surface, color: TOKENS.text.secondary }}>{drillDown.sql}</pre>
                </details>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals (lazy-loaded) ── */}
      <Suspense fallback={null}>
      <AnimatePresence>
        {editingTile && (
          <TileEditor
            key="tile-editor"
            tile={editingTile}
            dashboardId={activeDashboard?.id}
            connId={activeConnId}
            onSave={handleTileSave}
            onClose={() => setEditingTile(null)}
            onRefresh={handleTileRefresh}
            onDelete={handleTileDelete}
            customMetrics={activeDashboard?.customMetrics || []}
            schemaColumns={schemaColumns}
            defaultClassifications={defaultClassifications}
          />
        )}
      </AnimatePresence>

      {activeModal === 'metrics' && (
        <MetricEditor
          metrics={activeDashboard?.customMetrics || []}
          sampleRows={(() => {
            for (const tab of activeDashboard?.tabs || [])
              for (const sec of tab.sections || [])
                for (const tile of sec.tiles || [])
                  if (tile.rows?.length) return tile.rows;
            return [];
          })()}
          onSave={handleMetricsUpdate}
          onClose={() => setActiveModal(null)}
          schemaColumns={schemaColumns}
          fieldClassifications={defaultClassifications}
        />
      )}

      {activeModal === 'theme' && (
        <DashboardThemeEditor
          themeConfig={activeDashboard?.themeConfig || {}}
          onSave={handleThemeUpdate}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'bookmarks' && (
        <BookmarkManager
          dashboardId={activeDashboard?.id}
          currentState={getCurrentBookmarkState()}
          onApply={applyBookmarkState}
          onClose={() => setActiveModal(null)}
          tabNames={Object.fromEntries((activeDashboard?.tabs || []).map(t => [t.id, t.name || t.id]))}
        />
      )}

      {activeModal === 'versions' && activeDashboard && (
        <VersionHistory
          dashboardId={activeDashboard.id}
          onClose={() => setActiveModal(null)}
          onRestore={(restored) => {
            setActiveDashboard(restored);
            if (restored.tabs?.length > 0) setActiveTabId(restored.tabs[0].id);
          }}
        />
      )}

      {activeModal === 'share' && activeDashboard && (
        <ShareModal
          dashboardId={activeDashboard.id}
          dashboardName={activeDashboard.name}
          currentToken={shareToken}
          onClose={() => setActiveModal(null)}
          onTokenCreated={setShareToken}
        />
      )}

      {activeModal === 'settings' && (
        <SettingsModal
          dashboard={activeDashboard}
          onSave={handleSettingsSave}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'alerts' && (
        <AlertManager
          connId={activeConnId}
          dashboardId={activeDashboard?.id}
          onClose={() => setActiveModal(null)}
        />
      )}

      <AnimatePresence>
        {activeModal === 'export' && (
          <ExportModal
            key="export-modal"
            show={activeModal === 'export'}
            onClose={() => setActiveModal(null)}
            dashboardName={activeDashboard?.name || "Dashboard"}
            onExport={handleExport}
          />
        )}
      </AnimatePresence>

      {/* ── Undo Toast(s) ── */}
      <AnimatePresence>
        {undoStack.map((entry, idx) => (
          <motion.div
            key={entry.id}
            style={{
              position: "fixed",
              bottom: 24 + idx * 56,
              right: 24,
              zIndex: 50,
              background: TOKENS.bg.elevated,
              border: `1px solid ${TOKENS.border.default}`,
              borderRadius: 12,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            }}
            role="alert"
            variants={undoToastVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <span style={{ color: TOKENS.text.secondary, fontSize: 14 }}>
              Tile removed
            </span>
            <button
              onClick={() => handleUndoRemove(entry)}
              style={{
                background: "none",
                border: "none",
                color: TOKENS.accent,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Undo
            </button>
            <button
              onClick={() =>
                setUndoStack((prev) => prev.filter((u) => u.id !== entry.id))
              }
              style={{
                background: "none",
                border: "none",
                color: TOKENS.text.muted,
                cursor: "pointer",
                padding: 2,
                display: "flex",
                alignItems: "center",
              }}
              aria-label="Dismiss"
            >
              <svg
                width="14"
                height="14"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Floating Toolbar for selected tile ── */}
      {selectedTileId && (() => {
        let selectedTile = null;
        for (const tab of activeDashboard?.tabs || [])
          for (const sec of tab.sections || [])
            for (const t of sec.tiles || [])
              if (t.id === selectedTileId) selectedTile = t;
        if (!selectedTile) return null;
        return (
          <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
            <FloatingToolbar
              tile={selectedTile}
              onQuickUpdate={handleQuickTileUpdate}
              onOpenEditor={() => { handleTileEdit(selectedTile); setSelectedTileId(null); }}
            />
          </div>
        );
      })()}

      {/* ── Presentation Engine (replaces old fullscreen mode) ── */}
      {fullscreenMode && activeDashboard && (
        <PresentationEngine
          dashboard={activeDashboard}
          themeConfig={activeDashboard?.themeConfig}
          onExit={() => setFullscreenMode(false)}
        />
      )}

      {/* ── Command Palette (⌘K) ── */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commandList}
      />

      {/* "Adapting workspace" floating pill — visible only while the agent
          panel is being dragged or resized. Tells the user the dashboard is
          intentionally frozen and will redraw when they release. */}
      <div className="dash-resize-pill" data-visible={agentResizing || undefined} aria-live="polite">
        <span className="dash-resize-pill__dot" aria-hidden="true" />
        Adapting workspace
      </div>

      {/* Desktop-recommended notice for ultra-narrow viewports (< 700px).
          The builder is a power-user tool; below this width we'd need a
          completely separate mobile UX. Better to notify the user clearly
          than to show a broken layout. */}
      {showNarrowViewportHint && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            maxWidth: 'calc(100% - 2rem)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 9999,
            background: 'var(--glass-bg-card-elevated)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(24px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 18px 40px -16px rgba(0,0,0,0.45)',
            color: 'var(--text-primary)',
          }}
        >
          <span className="eyebrow-dot" style={{ background: 'var(--accent-warm, #FBBF24)' }} aria-hidden="true" />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Desktop recommended
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
            Builder works best on screens ≥ 1100&thinsp;px
          </span>
        </div>
      )}

      {/* Agent floating progress overlay */}
      {agentLoading && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: TOKENS.bg.elevated,
          border: `1px solid ${TOKENS.border.default}`,
          borderRadius: TOKENS.radius.lg, padding: '8px 20px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={TOKENS.accent} strokeWidth="2.5">
            <path d="M12 2a10 10 0 0110 10" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 500, color: TOKENS.accent }}>
            {(() => {
              const lastStep = agentSteps[agentSteps.length - 1];
              if (!lastStep) return 'Agent starting...';
              if (lastStep.type === 'thinking') return 'Analyzing...';
              if (lastStep.type === 'tool_call') return `Running ${lastStep.tool_name}...`;
              return 'Processing...';
            })()}
          </span>
        </div>
      )}

      </Suspense>
    </div>
  );
}

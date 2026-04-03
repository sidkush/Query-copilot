import { useState, useEffect, useCallback, useRef, Suspense, Component, lazy } from "react";
import { useSearchParams } from "react-router-dom";
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
import { TOKENS } from "../components/dashboard/tokens";
import CommandBar from "../components/dashboard/CommandBar";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import TabBar from "../components/dashboard/TabBar";
import Section from "../components/dashboard/Section";
import NotesPanel from "../components/dashboard/NotesPanel";
import ExportModal from "../components/dashboard/ExportModal";
import TileEditor from "../components/dashboard/TileEditor";
import MetricEditor from "../components/dashboard/MetricEditor";
import DashboardThemeEditor from "../components/dashboard/DashboardThemeEditor";
import GlobalFilterBar from "../components/dashboard/GlobalFilterBar";
import FloatingToolbar from "../components/dashboard/FloatingToolbar";
import CrossFilterBadge from "../components/dashboard/CrossFilterBadge";
import BookmarkManager from "../components/dashboard/BookmarkManager";
import { evaluateVisibilityRule } from "../lib/visibilityRules";

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

const sidebarItemStyle = {
  padding: "10px 14px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  transition: "background 0.15s",
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
  const dashboardGlobalFilters = useStore(s => s.dashboardGlobalFilters);
  const dashboardFilterVersion = useStore(s => s.dashboardFilterVersion);
  const tileEditVersion = useStore(s => s.tileEditVersion);
  const bumpTileEditVersion = useStore(s => s.bumpTileEditVersion);

  // ── State ──
  const [dashboards, setDashboards] = useState([]);
  const [activeDashboard, setActiveDashboard] = useState(null);
  const [activeTabId, setActiveTabId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTile, setEditingTile] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [undoStack, setUndoStack] = useState([]); // [{tile, sectionId, dashboard}]
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);
  const [newDashName, setNewDashName] = useState("");
  // globalFilters now lives in Zustand store as dashboardGlobalFilters
  const globalFilters = dashboardGlobalFilters;
  const [showMetricEditor, setShowMetricEditor] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [crossFilter, setCrossFilter] = useState(null); // { field, value }
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("qc_sidebar_collapsed")) === true; } catch { return false; }
  });
  const [aiCommandLoading, setAiCommandLoading] = useState(false);
  const [aiCommandError, setAiCommandError] = useState(null);
  const [searchParams] = useSearchParams();

  const saveTimer = useRef(null);
  const viewportSaveTimer = useRef(null);
  const undoTimers = useRef([]);
  const dashboardRef = useRef(activeDashboard);
  dashboardRef.current = activeDashboard;

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("qc_sidebar_collapsed", JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Derived: active tab and its sections ──
  const activeTab =
    activeDashboard?.tabs?.find((t) => t.id === activeTabId) || null;
  const sections = activeTab?.sections || [];

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
          setActiveDashboard(full);
          setActiveDashboardId(full.id);
          if (full.tabs?.length > 0) setActiveTabId(full.tabs[0].id);
        }
      } catch (err) {
        console.error("Failed to load dashboards:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-refresh tiles that have SQL but no data ──
  useEffect(() => {
    if (!activeDashboard?.tabs) return;
    const stale = [];
    for (const tab of activeDashboard.tabs) {
      for (const sec of tab.sections || []) {
        for (const tile of sec.tiles || []) {
          if (tile.sql && (!tile.rows || tile.rows.length === 0)) {
            const cached = getPrefetchData(activeDashboard.id, tile.id);
            if (cached) {
              // Apply cached data immediately instead of refreshing
              setActiveDashboard(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  tabs: prev.tabs.map(tab => ({
                    ...tab,
                    sections: (tab.sections || []).map(sec => ({
                      ...sec,
                      tiles: (sec.tiles || []).map(t =>
                        t.id === tile.id ? { ...t, ...cached } : t
                      ),
                    })),
                  })),
                };
              });
            } else {
              stale.push(tile.id);
            }
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
          console.error(`Auto-refresh tile ${tileId} failed:`, err);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeDashboard?.id, getPrefetchData]); // only re-run when dashboard changes, not on every tile update

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
            globalFilters: dashboard.globalFilters,
          });
        } catch (err) {
          console.error("Auto-save failed:", err);
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
        console.error("Failed to create dashboard:", err);
      }
    },
    [setActiveDashboardId]
  );

  const handleSelectDashboard = useCallback(
    async (id) => {
      try {
        const full = await api.getDashboard(id);
        setActiveDashboard(full);
        setActiveDashboardId(full.id);
        if (full.tabs?.length > 0) setActiveTabId(full.tabs[0].id);
        else setActiveTabId(null);
        // Restore persisted global filters into Zustand store
        if (full.globalFilters) applyGlobalFilters(full.globalFilters);
      } catch (err) {
        console.error("Failed to load dashboard:", err);
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
        console.error("Failed to delete dashboard:", err);
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
      console.error("Failed to add tab:", err);
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
        api.updateDashboard(prev.id, { tabs }).catch((err) =>
          console.error("Failed to rename tab:", err)
        );
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
        console.error("Failed to delete tab:", err);
      }
    },
    []
  );

  // ── Section layout change ──
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

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
        const updated = { ...prev, tabs };
        autoSave(updated);
        return updated;
      });
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
        const updated = { ...prev, tabs };
        autoSave(updated);
        return updated;
      });
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
        // Debounced save (2s) — less noisy than layout saves
        if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
        viewportSaveTimer.current = setTimeout(() => autoSave(updated), 2000);
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
        console.error("Failed to add section:", err);
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

  // ── Tile operations ──
  const handleTileEdit = useCallback(
    (tile) => {
      setEditingTile(tile);
    },
    []
  );

  const handleTileEditSQL = useCallback(
    (tile) => {
      // Open tile editor in SQL mode - reuse TileEditor
      setEditingTile({ ...tile, editMode: "sql" });
    },
    []
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
        console.error("Failed to change chart type:", err);
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

        // Show undo toast with 5s timeout
        if (removedTile) {
          const undoEntry = {
            id: Date.now(),
            tile: removedTile,
            sectionId: removedSectionId,
            dashboard: dash,
          };
          setUndoStack((prev) => [...prev, undoEntry]);
          const timer = setTimeout(() => {
            setUndoStack((prev) => prev.filter((u) => u.id !== undoEntry.id));
          }, 5000);
          undoTimers.current.push(timer);
        }
      } catch (err) {
        console.error("Failed to remove tile:", err);
      }
    },
    []
  );

  const handleUndoRemove = useCallback(
    async (undoEntry) => {
      try {
        await api.updateDashboard(undoEntry.dashboard.id, {
          tabs: undoEntry.dashboard.tabs,
        });
        setActiveDashboard(undoEntry.dashboard);
        setUndoStack((prev) => prev.filter((u) => u.id !== undoEntry.id));
      } catch (err) {
        console.error("Undo failed:", err);
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
      try {
        const filtersUrl = filtersOverride || globalFiltersRef.current;
        await api.refreshTile(dash.id, tileId, connId, filtersUrl);
        // Re-fetch full dashboard to guarantee fresh state
        const fresh = await api.getDashboard(dash.id);
        if (fresh) setActiveDashboard(fresh);
      } catch (err) {
        console.error("Failed to refresh tile:", err);
      }
    },
    []
  );

  const handleGlobalFiltersChange = useCallback((newFilters) => {
    clearPrefetchCache(dashboardRef.current?.id);
    // Write to Zustand store — bumps dashboardFilterVersion, triggering reactive refresh
    applyGlobalFilters(newFilters);
    const dash = dashboardRef.current;
    if (dash) autoSave({ ...dash, globalFilters: newFilters });
  }, [autoSave, clearPrefetchCache, applyGlobalFilters]);

  // ── Reactive tile refresh: watches Zustand filter/edit version counters ──
  const filterVersionRef = useRef(0);
  const editVersionRef = useRef(0);
  useEffect(() => {
    // Skip the initial render (version 0)
    if (dashboardFilterVersion === 0 && tileEditVersion === 0) return;
    // Only refresh if either version actually changed
    const filterChanged = dashboardFilterVersion !== filterVersionRef.current;
    const editChanged = tileEditVersion !== editVersionRef.current;
    if (!filterChanged && !editChanged) return;
    filterVersionRef.current = dashboardFilterVersion;
    editVersionRef.current = tileEditVersion;

    const dash = dashboardRef.current;
    const tabId = activeTabIdRef.current;
    if (!dash || !tabId) return;

    const currentTab = dash.tabs.find(t => t.id === tabId);
    if (!currentTab) return;

    const tileIds = [];
    currentTab.sections.forEach(s => s.tiles.forEach(t => tileIds.push(t.id)));
    // Fire all tile refreshes in parallel
    Promise.allSettled(
      tileIds.map(tid => handleTileRefresh(tid, activeConnId, globalFiltersRef.current))
    );
  }, [dashboardFilterVersion, tileEditVersion, handleTileRefresh, activeConnId]);

  const handleCrossFilterClick = useCallback((field, value) => {
    setCrossFilter(prev => {
      // Toggle: if same filter clicked again, clear it
      if (prev?.field === field && prev?.value === value) return null;
      return { field, value };
    });
  }, []);

  const clearCrossFilter = useCallback(() => setCrossFilter(null), []);

  const handleTileSave = useCallback(
    async (updatedTile) => {
      const dash = dashboardRef.current;
      if (!dash) return;
      try {
        await api.updateTile(dash.id, updatedTile.id, updatedTile);
        // Always re-fetch full dashboard to guarantee fresh state
        const fresh = await api.getDashboard(dash.id);
        if (fresh) setActiveDashboard(fresh);
        setEditingTile(null);
        // Bump tileEditVersion to trigger reactive refresh of all tiles
        bumpTileEditVersion();
      } catch (err) {
        console.error("Failed to save tile:", err);
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
    if (state.activeTabId) setActiveTabId(state.activeTabId);
    if (state.globalFilters) applyGlobalFilters(state.globalFilters);
    if (state.crossFilter !== undefined) setCrossFilter(state.crossFilter);
  }, [applyGlobalFilters]);

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
      console.error('Quick update failed:', err);
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
      } catch (err) {
        console.error("Failed to add tile:", err);
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
        console.error("Failed to add annotation:", err);
      }
    },
    []
  );

  // ── Export ──
  const handleExport = useCallback(
    () => {
      // ExportModal handles the actual export via html2canvas + jsPDF
      // This callback fires after successful export
      setShowExport(false);
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

    setAiCommandLoading(true);
    setAiCommandError(null);

    try {
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
      console.error("AI command failed:", err);
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

  // ── Settings (placeholder) ──
  const handleSettings = useCallback(() => {
    console.log("Open settings");
  }, []);

  // ── Fullscreen: Escape to exit ──
  useEffect(() => {
    if (!fullscreenMode) return;
    const handler = (e) => { if (e.key === 'Escape') setFullscreenMode(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreenMode]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
      undoTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // ── Loading state ──
  if (loading) {
    return (
      <div
        style={{
          background: TOKENS.bg.deep,
          minHeight: "100vh",
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
          minHeight: "100vh",
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
        <p style={{ color: TOKENS.text.secondary, fontSize: 18 }}>
          No dashboards yet
        </p>
        <p
          style={{
            color: TOKENS.text.muted,
            fontSize: 14,
            maxWidth: 400,
            textAlign: "center",
          }}
        >
          Create a dashboard to start building visual analytics from your
          queries.
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
      </div>
    );
  }

  return (
    <div
      style={{
        background: TOKENS.bg.deep,
        minHeight: "100vh",
        display: "flex",
        position: "relative",
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
          width: 280,
          background: TOKENS.bg.surface,
          borderRight: `1px solid ${TOKENS.border.default}`,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
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
          <span
            style={{
              color: TOKENS.text.primary,
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            Dashboards
          </span>
          <button
            onClick={() => setShowCreatePrompt(true)}
            style={{
              background: TOKENS.accent,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
            title="Create dashboard"
          >
            +
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
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {dashboards.map((d) => (
            <div
              key={d.id}
              onClick={() => handleSelectDashboard(d.id)}
              style={{
                ...sidebarItemStyle,
                background:
                  activeDashboard?.id === d.id
                    ? TOKENS.bg.elevated
                    : "transparent",
                color:
                  activeDashboard?.id === d.id
                    ? TOKENS.text.primary
                    : TOKENS.text.secondary,
                marginBottom: 2,
              }}
              onMouseEnter={(e) => {
                if (activeDashboard?.id !== d.id) {
                  e.currentTarget.style.background = TOKENS.bg.elevated + "80";
                }
              }}
              onMouseLeave={(e) => {
                if (activeDashboard?.id !== d.id) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
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
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  opacity: 0.5,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.color = "#ef4444";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.5";
                  e.currentTarget.style.color = TOKENS.text.muted;
                }}
                title="Delete dashboard"
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
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Sidebar footer with count */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: `1px solid ${TOKENS.border.default}`,
            color: TOKENS.text.muted,
            fontSize: 12,
          }}
        >
          {dashboards.length} dashboard{dashboards.length !== 1 ? "s" : ""}
        </div>
      </aside>}

      {/* ── Main Content ── */}
      <main
        id="dashboard-export-area"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          overflowY: "auto",
          position: "relative",
          zIndex: 10,
        }}
      >
        {!activeDashboard ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: TOKENS.text.muted,
              fontSize: 15,
            }}
          >
            Select a dashboard from the sidebar
          </div>
        ) : (
          <>
            {/* Fullscreen header bar */}
            {fullscreenMode && (
              <div className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b"
                style={{ background: 'rgba(5,5,6,0.92)', borderColor: TOKENS.border.default, backdropFilter: 'blur(20px)' }}>
                <h1 className="text-lg font-bold" style={{ color: TOKENS.text.primary, letterSpacing: '-0.02em' }}>
                  {activeDashboard?.name || 'Dashboard'}
                </h1>
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowExport(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                    style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary }}>
                    Export
                  </button>
                  <button onClick={() => setFullscreenMode(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                    style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                    </svg>
                    Exit Fullscreen
                  </button>
                </div>
              </div>
            )}

            {/* Command Bar (hidden in fullscreen) */}
            {!fullscreenMode && (
              <CommandBar
                onAddTile={() => handleAddTile()}
                onExport={() => setShowExport(true)}
                onSettings={handleSettings}
                onAICommand={handleAICommand}
                aiLoading={aiCommandLoading}
                aiError={aiCommandError}
                onClearError={() => setAiCommandError(null)}
              />
            )}

            {/* Dashboard Header (hidden in fullscreen) */}
            {!fullscreenMode && (
              <DashboardHeader
                dashboard={activeDashboard}
                saving={saving}
                onNameChange={handleNameChange}
                onOpenMetrics={() => setShowMetricEditor(true)}
                onOpenTheme={() => setShowThemeEditor(true)}
                onOpenBookmarks={() => setShowBookmarks(true)}
                onToggleFullscreen={() => setFullscreenMode(true)}
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
              connId={activeConnId}
              onChange={handleGlobalFiltersChange}
            />

            {/* Sections */}
            <div id="dashboard-content" key={activeTabId} style={{ flex: 1, padding: "16px 24px", background: activeDashboard?.themeConfig?.background?.dashboard || 'transparent' }}>
              {sections.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "64px 0",
                    gap: 12,
                  }}
                >
                  <p style={{ color: TOKENS.text.muted, fontSize: 14 }}>
                    This tab has no sections yet.
                  </p>
                  <button
                    onClick={() => handleAddSection()}
                    style={{
                      background: TOKENS.accent,
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 20px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Add Section
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
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.05, ease: "easeOut" }}
                    >
                      <Section
                        section={section}
                        connId={activeConnId}
                        onLayoutChange={handleLayoutChange}
                        onTileEdit={handleTileEdit}
                        onTileEditSQL={handleTileEditSQL}
                        onTileChartChange={handleTileChartChange}
                        onTileRemove={handleTileRemove}
                        onTileRefresh={handleTileRefresh}
                        onAddTile={handleAddTile}
                        onEditSection={handleEditSection}
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
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <button
                    onClick={() => handleAddSection()}
                    style={{
                      background: "transparent",
                      color: TOKENS.text.muted,
                      border: `1px dashed ${TOKENS.border.default}`,
                      borderRadius: 8,
                      padding: "8px 20px",
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "color 0.15s, border-color 0.15s",
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
                    + Add Section
                  </button>
                </div>
              )}
              {(() => {
                const hiddenCount = sections.length - sections.filter(s => evaluateVisibilityRule(s.visibilityRule, globalFilters, crossFilter)).length;
                if (hiddenCount === 0) return null;
                return (
                  <p style={{ textAlign: 'center', fontSize: 11, color: '#5C5F66', padding: '8px 0' }}>
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
            />}
          </>
        )}
      </main>

      {/* ── Modals ── */}
      <AnimatePresence>
        {editingTile && (
          <TileEditor
            key="tile-editor"
            tile={editingTile}
            dashboardId={activeDashboard?.id}
            onSave={handleTileSave}
            onClose={() => setEditingTile(null)}
            onRefresh={handleTileRefresh}
            onDelete={handleTileDelete}
            customMetrics={activeDashboard?.customMetrics || []}
          />
        )}
      </AnimatePresence>

      {showMetricEditor && (
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
          onClose={() => setShowMetricEditor(false)}
        />
      )}

      {showThemeEditor && (
        <DashboardThemeEditor
          themeConfig={activeDashboard?.themeConfig || {}}
          onSave={handleThemeUpdate}
          onClose={() => setShowThemeEditor(false)}
        />
      )}

      {showBookmarks && (
        <BookmarkManager
          dashboardId={activeDashboard?.id}
          currentState={getCurrentBookmarkState()}
          onApply={applyBookmarkState}
          onClose={() => setShowBookmarks(false)}
        />
      )}

      <AnimatePresence>
        {showExport && (
          <ExportModal
            key="export-modal"
            show={showExport}
            onClose={() => setShowExport(false)}
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
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
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
    </div>
  );
}

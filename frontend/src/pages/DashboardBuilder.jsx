import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  const { activeDashboardId, setActiveDashboardId } = useStore();

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

  const saveTimer = useRef(null);
  const undoTimers = useRef([]);

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
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      }
    },
    [setActiveDashboardId]
  );

  const handleDeleteDashboard = useCallback(
    async (id) => {
      if (!confirm("Delete this dashboard? This cannot be undone.")) return;
      try {
        await api.deleteDashboard(id);
        setDashboards((prev) => prev.filter((d) => d.id !== id));
        if (activeDashboard?.id === id) {
          setActiveDashboard(null);
          setActiveDashboardId(null);
          setActiveTabId(null);
        }
      } catch (err) {
        console.error("Failed to delete dashboard:", err);
      }
    },
    [activeDashboard, setActiveDashboardId]
  );

  // ── Dashboard name change ──
  const handleNameChange = useCallback(
    (newName) => {
      if (!activeDashboard) return;
      const updated = { ...activeDashboard, name: newName };
      setActiveDashboard(updated);
      setDashboards((prev) =>
        prev.map((d) => (d.id === updated.id ? { ...d, name: newName } : d))
      );
      autoSave(updated);
    },
    [activeDashboard, autoSave]
  );

  // ── Tab operations ──
  const handleTabSelect = useCallback((tabId) => {
    setActiveTabId(tabId);
  }, []);

  const handleTabAdd = useCallback(async () => {
    if (!activeDashboard) return;
    try {
      const res = await api.addTab(activeDashboard.id, "New Tab");
      setActiveDashboard(res);
      const newTab = res.tabs[res.tabs.length - 1];
      if (newTab) setActiveTabId(newTab.id);
    } catch (err) {
      console.error("Failed to add tab:", err);
    }
  }, [activeDashboard]);

  const handleTabRename = useCallback(
    (tabId, newName) => {
      if (!activeDashboard) return;
      const tabs = activeDashboard.tabs.map((t) =>
        t.id === tabId ? { ...t, name: newName } : t
      );
      const updated = { ...activeDashboard, tabs };
      setActiveDashboard(updated);
      api.updateDashboard(activeDashboard.id, { tabs }).catch((err) =>
        console.error("Failed to rename tab:", err)
      );
    },
    [activeDashboard]
  );

  const handleTabDelete = useCallback(
    async (tabId) => {
      if (!activeDashboard) return;
      try {
        const res = await api.deleteTab(activeDashboard.id, tabId);
        setActiveDashboard(res);
        if (activeTabId === tabId) {
          setActiveTabId(res.tabs?.[0]?.id || null);
        }
      } catch (err) {
        console.error("Failed to delete tab:", err);
      }
    },
    [activeDashboard, activeTabId]
  );

  // ── Section layout change ──
  const handleLayoutChange = useCallback(
    (sectionId, newLayout) => {
      if (!activeDashboard || !activeTabId) return;
      const tabs = activeDashboard.tabs.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        return {
          ...tab,
          sections: tab.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, layout: newLayout } : sec
          ),
        };
      });
      const updated = { ...activeDashboard, tabs };
      setActiveDashboard(updated);
      autoSave(updated);
    },
    [activeDashboard, activeTabId, autoSave]
  );

  // ── Add section ──
  const handleAddSection = useCallback(
    async (name = "New Section") => {
      if (!activeDashboard || !activeTabId) return;
      try {
        const res = await api.addSection(activeDashboard.id, activeTabId, name);
        setActiveDashboard(res);
      } catch (err) {
        console.error("Failed to add section:", err);
      }
    },
    [activeDashboard, activeTabId]
  );

  // ── Edit section (rename, etc.) ──
  const handleEditSection = useCallback(
    (sectionId, updates) => {
      if (!activeDashboard || !activeTabId) return;
      const tabs = activeDashboard.tabs.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        return {
          ...tab,
          sections: tab.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, ...updates } : sec
          ),
        };
      });
      const updated = { ...activeDashboard, tabs };
      setActiveDashboard(updated);
      autoSave(updated);
    },
    [activeDashboard, activeTabId, autoSave]
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
      if (!activeDashboard) return;
      try {
        const res = await api.updateTile(activeDashboard.id, tileId, {
          chartType,
        });
        // Update local state
        const tabs = activeDashboard.tabs.map((tab) => ({
          ...tab,
          sections: tab.sections.map((sec) => ({
            ...sec,
            tiles: sec.tiles.map((t) =>
              t.id === tileId ? { ...t, chartType } : t
            ),
          })),
        }));
        const updated = { ...activeDashboard, tabs };
        setActiveDashboard(updated);
      } catch (err) {
        console.error("Failed to change chart type:", err);
      }
    },
    [activeDashboard]
  );

  const handleTileRemove = useCallback(
    async (tileId) => {
      if (!activeDashboard || !activeTabId) return;
      // Find the tile and its section for undo
      let removedTile = null;
      let removedSectionId = null;
      for (const sec of activeTab?.sections || []) {
        const found = sec.tiles?.find((t) => t.id === tileId);
        if (found) {
          removedTile = found;
          removedSectionId = sec.id;
          break;
        }
      }

      try {
        await api.removeDashboardTile(activeDashboard.id, tileId);
        // Update local state: remove tile from section and layout
        const tabs = activeDashboard.tabs.map((tab) => {
          if (tab.id !== activeTabId) return tab;
          return {
            ...tab,
            sections: tab.sections.map((sec) => ({
              ...sec,
              tiles: sec.tiles.filter((t) => t.id !== tileId),
              layout: (sec.layout || []).filter((l) => l.i !== tileId),
            })),
          };
        });
        const updated = { ...activeDashboard, tabs };
        setActiveDashboard(updated);

        // Show undo toast with 5s timeout
        if (removedTile) {
          const undoEntry = {
            id: Date.now(),
            tile: removedTile,
            sectionId: removedSectionId,
            dashboard: activeDashboard,
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
    [activeDashboard, activeTabId, activeTab]
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

  const handleTileRefresh = useCallback(
    async (tileId, connId) => {
      if (!activeDashboard) return;
      try {
        const res = await api.refreshTile(activeDashboard.id, tileId, connId);
        // Update the tile in local state
        const tabs = activeDashboard.tabs.map((tab) => ({
          ...tab,
          sections: tab.sections.map((sec) => ({
            ...sec,
            tiles: sec.tiles.map((t) =>
              t.id === tileId ? { ...t, ...res } : t
            ),
          })),
        }));
        const updated = { ...activeDashboard, tabs };
        setActiveDashboard(updated);
      } catch (err) {
        console.error("Failed to refresh tile:", err);
      }
    },
    [activeDashboard]
  );

  const handleTileSave = useCallback(
    async (updatedTile) => {
      if (!activeDashboard) return;
      try {
        await api.updateTile(activeDashboard.id, updatedTile.id, updatedTile);
        const tabs = activeDashboard.tabs.map((tab) => ({
          ...tab,
          sections: tab.sections.map((sec) => ({
            ...sec,
            tiles: sec.tiles.map((t) =>
              t.id === updatedTile.id ? { ...t, ...updatedTile } : t
            ),
          })),
        }));
        const updated = { ...activeDashboard, tabs };
        setActiveDashboard(updated);
        setEditingTile(null);
      } catch (err) {
        console.error("Failed to save tile:", err);
      }
    },
    [activeDashboard]
  );

  const handleTileDelete = useCallback(
    async (tileId) => {
      setEditingTile(null);
      await handleTileRemove(tileId);
    },
    [handleTileRemove]
  );

  // ── Add tile (from CommandBar) ──
  const handleAddTile = useCallback(
    async (sectionId) => {
      if (!activeDashboard || !activeTabId) return;
      const targetSectionId =
        sectionId || sections[0]?.id;
      if (!targetSectionId) return;
      try {
        const tile = {
          title: "New Tile",
          chartType: "bar",
          columns: [],
          rows: [],
        };
        const res = await api.addTileToSection(
          activeDashboard.id,
          activeTabId,
          targetSectionId,
          tile
        );
        setActiveDashboard(res);
      } catch (err) {
        console.error("Failed to add tile:", err);
      }
    },
    [activeDashboard, activeTabId, sections]
  );

  // ── Annotations ──
  const handleAddAnnotation = useCallback(
    async (text, authorName) => {
      if (!activeDashboard) return;
      try {
        const res = await api.addDashboardAnnotation(
          activeDashboard.id,
          text,
          authorName
        );
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
    [activeDashboard]
  );

  // ── Export ──
  const handleExport = useCallback(
    (format) => {
      console.log("Exporting dashboard as", format);
      setShowExport(false);
    },
    []
  );

  // ── AI Command (placeholder) ──
  const handleAICommand = useCallback((command) => {
    console.log("AI command:", command);
  }, []);

  // ── Settings (placeholder) ──
  const handleSettings = useCallback(() => {
    console.log("Open settings");
  }, []);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
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
      }}
    >
      {/* ── Sidebar: Dashboard List ── */}
      <aside
        style={{
          width: 280,
          minWidth: 280,
          background: TOKENS.bg.base,
          borderRight: `1px solid ${TOKENS.border.default}`,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "sticky",
          top: 0,
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
      </aside>

      {/* ── Main Content ── */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          overflowY: "auto",
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
            {/* Command Bar */}
            <CommandBar
              onAddTile={() => handleAddTile()}
              onExport={() => setShowExport(true)}
              onSettings={handleSettings}
              onAICommand={handleAICommand}
            />

            {/* Dashboard Header */}
            <DashboardHeader
              dashboard={activeDashboard}
              saving={saving}
              onNameChange={handleNameChange}
            />

            {/* Tab Bar */}
            <TabBar
              tabs={activeDashboard.tabs || []}
              activeTabId={activeTabId}
              onSelect={handleTabSelect}
              onAdd={handleTabAdd}
              onRename={handleTabRename}
              onDelete={handleTabDelete}
            />

            {/* Sections */}
            <div style={{ flex: 1, padding: "16px 24px" }}>
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
                sections.map((section) => (
                  <Section
                    key={section.id}
                    section={section}
                    onLayoutChange={handleLayoutChange}
                    onTileEdit={handleTileEdit}
                    onTileEditSQL={handleTileEditSQL}
                    onTileChartChange={handleTileChartChange}
                    onTileRemove={handleTileRemove}
                    onTileRefresh={handleTileRefresh}
                    onAddTile={handleAddTile}
                    onEditSection={handleEditSection}
                  />
                ))
              )}

              {sections.length > 0 && (
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
            </div>

            {/* Notes Panel */}
            <NotesPanel
              annotations={activeDashboard.annotations || []}
              userName={
                useStore.getState().user?.name ||
                useStore.getState().user?.email ||
                "Anonymous"
              }
              onAdd={handleAddAnnotation}
            />
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
          />
        )}
      </AnimatePresence>

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
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import ResultsChart from "../components/ResultsChart";
import StatSummaryCard from "../components/StatSummaryCard";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";

/* ── Animation variants ── */
const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalContentVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 28 },
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    y: 16,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

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

/* ── Tile Edit Modal ── */
function TileEditor({ tile, onSave, onClose }) {
  const [title, setTitle] = useState(tile.title || "");
  const [bgColor, setBgColor] = useState(tile.bgColor || "default");
  const [borderColor, setBorderColor] = useState(tile.borderColor || "gray");

  const BG_OPTIONS = [
    { key: "default", label: "Default", cls: "bg-gray-900/60" },
    { key: "dark", label: "Dark", cls: "bg-gray-950" },
    { key: "indigo", label: "Indigo", cls: "bg-indigo-950/40" },
    { key: "blue", label: "Blue", cls: "bg-blue-950/40" },
    { key: "green", label: "Green", cls: "bg-emerald-950/40" },
    { key: "purple", label: "Purple", cls: "bg-purple-950/40" },
    { key: "amber", label: "Amber", cls: "bg-amber-950/30" },
    { key: "rose", label: "Rose", cls: "bg-rose-950/30" },
  ];

  const BORDER_OPTIONS = [
    { key: "gray", cls: "border-gray-800" },
    { key: "indigo", cls: "border-indigo-500/30" },
    { key: "blue", cls: "border-blue-500/30" },
    { key: "green", cls: "border-emerald-500/30" },
    { key: "purple", cls: "border-purple-500/30" },
    { key: "amber", cls: "border-amber-500/30" },
    { key: "rose", cls: "border-rose-500/30" },
    { key: "white", cls: "border-white/20" },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      variants={modalOverlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="glass-card rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        variants={modalContentVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Edit Tile</h3>

        {/* Title */}
        <label className="block text-xs text-gray-400 mb-1">Title</label>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full glass-input rounded-lg px-3 py-2 text-sm text-white mb-4 input-glow"
          placeholder="Chart title..."
        />

        {/* Background Color */}
        <label className="block text-xs text-gray-400 mb-2">Background</label>
        <div className="flex gap-2 mb-4 flex-wrap">
          {BG_OPTIONS.map((bg) => (
            <button
              key={bg.key}
              onClick={() => setBgColor(bg.key)}
              className={`w-8 h-8 rounded-lg border-2 transition cursor-pointer ${bg.cls} ${bgColor === bg.key ? "border-white scale-110" : "border-transparent hover:border-gray-600"}`}
              title={bg.label}
            />
          ))}
        </div>

        {/* Border Color */}
        <label className="block text-xs text-gray-400 mb-2">Border</label>
        <div className="flex gap-2 mb-6 flex-wrap">
          {BORDER_OPTIONS.map((b) => (
            <button
              key={b.key}
              onClick={() => setBorderColor(b.key)}
              className={`w-8 h-8 rounded-lg border-2 transition cursor-pointer ${b.cls} bg-gray-800 ${borderColor === b.key ? "ring-2 ring-white scale-110" : "hover:ring-1 hover:ring-gray-500"}`}
              title={b.key}
            />
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition cursor-pointer">Cancel</button>
          <button
            onClick={() => onSave({ ...tile, title, bgColor, borderColor })}
            className="px-4 py-2 text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg hover:from-indigo-500 hover:to-violet-500 transition cursor-pointer btn-glow shadow-lg shadow-indigo-500/20"
          >
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── BG / Border class resolvers ── */
const BG_MAP = {
  default: "bg-gray-900/60", dark: "bg-gray-950", indigo: "bg-indigo-950/40",
  blue: "bg-blue-950/40", green: "bg-emerald-950/40", purple: "bg-purple-950/40",
  amber: "bg-amber-950/30", rose: "bg-rose-950/30",
};
const BORDER_MAP = {
  gray: "border-gray-800", indigo: "border-indigo-500/30", blue: "border-blue-500/30",
  green: "border-emerald-500/30", purple: "border-purple-500/30",
  amber: "border-amber-500/30", rose: "border-rose-500/30", white: "border-white/20",
};

/* ── Dashboard Tile ── */
function DashboardTile({ tile, onEdit, onRemove }) {
  const bg = BG_MAP[tile.bgColor] || BG_MAP.default;
  const border = BORDER_MAP[tile.borderColor] || BORDER_MAP.gray;

  return (
    <div className={`h-full flex flex-col rounded-xl border overflow-hidden ${bg} ${border}`}>
      {/* Tile header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/50 bg-black/20 cursor-grab active:cursor-grabbing drag-handle">
        <h4 className="text-sm font-medium text-gray-200 truncate">{tile.title || "Untitled"}</h4>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(tile); }}
            className="p-1 rounded hover:bg-gray-700/60 text-gray-500 hover:text-white transition cursor-pointer"
            title="Edit tile"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(tile.id); }}
            className="p-1 rounded hover:bg-red-900/60 text-gray-500 hover:text-red-400 transition cursor-pointer"
            title="Remove tile"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {/* Chart content */}
      <div className="flex-1 min-h-0 overflow-hidden p-1">
        {tile.columns && tile.rows && tile.rows.length > 0 ? (
          <ResultsChart
            columns={tile.columns}
            rows={tile.rows}
            embedded
            defaultChartType={tile.chartType}
            defaultPalette={tile.palette}
            defaultMeasure={tile.selectedMeasure}
            defaultMeasures={tile.activeMeasures}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">No data</div>
        )}
      </div>
    </div>
  );
}

/* ── Create Dashboard Modal ── */
function CreateModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      variants={modalOverlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="glass-card rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        variants={modalContentVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Create Dashboard</h3>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          className="w-full glass-input rounded-lg px-3 py-2 text-sm text-white mb-4 input-glow"
          placeholder="e.g., Digital Marketing Dashboard"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onCreate(name.trim())}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition cursor-pointer">Cancel</button>
          <button
            onClick={() => name.trim() && onCreate(name.trim())}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg hover:from-indigo-500 hover:to-violet-500 transition disabled:opacity-40 cursor-pointer btn-glow shadow-lg shadow-indigo-500/20"
          >
            Create
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Stat summary icons ── */
const TotalQueriesIcon = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
  </svg>
);
const SuccessRateIcon = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const AvgResponseIcon = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const ActiveConnectionsIcon = (
  <span className="relative flex h-5 w-5 items-center justify-center">
    <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-violet-400 opacity-50" />
    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-400" />
  </span>
);

/* ════════════════════════════════════════════════════════════════
   Main DashboardBuilder Page
   ════════════════════════════════════════════════════════════════ */
export default function DashboardBuilder() {
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState([]);
  const [activeDashboard, setActiveDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTile, setEditingTile] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [undoTile, setUndoTile] = useState(null); // { tile, dashboard } for undo
  const saveTimer = useRef(null);
  const gridContainerRef = useRef(null);
  const [gridWidth, setGridWidth] = useState(1200);

  // Stats for summary cards
  const [stats, setStats] = useState({
    totalQueries: 0,
    successRate: 0,
    avgResponseTime: 0,
    activeConnections: 0,
    querySparkline: [],
  });

  // Measure grid container width
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setGridWidth(entry.contentRect.width - 32); // account for padding
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeDashboard]);

  // Load dashboards on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getDashboards();
        setDashboards(res.dashboards || []);
        // Auto-open the first dashboard if exists
        if (res.dashboards?.length > 0) {
          const full = await api.getDashboard(res.dashboards[0].id);
          setActiveDashboard(full);
        }
      } catch (err) {
        console.error("Failed to load dashboards:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch account stats on mount
  useEffect(() => {
    (async () => {
      try {
        const account = await api.getAccount();
        const totalQueries = account.total_queries ?? account.totalQueries ?? 0;
        const successfulQueries = account.successful_queries ?? account.successfulQueries ?? 0;
        const successRate = totalQueries > 0 ? Math.round((successfulQueries / totalQueries) * 100) : 0;
        const avgResponseTime = account.avg_response_time ?? account.avgResponseTime ?? 0;
        const activeConnections = account.active_connections ?? account.activeConnections ?? 0;
        const querySparkline = account.query_sparkline ?? account.querySparkline ?? [3, 5, 2, 8, 6, 9, 4, 7, 5, 8, 10, 6];

        setStats({
          totalQueries,
          successRate,
          avgResponseTime: Math.round(avgResponseTime),
          activeConnections,
          querySparkline,
        });
      } catch (err) {
        console.error("Failed to load account stats:", err);
      }
    })();
  }, []);

  // Auto-save debounced
  const autoSave = useCallback((dashboard) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSaving(true);
        await api.updateDashboard(dashboard.id, {
          tiles: dashboard.tiles,
          layout: dashboard.layout,
          name: dashboard.name,
        });
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setSaving(false);
      }
    }, 800);
  }, []);

  const handleCreate = useCallback(async (name) => {
    try {
      const d = await api.createDashboard(name);
      setDashboards((prev) => [...prev, { id: d.id, name: d.name, created_at: d.created_at, tile_count: 0 }]);
      setActiveDashboard(d);
      setShowCreate(false);
    } catch (err) {
      alert("Failed to create dashboard: " + err.message);
    }
  }, []);

  const handleSelectDashboard = useCallback(async (id) => {
    try {
      const full = await api.getDashboard(id);
      setActiveDashboard(full);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    }
  }, []);

  const handleDeleteDashboard = useCallback(async () => {
    if (!activeDashboard) return;
    if (!confirm("Delete this dashboard? This cannot be undone.")) return;
    try {
      await api.deleteDashboard(activeDashboard.id);
      setDashboards((prev) => prev.filter((d) => d.id !== activeDashboard.id));
      setActiveDashboard(null);
    } catch (err) {
      alert("Failed to delete: " + err.message);
    }
  }, [activeDashboard]);

  const handleDuplicateDashboard = useCallback(async () => {
    if (!activeDashboard) return;
    try {
      const newName = `${activeDashboard.name} (Copy)`;
      const d = await api.createDashboard(newName);
      // Copy tiles and layout to the new dashboard
      await api.updateDashboard(d.id, {
        tiles: activeDashboard.tiles,
        layout: activeDashboard.layout,
        name: newName,
      });
      const full = await api.getDashboard(d.id);
      setDashboards((prev) => [...prev, { id: full.id, name: full.name, created_at: full.created_at, tile_count: full.tiles?.length || 0 }]);
      setActiveDashboard(full);
    } catch (err) {
      alert("Failed to duplicate: " + err.message);
    }
  }, [activeDashboard]);

  const handleLayoutChange = useCallback((layout) => {
    if (!activeDashboard) return;
    const updated = { ...activeDashboard, layout };
    setActiveDashboard(updated);
    autoSave(updated);
  }, [activeDashboard, autoSave]);

  const handleTileEdit = useCallback((updatedTile) => {
    if (!activeDashboard) return;
    const tiles = activeDashboard.tiles.map((t) => (t.id === updatedTile.id ? updatedTile : t));
    const updated = { ...activeDashboard, tiles };
    setActiveDashboard(updated);
    setEditingTile(null);
    autoSave(updated);
  }, [activeDashboard, autoSave]);

  const handleTileRemove = useCallback(async (tileId) => {
    if (!activeDashboard) return;
    // Save tile for undo before removing
    const removedTile = activeDashboard.tiles.find((t) => t.id === tileId);
    const prevDashboard = { ...activeDashboard };
    try {
      const res = await api.removeDashboardTile(activeDashboard.id, tileId);
      setActiveDashboard(res);
      if (removedTile) {
        setUndoTile({ tile: removedTile, dashboard: prevDashboard });
        setTimeout(() => setUndoTile(null), 6000); // auto-dismiss undo after 6s
      }
    } catch (err) {
      console.error("Failed to remove tile:", err);
    }
  }, [activeDashboard]);

  const handleUndoRemove = useCallback(async () => {
    if (!undoTile) return;
    try {
      // Re-add the tile by updating the dashboard with the old state
      await api.updateDashboard(undoTile.dashboard.id, {
        tiles: undoTile.dashboard.tiles,
        layout: undoTile.dashboard.layout,
        name: undoTile.dashboard.name,
      });
      setActiveDashboard(undoTile.dashboard);
      setUndoTile(null);
    } catch (err) {
      console.error("Undo failed:", err);
    }
  }, [undoTile]);

  const handleNameSave = useCallback(() => {
    if (!activeDashboard || !nameInput.trim()) return;
    const updated = { ...activeDashboard, name: nameInput.trim() };
    setActiveDashboard(updated);
    setDashboards((prev) => prev.map((d) => (d.id === updated.id ? { ...d, name: updated.name } : d)));
    setEditingName(false);
    autoSave(updated);
  }, [activeDashboard, nameInput, autoSave]);

  // Build layout items from dashboard
  const layoutItems = useMemo(() => {
    if (!activeDashboard?.layout) return [];
    return activeDashboard.layout.map((l) => ({
      ...l,
      minW: 3, minH: 3, maxH: 12,
    }));
  }, [activeDashboard?.layout]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#06060e] overflow-hidden relative">
      <div className="fixed inset-0 mesh-gradient opacity-20 pointer-events-none" />
      {/* Header */}
      <div className="glass-navbar flex items-center justify-between px-6 py-4 relative z-10">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
          </svg>
          {activeDashboard ? (
            editingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNameSave()}
                  onBlur={handleNameSave}
                  className="glass-input rounded-lg px-3 py-1 text-white text-lg font-semibold input-glow"
                  autoFocus
                />
              </div>
            ) : (
              <h1
                className="text-lg font-semibold text-white cursor-pointer hover:text-indigo-300 transition"
                onClick={() => { setNameInput(activeDashboard.name); setEditingName(true); }}
                title="Click to rename"
              >
                {activeDashboard.name}
              </h1>
            )
          ) : (
            <h1 className="text-lg font-semibold text-white">Dashboards</h1>
          )}
          {saving && <span className="text-xs text-gray-500 animate-pulse">Saving...</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Dashboard selector dropdown */}
          {dashboards.length > 1 && (
            <select
              value={activeDashboard?.id || ""}
              onChange={(e) => handleSelectDashboard(e.target.value)}
              className="glass-input rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer"
            >
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg hover:from-indigo-500 hover:to-violet-500 transition cursor-pointer btn-glow shadow-lg shadow-indigo-500/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
          </button>

          {activeDashboard && (
            <>
            <button
              onClick={handleDuplicateDashboard}
              className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-400 hover:bg-indigo-900/30 transition cursor-pointer"
              title="Duplicate dashboard"
              aria-label="Duplicate dashboard"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
            </button>
            <button
              onClick={handleDeleteDashboard}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/30 transition cursor-pointer"
              title="Delete dashboard"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto relative z-10">
        {!activeDashboard ? (
          /* Empty state */
          <motion.div
            className="flex flex-col items-center justify-center h-full gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
              </svg>
            </div>
            <p className="text-gray-400 text-lg">No dashboards yet</p>
            <p className="text-gray-600 text-sm max-w-md text-center">
              Create a dashboard, then run queries in Chat and use the + button on any chart to add it here.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:from-indigo-500 hover:to-violet-500 transition cursor-pointer btn-glow shadow-lg shadow-indigo-500/20"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Your First Dashboard
            </button>
          </motion.div>
        ) : activeDashboard.tiles?.length === 0 ? (
          /* Dashboard exists but empty */
          <motion.div
            className="flex flex-col items-center justify-center h-full gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="w-16 h-16 rounded-2xl glass border-indigo-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <p className="text-gray-300 text-lg font-medium">{activeDashboard.name}</p>
            <p className="text-gray-500 text-sm max-w-md text-center">
              This dashboard is empty. Go to Chat, run a query, and click the + button on any chart to add it here.
            </p>
            <button
              onClick={() => navigate("/chat")}
              className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:from-indigo-500 hover:to-violet-500 transition cursor-pointer btn-glow shadow-lg shadow-indigo-500/20"
            >
              Go to Chat
            </button>
          </motion.div>
        ) : (
          /* Stat summary row + Grid layout */
          <div className="p-4" ref={gridContainerRef}>
            {/* Stat Summary Row */}
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StaggerItem>
                <StatSummaryCard
                  title="Total Queries"
                  value={stats.totalQueries}
                  icon={TotalQueriesIcon}
                  color="indigo"
                  sparkline={stats.querySparkline}
                />
              </StaggerItem>
              <StaggerItem>
                <StatSummaryCard
                  title="Success Rate"
                  value={stats.successRate}
                  suffix="%"
                  icon={SuccessRateIcon}
                  color="emerald"
                />
              </StaggerItem>
              <StaggerItem>
                <StatSummaryCard
                  title="Avg Response Time"
                  value={stats.avgResponseTime}
                  suffix="ms"
                  icon={AvgResponseIcon}
                  color="amber"
                />
              </StaggerItem>
              <StaggerItem>
                <StatSummaryCard
                  title="Active Connections"
                  value={stats.activeConnections}
                  icon={ActiveConnectionsIcon}
                  color="violet"
                />
              </StaggerItem>
            </StaggerContainer>

            {/* Dashboard Grid */}
            <StaggerContainer>
              <GridLayout
                className="layout"
                layout={layoutItems}
                cols={12}
                rowHeight={80}
                width={gridWidth}
                isDraggable
                isResizable
                draggableHandle=".drag-handle"
                onLayoutChange={(layout) => handleLayoutChange(layout)}
                compactType="vertical"
                margin={[12, 12]}
              >
                {activeDashboard.tiles.map((tile) => (
                  <motion.div key={tile.id} layout transition={{ type: "spring", stiffness: 300, damping: 30 }}>
                    <DashboardTile
                      tile={tile}
                      onEdit={setEditingTile}
                      onRemove={handleTileRemove}
                    />
                  </motion.div>
                ))}
              </GridLayout>
            </StaggerContainer>
          </div>
        )}
      </div>

      {/* Modals with AnimatePresence */}
      <AnimatePresence>
        {showCreate && (
          <CreateModal
            key="create-modal"
            onClose={() => setShowCreate(false)}
            onCreate={handleCreate}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editingTile && (
          <TileEditor
            key="tile-editor-modal"
            tile={editingTile}
            onSave={handleTileEdit}
            onClose={() => setEditingTile(null)}
          />
        )}
      </AnimatePresence>

      {/* Animated undo toast */}
      <AnimatePresence>
        {undoTile && (
          <motion.div
            key="undo-toast"
            className="fixed bottom-6 right-6 z-50 glass-card rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-black/50"
            role="alert"
            variants={undoToastVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <span className="text-sm text-gray-300">Tile removed</span>
            <button
              onClick={handleUndoRemove}
              className="text-sm font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer transition"
            >
              Undo
            </button>
            <button
              onClick={() => setUndoTile(null)}
              className="text-gray-500 hover:text-white cursor-pointer transition"
              aria-label="Dismiss"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

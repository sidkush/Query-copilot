import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";
import { api } from "../api";
import DashboardShell from "../components/dashboard/DashboardShell";

const AgentPanel = lazy(() => import("../components/agent/AgentPanel"));
const ChartEditor = lazy(() => import("../components/editor/ChartEditor"));

const DEFAULT_CHART_SPEC = Object.freeze({
  $schema: "askdb/chart-spec/v1",
  type: "cartesian",
  mark: "bar",
  encoding: {},
});

/**
 * AnalyticsShell — new-path production page for /analytics.
 *
 * Gated behind the `NEW_CHART_EDITOR_ENABLED` feature flag. When the
 * flag is false, App.jsx renders the legacy DashboardBuilder instead;
 * this file is never loaded. When true, this page fetches the user's
 * active dashboard (or first-available), flattens its
 * tabs[].sections[].tiles[] structure into a flat tile array, and
 * mounts `<DashboardShell />` with the migrated tiles + the live
 * dashboard id.
 *
 * Tile shape from the backend post-Phase 4b migration carries both
 * the legacy fields (chartType, rows, columns) AND a `chart_spec`,
 * so DashboardTileCanvas inside the shell renders via the new-path
 * VegaRenderer (no ECharts) while DashboardBuilder rollback safety
 * still works if the flag is flipped back off.
 *
 * Layout persistence for the Workbench mode passes through to
 * `api.updateDashboard` — the existing PUT /dashboards/{id} endpoint
 * already accepts a nested `tabs` payload with section-level `layout`
 * arrays, so we rebuild the full dashboard shape and send it back.
 */
/**
 * Build a resultSet with columnProfile for the ChartEditor DataRail.
 * Tiles store {columns, rows} but may lack columnProfile.
 * We infer it from the data so the DataRail populates dimensions/measures.
 */
function buildTileResultSet(tile, schemaColumns = []) {
  const columns = Array.isArray(tile?.columns) ? tile.columns : [];
  let rows = Array.isArray(tile?.rows) ? tile.rows : [];

  // If rows are objects, extract columns from first row
  if (rows.length > 0 && !Array.isArray(rows[0]) && typeof rows[0] === 'object') {
    if (columns.length === 0) {
      // columns not stored — derive from row keys
      const firstRow = rows[0];
      columns.push(...Object.keys(firstRow));
    }
  }

  // Build columnProfile if missing
  let columnProfile = Array.isArray(tile?.columnProfile) && tile.columnProfile.length > 0
    ? tile.columnProfile
    : columns.map(name => {
        // Sample first row value to infer type
        const sample = rows[0];
        const val = Array.isArray(sample) ? sample[columns.indexOf(name)] : sample?.[name];
        const isNumeric = typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '');
        const isDate = typeof val === 'string' && /^\d{4}-\d{2}/.test(val);
        return {
          name,
          dtype: isDate ? 'date' : isNumeric ? 'float' : 'string',
          role: isDate ? 'dimension' : isNumeric ? 'measure' : 'dimension',
          semanticType: isDate ? 'temporal' : isNumeric ? 'quantitative' : 'nominal',
          cardinality: Math.min(rows.length, 20),
          nullPct: 0,
          sampleValues: rows.slice(0, 5).map(r => Array.isArray(r) ? r[columns.indexOf(name)] : r?.[name]),
        };
      });

  // Merge schema columns — add any DB columns not already in the profile
  // so the DataRail shows ALL available fields for the user to drag onto the chart
  if (schemaColumns.length > 0) {
    const existingNames = new Set(columnProfile.map(c => c.name));
    for (const sc of schemaColumns) {
      const name = sc.name || sc.column_name;
      if (name && !existingNames.has(name)) {
        columnProfile.push({
          name,
          dtype: sc.dtype || sc.data_type || 'string',
          role: (sc.role === 'measure' || sc.semanticType === 'quantitative' || /int|float|numeric|decimal|double/i.test(sc.dtype || sc.data_type || '')) ? 'measure' : 'dimension',
          semanticType: sc.semanticType || (/int|float|numeric|decimal|double/i.test(sc.dtype || sc.data_type || '') ? 'quantitative' : /date|time/i.test(sc.dtype || sc.data_type || '') ? 'temporal' : 'nominal'),
          cardinality: sc.cardinality || 0,
          nullPct: sc.nullPct || 0,
          sampleValues: sc.sampleValues || [],
        });
      }
    }
  }

  return { columns, rows, columnProfile };
}

function flattenTilesForShell(dashboard) {
  if (!dashboard?.tabs) return [];
  const out = [];
  for (const tab of dashboard.tabs) {
    const tabName = tab.name || "Tab 1";
    for (const section of tab.sections || []) {
      for (const tile of section.tiles || []) {
        out.push({ ...tile, tab: tabName });
      }
    }
  }
  return out;
}

export default function AnalyticsShell() {
  const activeDashboardId = useStore((s) => s.activeDashboardId);
  const setActiveDashboardId = useStore((s) => s.setActiveDashboardId);
  const agentPanelOpen = useStore((s) => s.agentPanelOpen);
  const setChartEditorSpec = useStore((s) => s.setChartEditorSpec);
  const setChartEditorMode = useStore((s) => s.setChartEditorMode);
  const activeConnId = useStore((s) => s.activeConnId);
  const connections = useStore((s) => s.connections);
  const [selectedTile, setSelectedTile] = useState(null);
  const [editorMode, setEditorMode] = useState("pro");
  const [schemaColumns, setSchemaColumns] = useState([]);
  const [saving, setSaving] = useState(false);

  // Memoize the editor result set so it's not rebuilt on every parent re-render.
  const editorResultSet = useMemo(
    () => selectedTile ? buildTileResultSet(selectedTile, schemaColumns) : null,
    [selectedTile, schemaColumns],
  );

  // Document-level ESC → close editor modal.
  useEffect(() => {
    if (!selectedTile) return;
    const onKey = (e) => { if (e.key === 'Escape') setSelectedTile(null); };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while modal open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedTile]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [dashboardList, setDashboardList] = useState([]);
  const dashboardIdRef = useRef(null);

  // Fetch all database columns for DataRail (dimensions/measures from full schema)
  useEffect(() => {
    if (!activeConnId) return;
    api.getSchemaProfile(activeConnId)
      .then(profile => {
        if (profile?.columns) setSchemaColumns(profile.columns);
        else if (Array.isArray(profile)) setSchemaColumns(profile);
      })
      .catch(() => {}); // non-critical
  }, [activeConnId]);

  const fetchDashboard = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getDashboards();
      const list = res?.dashboards || [];
      setDashboardList(list);
      if (list.length === 0) {
        setDashboard(null);
        dashboardIdRef.current = null;
        return;
      }
      const targetId = activeDashboardId || list[0].id;
      const full = await api.getDashboard(targetId);
      setDashboard(full);
      dashboardIdRef.current = full.id;
      setActiveDashboardId(full.id);
      useStore.getState().setAnalystProDashboard(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeDashboardId, setActiveDashboardId]);

  // Persist layout changes to backend (debounced to avoid hammering API on every drag pixel)
  const layoutTimerRef = useRef(null);
  const handleLayoutChange = useCallback((layout) => {
    if (!dashboard?.id) return;
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    layoutTimerRef.current = setTimeout(async () => {
      try {
        // Save layout array to the dashboard via PUT
        await api.updateDashboard(dashboard.id, { layout });
      } catch (err) {
        console.warn('[AnalyticsShell] layout save failed:', err);
      }
    }, 1000); // 1s debounce
  }, [dashboard?.id]);

  const handleTileClick = useCallback((tile) => {
    if (!tile) return;
    setSelectedTile(tile);
    // Load tile spec into chart editor for editing
    const spec = tile.chart_spec || tile.chartSpec;
    if (spec) {
      setChartEditorSpec(spec);
      setChartEditorMode?.("pro");
    }
  }, [setChartEditorSpec, setChartEditorMode]);

  const handleNameChange = useCallback(async (newName) => {
    if (!dashboard?.id) return;
    try {
      await api.updateDashboard(dashboard.id, { name: newName });
      setDashboard((d) => d ? { ...d, name: newName } : d);
    } catch (err) {
      console.warn('[AnalyticsShell] name update failed:', err);
    }
  }, [dashboard?.id]);

  const handleSave = useCallback(async () => {
    if (!dashboard?.id) return;
    setSaving(true);
    try {
      await api.updateDashboard(dashboard.id, dashboard);
    } catch (err) {
      console.warn('[AnalyticsShell] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [dashboard]);

  // Derive active connection info for status bar
  const activeConn = useMemo(() => {
    if (!connections?.length) return null;
    if (activeConnId) return connections.find((c) => c.conn_id === activeConnId) || connections[0];
    return connections[0];
  }, [connections, activeConnId]);

  const switchDashboard = useCallback(async (id) => {
    if (id === dashboardIdRef.current) return;
    setActiveDashboardId(id);
    try {
      const full = await api.getDashboard(id);
      setDashboard(full);
      dashboardIdRef.current = full.id;
      useStore.getState().setAnalystProDashboard(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setActiveDashboardId]);

  // Initial load — runs once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchDashboard();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agent dashboard-edit tool calls (create_tile / update_tile / etc.)
  // dispatch a 'dashboard-reload' window event carrying the fresh
  // dashboard. Legacy DashboardBuilder listens for this; mirror the
  // pattern here so the new shell refreshes when the agent edits.
  useEffect(() => {
    const handleReload = (e) => {
      const fresh = e.detail?.dashboard;
      if (fresh && fresh.id === dashboardIdRef.current) {
        setDashboard(fresh);
        return;
      }
      fetchDashboard();
    };
    window.addEventListener("dashboard-reload", handleReload);
    return () => window.removeEventListener("dashboard-reload", handleReload);
  }, [fetchDashboard]);

  const tiles = useMemo(() => flattenTilesForShell(dashboard), [dashboard]);

  // SP-2: Sync flat tiles into Zustand store so agent CRUD mutations are reflected
  const setDashboardTiles = useStore((s) => s.setDashboardTiles);
  useEffect(() => { setDashboardTiles(tiles); }, [tiles, setDashboardTiles]);

  if (loading) {
    return (
      <div
        data-testid="analytics-shell-loading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontSize: 12,
          color: "var(--text-muted, rgba(255,255,255,0.5))",
        }}
      >
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="analytics-shell-error"
        style={{
          padding: 24,
          color: "#f87171",
          fontSize: 12,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        Failed to load analytics: {error}
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div
        data-testid="analytics-shell-empty"
        style={{
          padding: 40,
          textAlign: "center",
          fontSize: 13,
          color: "var(--text-muted, rgba(255,255,255,0.5))",
          fontStyle: "italic",
        }}
      >
        No dashboards yet. Use the legacy builder at /analytics (flag off) or
        create one via the agent.
      </div>
    );
  }

  return (
    <div
      data-testid="analytics-shell"
      data-dashboard-id={dashboard.id}
      style={{ height: "100%", width: "100%", display: "flex", flexDirection: "row" }}
    >
      <DashboardShell
        tiles={tiles}
        dashboardId={dashboard.id}
        dashboardName={dashboard.name}
        dashboardList={dashboardList}
        onSwitchDashboard={switchDashboard}
        onTileClick={handleTileClick}
        onLayoutChange={handleLayoutChange}
        initialMode="workbench"
        onNameChange={handleNameChange}
        onSave={handleSave}
        saving={saving}
        connectionStatus={activeConn ? 'connected' : 'disconnected'}
        dbType={activeConn?.db_type}
        databaseName={activeConn?.database_name}
        lastRefreshed={dashboard.updated_at}
        // Plan 7 T10 — forward the full backend dashboard object so
        // AnalystProLayout can prefer the server-authored tiledRoot over
        // the legacy tile-array shim. Non-AnalystPro modes ignore it.
        authoredLayout={dashboard}
        style={{ flex: 1, minWidth: 0 }}
      />
      {/* Agent panel (only when no tile being edited) */}
      {!selectedTile && agentPanelOpen ? (
        <Suspense fallback={null}>
          <AgentPanel
            connId={activeConn?.conn_id}
            embedded
            onClose={() => useStore.getState().setAgentPanelOpen(false)}
          />
        </Suspense>
      ) : null}

      {/* ChartEditor — full-screen modal overlay (replaces 520px side drawer)
          Portal'd to body so it escapes the dashboard layout flow.
          ESC or Back button returns to dashboard. */}
      <AnimatePresence>
        {selectedTile && (
          <motion.div
            key="editor-modal"
            data-testid="chart-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit tile: ${selectedTile.title || 'Chart'}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={(e) => { if (e.key === 'Escape') setSelectedTile(null); }}
            tabIndex={-1}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 120,
              background: 'var(--bg-page, #06060e)',
              display: 'flex',
              flexDirection: 'column',
              backdropFilter: 'blur(2px)',
            }}
          >
            <Suspense fallback={
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Loading editor…
              </div>
            }>
              <EditorErrorBoundary onClose={() => setSelectedTile(null)}>
                {/* Modal header — Back + title + breadcrumb */}
                <motion.div
                  initial={{ y: -8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.05, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                    flexShrink: 0,
                    background: 'var(--bg-elevated, #111114)',
                    backdropFilter: 'blur(14px) saturate(140%)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTile(null)}
                    className="premium-btn"
                    style={{
                      background: 'var(--bg-elev-2, rgba(255,255,255,0.06))',
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                      cursor: 'pointer',
                      color: 'var(--text-primary, #e7e7ea)',
                      padding: '7px 14px',
                      borderRadius: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      fontFamily: "'Satoshi','Outfit',system-ui,sans-serif",
                    }}
                    aria-label="Back to dashboard"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    Back
                  </button>
                  <span
                    aria-hidden="true"
                    style={{ width: 1, height: 18, background: 'var(--border-subtle, rgba(255,255,255,0.1))' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted, rgba(255,255,255,0.5))',
                      fontFamily: "'Satoshi','Outfit',system-ui,sans-serif",
                    }}>
                      Editing tile
                    </span>
                    <span style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: 'var(--text-primary, #e7e7ea)',
                      letterSpacing: '-0.01em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: "'Satoshi','Outfit',system-ui,sans-serif",
                    }}>
                      {selectedTile.title || 'Untitled chart'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTile(null)}
                    className="premium-btn"
                    aria-label="Close editor"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                      cursor: 'pointer',
                      color: 'var(--text-muted, rgba(255,255,255,0.55))',
                      padding: 6,
                      borderRadius: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                    }}
                    title="Close (Esc)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </motion.div>

                {/* ChartEditor fills remaining viewport */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.995 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.08, duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
                >
                  <ChartEditor
                    spec={selectedTile.chart_spec || selectedTile.chartSpec || DEFAULT_CHART_SPEC}
                    resultSet={editorResultSet}
                    mode={editorMode}
                    surface="dashboard-tile"
                    onModeChange={setEditorMode}
                    onSpecChange={(next) => {
                      setChartEditorSpec(next);
                      setSelectedTile(prev => prev ? { ...prev, chart_spec: next } : null);
                    }}
                  />
                </motion.div>
              </EditorErrorBoundary>
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Error boundary to catch ChartEditor render errors */
class EditorErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#06060e', padding: 40, fontFamily: 'monospace', fontSize: 12 }}>
          <div style={{ color: '#f87171', marginBottom: 16 }}>ChartEditor failed to render:</div>
          <pre style={{ color: '#fbbf24', whiteSpace: 'pre-wrap', maxHeight: '60vh', overflow: 'auto' }}>{String(this.state.error?.message || this.state.error)}</pre>
          <pre style={{ color: '#888', marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: '30vh', overflow: 'auto' }}>{this.state.error?.stack}</pre>
          <button onClick={() => { this.setState({ error: null }); this.props.onClose?.(); }}
            style={{ marginTop: 20, padding: '8px 16px', background: '#4e79a7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

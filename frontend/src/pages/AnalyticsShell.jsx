import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useStore } from "../store";
import { api } from "../api";
import DashboardShell from "../components/dashboard/DashboardShell";

const AgentPanel = lazy(() => import("../components/agent/AgentPanel"));
const ChartEditor = lazy(() => import("../components/editor/ChartEditor"));

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
function buildTileResultSet(tile) {
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
  const [selectedTile, setSelectedTile] = useState(null);
  const [editorMode, setEditorMode] = useState("pro");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [dashboardList, setDashboardList] = useState([]);
  const dashboardIdRef = useRef(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeDashboardId, setActiveDashboardId]);

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

  const switchDashboard = useCallback(async (id) => {
    if (id === dashboardIdRef.current) return;
    setActiveDashboardId(id);
    try {
      const full = await api.getDashboard(id);
      setDashboard(full);
      dashboardIdRef.current = full.id;
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
      style={{ height: "100%", width: "100%" }}
    >
      <DashboardShell
        tiles={tiles}
        dashboardId={dashboard.id}
        dashboardName={dashboard.name}
        dashboardList={dashboardList}
        onSwitchDashboard={switchDashboard}
        onTileClick={handleTileClick}
        initialMode="workbench"
      />
      {agentPanelOpen && (
        <Suspense fallback={null}>
          <AgentPanel />
        </Suspense>
      )}

      {/* Full-screen ChartEditor overlay — opens on tile click */}
      {selectedTile && (
        <Suspense fallback={<div style={{position:'fixed',inset:0,zIndex:200,background:'#06060e',color:'#f87171',padding:40,fontFamily:'monospace',fontSize:12}}>Loading editor…</div>}>
          <EditorErrorBoundary onClose={() => setSelectedTile(null)}>
          <div
            data-testid="chart-editor-overlay"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "var(--bg-page, #06060e)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Minimal header — just a close button. Mode toggle is inside ChartEditor's topbar. */}
            <div style={{
              position: "absolute", top: 8, left: 8, zIndex: 210,
            }}>
              <button
                onClick={() => setSelectedTile(null)}
                style={{
                  background: "var(--bg-elev-2, rgba(255,255,255,0.06))", border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
                  cursor: "pointer", color: "var(--text-secondary, #b0b0b6)", fontSize: 16,
                  padding: "5px 10px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.12))"}
                onMouseLeave={e => e.currentTarget.style.background = "var(--bg-elev-2, rgba(255,255,255,0.06))"}
                aria-label="Close editor"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                <span style={{ fontSize: 11, fontWeight: 500 }}>Back</span>
              </button>
            </div>
            {/* ChartEditor fills the overlay — mode toggle is inside its topbar */}
            <div style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
              <ChartEditor
                spec={selectedTile.chart_spec || selectedTile.chartSpec || { $schema: "askdb/chart-spec/v1", type: "cartesian", mark: "bar", encoding: {} }}
                resultSet={buildTileResultSet(selectedTile)}
                mode={editorMode}
                surface="dashboard-tile"
                onModeChange={setEditorMode}
                onSpecChange={(next) => {
                  setChartEditorSpec(next);
                  setSelectedTile(prev => prev ? { ...prev, chart_spec: next } : null);
                }}
              />
            </div>
          </div>
          </EditorErrorBoundary>
        </Suspense>
      )}
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

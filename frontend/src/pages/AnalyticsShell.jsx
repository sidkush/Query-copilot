import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useStore } from "../store";
import { api } from "../api";
import DashboardShell from "../components/dashboard/DashboardShell";

const AgentPanel = lazy(() => import("../components/agent/AgentPanel"));

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
        initialMode="workbench"
      />
      {agentPanelOpen && (
        <Suspense fallback={null}>
          <AgentPanel />
        </Suspense>
      )}
    </div>
  );
}

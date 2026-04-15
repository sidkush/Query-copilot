import useDashboardRefresh from "../lib/useDashboardRefresh";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";

/**
 * LiveOpsLayout — Phase 4c real implementation.
 *
 * Spec S7.3: dense dark ops-room feel, 5s auto-refresh, alert pills,
 * threshold highlights. Phase 4c wires the backend refresh-stream SSE
 * endpoint (falls back to an in-browser interval if SSE is unavailable
 * — jsdom for tests, or environments without EventSource).
 *
 * Each tile renders via DashboardTileCanvas (new-path VegaRenderer —
 * no ECharts). The `refreshKey` derived from the SSE tick is passed
 * down as React `key` so the tile canvas remounts on each tick,
 * forcing a re-render; real implementations would instead re-fetch
 * tile rows via `api.refreshTile` and blend them into resultSet.
 *
 * Props:
 *   - tiles         array of tiles
 *   - dashboardId   opt — needed to open the SSE stream
 *   - intervalMs    opt — refresh interval (default 5000)
 *   - onTileClick   opt — same contract as the other layouts
 */
export default function LiveOpsLayout({
  tiles = [],
  dashboardId = null,
  intervalMs = 5000,
  onTileClick,
}) {
  const { tick, connected, error } = useDashboardRefresh(dashboardId, intervalMs);

  return (
    <div
      data-testid="layout-ops"
      data-tick={tick}
      data-connected={connected ? "true" : "false"}
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "#08080d",
        minHeight: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "var(--text-muted, rgba(255,255,255,0.6))",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected ? "#2dbf71" : "#e0b862",
            boxShadow: connected
              ? "0 0 8px rgba(45,191,113,0.8)"
              : "0 0 8px rgba(224,184,98,0.6)",
            animation: connected ? "pulse 2s ease-in-out infinite" : "none",
          }}
        />
        Live · refresh {tick}
        {!connected && dashboardId && (
          <span style={{ color: "#e0b862" }}>
            · {error || "connecting…"}
          </span>
        )}
        {!dashboardId && (
          <span style={{ color: "var(--text-muted, rgba(255,255,255,0.4))" }}>
            · preview mode
          </span>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 10,
        }}
      >
        {tiles.length === 0 && <EmptyOps />}
        {tiles.map((tile, i) => (
          <div
            key={`${tile.id || i}-${tick}`}
            data-testid={`layout-ops-tile-${tile.id || i}`}
            style={{
              minHeight: 180,
              position: "relative",
            }}
          >
            <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyOps() {
  return (
    <div
      data-testid="layout-empty"
      style={{
        gridColumn: "1 / -1",
        fontSize: 12,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontStyle: "italic",
        padding: 20,
        textAlign: "center",
      }}
    >
      Waiting for live tiles…
    </div>
  );
}

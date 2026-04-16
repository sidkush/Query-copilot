import useDashboardRefresh from "../lib/useDashboardRefresh";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import { ARCHETYPE_THEMES } from "../tokens";
import { getOpsStatus } from "../lib/archetypeStyling";

/**
 * LiveOpsLayout — SP-6 polish pass.
 *
 * Datadog-class NOC archetype. Driven by ARCHETYPE_THEMES.ops:
 *   - Pure dark bg (#050508), monospace everywhere (JetBrains Mono)
 *   - Traffic-light KPI row: tiles with `kind === 'kpi'` + `thresholds`
 *     auto-colored green/yellow/red via getOpsStatus()
 *   - Event-stream tiles (`kind === 'event-stream'`) render full-width
 *   - SSE auto-refresh via useDashboardRefresh; connection dot reflects
 *     live/reconnecting state with a soft pulse
 *   - Force dark scheme — ignores resolved light theme
 *
 * Tile shape additions:
 *   { kind?: 'kpi'|'event-stream'|'chart', thresholds?: {critical,warning}, value?, invertThreshold? }
 */
const THEME = ARCHETYPE_THEMES.ops;

export default function LiveOpsLayout({
  tiles = [],
  dashboardId = null,
  intervalMs = 5000,
  onTileClick,
}) {
  const { tick, connected, error } = useDashboardRefresh(dashboardId, intervalMs);

  const kpiTiles = tiles.filter((t) => t.kind === "kpi");
  const eventStreams = tiles.filter((t) => t.kind === "event-stream");
  const chartTiles = tiles.filter(
    (t) => t.kind !== "kpi" && t.kind !== "event-stream",
  );

  return (
    <div
      data-testid="layout-ops"
      data-tick={tick}
      data-connected={connected ? "true" : "false"}
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: THEME.spacing.tileGap,
        background: THEME.background.dashboard,
        color: "#d4d4d8",
        fontFamily: THEME.typography.bodyFont,
        fontSize: THEME.typography.bodySize,
        minHeight: "100%",
      }}
    >
      <OpsHeaderBar
        tick={tick}
        connected={connected}
        error={error}
        dashboardId={dashboardId}
        kpiCount={kpiTiles.length}
      />

      {/* ── Traffic-light KPI row ── */}
      {kpiTiles.length > 0 && (
        <div
          data-testid="ops-kpi-row"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
            gap: THEME.spacing.tileGap,
          }}
        >
          {kpiTiles.map((tile, i) => (
            <OpsKPITile
              key={`${tile.id || i}-${tick}`}
              tile={tile}
              onTileClick={onTileClick}
            />
          ))}
        </div>
      )}

      {/* ── Event stream row (full width) ── */}
      {eventStreams.map((tile, i) => (
        <div
          key={`${tile.id || i}-ev-${tick}`}
          data-testid={`layout-ops-tile-${tile.id || i}`}
          data-kind="event-stream"
          style={{
            minHeight: 180,
            border: `1px solid rgba(34,197,94,0.15)`,
            background: THEME.background.tile,
            borderRadius: THEME.spacing.tileRadius,
            overflow: "hidden",
          }}
        >
          <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
        </div>
      ))}

      {/* ── Chart grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: THEME.spacing.tileGap,
        }}
      >
        {tiles.length === 0 && <EmptyOps />}
        {chartTiles.map((tile, i) => (
          <div
            key={`${tile.id || i}-${tick}`}
            data-testid={`layout-ops-tile-${tile.id || i}`}
            style={{
              minHeight: 180,
              position: "relative",
              border: `1px solid rgba(255,255,255,0.05)`,
              background: THEME.background.tile,
              borderRadius: THEME.spacing.tileRadius,
              overflow: "hidden",
            }}
          >
            <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Header bar: live dot, refresh counter, alert ticker placeholder. */
function OpsHeaderBar({ tick, connected, error, dashboardId, kpiCount }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 10,
        fontFamily: THEME.typography.dataFont,
        color: "rgba(255,255,255,0.6)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        padding: "4px 8px",
        borderBottom: "1px solid rgba(34,197,94,0.1)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: connected ? THEME.statusColors.healthy : THEME.statusColors.warning,
          boxShadow: connected
            ? `0 0 10px ${THEME.statusColors.healthy}`
            : `0 0 10px ${THEME.statusColors.warning}`,
          animation: connected ? "pulse 2s ease-in-out infinite" : "none",
        }}
      />
      <span style={{ color: connected ? THEME.statusColors.healthy : THEME.statusColors.warning, fontWeight: 700 }}>
        {connected ? "LIVE" : "CONNECTING"}
      </span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>tick {tick}</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{kpiCount} KPI{kpiCount === 1 ? "" : "s"}</span>
      {!connected && error && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ color: THEME.statusColors.warning }}>{error}</span>
        </>
      )}
      {!dashboardId && (
        <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)" }}>
          preview mode
        </span>
      )}
    </div>
  );
}

/** Traffic-light KPI tile — colored border + status chip. */
function OpsKPITile({ tile, onTileClick }) {
  const status = getOpsStatus(
    tile.value,
    tile.thresholds || {},
    Boolean(tile.invertThreshold),
  );
  return (
    <div
      data-testid={`layout-ops-tile-${tile.id}`}
      data-kind="kpi"
      data-tone={status.tone}
      style={{
        minHeight: 120,
        position: "relative",
        borderLeft: `3px solid ${status.color}`,
        border: `1px solid rgba(255,255,255,0.06)`,
        borderLeftWidth: 3,
        borderLeftColor: status.color,
        background: THEME.background.tile,
        borderRadius: THEME.spacing.tileRadius,
        overflow: "hidden",
        boxShadow: status.tone === "critical" ? `0 0 24px -8px ${status.color}` : "none",
      }}
    >
      {/* Traffic-light status chip */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          fontSize: 9,
          fontWeight: 700,
          fontFamily: THEME.typography.dataFont,
          letterSpacing: "0.1em",
          background: `color-mix(in oklab, ${status.color} 18%, transparent)`,
          color: status.color,
          borderRadius: 3,
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: status.color,
            animation: status.tone === "critical" ? "pulse 1.2s ease-in-out infinite" : "none",
          }}
        />
        {status.label}
      </div>
      <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
    </div>
  );
}

function EmptyOps() {
  return (
    <div
      data-testid="layout-empty"
      style={{
        gridColumn: "1 / -1",
        fontSize: 11,
        color: "rgba(255,255,255,0.5)",
        fontFamily: THEME.typography.dataFont,
        fontStyle: "italic",
        padding: 20,
        textAlign: "center",
      }}
    >
      Waiting for live tiles…
    </div>
  );
}

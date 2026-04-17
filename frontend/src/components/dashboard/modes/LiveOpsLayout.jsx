import useDashboardRefresh from "../lib/useDashboardRefresh";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import { ARCHETYPE_THEMES, TOKENS } from "../tokens";
import { getOpsStatus } from "../lib/archetypeStyling";
import { BreathingDot } from "../motion";

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
        color: "var(--text-primary, #d4d4d8)",
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

      {/* Scoped keyframes for the live dot + critical KPI chip pulse.
          Class-prefixed to avoid global collisions with other @keyframes pulse. */}
      <style>{`
        @keyframes ops-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

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
              border: `1px solid var(--border-default)`,
              background: THEME.background.tile,
              borderRadius: THEME.spacing.tileRadius,
              overflow: "hidden",
            }}
          >
            <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
          </div>
        ))}
      </div>

      {/* ── Event ticker marquee ── Only render the synthetic ticker when no
          explicit event-stream tile exists; otherwise the tile covers it. */}
      {eventStreams.length === 0 && (
        <OpsEventTicker tick={tick} connected={connected} />
      )}
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
        fontFamily: TOKENS.fontMono,
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        padding: "4px 8px",
        borderBottom: "1px solid color-mix(in oklab, var(--status-success) 20%, var(--border-default))",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <BreathingDot
        color={connected ? THEME.statusColors.healthy : THEME.statusColors.warning}
        size={8}
        glow
      />
      <span
        role="status"
        aria-live="polite"
        style={{
          color: connected ? THEME.statusColors.healthy : THEME.statusColors.warning,
          fontWeight: 700,
        }}
      >
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
        <span style={{ marginLeft: "auto", color: "var(--text-secondary)" }}>
          preview mode
        </span>
      )}
    </div>
  );
}

/** Event ticker — perpetual marquee across the bottom of the LiveOps layout. */
function OpsEventTicker({ tick, connected }) {
  // Synthetic tick text — simulates a steady stream of telemetry events.
  // A real event-stream tile supersedes this when present in `tiles[]`.
  const events = [
    `T+${String(tick).padStart(4, '0')}  HEARTBEAT  ok`,
    `AGENT   online  latency=12ms`,
    `QUERY   p95=148ms  p99=312ms`,
    `CACHE   hit=0.82  miss=0.18`,
    `CONN    ${connected ? 'stable' : 'reconnecting'}`,
    `MEM     turbo-twin  hit-rate=0.64`,
  ];
  const line = events.join('   •   ');
  return (
    <div
      data-testid="ops-event-ticker"
      style={{
        height: 28,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        borderTop: '1px solid color-mix(in oklab, var(--status-success) 24%, var(--border-default))',
        borderRadius: 4,
        background: 'var(--bg-elevated)',
        fontFamily: TOKENS.fontMono,
        fontSize: 10.5,
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        position: 'relative',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          background: 'linear-gradient(90deg, var(--bg-elevated) 70%, transparent 100%)',
          zIndex: 2,
          fontWeight: 700,
          color: THEME.statusColors.healthy,
          letterSpacing: '0.18em',
        }}
      >
        <BreathingDot color={THEME.statusColors.healthy} size={6} />
        STREAM
      </span>
      <div
        className="premium-marquee-track"
        style={{
          paddingLeft: 100,
          whiteSpace: 'nowrap',
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ paddingRight: 60 }}>{line}</span>
        <span aria-hidden style={{ paddingRight: 60 }}>{line}</span>
      </div>
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
        border: `1px solid var(--border-default)`,
        background: THEME.background.tile,
        borderRadius: THEME.spacing.tileRadius,
        overflow: "hidden",
        // Critical / warning KPIs get a premium statusGlow via the token helper;
        // healthy stays on a thin inset ring so the row doesn't vibrate.
        boxShadow:
          status.tone === "critical"
            ? `inset 0 0 0 1px ${status.color}66, ${TOKENS.shadow.statusGlow(status.color)}`
            : status.tone === "warning"
            ? `inset 0 0 0 1px ${status.color}55, 0 0 18px -8px ${status.color}`
            : `inset 0 0 0 1px ${status.color}40`,
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
          gap: 5,
          padding: "2px 8px",
          fontSize: 9,
          fontWeight: 700,
          fontFamily: TOKENS.fontMono,
          letterSpacing: "0.12em",
          background: `color-mix(in oklab, ${status.color} 18%, transparent)`,
          color: status.color,
          borderRadius: 3,
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        <BreathingDot color={status.color} size={6} glow={status.tone === "critical"} />
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
        color: "var(--text-muted)",
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

import { useEffect, useState } from "react";

/**
 * LiveOpsLayout — Phase 4a skeleton.
 *
 * Target experience (spec S7.3): 5-second auto-refresh via WebSocket,
 * alert indicators, trail-like sparklines, threshold highlights.
 * Phase 4b wires the real backend WebSocket (extends the agent SSE
 * infrastructure with a new topic `tile:refresh`) + alert thresholds.
 *
 * Phase 4a: ticker-driven mock refresh counter so the UI shows the
 * "live" affordance without a real backend socket. Tiles render in a
 * single-row scrollable strip for ops-room aesthetics.
 *
 * TODO(a4b): real WebSocket refresh + alert threshold styling.
 */
export default function LiveOpsLayout({ tiles = [] }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      data-testid="layout-ops"
      data-tick={tick}
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "var(--text-muted, rgba(255,255,255,0.5))",
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
            background: "#2dbf71",
            boxShadow: "0 0 8px rgba(45,191,113,0.8)",
          }}
        />
        Live · refresh {tick}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          paddingBottom: 8,
        }}
      >
        {tiles.length === 0 && <EmptyOps />}
        {tiles.map((tile, i) => (
          <div
            key={tile.id || i}
            data-testid={`layout-ops-tile-${tile.id || i}`}
            style={{
              minWidth: 220,
              padding: 12,
              borderRadius: 4,
              background: "var(--bg-elev-1, rgba(255,255,255,0.02))",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.5))" }}>
              {tile.title || tile.id || "Untitled"}
            </div>
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
        fontSize: 12,
        color: "var(--text-muted, rgba(255,255,255,0.5))",
        fontStyle: "italic",
        padding: 20,
      }}
    >
      Waiting for live tiles… (5s refresh stub — Phase 4b wires the WebSocket)
    </div>
  );
}

import DashboardTileCanvas from "../lib/DashboardTileCanvas";

/**
 * MobileLayout — single-column vertical stack dashboard archetype.
 *
 * Optimised for small screens (< 480px viewport) and touch devices:
 *   - Full-width tiles, no grid
 *   - 300px minimum tile height for legibility
 *   - 44px-minimum tap targets on interactive elements
 *   - Thin separator dots between tiles (swipe indicator cue)
 *   - No hover-dependent interactions
 */
export default function MobileLayout({ tiles, resultSets, onTileClick }) {
  if (!tiles || tiles.length === 0) {
    return (
      <div
        data-testid="mobile-layout-empty"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 240,
          color: "var(--text-muted, rgba(255,255,255,0.4))",
          fontSize: 13,
          fontStyle: "italic",
        }}
      >
        No tiles to display
      </div>
    );
  }

  return (
    <div
      data-testid="mobile-layout"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: "8px 12px",
        maxWidth: 480,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {tiles.map((tile, i) => (
        <div key={tile.id}>
          {/* Tile card */}
          <div
            style={{
              minHeight: 300,
              borderRadius: 12,
              background: "var(--bg-surface, rgba(255,255,255,0.03))",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
              overflow: "hidden",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <DashboardTileCanvas
              tile={tile}
              resultSetOverride={resultSets?.[tile.id]}
              onTileClick={onTileClick}
              showTitleBar={true}
            />
          </div>

          {/* Swipe indicator — dot separator between tiles (omit after last) */}
          {i < tiles.length - 1 && (
            <div
              aria-hidden="true"
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 4,
                padding: "10px 0",
              }}
            >
              {[0, 1, 2].map((dot) => (
                <div
                  key={dot}
                  style={{
                    width: dot === 1 ? 5 : 3,
                    height: dot === 1 ? 5 : 3,
                    borderRadius: "50%",
                    background:
                      dot === 1
                        ? "var(--border-subtle, rgba(255,255,255,0.18))"
                        : "var(--border-subtle, rgba(255,255,255,0.08))",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

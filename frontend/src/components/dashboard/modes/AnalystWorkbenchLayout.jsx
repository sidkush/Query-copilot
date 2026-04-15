import { useMemo, useState, useEffect, useCallback } from "react";
import GridLayout from "react-grid-layout";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

/**
 * AnalystWorkbenchLayout — Phase 4c real implementation.
 *
 * Spec S7.2: Tableau-class dense workbench. 12-column react-grid-layout
 * with drag-resize, preventCollision=false + compactType=vertical. Each
 * tile renders a real chart via DashboardTileCanvas (EditorCanvas →
 * VegaRenderer path — no ECharts).
 *
 * Layout persistence:
 *   - Initial layout is derived from tiles[]: 3 cols wide × 4 rows tall,
 *     packed 4-up across the 12-col grid.
 *   - User drag-resize updates local state immediately.
 *   - If `onLayoutChange` is supplied by the caller, the callback is
 *     fired with the full layout array so the caller can persist via
 *     api.updateTile (Phase 4c+) or a section-level update (existing
 *     dashboard_routes.py writes to sec["layout"]).
 *
 * Width detection: the grid uses a ResizeObserver-backed width measure
 * to stay responsive inside the DashboardShell fluid area. Falls back to
 * 1200px before the first measure.
 */
const COLS = 12;
const ROW_HEIGHT = 60;
const DEFAULT_W = 3;
const DEFAULT_H = 4;

function buildInitialLayout(tiles, existingLayout) {
  if (Array.isArray(existingLayout) && existingLayout.length > 0) {
    return existingLayout;
  }
  return tiles.map((tile, i) => ({
    i: String(tile.id ?? i),
    x: (i * DEFAULT_W) % COLS,
    y: Math.floor((i * DEFAULT_W) / COLS) * DEFAULT_H,
    w: DEFAULT_W,
    h: DEFAULT_H,
  }));
}

function useContainerWidth() {
  const [ref, setRef] = useState(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    if (!ref) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0) {
        setWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref]);

  return [setRef, width];
}

export default function AnalystWorkbenchLayout({
  tiles = [],
  initialLayout,
  onLayoutChange,
  onTileClick,
}) {
  const [layout, setLayout] = useState(() => buildInitialLayout(tiles, initialLayout));
  const [setContainerRef, width] = useContainerWidth();

  useEffect(() => {
    // If the tile array changes identity, ensure every tile has a slot.
    setLayout((prev) => {
      const byId = new Map(prev.map((l) => [l.i, l]));
      let changed = false;
      const next = tiles.map((tile, i) => {
        const key = String(tile.id ?? i);
        const existing = byId.get(key);
        if (existing) return existing;
        changed = true;
        return {
          i: key,
          x: (i * DEFAULT_W) % COLS,
          y: Math.floor((i * DEFAULT_W) / COLS) * DEFAULT_H,
          w: DEFAULT_W,
          h: DEFAULT_H,
        };
      });
      // Drop entries for tiles that disappeared.
      const currentIds = new Set(tiles.map((t, i) => String(t.id ?? i)));
      const filtered = next.filter((l) => currentIds.has(l.i));
      if (!changed && filtered.length === prev.length) return prev;
      return filtered;
    });
  }, [tiles]);

  const handleLayoutChange = useCallback(
    (nextLayout) => {
      setLayout(nextLayout);
      if (onLayoutChange) onLayoutChange(nextLayout);
    },
    [onLayoutChange],
  );

  if (tiles.length === 0) {
    return (
      <div
        data-testid="layout-workbench"
        style={{
          padding: 24,
          textAlign: "center",
          fontSize: 12,
          color: "var(--text-muted, rgba(255,255,255,0.5))",
          fontStyle: "italic",
        }}
      >
        Workbench ready. Drag tiles here to compare side-by-side.
      </div>
    );
  }

  const tilesById = useMemo(() => {
    const m = new Map();
    tiles.forEach((tile, i) => {
      const key = String(tile.id ?? i);
      m.set(key, tile);
    });
    return m;
  }, [tiles]);

  return (
    <div
      data-testid="layout-workbench"
      data-tile-count={tiles.length}
      ref={setContainerRef}
      style={{
        padding: 12,
        background: "var(--bg-page, #06060e)",
        minHeight: "100%",
      }}
    >
      <GridLayout
        className="layout-workbench-grid"
        layout={layout}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        width={width}
        margin={[10, 10]}
        containerPadding={[0, 0]}
        compactType="vertical"
        preventCollision={false}
        draggableHandle=".dashboard-tile-canvas"
        isResizable
        isDraggable
        onLayoutChange={handleLayoutChange}
      >
        {layout.map((l) => {
          const tile = tilesById.get(l.i);
          if (!tile) return <div key={l.i} />;
          return (
            <div key={l.i} data-testid={`layout-workbench-tile-${l.i}`}>
              <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
            </div>
          );
        })}
      </GridLayout>
    </div>
  );
}

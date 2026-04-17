import { useMemo, useState, useEffect, useCallback } from "react";
import GridLayout from "react-grid-layout";
import DashboardTileCanvas from "../lib/DashboardTileCanvas";
import { ARCHETYPE_THEMES, TOKENS } from "../tokens";
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
const ROW_HEIGHT = 50; // dense — one row shorter than briefing (60)
const DEFAULT_W = 3;
const DEFAULT_H = 4;
const THEME = ARCHETYPE_THEMES.workbench;

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
  activeFilters = [],
  editing = true, // workbench defaults to edit-mode — grid canvas shows by default
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

  // Memoized tile lookup — MUST be above any early return so the hook
  // call order is stable across renders (React rules of hooks).
  const tilesById = useMemo(() => {
    const m = new Map();
    tiles.forEach((tile, i) => {
      const key = String(tile.id ?? i);
      m.set(key, tile);
    });
    return m;
  }, [tiles]);

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
          background: THEME.background.dashboard,
          fontFamily: THEME.typography.bodyFont,
          minHeight: "100%",
        }}
      >
        Workbench ready. Drag tiles here to compare side-by-side.
      </div>
    );
  }

  return (
    <div
      data-testid="layout-workbench"
      data-tile-count={tiles.length}
      ref={setContainerRef}
      style={{
        padding: THEME.spacing.tilePadding ?? 8,
        display: "flex",
        flexDirection: "column",
        gap: THEME.spacing.tileGap ?? 8,
        background: THEME.background.dashboard,
        color: "var(--text-primary, #e7e7ea)",
        fontFamily: THEME.typography.bodyFont,
        fontSize: THEME.typography.bodySize,
        minHeight: "100%",
      }}
    >
      <WorkbenchChipRow
        filters={activeFilters}
        tileCount={tiles.length}
      />
      <GridLayout
        className={`layout-workbench-grid${editing ? ' premium-grid-canvas' : ''}`}
        layout={layout}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        width={width}
        margin={[THEME.spacing.tileGap, THEME.spacing.tileGap]}
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
            <div
              key={l.i}
              data-testid={`layout-workbench-tile-${l.i}`}
              style={{
                background: THEME.background.tile,
                // Tight 1px border + inner glass edge highlight — IDE-grade polish
                border: `1px solid var(--border-default)`,
                borderRadius: THEME.spacing.tileRadius,
                overflow: "hidden",
                boxShadow: TOKENS.shadow.innerGlass,
              }}
            >
              <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />
            </div>
          );
        })}
      </GridLayout>
    </div>
  );
}

/**
 * Dense filter chip row at the top of the workbench. Renders the list
 * of active cross-filters pushed via useTileLinking / GlobalFilterBar,
 * plus a tile-count badge. Kept visually compact to match the Tableau-
 * class density spec (wireframe 5).
 */
function WorkbenchChipRow({ filters = [], tileCount }) {
  return (
    <div
      data-testid="workbench-chip-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 6px",
        fontSize: 10.5,
        fontFamily: THEME.typography.dataFont,
        color: "var(--text-muted, rgba(255,255,255,0.55))",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        borderBottom: "1px solid var(--border-default)",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontWeight: 650, color: "var(--text-secondary, #a1a1aa)" }}>
        {tileCount} tile{tileCount === 1 ? "" : "s"}
      </span>
      {filters.length > 0 && (
        <span style={{ opacity: 0.5 }}>·</span>
      )}
      {filters.map((f, i) => (
        <span
          key={f.id || i}
          style={{
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 600,
            fontFamily: TOKENS.fontMono,
            // Solid fallback first — browsers without color-mix (in oklab)
            // support ignore the second declaration and keep the solid tint.
            backgroundColor: "rgba(37,99,235,0.16)",
            background: "color-mix(in oklab, var(--accent, #2563EB) 14%, transparent)",
            color: "var(--accent, #60a5fa)",
            borderRadius: 3,
            letterSpacing: "0.02em",
            textTransform: "none",
            // Active filter chip earns the accent glow (token helper)
            boxShadow: TOKENS.shadow.accentGlow,
          }}
        >
          {f.field} {f.op || "="} {String(f.value ?? "")}
        </span>
      ))}
    </div>
  );
}

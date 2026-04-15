import { useMemo, useState } from "react";
import PresentationEngine from "../PresentationEngine";

/**
 * PitchLayout — Phase 4c real implementation.
 *
 * Spec S7.5: wraps PresentationEngine (existing 16:9 bin-packing + slide
 * navigation + auto-play) and feeds it new-shape ChartSpec tiles. The
 * adapter converts the flat tiles[] prop that the dashboard shell
 * provides into the nested dashboard shape PresentationEngine walks
 * (tabs[].sections[].tiles[]), grouping by the optional tile.tab field.
 *
 * The chart renderer inside PresentationEngine.PresentationTile now
 * branches on `tile.chart_spec` — Phase 4c-edited — so new-path tiles
 * render via DashboardTileCanvas (→ EditorCanvas → VegaRenderer). Legacy
 * tiles still fall through to ResultsChart for rollback safety.
 *
 * PitchLayout adds a local exit affordance (since the dashboard shell
 * itself stays mounted): pressing Escape or clicking Exit returns the
 * dashboard mode toggle to the previous mode via `onExit`.
 */
function adaptTilesToDashboard(tiles, dashboardName) {
  const tabsMap = new Map();
  tiles.forEach((tile) => {
    const tabName = tile.tab || "Main";
    if (!tabsMap.has(tabName)) {
      tabsMap.set(tabName, []);
    }
    tabsMap.get(tabName).push(tile);
  });

  const tabs = Array.from(tabsMap.entries()).map(([name, tabTiles], i) => ({
    id: `pitch-tab-${i}`,
    name,
    sections: [
      {
        id: `pitch-section-${i}-0`,
        name,
        tiles: tabTiles,
      },
    ],
  }));

  return {
    id: "pitch-preview",
    name: dashboardName || "Presentation",
    tabs,
  };
}

export default function PitchLayout({
  tiles = [],
  dashboardName = "Presentation",
  themeConfig,
  onExit,
}) {
  const [closed, setClosed] = useState(false);

  const dashboard = useMemo(
    () => adaptTilesToDashboard(tiles, dashboardName),
    [tiles, dashboardName],
  );

  const handleExit = () => {
    setClosed(true);
    if (onExit) onExit();
  };

  if (tiles.length === 0) {
    return (
      <div
        data-testid="layout-pitch"
        style={{
          padding: 40,
          textAlign: "center",
          fontSize: 13,
          color: "var(--text-muted, rgba(255,255,255,0.5))",
          fontStyle: "italic",
        }}
      >
        Pitch mode empty. Add tiles to the dashboard to present.
      </div>
    );
  }

  if (closed) {
    return (
      <div
        data-testid="layout-pitch"
        style={{ padding: 24, color: "var(--text-muted, rgba(255,255,255,0.5))" }}
      >
        Pitch closed.
      </div>
    );
  }

  return (
    <div
      data-testid="layout-pitch"
      data-tile-count={tiles.length}
      style={{ position: "relative", height: "100%", width: "100%" }}
    >
      <PresentationEngine
        dashboard={dashboard}
        themeConfig={themeConfig}
        onExit={handleExit}
      />
    </div>
  );
}

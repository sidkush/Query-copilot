/**
 * Unified chart registry — single source of truth for every renderable chart type.
 *
 * Each entry declares:
 *   - key      : stable id (matches tile.chartType in dashboards)
 *   - family   : grouping for picker UX + routing ('standard' | 'dense' | '3d' | 'geo')
 *   - engine   : which renderer handles it ('echarts' | 'react' | 'three' | 'deckgl' | 'd3')
 *   - label    : picker label
 *   - group    : semantic category (comparison | trend | proportion | correlation | dense)
 *   - icon     : SVG path for picker thumbnail
 *   - score(a) : relevance scoring function given DataAnalysis shape
 *   - density? : (dense family only) grid-aware sizing hints { minW, minH, infoBits }
 *
 * Adding a new chart type? Add a new entry here and (if needed) a render branch
 * in the owning engine. Do NOT fork this list across files.
 */

export const CHART_FAMILIES = {
  STANDARD: 'standard',
  DENSE: 'dense',
  THREE_D: '3d',
  GEO: 'geo',
  CREATIVE: 'creative',
};

// Every family OTHER than 'standard' / 'dense' routes through the
// wow-factor registry (see TileWrapper.jsx WOW_TILE_REGISTRY). Exported
// so TileWrapper can do a constant-time family membership check.
export const WOW_FAMILIES = new Set(['3d', 'geo', 'creative']);

export const CHART_DEFS = [
  {
    key: 'bar', family: 'standard', engine: 'echarts',
    label: 'Bar', group: 'comparison',
    icon: 'M3 13h2v8H3zM8 8h2v13H8zM13 11h2v10h-2zM18 5h2v16h-2z',
    score: (a) => {
      let s = 60;
      if (a.rowCount >= 2 && a.rowCount <= 20) s += 20;
      if (a.metricCount >= 2) s += 15;
      if (a.isDateLike) s -= 10;
      if (a.rowCount > 20) s -= 20;
      return s;
    },
  },
  {
    key: 'bar_h', family: 'standard', engine: 'echarts',
    label: 'H-Bar', group: 'comparison',
    icon: 'M3 3v2h8V3zM3 8v2h13V8zM3 13v2h10V13zM3 18v2h16V18z',
    score: (a) => {
      let s = 40;
      if (a.avgLabelLen > 10) s += 25;
      if (a.rowCount >= 5 && a.rowCount <= 15) s += 15;
      if (a.metricCount === 1) s += 10;
      if (a.isDateLike) s -= 30;
      return s;
    },
  },
  {
    key: 'stacked', family: 'standard', engine: 'echarts',
    label: 'Stacked', group: 'composition',
    icon: 'M3 13h2v8H3zM8 6h2v15H8zM13 9h2v12h-2zM18 3h2v18h-2z',
    score: (a) => {
      let s = 30;
      if (a.metricCount >= 2) s += 35;
      if (a.rowCount >= 3 && a.rowCount <= 15) s += 15;
      if (a.metricCount < 2) s -= 50;
      return s;
    },
  },
  {
    key: 'line', family: 'standard', engine: 'echarts',
    label: 'Line', group: 'trend',
    icon: 'M3 17l6-6 4 4 8-8',
    supportsTimeAnimation: true,
    score: (a) => {
      let s = 50;
      if (a.isDateLike) s += 35;
      if (a.rowCount > 5) s += 15;
      if (a.rowCount <= 2) s -= 30;
      return s;
    },
  },
  {
    key: 'area', family: 'standard', engine: 'echarts',
    label: 'Area', group: 'trend',
    icon: 'M3 17l6-6 4 4 8-8v11H3z',
    supportsTimeAnimation: true,
    score: (a) => {
      let s = 40;
      if (a.isDateLike) s += 30;
      if (a.rowCount > 5) s += 15;
      if (a.metricCount === 1) s += 5;
      if (a.rowCount <= 2) s -= 30;
      return s;
    },
  },
  {
    key: 'pie', family: 'standard', engine: 'echarts',
    label: 'Pie', group: 'proportion',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18V12h10c0 5.52-4.48 10-10 10z',
    score: (a) => {
      let s = 30;
      if (a.rowCount >= 2 && a.rowCount <= 8 && a.allPositive) s += 40;
      if (a.hasVariance) s += 10;
      if (a.rowCount > 10) s -= 40;
      if (!a.allPositive) s -= 50;
      return s;
    },
  },
  {
    key: 'donut', family: 'standard', engine: 'echarts',
    label: 'Donut', group: 'proportion',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6z',
    score: (a) => {
      let s = 35;
      if (a.rowCount >= 2 && a.rowCount <= 8 && a.allPositive) s += 35;
      if (a.hasVariance) s += 10;
      if (a.rowCount > 10) s -= 40;
      if (!a.allPositive) s -= 50;
      return s;
    },
  },
  {
    key: 'radar', family: 'standard', engine: 'echarts',
    label: 'Radar', group: 'comparison',
    icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01z',
    score: (a) => {
      let s = 20;
      if (a.rowCount >= 3 && a.rowCount <= 10 && a.metricCount >= 2) s += 40;
      if (a.metricCount < 2) s -= 30;
      if (a.rowCount > 10) s -= 20;
      if (a.rowCount < 3) s -= 30;
      return s;
    },
  },
  {
    key: 'treemap', family: 'standard', engine: 'echarts',
    label: 'Treemap', group: 'proportion',
    icon: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v3h-8zM3 13h5v8H3zM10 13h11v8H10z',
    score: (a) => {
      let s = 25;
      if (a.rowCount >= 4 && a.rowCount <= 20 && a.allPositive) s += 30;
      if (a.rowCount > 20) s -= 10;
      if (!a.allPositive) s -= 50;
      return s;
    },
  },
  {
    key: 'scatter', family: 'standard', engine: 'echarts',
    label: 'Scatter', group: 'correlation',
    icon: 'M7 14a2 2 0 100-4 2 2 0 000 4zM14 8a2 2 0 100-4 2 2 0 000 4zM18 16a2 2 0 100-4 2 2 0 000 4zM11 19a2 2 0 100-4 2 2 0 000 4z',
    supports3DToggle: true,
    supportsTimeAnimation: true,
    score: (a) => {
      let s = 15;
      if (a.metricCount >= 2 && a.rowCount > 5) s += 35;
      if (a.metricCount < 2) s -= 50;
      return s;
    },
  },

  /* ── Dense tile family — Tableau-class compact tiles ────────────────
     Engine is 'react' for native SVG/CSS tiles and 'echarts' for the
     heat matrix which delegates to CanvasChart. `density` field gives
     react-grid-layout sizing hints (cols=12, rowHeight=60 floor). */
  {
    key: 'sparkline_kpi', family: 'dense', engine: 'react',
    label: 'Sparkline KPI', group: 'dense',
    icon: 'M3 17l4-4 3 3 5-7 6 8M3 20h18',
    density: { minW: 3, minH: 1, infoBits: 3 },
    score: (a) => {
      let s = 0;
      // Strong fit: exactly 1 numeric metric over time
      if (a.numericCols?.length === 1 && a.isDateLike) s += 70;
      // Decent fit: 1 metric + short row count (trend snapshot)
      if (a.numericCols?.length === 1 && a.rowCount >= 3 && a.rowCount <= 60) s += 20;
      if (a.numericCols?.length > 1) s -= 30;
      if (a.rowCount < 2) s -= 40;
      return s;
    },
  },
  {
    key: 'scorecard_table', family: 'dense', engine: 'react',
    label: 'Scorecard', group: 'dense',
    icon: 'M4 5h16M4 10h16M4 15h12M4 20h10',
    density: { minW: 4, minH: 2, infoBits: 8 },
    score: (a) => {
      let s = 0;
      // Best fit: 5-20 rows, 1+ metric — a ranked list
      if (a.rowCount >= 5 && a.rowCount <= 20 && a.metricCount >= 1) s += 60;
      if (a.avgLabelLen > 4) s += 10;
      if (a.rowCount > 30) s -= 20;
      if (a.rowCount < 3) s -= 40;
      return s;
    },
  },
  {
    key: 'hbar_card', family: 'dense', engine: 'react',
    label: 'Bar Card', group: 'dense',
    icon: 'M3 5h14v3H3zM3 11h10v3H3zM3 17h18v3H3z',
    density: { minW: 4, minH: 1, infoBits: 5 },
    score: (a) => {
      let s = 0;
      // Sweet spot: <=10 rows, single metric, medium-long labels
      if (a.rowCount <= 10 && a.metricCount === 1 && a.avgLabelLen > 8) s += 55;
      if (a.rowCount >= 3 && a.rowCount <= 8) s += 10;
      if (a.metricCount > 1) s -= 20;
      if (a.rowCount > 12) s -= 25;
      return s;
    },
  },
  {
    key: 'heat_matrix', family: 'dense', engine: 'echarts',
    label: 'Heat Matrix', group: 'dense',
    icon: 'M3 3h6v6H3zM11 3h6v6h-6zM19 3h2v6h-2zM3 11h6v6H3zM11 11h6v6h-6zM19 11h2v6h-2zM3 19h6v2H3zM11 19h6v2h-6z',
    density: { minW: 4, minH: 3, infoBits: 12 },
    score: (a) => {
      let s = 0;
      // Correlation grid: many rows, many metrics
      if (a.rowCount >= 6 && a.metricCount >= 3) s += 50;
      if (a.metricCount >= 5) s += 10;
      if (a.metricCount < 2) s -= 50;
      return s;
    },
  },

  /* ── Flagship wow-factor family — Phase 4 (3D + GEO + premium 2D) ─
     Charts Tableau / Looker / PowerBI don't ship out of the box.
     Each engine is lazy-loaded via TileWrapper for bundle isolation.
     `supports3DToggle` / `supportsTimeAnimation` flags prepare Phase 5
     time-animation framework to auto-surface play buttons. */
  {
    key: 'scatter_3d', family: '3d', engine: 'three',
    label: '3D Scatter', group: 'wow',
    icon: 'M12 2v20M2 12h20M5 5l14 14M19 5L5 19',
    supports3DToggle: true,
    supportsTimeAnimation: true,
    score: (a) => {
      let s = 0;
      if (a.numericCols?.length >= 3) s += 45;
      if (a.rowCount >= 30 && a.rowCount <= 10000) s += 15;
      if (a.numericCols?.length < 3) s -= 100;
      if (a.rowCount < 10) s -= 20;
      return s;
    },
  },
  {
    key: 'hologram_scatter', family: '3d', engine: 'three',
    label: 'Hologram', group: 'wow',
    icon: 'M12 2l10 6v8l-10 6L2 16V8z',
    supports3DToggle: true,
    supportsTimeAnimation: true,
    score: (a) => {
      let s = 0;
      // Best fit: 3+ numeric cols + a time dimension (sci-fi temporal data)
      if (a.numericCols?.length >= 3 && a.isDateLike) s += 50;
      if (a.numericCols?.length >= 3 && !a.isDateLike) s += 30;
      if (a.numericCols?.length < 3) s -= 100;
      return s;
    },
  },
  {
    key: 'geo_map', family: 'geo', engine: 'deckgl',
    label: 'Geo Map', group: 'wow',
    // Map pin icon — flat 2D bubble map, not a 3D globe
    icon: 'M12 2C7.6 2 4 5.6 4 10c0 5.5 8 12 8 12s8-6.5 8-12c0-4.4-3.6-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z',
    supportsTimeAnimation: true,
    score: (a) => {
      let s = 0;
      if (a.hasCoordinates) s += 75;
      if (a.hasCoordinates && a.metricCount >= 1) s += 10;
      if (!a.hasCoordinates) s -= 100;
      return s;
    },
  },
  {
    // Legacy alias for tiles saved before the 3D globe was replaced
    // by the Tableau-style 2D bubble map. Renders via the same GeoMap
    // engine (see WOW_TILE_REGISTRY in TileWrapper.jsx). Hidden from
    // the picker via `deprecated: true` so new tiles always pick
    // 'geo_map'. Score returns -1000 so the auto-recommender never
    // surfaces it.
    key: 'globe_3d', family: 'geo', engine: 'deckgl',
    label: 'Globe (legacy)', group: 'wow',
    icon: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z',
    deprecated: true,
    supportsTimeAnimation: true,
    score: () => -1000,
  },
  {
    key: 'ridgeline', family: 'creative', engine: 'd3',
    label: 'Ridgeline', group: 'wow',
    icon: 'M3 18c3-4 5-4 7 0M9 15c3-6 5-6 8 0M15 12c3-5 4-5 6 0',
    score: (a) => {
      let s = 0;
      if (a.rowCount >= 10 && a.metricCount >= 1) s += 40;
      if (a.rowCount >= 20) s += 10;
      if (a.rowCount < 5) s -= 50;
      return s;
    },
  },
  {
    key: 'particle_flow', family: '3d', engine: 'three',
    label: 'Particle Flow', group: 'wow',
    icon: 'M3 12c3-3 5-3 7 0s5 3 7 0M3 18c3-3 5-3 7 0s5 3 7 0M3 6c3-3 5-3 7 0s5 3 7 0',
    score: (a) => {
      let s = 0;
      if (a.numericCols?.length >= 2) s += 35;
      if (a.hasCoordinates && a.metricCount >= 2) s += 20;
      if (a.numericCols?.length < 2) s -= 100;
      return s;
    },
  },
  {
    key: 'liquid_gauge', family: 'creative', engine: 'svg',
    label: 'Liquid Gauge', group: 'wow',
    icon: 'M12 2c4 5 6 9 6 13a6 6 0 0 1-12 0c0-4 2-8 6-13z',
    score: (a) => {
      let s = 0;
      if (a.metricCount === 1 && a.rowCount === 1) s += 60;
      if (a.metricCount === 1 && a.rowCount <= 3) s += 30;
      if (a.metricCount > 1) s -= 30;
      return s;
    },
  },
];

/** Minimum relevance score for a chart type to appear in the picker. */
export const MIN_SCORE = 35;

/** Lookup by key; returns undefined if the key is unknown. */
export function getChartDef(key) {
  return CHART_DEFS.find((d) => d.key === key);
}

/** Filter by family — used by TileEditor to build picker categories. */
export function getChartsByFamily(family) {
  return CHART_DEFS.filter((d) => d.family === family);
}

/**
 * Score + sort chart types for a given DataAnalysis shape.
 * Returns the ranked list with `relevance` attached, filtered to >= MIN_SCORE.
 * Used by ResultsChart.jsx and TileEditor.jsx for auto-recommendation.
 */
export function rankChartsForData(analysis) {
  return CHART_DEFS
    .map((def) => ({ ...def, relevance: def.score(analysis) }))
    .filter((d) => d.relevance >= MIN_SCORE)
    .sort((a, b) => b.relevance - a.relevance);
}

/**
 * importanceScoring — shared tile importance heuristic.
 *
 * Extracted from PresentationEngine.jsx (Phase 4c) so ExecBriefingLayout
 * and PitchLayout can share one ranking model. Understands BOTH:
 *
 *   - Legacy tile shape:  { chartType, rows, columns, sql }
 *   - New ChartSpec tile: { chart_spec: { type, mark, ... }, rows?, columns? }
 *
 * Scoring ladder (higher = more important):
 *
 *   100  KPI / single-value tiles          (dominant attention anchor)
 *    70  chart tile with data              (primary visual)
 *    30  table tile                        (secondary detail)
 *    20  SQL-only (no data yet, loading)
 *    10  anything with some presence
 *     0  empty + nothing to render         (skipped by packer)
 *
 * The packer and Briefing grid both use this to hoist KPIs + hero charts
 * above tables and SQL-only placeholders.
 */

/** True if the tile is a KPI / single-metric card. */
function isKpiTile(tile) {
  if (!tile) return false;
  if (tile.chartType === "kpi") return true;
  const spec = tile.chart_spec || tile.chartSpec;
  if (!spec) return false;
  // ChartSpec KPIs are cartesian 'text' marks with a single measure and
  // no x/y positional encoding — the nearest Vega-Lite analogue to a
  // card.
  if (spec.type === "cartesian" && spec.mark === "text") return true;
  if (spec?.config?.density === "compact" && !spec.encoding?.x) return true;
  return false;
}

/** True if the tile is a plain tabular listing. */
function isTableTile(tile) {
  if (!tile) return false;
  if (tile.chartType === "table") return true;
  const spec = tile.chart_spec || tile.chartSpec;
  return spec?.type === "table" || spec?.mark === "table";
}

/** True if the tile carries runnable data (legacy rows OR a valid chart spec). */
function hasTileData(tile) {
  if (!tile) return false;
  if (Array.isArray(tile.rows) && tile.rows.length > 0) return true;
  const spec = tile.chart_spec || tile.chartSpec;
  if (!spec) return false;
  // A present chart_spec with at least one encoding counts as "has data"
  // so DevDashboardShell sample tiles (no rows) still rank above SQL-only.
  if (spec.encoding && Object.keys(spec.encoding).length > 0) return true;
  return false;
}

/**
 * scoreTile — numeric importance for a single tile.
 *
 * @param {object} tile legacy or new-shape tile
 * @returns {number} 0..100
 */
export function scoreTile(tile) {
  if (!tile) return 0;
  const data = hasTileData(tile);
  if (!data && !tile.sql) return 0;
  if (isKpiTile(tile)) return 100;
  if (isTableTile(tile)) return 30;
  if (data) return 70;
  if (tile.sql) return 20;
  return 10;
}

/**
 * sortByImportance — stable descending sort (highest score first).
 * Ties preserve input order so consumer-driven ordering (e.g. agent
 * placement) survives when importance is equal.
 */
export function sortByImportance(tiles) {
  return [...tiles]
    .map((tile, originalIndex) => ({ tile, originalIndex, score: scoreTile(tile) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.originalIndex - b.originalIndex;
    })
    .map((entry) => entry.tile);
}

/**
 * packIntoSlides — greedy bin-pack tiles into 16:9 slide pages.
 * Mirrors the PresentationEngine algorithm so Briefing + Pitch agree.
 *
 * @param {object[]} allTiles
 * @param {number} maxPerSlide default 6 (PresentationEngine default)
 * @returns {object[][]} array of slides, each slide = tile array
 */
export function packIntoSlides(allTiles, maxPerSlide = 6) {
  if (!Array.isArray(allTiles) || allTiles.length === 0) return [];
  const sorted = sortByImportance(allTiles);
  const slides = [];
  let current = [];
  for (const tile of sorted) {
    if (scoreTile(tile) === 0) continue;
    current.push(tile);
    if (current.length >= maxPerSlide) {
      slides.push(current);
      current = [];
    }
  }
  if (current.length > 0) slides.push(current);
  return slides;
}

/**
 * briefingGridPlacement — 12-column Executive Briefing placement.
 *
 * Target grid (spec S7.1):
 *   - KPI cards    : 3 cols wide (4-up row)
 *   - Chart tiles  : 6 cols wide (2-up row) — hero chart goes full-width (12)
 *   - Table tiles  : 12 cols wide (full-width)
 *
 * Returns a flat array of `{ tile, colSpan, rowHint }` preserving the
 * importance-sorted order. The Briefing layout then translates this to
 * CSS grid using `grid-column: span N`.
 */
export function briefingGridPlacement(allTiles) {
  const sorted = sortByImportance(allTiles.filter((t) => scoreTile(t) > 0));
  const out = [];
  let heroPlaced = false;
  for (const tile of sorted) {
    if (isKpiTile(tile)) {
      out.push({ tile, colSpan: 3, rowHint: "kpi" });
      continue;
    }
    if (isTableTile(tile)) {
      out.push({ tile, colSpan: 12, rowHint: "table" });
      continue;
    }
    // First chart = hero (full width). Subsequent charts = half-width.
    if (!heroPlaced) {
      out.push({ tile, colSpan: 12, rowHint: "hero" });
      heroPlaced = true;
    } else {
      out.push({ tile, colSpan: 6, rowHint: "chart" });
    }
  }
  return out;
}

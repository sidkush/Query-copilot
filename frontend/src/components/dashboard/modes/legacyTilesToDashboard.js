/**
 * Plan 7 T6 — classify a tile as 'kpi' (single-number card) or 'chart'
 * (regular visualization). Used by the Plan 7 T7 bin-pack heuristic so KPIs
 * can take a short row and charts a tall one.
 *
 * Plan 7 T16 — tightened to require explicit KPI markers. The earlier
 * heuristic caught too many false-positives:
 *   - `chartType === 'number'` matched any aggregate-count chart.
 *   - `mark.type === 'text'` matched chart annotations + legends.
 * Both dropped the chart's parent row to 160 px, clipping real marks.
 * False negatives (missing a legit KPI) downgrade the KPI to a 360 px
 * row — harmless — while false positives actively break charts.
 *
 * Precedence (after T16):
 *   1. explicit `tile.tileKind` override ('kpi' | 'chart')
 *   2. `tile.chartType` exactly one of 'kpi' / 'bignumber' / 'big-number'
 *   3. default → 'chart'
 *
 * Safe for null / undefined input (defaults to 'chart').
 */
const KPI_CHART_TYPES = new Set(['kpi', 'bignumber', 'big-number']);

export function classifyTile(tile) {
  if (!tile || typeof tile !== 'object') return 'chart';
  if (tile.tileKind === 'kpi' || tile.tileKind === 'chart') return tile.tileKind;
  const chartType = typeof tile.chartType === 'string' ? tile.chartType.toLowerCase() : '';
  if (KPI_CHART_TYPES.has(chartType)) return 'kpi';
  return 'chart';
}

// Plan 7 T7 — KPI-aware bin-pack constants. KPIs are single-number cards
// that need much less vertical room than a regular chart; binning them into
// their own short rows frees up canvas height for the dataviz below.
const KPIS_PER_ROW = 4;
const CHARTS_PER_ROW = 2;
const KPI_ROW_PX = 160;
const CHART_ROW_PX = 360;
const GUTTER_PX = 32;

function toWorksheetChild(t, i, axisH, axisW = 100000) {
  // Plan 7 T2 — carry the user-authored chart title through as displayName
  // so opting into the frame title bar (showTitle: true) yields "Member
  // Rides", not the zone-id fallback "Worksheet #3w8i".
  const rawTitle = typeof t.title === 'string' ? t.title.trim() : '';
  const displayName = rawTitle.length > 0 ? rawTitle : undefined;
  return {
    id: String(t.id ?? `t${i}`),
    type: 'worksheet',
    w: axisW,
    h: axisH,
    worksheetRef: String(t.id ?? `t${i}`),
    ...(displayName !== undefined ? { displayName } : {}),
  };
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Build a container-horz row whose child w-proportions are even (drift
// absorbed into last child so sum === 100000). Row's h is ASSIGNED by caller;
// children fill the row fully on h (100000).
function buildHorzRow(id, tiles, rowH) {
  const evenW = Math.floor(100000 / Math.max(tiles.length, 1));
  const children = tiles.map((t, i) => toWorksheetChild(t, i, 100000, evenW));
  const wSum = children.reduce((s, c) => s + c.w, 0);
  const wDrift = 100000 - wSum;
  if (wDrift !== 0 && children.length > 0) {
    const last = children[children.length - 1];
    children[children.length - 1] = { ...last, w: last.w + wDrift };
  }
  return { id, type: 'container-horz', w: 100000, h: rowH, children };
}

/**
 * Legacy shim: flat tile array → zone tree.
 *
 * Plan 7 T7 routing:
 *   - All-chart tiles → Plan 5e columnar layout (byte-identical preservation):
 *       n ≤ 4  → single container-vert
 *       5..9   → container-horz with 2 container-vert children (round-robin)
 *       n ≥ 10 → container-horz with 3 container-vert children (round-robin)
 *   - Any KPI present → KPI-aware bin pack:
 *       Root = container-vert. Children = row containers.
 *       KPI rows chunk 4-per-row at 160 px tall (mixed).
 *       Chart rows chunk 2-per-row at 360 px tall.
 *       KPI rows emitted first (top of dashboard), charts below.
 *
 * Default canvas: 1440 × max(900, row-px-sum + gutters).
 */
export function legacyTilesToDashboard(tiles, dashboardId, dashboardName, size) {
  const n = tiles.length;
  const hasKpi = tiles.some((t) => classifyTile(t) === 'kpi');

  let tiledRoot;
  let canvasHeight;

  if (!hasKpi) {
    // ── Plan 5e all-chart columnar path (byte-identical preservation) ──
    const columns = n >= 10 ? 3 : n >= 5 ? 2 : 1;
    if (columns === 1) {
      const childH = Math.floor(100000 / Math.max(n, 1));
      const children = tiles.map((t, i) => toWorksheetChild(t, i, childH));
      tiledRoot = { id: 'root', type: 'container-vert', w: 100000, h: 100000, children };
    } else {
      const buckets = Array.from({ length: columns }, () => []);
      tiles.forEach((t, i) => { buckets[i % columns].push(t); });
      const colW = Math.floor(100000 / columns);
      const verts = buckets.map((bucket, colIdx) => {
        const perColH = Math.floor(100000 / Math.max(bucket.length, 1));
        return {
          id: `col${colIdx}`,
          type: 'container-vert',
          w: colW,
          h: 100000,
          children: bucket.map((t, i) => toWorksheetChild(t, i, perColH)),
        };
      });
      const wSum = verts.reduce((s, v) => s + v.w, 0);
      const drift = 100000 - wSum;
      if (drift !== 0 && verts.length > 0) {
        verts[verts.length - 1] = { ...verts[verts.length - 1], w: verts[verts.length - 1].w + drift };
      }
      tiledRoot = { id: 'root', type: 'container-horz', w: 100000, h: 100000, children: verts };
    }
    canvasHeight = Math.max(900, Math.ceil(n / columns) * 320);
  } else {
    // ── Plan 7 T7 KPI-aware bin pack ──
    const kpis = tiles.filter((t) => classifyTile(t) === 'kpi');
    const charts = tiles.filter((t) => classifyTile(t) !== 'kpi');
    const kpiChunks = chunkArray(kpis, KPIS_PER_ROW);
    const chartChunks = chunkArray(charts, CHARTS_PER_ROW);

    // Compute row px totals to derive proportional h.
    const rowPxs = [
      ...kpiChunks.map(() => KPI_ROW_PX),
      ...chartChunks.map(() => CHART_ROW_PX),
    ];
    const totalRowPx = rowPxs.reduce((s, p) => s + p, 0);
    // Scale each row's px to a proportional integer summing to 100000.
    const rowProps = rowPxs.map((px) => Math.floor((px / totalRowPx) * 100000));
    const propSum = rowProps.reduce((s, p) => s + p, 0);
    const propDrift = 100000 - propSum;
    if (propDrift !== 0 && rowProps.length > 0) {
      rowProps[rowProps.length - 1] += propDrift;
    }

    const rowChildren = [];
    let rowIdx = 0;
    kpiChunks.forEach((chunk, i) => {
      rowChildren.push(buildHorzRow(`kpi-row-${i}`, chunk, rowProps[rowIdx++]));
    });
    chartChunks.forEach((chunk, i) => {
      rowChildren.push(buildHorzRow(`chart-row-${i}`, chunk, rowProps[rowIdx++]));
    });

    tiledRoot = { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: rowChildren };
    const gutterTotal = Math.max(0, rowChildren.length - 1) * GUTTER_PX;
    canvasHeight = Math.max(900, totalRowPx + gutterTotal);
  }

  const defaultSize = {
    mode: 'fixed',
    width: 1440,
    height: canvasHeight,
    preset: 'custom',
  };

  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: dashboardId || 'unknown',
    name: dashboardName || 'Untitled',
    archetype: 'analyst-pro',
    size: size ?? defaultSize,
    tiledRoot,
    floatingLayer: [],
    worksheets: tiles.map((t) => ({ id: String(t.id), chartSpec: t.chart_spec ?? t.chartSpec })),
    parameters: [],
    sets: [],
    actions: [],
  };
}

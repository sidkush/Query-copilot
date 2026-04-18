/**
 * Plan 7 T6 — classify a tile as 'kpi' (single-number card) or 'chart'
 * (regular visualization). Used by the Plan 7 T7 bin-pack heuristic so KPIs
 * can take a short row and charts a tall one.
 *
 * Precedence:
 *   1. explicit `tile.tileKind` override ('kpi' | 'chart')
 *   2. `tile.chartType` in the KPI set ('kpi', 'bignumber', 'number')
 *   3. `tile.chart_spec.mark.type === 'text'` (or mark string === 'text')
 *   4. default → 'chart'
 *
 * Safe for null / undefined input (defaults to 'chart').
 */
const KPI_CHART_TYPES = new Set(['kpi', 'bignumber', 'number']);

export function classifyTile(tile) {
  if (!tile || typeof tile !== 'object') return 'chart';
  if (tile.tileKind === 'kpi' || tile.tileKind === 'chart') return tile.tileKind;
  const chartType = typeof tile.chartType === 'string' ? tile.chartType.toLowerCase() : '';
  if (KPI_CHART_TYPES.has(chartType)) return 'kpi';
  const spec = tile.chart_spec ?? tile.chartSpec;
  if (spec && typeof spec === 'object') {
    const mark = spec.mark;
    if (typeof mark === 'string' && mark === 'text') return 'kpi';
    if (mark && typeof mark === 'object' && mark.type === 'text') return 'kpi';
  }
  return 'chart';
}

/**
 * Legacy shim: flat tile array → zone tree.
 * Plan 5e — smart layout heuristic:
 *   - n ≤ 4  → single container-vert (byte-identical to pre-5e).
 *   - 5..9   → container-horz with 2 container-vert children (round-robin).
 *   - n ≥ 10 → container-horz with 3 container-vert children (round-robin).
 * Default canvas: fixed 1440 × max(900, ceil(n / N) * 320) when size is undefined;
 * caller-supplied size is preserved verbatim.
 */
export function legacyTilesToDashboard(tiles, dashboardId, dashboardName, size) {
  const n = tiles.length;
  const columns = n >= 10 ? 3 : n >= 5 ? 2 : 1;

  const toWorksheetChild = (t, i, axisH) => {
    // Plan 7 T2 — carry the user-authored chart title through as displayName
    // so opting into the frame title bar (showTitle: true) yields "Member
    // Rides", not the zone-id fallback "Worksheet #3w8i".
    const rawTitle = typeof t.title === 'string' ? t.title.trim() : '';
    const displayName = rawTitle.length > 0 ? rawTitle : undefined;
    return {
      id: String(t.id ?? `t${i}`),
      type: 'worksheet',
      w: 100000,
      h: axisH,
      worksheetRef: String(t.id ?? `t${i}`),
      ...(displayName !== undefined ? { displayName } : {}),
    };
  };

  let tiledRoot;
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

  const defaultSize = {
    mode: 'fixed',
    width: 1440,
    height: Math.max(900, Math.ceil(n / columns) * 320),
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

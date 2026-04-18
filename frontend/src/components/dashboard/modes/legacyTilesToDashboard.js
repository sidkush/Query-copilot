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

  const toWorksheetChild = (t, i, axisH) => ({
    id: String(t.id ?? `t${i}`),
    type: 'worksheet',
    w: 100000,
    h: axisH,
    worksheetRef: String(t.id ?? `t${i}`),
  });

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

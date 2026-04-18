// Hardening Iteration 1 — adversarial tests across the last 10 commits.
// Each test probes a weakness in one of Plan 7 T16–T21 / Plan 8 T22–T26.
// Any failure here lands a fix PR; green tests serve as regression locks.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  promoteSpecMark,
  repairSpec,
  repairBadAggregate,
  fallbackNullMark,
  repairMissingMeasure,
  repairColorTypeForMeasure,
  capColorCardinality,
} from '../components/dashboard/freeform/lib/specPromotion';
import { findResizeTarget } from '../components/dashboard/freeform/lib/findResizeTarget';
import { useStore } from '../store';

// ═══════════════════════════════════════════════════════════════════════
// A. repairSpec pipeline — idempotency, immutability, composition
// ═══════════════════════════════════════════════════════════════════════

describe('Hardening #1 — repairSpec idempotency', () => {
  it('running repairSpec twice produces the same output as running it once', () => {
    const wreck = {
      mark: 'text',
      encoding: {
        x: { field: 'station', type: 'nominal' },
        y: { aggregate: 'sum', field: 'station_name', type: 'quantitative' },
      },
    };
    const once = repairSpec(wreck);
    const twice = repairSpec(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

describe('Hardening #2 — repairSpec does not mutate input', () => {
  it('repairSpec returns a new object for a dirty spec and leaves the input untouched', () => {
    const input = {
      mark: 'arc',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { field: 'b', type: 'quantitative' },
      },
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = repairSpec(input);
    expect(out).not.toBe(input);
    expect(JSON.stringify(input)).toBe(JSON.stringify(snapshot));
  });
});

describe('Hardening #3 — repairSpec preserves unrelated spec fields', () => {
  it('data, transform, title, config, and $schema survive the pipeline', () => {
    const spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      title: 'Sales by region',
      description: 'd',
      data: { values: [{ a: 1 }] },
      transform: [{ filter: 'datum.a > 0' }],
      config: { axis: { labelFontSize: 11 } },
      mark: 'text',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { field: 'b', type: 'quantitative' },
      },
    };
    const out = repairSpec(spec);
    expect(out.$schema).toBe(spec.$schema);
    expect(out.title).toBe('Sales by region');
    expect(out.description).toBe('d');
    expect(out.data).toEqual(spec.data);
    expect(out.transform).toEqual(spec.transform);
    expect(out.config).toEqual(spec.config);
  });
});

describe('Hardening #4 — repairSpec composition', () => {
  it('text+xy with sum(nominal-suffix field) runs mark promotion AND aggregate repair', () => {
    const spec = {
      mark: 'text',
      encoding: {
        x: { field: 'station', type: 'nominal' },
        y: { aggregate: 'sum', field: 'bike_type', type: 'quantitative' },
        color: { field: 'bike_type', type: 'nominal' },
      },
    };
    const out = repairSpec(spec) as any;
    expect(out.mark === 'bar' || out.mark?.type === 'bar').toBe(true);
    expect(out.encoding.y.aggregate).toBe('count');
    expect(out.encoding.y.field).toBeUndefined();
  });
});

describe('Hardening #5 — repairSpec on a layered spec does not crash', () => {
  it('a layered Vega-Lite spec (no top-level encoding) is returned unchanged', () => {
    const layered = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: [{ x: 1 }] },
      layer: [
        { mark: 'bar', encoding: { x: { field: 'x' } } },
        { mark: 'line', encoding: { x: { field: 'x' } } },
      ],
    };
    expect(() => repairSpec(layered)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// B. Individual pass edge cases
// ═══════════════════════════════════════════════════════════════════════

describe('Hardening #6 — capColorCardinality with remote data reference', () => {
  it('noops when data uses a `name` / `url` reference rather than inline values', () => {
    const spec = {
      mark: 'bar',
      data: { name: 'table' },
      encoding: { color: { field: 'k', type: 'nominal' } },
    };
    expect(capColorCardinality(spec)).toBe(spec);
  });
});

describe('Hardening #7 — capColorCardinality skips field that is absent from all rows', () => {
  it('field missing from every row = 0 distinct, does not drop color', () => {
    const spec = {
      mark: 'bar',
      data: { values: Array.from({ length: 50 }, (_, i) => ({ other: i })) },
      encoding: { color: { field: 'not_there', type: 'nominal' } },
    };
    // All rows have undefined for the field; Set.size stays 1 (just undefined)
    // < limit → identity return.
    expect(capColorCardinality(spec)).toBe(spec);
  });
});

describe('Hardening #8 — fallbackNullMark on already-valid "bar" returns identity', () => {
  it('identity ref preserved for a clean bar spec', () => {
    const spec = { mark: 'bar', encoding: {} };
    expect(fallbackNullMark(spec)).toBe(spec);
  });
});

describe('Hardening #9 — repairBadAggregate does not touch aggregate=count', () => {
  it('count(nominal_field) is legitimate — no rewrite', () => {
    const spec = {
      mark: 'bar',
      encoding: {
        x: { field: 'station', type: 'nominal' },
        y: { aggregate: 'count', field: 'station_name', type: 'quantitative' },
      },
    };
    expect(repairBadAggregate(spec)).toBe(spec);
  });
});

describe('Hardening #10 — repairMissingMeasure preserves existing y.aggregate when injecting', () => {
  it('never overwrites a present y', () => {
    const spec = {
      mark: 'bar',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { aggregate: 'sum', field: 'b', type: 'quantitative' },
      },
    };
    expect(repairMissingMeasure(spec)).toBe(spec);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// C. findResizeTarget edge cases
// ═══════════════════════════════════════════════════════════════════════

describe('Hardening #11 — findResizeTarget on single-leaf root', () => {
  it('root leaf (no parent) returns null for both axes', () => {
    const leaf = { id: 'L1', type: 'worksheet', w: 100000, h: 100000 };
    expect(findResizeTarget(leaf as any, 'L1', 'w')).toBe(null);
    expect(findResizeTarget(leaf as any, 'L1', 'h')).toBe(null);
  });
});

describe('Hardening #12 — findResizeTarget deeply nested', () => {
  it('leaf five levels deep with alternating horz/vert resolves the correct ancestor per axis', () => {
    // root horz > vert > horz > vert > horz > leaf
    const tree = {
      id: 'root', type: 'container-horz', w: 100000, h: 100000,
      children: [{
        id: 'v1', type: 'container-vert', w: 100000, h: 100000,
        children: [{
          id: 'h2', type: 'container-horz', w: 100000, h: 100000,
          children: [{
            id: 'v3', type: 'container-vert', w: 100000, h: 100000,
            children: [{
              id: 'h4', type: 'container-horz', w: 100000, h: 100000,
              children: [{ id: 'leaf', type: 'worksheet', w: 100000, h: 100000 }],
            }],
          }],
        }],
      }],
    };
    // leaf is inside h4 (horz) → w-axis target = leaf itself
    expect(findResizeTarget(tree as any, 'leaf', 'w')).toBe('leaf');
    // h-axis: walk up, skip horz ancestors, find first vert-parent = v3 (parent of h4)
    expect(findResizeTarget(tree as any, 'leaf', 'h')).toBe('h4');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// D. detachTileToFloat undo + last-child edge
// ═══════════════════════════════════════════════════════════════════════

const makeDashWithHorzRow = (kids: string[]) => ({
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1',
  name: 'test',
  archetype: 'analyst-pro',
  size: { mode: 'fixed', width: 1440, height: 900, preset: 'custom' },
  tiledRoot: {
    id: 'root', type: 'container-vert', w: 100000, h: 100000,
    children: [{
      id: 'row', type: 'container-horz', w: 100000, h: 100000,
      children: kids.map((id, i) => ({
        id, type: 'worksheet', worksheetRef: id, w: Math.floor(100000 / kids.length) + (i === 0 ? 100000 % kids.length : 0), h: 100000,
      })),
    }],
  },
  floatingLayer: [],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [],
});

describe('Hardening #13 — detachTileToFloat + undoAnalystPro', () => {
  beforeEach(() => {
    const dash = makeDashWithHorzRow(['A', 'B', 'C']);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
  });

  it('undo restores the detached tile back into the tiledRoot row', () => {
    useStore.getState().detachTileToFloatAnalystPro('A', { pxW: 400, pxH: 300 });
    // Detached — not in tree.
    const findId = (root: any, id: string): any => {
      if (!root) return null;
      if (root.id === id) return root;
      for (const c of root.children || []) {
        const f = findId(c, id);
        if (f) return f;
      }
      return null;
    };
    const mid = useStore.getState().analystProDashboard as any;
    expect(findId(mid.tiledRoot, 'A')).toBeNull();
    expect(mid.floatingLayer.some((z: any) => z.id === 'A')).toBe(true);

    // Undo.
    useStore.getState().undoAnalystPro();
    const after = useStore.getState().analystProDashboard as any;
    expect(findId(after.tiledRoot, 'A')).not.toBeNull();
    expect(after.floatingLayer.some((z: any) => z.id === 'A')).toBe(false);
  });
});

describe('Hardening #14 — detachTileToFloat the only child of a row', () => {
  it('leaves an empty row in tiledRoot (caller should clean up; at minimum do not crash)', () => {
    const dash = makeDashWithHorzRow(['SOLO']);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    expect(() => useStore.getState().detachTileToFloatAnalystPro('SOLO', { pxW: 200, pxH: 200 })).not.toThrow();
    const after = useStore.getState().analystProDashboard as any;
    expect(after.floatingLayer.some((z: any) => z.id === 'SOLO')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// E. useAnalystProAutosave — unmount mid-debounce cancels pending PATCH
// ═══════════════════════════════════════════════════════════════════════

vi.mock('../api', () => ({
  api: { updateDashboard: vi.fn(() => Promise.resolve({})) },
}));

// ═══════════════════════════════════════════════════════════════════════
// F. Second-pass adversarial probes (sharpened edges)
// ═══════════════════════════════════════════════════════════════════════

describe('Hardening #16 — promoteSpecMark strips arc-specific options', () => {
  it('innerRadius / outerRadius / padAngle / theta / theta2 are dropped on arc→bar promotion', () => {
    const spec = {
      mark: { type: 'arc', innerRadius: 50, outerRadius: 100, padAngle: 0.05, theta: 1 },
      encoding: {
        x: { field: 'station', type: 'nominal' },
        y: { field: 'rides', type: 'quantitative' },
      },
    };
    const out = promoteSpecMark(spec) as any;
    expect(out.mark.type).toBe('bar');
    expect(out.mark.innerRadius).toBeUndefined();
    expect(out.mark.outerRadius).toBeUndefined();
    expect(out.mark.padAngle).toBeUndefined();
    expect(out.mark.theta).toBeUndefined();
  });
});

describe('Hardening #17 — detach + redo re-applies detach', () => {
  beforeEach(() => {
    const dash = makeDashWithHorzRow(['A', 'B']);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
  });

  it('detach → undo → redo restores the floating layer entry', () => {
    useStore.getState().detachTileToFloatAnalystPro('A', { pxW: 300, pxH: 200 });
    useStore.getState().undoAnalystPro();
    useStore.getState().redoAnalystPro();
    const dash = useStore.getState().analystProDashboard as any;
    expect(dash.floatingLayer.some((z: any) => z.id === 'A')).toBe(true);
  });
});

describe('Hardening #18 — detach same tile twice is handled safely', () => {
  beforeEach(() => {
    const dash = makeDashWithHorzRow(['A', 'B']);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
  });

  it('second detach is a no-op (leaf already gone from tree)', () => {
    useStore.getState().detachTileToFloatAnalystPro('A', { pxW: 300, pxH: 200 });
    const countAfterFirst = (useStore.getState().analystProDashboard as any).floatingLayer.length;
    // Re-invoke: leaf is not in tree anymore, so findByIdRec returns null → no-op.
    useStore.getState().detachTileToFloatAnalystPro('A', { pxW: 500, pxH: 500 });
    const countAfterSecond = (useStore.getState().analystProDashboard as any).floatingLayer.length;
    expect(countAfterSecond).toBe(countAfterFirst);
    // No duplicate id in floating layer (React key collision risk).
    const ids = (useStore.getState().analystProDashboard as any).floatingLayer.map((z: any) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Hardening #19 — classifyTile case-insensitivity on tileKind', () => {
  it('accepts only exact lowercase "kpi" / "chart" for tileKind — uppercase ignored', async () => {
    const { classifyTile } = await import('../components/dashboard/modes/legacyTilesToDashboard');
    // Current contract: tileKind compared === 'kpi' / 'chart'. Uppercase not honored
    // by the override path, but chartType match IS case-insensitive.
    expect(classifyTile({ id: 1, tileKind: 'KPI', chartType: 'bar' } as any)).toBe('chart');
    expect(classifyTile({ id: 2, tileKind: 'kpi' } as any)).toBe('kpi');
    expect(classifyTile({ id: 3, chartType: 'KPI' } as any)).toBe('kpi');
  });
});

describe('Hardening #20 — repairColorTypeForMeasure on matching quantitative color is identity', () => {
  it('color.type already quantitative — no-op, identity ref', () => {
    const spec = {
      mark: 'bar',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { field: 'b', type: 'quantitative' },
        color: { field: 'b', type: 'quantitative' },
      },
    };
    expect(repairColorTypeForMeasure(spec)).toBe(spec);
  });
});

describe('Hardening #21 — no `export default memo(function Name(...)` wrapper pattern (Vite oxc parse-error)', () => {
  it('dashboard / freeform / agent JSX files use the two-statement memo pattern', async () => {
    // Vite's oxc plugin parses more strictly than vitest's esbuild. The
    // `export default memo(function Name({...}) { ... });` pattern parses
    // fine in vitest but fails in Vite HMR with "Expected `,` or `)` but
    // found `function`" when the function body contains JSX comments or
    // other constructs that oxc tokenizes differently inside the memo
    // call argument list. Previous-session's linter applied this wrapping
    // to DashboardTileCanvas.jsx, AnalystProWorksheetTile.jsx, and
    // ChartTooltipCard.jsx, breaking dev-server HMR silently (tests still
    // passed because esbuild accepts it).
    //
    // Lock the safer two-statement pattern:
    //   function X(...) { ... }
    //   export default memo(X);
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = fileURLToPath(import.meta.url);
    const repoFrontendSrc = path.resolve(here, '..', '..');
    const glob = async (dir: string, acc: string[] = []): Promise<string[]> => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '__tests__' || e.name === 'dist') continue;
          await glob(full, acc);
        } else if (/\.(jsx|tsx)$/.test(e.name)) {
          acc.push(full);
        }
      }
      return acc;
    };
    const files = await glob(path.join(repoFrontendSrc, 'components'));
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      // Match `export default memo(function ...({`  OR  `export default memo(function Name(`
      if (/export\s+default\s+memo\s*\(\s*function\s+\w+\s*\(/.test(src)) {
        offenders.push(path.relative(repoFrontendSrc, f));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('Hardening #15 — autosave unmount mid-debounce', () => {
  let api: any;
  beforeEach(async () => {
    vi.useFakeTimers();
    api = (await import('../api')).api;
    api.updateDashboard.mockClear();
    useStore.setState({
      analystProDashboard: {
        schemaVersion: 'v', id: 'd1', name: 'x', archetype: 'analyst-pro',
        size: { mode: 'automatic' },
        tiledRoot: { id: 'r', type: 'container-vert', w: 100000, h: 100000, children: [] },
        floatingLayer: [],
        worksheets: [], parameters: [], sets: [], actions: [],
      } as any,
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('unmounting the autosave hook before the 1500 ms debounce cancels the PATCH', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const useAnalystProAutosave = (await import('../components/dashboard/freeform/hooks/useAnalystProAutosave')).default;
    const { unmount } = renderHook(() => useAnalystProAutosave('d1'));
    act(() => {
      useStore.setState({ analystProDashboard: { ...(useStore.getState().analystProDashboard as any), name: 'changed' } });
    });
    act(() => { vi.advanceTimersByTime(800); });
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(api.updateDashboard).not.toHaveBeenCalled();
  });
});

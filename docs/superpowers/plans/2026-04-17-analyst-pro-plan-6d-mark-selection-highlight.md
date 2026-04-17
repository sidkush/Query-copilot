# Analyst Pro Plan 6d — Mark Selection + Highlight Overlay on Charts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click a chart mark in an Analyst Pro worksheet → mark selected, `MarkEvent` published to bus, non-matching marks dim to opacity 0.15 across both source and any cross-sheet highlight target. Shift+click adds to selection. Click empty area clears.

**Architecture:** Pure client-side mask per Build_Tableau §XI.5 (`InteractiveSceneRenderer::HoverRegion` analogue). Highlight state lives in existing `analystProSheetHighlights[sheetId]` Zustand slice (Plan 4a). VegaRenderer gains an `onMarkSelect` callback prop sibling to existing `onDrillthrough`/`onBrush`. Spec compilation (`applyHighlightToSpec`) is pure: clones `chart_spec` and layers a Vega-Lite `condition` opacity encoding + 2px stroke encoding referencing the highlight predicate. No re-query — non-matching marks are masked, not filtered. Re-query path (source dim absent from target grain) is out-of-scope per Plan 6d (deferred to Plan 6e/7a, dev warning emitted).

**Tech Stack:** TypeScript (chart-ir + freeform/lib), JSX (AnalystProWorksheetTile, EditorCanvas, DashboardTileCanvas), Vitest, react-vega, Vega-Lite condition encodings, existing markEventBus singleton.

---

## File Structure

**Create:**
- `frontend/src/components/dashboard/freeform/lib/highlightFilter.ts` — pure helpers `compileHighlightFilter()`, `applyHighlightToSpec()`, `mergeMarkIntoHighlight()`.
- `frontend/src/components/dashboard/freeform/__tests__/highlightFilter.test.ts` — pure-helper unit tests.
- `frontend/src/components/dashboard/freeform/__tests__/MarkSelectionRuntime.integration.test.tsx` — end-to-end click → bus → cascade → target slice.
- `frontend/src/components/editor/renderers/__tests__/VegaRenderer.markSelect.test.tsx` — VegaRenderer click-handler unit test (event extraction + shift modifier + empty-area clear).

**Modify:**
- `frontend/src/components/editor/renderers/VegaRenderer.tsx` — add `onMarkSelect` prop + click handler (mark + empty-area).
- `frontend/src/components/editor/EditorCanvas.jsx` — forward `onMarkSelect` prop to `<VegaRenderer />` (mirror existing `onDrillthrough` plumbing).
- `frontend/src/components/dashboard/lib/DashboardTileCanvas.jsx` — accept + forward `onMarkSelect` prop.
- `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx` — subscribe to `analystProSheetHighlights[sheetId]`, memoize `applyHighlightToSpec`-injected tile, pass `onMarkSelect` callback that updates own slice + publishes `MarkEvent`.
- `frontend/src/store.js` — extend `setSheetHighlightAnalystPro` to accept array values; no other slice change required (existing `clearSheetHighlightAnalystPro` reused).
- `docs/analyst_pro_tableau_parity_roadmap.md` — flip Plan 6d status to ✅ Shipped at the end.

**No backend changes.** Plan 6d is 100% frontend per roadmap §"Plan 6d".

---

## Task 1: `compileHighlightFilter()` pure helper + tests

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/highlightFilter.ts`
- Test: `frontend/src/components/dashboard/freeform/__tests__/highlightFilter.test.ts`

Helper takes the slice value (`{[field]: scalar | scalar[]}`) and returns a Vega-Lite expression string evaluating to `true` when `datum` matches all field constraints. Empty input → `'true'` (no mask). Array values become OR'd equality checks (Tableau's IN-list equivalent for highlight). Strings are JSON-stringified for safe interpolation; numbers/booleans pass through.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/components/dashboard/freeform/__tests__/highlightFilter.test.ts
import { describe, it, expect } from 'vitest';
import { compileHighlightFilter } from '../lib/highlightFilter';

describe('compileHighlightFilter', () => {
  it('empty highlight returns "true" (no mask)', () => {
    expect(compileHighlightFilter({})).toBe('true');
    expect(compileHighlightFilter(null as unknown as Record<string, unknown>)).toBe('true');
  });

  it('single string field renders quoted equality', () => {
    expect(compileHighlightFilter({ region: 'East' })).toBe(
      "(datum['region'] === \"East\")",
    );
  });

  it('numeric field renders unquoted equality', () => {
    expect(compileHighlightFilter({ year: 2024 })).toBe("(datum['year'] === 2024)");
  });

  it('boolean field renders unquoted equality', () => {
    expect(compileHighlightFilter({ active: true })).toBe(
      "(datum['active'] === true)",
    );
  });

  it('multi-value field becomes OR-grouped', () => {
    expect(compileHighlightFilter({ region: ['East', 'West'] })).toBe(
      "(datum['region'] === \"East\" || datum['region'] === \"West\")",
    );
  });

  it('multiple fields are AND-joined', () => {
    expect(compileHighlightFilter({ region: 'East', year: 2024 })).toBe(
      "(datum['region'] === \"East\") && (datum['year'] === 2024)",
    );
  });

  it('field name with single quote is escaped', () => {
    expect(compileHighlightFilter({ "o'brien": 'x' })).toBe(
      "(datum['o\\'brien'] === \"x\")",
    );
  });

  it('null value is treated as no constraint for that field', () => {
    expect(compileHighlightFilter({ region: null })).toBe('true');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test -- highlightFilter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

```ts
// frontend/src/components/dashboard/freeform/lib/highlightFilter.ts
import type { ChartSpec } from '../../../../chart-ir';

export type HighlightSlice = Record<string, unknown> | null | undefined;

function literal(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  // Dates / objects: stringify defensively.
  return JSON.stringify(String(v));
}

function escapeFieldName(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Compile a highlight slice (`{field: scalar | scalar[]}`) into a Vega
 * expression string. Empty / null input returns `'true'` so callers can
 * embed unconditionally without branching.
 *
 * Multi-value fields render as OR-grouped equality (Tableau IN-list).
 * Multiple fields are AND-joined (every constraint must match).
 */
export function compileHighlightFilter(slice: HighlightSlice): string {
  if (!slice || typeof slice !== 'object') return 'true';
  const clauses: string[] = [];
  for (const [rawField, raw] of Object.entries(slice)) {
    const field = escapeFieldName(rawField);
    const accessor = `datum['${field}']`;
    if (raw === null || raw === undefined) continue;
    if (Array.isArray(raw)) {
      const ors = raw
        .map((v) => literal(v))
        .filter((v): v is string => v !== null)
        .map((v) => `${accessor} === ${v}`);
      if (ors.length > 0) clauses.push(`(${ors.join(' || ')})`);
    } else {
      const lit = literal(raw);
      if (lit !== null) clauses.push(`(${accessor} === ${lit})`);
    }
  }
  if (clauses.length === 0) return 'true';
  return clauses.join(' && ');
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test -- highlightFilter.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/highlightFilter.ts \
        frontend/src/components/dashboard/freeform/__tests__/highlightFilter.test.ts
git commit -m "feat(analyst-pro): compileHighlightFilter pure helper for Vega expr (Plan 6d T1)"
```

---

## Task 2: `applyHighlightToSpec()` + `mergeMarkIntoHighlight()` pure helpers

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/highlightFilter.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/highlightFilter.test.ts`

`applyHighlightToSpec(spec, slice)` clones the chart spec and injects two encoding overrides per Build_Tableau §XI.5:
- **Opacity** — `condition: { test: <filter>, value: 1.0 }, value: 0.15`. Non-matching marks dim.
- **Stroke** — 2px outline on matching marks (`condition: { test: <filter>, value: 'var(--accent, #5b8def)' }, value: null` + strokeWidth 2/0). Selection ring per Plan 6d deliverable §3.

When `slice` is empty/null, returns the spec unchanged (referential identity preserved so `useMemo` consumers don't churn).

`mergeMarkIntoHighlight(prev, fields, additive)` returns the next slice value when the user clicks a mark. `additive=false` (plain click) → replaces with `fields`. `additive=true` (shift+click) → for each field, append value to existing array (dedup; promote scalar→array). `fields=null` (empty-area click) → returns `null` to signal clear.

- [ ] **Step 1: Write the failing tests**

```ts
// append to highlightFilter.test.ts
import { applyHighlightToSpec, mergeMarkIntoHighlight } from '../lib/highlightFilter';

describe('applyHighlightToSpec', () => {
  const baseSpec = {
    type: 'cartesian',
    encoding: { x: { field: 'region', type: 'nominal' }, y: { field: 'sales', type: 'quantitative' } },
  } as any;

  it('empty slice returns spec by reference', () => {
    expect(applyHighlightToSpec(baseSpec, {})).toBe(baseSpec);
    expect(applyHighlightToSpec(baseSpec, null)).toBe(baseSpec);
  });

  it('non-empty slice injects opacity condition', () => {
    const out = applyHighlightToSpec(baseSpec, { region: 'East' });
    expect(out).not.toBe(baseSpec);
    expect(out.encoding.opacity).toEqual({
      condition: { test: "(datum['region'] === \"East\")", value: 1.0 },
      value: 0.15,
    });
  });

  it('non-empty slice injects stroke + strokeWidth conditions', () => {
    const out = applyHighlightToSpec(baseSpec, { region: 'East' });
    expect(out.encoding.stroke).toMatchObject({
      condition: { test: "(datum['region'] === \"East\")" },
    });
    expect(out.encoding.strokeWidth).toEqual({
      condition: { test: "(datum['region'] === \"East\")", value: 2 },
      value: 0,
    });
  });

  it('does not mutate input spec', () => {
    const before = JSON.parse(JSON.stringify(baseSpec));
    applyHighlightToSpec(baseSpec, { region: 'East' });
    expect(baseSpec).toEqual(before);
  });
});

describe('mergeMarkIntoHighlight', () => {
  it('null fields clears the slice', () => {
    expect(mergeMarkIntoHighlight({ region: 'East' }, null, false)).toBeNull();
    expect(mergeMarkIntoHighlight({ region: 'East' }, null, true)).toBeNull();
  });

  it('plain click replaces', () => {
    expect(mergeMarkIntoHighlight({ region: 'East' }, { region: 'West' }, false))
      .toEqual({ region: 'West' });
  });

  it('shift click promotes scalar to array', () => {
    expect(mergeMarkIntoHighlight({ region: 'East' }, { region: 'West' }, true))
      .toEqual({ region: ['East', 'West'] });
  });

  it('shift click on existing array appends + dedups', () => {
    expect(mergeMarkIntoHighlight({ region: ['East', 'West'] }, { region: 'East' }, true))
      .toEqual({ region: ['East', 'West'] });
    expect(mergeMarkIntoHighlight({ region: ['East'] }, { region: 'North' }, true))
      .toEqual({ region: ['East', 'North'] });
  });

  it('shift click adds new field to existing slice', () => {
    expect(mergeMarkIntoHighlight({ region: 'East' }, { year: 2024 }, true))
      .toEqual({ region: 'East', year: 2024 });
  });

  it('plain click on null prev still seeds', () => {
    expect(mergeMarkIntoHighlight(null, { region: 'East' }, false))
      .toEqual({ region: 'East' });
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test -- highlightFilter.test.ts`
Expected: FAIL — `applyHighlightToSpec`, `mergeMarkIntoHighlight` not exported.

- [ ] **Step 3: Implement helpers (append to highlightFilter.ts)**

```ts
// append to frontend/src/components/dashboard/freeform/lib/highlightFilter.ts

const HIGHLIGHT_STROKE = 'var(--accent, #5b8def)';

/**
 * Inject opacity + stroke conditions into a chart spec so non-matching marks
 * dim to 0.15 and matching marks gain a 2px stroke ring (Build_Tableau §XI.5).
 * Returns the spec unchanged (by reference) when slice is empty.
 */
export function applyHighlightToSpec<T extends { encoding?: Record<string, unknown> }>(
  spec: T,
  slice: HighlightSlice,
): T {
  if (!slice || typeof slice !== 'object' || Object.keys(slice).length === 0) {
    return spec;
  }
  const test = compileHighlightFilter(slice);
  if (test === 'true') return spec;
  const encoding = { ...(spec.encoding || {}) };
  encoding.opacity = { condition: { test, value: 1.0 }, value: 0.15 };
  encoding.stroke = { condition: { test, value: HIGHLIGHT_STROKE }, value: null };
  encoding.strokeWidth = { condition: { test, value: 2 }, value: 0 };
  return { ...spec, encoding };
}

function uniq<T>(xs: T[]): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const x of xs) {
    const key = typeof x === 'object' ? JSON.stringify(x) : x;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

/**
 * Merge a click's field values into the existing highlight slice.
 *  - `fields=null`         → clear (returns null).
 *  - `additive=false`      → replace prev with fields (single-select).
 *  - `additive=true`       → per-field append + dedupe; promote scalar→array.
 */
export function mergeMarkIntoHighlight(
  prev: HighlightSlice,
  fields: Record<string, unknown> | null,
  additive: boolean,
): Record<string, unknown> | null {
  if (fields === null) return null;
  if (!additive || !prev) return { ...fields };
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(fields)) {
    const existing = out[k];
    if (existing === undefined) {
      out[k] = v;
    } else if (Array.isArray(existing)) {
      out[k] = uniq([...existing, v]);
    } else {
      out[k] = uniq([existing, v]);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test -- highlightFilter.test.ts`
Expected: PASS — all 14 tests (7 from T1 + 7 new) green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/highlightFilter.ts \
        frontend/src/components/dashboard/freeform/__tests__/highlightFilter.test.ts
git commit -m "feat(analyst-pro): applyHighlightToSpec + mergeMarkIntoHighlight helpers (Plan 6d T2)"
```

---

## Task 3: Extend `setSheetHighlightAnalystPro` to accept array values

**Files:**
- Modify: `frontend/src/store.js:882-890` (`setSheetHighlightAnalystPro`)
- Test: `frontend/src/__tests__/store.analystProHighlights.test.js` (create if absent; otherwise append)

The existing slice setter accepts `{[field]: value}` and stores as-is. Multi-mark highlight (shift-select) needs to store arrays. Setter already does `typeof === 'object'` guard which arrays satisfy — explicit assertion + test for the array path is sufficient. No store schema change required, but lock behavior with a test now so a future cleanup can't accidentally narrow the type.

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/__tests__/store.analystProHighlights.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('analystProSheetHighlights slice', () => {
  beforeEach(() => {
    useStore.setState({ analystProSheetHighlights: {} });
  });

  it('setSheetHighlightAnalystPro stores scalar fieldValues', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({ region: 'East' });
  });

  it('setSheetHighlightAnalystPro stores array fieldValues (multi-select)', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: ['East', 'West'] });
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({
      region: ['East', 'West'],
    });
  });

  it('setSheetHighlightAnalystPro replaces existing slice value', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'West' });
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({ region: 'West' });
  });

  it('clearSheetHighlightAnalystPro removes the entry entirely', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    useStore.getState().clearSheetHighlightAnalystPro('sheet-a');
    expect('sheet-a' in useStore.getState().analystProSheetHighlights).toBe(false);
  });

  it('ignores empty sheetId (no throw, no write)', () => {
    useStore.getState().setSheetHighlightAnalystPro('', { region: 'East' });
    useStore.getState().setSheetHighlightAnalystPro(null, { region: 'East' });
    expect(useStore.getState().analystProSheetHighlights).toEqual({});
  });
});
```

- [ ] **Step 2: Run test, verify pass for scalar / fail for array if any narrowing exists**

Run: `cd frontend && npm run test -- store.analystProHighlights.test.js`
Expected: PASS for all 5 (existing setter already passes arrays through). If FAIL on the array case, proceed to Step 3.

- [ ] **Step 3: If Step 2 failed, widen the setter (otherwise skip)**

```js
// frontend/src/store.js around line 882
setSheetHighlightAnalystPro: (sheetId, fieldValues) => {
  if (!sheetId) return;
  const safe =
    fieldValues && typeof fieldValues === 'object'
      ? fieldValues  // accepts {[field]: scalar | scalar[]}
      : {};
  set((s) => ({
    analystProSheetHighlights: {
      ...s.analystProSheetHighlights,
      [sheetId]: safe,
    },
  }));
},
```

(Existing code already does this. Step 3 is only needed if a regression appears. Leave the file untouched if Step 2 already passed.)

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test -- store.analystProHighlights.test.js`
Expected: PASS — all 5 green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/__tests__/store.analystProHighlights.test.js
# Only `git add frontend/src/store.js` if Step 3 modified it.
git commit -m "test(analyst-pro): lock setSheetHighlightAnalystPro array semantics (Plan 6d T3)"
```

---

## Task 4: VegaRenderer `onMarkSelect` prop + click handler

**Files:**
- Modify: `frontend/src/components/editor/renderers/VegaRenderer.tsx`
- Test: `frontend/src/components/editor/renderers/__tests__/VegaRenderer.markSelect.test.tsx`

Add an `onMarkSelect?: (sheetId: string, fields: Record<string, unknown> | null, opts: { shiftKey: boolean }) => void` prop next to existing `onDrillthrough` / `onBrush`. Wire two click listeners inside `handleNewViewWrapped` (matches existing pattern):

1. **Mark click** — `view.addEventListener('click', (event, item) => { if (item?.datum) onMarkSelect(sheetId, datumToFields(item.datum), { shiftKey: event.shiftKey }); })`. Filter Vega's synthetic `_*` keys out of fields (e.g. `_vgsid_`, keys starting with `__`).
2. **Empty-area click** — same listener; when `!item || !item.datum`, call `onMarkSelect(sheetId, null, { shiftKey: event.shiftKey })`.

Add a `sheetId?: string` prop (optional, only Analyst Pro tiles set it) so the callback fires with a stable identifier without forcing the renderer to know about its parent. When `sheetId` is empty, skip the click wiring entirely (preserves current renderer for ChartEditor + non-Analyst-Pro dashboards — no behavior change).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/editor/renderers/__tests__/VegaRenderer.markSelect.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import VegaRenderer from '../VegaRenderer';

// Stub the Vega view so we can synthesise click events deterministically.
type Listener = (event: any, item: any) => void;
const eventListeners = new Map<string, Listener[]>();

vi.mock('react-vega', () => ({
  VegaLite: ({ onNewView }: any) => {
    const fakeView = {
      addEventListener: (name: string, fn: Listener) => {
        const list = eventListeners.get(name) ?? [];
        list.push(fn);
        eventListeners.set(name, list);
      },
      addSignalListener: () => {},
      change: () => ({ insert: () => ({ run: () => {} }) }),
      run: () => {},
    };
    setTimeout(() => onNewView?.(fakeView), 0);
    return <div data-testid="vega-mock" />;
  },
}));

const baseSpec = {
  type: 'cartesian',
  encoding: { x: { field: 'region' }, y: { field: 'sales' } },
} as any;
const resultSet = { columns: ['region', 'sales'], rows: [['East', 10]] };

beforeEach(() => eventListeners.clear());

function fireClick(event: Partial<MouseEvent>, item: any) {
  for (const fn of eventListeners.get('click') ?? []) fn(event as any, item);
}

describe('VegaRenderer onMarkSelect', () => {
  it('fires onMarkSelect with datum fields and shiftKey on mark click', async () => {
    const onMarkSelect = vi.fn();
    render(
      <VegaRenderer
        spec={baseSpec}
        resultSet={resultSet}
        sheetId="sheet-a"
        onMarkSelect={onMarkSelect}
      />,
    );
    await waitFor(() => expect(eventListeners.get('click')?.length).toBeGreaterThan(0));
    fireClick({ shiftKey: false }, { datum: { region: 'East', sales: 10, _vgsid_: 99 } });
    expect(onMarkSelect).toHaveBeenCalledWith(
      'sheet-a',
      { region: 'East', sales: 10 },
      { shiftKey: false },
    );
  });

  it('fires onMarkSelect with null on empty-area click', async () => {
    const onMarkSelect = vi.fn();
    render(
      <VegaRenderer
        spec={baseSpec}
        resultSet={resultSet}
        sheetId="sheet-a"
        onMarkSelect={onMarkSelect}
      />,
    );
    await waitFor(() => expect(eventListeners.get('click')?.length).toBeGreaterThan(0));
    fireClick({ shiftKey: false }, null);
    expect(onMarkSelect).toHaveBeenCalledWith('sheet-a', null, { shiftKey: false });
  });

  it('forwards shiftKey=true on shift+click', async () => {
    const onMarkSelect = vi.fn();
    render(
      <VegaRenderer
        spec={baseSpec}
        resultSet={resultSet}
        sheetId="sheet-a"
        onMarkSelect={onMarkSelect}
      />,
    );
    await waitFor(() => expect(eventListeners.get('click')?.length).toBeGreaterThan(0));
    fireClick({ shiftKey: true }, { datum: { region: 'East', sales: 10 } });
    expect(onMarkSelect).toHaveBeenCalledWith(
      'sheet-a',
      { region: 'East', sales: 10 },
      { shiftKey: true },
    );
  });

  it('does NOT wire click when sheetId is empty (preserves legacy)', async () => {
    const onMarkSelect = vi.fn();
    const { container } = render(
      <VegaRenderer
        spec={baseSpec}
        resultSet={resultSet}
        onMarkSelect={onMarkSelect}
      />,
    );
    await waitFor(() => container.querySelector('[data-testid="vega-mock"]'));
    // Even after view-ready, no mark-select listener should be attached
    // beyond the existing drillthrough/tooltip listeners.
    fireClick({ shiftKey: false }, { datum: { region: 'East' } });
    expect(onMarkSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test -- VegaRenderer.markSelect.test.tsx`
Expected: FAIL — `onMarkSelect` prop not consumed.

- [ ] **Step 3: Implement in VegaRenderer.tsx**

In the `VegaRendererProps` interface (~line 61), add:

```ts
  /** Stable identifier for the worksheet/zone the renderer lives in.
   *  Only Analyst Pro tiles set this — when present, click events on data
   *  marks invoke `onMarkSelect`. */
  sheetId?: string;
  /** Fired on click of a data mark (with datum fields stripped of Vega's
   *  internal `_*` / `__*` keys) or on empty-area click (with `null`). */
  onMarkSelect?: (
    sheetId: string,
    fields: Record<string, unknown> | null,
    opts: { shiftKey: boolean },
  ) => void;
```

Destructure both props in the component signature (~line 107):

```ts
export default function VegaRenderer({
  spec,
  resultSet,
  rendererBackend = 'svg',
  strategy,
  onViewReady,
  colorMap,
  onDrillthrough,
  onBrush,
  sheetId,
  onMarkSelect,
}: VegaRendererProps) {
```

Add a helper above `applyDownsample` at the bottom of the file:

```ts
function datumToFields(datum: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datum)) {
    if (k.startsWith('_') || k.startsWith('__')) continue;
    out[k] = v;
  }
  return out;
}
```

Inside `handleNewViewWrapped` (~line 244), AFTER the existing drillthrough listener and BEFORE the brush block, add:

```ts
    // Plan 6d: mark-select click handler. Only wired for Analyst Pro tiles
    // (sheetId set). Empty-area click clears; mark click selects with shift
    // modifier forwarded so the parent can decide additive vs replace.
    if (sheetId && onMarkSelect) {
      view.addEventListener('click', (event: MouseEvent, item: { datum?: Record<string, unknown> } | null) => {
        if (item?.datum) {
          onMarkSelect(sheetId, datumToFields(item.datum), { shiftKey: !!event.shiftKey });
        } else {
          onMarkSelect(sheetId, null, { shiftKey: !!event.shiftKey });
        }
      });
    }
```

Add `sheetId, onMarkSelect` to the `useCallback` dep array of `handleNewViewWrapped`:

```ts
  }, [handleNewView, spec, onDrillthrough, onBrush, sheetId, onMarkSelect]);
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test -- VegaRenderer.markSelect.test.tsx`
Expected: PASS — all 4 tests green. Run `npm run lint` to confirm no new warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/editor/renderers/VegaRenderer.tsx \
        frontend/src/components/editor/renderers/__tests__/VegaRenderer.markSelect.test.tsx
git commit -m "feat(analyst-pro): VegaRenderer onMarkSelect click handler + sheetId prop (Plan 6d T4)"
```

---

## Task 5: Forward `onMarkSelect` + `sheetId` through EditorCanvas + DashboardTileCanvas

**Files:**
- Modify: `frontend/src/components/editor/EditorCanvas.jsx` — accept and pass to `<VegaRenderer />`.
- Modify: `frontend/src/components/dashboard/lib/DashboardTileCanvas.jsx` — accept and forward to `<EditorCanvas />`.

Mirrors the existing `onDrillthrough` plumbing exactly (`EditorCanvas.jsx:23` + `:186`).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/dashboard/lib/__tests__/DashboardTileCanvas.markSelect.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import DashboardTileCanvas from '../DashboardTileCanvas';

vi.mock('../../../editor/EditorCanvas', () => ({
  default: (props: any) => (
    <div
      data-testid="editor-canvas"
      data-sheet-id={props.sheetId ?? ''}
      data-has-on-mark-select={String(typeof props.onMarkSelect === 'function')}
    />
  ),
}));

describe('DashboardTileCanvas onMarkSelect plumbing', () => {
  it('forwards sheetId + onMarkSelect to EditorCanvas', () => {
    const fn = vi.fn();
    const { getByTestId } = render(
      <DashboardTileCanvas
        tile={{ id: 't1', chart_spec: { type: 'cartesian', encoding: {} }, columns: [], rows: [] }}
        sheetId="sheet-a"
        onMarkSelect={fn}
      />,
    );
    const ec = getByTestId('editor-canvas');
    expect(ec.getAttribute('data-sheet-id')).toBe('sheet-a');
    expect(ec.getAttribute('data-has-on-mark-select')).toBe('true');
  });

  it('does not pass sheetId when omitted (legacy callers)', () => {
    const { getByTestId } = render(
      <DashboardTileCanvas
        tile={{ id: 't1', chart_spec: { type: 'cartesian', encoding: {} }, columns: [], rows: [] }}
      />,
    );
    expect(getByTestId('editor-canvas').getAttribute('data-sheet-id')).toBe('');
    expect(getByTestId('editor-canvas').getAttribute('data-has-on-mark-select')).toBe('false');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test -- DashboardTileCanvas.markSelect.test.tsx`
Expected: FAIL — props not forwarded.

- [ ] **Step 3: Implement plumbing**

In `frontend/src/components/dashboard/lib/DashboardTileCanvas.jsx`:

```jsx
// Update component signature (~line 58):
export default function DashboardTileCanvas({
  tile,
  height = "100%",
  showTitleBar = true,
  onTileClick,
  resultSetOverride,
  onDrillthrough,
  onTileUpdate,
  onInsightRefresh,
  sheetId,         // Plan 6d
  onMarkSelect,    // Plan 6d
}) {
```

Find the `<EditorCanvas ... />` element below and add the two props:

```jsx
      <EditorCanvas
        spec={spec}
        resultSet={effectiveResultSet}
        onDrillthrough={onDrillthrough}
        sheetId={sheetId}
        onMarkSelect={onMarkSelect}
        ...existing props...
      />
```

In `frontend/src/components/editor/EditorCanvas.jsx`, line 23, extend the destructure and the JSX:

```jsx
export default function EditorCanvas({
  spec,
  resultSet,
  onSpecChange,
  onDrillthrough,
  onDeselect,
  mode,
  sheetId,         // Plan 6d
  onMarkSelect,    // Plan 6d
}) {
```

At the `<VegaRenderer />` JSX (~line 179), add:

```jsx
          <VegaRenderer
            ...existing props...
            onDrillthrough={onDrillthrough}
            sheetId={sheetId}
            onMarkSelect={onMarkSelect}
          />
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test -- DashboardTileCanvas.markSelect.test.tsx`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/editor/EditorCanvas.jsx \
        frontend/src/components/dashboard/lib/DashboardTileCanvas.jsx \
        frontend/src/components/dashboard/lib/__tests__/DashboardTileCanvas.markSelect.test.tsx
git commit -m "feat(analyst-pro): forward onMarkSelect + sheetId through tile canvas (Plan 6d T5)"
```

---

## Task 6: AnalystProWorksheetTile injects highlight + wires `onMarkSelect`

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`
- Test: `frontend/src/components/dashboard/freeform/__tests__/AnalystProWorksheetTile.highlight.test.tsx` (create)

Three additions:
1. Read `analystProSheetHighlights[sheetId]` from store.
2. After the existing autosize injection, run the spec through `applyHighlightToSpec` so opacity + stroke conditions appear.
3. Pass `onMarkSelect` callback that (a) updates own slice via `mergeMarkIntoHighlight` + `setSheetHighlightAnalystPro` / `clearSheetHighlightAnalystPro`, and (b) publishes `MarkEvent` to `markEventBus` with `trigger: 'select'`. Empty-fields call publishes `markData: {}` so `useActionRuntime`'s existing highlight-clear path triggers on cascade targets (executor.ts:42 → `resolveFilters` returns empty → `clearSheetHighlightAnalystPro` runs).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/dashboard/freeform/__tests__/AnalystProWorksheetTile.highlight.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useStore } from '../../../../store';
import * as bus from '../lib/markEventBus';
import AnalystProWorksheetTile from '../AnalystProWorksheetTile';

vi.mock('../../lib/DashboardTileCanvas', () => ({
  default: (props: any) => (
    <div
      data-testid="tile-canvas"
      data-spec-encoding={JSON.stringify(props.tile?.chart_spec?.encoding ?? {})}
      data-sheet-id={props.sheetId ?? ''}
      onClick={(e: any) => {
        // Bridge for the test: simulate a mark-select call from the renderer.
        props.onMarkSelect?.(props.sheetId, e.detail?.fields ?? null, {
          shiftKey: !!e.detail?.shiftKey,
        });
      }}
    />
  ),
}));

const baseTile = {
  id: 'tile-1',
  sql: 'select 1',
  chart_spec: { type: 'cartesian', encoding: { x: { field: 'region' }, y: { field: 'sales' } } },
};

beforeEach(() => {
  useStore.setState({ analystProSheetHighlights: {}, analystProDashboard: { actions: [], parameters: [] } });
  bus._resetForTests();
});

function dispatchMarkSelect(el: HTMLElement, fields: Record<string, unknown> | null, shiftKey = false) {
  const ev = new CustomEvent('click', { detail: { fields, shiftKey } });
  el.dispatchEvent(ev);
}

describe('AnalystProWorksheetTile highlight integration', () => {
  it('passes sheetId + onMarkSelect to tile canvas', () => {
    const { getByTestId } = render(
      <AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />,
    );
    expect(getByTestId('tile-canvas').getAttribute('data-sheet-id')).toBe('sheet-a');
  });

  it('injects opacity encoding when slice has values', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    const { getByTestId } = render(
      <AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />,
    );
    const enc = JSON.parse(getByTestId('tile-canvas').getAttribute('data-spec-encoding')!);
    expect(enc.opacity).toBeTruthy();
    expect(enc.opacity.value).toBe(0.15);
    expect(enc.opacity.condition.test).toContain("datum['region']");
  });

  it('does NOT inject opacity when slice is empty', () => {
    const { getByTestId } = render(
      <AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />,
    );
    const enc = JSON.parse(getByTestId('tile-canvas').getAttribute('data-spec-encoding')!);
    expect(enc.opacity).toBeUndefined();
  });

  it('mark click writes own slice + publishes MarkEvent', () => {
    const events: any[] = [];
    bus.subscribe((e) => events.push(e));
    const { getByTestId } = render(
      <AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />,
    );
    dispatchMarkSelect(getByTestId('tile-canvas'), { region: 'East' });
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({ region: 'East' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sourceSheetId: 'sheet-a',
      trigger: 'select',
      markData: { region: 'East' },
    });
  });

  it('shift+click on existing selection appends to array', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    const { getByTestId } = render(
      <AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />,
    );
    dispatchMarkSelect(getByTestId('tile-canvas'), { region: 'West' }, true);
    expect(useStore.getState().analystProSheetHighlights['sheet-a']).toEqual({
      region: ['East', 'West'],
    });
  });

  it('empty-area click clears own slice + publishes empty-fields MarkEvent', () => {
    useStore.getState().setSheetHighlightAnalystPro('sheet-a', { region: 'East' });
    const events: any[] = [];
    bus.subscribe((e) => events.push(e));
    const { getByTestId } = render(
      <AnalystProWorksheetTile tile={baseTile} sheetId="sheet-a" />,
    );
    dispatchMarkSelect(getByTestId('tile-canvas'), null);
    expect('sheet-a' in useStore.getState().analystProSheetHighlights).toBe(false);
    expect(events[0]).toMatchObject({
      sourceSheetId: 'sheet-a',
      trigger: 'select',
      markData: {},
    });
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test -- AnalystProWorksheetTile.highlight.test.tsx`
Expected: FAIL — no highlight injection, no onMarkSelect wiring.

- [ ] **Step 3: Modify `AnalystProWorksheetTile.jsx`**

Add imports at the top:

```jsx
import { applyHighlightToSpec, mergeMarkIntoHighlight } from './lib/highlightFilter';
import { publish as publishMarkEvent } from './lib/markEventBus';
```

Inside the component, add the slice subscription + setters near the existing `useStore` block:

```jsx
  const highlight = useStore((s) => s.analystProSheetHighlights[sheetId] || null);
  const setSheetHighlight = useStore((s) => s.setSheetHighlightAnalystPro);
  const clearSheetHighlight = useStore((s) => s.clearSheetHighlightAnalystPro);
```

Replace the existing `tileWithAutosize` useMemo with a single memoized step that applies BOTH autosize and highlight:

```jsx
  const decoratedTile = useMemo(() => {
    if (!tile) return tile;
    const baseSpec = tile.chart_spec || tile.chartSpec;
    if (!baseSpec) return tile;
    let nextSpec = baseSpec;
    if (autosize) nextSpec = { ...nextSpec, autosize };
    nextSpec = applyHighlightToSpec(nextSpec, highlight);
    if (nextSpec === baseSpec) return tile;  // identity preserved → no churn
    const next = { ...tile };
    if (tile.chart_spec) next.chart_spec = nextSpec;
    if (tile.chartSpec && !tile.chart_spec) next.chartSpec = nextSpec;
    return next;
  }, [tile, autosize, highlight]);
```

Add the `onMarkSelect` callback above the JSX return:

```jsx
  const handleMarkSelect = useCallback((selSheetId, fields, opts) => {
    if (!selSheetId) return;
    if (fields === null) {
      clearSheetHighlight(selSheetId);
      publishMarkEvent({
        sourceSheetId: selSheetId,
        trigger: 'select',
        markData: {},
        timestamp: Date.now(),
      });
      return;
    }
    const next = mergeMarkIntoHighlight(highlight, fields, !!opts?.shiftKey);
    if (next === null) clearSheetHighlight(selSheetId);
    else setSheetHighlight(selSheetId, next);
    publishMarkEvent({
      sourceSheetId: selSheetId,
      trigger: 'select',
      markData: fields,
      timestamp: Date.now(),
    });
  }, [highlight, setSheetHighlight, clearSheetHighlight]);
```

Add `useCallback` to the React import at the top: `import { useEffect, useMemo, useRef, useState, useCallback } from 'react';`

Update the JSX to swap `tileWithAutosize` for `decoratedTile` and pass new props:

```jsx
      <DashboardTileCanvas
        tile={decoratedTile}
        onTileClick={onTileClick}
        resultSetOverride={override}
        sheetId={sheetId}
        onMarkSelect={handleMarkSelect}
      />
```

Delete the now-unused `fitModeToAutosize`-derived `tileWithAutosize` block (it's been merged into `decoratedTile`).

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test -- AnalystProWorksheetTile.highlight.test.tsx`
Expected: PASS — all 6 tests green. Also re-run any pre-existing AnalystProWorksheetTile tests to confirm no regression: `npm run test -- AnalystProWorksheetTile`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx \
        frontend/src/components/dashboard/freeform/__tests__/AnalystProWorksheetTile.highlight.test.tsx
git commit -m "feat(analyst-pro): worksheet tile injects highlight + publishes mark events (Plan 6d T6)"
```

---

## Task 7: Verify cascade — useActionRuntime already targets highlight slice (no code change, integration test)

**Files:**
- Test: `frontend/src/components/dashboard/freeform/__tests__/MarkSelectionRuntime.integration.test.tsx` (create)

`useActionRuntime.js:24-33` already handles `case 'highlight'` and writes through `setSheetHighlightAnalystPro` / `clearSheetHighlightAnalystPro`, so no production code change is needed for the cascade. We add an integration test now to lock the contract: a highlight action with `sourceSheets:['a']`, `targetSheets:['b']` causes a mark click on Sheet A to update sheet B's highlight slice via the bus.

If the integration test reveals a gap (e.g. multi-mark cascade not aggregating arrays), extend `useActionRuntime.js`'s `case 'highlight'` to merge with `mergeMarkIntoHighlight`. Otherwise leave the file untouched.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/dashboard/freeform/__tests__/MarkSelectionRuntime.integration.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import { publish, _resetForTests } from '../lib/markEventBus';
import { useActionRuntime } from '../hooks/useActionRuntime';

beforeEach(() => {
  _resetForTests();
  useStore.setState({
    analystProSheetHighlights: {},
    analystProSheetFilters: {},
    analystProActionCascadeToken: 0,
    analystProActiveCascadeTargets: {},
    analystProDashboard: {
      sets: [],
      parameters: [],
      actions: [
        {
          id: 'h1',
          name: 'Highlight by region',
          kind: 'highlight',
          enabled: true,
          trigger: 'select',
          sourceSheets: ['sheet-a'],
          targetSheets: ['sheet-b'],
          fieldMapping: [{ source: 'region', target: 'region' }],
        },
      ],
    },
  });
});

describe('Plan 6d cascade: mark select → highlight target sheet', () => {
  it('publishing a select MarkEvent on source sheet writes target highlight slice', () => {
    renderHook(() => useActionRuntime());
    act(() => {
      publish({
        sourceSheetId: 'sheet-a',
        trigger: 'select',
        markData: { region: 'East' },
        timestamp: Date.now(),
      });
    });
    expect(useStore.getState().analystProSheetHighlights['sheet-b']).toEqual({
      region: 'East',
    });
  });

  it('publishing empty markData clears target highlight slice', () => {
    renderHook(() => useActionRuntime());
    useStore.getState().setSheetHighlightAnalystPro('sheet-b', { region: 'East' });
    act(() => {
      publish({
        sourceSheetId: 'sheet-a',
        trigger: 'select',
        markData: {},
        timestamp: Date.now(),
      });
    });
    expect('sheet-b' in useStore.getState().analystProSheetHighlights).toBe(false);
  });

  it('non-matching source sheet does NOT touch target', () => {
    renderHook(() => useActionRuntime());
    act(() => {
      publish({
        sourceSheetId: 'sheet-z',
        trigger: 'select',
        markData: { region: 'East' },
        timestamp: Date.now(),
      });
    });
    expect(useStore.getState().analystProSheetHighlights).toEqual({});
  });
});
```

- [ ] **Step 2: Run test, verify behavior**

Run: `cd frontend && npm run test -- MarkSelectionRuntime.integration.test.tsx`
Expected: PASS for all 3 (existing runtime already correctly cascades). If FAIL, proceed to Step 3.

- [ ] **Step 3: Only if Step 2 failed — patch `useActionRuntime.js`**

If multi-value highlight aggregation needed in cascade, replace the highlight branch (line 24) with:

```js
    case 'highlight': {
      const fieldValues = op.fieldValues || {};
      if (Object.keys(fieldValues).length === 0) {
        store.clearSheetHighlightAnalystPro(op.sheetId);
      } else {
        const prev = store.analystProSheetHighlights[op.sheetId] || null;
        // Cascade always REPLACES (single-source-of-truth). Multi-mark
        // aggregation happens at the source via mergeMarkIntoHighlight
        // before publish — by the time we reach the runtime, fieldValues
        // already carries arrays where appropriate.
        store.setSheetHighlightAnalystPro(op.sheetId, fieldValues);
      }
      store.markCascadeTargetStatus(op.sheetId, 'done', token);
      break;
    }
```

(Identical to current code; only land this change if the test forced it.)

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test -- MarkSelectionRuntime.integration.test.tsx`
Expected: PASS — all 3 green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/__tests__/MarkSelectionRuntime.integration.test.tsx
# Add useActionRuntime.js to the staged files only if Step 3 modified it.
git commit -m "test(analyst-pro): lock cascade highlight contract for select trigger (Plan 6d T7)"
```

---

## Task 8: Source-dim-absent re-query stub warning (per Build_Tableau §XI.5)

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useActionRuntime.js`
- Test: extend `MarkSelectionRuntime.integration.test.tsx`

Per Build_Tableau §XI.5: "If source dim not present in target grain, target re-queries to fetch the dim, then masks locally." That re-query path is deferred (per scheduled task brief — "stub warning for now"). Add a dev-only warning when a highlight cascade lands on a sheet whose tile result-set columns lack the highlight field, so we have a breadcrumb for Plan 6e/7a.

Detection lives in `AnalystProWorksheetTile.jsx` (it already owns the result-set override and can compare slice fields against `override.columns` or the original tile's columns). One-shot warning per (sheetId, field) pair to avoid log spam.

- [ ] **Step 1: Write the failing test (append to `AnalystProWorksheetTile.highlight.test.tsx`)**

```tsx
it('logs a one-shot dev warning when highlight field absent from tile columns', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  useStore.getState().setSheetHighlightAnalystPro('sheet-a', { unknown_col: 'X' });
  render(
    <AnalystProWorksheetTile
      tile={{ ...baseTile, chart_spec: { type: 'cartesian', encoding: { x: { field: 'region' } }, columns: ['region', 'sales'] } }}
      sheetId="sheet-a"
    />,
  );
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining('[Plan 6d] highlight field "unknown_col" not in tile columns for sheet "sheet-a"'),
  );
  warnSpy.mockRestore();
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && npm run test -- AnalystProWorksheetTile.highlight.test.tsx`
Expected: FAIL — warning not emitted.

- [ ] **Step 3: Implement warning in `AnalystProWorksheetTile.jsx`**

Add a ref-based dedupe and an effect that compares highlight fields to known columns:

```jsx
  const warnedKeysRef = useRef(new Set());
  useEffect(() => {
    if (!highlight || typeof highlight !== 'object') return;
    if (!import.meta.env?.DEV) return;
    const cols =
      (override?.columns && override.columns.length > 0 && override.columns) ||
      tile?.chart_spec?.columns ||
      tile?.columns ||
      [];
    if (!Array.isArray(cols) || cols.length === 0) return;
    const colsLower = new Set(cols.map((c) => String(c).toLowerCase()));
    for (const field of Object.keys(highlight)) {
      const key = `${sheetId}::${field}`;
      if (warnedKeysRef.current.has(key)) continue;
      if (!colsLower.has(field.toLowerCase())) {
        warnedKeysRef.current.add(key);
        console.warn(
          `[Plan 6d] highlight field "${field}" not in tile columns for sheet "${sheetId}" — ` +
          `re-query path not yet implemented (deferred to Plan 6e/7a). Mask shows nothing.`,
        );
      }
    }
  }, [highlight, override, tile, sheetId]);
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd frontend && npm run test -- AnalystProWorksheetTile.highlight.test.tsx`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx \
        frontend/src/components/dashboard/freeform/__tests__/AnalystProWorksheetTile.highlight.test.tsx
git commit -m "feat(analyst-pro): dev warning when highlight field missing from tile cols (Plan 6d T8)"
```

---

## Task 9: Smoke verification + roadmap status flip

**Files:**
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md`

- [ ] **Step 1: Run the full freeform + chart-ir test slice**

Run from `frontend/`:
```bash
npm run test -- highlightFilter
npm run test -- VegaRenderer.markSelect
npm run test -- DashboardTileCanvas.markSelect
npm run test -- AnalystProWorksheetTile.highlight
npm run test -- MarkSelectionRuntime.integration
npm run test -- ActionRuntime.integration  # regression — existing
npm run test -- store.analystProHighlights
```
Expected: ALL PASS. Pre-existing chart-ir failures (per CLAUDE.md "Known Test Debt") are out of scope — confirm count unchanged with `npm run test:chart-ir 2>&1 | tail -20` before/after this plan.

- [ ] **Step 2: Manual end-to-end smoke (browser, dev server)**

Backend:
```bash
cd "QueryCopilot V1/backend"
uvicorn main:app --reload --port 8002
```

Frontend:
```bash
cd "QueryCopilot V1/frontend"
npm run dev
```

Open http://localhost:5173 → demo login → Analyst Pro dashboard with two worksheet tiles bound to the same dimension (e.g. region). Configure a highlight action sourceSheet=A, targetSheet=B via the Actions dialog (Plan 3 UI). Verify:

1. Click a bar on Sheet A → bar gains stroke ring, other A-bars dim, all B-bars matching dim out except the matching one.
2. Shift+click another bar on Sheet A → both retain ring, B mirrors with both highlighted.
3. Click empty canvas of Sheet A → all marks restore to opacity 1.0; B clears too.
4. Open DevTools → no console errors. Confirm no warning unless source-dim-absent (intentional).

Document any divergence inline as a follow-up TODO at the bottom of this plan and DO NOT proceed until rectified.

- [ ] **Step 3: Flip roadmap status**

In `docs/analyst_pro_tableau_parity_roadmap.md`, locate the Plan 6d header (line 456) and append `— ✅ Shipped 2026-04-17` to the line. Also update the matching status table at the top of the roadmap if Plan 6d is listed there (search the file for `6d`).

- [ ] **Step 4: Commit**

```bash
git add docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "chore(analyst-pro): Plan 6d smoke verification + roadmap status (Plan 6d T9)"
```

---

## Self-review checklist (already run during plan authoring)

- [x] **Spec coverage** — every roadmap deliverable mapped to a task: (1) Vega click handler → T4; (2) highlight overlay → T2/T6; (3) selection ring → T2 (stroke encoding); (4) clear on click-outside → T4 + T6; (5) Shift multi-select → T2 (`mergeMarkIntoHighlight`) + T6; (6) `useActionRuntime` highlight cascade → T7. Bonus: (7) source-dim-absent stub → T8.
- [x] **No placeholders** — every code block compiles or fails the listed test deterministically; no "TBD" / "similar to" references.
- [x] **Type consistency** — `compileHighlightFilter`, `applyHighlightToSpec`, `mergeMarkIntoHighlight`, `HighlightSlice`, `onMarkSelect(sheetId, fields, opts)` signatures used identically in every task that references them.
- [x] **Conventions preserved** — `markEventBus` pub/sub contract intact (no new event types, no listener renames). Vega signals/conditions used at compile time over JS re-render. TDD per task. Per-task commits with `(Plan 6d TN)` suffix matching the established Analyst Pro convention.

---

## Out-of-scope (deferred to later plans)

- Re-query path when source dim not in target grain (Build_Tableau §XI.5 second clause) — Plan 6e or Plan 7a will implement; T8 only logs a warning.
- Hover trigger for highlight (`ActivationMethod.Hover` per §XI.2) — current scope is `Select` only. Hover support is a future addendum to this plan.
- `is_generative_ai_web_authoring` flag passthrough on AI-authored mark events (Build_Tableau §I.5) — out of scope until NL authoring lane lands (Plans 16a–16c).
- Tooltip-driven Keep Only / Exclude / View Data — covered by Plan 6e.

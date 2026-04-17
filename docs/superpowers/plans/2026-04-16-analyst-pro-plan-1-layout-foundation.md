# Analyst Pro — Plan 1: Layout Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Analyst Pro archetype shell with a read-only freeform zone-tree renderer. Users can select Analyst Pro in the mode toggle; legacy dashboards render through the new layout engine; no drag/resize yet (comes in Plan 2).

**Architecture:** New `freeform/` subtree under `components/dashboard/` with pure zone-tree types + ops, a recursive `ZoneRenderer` for tiled containers, and a portal-based `FloatingLayer` for absolutely-positioned objects. Backend adds legacy→freeform migration + a `/resolve-layout` endpoint that pre-computes pixel coords server-side for fast first paint. Feature flag `FEATURE_ANALYST_PRO` gates the new path.

**Tech Stack:** React 19 + TypeScript (chart-ir subset), Zustand, Framer Motion, Vitest 2.x, pytest (backend), FastAPI, existing `ARCHETYPE_THEMES` token system.

**Spec:** `docs/superpowers/specs/2026-04-16-analyst-pro-tableau-parity-design.md`

---

## File Structure

**Frontend — new:**
- `frontend/src/components/dashboard/freeform/lib/types.ts` — Zone / Dashboard / Size types
- `frontend/src/components/dashboard/freeform/lib/zoneTree.ts` — pure tree ops (traverse, find, normalize)
- `frontend/src/components/dashboard/freeform/lib/layoutResolver.ts` — tree → pixel coords
- `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` — canvas container
- `frontend/src/components/dashboard/freeform/ZoneRenderer.jsx` — recursive tiled renderer
- `frontend/src/components/dashboard/freeform/FloatingLayer.jsx` — absolute-positioned portal
- `frontend/src/components/dashboard/freeform/SizeToggleDropdown.jsx` — canvas size picker
- `frontend/src/components/dashboard/freeform/hooks/useZoneTree.js` — Zustand-backed tree state
- `frontend/src/components/dashboard/freeform/__tests__/zoneTree.test.ts`
- `frontend/src/components/dashboard/freeform/__tests__/layoutResolver.test.ts`
- `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx`
- `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — archetype shell

**Frontend — modified:**
- `frontend/src/components/dashboard/tokens.js` — add `analyst-pro` to `ARCHETYPE_THEMES`
- `frontend/src/components/dashboard/DashboardShell.jsx` — route `analyst-pro` mode → `AnalystProLayout`
- `frontend/src/store.js` — add `analystPro` Zustand slice (dashboard + viewport only, no editing yet)
- `frontend/src/index.css` — add `--archetype-analyst-pro-*` CSS vars (light + dark scopes)

**Backend — new:**
- `backend/tests/test_dashboard_migration_freeform.py` — legacy → freeform migration tests
- `backend/tests/test_resolve_layout_endpoint.py` — endpoint tests

**Backend — modified:**
- `backend/dashboard_migration.py` — add `legacy_to_freeform_schema(legacy_dashboard)`
- `backend/routers/dashboard_routes.py` — add `POST /api/v1/dashboards/{id}/resolve-layout`
- `backend/config.py` — add `FEATURE_ANALYST_PRO` flag (default False)

---

## Task 1: Zone + Dashboard types (TypeScript)

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// frontend/src/components/dashboard/freeform/lib/types.ts

/** Proportional unit — 0 to 100000 where 100000 = 100% of parent container. */
export type Proportion = number;

export type Padding = { top: number; right: number; bottom: number; left: number };
export type BorderStyle = { width: number; color: string; style: 'solid' | 'dashed' | 'dotted' };
export type BackgroundStyle = { color?: string; image?: string; fit?: 'cover' | 'contain' | 'fill' };

export type LeafType =
  | 'worksheet'
  | 'text'
  | 'filter'
  | 'legend'
  | 'parameter'
  | 'image'
  | 'webpage'
  | 'blank'
  | 'navigation'
  | 'extension';

export type ContainerType = 'container-horz' | 'container-vert';

export type VisibilityRule = {
  mode: 'field' | 'parameter';
  source: string;
};

export type BaseZone = {
  id: string;
  w: Proportion;
  h: Proportion;
  padding?: { outer: Padding; inner: Padding };
  border?: BorderStyle;
  background?: BackgroundStyle;
  visibilityRule?: VisibilityRule;
};

export type LeafZone = BaseZone & {
  type: LeafType;
  worksheetRef?: string;
  text?: { markdown: string };
  filterRef?: { field: string; widget: 'dropdown' | 'range' | 'multi' };
  legendRef?: { worksheetRef: string; encoding: 'color' | 'size' | 'shape' };
  parameterRef?: string;
  imageSrc?: string;
  webpageUrl?: string;
};

export type ContainerZone = BaseZone & {
  type: ContainerType;
  children: Zone[];
};

export type Zone = LeafZone | ContainerZone;

export type FloatingZone = LeafZone & {
  floating: true;
  /** pixels from dashboard origin (not proportional) */
  x: number;
  y: number;
  pxW: number;
  pxH: number;
  zIndex: number;
  locked?: boolean;
};

export type SizeMode =
  | { mode: 'automatic' }
  | { mode: 'range'; minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }
  | { mode: 'fixed'; width: number; height: number; preset?: FixedPreset };

export type FixedPreset =
  | 'desktop'          // 1366x768
  | 'laptop'           // 1440x900
  | 'ipad-landscape'   // 1024x768
  | 'ipad-portrait'    // 768x1024
  | 'phone'            // 375x667
  | 'custom';

export const FIXED_PRESETS: Record<Exclude<FixedPreset, 'custom'>, { width: number; height: number }> = {
  desktop: { width: 1366, height: 768 },
  laptop: { width: 1440, height: 900 },
  'ipad-landscape': { width: 1024, height: 768 },
  'ipad-portrait': { width: 768, height: 1024 },
  phone: { width: 375, height: 667 },
};

export type Dashboard = {
  schemaVersion: 'askdb/dashboard/v1';
  id: string;
  name: string;
  archetype: 'analyst-pro' | string;
  size: SizeMode;
  tiledRoot: ContainerZone;
  floatingLayer: FloatingZone[];
  worksheets: Array<{ id: string; chartSpec: unknown; sql?: string; dataRef?: string }>;
  parameters: unknown[];
  sets: unknown[];
  actions: unknown[];
  globalStyle?: { font?: string; background?: string };
};

/** Zone with resolved pixel dimensions (output of layoutResolver). */
export type ResolvedZone = {
  zone: Zone | FloatingZone;
  x: number;      // pixels from dashboard origin
  y: number;
  width: number;  // pixels
  height: number;
  depth: number;  // tree depth, 0 = root
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "QueryCopilot V1/frontend" && npx tsc --noEmit -p . 2>&1 | grep -i "freeform/lib/types" || echo "OK"`
Expected: `OK` (no type errors in this file).

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/types.ts
git commit -m "feat(analyst-pro): zone + dashboard types"
```

---

## Task 2: Pure zoneTree ops — traverse + findById

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/zoneTree.ts`
- Test: `frontend/src/components/dashboard/freeform/__tests__/zoneTree.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/components/dashboard/freeform/__tests__/zoneTree.test.ts
import { describe, it, expect } from 'vitest';
import { findZoneById, traverseZones, isContainer } from '../lib/zoneTree';
import type { ContainerZone } from '../lib/types';

const sample: ContainerZone = {
  id: 'root',
  type: 'container-vert',
  w: 100000,
  h: 100000,
  children: [
    {
      id: 'r1',
      type: 'container-horz',
      w: 100000,
      h: 50000,
      children: [
        { id: 'kpi1', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'ws1' },
        { id: 'kpi2', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'ws2' },
      ],
    },
    { id: 'chart', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws3' },
  ],
};

describe('findZoneById', () => {
  it('finds the root', () => {
    expect(findZoneById(sample, 'root')?.id).toBe('root');
  });
  it('finds a nested leaf', () => {
    expect(findZoneById(sample, 'kpi2')?.id).toBe('kpi2');
  });
  it('returns null for missing id', () => {
    expect(findZoneById(sample, 'nonexistent')).toBeNull();
  });
});

describe('traverseZones', () => {
  it('visits every node depth-first', () => {
    const ids: string[] = [];
    traverseZones(sample, (z) => ids.push(z.id));
    expect(ids).toEqual(['root', 'r1', 'kpi1', 'kpi2', 'chart']);
  });
});

describe('isContainer', () => {
  it('returns true for containers', () => {
    expect(isContainer(sample)).toBe(true);
  });
  it('returns false for leaves', () => {
    expect(isContainer(sample.children[1])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/zoneTree.test.ts`
Expected: FAIL — "Cannot find module '../lib/zoneTree'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/components/dashboard/freeform/lib/zoneTree.ts
import type { Zone, ContainerZone, LeafZone } from './types';

export function isContainer(zone: Zone): zone is ContainerZone {
  return zone.type === 'container-horz' || zone.type === 'container-vert';
}

export function findZoneById(root: Zone, id: string): Zone | null {
  if (root.id === id) return root;
  if (isContainer(root)) {
    for (const child of root.children) {
      const found = findZoneById(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function traverseZones(
  root: Zone,
  visit: (zone: Zone, depth: number) => void,
  depth = 0,
): void {
  visit(root, depth);
  if (isContainer(root)) {
    for (const child of root.children) {
      traverseZones(child, visit, depth + 1);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/zoneTree.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/zoneTree.ts frontend/src/components/dashboard/freeform/__tests__/zoneTree.test.ts
git commit -m "feat(analyst-pro): zoneTree findById + traverse + isContainer"
```

---

## Task 3: Pure zoneTree ops — normalize proportions

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneTree.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/zoneTree.test.ts`

- [ ] **Step 1: Add failing test**

Append to `zoneTree.test.ts`:

```typescript
import { normalizeContainer } from '../lib/zoneTree';

describe('normalizeContainer', () => {
  it('normalizes horz children w values to sum 100000', () => {
    const c: ContainerZone = {
      id: 'c',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 30000, h: 100000 },
        { id: 'b', type: 'blank', w: 30000, h: 100000 },
        { id: 'c', type: 'blank', w: 40000, h: 100000 },
      ],
    };
    const result = normalizeContainer(c);
    const sum = result.children.reduce((s, ch) => s + ch.w, 0);
    expect(sum).toBe(100000);
  });

  it('normalizes off-balance values proportionally', () => {
    const c: ContainerZone = {
      id: 'c',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 20000, h: 100000 },
        { id: 'b', type: 'blank', w: 30000, h: 100000 },
      ],
    };
    const result = normalizeContainer(c);
    // 20000 : 30000 ratio preserved, scaled to sum 100000 → 40000 : 60000
    expect(result.children[0].w).toBe(40000);
    expect(result.children[1].w).toBe(60000);
  });

  it('vert container normalizes h, leaves w untouched', () => {
    const c: ContainerZone = {
      id: 'c',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 100000, h: 25000 },
        { id: 'b', type: 'blank', w: 100000, h: 25000 },
      ],
    };
    const result = normalizeContainer(c);
    const sumH = result.children.reduce((s, ch) => s + ch.h, 0);
    expect(sumH).toBe(100000);
  });

  it('returns zero-sum container unchanged (edge case)', () => {
    const c: ContainerZone = {
      id: 'c',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [],
    };
    expect(normalizeContainer(c)).toEqual(c);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/zoneTree.test.ts`
Expected: 4 failures on `normalizeContainer` tests — "not a function".

- [ ] **Step 3: Implement**

Append to `zoneTree.ts`:

```typescript
/**
 * Normalize a container's children so their split-axis values sum to 100000.
 * Horz → normalize `w`. Vert → normalize `h`.
 * Preserves relative proportions.
 */
export function normalizeContainer(container: ContainerZone): ContainerZone {
  if (container.children.length === 0) return container;
  const axis: 'w' | 'h' = container.type === 'container-horz' ? 'w' : 'h';
  const sum = container.children.reduce((s, c) => s + c[axis], 0);
  if (sum === 0) return container;
  const factor = 100000 / sum;
  const children = container.children.map((child) => ({
    ...child,
    [axis]: Math.round(child[axis] * factor),
  })) as Zone[];
  // Fix rounding drift: adjust last child so sum is exactly 100000.
  const roundedSum = children.reduce((s, c) => s + c[axis], 0);
  const drift = 100000 - roundedSum;
  if (drift !== 0 && children.length > 0) {
    const last = children[children.length - 1];
    (last as LeafZone)[axis] = (last as LeafZone)[axis] + drift;
  }
  return { ...container, children };
}
```

- [ ] **Step 4: Run tests**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/zoneTree.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/zoneTree.ts frontend/src/components/dashboard/freeform/__tests__/zoneTree.test.ts
git commit -m "feat(analyst-pro): normalizeContainer for proportional layout"
```

---

## Task 4: layoutResolver — tree → pixel coords

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/layoutResolver.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/layoutResolver.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/components/dashboard/freeform/__tests__/layoutResolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveLayout } from '../lib/layoutResolver';
import type { ContainerZone, FloatingZone } from '../lib/types';

describe('resolveLayout', () => {
  it('resolves a flat horz container split 50/50 in a 1000x500 canvas', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 50000, h: 100000 },
        { id: 'b', type: 'blank', w: 50000, h: 100000 },
      ],
    };
    const result = resolveLayout(root, [], 1000, 500);
    expect(result).toHaveLength(3); // root + 2 children
    const rootResolved = result.find((r) => r.zone.id === 'root');
    expect(rootResolved).toMatchObject({ x: 0, y: 0, width: 1000, height: 500 });
    const a = result.find((r) => r.zone.id === 'a');
    expect(a).toMatchObject({ x: 0, y: 0, width: 500, height: 500 });
    const b = result.find((r) => r.zone.id === 'b');
    expect(b).toMatchObject({ x: 500, y: 0, width: 500, height: 500 });
  });

  it('resolves vert container splitting height by children h', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'top', type: 'blank', w: 100000, h: 25000 },
        { id: 'bot', type: 'blank', w: 100000, h: 75000 },
      ],
    };
    const result = resolveLayout(root, [], 800, 600);
    const top = result.find((r) => r.zone.id === 'top');
    const bot = result.find((r) => r.zone.id === 'bot');
    expect(top).toMatchObject({ x: 0, y: 0, width: 800, height: 150 });
    expect(bot).toMatchObject({ x: 0, y: 150, width: 800, height: 450 });
  });

  it('resolves nested containers recursively', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'kpi-row',
          type: 'container-horz',
          w: 100000,
          h: 25000,
          children: [
            { id: 'kpi1', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'w1' },
            { id: 'kpi2', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'w2' },
          ],
        },
      ],
    };
    const result = resolveLayout(root, [], 1000, 800);
    const kpi1 = result.find((r) => r.zone.id === 'kpi1');
    expect(kpi1).toMatchObject({ x: 0, y: 0, width: 500, height: 200 });
    const kpi2 = result.find((r) => r.zone.id === 'kpi2');
    expect(kpi2).toMatchObject({ x: 500, y: 0, width: 500, height: 200 });
  });

  it('passes through floating zones as-is (pixel coords)', () => {
    const root: ContainerZone = { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] };
    const floats: FloatingZone[] = [
      { id: 'f1', type: 'legend', floating: true, x: 100, y: 50, pxW: 200, pxH: 300, zIndex: 10, w: 0, h: 0 },
    ];
    const result = resolveLayout(root, floats, 1000, 800);
    const f = result.find((r) => r.zone.id === 'f1');
    expect(f).toMatchObject({ x: 100, y: 50, width: 200, height: 300 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/layoutResolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// frontend/src/components/dashboard/freeform/lib/layoutResolver.ts
import type { Zone, ContainerZone, FloatingZone, ResolvedZone } from './types';
import { isContainer } from './zoneTree';

/**
 * Recursively resolve a zone tree + floating layer to absolute pixel coordinates.
 *
 * Algorithm (matches Tableau's model):
 *   - Container-horz splits availW among children by their `w` (normalized to sum 100000);
 *     each child gets full availH as height budget. Child's own `h` ignored inside horz.
 *   - Container-vert: mirror — splits availH by `h`; each child gets full availW.
 *   - Floating zones use explicit pixel coords (x, y, pxW, pxH), ignore the tree.
 *
 * Output is a flat array of ResolvedZone, one per zone in the tree + one per floating zone.
 */
export function resolveLayout(
  root: ContainerZone,
  floatingLayer: FloatingZone[],
  canvasWidth: number,
  canvasHeight: number,
): ResolvedZone[] {
  const result: ResolvedZone[] = [];
  resolveTiledRecursive(root, 0, 0, canvasWidth, canvasHeight, 0, result);
  for (const f of floatingLayer) {
    result.push({
      zone: f,
      x: f.x,
      y: f.y,
      width: f.pxW,
      height: f.pxH,
      depth: -1, // floating layer is not in the tree
    });
  }
  return result;
}

function resolveTiledRecursive(
  zone: Zone,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: number,
  out: ResolvedZone[],
): void {
  out.push({ zone, x, y, width, height, depth });
  if (!isContainer(zone) || zone.children.length === 0) return;

  if (zone.type === 'container-horz') {
    // Normalize w values for split calc without mutating.
    const sum = zone.children.reduce((s, c) => s + c.w, 0) || 1;
    let cursor = x;
    for (const child of zone.children) {
      const childWidth = Math.round((child.w / sum) * width);
      resolveTiledRecursive(child, cursor, y, childWidth, height, depth + 1, out);
      cursor += childWidth;
    }
  } else {
    // container-vert
    const sum = zone.children.reduce((s, c) => s + c.h, 0) || 1;
    let cursor = y;
    for (const child of zone.children) {
      const childHeight = Math.round((child.h / sum) * height);
      resolveTiledRecursive(child, x, cursor, width, childHeight, depth + 1, out);
      cursor += childHeight;
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/layoutResolver.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/layoutResolver.ts frontend/src/components/dashboard/freeform/__tests__/layoutResolver.test.ts
git commit -m "feat(analyst-pro): layoutResolver — zone tree + floating layer → pixel coords"
```

---

## Task 5: SizeToggleDropdown component

**Files:**
- Create: `frontend/src/components/dashboard/freeform/SizeToggleDropdown.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/dashboard/freeform/SizeToggleDropdown.jsx
import { useState } from 'react';
import { TOKENS } from '../tokens';

const PRESETS = [
  { id: 'automatic', label: 'Automatic', desc: 'Fills viewport' },
  { id: 'desktop', label: 'Desktop', desc: '1366 × 768' },
  { id: 'laptop', label: 'Laptop', desc: '1440 × 900' },
  { id: 'ipad-landscape', label: 'iPad Landscape', desc: '1024 × 768' },
  { id: 'ipad-portrait', label: 'iPad Portrait', desc: '768 × 1024' },
  { id: 'phone', label: 'Phone', desc: '375 × 667' },
  { id: 'custom', label: 'Custom…', desc: 'Set width × height' },
];

export default function SizeToggleDropdown({ currentSize, onChange }) {
  const [open, setOpen] = useState(false);

  const activeLabel = getSizeLabel(currentSize);

  return (
    <div data-testid="size-toggle" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="premium-btn"
        style={{
          padding: '6px 14px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontFamily: TOKENS.fontDisplay,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>
        {activeLabel}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div
          data-testid="size-toggle-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 50,
            minWidth: 220,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 10,
            boxShadow: TOKENS.shadow.diffusion,
            padding: 6,
          }}
        >
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.id}
              data-testid={`size-preset-${p.id}`}
              onClick={() => {
                onChange(buildSize(p.id));
                setOpen(false);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 12,
                fontFamily: TOKENS.fontBody,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 600 }}>{p.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: TOKENS.fontMono }}>{p.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getSizeLabel(size) {
  if (!size) return 'Automatic';
  if (size.mode === 'automatic') return 'Automatic';
  if (size.mode === 'fixed' && size.preset) {
    const preset = PRESETS.find((p) => p.id === size.preset);
    return preset?.label || 'Custom';
  }
  if (size.mode === 'fixed') return `${size.width} × ${size.height}`;
  if (size.mode === 'range') return 'Range';
  return 'Automatic';
}

function buildSize(presetId) {
  if (presetId === 'automatic') return { mode: 'automatic' };
  if (presetId === 'custom') return { mode: 'fixed', width: 1200, height: 800, preset: 'custom' };
  const sizes = {
    desktop: { width: 1366, height: 768 },
    laptop: { width: 1440, height: 900 },
    'ipad-landscape': { width: 1024, height: 768 },
    'ipad-portrait': { width: 768, height: 1024 },
    phone: { width: 375, height: 667 },
  };
  return { mode: 'fixed', preset: presetId, ...sizes[presetId] };
}
```

- [ ] **Step 2: Sanity check — no test yet (covered by integration test in Task 9)**

Run: `cd "QueryCopilot V1/frontend" && npx eslint src/components/dashboard/freeform/SizeToggleDropdown.jsx`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/SizeToggleDropdown.jsx
git commit -m "feat(analyst-pro): SizeToggleDropdown with 7 preset options"
```

---

## Task 6: FloatingLayer component

**Files:**
- Create: `frontend/src/components/dashboard/freeform/FloatingLayer.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/dashboard/freeform/FloatingLayer.jsx
import { memo } from 'react';

/**
 * Renders the floating layer of a freeform dashboard.
 * Each floating zone is absolute-positioned inside a container that sits
 * above the tiled tree. The tiled tree renders underneath via ZoneRenderer.
 *
 * Floating zones are sorted by zIndex ascending so higher z paints last.
 */
function FloatingLayer({ zones, renderLeaf }) {
  if (!zones || zones.length === 0) return null;
  const sorted = [...zones].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return (
    <div
      data-testid="floating-layer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {sorted.map((zone) => (
        <div
          key={zone.id}
          data-testid={`floating-zone-${zone.id}`}
          data-zone-type={zone.type}
          style={{
            position: 'absolute',
            left: zone.x,
            top: zone.y,
            width: zone.pxW,
            height: zone.pxH,
            zIndex: zone.zIndex ?? 0,
            pointerEvents: 'auto',
          }}
        >
          {renderLeaf(zone)}
        </div>
      ))}
    </div>
  );
}

export default memo(FloatingLayer);
```

- [ ] **Step 2: Lint check**

Run: `cd "QueryCopilot V1/frontend" && npx eslint src/components/dashboard/freeform/FloatingLayer.jsx`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/FloatingLayer.jsx
git commit -m "feat(analyst-pro): FloatingLayer absolute-positioned renderer"
```

---

## Task 7: ZoneRenderer — recursive tiled tree

**Files:**
- Create: `frontend/src/components/dashboard/freeform/ZoneRenderer.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/dashboard/freeform/ZoneRenderer.jsx
import { memo } from 'react';
import { isContainer } from './lib/zoneTree';

/**
 * Recursively renders a tiled zone tree using pre-resolved pixel coordinates.
 *
 * - Uses a lookup map (id → ResolvedZone) for O(1) access during recursion.
 * - Containers render as positioned <div>s with their children nested.
 * - Leaves delegate to the consumer-provided `renderLeaf(zone, resolved)` function.
 *
 * This keeps the renderer generic — the consumer (FreeformCanvas) decides
 * how a 'worksheet' leaf becomes a ChartEditor mount, a 'text' leaf becomes
 * a TextTile, etc.
 */
function ZoneRenderer({ root, resolvedMap, renderLeaf }) {
  return renderNode(root, resolvedMap, renderLeaf);
}

function renderNode(zone, resolvedMap, renderLeaf) {
  const resolved = resolvedMap.get(zone.id);
  if (!resolved) return null;

  if (isContainer(zone)) {
    return (
      <div
        key={zone.id}
        data-testid={`tiled-container-${zone.id}`}
        data-zone-type={zone.type}
        style={{
          position: 'absolute',
          left: resolved.x,
          top: resolved.y,
          width: resolved.width,
          height: resolved.height,
        }}
      >
        {zone.children.map((child) => renderNode(child, resolvedMap, renderLeaf))}
      </div>
    );
  }

  return (
    <div
      key={zone.id}
      data-testid={`tiled-leaf-${zone.id}`}
      data-zone-type={zone.type}
      style={{
        position: 'absolute',
        left: resolved.x,
        top: resolved.y,
        width: resolved.width,
        height: resolved.height,
      }}
    >
      {renderLeaf(zone, resolved)}
    </div>
  );
}

export default memo(ZoneRenderer);
```

- [ ] **Step 2: Lint check**

Run: `cd "QueryCopilot V1/frontend" && npx eslint src/components/dashboard/freeform/ZoneRenderer.jsx`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/ZoneRenderer.jsx
git commit -m "feat(analyst-pro): ZoneRenderer recursive tiled renderer"
```

---

## Task 8: FreeformCanvas — orchestrator

**Files:**
- Create: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/dashboard/freeform/FreeformCanvas.jsx
import { useMemo, useRef, useState, useEffect } from 'react';
import { resolveLayout } from './lib/layoutResolver';
import ZoneRenderer from './ZoneRenderer';
import FloatingLayer from './FloatingLayer';
import { FIXED_PRESETS } from './lib/types';

/**
 * FreeformCanvas — the root authoring surface for Analyst Pro.
 *
 * Responsibilities in Plan 1 (read-only):
 *   1. Resolve canvas dimensions from `dashboard.size` + container bounds.
 *   2. Run the zone tree + floating layer through `resolveLayout`.
 *   3. Pass resolved coords to ZoneRenderer + FloatingLayer.
 *   4. Re-resolve on viewport resize (Automatic / Range modes).
 *
 * Plan 2 will extend this with drag/resize/select handlers.
 */
export default function FreeformCanvas({ dashboard, renderLeaf }) {
  const containerRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 800 });

  // Measure container on mount + on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canvasSize = useMemo(() => {
    return resolveCanvasSize(dashboard.size, viewportSize);
  }, [dashboard.size, viewportSize]);

  const resolved = useMemo(() => {
    return resolveLayout(
      dashboard.tiledRoot,
      dashboard.floatingLayer || [],
      canvasSize.width,
      canvasSize.height,
    );
  }, [dashboard.tiledRoot, dashboard.floatingLayer, canvasSize.width, canvasSize.height]);

  const resolvedMap = useMemo(() => {
    const m = new Map();
    for (const r of resolved) m.set(r.zone.id, r);
    return m;
  }, [resolved]);

  return (
    <div
      ref={containerRef}
      data-testid="freeform-canvas"
      data-archetype="analyst-pro"
      data-size-mode={dashboard.size?.mode ?? 'automatic'}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: 'var(--archetype-analyst-pro-bg, var(--bg-page))',
      }}
    >
      <div
        data-testid="freeform-sheet"
        style={{
          position: 'relative',
          width: canvasSize.width,
          height: canvasSize.height,
          margin: dashboard.size?.mode === 'automatic' ? 0 : '0 auto',
        }}
      >
        <ZoneRenderer
          root={dashboard.tiledRoot}
          resolvedMap={resolvedMap}
          renderLeaf={renderLeaf}
        />
        <FloatingLayer zones={dashboard.floatingLayer || []} renderLeaf={renderLeaf} />
      </div>
    </div>
  );
}

function resolveCanvasSize(size, viewport) {
  if (!size || size.mode === 'automatic') {
    return { width: viewport.width || 1200, height: viewport.height || 800 };
  }
  if (size.mode === 'fixed') {
    if (size.preset && size.preset !== 'custom') {
      const preset = FIXED_PRESETS[size.preset];
      return { width: preset?.width ?? 1200, height: preset?.height ?? 800 };
    }
    return { width: size.width ?? 1200, height: size.height ?? 800 };
  }
  if (size.mode === 'range') {
    const w = Math.min(Math.max(viewport.width, size.minWidth), size.maxWidth);
    const h = Math.min(Math.max(viewport.height, size.minHeight), size.maxHeight);
    return { width: w, height: h };
  }
  return { width: 1200, height: 800 };
}
```

- [ ] **Step 2: Lint check**

Run: `cd "QueryCopilot V1/frontend" && npx eslint src/components/dashboard/freeform/FreeformCanvas.jsx`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/FreeformCanvas.jsx
git commit -m "feat(analyst-pro): FreeformCanvas orchestrator with viewport-aware size resolution"
```

---

## Task 9: FreeformCanvas integration test

**Files:**
- Create: `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import FreeformCanvas from '../FreeformCanvas';
import type { Dashboard } from '../lib/types';

// jsdom lacks ResizeObserver; stub it.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
});

const sampleDashboard: Dashboard = {
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1',
  name: 'Test',
  archetype: 'analyst-pro',
  size: { mode: 'fixed', width: 1000, height: 500, preset: 'desktop' },
  tiledRoot: {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children: [
      {
        id: 'kpi-row',
        type: 'container-horz',
        w: 100000,
        h: 50000,
        children: [
          { id: 'kpi1', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'ws1' },
          { id: 'kpi2', type: 'worksheet', w: 50000, h: 100000, worksheetRef: 'ws2' },
        ],
      },
      { id: 'chart', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws3' },
    ],
  },
  floatingLayer: [
    { id: 'f1', type: 'legend', floating: true, x: 100, y: 50, pxW: 200, pxH: 150, zIndex: 5, w: 0, h: 0 },
  ],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [],
};

const renderLeaf = (zone: { id: string; type: string }) => (
  <div data-testid={`leaf-${zone.id}`} data-leaf-type={zone.type}>
    {zone.id}
  </div>
);

describe('FreeformCanvas', () => {
  it('renders the sheet at the fixed canvas size', () => {
    render(<FreeformCanvas dashboard={sampleDashboard} renderLeaf={renderLeaf} />);
    const sheet = screen.getByTestId('freeform-sheet');
    expect(sheet.style.width).toBe('1000px');
    expect(sheet.style.height).toBe('500px');
  });

  it('renders the tiled containers + leaves', () => {
    render(<FreeformCanvas dashboard={sampleDashboard} renderLeaf={renderLeaf} />);
    expect(screen.getByTestId('tiled-container-root')).toBeInTheDocument();
    expect(screen.getByTestId('tiled-container-kpi-row')).toBeInTheDocument();
    expect(screen.getByTestId('tiled-leaf-kpi1')).toBeInTheDocument();
    expect(screen.getByTestId('tiled-leaf-kpi2')).toBeInTheDocument();
    expect(screen.getByTestId('tiled-leaf-chart')).toBeInTheDocument();
  });

  it('renders the floating layer', () => {
    render(<FreeformCanvas dashboard={sampleDashboard} renderLeaf={renderLeaf} />);
    const f = screen.getByTestId('floating-zone-f1');
    expect(f.style.left).toBe('100px');
    expect(f.style.top).toBe('50px');
    expect(f.style.width).toBe('200px');
    expect(f.style.height).toBe('150px');
  });

  it('calls renderLeaf for each leaf zone', () => {
    const spy = vi.fn(renderLeaf);
    render(<FreeformCanvas dashboard={sampleDashboard} renderLeaf={spy} />);
    const ids = spy.mock.calls.map((c) => (c[0] as { id: string }).id).sort();
    expect(ids).toEqual(['chart', 'f1', 'kpi1', 'kpi2']);
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx`
Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx
git commit -m "test(analyst-pro): FreeformCanvas integration test"
```

---

## Task 10: useZoneTree Zustand hook

**Files:**
- Create: `frontend/src/components/dashboard/freeform/hooks/useZoneTree.js`
- Modify: `frontend/src/store.js`

- [ ] **Step 1: Add analystPro slice to store**

Find the end of the Zustand `create((set, get) => ({ ... }))` call in `frontend/src/store.js`. Insert before the closing `}))`:

```javascript
  // ── Analyst Pro archetype (Plan 1) ──
  // Read-only dashboard viewer state. Plan 2 adds editing actions.
  analystProDashboard: null,
  setAnalystProDashboard: (dashboard) => set({ analystProDashboard: dashboard }),
  analystProSize: { mode: 'automatic' },
  setAnalystProSize: (size) => {
    const dash = get().analystProDashboard;
    if (dash) {
      set({
        analystProDashboard: { ...dash, size },
        analystProSize: size,
      });
    } else {
      set({ analystProSize: size });
    }
  },
```

- [ ] **Step 2: Create the hook**

```javascript
// frontend/src/components/dashboard/freeform/hooks/useZoneTree.js
import { useStore } from '../../../../store';

/**
 * Read-only zone tree hook for Plan 1.
 * Plan 2 extends with insert/remove/move/resize operations.
 */
export function useZoneTree() {
  const dashboard = useStore((s) => s.analystProDashboard);
  const setDashboard = useStore((s) => s.setAnalystProDashboard);
  const size = useStore((s) => s.analystProSize);
  const setSize = useStore((s) => s.setAnalystProSize);

  return {
    dashboard,
    setDashboard,
    size,
    setSize,
    tiledRoot: dashboard?.tiledRoot ?? null,
    floatingLayer: dashboard?.floatingLayer ?? [],
  };
}
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js frontend/src/components/dashboard/freeform/hooks/useZoneTree.js
git commit -m "feat(analyst-pro): useZoneTree Zustand hook (read-only v1)"
```

---

## Task 11: AnalystProLayout archetype shell

**Files:**
- Create: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/dashboard/modes/AnalystProLayout.jsx
import { useMemo } from 'react';
import FreeformCanvas from '../freeform/FreeformCanvas';
import SizeToggleDropdown from '../freeform/SizeToggleDropdown';
import DashboardTileCanvas from '../lib/DashboardTileCanvas';

/**
 * Analyst Pro archetype — Tableau-parity freeform authoring shell.
 *
 * Plan 1 scope (read-only):
 *   - Mounts an existing dashboard as a zone tree + floating layer.
 *   - Renders via FreeformCanvas + ZoneRenderer + FloatingLayer.
 *   - SizeToggleDropdown for canvas size control.
 *
 * Plan 2 adds:
 *   - drag/resize/select handlers
 *   - ObjectLibraryPanel, LayoutTreePanel
 *   - actions / sets / DZV
 */
export default function AnalystProLayout({
  tiles = [],
  dashboardId,
  dashboardName,
  onTileClick,
  onSizeChange,
  size,
}) {
  // Build dashboard object from legacy tile array (Plan 1 read-only path).
  // Plan 2 will receive a full `dashboard` prop instead.
  const dashboard = useMemo(() => legacyTilesToDashboard(tiles, dashboardId, dashboardName, size), [
    tiles,
    dashboardId,
    dashboardName,
    size,
  ]);

  const renderLeaf = useMemo(() => {
    return (zone) => {
      if (zone.type === 'worksheet' && zone.worksheetRef) {
        const tile = tiles.find((t) => String(t.id) === zone.worksheetRef);
        if (!tile) return null;
        return <DashboardTileCanvas tile={tile} onTileClick={onTileClick} />;
      }
      // Plan 2: text / filter / legend / parameter / image / webpage / blank renderers.
      if (zone.type === 'blank') {
        return <div data-testid={`blank-${zone.id}`} style={{ width: '100%', height: '100%' }} />;
      }
      return null;
    };
  }, [tiles, onTileClick]);

  return (
    <div
      data-testid="layout-analyst-pro"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--archetype-analyst-pro-bg)',
      }}
    >
      <div
        data-testid="analyst-pro-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '8px 14px',
          borderBottom: '1px solid var(--border-default)',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <SizeToggleDropdown currentSize={size} onChange={onSizeChange} />
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <FreeformCanvas dashboard={dashboard} renderLeaf={renderLeaf} />
      </div>
    </div>
  );
}

/**
 * Legacy shim: flat tile array → zone tree.
 * Used in Plan 1 while the backend migration lands; Plan 2 removes this.
 */
function legacyTilesToDashboard(tiles, dashboardId, dashboardName, size) {
  const children = tiles.map((t, i) => ({
    id: String(t.id ?? `t${i}`),
    type: 'worksheet',
    w: 100000, // each row-of-one fills full width; vertical stack
    h: Math.floor(100000 / Math.max(tiles.length, 1)),
    worksheetRef: String(t.id ?? `t${i}`),
  }));
  const tiledRoot = {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children,
  };
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: dashboardId || 'unknown',
    name: dashboardName || 'Untitled',
    archetype: 'analyst-pro',
    size: size ?? { mode: 'automatic' },
    tiledRoot,
    floatingLayer: [],
    worksheets: tiles.map((t) => ({ id: String(t.id), chartSpec: t.chart_spec ?? t.chartSpec })),
    parameters: [],
    sets: [],
    actions: [],
  };
}
```

- [ ] **Step 2: Lint check**

Run: `cd "QueryCopilot V1/frontend" && npx eslint src/components/dashboard/modes/AnalystProLayout.jsx`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): AnalystProLayout archetype shell with legacy tile shim"
```

---

## Task 12: Register analyst-pro archetype in tokens + CSS vars

**Files:**
- Modify: `frontend/src/components/dashboard/tokens.js`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add archetype entry to tokens.js**

Find `export const ARCHETYPE_THEMES = {` in `frontend/src/components/dashboard/tokens.js`. Append a new entry after the `tableau` archetype and before the closing `};`:

```javascript
  // ── 7. Analyst Pro (Tableau-parity freeform) ──
  'analyst-pro': {
    id: 'analyst-pro',
    name: 'Analyst Pro',
    description: 'Tableau-native freeform authoring. Invisible tile boundaries, floating objects, full layout freedom.',
    colorScheme: 'auto',
    background: {
      dashboard: 'var(--archetype-analyst-pro-bg)',
      tile: 'var(--archetype-analyst-pro-tile)',
      section: 'transparent',
    },
    spacing: {
      tileGap: 0,
      tileRadius: 0,
      tilePadding: 0,
      sectionGap: 0,
      density: 'dense',
    },
    typography: {
      headingFont: "'Satoshi', 'Outfit', system-ui, sans-serif",
      bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif",
      dataFont: "'JetBrains Mono', ui-monospace, monospace",
      headingSize: 14,
      headingWeight: 700,
      bodySize: 12,
      dataSize: 11,
    },
    palette: 'tableau10',
    tile: {
      borderWidth: 0,        // invisible
      shadow: false,
      glass: false,
      hoverLift: 0,
    },
    kpi: {
      valueFontSize: 32,
      valueFontWeight: 750,
      labelFontSize: 9,
    },
    accent: 'var(--accent)',
  },
```

- [ ] **Step 2: Add CSS vars to index.css (dark scope)**

Find the comment `/* ── Archetype surfaces (dark theme defaults) ── */` block in `frontend/src/index.css`. Append at the end of that block, before the closing `}`:

```css
  --archetype-analyst-pro-bg: #0a0a0c;
  --archetype-analyst-pro-tile: var(--glass-bg-card);
```

- [ ] **Step 3: Add CSS vars to index.css (light scope)**

Find the matching `/* ── Archetype surfaces (light theme overrides) ── */` block. Append at the end:

```css
  --archetype-analyst-pro-bg: #F7F8FA;
  --archetype-analyst-pro-tile: #FFFFFF;
```

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/tokens.js frontend/src/index.css
git commit -m "feat(analyst-pro): register analyst-pro in ARCHETYPE_THEMES + CSS vars"
```

---

## Task 13: Route analyst-pro mode in DashboardShell

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardShell.jsx`

- [ ] **Step 1: Import the new layout**

At the top of `DashboardShell.jsx`, add to the imports block:

```javascript
import AnalystProLayout from "./modes/AnalystProLayout";
```

- [ ] **Step 2: Add routing case**

Find the `ARCHETYPES` array near the top of the file. Append:

```javascript
  { id: 'analyst-pro', label: 'Analyst Pro' },
```

Find the block that switches on `mode` and returns a layout component (search for `case 'ops'` or similar). Add a case:

```javascript
    if (mode === 'analyst-pro') {
      return (
        <AnalystProLayout
          tiles={tiles}
          dashboardId={dashboardId}
          dashboardName={dashboardName}
          onTileClick={onTileClick}
          size={useStore.getState().analystProSize}
          onSizeChange={useStore.getState().setAnalystProSize}
        />
      );
    }
```

(If the file uses a switch statement, add a `case 'analyst-pro':` branch with the same return.)

- [ ] **Step 3: Build check**

Run: `cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -5`
Expected: `✓ built in <time>s`.

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/DashboardShell.jsx
git commit -m "feat(analyst-pro): route analyst-pro mode → AnalystProLayout"
```

---

## Task 14: Backend — FEATURE_ANALYST_PRO config flag

**Files:**
- Modify: `backend/config.py`

- [ ] **Step 1: Add the flag**

Find a block of feature flags in `backend/config.py` (search for `FEATURE_`). Append:

```python
    # ── Analyst Pro archetype (Tableau-parity freeform workbook) ──
    # Plan 1 ships read-only rendering. Plan 2+ add drag/resize/actions/sets.
    FEATURE_ANALYST_PRO: bool = False
```

- [ ] **Step 2: Sanity check**

Run: `cd "QueryCopilot V1/backend" && python -c "from config import settings; print(settings.FEATURE_ANALYST_PRO)"`
Expected: `False`.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1"
git add backend/config.py
git commit -m "feat(analyst-pro): FEATURE_ANALYST_PRO config flag (default off)"
```

---

## Task 15: Backend — legacy → freeform migration

**Files:**
- Modify: `backend/dashboard_migration.py`
- Create: `backend/tests/test_dashboard_migration_freeform.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_dashboard_migration_freeform.py
from dashboard_migration import legacy_to_freeform_schema


def test_flat_tile_list_becomes_vert_container():
    legacy = {
        "id": "d1",
        "name": "Test",
        "tiles": [
            {"id": "t1", "chart_spec": {"mark": "bar"}},
            {"id": "t2", "chart_spec": {"mark": "line"}},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    assert result["schemaVersion"] == "askdb/dashboard/v1"
    assert result["archetype"] == "analyst-pro"
    assert result["tiledRoot"]["type"] == "container-vert"
    assert len(result["tiledRoot"]["children"]) == 2
    assert result["tiledRoot"]["children"][0]["worksheetRef"] == "t1"
    assert result["tiledRoot"]["children"][1]["worksheetRef"] == "t2"


def test_children_h_values_sum_100000():
    legacy = {"id": "d1", "name": "Test", "tiles": [{"id": "t1"}, {"id": "t2"}, {"id": "t3"}]}
    result = legacy_to_freeform_schema(legacy)
    total = sum(c["h"] for c in result["tiledRoot"]["children"])
    assert total == 100000, f"children h values sum to {total}, expected 100000"


def test_empty_tile_list_produces_empty_root():
    legacy = {"id": "d1", "name": "Empty", "tiles": []}
    result = legacy_to_freeform_schema(legacy)
    assert result["tiledRoot"]["children"] == []


def test_worksheets_array_populated():
    legacy = {
        "id": "d1",
        "name": "T",
        "tiles": [{"id": "t1", "chart_spec": {"mark": "bar"}, "sql": "SELECT 1"}],
    }
    result = legacy_to_freeform_schema(legacy)
    assert len(result["worksheets"]) == 1
    assert result["worksheets"][0]["id"] == "t1"
    assert result["worksheets"][0]["chartSpec"] == {"mark": "bar"}


def test_sections_tree_flattens_to_vert_of_horz():
    legacy = {
        "id": "d1",
        "name": "T",
        "sections": [
            {"id": "s1", "tiles": [{"id": "a"}, {"id": "b"}]},
            {"id": "s2", "tiles": [{"id": "c"}]},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    root = result["tiledRoot"]
    assert root["type"] == "container-vert"
    assert len(root["children"]) == 2
    # Each section becomes a horz container
    assert root["children"][0]["type"] == "container-horz"
    assert len(root["children"][0]["children"]) == 2
    assert root["children"][1]["type"] == "container-horz"
    assert len(root["children"][1]["children"]) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_dashboard_migration_freeform.py -v`
Expected: all 5 tests FAIL — "cannot import name 'legacy_to_freeform_schema'".

- [ ] **Step 3: Implement**

Append to `backend/dashboard_migration.py`:

```python
def legacy_to_freeform_schema(legacy: dict) -> dict:
    """
    Convert a legacy dashboard (flat tile list OR sections/tiles tree) to the
    Analyst Pro freeform schema (schemaVersion='askdb/dashboard/v1').

    Rules:
      - Flat tile list  → container-vert root with one worksheet per child.
        Each child gets h = 100000 / tile_count (last child absorbs drift).
      - Sections tree   → container-vert root; each section becomes a
        container-horz with its tiles split evenly horizontally.
      - Empty dashboard → empty container-vert root.

    Output schema matches Analyst Pro spec §10.1.
    """
    dashboard_id = legacy.get("id", "unknown")
    name = legacy.get("name", "Untitled")

    if "sections" in legacy and isinstance(legacy["sections"], list):
        tiled_root = _sections_to_vert_root(legacy["sections"])
        all_tiles = [t for s in legacy["sections"] for t in s.get("tiles", [])]
    else:
        tiles = legacy.get("tiles", []) or []
        tiled_root = _flat_tiles_to_vert_root(tiles)
        all_tiles = tiles

    worksheets = [
        {
            "id": str(t.get("id", f"t{i}")),
            "chartSpec": t.get("chart_spec") or t.get("chartSpec"),
            "sql": t.get("sql"),
        }
        for i, t in enumerate(all_tiles)
    ]

    return {
        "schemaVersion": "askdb/dashboard/v1",
        "id": str(dashboard_id),
        "name": name,
        "archetype": "analyst-pro",
        "size": {"mode": "automatic"},
        "tiledRoot": tiled_root,
        "floatingLayer": [],
        "worksheets": worksheets,
        "parameters": [],
        "sets": [],
        "actions": [],
        "globalStyle": {},
    }


def _flat_tiles_to_vert_root(tiles: list) -> dict:
    children = []
    if tiles:
        count = len(tiles)
        base_h = 100000 // count
        drift = 100000 - (base_h * count)
        for i, t in enumerate(tiles):
            h = base_h + (drift if i == count - 1 else 0)
            children.append({
                "id": str(t.get("id", f"t{i}")),
                "type": "worksheet",
                "w": 100000,
                "h": h,
                "worksheetRef": str(t.get("id", f"t{i}")),
            })
    return {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": children,
    }


def _sections_to_vert_root(sections: list) -> dict:
    vert_children = []
    section_count = len([s for s in sections if s.get("tiles")])
    if section_count == 0:
        return {
            "id": "root",
            "type": "container-vert",
            "w": 100000,
            "h": 100000,
            "children": [],
        }
    base_h = 100000 // section_count
    drift = 100000 - (base_h * section_count)
    section_idx = 0
    for s in sections:
        tiles = s.get("tiles", []) or []
        if not tiles:
            continue
        h = base_h + (drift if section_idx == section_count - 1 else 0)
        horz_children = _flat_tiles_to_horz_children(tiles)
        vert_children.append({
            "id": str(s.get("id", f"s{section_idx}")),
            "type": "container-horz",
            "w": 100000,
            "h": h,
            "children": horz_children,
        })
        section_idx += 1
    return {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": vert_children,
    }


def _flat_tiles_to_horz_children(tiles: list) -> list:
    count = len(tiles)
    if count == 0:
        return []
    base_w = 100000 // count
    drift = 100000 - (base_w * count)
    children = []
    for i, t in enumerate(tiles):
        w = base_w + (drift if i == count - 1 else 0)
        children.append({
            "id": str(t.get("id", f"t{i}")),
            "type": "worksheet",
            "w": w,
            "h": 100000,
            "worksheetRef": str(t.get("id", f"t{i}")),
        })
    return children
```

- [ ] **Step 4: Run tests**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_dashboard_migration_freeform.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/dashboard_migration.py backend/tests/test_dashboard_migration_freeform.py
git commit -m "feat(analyst-pro): legacy → freeform migration (flat + sections)"
```

---

## Task 16: Backend — /resolve-layout endpoint

**Files:**
- Modify: `backend/routers/dashboard_routes.py`
- Create: `backend/tests/test_resolve_layout_endpoint.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_resolve_layout_endpoint.py
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _dashboard_fixture() -> dict:
    return {
        "schemaVersion": "askdb/dashboard/v1",
        "id": "d1",
        "name": "T",
        "archetype": "analyst-pro",
        "size": {"mode": "fixed", "width": 1000, "height": 500, "preset": "desktop"},
        "tiledRoot": {
            "id": "root",
            "type": "container-horz",
            "w": 100000,
            "h": 100000,
            "children": [
                {"id": "a", "type": "worksheet", "w": 50000, "h": 100000, "worksheetRef": "a"},
                {"id": "b", "type": "worksheet", "w": 50000, "h": 100000, "worksheetRef": "b"},
            ],
        },
        "floatingLayer": [],
        "worksheets": [],
        "parameters": [],
        "sets": [],
        "actions": [],
    }


def test_resolve_layout_returns_pixel_coords_for_horz_split():
    payload = {"dashboard": _dashboard_fixture(), "viewport": {"width": 1000, "height": 500}}
    resp = client.post("/api/v1/dashboards/d1/resolve-layout", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    resolved = {r["id"]: r for r in data["resolved"]}
    assert resolved["root"] == {"id": "root", "x": 0, "y": 0, "width": 1000, "height": 500, "depth": 0}
    assert resolved["a"] == {"id": "a", "x": 0, "y": 0, "width": 500, "height": 500, "depth": 1}
    assert resolved["b"] == {"id": "b", "x": 500, "y": 0, "width": 500, "height": 500, "depth": 1}


def test_resolve_layout_rejects_unknown_size_mode():
    d = _dashboard_fixture()
    d["size"] = {"mode": "bogus"}
    payload = {"dashboard": d, "viewport": {"width": 1000, "height": 500}}
    resp = client.post("/api/v1/dashboards/d1/resolve-layout", json=payload)
    assert resp.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_resolve_layout_endpoint.py -v`
Expected: 2 tests FAIL — 404 not found.

- [ ] **Step 3: Implement the endpoint**

Find `backend/routers/dashboard_routes.py`. Near the other POST endpoints, add:

```python
from typing import Any
from fastapi import Body, HTTPException
from pydantic import BaseModel


class _Viewport(BaseModel):
    width: int
    height: int


class _ResolveLayoutRequest(BaseModel):
    dashboard: dict[str, Any]
    viewport: _Viewport


@router.post("/dashboards/{dashboard_id}/resolve-layout")
def resolve_dashboard_layout(dashboard_id: str, payload: _ResolveLayoutRequest = Body(...)) -> dict:
    """
    Resolve a freeform dashboard's zone tree + floating layer to absolute
    pixel coordinates. Mirrors the frontend `resolveLayout` so first paint
    can happen without client-side layout math.
    """
    d = payload.dashboard
    size = d.get("size", {"mode": "automatic"})
    mode = size.get("mode")

    if mode == "fixed":
        canvas_w = int(size.get("width", 1200))
        canvas_h = int(size.get("height", 800))
    elif mode == "automatic":
        canvas_w = payload.viewport.width
        canvas_h = payload.viewport.height
    elif mode == "range":
        canvas_w = max(min(payload.viewport.width, size["maxWidth"]), size["minWidth"])
        canvas_h = max(min(payload.viewport.height, size["maxHeight"]), size["minHeight"])
    else:
        raise HTTPException(status_code=400, detail=f"unknown size mode: {mode}")

    resolved: list[dict] = []
    _resolve_tiled(d["tiledRoot"], 0, 0, canvas_w, canvas_h, 0, resolved)
    for f in d.get("floatingLayer", []):
        resolved.append({
            "id": f["id"],
            "x": f["x"],
            "y": f["y"],
            "width": f["pxW"],
            "height": f["pxH"],
            "depth": -1,
        })
    return {"dashboardId": dashboard_id, "canvasWidth": canvas_w, "canvasHeight": canvas_h, "resolved": resolved}


def _resolve_tiled(zone: dict, x: int, y: int, w: int, h: int, depth: int, out: list) -> None:
    out.append({"id": zone["id"], "x": x, "y": y, "width": w, "height": h, "depth": depth})
    t = zone.get("type")
    if t not in ("container-horz", "container-vert"):
        return
    children = zone.get("children", []) or []
    if not children:
        return
    if t == "container-horz":
        total = sum(c["w"] for c in children) or 1
        cursor = x
        for c in children:
            child_w = round((c["w"] / total) * w)
            _resolve_tiled(c, cursor, y, child_w, h, depth + 1, out)
            cursor += child_w
    else:
        total = sum(c["h"] for c in children) or 1
        cursor = y
        for c in children:
            child_h = round((c["h"] / total) * h)
            _resolve_tiled(c, x, cursor, w, child_h, depth + 1, out)
            cursor += child_h
```

- [ ] **Step 4: Run tests**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_resolve_layout_endpoint.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/routers/dashboard_routes.py backend/tests/test_resolve_layout_endpoint.py
git commit -m "feat(analyst-pro): /resolve-layout endpoint for server pre-resolved coords"
```

---

## Task 17: End-to-end smoke check

**Files:**
- No new files.

- [ ] **Step 1: Full frontend test suite**

Run: `cd "QueryCopilot V1/frontend" && npx vitest run src/components/dashboard/freeform/`
Expected: all tests pass (zoneTree: 9, layoutResolver: 4, FreeformCanvas: 4 = 17 total).

- [ ] **Step 2: Full frontend build**

Run: `cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -3`
Expected: `✓ built in <time>s`, no errors.

- [ ] **Step 3: Frontend lint (touched files only)**

Run: `cd "QueryCopilot V1/frontend" && npx eslint src/components/dashboard/freeform/ src/components/dashboard/modes/AnalystProLayout.jsx`
Expected: 0 errors.

- [ ] **Step 4: Backend tests**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_dashboard_migration_freeform.py tests/test_resolve_layout_endpoint.py -v`
Expected: 7 passed.

- [ ] **Step 5: Manual smoke — spin dev server, pick Analyst Pro**

Run in two terminals:
- `cd "QueryCopilot V1/backend" && uvicorn main:app --reload --port 8002`
- `cd "QueryCopilot V1/frontend" && npm run dev`

Then in the browser at `http://localhost:5173`:
1. Load a dashboard at `/analytics`.
2. Click the mode pill **"Analyst Pro"**.
3. Verify the dashboard renders with `data-testid="layout-analyst-pro"` present in the DOM.
4. Verify the size dropdown in the toolbar is clickable and switching presets changes the sheet size.
5. Verify no console errors.

Document any issues in a new task before proceeding.

- [ ] **Step 6: Commit the passing state (if anything changed)**

```bash
cd "QueryCopilot V1"
git status
# If clean, skip. If files changed (lock files, generated types):
git add -u
git commit -m "chore(analyst-pro): Plan 1 smoke check pass"
```

---

## Self-Review

**Spec coverage audit:**

- §4.1 Zone tree types → Task 1 ✓
- §4.3 Dashboard size (7 presets) → Task 5 + Task 8 resolver ✓
- §4.4 Resize algorithm → Task 4 (layoutResolver) + Task 16 (backend mirror) ✓
- §5 Object taxonomy first-class → Task 11 renderLeaf dispatches on `zone.type` for worksheet + blank; other types deferred to Plan 2 (noted inline in shell)
- §6 Canvas engine UX (drag/resize/select/group/align/undo/…) → **explicitly deferred to Plan 2** (stated in goal + task 11 comment)
- §7 Actions runtime → **deferred to Plan 3**
- §8 Sets → **deferred to Plan 4**
- §9 Dynamic Zone Visibility → **deferred to Plan 4**
- §10.1 Persistence JSON schema → Task 15 emits the schema on migration; read path works ✓
- §10.2 Arrow for data → already exists in repo; no change needed for Plan 1
- §11 Performance architecture → Plan 1 establishes the zone-tree render path; actual perf measurement in Plan 2+
- §12 Frontend file structure → Tasks 1-11 create the exact tree specified in spec §12.1 (freeform/, modes/, hooks/, lib/, __tests__/)
- §13 Backend endpoints — only `/resolve-layout` lands in Plan 1 (Task 16); `/actions/fire`, `/sets`, `/parameters`, `/evaluate-visibility` → Plans 3-4
- §14 Chart IR integration → no change needed (renderLeaf delegates to existing DashboardTileCanvas → EditorCanvas → VegaRenderer/VizQLRenderer path)
- §15 Migration story → Task 15 (flat + sections cases covered); frontend currently uses `legacyTilesToDashboard` shim in AnalystProLayout until backend stores freeform directly (Plan 2 switches)
- §18 Feature flag `FEATURE_ANALYST_PRO` → Task 14

Plan covers Plan-1-scoped items; Plan 2-4 items explicitly deferred with task-level comments.

**Placeholder scan:** every code step contains the exact code. No "TBD". No "similar to task N". No "implement appropriate handling". ✓

**Type consistency:**
- `Zone` / `ContainerZone` / `LeafZone` / `FloatingZone` / `ResolvedZone` / `SizeMode` / `Dashboard` defined in Task 1, used identically in Tasks 2, 3, 4, 6, 7, 8, 9, 11.
- `resolveLayout(root, floatingLayer, canvasWidth, canvasHeight)` — signature consistent between Task 4 (frontend TS) and Task 16 (backend Python mirror).
- `schemaVersion: 'askdb/dashboard/v1'` — consistent across Task 1 (frontend type), Task 11 (shim), Task 15 (backend migration).
- `'analyst-pro'` archetype id — consistent across Task 11, Task 12 (tokens), Task 13 (DashboardShell), Task 15 (migration output).

No inconsistencies.

---

## Plan complete and saved to `docs/superpowers/plans/2026-04-16-analyst-pro-plan-1-layout-foundation.md`.

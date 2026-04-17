# Analyst Pro — Plan 6a: Canvas Zoom + Pan + Rulers + Device Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Analyst Pro canvas Tableau-class power controls — pixel-accurate zoom at cursor, Space-hold / middle-click pan, 24 px rulers that follow the transform, and a Desktop/Tablet/Phone device-preview toggle that resizes the canvas and layers `DeviceLayoutOverride` records on top of the base Desktop layout without rebuilding the zone tree (mirrors Tableau `DashboardDeviceLayout` + §IX.5 `HiddenByUser` semantics, Appendix E.15).

**Architecture:** Four new Zustand slices (`analystProCanvasZoom`, `analystProCanvasPan`, `analystProRulersVisible`, `analystProActiveDevice`) drive a single CSS `transform: translate(...) scale(...)` on `.freeform-sheet`. All pointer handlers (drag/resize/marquee/drop) convert client coords → sheet coords through a new `screenToSheet()` helper that accounts for both the transform matrix and the wrapping `BoundingClientRect`. Device overrides are a pure merge step applied to the resolved dashboard (`applyDeviceOverrides(dashboard, device)`) — the base zone tree is never mutated, matching Tableau's "inheriting from base Desktop" semantics (§IX.5). Hidden-on-phone marks `visible: false` on the override only; data pipeline keeps running (Appendix E.15 #15).

**Tech Stack:** React 19, Zustand (`frontend/src/store.js`), Vitest 2.x + Testing Library, TypeScript for the `lib/` layer (`vizql`/chart-ir tsconfig carve-out already covers `components/dashboard/freeform/lib/**`), Python 3.10+ + pytest for backend (`backend/dashboard_migration.py`, `backend/user_storage.py`).

**Canonical references (read before every task):**
- `QueryCopilot V1/docs/Build_Tableau.md` §IX.4 (`DashboardSizingMode` — Fixed/Range/Automatic; fixed presets Desktop Browser / Generic Mobile / Tablet / Laptop / Phone) and §IX.5 (`LayoutDoc(SheetLocator, DashboardDeviceLayout)`; `DashboardDeviceLayout` enum Default/Desktop/Tablet/Phone; device trees inherit from base Desktop; `HiddenByUser=true` on zone suppresses render, data pipeline still runs; `AutoGeneratePhoneLayoutCmd`, `SetManualLayoutModeCmd`, `ToggleIncludePhoneLayoutsCmd`).
- `Build_Tableau.md` Appendix A.13 — `DashboardDeviceLayout` enum literal values.
- `Build_Tableau.md` Appendix E.15 — "Device layouts inherit from base Desktop; 'hide on Phone' keeps data pipeline running, suppresses render only."
- `QueryCopilot V1/docs/analyst_pro_tableau_parity_roadmap.md` §Plan 6a.
- `QueryCopilot V1/CLAUDE.md` — store naming (`…AnalystPro` actions, `analystPro…` state), TDD hard rule, commit format `feat(analyst-pro): <verb> <object> (Plan 6a Tn)`.

**Scope boundaries:**
- This plan does NOT implement `AutoGeneratePhoneLayoutCmd` auto-generation (separate Plan 6a-follow). Device layouts created manually in this plan by dragging/resizing while Tablet/Phone device is active — left for a later plan; for 6a we only render overrides that already exist and let users opt into authoring by editing `dashboard.deviceLayouts` via the store.
- This plan does NOT touch the inner worksheet zoom (Vega-Lite signal) — zoom acts on the whole `.freeform-sheet` only.
- This plan does NOT modify undo history shape — zoom/pan/device toggles are ephemeral view-state, NOT pushed to `pushAnalystProHistory`. Device-layout *override mutations* (manual drag while Phone active) ARE pushed, landing in a later task series.

---

## File Structure

**Files to create (frontend):**
- `frontend/src/components/dashboard/freeform/CanvasZoomControls.jsx`
- `frontend/src/components/dashboard/freeform/CanvasRulers.jsx`
- `frontend/src/components/dashboard/freeform/DevicePreviewToggle.jsx`
- `frontend/src/components/dashboard/freeform/lib/deviceLayout.ts`
- `frontend/src/components/dashboard/freeform/lib/canvasTransform.ts`
- `frontend/src/components/dashboard/freeform/__tests__/deviceLayout.test.ts`
- `frontend/src/components/dashboard/freeform/__tests__/canvasTransform.test.ts`
- `frontend/src/components/dashboard/freeform/__tests__/CanvasZoomControls.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/CanvasRulers.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/DevicePreviewToggle.test.tsx`
- `frontend/src/components/dashboard/freeform/__tests__/store.canvasZoomPan.test.ts`

**Files to modify (frontend):**
- `frontend/src/store.js` — add 4 slices + setters, add device override getter.
- `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` — apply transform, wire Ctrl+scroll / Ctrl+0 / Ctrl+± / Space-pan / middle-click-pan, mount rulers, convert pointer coords.
- `frontend/src/components/dashboard/freeform/hooks/useDragResize.js` — consume `screenToSheet` instead of raw `getBoundingClientRect` math.
- `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js` — register Ctrl+0/Ctrl+=/Ctrl+-.
- `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — mount `<DevicePreviewToggle/>` in top toolbar; wrap canvas size resolution in device-aware selector.
- `frontend/src/components/dashboard/freeform/lib/types.ts` — add `DeviceLayoutOverride`, `DashboardDeviceLayout`, extend `Dashboard` with optional `deviceLayouts`.

**Files to modify (backend):**
- `backend/dashboard_migration.py` — carry `deviceLayouts` through `legacy_to_chart_spec()` untouched.
- `backend/user_storage.py` — add `"deviceLayouts"` to the update allowlist around line 628.
- `backend/tests/test_dashboard_migration_device_layouts.py` — new pytest file.

**Task count:** 11 tasks, each a single TDD cycle + commit. Commit prefix: `feat(analyst-pro): <verb> <object> (Plan 6a Tn)`.

---

## Task 1: Add canvas view-state slices to store (zoom / pan / rulers / device)

**Files:**
- Modify: `frontend/src/store.js` (insert slices alongside existing `analystProSnapEnabled` around line 722)
- Create: `frontend/src/components/dashboard/freeform/__tests__/store.canvasZoomPan.test.ts`

Canonical names (Roadmap §Plan 6a): `analystProCanvasZoom` (default `1.0`), `analystProCanvasPan` (default `{ x: 0, y: 0 }`), `analystProRulersVisible` (default `false`), `analystProActiveDevice` (default `'desktop'`). Setters: `setCanvasZoomAnalystPro(zoom, anchor?)`, `setCanvasPanAnalystPro(x, y)`, `toggleRulersAnalystPro()`, `setActiveDeviceAnalystPro(device)`.

Zoom must clamp to `[0.1, 4.0]`. Pan has no clamp. Anchor-aware zoom: when `anchor = { sheetX, sheetY, screenX, screenY }` is passed, pan is adjusted so the point under the cursor stays fixed (math derived in Task 4).

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/store.canvasZoomPan.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../../store';

describe('analyst pro canvas view-state slices', () => {
  beforeEach(() => {
    useStore.setState({
      analystProCanvasZoom: 1.0,
      analystProCanvasPan: { x: 0, y: 0 },
      analystProRulersVisible: false,
      analystProActiveDevice: 'desktop',
    });
  });

  it('has sensible defaults', () => {
    const s = useStore.getState();
    expect(s.analystProCanvasZoom).toBe(1.0);
    expect(s.analystProCanvasPan).toEqual({ x: 0, y: 0 });
    expect(s.analystProRulersVisible).toBe(false);
    expect(s.analystProActiveDevice).toBe('desktop');
  });

  it('setCanvasZoomAnalystPro clamps to [0.1, 4.0]', () => {
    useStore.getState().setCanvasZoomAnalystPro(10);
    expect(useStore.getState().analystProCanvasZoom).toBe(4.0);
    useStore.getState().setCanvasZoomAnalystPro(0.01);
    expect(useStore.getState().analystProCanvasZoom).toBe(0.1);
    useStore.getState().setCanvasZoomAnalystPro(1.5);
    expect(useStore.getState().analystProCanvasZoom).toBe(1.5);
  });

  it('setCanvasZoomAnalystPro with anchor keeps sheet point under cursor', () => {
    // Starting state: zoom 1.0, pan (0,0). Cursor is at screen (200,200) which maps to sheet (200,200).
    // Zoom to 2.0 anchored on that point — the same sheet point (200,200) must still render under screen (200,200).
    useStore.getState().setCanvasZoomAnalystPro(2.0, { sheetX: 200, sheetY: 200, screenX: 200, screenY: 200 });
    const s = useStore.getState();
    expect(s.analystProCanvasZoom).toBe(2.0);
    // screenPoint = pan + sheetPoint * zoom  ⇒  pan = screen - sheet * zoom = 200 - 200*2 = -200
    expect(s.analystProCanvasPan).toEqual({ x: -200, y: -200 });
  });

  it('setCanvasPanAnalystPro sets pan coords', () => {
    useStore.getState().setCanvasPanAnalystPro(42, -17);
    expect(useStore.getState().analystProCanvasPan).toEqual({ x: 42, y: -17 });
  });

  it('toggleRulersAnalystPro flips boolean', () => {
    useStore.getState().toggleRulersAnalystPro();
    expect(useStore.getState().analystProRulersVisible).toBe(true);
    useStore.getState().toggleRulersAnalystPro();
    expect(useStore.getState().analystProRulersVisible).toBe(false);
  });

  it('setActiveDeviceAnalystPro accepts desktop|tablet|phone', () => {
    useStore.getState().setActiveDeviceAnalystPro('tablet');
    expect(useStore.getState().analystProActiveDevice).toBe('tablet');
    useStore.getState().setActiveDeviceAnalystPro('phone');
    expect(useStore.getState().analystProActiveDevice).toBe('phone');
    useStore.getState().setActiveDeviceAnalystPro('desktop');
    expect(useStore.getState().analystProActiveDevice).toBe('desktop');
  });

  it('setActiveDeviceAnalystPro ignores unknown device names', () => {
    useStore.getState().setActiveDeviceAnalystPro('desktop');
    // @ts-expect-error — intentionally invalid
    useStore.getState().setActiveDeviceAnalystPro('watch');
    expect(useStore.getState().analystProActiveDevice).toBe('desktop');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.canvasZoomPan.test.ts`
Expected: FAIL — `analystProCanvasZoom is undefined` / setters missing.

- [ ] **Step 3: Write the slices in store.js**

In `frontend/src/store.js`, add these members inside the same `create((set, get) => ({ ... }))` object that hosts `analystProSnapEnabled`. Insert just after the line:

```js
  analystProSnapEnabled: true,
  setAnalystProSnapEnabled: (enabled) => set({ analystProSnapEnabled: !!enabled }),
```

Add:

```js
  // Plan 6a — canvas view-state (ephemeral, NOT pushed to history)
  analystProCanvasZoom: 1.0,
  analystProCanvasPan: { x: 0, y: 0 },
  analystProRulersVisible: false,
  analystProActiveDevice: 'desktop',
  setCanvasZoomAnalystPro: (zoom, anchor) => set((state) => {
    const clamped = Math.max(0.1, Math.min(4.0, Number(zoom) || 1));
    if (!anchor) return { analystProCanvasZoom: clamped };
    // Keep the sheet point under the cursor stable across the zoom.
    // screenPoint = pan + sheetPoint * zoom  ⇒  pan = screen - sheet * zoom
    const nextPan = {
      x: anchor.screenX - anchor.sheetX * clamped,
      y: anchor.screenY - anchor.sheetY * clamped,
    };
    return { analystProCanvasZoom: clamped, analystProCanvasPan: nextPan };
  }),
  setCanvasPanAnalystPro: (x, y) => set({ analystProCanvasPan: { x: Number(x) || 0, y: Number(y) || 0 } }),
  toggleRulersAnalystPro: () => set((state) => ({ analystProRulersVisible: !state.analystProRulersVisible })),
  setActiveDeviceAnalystPro: (device) => set((state) => {
    if (device !== 'desktop' && device !== 'tablet' && device !== 'phone') {
      return {}; // ignore unknown devices
    }
    return { analystProActiveDevice: device };
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/store.canvasZoomPan.test.ts`
Expected: PASS — 7 assertions green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js frontend/src/components/dashboard/freeform/__tests__/store.canvasZoomPan.test.ts
git commit -m "feat(analyst-pro): add canvas zoom/pan/rulers/device view-state slices (Plan 6a T1)"
```

---

## Task 2: `deviceLayout.ts` — pure override merge helper (TDD)

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/deviceLayout.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/deviceLayout.test.ts`
- Modify: `frontend/src/components/dashboard/freeform/lib/types.ts` (add types)

Per `Build_Tableau.md` §IX.5 + Appendix A.13 + Appendix E.15:
- Device enum = `'desktop' | 'tablet' | 'phone'` (our equivalent of `DashboardDeviceLayout`; `'default'` collapses to `'desktop'` since Desktop is our base tree).
- Tablet and Phone layouts **do not rebuild the tree** — they overlay `{x?, y?, w?, h?, visible?}` per zoneId on top of the base.
- `visible: false` on an override means "HiddenByUser": the zone is not rendered, but the data pipeline (sheet queries, filter pipeline) still runs. For our consumer that means we keep the zone in `dashboard.worksheets` and still resolve its layout for data purposes, but mark it `hidden: true` on the resolved record so renderers skip it.

- [ ] **Step 1: Extend `types.ts`**

Append to `frontend/src/components/dashboard/freeform/lib/types.ts`:

```ts
// Plan 6a — Device layouts (Build_Tableau.md §IX.5, Appendix A.13, E.15).
// Tablet/Phone inherit from base Desktop; each DeviceLayoutOverride is a sparse
// per-zone diff. `visible: false` == Tableau's HiddenByUser: render suppressed,
// data pipeline still runs.
export type DashboardDeviceLayout = 'desktop' | 'tablet' | 'phone';

export interface ZoneOverride {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  visible?: boolean;
}

export interface DeviceLayoutOverride {
  zoneOverrides: Record<string, ZoneOverride>;
}

// Extend the existing Dashboard type. If Dashboard is declared elsewhere, instead
// add this as an augmentation. The current freeform pipeline reads dashboard
// objects dynamically, so we define the shape for type-safe consumers only.
export interface DashboardDeviceLayouts {
  tablet?: DeviceLayoutOverride;
  phone?: DeviceLayoutOverride;
}
```

- [ ] **Step 2: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/deviceLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyDeviceOverrides, resolveDeviceCanvasSize } from '../lib/deviceLayout';

const baseDashboard = {
  schemaVersion: 'askdb/dashboard/v1',
  id: 'd1',
  name: 'T',
  archetype: 'analyst-pro',
  size: { mode: 'fixed', preset: 'desktop', width: 1366, height: 768 },
  tiledRoot: {
    id: 'root',
    type: 'container-vert',
    w: 100000,
    h: 100000,
    children: [
      { id: 'z1', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 's1' },
      { id: 'z2', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 's2' },
    ],
  },
  floatingLayer: [
    { id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 100, y: 100, pxW: 200, pxH: 100, zIndex: 1 },
  ],
  worksheets: [],
  parameters: [],
  sets: [],
  actions: [],
  deviceLayouts: {
    phone: {
      zoneOverrides: {
        z2: { visible: false },
        f1: { x: 10, y: 10, w: 300, h: 200 },
      },
    },
  },
};

describe('applyDeviceOverrides', () => {
  it('returns the dashboard unchanged for device=desktop', () => {
    const out = applyDeviceOverrides(baseDashboard, 'desktop');
    expect(out).toBe(baseDashboard); // identity — no overlay
  });

  it('returns the dashboard unchanged when deviceLayouts[device] missing', () => {
    const out = applyDeviceOverrides(baseDashboard, 'tablet');
    expect(out).toBe(baseDashboard);
  });

  it('applies visibility override for a tiled zone without mutating the tree', () => {
    const out = applyDeviceOverrides(baseDashboard, 'phone');
    expect(out).not.toBe(baseDashboard);
    // Base tree untouched (deep equal to original)
    expect(baseDashboard.tiledRoot.children[1].id).toBe('z2');
    expect(baseDashboard.tiledRoot.children[1]).not.toHaveProperty('hidden');
    // Overridden dashboard tags z2 as hidden on its cloned tree
    const z2 = out.tiledRoot.children.find((c: any) => c.id === 'z2');
    expect(z2.hidden).toBe(true);
    // visibility: false means data pipeline still runs — worksheetRef preserved
    expect(z2.worksheetRef).toBe('s2');
  });

  it('applies {x,y,w,h} override to a floating zone', () => {
    const out = applyDeviceOverrides(baseDashboard, 'phone');
    const f1 = out.floatingLayer.find((z: any) => z.id === 'f1');
    expect(f1).toMatchObject({ x: 10, y: 10, pxW: 300, pxH: 200 });
    // Base untouched
    expect(baseDashboard.floatingLayer[0]).toMatchObject({ x: 100, y: 100, pxW: 200, pxH: 100 });
  });

  it('ignores override keys that do not name an existing zone', () => {
    const dash = {
      ...baseDashboard,
      deviceLayouts: { phone: { zoneOverrides: { ghost: { visible: false } } } },
    };
    const out = applyDeviceOverrides(dash, 'phone');
    // no crash, tree structurally preserved
    expect(out.tiledRoot.children.length).toBe(2);
  });
});

describe('resolveDeviceCanvasSize', () => {
  it('desktop returns dashboard.size unchanged', () => {
    expect(resolveDeviceCanvasSize(baseDashboard.size as any, 'desktop')).toEqual(baseDashboard.size);
  });

  it('tablet returns 1024x768 fixed preset', () => {
    expect(resolveDeviceCanvasSize(baseDashboard.size as any, 'tablet'))
      .toEqual({ mode: 'fixed', preset: 'ipad-landscape', width: 1024, height: 768 });
  });

  it('phone returns 375x667 fixed preset', () => {
    expect(resolveDeviceCanvasSize(baseDashboard.size as any, 'phone'))
      .toEqual({ mode: 'fixed', preset: 'phone', width: 375, height: 667 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/deviceLayout.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `deviceLayout.ts`**

Create `frontend/src/components/dashboard/freeform/lib/deviceLayout.ts`:

```ts
// frontend/src/components/dashboard/freeform/lib/deviceLayout.ts
//
// Plan 6a — Device-layout overrides.
//
// Matches Tableau's DashboardDeviceLayout semantics (Build_Tableau.md §IX.5,
// Appendix A.13, E.15): Tablet/Phone inherit from the base (Desktop) tree and
// layer a sparse per-zone override on top. We never rebuild the tree. Setting
// `visible: false` is our equivalent of Tableau's HiddenByUser flag — the
// data pipeline still runs (zone stays in worksheets[], still resolved for
// layout), only the renderer skips it (ZoneFrame reads the `hidden` prop).
//
// All operations are pure: the input dashboard is never mutated. The output is
// a shallow-but-deep-enough clone that keeps untouched branches referentially
// stable for React memoization.
import type { DashboardDeviceLayout, ZoneOverride } from './types';

type Dash = any; // intentionally loose — the concrete shape lives in legacy JS
type Zone = any;

const DEVICE_PRESETS: Record<Exclude<DashboardDeviceLayout, 'desktop'>, {
  mode: 'fixed';
  preset: string;
  width: number;
  height: number;
}> = {
  tablet: { mode: 'fixed', preset: 'ipad-landscape', width: 1024, height: 768 },
  phone: { mode: 'fixed', preset: 'phone', width: 375, height: 667 },
};

export function resolveDeviceCanvasSize(baseSize: any, device: DashboardDeviceLayout): any {
  if (device === 'desktop') return baseSize;
  return DEVICE_PRESETS[device];
}

export function applyDeviceOverrides(dashboard: Dash, device: DashboardDeviceLayout): Dash {
  if (device === 'desktop') return dashboard;
  const layouts = dashboard?.deviceLayouts;
  const override = layouts?.[device];
  if (!override || !override.zoneOverrides) return dashboard;
  const zoneOverrides = override.zoneOverrides as Record<string, ZoneOverride>;

  const nextTiled = applyToTree(dashboard.tiledRoot, zoneOverrides);
  const nextFloating = (dashboard.floatingLayer || []).map((z: Zone) => applyToFloating(z, zoneOverrides[z.id]));

  return { ...dashboard, tiledRoot: nextTiled, floatingLayer: nextFloating };
}

function applyToTree(node: Zone, zoneOverrides: Record<string, ZoneOverride>): Zone {
  const ov = zoneOverrides[node.id];
  const children = Array.isArray(node.children)
    ? node.children.map((c: Zone) => applyToTree(c, zoneOverrides))
    : undefined;
  if (!ov && !children) return node;
  const next = children ? { ...node, children } : { ...node };
  if (ov) {
    if (ov.w !== undefined) next.w = ov.w;
    if (ov.h !== undefined) next.h = ov.h;
    if (ov.visible === false) next.hidden = true;
    else if (ov.visible === true) next.hidden = false;
  }
  return next;
}

function applyToFloating(zone: Zone, ov: ZoneOverride | undefined): Zone {
  if (!ov) return zone;
  const next = { ...zone };
  if (ov.x !== undefined) next.x = ov.x;
  if (ov.y !== undefined) next.y = ov.y;
  if (ov.w !== undefined) next.pxW = ov.w;
  if (ov.h !== undefined) next.pxH = ov.h;
  if (ov.visible === false) next.hidden = true;
  else if (ov.visible === true) next.hidden = false;
  return next;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/deviceLayout.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/deviceLayout.ts \
        frontend/src/components/dashboard/freeform/lib/types.ts \
        frontend/src/components/dashboard/freeform/__tests__/deviceLayout.test.ts
git commit -m "feat(analyst-pro): applyDeviceOverrides + resolveDeviceCanvasSize (Plan 6a T2)"
```

---

## Task 3: `canvasTransform.ts` — screen ↔ sheet coord math (TDD, CRITICAL)

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/canvasTransform.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/canvasTransform.test.ts`

The whole drag/resize/marquee/drop pipeline currently converts `event.clientX/Y` to sheet coords via `sheetRect = e.currentTarget.getBoundingClientRect()` and subtracting `rect.left/top`. When we apply `transform: translate(panX, panY) scale(zoom)` to the sheet, `getBoundingClientRect()` already reflects the transformed box — but the resolved-layout coords (what every pointer handler compares against) are in **pre-transform sheet coords**. Naively using `clientX - rect.left` returns transformed pixels, not sheet pixels, so at any zoom ≠ 1 the hit-test drifts. Roadmap §Plan 6a calls this out as the #1 bug to avoid.

Correct conversion:

```
sheetPoint = (screenPoint - sheetRect.topLeft - pan) / zoom
screenPoint = sheetPoint * zoom + pan + sheetRect.topLeft
```

We expose three helpers used by `FreeformCanvas` + `useDragResize`:
- `screenToSheet({clientX, clientY}, sheetRect, zoom, pan)` — returns `{x, y}` in sheet coords.
- `sheetToScreen({x, y}, sheetRect, zoom, pan)` — inverse.
- `zoomAtAnchor(currentZoom, currentPan, newZoom, screenPoint, sheetRect)` — returns `{zoom, pan}` such that the sheet point currently under the cursor stays under the cursor after the zoom change.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/canvasTransform.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { screenToSheet, sheetToScreen, zoomAtAnchor } from '../lib/canvasTransform';

const rect = { left: 50, top: 80, width: 1200, height: 800 } as DOMRect;

describe('screenToSheet', () => {
  it('identity transform (zoom=1, pan={0,0}) subtracts the rect origin', () => {
    expect(screenToSheet({ clientX: 250, clientY: 280 }, rect, 1, { x: 0, y: 0 }))
      .toEqual({ x: 200, y: 200 });
  });

  it('accounts for pan', () => {
    expect(screenToSheet({ clientX: 250, clientY: 280 }, rect, 1, { x: 40, y: 30 }))
      .toEqual({ x: 160, y: 170 });
  });

  it('accounts for zoom', () => {
    // clientX=250, rect.left=50, pan=0, zoom=2  ⇒  (250-50-0)/2 = 100
    expect(screenToSheet({ clientX: 250, clientY: 280 }, rect, 2, { x: 0, y: 0 }))
      .toEqual({ x: 100, y: 100 });
  });

  it('screenToSheet ∘ sheetToScreen == identity', () => {
    const zoom = 1.75;
    const pan = { x: -42, y: 17 };
    const sheetPt = { x: 321, y: 654 };
    const screen = sheetToScreen(sheetPt, rect, zoom, pan);
    const back = screenToSheet({ clientX: screen.clientX, clientY: screen.clientY }, rect, zoom, pan);
    expect(back.x).toBeCloseTo(sheetPt.x, 6);
    expect(back.y).toBeCloseTo(sheetPt.y, 6);
  });
});

describe('zoomAtAnchor', () => {
  it('keeps sheet point under cursor fixed after zoom change', () => {
    const cursor = { clientX: 250, clientY: 280 };
    const currentZoom = 1;
    const currentPan = { x: 0, y: 0 };
    // At zoom 1, cursor maps to sheet (200, 200).
    const before = screenToSheet(cursor, rect, currentZoom, currentPan);
    expect(before).toEqual({ x: 200, y: 200 });

    const { zoom, pan } = zoomAtAnchor(currentZoom, currentPan, 2, cursor, rect);
    expect(zoom).toBe(2);
    // With the new zoom/pan, cursor must still map to sheet (200, 200).
    const after = screenToSheet(cursor, rect, zoom, pan);
    expect(after.x).toBeCloseTo(200, 6);
    expect(after.y).toBeCloseTo(200, 6);
  });

  it('clamps zoom to [0.1, 4.0]', () => {
    const cursor = { clientX: 250, clientY: 280 };
    expect(zoomAtAnchor(1, { x: 0, y: 0 }, 99, cursor, rect).zoom).toBe(4.0);
    expect(zoomAtAnchor(1, { x: 0, y: 0 }, 0.001, cursor, rect).zoom).toBe(0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/canvasTransform.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `canvasTransform.ts`**

Create `frontend/src/components/dashboard/freeform/lib/canvasTransform.ts`:

```ts
// frontend/src/components/dashboard/freeform/lib/canvasTransform.ts
//
// Plan 6a — screen ↔ sheet coordinate conversion for the Analyst Pro canvas.
//
// The sheet element carries `transform: translate(panX, panY) scale(zoom)`.
// All resolved layout coords (ResolvedZone.x/y/width/height, ResolvedZone.depth, etc.)
// are in pre-transform sheet space. Pointer events deliver client (screen) coords.
// Every hit-test must convert client→sheet before comparing.
//
// The rect argument is always the sheet element's getBoundingClientRect(),
// which already includes the transform. That is the correct origin because the
// rect's top-left IS the on-screen position of sheet-space (0,0) AFTER the
// translate+scale — so subtracting rect.top/left cancels the translate, and
// dividing by zoom cancels the scale. DO NOT pass the pre-transform rect.

export interface PanVector { x: number; y: number; }
export interface ScreenPoint { clientX: number; clientY: number; }
export interface SheetPoint { x: number; y: number; }

/** client coords → pre-transform sheet coords */
export function screenToSheet(
  ev: ScreenPoint,
  rect: { left: number; top: number },
  zoom: number,
  pan: PanVector,
): SheetPoint {
  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    x: (ev.clientX - rect.left - pan.x) / safeZoom,
    y: (ev.clientY - rect.top - pan.y) / safeZoom,
  };
}

/** pre-transform sheet coords → client coords */
export function sheetToScreen(
  pt: SheetPoint,
  rect: { left: number; top: number },
  zoom: number,
  pan: PanVector,
): ScreenPoint {
  return {
    clientX: pt.x * zoom + pan.x + rect.left,
    clientY: pt.y * zoom + pan.y + rect.top,
  };
}

/**
 * Given a desired new zoom and the cursor's client position, produce the
 * zoom+pan pair that keeps the sheet point currently under the cursor stable.
 *
 * Derivation: let sheetPt = screenToSheet(cursor, rect, zoomOld, panOld).
 * We want sheetToScreen(sheetPt, rect, zoomNew, panNew) == cursor, so:
 *   cursor.x = sheetPt.x * zoomNew + panNew.x + rect.left
 *   panNew.x = cursor.x - rect.left - sheetPt.x * zoomNew
 * Same for y.
 */
export function zoomAtAnchor(
  zoomOld: number,
  panOld: PanVector,
  zoomNew: number,
  cursor: ScreenPoint,
  rect: { left: number; top: number },
): { zoom: number; pan: PanVector } {
  const clamped = Math.max(0.1, Math.min(4.0, zoomNew));
  const sheetPt = screenToSheet(cursor, rect, zoomOld, panOld);
  return {
    zoom: clamped,
    pan: {
      x: cursor.clientX - rect.left - sheetPt.x * clamped,
      y: cursor.clientY - rect.top - sheetPt.y * clamped,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/canvasTransform.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/canvasTransform.ts \
        frontend/src/components/dashboard/freeform/__tests__/canvasTransform.test.ts
git commit -m "feat(analyst-pro): screen<->sheet coord math + anchor zoom (Plan 6a T3)"
```

---

## Task 4: `CanvasZoomControls.jsx` — top-right widget

**Files:**
- Create: `frontend/src/components/dashboard/freeform/CanvasZoomControls.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/CanvasZoomControls.test.tsx`

Per roadmap §Plan 6a Deliverable 1: buttons 25 / 50 / 75 / 100 / 150 / 200 %, plus a "Fit" preset (sets zoom to 1.0 and pan to `{0,0}`). Mounted inside `FreeformCanvas` over the sheet (position: absolute, top: 8, right: 8, zIndex: 80).

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/CanvasZoomControls.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CanvasZoomControls from '../CanvasZoomControls';
import { useStore } from '../../../../store';

function reset() {
  useStore.setState({
    analystProCanvasZoom: 1.0,
    analystProCanvasPan: { x: 100, y: 100 },
  });
}

describe('<CanvasZoomControls />', () => {
  beforeEach(reset);

  it('displays the current zoom as a percentage', () => {
    useStore.setState({ analystProCanvasZoom: 1.5 });
    render(<CanvasZoomControls />);
    expect(screen.getByTestId('canvas-zoom-display')).toHaveTextContent('150%');
  });

  it('clicking a preset sets that zoom', () => {
    render(<CanvasZoomControls />);
    fireEvent.click(screen.getByTestId('zoom-preset-50'));
    expect(useStore.getState().analystProCanvasZoom).toBe(0.5);
  });

  it('clicking Fit resets zoom to 1 and pan to {0,0}', () => {
    useStore.setState({ analystProCanvasZoom: 2.5, analystProCanvasPan: { x: -200, y: -150 } });
    render(<CanvasZoomControls />);
    fireEvent.click(screen.getByTestId('zoom-fit'));
    expect(useStore.getState().analystProCanvasZoom).toBe(1.0);
    expect(useStore.getState().analystProCanvasPan).toEqual({ x: 0, y: 0 });
  });

  it('has all seven preset buttons', () => {
    render(<CanvasZoomControls />);
    for (const pct of [25, 50, 75, 100, 150, 200]) {
      expect(screen.getByTestId(`zoom-preset-${pct}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('zoom-fit')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/CanvasZoomControls.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/dashboard/freeform/CanvasZoomControls.jsx`:

```jsx
// frontend/src/components/dashboard/freeform/CanvasZoomControls.jsx
// Plan 6a — top-right floating zoom widget.
import { useStore } from '../../../store';
import { TOKENS } from '../tokens';

const PRESETS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];

export default function CanvasZoomControls() {
  const zoom = useStore((s) => s.analystProCanvasZoom);
  const setZoom = useStore((s) => s.setCanvasZoomAnalystPro);
  const setPan = useStore((s) => s.setCanvasPanAnalystPro);

  const onFit = () => {
    setZoom(1.0);
    setPan(0, 0);
  };

  return (
    <div
      data-testid="canvas-zoom-controls"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        boxShadow: TOKENS.shadow.diffusion,
        fontFamily: TOKENS.fontMono,
        fontSize: 11,
      }}
    >
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          data-testid={`zoom-preset-${Math.round(p * 100)}`}
          onClick={() => setZoom(p)}
          aria-label={`Zoom to ${Math.round(p * 100)}%`}
          aria-pressed={Math.abs(zoom - p) < 1e-6}
          style={presetBtn(Math.abs(zoom - p) < 1e-6)}
        >
          {Math.round(p * 100)}%
        </button>
      ))}
      <button
        type="button"
        data-testid="zoom-fit"
        onClick={onFit}
        aria-label="Fit to screen (Ctrl+0)"
        title="Fit (Ctrl+0)"
        style={presetBtn(false)}
      >
        Fit
      </button>
      <span
        data-testid="canvas-zoom-display"
        style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--text-primary)', borderLeft: '1px solid var(--border-default)', marginLeft: 4 }}
      >
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
}

function presetBtn(active) {
  return {
    padding: '4px 8px',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary)',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    fontFamily: 'inherit',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/CanvasZoomControls.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/CanvasZoomControls.jsx \
        frontend/src/components/dashboard/freeform/__tests__/CanvasZoomControls.test.tsx
git commit -m "feat(analyst-pro): CanvasZoomControls widget with preset + Fit (Plan 6a T4)"
```

---

## Task 5: Wire transform, Ctrl+scroll, Ctrl+0/±, Space-hold + middle-click pan to `FreeformCanvas`

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx`
- Modify: `frontend/src/components/dashboard/freeform/hooks/useDragResize.js`
- Modify: `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx` (add integration assertions)

Requirements:
- Sheet carries `transform: translate(${pan.x}px, ${pan.y}px) scale(${zoom})`. `transform-origin: 0 0`.
- Ctrl+wheel → calls `zoomAtAnchor` with the cursor position and an exponential step: `zoomNew = zoomOld * exp(-deltaY * 0.0015)` (natural feel; clamp happens inside `zoomAtAnchor`).
- Space-hold anywhere inside the canvas + drag = pan. Cursor: `grab` when Space is held idle, `grabbing` while dragging.
- Middle-click (`e.button === 1`) drag = pan (Tableau-familiar).
- Ctrl+0, Ctrl+=, Ctrl+- wired via `useKeyboardShortcuts`.
- Pan/zoom must NOT trigger marquee, drag, or drop handlers — add an early-return at the top of `handleSheetPointerDown` / `handleDragOver` when panning is active.

Pointer-coord migration:
- `handleSheetPointerDown` marquee math: switch from `e.clientX - rect.left` to `screenToSheet({clientX,clientY}, rect, zoom, pan)`.
- `useDragResize.onMove` inside hook: same switch — currently passes `dx = ev.clientX - startRef.current.startX`, which continues to work for *delta* moves IF we divide the delta by zoom (because the tracked `initialZone` is in sheet coords). Simplest correct fix: convert both start and current pointer to sheet coords and compute delta in sheet space.
- `handleDrop` (object-library drop): same — use `screenToSheet`.

- [ ] **Step 1: Write failing integration assertions**

Append to `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx` (or create if only `.integration.test.tsx` existed — inspect first; add a new focused file otherwise):

```tsx
// Inside the existing describe block (or a new describe('Plan 6a — zoom + pan'))
import { fireEvent } from '@testing-library/react';

it('applies transform: translate(pan) scale(zoom) to the sheet', () => {
  useStore.setState({
    analystProCanvasZoom: 1.5,
    analystProCanvasPan: { x: 40, y: 20 },
  });
  const { getByTestId } = render(<FreeformCanvas dashboard={baseDashboard} renderLeaf={() => null} />);
  const sheet = getByTestId('freeform-sheet');
  expect(sheet.style.transform).toContain('translate(40px, 20px)');
  expect(sheet.style.transform).toContain('scale(1.5)');
});

it('Ctrl+wheel zooms the canvas at the cursor', () => {
  useStore.setState({ analystProCanvasZoom: 1.0, analystProCanvasPan: { x: 0, y: 0 } });
  const { getByTestId } = render(<FreeformCanvas dashboard={baseDashboard} renderLeaf={() => null} />);
  const sheet = getByTestId('freeform-sheet');
  fireEvent.wheel(sheet, { ctrlKey: true, deltaY: -100, clientX: 200, clientY: 200 });
  // zoomNew = 1.0 * exp(100 * 0.0015) ≈ 1.1618 (deltaY is negative → zoom in)
  expect(useStore.getState().analystProCanvasZoom).toBeGreaterThan(1.0);
});

it('Space+drag pans the canvas', () => {
  useStore.setState({ analystProCanvasZoom: 1.0, analystProCanvasPan: { x: 0, y: 0 } });
  const { getByTestId } = render(<FreeformCanvas dashboard={baseDashboard} renderLeaf={() => null} />);
  const sheet = getByTestId('freeform-sheet');
  fireEvent.keyDown(window, { code: 'Space' });
  fireEvent.pointerDown(sheet, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX: 150, clientY: 130, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX: 150, clientY: 130, pointerId: 1 });
  fireEvent.keyUp(window, { code: 'Space' });
  expect(useStore.getState().analystProCanvasPan).toEqual({ x: 50, y: 30 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx`
Expected: FAIL — `style.transform` is empty; Ctrl+wheel does nothing; Space+drag does nothing.

- [ ] **Step 3: Wire transform + wheel + pan in `FreeformCanvas.jsx`**

Replace `FreeformCanvas.jsx` content. Key edits, not a full rewrite — apply in place:

1. Add imports:
   ```jsx
   import CanvasZoomControls from './CanvasZoomControls';
   import CanvasRulers from './CanvasRulers';
   import { screenToSheet, zoomAtAnchor } from './lib/canvasTransform';
   ```
2. Read view-state from store near the other `useStore` calls:
   ```jsx
   const canvasZoom = useStore((s) => s.analystProCanvasZoom);
   const canvasPan = useStore((s) => s.analystProCanvasPan);
   const setCanvasZoom = useStore((s) => s.setCanvasZoomAnalystPro);
   const setCanvasPan = useStore((s) => s.setCanvasPanAnalystPro);
   const rulersVisible = useStore((s) => s.analystProRulersVisible);
   ```
3. Add Space-hold state near top of component:
   ```jsx
   const spaceHeldRef = useRef(false);
   useEffect(() => {
     const dn = (e) => { if (e.code === 'Space') spaceHeldRef.current = true; };
     const up = (e) => { if (e.code === 'Space') spaceHeldRef.current = false; };
     window.addEventListener('keydown', dn);
     window.addEventListener('keyup', up);
     return () => {
       window.removeEventListener('keydown', dn);
       window.removeEventListener('keyup', up);
     };
   }, []);
   ```
4. Add wheel handler on the sheet:
   ```jsx
   const handleSheetWheel = (e) => {
     if (!e.ctrlKey) return;
     e.preventDefault();
     const rect = e.currentTarget.getBoundingClientRect();
     const zoomOld = useStore.getState().analystProCanvasZoom;
     const panOld = useStore.getState().analystProCanvasPan;
     const zoomNew = zoomOld * Math.exp(-e.deltaY * 0.0015);
     const { zoom, pan } = zoomAtAnchor(zoomOld, panOld, zoomNew, { clientX: e.clientX, clientY: e.clientY }, rect);
     setCanvasZoom(zoom);
     setCanvasPan(pan.x, pan.y);
   };
   ```
5. Replace `handleSheetPointerDown` — add an early branch for pan (Space OR middle-click):
   ```jsx
   const handleSheetPointerDown = (e) => {
     const isPan = spaceHeldRef.current || e.button === 1;
     if (isPan) {
       e.preventDefault();
       const startX = e.clientX;
       const startY = e.clientY;
       const startPan = useStore.getState().analystProCanvasPan;
       const onMove = (ev) => {
         setCanvasPan(startPan.x + (ev.clientX - startX), startPan.y + (ev.clientY - startY));
       };
       const onUp = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
       };
       window.addEventListener('pointermove', onMove);
       window.addEventListener('pointerup', onUp);
       return;
     }
     if (e.target !== e.currentTarget) return;
     // existing marquee code — but replace rect math with sheet coords:
     clearSelection();
     const rect = e.currentTarget.getBoundingClientRect();
     const zoom = useStore.getState().analystProCanvasZoom;
     const pan = useStore.getState().analystProCanvasPan;
     const origin = screenToSheet({ clientX: e.clientX, clientY: e.clientY }, rect, zoom, pan);
     marqueeStartRef.current = { x: origin.x, y: origin.y };
     setMarquee({ x: origin.x, y: origin.y, width: 0, height: 0 });
     const onMove = (ev) => {
       if (!marqueeStartRef.current) return;
       const p = screenToSheet({ clientX: ev.clientX, clientY: ev.clientY }, rect, zoom, pan);
       setMarquee({
         x: marqueeStartRef.current.x,
         y: marqueeStartRef.current.y,
         width: p.x - marqueeStartRef.current.x,
         height: p.y - marqueeStartRef.current.y,
       });
     };
     // onUp unchanged (uses the live marquee rect from store)
     const onUp = () => {
       if (!marqueeStartRef.current) return;
       const current = useStore.getState().analystProMarquee;
       if (current && (Math.abs(current.width) > 4 || Math.abs(current.height) > 4)) {
         const left = Math.min(current.x, current.x + current.width);
         const right = Math.max(current.x, current.x + current.width);
         const top = Math.min(current.y, current.y + current.height);
         const bottom = Math.max(current.y, current.y + current.height);
         const hits = resolved.filter((r) => {
           const rLeft = r.x, rTop = r.y, rRight = r.x + r.width, rBottom = r.y + r.height;
           return rLeft < right && rRight > left && rTop < bottom && rBottom > top;
         }).map((r) => r.zone.id);
         useStore.getState().setAnalystProSelection(hits);
       }
       setMarquee(null);
       marqueeStartRef.current = null;
       window.removeEventListener('pointermove', onMove);
       window.removeEventListener('pointerup', onUp);
     };
     window.addEventListener('pointermove', onMove);
     window.addEventListener('pointerup', onUp);
   };
   ```
6. Replace `handleDrop` pointer math — same pattern, use `screenToSheet`.
7. Apply transform on the sheet div:
   ```jsx
   <div
     ref={sheetRef}
     data-testid="freeform-sheet"
     className={`freeform-sheet${overlayEnabled ? ' analyst-pro-layout-overlay' : ''}`}
     onPointerDown={handleSheetPointerDown}
     onContextMenu={handleSheetContextMenu}
     onWheel={handleSheetWheel}
     onDragOver={handleDragOver}
     onDrop={handleDrop}
     style={{
       position: 'relative',
       width: canvasSize.width,
       height: canvasSize.height,
       margin: dashboard.size?.mode === 'automatic' ? 0 : '0 auto',
       transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
       transformOrigin: '0 0',
       cursor: spaceHeldRef.current ? 'grab' : undefined,
     }}
   >
   ```
8. Mount `<CanvasZoomControls />` + conditionally `<CanvasRulers canvasWidth={canvasSize.width} canvasHeight={canvasSize.height} />` **outside** the transformed sheet (as siblings of the outer `containerRef` div), so they're not affected by the zoom.
   ```jsx
   return (
     <div ref={containerRef} data-testid="freeform-canvas" ...>
       {rulersVisible && <CanvasRulers canvasWidth={canvasSize.width} canvasHeight={canvasSize.height} zoom={canvasZoom} pan={canvasPan} />}
       <CanvasZoomControls />
       <div ref={sheetRef} ...>{/* existing children */}</div>
     </div>
   );
   ```

- [ ] **Step 4: Update `useDragResize.js` to use sheet-space deltas**

In the `onMove` closure inside `onZonePointerDown`, replace the current delta math:

```js
// OLD:
// const dx = ev.clientX - startRef.current.startX;
// const dy = ev.clientY - startRef.current.startY;

// NEW: convert to sheet space so zoom doesn't amplify/shrink drag distance.
const zoom = useStore.getState().analystProCanvasZoom || 1;
const dx = (ev.clientX - startRef.current.startX) / zoom;
const dy = (ev.clientY - startRef.current.startY) / zoom;
```

This is the minimal correct change. `startX/startY` and `ev.clientX/Y` are both in client coords, so their difference has the `translate()` component canceled; only the `scale()` needs dividing out.

- [ ] **Step 5: Wire Ctrl+0, Ctrl+=, Ctrl+- in `useKeyboardShortcuts.js`**

Inside the existing key-handler switch in `useKeyboardShortcuts.js`, add cases (before the final default). Preserve existing handlers:

```js
import { useStore } from '../../../../store';

// inside the keydown handler, after existing Ctrl+Z / Ctrl+Y branches:
if ((e.ctrlKey || e.metaKey) && e.key === '0') {
  e.preventDefault();
  useStore.getState().setCanvasZoomAnalystPro(1.0);
  useStore.getState().setCanvasPanAnalystPro(0, 0);
  return;
}
if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
  e.preventDefault();
  const z = useStore.getState().analystProCanvasZoom;
  useStore.getState().setCanvasZoomAnalystPro(z * 1.2);
  return;
}
if ((e.ctrlKey || e.metaKey) && e.key === '-') {
  e.preventDefault();
  const z = useStore.getState().analystProCanvasZoom;
  useStore.getState().setCanvasZoomAnalystPro(z / 1.2);
  return;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`
Expected: PASS on the three new Plan 6a assertions; all pre-existing tests still PASS.

Also run the full freeform suite to catch regressions:
Run: `cd frontend && npx vitest run src/components/dashboard/freeform/`
Expected: same pass count as before the task + the three new assertions.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/freeform/FreeformCanvas.jsx \
        frontend/src/components/dashboard/freeform/hooks/useDragResize.js \
        frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js \
        frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx
git commit -m "feat(analyst-pro): apply canvas transform + Ctrl-wheel/Space-pan/Ctrl-0 (Plan 6a T5)"
```

---

## Task 6: `CanvasRulers.jsx` — horizontal + vertical rulers (TDD)

**Files:**
- Create: `frontend/src/components/dashboard/freeform/CanvasRulers.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/CanvasRulers.test.tsx`

Ruler rules (roadmap §Plan 6a Deliverable 5):
- Top horizontal strip 24 px tall and left vertical strip 24 px wide.
- Ticks every 50 sheet-pixels; numeric labels every 100 sheet-pixels.
- Positions respect both zoom and pan (a tick at sheet-x=100 lands at screen-x `100*zoom + pan.x` inside the ruler strip).
- Implementation: each ruler is an absolutely-positioned div whose child span per tick has `left: pos + 'px'` — we render into the non-transformed container coord space, so we bake zoom+pan into the tick positions. Range of ticks covered: sheet-x ∈ `[ceil(-pan.x / zoom / 50)*50 , ceil((canvasVisibleWidth - pan.x) / zoom / 50)*50]`. Round outwards by 1 tick for edge safety.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/CanvasRulers.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CanvasRulers from '../CanvasRulers';

describe('<CanvasRulers />', () => {
  it('renders both rulers', () => {
    render(<CanvasRulers canvasWidth={800} canvasHeight={600} zoom={1} pan={{ x: 0, y: 0 }} />);
    expect(screen.getByTestId('canvas-ruler-h')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-ruler-v')).toBeInTheDocument();
  });

  it('emits labels every 100 sheet px at zoom 1, pan 0', () => {
    render(<CanvasRulers canvasWidth={800} canvasHeight={600} zoom={1} pan={{ x: 0, y: 0 }} />);
    // horizontal labels visible: 0, 100, 200, 300, 400, 500, 600, 700
    for (const px of [0, 100, 400, 700]) {
      expect(screen.getByTestId(`ruler-h-label-${px}`)).toBeInTheDocument();
    }
  });

  it('scales label positions with zoom', () => {
    render(<CanvasRulers canvasWidth={800} canvasHeight={600} zoom={2} pan={{ x: 0, y: 0 }} />);
    const label100 = screen.getByTestId('ruler-h-label-100');
    // at zoom 2, sheet-x=100 is at screen-x=200 inside the ruler strip
    expect(label100).toHaveStyle({ left: '200px' });
  });

  it('offsets labels by pan', () => {
    render(<CanvasRulers canvasWidth={800} canvasHeight={600} zoom={1} pan={{ x: 50, y: 0 }} />);
    const label100 = screen.getByTestId('ruler-h-label-100');
    expect(label100).toHaveStyle({ left: '150px' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/CanvasRulers.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/dashboard/freeform/CanvasRulers.jsx`:

```jsx
// frontend/src/components/dashboard/freeform/CanvasRulers.jsx
// Plan 6a — horizontal + vertical rulers synchronized to canvas zoom & pan.
import { TOKENS } from '../tokens';

const TICK_PX = 50;
const LABEL_PX = 100;
const STRIP = 24;

export default function CanvasRulers({ canvasWidth = 800, canvasHeight = 600, zoom = 1, pan = { x: 0, y: 0 } }) {
  const safeZoom = zoom > 0 ? zoom : 1;
  // Visible sheet-x range, padded by one tick.
  const startX = Math.floor((-pan.x) / safeZoom / TICK_PX) * TICK_PX - TICK_PX;
  const endX = Math.ceil((canvasWidth - pan.x) / safeZoom / TICK_PX) * TICK_PX + TICK_PX;
  const startY = Math.floor((-pan.y) / safeZoom / TICK_PX) * TICK_PX - TICK_PX;
  const endY = Math.ceil((canvasHeight - pan.y) / safeZoom / TICK_PX) * TICK_PX + TICK_PX;

  const ticksX = range(startX, endX, TICK_PX);
  const ticksY = range(startY, endY, TICK_PX);

  return (
    <>
      <div
        data-testid="canvas-ruler-h"
        style={{
          position: 'absolute',
          top: 0,
          left: STRIP,
          right: 0,
          height: STRIP,
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-default)',
          overflow: 'hidden',
          zIndex: 70,
          fontFamily: TOKENS.fontMono,
          fontSize: 9,
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }}
      >
        {ticksX.map((sheetX) => {
          const screenX = sheetX * safeZoom + pan.x;
          const isLabel = sheetX % LABEL_PX === 0;
          return (
            <span
              key={`h${sheetX}`}
              data-testid={isLabel ? `ruler-h-label-${sheetX}` : undefined}
              style={{
                position: 'absolute',
                left: screenX,
                top: isLabel ? 4 : 14,
                height: isLabel ? 20 : 10,
                borderLeft: '1px solid var(--border-default)',
                paddingLeft: isLabel ? 2 : 0,
                fontSize: 9,
              }}
            >
              {isLabel ? sheetX : ''}
            </span>
          );
        })}
      </div>
      <div
        data-testid="canvas-ruler-v"
        style={{
          position: 'absolute',
          top: STRIP,
          left: 0,
          bottom: 0,
          width: STRIP,
          background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border-default)',
          overflow: 'hidden',
          zIndex: 70,
          fontFamily: TOKENS.fontMono,
          fontSize: 9,
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }}
      >
        {ticksY.map((sheetY) => {
          const screenY = sheetY * safeZoom + pan.y;
          const isLabel = sheetY % LABEL_PX === 0;
          return (
            <span
              key={`v${sheetY}`}
              data-testid={isLabel ? `ruler-v-label-${sheetY}` : undefined}
              style={{
                position: 'absolute',
                top: screenY,
                left: isLabel ? 4 : 14,
                width: isLabel ? 20 : 10,
                borderTop: '1px solid var(--border-default)',
                paddingTop: isLabel ? 2 : 0,
                writingMode: 'vertical-rl',
                fontSize: 9,
              }}
            >
              {isLabel ? sheetY : ''}
            </span>
          );
        })}
      </div>
      {/* corner square where the rulers intersect */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: STRIP, height: STRIP, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', zIndex: 71 }} />
    </>
  );
}

function range(start, end, step) {
  const out = [];
  for (let v = start; v <= end; v += step) out.push(v);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/CanvasRulers.test.tsx`
Expected: PASS — 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/CanvasRulers.jsx \
        frontend/src/components/dashboard/freeform/__tests__/CanvasRulers.test.tsx
git commit -m "feat(analyst-pro): CanvasRulers horizontal + vertical synced to zoom/pan (Plan 6a T6)"
```

---

## Task 7: Rulers toolbar toggle in `AnalystProLayout.jsx`

**Files:**
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

Add a small toolbar button next to `SizeToggleDropdown` that toggles `analystProRulersVisible`. Active state lights the button in accent color (same pattern as the existing `SNAP ON/OFF` button at L136).

- [ ] **Step 1: Add the button to the top toolbar**

In the top toolbar block (between `SizeToggleDropdown` and the first `<Separator />`):

```jsx
const rulersVisible = useStore((s) => s.analystProRulersVisible);
const toggleRulers = useStore((s) => s.toggleRulersAnalystPro);

// … inside the toolbar:
<button
  type="button"
  data-testid="rulers-toggle"
  onClick={toggleRulers}
  className="premium-btn"
  style={{
    padding: '6px 12px',
    background: rulersVisible ? 'var(--accent)' : 'var(--bg-elevated)',
    color: rulersVisible ? '#fff' : 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
  }}
  aria-label={`Toggle rulers (currently ${rulersVisible ? 'on' : 'off'})`}
  aria-pressed={rulersVisible}
  title="Rulers"
>
  RULERS {rulersVisible ? 'ON' : 'OFF'}
</button>
```

- [ ] **Step 2: Verify manually + lint**

Run: `cd frontend && npm run lint -- --max-warnings=0 src/components/dashboard/modes/AnalystProLayout.jsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): rulers toggle in top toolbar (Plan 6a T7)"
```

---

## Task 8: `DevicePreviewToggle.jsx` — Desktop / Tablet / Phone dropdown

**Files:**
- Create: `frontend/src/components/dashboard/freeform/DevicePreviewToggle.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/DevicePreviewToggle.test.tsx`
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` (mount)

Per roadmap §Plan 6a Deliverable 6: Desktop (≥ 1366), Tablet (768–1365), Phone (≤ 767). Switching device:
1. Sets `analystProActiveDevice` slice.
2. `FreeformCanvas` now resolves canvas size through `resolveDeviceCanvasSize(dashboard.size, device)` (Task 2 helper) and applies overrides via `applyDeviceOverrides(dashboard, device)`.
3. Wire the toggle as a sibling of `SizeToggleDropdown` in the top toolbar.

The component itself is a simple three-button segmented control. No Fixed preset change to `dashboard.size` — the device selector is a *preview* mode, so the underlying dashboard size stays intact.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/DevicePreviewToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DevicePreviewToggle from '../DevicePreviewToggle';
import { useStore } from '../../../../store';

describe('<DevicePreviewToggle />', () => {
  beforeEach(() => {
    useStore.setState({ analystProActiveDevice: 'desktop' });
  });

  it('renders three device buttons', () => {
    render(<DevicePreviewToggle />);
    expect(screen.getByTestId('device-desktop')).toBeInTheDocument();
    expect(screen.getByTestId('device-tablet')).toBeInTheDocument();
    expect(screen.getByTestId('device-phone')).toBeInTheDocument();
  });

  it('highlights the active device', () => {
    useStore.setState({ analystProActiveDevice: 'tablet' });
    render(<DevicePreviewToggle />);
    expect(screen.getByTestId('device-tablet')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('device-desktop')).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the active device on click', () => {
    render(<DevicePreviewToggle />);
    fireEvent.click(screen.getByTestId('device-phone'));
    expect(useStore.getState().analystProActiveDevice).toBe('phone');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/DevicePreviewToggle.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/dashboard/freeform/DevicePreviewToggle.jsx`:

```jsx
// frontend/src/components/dashboard/freeform/DevicePreviewToggle.jsx
// Plan 6a — Desktop / Tablet / Phone segmented toggle.
// Mirrors Tableau's DashboardDeviceLayout (Build_Tableau.md §IX.5, Appendix A.13).
import { useStore } from '../../../store';
import { TOKENS } from '../tokens';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', hint: '≥ 1366 px' },
  { id: 'tablet', label: 'Tablet', hint: '1024 × 768' },
  { id: 'phone', label: 'Phone', hint: '375 × 667' },
];

export default function DevicePreviewToggle() {
  const active = useStore((s) => s.analystProActiveDevice);
  const setActive = useStore((s) => s.setActiveDeviceAnalystPro);

  return (
    <div
      data-testid="device-preview-toggle"
      role="radiogroup"
      aria-label="Device preview"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 2,
        fontFamily: TOKENS.fontMono,
        fontSize: 11,
      }}
    >
      {DEVICES.map((d) => {
        const activeBtn = d.id === active;
        return (
          <button
            key={d.id}
            type="button"
            data-testid={`device-${d.id}`}
            role="radio"
            aria-checked={activeBtn}
            aria-pressed={activeBtn}
            onClick={() => setActive(d.id)}
            title={`${d.label} — ${d.hint}`}
            style={{
              padding: '4px 10px',
              background: activeBtn ? 'var(--accent)' : 'transparent',
              color: activeBtn ? '#fff' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Mount in top toolbar**

In `AnalystProLayout.jsx`, import and insert after `SizeToggleDropdown`:

```jsx
import DevicePreviewToggle from '../freeform/DevicePreviewToggle';

// … inside toolbar, after <SizeToggleDropdown ...>:
<DevicePreviewToggle />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/DevicePreviewToggle.test.tsx`
Expected: PASS — 3 assertions green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/DevicePreviewToggle.jsx \
        frontend/src/components/dashboard/freeform/__tests__/DevicePreviewToggle.test.tsx \
        frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): DevicePreviewToggle segmented control (Plan 6a T8)"
```

---

## Task 9: Apply device overrides + device-aware canvas size in `FreeformCanvas`

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx`
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` (pass dashboard through without suppressing device size)
- Modify: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx` (respect `zone.hidden`)
- Modify: `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx` (add device-preview assertion)

Per §IX.5 + Appendix E.15: device overrides only affect render. Hidden zones still run their data pipeline (`AnalystProWorksheetTile` still fetches SQL). Only `ZoneFrame` must skip actual visual rendering when `zone.hidden === true`.

- [ ] **Step 1: Write failing test**

Append to `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`:

```tsx
describe('Plan 6a — device preview', () => {
  const dashWithOverride = {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'D',
    archetype: 'analyst-pro',
    size: { mode: 'fixed', preset: 'desktop', width: 1366, height: 768 },
    tiledRoot: {
      id: 'root', type: 'container-vert', w: 100000, h: 100000,
      children: [
        { id: 'z1', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 's1' },
        { id: 'z2', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 's2' },
      ],
    },
    floatingLayer: [],
    worksheets: [],
    parameters: [], sets: [], actions: [],
    deviceLayouts: { phone: { zoneOverrides: { z2: { visible: false } } } },
  };

  it('resizes canvas to phone dimensions when device=phone', () => {
    useStore.setState({ analystProActiveDevice: 'phone' });
    const { getByTestId } = render(<FreeformCanvas dashboard={dashWithOverride} renderLeaf={() => null} />);
    const sheet = getByTestId('freeform-sheet');
    expect(sheet.style.width).toBe('375px');
    expect(sheet.style.height).toBe('667px');
  });

  it('hides zone z2 on phone but keeps it resolved (data pipeline still runs)', () => {
    useStore.setState({ analystProActiveDevice: 'phone' });
    const rendered = [];
    render(
      <FreeformCanvas
        dashboard={dashWithOverride}
        renderLeaf={(zone) => {
          rendered.push({ id: zone.id, hidden: !!zone.hidden });
          return <div data-testid={`leaf-${zone.id}`} data-hidden={zone.hidden ? '1' : '0'} />;
        }}
      />
    );
    const z2 = rendered.find((r) => r.id === 'z2');
    expect(z2).toBeDefined();
    expect(z2.hidden).toBe(true); // renderLeaf receives hidden=true; it can still mount the tile.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`
Expected: FAIL — sheet width=1366 (not 375); z2 has no `hidden` prop.

- [ ] **Step 3: Wire device-aware resolution in FreeformCanvas**

In `FreeformCanvas.jsx`:

1. Import:
   ```jsx
   import { applyDeviceOverrides, resolveDeviceCanvasSize } from './lib/deviceLayout';
   ```
2. Read active device:
   ```jsx
   const activeDevice = useStore((s) => s.analystProActiveDevice);
   ```
3. Replace the `dashboard.size` read and the `resolveLayout(dashboard.tiledRoot, ...)` call:
   ```jsx
   const effectiveDashboard = useMemo(
     () => applyDeviceOverrides(dashboard, activeDevice),
     [dashboard, activeDevice]
   );
   const effectiveSize = useMemo(
     () => resolveDeviceCanvasSize(effectiveDashboard.size, activeDevice),
     [effectiveDashboard.size, activeDevice]
   );
   const canvasSize = useMemo(() => resolveCanvasSize(effectiveSize, viewportSize), [effectiveSize, viewportSize]);
   const resolved = useMemo(() => {
     return resolveLayout(
       effectiveDashboard.tiledRoot,
       effectiveDashboard.floatingLayer || [],
       canvasSize.width,
       canvasSize.height,
     );
   }, [effectiveDashboard.tiledRoot, effectiveDashboard.floatingLayer, canvasSize.width, canvasSize.height]);
   ```
4. Replace every downstream reference to `dashboard.tiledRoot` / `dashboard.floatingLayer` inside the component with `effectiveDashboard.tiledRoot` / `effectiveDashboard.floatingLayer`. The `renderLeaf` prop call signature stays the same — the resolved zones now carry `hidden: true` on phone-hidden leaves.

- [ ] **Step 4: Make `ZoneFrame` respect `hidden`**

In `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`, add at the top of the render:

```jsx
if (zone?.hidden === true) {
  // Render a zero-size placeholder: data pipeline still runs because the
  // parent `AnalystProWorksheetTile` mounts one level up; we only suppress
  // the visual frame (Build_Tableau.md §IX.5 HiddenByUser semantics).
  return (
    <div
      data-testid={`zone-hidden-${zone.id}`}
      data-hidden="true"
      aria-hidden="true"
      style={{ display: 'none' }}
    />
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/FreeformCanvas.jsx \
        frontend/src/components/dashboard/freeform/ZoneFrame.jsx \
        frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx
git commit -m "feat(analyst-pro): device-aware canvas size + override merge + hidden leaves (Plan 6a T9)"
```

---

## Task 10: Backend — preserve `deviceLayouts` through migration + allowlist

**Files:**
- Modify: `backend/user_storage.py` (line 628 allowlist)
- Modify: `backend/dashboard_migration.py` (pass deviceLayouts through)
- Create: `backend/tests/test_dashboard_migration_device_layouts.py`

Legacy dashboards have no `deviceLayouts`. Migration from the legacy tile format must default the field to `None` (not create an empty object — that would churn save files unnecessarily). Already-migrated dashboards with an existing `deviceLayouts` value must round-trip untouched through `legacy_to_chart_spec()`.

The allowlist in `user_storage.py` currently lets these Analyst-Pro fields flow through `update_dashboard()`:

```
"schemaVersion", "archetype", "size",
"tiledRoot", "floatingLayer", "worksheets",
"parameters", "sets", "actions", "globalStyle",
"layout",
```

Add `"deviceLayouts"`.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_dashboard_migration_device_layouts.py`:

```python
# backend/tests/test_dashboard_migration_device_layouts.py
"""Plan 6a — device-layout round-trip tests."""
import pytest
from backend.dashboard_migration import legacy_to_chart_spec


def _legacy_dash_with_device_layouts():
    return {
        "id": "d1",
        "name": "Test",
        "tabs": [
            {
                "id": "t1", "name": "Main",
                "tiles": [
                    {"id": "tile-1", "title": "A", "chart_spec": {"mark": "bar"}, "sql": "SELECT 1", "x": 0, "y": 0, "w": 6, "h": 4},
                    {"id": "tile-2", "title": "B", "chart_spec": {"mark": "line"}, "sql": "SELECT 2", "x": 6, "y": 0, "w": 6, "h": 4},
                ],
            }
        ],
        "deviceLayouts": {
            "phone": {
                "zoneOverrides": {
                    "tile-2": {"visible": False},
                    "tile-1": {"x": 0, "y": 0, "w": 375, "h": 300},
                }
            }
        },
    }


def test_migration_preserves_device_layouts():
    legacy = _legacy_dash_with_device_layouts()
    result = legacy_to_chart_spec(legacy)
    assert "deviceLayouts" in result
    assert result["deviceLayouts"]["phone"]["zoneOverrides"]["tile-2"]["visible"] is False
    assert result["deviceLayouts"]["phone"]["zoneOverrides"]["tile-1"]["w"] == 375


def test_migration_defaults_to_none_when_missing():
    legacy = {
        "id": "d2", "name": "No-device",
        "tabs": [{"id": "t1", "name": "M", "tiles": [{"id": "x", "chart_spec": {}, "sql": "SELECT 1", "x": 0, "y": 0, "w": 6, "h": 4}]}],
    }
    result = legacy_to_chart_spec(legacy)
    assert result.get("deviceLayouts") is None or result.get("deviceLayouts") == {}


def test_user_storage_allowlist_includes_device_layouts():
    import inspect
    from backend import user_storage
    src = inspect.getsource(user_storage.update_dashboard)
    assert '"deviceLayouts"' in src, "update_dashboard allowlist must include 'deviceLayouts' after Plan 6a T10"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_dashboard_migration_device_layouts.py -v`
Expected: FAIL on at least the first assertion — `deviceLayouts` key missing in the migrated result.

- [ ] **Step 3: Modify `backend/dashboard_migration.py`**

At the tail of `legacy_to_chart_spec()` (line ~444), before the final `return`, add:

```python
    existing_device_layouts = legacy.get("deviceLayouts") if isinstance(legacy.get("deviceLayouts"), dict) else None
```

Then add the key to the returned dict:

```python
    result = {
        "schemaVersion": "askdb/dashboard/v1",
        "id": str(dashboard_id),
        "name": name,
        "archetype": "analyst-pro",
        "size": {"mode": "automatic"},
        "tiledRoot": tiled_root,
        "floatingLayer": floating_layer,
        "worksheets": worksheets,
        "parameters": existing_parameters,
        "sets": existing_sets,
        "actions": existing_actions,
        "globalStyle": {},
    }
    if existing_device_layouts is not None:
        result["deviceLayouts"] = existing_device_layouts
    return result
```

(Rewriting as a named local `result` rather than inline-returning preserves the conditional-key pattern; change the existing `return {...}` accordingly.)

- [ ] **Step 4: Modify `backend/user_storage.py` allowlist**

At line 624 – 632, change the tuple to include `"deviceLayouts"`:

```python
                for key in (
                    "name", "description", "tabs", "annotations", "sharing",
                    "customMetrics", "globalFilters", "themeConfig", "bookmarks", "settings",
                    # Analyst Pro freeform schema fields (Plan 3 T9)
                    "schemaVersion", "archetype", "size",
                    "tiledRoot", "floatingLayer", "worksheets",
                    "parameters", "sets", "actions", "globalStyle",
                    "layout",
                    # Plan 6a — device-layout overrides (Build_Tableau §IX.5)
                    "deviceLayouts",
                ):
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_dashboard_migration_device_layouts.py -v`
Expected: PASS on all three tests.

Then run the full backend suite to confirm no regressions:
Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -v`
Expected: same total count as before + 3 new tests, all green.

- [ ] **Step 6: Commit**

```bash
git add backend/dashboard_migration.py backend/user_storage.py backend/tests/test_dashboard_migration_device_layouts.py
git commit -m "feat(analyst-pro): backend preserves deviceLayouts on migration + save (Plan 6a T10)"
```

---

## Task 11: Smoke verification (frontend + backend) + roadmap status update

**Files:**
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` (flip Plan 6a status)

- [ ] **Step 1: Run the full freeform test suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/`
Expected: no net regression vs the baseline failure count noted at plan-write time. Plan 6a tests added: `store.canvasZoomPan.test.ts` (7), `deviceLayout.test.ts` (5), `canvasTransform.test.ts` (5), `CanvasZoomControls.test.tsx` (4), `CanvasRulers.test.tsx` (4), `DevicePreviewToggle.test.tsx` (3), `FreeformCanvas.test.tsx` +3 assertions, `FreeformCanvas.integration.test.tsx` +2 assertions → ≥ 30 new passing assertions.

- [ ] **Step 2: Lint the frontend**

Run: `cd frontend && npm run lint -- --max-warnings=0`
Expected: zero errors. Fix any before continuing.

- [ ] **Step 3: Run the full backend test suite**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -v`
Expected: 438+ prior tests + 3 new Plan 6a tests, all green.

- [ ] **Step 4: Flip Plan 6a status in the roadmap**

In `docs/analyst_pro_tableau_parity_roadmap.md`, under Phase 6 heading, add a status note next to Plan 6a. Minimal edit — change the Phase-6 line or add a status list:

```md
| 6 | Canvas Power Controls | 6a ✅ (2026-04-17) / 6b–6e | …
```

- [ ] **Step 5: Commit**

```bash
git add docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "chore(analyst-pro): Plan 6a smoke verification + roadmap status (Plan 6a T11)"
```

---

## Self-Review Checklist (author filled in before save)

- **Spec coverage**
  - [x] Deliverable 1 (Zoom controls + Ctrl+wheel/Ctrl+0/Ctrl+±) — T4 (widget) + T5 (wheel/kbd).
  - [x] Deliverable 2 (Space-hold + middle-click pan) — T5.
  - [x] Deliverable 3 (zoom/pan store slices + anchor-aware setter) — T1.
  - [x] Deliverable 4 (transform + transform-aware hit-test) — T3 helpers + T5 migration of marquee/drop/drag-resize.
  - [x] Deliverable 5 (Rulers with zoom/pan respect + toolbar toggle) — T6 + T7.
  - [x] Deliverable 6 (Desktop/Tablet/Phone dropdown + overrides) — T8 + T9.
  - [x] Deliverable 7 (`deviceLayouts` schema shape) — T2 types.
  - [x] Deliverable 8 (HiddenByUser — render suppressed, data pipeline running) — T2 merge + T9 `ZoneFrame.hidden` branch (keeps tile mount via parent `AnalystProWorksheetTile`, only suppresses the visual frame).
  - [x] Deliverable 9 (backend migration + allowlist) — T10.

- **Placeholder scan** — no "TBD" / "appropriate error handling" / "similar to Task N" left. Every code block is complete, including the full list of imports and the exact lines to insert.

- **Type/name consistency**
  - `setCanvasZoomAnalystPro`, `setCanvasPanAnalystPro`, `toggleRulersAnalystPro`, `setActiveDeviceAnalystPro` — used consistently across T1, T4, T5, T6, T7, T8.
  - State fields `analystProCanvasZoom`, `analystProCanvasPan`, `analystProRulersVisible`, `analystProActiveDevice` — consistent.
  - `DeviceLayoutOverride`, `ZoneOverride`, `DashboardDeviceLayout` — defined in T2, used in T2/T9/T10.
  - `screenToSheet`, `sheetToScreen`, `zoomAtAnchor` — defined in T3, used in T5.

- **Canonical Tableau naming** — `DashboardDeviceLayout` enum values mirror Appendix A.13 (`Desktop`/`Tablet`/`Phone`; `Default` collapses to Desktop). `HiddenByUser` semantics covered verbatim in T2 and T9 comments.

- **Hard convention compliance**
  - [x] TDD cycle for every library task (T1/T2/T3/T9) + every component (T4/T6/T8) + backend (T10).
  - [x] Transform-aware pointer events explicitly migrated in T5 Steps 3 (marquee/drop) + 4 (useDragResize delta).
  - [x] One commit per TDD cycle.
  - [x] Vega-Lite only (no chart changes).

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-17-analyst-pro-plan-6a-canvas-zoom-pan-rulers.md`. This plan doc is the scheduled task output — implementation runs in a separate session.

**Two execution options for the follow-up session:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks. Fast iteration; each task is small enough (≤ 6 steps) to hand off cleanly.
2. **Inline Execution** — run all 11 tasks in a single session using `superpowers:executing-plans` with checkpoints at T3 (transform math landed), T5 (canvas transform live), T9 (device preview live), T10 (backend persistence landed), T11 (smoke + roadmap update).

**Recommendation:** Subagent-driven. T3 and T5 are the two highest-risk tasks (coord math + pointer migration); failing those independently keeps blast radius small.

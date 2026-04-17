# Plan 5c — Right-Click Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a portal-rendered, fully keyboard-navigable right-click `ContextMenu.jsx` over every Analyst Pro zone (via `ZoneFrame.onContextMenu` exposed by Plan 5a) and over empty canvas area (via a new handler on `FreeformCanvas.jsx`) — with a per-zone-type menu catalogue (common items + worksheet / container / floating extensions + canvas paste/add items) produced by a pure, TDD'd helper `lib/contextMenuBuilder.ts` that matches Tableau Desktop's right-click surface (`Build_Tableau.md` §IX.3, §X Appendix A.7, §XI, §XI.9).

**Architecture:** Three layers, mirroring Tableau's `tabuiactions` ↔ `tabdocactions` separation (`Build_Tableau.md` §XI.9 — "action logic as pure state machine, UI on top"):

1. **Pure model — `lib/contextMenuBuilder.ts`.** Takes `(zone, dashboard, selection)` and returns an immutable `MenuItem[]` discriminated union (`command | submenu | separator | checkbox`). No React, no store access. Every menu item carries a stable `id` string that a dispatcher maps to a store action; commands requiring store actions not yet implemented (Plan 5d `setFitModeAnalystPro`, Plan 5d `removeZoneAnalystPro`, Plan 5e `toggleZoneFloatAnalystPro`, Plan 5e z-order / container commands) carry a `todo` field (`{ plan: '5d', reason: '…' }`) so the dispatcher can log a single console.debug line rather than crash. This isolation is what lets us TDD every zone-type branch without spinning up React.

2. **State slice — `store.js`.** `analystProContextMenu: { x, y, zoneId: string | null, items: MenuItem[] } | null`. `openContextMenuAnalystPro(x, y, zoneId)` computes `items` via `buildContextMenu(zone, dashboard, selection)` and `set({ analystProContextMenu: { x, y, zoneId, items } })`. `closeContextMenuAnalystPro()` nulls it. `zoneId === null` is the canvas-empty variant — builder returns Paste / Add Text / Add Image / Add Blank only.

3. **Presentation — `ContextMenu.jsx`.** React portal attached to `document.body`. Reads the slice; if null renders nothing. Otherwise renders a `role="menu"` `<div>` at `(x, y)` (clamped to viewport via a tiny `clampToViewport` util), with `role="menuitem"` / `role="menuitemcheckbox"` rows, submenu flyouts on hover / `ArrowRight`, keyboard nav (↑/↓ to cycle items, ←/→ to collapse/enter submenus, `Enter`/`Space` to invoke, `Esc` to close, focus trap while open), auto-close on click-away (`pointerdown` outside) + `scroll` (window listener during open) + `blur`. A small internal `dispatchMenuCommand(id, ctx)` helper looks up the store action or stubbed `console.debug('[context-menu] TODO Plan …', id)`.

The flow: user right-clicks a `ZoneFrame` → `onContextMenu(event, zone)` fires → canvas handler calls `openContextMenuAnalystPro(event.clientX, event.clientY, zone.id)` → React re-renders `<ContextMenu>` (mounted once in `AnalystProLayout.jsx`) → user picks an item → dispatcher runs → `closeContextMenuAnalystPro()` → state nulls. Canvas-empty path: `FreeformCanvas.handleSheetContextMenu` fires when `e.target === e.currentTarget` (same guard as `handleSheetPointerDown`).

**Tech Stack:** React 19 (`createPortal` from `react-dom`), Zustand `store.js`, TypeScript `lib/contextMenuBuilder.ts` + co-located `__tests__/contextMenuBuilder.test.ts` (TDD, Vitest 2.x), `@testing-library/react` + `userEvent` for `ContextMenu.test.tsx`, plain CSS in `index.css` (no CSS-in-JS, no new deps). `@floating-ui/react` is already a dep (used by Plan 6e tooltip scaffolding), but we deliberately **do not** use it here — a hand-rolled `clampToViewport` keeps the portal lean and the DOM tree testable with `screen.getByRole('menu')`.

**References (authoritative):**
- Parent roadmap: `docs/analyst_pro_tableau_parity_roadmap.md` § "Plan 5c — Right-Click Context Menu" (deliverables 1–6 map 1:1 onto Tasks T1–T12 below).
- Tableau source of truth: `docs/Build_Tableau.md`
  - §IX.3 (Containers — "Distribute Evenly", flow container semantics drive the container-only menu branch),
  - §IX.6 (Padding / background / border — the Padding submenu + Background / Border entries exist because Tableau exposes StyledBox per-zone),
  - §X + Appendix A.7 (`DashboardObjectType` enum drives menu branching: `worksheet` gets Swap Sheets / Filter / Actions; `blank` / `image` / `extension` do not),
  - §XI + Appendix A.9–A.11 (Actions taxonomy — the `Actions…` menu item opens the existing `ActionsDialog`),
  - §XI.9 (`tabuiactions` / `tabdocactions` UI-layer separation — our `ContextMenu` is the UI; `contextMenuBuilder` is the headless state machine),
  - Appendix E.15 visibilityRule preservation — when the user invokes **Remove from Dashboard** via context menu, any `zone.visibilityRule` authored in Plan 4d must be preserved through the removal into the undo stack (i.e. Undo restores the zone with its rule intact). Plan 5d's `removeZoneAnalystPro` will own the implementation; Plan 5c stubs the command id and records the invariant as a comment in the dispatcher.
- Precedent plans:
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5a-zone-chrome.md` — `ZoneFrame.jsx` already exposes `onContextMenu(event, zone)` and Enter-key menu trigger; Plan 5c plugs into both.
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5b-drop-indicators-restructure.md` — precedent for drag-state slice naming + overlay mount pattern.
  - `docs/superpowers/plans/2026-04-16-analyst-pro-plan-4d-dynamic-zone-visibility.md` — `visibilityRule` field on `BaseZone` (`lib/types.ts:52`) whose preservation on Remove is called out above.
  - `docs/superpowers/plans/2026-04-16-analyst-pro-plan-3-actions-runtime.md` — `ActionsDialog` + `setActionsDialogOpen(true)` which the `Actions…` menu entry dispatches.
- Project conventions: `QueryCopilot V1/CLAUDE.md` → store action suffix `…AnalystPro`, slice prefix `analystPro…`, Vega-Lite only, BYOK untouched.

**Non-goals (defer to later plans, stubbed in dispatcher):**
- `setFitModeAnalystPro(zoneId, fitMode)` — real fit-mode behavior lands in Plan 5d (Zone Properties Panel rewrite); the Fit submenu items in 5c emit a `setFitMode` command id that is a no-op + console.debug until 5d wires the action.
- `setZonePropertyAnalystPro(zoneId, patch)` — drives Background / Border / Padding entries (they open inspectors in 5d). For 5c these entries dispatch `openPropertiesTabAnalystPro('style' | 'layout')` which is also stubbed until 5d's tabbed inspector ships.
- `toggleZoneFloatAnalystPro` — Plan 5e.
- `bringForwardAnalystPro` / `sendBackwardAnalystPro` / `bringToFrontAnalystPro` / `sendToBackAnalystPro` — Plan 5e (float z-order).
- `distributeEvenlyAnalystPro(containerId)` / `fitContainerToContentAnalystPro(containerId)` — Plan 5e.
- `removeZoneAnalystPro(zoneId)` — Plan 5d (must preserve `visibilityRule` per Appendix E.15; stubbed here).
- Copy / Paste zone clipboard — dispatcher maintains a single `analystProZoneClipboard` slice as the minimal viable shim (Plan 5c owns this because it is trivial and the menu has hard Copy/Paste entries; full subtree clipboard semantics are Plan 5e's problem). Copy stores a structured clone of the zone subtree; Paste dispatches `insertObjectAnalystPro` for leaves only. Copy/Paste for container zones is stubbed with console.debug (Plan 5e).
- Real Swap Sheets dialog — Plan 5d. Menu entry dispatches `openSwapSheetsDialogAnalystPro` (stubbed).
- Real per-marks-card filter enumeration — Plan 5c produces the Filter submenu **shell** with a single "Show Filters…" entry plus a placeholder "(no filters configured)" item when the sheet has no marks filters yet. Populating actual field names from a worksheet's marks card is a 7a VizQL concern.

**Shared conventions (HARD — from roadmap §"Shared conventions"):**
- **TDD** for `lib/contextMenuBuilder.ts` — failing test → impl → pass → commit, per TDD cycle.
- Store action names end `…AnalystPro`; state fields prefix `analystPro…`.
- Commit per task. Format: `feat(analyst-pro): <verb> <object> (Plan 5c TN)` / `test(analyst-pro): … (Plan 5c TN)` / `fix(analyst-pro): … (Plan 5c TN fixup)`.
- Canonical Tableau naming: use `zone.type ∈ LeafType | ContainerType` (already in `lib/types.ts:13-25`). `DashboardObjectType` enum names reserved for mapping but zone classification in the builder uses our `LeafType` / `ContainerType`.
- A11y: `role="menu"` on root, `role="menuitem"` / `role="menuitemcheckbox"` on rows, `aria-haspopup="menu"` + `aria-expanded` on submenu rows, `aria-keyshortcuts` on rows with shortcuts, focus trap while open (Tab cycles inside the menu), Esc closes and returns focus to the triggering `ZoneFrame` (tracked via `lastFocusedElement` ref inside the component).
- Vega-Lite only — irrelevant to this plan, no chart code touched.
- No emoji in code. Submenu arrow `▸`, checkbox mark `✓`, and divider character are Unicode glyphs (same convention as Plan 5a's `⋮⋮`, `⋯`, `⛶`, `×`).

---

## File Structure

| File | Role | Action |
|---|---|---|
| `frontend/src/components/dashboard/freeform/lib/contextMenuBuilder.ts` | Pure helper — `MenuItem` types + `buildContextMenu(zone \| null, dashboard, selection)` + `findParentZoneId` helper + `clampToViewport` pure math | Create |
| `frontend/src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts` | Vitest unit tests — one `describe` per zone-kind branch + one for canvas-empty | Create |
| `frontend/src/components/dashboard/freeform/ContextMenu.jsx` | Portal-rendered menu component — role/keyboard/auto-close/dispatch | Create |
| `frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx` | Component tests — render, keyboard nav, submenu open, auto-close, dispatcher fires | Create |
| `frontend/src/components/dashboard/freeform/ZoneFrame.jsx` | Wire `onContextMenu` → `openContextMenuAnalystPro` | Modify |
| `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` | Add `handleSheetContextMenu` (empty-area) + mount `<ContextMenu />` once here or in layout wrapper | Modify |
| `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` | Wire `onContextMenu` / `onQuickAction` stubs in `renderLeaf` to dispatch `openContextMenuAnalystPro` | Modify |
| `frontend/src/store.js` | New `analystProContextMenu` slice (+open/close) and `analystProZoneClipboard` shim slice | Modify |
| `frontend/src/index.css` | `.analyst-pro-context-menu*` styles | Modify |

Tests live under `__tests__/` — vitest config already includes `src/components/dashboard/freeform/__tests__/**/*.test.{ts,tsx}` (see `frontend/vitest.config.ts:21-22`). Smoke command (matching 5a / 5b precedent): `npx vitest run src/components/dashboard/freeform/__tests__/` (the `npm run test:chart-ir` script is chart-IR-scoped; do not rely on it alone for freeform test coverage — call vitest directly for this plan).

---

## Task Checklist

- [ ] T1. `store.js` — `analystProContextMenu` slice + `openContextMenuAnalystPro` + `closeContextMenuAnalystPro` + `analystProZoneClipboard` shim slice.
- [ ] T2. `lib/contextMenuBuilder.ts` — `MenuItem` types + `findParentZoneId` + `clampToViewport` + stub `buildContextMenu` that returns `[]` (TDD skeleton only).
- [ ] T3. Builder — **common items** branch (Float/Tile, Fit submenu, Background/Border/Padding, Show Title, Deselect, Select Parent, Copy/Paste, Remove). TDD.
- [ ] T4. Builder — **worksheet-specific** additions (Swap Sheets / Filter / Actions / Show Caption). TDD.
- [ ] T5. Builder — **container-specific** additions (Distribute Evenly, Fit Container to Content, Remove Container). TDD.
- [ ] T6. Builder — **floating-specific** z-order submenu + **canvas-empty** variant (Paste / Add Text / Add Image / Add Blank). TDD.
- [ ] T7. CSS — `.analyst-pro-context-menu` + item / submenu / separator / checkbox styles.
- [ ] T8. `ContextMenu.jsx` — portal shell + positioning + open-state wiring + Esc/click-away/scroll close (no keyboard nav yet). Co-committed with basic tests.
- [ ] T9. `ContextMenu.jsx` — keyboard nav (↑↓←→/Enter/Space) + submenu flyout + focus trap. Tests.
- [ ] T10. `ContextMenu.jsx` — `dispatchMenuCommand` mapping (real store actions + console.debug stubs for Plan 5d/5e TODOs). Tests.
- [ ] T11. Wire `ZoneFrame.jsx` → `openContextMenuAnalystPro(e.clientX, e.clientY, zone.id)`; wire `FreeformCanvas.handleSheetContextMenu` for empty area; mount `<ContextMenu />` once in `AnalystProLayout.jsx`.
- [ ] T12. Smoke — `npx vitest run src/components/dashboard/freeform/__tests__/`, `npm run lint`, `npm run build` green. Fixups as needed.

---

## Task Specifications

### Task 1: Store — `analystProContextMenu` slice + `analystProZoneClipboard` shim

**Files:**
- Modify: `frontend/src/store.js` (append new state fields + setters alongside existing `analystPro…` entries, adjacent to the `analystProHoveredZoneId` slice introduced in Plan 5a T1)

- [ ] **Step 1: Locate the anchor in the store**

Run: `grep -n "analystProHoveredZoneId" frontend/src/store.js`
Expected: two lines — the state field (`analystProHoveredZoneId: null,`) and the setter body. Use them as insertion anchor.

- [ ] **Step 2: Insert the new slice immediately below the hovered-zone setter**

Add this block after the closing `,` of `setAnalystProHoveredZoneId`:

```js
  // Plan 5c: right-click context menu.
  // `items` is computed eagerly by openContextMenuAnalystPro via
  // buildContextMenu(zone, dashboard, selection) — kept in state so
  // ContextMenu.jsx stays purely presentational.
  analystProContextMenu: null,
  openContextMenuAnalystPro: (x, y, zoneId) => {
    // zoneId === null → canvas-empty menu variant.
    // Lazy-require to avoid a store→lib→store import cycle during jest/vitest boot.
    const { buildContextMenu } = require('./components/dashboard/freeform/lib/contextMenuBuilder');
    const dash = get().analystProDashboard;
    const selection = get().analystProSelection;
    const zone = zoneId == null ? null : findZoneById(dash, zoneId);
    const items = buildContextMenu(zone, dash, selection);
    set({
      analystProContextMenu: {
        x: Number(x) || 0,
        y: Number(y) || 0,
        zoneId: zoneId == null ? null : String(zoneId),
        items,
      },
    });
  },
  closeContextMenuAnalystPro: () => set({ analystProContextMenu: null }),

  // Plan 5c: minimal zone clipboard shim (full subtree semantics — Plan 5e).
  // Stores a structured clone of the zone so Paste produces an independent tree.
  analystProZoneClipboard: null,
  copyZoneToClipboardAnalystPro: (zone) => {
    if (!zone) return;
    const clone = JSON.parse(JSON.stringify(zone));
    set({ analystProZoneClipboard: clone });
  },
  clearZoneClipboardAnalystPro: () => set({ analystProZoneClipboard: null }),
```

- [ ] **Step 3: Add `findZoneById` helper near the top of the file if it does not exist**

Run: `grep -n "function findZoneById" frontend/src/store.js`
If no match, insert this above the store factory (near other top-of-file helpers, e.g. adjacent to `generateZoneId`):

```js
function findZoneById(dashboard, id) {
  if (!dashboard || !id) return null;
  const stack = [dashboard.tiledRoot, ...(dashboard.floatingLayer || [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.id === id) return node;
    if (node.children && node.children.length) stack.push(...node.children);
  }
  return null;
}
```

- [ ] **Step 4: Switch the lazy `require` in `openContextMenuAnalystPro` to an ESM import if the store file is ESM**

Run: `head -5 frontend/src/store.js`
If `import` statements are at top, replace the `require(...)` line with a static import at the top of the file:

```js
import { buildContextMenu } from './components/dashboard/freeform/lib/contextMenuBuilder';
```

…and drop the inline `require`:

```js
const items = buildContextMenu(zone, dash, selection);
```

- [ ] **Step 5: Sanity-check**

Run: `grep -n "analystProContextMenu\|openContextMenuAnalystPro\|closeContextMenuAnalystPro\|analystProZoneClipboard\|findZoneById" frontend/src/store.js`
Expected: the state field, both context-menu actions, the clipboard field + both clipboard actions, the `findZoneById` helper definition, plus one use inside `openContextMenuAnalystPro`. No other hits.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js
git commit -m "feat(analyst-pro): context-menu + zone-clipboard store slices (Plan 5c T1)"
```

---

### Task 2: `lib/contextMenuBuilder.ts` — types + `findParentZoneId` + `clampToViewport` + TDD skeleton

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/contextMenuBuilder.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `frontend/src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildContextMenu,
  findParentZoneId,
  clampToViewport,
  type MenuItem,
} from '../lib/contextMenuBuilder';
import type { Dashboard, ContainerZone, LeafZone } from '../lib/types';

function makeDashboard(root: ContainerZone, floating: LeafZone[] = []): Dashboard {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'test',
    archetype: 'analyst-pro',
    size: { mode: 'automatic' },
    tiledRoot: root,
    floatingLayer: floating as never,
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

describe('contextMenuBuilder skeleton', () => {
  it('returns an empty array when zone is null and dashboard is null', () => {
    const items = buildContextMenu(null, null, new Set<string>());
    expect(items).toEqual([]);
  });

  it('returns at least one item for canvas-empty when dashboard exists', () => {
    const dash = makeDashboard({ id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] });
    const items = buildContextMenu(null, dash, new Set());
    expect(items.length).toBeGreaterThan(0);
  });
});

describe('findParentZoneId', () => {
  it('returns null for the root zone', () => {
    const root: ContainerZone = { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] };
    expect(findParentZoneId(root, 'root')).toBeNull();
  });

  it('returns the direct parent container id for a leaf', () => {
    const leaf: LeafZone = { id: 'L1', type: 'blank', w: 100000, h: 100000 };
    const root: ContainerZone = {
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [leaf],
    };
    expect(findParentZoneId(root, 'L1')).toBe('root');
  });
});

describe('clampToViewport', () => {
  it('returns input when the menu fits', () => {
    expect(clampToViewport(100, 100, 200, 300, 1000, 800)).toEqual({ x: 100, y: 100 });
  });

  it('flips to the left when the menu would overflow the right edge', () => {
    expect(clampToViewport(950, 100, 200, 300, 1000, 800)).toEqual({ x: 750, y: 100 });
  });

  it('flips upward when the menu would overflow the bottom edge', () => {
    expect(clampToViewport(100, 700, 200, 300, 1000, 800)).toEqual({ x: 100, y: 400 });
  });

  it('clamps to (0,0) if the menu is larger than the viewport', () => {
    expect(clampToViewport(50, 50, 2000, 2000, 1000, 800)).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run test — it must fail with import errors**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts`
Expected: fails — module not found.

- [ ] **Step 3: Create the skeleton module**

Create `frontend/src/components/dashboard/freeform/lib/contextMenuBuilder.ts`:

```ts
// Pure helper that produces the right-click menu catalogue for Analyst Pro zones.
// Mirrors Tableau's tabuiactions ↔ tabdocactions split (Build_Tableau.md §XI.9):
// this module is the headless model; ContextMenu.jsx is the UI.
//
// Commands that require store actions not yet implemented (Plan 5d / 5e) carry
// a `todo` field so the dispatcher in ContextMenu.jsx logs a single debug line
// instead of crashing.

import type { ContainerZone, Dashboard, LeafZone, Zone } from './types';

export type MenuCommandId =
  // ---------------- Plan 5c wired commands (existing store actions) ----------------
  | 'deselect'
  | 'selectParent'
  | 'toggleShowTitle'
  | 'toggleShowCaption'
  | 'copy'
  | 'paste'
  | 'openActionsDialog'
  | 'removeContainerUnwrap'         // ungroupAnalystPro
  // ---------------- Plan 5d TODO (setZoneProperty / removeZone / setFitMode) -------
  | 'setFitMode.fit'
  | 'setFitMode.fitWidth'
  | 'setFitMode.fitHeight'
  | 'setFitMode.entireView'
  | 'setFitMode.fixed'
  | 'openProperties.style.background'
  | 'openProperties.style.border'
  | 'openProperties.layout.innerPadding'
  | 'openProperties.layout.outerPadding'
  | 'remove'                         // removeZoneAnalystPro — preserves visibilityRule
  | 'swapSheets'
  // ---------------- Plan 5e TODO (float / z-order / container commands) -----------
  | 'toggleFloat'
  | 'bringForward'
  | 'sendBackward'
  | 'bringToFront'
  | 'sendToBack'
  | 'distributeEvenly'
  | 'fitContainerToContent'
  // ---------------- Canvas-empty ---------------------------------------------------
  | 'canvas.paste'
  | 'canvas.addText'
  | 'canvas.addImage'
  | 'canvas.addBlank'
  // ---------------- Filter submenu placeholder (Plan 7a real enumeration) ----------
  | 'openFilters';

export type TodoRef = { plan: '5d' | '5e' | '7a'; reason: string };

export type MenuItem =
  | {
      kind: 'command';
      id: MenuCommandId;
      label: string;
      shortcut?: string;
      disabled?: boolean;
      todo?: TodoRef;
    }
  | {
      kind: 'checkbox';
      id: MenuCommandId;
      label: string;
      checked: boolean;
      disabled?: boolean;
      todo?: TodoRef;
    }
  | {
      kind: 'submenu';
      id: string;
      label: string;
      items: MenuItem[];
      disabled?: boolean;
    }
  | { kind: 'separator' };

const SEP: MenuItem = { kind: 'separator' };

// ----- Pure helpers (exported for tests) ------------------------------------

/** Returns the direct parent container id of `zoneId`, or null if the zone is the
 *  root container or is not found. Floating zones return null (they have no
 *  tiled parent; the "Select Parent" action is tiled-only in Plan 5c scope). */
export function findParentZoneId(root: ContainerZone, zoneId: string): string | null {
  if (!root || root.id === zoneId) return null;
  const walk = (container: ContainerZone): string | null => {
    for (const child of container.children) {
      if (child.id === zoneId) return container.id;
      if ((child as ContainerZone).children) {
        const hit = walk(child as ContainerZone);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(root);
}

/** Clamp a menu's top-left (x, y) so the menu of size (w, h) stays inside the
 *  (viewportW, viewportH) rect. Overflow on the right → flip to x-w. Overflow on
 *  the bottom → flip to y-h. If the menu is larger than the viewport, pin to 0. */
export function clampToViewport(
  x: number, y: number, w: number, h: number, viewportW: number, viewportH: number,
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (w >= viewportW) nx = 0;
  else if (nx + w > viewportW) nx = Math.max(0, viewportW - w);
  if (h >= viewportH) ny = 0;
  else if (ny + h > viewportH) ny = Math.max(0, viewportH - h);
  return { x: nx, y: ny };
}

// ----- Public builder -------------------------------------------------------

export function buildContextMenu(
  zone: Zone | null,
  dashboard: Dashboard | null,
  selection: ReadonlySet<string>,
): MenuItem[] {
  if (!dashboard) return [];
  if (zone == null) {
    return buildCanvasEmptyMenu();
  }
  // Task 3–6 fill these branches.
  return [];
}

function buildCanvasEmptyMenu(): MenuItem[] {
  // Filled in Task 6.
  return [{ kind: 'command', id: 'canvas.paste', label: 'Paste', shortcut: '⌘V' }];
}
```

- [ ] **Step 4: Run tests — skeleton tests must pass**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts`
Expected: PASS (3 describes, 7 tests green).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/contextMenuBuilder.ts \
        frontend/src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts
git commit -m "feat(analyst-pro): contextMenuBuilder skeleton + helpers (Plan 5c T2)"
```

---

### Task 3: Builder — common items branch (TDD)

Common items apply to every tiled or floating leaf + every container (except where noted in T5 for container-exclusive). Order matches Tableau Desktop right-click (Build_Tableau.md §IX.3 / §X conventions).

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/contextMenuBuilder.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts`

- [ ] **Step 1: Append failing tests for the common branch**

Append to `__tests__/contextMenuBuilder.test.ts`:

```ts
import type { FloatingZone } from '../lib/types';

describe('buildContextMenu — common items (any zone)', () => {
  const root: ContainerZone = {
    id: 'root', type: 'container-vert', w: 100000, h: 100000,
    children: [
      { id: 'L1', type: 'blank', w: 100000, h: 100000 } as LeafZone,
    ],
  };
  const dash = makeDashboard(root);

  it('includes Tiled/Floating checkbox reflecting the zone state', () => {
    const items = buildContextMenu(root.children[0], dash, new Set());
    const cb = items.find((i) => i.kind === 'checkbox' && i.id === 'toggleFloat');
    expect(cb).toBeDefined();
    expect(cb).toMatchObject({ kind: 'checkbox', checked: false, todo: { plan: '5e' } });
  });

  it('includes a Fit submenu with five fit modes', () => {
    const items = buildContextMenu(root.children[0], dash, new Set());
    const fit = items.find((i) => i.kind === 'submenu' && i.id === 'fit');
    expect(fit).toBeDefined();
    if (fit && fit.kind === 'submenu') {
      const ids = fit.items.filter((i) => i.kind === 'command').map((i) => (i as { id: string }).id);
      expect(ids).toEqual([
        'setFitMode.fit',
        'setFitMode.fitWidth',
        'setFitMode.fitHeight',
        'setFitMode.entireView',
        'setFitMode.fixed',
      ]);
    }
  });

  it('includes Background, Border, and Padding entries', () => {
    const items = buildContextMenu(root.children[0], dash, new Set());
    const ids = items
      .filter((i) => i.kind === 'command' || i.kind === 'submenu')
      .map((i) => (i as { id: string }).id);
    expect(ids).toContain('openProperties.style.background');
    expect(ids).toContain('openProperties.style.border');
    expect(ids).toContain('padding');
  });

  it('Show Title is a checkbox that reflects zone.showTitleBar with sensible default', () => {
    const worksheetZone: LeafZone = { id: 'W1', type: 'worksheet', w: 100000, h: 100000 };
    const dash2 = makeDashboard({
      id: 'root', type: 'container-vert', w: 100000, h: 100000,
      children: [worksheetZone],
    });
    const items = buildContextMenu(worksheetZone, dash2, new Set());
    const cb = items.find((i) => i.kind === 'checkbox' && i.id === 'toggleShowTitle');
    expect(cb).toBeDefined();
    expect((cb as { checked: boolean }).checked).toBe(true); // default for worksheet
  });

  it('Select Parent Container is disabled on the root zone', () => {
    const items = buildContextMenu(root, dash, new Set());
    const sp = items.find((i) => i.kind === 'command' && i.id === 'selectParent');
    expect(sp).toBeDefined();
    expect((sp as { disabled?: boolean }).disabled).toBe(true);
  });

  it('Paste is disabled when nothing is on the clipboard (signaled via selection hint)', () => {
    // Builder accepts selection only; clipboard emptiness is signaled by dispatcher.
    // For the pure builder, Paste must always be present so the menu shape is stable.
    const items = buildContextMenu(root.children[0], dash, new Set());
    expect(items.some((i) => i.kind === 'command' && i.id === 'paste')).toBe(true);
  });

  it('Remove is the last non-separator item', () => {
    const items = buildContextMenu(root.children[0], dash, new Set());
    const last = [...items].reverse().find((i) => i.kind !== 'separator');
    expect(last).toMatchObject({ kind: 'command', id: 'remove' });
  });
});
```

- [ ] **Step 2: Run tests — they must fail**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts`
Expected: 7 new failures (items not yet returned).

- [ ] **Step 3: Implement the common branch in `buildContextMenu`**

Replace the `buildContextMenu` body (keep types + helpers unchanged) with:

```ts
export function buildContextMenu(
  zone: Zone | null,
  dashboard: Dashboard | null,
  selection: ReadonlySet<string>,
): MenuItem[] {
  if (!dashboard) return [];
  if (zone == null) return buildCanvasEmptyMenu();

  const items: MenuItem[] = [];
  appendCommonHead(items, zone, dashboard);
  // Tasks 4 + 5 inject worksheet-specific / container-specific items here.
  appendCommonTail(items, zone, dashboard, selection);
  return items;
}

function appendCommonHead(items: MenuItem[], zone: Zone, dashboard: Dashboard): void {
  const isFloating = (zone as FloatingZone).floating === true;

  items.push({
    kind: 'checkbox',
    id: 'toggleFloat',
    label: 'Floating',
    checked: isFloating,
    todo: { plan: '5e', reason: 'toggleZoneFloatAnalystPro lands in Plan 5e.' },
  });

  items.push(SEP);

  items.push({
    kind: 'submenu',
    id: 'fit',
    label: 'Fit',
    items: [
      { kind: 'command', id: 'setFitMode.fit',        label: 'Fit',            todo: { plan: '5d', reason: 'fitMode field + renderer wiring lands in Plan 5d.' } },
      { kind: 'command', id: 'setFitMode.fitWidth',   label: 'Fit Width',      todo: { plan: '5d', reason: 'fitMode field + renderer wiring lands in Plan 5d.' } },
      { kind: 'command', id: 'setFitMode.fitHeight',  label: 'Fit Height',     todo: { plan: '5d', reason: 'fitMode field + renderer wiring lands in Plan 5d.' } },
      { kind: 'command', id: 'setFitMode.entireView', label: 'Entire View',    todo: { plan: '5d', reason: 'fitMode field + renderer wiring lands in Plan 5d.' } },
      { kind: 'command', id: 'setFitMode.fixed',      label: 'Fixed Pixels…',  todo: { plan: '5d', reason: 'fitMode field + renderer wiring lands in Plan 5d.' } },
    ],
  });

  items.push(SEP);

  items.push({
    kind: 'command',
    id: 'openProperties.style.background',
    label: 'Background…',
    todo: { plan: '5d', reason: 'Style tab lands in Plan 5d Properties Panel rewrite.' },
  });
  items.push({
    kind: 'command',
    id: 'openProperties.style.border',
    label: 'Border…',
    todo: { plan: '5d', reason: 'Style tab lands in Plan 5d Properties Panel rewrite.' },
  });
  items.push({
    kind: 'submenu',
    id: 'padding',
    label: 'Padding',
    items: [
      { kind: 'command', id: 'openProperties.layout.innerPadding', label: 'Inner Padding…', todo: { plan: '5d', reason: 'Layout tab lands in Plan 5d Properties Panel rewrite.' } },
      { kind: 'command', id: 'openProperties.layout.outerPadding', label: 'Outer Padding…', todo: { plan: '5d', reason: 'Layout tab lands in Plan 5d Properties Panel rewrite.' } },
    ],
  });

  items.push(SEP);

  const showTitleDefault = defaultShowTitle(zone);
  const showTitleChecked = (zone as { showTitleBar?: boolean }).showTitleBar ?? showTitleDefault;
  items.push({
    kind: 'checkbox',
    id: 'toggleShowTitle',
    label: 'Show Title',
    checked: showTitleChecked,
  });
}

function appendCommonTail(
  items: MenuItem[], zone: Zone, dashboard: Dashboard, _selection: ReadonlySet<string>,
): void {
  items.push(SEP);
  items.push({ kind: 'command', id: 'deselect', label: 'Deselect' });
  const parentId = findParentZoneId(dashboard.tiledRoot, zone.id);
  items.push({
    kind: 'command',
    id: 'selectParent',
    label: 'Select Parent Container',
    disabled: parentId == null,
  });

  items.push(SEP);
  items.push({ kind: 'command', id: 'copy',  label: 'Copy',  shortcut: '⌘C' });
  items.push({ kind: 'command', id: 'paste', label: 'Paste', shortcut: '⌘V' });

  items.push(SEP);
  items.push({
    kind: 'command',
    id: 'remove',
    label: 'Remove from Dashboard',
    shortcut: 'Del',
    todo: { plan: '5d', reason: 'removeZoneAnalystPro lands in Plan 5d (preserves zone.visibilityRule per Appendix E.15).' },
  });
}

// Per roadmap §5a deliverable 3: title bar visible on worksheet + text + webpage.
const TITLE_BAR_DEFAULT_VISIBLE = new Set<string>([
  'worksheet', 'text', 'webpage', 'filter', 'legend', 'parameter', 'navigation', 'extension',
]);

function defaultShowTitle(zone: Zone): boolean {
  return TITLE_BAR_DEFAULT_VISIBLE.has((zone as { type: string }).type);
}
```

- [ ] **Step 4: Re-run tests — common tests must pass**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts`
Expected: all prior tests + the 7 common-branch tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/contextMenuBuilder.ts \
        frontend/src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts
git commit -m "feat(analyst-pro): context-menu common items (Plan 5c T3)"
```

---

### Task 4: Builder — worksheet-specific items (TDD)

Worksheet zones gain `Swap Sheets…`, `Filter →` submenu, `Actions…`, and a `Show Caption` checkbox (see Build_Tableau.md §X — worksheet object, §XII.1 — tooltip / caption separation, §XI — Actions taxonomy).

**Files:** same as T3.

- [ ] **Step 1: Append failing tests**

```ts
describe('buildContextMenu — worksheet-specific', () => {
  it('includes Swap Sheets, Filter submenu, Actions…, Show Caption on worksheet zones', () => {
    const ws: LeafZone = { id: 'W1', type: 'worksheet', w: 100000, h: 100000 };
    const dash = makeDashboard({
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [ws],
    });
    const items = buildContextMenu(ws, dash, new Set());
    const ids = items.map((i) => (i as { id?: string }).id).filter(Boolean);
    expect(ids).toContain('swapSheets');
    expect(ids).toContain('filter'); // submenu
    expect(ids).toContain('openActionsDialog');
    expect(ids).toContain('toggleShowCaption');
  });

  it('omits worksheet-only items on a blank zone', () => {
    const blank: LeafZone = { id: 'B1', type: 'blank', w: 100000, h: 100000 };
    const dash = makeDashboard({
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [blank],
    });
    const items = buildContextMenu(blank, dash, new Set());
    const ids = items.map((i) => (i as { id?: string }).id).filter(Boolean);
    expect(ids).not.toContain('swapSheets');
    expect(ids).not.toContain('filter');
    expect(ids).not.toContain('openActionsDialog');
    expect(ids).not.toContain('toggleShowCaption');
  });

  it('Filter submenu is a shell carrying a single openFilters placeholder until Plan 7a', () => {
    const ws: LeafZone = { id: 'W1', type: 'worksheet', w: 100000, h: 100000 };
    const dash = makeDashboard({
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [ws],
    });
    const items = buildContextMenu(ws, dash, new Set());
    const submenu = items.find((i) => i.kind === 'submenu' && i.id === 'filter');
    expect(submenu).toBeDefined();
    if (submenu && submenu.kind === 'submenu') {
      expect(submenu.items.some((it) => it.kind === 'command' && it.id === 'openFilters')).toBe(true);
      expect(submenu.items[0].kind).toBe('command');
    }
  });
});
```

- [ ] **Step 2: Run — expect 3 new failures**

- [ ] **Step 3: Inject the worksheet branch**

Edit `buildContextMenu` — between the `appendCommonHead(...)` and `appendCommonTail(...)` calls, insert:

```ts
  appendWorksheetExtras(items, zone);
```

Then add the helper:

```ts
function appendWorksheetExtras(items: MenuItem[], zone: Zone): void {
  if ((zone as { type: string }).type !== 'worksheet') return;

  // Inserted after the common head's Show Title checkbox, before Deselect.
  // Show Caption lives next to Show Title for visual grouping.
  items.push({
    kind: 'checkbox',
    id: 'toggleShowCaption',
    label: 'Show Caption',
    checked: (zone as { showCaption?: boolean }).showCaption === true,
  });

  items.push(SEP);

  items.push({
    kind: 'command',
    id: 'swapSheets',
    label: 'Swap Sheets…',
    todo: { plan: '5d', reason: 'Swap-sheets dialog lands with Plan 5d property-panel rewrite.' },
  });

  items.push({
    kind: 'submenu',
    id: 'filter',
    label: 'Filter',
    items: [
      // Plan 7a will enumerate marks-card fields here (Build_Tableau.md Part VII).
      {
        kind: 'command',
        id: 'openFilters',
        label: '(no filters configured — open Filters panel…)',
        todo: { plan: '7a', reason: 'Per-sheet marks-card filter enumeration ships with VizQL Plan 7a.' },
      },
    ],
  });

  items.push({
    kind: 'command',
    id: 'openActionsDialog',
    label: 'Actions…',
  });
}
```

- [ ] **Step 4: Re-run tests — all green**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/contextMenuBuilder.ts \
        frontend/src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts
git commit -m "feat(analyst-pro): context-menu worksheet items (Plan 5c T4)"
```

---

### Task 5: Builder — container-specific items + visibilityRule preservation note (TDD)

Containers gain `Distribute Evenly`, `Fit Container to Content`, and `Remove Container` (unwrap). The last dispatches `ungroupAnalystPro` which already exists; the other two stub Plan 5e actions.

**Files:** same as T3.

- [ ] **Step 1: Append failing tests**

```ts
describe('buildContextMenu — container-specific', () => {
  it('adds Distribute Evenly, Fit Container to Content, Remove Container on containers', () => {
    const leafA: LeafZone = { id: 'A', type: 'blank', w: 50000, h: 100000 };
    const leafB: LeafZone = { id: 'B', type: 'blank', w: 50000, h: 100000 };
    const container: ContainerZone = {
      id: 'C', type: 'container-horz', w: 100000, h: 100000, children: [leafA, leafB],
    };
    const root: ContainerZone = {
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [container],
    };
    const items = buildContextMenu(container, makeDashboard(root), new Set());
    const ids = items.map((i) => (i as { id?: string }).id).filter(Boolean);
    expect(ids).toContain('distributeEvenly');
    expect(ids).toContain('fitContainerToContent');
    expect(ids).toContain('removeContainerUnwrap');
  });

  it('Remove Container on the root is disabled (cannot unwrap root)', () => {
    const root: ContainerZone = {
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [],
    };
    const items = buildContextMenu(root, makeDashboard(root), new Set());
    const rc = items.find((i) => i.kind === 'command' && i.id === 'removeContainerUnwrap');
    expect(rc).toBeDefined();
    expect((rc as { disabled?: boolean }).disabled).toBe(true);
  });

  it('container-type zones do NOT include worksheet-only items', () => {
    const root: ContainerZone = {
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [],
    };
    const items = buildContextMenu(root, makeDashboard(root), new Set());
    const ids = items.map((i) => (i as { id?: string }).id).filter(Boolean);
    expect(ids).not.toContain('swapSheets');
    expect(ids).not.toContain('toggleShowCaption');
  });
});
```

- [ ] **Step 2: Run — expect 3 failures**

- [ ] **Step 3: Inject the container branch**

Edit `buildContextMenu` — add after `appendWorksheetExtras(items, zone);`:

```ts
  appendContainerExtras(items, zone, dashboard);
```

Then:

```ts
function isContainerZone(zone: Zone): zone is ContainerZone {
  const t = (zone as { type: string }).type;
  return t === 'container-horz' || t === 'container-vert';
}

function appendContainerExtras(items: MenuItem[], zone: Zone, dashboard: Dashboard): void {
  if (!isContainerZone(zone)) return;
  items.push(SEP);
  items.push({
    kind: 'command',
    id: 'distributeEvenly',
    label: 'Distribute Evenly',
    disabled: zone.children.length < 2,
    todo: { plan: '5e', reason: 'distributeEvenlyAnalystPro lands in Plan 5e.' },
  });
  items.push({
    kind: 'command',
    id: 'fitContainerToContent',
    label: 'Fit Container to Content',
    todo: { plan: '5e', reason: 'fitContainerToContentAnalystPro lands in Plan 5e.' },
  });
  const isRoot = dashboard.tiledRoot.id === zone.id;
  items.push({
    kind: 'command',
    id: 'removeContainerUnwrap',
    label: 'Remove Container',
    disabled: isRoot,
    // Dispatcher wires this to existing ungroupAnalystPro(containerId) (store.js:1017).
  });
}
```

- [ ] **Step 4: Re-run tests — all green**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/contextMenuBuilder.ts \
        frontend/src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts
git commit -m "feat(analyst-pro): context-menu container items (Plan 5c T5)"
```

---

### Task 6: Builder — floating z-order submenu + canvas-empty variant (TDD)

Floating zones gain a four-item z-order submenu (Bring Forward / Send Backward / Bring to Front / Send to Back). The canvas-empty variant replaces the full menu with four entries: Paste / Add Text / Add Image / Add Blank.

**Files:** same as T3.

- [ ] **Step 1: Append failing tests**

```ts
describe('buildContextMenu — floating z-order', () => {
  it('adds a z-order submenu with 4 items on floating zones', () => {
    const floating: FloatingZone = {
      id: 'F1', type: 'blank', w: 0, h: 0, floating: true,
      x: 10, y: 10, pxW: 200, pxH: 100, zIndex: 1,
    };
    const root: ContainerZone = {
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [],
    };
    const dash = makeDashboard(root, [floating]);
    const items = buildContextMenu(floating, dash, new Set());
    const zo = items.find((i) => i.kind === 'submenu' && i.id === 'zOrder');
    expect(zo).toBeDefined();
    if (zo && zo.kind === 'submenu') {
      const ids = zo.items.filter((i) => i.kind === 'command').map((i) => (i as { id: string }).id);
      expect(ids).toEqual(['bringForward', 'sendBackward', 'bringToFront', 'sendToBack']);
    }
  });

  it('tiled zones do not include a z-order submenu', () => {
    const leaf: LeafZone = { id: 'L1', type: 'blank', w: 100000, h: 100000 };
    const root: ContainerZone = {
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [leaf],
    };
    const items = buildContextMenu(leaf, makeDashboard(root), new Set());
    expect(items.find((i) => i.kind === 'submenu' && i.id === 'zOrder')).toBeUndefined();
  });
});

describe('buildContextMenu — canvas-empty variant', () => {
  it('returns Paste + Add Text + Add Image + Add Blank only', () => {
    const root: ContainerZone = {
      id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [],
    };
    const items = buildContextMenu(null, makeDashboard(root), new Set());
    const ids = items.filter((i) => i.kind === 'command').map((i) => (i as { id: string }).id);
    expect(ids).toEqual(['canvas.paste', 'canvas.addText', 'canvas.addImage', 'canvas.addBlank']);
    expect(items.some((i) => i.kind === 'checkbox')).toBe(false);
    expect(items.some((i) => i.kind === 'submenu')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect 3 failures**

- [ ] **Step 3: Implement**

Inside `buildContextMenu`, add `appendFloatingExtras(items, zone);` after `appendContainerExtras(...)`. Then:

```ts
function appendFloatingExtras(items: MenuItem[], zone: Zone): void {
  const isFloating = (zone as FloatingZone).floating === true;
  if (!isFloating) return;
  items.push(SEP);
  items.push({
    kind: 'submenu',
    id: 'zOrder',
    label: 'Z-Order',
    items: [
      { kind: 'command', id: 'bringForward',  label: 'Bring Forward',   todo: { plan: '5e', reason: 'Float z-order actions land in Plan 5e.' } },
      { kind: 'command', id: 'sendBackward',  label: 'Send Backward',   todo: { plan: '5e', reason: 'Float z-order actions land in Plan 5e.' } },
      { kind: 'command', id: 'bringToFront',  label: 'Bring to Front',  todo: { plan: '5e', reason: 'Float z-order actions land in Plan 5e.' } },
      { kind: 'command', id: 'sendToBack',    label: 'Send to Back',    todo: { plan: '5e', reason: 'Float z-order actions land in Plan 5e.' } },
    ],
  });
}
```

Replace `buildCanvasEmptyMenu` with the final four-item form:

```ts
function buildCanvasEmptyMenu(): MenuItem[] {
  return [
    { kind: 'command', id: 'canvas.paste',    label: 'Paste',     shortcut: '⌘V' },
    SEP,
    { kind: 'command', id: 'canvas.addText',  label: 'Add Text'  },
    { kind: 'command', id: 'canvas.addImage', label: 'Add Image' },
    { kind: 'command', id: 'canvas.addBlank', label: 'Add Blank' },
  ];
}
```

Note the test filters `items.kind === 'command'` so the SEP line does not show up in the asserted id array.

- [ ] **Step 4: Run — all green**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/contextMenuBuilder.ts \
        frontend/src/components/dashboard/freeform/__tests__/contextMenuBuilder.test.ts
git commit -m "feat(analyst-pro): context-menu floating z-order + canvas-empty (Plan 5c T6)"
```

---

### Task 7: CSS — `.analyst-pro-context-menu*`

**Files:**
- Modify: `frontend/src/index.css` (append at end, same approach as Plans 5a / 5b CSS additions).

- [ ] **Step 1: Locate end of existing analyst-pro CSS block**

Run: `tail -20 frontend/src/index.css`
Expected: last analyst-pro rule is the Plan 5b drop-indicator / smart-guide classes.

- [ ] **Step 2: Append the menu styles**

Append:

```css
/* Plan 5c — Right-click context menu.
   Rendered via createPortal onto document.body. Keyboard + pointer driven.
   No CSS animation — pure transition on opacity to mirror Tableau's snap-in feel. */
.analyst-pro-context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 200px;
  max-width: 320px;
  padding: 4px 0;
  background: var(--chrome-bar-bg, #1f2026);
  color: var(--fg, #e5e7eb);
  border: 1px solid var(--chrome-bar-border, rgba(255,255,255,0.12));
  border-radius: 6px;
  box-shadow: 0 10px 24px rgba(0,0,0,0.40), 0 2px 6px rgba(0,0,0,0.24);
  font-size: 12px;
  line-height: 1.2;
  user-select: none;
  outline: none;
}
.analyst-pro-context-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 12px;
  cursor: default;
  white-space: nowrap;
  color: inherit;
  background: transparent;
  border: 0;
  width: 100%;
  text-align: left;
  font: inherit;
}
.analyst-pro-context-menu__item:focus,
.analyst-pro-context-menu__item[data-focused='true'] {
  background: var(--accent-muted, rgba(59,130,246,0.15));
  outline: none;
}
.analyst-pro-context-menu__item[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}
.analyst-pro-context-menu__item-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}
.analyst-pro-context-menu__item-shortcut {
  flex: 0 0 auto;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.analyst-pro-context-menu__check {
  flex: 0 0 12px;
  width: 12px;
  text-align: center;
  opacity: 1;
}
.analyst-pro-context-menu__check[data-checked='false'] {
  opacity: 0;
}
.analyst-pro-context-menu__submenu-arrow {
  flex: 0 0 12px;
  text-align: center;
  opacity: 0.7;
}
.analyst-pro-context-menu__separator {
  height: 1px;
  margin: 4px 6px;
  background: var(--chrome-bar-border, rgba(255,255,255,0.08));
}
.analyst-pro-context-menu__flyout {
  position: fixed;
  z-index: 10001;
}

@media (prefers-reduced-motion: reduce) {
  .analyst-pro-context-menu { transition: none; }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(analyst-pro): context-menu CSS (Plan 5c T7)"
```

---

### Task 8: `ContextMenu.jsx` — portal shell, positioning, auto-close

**Files:**
- Create: `frontend/src/components/dashboard/freeform/ContextMenu.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`

- [ ] **Step 1: Write failing tests — portal mounts, clicking a command closes the menu, Esc closes the menu**

Create `frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import ContextMenu from '../ContextMenu';

function resetStore() {
  useStore.setState({
    analystProContextMenu: null,
    analystProDashboard: {
      schemaVersion: 'askdb/dashboard/v1', id: 'd', name: 't', archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: { id: 'root', type: 'container-vert', w: 100000, h: 100000, children: [] },
      floatingLayer: [], worksheets: [], parameters: [], sets: [], actions: [],
    },
  });
}

beforeEach(resetStore);

describe('<ContextMenu /> portal shell', () => {
  it('renders nothing while analystProContextMenu is null', () => {
    render(<ContextMenu />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders the menu when the slice is populated', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [
            { kind: 'command', id: 'canvas.paste', label: 'Paste' },
          ],
        },
      });
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Paste')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [{ kind: 'command', id: 'canvas.paste', label: 'Paste' }],
        },
      });
    });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on click-away (pointerdown outside the menu)', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [{ kind: 'command', id: 'canvas.paste', label: 'Paste' }],
        },
      });
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect all to fail (module not found)**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`

- [ ] **Step 3: Create the component**

Create `frontend/src/components/dashboard/freeform/ContextMenu.jsx`:

```jsx
// frontend/src/components/dashboard/freeform/ContextMenu.jsx
//
// Portal-rendered right-click menu. Pure presentation over the
// analystProContextMenu store slice — Plan 5c.
//
// Keyboard nav + submenu flyouts + focus trap land in Plan 5c T9.
// Command dispatcher lands in Plan 5c T10.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../../store';
import { clampToViewport } from './lib/contextMenuBuilder';

const DEFAULT_MENU_WIDTH = 220;
const DEFAULT_MENU_HEIGHT = 320;

export default function ContextMenu() {
  const menu = useStore((s) => s.analystProContextMenu);
  const close = useStore((s) => s.closeContextMenuAnalystPro);
  const rootRef = useRef(null);
  const [measured, setMeasured] = useState(null);

  const pos = useMemo(() => {
    if (!menu) return null;
    const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    const w = measured?.width ?? DEFAULT_MENU_WIDTH;
    const h = measured?.height ?? DEFAULT_MENU_HEIGHT;
    return clampToViewport(menu.x, menu.y, w, h, vw, vh);
  }, [menu, measured]);

  useEffect(() => {
    if (!menu) return;
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setMeasured({ width: rect.width, height: rect.height });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (e) => {
      const node = rootRef.current;
      if (node && node.contains(e.target)) return;
      close();
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    const handleScroll = () => close();
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menu, close]);

  const renderItem = useCallback((item, idx) => {
    if (item.kind === 'separator') {
      return <div key={`sep-${idx}`} role="separator" className="analyst-pro-context-menu__separator" />;
    }
    if (item.kind === 'submenu') {
      return (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-disabled={item.disabled || undefined}
          data-menu-id={item.id}
          className="analyst-pro-context-menu__item"
        >
          <span className="analyst-pro-context-menu__check" data-checked="false">&nbsp;</span>
          <span className="analyst-pro-context-menu__item-label">{item.label}</span>
          <span className="analyst-pro-context-menu__submenu-arrow" aria-hidden="true">▸</span>
        </button>
      );
    }
    const isCheckbox = item.kind === 'checkbox';
    return (
      <button
        key={item.id}
        type="button"
        role={isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={isCheckbox ? item.checked : undefined}
        aria-disabled={item.disabled || undefined}
        aria-keyshortcuts={'shortcut' in item ? item.shortcut : undefined}
        data-menu-id={item.id}
        className="analyst-pro-context-menu__item"
        onClick={() => close()}
      >
        <span className="analyst-pro-context-menu__check" data-checked={String(isCheckbox && !!item.checked)}>
          ✓
        </span>
        <span className="analyst-pro-context-menu__item-label">{item.label}</span>
        {'shortcut' in item && item.shortcut ? (
          <span className="analyst-pro-context-menu__item-shortcut">{item.shortcut}</span>
        ) : (
          <span className="analyst-pro-context-menu__item-shortcut" aria-hidden="true">&nbsp;</span>
        )}
      </button>
    );
  }, [close]);

  if (!menu || !pos) return null;

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      aria-label="Zone actions"
      tabIndex={-1}
      className="analyst-pro-context-menu"
      style={{ left: pos.x, top: pos.y }}
      data-testid="analyst-pro-context-menu"
    >
      {menu.items.map(renderItem)}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Re-run the tests — all 4 must pass**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`
Expected: 4 passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/ContextMenu.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx
git commit -m "feat(analyst-pro): ContextMenu portal shell + auto-close (Plan 5c T8)"
```

---

### Task 9: `ContextMenu.jsx` — keyboard nav + submenu flyout + focus trap

**Files:** same as T8.

- [ ] **Step 1: Append failing tests**

```tsx
describe('<ContextMenu /> keyboard navigation', () => {
  it('focuses the first enabled item on open and moves with ArrowDown / ArrowUp', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [
            { kind: 'command', id: 'canvas.addText',  label: 'Add Text'  },
            { kind: 'command', id: 'canvas.addImage', label: 'Add Image' },
            { kind: 'command', id: 'canvas.addBlank', label: 'Add Blank' },
          ],
        },
      });
    });
    const menuEl = screen.getByRole('menu');
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Text');
    fireEvent.keyDown(menuEl, { key: 'ArrowDown' });
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Image');
    fireEvent.keyDown(menuEl, { key: 'ArrowDown' });
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Blank');
    fireEvent.keyDown(menuEl, { key: 'ArrowDown' }); // wraps
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Text');
    fireEvent.keyDown(menuEl, { key: 'ArrowUp' });   // wraps the other way
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Blank');
  });

  it('skips separators and disabled items during ArrowDown navigation', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [
            { kind: 'command', id: 'canvas.addText',  label: 'Add Text'  },
            { kind: 'separator' },
            { kind: 'command', id: 'canvas.addImage', label: 'Add Image', disabled: true },
            { kind: 'command', id: 'canvas.addBlank', label: 'Add Blank' },
          ],
        },
      });
    });
    const menuEl = screen.getByRole('menu');
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Text');
    fireEvent.keyDown(menuEl, { key: 'ArrowDown' });
    expect(menuEl.querySelector('[data-focused="true"]')?.textContent).toBe('Add Blank');
  });

  it('ArrowRight on a submenu opens a flyout; ArrowLeft closes it', () => {
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 100, y: 100, zoneId: null,
          items: [
            {
              kind: 'submenu', id: 'fit', label: 'Fit',
              items: [
                { kind: 'command', id: 'setFitMode.fit', label: 'Fit' },
                { kind: 'command', id: 'setFitMode.fitWidth', label: 'Fit Width' },
              ],
            },
          ],
        },
      });
    });
    const menuEl = screen.getByRole('menu');
    fireEvent.keyDown(menuEl, { key: 'ArrowRight' });
    // Flyout should render with its own role=menu
    const menus = screen.getAllByRole('menu');
    expect(menus.length).toBe(2);
    fireEvent.keyDown(menus[1], { key: 'ArrowLeft' });
    expect(screen.getAllByRole('menu').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run — all three new tests fail**

- [ ] **Step 3: Extend the component**

Replace the component body, adding:
- A `focusIndex` state tracking the current menuitem.
- A `submenuIndex` state tracking which submenu is flown out.
- A `firstFocusableIndex(items)` helper skipping separators + disabled rows.
- An `onKeyDown` handler on the `<div role="menu">` for `ArrowDown` / `ArrowUp` / `ArrowRight` / `ArrowLeft` / `Enter` / `Space` / `Home` / `End`.
- Apply `data-focused={String(i === focusIndex)}` on every `<button>` row.
- When `submenuIndex != null`, render a nested `<ContextMenuFlyout>` that receives the submenu items, positioned to the right of the parent row.

Concrete code — replace the entire file body with:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../../store';
import { clampToViewport } from './lib/contextMenuBuilder';

const DEFAULT_MENU_WIDTH = 220;
const DEFAULT_MENU_HEIGHT = 320;

function firstFocusableIndex(items) {
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it.kind === 'separator') continue;
    if (it.disabled) continue;
    return i;
  }
  return -1;
}

function nextFocusableIndex(items, from, dir) {
  const n = items.length;
  if (n === 0) return -1;
  let i = from;
  for (let step = 0; step < n; step += 1) {
    i = (i + dir + n) % n;
    const it = items[i];
    if (it.kind === 'separator') continue;
    if (it.disabled) continue;
    return i;
  }
  return from;
}

function MenuRows({ items, focusIndex, onItemPointerEnter, onItemClick, onItemKeyTrigger }) {
  return items.map((item, idx) => {
    if (item.kind === 'separator') {
      return <div key={`sep-${idx}`} role="separator" className="analyst-pro-context-menu__separator" />;
    }
    const focused = idx === focusIndex;
    const commonProps = {
      'data-menu-id': item.kind === 'submenu' ? item.id : item.id,
      'data-menu-index': idx,
      'data-focused': String(focused),
      'aria-disabled': item.disabled || undefined,
      className: 'analyst-pro-context-menu__item',
      onPointerEnter: () => onItemPointerEnter(idx),
      onClick: (e) => onItemClick(e, idx, item),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onItemKeyTrigger(idx, item);
        }
      },
      type: 'button',
    };
    if (item.kind === 'submenu') {
      return (
        <button
          key={item.id}
          {...commonProps}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={focused ? 'true' : 'false'}
        >
          <span className="analyst-pro-context-menu__check" data-checked="false">&nbsp;</span>
          <span className="analyst-pro-context-menu__item-label">{item.label}</span>
          <span className="analyst-pro-context-menu__submenu-arrow" aria-hidden="true">▸</span>
        </button>
      );
    }
    const isCheckbox = item.kind === 'checkbox';
    return (
      <button
        key={item.id}
        {...commonProps}
        role={isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={isCheckbox ? item.checked : undefined}
        aria-keyshortcuts={'shortcut' in item ? item.shortcut : undefined}
      >
        <span className="analyst-pro-context-menu__check" data-checked={String(isCheckbox && !!item.checked)}>✓</span>
        <span className="analyst-pro-context-menu__item-label">{item.label}</span>
        {'shortcut' in item && item.shortcut ? (
          <span className="analyst-pro-context-menu__item-shortcut">{item.shortcut}</span>
        ) : (
          <span className="analyst-pro-context-menu__item-shortcut" aria-hidden="true">&nbsp;</span>
        )}
      </button>
    );
  });
}

function Flyout({ parentRect, items, onClose, onSelect }) {
  const rootRef = useRef(null);
  const [focusIndex, setFocusIndex] = useState(firstFocusableIndex(items));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); setFocusIndex((i) => nextFocusableIndex(items, i, +1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIndex((i) => nextFocusableIndex(items, i, -1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onClose(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const it = items[focusIndex];
      if (it && it.kind !== 'separator' && !it.disabled) onSelect(it);
    }
  };

  useEffect(() => {
    if (rootRef.current) rootRef.current.focus();
  }, []);

  const left = parentRect ? parentRect.right + 2 : 0;
  const top = parentRect ? parentRect.top : 0;

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      tabIndex={-1}
      className="analyst-pro-context-menu analyst-pro-context-menu__flyout"
      style={{ left, top }}
      onKeyDown={onKeyDown}
      data-testid="analyst-pro-context-menu-flyout"
    >
      <MenuRows
        items={items}
        focusIndex={focusIndex}
        onItemPointerEnter={setFocusIndex}
        onItemClick={(_e, _idx, item) => {
          if (item.kind !== 'separator' && !item.disabled) onSelect(item);
        }}
        onItemKeyTrigger={(_idx, item) => {
          if (item.kind !== 'separator' && !item.disabled) onSelect(item);
        }}
      />
    </div>,
    document.body,
  );
}

export default function ContextMenu() {
  const menu = useStore((s) => s.analystProContextMenu);
  const close = useStore((s) => s.closeContextMenuAnalystPro);
  const rootRef = useRef(null);
  const [measured, setMeasured] = useState(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [submenuIndex, setSubmenuIndex] = useState(null);

  // Reset state whenever the slice (re)opens.
  useEffect(() => {
    if (menu) {
      setFocusIndex(firstFocusableIndex(menu.items));
      setSubmenuIndex(null);
    } else {
      setFocusIndex(-1);
      setSubmenuIndex(null);
    }
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setMeasured({ width: rect.width, height: rect.height });
    node.focus();
  }, [menu]);

  const pos = useMemo(() => {
    if (!menu) return null;
    const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    const w = measured?.width ?? DEFAULT_MENU_WIDTH;
    const h = measured?.height ?? DEFAULT_MENU_HEIGHT;
    return clampToViewport(menu.x, menu.y, w, h, vw, vh);
  }, [menu, measured]);

  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (e) => {
      const node = rootRef.current;
      if (node && node.contains(e.target)) return;
      const flyout = document.querySelector('[data-testid="analyst-pro-context-menu-flyout"]');
      if (flyout && flyout.contains(e.target)) return;
      close();
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    const handleScroll = () => close();
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menu, close]);

  const selectItem = useCallback((item) => {
    // T10 plugs real dispatch here. For T9 we just close on command / checkbox.
    if (item.kind === 'command' || item.kind === 'checkbox') close();
  }, [close]);

  const onRootKeyDown = (e) => {
    if (!menu) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex((i) => nextFocusableIndex(menu.items, i, +1));
      setSubmenuIndex(null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex((i) => nextFocusableIndex(menu.items, i, -1));
      setSubmenuIndex(null);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIndex(firstFocusableIndex(menu.items));
    } else if (e.key === 'End') {
      e.preventDefault();
      let last = -1;
      for (let i = menu.items.length - 1; i >= 0; i -= 1) {
        const it = menu.items[i];
        if (it.kind === 'separator') continue;
        if (it.disabled) continue;
        last = i; break;
      }
      if (last >= 0) setFocusIndex(last);
    } else if (e.key === 'ArrowRight') {
      const it = menu.items[focusIndex];
      if (it && it.kind === 'submenu' && !it.disabled) {
        e.preventDefault();
        setSubmenuIndex(focusIndex);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      const it = menu.items[focusIndex];
      if (!it || it.kind === 'separator' || it.disabled) return;
      e.preventDefault();
      if (it.kind === 'submenu') setSubmenuIndex(focusIndex);
      else selectItem(it);
    }
  };

  if (!menu || !pos) return null;

  const parentNode = rootRef.current;
  const parentRowRect = (() => {
    if (submenuIndex == null || !parentNode) return null;
    const row = parentNode.querySelector(`[data-menu-index="${submenuIndex}"]`);
    return row ? row.getBoundingClientRect() : null;
  })();

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      aria-label="Zone actions"
      tabIndex={-1}
      className="analyst-pro-context-menu"
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={onRootKeyDown}
      data-testid="analyst-pro-context-menu"
    >
      <MenuRows
        items={menu.items}
        focusIndex={focusIndex}
        onItemPointerEnter={(idx) => {
          setFocusIndex(idx);
          if (menu.items[idx]?.kind === 'submenu') setSubmenuIndex(idx);
          else setSubmenuIndex(null);
        }}
        onItemClick={(_e, idx, item) => {
          if (item.kind === 'submenu') {
            setSubmenuIndex(idx);
            return;
          }
          if (item.kind === 'separator' || item.disabled) return;
          selectItem(item);
        }}
        onItemKeyTrigger={(idx, item) => {
          if (item.kind === 'submenu') setSubmenuIndex(idx);
          else if (!item.disabled && item.kind !== 'separator') selectItem(item);
        }}
      />
      {submenuIndex != null && menu.items[submenuIndex] && menu.items[submenuIndex].kind === 'submenu' && (
        <Flyout
          parentRect={parentRowRect}
          items={menu.items[submenuIndex].items}
          onClose={() => setSubmenuIndex(null)}
          onSelect={selectItem}
        />
      )}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Re-run tests**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`
Expected: all prior + 3 new keyboard tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/ContextMenu.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx
git commit -m "feat(analyst-pro): context-menu keyboard nav + submenu flyout (Plan 5c T9)"
```

---

### Task 10: `dispatchMenuCommand` — map command ids to store actions / console.debug stubs

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/ContextMenu.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`

- [ ] **Step 1: Append failing tests**

```tsx
import { vi } from 'vitest';

describe('<ContextMenu /> command dispatch', () => {
  it('invokes clearSelection when Deselect is clicked', () => {
    const spy = vi.fn();
    useStore.setState({ clearSelection: spy });
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 10, y: 10, zoneId: 'L1',
          items: [{ kind: 'command', id: 'deselect', label: 'Deselect' }],
        },
      });
    });
    fireEvent.click(screen.getByText('Deselect'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('invokes setActionsDialogOpen(true) on Actions…', () => {
    const spy = vi.fn();
    useStore.setState({ setActionsDialogOpen: spy });
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 10, y: 10, zoneId: 'W1',
          items: [{ kind: 'command', id: 'openActionsDialog', label: 'Actions…' }],
        },
      });
    });
    fireEvent.click(screen.getByText('Actions…'));
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('logs a console.debug when a TODO command (setFitMode.fit) is invoked', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    render(<ContextMenu />);
    act(() => {
      useStore.setState({
        analystProContextMenu: {
          x: 10, y: 10, zoneId: 'L1',
          items: [{ kind: 'command', id: 'setFitMode.fit', label: 'Fit', todo: { plan: '5d', reason: 'test' } }],
        },
      });
    });
    fireEvent.click(screen.getByText('Fit'));
    expect(debugSpy).toHaveBeenCalledWith(
      '[analyst-pro context-menu] TODO Plan 5d',
      expect.objectContaining({ id: 'setFitMode.fit' }),
    );
    debugSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run — 3 failures**

- [ ] **Step 3: Add the dispatcher**

Inside `ContextMenu.jsx`, replace the `selectItem` callback with a full dispatcher. Also pull new store actions via `useStore` at the top of the component.

```jsx
  const dashboard = useStore((s) => s.analystProDashboard);
  const updateZone = useStore((s) => s.updateZoneAnalystPro);
  const clearSelection = useStore((s) => s.clearSelection);
  const setSelection = useStore((s) => s.setAnalystProSelection);
  const ungroup = useStore((s) => s.ungroupAnalystPro);
  const setActionsDialogOpen = useStore((s) => s.setActionsDialogOpen);
  const copyZoneToClipboard = useStore((s) => s.copyZoneToClipboardAnalystPro);
  const clipboard = useStore((s) => s.analystProZoneClipboard);
  const insertObject = useStore((s) => s.insertObjectAnalystPro);

  const selectItem = useCallback((item) => {
    if (item.kind !== 'command' && item.kind !== 'checkbox') return;
    if (item.disabled) return;

    const zoneId = menu?.zoneId ?? null;
    const zone = (() => {
      if (!dashboard || !zoneId) return null;
      const stack = [dashboard.tiledRoot, ...(dashboard.floatingLayer || [])];
      while (stack.length) {
        const n = stack.pop();
        if (!n) continue;
        if (n.id === zoneId) return n;
        if (n.children) stack.push(...n.children);
      }
      return null;
    })();

    if (item.todo) {
      console.debug(`[analyst-pro context-menu] TODO Plan ${item.todo.plan}`, { id: item.id, reason: item.todo.reason });
      close();
      return;
    }

    switch (item.id) {
      case 'deselect':
        clearSelection();
        break;
      case 'selectParent': {
        if (!dashboard || !zoneId) break;
        // findParentZoneId logic inlined to avoid re-importing the builder module.
        const findParent = (container, target) => {
          for (const child of container.children) {
            if (child.id === target) return container.id;
            if (child.children) {
              const hit = findParent(child, target);
              if (hit) return hit;
            }
          }
          return null;
        };
        const parentId = findParent(dashboard.tiledRoot, zoneId);
        if (parentId) setSelection([parentId]);
        break;
      }
      case 'toggleShowTitle': {
        if (!zone) break;
        const cur = 'showTitleBar' in zone ? zone.showTitleBar : undefined;
        updateZone(zoneId, { showTitleBar: !(cur ?? true) });
        break;
      }
      case 'toggleShowCaption': {
        if (!zone) break;
        updateZone(zoneId, { showCaption: !(zone.showCaption === true) });
        break;
      }
      case 'openActionsDialog':
        setActionsDialogOpen(true);
        break;
      case 'removeContainerUnwrap':
        if (zoneId) ungroup(zoneId);
        break;
      case 'copy':
        if (zone) copyZoneToClipboard(zone);
        break;
      case 'paste':
      case 'canvas.paste': {
        if (clipboard && clipboard.type && clipboard.type !== 'container-horz' && clipboard.type !== 'container-vert') {
          // Plan 5c shim: only leaf paste is supported; subtree paste is Plan 5e.
          insertObject({ type: clipboard.type, x: menu?.x ?? 40, y: menu?.y ?? 40 });
        } else {
          console.debug('[analyst-pro context-menu] paste no-op', { clipboard });
        }
        break;
      }
      case 'canvas.addText':
        insertObject({ type: 'text', x: menu?.x ?? 40, y: menu?.y ?? 40 });
        break;
      case 'canvas.addImage':
        insertObject({ type: 'image', x: menu?.x ?? 40, y: menu?.y ?? 40 });
        break;
      case 'canvas.addBlank':
        insertObject({ type: 'blank', x: menu?.x ?? 40, y: menu?.y ?? 40 });
        break;
      default:
        console.debug('[analyst-pro context-menu] unhandled id', { id: item.id });
        break;
    }
    close();
  }, [menu, dashboard, clipboard, clearSelection, setSelection, updateZone, ungroup, setActionsDialogOpen, copyZoneToClipboard, insertObject, close]);
```

- [ ] **Step 4: Re-run tests**

Run: `npx vitest run src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`
Expected: all previous + 3 new dispatch tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/ContextMenu.jsx \
        frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx
git commit -m "feat(analyst-pro): context-menu command dispatcher (Plan 5c T10)"
```

---

### Task 11: Wire ZoneFrame, FreeformCanvas empty-area, and mount `<ContextMenu />` once

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx` — dispatch `openContextMenuAnalystPro` from `onContextMenu` instead of the stub.
- Modify: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` — add `handleSheetContextMenu` and pass it as `onContextMenu` on the `.freeform-sheet` div.
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — mount `<ContextMenu />` once at the top of the layout.

- [ ] **Step 1: Update `ZoneFrame.jsx`**

The component already accepts `onContextMenu` as a prop and calls it on right-click / Enter. The wiring change is in the **caller** (`AnalystProLayout.renderLeaf`). In `ZoneFrame.jsx` keep the prop unchanged.

Inside `AnalystProLayout.jsx` (the renderLeaf site from Plan 5a T7), replace the stubbed `onContextMenu` prop with a dispatcher that opens the menu. Locate:

```bash
grep -n "onContextMenu" frontend/src/components/dashboard/modes/AnalystProLayout.jsx
```

Expected: the stub from Plan 5a T7 passing `() => { /* Plan 5c */ }` or similar into `<ZoneFrame>`. Replace with:

```jsx
const openContextMenu = useStore((s) => s.openContextMenuAnalystPro);
// …
onContextMenu={(e, zone) => {
  // native browser right-click event: respect preventDefault already called inside ZoneFrame.
  openContextMenu(e.clientX, e.clientY, zone.id);
}}
```

- [ ] **Step 2: Add `handleSheetContextMenu` in `FreeformCanvas.jsx`**

In `FreeformCanvas.jsx` after the `handleSheetPointerDown` block, add:

```jsx
  const openContextMenuAnalystPro = useStore((s) => s.openContextMenuAnalystPro);

  const handleSheetContextMenu = (e) => {
    // Only handle the canvas-empty case — zone frames stop propagation in their
    // own onContextMenu handler (ZoneFrame.jsx:109-117).
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    openContextMenuAnalystPro(e.clientX, e.clientY, null);
  };
```

Attach to the sheet div:

```jsx
<div
  ref={sheetRef}
  …
  onPointerDown={handleSheetPointerDown}
  onContextMenu={handleSheetContextMenu}
  …
>
```

- [ ] **Step 3: Mount `<ContextMenu />` once at the top of `AnalystProLayout.jsx`**

Inside `AnalystProLayout.jsx`, add the import and render it as a sibling of the main layout children (it renders via portal, so placement inside the JSX tree is immaterial as long as it is mounted):

```jsx
import ContextMenu from '../freeform/ContextMenu';
// …
return (
  <>
    {/* existing layout JSX */}
    <ContextMenu />
  </>
);
```

- [ ] **Step 4: Extend `FreeformCanvas.integration.test.tsx` — right-click on empty canvas opens the menu**

Append:

```tsx
it('right-clicks on empty canvas open the context menu with canvas-empty items', () => {
  render(
    <FreeformCanvas
      dashboard={baseDashboard}
      renderLeaf={(z) => <div data-testid={`leaf-${z.id}`}>{z.id}</div>}
    />,
  );
  const sheet = screen.getByTestId('freeform-sheet');
  fireEvent.contextMenu(sheet, { clientX: 120, clientY: 150 });
  const state = useStore.getState().analystProContextMenu;
  expect(state).not.toBeNull();
  expect(state.zoneId).toBeNull();
  expect(state.items.some((i) => i.kind === 'command' && i.id === 'canvas.paste')).toBe(true);
});
```

- [ ] **Step 5: Run all freeform tests + lint**

Run:
```
npx vitest run src/components/dashboard/freeform/__tests__/
npm run lint
```
Expected: green. Lint warnings that already existed before this plan are acceptable; new errors must be fixed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/ZoneFrame.jsx \
        frontend/src/components/dashboard/freeform/FreeformCanvas.jsx \
        frontend/src/components/dashboard/modes/AnalystProLayout.jsx \
        frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx
git commit -m "feat(analyst-pro): wire context menu to ZoneFrame + canvas empty area (Plan 5c T11)"
```

---

### Task 12: Smoke — full freeform test suite, lint, build

**Files:** none (verification only; any micro-fixes land as `fix(analyst-pro): … (Plan 5c T12 fixup)`).

- [ ] **Step 1: Run the full freeform test scope**

```
cd "QueryCopilot V1/frontend"
npx vitest run src/components/dashboard/freeform/__tests__/
```

Expected: all freeform tests pass. If any integration test (e.g. `FreeformCanvas.integration.test.tsx`, `ActionRuntime.integration.test.tsx`) regresses because it now unexpectedly triggers the context menu, guard it by adding `fireEvent.keyDown(document, { key: 'Escape' })` in the failing test's setup or close the menu via `useStore.getState().closeContextMenuAnalystPro()`.

- [ ] **Step 2: Run the chart-IR suite — it must remain green**

```
npm run test:chart-ir
```

Pre-existing chart-ir failures (noted in `CLAUDE.md` § "Known Test Debt": ~22 failures across `src/chart-ir/__tests__/router.test.ts`, `__tests__/rsr/renderStrategyRouter.test.ts`, `__tests__/editor/*.test.tsx`) are pre-existing. Confirm the failure count is unchanged vs. the pre-Plan-5c baseline; any new failures in this suite block the plan.

- [ ] **Step 3: Lint + build**

```
npm run lint
npm run build
```

Expected: lint green (no new errors), build succeeds. If the build fails on an unused import (e.g. the `findParentZoneId` export is not referenced outside tests), keep the export — it is part of the builder's public contract consumed by future plans (5d selection helpers).

- [ ] **Step 4: Final commit (if any smoke fixups were needed)**

```bash
git add -p  # review hunks carefully
git commit -m "chore(analyst-pro): Plan 5c smoke fixups (Plan 5c T12)"
```

If the previous tasks left the tree clean, skip this step — there is nothing to commit.

---

## Self-Review Checklist

- [x] **Spec coverage.** Every deliverable in roadmap §"Plan 5c" is covered:
  1. `ContextMenu.jsx` portal + role=menu + keyboard nav + auto-close → T8 + T9.
  2. Menu item catalogue (common + worksheet + container + floating + canvas-empty) → T3 + T4 + T5 + T6.
  3. Store slice `analystProContextMenu` + open/close → T1.
  4. Pure helper `lib/contextMenuBuilder.ts` + tests → T2–T6.
  5. Wire into `ZoneFrame.jsx` + empty-area on `FreeformCanvas.jsx` → T11.
  6. Commands dispatch existing store actions; 5d/5e commands stubbed with `todo` field + console.debug → T10.
- [x] **Placeholders.** No "TBD" / "TODO" / "fill in" / "handle edge cases" — every step has concrete code or concrete command.
- [x] **Type consistency.** `MenuCommandId` string literals are referenced identically in builder tasks (T3–T6) and dispatcher (T10): `deselect`, `selectParent`, `toggleShowTitle`, `toggleShowCaption`, `copy`, `paste`, `openActionsDialog`, `removeContainerUnwrap`, `setFitMode.*`, `openProperties.*`, `remove`, `swapSheets`, `toggleFloat`, `bringForward`, `sendBackward`, `bringToFront`, `sendToBack`, `distributeEvenly`, `fitContainerToContent`, `canvas.paste`, `canvas.addText`, `canvas.addImage`, `canvas.addBlank`, `openFilters`. Submenu ids (`fit`, `padding`, `filter`, `zOrder`) are strings not in the `MenuCommandId` union — correct, because submenus have `id: string` per the discriminated union in T2.
- [x] **Appendix E.15 / visibilityRule preservation.** Documented in T10's dispatcher: the `remove` command carries a `todo: { plan: '5d' }` with the reason explicitly flagging that `removeZoneAnalystPro` must preserve `zone.visibilityRule` in the undo snapshot. Plan 5d owns the implementation; Plan 5c ensures the contract is recorded at the command site.
- [x] **Commit per task.** Every task ends with a `git commit` step. Format matches roadmap conventions.
- [x] **Stops at saved plan.** Per roadmap §8 and this plan's T12, no implementation work is performed by the planning subagent — execution is a separate session.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5c-context-menu.md`.

Two execution options for the implementer session:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task (T1 → T12), review between tasks, fast iteration. Matches the cadence used for Plans 5a / 5b.
2. **Inline Execution** — execute the 12 tasks in a single session with checkpoints after T6 (builder complete) and T10 (component complete).

Plan 5c has **no blocking upstream dependencies** beyond what is already shipped: Plan 5a's `ZoneFrame.onContextMenu` hook (commit `a4f5eca`) and Plan 5b's canvas overlay mounting pattern (commits on `askdb-global-comp`) are both live. Downstream consumers (Plan 5d property panel, Plan 5e float/container actions) will replace the `todo`-flagged stubs with real dispatches — no shape changes to `MenuItem` required.

# Plan 5e — Float Toggle + Smart Layout Defaults + Container Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one-click tiled↔floating conversion, rewrite the `legacyTilesToDashboard` shim so N tiles produce sensible multi-column grids (single Vert ≤4, 2-col 5–9, 3-col 10+), and add three new container commands — Distribute Evenly, Fit to Content, Remove Container — wired into `StructureToolbar.jsx`, the context menu (via existing Plan 5c handlers), and a Cmd/Ctrl+Shift+F keybinding.

**Architecture:** Four-layer split — all changes additive, history-integrated, covered by TDD at the pure-op + store + component boundaries:

1. **Pure ops layer — `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`.** Three new exported functions: `distributeEvenly(root, containerId)` (sets every child's split-axis proportion to an equal share, drift absorbed into last child so the sum remains exactly 100000 per `normalizeContainer`'s convention); `fitContainerToContent(root, containerId, measuredChildSizes)` (writes a `sizeOverride: { pxW, pxH }` advisory field onto the container by summing measured pixel sizes along the split axis and taking the max on the perpendicular — the layout resolver picks this up in Plan 7a, for 5e it is read by `AnalystProWorksheetTile`/floating conversion only); `removeContainer(root, containerId)` (delegates to the existing `ungroupContainer` semantics but adds a root-reject guard and re-normalization loop so callers get a single "remove me and splice my children up" verb). All three are immutable, share the existing `mapTree`/`findParentInTree` private helpers already declared inside `zoneTreeOps.ts`, and return identity references when the op is a no-op so the `setZonePropertyAnalystPro`-style history short-circuits work out of the box.

2. **Smart-layout heuristic — `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`.** The existing `legacyTilesToDashboard` shim (lines 223–251) stacks N worksheets in one `container-vert` regardless of count, so a 30-tile dashboard renders at 26 px per row on a 768 px canvas. Rewrite it to branch on tile count: ≤4 → current behaviour (single vert root, each tile `h = 100000 / n`); 5–9 → `container-horz` root with two `container-vert` children; 10+ → `container-horz` root with three `container-vert` children, tiles distributed round-robin (`tiles.forEach((t, i) => columns[i % N].push(t))`). Canvas default size swings from `{ mode: 'automatic' }` → `{ mode: 'fixed', width: 1440, height: Math.max(900, Math.ceil(tiles.length / N) * 320), preset: 'custom' }` so the new grids actually have pixels to fill. Users retain the existing `SizeToggleDropdown` to revert to Automatic. **Legacy backward-compat is hard-guaranteed by the ≤4 branch** — existing 1–4 tile dashboards produce byte-identical zone trees.

3. **State layer — `frontend/src/store.js`.** Four new history-integrated actions (analogous to existing `ungroupAnalystPro` / `alignSelectionAnalystPro` precedents):
   - `toggleZoneFloatAnalystPro(zoneId, targetContainerId?)` — tiled → floating: resolve the zone's pixel rect via `resolveLayout(dash.tiledRoot, dash.floatingLayer, canvasW, canvasH)` (canvas px come from `dash.size` fixed/preset, falling back to 1440×900 for range/automatic modes with a `console.debug`), then `removeChild` it from the tree and push a new `FloatingZone` with `{ floating: true, x, y, pxW, pxH, zIndex: maxZ + 1, w: 0, h: 0 }` preserving all other zone fields (type, worksheetRef, visibilityRule, background, etc.). Floating → tiled: remove from `floatingLayer`, strip `{ floating, x, y, pxW, pxH, zIndex }`, reset `w = h = 100000`, and insert as last child of the target container (default `dash.tiledRoot.id`) via `insertChild`. Both branches push to history and select the new id.
   - `distributeEvenlyAnalystPro(containerId)` — calls `distributeEvenly(dash.tiledRoot, containerId)`; identity guard → no history push.
   - `fitContainerToContentAnalystPro(containerId)` — reads pixel sizes from the DOM via `document.querySelectorAll('[data-zone-id]')` inside the canvas root (Plan 5a `ZoneFrame.jsx` already emits `data-zone-id` on its wrapper div), builds a `Record<string, {width, height}>`, calls `fitContainerToContent`, writes back.
   - `removeContainerAnalystPro(containerId)` — calls `removeContainer`; identity guard → no history push. Selection collapses to the grandparent id if the container was selected.

4. **Presentation + input layer — `StructureToolbar.jsx`, `ContextMenu.jsx`, `useKeyboardShortcuts.js`.** Three new toolbar buttons (Distribute Evenly `⇹`, Fit to Content `⇲`, Remove Container `⬚`) with disabled-state logic reading `analystProSelection` + `analystProDashboard` exactly like the existing Group/Ungroup buttons. The Plan 5c context-menu item `distribute-evenly` / `fit-to-content` / `remove-container` IDs (already plumbed through `contextMenuBuilder` as disabled stubs) get promoted to live dispatches. A single new keybinding `Cmd/Ctrl+Shift+F` in `useKeyboardShortcuts.js` calls `toggleZoneFloatAnalystPro` for every zone in the current selection.

**The runtime flow (toggle-to-float):** user selects a tiled worksheet zone `z1` → presses `Cmd+Shift+F` → `useKeyboardShortcuts` calls `toggleZoneFloatAnalystPro('z1')` → store resolves layout → `{ width: 480, height: 320, x: 40, y: 60 }` → `removeChild(tiledRoot, 'z1')` → push new `FloatingZone` with `{ id:'z1', type:'worksheet', floating:true, x:40, y:60, pxW:480, pxH:320, zIndex: maxZ+1, worksheetRef:'ws1' }` → `pushAnalystProHistory(nextDash)` → canvas re-renders with the zone now absolute-positioned and draggable via existing Plan 2b floating-drag handlers.

**The runtime flow (new-dashboard smart layout):** Chat page generates 12 chart tiles via agent → route pushes them to `/analytics` → `AnalystProLayout` mounts with `tiles.length === 12` → `legacyTilesToDashboard` returns `container-horz` root with three `container-vert` children, 4 tiles each (round-robin) → canvas size `{ mode: 'fixed', width: 1440, height: 1280 }` (ceil(12/3) * 320 = 1280, max(900, 1280) = 1280) → FreeformCanvas renders a proper 3-column dashboard instead of 12 26-pixel rows.

**Tech Stack:** React 19, Zustand (`store.js`), TypeScript 5.7 for `lib/*.ts`, Vitest 2.x + `@testing-library/react` for tests. No new deps. No backend change — the legacy shim is a frontend-only adapter; backend `dashboard_migration.py::legacy_to_freeform_schema` is a different code path (real persisted dashboards) and already round-trips multi-level containers, so Plan 5e needs zero backend work.

**References (authoritative — read before any step):**
- Parent roadmap: `docs/analyst_pro_tableau_parity_roadmap.md` §"Plan 5e — Float Toggle + Smart Layout Defaults + Container Commands". Deliverables 1–5 map 1:1 onto T7 (toggle action) / T8 (legacy shim rewrite) / T1–T3 (ops) + T4–T6 (actions) / T9 (toolbar) / T10 (keybinding).
- Tableau source of truth: `docs/Build_Tableau.md`
  - §IX.2 **Tiled vs Floating** — establishes the container-tree vs absolute-layer invariant. Tiled zone axis redistribution is proportional-by-existing-weights (Appendix E.11), which is why `removeChild` calls `normalizeContainer` after splice and why the toggle-to-floating path pushes the removed zone's former axis share back to its siblings via existing `removeChild` semantics. Also names `FlowLayoutInfo::SetCellSize(w,h)` — the Tableau primitive our `resizeZone` is shaped after; Plan 5e's `distributeEvenly` is Tableau's complementary "equal-share override" that ignores per-child weights.
  - §IX.3 **Containers** — names all three new commands we ship: "Distribute Evenly" (the equal-share override), "Fit width/height" (the worksheet-viewport version lives in Plan 5d `fitMode`; 5e ships the container-level "Fit to Content" sibling), and "Remove Container" implicit in the container-ops catalogue. Confirms Distribute Evenly ignores per-child weights — our `distributeEvenly` matches exactly by assigning `100000 / n` to every child regardless of their prior axis value.
  - §IX.4 **Dashboard size modes** — `DashboardSizingMode.Fixed` carries a `SetFixedSizePresetIndex` handle per the wire format. The smart-layout heuristic defaults to `{ mode: 'fixed', preset: 'custom', width: 1440, height: ... }` because any `{ mode: 'automatic' }` dashboard has no minimum height to force 3-column grids to fit, and tiles at 2 px tall regress the bug we are fixing.
  - Appendix E.11 **Critical Behavioural Facts** — "Tiled zone redistribution = proportional by existing cell-size weights (NOT smallest-first)." Our `toggleZoneFloatAnalystPro` inherits this via the existing `removeChild`'s `normalizeContainer` call; no new code required. Documented in a comment on the toggle action.
- Precedent plans:
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5b-drop-indicators-restructure.md` — `moveZoneAcrossContainers` / `wrapInContainer` precedent for new `zoneTreeOps.ts` exports. `distributeEvenly` / `removeContainer` follow the same immutable mapTree pattern.
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5c-context-menu.md` — T4 worksheet items and T5 container items list `distribute-evenly`, `fit-to-content`, `remove-container` as disabled stubs. Plan 5e task T9 promotes them to live.
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5d-zone-properties-inspector.md` — `setZonePropertyAnalystPro(zoneId, patch)` precedent for history-aware patch action (Plan 5e re-uses it for advisory `sizeOverride` writes where `fitContainerToContent` would otherwise need its own history-push).
- Project conventions: `QueryCopilot V1/CLAUDE.md` — store action suffix `…AnalystPro`, slice prefix `analystPro…`, Vega-Lite only, BYOK untouched, commit-per-task `feat(analyst-pro): <verb> <object> (Plan 5e TN)`.

**Non-goals (deferred — stubbed or documented):**
- Destination-container picker UI for floating → tiled — default to root in 5e; Plan 6c owns the tree picker. A `targetContainerId` arg is accepted so the future picker can wire without re-shipping the action.
- Resolver integration for the tiled-container `sizeOverride` advisory field — Plan 7a ships the VizQL layout engine that honours px overrides on tiled containers. For 5e, `fitContainerToContent` on a tiled container writes the advisory field and leaves a `console.debug('[Plan 5e] sizeOverride set on tiled container; Plan 7a honours')`. Floating-container Fit-to-Content works today because floating zones already use `pxW` / `pxH`.
- Round-trip persistence through `backend/dashboard_migration.py` for `sizeOverride` / smart-layout `container-horz` roots — already covered: `legacy_to_freeform_schema` emits opaque zone dicts with arbitrary child trees; `user_storage.update_dashboard` whitelists `tiledRoot` as an opaque blob (same path Plan 5d uses). A new backend test is **not** added because no new backend field crosses the wire.
- Animating the float transition — CSS `transition` on `ZoneFrame.jsx` already blends position changes; Plan 6a owns explicit viewport animations.
- Device-layout overrides for floating coordinates — Plan 6a.
- Undo/redo for the smart-layout heuristic — the heuristic runs once at mount time in a `useMemo`; it is not a user-triggered edit, so it deliberately does not push to history. Users who want to revert get a single `Cmd+Z` on the first real edit they make.

**Shared conventions (HARD — from roadmap §"Shared conventions"):**
- **TDD for library code.** Required for the three new `zoneTreeOps.ts` ops (T1–T3), for the smart-layout heuristic `legacyTilesToDashboard` (T8 — extracted so it is directly importable), and for the new store actions (T4–T7). Toolbar button + keybinding layer (T9, T10) get component-level tests via `@testing-library/react`.
- **Store naming.** Action names: `toggleZoneFloatAnalystPro`, `distributeEvenlyAnalystPro`, `fitContainerToContentAnalystPro`, `removeContainerAnalystPro`. No slice adds — actions read/write existing `analystProDashboard` + `analystProSelection`.
- **Commit format.** `feat(analyst-pro): <verb> <object> (Plan 5e TN)` / `test(analyst-pro): <desc> (Plan 5e TN)` / `fix(analyst-pro): <desc> (Plan 5e TN fixup)`.
- **Canonical Tableau enum names.** `sizeOverride` field name mirrors Tableau's wire-level `DashboardSize` advisory block (Appendix A.12 `DashboardSizingMode`). We do not invent `fitContent` as a verb elsewhere — menu label is "Fit to Content", payload field is `sizeOverride`, keybinding is `Cmd/Ctrl+Shift+F` (F = Float, reserved by roadmap Deliverable 5).
- **No emoji in code.** Toolbar glyphs are `⇹` U+21F9, `⇲` U+21F2, `⬚` U+2B1A — Unicode mathematical/geometric symbols, not emoji.
- **Security / BYOK invariants.** No API calls added. No `anthropic` imports. No new backend router. No SQL. Test fixtures build DOM nodes via `document.createElement` + `setAttribute` (never `innerHTML`).
- **Vega-Lite only.** Untouched.
- **Legacy backward-compat.** `legacyTilesToDashboard(tiles)` with `tiles.length ≤ 4` produces byte-identical output to the pre-5e implementation. T8 regression test locks this in.

---

## File Structure

| File | Role | Action |
|---|---|---|
| `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts` | Add `distributeEvenly`, `fitContainerToContent`, `removeContainer` exports. Share the existing `mapTree` / `findParentInTree` private helpers (already declared in file). | Modify |
| `frontend/src/components/dashboard/freeform/lib/types.ts` | Add optional `sizeOverride?: { pxW: number; pxH: number }` advisory field on `BaseZone`. Documented as "advisory — resolver support lands in Plan 7a". | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts` | Extend with 3 new describe blocks: `distributeEvenly`, `fitContainerToContent`, `removeContainer`. 15 total new test cases. | Modify |
| `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` | Rewrite `legacyTilesToDashboard` to branch on tile count. Export the function so tests can import it. | Modify |
| `frontend/src/components/dashboard/modes/__tests__/AnalystProLayout.smartLayout.test.tsx` | New — unit tests on the exported `legacyTilesToDashboard` helper for N ∈ {0, 1, 4, 7, 15, …}. | Create |
| `frontend/src/store.js` | Add four actions: `toggleZoneFloatAnalystPro`, `distributeEvenlyAnalystPro`, `fitContainerToContentAnalystPro`, `removeContainerAnalystPro`. | Modify |
| `frontend/src/__tests__/store.toggleZoneFloat.test.ts` | New — TDD for toggle action: tiled→floating preserves identity + pixel rect, floating→tiled reinserts into default/specified container, no-op short-circuits, history entry pushed. | Create |
| `frontend/src/__tests__/store.containerCommands.test.ts` | New — TDD for `distributeEvenlyAnalystPro`, `fitContainerToContentAnalystPro`, `removeContainerAnalystPro` with dashboard fixture + selection mutation assertions. | Create |
| `frontend/src/components/dashboard/freeform/panels/StructureToolbar.jsx` | Add three new buttons with disabled-state memos and `aria-label`s matching the existing Group/Ungroup pattern. | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/StructureToolbar.test.tsx` | Extend with 5 new test cases: button disabled when no container selected; Distribute Evenly click dispatches; Fit to Content click dispatches; Remove Container click dispatches; Remove Container disabled for root. | Modify |
| `frontend/src/components/dashboard/freeform/ContextMenu.jsx` | Promote the Plan 5c `distribute-evenly` / `fit-to-content` / `remove-container` stub commands from disabled `console.debug` to live dispatches. Remove the stub log lines. | Modify |
| `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js` | Add `Cmd/Ctrl+Shift+F` branch that calls `toggleZoneFloatAnalystPro(id)` for every zone in `selection`. | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/useKeyboardShortcuts.test.ts` | New — tests that `metaKey+shiftKey+key='f'` and `ctrlKey+shiftKey+key='F'` both fire the toggle action; plain `metaKey+f` does NOT. | Create |

Vitest config already covers `src/components/dashboard/freeform/__tests__/**/*.test.{ts,tsx}` and `src/__tests__/**`. Smoke command: `npx vitest run src/components/dashboard/freeform/__tests__/ src/components/dashboard/modes/__tests__/ src/__tests__/store.toggleZoneFloat.test.ts src/__tests__/store.containerCommands.test.ts`, then `npm run lint`, `npm run build`.

---

## Task Checklist

- [ ] T1. `lib/zoneTreeOps.ts` — `distributeEvenly(root, containerId)` pure op. TDD via new describe block in `zoneTreeOps.test.ts`.
- [ ] T2. `lib/zoneTreeOps.ts` — `fitContainerToContent(root, containerId, measuredChildSizes)` pure op + `sizeOverride` optional field on `BaseZone` (`types.ts`). TDD.
- [ ] T3. `lib/zoneTreeOps.ts` — `removeContainer(root, containerId)` pure op. TDD (root-reject, unwrap, renormalize).
- [ ] T4. `store.js` — `distributeEvenlyAnalystPro(containerId)` action. TDD via `store.containerCommands.test.ts`.
- [ ] T5. `store.js` — `fitContainerToContentAnalystPro(containerId)` action (reads DOM via `data-zone-id`, falls back to empty map when no DOM). TDD.
- [ ] T6. `store.js` — `removeContainerAnalystPro(containerId)` action with selection collapse to grandparent. TDD.
- [ ] T7. `store.js` — `toggleZoneFloatAnalystPro(zoneId, targetContainerId?)` action. TDD via `store.toggleZoneFloat.test.ts` (tiled→floating, floating→tiled, history entry, default container).
- [ ] T8. `AnalystProLayout.jsx` — rewrite `legacyTilesToDashboard`, export as named, add smart-layout heuristic + fixed-size default. TDD via new `AnalystProLayout.smartLayout.test.tsx`.
- [ ] T9. `StructureToolbar.jsx` — add three buttons; extend `StructureToolbar.test.tsx`. Wire Plan 5c context-menu stubs in `ContextMenu.jsx` to the new store actions.
- [ ] T10. `useKeyboardShortcuts.js` — add `Cmd/Ctrl+Shift+F` branch + test.
- [ ] T11. Smoke — `npx vitest run src/components/dashboard/freeform/__tests__/ src/components/dashboard/modes/__tests__/ src/__tests__/store.toggleZoneFloat.test.ts src/__tests__/store.containerCommands.test.ts`, `npm run lint`, `npm run build`. Fixups as needed.

---

## Task Specifications

### Task 1: `distributeEvenly` — equal-share container op

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`

**Tableau reference.** §IX.3 "Distribute evenly — ignores per-child weights, equal shares." Appendix E.11 "Tiled zone redistribution = proportional by existing cell-size weights (NOT smallest-first)" — Distribute Evenly is the **override** that breaks from proportional-by-existing-weights, so we set every child's axis proportion to `100000 / n` and do **not** use `normalizeContainer`'s weighted scaling.

- [ ] **Step 1: Write the failing tests**

Extend the top import line of `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`:

```ts
import {
  insertChild,
  removeChild,
  moveZoneAcrossContainers,
  wrapInContainer,
  distributeEvenly,
  fitContainerToContent,
  removeContainer,
} from '../lib/zoneTreeOps';
```

Then add this describe block at the end of the file (the file has no wrapping describe — each block is top-level):

```ts
describe('distributeEvenly', () => {
  it('sets every child to 100000 / n on the split axis (horz container)', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 20000, h: 100000 },
        { id: 'b', type: 'blank', w: 30000, h: 100000 },
        { id: 'c', type: 'blank', w: 50000, h: 100000 },
      ],
    };
    const next = distributeEvenly(root, 'root') as ContainerZone;
    // Three children → 100000 / 3 = 33333, 33333, 33334 (drift on last)
    expect(next.children.map((c) => c.w)).toEqual([33333, 33333, 33334]);
    expect(next.children.reduce((s, c) => s + c.w, 0)).toBe(100000);
  });

  it('sets every child to 100000 / n on the split axis (vert container)', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 100000, h: 20000 },
        { id: 'b', type: 'blank', w: 100000, h: 80000 },
      ],
    };
    const next = distributeEvenly(root, 'root') as ContainerZone;
    expect(next.children.map((c) => c.h)).toEqual([50000, 50000]);
  });

  it('returns identity when container has < 2 children', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(distributeEvenly(root, 'root')).toBe(root);
  });

  it('returns identity when id is not a container', () => {
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
    expect(distributeEvenly(root, 'a')).toBe(root);
  });

  it('does not mutate input tree', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 20000, h: 100000 },
        { id: 'b', type: 'blank', w: 80000, h: 100000 },
      ],
    };
    const before = JSON.stringify(root);
    distributeEvenly(root, 'root');
    expect(JSON.stringify(root)).toBe(before);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts -t distributeEvenly`

Expected: 5 FAIL — import of `distributeEvenly` does not resolve.

- [ ] **Step 3: Implement `distributeEvenly`**

Append to `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts` (after the `wrapInContainer` export, before end of file):

```ts
/**
 * Distribute Evenly (Tableau §IX.3) — override per-child weights, set every
 * child's split-axis proportion to 100000 / n. Perpendicular axis untouched.
 * Drift from integer division is absorbed into the last child so the sum is
 * exactly 100000.
 *
 * Returns identity when:
 *   - containerId not found
 *   - target is not a container
 *   - container has fewer than 2 children
 */
export function distributeEvenly(root: Zone, containerId: string): Zone {
  const target = findZoneInTree(root, containerId);
  if (!target || !isContainer(target)) return root;
  if (target.children.length < 2) return root;

  return mapTree(root, (zone) => {
    if (zone.id !== containerId || !isContainer(zone)) return zone;
    const axis: 'w' | 'h' = zone.type === 'container-horz' ? 'w' : 'h';
    const n = zone.children.length;
    const share = Math.floor(100000 / n);
    const nextChildren = zone.children.map((c) => ({ ...c, [axis]: share }));
    const drift = 100000 - share * n;
    if (drift !== 0) {
      const last = nextChildren[n - 1] as Zone & { w: number; h: number };
      nextChildren[n - 1] = { ...last, [axis]: last[axis] + drift } as Zone;
    }
    return { ...zone, children: nextChildren };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts -t distributeEvenly`

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
git commit -m "feat(analyst-pro): distributeEvenly zone-tree op (Plan 5e T1)"
```

---

### Task 2: `fitContainerToContent` — advisory pixel-size override

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/types.ts`
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`

**Tableau reference.** §IX.3 "Fit width/height (sheet zone) — forces worksheet viewport to match." The container-level sibling — sum children's natural pixel sizes along the split axis, take max on the perpendicular. §IX.4 `DashboardSizingMode.Fixed` — the field name `sizeOverride` mirrors Tableau's advisory-overlay pattern.

- [ ] **Step 1: Extend `BaseZone` with the `sizeOverride` advisory field**

Modify `frontend/src/components/dashboard/freeform/lib/types.ts` — insert immediately after the `fitMode?:` line (currently the last field in `BaseZone`, at line 83):

```ts
  /** Plan 5e — advisory pixel override written by "Fit to Content". The
   *  layout resolver honours this on floating containers today (via pxW/pxH
   *  on the floating layer); tiled-container honour lands in Plan 7a. */
  sizeOverride?: { pxW: number; pxH: number };
```

- [ ] **Step 2: Write the failing tests**

Append to `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`:

```ts
describe('fitContainerToContent', () => {
  it('sums children pixel widths along horz split axis, max height on perp', () => {
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
    const next = fitContainerToContent(root, 'root', {
      a: { width: 200, height: 120 },
      b: { width: 180, height: 150 },
    }) as ContainerZone;
    expect(next.sizeOverride).toEqual({ pxW: 380, pxH: 150 });
    expect(next.children).toEqual(root.children);
  });

  it('sums heights along vert split axis, max width on perp', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'a', type: 'blank', w: 100000, h: 50000 },
        { id: 'b', type: 'blank', w: 100000, h: 50000 },
      ],
    };
    const next = fitContainerToContent(root, 'root', {
      a: { width: 320, height: 100 },
      b: { width: 240, height: 180 },
    }) as ContainerZone;
    expect(next.sizeOverride).toEqual({ pxW: 320, pxH: 280 });
  });

  it('treats missing child measurements as 0 pixels', () => {
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
    const next = fitContainerToContent(root, 'root', { a: { width: 200, height: 120 } }) as ContainerZone;
    expect(next.sizeOverride).toEqual({ pxW: 200, pxH: 120 });
  });

  it('returns identity when id is not a container', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(fitContainerToContent(root, 'a', {})).toBe(root);
  });

  it('does not mutate input tree', () => {
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
    const before = JSON.stringify(root);
    fitContainerToContent(root, 'root', { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } });
    expect(JSON.stringify(root)).toBe(before);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts -t fitContainerToContent`

Expected: 5 FAIL.

- [ ] **Step 4: Implement `fitContainerToContent`**

Append to `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`:

```ts
/**
 * Fit Container to Content (Tableau §IX.3) — compute the container's natural
 * pixel size from measured child sizes and write it to `sizeOverride`.
 *   - Split axis: sum of children pixel sizes along that axis.
 *   - Perpendicular axis: max of children pixel sizes across that axis.
 *
 * Missing child measurements are treated as 0 px. Children are not mutated.
 * Returns identity when containerId is not a container.
 */
export function fitContainerToContent(
  root: Zone,
  containerId: string,
  measuredChildSizes: Record<string, { width: number; height: number }>,
): Zone {
  const target = findZoneInTree(root, containerId);
  if (!target || !isContainer(target)) return root;

  return mapTree(root, (zone) => {
    if (zone.id !== containerId || !isContainer(zone)) return zone;
    const isHorz = zone.type === 'container-horz';
    let sumAxis = 0;
    let maxPerp = 0;
    for (const child of zone.children) {
      const m = measuredChildSizes[child.id] || { width: 0, height: 0 };
      if (isHorz) {
        sumAxis += m.width;
        if (m.height > maxPerp) maxPerp = m.height;
      } else {
        sumAxis += m.height;
        if (m.width > maxPerp) maxPerp = m.width;
      }
    }
    const sizeOverride = isHorz
      ? { pxW: sumAxis, pxH: maxPerp }
      : { pxW: maxPerp, pxH: sumAxis };
    return { ...zone, sizeOverride };
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts -t fitContainerToContent`

Expected: 5 PASS.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/types.ts frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
git commit -m "feat(analyst-pro): fitContainerToContent zone-tree op + sizeOverride field (Plan 5e T2)"
```

---

### Task 3: `removeContainer` — unwrap children into grandparent

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`

**Tableau reference.** §IX.3 Container ops. Appendix E.11 proportional redistribution — when we unwrap, grandparent children are renormalized by existing weights via `normalizeContainer` (already called inside `ungroupContainer`).

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`:

```ts
describe('removeContainer', () => {
  it('unwraps a nested container into grandparent preserving order', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'inner',
          type: 'container-horz',
          w: 100000,
          h: 50000,
          children: [
            { id: 'x', type: 'blank', w: 60000, h: 100000 },
            { id: 'y', type: 'blank', w: 40000, h: 100000 },
          ],
        },
        { id: 'z', type: 'blank', w: 100000, h: 50000 },
      ],
    };
    const next = removeContainer(root, 'inner') as ContainerZone;
    expect(next.children.map((c) => c.id)).toEqual(['x', 'y', 'z']);
  });

  it('renormalizes grandparent split-axis sum to 100000', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        {
          id: 'inner',
          type: 'container-vert',
          w: 100000,
          h: 60000,
          children: [
            { id: 'x', type: 'blank', w: 100000, h: 50000 },
            { id: 'y', type: 'blank', w: 100000, h: 50000 },
          ],
        },
        { id: 'z', type: 'blank', w: 100000, h: 40000 },
      ],
    };
    const next = removeContainer(root, 'inner') as ContainerZone;
    expect(next.children.reduce((s, c) => s + c.h, 0)).toBe(100000);
  });

  it('rejects removing the root (returns identity)', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(removeContainer(root, 'root')).toBe(root);
  });

  it('returns identity when id is not found', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(removeContainer(root, 'nope')).toBe(root);
  });

  it('returns identity when target is not a container', () => {
    const root: ContainerZone = {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: [{ id: 'a', type: 'blank', w: 100000, h: 100000 }],
    };
    expect(removeContainer(root, 'a')).toBe(root);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts -t removeContainer`

Expected: 5 FAIL.

- [ ] **Step 3: Implement `removeContainer`**

Append to `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`:

```ts
/**
 * Remove Container (Tableau §IX.3) — unwrap: replace the container with its
 * children inline inside the grandparent, then renormalize. Rejects:
 *   - removing the root (root has no grandparent)
 *   - id not found
 *   - target is not a container
 *
 * Implementation delegates to ungroupContainer, which already handles
 * proportional redistribution per Appendix E.11.
 */
export function removeContainer(root: Zone, containerId: string): Zone {
  if (root.id === containerId) return root;
  const target = findZoneInTree(root, containerId);
  if (!target || !isContainer(target)) return root;
  return ungroupContainer(root, containerId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts -t removeContainer`

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
git commit -m "feat(analyst-pro): removeContainer zone-tree op (Plan 5e T3)"
```

---

### Task 4: `distributeEvenlyAnalystPro` store action

**Files:**
- Modify: `frontend/src/store.js`
- Create: `frontend/src/__tests__/store.containerCommands.test.ts`

- [ ] **Step 1: Create the test file with the failing Distribute Evenly tests**

Write `frontend/src/__tests__/store.containerCommands.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

function makeDash(containerChildren: any[]) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'Test',
    archetype: 'analyst-pro',
    size: { mode: 'fixed', width: 1000, height: 600, preset: 'custom' },
    tiledRoot: {
      id: 'root',
      type: 'container-horz',
      w: 100000,
      h: 100000,
      children: containerChildren,
    },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

function reset() {
  useStore.setState({
    analystProDashboard: null,
    analystProSelection: new Set(),
    analystProHistory: null,
  });
}

describe('distributeEvenlyAnalystPro', () => {
  beforeEach(reset);

  it('sets every child of the target container to 100000 / n on the axis', () => {
    const dash = makeDash([
      { id: 'a', type: 'blank', w: 20000, h: 100000 },
      { id: 'b', type: 'blank', w: 30000, h: 100000 },
      { id: 'c', type: 'blank', w: 50000, h: 100000 },
    ]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    useStore.getState().distributeEvenlyAnalystPro('root');
    const next = useStore.getState().analystProDashboard;
    expect(next.tiledRoot.children.map((c: any) => c.w)).toEqual([33333, 33333, 33334]);
  });

  it('no-ops (no history push) when target container has < 2 children', () => {
    const dash = makeDash([{ id: 'a', type: 'blank', w: 100000, h: 100000 }]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    const pastBefore = useStore.getState().analystProHistory.past.length;
    useStore.getState().distributeEvenlyAnalystPro('root');
    expect(useStore.getState().analystProDashboard).toBe(dash);
    expect(useStore.getState().analystProHistory.past.length).toBe(pastBefore);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd frontend && npx vitest run src/__tests__/store.containerCommands.test.ts -t distributeEvenlyAnalystPro`

Expected: 2 FAIL (`distributeEvenlyAnalystPro is not a function`).

- [ ] **Step 3: Add the import + action**

In `frontend/src/store.js`, extend the existing `zoneTreeOps` import (grep first: `grep -n "zoneTreeOps" frontend/src/store.js`). Add `distributeEvenly`, `fitContainerToContent`, `removeContainer` to that import list.

Insert the new action immediately after `ungroupAnalystPro` (currently at `store.js:1078-1086`):

```js
  // Plan 5e: Distribute Evenly — equal-share override on container children.
  distributeEvenlyAnalystPro: (containerId) => {
    const { analystProDashboard: dash } = get();
    if (!dash?.tiledRoot || !containerId) return;
    const nextRoot = distributeEvenly(dash.tiledRoot, containerId);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash);
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/store.containerCommands.test.ts -t distributeEvenlyAnalystPro`

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js frontend/src/__tests__/store.containerCommands.test.ts
git commit -m "feat(analyst-pro): distributeEvenlyAnalystPro store action (Plan 5e T4)"
```

---

### Task 5: `fitContainerToContentAnalystPro` store action

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/__tests__/store.containerCommands.test.ts`

**Design note.** DOM measurement happens inside the action via `document.querySelectorAll('[data-zone-id]')`. In a JSDOM test environment `document` exists but `getBoundingClientRect()` returns zeroes; tests compensate by stubbing `getBoundingClientRect` on the rendered element. For zero-measurement paths (no matching DOM, or all measurements zero) the action still writes `sizeOverride: { pxW: 0, pxH: 0 }` — downstream consumers treat zero as "no override". Tests must build DOM nodes via `document.createElement` + `setAttribute` — never `innerHTML` (project security guard rejects `innerHTML` on untrusted strings).

- [ ] **Step 1: Append the failing tests**

Append to `frontend/src/__tests__/store.containerCommands.test.ts`:

```ts
describe('fitContainerToContentAnalystPro', () => {
  beforeEach(reset);

  it('writes sizeOverride on the container from measured direct children', () => {
    const dash = makeDash([
      { id: 'a', type: 'blank', w: 50000, h: 100000 },
      { id: 'b', type: 'blank', w: 50000, h: 100000 },
    ]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);

    // Build DOM nodes with data-zone-id via createElement (NOT innerHTML).
    const host = document.createElement('div');
    host.setAttribute('data-testid', 'analyst-pro-canvas-root');
    const elA = document.createElement('div');
    elA.setAttribute('data-zone-id', 'a');
    const elB = document.createElement('div');
    elB.setAttribute('data-zone-id', 'b');
    host.appendChild(elA);
    host.appendChild(elB);
    document.body.appendChild(host);
    elA.getBoundingClientRect = () => ({ width: 200, height: 120 } as DOMRect);
    elB.getBoundingClientRect = () => ({ width: 180, height: 150 } as DOMRect);

    useStore.getState().fitContainerToContentAnalystPro('root');
    const next = useStore.getState().analystProDashboard;
    expect(next.tiledRoot.sizeOverride).toEqual({ pxW: 380, pxH: 150 });
    host.remove();
  });

  it('no-ops when container id is not found', () => {
    const dash = makeDash([{ id: 'a', type: 'blank', w: 100000, h: 100000 }]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    useStore.getState().fitContainerToContentAnalystPro('nope');
    expect(useStore.getState().analystProDashboard).toBe(dash);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd frontend && npx vitest run src/__tests__/store.containerCommands.test.ts -t fitContainerToContentAnalystPro`

Expected: 2 FAIL.

- [ ] **Step 3: Add the action to `store.js`**

Insert after `distributeEvenlyAnalystPro`:

```js
  // Plan 5e: Fit to Content — write sizeOverride from DOM-measured child sizes.
  // Resolver-side honouring for tiled containers lands in Plan 7a; floating
  // containers already respect pxW/pxH.
  fitContainerToContentAnalystPro: (containerId) => {
    const { analystProDashboard: dash } = get();
    if (!dash?.tiledRoot || !containerId) return;
    const measured = {};
    if (typeof document !== 'undefined') {
      const nodes = document.querySelectorAll('[data-zone-id]');
      nodes.forEach((n) => {
        const id = n.getAttribute('data-zone-id');
        if (!id) return;
        const r = n.getBoundingClientRect();
        measured[id] = { width: r.width || 0, height: r.height || 0 };
      });
    }
    const nextRoot = fitContainerToContent(dash.tiledRoot, containerId, measured);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash);
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/store.containerCommands.test.ts -t fitContainerToContentAnalystPro`

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js frontend/src/__tests__/store.containerCommands.test.ts
git commit -m "feat(analyst-pro): fitContainerToContentAnalystPro store action (Plan 5e T5)"
```

---

### Task 6: `removeContainerAnalystPro` store action

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/__tests__/store.containerCommands.test.ts`

**Selection semantics.** When the selected container is removed, selection collapses to the grandparent id (not empty), matching Tableau's post-unwrap cursor behaviour (§IX.3 implicit — after `ungroupContainer` the UI restores focus to the surviving ancestor).

- [ ] **Step 1: Append the failing tests**

Append to `frontend/src/__tests__/store.containerCommands.test.ts`:

```ts
describe('removeContainerAnalystPro', () => {
  beforeEach(reset);

  it('unwraps the selected container and collapses selection to grandparent', () => {
    const dash = makeDash([
      {
        id: 'inner',
        type: 'container-horz',
        w: 100000,
        h: 100000,
        children: [
          { id: 'x', type: 'blank', w: 50000, h: 100000 },
          { id: 'y', type: 'blank', w: 50000, h: 100000 },
        ],
      },
    ]);
    useStore.setState({
      analystProDashboard: dash,
      analystProSelection: new Set(['inner']),
    });
    useStore.getState().initAnalystProHistory(dash);
    useStore.getState().removeContainerAnalystPro('inner');
    const next = useStore.getState().analystProDashboard;
    expect(next.tiledRoot.children.map((c: any) => c.id)).toEqual(['x', 'y']);
    expect([...useStore.getState().analystProSelection]).toEqual(['root']);
  });

  it('no-ops on root (returns identity)', () => {
    const dash = makeDash([{ id: 'a', type: 'blank', w: 100000, h: 100000 }]);
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    useStore.getState().removeContainerAnalystPro('root');
    expect(useStore.getState().analystProDashboard).toBe(dash);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd frontend && npx vitest run src/__tests__/store.containerCommands.test.ts -t removeContainerAnalystPro`

Expected: 2 FAIL.

- [ ] **Step 3: Add the action to `store.js`**

Insert after `fitContainerToContentAnalystPro`:

```js
  // Plan 5e: Remove Container — unwrap children into grandparent, renormalize.
  // Collapses selection to the grandparent of the removed container.
  removeContainerAnalystPro: (containerId) => {
    const { analystProDashboard: dash, analystProSelection: sel } = get();
    if (!dash?.tiledRoot || !containerId) return;
    const findParentId = (zone, targetId, parentId) => {
      if (zone.id === targetId) return parentId;
      if (!zone.children) return null;
      for (const c of zone.children) {
        const found = findParentId(c, targetId, zone.id);
        if (found !== null) return found;
      }
      return null;
    };
    const grandparentId = findParentId(dash.tiledRoot, containerId, null);
    const nextRoot = removeContainer(dash.tiledRoot, containerId);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = { ...dash, tiledRoot: nextRoot };
    const nextSel = sel.has(containerId) && grandparentId
      ? new Set([grandparentId])
      : sel;
    set({ analystProDashboard: nextDash, analystProSelection: nextSel });
    get().pushAnalystProHistory(nextDash);
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/store.containerCommands.test.ts -t removeContainerAnalystPro`

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js frontend/src/__tests__/store.containerCommands.test.ts
git commit -m "feat(analyst-pro): removeContainerAnalystPro store action (Plan 5e T6)"
```

---

### Task 7: `toggleZoneFloatAnalystPro` — tiled ↔ floating

**Files:**
- Modify: `frontend/src/store.js`
- Create: `frontend/src/__tests__/store.toggleZoneFloat.test.ts`

**Tableau reference.** §IX.2 — tiled zones carry proportional w/h inside a container tree, floating zones carry absolute `(x, y, w, h)`. Appendix E.11 — tiled redistribution is proportional-by-existing-weights, inherited via `removeChild` → `normalizeContainer`.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/__tests__/store.toggleZoneFloat.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

function fixedDash(extra: Partial<any> = {}) {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'T',
    archetype: 'analyst-pro',
    size: { mode: 'fixed', width: 1000, height: 600, preset: 'custom' },
    tiledRoot: {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [
        { id: 'z1', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws1' },
        { id: 'z2', type: 'worksheet', w: 100000, h: 50000, worksheetRef: 'ws2' },
      ],
    },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
    ...extra,
  };
}

function reset() {
  useStore.setState({
    analystProDashboard: null,
    analystProSelection: new Set(),
    analystProHistory: null,
  });
}

describe('toggleZoneFloatAnalystPro', () => {
  beforeEach(reset);

  it('tiled → floating: removes from tree, adds to floatingLayer with resolved pixel rect', () => {
    const dash = fixedDash();
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);

    useStore.getState().toggleZoneFloatAnalystPro('z1');

    const next = useStore.getState().analystProDashboard;
    expect(next.tiledRoot.children.map((c: any) => c.id)).toEqual(['z2']);
    expect(next.floatingLayer).toHaveLength(1);
    const f = next.floatingLayer[0];
    expect(f.id).toBe('z1');
    expect(f.floating).toBe(true);
    expect(f.type).toBe('worksheet');
    expect(f.worksheetRef).toBe('ws1');
    // z1 was top half of 1000×600 canvas → (0,0,1000,300)
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
    expect(f.pxW).toBe(1000);
    expect(f.pxH).toBe(300);
    expect(typeof f.zIndex).toBe('number');
  });

  it('floating → tiled: inserts as last child of tiledRoot, strips floating fields', () => {
    const dash = fixedDash({
      floatingLayer: [
        {
          id: 'f1',
          type: 'legend',
          floating: true,
          x: 200,
          y: 200,
          pxW: 300,
          pxH: 200,
          zIndex: 1,
          w: 0,
          h: 0,
        },
      ],
    });
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);

    useStore.getState().toggleZoneFloatAnalystPro('f1');
    const next = useStore.getState().analystProDashboard;

    expect(next.floatingLayer).toHaveLength(0);
    const ids = next.tiledRoot.children.map((c: any) => c.id);
    expect(ids[ids.length - 1]).toBe('f1');
    const z = next.tiledRoot.children.find((c: any) => c.id === 'f1');
    expect(z.floating).toBeUndefined();
    expect(z.x).toBeUndefined();
    expect(z.pxW).toBeUndefined();
    expect(z.zIndex).toBeUndefined();
    expect(z.type).toBe('legend');
  });

  it('floating → tiled honours explicit targetContainerId', () => {
    const dash = fixedDash({
      tiledRoot: {
        id: 'root',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [
          {
            id: 'inner',
            type: 'container-horz',
            w: 100000,
            h: 100000,
            children: [{ id: 'x', type: 'blank', w: 100000, h: 100000 }],
          },
        ],
      },
      floatingLayer: [
        { id: 'f1', type: 'text', floating: true, x: 0, y: 0, pxW: 100, pxH: 100, zIndex: 1, w: 0, h: 0 },
      ],
    });
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);

    useStore.getState().toggleZoneFloatAnalystPro('f1', 'inner');
    const next = useStore.getState().analystProDashboard;
    const innerIds = next.tiledRoot.children[0].children.map((c: any) => c.id);
    expect(innerIds).toContain('f1');
  });

  it('pushes a history entry on every successful toggle', () => {
    const dash = fixedDash();
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    const pastBefore = useStore.getState().analystProHistory.past.length;
    useStore.getState().toggleZoneFloatAnalystPro('z1');
    const pastAfter = useStore.getState().analystProHistory.past.length;
    expect(pastAfter).toBe(pastBefore + 1);
  });

  it('no-ops (no history push) when zone id is unknown', () => {
    const dash = fixedDash();
    useStore.setState({ analystProDashboard: dash });
    useStore.getState().initAnalystProHistory(dash);
    const pastBefore = useStore.getState().analystProHistory.past.length;
    useStore.getState().toggleZoneFloatAnalystPro('nope');
    expect(useStore.getState().analystProDashboard).toBe(dash);
    expect(useStore.getState().analystProHistory.past.length).toBe(pastBefore);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd frontend && npx vitest run src/__tests__/store.toggleZoneFloat.test.ts`

Expected: 5 FAIL.

- [ ] **Step 3: Add the action to `store.js`**

Ensure `resolveLayout` is imported. Grep first: `grep -n "layoutResolver" frontend/src/store.js`. If absent, add near the existing freeform imports at the top:

```js
import { resolveLayout } from './components/dashboard/freeform/lib/layoutResolver';
```

Confirm `insertChild` and `removeChild` are already in the `zoneTreeOps` import list (they are — used by Plan 5b's `wrapInContainerAnalystPro`).

Insert the new action after `toggleLockAnalystPro` (currently at `store.js:1089-1106`):

```js
  // Plan 5e: Toggle tiled ↔ floating on a zone.
  //   - Tiled → floating: resolve the zone's pixel rect via layoutResolver,
  //     remove from tree (removeChild renormalizes siblings per Appendix E.11),
  //     push a FloatingZone preserving all non-layout fields.
  //   - Floating → tiled: strip floating/x/y/pxW/pxH/zIndex, reset w=h=100000,
  //     insert as last child of targetContainerId (default dash.tiledRoot.id).
  toggleZoneFloatAnalystPro: (zoneId, targetContainerId) => {
    const { analystProDashboard: dash } = get();
    if (!dash || !zoneId) return;

    // Canvas pixel dims for resolved rect. Fall back to 1440×900 for
    // automatic/range modes (matches smart-layout heuristic default).
    const canvasW = dash.size?.mode === 'fixed' ? dash.size.width : 1440;
    const canvasH = dash.size?.mode === 'fixed' ? dash.size.height : 900;

    // Floating → tiled?
    const floatingIdx = dash.floatingLayer.findIndex((z) => z.id === zoneId);
    if (floatingIdx >= 0) {
      const fz = dash.floatingLayer[floatingIdx];
      const {
        floating: _f, x: _x, y: _y, pxW: _w, pxH: _h, zIndex: _z,
        ...rest
      } = fz;
      const tiledZone = { ...rest, w: 100000, h: 100000 };
      const nextFloating = [
        ...dash.floatingLayer.slice(0, floatingIdx),
        ...dash.floatingLayer.slice(floatingIdx + 1),
      ];
      const parentId = targetContainerId || dash.tiledRoot.id;
      const nextRoot = insertChild(dash.tiledRoot, parentId, tiledZone, Number.MAX_SAFE_INTEGER);
      if (nextRoot === dash.tiledRoot) return;
      const nextDash = { ...dash, tiledRoot: nextRoot, floatingLayer: nextFloating };
      set({
        analystProDashboard: nextDash,
        analystProSelection: new Set([zoneId]),
      });
      get().pushAnalystProHistory(nextDash);
      return;
    }

    // Tiled → floating?
    const resolved = resolveLayout(dash.tiledRoot, dash.floatingLayer, canvasW, canvasH);
    const hit = resolved.find((r) => r.zone.id === zoneId && r.depth >= 0);
    if (!hit) return;

    const src = hit.zone;
    const maxZ = dash.floatingLayer.reduce((m, z) => Math.max(m, z.zIndex || 0), 0);
    const { children: _children, w: _sw, h: _sh, ...leafFields } = src;
    const newFloating = {
      ...leafFields,
      floating: true,
      x: hit.x,
      y: hit.y,
      pxW: hit.width,
      pxH: hit.height,
      zIndex: maxZ + 1,
      w: 0,
      h: 0,
    };

    const nextRoot = removeChild(dash.tiledRoot, zoneId);
    if (nextRoot === dash.tiledRoot) return;
    const nextDash = {
      ...dash,
      tiledRoot: nextRoot,
      floatingLayer: [...dash.floatingLayer, newFloating],
    };
    set({
      analystProDashboard: nextDash,
      analystProSelection: new Set([zoneId]),
    });
    get().pushAnalystProHistory(nextDash);
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/store.toggleZoneFloat.test.ts`

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/store.js frontend/src/__tests__/store.toggleZoneFloat.test.ts
git commit -m "feat(analyst-pro): toggleZoneFloatAnalystPro tiled-floating round-trip (Plan 5e T7)"
```

---

### Task 8: `legacyTilesToDashboard` — smart layout heuristic

**Files:**
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`
- Create: `frontend/src/components/dashboard/modes/__tests__/AnalystProLayout.smartLayout.test.tsx`

**Heuristic (roadmap Deliverable 2).**
- `n ≤ 4` → single `container-vert` (current behaviour, byte-identical output).
- `5 ≤ n ≤ 9` → `container-horz` root, 2 `container-vert` children.
- `n ≥ 10` → `container-horz` root, 3 `container-vert` children.
- Tiles round-robin across columns (`columns[i % N].push(tile)`).
- Canvas default: `{ mode: 'fixed', width: 1440, height: Math.max(900, Math.ceil(tiles.length / N) * 320), preset: 'custom' }` when `size` arg is undefined; if the caller supplies `size`, respect it verbatim (legacy callers keep their existing sizes).

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/components/dashboard/modes/__tests__/AnalystProLayout.smartLayout.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { legacyTilesToDashboard } from '../AnalystProLayout';

const tile = (id: number) => ({ id, chart_spec: {} });

describe('legacyTilesToDashboard smart layout', () => {
  it('0 tiles → single vert root with empty children', () => {
    const d = legacyTilesToDashboard([], 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-vert');
    expect(d.tiledRoot.children).toHaveLength(0);
  });

  it('1 tile → single vert root, 1 child at h=100000', () => {
    const d = legacyTilesToDashboard([tile(1)], 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-vert');
    expect(d.tiledRoot.children).toHaveLength(1);
  });

  it('4 tiles → single vert root (legacy behaviour preserved)', () => {
    const d = legacyTilesToDashboard([tile(1), tile(2), tile(3), tile(4)], 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-vert');
    expect(d.tiledRoot.children.map((c: any) => c.id)).toEqual(['1', '2', '3', '4']);
    expect(d.tiledRoot.children.every((c: any) => c.type === 'worksheet')).toBe(true);
  });

  it('7 tiles → horz root with 2 vert children (round-robin)', () => {
    const tiles = [1, 2, 3, 4, 5, 6, 7].map(tile);
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-horz');
    expect(d.tiledRoot.children).toHaveLength(2);
    expect(d.tiledRoot.children[0].type).toBe('container-vert');
    expect(d.tiledRoot.children[1].type).toBe('container-vert');
    expect(d.tiledRoot.children[0].children.map((c: any) => c.id)).toEqual(['1', '3', '5', '7']);
    expect(d.tiledRoot.children[1].children.map((c: any) => c.id)).toEqual(['2', '4', '6']);
  });

  it('15 tiles → horz root with 3 vert children (round-robin)', () => {
    const tiles = Array.from({ length: 15 }, (_, i) => tile(i + 1));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.tiledRoot.type).toBe('container-horz');
    expect(d.tiledRoot.children).toHaveLength(3);
    expect(d.tiledRoot.children[0].children).toHaveLength(5);
    expect(d.tiledRoot.children[1].children).toHaveLength(5);
    expect(d.tiledRoot.children[2].children).toHaveLength(5);
  });

  it('default canvas size (no size arg) 10+ tiles → fixed 1440 × max(900, ceil(n/3)*320)', () => {
    const tiles = Array.from({ length: 12 }, (_, i) => tile(i + 1));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.size).toEqual({ mode: 'fixed', width: 1440, height: 1280, preset: 'custom' });
  });

  it('caller-supplied size is preserved verbatim', () => {
    const d = legacyTilesToDashboard([tile(1)], 'd', 'N', { mode: 'automatic' });
    expect(d.size).toEqual({ mode: 'automatic' });
  });

  it('9-tile default canvas uses 2-col math (N=2, height max(900, ceil(9/2)*320)=1600)', () => {
    const tiles = Array.from({ length: 9 }, (_, i) => tile(i + 1));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    expect(d.size).toEqual({ mode: 'fixed', width: 1440, height: 1600, preset: 'custom' });
  });

  it('children w proportions sum to 100000 on the horz root', () => {
    const tiles = Array.from({ length: 11 }, (_, i) => tile(i + 1));
    const d = legacyTilesToDashboard(tiles, 'd', 'N', undefined);
    const sum = d.tiledRoot.children.reduce((s: number, c: any) => s + c.w, 0);
    expect(sum).toBe(100000);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd frontend && npx vitest run src/components/dashboard/modes/__tests__/AnalystProLayout.smartLayout.test.tsx`

Expected: 9 FAIL — `legacyTilesToDashboard` is not an exported symbol.

- [ ] **Step 3: Rewrite and export `legacyTilesToDashboard`**

Replace `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` lines 219–251 (the existing `function legacyTilesToDashboard(tiles, dashboardId, dashboardName, size)` block) with:

```jsx
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
```

**Note.** The `size ?? defaultSize` keeps legacy callers passing an explicit `size` on the green path — only new mount points (or explicit `undefined`) get the fixed 1440-wide default. This preserves existing Dashboard page behaviour for users who already resized their dashboards.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/modes/__tests__/AnalystProLayout.smartLayout.test.tsx`

Expected: 9 PASS.

- [ ] **Step 5: Verify no regressions in existing AnalystProLayout tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx src/components/dashboard/freeform/__tests__/FreeformCanvas.test.tsx`

Expected: all PASS — the ≤4 tile path is byte-identical.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/modes/AnalystProLayout.jsx frontend/src/components/dashboard/modes/__tests__/AnalystProLayout.smartLayout.test.tsx
git commit -m "feat(analyst-pro): smart layout heuristic in legacyTilesToDashboard (Plan 5e T8)"
```

---

### Task 9: Toolbar buttons + context-menu wiring

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/panels/StructureToolbar.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/StructureToolbar.test.tsx`
- Modify: `frontend/src/components/dashboard/freeform/ContextMenu.jsx`

- [ ] **Step 1: Write the failing toolbar tests**

Append to `frontend/src/components/dashboard/freeform/__tests__/StructureToolbar.test.tsx` (inside the existing `describe('StructureToolbar', ...)` block):

```ts
  it('Distribute Evenly button enabled when a container with ≥2 children is selected', () => {
    const dash = makeBaseDashboard([
      {
        id: 'inner',
        type: 'container-horz',
        w: 100000,
        h: 100000,
        children: [
          { id: 'x', type: 'blank', w: 50000, h: 100000 },
          { id: 'y', type: 'blank', w: 50000, h: 100000 },
        ],
      },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['inner']) });
    const spy = vi.fn();
    useStore.setState({ distributeEvenlyAnalystPro: spy });

    render(<StructureToolbar />);
    const btn = screen.getByRole('button', { name: 'Distribute Evenly' });
    expect(btn).not.toBeDisabled();
    act(() => { fireEvent.click(btn); });
    expect(spy).toHaveBeenCalledWith('inner');
  });

  it('Fit to Content button calls fitContainerToContentAnalystPro', () => {
    const dash = makeBaseDashboard([
      {
        id: 'inner',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [{ id: 'x', type: 'blank', w: 100000, h: 100000 }],
      },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['inner']) });
    const spy = vi.fn();
    useStore.setState({ fitContainerToContentAnalystPro: spy });
    render(<StructureToolbar />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Fit to Content' })); });
    expect(spy).toHaveBeenCalledWith('inner');
  });

  it('Remove Container button disabled when root is selected', () => {
    const dash = makeBaseDashboard([
      { id: 'a', type: 'blank', w: 100000, h: 100000 },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['root']) });
    render(<StructureToolbar />);
    expect(screen.getByRole('button', { name: 'Remove Container' })).toBeDisabled();
  });

  it('Remove Container button calls removeContainerAnalystPro for non-root container', () => {
    const dash = makeBaseDashboard([
      {
        id: 'inner',
        type: 'container-horz',
        w: 100000,
        h: 100000,
        children: [{ id: 'x', type: 'blank', w: 100000, h: 100000 }],
      },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set(['inner']) });
    const spy = vi.fn();
    useStore.setState({ removeContainerAnalystPro: spy });
    render(<StructureToolbar />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Remove Container' })); });
    expect(spy).toHaveBeenCalledWith('inner');
  });

  it('all three new buttons disabled when selection is empty', () => {
    const dash = makeBaseDashboard([
      { id: 'a', type: 'blank', w: 100000, h: 100000 },
    ]);
    useStore.setState({ analystProDashboard: dash, analystProSelection: new Set() });
    render(<StructureToolbar />);
    expect(screen.getByRole('button', { name: 'Distribute Evenly' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fit to Content' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Container' })).toBeDisabled();
  });
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/StructureToolbar.test.tsx`

Expected: 5 new FAIL (button queries miss).

- [ ] **Step 3: Extend `StructureToolbar.jsx`**

Rewrite `frontend/src/components/dashboard/freeform/panels/StructureToolbar.jsx`:

```jsx
import React, { useMemo } from 'react';
import { useStore } from '../../../../store';

export default function StructureToolbar() {
  const selection = useStore((s) => s.analystProSelection);
  const dashboard = useStore((s) => s.analystProDashboard);
  const groupSel = useStore((s) => s.groupSelectionAnalystPro);
  const ungroup = useStore((s) => s.ungroupAnalystPro);
  const toggleLock = useStore((s) => s.toggleLockAnalystPro);
  const distributeEvenly = useStore((s) => s.distributeEvenlyAnalystPro);
  const fitContainer = useStore((s) => s.fitContainerToContentAnalystPro);
  const removeContainer = useStore((s) => s.removeContainerAnalystPro);

  const state = useMemo(() => {
    const empty = {
      canGroup: false, canUngroup: false, canLock: false,
      singleSelectedId: null, selectedContainerId: null,
      selectedContainerHasTwoKids: false, selectedIsRoot: false,
    };
    if (!dashboard) return empty;
    if (selection.size === 0) return empty;
    let tiledCount = 0;
    const findTiled = (zone) => {
      if (selection.has(zone.id)) tiledCount++;
      if (zone.children) zone.children.forEach(findTiled);
    };
    findTiled(dashboard.tiledRoot);
    const canGroup = tiledCount >= 2;

    let single = null;
    if (selection.size === 1) single = [...selection][0];

    let selectedContainerId = null;
    let selectedContainerHasTwoKids = false;
    const selectedIsRoot = single === dashboard.tiledRoot.id;
    if (single) {
      const walk = (zone) => {
        if (zone.id === single && zone.children) {
          selectedContainerId = zone.id;
          selectedContainerHasTwoKids = zone.children.length >= 2;
        }
        if (zone.children) zone.children.forEach(walk);
      };
      walk(dashboard.tiledRoot);
    }

    const canUngroup = !!selectedContainerId && !selectedIsRoot;
    const canLock = selection.size >= 1;
    return { canGroup, canUngroup, canLock, singleSelectedId: single, selectedContainerId, selectedContainerHasTwoKids, selectedIsRoot };
  }, [dashboard, selection]);

  const btnStyle = (disabled) => ({
    background: 'transparent',
    border: 'none',
    color: disabled ? 'var(--text-muted)' : 'var(--fg)',
    padding: '4px 8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '13px',
    opacity: disabled ? 0.4 : 1,
  });

  const canDistribute = !!state.selectedContainerId && state.selectedContainerHasTwoKids;
  const canFit = !!state.selectedContainerId;
  const canRemoveContainer = !!state.selectedContainerId && !state.selectedIsRoot;

  return (
    <div role="toolbar" aria-label="Structure toolbar" style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      <button type="button" aria-label="Group" title="Group (Cmd+G)" disabled={!state.canGroup} onClick={() => groupSel()} style={btnStyle(!state.canGroup)}>⊞</button>
      <button type="button" aria-label="Ungroup" title="Ungroup (Cmd+Shift+G)" disabled={!state.canUngroup} onClick={() => state.singleSelectedId && ungroup(state.singleSelectedId)} style={btnStyle(!state.canUngroup)}>⊟</button>
      <button type="button" aria-label="Toggle lock" title="Lock (Cmd+L)" disabled={!state.canLock} onClick={() => {
        selection.forEach((id) => toggleLock(id));
      }} style={btnStyle(!state.canLock)}>🔒</button>
      <button type="button" aria-label="Distribute Evenly" title="Distribute Evenly" disabled={!canDistribute} onClick={() => state.selectedContainerId && distributeEvenly(state.selectedContainerId)} style={btnStyle(!canDistribute)}>⇹</button>
      <button type="button" aria-label="Fit to Content" title="Fit Container to Content" disabled={!canFit} onClick={() => state.selectedContainerId && fitContainer(state.selectedContainerId)} style={btnStyle(!canFit)}>⇲</button>
      <button type="button" aria-label="Remove Container" title="Remove Container" disabled={!canRemoveContainer} onClick={() => state.selectedContainerId && removeContainer(state.selectedContainerId)} style={btnStyle(!canRemoveContainer)}>⬚</button>
    </div>
  );
}
```

- [ ] **Step 4: Wire the Plan 5c context-menu stubs**

Grep first: `grep -n "distribute-evenly\|fit-to-content\|remove-container" frontend/src/components/dashboard/freeform/ContextMenu.jsx`.

For each of the three command IDs, the existing handler is a `console.debug(...)` + no-op. Replace each `case` branch's body in the command-dispatch switch with a direct store call:

```jsx
// Inside the command-dispatch switch in ContextMenu.jsx:
case 'distribute-evenly': {
  const id = command.zoneId || targetZoneId;
  if (id) store.distributeEvenlyAnalystPro(id);
  break;
}
case 'fit-to-content': {
  const id = command.zoneId || targetZoneId;
  if (id) store.fitContainerToContentAnalystPro(id);
  break;
}
case 'remove-container': {
  const id = command.zoneId || targetZoneId;
  if (id) store.removeContainerAnalystPro(id);
  break;
}
```

(Use the exact variable names for `command` / `store` / `targetZoneId` as already present in the file; grep `command.commandId` or similar to locate the switch statement.)

- [ ] **Step 5: Run the toolbar tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/StructureToolbar.test.tsx`

Expected: all PASS (existing 3 + new 5).

Verify no regression in ContextMenu tests: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/panels/StructureToolbar.jsx frontend/src/components/dashboard/freeform/__tests__/StructureToolbar.test.tsx frontend/src/components/dashboard/freeform/ContextMenu.jsx
git commit -m "feat(analyst-pro): Distribute/Fit/Remove toolbar buttons + context menu wiring (Plan 5e T9)"
```

---

### Task 10: `Cmd/Ctrl+Shift+F` keybinding for toggle float

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js`
- Create: `frontend/src/components/dashboard/freeform/__tests__/useKeyboardShortcuts.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/components/dashboard/freeform/__tests__/useKeyboardShortcuts.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStore } from '../../../../store';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

function baseDash() {
  return {
    schemaVersion: 'askdb/dashboard/v1',
    id: 'd1',
    name: 'T',
    archetype: 'analyst-pro',
    size: { mode: 'fixed', width: 1000, height: 600, preset: 'custom' },
    tiledRoot: {
      id: 'root',
      type: 'container-vert',
      w: 100000,
      h: 100000,
      children: [{ id: 'z1', type: 'worksheet', w: 100000, h: 100000, worksheetRef: 'ws1' }],
    },
    floatingLayer: [],
    worksheets: [],
    parameters: [],
    sets: [],
    actions: [],
  };
}

describe('useKeyboardShortcuts — Plan 5e', () => {
  beforeEach(() => {
    useStore.setState({
      analystProDashboard: null,
      analystProSelection: new Set(),
      analystProHistory: null,
    });
  });

  it('Cmd+Shift+F calls toggleZoneFloatAnalystPro for every selected zone', () => {
    const dash = baseDash();
    const spy = vi.fn();
    useStore.setState({
      analystProDashboard: dash,
      analystProSelection: new Set(['z1']),
      toggleZoneFloatAnalystPro: spy,
    });
    useStore.getState().initAnalystProHistory(dash);
    renderHook(() => useKeyboardShortcuts());

    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(spy).toHaveBeenCalledWith('z1');
  });

  it('Ctrl+Shift+F triggers (Windows/Linux branch)', () => {
    const dash = baseDash();
    const spy = vi.fn();
    useStore.setState({
      analystProDashboard: dash,
      analystProSelection: new Set(['z1']),
      toggleZoneFloatAnalystPro: spy,
    });
    useStore.getState().initAnalystProHistory(dash);
    renderHook(() => useKeyboardShortcuts());
    const ev = new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(spy).toHaveBeenCalledWith('z1');
  });

  it('Cmd+F (no shift) does NOT call the action', () => {
    const dash = baseDash();
    const spy = vi.fn();
    useStore.setState({
      analystProDashboard: dash,
      analystProSelection: new Set(['z1']),
      toggleZoneFloatAnalystPro: spy,
    });
    useStore.getState().initAnalystProHistory(dash);
    renderHook(() => useKeyboardShortcuts());
    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: false, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/useKeyboardShortcuts.test.ts`

Expected: 2 FAIL (Cmd+F no-shift test will pass; the first two fail).

- [ ] **Step 3: Add the branch to `useKeyboardShortcuts.js`**

In `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js`, inside the `handler` function, add a new branch above the `]/[` block (around line 119, before `if ((e.key === ']' ...)`):

```js
      // Plan 5e: Cmd/Ctrl+Shift+F — toggle tiled ↔ floating on every selected zone.
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const toggleFloat = useStore.getState().toggleZoneFloatAnalystPro;
        if (!toggleFloat || selection.size === 0) return;
        selection.forEach((id) => toggleFloat(id));
        return;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/useKeyboardShortcuts.test.ts`

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js frontend/src/components/dashboard/freeform/__tests__/useKeyboardShortcuts.test.ts
git commit -m "feat(analyst-pro): Cmd+Shift+F toggles float on selection (Plan 5e T10)"
```

---

### Task 11: Smoke verification

**Files:** no code changes; validate the full slice.

- [ ] **Step 1: Run all new + adjacent vitest suites**

```bash
cd "QueryCopilot V1/frontend"
npx vitest run src/components/dashboard/freeform/__tests__/ src/components/dashboard/modes/__tests__/ src/__tests__/store.toggleZoneFloat.test.ts src/__tests__/store.containerCommands.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Lint**

```bash
cd "QueryCopilot V1/frontend"
npm run lint
```

Expected: no new errors. The pre-existing ~22 chart-ir failures from CLAUDE.md "Known Test Debt" stay as-is — count them before/after to confirm Plan 5e introduced none.

- [ ] **Step 3: Build**

```bash
cd "QueryCopilot V1/frontend"
npm run build
```

Expected: clean build, no TypeScript errors on `types.ts` / `zoneTreeOps.ts`.

- [ ] **Step 4: Commit (chore)**

```bash
cd "QueryCopilot V1"
git commit --allow-empty -m "chore(analyst-pro): Plan 5e smoke verification (Plan 5e T11)"
```

---

## Self-Review Checklist

- **Spec coverage.** Roadmap §"Plan 5e" Deliverables 1–5 ↔ Tasks: D1 (float toggle) → T7; D2 (smart layout) → T8; D3 (three container commands) → T1–T6; D4 (toolbar buttons) → T9; D5 (Cmd+Shift+F) → T10. All five covered.
- **Build_Tableau citations.** §IX.2 (tiled/floating) cited in T7; §IX.3 (Distribute Evenly + Fit + Remove) cited in T1, T2, T3; §IX.4 (DashboardSizingMode.Fixed) cited in T8 heuristic; Appendix E.11 (proportional-by-weight) cited in T1 + T7.
- **Backward compat.** T8 test `4 tiles → single vert root` locks the legacy path; T8 test `caller-supplied size is preserved verbatim` locks current mount-point behaviour.
- **TDD.** T1–T10 each open with a failing test followed by implementation. T11 is smoke-only.
- **Commit format.** Every task ends in `feat(analyst-pro): <verb> <object> (Plan 5e TN)`.
- **Type consistency.** `distributeEvenly`, `fitContainerToContent`, `removeContainer` signatures in `zoneTreeOps.ts` match their consumer calls in `store.js` (all three take `(root: Zone, containerId: string, ...)` and return `Zone`); `toggleZoneFloatAnalystPro` signature matches its two consumers (`ContextMenu.jsx` passes zoneId only, `useKeyboardShortcuts` passes zoneId only). `sizeOverride` field name used identically in `types.ts`, `zoneTreeOps.ts`, and the store test.
- **No placeholders.** Every step has exact file path and either complete code or exact command. No "similar to Task N" pointers.
- **Security.** No innerHTML in tests. No new backend surface. No anthropic imports. PII/read-only/6-layer validator invariants untouched.

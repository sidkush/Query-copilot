# Plan 2b — Analyst Pro Canvas Polish

Date: 2026-04-16
Parent spec: `docs/superpowers/specs/2026-04-16-analyst-pro-tableau-parity-design.md`
Previous phase: `docs/superpowers/plans/2026-04-16-analyst-pro-plan-2-canvas-interactions.md`
Status: Ready for subagent execution

---

## Goal

Finish the remaining canvas-authoring polish items deferred from Plan 2. After this plan Analyst Pro should feel parity-complete for layout authoring: users can assemble, inspect, align, group, and lock zones through panel UI, not just keyboard/drag.

Deferred items from Plan 2 being delivered here:
1. **ObjectLibrary panel** — draggable palette of zone types (text / image / webpage / blank / horz container / vert container). Drag onto canvas to insert.
2. **LayoutTree panel** — hierarchical outline of the current zone tree. Click to select, rename, reveal parent/child relationships.
3. **Alignment / Distribute toolbar** — align L/R/T/B/H-center/V-center + distribute horizontally / vertically for multi-selection.
4. **Group / Ungroup** — wrap multi-selection in new container, or unwrap a selected container.
5. **Lock** — mark a zone locked so drag/resize/delete are blocked. Lock indicator in selection overlay.
6. **Layout overlay** — toggleable outline mode that shows zone boundaries and depth shading for complex layouts.

Non-goals: actions runtime (→ Plan 3), sets/DZV/migration polish (→ Plan 4), backend changes.

---

## Performance / Quality Targets

| Metric | Target |
|---|---|
| Panel mount (library + tree + toolbar) | < 30ms cold |
| LayoutTree reflow on edit | < 16ms (1 frame) |
| Align / distribute cascade | < 8ms for ≤ 20 zones |
| Group of 10 zones | < 12ms including history push |
| Lock toggle | instant (no perceptible delay) |

---

## Architecture Notes

**State lives in Zustand** `analystPro` slice (already present). New additions:
- `layoutOverlayEnabled: boolean` (default `false`)
- History-friendly: every mutating action pushes a new snapshot via `pushAnalystProHistory`.

**Pure lib split** (unit-testable without React):
- `frontend/src/components/dashboard/freeform/lib/alignmentOps.ts` — math for align/distribute
- `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts` — extend with `groupSelection`, `ungroupContainer`, `toggleLock`

**Component tree additions**:
```
AnalystProLayout
├── ObjectLibraryPanel          (left rail)
├── LayoutTreePanel             (left rail, below object library)
├── AlignmentToolbar            (top toolbar, new segment)
├── FreeformCanvas              (existing — no structural change)
│   └── overlay layer (gated on `layoutOverlayEnabled`)
└── LayoutOverlayToggle         (top toolbar button)
```

**Lock semantics**:
- `Zone.locked?: boolean` already exists on `FloatingZone`. Extend to `BaseZone` so tiled zones can be locked too.
- `useDragResize` short-circuits pointerdown on locked zones.
- `useKeyboardShortcuts` `Delete` key skips locked zones but still deletes unlocked ones in the selection.
- Lock **does not** affect selection — user can still click-select a locked zone.

**Object library drag protocol**:
- HTML5 drag-and-drop (`dataTransfer`) with custom MIME `application/askdb-analyst-pro-object+json`.
- Drop target = `FreeformCanvas` sheet element.
- On drop: compute pixel coords → insert as **floating** zone at cursor, width 320×200 (default), zIndex = max(existing) + 1.
- Containers drop as floating at 480×320 with one child leaf `{type: 'blank'}` so they render something.

**LayoutTree interaction**:
- Each tree node renders as a row: `▸ icon  [id or inferred name]  🔒`.
- Click row → selects that zone (replaces selection if no modifier; toggles if cmd/ctrl).
- Double-click name → inline rename (writes to a new optional `Zone.displayName?: string`).
- Dragging within the tree is **out of scope** this plan (reordering via tree → Plan 4).

**Alignment toolbar buttons**:
- Show only when `selection.size ≥ 2` (or `≥ 3` for distribute).
- Work over **floating** zones only (tiled zones ignore alignment — their position is computed from proportions). If any non-floating zone is selected, filter it out silently.
- All ops write through `alignmentOps` pure functions and push a history snapshot.

**Layout overlay**:
- Single CSS class `.analyst-pro-layout-overlay` applied to the canvas root when enabled.
- CSS: outlines every zone element with 1px dashed `var(--accent-subtle)`, tints containers by depth.
- Toggle button in toolbar (keyboard shortcut `Cmd/Ctrl+;`).

---

## Task Checklist

- [ ] T1. Extend `types.ts` — `locked` on `BaseZone`, `displayName` optional on `Zone`.
- [ ] T2. `alignmentOps.ts` lib + tests (pure math).
- [ ] T3. Extend `zoneTreeOps.ts` — `groupSelection`, `ungroupContainer`, `toggleLock` + tests.
- [ ] T4. Extend store — new actions for alignment/group/ungroup/lock/overlay.
- [ ] T5. Enforce lock in `useDragResize` and keyboard delete.
- [ ] T6. `ObjectLibraryPanel.jsx` — palette + HTML5 drag source + tests.
- [ ] T7. Drop-on-canvas wiring in `FreeformCanvas.jsx` — accept dropped objects + tests.
- [ ] T8. `LayoutTreePanel.jsx` — hierarchical list + select + rename + tests.
- [ ] T9. `AlignmentToolbar.jsx` — buttons wired to store + tests.
- [ ] T10. Layout overlay CSS + toggle button + tests.
- [ ] T11. Wire all three panels into `AnalystProLayout.jsx`.
- [ ] T12. Smoke: tests green, lint clean, build green.

---

## Task Specifications

### T1 — Types extension

**Files**: `frontend/src/components/dashboard/freeform/lib/types.ts`

**Changes**:
```ts
export type BaseZone = {
  id: string;
  w: Proportion;
  h: Proportion;
  /** Optional user-given display name. If absent, UI derives from type + id. */
  displayName?: string;
  /** If true, drag/resize/delete are blocked. Selection still allowed. */
  locked?: boolean;
  padding?: { outer: Padding; inner: Padding };
  border?: BorderStyle;
  background?: BackgroundStyle;
  visibilityRule?: VisibilityRule;
};
```

Remove duplicate `locked?` from `FloatingZone` (now inherited).

**Acceptance**: TS compiles. Existing callsites using `zone.locked` on floating zones still work.

**Test**: none — pure type change, downstream tests cover.

---

### T2 — alignmentOps lib

**File**: `frontend/src/components/dashboard/freeform/lib/alignmentOps.ts` (new)
**Test file**: `frontend/src/components/dashboard/freeform/__tests__/alignmentOps.test.ts` (new)

**Spec**: Pure functions over `FloatingZone[]` (not the full tree). Return new array — never mutate.

```ts
import type { FloatingZone } from './types';

export type AlignOp =
  | 'left' | 'right' | 'h-center'
  | 'top' | 'bottom' | 'v-center';

export type DistributeAxis = 'horizontal' | 'vertical';

/**
 * Align a list of floating zones to a common edge/center.
 * - left:  each zone's x = min(x)
 * - right: each zone's x+pxW = max(x+pxW) → new x = edge - pxW
 * - h-center: each zone's (x + pxW/2) = average of (x + pxW/2)
 * Analogous for top/bottom/v-center on y axis.
 * Returns new array; zones not in the input are ignored.
 * Single-zone input returns identity.
 */
export function alignZones(zones: FloatingZone[], op: AlignOp): FloatingZone[];

/**
 * Distribute zones evenly on the given axis. Requires ≥ 3 zones.
 * The two outermost zones keep their position; inner zones are spaced so
 * that the gap between successive edges (after sort) is uniform.
 * Axis 'horizontal' acts on x/pxW; 'vertical' acts on y/pxH.
 * For < 3 zones returns identity.
 */
export function distributeZones(
  zones: FloatingZone[],
  axis: DistributeAxis,
): FloatingZone[];
```

**Tests** (write first, TDD):
1. `alignZones([single], 'left')` → identity.
2. `alignZones([a, b, c], 'left')` with x=[10, 50, 30] → all x=10.
3. `alignZones` right edge: [x=0,pxW=100], [x=50,pxW=200] → max right edge = 250 → new x = [150, 50].
4. `alignZones` h-center: two zones with different widths — centers match.
5. `alignZones` top / bottom / v-center mirror horizontal cases (smoke).
6. `distributeZones` with 2 zones → identity.
7. `distributeZones` 3 zones horizontal: x=[0, 999, 200], pxW=100 each → middle zone x becomes halfway between edges.
8. `distributeZones` preserves endpoint zones (smallest and largest on axis).
9. All functions return **new arrays** (input not mutated).

**Acceptance**: All 9 tests pass. `npm run test:chart-ir -- alignmentOps` green.

---

### T3 — zoneTreeOps extension

**File**: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts` (extend)
**Test file**: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts` (extend)

**New exports**:

```ts
/**
 * Wrap the selected TILED zones in a new container.
 * - All selected zones must share the same parent container (else identity).
 * - New container.type matches parent orientation? No — we always create a
 *   container-horz for now (parent-orientation decision deferred).
 * - Selected zones are spliced out and replaced by one new container holding them.
 * - Parent is renormalized so proportions sum to 100000.
 * - Returns { root, newContainerId }. If unable to group, newContainerId is null and root is identity.
 * - Floating zones cannot be grouped (skipped; if only floating are selected, identity).
 */
export function groupSelection(
  root: Zone,
  selectedIds: string[],
): { root: Zone; newContainerId: string | null };

/**
 * Replace a container zone with its children inline in the grandparent.
 * - If containerId is the root, identity (can't ungroup root).
 * - Children inherit proportional slices of the container's share.
 * - Parent is renormalized.
 * - Returns new root.
 */
export function ungroupContainer(root: Zone, containerId: string): Zone;

/**
 * Toggle `locked` flag on a zone (tiled or floating). Returns new tree.
 * - If id not found, identity.
 */
export function toggleLock(root: Zone, zoneId: string): Zone;

/**
 * Same as toggleLock but for floating layer.
 */
export function toggleLockFloating(
  floatingLayer: FloatingZone[],
  zoneId: string,
): FloatingZone[];
```

**Tests**:
1. `groupSelection` — 2 siblings in horz container → wrapped into new sub-container, parent still has same count minus (n-1).
2. `groupSelection` — non-sibling selection → identity, newContainerId=null.
3. `groupSelection` — single zone → identity (nothing to group).
4. `groupSelection` — floating-only selection → identity.
5. `groupSelection` — new container proportions sum to 100000 along parent axis.
6. `ungroupContainer` — children reparented, count increases by (n-1), proportions preserved within 1% drift.
7. `ungroupContainer` — root container id → identity.
8. `ungroupContainer` — leaf id → identity.
9. `toggleLock` — flips `locked` on/off.
10. `toggleLockFloating` — flips `locked` on a floating zone, preserves other fields.

**Acceptance**: All new tests + existing 14 pass.

---

### T4 — Store extension

**File**: `frontend/src/store.js`

**New state fields** in `analystPro` slice:
```js
layoutOverlayEnabled: false,
```

**New actions** (keep the existing ones intact):
- `alignSelectionAnalystPro(op)` — read `selection`, filter to floating ids, call `alignZones`, write back to `floatingLayer`, push history.
- `distributeSelectionAnalystPro(axis)` — same but with `distributeZones`.
- `groupSelectionAnalystPro()` — call `groupSelection(dashboard.tiledRoot, [...selection])`. If a new container id is returned, update `tiledRoot`, replace selection with `{newContainerId}`, push history.
- `ungroupAnalystPro(containerId)` — call `ungroupContainer`, update tree, push history.
- `toggleLockAnalystPro(zoneId)` — determine if zone is floating or tiled, call appropriate helper, push history.
- `toggleLayoutOverlayAnalystPro()` — flip flag (no history).

**Tests**: extend existing store test (or skip if no dedicated store test yet — instead covered by component tests later).

**Acceptance**: Actions callable from components; history entries created for mutating actions only.

---

### T5 — Lock enforcement

**Files**:
- `frontend/src/components/dashboard/freeform/hooks/useDragResize.js`
- `frontend/src/components/dashboard/freeform/hooks/useKeyboardShortcuts.js`

**Changes**:
- `useDragResize`: at pointerdown handler, look up the zone being grabbed; if `zone.locked === true`, `return` early without starting drag.
- `useKeyboardShortcuts`: in the `Delete`/`Backspace` handler, filter out locked zones before deletion.

**Tests**: extend `FreeformCanvas.integration.test.tsx`:
1. Render a locked floating zone → pointerdown + pointermove → zone x/y unchanged.
2. Select locked zone + press Delete → zone still present.

**Acceptance**: New tests green; existing 4 integration tests still green.

---

### T6 — ObjectLibraryPanel

**File**: `frontend/src/components/dashboard/freeform/panels/ObjectLibraryPanel.jsx` (new)
**Test**: `frontend/src/components/dashboard/freeform/__tests__/ObjectLibraryPanel.test.tsx` (new)

**Props**: none (reads no store state).

**Structure**:
```jsx
<aside className="analyst-pro-object-library" aria-label="Object library">
  <h3>Objects</h3>
  <ul>
    {OBJECTS.map(o => (
      <li
        key={o.type}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(
            'application/askdb-analyst-pro-object+json',
            JSON.stringify({ type: o.type }),
          );
          e.dataTransfer.effectAllowed = 'copy';
        }}
      >
        <span className="icon">{o.icon}</span>
        <span>{o.label}</span>
      </li>
    ))}
  </ul>
</aside>
```

**`OBJECTS` const**:
```js
const OBJECTS = [
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'image', label: 'Image', icon: '🖼' },
  { type: 'webpage', label: 'Web Page', icon: '🌐' },
  { type: 'blank', label: 'Blank', icon: '⬜' },
  { type: 'container-horz', label: 'Horz. Container', icon: '▭' },
  { type: 'container-vert', label: 'Vert. Container', icon: '▯' },
];
```

**Tests** (vitest + @testing-library/react):
1. Renders 6 list items.
2. `dragStart` on `text` sets correct JSON in `dataTransfer`.
3. Has `aria-label="Object library"`.

**Acceptance**: Tests pass. Visually compact (200px rail), tokens.js colors, no external deps.

---

### T7 — Drop-on-canvas wiring

**File**: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` (modify)
**Test**: `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx` (extend)

**Changes**:
- Attach `onDragOver` (call `preventDefault` to accept drop) and `onDrop` to the sheet root element.
- On drop: read `application/askdb-analyst-pro-object+json`, compute `x/y` from `event.clientX - sheetRect.left`.
- Call a new store action `insertObjectAnalystPro({type, x, y})` which:
  - Builds a `FloatingZone` with default size (text/image/blank: 320×200, webpage: 480×320, containers: 480×320 with a blank leaf child).
  - id = `generateZoneId()` (use existing helper from `zoneTree.ts`).
  - zIndex = max(existing zIndex, 0) + 1.
  - Adds to `floatingLayer`, pushes history, selects the new zone.

**Tests**:
1. Drop a text object at (100, 100) → `floatingLayer` length +1, new zone type='text', x=100, y=100.
2. Drop with no dataTransfer JSON → no-op.
3. Drop a container → new zone has `children: [{type:'blank', ...}]` or equivalent container with one blank (since it's floating it wraps proportionally in its own sub-tree).

**Note on dropped containers**: Floating container zones are a legitimate concept per the parity spec (Tableau allows floating containers). The container's internal proportions default to 100000 for its single child.

**Acceptance**: 3 new tests pass + existing integration tests still green.

---

### T8 — LayoutTreePanel

**File**: `frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx` (new)
**Test**: `frontend/src/components/dashboard/freeform/__tests__/LayoutTreePanel.test.tsx` (new)

**Structure**: walk `dashboard.tiledRoot` + `dashboard.floatingLayer` as a two-section outline:
```
▼ Tiled
  ▼ Horz Container #abc
    • Text #def   🔒
    • Chart #ghi
▼ Floating
  • Image #jkl
```

**Interactions**:
- Click row → `setSelectionAnalystPro(new Set([id]))`.
- Cmd/Ctrl+click → toggle membership in selection.
- Double-click name → replace text with an `<input>`; on Enter / blur → `updateZoneAnalystPro(id, {displayName: value})` (needs a new store action).
- Lock icon 🔒 shown if `zone.locked === true`.

**Tests**:
1. Renders `Tiled` + `Floating` section headers.
2. Shows all zones including nested.
3. Click on a row → store selection contains that id.
4. Double-click → input appears; submit → displayName updated in store.
5. Locked zone shows lock icon.

**Acceptance**: Tests pass. Keyboard focusable rows (`role="button"` + `tabIndex=0`).

---

### T9 — AlignmentToolbar

**File**: `frontend/src/components/dashboard/freeform/panels/AlignmentToolbar.jsx` (new)
**Test**: `frontend/src/components/dashboard/freeform/__tests__/AlignmentToolbar.test.tsx` (new)

**Structure**: row of 8 buttons, disabled state based on selection size. 6 align + 2 distribute.

```
[◧ L] [◨ R] [◫ HC] [◤ T] [◣ B] [◧=◨ VC] | [⇔] [⇕]
```

**Props**: none (reads `selection.size` + floating-filtered count from store).

**Tests**:
1. Selection size < 2 → all buttons disabled.
2. Selection size = 2 → align buttons enabled, distribute disabled.
3. Selection size = 3 → all enabled.
4. Click 'left' → `alignSelectionAnalystPro('left')` called (spy on store).
5. Click 'distribute-horizontal' → `distributeSelectionAnalystPro('horizontal')` called.

**Acceptance**: Tests pass. Button tooltips for accessibility.

---

### T10 — Layout overlay

**Files**:
- `frontend/src/components/dashboard/freeform/panels/LayoutOverlayToggle.jsx` (new)
- `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` (modify — apply class)
- `frontend/src/components/dashboard/freeform/styles.css` or `frontend/src/index.css` — append overlay rules.

**Toggle behavior**:
- Button in AlignmentToolbar row (or top toolbar of AnalystProLayout — your choice, keep stable).
- Keyboard shortcut `Cmd/Ctrl+;` triggers `toggleLayoutOverlayAnalystPro()`.

**CSS** (append to `index.css`):
```css
.analyst-pro-layout-overlay [data-zone] {
  outline: 1px dashed color-mix(in oklab, var(--accent) 60%, transparent);
  outline-offset: -1px;
}
.analyst-pro-layout-overlay [data-container-depth="0"] {
  background: color-mix(in oklab, var(--accent) 4%, transparent);
}
.analyst-pro-layout-overlay [data-container-depth="1"] {
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}
.analyst-pro-layout-overlay [data-container-depth="2"] {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}
```

Requires `data-zone` and `data-container-depth` attributes on zone elements — add to `ZoneRenderer` when rendering.

**Tests**: extend integration test:
1. Overlay off → canvas root does not have class.
2. Overlay on → canvas root has `analyst-pro-layout-overlay` class.
3. Keyboard `Cmd+;` → toggles state.

**Acceptance**: Tests pass. No layout shift when toggling (outline is outside box model, and backgrounds are translucent overlays that don't change dimensions).

---

### T11 — Wire panels into AnalystProLayout

**File**: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` (modify)

**Layout**: CSS Grid with left rail (260px) containing `ObjectLibraryPanel` stacked on top of `LayoutTreePanel` (split 50/50 vertically), main area is the existing canvas plus new toolbar.

Top toolbar now reads:
```
[Size dropdown] [Snap: on/off] | [Align L R HC T B VC] [Dist H V] | [Overlay]
```

**Tests**: none at this task level — covered by integration tests from other tasks.

**Acceptance**: Panels render, canvas still functional, no layout overflow on 1366×768.

---

### T12 — Smoke

Run:
```bash
cd frontend
npm run test:chart-ir
npm run lint
npm run build
```

All 3 green. Any pre-existing warnings acceptable (e.g. the useDragResize `resolvedMap` dep warning) — no **new** warnings introduced.

Report test count delta (expected: +~30 from T2/T3/T5/T6/T7/T8/T9/T10).

---

## Out of Scope (deferred to Plan 4 or later)

- Tree drag-to-reorder
- Multi-select in tree (via shift+click range)
- Icons in LayoutTree derived from chart type
- Container orientation chooser on group (currently hard-coded horz)
- Object library custom-object registration (user-authored templates)
- Overlay heatmap mode (quality tiers, breakpoints)

---

## Rollout

- All changes behind `FEATURE_ANALYST_PRO` backend flag (unchanged from Plan 1).
- No migration needed — `locked` and `displayName` are both optional.
- Ship to demo user first, then enable flag for internal testers.

---

## Review Anchors

Fresh subagents dispatched for each task will self-review then two-stage review (spec compliance + code quality). Reviewers should verify:

- **Spec compliance**: each acceptance criteria hit, no missing items, no scope creep.
- **Code quality**: TS strictness, React patterns (key props, dep arrays, useCallback usage), token usage (no hardcoded hex), no new lint warnings, no inline styles without reason, jsdoc on exports.

When all tasks pass both reviews, final code-reviewer runs on full diff.

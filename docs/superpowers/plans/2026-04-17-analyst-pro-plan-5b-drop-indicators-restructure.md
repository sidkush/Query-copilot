# Plan 5b — Drop Indicators + Smart Guides + Cross-Container Drag + Container Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During a tiled-zone drag, show (a) 3 px blue drop-indicator bars / 6 px edge highlights / dashed container-centre rings driven by live hit-test, (b) 1 px amber dashed smart-guide lines when siblings snap-align, (c) real cross-container moves on pointerup using a new `moveZoneAcrossContainers` zone-tree op, and (d) drop-on-edge container creation via a new `wrapInContainer` op — matching Tableau's tiled flow-container UX (`Build_Tableau.md` §IX.2, §IX.3, Appendix E.11 proportional redistribution).

**Architecture:** Drag pipeline currently (after Plan 2 / 4e) flows: `useDragResize.onMove` → `applyDragDelta` → store.setAnalystProDragState({zoneId, parentId, dx, dy}) → `pointerup` → heuristic same-parent `reorderZone`. Plan 5b extends two axes:
1. **Feedback.** On every rAF during drag, run a container-aware hit-test over `resolvedMap` to classify the cursor as `{targetContainerId, targetIndex, dropEdge}` and compute `activeGuides` from `snapAndReport`. Both live in the same `analystProDragState` and are consumed by a new presentational `DropIndicatorOverlay.jsx` (bars + edge highlights + dashed rings + amber guide lines). No JS animation loop — overlay is pure React, re-renders from store slice.
2. **Commit.** On pointerup, if `targetContainerId !== sourceParentId` → `moveZoneAcrossContainers(root, sourceId, targetContainerId, targetIndex)` (new op). If `dropEdge` classifies the cursor over a leaf's edge (not container centre) → `wrapInContainer(root, targetZoneId, sourceZoneId, insertSide)` (new op) wraps target + source in a fresh `container-horz` or `container-vert` depending on side. Else fall through to existing same-parent `reorderZone` path (unchanged).

Two new pure ops are added to `lib/zoneTreeOps.ts` with TDD; existing ops (`insertChild`, `removeChild`, `reorderZone`, `normalizeContainer`) are reused. Appendix E.11 mandates **proportional redistribution by existing weights**, not smallest-first — both new ops re-use `normalizeContainer` which already implements this.

**Tech Stack:** React 19 presentational overlay (no portals — overlay mounts inside `.freeform-sheet` above `SelectionOverlay`). Zustand `store.js` `analystProDragState` slice extended with four optional fields. TypeScript `lib/snapMath.ts` (pure math, TDD) and `lib/zoneTreeOps.ts` (pure tree ops, TDD). Existing `layoutResolver.resolveLayout` output feeds container hit-test. Vitest 2.x + `@testing-library/react` for component test. No new deps.

**References (authoritative):**
- Parent roadmap: `docs/analyst_pro_tableau_parity_roadmap.md` § "Plan 5b — Drop Indicators + Smart Guides + Cross-Container Drag + Container Restructure".
- Tableau source of truth: `docs/Build_Tableau.md` §IX.1 (Zone on-wire shape), §IX.2 (Tiled vs Floating — `cellSize = (container - sum_fixed) × weight / sum_weights`, `FlowLayoutInfo::SetCellSize`, `FindMaxDistances`), §IX.3 (Containers — Distribute Evenly, flow container semantics), Appendix E.11 (tiled zone redistribution is **proportional by existing weights**, not smallest-first — must be enforced on both new ops).
- Precedent plans: `docs/superpowers/plans/2026-04-16-analyst-pro-plan-2b-canvas-polish.md` (task/test structure), `docs/superpowers/plans/2026-04-16-analyst-pro-plan-3-actions-runtime.md` (drag-state slice naming), `docs/superpowers/plans/2026-04-16-analyst-pro-plan-4e-canvas-polish-migration.md` (LayoutTreePanel cross-container drag precedent — already uses `reorderZoneAnalystPro` with any target), `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5a-zone-chrome.md` (precedent tone + ZoneFrame hover that feeds `analystProHoveredZoneId`).
- Project conventions: `QueryCopilot V1/CLAUDE.md` → store action suffix `…AnalystPro`, slice prefix `analystPro…`, Vega-Lite only, BYOK untouched.

**Non-goals (defer to later plans):**
- Right-click context menu — Plan 5c.
- Zone properties panel tabs (Layout / Style / Visibility) — Plan 5d.
- Float ↔ tiled toggle + smart layout heuristics + container commands — Plan 5e.
- Real keyboard drop (arrow-key tree move) — not roadmap'd for 5b.
- Animated overlay fades are 100 ms CSS transitions only; no GSAP / Framer integration.
- `LayoutTreePanel` already reached cross-container via `reorderZone` (Plan 4e). This plan adds a `moveZoneAcrossContainers` op that matches the *drop-in-container* semantics (index-specific) that Canvas drag needs — the tree panel's *sibling-relative* reorder keeps using `reorderZone` unchanged.

**Shared conventions (HARD — from roadmap):**
- **TDD** for `lib/snapMath.ts` + `lib/zoneTreeOps.ts` additions — failing test → impl → pass → commit.
- Store action names end `…AnalystPro`; state fields prefix `analystPro…`.
- Commit per task. Format: `feat(analyst-pro): <verb> <object> (Plan 5b TN)` / `test(analyst-pro): … (Plan 5b TN)` / `fix(analyst-pro): … (Plan 5b TN fixup)`.
- Immutable tree ops via the existing private `mapTree` helper in `zoneTreeOps.ts`.
- Vega-Lite only. No ECharts. No emoji — overlay uses CSS boxes / 1 px dashed borders only.
- Use canonical Tableau naming for flow containers: `container-horz` / `container-vert` (already the types defined in `lib/types.ts:25`).

---

## File Structure

| File | Role | Action |
|---|---|---|
| `frontend/src/components/dashboard/freeform/lib/snapMath.ts` | Add `snapAndReport(target, siblings, threshold)` returning `{x, y, guideLines}` | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/snapMath.test.ts` | Extend — unit tests for `snapAndReport` | Modify |
| `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts` | Add `moveZoneAcrossContainers`, `wrapInContainer` | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts` | Extend — unit tests for both new ops | Modify |
| `frontend/src/components/dashboard/freeform/lib/hitTest.ts` | Add `hitTestContainer(resolved, x, y)` + `classifyDropEdge(resolvedZone, x, y)` | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/hitTest.test.ts` | Extend — unit tests for container hit-test + edge classifier | Modify |
| `frontend/src/store.js` | Extend `analystProDragState` shape — `targetContainerId`, `targetIndex`, `dropEdge`, `activeGuides` (all optional) | Modify |
| `frontend/src/components/dashboard/freeform/hooks/useDragResize.js` | On pointermove compute container hit-test + guide lines → write into `analystProDragState`. On pointerup dispatch `moveZoneAcrossContainersAnalystPro` / `wrapInContainerAnalystPro` when applicable | Modify |
| `frontend/src/components/dashboard/freeform/DropIndicatorOverlay.jsx` | New presentational overlay — bars / edge highlights / dashed rings / amber guide lines | Create |
| `frontend/src/components/dashboard/freeform/__tests__/DropIndicatorOverlay.test.tsx` | Component tests (Vitest + testing-library) | Create |
| `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` | Mount `<DropIndicatorOverlay />` above `<SelectionOverlay />` inside `.freeform-sheet` | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx` | Extend — drag across container shows indicator → pointerup calls op | Modify |
| `frontend/src/index.css` | `.analyst-pro-drop-indicator-*` + `.analyst-pro-smart-guide` classes | Modify |

Tests live under `__tests__/` — already scoped by Vitest config (precedent: `snapMath.test.ts`, `zoneTreeOps.test.ts` exist). Run with `npm run test:chart-ir` (per CLAUDE.md).

---

## Task Checklist

- [ ] T1. `snapMath.ts` — `snapAndReport` (TDD: test → impl → pass → commit).
- [ ] T2. `zoneTreeOps.ts` — `moveZoneAcrossContainers` (TDD, cycle reject + index clamp + proportional re-normalize).
- [ ] T3. `zoneTreeOps.ts` — `wrapInContainer` (TDD, side → container type mapping + proportion split).
- [ ] T4. `hitTest.ts` — `hitTestContainer` + `classifyDropEdge` (TDD).
- [ ] T5. `store.js` — extend `analystProDragState` shape; add `moveZoneAcrossContainersAnalystPro` + `wrapInContainerAnalystPro` actions.
- [ ] T6. `useDragResize.js` — during move, write `targetContainerId` / `targetIndex` / `dropEdge` / `activeGuides` into drag state.
- [ ] T7. `useDragResize.js` — pointerup dispatches cross-container / wrap ops; keep existing same-parent reorder as fallback.
- [ ] T8. CSS — `.analyst-pro-drop-indicator-bar`, `.analyst-pro-drop-indicator-edge`, `.analyst-pro-drop-indicator-center`, `.analyst-pro-smart-guide` rules.
- [ ] T9. `DropIndicatorOverlay.jsx` — component + tests.
- [ ] T10. `FreeformCanvas.jsx` — mount overlay.
- [ ] T11. Smoke — `npm run test:chart-ir`, `npm run lint`, `npm run build` green. Fixups as needed.

---

## Task Specifications

### Task 1: `snapMath.snapAndReport` — returns snapped coords + guide-line metadata

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/snapMath.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/snapMath.test.ts`

- [ ] **Step 1: Write failing tests** — append to `__tests__/snapMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { snapAndReport } from '../lib/snapMath';

describe('snapAndReport', () => {
  const sib = { x: 100, y: 100, width: 200, height: 150 }; // sibling rect

  it('returns input position when no snap is within threshold', () => {
    const target = { x: 400, y: 400, width: 50, height: 50 };
    const out = snapAndReport(target, [sib], 6);
    expect(out.x).toBe(400);
    expect(out.y).toBe(400);
    expect(out.guideLines).toEqual([]);
  });

  it('snaps target.x to sibling.left and reports an x-axis guide', () => {
    const target = { x: 103, y: 400, width: 50, height: 50 };
    const out = snapAndReport(target, [sib], 6);
    expect(out.x).toBe(100);
    expect(out.guideLines).toContainEqual({
      axis: 'x',
      position: 100,
      start: Math.min(100, 400),
      end: Math.max(100 + 150, 400 + 50),
    });
  });

  it('snaps target.y to sibling.bottom and reports a y-axis guide', () => {
    const target = { x: 400, y: 248, width: 50, height: 50 };
    const out = snapAndReport(target, [sib], 6);
    expect(out.y).toBe(250); // sib.y + sib.height = 100 + 150
    expect(out.guideLines.some((g) => g.axis === 'y' && g.position === 250)).toBe(true);
  });

  it('caps guideLines at 4 entries even when many siblings snap', () => {
    const siblings = Array.from({ length: 10 }, (_, i) => ({
      x: 100, y: 100 + i * 5, width: 50, height: 50,
    }));
    const target = { x: 103, y: 103, width: 10, height: 10 };
    const out = snapAndReport(target, siblings, 6);
    expect(out.guideLines.length).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/snapMath.test.ts`
Expected: 4 failures with `snapAndReport is not a function`.

- [ ] **Step 3: Implement `snapAndReport`** — append to `lib/snapMath.ts` (keep existing `snapToGrid` / `snapToEdges` unchanged):

```ts
export type GuideLine = {
  axis: 'x' | 'y';
  /** pixel position of the guide line on the given axis */
  position: number;
  /** perpendicular extent start (min of target and sibling on the other axis) */
  start: number;
  /** perpendicular extent end (max of target and sibling on the other axis) */
  end: number;
};

export type SnapReport = {
  x: number;
  y: number;
  guideLines: GuideLine[];
};

/**
 * Like snapToEdges, but also returns guide-line metadata so the overlay can
 * draw amber dashed lines. Caps guideLines at 4 (closest per axis + nearest
 * sibling edge) to avoid visual clutter when dragging near many siblings.
 */
export function snapAndReport(target: Rect, siblings: Rect[], threshold: number): SnapReport {
  let bestX = target.x;
  let bestY = target.y;
  let bestDx = threshold + 1;
  let bestDy = threshold + 1;
  let bestSibX: Rect | null = null;
  let bestSibY: Rect | null = null;

  for (const s of siblings) {
    const sibRight = s.x + s.width;
    const sibBottom = s.y + s.height;
    const tgtRight = target.x + target.width;
    const tgtBottom = target.y + target.height;

    // X-axis candidates: align target.x OR target.right to sibling.x OR sibling.right
    const xCandidates: Array<{ pos: number; newX: number }> = [
      { pos: s.x, newX: s.x },
      { pos: s.x, newX: s.x - target.width },
      { pos: sibRight, newX: sibRight },
      { pos: sibRight, newX: sibRight - target.width },
    ];
    for (const c of xCandidates) {
      const d = c.newX === s.x || c.newX === sibRight
        ? Math.abs(target.x - c.newX)
        : Math.abs(tgtRight - (c.newX + target.width));
      if (d < bestDx) { bestDx = d; bestX = c.newX; bestSibX = s; }
    }

    // Y-axis candidates: align target.y OR target.bottom to sibling.y OR sibling.bottom
    const yCandidates: Array<{ pos: number; newY: number }> = [
      { pos: s.y, newY: s.y },
      { pos: s.y, newY: s.y - target.height },
      { pos: sibBottom, newY: sibBottom },
      { pos: sibBottom, newY: sibBottom - target.height },
    ];
    for (const c of yCandidates) {
      const d = c.newY === s.y || c.newY === sibBottom
        ? Math.abs(target.y - c.newY)
        : Math.abs(tgtBottom - (c.newY + target.height));
      if (d < bestDy) { bestDy = d; bestY = c.newY; bestSibY = s; }
    }
  }

  const guideLines: GuideLine[] = [];
  if (bestDx <= threshold && bestSibX) {
    const pos = bestX === bestSibX.x || bestX + target.width === bestSibX.x
      ? bestSibX.x
      : bestSibX.x + bestSibX.width;
    guideLines.push({
      axis: 'x',
      position: pos,
      start: Math.min(bestSibX.y, bestY),
      end: Math.max(bestSibX.y + bestSibX.height, bestY + target.height),
    });
  } else {
    bestX = target.x;
  }
  if (bestDy <= threshold && bestSibY) {
    const pos = bestY === bestSibY.y || bestY + target.height === bestSibY.y
      ? bestSibY.y
      : bestSibY.y + bestSibY.height;
    guideLines.push({
      axis: 'y',
      position: pos,
      start: Math.min(bestSibY.x, bestX),
      end: Math.max(bestSibY.x + bestSibY.width, bestX + target.width),
    });
  } else {
    bestY = target.y;
  }

  return { x: bestX, y: bestY, guideLines: guideLines.slice(0, 4) };
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/snapMath.test.ts`
Expected: all 4 new tests PASS; existing `snapToGrid` / `snapToEdges` tests still PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add frontend/src/components/dashboard/freeform/lib/snapMath.ts frontend/src/components/dashboard/freeform/__tests__/snapMath.test.ts
git commit -m "feat(analyst-pro): snapAndReport with guide-line metadata (Plan 5b T1)"
```

---

### Task 2: `zoneTreeOps.moveZoneAcrossContainers` — index-specific cross-container drop

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`

- [ ] **Step 1: Write failing tests** — append to `__tests__/zoneTreeOps.test.ts`:

```ts
import { moveZoneAcrossContainers } from '../lib/zoneTreeOps';

describe('moveZoneAcrossContainers', () => {
  const leaf = (id: string, w = 50000, h = 100000) => ({
    id, type: 'worksheet' as const, w, h, worksheetRef: id,
  });
  const build = () => ({
    id: 'root', type: 'container-horz' as const, w: 100000, h: 100000,
    children: [
      { id: 'A', type: 'container-vert' as const, w: 50000, h: 100000,
        children: [leaf('A1', 100000, 50000), leaf('A2', 100000, 50000)] },
      { id: 'B', type: 'container-vert' as const, w: 50000, h: 100000,
        children: [leaf('B1', 100000, 100000)] },
    ],
  });

  it('moves a leaf from container A into container B at index 1', () => {
    const root = build();
    const next = moveZoneAcrossContainers(root, 'A1', 'B', 1);
    const B = next.children.find((c) => c.id === 'B')!;
    expect(B.children.map((c: any) => c.id)).toEqual(['B1', 'A1']);
    const A = next.children.find((c) => c.id === 'A')!;
    expect(A.children.map((c: any) => c.id)).toEqual(['A2']);
  });

  it('re-normalizes both source and target containers after the move', () => {
    const root = build();
    const next = moveZoneAcrossContainers(root, 'A1', 'B', 0);
    const A = next.children.find((c) => c.id === 'A')!;
    const B = next.children.find((c) => c.id === 'B')!;
    const sumAxis = (c: any, axis: 'w' | 'h') =>
      c.children.reduce((s: number, k: any) => s + k[axis], 0);
    expect(sumAxis(A, 'h')).toBe(100000);
    expect(sumAxis(B, 'h')).toBe(100000);
  });

  it('rejects cycles — cannot move a container into its own descendant', () => {
    const root = build();
    const next = moveZoneAcrossContainers(root, 'A', 'A', 0);
    expect(next).toBe(root);
  });

  it('clamps negative or overflowing targetIndex', () => {
    const root = build();
    const nLo = moveZoneAcrossContainers(root, 'A1', 'B', -5);
    const nHi = moveZoneAcrossContainers(root, 'A1', 'B', 999);
    const BLo = nLo.children.find((c) => c.id === 'B')!;
    const BHi = nHi.children.find((c) => c.id === 'B')!;
    expect(BLo.children[0].id).toBe('A1');
    expect(BHi.children[BHi.children.length - 1].id).toBe('A1');
  });

  it('returns identity when source or target not found', () => {
    const root = build();
    expect(moveZoneAcrossContainers(root, 'missing', 'B', 0)).toBe(root);
    expect(moveZoneAcrossContainers(root, 'A1', 'missing', 0)).toBe(root);
  });

  it('returns identity when targetContainerId is a leaf (not a container)', () => {
    const root = build();
    expect(moveZoneAcrossContainers(root, 'A1', 'B1', 0)).toBe(root);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`
Expected: 6 failures with `moveZoneAcrossContainers is not a function`.

- [ ] **Step 3: Implement** — append to `lib/zoneTreeOps.ts` (beneath `reorderZone`, re-using private helpers `mapTree`, `isDescendant`, `findZoneInTree`, and public `removeChild` + `insertChild`):

```ts
/**
 * Cross-container move — drop a zone INTO a specific container at a specific index.
 * Differs from reorderZone which inserts relative to a *sibling* target.
 *
 * Behaviour:
 *   - Returns identity (same reference) when sourceId or targetContainerId is missing,
 *     when the target is not a container, or when the target descends from source
 *     (would create a cycle).
 *   - Removes source from its current parent (renormalizes that container).
 *   - Inserts source into target at clamped `targetIndex ∈ [0, target.children.length]`
 *     (renormalizes the target container).
 *   - Both affected containers end at proportional-sum = 100000 per Appendix E.11
 *     (proportional redistribution by existing weights — handled by `normalizeContainer`
 *     via `insertChild` / `removeChild`).
 */
export function moveZoneAcrossContainers(
  root: Zone,
  sourceId: string,
  targetContainerId: string,
  targetIndex: number,
): Zone {
  if (sourceId === targetContainerId) return root;

  const source = findZoneInTree(root, sourceId);
  if (!source) return root;

  const target = findZoneInTree(root, targetContainerId);
  if (!target || !isContainer(target)) return root;

  // Cycle guard: cannot drop a container into one of its own descendants.
  if (isDescendant(source, targetContainerId)) return root;

  const clampedIndex = Math.max(0, Math.min(targetIndex, target.children.length));

  const withoutSource = removeChild(root, sourceId);
  // After removal the target container may have a new child count if the source
  // was already inside it — clamp again against the *post-removal* length.
  const targetAfterRemoval = findZoneInTree(withoutSource, targetContainerId);
  if (!targetAfterRemoval || !isContainer(targetAfterRemoval)) return root;
  const finalIndex = Math.max(0, Math.min(clampedIndex, targetAfterRemoval.children.length));

  return insertChild(withoutSource, targetContainerId, source, finalIndex);
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`
Expected: all tests (existing + new) PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
git commit -m "feat(analyst-pro): moveZoneAcrossContainers tree op (Plan 5b T2)"
```

---

### Task 3: `zoneTreeOps.wrapInContainer` — drop-on-edge split container creation

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`

- [ ] **Step 1: Write failing tests** — append:

```ts
import { wrapInContainer } from '../lib/zoneTreeOps';

describe('wrapInContainer', () => {
  const leaf = (id: string, w = 50000, h = 100000) => ({
    id, type: 'worksheet' as const, w, h, worksheetRef: id,
  });
  const build = () => ({
    id: 'root', type: 'container-horz' as const, w: 100000, h: 100000,
    children: [leaf('A', 50000, 100000), leaf('B', 50000, 100000)],
  });

  it('dropping on top edge of B creates a container-vert wrapping [source, B]', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C', 100000, 100000), 'top');
    const wrapper = next.children.find((c: any) => c.id !== 'A')!;
    expect(wrapper.type).toBe('container-vert');
    expect((wrapper as any).children.map((c: any) => c.id)).toEqual(['C', 'B']);
  });

  it('dropping on bottom edge of B creates container-vert wrapping [B, source]', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C'), 'bottom');
    const wrapper = next.children.find((c: any) => c.id !== 'A')!;
    expect(wrapper.type).toBe('container-vert');
    expect((wrapper as any).children.map((c: any) => c.id)).toEqual(['B', 'C']);
  });

  it('dropping on left edge creates container-horz wrapping [source, B]', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C'), 'left');
    const wrapper = next.children.find((c: any) => c.id !== 'A')!;
    expect(wrapper.type).toBe('container-horz');
    expect((wrapper as any).children.map((c: any) => c.id)).toEqual(['C', 'B']);
  });

  it('dropping on right edge creates container-horz wrapping [B, source]', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C'), 'right');
    const wrapper = next.children.find((c: any) => c.id !== 'A')!;
    expect(wrapper.type).toBe('container-horz');
    expect((wrapper as any).children.map((c: any) => c.id)).toEqual(['B', 'C']);
  });

  it('preserves target B\'s original axis proportion in the parent', () => {
    const root = build();
    const next = wrapInContainer(root, 'B', leaf('C'), 'right');
    const wrapper = next.children.find((c: any) => c.id !== 'A')!;
    // New wrapper replaces B at index 1 with B's original w (50000).
    expect((wrapper as any).w).toBe(50000);
    // Grandparent still sums to 100000.
    const sum = next.children.reduce((s: number, c: any) => s + c.w, 0);
    expect(sum).toBe(100000);
  });

  it('returns identity when targetId missing or is the root', () => {
    const root = build();
    expect(wrapInContainer(root, 'missing', leaf('C'), 'top')).toBe(root);
    expect(wrapInContainer(root, 'root', leaf('C'), 'top')).toBe(root);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`
Expected: 6 new failures with `wrapInContainer is not a function`.

- [ ] **Step 3: Implement** — append to `lib/zoneTreeOps.ts` (re-uses `normalizeContainer`, `generateZoneId`, `mapTree`, `findParentInTree`, `findZoneInTree`):

```ts
export type InsertSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * Drop-on-edge wrap — replace `targetId` in its parent with a new container
 * whose children are `[source, target]` (or `[target, source]`, depending on side).
 *
 * Side → container type mapping (matches Tableau tiled flow — Build_Tableau §IX.2/3):
 *   - top    → container-vert, children = [source, target]
 *   - bottom → container-vert, children = [target, source]
 *   - left   → container-horz, children = [source, target]
 *   - right  → container-horz, children = [target, source]
 *
 * Behaviour:
 *   - Returns identity when target is the root, missing, or source is missing.
 *   - New wrapper inherits target's axis proportion in its grandparent (so grandparent
 *     still sums to 100000 without renormalization).
 *   - Inside the wrapper, children get 50/50 on the wrapper's axis and 100000 on the
 *     perpendicular axis — `normalizeContainer` rescales to exact integer sums.
 *   - Source (`sourceZone`) is inserted as a deep clone by reference — caller must
 *     ensure source is not still living elsewhere in the tree (canvas drag path
 *     calls `removeChild` before this op in T7).
 */
export function wrapInContainer(
  root: Zone,
  targetId: string,
  sourceZone: Zone,
  side: InsertSide,
): Zone {
  if (root.id === targetId) return root;

  const target = findZoneInTree(root, targetId);
  if (!target) return root;

  const parent = findParentInTree(root, targetId);
  if (!parent) return root;

  const isVertical = side === 'top' || side === 'bottom';
  const newType: ContainerType = isVertical ? 'container-vert' : 'container-horz';
  const sourceFirst = side === 'top' || side === 'left';

  const parentAxis: 'w' | 'h' = parent.type === 'container-horz' ? 'w' : 'h';
  const perpAxis: 'w' | 'h' = parentAxis === 'w' ? 'h' : 'w';

  // Inner children seed at 50/50 on wrapper's axis, 100000 on perp axis.
  const wrapperAxis: 'w' | 'h' = newType === 'container-horz' ? 'w' : 'h';
  const wrapperPerp: 'w' | 'h' = wrapperAxis === 'w' ? 'h' : 'w';
  const seedChild = (z: Zone): Zone => ({
    ...z,
    [wrapperAxis]: 50000,
    [wrapperPerp]: 100000,
  } as Zone);

  const innerChildren: Zone[] = sourceFirst
    ? [seedChild(sourceZone), seedChild(target)]
    : [seedChild(target), seedChild(sourceZone)];

  const wrapper: ContainerZone = normalizeContainer({
    id: generateZoneId(),
    type: newType,
    w: parentAxis === 'w' ? (target as any).w : 100000,
    h: parentAxis === 'h' ? (target as any).h : 100000,
    children: innerChildren,
  } as ContainerZone);
  // Ensure perpendicular axis stays 100000 after normalize.
  const wrapperSized: Zone = {
    ...wrapper,
    [parentAxis]: (target as any)[parentAxis],
    [perpAxis]: 100000,
  } as Zone;

  // Splice wrapper into parent, replacing target. No renormalize of parent —
  // wrapper inherits target's exact axis proportion, so the sum is preserved.
  const nextParent: ContainerZone = {
    ...parent,
    children: parent.children.map((c) => (c.id === targetId ? wrapperSized : c)),
  };

  return parent.id === root.id
    ? nextParent
    : mapTree(root, (zone) => (zone.id === parent.id ? nextParent : zone));
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.test.ts
git commit -m "feat(analyst-pro): wrapInContainer drop-on-edge op (Plan 5b T3)"
```

---

### Task 4: `hitTest.ts` — `hitTestContainer` + `classifyDropEdge`

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/hitTest.ts`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/hitTest.test.ts`

- [ ] **Step 1: Write failing tests** — append (or create if missing — precedent is `hitTest.test.ts` beside the file):

```ts
import { describe, it, expect } from 'vitest';
import { hitTestContainer, classifyDropEdge } from '../lib/hitTest';
import type { ResolvedZone } from '../lib/types';

const resolved = (zone: any, x: number, y: number, width: number, height: number, depth: number): ResolvedZone => ({
  zone, x, y, width, height, depth,
});

describe('hitTestContainer', () => {
  const leaf = (id: string) => ({ id, type: 'worksheet', w: 50000, h: 50000 });
  const container = (id: string, children: any[]) => ({
    id, type: 'container-horz', w: 100000, h: 100000, children,
  });

  it('returns the deepest container under the point, skipping leaves', () => {
    const inner = container('inner', [leaf('L1'), leaf('L2')]);
    const root = container('root', [inner]);
    const list: ResolvedZone[] = [
      resolved(root, 0, 0, 800, 600, 0),
      resolved(inner, 100, 100, 400, 300, 1),
      resolved(leaf('L1'), 100, 100, 200, 300, 2),
    ];
    expect(hitTestContainer(list, 150, 150)?.zone.id).toBe('inner');
  });

  it('returns null when no container covers the point', () => {
    const list: ResolvedZone[] = [
      resolved({ id: 'root', type: 'container-horz' }, 0, 0, 100, 100, 0),
    ];
    expect(hitTestContainer(list, 500, 500)).toBeNull();
  });

  it('ignores floating zones (depth = -1)', () => {
    const list: ResolvedZone[] = [
      resolved({ id: 'f', type: 'container-horz' }, 0, 0, 100, 100, -1),
    ];
    expect(hitTestContainer(list, 50, 50)).toBeNull();
  });
});

describe('classifyDropEdge', () => {
  const r = resolved({ id: 'z', type: 'worksheet' }, 100, 100, 200, 100, 2);

  it('classifies top edge within 20% of zone height', () => {
    expect(classifyDropEdge(r, 150, 105)).toBe('top');
  });
  it('classifies bottom edge', () => {
    expect(classifyDropEdge(r, 150, 195)).toBe('bottom');
  });
  it('classifies left edge within 20% of zone width', () => {
    expect(classifyDropEdge(r, 110, 150)).toBe('left');
  });
  it('classifies right edge', () => {
    expect(classifyDropEdge(r, 290, 150)).toBe('right');
  });
  it('classifies center when inside the inner 60% rectangle', () => {
    expect(classifyDropEdge(r, 200, 150)).toBe('center');
  });
});
```

- [ ] **Step 2: Verify failures**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/hitTest.test.ts`
Expected: all new tests fail with `hitTestContainer is not a function` / `classifyDropEdge is not a function`.

- [ ] **Step 3: Implement** — append to `lib/hitTest.ts`:

```ts
export type DropEdge = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** Like hitTestPoint, but only returns zones whose `zone.type` starts with 'container-'
 *  and which live on the tiled layer (depth >= 0). Innermost wins.
 *  Used by the canvas drag loop to classify the cursor's containing container. */
export function hitTestContainer(resolved: ResolvedZone[], x: number, y: number): ResolvedZone | null {
  let best: ResolvedZone | null = null;
  let bestDepth = -Infinity;
  for (const r of resolved) {
    if (r.depth < 0) continue;
    const t = (r.zone as { type?: string }).type;
    if (!t || !t.startsWith('container-')) continue;
    if (x < r.x || x > r.x + r.width || y < r.y || y > r.y + r.height) continue;
    if (r.depth > bestDepth) {
      best = r;
      bestDepth = r.depth;
    }
  }
  return best;
}

/** Classify where within a leaf zone the cursor sits.
 *  Outer 20% band per side → top/bottom/left/right. Inner 60% rectangle → center.
 *  Ambiguous corners resolve to whichever band is deeper (smaller normalized distance). */
export function classifyDropEdge(r: ResolvedZone, x: number, y: number): DropEdge {
  const dx = (x - r.x) / r.width;
  const dy = (y - r.y) / r.height;
  const THRESHOLD = 0.2;
  const distTop = dy;
  const distBottom = 1 - dy;
  const distLeft = dx;
  const distRight = 1 - dx;
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);
  if (minDist >= THRESHOLD) return 'center';
  if (minDist === distTop) return 'top';
  if (minDist === distBottom) return 'bottom';
  if (minDist === distLeft) return 'left';
  return 'right';
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/hitTest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/hitTest.ts frontend/src/components/dashboard/freeform/__tests__/hitTest.test.ts
git commit -m "feat(analyst-pro): hitTestContainer + classifyDropEdge (Plan 5b T4)"
```

---

### Task 5: Store — extend `analystProDragState` shape; add two new actions

**Files:**
- Modify: `frontend/src/store.js`

Current slice (lines 695-696):
```js
  analystProDragState: null,
  setAnalystProDragState: (state) => set({ analystProDragState: state }),
```

- [ ] **Step 1: Extend inline JSDoc + add actions** — replace the two lines above with:

```js
  /**
   * analystProDragState shape (Plan 5b extends Plan 2):
   *   {
   *     zoneId: string,
   *     parentId: string,
   *     dx: number,
   *     dy: number,
   *     targetContainerId?: string | null,
   *     targetIndex?: number | null,
   *     dropEdge?: 'top'|'bottom'|'left'|'right'|'center'|null,
   *     activeGuides?: Array<{ axis: 'x'|'y'; position: number; start: number; end: number }>,
   *   }
   */
  analystProDragState: null,
  setAnalystProDragState: (state) => set({ analystProDragState: state }),

  // Plan 5b: cross-container move. Takes sourceId, targetContainerId, targetIndex.
  moveZoneAcrossContainersAnalystPro: (sourceId, targetContainerId, targetIndex) => {
    const { analystProDashboard, setAnalystProDashboard, pushAnalystProHistory } = get();
    if (!analystProDashboard?.tiledRoot) return;
    const { moveZoneAcrossContainers } = require('./components/dashboard/freeform/lib/zoneTreeOps');
    const nextRoot = moveZoneAcrossContainers(
      analystProDashboard.tiledRoot,
      sourceId,
      targetContainerId,
      targetIndex,
    );
    if (nextRoot === analystProDashboard.tiledRoot) return;
    const nextDash = { ...analystProDashboard, tiledRoot: nextRoot };
    setAnalystProDashboard(nextDash);
    pushAnalystProHistory(nextDash);
  },

  // Plan 5b: drop-on-edge wrap. `sourceZone` is the full Zone object (cloned from
  // the tree after `removeChild`), `side` is 'top'|'bottom'|'left'|'right'.
  wrapInContainerAnalystPro: (targetZoneId, sourceZone, side) => {
    const { analystProDashboard, setAnalystProDashboard, pushAnalystProHistory } = get();
    if (!analystProDashboard?.tiledRoot) return;
    const { wrapInContainer, removeChild } = require('./components/dashboard/freeform/lib/zoneTreeOps');
    // Remove source from current location first, then wrap.
    const afterRemove = removeChild(analystProDashboard.tiledRoot, sourceZone.id);
    const nextRoot = wrapInContainer(afterRemove, targetZoneId, sourceZone, side);
    if (nextRoot === analystProDashboard.tiledRoot) return;
    const nextDash = { ...analystProDashboard, tiledRoot: nextRoot };
    setAnalystProDashboard(nextDash);
    pushAnalystProHistory(nextDash);
  },
```

Note on the `require(...)` usage: Zustand store entries use dynamic CJS-style require to avoid pulling TS lib into the module graph at store init (precedent: other `…AnalystPro` actions in `store.js` import ops this way). If the file already uses static `import` for zoneTreeOps at the top of `store.js`, use that instead — `grep -n "zoneTreeOps" frontend/src/store.js` first; prefer ESM static imports when they already exist.

- [ ] **Step 2: Verify syntax**

Run: `cd frontend && npm run lint -- --max-warnings 0`
Expected: PASS (no new warnings).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store.js
git commit -m "feat(analyst-pro): extend analystProDragState + move/wrap actions (Plan 5b T5)"
```

---

### Task 6: `useDragResize.js` — write `targetContainerId` / `targetIndex` / `dropEdge` / `activeGuides` during drag

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useDragResize.js`

- [ ] **Step 1: Import new helpers + accept resolved list** — update imports and signature:

```js
import { reorderZone, resizeZone } from '../lib/zoneTreeOps';
import { snapToGrid, snapToEdges, snapAndReport } from '../lib/snapMath';
import { hitTestContainer, classifyDropEdge } from '../lib/hitTest';
```

Change the hook signature at line 24 from `({ canvasRef, resolvedMap, siblingsFloating })` to `({ canvasRef, resolvedMap, siblingsFloating, resolvedList })`. The caller in `FreeformCanvas.jsx` already has `resolved` in scope (line 50) — Task 10 passes it through.

- [ ] **Step 2: Replace the tiled-move branch of `applyDragDelta`** — inside `applyDragDelta` locate the final `if (!start.isFloating && start.mode === 'move' ...)` block (starts ~line 177) and replace it with:

```js
  // Tiled move: classify cursor over containers + leaves, compute guides.
  if (!start.isFloating && start.mode === 'move' && dashboard.tiledRoot) {
    const parent = findParentContainer(dashboard.tiledRoot, start.zoneId);
    if (!parent) return;

    // Cursor position in canvas-local coords. dashboardAtStart's initialZone
    // was captured from resolvedMap so (initial.x + dx) is the current pointer.
    const cursorX = (start.initialZone?.x ?? 0) + dx;
    const cursorY = (start.initialZone?.y ?? 0) + dy;

    let targetContainerId = null;
    let targetIndex = null;
    let dropEdge = null;
    let activeGuides = [];

    if (start.resolvedList) {
      const hitContainer = hitTestContainer(start.resolvedList, cursorX, cursorY);
      if (hitContainer && hitContainer.zone.id !== start.zoneId) {
        targetContainerId = hitContainer.zone.id;
        // Compute targetIndex by comparing cursor against each child's midpoint
        // along the container's primary axis.
        const children = hitContainer.zone.children || [];
        const primary = hitContainer.zone.type === 'container-horz' ? 'x' : 'y';
        const primaryLen = primary === 'x' ? 'width' : 'height';
        let idx = children.length;
        for (let i = 0; i < children.length; i++) {
          const childResolved = start.resolvedList.find((r) => r.zone.id === children[i].id);
          if (!childResolved) continue;
          const mid = childResolved[primary] + childResolved[primaryLen] / 2;
          if ((primary === 'x' ? cursorX : cursorY) < mid) { idx = i; break; }
        }
        targetIndex = idx;
      }

      // Edge classification runs when cursor is over a leaf (not a container).
      const hitLeafResolved = start.resolvedList.find((r) => {
        const t = r.zone?.type;
        if (!t || t.startsWith('container-')) return false;
        if (r.zone.id === start.zoneId) return false;
        return cursorX >= r.x && cursorX <= r.x + r.width
            && cursorY >= r.y && cursorY <= r.y + r.height;
      });
      if (hitLeafResolved) {
        dropEdge = classifyDropEdge(hitLeafResolved, cursorX, cursorY);
        targetContainerId = hitLeafResolved.zone.id;
        targetIndex = null;
      }

      // Smart-guide computation: snap cursor rect against *sibling* resolved
      // zones (excluding the dragged one). Runs on every move.
      const initialW = start.initialZone?.width ?? 80;
      const initialH = start.initialZone?.height ?? 60;
      const siblingRects = start.resolvedList
        .filter((r) => r.zone.id !== start.zoneId && r.depth >= 0)
        .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
      const SNAP_THRESHOLD_PX = 6;
      const report = snapAndReport(
        { x: cursorX, y: cursorY, width: initialW, height: initialH },
        siblingRects,
        SNAP_THRESHOLD_PX,
      );
      activeGuides = report.guideLines;
    }

    useStore.getState().setAnalystProDragState({
      zoneId: start.zoneId,
      parentId: parent.id,
      targetIndex,
      dx,
      dy,
      targetContainerId,
      dropEdge,
      activeGuides,
    });
  }
```

- [ ] **Step 3: Thread `resolvedList` into `startRef.current`** — in `onZonePointerDown` (line 33), modify the `startRef.current = { ... }` assignment to include `resolvedList`:

```js
    startRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      zoneId,
      mode,
      handle,
      isFloating,
      initialZone: isFloating ? { ...dashboard.floatingLayer.find((f) => f.id === zoneId) } : resolvedZone,
      dashboardAtStart: dashboard,
      resolvedList: Array.from(resolvedMap?.values?.() ?? []),
    };
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/freeform/hooks/useDragResize.js
git commit -m "feat(analyst-pro): drag state with target container + edge + guides (Plan 5b T6)"
```

---

### Task 7: `useDragResize.js` — pointerup dispatches `move`/`wrap` actions

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useDragResize.js`

Current `onUp` (lines 69-107) only handles same-parent reorder via `reorderZone`. Extend to:
1. If `drag.dropEdge ∈ {top,bottom,left,right}` and `drag.targetContainerId` resolves to a LEAF → call `wrapInContainerAnalystPro`.
2. Else if `drag.dropEdge === 'center'` — no-op (swap dialog deferred per roadmap "guard with confirmation dialog").
3. Else if `drag.targetContainerId && targetContainerId !== parentId` and targets a container → call `moveZoneAcrossContainersAnalystPro`.
4. Else → existing same-parent reorder path (unchanged).

- [ ] **Step 1: Rewrite the tiled-move branch of `onUp`** — replace the block starting at `if (drag && startRef.current.mode === 'move' && !startRef.current.isFloating) {` (line 75) through its closing brace with:

```js
      if (drag && startRef.current.mode === 'move' && !startRef.current.isFloating) {
        const dashAtEnd = useStore.getState().analystProDashboard;
        if (dashAtEnd?.tiledRoot) {
          const wrap = useStore.getState().wrapInContainerAnalystPro;
          const moveAcross = useStore.getState().moveZoneAcrossContainersAnalystPro;

          // Case 1 — drop on leaf edge → wrap in new split container.
          if (drag.dropEdge && drag.dropEdge !== 'center' && drag.targetContainerId) {
            const sourceZone = findById(dashAtEnd.tiledRoot, drag.zoneId);
            if (sourceZone && drag.targetContainerId !== drag.zoneId) {
              wrap(drag.targetContainerId, sourceZone, drag.dropEdge);
            }
          }
          // Case 2 — drop into a different container at an index.
          else if (
            drag.targetContainerId
            && drag.targetContainerId !== drag.parentId
            && typeof drag.targetIndex === 'number'
          ) {
            moveAcross(drag.zoneId, drag.targetContainerId, drag.targetIndex);
          }
          // Case 3 — same-parent reorder (existing heuristic).
          else {
            const parent = findParentContainer(dashAtEnd.tiledRoot, drag.zoneId);
            if (parent) {
              const currentIdx = parent.children.findIndex((c) => c.id === drag.zoneId);
              let targetIdx = currentIdx;
              const axis = parent.type === 'container-horz' ? drag.dx : drag.dy;
              if (axis > 40) targetIdx = Math.min(parent.children.length - 1, currentIdx + 1);
              else if (axis < -40) targetIdx = Math.max(0, currentIdx - 1);
              if (targetIdx !== currentIdx) {
                const targetId = parent.children[targetIdx].id;
                const position = targetIdx > currentIdx ? 'after' : 'before';
                const next = reorderZone(dashAtEnd.tiledRoot, drag.zoneId, targetId, position);
                setDashboard({ ...dashAtEnd, tiledRoot: next });
              }
            }
          }
        }
      }
```

- [ ] **Step 2: Lint + typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/freeform/hooks/useDragResize.js
git commit -m "feat(analyst-pro): pointerup dispatches cross-container + wrap ops (Plan 5b T7)"
```

---

### Task 8: CSS — drop-indicator + smart-guide classes

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Append rules** — locate the last `.analyst-pro-*` block (Plan 5a added `.analyst-pro-zone-frame`) and append beneath it:

```css
/* Plan 5b — drop-indicator overlay */
.analyst-pro-drop-indicator-bar {
  position: absolute;
  background: var(--accent-blue, #3b82f6);
  border-radius: 2px;
  pointer-events: none;
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.45);
  transition: opacity 100ms linear;
}
.analyst-pro-drop-indicator-edge {
  position: absolute;
  background: rgba(59, 130, 246, 0.35);
  border: 1px solid var(--accent-blue, #3b82f6);
  border-radius: 3px;
  pointer-events: none;
  transition: opacity 100ms linear;
}
.analyst-pro-drop-indicator-center {
  position: absolute;
  border: 2px dashed var(--accent-blue, #3b82f6);
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.08);
  pointer-events: none;
  transition: opacity 100ms linear;
}

/* Plan 5b — smart guide lines (amber dashed) */
.analyst-pro-smart-guide {
  position: absolute;
  background: transparent;
  pointer-events: none;
  transition: opacity 100ms linear;
}
.analyst-pro-smart-guide[data-axis="x"] {
  width: 0;
  border-left: 1px dashed var(--accent-amber, #f59e0b);
}
.analyst-pro-smart-guide[data-axis="y"] {
  height: 0;
  border-top: 1px dashed var(--accent-amber, #f59e0b);
}

@media (prefers-reduced-motion: reduce) {
  .analyst-pro-drop-indicator-bar,
  .analyst-pro-drop-indicator-edge,
  .analyst-pro-drop-indicator-center,
  .analyst-pro-smart-guide { transition: none; }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(analyst-pro): drop-indicator + smart-guide CSS (Plan 5b T8)"
```

---

### Task 9: `DropIndicatorOverlay.jsx` + component test

**Files:**
- Create: `frontend/src/components/dashboard/freeform/DropIndicatorOverlay.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/DropIndicatorOverlay.test.tsx`

- [ ] **Step 1: Write failing test** — `__tests__/DropIndicatorOverlay.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import DropIndicatorOverlay from '../DropIndicatorOverlay';
import { useStore } from '../../../../store';

describe('DropIndicatorOverlay', () => {
  beforeEach(() => {
    useStore.getState().setAnalystProDragState(null);
    cleanup();
  });

  const resolved = (id: string, x: number, y: number, width: number, height: number, depth = 1) => ({
    zone: { id, type: id.startsWith('c') ? 'container-horz' : 'worksheet' },
    x, y, width, height, depth,
  });

  it('renders nothing when dragState is null', () => {
    const { container } = render(<DropIndicatorOverlay resolvedList={[]} />);
    expect(container.querySelector('.analyst-pro-drop-indicator-bar')).toBeNull();
    expect(container.querySelector('.analyst-pro-drop-indicator-edge')).toBeNull();
  });

  it('renders a bar between siblings when targetContainerId + targetIndex are set', () => {
    useStore.getState().setAnalystProDragState({
      zoneId: 'src', parentId: 'rootP', dx: 0, dy: 0,
      targetContainerId: 'c1', targetIndex: 1, dropEdge: null, activeGuides: [],
    });
    const list = [
      resolved('c1', 0, 0, 400, 200),
      resolved('A', 0, 0, 200, 200, 2),
      resolved('B', 200, 0, 200, 200, 2),
    ];
    // c1 is container-horz → bar is vertical between A and B at x=200.
    const { container } = render(<DropIndicatorOverlay resolvedList={list} />);
    const bar = container.querySelector('.analyst-pro-drop-indicator-bar');
    expect(bar).not.toBeNull();
  });

  it('renders an edge highlight when dropEdge is set', () => {
    useStore.getState().setAnalystProDragState({
      zoneId: 'src', parentId: 'rootP', dx: 0, dy: 0,
      targetContainerId: 'B', targetIndex: null, dropEdge: 'right', activeGuides: [],
    });
    const list = [resolved('B', 100, 100, 200, 100, 2)];
    const { container } = render(<DropIndicatorOverlay resolvedList={list} />);
    expect(container.querySelector('.analyst-pro-drop-indicator-edge')).not.toBeNull();
  });

  it('renders amber guide lines from activeGuides', () => {
    useStore.getState().setAnalystProDragState({
      zoneId: 'src', parentId: 'rootP', dx: 0, dy: 0,
      targetContainerId: null, targetIndex: null, dropEdge: null,
      activeGuides: [
        { axis: 'x', position: 100, start: 0, end: 300 },
        { axis: 'y', position: 150, start: 0, end: 400 },
      ],
    });
    const { container } = render(<DropIndicatorOverlay resolvedList={[]} />);
    expect(container.querySelectorAll('.analyst-pro-smart-guide').length).toBe(2);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/DropIndicatorOverlay.test.tsx`
Expected: 4 failures — file does not exist.

- [ ] **Step 3: Implement component** — `DropIndicatorOverlay.jsx`:

```jsx
// frontend/src/components/dashboard/freeform/DropIndicatorOverlay.jsx
import { useStore } from '../../../store';

/**
 * Presentational overlay — reads analystProDragState and renders:
 *   - 3 px blue bar between sibling slots when targetContainerId + targetIndex set.
 *   - 6 px edge highlight on the nearest side of a leaf when dropEdge is top/bottom/left/right.
 *   - Dashed ring across a container when dropEdge === 'center' (reserved — Plan 5b leaves
 *     centre-drop handling for a later confirmation-dialog plan; for now the overlay
 *     still renders the ring as visual feedback but pointerup ignores it).
 *   - 1 px amber dashed guide lines from activeGuides (max 4, capped by snapAndReport).
 *
 * Overlay coordinate space matches `.freeform-sheet` (0,0 at sheet top-left), so all
 * absolute positions use pixel values directly from the resolved list / drag state.
 */
export default function DropIndicatorOverlay({ resolvedList }) {
  const drag = useStore((s) => s.analystProDragState);
  if (!drag) return null;

  const byId = new Map();
  for (const r of resolvedList || []) byId.set(r.zone.id, r);

  // Bar between siblings (container drop).
  let bar = null;
  if (drag.targetContainerId && drag.targetIndex != null && !drag.dropEdge) {
    const container = byId.get(drag.targetContainerId);
    if (container && container.zone?.children) {
      const isHorz = container.zone.type === 'container-horz';
      const children = container.zone.children;
      const idx = Math.max(0, Math.min(drag.targetIndex, children.length));
      const BAR = 3;
      if (isHorz) {
        const x = idx === 0
          ? container.x
          : idx >= children.length
            ? container.x + container.width - BAR
            : (() => {
                const prev = byId.get(children[idx - 1].id);
                return prev ? prev.x + prev.width - BAR / 2 : container.x;
              })();
        bar = { x, y: container.y, width: BAR, height: container.height };
      } else {
        const y = idx === 0
          ? container.y
          : idx >= children.length
            ? container.y + container.height - BAR
            : (() => {
                const prev = byId.get(children[idx - 1].id);
                return prev ? prev.y + prev.height - BAR / 2 : container.y;
              })();
        bar = { x: container.x, y, width: container.width, height: BAR };
      }
    }
  }

  // Edge highlight or center ring on a leaf drop.
  let edge = null;
  let ring = null;
  if (drag.dropEdge && drag.targetContainerId) {
    const leaf = byId.get(drag.targetContainerId);
    if (leaf) {
      const E = 6;
      if (drag.dropEdge === 'center') {
        ring = { x: leaf.x + 6, y: leaf.y + 6, width: leaf.width - 12, height: leaf.height - 12 };
      } else if (drag.dropEdge === 'top') {
        edge = { x: leaf.x, y: leaf.y, width: leaf.width, height: E };
      } else if (drag.dropEdge === 'bottom') {
        edge = { x: leaf.x, y: leaf.y + leaf.height - E, width: leaf.width, height: E };
      } else if (drag.dropEdge === 'left') {
        edge = { x: leaf.x, y: leaf.y, width: E, height: leaf.height };
      } else if (drag.dropEdge === 'right') {
        edge = { x: leaf.x + leaf.width - E, y: leaf.y, width: E, height: leaf.height };
      }
    }
  }

  const guides = drag.activeGuides || [];

  return (
    <div
      data-testid="drop-indicator-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {bar && (
        <div
          className="analyst-pro-drop-indicator-bar"
          style={{ left: bar.x, top: bar.y, width: bar.width, height: bar.height }}
        />
      )}
      {edge && (
        <div
          className="analyst-pro-drop-indicator-edge"
          style={{ left: edge.x, top: edge.y, width: edge.width, height: edge.height }}
        />
      )}
      {ring && (
        <div
          className="analyst-pro-drop-indicator-center"
          style={{ left: ring.x, top: ring.y, width: ring.width, height: ring.height }}
        />
      )}
      {guides.map((g, i) => (
        <div
          key={`guide-${i}`}
          className="analyst-pro-smart-guide"
          data-axis={g.axis}
          style={g.axis === 'x'
            ? { left: g.position, top: g.start, height: g.end - g.start }
            : { top: g.position, left: g.start, width: g.end - g.start }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/DropIndicatorOverlay.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/DropIndicatorOverlay.jsx frontend/src/components/dashboard/freeform/__tests__/DropIndicatorOverlay.test.tsx
git commit -m "feat(analyst-pro): DropIndicatorOverlay with bars + edges + guides (Plan 5b T9)"
```

---

### Task 10: Mount overlay in `FreeformCanvas.jsx`

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx`

- [ ] **Step 1: Import** — add near the existing imports (after `MarqueeOverlay`):

```js
import DropIndicatorOverlay from './DropIndicatorOverlay';
```

- [ ] **Step 2: Pass `resolvedList` into hook** — at line 86, change:

```js
const { onZonePointerDown } = useDragResize({
  canvasRef: containerRef,
  resolvedMap,
  siblingsFloating: resolved.filter((r) => r.depth === -1),
});
```

to:

```js
const { onZonePointerDown } = useDragResize({
  canvasRef: containerRef,
  resolvedMap,
  siblingsFloating: resolved.filter((r) => r.depth === -1),
  resolvedList: resolved,
});
```

- [ ] **Step 3: Mount overlay** — inside `.freeform-sheet`, immediately after `<MarqueeOverlay rect={marquee} />` (line 240), add:

```jsx
        <DropIndicatorOverlay resolvedList={resolved} />
```

- [ ] **Step 4: Extend integration test** — append to `__tests__/FreeformCanvas.integration.test.tsx`:

```tsx
it('DropIndicatorOverlay mounts inside freeform-sheet', async () => {
  const dash = buildTwoZoneDashboard(); // existing helper in the integration test
  const { container } = render(<FreeformCanvas dashboard={dash} renderLeaf={() => <div />} />);
  expect(container.querySelector('[data-testid="drop-indicator-overlay"]')).not.toBeNull();
});
```

If `buildTwoZoneDashboard` does not exist, re-use the existing fixture factory at the top of `FreeformCanvas.integration.test.tsx` (grep for `const dash` or `const dashboard =` in that file; the Plan 5a T8 commit `8e321be` added one).

- [ ] **Step 5: Run integration suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/FreeformCanvas.jsx frontend/src/components/dashboard/freeform/__tests__/FreeformCanvas.integration.test.tsx
git commit -m "feat(analyst-pro): mount DropIndicatorOverlay in canvas (Plan 5b T10)"
```

---

### Task 11: Smoke — full test + lint + build; LayoutTreePanel cross-container verification

**Files:**
- (No source changes expected — verification only.)

- [ ] **Step 1: Verify LayoutTreePanel uses cross-container primitive correctly**

Run: `grep -n "reorderZoneAnalystPro" frontend/src/components/dashboard/freeform/panels/LayoutTreePanel.jsx`
Expected: one usage — already routes sibling-relative drops through `reorderZoneAnalystPro(sourceId, targetId, position)`. `reorderZone` internally handles cross-container reorder (removes source → inserts near target's parent). **No change needed** — roadmap item #6 ("verify LayoutTreePanel calls the new `moveZoneAcrossContainers` for cross-container cases") resolves to: the tree-panel UX is sibling-relative, so `reorderZone` remains the correct primitive. `moveZoneAcrossContainers` is specifically the canvas-drop-into-container-at-index primitive, exercised only by Canvas in Task 7. Document this explicitly in the commit message.

- [ ] **Step 2: Full scoped test**

Run: `cd frontend && npm run test:chart-ir`
Expected: all freeform tests PASS. If the pre-existing ~22 chart-ir router failures (see `CLAUDE.md` → "Known Test Debt") still appear, confirm the failure count did not increase beyond the baseline — diff against `git stash` temporarily if needed.

- [ ] **Step 3: Lint + build**

Run (parallel OK):
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
Expected: both PASS.

- [ ] **Step 4: Commit any fixups** — format: `fix(analyst-pro): <issue> (Plan 5b TN fixup)` tied to the originating task number.

- [ ] **Step 5: Final commit (no-op or fixup bundle)**

```bash
git commit --allow-empty -m "chore(analyst-pro): Plan 5b smoke verification (Plan 5b T11)

LayoutTreePanel reorderZone path unchanged — tree-panel UX is sibling-
relative, so reorderZone remains correct. moveZoneAcrossContainers is
scoped to canvas drop-into-container-at-index (Task 7)."
```

---

## Self-Review Notes

- **Spec coverage.** Every roadmap deliverable maps to a task:
  - Deliverable 1 (`DropIndicatorOverlay`) → T8 + T9 + T10.
  - Deliverable 2 (`snapAndReport`) → T1 + T9 (amber lines) + T6 (compute in drag loop).
  - Deliverable 3 (cross-container hit-test) → T4 + T6.
  - Deliverable 4 (`moveZoneAcrossContainers`) → T2 + T5 + T7.
  - Deliverable 5 (`wrapInContainer`) → T3 + T5 + T7.
  - Deliverable 6 (verify LayoutTreePanel) → T11 step 1.
- **Type consistency.** `SnapReport` / `GuideLine` (T1) match the `activeGuides` shape in T5 drag-state JSDoc and the render loop in T9. `DropEdge` (T4) matches the T5 drag-state enum and T9's `drag.dropEdge` switch.
- **Appendix E.11 compliance.** `moveZoneAcrossContainers` (T2) re-uses `removeChild` + `insertChild` — both call `normalizeContainer` which rescales siblings proportionally by existing weights (see `zoneTree.ts:normalizeContainer`). `wrapInContainer` (T3) seeds inner children 50/50 on the wrapper axis (a new container has no prior weights) and inherits the target's exact parent-axis proportion so the grandparent sum stays 100000 without renormalization.
- **No placeholders.** Every code step has complete code.
- **No Vega-Lite / BYOK / security impact.** Plan touches only frontend canvas layer; no backend, no SQL, no LLM adapter.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5b-drop-indicators-restructure.md`.

Two execution options for the separate execution session:
1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task via `superpowers:subagent-driven-development`, two-stage review between tasks.
2. **Inline Execution** — batch-execute with checkpoints via `superpowers:executing-plans`.

# Plan 7 — Analyst Pro Tableau-Parity Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` task-by-task. Every task has an explicit **Resume Trigger** — a single file/symbol check that tells a fresh session whether the task is already shipped. If the trigger evaluates `TRUE`, the task is done; skip it. **Do not re-implement a task whose trigger passes.** Do not guess or hallucinate state.

---

## Context — what ships, what is broken

Plans 5a, 5b, 5c, 5d, 5e, 6a, 6b, 6c, 6d, 6e all landed. Despite that, Analyst Pro dashboards are unusable:

1. **"Worksheet #xxxx" chrome label stacks on top of the chart's own Vega-rendered title** — two titles per tile, destroys readability. Tableau renders the chart title inside the chart surface; the frame stays chrome-less by default.
2. **Dragging a tiled worksheet makes the tile disappear or reflow to zero size.** Unverified cause; multiple candidates (floating drag has no viewport clamp; `wrapInContainer` can produce sub-40px cells; `classifyDropEdge` may return unexpected values near small targets). Reproduce first, fix second.
3. **Smart-layout heuristic (Plan 5e) produces uniform cells regardless of tile type.** A 137.5M KPI card gets the same 200-px row as a scatter plot. Canvas height `ceil(n / N) * 320` is too low for mixed content; KPIs waste space while charts clip.
4. **No persistence** — store mutates `analystProDashboard`, but no frontend hook PUTs `tiledRoot` / `floatingLayer` back to `PATCH /dashboards/{id}`. Backend already accepts the fields (`dashboard_routes.py:135-145`, Plan 3 T9). Any edit lost on refresh.
5. **Legacy shim is the only load path.** `AnalystProLayout.jsx:63` always runs `legacyTilesToDashboard(tiles, …)`; backend-persisted `tiledRoot` is ignored even when present. Consequence: even after Phase D lands, a reload would re-overwrite the server state with the shim's output. Phase E fixes this.

**Goal.** Ship a dashboard authoring experience that visually matches Tableau (clean chart tiles, no frame chrome by default, persistent drag, mixed-height rows) and persists across sessions.

---

## Architecture — four-layer split, all changes additive

1. **Chrome layer — `ZoneFrame.jsx` + `zoneDefaults.ts`.** Drop `'worksheet'` from `TITLE_BAR_DEFAULT_VISIBLE`. Worksheet tiles render with no persistent frame bar. Grip + action buttons (⋯ ⛶ ×) move to a hover-only overlay (opacity 0 → 1 on `.analyst-pro-zone-frame:hover`). `legacyTilesToDashboard` populates `displayName: tile.title` so users who explicitly opt into the frame title (via properties panel) see a real name, not `Worksheet #3w8i`. This makes a 320-px cell feel like a 320-px chart, not a 290-px chart with a 30-px header.
2. **Drag layer — `useDragResize.js` + `zoneTreeOps.ts`.** Add two safety nets: (a) floating move clamps `nx`, `ny` to `[0, canvasW - pxW]` / `[0, canvasH - pxH]` so a zone can never render off-canvas; (b) `wrapInContainer` rejects wraps that would produce a child cell smaller than `MIN_WRAP_PX = 120` — returns identity, the drag is treated as a no-op and the source stays where it was. Log the rejection to `console.debug` so the interaction is debuggable. Add a live `data-testid="drag-diagnostic"` DOM node the smoke test asserts on.
3. **Layout layer — `legacyTilesToDashboard.js`.** Replace the uniform N-columns heuristic with a KPI-aware bin-packer: classify each tile as `kpi` (single-number-only chart spec) or `chart`. KPIs pack 4-per-row at 160 px tall; charts pack 2-per-row at 360 px tall. Canvas height = sum of row heights + 32-px gutter. Canvas width stays 1440. Still byte-identical for N ≤ 4 single-type inputs (regression-locked).
4. **Persistence layer — new `useAnalystProAutosave.js` hook + `AnalystProLayout.jsx` load path.** Hook subscribes to `analystProDashboard`, debounces 1500 ms, calls `api.updateDashboard(id, { tiledRoot, floatingLayer, size, archetype, schemaVersion })`. Load path: if backend dashboard response carries `tiledRoot`, feed it straight to `FreeformCanvas` and skip `legacyTilesToDashboard`. Legacy shim only fires on first-ever load (server has no `tiledRoot`). This kills the "reload wipes edits" bug at the source.

**Runtime flow (edit → refresh):** user drags tile → store mutates → `useAnalystProAutosave` debounces → `PATCH /dashboards/{id}` body `{ tiledRoot, floatingLayer, size }` → `user_storage.update_dashboard` persists → user refreshes → `GET /dashboards/{id}` returns server state with `tiledRoot` → `AnalystProLayout` detects `dashboard.tiledRoot` present → bypasses `legacyTilesToDashboard` → `FreeformCanvas` seeds store with server state → identical to pre-refresh.

**Tech Stack.** React 19, Zustand, TypeScript 5.7 (`.ts` libs), Vitest 2.x + `@testing-library/react`. No new deps. No backend change (schema already exists from Plan 3 T9).

---

## References (authoritative — read before any step)

- `docs/Build_Tableau.md`
  - §IX.1 Zone on-wire shape — worksheet zones carry chart metadata, not chrome. Chart title is a VizQL property, not a dashboard-object property.
  - §IX.2 Tiled vs Floating — floating coordinates are absolute px; Tableau clamps to dashboard rect (Appendix E.14 "floating zones cannot escape the dashboard viewport"). Our Phase B T1 matches.
  - §IX.3 Containers — "Fit to Content" and "Distribute Evenly" already live (Plan 5e). This plan adds the missing wrap-rejection guard for sub-120-px cells (§E.13 "Tableau refuses wraps that would produce a zone smaller than the minimum cell size, logged to the change tracker").
- `QueryCopilot V1/CLAUDE.md` §Architecture — Vega-Lite only, store action suffix `…AnalystPro`, slice prefix `analystPro…`, BYOK untouched, per-task commit `feat(analyst-pro): <verb> <object> (Plan 7 TN)`.
- Precedent plans:
  - `2026-04-17-analyst-pro-plan-5a-zone-chrome.md` T1–T4 — `ZoneFrame` + `TITLE_BAR_DEFAULT_VISIBLE` origin.
  - `2026-04-17-analyst-pro-plan-5e-float-toggle-container-commands.md` — `legacyTilesToDashboard` rewrite precedent.
  - `2026-04-17-analyst-pro-plan-6a-canvas-zoom-pan-rulers.md` T10 — backend preserves authored layouts on `PATCH` (Plan 3 T9 fields already whitelisted). Phase D relies on this.
- Backend: `backend/routers/dashboard_routes.py:125-150` — `UpdateDashboardBody` accepts `schemaVersion`, `archetype`, `size`, `tiledRoot`, `floatingLayer`, `worksheets`, `parameters`, `sets`, `actions`, `globalStyle`.

**Non-goals (deferred — stubbed or documented):**

- Multi-user collaborative editing (no OT/CRDT) — autosave is last-write-wins. Tracked for Plan 8.
- Undo across refresh — history is session-local. Server does not store history. Out of scope.
- Tile-type classification beyond `kpi` vs `chart` — no tree-maps, no geo tiles, no sparkline compact mode. Phase C.1 ships binary classification; richer taxonomy deferred.
- Animated drag ghost / snap preview polish — `DropIndicatorOverlay` already ships (Plan 5b). No new animation.
- Dashboard-level "Fit Content" button (shrink canvas to bounding box of zones) — the per-container op exists (Plan 5e); dashboard-level lift deferred.
- Worksheet name vs. dashboard-zone display name reconciliation (Tableau §XII.4) — deferred. Phase A T2 populates `displayName` from `tile.title` as the pragmatic fix; proper worksheet-ref resolution is Plan 8.

**Shared conventions (HARD):**

- **TDD for library code.** Required for all pure helpers (Phase A T2, Phase B T2, Phase C T1) and all new store actions (Phase D T2). Component-level tests via `@testing-library/react`.
- **Store naming.** `useAnalystProAutosave` (hook), no new slice. Read/write existing `analystProDashboard`.
- **Commit format.** `feat(analyst-pro): <verb> <object> (Plan 7 TN)` / `test(analyst-pro): <desc> (Plan 7 TN)` / `fix(analyst-pro): <desc> (Plan 7 TN fixup)`. Final task always `chore(analyst-pro): Plan 7 smoke verification + roadmap status (Plan 7 T14)`.
- **No emoji in code.** Use Unicode geometric / math symbols if glyphs needed.
- **Security / BYOK invariants.** No new anthropic imports. No new SQL. Test fixtures build DOM via `document.createElement` + `setAttribute` (never `innerHTML`). Autosave never sends raw query results, only layout metadata.
- **Vega-Lite only.** Untouched.
- **Legacy backward-compat.** Phase C T1 produces byte-identical output for N ≤ 4 single-type inputs. Regression-locked in test.

---

## File Structure

| File | Role | Action |
|---|---|---|
| `frontend/src/components/dashboard/freeform/lib/zoneDefaults.ts` | Remove `'worksheet'` from `TITLE_BAR_DEFAULT_VISIBLE` and `TITLE_SHOWN_BY_DEFAULT`. | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/zoneDefaults.test.ts` | Assert worksheet is NOT in `TITLE_BAR_DEFAULT_VISIBLE`. Lock regression. | Create |
| `frontend/src/components/dashboard/freeform/ZoneFrame.jsx` | Convert always-visible action cluster to hover overlay (CSS class flip); title bar only rendered when `zone.showTitle === true` explicitly. | Modify |
| `frontend/src/index.css` | Add `.analyst-pro-zone-frame__actions { opacity: 0; transition: opacity 120ms; }` and `.analyst-pro-zone-frame:hover .analyst-pro-zone-frame__actions { opacity: 1; }`. | Modify |
| `frontend/src/components/dashboard/modes/legacyTilesToDashboard.js` | Populate `displayName: t.title`. Rewrite sizing: KPI vs chart detection, per-type row heights, dynamic canvas height. Export `classifyTile`. | Modify |
| `frontend/src/components/dashboard/modes/__tests__/legacyTilesToDashboard.test.ts` | Extend: `displayName` populated; `classifyTile` returns `'kpi' \| 'chart'`; N=4 single-type byte-identical; N=14 mixed produces expected layout. | Modify |
| `frontend/src/components/dashboard/freeform/hooks/useDragResize.js` | Floating move: clamp `nx`, `ny` to canvas bounds. Pass `canvasSize` into hook args. | Modify |
| `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` | Forward `canvasSize` into `useDragResize`. | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/useDragResize.bounds.test.ts` | TDD for floating-drag viewport clamp. | Create |
| `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts` | `wrapInContainer`: reject wraps that would produce a cell narrower/shorter than `MIN_WRAP_PX = 120`. Add `canvasWPx` / `canvasHPx` params (default infinite = no rejection for non-UI callers). | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.wrapGuard.test.ts` | TDD for wrap-rejection. | Create |
| `frontend/src/components/dashboard/freeform/hooks/useAnalystProAutosave.js` | New hook. Subscribes to `analystProDashboard`, debounces 1500ms, calls `api.updateDashboard`. | Create |
| `frontend/src/components/dashboard/freeform/__tests__/useAnalystProAutosave.test.ts` | TDD: mutation triggers PATCH after debounce; unmount cancels pending; PATCH body shape. | Create |
| `frontend/src/api.js` | Verify `updateDashboard` accepts the full Analyst Pro body. (Already does — Plan 3 T9. Confirm only.) | Verify-only |
| `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` | Load path: if `tilesOrDashboard` carries `tiledRoot`, use directly; else run `legacyTilesToDashboard`. Mount `useAnalystProAutosave(dashboardId)`. | Modify |
| `frontend/src/components/dashboard/modes/__tests__/AnalystProLayout.loadPath.test.tsx` | TDD: backend-persisted `tiledRoot` bypasses legacy shim. | Create |
| `docs/analyst_pro_tableau_parity_roadmap.md` | Flip Plan 7 status to Shipped at end, add commit list. | Modify (T14) |

**Smoke command (rerun at each phase boundary):** `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ src/components/dashboard/modes/__tests__/ && npm run lint && npm run build`.

---

## Task Checklist

Phase A — Chrome (readability)
- [ ] T1. `zoneDefaults.ts` — remove `'worksheet'` from `TITLE_BAR_DEFAULT_VISIBLE` and `TITLE_SHOWN_BY_DEFAULT`. TDD in new `zoneDefaults.test.ts`.
- [ ] T2. `legacyTilesToDashboard.js` — populate `displayName: tile.title` on every worksheet child. TDD extension.
- [ ] T3. `ZoneFrame.jsx` + `index.css` — convert action cluster to hover-only overlay.

Phase B — Drag reliability
- [ ] T4. `zoneTreeOps.ts` — `wrapInContainer` rejects sub-`MIN_WRAP_PX` wraps. TDD.
- [ ] T5. `useDragResize.js` — floating-move clamps `nx`, `ny` to canvas bounds. TDD.

Phase C — Layout quality
- [ ] T6. `legacyTilesToDashboard.js` — add `classifyTile(tile)` returning `'kpi' | 'chart'`. TDD.
- [ ] T7. `legacyTilesToDashboard.js` — KPI-aware bin pack (KPIs 4/row × 160px, charts 2/row × 360px). TDD with N=4 byte-identical + N=14 mixed golden.

Phase D — Persistence
- [ ] T8. `useAnalystProAutosave.js` — debounced PATCH hook. TDD.
- [ ] T9. `AnalystProLayout.jsx` — mount `useAnalystProAutosave(dashboardId)`.

Phase E — Load path rip
- [ ] T10. `AnalystProLayout.jsx` — if server payload has `tiledRoot`, use directly; else legacy shim. TDD `AnalystProLayout.loadPath.test.tsx`.
- [ ] T11. `FreeformCanvas.jsx` — seed store from server payload when present (no regression on Plan 2 behavior for first-load empty).

Phase F — Verify
- [ ] T12. Full smoke (`npx vitest run …`, `npm run lint`, `npm run build`).
- [ ] T13. Manual verify via live preview: load dashboard with 14 tiles → drag 3 tiles → refresh → layout persists.
- [ ] T14. Roadmap status flip. `chore(analyst-pro): Plan 7 smoke verification + roadmap status (Plan 7 T14)`.

---

## Task Specifications

### Task 1 — drop worksheet from TITLE_BAR_DEFAULT_VISIBLE

**Why.** Worksheet tiles double-title (frame bar + Vega chart title). Removing worksheet from the default set hides the frame bar on initial render; the Vega chart owns the title. Users can still opt in via properties panel (`showTitle: true`).

**Files.**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneDefaults.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/zoneDefaults.test.ts`

**Resume Trigger (session-safe).** Task is DONE if:
`grep -E "^\s*'worksheet'," frontend/src/components/dashboard/freeform/lib/zoneDefaults.ts` returns nothing AND `frontend/src/components/dashboard/freeform/__tests__/zoneDefaults.test.ts` exists.

**Steps.**
1. Write failing test `zoneDefaults.test.ts`:
   ```ts
   import { describe, it, expect } from 'vitest';
   import { TITLE_BAR_DEFAULT_VISIBLE, TITLE_SHOWN_BY_DEFAULT } from '../lib/zoneDefaults';
   describe('Plan 7 T1 — worksheet frame-bar default', () => {
     it('worksheet NOT in TITLE_BAR_DEFAULT_VISIBLE', () => {
       expect(TITLE_BAR_DEFAULT_VISIBLE.has('worksheet')).toBe(false);
     });
     it('worksheet NOT in TITLE_SHOWN_BY_DEFAULT', () => {
       expect(TITLE_SHOWN_BY_DEFAULT.has('worksheet')).toBe(false);
     });
   });
   ```
2. Run → RED.
3. Remove `'worksheet'` line from `TITLE_BAR_DEFAULT_VISIBLE` (zoneDefaults.ts line ~8) and from `TITLE_SHOWN_BY_DEFAULT` (line ~34).
4. Run → GREEN.
5. Regression smoke: `npx vitest run src/components/dashboard/freeform/__tests__/`. No new failures.

**Commit.** `feat(analyst-pro): drop worksheet from default title-bar set (Plan 7 T1)`

---

### Task 2 — legacyTilesToDashboard populates displayName

**Why.** If a user manually enables the frame bar, fallback label is `Worksheet #3w8i`. Meaningless. `tile.title` is the human-authored chart title.

**Files.**
- Modify: `frontend/src/components/dashboard/modes/legacyTilesToDashboard.js`
- Modify: `frontend/src/components/dashboard/modes/__tests__/legacyTilesToDashboard.test.ts` (or `.test.tsx` — match existing file)

**Resume Trigger.** DONE if: `grep -n "displayName:" frontend/src/components/dashboard/modes/legacyTilesToDashboard.js` returns a line inside `toWorksheetChild`.

**Steps.**
1. Extend `toWorksheetChild`:
   ```js
   const toWorksheetChild = (t, i, axisH) => ({
     id: String(t.id ?? `t${i}`),
     type: 'worksheet',
     w: 100000,
     h: axisH,
     worksheetRef: String(t.id ?? `t${i}`),
     displayName: typeof t.title === 'string' && t.title.trim().length > 0 ? t.title : undefined,
   });
   ```
2. Extend test: assert `tile = { id: 'a', title: 'Member Rides' }` → output child `.displayName === 'Member Rides'`; missing title → `displayName === undefined`.

**Commit.** `feat(analyst-pro): legacy shim carries tile title as zone displayName (Plan 7 T2)`

---

### Task 3 — ZoneFrame hover-only action cluster

**Why.** Grip + three buttons visible always = visual noise. Tableau shows the cluster only on hover.

**Files.**
- Modify: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`
- Modify: `frontend/src/index.css`

**Resume Trigger.** DONE if: `grep -n "analyst-pro-zone-frame__actions" frontend/src/index.css` shows a rule with `opacity: 0` AND a `:hover` rule with `opacity: 1`.

**Steps.**
1. `index.css` — append:
   ```css
   .analyst-pro-zone-frame__actions { opacity: 0; transition: opacity 120ms ease-out; pointer-events: auto; }
   .analyst-pro-zone-frame:hover .analyst-pro-zone-frame__actions,
   .analyst-pro-zone-frame:focus-within .analyst-pro-zone-frame__actions { opacity: 1; }
   ```
2. `ZoneFrame.jsx` — no JSX change needed; CSS handles visibility. Verify `.analyst-pro-zone-frame__actions` class matches (already does, line 200).
3. Manual verify via live preview after Phase F lands.

**Commit.** `feat(analyst-pro): zone-frame actions hover-only (Plan 7 T3)`

---

### Task 4 — wrapInContainer rejects sub-MIN_WRAP_PX cells

**Why.** Dragging a tile into a tiny cell creates a wrap that produces children smaller than useful (chart content disappears). Reject the wrap; the drag is a no-op.

**Files.**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/zoneTreeOps.wrapGuard.test.ts`

**Resume Trigger.** DONE if: `grep -n "MIN_WRAP_PX" frontend/src/components/dashboard/freeform/lib/zoneTreeOps.ts` returns a line AND `zoneTreeOps.wrapGuard.test.ts` exists.

**Steps.**
1. Write failing test: fixture with 8-col horz root (each col ~120 px at 1000 px canvas). Attempt `wrapInContainer(root, leafInCol3, source, 'left', { canvasWPx: 1000, canvasHPx: 800 })`. Expect identity return.
2. Run → RED (current behaviour wraps and produces 60-px cells).
3. Implement: add optional 5th param `{ canvasWPx?: number; canvasHPx?: number }`. Compute target pixel dims from proportion × canvas px. Compute post-wrap child px dims = target_dim × 0.5. If either < 120 → return root (identity, no-op). Log `console.debug('[Plan 7 T4] wrap rejected: would produce <120px cell')`.
4. Run → GREEN.
5. Update `wrapInContainerAnalystPro` in `store.js` to pass canvas px from store (`analystProDashboard.size` + device overrides). If canvas size unknown (automatic mode), pass `Infinity` for both → guard no-ops.

**Commit.** `feat(analyst-pro): wrap guard rejects <120px child cells (Plan 7 T4)`

---

### Task 5 — floating-drag viewport clamp

**Why.** Dragging a floating zone past `x=0` or past `canvasW - pxW` puts it off-canvas. Tableau clamps.

**Files.**
- Modify: `frontend/src/components/dashboard/freeform/hooks/useDragResize.js`
- Modify: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx` (pass `canvasSize` into hook)
- Create: `frontend/src/components/dashboard/freeform/__tests__/useDragResize.bounds.test.ts`

**Resume Trigger.** DONE if: `grep -n "canvasWPx\|canvasHPx\|Math.min.*canvasW" frontend/src/components/dashboard/freeform/hooks/useDragResize.js` returns at least one line inside `applyDragDelta`.

**Steps.**
1. Write failing test: mock store, dispatch floating-move with `dx=9999`. Expect `x = canvasW - pxW`, not `initial.x + 9999`.
2. RED.
3. Pass `canvasSize` (or `{ canvasWPx, canvasHPx }`) through hook args + forward to `applyDragDelta`. In the float-move branch, after snap: `nx = Math.max(0, Math.min(canvasWPx - f.pxW, nx))`; same for `ny`.
4. GREEN.

**Commit.** `feat(analyst-pro): floating-drag clamps to canvas bounds (Plan 7 T5)`

---

### Task 6 — classifyTile helper

**Why.** Phase C T7 needs a single-function tile-type detector. Keep it pure + tested.

**Files.**
- Modify: `frontend/src/components/dashboard/modes/legacyTilesToDashboard.js` (export `classifyTile`)
- Modify or create: `frontend/src/components/dashboard/modes/__tests__/classifyTile.test.ts`

**Resume Trigger.** DONE if: `grep -n "export function classifyTile" frontend/src/components/dashboard/modes/legacyTilesToDashboard.js` matches.

**Steps.**
1. Write tests: KPI = single-number chartSpec (mark.type === 'text' OR explicit `tileKind: 'kpi'` OR chartType in `['kpi', 'bigNumber', 'number']`); else `'chart'`.
2. RED.
3. Implement `export function classifyTile(tile) { … }` returning `'kpi' | 'chart'`.
4. GREEN.

**Commit.** `feat(analyst-pro): classifyTile kpi-vs-chart helper (Plan 7 T6)`

---

### Task 7 — KPI-aware bin pack in legacyTilesToDashboard

**Why.** Mixed KPI + chart dashboards need mixed row heights. Uniform 200-px rows waste space for KPIs and clip charts.

**Files.**
- Modify: `frontend/src/components/dashboard/modes/legacyTilesToDashboard.js`
- Modify: `frontend/src/components/dashboard/modes/__tests__/legacyTilesToDashboard.test.ts`

**Resume Trigger.** DONE if: `grep -n "KPI_ROW_PX\|CHART_ROW_PX\|kpi.*4.*row\|kpisPerRow" frontend/src/components/dashboard/modes/legacyTilesToDashboard.js` returns non-empty.

**Steps.**
1. Constants: `KPIS_PER_ROW = 4`, `KPI_ROW_PX = 160`, `CHARTS_PER_ROW = 2`, `CHART_ROW_PX = 360`, `GUTTER_PX = 32`.
2. Partition `tiles` into `kpis` + `charts` preserving order.
3. Build KPI row(s) first: each row is a `container-horz` with up to 4 children; inside single root `container-vert`. KPI children proportional `w = 25000` (or `100000 / actualCount` for final partial row). Row's `h` proportional computed from absolute px.
4. Build chart row(s) similarly with 2-per-row at 360 px.
5. Canvas height = total px of all rows + gutters. Width = 1440.
6. Test cases:
   - N=4 all charts → single vert root, 4 children at 25000 h each (byte-identical regression).
   - N=4 mixed (2 kpi + 2 chart) → root with 2 rows (kpi row + chart row), heights proportional.
   - N=14 (4 kpi + 10 chart) → 1 KPI row + 5 chart rows.
7. Run → GREEN.

**Commit.** `feat(analyst-pro): KPI-aware bin pack for legacy shim (Plan 7 T7)`

---

### Task 8 — useAnalystProAutosave hook

**Why.** Mutations must persist. Debounce 1500 ms keeps request rate sane during rapid edits.

**Files.**
- Create: `frontend/src/components/dashboard/freeform/hooks/useAnalystProAutosave.js`
- Create: `frontend/src/components/dashboard/freeform/__tests__/useAnalystProAutosave.test.ts`

**Resume Trigger.** DONE if: the file `frontend/src/components/dashboard/freeform/hooks/useAnalystProAutosave.js` exists AND exports a function of the hook name.

**Steps.**
1. Write failing test: render hook with `dashboardId = 'd1'`. Mutate `analystProDashboard` → wait `vi.advanceTimersByTime(1500)` → assert `api.updateDashboard` called exactly once with `{ tiledRoot, floatingLayer, size, archetype, schemaVersion }`.
2. RED.
3. Implement:
   ```js
   import { useEffect, useRef } from 'react';
   import { useStore } from '../../../../store';
   import { updateDashboard } from '../../../../api';
   export default function useAnalystProAutosave(dashboardId) {
     const dashboard = useStore((s) => s.analystProDashboard);
     const timer = useRef(null);
     const lastSerialized = useRef(null);
     useEffect(() => {
       if (!dashboardId || !dashboard) return;
       const payload = {
         schemaVersion: dashboard.schemaVersion,
         archetype: dashboard.archetype,
         size: dashboard.size,
         tiledRoot: dashboard.tiledRoot,
         floatingLayer: dashboard.floatingLayer,
       };
       const serialized = JSON.stringify(payload);
       if (serialized === lastSerialized.current) return;
       if (timer.current) clearTimeout(timer.current);
       timer.current = setTimeout(() => {
         lastSerialized.current = serialized;
         updateDashboard(dashboardId, payload).catch((err) => {
           // Surface but don't throw — editor keeps working.
           console.warn('[Plan 7 T8] autosave failed', err);
         });
       }, 1500);
       return () => { if (timer.current) clearTimeout(timer.current); };
     }, [dashboard, dashboardId]);
   }
   ```
4. GREEN. Additional test: unmount cancels pending timer (no PATCH fires).

**Commit.** `feat(analyst-pro): useAnalystProAutosave debounced PATCH hook (Plan 7 T8)`

---

### Task 9 — mount autosave in AnalystProLayout

**Files.**
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

**Resume Trigger.** DONE if: `grep -n "useAnalystProAutosave" frontend/src/components/dashboard/modes/AnalystProLayout.jsx` returns an import AND a call site.

**Steps.**
1. Import + call `useAnalystProAutosave(dashboardId)` at top of the component body (after all existing hooks).
2. No test at this layer — T8 covers the hook itself.

**Commit.** `feat(analyst-pro): mount autosave hook in layout (Plan 7 T9)`

---

### Task 10 — load path prefers server tiledRoot

**Why.** After Phase D, server stores authored layout. Phase E stops overwriting it with the legacy shim.

**Files.**
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`
- Create: `frontend/src/components/dashboard/modes/__tests__/AnalystProLayout.loadPath.test.tsx`

**Resume Trigger.** DONE if: `grep -n "dashboard.tiledRoot\|props.dashboard.tiledRoot\|tilesOrDashboard" frontend/src/components/dashboard/modes/AnalystProLayout.jsx` shows a branch that skips `legacyTilesToDashboard`.

**Steps.**
1. Write failing test: render `AnalystProLayout` with a dashboard prop that includes a prebuilt `tiledRoot` (3-col horz root). Expect `FreeformCanvas` receives that exact tree, not the legacy shim's output.
2. RED.
3. Modify the layout:
   ```jsx
   const dashboard = useMemo(() => {
     if (dashboardProp && dashboardProp.tiledRoot) return dashboardProp;
     return legacyTilesToDashboard(tiles, dashboardId, dashboardName, size);
   }, [dashboardProp, tiles, dashboardId, dashboardName, size]);
   ```
   (Add `dashboard` prop to component signature if not present; route callers pass it from the Dashboard GET response.)
4. GREEN.

**Commit.** `feat(analyst-pro): prefer server-authored tiledRoot over legacy shim (Plan 7 T10)`

---

### Task 11 — FreeformCanvas seeds store from server payload

**Files.**
- Verify/Modify: `frontend/src/components/dashboard/freeform/FreeformCanvas.jsx`

**Resume Trigger.** DONE if: the existing seed effect at `FreeformCanvas.jsx:98-104` triggers on `dashboardProp?.id` change AND `dashboardProp?.tiledRoot` identity change (so a server-hydrated dashboard with same id but new tree still reseeds).

**Steps.**
1. Check: does the seed effect re-run when `tiledRoot` changes but `id` doesn't?
2. If not, add a ref-based equality check: compare `JSON.stringify(dashboardProp.tiledRoot)` on each render; if differs from ref, call `setDashboardInStore(dashboardProp)` + update ref.
3. No test — covered by T10 integration.

**Commit.** `feat(analyst-pro): FreeformCanvas reseeds on server tree change (Plan 7 T11)`

---

### Task 12 — full smoke

```
cd frontend
npx vitest run src/components/dashboard/freeform/__tests__/ src/components/dashboard/modes/__tests__/
npm run lint
npm run build
```

Gate condition: all new tests GREEN, no new failures vs baseline, lint clean, build passes.

**Commit.** (no commit — verification only, prep for T13)

---

### Task 13 — live manual verify

Use the preview tools (`mcp__Claude_Preview__*`) to:

1. Start dev server.
2. Load an Analyst Pro dashboard with ≥ 10 tiles.
3. Confirm: no "Worksheet #xxxx" chrome visible.
4. Drag 3 tiles to new positions (mix tiled reorder + floating).
5. Refresh browser.
6. Assert layout identical to pre-refresh.

If any step fails, open a fixup commit: `fix(analyst-pro): <desc> (Plan 7 T13 fixup)`.

---

### Task 14 — roadmap status

Edit `docs/analyst_pro_tableau_parity_roadmap.md`: add "Plan 7 — Tableau-Parity Finish" row with Shipped status + commit list.

**Commit.** `chore(analyst-pro): Plan 7 smoke verification + roadmap status (Plan 7 T14)`

---

## Session Resume Protocol (HARD)

A fresh Claude session resuming this plan MUST:

1. Run `git log --oneline --all | grep "Plan 7 T" | sort -u` to enumerate shipped tasks.
2. For each unchecked task in the Task Checklist, evaluate its **Resume Trigger** (bash one-liner). If TRUE, mark shipped in memory and skip.
3. Only start the first task whose Resume Trigger evaluates FALSE.
4. Never re-implement a task whose trigger passes. If a task looks incomplete but trigger passes, run the smoke command — green means done.
5. At end of any edit session: always commit with the exact `(Plan 7 TN)` suffix so the next session's `git log` scan finds it.

No hallucination. No guessing. If a trigger is ambiguous, run the smoke command for that task's test file and trust the result.

---

## Risk Log

| Risk | Mitigation |
|---|---|
| Autosave floods server on rapid drags | 1500 ms debounce + serialized-payload short-circuit (skip if unchanged). |
| Server `update_dashboard` field whitelist rejects one of our keys | Plan 3 T9 already whitelists `tiledRoot` / `floatingLayer` / `size` / `archetype` / `schemaVersion`. Verified at backend `routers/dashboard_routes.py:135-145`. |
| Load path regression breaks existing workbench/briefing modes | `AnalystProLayout.jsx` edit is scoped to Analyst Pro only; other mode layouts in `modes/` untouched. |
| `MIN_WRAP_PX = 120` blocks legitimate small wraps | Log rejection to `console.debug`; user can re-try with bigger target. Value tunable; tracked in code comment. |
| KPI classification misfires (chart misread as KPI) | Test cases cover canonical shapes; unknown schemas fall through to `'chart'`. Opt-out via explicit `tileKind: 'chart'` on tile. |
| Existing `analystProSheetFilters` (Plan 4a) interacts badly with autosave | Autosave payload does NOT include `analystProSheetFilters` — filters are per-session UI state, not persisted. Documented in T8 comment. |

---

END OF PLAN 7.

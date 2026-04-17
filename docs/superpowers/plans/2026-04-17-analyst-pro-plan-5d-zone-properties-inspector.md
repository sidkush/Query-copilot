# Plan 5d — Zone Properties Panel Rewrite (Tabbed Inspector) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-tab Visibility-only `ZonePropertiesPanel.jsx` (`frontend/src/components/dashboard/freeform/panels/ZonePropertiesPanel.jsx`, ~212 lines) with a Tableau-parity three-tab inspector — **Layout** (Position / Size / Size Mode / Inner+Outer Padding), **Style** (Background + Border + Title/Caption), **Visibility** (existing Plan 4d rule editor preserved verbatim) — wired to a new `setZonePropertyAnalystPro(zoneId, patch)` store action that patches arbitrary fields, records history, and round-trips through `backend/dashboard_migration.py` + `backend/user_storage.py` without loss.

**Architecture:** Four-layer split, each testable without mounting the next:

1. **Type layer — `frontend/src/components/dashboard/freeform/lib/types.ts`.** `BaseZone` gains seven optional fields per the roadmap § "Plan 5d Deliverable 2" (`innerPadding`, `outerPadding`, `background`, `border`, `showTitle`, `showCaption`, `fitMode`). The roadmap spec replaces the existing `BackgroundStyle` (`{ color?, image?, fit? }`) and `BorderStyle` (`{ width, color, style: 'solid'|'dashed'|'dotted' }`) type aliases in `lib/types.ts:10-11` with the new `BackgroundAP = { color: string; opacity: number }` and `BorderAP = { weight: [number,number,number,number]; color: string; style: 'solid'|'dashed' }` shapes (renamed so there is zero call-site collision — grep across `frontend/src/**` confirms only `lib/types.ts` itself mentions either alias; no consumer references `BackgroundStyle`/`BorderStyle` by name). The legacy `padding?: { outer: Padding; inner: Padding }` field stays declared but is superseded by the scalar `innerPadding`/`outerPadding` roadmap fields and is no longer read by `ZoneFrame.jsx` (Task T5). The `showTitleBar` shim field that `ZoneFrame.jsx:7-11` reads today becomes a deprecated alias of `showTitle` handled by `shouldShowTitleBar` so existing fixtures keep working.

2. **State layer — `frontend/src/store.js`.** One new action `setZonePropertyAnalystPro(zoneId, patch)` that mirrors `updateZoneAnalystPro` at `store.js:1143-1171` but with two differences: (a) accepts arbitrary Plan-5d field patches (not just `displayName`/`visibilityRule`) and (b) collapses no-op patches (deep-equal field-by-field short-circuit) before calling `pushAnalystProHistory` so slider-drag sprays do not flood the 500-entry history stack. The existing `updateZoneAnalystPro` stays untouched — `ZoneFrame` inline rename and old callers keep using it.

3. **Migration + persistence layer — `backend/dashboard_migration.py` + `backend/user_storage.py`.** `legacy_to_freeform_schema` is extended so legacy tiles carrying `innerPadding`/`outerPadding`/`background`/`border`/`showTitle`/`showCaption`/`fitMode` fields (from manually-edited JSON or future sources) survive conversion verbatim onto the emitted zone dicts. `user_storage.update_dashboard` (`backend/user_storage.py:614-638`) already whitelists `tiledRoot` / `floatingLayer` as opaque blobs, so per-zone fields round-trip for free — verified by a new `test_zone_properties_roundtrip.py` modelled on `backend/tests/test_zone_visibility_roundtrip.py`. No `_ALLOWED_ZONE_FIELDS`-style per-field allowlist exists today; introducing one would break Plan 5b/5c extensions that add `zone.locked`, `zone.visibilityRule`, etc. — so the roadmap's "allowlist updated" bullet is satisfied by adding the dashboard-level keys (none new — all Plan 5d fields are inside `tiledRoot`/`floatingLayer`) and by documenting the invariance in the roundtrip test.

4. **Presentation layer — `panels/ZonePropertiesPanel.jsx` + three tab sub-components.** Tab shell holds `activeTab: 'layout' | 'style' | 'visibility'` local state; sub-components live under `panels/zoneInspector/` (`LayoutTab.jsx`, `StyleTab.jsx`, `VisibilityTab.jsx`). Each tab is passed the `zone` plus a single-arg `onPatch(patch)` callback that lazily dispatches `setZonePropertyAnalystPro(zoneId, patch)`. Visibility tab is an almost-line-for-line extraction of the existing rule editor at `ZonePropertiesPanel.jsx:41-190` — only the container `<aside>` wrapper changes. Behaviour is preserved to keep the existing `ZonePropertiesPanel.test.tsx` (5 tests) green with no edits to those tests beyond wrapping interactions in the Visibility tab activation.

**The runtime flow:** user clicks a zone → `analystProSelection` becomes `{'z1'}` → `ZonePropertiesPanel` reads `selection` + finds zone → renders active tab → user edits a Layout/Style field → tab fires `onPatch({ innerPadding: 8 })` → store `setZonePropertyAnalystPro('z1', { innerPadding: 8 })` → `ZoneFrame` re-render applies `padding: 8px` inline style → `pushAnalystProHistory` snapshots → save endpoint persists through `user_storage.update_dashboard`'s existing whitelist.

**Tech Stack:** React 19 + Zustand (`store.js`), TypeScript for `lib/types.ts` + tab files (Setup existing — panels folder has `.tsx` siblings already). Vitest 2.x + `@testing-library/react` + `userEvent` for frontend tests; pytest for backend roundtrip. No new deps. Vega-Lite `autosize` signal for `fitMode` (no canvas resize loop) — `AnalystProWorksheetTile.jsx` compiles `fitMode` → `{ type, contains }` and forwards to `DashboardTileCanvas` → `VegaRenderer` via existing `strategy`/spec override plumbing.

**References (authoritative — read before any step):**
- Parent roadmap: `docs/analyst_pro_tableau_parity_roadmap.md` §"Plan 5d — Zone Properties Panel Rewrite (Tabbed Inspector)". Deliverables 1–5 map 1:1 onto T4 (type) / T1–T2 (store) / T5 (migration) / T6–T7 (ZoneFrame apply) / T8–T10 (tab UI + integration).
- Tableau source of truth: `docs/Build_Tableau.md`
  - §IX.6 **Padding / Background / Border** — establishes StyledBox as an object-level + container-level property bag (inner + outer + border weight per-edge + background with opacity). Drives the Style tab field set and the type shape of `BorderAP.weight` as a 4-tuple.
  - §XIV.1 **Formatting precedence chain** (Mark > Field > Worksheet > DS > Workbook) — zone-level Style tab fields live at Worksheet-or-Zone rank; they must **not** override per-field Mark/Field formats when they conflict. Out of scope for 5d implementation (real precedence chain = Phase 10), but documented in a code comment on `ZoneFrame.jsx`'s style-application block so Phase 10 knows where to hook.
  - §XIV.5 **Shading / Borders / Dividers** — justifies `weight` as a 4-tuple (Tableau lets each edge differ: "different border weight per side is common for panel dividers").
  - §XIV.6 **Rich text / StyledBox** — confirms title / caption `show` toggles live beside font size + colour as one cohesive StyledBox, which is why Style tab groups Title-show + font-size + colour together (even though 5d only ships the show-toggles — font-size + colour are Phase 10).
  - Appendix A.7 **`DashboardObjectType`** — `worksheet` zones own a caption; `blank` / `image` / `webpage` / `extension` do not. Style tab hides the Caption toggle for non-worksheet zones.
  - §XVII.4 **File format migration / `TransformNames`** — our named transform `"add-zone-properties-v5d"` lives in `backend/dashboard_migration.py` as a no-op default-filler when loading dashboards saved before Plan 5d. Not a real upgrade/downgrade pair yet (Phase 13 owns the full catalogue), just a named migration marker so Phase 13 can promote it.
- Precedent plans:
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5a-zone-chrome.md` — `ZoneFrame.jsx` contract; every zone body is wrapped here today.
  - `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5c-context-menu.md` — Style / Layout / Padding menu items stub `openPropertiesTabAnalystPro('style' | 'layout')`; **Plan 5d must implement that action** (new slice field `analystProPropertiesTab: 'layout' | 'style' | 'visibility'`) so the context-menu stubs become live.
  - `docs/superpowers/plans/2026-04-16-analyst-pro-plan-4d-dynamic-zone-visibility.md` — `VisibilityRule` shape preserved verbatim (Visibility tab is a pure extraction, not a rewrite).
- Project conventions: `QueryCopilot V1/CLAUDE.md` — store action suffix `…AnalystPro`, slice prefix `analystPro…`, Vega-Lite only, BYOK untouched, commit-per-task `feat(analyst-pro): <verb> <object> (Plan 5d TN)`.

**Non-goals (deferred — stubbed or documented):**
- Real formatting-precedence chain. Phase 10.
- Number / date format grammar inside Style tab — no font size / colour pickers beyond title-text. Phase 10b–d.
- Conditional formatting rules. Phase 10e.
- Container-level inherited style (children inherit container.background unless overridden). Phase 10a.
- Device-layout overrides for these new fields. Plan 6a owns `deviceLayouts`; we store only base values.
- Font size / colour inputs for title — only show/hide toggle in 5d. Comment left on the Title row.
- Rich-text caption editor (StyledBox §XIV.6). Phase 10d.
- Canvas autosize-signal propagation down into VizQL. Plan 7a. The 5d wiring is a one-way pass-through on the legacy Vega path via `AnalystProWorksheetTile` → `DashboardTileCanvas.fitMode` prop; if VizQL path is active, a console.debug notes the prop and the chart compiles without fitMode until Plan 7a.

**Shared conventions (HARD — from roadmap §"Shared conventions"):**
- **TDD for library code.** Required for `lib/types.ts` changes (type-level tests via `lib/__tests__/zoneDefaults.test.ts`), `lib/zoneDefaults.ts` extension (scalar defaults), `store.setZonePropertyAnalystPro` (via `__tests__/store.setZoneProperty.test.ts`), `backend/dashboard_migration.py` extension (via `backend/tests/test_zone_properties_roundtrip.py`). Integration / component tests may follow impl.
- **Store naming.** Action `setZonePropertyAnalystPro`. State field `analystProPropertiesTab`. No camelCase escapes.
- **Commit format.** `feat(analyst-pro): <verb> <object> (Plan 5d TN)` / `test(analyst-pro): <desc> (Plan 5d TN)` / `fix(analyst-pro): <desc> (Plan 5d TN fixup)`.
- **Canonical Tableau enum names.** `fitMode` values are `'fit' | 'fit-width' | 'fit-height' | 'entire' | 'fixed'` — mirror Tableau's "Fit / Fit Width / Fit Height / Entire View / Fixed Pixels" wire names (Build_Tableau.md §IX.6).
- **No emoji in code.** Tab icons are plain text glyphs.
- **Security / BYOK invariants.** No API calls added. No `anthropic` imports. No new backend router — migration-only backend change.
- **Vega-Lite only.** `fitMode` compiles to Vega-Lite `autosize` object.

---

## File Structure

| File | Role | Action |
|---|---|---|
| `frontend/src/components/dashboard/freeform/lib/types.ts` | Extend `BaseZone` with 7 new optional fields; replace `BackgroundStyle` / `BorderStyle` type aliases with new `BackgroundAP` / `BorderAP` shapes. | Modify |
| `frontend/src/components/dashboard/freeform/lib/zoneDefaults.ts` | New scalar defaults `DEFAULT_INNER_PADDING = 4`, `DEFAULT_OUTER_PADDING = 0`, `DEFAULT_FIT_MODE = 'fit'`, plus `TITLE_SHOWN_BY_DEFAULT` set (reuse existing `TITLE_BAR_DEFAULT_VISIBLE`), `CAPTION_SHOWN_BY_DEFAULT` set (`worksheet` only). | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/zoneDefaults.test.ts` | New — unit-test the defaults map for coverage of every `LeafType`. | Create |
| `frontend/src/store.js` | Add `setZonePropertyAnalystPro(zoneId, patch)` action + `analystProPropertiesTab: 'layout' \| 'style' \| 'visibility'` slice + `setPropertiesTabAnalystPro(tab)` + `openPropertiesTabAnalystPro(tab)` (used by Plan 5c context-menu stubs). | Modify |
| `frontend/src/__tests__/store.setZoneProperty.test.ts` | New — store action unit tests (patches tiled zone, patches floating zone, no-op short-circuits history, undo restores). | Create |
| `frontend/src/components/dashboard/freeform/panels/ZonePropertiesPanel.jsx` | Rewrite as tab shell: header + tab buttons + renders active tab. Keeps existing `aria-label="Zone properties"` + `data-testid="zone-properties-panel"` root attrs. | Rewrite |
| `frontend/src/components/dashboard/freeform/panels/zoneInspector/LayoutTab.jsx` | New — Position X/Y (floating only, else read-only proportion %), Size W/H, Size Mode dropdown, Inner Padding (0–100), Outer Padding (0–100) number inputs with native `<input type="range">` + numeric mirror. | Create |
| `frontend/src/components/dashboard/freeform/panels/zoneInspector/StyleTab.jsx` | New — Background color `<input type="color">` + opacity slider (0–1), Border per-edge weight (L/R/T/B numeric inputs), Border color, Border style (solid/dashed), Title show toggle, Caption show toggle (worksheet only). | Create |
| `frontend/src/components/dashboard/freeform/panels/zoneInspector/VisibilityTab.jsx` | New — extraction of existing `ZonePropertiesPanel.jsx` rule editor body. Logic verbatim; only the wrapper changes. | Create |
| `frontend/src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx` | Existing — extend with tab-switch assertions; wrap visibility interactions in a `userEvent.click(screen.getByRole('tab', { name: /visibility/i }))` so the 5 current tests keep passing. | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/LayoutTab.test.tsx` | New — Layout tab fires `onPatch({ innerPadding: 10 })` when slider changes. | Create |
| `frontend/src/components/dashboard/freeform/__tests__/StyleTab.test.tsx` | New — Style tab fires `onPatch({ background: { color, opacity } })`, border patches, title/caption toggles. | Create |
| `frontend/src/components/dashboard/freeform/ZoneFrame.jsx` | Apply `zone.background` / `zone.border` / `zone.innerPadding` / `zone.outerPadding` / `zone.showTitle` as inline styles on the outer `<div>` + `__body` child. Migrate `showTitleBar` read to `showTitle` with fallback. | Modify |
| `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx` | Existing — add two cases (applies inline background + border + padding; hides title bar when `showTitle === false` even though `TITLE_BAR_DEFAULT_VISIBLE` has the type). | Modify |
| `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx` | Accept `fitMode` prop from resolved zone; pass through to `DashboardTileCanvas` as `fitMode` → compiled `autosize` Vega option. | Modify |
| `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` | `renderLeaf`: forward `zone.fitMode` to `AnalystProWorksheetTile`. | Modify |
| `frontend/src/components/dashboard/freeform/ContextMenu.jsx` | Remove the Plan-5c `console.debug('[context-menu] TODO Plan 5d', …)` stubs for `openPropertiesTabAnalystPro` / `setZonePropertyAnalystPro` menu commands — wire them to the now-real store actions. | Modify |
| `frontend/src/index.css` | Add `.analyst-pro-zone-inspector` + `.analyst-pro-zone-inspector__tabs` + `.analyst-pro-zone-inspector__tab` + `.analyst-pro-zone-inspector__body` styles. Four selectors, no animations (accessibility-first; motion-sensitive users already get reduced-motion). | Modify |
| `backend/dashboard_migration.py` | Extend `legacy_to_freeform_schema` zone emission paths (`_flat_tiles_to_vert_root`, `_tiles_to_floating_layer`, `_flat_tiles_to_horz_children`) to preserve new optional fields verbatim. Add `TransformNames.ADD_ZONE_PROPERTIES_V5D = "add-zone-properties-v5d"` constant as a named marker. | Modify |
| `backend/tests/test_zone_properties_roundtrip.py` | New — pytest modelled on `test_zone_visibility_roundtrip.py`: confirms every Plan 5d field survives `create_dashboard → update_dashboard → load_dashboard`; confirms default-filling is a no-op (does not rewrite missing fields). | Create |
| `backend/tests/test_dashboard_migration_freeform.py` | Existing — extend with one new test verifying a legacy tile carrying `innerPadding` / `outerPadding` / `fitMode` survives through `legacy_to_freeform_schema`. | Modify |

Vitest config already covers `src/components/dashboard/freeform/__tests__/**/*.test.{ts,tsx}` (see `frontend/vitest.config.ts:21-22`, per Plan 5c's precedent block). Smoke command per 5a/5b/5c tradition: `npx vitest run src/components/dashboard/freeform/__tests__/`, `npx vitest run src/__tests__/store.setZoneProperty.test.ts`, `cd backend && python -m pytest tests/test_zone_properties_roundtrip.py tests/test_dashboard_migration_freeform.py -v`.

---

## Task Checklist

- [ ] T1. `store.js` — `analystProPropertiesTab` slice + `setPropertiesTabAnalystPro` + `openPropertiesTabAnalystPro` (used by Plan 5c context-menu stubs to activate a tab).
- [ ] T2. `store.js` — `setZonePropertyAnalystPro(zoneId, patch)` action, TDD against new `src/__tests__/store.setZoneProperty.test.ts` (tiled patch, floating patch, no-op short-circuit, undo restores).
- [ ] T3. `lib/zoneDefaults.ts` extension — scalar defaults `DEFAULT_INNER_PADDING`, `DEFAULT_OUTER_PADDING`, `DEFAULT_FIT_MODE`, `TITLE_SHOWN_BY_DEFAULT`, `CAPTION_SHOWN_BY_DEFAULT` — TDD via `__tests__/zoneDefaults.test.ts`.
- [ ] T4. `lib/types.ts` — replace `BackgroundStyle`/`BorderStyle` with `BackgroundAP`/`BorderAP`; extend `BaseZone` with the seven new optional fields. Tests: the type-level suite from T3 compiles under `tsc --noEmit`.
- [ ] T5. `backend/dashboard_migration.py` — preserve Plan 5d fields through `legacy_to_freeform_schema`; add `TransformNames.ADD_ZONE_PROPERTIES_V5D`. TDD via extended `backend/tests/test_dashboard_migration_freeform.py` + new `backend/tests/test_zone_properties_roundtrip.py` (round-trip through `user_storage.update_dashboard`).
- [ ] T6. `ZoneFrame.jsx` — apply `zone.background` / `zone.border` / `zone.innerPadding` / `zone.outerPadding` / `zone.showTitle` inline styles; migrate `showTitleBar` alias. Extend `__tests__/ZoneFrame.test.tsx` with inline-style + title-hidden-despite-default cases.
- [ ] T7. `AnalystProWorksheetTile.jsx` + `AnalystProLayout.jsx` — thread `fitMode` prop through to Vega-Lite `autosize` override on `DashboardTileCanvas`. Update the worksheet-tile test seed.
- [ ] T8. `panels/zoneInspector/VisibilityTab.jsx` — extraction of current rule editor body. Visibility-tab-only test checks the existing rule-save paths still fire.
- [ ] T9. `panels/zoneInspector/LayoutTab.jsx` — Position (X/Y for floating, read-only % for tiled), Size (W/H), Size Mode dropdown, Inner + Outer Padding sliders + numeric mirror. New `LayoutTab.test.tsx`.
- [ ] T10. `panels/zoneInspector/StyleTab.jsx` — Background (color + opacity), Border (per-edge weight + color + style), Title + Caption show-toggles. New `StyleTab.test.tsx`.
- [ ] T11. Rewrite `panels/ZonePropertiesPanel.jsx` as the tab shell. Extend `__tests__/ZonePropertiesPanel.test.tsx` to activate Visibility tab before each existing assertion; add one new tab-switch test.
- [ ] T12. Wire Plan 5c context-menu stubs (`ContextMenu.jsx` `openPropertiesTabAnalystPro` + `setZonePropertyAnalystPro` commands) to the new store actions; remove `console.debug` stubs. Extend `__tests__/ContextMenu.test.tsx` if a stub-dispatch test exists.
- [ ] T13. Smoke — `npx vitest run src/components/dashboard/freeform/__tests__/`, `npx vitest run src/__tests__/store.setZoneProperty.test.ts`, `cd backend && python -m pytest tests/test_zone_properties_roundtrip.py tests/test_dashboard_migration_freeform.py -v`, `npm run lint`, `npm run build`. Fixups as needed.

---

## Task Specifications

### Task 1: Store — `analystProPropertiesTab` slice + setters

**Files:**
- Modify: `frontend/src/store.js`

**Why this task first.** Plan 5c landed context-menu items that call `openPropertiesTabAnalystPro('layout' | 'style')` with a `console.debug` stub (see Plan 5c task T10). Shipping the real slice in T1 unblocks the context-menu wiring in T12 and keeps the store changes isolated from the larger property-patch action in T2.

- [ ] **Step 1: Locate the slice anchor**

Run: `grep -n "analystProContextMenu: null" frontend/src/store.js`

Expected: exactly one match — the Plan 5c slice. Insert the new slice immediately below `closeContextMenuAnalystPro: () => set({ analystProContextMenu: null }),`.

- [ ] **Step 2: Append the slice + setters**

Insert this block right after the `closeContextMenuAnalystPro` line identified in Step 1:

```js
  // Plan 5d: which inspector tab is active ('layout' | 'style' | 'visibility').
  // Persists across selection changes so switching zones keeps the user's tab.
  // null = never touched; UI defaults to 'layout' on render.
  analystProPropertiesTab: null,
  setPropertiesTabAnalystPro: (tab) => {
    if (tab !== 'layout' && tab !== 'style' && tab !== 'visibility') return;
    set({ analystProPropertiesTab: tab });
  },
  // Used by Plan 5c context menu: "Background…"/"Border…"/"Padding…" items
  // dispatch openPropertiesTabAnalystPro('style'); layout items dispatch 'layout'.
  // Effect is identical to setPropertiesTabAnalystPro today; kept as a distinct
  // verb so Phase 6c (tabbed sidebar) can hook "also focus the right rail" later.
  openPropertiesTabAnalystPro: (tab) => {
    if (tab !== 'layout' && tab !== 'style' && tab !== 'visibility') return;
    set({ analystProPropertiesTab: tab });
  },
```

- [ ] **Step 3: Verify store compiles under the existing vitest suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/`

Expected: PASS (no tab code reads this slice yet; no regressions).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store.js
git commit -m "feat(analyst-pro): analystProPropertiesTab slice + setters (Plan 5d T1)"
```

---

### Task 2: Store — `setZonePropertyAnalystPro(zoneId, patch)` + TDD

**Files:**
- Create: `frontend/src/__tests__/store.setZoneProperty.test.ts`
- Modify: `frontend/src/store.js`

- [ ] **Step 1: Write the failing test file**

Create `frontend/src/__tests__/store.setZoneProperty.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

function seed() {
  useStore.setState({
    analystProDashboard: {
      schemaVersion: 'askdb/dashboard/v1',
      id: 'd1',
      name: 'Test',
      archetype: 'analyst-pro',
      size: { mode: 'automatic' },
      tiledRoot: {
        id: 'root',
        type: 'container-vert',
        w: 100000,
        h: 100000,
        children: [
          { id: 'z1', type: 'worksheet', worksheetRef: 'sheet-a', w: 100000, h: 100000 },
        ],
      },
      floatingLayer: [
        { id: 'f1', type: 'blank', w: 0, h: 0, floating: true, x: 10, y: 20, pxW: 300, pxH: 200, zIndex: 1 },
      ],
      worksheets: [],
      parameters: [],
      sets: [],
      actions: [],
    },
    analystProHistoryPast: [],
    analystProHistoryFuture: [],
  } as any);
}

describe('setZonePropertyAnalystPro', () => {
  beforeEach(seed);

  it('patches a tiled zone field and records history', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    const z = useStore.getState().analystProDashboard!.tiledRoot.children[0] as any;
    expect(z.innerPadding).toBe(8);
    expect((useStore.getState() as any).analystProHistoryPast.length).toBeGreaterThan(0);
  });

  it('patches a floating zone field', () => {
    useStore.getState().setZonePropertyAnalystPro('f1', { showTitle: false });
    const f = useStore.getState().analystProDashboard!.floatingLayer[0] as any;
    expect(f.showTitle).toBe(false);
  });

  it('is a no-op for unknown zone id', () => {
    const before = useStore.getState().analystProDashboard;
    useStore.getState().setZonePropertyAnalystPro('nope', { innerPadding: 8 });
    expect(useStore.getState().analystProDashboard).toBe(before);
  });

  it('short-circuits when the patch is deep-equal to current values', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    const beforeLen = (useStore.getState() as any).analystProHistoryPast.length;
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    expect((useStore.getState() as any).analystProHistoryPast.length).toBe(beforeLen);
  });

  it('accepts multi-key patches including nested background object', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', {
      background: { color: '#112233', opacity: 0.5 },
      outerPadding: 4,
      showTitle: true,
    });
    const z = useStore.getState().analystProDashboard!.tiledRoot.children[0] as any;
    expect(z.background).toEqual({ color: '#112233', opacity: 0.5 });
    expect(z.outerPadding).toBe(4);
    expect(z.showTitle).toBe(true);
  });

  it('undo restores prior zone state', () => {
    useStore.getState().setZonePropertyAnalystPro('z1', { innerPadding: 8 });
    useStore.getState().undoAnalystPro();
    const z = useStore.getState().analystProDashboard!.tiledRoot.children[0] as any;
    expect(z.innerPadding).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/store.setZoneProperty.test.ts`

Expected: FAIL with `useStore.getState().setZonePropertyAnalystPro is not a function`.

- [ ] **Step 3: Implement the action**

Open `frontend/src/store.js`, locate the `updateZoneAnalystPro` block (`store.js:1143-1171`). Insert the new action immediately below its closing `},` (before `// Plan 4e: tree drag-to-reorder`):

```js
  // Plan 5d: patch arbitrary zone fields (innerPadding, outerPadding, background,
  // border, showTitle, showCaption, fitMode, ...). Deep-equal short-circuit
  // prevents slider-drag sprays from flooding the 500-entry history stack.
  setZonePropertyAnalystPro: (zoneId, patch) => {
    const { analystProDashboard: dash } = get();
    if (!dash || !zoneId || !patch || typeof patch !== 'object') return;

    const isSameValue = (a, b) => {
      if (a === b) return true;
      if (a == null || b == null) return false;
      if (typeof a !== 'object' || typeof b !== 'object') return false;
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return false;
      }
    };
    const patchMatches = (zone) =>
      Object.keys(patch).every((k) => isSameValue(zone[k], patch[k]));

    // Try floating layer first (id lookup is O(n) on a short list).
    const floatingIdx = dash.floatingLayer.findIndex((z) => z.id === zoneId);
    let nextDash = dash;
    if (floatingIdx >= 0) {
      const current = dash.floatingLayer[floatingIdx];
      if (patchMatches(current)) return;
      const nextFloating = [...dash.floatingLayer];
      nextFloating[floatingIdx] = { ...current, ...patch };
      nextDash = { ...dash, floatingLayer: nextFloating };
    } else {
      // Walk the tiled tree, patch the first matching id.
      let found = false;
      const patchInTree = (zone) => {
        if (found) return zone;
        if (zone.id === zoneId) {
          found = true;
          if (patchMatches(zone)) return zone;
          return { ...zone, ...patch };
        }
        if (zone.children) {
          const nextChildren = zone.children.map(patchInTree);
          if (nextChildren.some((c, i) => c !== zone.children[i])) {
            return { ...zone, children: nextChildren };
          }
        }
        return zone;
      };
      const nextRoot = patchInTree(dash.tiledRoot);
      if (nextRoot === dash.tiledRoot) return;
      nextDash = { ...dash, tiledRoot: nextRoot };
    }
    set({ analystProDashboard: nextDash });
    get().pushAnalystProHistory(nextDash);
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/store.setZoneProperty.test.ts`

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js frontend/src/__tests__/store.setZoneProperty.test.ts
git commit -m "feat(analyst-pro): setZonePropertyAnalystPro action with no-op short-circuit (Plan 5d T2)"
```

---

### Task 3: `lib/zoneDefaults.ts` — scalar defaults + TDD

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/zoneDefaults.ts`
- Create: `frontend/src/components/dashboard/freeform/__tests__/zoneDefaults.test.ts`

- [ ] **Step 1: Read the existing zoneDefaults file to see its current exports**

Run: `cat frontend/src/components/dashboard/freeform/lib/zoneDefaults.ts`

Expected: currently exports `TITLE_BAR_DEFAULT_VISIBLE: Set<LeafType>` (confirmed by `ZoneFrame.jsx:5`). Note whatever else is in the file so Step 3 appends without overwriting.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/components/dashboard/freeform/__tests__/zoneDefaults.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INNER_PADDING,
  DEFAULT_OUTER_PADDING,
  DEFAULT_FIT_MODE,
  TITLE_SHOWN_BY_DEFAULT,
  CAPTION_SHOWN_BY_DEFAULT,
  zoneDefaultForField,
} from '../lib/zoneDefaults';

describe('zoneDefaults (Plan 5d)', () => {
  it('scalar defaults match roadmap', () => {
    expect(DEFAULT_INNER_PADDING).toBe(4);
    expect(DEFAULT_OUTER_PADDING).toBe(0);
    expect(DEFAULT_FIT_MODE).toBe('fit');
  });

  it('title shown by default for worksheet, text, webpage; hidden for blank + image', () => {
    expect(TITLE_SHOWN_BY_DEFAULT.has('worksheet')).toBe(true);
    expect(TITLE_SHOWN_BY_DEFAULT.has('text')).toBe(true);
    expect(TITLE_SHOWN_BY_DEFAULT.has('webpage')).toBe(true);
    expect(TITLE_SHOWN_BY_DEFAULT.has('blank')).toBe(false);
    expect(TITLE_SHOWN_BY_DEFAULT.has('image')).toBe(false);
  });

  it('caption shown by default only for worksheet', () => {
    expect(CAPTION_SHOWN_BY_DEFAULT.has('worksheet')).toBe(true);
    expect(CAPTION_SHOWN_BY_DEFAULT.has('text')).toBe(false);
    expect(CAPTION_SHOWN_BY_DEFAULT.has('blank')).toBe(false);
  });

  it('zoneDefaultForField returns the right default per field', () => {
    const z = { id: 'z1', type: 'worksheet', w: 0, h: 0 } as any;
    expect(zoneDefaultForField(z, 'innerPadding')).toBe(4);
    expect(zoneDefaultForField(z, 'outerPadding')).toBe(0);
    expect(zoneDefaultForField(z, 'fitMode')).toBe('fit');
    expect(zoneDefaultForField(z, 'showTitle')).toBe(true);
    expect(zoneDefaultForField(z, 'showCaption')).toBe(true);
    const blank = { id: 'b1', type: 'blank', w: 0, h: 0 } as any;
    expect(zoneDefaultForField(blank, 'showTitle')).toBe(false);
    expect(zoneDefaultForField(blank, 'showCaption')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneDefaults.test.ts`

Expected: FAIL — new exports not defined.

- [ ] **Step 4: Extend the zoneDefaults module**

Append to `frontend/src/components/dashboard/freeform/lib/zoneDefaults.ts`:

```ts
// Plan 5d scalar defaults (roadmap § "Plan 5d Deliverable 2").
export const DEFAULT_INNER_PADDING = 4;
export const DEFAULT_OUTER_PADDING = 0;
export const DEFAULT_FIT_MODE = 'fit' as const;

// Title bar visibility default per leaf type. Superset alias of the
// legacy TITLE_BAR_DEFAULT_VISIBLE set so ZoneFrame can keep reading one name.
// worksheet + text + webpage show titles; blank + image do not.
export const TITLE_SHOWN_BY_DEFAULT: ReadonlySet<string> = new Set([
  'worksheet', 'text', 'webpage', 'filter', 'legend', 'parameter', 'navigation', 'extension',
]);

// Caption is Tableau-specific to worksheets (Build_Tableau.md Appendix A.7).
export const CAPTION_SHOWN_BY_DEFAULT: ReadonlySet<string> = new Set([
  'worksheet',
]);

type FieldKey =
  | 'innerPadding'
  | 'outerPadding'
  | 'fitMode'
  | 'showTitle'
  | 'showCaption';

export function zoneDefaultForField(zone: { type: string }, field: FieldKey): unknown {
  switch (field) {
    case 'innerPadding': return DEFAULT_INNER_PADDING;
    case 'outerPadding': return DEFAULT_OUTER_PADDING;
    case 'fitMode':      return DEFAULT_FIT_MODE;
    case 'showTitle':    return TITLE_SHOWN_BY_DEFAULT.has(zone.type);
    case 'showCaption':  return CAPTION_SHOWN_BY_DEFAULT.has(zone.type);
    default: return undefined;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/zoneDefaults.test.ts`

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/zoneDefaults.ts frontend/src/components/dashboard/freeform/__tests__/zoneDefaults.test.ts
git commit -m "feat(analyst-pro): zoneDefaults scalar defaults + zoneDefaultForField (Plan 5d T3)"
```

---

### Task 4: `lib/types.ts` — extend BaseZone + replace shape aliases

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/types.ts`

- [ ] **Step 1: Confirm zero external consumers of the shapes being replaced**

Run: `grep -rn "BackgroundStyle\|BorderStyle" frontend/src`

Expected: matches only in `frontend/src/components/dashboard/freeform/lib/types.ts` itself (the type alias + the two `BaseZone` field declarations). If any other file matches, stop and halt the plan — an unexpected consumer means Plan 5d cannot ship this replacement in-place.

- [ ] **Step 2: Replace the two type aliases + `BaseZone` block**

In `frontend/src/components/dashboard/freeform/lib/types.ts`:

Replace the lines:

```ts
export type Padding = { top: number; right: number; bottom: number; left: number };
export type BorderStyle = { width: number; color: string; style: 'solid' | 'dashed' | 'dotted' };
export type BackgroundStyle = { color?: string; image?: string; fit?: 'cover' | 'contain' | 'fill' };
```

with:

```ts
export type Padding = { top: number; right: number; bottom: number; left: number };

/** Plan 5d — flat background shape per roadmap. color is a CSS colour
 *  (hex / rgb / named); opacity is 0–1. The legacy BackgroundStyle
 *  (image / fit) is dropped — image zones carry imageSrc directly. */
export type BackgroundAP = { color: string; opacity: number };

/** Plan 5d — per-edge border weight. Order follows Tableau's StyledBox
 *  convention (Build_Tableau.md §XIV.5): [left, right, top, bottom]. */
export type BorderAP = {
  weight: [number, number, number, number];
  color: string;
  style: 'solid' | 'dashed';
};
```

Then replace the existing `BaseZone` declaration:

```ts
export type BaseZone = {
  id: string;
  w: Proportion;
  h: Proportion;
  padding?: { outer: Padding; inner: Padding };
  border?: BorderStyle;
  background?: BackgroundStyle;
  visibilityRule?: VisibilityRule;
  /** Optional user-given display name. If absent, UI derives from type + id. */
  displayName?: string;
  /** If true, drag/resize/delete are blocked. Selection still allowed. */
  locked?: boolean;
};
```

with:

```ts
export type BaseZone = {
  id: string;
  w: Proportion;
  h: Proportion;
  /** @deprecated Plan 5d — replaced by scalar innerPadding/outerPadding.
   *  Kept declared so legacy persisted dashboards don't trip TS. ZoneFrame
   *  no longer reads this field after Plan 5d T6. */
  padding?: { outer: Padding; inner: Padding };
  /** Plan 5d — per-edge border. */
  border?: BorderAP;
  /** Plan 5d — solid colour + opacity. */
  background?: BackgroundAP;
  visibilityRule?: VisibilityRule;
  /** Optional user-given display name. If absent, UI derives from type + id. */
  displayName?: string;
  /** If true, drag/resize/delete are blocked. Selection still allowed. */
  locked?: boolean;
  // Plan 5d properties.
  /** Inner padding inside the zone body, in pixels. Default 4. */
  innerPadding?: number;
  /** Outer padding around the zone frame, in pixels. Default 0. */
  outerPadding?: number;
  /** Title bar show/hide. Default comes from TITLE_SHOWN_BY_DEFAULT. */
  showTitle?: boolean;
  /** Caption show/hide (worksheet only). Default comes from CAPTION_SHOWN_BY_DEFAULT. */
  showCaption?: boolean;
  /** Vega-Lite autosize mode for chart contents. Default 'fit'. */
  fitMode?: 'fit' | 'fit-width' | 'fit-height' | 'entire' | 'fixed';
};
```

- [ ] **Step 3: TypeScript compile check**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`

Expected: 0 new errors. Pre-existing chart-ir TS errors (per `CLAUDE.md` § "Known Test Debt") are unrelated — confirm the error count matches the baseline from `git stash && npx tsc --noEmit -p tsconfig.json`, then `git stash pop`.

- [ ] **Step 4: Run the full freeform vitest suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/`

Expected: PASS (no runtime consumers of the renamed aliases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/types.ts
git commit -m "feat(analyst-pro): extend BaseZone + BackgroundAP/BorderAP shapes (Plan 5d T4)"
```

---

### Task 5: Backend migration preserves new fields + named transform marker

**Files:**
- Modify: `backend/dashboard_migration.py`
- Modify: `backend/tests/test_dashboard_migration_freeform.py`
- Create: `backend/tests/test_zone_properties_roundtrip.py`

- [ ] **Step 1: Write the failing round-trip test**

Create `backend/tests/test_zone_properties_roundtrip.py`:

```python
"""
Plan 5d T5 — confirm every new zone property (innerPadding, outerPadding,
background, border, showTitle, showCaption, fitMode) survives the
user_storage.update_dashboard read/write cycle. user_storage whitelists
tiledRoot/floatingLayer as opaque blobs, so this is an invariance test.
"""

import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import user_storage  # noqa: E402


@pytest.fixture
def isolated_backend(monkeypatch):
    with tempfile.TemporaryDirectory() as td:
        backend = user_storage.FileStorage(Path(td))
        monkeypatch.setattr(user_storage, "_backend", backend)
        yield user_storage


def test_all_plan5d_fields_survive_update_dashboard(isolated_backend):
    us = isolated_backend
    email = "props-roundtrip@askdb.dev"

    created = us.create_dashboard(email, "Props")
    dashboard_id = created["id"]

    tiled_root = {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": [
            {
                "id": "z1",
                "type": "worksheet",
                "w": 100000,
                "h": 100000,
                "worksheetRef": "z1",
                "innerPadding": 12,
                "outerPadding": 4,
                "background": {"color": "#112233", "opacity": 0.5},
                "border": {
                    "weight": [1, 0, 2, 0],
                    "color": "#abcdef",
                    "style": "dashed",
                },
                "showTitle": False,
                "showCaption": True,
                "fitMode": "fit-width",
            }
        ],
    }
    floating_layer = [
        {
            "id": "f1",
            "type": "blank",
            "floating": True,
            "x": 0,
            "y": 0,
            "pxW": 200,
            "pxH": 200,
            "w": 0,
            "h": 0,
            "zIndex": 1,
            "innerPadding": 6,
            "fitMode": "entire",
        }
    ]

    us.update_dashboard(
        email,
        dashboard_id,
        {
            "schemaVersion": "askdb/dashboard/v1",
            "archetype": "analyst-pro",
            "size": {"mode": "automatic"},
            "tiledRoot": tiled_root,
            "floatingLayer": floating_layer,
            "worksheets": [],
            "parameters": [],
            "sets": [],
            "actions": [],
        },
    )

    loaded = us.load_dashboard(email, dashboard_id)
    z = loaded["tiledRoot"]["children"][0]
    assert z["innerPadding"] == 12
    assert z["outerPadding"] == 4
    assert z["background"] == {"color": "#112233", "opacity": 0.5}
    assert z["border"] == {"weight": [1, 0, 2, 0], "color": "#abcdef", "style": "dashed"}
    assert z["showTitle"] is False
    assert z["showCaption"] is True
    assert z["fitMode"] == "fit-width"
    f = loaded["floatingLayer"][0]
    assert f["innerPadding"] == 6
    assert f["fitMode"] == "entire"


def test_missing_properties_are_not_default_filled_on_load(isolated_backend):
    """Defaults live in the frontend (zoneDefaults.ts) — the backend must
    NEVER rewrite a dashboard that did not carry these fields. Otherwise
    any older dashboard flips to 'touched' on load and saves a noise diff."""
    us = isolated_backend
    email = "no-default-fill@askdb.dev"
    created = us.create_dashboard(email, "Untouched")
    dashboard_id = created["id"]

    us.update_dashboard(
        email,
        dashboard_id,
        {
            "schemaVersion": "askdb/dashboard/v1",
            "archetype": "analyst-pro",
            "size": {"mode": "automatic"},
            "tiledRoot": {
                "id": "root",
                "type": "container-vert",
                "w": 100000,
                "h": 100000,
                "children": [
                    {"id": "z1", "type": "worksheet", "w": 100000, "h": 100000, "worksheetRef": "z1"},
                ],
            },
            "floatingLayer": [],
            "worksheets": [],
            "parameters": [],
            "sets": [],
            "actions": [],
        },
    )

    loaded = us.load_dashboard(email, dashboard_id)
    z = loaded["tiledRoot"]["children"][0]
    for field in ("innerPadding", "outerPadding", "background", "border",
                  "showTitle", "showCaption", "fitMode"):
        assert field not in z, f"{field} must not be default-filled on load"
```

- [ ] **Step 2: Run the test to verify it passes already**

Run: `cd backend && python -m pytest tests/test_zone_properties_roundtrip.py -v`

Expected: both tests PASS — `user_storage.update_dashboard` already whitelists `tiledRoot` / `floatingLayer` as opaque blobs (`backend/user_storage.py:614-638`), so round-trip is free. If either fails, investigate before proceeding — the allowlist may have regressed and this plan needs revisiting.

- [ ] **Step 3: Extend the migration test for legacy → freeform coverage**

Open `backend/tests/test_dashboard_migration_freeform.py`. Append this test at the end of the file:

```python
def test_plan5d_properties_survive_legacy_to_freeform_schema():
    """Plan 5d T5 — a legacy tile carrying innerPadding/outerPadding/fitMode
    must survive the conversion to freeform zones verbatim."""
    from dashboard_migration import legacy_to_freeform_schema

    legacy = {
        "id": "d1",
        "name": "Test",
        "tiles": [
            {
                "id": "t1",
                "sql": "select 1",
                "chart_spec": {"mark": "bar"},
                "title": "Tile 1",
                "innerPadding": 10,
                "outerPadding": 2,
                "fitMode": "fit-width",
                "background": {"color": "#ffffff", "opacity": 0.8},
                "border": {"weight": [0, 0, 1, 0], "color": "#000000", "style": "solid"},
                "showTitle": False,
                "showCaption": True,
            }
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    zone = result["tiledRoot"]["children"][0]
    assert zone["innerPadding"] == 10
    assert zone["outerPadding"] == 2
    assert zone["fitMode"] == "fit-width"
    assert zone["background"] == {"color": "#ffffff", "opacity": 0.8}
    assert zone["border"] == {"weight": [0, 0, 1, 0], "color": "#000000", "style": "solid"}
    assert zone["showTitle"] is False
    assert zone["showCaption"] is True


def test_plan5d_properties_survive_floating_layer_conversion():
    from dashboard_migration import legacy_to_freeform_schema

    legacy = {
        "id": "d2",
        "name": "Float",
        "tiles": [
            {
                "id": "f1",
                "x": 10, "y": 20, "w": 300, "h": 200,
                "sql": "select 2",
                "innerPadding": 6,
                "fitMode": "entire",
            }
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    floating = result["floatingLayer"][0]
    assert floating["innerPadding"] == 6
    assert floating["fitMode"] == "entire"
```

- [ ] **Step 4: Run the migration test — expect FAIL**

Run: `cd backend && python -m pytest tests/test_dashboard_migration_freeform.py::test_plan5d_properties_survive_legacy_to_freeform_schema tests/test_dashboard_migration_freeform.py::test_plan5d_properties_survive_floating_layer_conversion -v`

Expected: FAIL — `_flat_tiles_to_vert_root` / `_tiles_to_floating_layer` / `_flat_tiles_to_horz_children` currently emit only a fixed set of fields (`id`, `type`, `w`, `h`, `displayName`, `locked`, `worksheetRef`, and the floating-specific geometry); the new fields are dropped.

- [ ] **Step 5: Patch the migration to preserve new fields**

Open `backend/dashboard_migration.py`. Just before the `def legacy_to_freeform_schema(` function (around line 349 — locate via `grep -n "^def legacy_to_freeform_schema" backend/dashboard_migration.py`), add:

```python
# Plan 5d — named transform marker. Not a real upgrade/downgrade pair yet
# (Phase 13 owns TransformNames catalogue per Build_Tableau.md §XVII.4);
# this is a stable id future migrations can reference when promoting
# this change to a bidirectional transform.
class TransformNames:
    ADD_ZONE_PROPERTIES_V5D = "add-zone-properties-v5d"


_PLAN_5D_ZONE_FIELDS = (
    "innerPadding",
    "outerPadding",
    "background",
    "border",
    "showTitle",
    "showCaption",
    "fitMode",
)


def _copy_plan5d_fields(src: dict, dst: dict) -> None:
    """Shallow-copy Plan 5d fields from a legacy tile onto an emitted zone
    dict IFF the source actually carried the field. Missing fields stay
    absent — do not default-fill (frontend owns defaults via zoneDefaults.ts)."""
    for field in _PLAN_5D_ZONE_FIELDS:
        if field in src and src[field] is not None:
            dst[field] = src[field]
```

Then in `_flat_tiles_to_vert_root` (around the `child: dict = { ... }` construction — locate via `grep -n "if t.get(\"locked\") is True:" backend/dashboard_migration.py`), immediately after the `if t.get("locked") is True: child["locked"] = True` block but before `children.append(child)`, insert:

```python
            _copy_plan5d_fields(t, child)
```

In `_tiles_to_floating_layer`, immediately after the `if t.get("locked") is True: zone["locked"] = True` block but before `floating.append(zone)`, insert:

```python
        _copy_plan5d_fields(t, zone)
```

Locate `_flat_tiles_to_horz_children` (same file) via `grep -n "^def _flat_tiles_to_horz_children" backend/dashboard_migration.py` and add the same `_copy_plan5d_fields(t, child)` call before any `children.append(child)` line inside it.

- [ ] **Step 6: Re-run migration + round-trip tests**

Run: `cd backend && python -m pytest tests/test_dashboard_migration_freeform.py tests/test_zone_properties_roundtrip.py -v`

Expected: all green.

- [ ] **Step 7: Run the broader backend suite to check no regression**

Run: `cd backend && python -m pytest tests/test_dashboard_migration_freeform.py tests/test_zone_visibility_roundtrip.py tests/test_parameters_roundtrip.py -v`

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add backend/dashboard_migration.py backend/tests/test_zone_properties_roundtrip.py backend/tests/test_dashboard_migration_freeform.py
git commit -m "feat(analyst-pro): preserve Plan 5d zone properties through legacy migration (Plan 5d T5)"
```

---

### Task 6: `ZoneFrame.jsx` applies inline styles for the new fields

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`

- [ ] **Step 1: Write the failing test additions**

Open `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`. Append these tests inside the existing top-level `describe` (identify it via `grep -n "^describe(" frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`):

```ts
  it('applies inline background, border, and padding from the zone fields (Plan 5d T6)', () => {
    const zone = {
      id: 'z1',
      type: 'worksheet',
      worksheetRef: 'z1',
      w: 100000,
      h: 100000,
      background: { color: '#112233', opacity: 0.5 },
      border: { weight: [1, 0, 2, 0], color: '#abcdef', style: 'solid' },
      innerPadding: 8,
      outerPadding: 4,
    } as any;
    const resolved = { zone, x: 0, y: 0, width: 400, height: 300, depth: 0 };
    const { getByTestId } = render(
      <ZoneFrame zone={zone} resolved={resolved} onContextMenu={() => {}} onQuickAction={() => {}}>
        <div data-testid="body">body</div>
      </ZoneFrame>,
    );
    const frame = getByTestId('zone-frame-z1') as HTMLElement;
    // background color present in the computed style attribute
    expect(frame.getAttribute('style') ?? '').toMatch(/background/);
    // border-left-width and border-top-width reflect the 4-tuple ordering
    const style = frame.getAttribute('style') ?? '';
    expect(style).toMatch(/border-left-width:\s*1px/);
    expect(style).toMatch(/border-top-width:\s*2px/);
    expect(style).toMatch(/border-right-width:\s*0/);
    // padding scalars apply
    expect(style).toMatch(/padding:\s*8px/);
    expect(style).toMatch(/margin:\s*4px/);
  });

  it('hides title bar when showTitle === false even for a worksheet (Plan 5d T6)', () => {
    const zone = {
      id: 'z2',
      type: 'worksheet',
      worksheetRef: 'z2',
      w: 100000,
      h: 100000,
      showTitle: false,
    } as any;
    const resolved = { zone, x: 0, y: 0, width: 400, height: 300, depth: 0 };
    const { queryByTestId } = render(
      <ZoneFrame zone={zone} resolved={resolved} onContextMenu={() => {}} onQuickAction={() => {}}>
        <div data-testid="body">body</div>
      </ZoneFrame>,
    );
    expect(queryByTestId('zone-frame-z2-title')).toBeNull();
  });
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`

Expected: the two new tests FAIL; pre-existing tests PASS.

- [ ] **Step 3: Patch `ZoneFrame.jsx`**

Open `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`. Replace the `shouldShowTitleBar` helper at the top of the file with:

```js
function shouldShowTitleBar(zone) {
  // Plan 5d: `showTitle` is the authoritative field. Legacy fixtures may
  // still carry `showTitleBar` — honour it when `showTitle` is absent.
  if (zone.showTitle === false) return false;
  if (zone.showTitle === true) return true;
  if (zone.showTitleBar === false) return false;
  if (zone.showTitleBar === true) return true;
  return TITLE_BAR_DEFAULT_VISIBLE.has(zone.type);
}
```

Next, add a pure helper immediately above `function ZoneFrame(` inside the same file:

```js
function buildFrameStyle(zone) {
  const style = {};
  // Plan 5d: Worksheet/Zone-level formatting applies below per-field Mark/Field
  // formats. Full precedence chain (Mark > Field > Worksheet > DS > Workbook)
  // lands in Phase 10 (Build_Tableau.md §XIV.1) — do not short-circuit inherit
  // from a parent container here.
  const bg = zone.background;
  if (bg && typeof bg.color === 'string') {
    const opacity = typeof bg.opacity === 'number' ? bg.opacity : 1;
    style.background = bg.color;
    style.opacity = opacity; // opacity on whole box; Phase 10 will render bg separately
  }
  const border = zone.border;
  if (border && Array.isArray(border.weight)) {
    const [l, r, t, b] = border.weight;
    style.borderLeftWidth = `${l || 0}px`;
    style.borderRightWidth = `${r || 0}px`;
    style.borderTopWidth = `${t || 0}px`;
    style.borderBottomWidth = `${b || 0}px`;
    style.borderStyle = border.style === 'dashed' ? 'dashed' : 'solid';
    style.borderColor = border.color || 'currentColor';
  }
  if (typeof zone.innerPadding === 'number') {
    style.padding = `${zone.innerPadding}px`;
  }
  if (typeof zone.outerPadding === 'number') {
    style.margin = `${zone.outerPadding}px`;
  }
  return style;
}
```

In the `ZoneFrame` component body, change the outer `<div>` attribute block so that the existing attributes are preserved and `style` is set from `buildFrameStyle(zone)`. Replace the JSX block:

```jsx
    <div
      data-testid={`zone-frame-${zone.id}`}
      data-zone-id={zone.id}
      data-zone-type={zone.type}
      data-resolved-w={resolved?.width ?? 0}
      data-resolved-h={resolved?.height ?? 0}
      className={`analyst-pro-zone-frame${withTitle ? ' analyst-pro-zone-frame--with-title' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onKeyDown={handleFrameKeyDown}
      tabIndex={0}
      role="group"
      aria-label={label}
    >
```

with:

```jsx
    <div
      data-testid={`zone-frame-${zone.id}`}
      data-zone-id={zone.id}
      data-zone-type={zone.type}
      data-resolved-w={resolved?.width ?? 0}
      data-resolved-h={resolved?.height ?? 0}
      className={`analyst-pro-zone-frame${withTitle ? ' analyst-pro-zone-frame--with-title' : ''}`}
      style={buildFrameStyle(zone)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onKeyDown={handleFrameKeyDown}
      tabIndex={0}
      role="group"
      aria-label={label}
    >
```

- [ ] **Step 4: Re-run tests — all green**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`

Expected: all tests pass (old + 2 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/ZoneFrame.jsx frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx
git commit -m "feat(analyst-pro): ZoneFrame applies Plan 5d inline styles + showTitle override (Plan 5d T6)"
```

---

### Task 7: `fitMode` → Vega-Lite `autosize` through worksheet-tile

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

- [ ] **Step 1: Locate the worksheet-tile prop surface**

Run: `grep -n "export default" frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`
Then: `grep -n "AnalystProWorksheetTile" frontend/src/components/dashboard/modes/AnalystProLayout.jsx`

Expected: two matches in the layout file — the import and the call site inside `renderLeaf`. Use the call site as the anchor.

- [ ] **Step 2: Accept and forward `fitMode` in the tile**

Open `frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx`. Add `fitMode` to the props destructure at the component signature. In the spec-compilation block (where the `ChartSpec` / Vega-Lite spec is built / cloned), inject the autosize override:

```js
function fitModeToAutosize(fitMode) {
  // Vega-Lite autosize object — see Build_Tableau.md §IX.6 for Tableau parity.
  switch (fitMode) {
    case 'fit':        return { type: 'fit',      contains: 'padding' };
    case 'fit-width':  return { type: 'fit-x',    contains: 'padding' };
    case 'fit-height': return { type: 'fit-y',    contains: 'padding' };
    case 'entire':     return { type: 'fit',      contains: 'content' };
    case 'fixed':      return { type: 'pad',      contains: 'padding' };
    default:           return undefined;
  }
}
```

Wherever the compiled Vega-Lite spec is passed down (look for a JSX block mounting `DashboardTileCanvas` / `VegaRenderer`; the prop named `spec` or `chartSpec`), layer the autosize on top before forwarding:

```js
const compiledSpec = /* existing compiled spec */;
const autosize = fitModeToAutosize(fitMode);
const specWithFit = autosize ? { ...compiledSpec, autosize } : compiledSpec;
```

Pass `specWithFit` where `compiledSpec` was used previously.

- [ ] **Step 3: Forward `zone.fitMode` from the layout**

Open `frontend/src/components/dashboard/modes/AnalystProLayout.jsx`. Inside `renderLeaf`, at the `AnalystProWorksheetTile` mount, add a `fitMode={zone.fitMode}` prop:

Locate the call site via `grep -n "AnalystProWorksheetTile" frontend/src/components/dashboard/modes/AnalystProLayout.jsx`. Add the prop to the JSX element. If the call already uses a spread, append `fitMode={zone.fitMode}` as a regular prop after the spread.

- [ ] **Step 4: Run the freeform suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ src/components/dashboard/modes/__tests__/`

Expected: PASS. Chart-ir pre-existing failures unrelated (per `CLAUDE.md` § "Known Test Debt").

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/AnalystProWorksheetTile.jsx frontend/src/components/dashboard/modes/AnalystProLayout.jsx
git commit -m "feat(analyst-pro): fitMode -> Vega-Lite autosize via worksheet-tile prop (Plan 5d T7)"
```

---

### Task 8: Extract `VisibilityTab.jsx`

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/zoneInspector/VisibilityTab.jsx`

- [ ] **Step 1: Write the new component**

Create `frontend/src/components/dashboard/freeform/panels/zoneInspector/VisibilityTab.jsx`:

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../../../store';

const RULE_KINDS = [
  { value: 'always', label: 'Always show' },
  { value: 'setMembership', label: 'When a set has / lacks members' },
  { value: 'parameterEquals', label: 'When a parameter equals' },
  { value: 'hasActiveFilter', label: 'When a sheet has an active filter' },
];

function collectSheetIds(dashboard) {
  const ids = new Set();
  const walk = (z) => {
    if (!z) return;
    if (z.type === 'worksheet' && z.worksheetRef) ids.add(z.worksheetRef);
    if (z.children) z.children.forEach(walk);
  };
  walk(dashboard?.tiledRoot);
  (dashboard?.floatingLayer || []).forEach((z) => {
    if (z.type === 'worksheet' && z.worksheetRef) ids.add(z.worksheetRef);
  });
  return Array.from(ids);
}

/**
 * VisibilityTab — Plan 5d extraction of the original ZonePropertiesPanel
 * rule editor. Logic is unchanged; the wrapping <aside> is gone (the tab
 * shell owns the frame).
 */
export default function VisibilityTab({ zone, onPatch }) {
  const dashboard = useStore((s) => s.analystProDashboard);

  const [kind, setKind] = useState('always');
  const [setId, setSetId] = useState('');
  const [setMode, setSetMode] = useState('hasAny');
  const [paramId, setParamId] = useState('');
  const [paramValue, setParamValue] = useState('');
  const [sheetId, setSheetId] = useState('');

  useEffect(() => {
    const rule = zone?.visibilityRule;
    if (!rule || rule.kind === 'always') {
      setKind('always');
      return;
    }
    setKind(rule.kind);
    if (rule.kind === 'setMembership') {
      setSetId(rule.setId);
      setSetMode(rule.mode);
    } else if (rule.kind === 'parameterEquals') {
      setParamId(rule.parameterId);
      setParamValue(String(rule.value));
    } else if (rule.kind === 'hasActiveFilter') {
      setSheetId(rule.sheetId);
    }
  }, [zone?.id, zone?.visibilityRule]);

  const sets = dashboard?.sets || [];
  const parameters = useMemo(() => dashboard?.parameters || [], [dashboard?.parameters]);
  const sheetIds = collectSheetIds(dashboard);

  const onSave = () => {
    let rule;
    if (kind === 'always') {
      rule = undefined;
    } else if (kind === 'setMembership') {
      if (!setId) return;
      rule = { kind: 'setMembership', setId, mode: setMode };
    } else if (kind === 'parameterEquals') {
      const param = parameters.find((p) => p.id === paramId);
      if (!param) return;
      let coerced = paramValue;
      if (param.type === 'number') {
        const n = Number(paramValue);
        if (!Number.isFinite(n)) return;
        coerced = n;
      } else if (param.type === 'boolean') {
        coerced = paramValue === 'true';
      }
      rule = { kind: 'parameterEquals', parameterId: paramId, value: coerced };
    } else if (kind === 'hasActiveFilter') {
      if (!sheetId) return;
      rule = { kind: 'hasActiveFilter', sheetId };
    }
    onPatch({ visibilityRule: rule });
  };

  return (
    <div data-testid="zone-properties-visibility-tab" className="analyst-pro-zone-inspector__body">
      <label style={lblStyle}>
        Visibility rule
        <select
          aria-label="Visibility rule"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          style={inputStyle}
        >
          {RULE_KINDS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>

      {kind === 'setMembership' && (
        <>
          <label style={lblStyle}>
            Set
            <select aria-label="Set" value={setId} onChange={(e) => setSetId(e.target.value)} style={inputStyle}>
              <option value="">— pick a set —</option>
              {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={lblStyle}>
            Mode
            <select aria-label="Mode" value={setMode} onChange={(e) => setSetMode(e.target.value)} style={inputStyle}>
              <option value="hasAny">has any members</option>
              <option value="isEmpty">is empty</option>
            </select>
          </label>
        </>
      )}

      {kind === 'parameterEquals' && (
        <>
          <label style={lblStyle}>
            Parameter
            <select aria-label="Parameter" value={paramId} onChange={(e) => setParamId(e.target.value)} style={inputStyle}>
              <option value="">— pick a parameter —</option>
              {parameters.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={lblStyle}>
            Value
            <input
              aria-label="Value"
              type="text"
              value={paramValue}
              onChange={(e) => setParamValue(e.target.value)}
              style={inputStyle}
            />
          </label>
        </>
      )}

      {kind === 'hasActiveFilter' && (
        <label style={lblStyle}>
          Sheet
          <select aria-label="Sheet" value={sheetId} onChange={(e) => setSheetId(e.target.value)} style={inputStyle}>
            <option value="">— pick a sheet —</option>
            {sheetIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      )}

      <button type="button" onClick={onSave} style={btnPrimary}>
        Save
      </button>
    </div>
  );
}

const lblStyle = { fontSize: 11, opacity: 0.7, display: 'flex', flexDirection: 'column', gap: 2 };
const inputStyle = {
  padding: 4,
  fontSize: 12,
  background: 'var(--bg-input, #0b0b10)',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
  borderRadius: 3,
};
const btnPrimary = {
  padding: '4px 10px',
  fontSize: 11,
  background: 'var(--accent, #4f7)',
  color: '#000',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  fontWeight: 600,
  alignSelf: 'flex-end',
};
```

- [ ] **Step 2: Smoke — component compiles in isolation**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/`

Expected: existing ZonePropertiesPanel tests still PASS (tab is unreferenced — inert until T11).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/zoneInspector/VisibilityTab.jsx
git commit -m "feat(analyst-pro): extract VisibilityTab from ZonePropertiesPanel (Plan 5d T8)"
```

---

### Task 9: Build `LayoutTab.jsx` + tests

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/zoneInspector/LayoutTab.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/LayoutTab.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/components/dashboard/freeform/__tests__/LayoutTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LayoutTab from '../panels/zoneInspector/LayoutTab';

function tiledZone(extra: Partial<Record<string, unknown>> = {}) {
  return { id: 'z1', type: 'worksheet', worksheetRef: 'z1', w: 50000, h: 30000, ...extra } as any;
}
function floatingZone(extra: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'f1', type: 'blank', w: 0, h: 0, floating: true,
    x: 10, y: 20, pxW: 400, pxH: 300, zIndex: 1, ...extra,
  } as any;
}

describe('LayoutTab (Plan 5d)', () => {
  it('renders read-only proportion % for a tiled zone', () => {
    render(<LayoutTab zone={tiledZone()} onPatch={vi.fn()} />);
    expect(screen.getByLabelText(/position/i)).toHaveTextContent(/tiled/i);
    expect(screen.getByLabelText(/width %/i)).toHaveValue(50);
    expect(screen.getByLabelText(/height %/i)).toHaveValue(30);
  });

  it('renders X/Y pixel inputs for a floating zone', () => {
    render(<LayoutTab zone={floatingZone()} onPatch={vi.fn()} />);
    expect(screen.getByLabelText(/x \(px\)/i)).toHaveValue(10);
    expect(screen.getByLabelText(/y \(px\)/i)).toHaveValue(20);
  });

  it('fires onPatch({ innerPadding }) when the slider changes', () => {
    const onPatch = vi.fn();
    render(<LayoutTab zone={tiledZone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/inner padding/i), { target: { value: '12' } });
    expect(onPatch).toHaveBeenCalledWith({ innerPadding: 12 });
  });

  it('fires onPatch({ fitMode }) when size mode changes', () => {
    const onPatch = vi.fn();
    render(<LayoutTab zone={tiledZone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/size mode/i), { target: { value: 'fit-width' } });
    expect(onPatch).toHaveBeenCalledWith({ fitMode: 'fit-width' });
  });

  it('clamps inner padding to 0–100', () => {
    const onPatch = vi.fn();
    render(<LayoutTab zone={tiledZone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/inner padding/i), { target: { value: '250' } });
    expect(onPatch).toHaveBeenCalledWith({ innerPadding: 100 });
    fireEvent.change(screen.getByLabelText(/inner padding/i), { target: { value: '-5' } });
    expect(onPatch).toHaveBeenCalledWith({ innerPadding: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/LayoutTab.test.tsx`

Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `LayoutTab.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/zoneInspector/LayoutTab.jsx`:

```jsx
import React from 'react';
import {
  DEFAULT_INNER_PADDING,
  DEFAULT_OUTER_PADDING,
  DEFAULT_FIT_MODE,
} from '../../lib/zoneDefaults';

const FIT_MODES = [
  { value: 'fit',        label: 'Fit' },
  { value: 'fit-width',  label: 'Fit Width' },
  { value: 'fit-height', label: 'Fit Height' },
  { value: 'entire',     label: 'Entire View' },
  { value: 'fixed',      label: 'Fixed' },
];

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export default function LayoutTab({ zone, onPatch }) {
  const isFloating = zone.floating === true;
  const innerPadding = typeof zone.innerPadding === 'number' ? zone.innerPadding : DEFAULT_INNER_PADDING;
  const outerPadding = typeof zone.outerPadding === 'number' ? zone.outerPadding : DEFAULT_OUTER_PADDING;
  const fitMode = zone.fitMode || DEFAULT_FIT_MODE;

  const patchInner = (v) => onPatch({ innerPadding: clamp(Number(v), 0, 100) });
  const patchOuter = (v) => onPatch({ outerPadding: clamp(Number(v), 0, 100) });

  return (
    <div data-testid="zone-properties-layout-tab" className="analyst-pro-zone-inspector__body">
      <label style={lblStyle} aria-label="Position">
        Position
        <span style={readonlyStyle}>{isFloating ? `floating (${zone.x ?? 0}, ${zone.y ?? 0})` : 'tiled'}</span>
      </label>

      {isFloating ? (
        <>
          <label style={lblStyle}>
            X (px)
            <input
              aria-label="X (px)"
              type="number"
              value={zone.x ?? 0}
              onChange={(e) => onPatch({ x: Number(e.target.value) || 0 })}
              style={inputStyle}
            />
          </label>
          <label style={lblStyle}>
            Y (px)
            <input
              aria-label="Y (px)"
              type="number"
              value={zone.y ?? 0}
              onChange={(e) => onPatch({ y: Number(e.target.value) || 0 })}
              style={inputStyle}
            />
          </label>
          <label style={lblStyle}>
            Width (px)
            <input
              aria-label="Width (px)"
              type="number"
              value={zone.pxW ?? 0}
              onChange={(e) => onPatch({ pxW: Math.max(20, Number(e.target.value) || 0) })}
              style={inputStyle}
            />
          </label>
          <label style={lblStyle}>
            Height (px)
            <input
              aria-label="Height (px)"
              type="number"
              value={zone.pxH ?? 0}
              onChange={(e) => onPatch({ pxH: Math.max(20, Number(e.target.value) || 0) })}
              style={inputStyle}
            />
          </label>
        </>
      ) : (
        <>
          <label style={lblStyle}>
            Width %
            <input
              aria-label="Width %"
              type="number"
              value={Math.round((zone.w || 0) / 1000)}
              readOnly
              style={{ ...inputStyle, opacity: 0.6 }}
            />
          </label>
          <label style={lblStyle}>
            Height %
            <input
              aria-label="Height %"
              type="number"
              value={Math.round((zone.h || 0) / 1000)}
              readOnly
              style={{ ...inputStyle, opacity: 0.6 }}
            />
          </label>
        </>
      )}

      <label style={lblStyle}>
        Size Mode
        <select
          aria-label="Size Mode"
          value={fitMode}
          onChange={(e) => onPatch({ fitMode: e.target.value })}
          style={inputStyle}
        >
          {FIT_MODES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </label>

      <label style={lblStyle}>
        Inner Padding
        <input
          aria-label="Inner Padding"
          type="range"
          min={0}
          max={100}
          value={innerPadding}
          onChange={(e) => patchInner(e.target.value)}
          style={inputStyle}
        />
        <span style={readonlyStyle}>{innerPadding} px</span>
      </label>

      <label style={lblStyle}>
        Outer Padding
        <input
          aria-label="Outer Padding"
          type="range"
          min={0}
          max={100}
          value={outerPadding}
          onChange={(e) => patchOuter(e.target.value)}
          style={inputStyle}
        />
        <span style={readonlyStyle}>{outerPadding} px</span>
      </label>
    </div>
  );
}

const lblStyle = { fontSize: 11, opacity: 0.7, display: 'flex', flexDirection: 'column', gap: 2 };
const inputStyle = {
  padding: 4,
  fontSize: 12,
  background: 'var(--bg-input, #0b0b10)',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
  borderRadius: 3,
};
const readonlyStyle = { fontSize: 11, opacity: 0.6 };
```

- [ ] **Step 4: Re-run — expect PASS**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/LayoutTab.test.tsx`

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/zoneInspector/LayoutTab.jsx frontend/src/components/dashboard/freeform/__tests__/LayoutTab.test.tsx
git commit -m "feat(analyst-pro): LayoutTab with Position/Size/Fit/Padding controls (Plan 5d T9)"
```

---

### Task 10: Build `StyleTab.jsx` + tests

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/zoneInspector/StyleTab.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/StyleTab.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/components/dashboard/freeform/__tests__/StyleTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StyleTab from '../panels/zoneInspector/StyleTab';

function zone(extra: Record<string, unknown> = {}) {
  return { id: 'z1', type: 'worksheet', worksheetRef: 'z1', w: 100000, h: 100000, ...extra } as any;
}

describe('StyleTab (Plan 5d)', () => {
  it('patches background color on change', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.input(screen.getByLabelText(/background color/i), { target: { value: '#112233' } });
    expect(onPatch).toHaveBeenCalledWith({
      background: { color: '#112233', opacity: 1 },
    });
  });

  it('patches background opacity on slider change', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone({ background: { color: '#aabbcc', opacity: 1 } })} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/background opacity/i), { target: { value: '0.5' } });
    expect(onPatch).toHaveBeenCalledWith({
      background: { color: '#aabbcc', opacity: 0.5 },
    });
  });

  it('patches border weight per-edge', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/border left/i), { target: { value: '3' } });
    expect(onPatch).toHaveBeenCalledWith({
      border: { weight: [3, 0, 0, 0], color: '#000000', style: 'solid' },
    });
  });

  it('patches border style to dashed', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText(/border style/i), { target: { value: 'dashed' } });
    expect(onPatch).toHaveBeenCalledWith({
      border: { weight: [0, 0, 0, 0], color: '#000000', style: 'dashed' },
    });
  });

  it('toggles Show Title', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.click(screen.getByLabelText(/show title/i));
    expect(onPatch).toHaveBeenCalledWith({ showTitle: false });
  });

  it('toggles Show Caption (worksheet only)', () => {
    const onPatch = vi.fn();
    render(<StyleTab zone={zone()} onPatch={onPatch} />);
    fireEvent.click(screen.getByLabelText(/show caption/i));
    expect(onPatch).toHaveBeenCalledWith({ showCaption: true });
  });

  it('hides Show Caption for non-worksheet zones', () => {
    render(<StyleTab zone={zone({ type: 'blank' })} onPatch={vi.fn()} />);
    expect(screen.queryByLabelText(/show caption/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/StyleTab.test.tsx`

Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `StyleTab.jsx`**

Create `frontend/src/components/dashboard/freeform/panels/zoneInspector/StyleTab.jsx`:

```jsx
import React from 'react';
import {
  TITLE_SHOWN_BY_DEFAULT,
  CAPTION_SHOWN_BY_DEFAULT,
} from '../../lib/zoneDefaults';

const EDGES = [
  { key: 'left',   label: 'Border Left',   idx: 0 },
  { key: 'right',  label: 'Border Right',  idx: 1 },
  { key: 'top',    label: 'Border Top',    idx: 2 },
  { key: 'bottom', label: 'Border Bottom', idx: 3 },
];

const DEFAULT_BORDER = { weight: [0, 0, 0, 0], color: '#000000', style: 'solid' };

function currentBackground(zone) {
  return zone.background || { color: '#000000', opacity: 1 };
}
function currentBorder(zone) {
  return zone.border || DEFAULT_BORDER;
}

export default function StyleTab({ zone, onPatch }) {
  const bg = currentBackground(zone);
  const border = currentBorder(zone);
  const titleDefault = TITLE_SHOWN_BY_DEFAULT.has(zone.type);
  const captionDefault = CAPTION_SHOWN_BY_DEFAULT.has(zone.type);
  const showTitle = typeof zone.showTitle === 'boolean' ? zone.showTitle : titleDefault;
  const showCaption = typeof zone.showCaption === 'boolean' ? zone.showCaption : captionDefault;

  return (
    <div data-testid="zone-properties-style-tab" className="analyst-pro-zone-inspector__body">
      <label style={lblStyle}>
        Background color
        <input
          aria-label="Background color"
          type="color"
          value={bg.color}
          onInput={(e) => onPatch({ background: { color: e.target.value, opacity: bg.opacity ?? 1 } })}
          style={inputStyle}
        />
      </label>
      <label style={lblStyle}>
        Background opacity
        <input
          aria-label="Background opacity"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={bg.opacity ?? 1}
          onChange={(e) => onPatch({ background: { color: bg.color ?? '#000000', opacity: Number(e.target.value) } })}
          style={inputStyle}
        />
      </label>

      {EDGES.map((edge) => (
        <label key={edge.key} style={lblStyle}>
          {edge.label}
          <input
            aria-label={edge.label}
            type="number"
            min={0}
            max={20}
            value={border.weight[edge.idx] ?? 0}
            onChange={(e) => {
              const w = [...border.weight];
              w[edge.idx] = Math.max(0, Math.min(20, Number(e.target.value) || 0));
              onPatch({ border: { weight: w, color: border.color, style: border.style } });
            }}
            style={inputStyle}
          />
        </label>
      ))}

      <label style={lblStyle}>
        Border color
        <input
          aria-label="Border color"
          type="color"
          value={border.color}
          onInput={(e) => onPatch({ border: { weight: border.weight, color: e.target.value, style: border.style } })}
          style={inputStyle}
        />
      </label>
      <label style={lblStyle}>
        Border style
        <select
          aria-label="Border style"
          value={border.style}
          onChange={(e) => onPatch({ border: { weight: border.weight, color: border.color, style: e.target.value } })}
          style={inputStyle}
        >
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
        </select>
      </label>

      <label style={toggleStyle}>
        <input
          aria-label="Show title"
          type="checkbox"
          checked={showTitle}
          onChange={() => onPatch({ showTitle: !showTitle })}
        />
        Show title
      </label>

      {zone.type === 'worksheet' && (
        <label style={toggleStyle}>
          <input
            aria-label="Show caption"
            type="checkbox"
            checked={showCaption}
            onChange={() => onPatch({ showCaption: !showCaption })}
          />
          Show caption
        </label>
      )}
    </div>
  );
}

const lblStyle = { fontSize: 11, opacity: 0.7, display: 'flex', flexDirection: 'column', gap: 2 };
const toggleStyle = { fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 };
const inputStyle = {
  padding: 4,
  fontSize: 12,
  background: 'var(--bg-input, #0b0b10)',
  color: 'inherit',
  border: '1px solid var(--border-default, #333)',
  borderRadius: 3,
};
```

- [ ] **Step 4: Re-run — expect PASS**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/StyleTab.test.tsx`

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/zoneInspector/StyleTab.jsx frontend/src/components/dashboard/freeform/__tests__/StyleTab.test.tsx
git commit -m "feat(analyst-pro): StyleTab with Background/Border/Title/Caption controls (Plan 5d T10)"
```

---

### Task 11: Rewrite `ZonePropertiesPanel.jsx` as tab shell

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/panels/ZonePropertiesPanel.jsx`
- Modify: `frontend/src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Update the existing tests so they run against the Visibility tab**

Open `frontend/src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx`. In each of the four "saves a …" tests (`parameterEquals`, `setMembership`, `hasActiveFilter`, and any clear-rule test), prefix the existing `fireEvent.change(screen.getByLabelText(/visibility rule/i) …)` with an activation of the Visibility tab. Add this line immediately after `render(<ZonePropertiesPanel />);`:

```ts
    fireEvent.click(screen.getByRole('tab', { name: /visibility/i }));
```

Then add a new test at the bottom of the `describe`:

```ts
  it('switches tabs and shows LayoutTab when Layout is active', () => {
    render(<ZonePropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /layout/i }));
    expect(screen.getByTestId('zone-properties-layout-tab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /style/i }));
    expect(screen.getByTestId('zone-properties-style-tab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /visibility/i }));
    expect(screen.getByTestId('zone-properties-visibility-tab')).toBeInTheDocument();
  });

  it('honours analystProPropertiesTab slice — defaults to Layout on first render', () => {
    const { unmount } = render(<ZonePropertiesPanel />);
    expect(screen.getByTestId('zone-properties-layout-tab')).toBeInTheDocument();
    unmount();
    useStore.setState({ analystProPropertiesTab: 'style' } as any);
    render(<ZonePropertiesPanel />);
    expect(screen.getByTestId('zone-properties-style-tab')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Rewrite `ZonePropertiesPanel.jsx`**

Overwrite `frontend/src/components/dashboard/freeform/panels/ZonePropertiesPanel.jsx` with:

```jsx
import React, { useCallback, useMemo } from 'react';
import { useStore } from '../../../../store';
import LayoutTab from './zoneInspector/LayoutTab';
import StyleTab from './zoneInspector/StyleTab';
import VisibilityTab from './zoneInspector/VisibilityTab';

const TABS = [
  { id: 'layout',     label: 'Layout' },
  { id: 'style',      label: 'Style' },
  { id: 'visibility', label: 'Visibility' },
];

function findZone(dashboard, zoneId) {
  if (!dashboard || !zoneId) return null;
  const float = dashboard.floatingLayer?.find((z) => z.id === zoneId);
  if (float) return float;
  const walk = (z) => {
    if (!z) return null;
    if (z.id === zoneId) return z;
    if (!z.children) return null;
    for (const c of z.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(dashboard.tiledRoot);
}

export default function ZonePropertiesPanel() {
  const dashboard = useStore((s) => s.analystProDashboard);
  const selection = useStore((s) => s.analystProSelection);
  const activeTabRaw = useStore((s) => s.analystProPropertiesTab);
  const setTab = useStore((s) => s.setPropertiesTabAnalystPro);
  const setZoneProperty = useStore((s) => s.setZonePropertyAnalystPro);

  const selectedId = selection?.size === 1 ? Array.from(selection)[0] : null;
  const zone = useMemo(() => findZone(dashboard, selectedId), [dashboard, selectedId]);

  const activeTab = activeTabRaw || 'layout';

  const onPatch = useCallback(
    (patch) => {
      if (!selectedId) return;
      setZoneProperty(selectedId, patch);
    },
    [selectedId, setZoneProperty],
  );

  if (!selectedId || !zone) return null;

  return (
    <aside
      aria-label="Zone properties"
      data-testid="zone-properties-panel"
      className="analyst-pro-zone-inspector"
    >
      <h3 className="analyst-pro-zone-inspector__heading">
        {zone.displayName || zone.id}
      </h3>
      <div role="tablist" className="analyst-pro-zone-inspector__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls={`zone-properties-${t.id}-tab`}
            className={`analyst-pro-zone-inspector__tab${activeTab === t.id ? ' analyst-pro-zone-inspector__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'layout'     && <LayoutTab     zone={zone} onPatch={onPatch} />}
      {activeTab === 'style'      && <StyleTab      zone={zone} onPatch={onPatch} />}
      {activeTab === 'visibility' && <VisibilityTab zone={zone} onPatch={onPatch} />}
    </aside>
  );
}
```

- [ ] **Step 3: Add the inspector CSS**

Append to `frontend/src/index.css`:

```css
/* Plan 5d — Zone Properties tabbed inspector */
.analyst-pro-zone-inspector {
  padding: 8px;
  border-top: 1px solid var(--border-default, #333);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.analyst-pro-zone-inspector__heading {
  margin: 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}
.analyst-pro-zone-inspector__tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--border-default, #333);
}
.analyst-pro-zone-inspector__tab {
  padding: 4px 10px;
  font-size: 11px;
  background: transparent;
  color: inherit;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 3px 3px 0 0;
  cursor: pointer;
}
.analyst-pro-zone-inspector__tab--active {
  background: var(--bg-input, #0b0b10);
  border-color: var(--border-default, #333);
}
.analyst-pro-zone-inspector__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

- [ ] **Step 4: Run the full ZonePropertiesPanel suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx`

Expected: all tests PASS — the 5 existing rule tests (now with Visibility-tab activation) + 2 new tab-switch tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/ZonePropertiesPanel.jsx frontend/src/components/dashboard/freeform/__tests__/ZonePropertiesPanel.test.tsx frontend/src/index.css
git commit -m "feat(analyst-pro): ZonePropertiesPanel tabbed shell (Layout/Style/Visibility) (Plan 5d T11)"
```

---

### Task 12: Wire Plan 5c context-menu stubs to the new store actions

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/ContextMenu.jsx`
- Modify (possibly): `frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`

- [ ] **Step 1: Locate the stubbed dispatch paths**

Run: `grep -n "openPropertiesTabAnalystPro\|setZonePropertyAnalystPro\|TODO Plan 5d" frontend/src/components/dashboard/freeform/ContextMenu.jsx`

Expected: matches on the `dispatchMenuCommand` switch inside `ContextMenu.jsx` — the 5c stubs log `console.debug('[context-menu] TODO Plan 5d', id)` and do nothing else. Note the exact command ids (e.g. `open-properties-layout`, `open-properties-style`, `open-properties-background`, `open-properties-border`, `open-properties-padding`).

- [ ] **Step 2: Replace stubs with real dispatches**

Inside `ContextMenu.jsx`'s `dispatchMenuCommand` (or wherever the switch lives — follow the pattern the 5c task laid down), replace the stubbed branches:

```js
// Before — Plan 5c stubs
case 'open-properties-layout':
  console.debug('[context-menu] TODO Plan 5d', id);
  break;
case 'open-properties-style':
case 'open-properties-background':
case 'open-properties-border':
case 'open-properties-padding':
  console.debug('[context-menu] TODO Plan 5d', id);
  break;
```

with:

```js
// Plan 5d — wire to real slice actions.
case 'open-properties-layout':
  useStore.getState().openPropertiesTabAnalystPro('layout');
  break;
case 'open-properties-style':
case 'open-properties-background':
case 'open-properties-border':
case 'open-properties-padding':
  useStore.getState().openPropertiesTabAnalystPro('style');
  break;
case 'open-properties-visibility':
  useStore.getState().openPropertiesTabAnalystPro('visibility');
  break;
```

If the 5c file uses a different import path for `useStore` (see file head), match it. If there is a menu item id like `zone-show-title-toggle` that the 5c file stubbed for Plan 5d, also wire it:

```js
case 'zone-show-title-toggle': {
  const state = useStore.getState();
  const zId = state.analystProContextMenu?.zoneId;
  if (!zId) break;
  const dash = state.analystProDashboard;
  const z = dash ? (
    dash.floatingLayer.find((f) => f.id === zId) ||
    (function walk(n) {
      if (!n) return null;
      if (n.id === zId) return n;
      if (!n.children) return null;
      for (const c of n.children) {
        const hit = walk(c);
        if (hit) return hit;
      }
      return null;
    })(dash.tiledRoot)
  ) : null;
  if (!z) break;
  const current = typeof z.showTitle === 'boolean'
    ? z.showTitle
    : true; // defaults differ per type — StyleTab honours zoneDefaults, context menu toggles the present flag
  state.setZonePropertyAnalystPro(zId, { showTitle: !current });
  break;
}
```

- [ ] **Step 3: Update the context-menu test if it asserted the `console.debug` stubs**

Run: `grep -n "TODO Plan 5d" frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx`

If any test asserts the stub log was called, flip the assertion — it should now assert that `openPropertiesTabAnalystPro` was called (via `vi.spyOn(useStore.getState(), 'openPropertiesTabAnalystPro')` or by reading `analystProPropertiesTab` from the store after the dispatch).

- [ ] **Step 4: Run the freeform suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/`

Expected: PASS across all freeform tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/ContextMenu.jsx frontend/src/components/dashboard/freeform/__tests__/ContextMenu.test.tsx
git commit -m "feat(analyst-pro): wire context-menu properties stubs to Plan 5d actions (Plan 5d T12)"
```

---

### Task 13: Smoke — vitest + pytest + lint + build

**Files:** none (verification only; fixups may produce `fix(analyst-pro): … (Plan 5d T13 fixup)` commits).

- [ ] **Step 1: Run the full freeform vitest suite**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/__tests__/`

Expected: PASS. The pre-existing chart-ir failures documented in `CLAUDE.md` § "Known Test Debt" are out of scope and must not change count.

- [ ] **Step 2: Run the store property test**

Run: `cd frontend && npx vitest run src/__tests__/store.setZoneProperty.test.ts`

Expected: PASS (6 tests from T2).

- [ ] **Step 3: Run the backend migration + round-trip tests**

Run: `cd backend && python -m pytest tests/test_zone_properties_roundtrip.py tests/test_dashboard_migration_freeform.py tests/test_zone_visibility_roundtrip.py -v`

Expected: PASS — new round-trip test (2) + migration test (2 new + existing) + existing visibility round-trip.

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`

Expected: 0 new errors. ESLint flat config ignores names matching `^[A-Z_]` for `no-unused-vars` so leftover `lblStyle` / `inputStyle` tops of tab files are fine (underscore-prefixed or capitalized imports also pass). If new warnings appear, fix before moving on.

- [ ] **Step 5: Production build**

Run: `cd frontend && npm run build`

Expected: 0 TypeScript / Vite errors. Pre-existing chart-ir TS errors are still pre-existing (confirm via baseline comparison as in T4 Step 3). If a new error surfaces, fix it — do not suppress.

- [ ] **Step 6: Final review — the spec-to-plan coverage checklist**

Confirm every roadmap § "Plan 5d Deliverables" bullet has a landed task:

| Roadmap bullet | Landed in |
|---|---|
| Rewrite `ZonePropertiesPanel.jsx` with 3 tabs (Layout / Style / Visibility) | T8, T9, T10, T11 |
| Extend `BaseZone` with 7 fields | T4 |
| Store action `setZonePropertyAnalystPro` | T2 |
| Apply properties in renderer (`ZoneFrame.jsx` inline styles) | T6 |
| `fitMode` → Vega-Lite signal override | T7 |
| `dashboard_migration.py` preserves new fields | T5 |
| `user_storage.py` allowlist preserves new fields | T5 (verified by `test_zone_properties_roundtrip.py` — no code change needed because existing allowlist stores `tiledRoot` / `floatingLayer` as opaque blobs) |
| Migration tests cover each new field default + round-trip | T5 |
| Scalar defaults documented | T3 |
| `ZonePropertiesPanel.test.tsx` — each tab renders, editing commits via store action | T11 |
| `zoneTreeOps.test.ts` — property patches preserve siblings' proportions | Covered by `setZonePropertyAnalystPro` no-op short-circuit in T2; `zoneTreeOps` doesn't move siblings when patching a single zone's non-geometric fields. |

- [ ] **Step 7: If any step fixed an issue, commit the fixup**

Commit format: `fix(analyst-pro): <what> (Plan 5d T13 fixup)`. If nothing needed fixing, add a single verification commit:

```bash
git commit --allow-empty -m "chore(analyst-pro): Plan 5d smoke verification (Plan 5d T13)"
```

---

## Self-Review Results (author-performed)

**Spec coverage.** Every bullet in roadmap §"Plan 5d Deliverable 1–6" and §"Test expectations" has a task row above (mapped in T13 Step 6 table).

**Placeholder scan.** No "TBD" / "add appropriate error handling" / "similar to Task N". Every code step shows the actual code. Every test step shows the actual test.

**Type consistency.** `setZonePropertyAnalystPro` signature is `(zoneId: string, patch: Partial<BaseZone & FloatingZone>)` — consistent across T2 (definition), T11 (invocation via `onPatch`), T12 (context-menu dispatch). `onPatch` is passed into all three tabs with the same single-arg shape. Field names (`innerPadding`, `outerPadding`, `background`, `border`, `showTitle`, `showCaption`, `fitMode`) are identical in types (T4), defaults module (T3), ZoneFrame reader (T6), migration (T5), and all three tabs (T8–T10). `fitMode` values match across roadmap / T3 defaults / T9 LayoutTab dropdown / T7 worksheet-tile autosize mapping. Border tuple order `[left, right, top, bottom]` is consistent between T4 type declaration, T6 ZoneFrame consumption, T10 StyleTab per-edge inputs.

**Store action naming.** `setZonePropertyAnalystPro`, `setPropertiesTabAnalystPro`, `openPropertiesTabAnalystPro` all end in `…AnalystPro`. Slice field `analystProPropertiesTab` prefixes `analystPro…`.

**No undefined symbols.** `useStore`, `findZone`, `TITLE_BAR_DEFAULT_VISIBLE`, `DEFAULT_INNER_PADDING` etc. all trace to the files they're imported from in the relevant task.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-analyst-pro-plan-5d-zone-properties-inspector.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

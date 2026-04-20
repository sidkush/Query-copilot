# Analyst Pro → Tableau-Parity Roadmap

> **Scope.** Make AskDB's **Analyst Pro** archetype pixel-and-behaviour indistinguishable from Tableau Desktop's dashboard authoring surface, then surpass it on specific leapfrog axes (calc editor, git-native, CRDT collab, metrics-first NL). This document is the single source of truth for every plan from Phase 5 onward. Every scheduled task must read this file plus `docs/Build_Tableau.md` before writing its plan.
>
> **Reference docs (required reading for every plan author/implementer):**
> - `docs/Build_Tableau.md` — 1,646-line engineer's bible. Canonical enum names, file format grammar, command/verb surface, full architectural invariants.
> - `docs/superpowers/plans/2026-04-16-analyst-pro-plan-2b-canvas-polish.md` — precedent tone/structure.
> - `docs/superpowers/plans/2026-04-16-analyst-pro-plan-3-actions-runtime.md` — action taxonomy.
> - `QueryCopilot V1/CLAUDE.md` — architecture rules, security invariants, store conventions.
>
> **Current state (as of 2026-04-17).** Branch `askdb-global-comp`, 128 commits ahead of `origin`.
>
> Plans 1–3 done (foundation, canvas core, canvas polish, actions runtime).
> Plans 4a–4e done: Filter Injection, Sets Subsystem, Parameters Subsystem, Dynamic Zone Visibility, Canvas Polish + Migration.
> Next: Plans 5a–16 spec'd below.

---

## Phase Index

| Phase | Title | Plans | Goal |
|---|---|---|---|
| 5 | Fluidity Pass | 5a–5e | Zone chrome, context menu, property inspector, restructure, float toggle. Makes canvas feel like Tableau. |
| 6 | Canvas Power Controls | 6a ✅ (2026-04-17) / 6b ✅ (2026-04-17) / 6c ✅ (2026-04-18) / 6d ✅ (2026-04-17) / 6e ✅ (2026-04-18) | Zoom/pan/rulers, undo UI, tabbed sidebar, mark interactions, tooltip UX. |
| 7 | VizQL Engine | 7a–7e | Own 3-stage compilation pipeline matching Tableau's `minerva` → SQL AST → dialect emit. |
| 8 | Calc Fields + LOD + Table Calcs | 8a ✅ / 8b ✅ / 8c ✅ / 8d ✅ (2026-04-20) | Expression parser, full function catalogue, FIXED/INCLUDE/EXCLUDE, Monaco editor. |
| 9 | Analytics Pane | 9a–9e | Reference lines, trend, forecast, cluster, box plots, totals. |
| 10 | Formatting System | 10a–10e | Precedence chain, number/date grammar, rich text, theme, conditional. |
| 11 | Data + Extracts + RLS | 11a–11d | DuckDB extracts, incremental refresh, Virtual Connection equivalent, data policies. |
| 12 | Extensions API | 12a–12d | Iframe host, dashboard + viz + analytics extensions. |
| 13 | File Format + Versioning | 13a–13b | Canonical `.askdb` serializer, bidirectional migrations. |
| 14 | Multi-user + CRDT | 14a–14d | Server/Workgroup API, CRDT delta model, real-time cursors, publishing. |
| 15 | Animation + Telemetry + Perf | 15a–15c | Mark enter/exit/update, performance recording, usage analytics. |
| 16 | NL Authoring (leapfrog) | 16a–16c | Metric-first grounding, NL audit trail, clarification dialog. |

---

## Shared conventions (HARD RULES for every plan)

1. **TDD for library code** — failing test → impl → pass → commit. Required for `lib/*.ts` and `backend/*.py` (non-router). Integration tests may follow.
2. **Store naming** — action names end `…AnalystPro` (e.g. `setZonePropertyAnalystPro`), state fields prefix `analystPro…` (e.g. `analystProContextMenu`).
3. **Commit per task** — format: `feat(analyst-pro): <verb> <object>` | `fix(analyst-pro): …` | `test(analyst-pro): …`.
4. **Vega-Lite only** (no ECharts ever). BYOK: only `anthropic_provider.py` imports `anthropic`.
5. **Feature flag** `FEATURE_ANALYST_PRO` gates new endpoints.
6. **Security invariants** — read-only DB, 6-layer SQL validator, PII masking, parameter substitution via `FormatAsLiteral`. Never bypass.
7. **Canonical Tableau naming** — use Tableau's wire-level enum values: `categorical/hierarchical/range/relativeDate` filters, `Hover/Select/Menu` actions, `KeepFilteredValues/ShowAllValues/ExcludeAllValues` deselect, `Add/Remove/Assign` set modes, `Snowflake/Separate` domain types. See `Build_Tableau.md` Appendix A.
8. **No implementation during planning** — every plan doc stops at saved `.md`. Separate execution session implements.
9. **Exact file paths + complete code in every step** — no "similar to Task N", no "add appropriate error handling".
10. **Commit frequency** — 1 commit per TDD cycle (test + impl together, or fixup commits for minor corrections).

---

## Phase 5 — Fluidity Pass

**Goal.** Authoring surface feels like Tableau. Hover reveals affordances. Drag shows drop targets. Right-click does work. Zone inspector lets users control size/padding/background/border/title. Tiled ↔ floating is one click. Legacy-shim layout stops squeezing 30 tiles into 26px rows.

### Plan 5a — Zone Chrome + Hover Affordances

**Problem.** Zones are invisible until clicked. No title bar, no border, no hover outline, no cursor change, no grip handle. User doesn't discover they can drag or resize.

**Deliverables.**

1. **New component** `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`:
   - Wraps any leaf zone (worksheet / text / image / blank / webpage).
   - Renders: optional title bar (top 24px), optional border, hover outline, grip handle strip on top, hover-reveal quick-action buttons (× close, ⋯ menu, ⛶ expand).
   - Props: `zone`, `resolved`, `renderContent`, `onContextMenu`, `onQuickAction`.
   - CSS-only hover state; no JS pointer tracking.

2. **Hover cursor + outline without selection:**
   - Zone body hover → cursor `move` + 1px blue outline.
   - Zone edge hover (4px hotzone) → cursor `ns-resize` / `ew-resize` / `nwse-resize` / `nesw-resize` per edge.
   - Edge hotzones detect via CSS pseudo-elements, not JS listeners.

3. **Zone title bar.** Top 24px strip:
   - Drag grip `⋮⋮` icon (left, 16×24) — cursor `move`, pointerdown starts drag.
   - Display name `zone.displayName` (editable on dbl-click).
   - Hover-reveal buttons (right, fade-in on hover): `⋯` context menu, `⛶` fit-to-content, `×` close.
   - Title bar visible on worksheet + text + webpage zones; hidden on blank + image by default (toggle via property).

4. **New store fields:**
   - `analystProHoveredZoneId: string | null` — set on mouseenter, cleared on mouseleave.
   - `setAnalystProHoveredZoneId(id)` action.

5. **Extend `renderLeaf` in `AnalystProLayout.jsx`** to wrap every leaf in `ZoneFrame`.

6. **Keyboard.** Tab cycles through zones (tabindex=0 on ZoneFrame). Enter opens context menu for focused zone. F2 opens inline rename.

**Test expectations.**
- `ZoneFrame.test.tsx` — renders title bar, hover outline appears on mouseenter, quick-action buttons render on hover, dbl-click on title opens inline editor, Enter saves, Esc cancels.
- Extend `FreeformCanvas.integration.test.tsx` — zone hover → outline renders → cursor changes on edge hotzone.

**Files to modify / create:**
- Create: `frontend/src/components/dashboard/freeform/ZoneFrame.jsx`
- Create: `frontend/src/components/dashboard/freeform/__tests__/ZoneFrame.test.tsx`
- Modify: `frontend/src/components/dashboard/modes/AnalystProLayout.jsx` — `renderLeaf` wraps with `ZoneFrame`
- Modify: `frontend/src/store.js` — `analystProHoveredZoneId` slice
- Modify: `frontend/src/index.css` — `.analyst-pro-zone-frame` hover styles + edge hotzone pseudo-elements

**Task count target:** 8–10.

---

### Plan 5b — Drop Indicators + Smart Guides + Cross-Container Drag + Container Restructure

**Problem.** Drag stores intent but no visual target shown. Same-parent reorder only — can't move zone between containers. Can't drop a zone onto another zone to create a new split container.

**Deliverables.**

1. **Drop indicator overlay.** New `DropIndicatorOverlay.jsx`:
   - Listens to `analystProDragState`.
   - When drag active over a tiled container, renders a 3px blue bar between the two nearest sibling slots.
   - When drag over a zone (not container), renders a 6px highlighted rectangle on the nearest edge (top/bottom/left/right = "insert before/after" / split direction).
   - When drag over a container's centre, renders a dashed border showing "insert inside".

2. **Smart guide lines.** Extend `snapMath.ts` with `snapAndReport()`:
   - Returns `{ x, y, guideLines: [{ axis: 'x'|'y', position: number, start: number, end: number }] }`.
   - Drag loop renders visible 1px dashed amber lines for each active guide (centre-to-centre, edge-to-edge).
   - Fade in/out on 100ms transition.
   - Max 4 guides rendered simultaneously (closest per axis + sibling edge).

3. **Cross-container drag.** Extend `useDragResize.js`:
   - On pointermove, run hit-test against every container in the tiled tree (`hitTest.ts`).
   - Track `analystProDragState.targetContainerId` + `targetIndex`.
   - On pointerup, if `targetContainerId !== sourceParentId`, call new `moveZoneAcrossContainers(sourceId, targetContainerId, targetIndex)` zone-tree op.

4. **New zone-tree op** in `lib/zoneTreeOps.ts`:
   - `moveZoneAcrossContainers(root, sourceId, targetContainerId, targetIndex)`:
     - Reject if target descends from source (prevent cycle).
     - Remove from source parent (re-normalize).
     - Insert into target at `targetIndex` (re-normalize).
     - Clamp `targetIndex ∈ [0, targetContainer.children.length]`.

5. **Container restructure — drop-on-zone split.** When drop target is a zone (not container) and drop position is edge:
   - If dropping on horizontal edge (top/bottom) of a tiled leaf: wrap target + source in a new `container-vert`.
   - If dropping on vertical edge (left/right): wrap in `container-horz`.
   - If dropping on centre of a leaf: replace (swap sheets) — guard with confirmation dialog.
   - Use new `wrapInContainer(root, zoneId, newContainerType, insertSide)` op.

6. **Layout-tree drag reorder.** Already shipped in Plan 4e. Verify it calls the new `moveZoneAcrossContainers` for cross-container cases.

**Test expectations.**
- `snapMath.test.ts` — `snapAndReport` returns guide line metadata when snap happens.
- `zoneTreeOps.test.ts` — `moveZoneAcrossContainers` rejects cycles, preserves proportions, clamps index.
- `zoneTreeOps.test.ts` — `wrapInContainer` creates correct parent type per insertSide.
- `DropIndicatorOverlay.test.tsx` — renders bar when dragState has targetIndex.
- Integration — drag zone A onto edge of zone B → new container appears.

**Files:**
- Create: `DropIndicatorOverlay.jsx`, tests
- Modify: `lib/snapMath.ts` (add `snapAndReport`), `lib/zoneTreeOps.ts` (add `moveZoneAcrossContainers`, `wrapInContainer`)
- Modify: `hooks/useDragResize.js` (hit-test containers, track target container)
- Modify: `FreeformCanvas.jsx` (mount overlay)
- Modify: `store.js` — extend `analystProDragState` with `targetContainerId`, `targetIndex`, `dropEdge`

**Task count target:** 10–12.

---

### Plan 5c — Right-Click Context Menu

**Problem.** Right-click does nothing. Tableau's main authoring interface is hidden.

**Deliverables.**

1. **New component** `frontend/src/components/dashboard/freeform/ContextMenu.jsx`:
   - Portal-rendered, positioned at cursor, role=menu, aria-keyshortcuts.
   - Auto-close on Escape / click-away / scroll.
   - Keyboard navigation (arrow keys, Enter select, Esc close).

2. **Menu item catalogue** — per zone type. Structure:

   **Common (all zones):**
   - Floating / Tiled toggle
   - Fit → submenu: Fit, Fit Width, Fit Height, Entire View, Fixed Pixels…
   - Background…
   - Border…
   - Padding → submenu: Inner Padding, Outer Padding
   - Show Title (checkbox)
   - Show Caption (checkbox) — worksheet only
   - Deselect
   - Remove from Dashboard
   - Remove (with children) — containers only
   - Select Parent Container
   - Bring Forward / Send Backward / Bring to Front / Send to Back — floating only
   - Copy / Paste — zone clipboard

   **Worksheet zones (additional):**
   - Swap Sheets… → opens dialog with worksheet list
   - Filter → submenu: (list of fields on marks card)
   - Actions…

   **Container zones (additional):**
   - Distribute Evenly
   - Fit Container to Content
   - Remove Container (unwrap children)

3. **Store additions:**
   - `analystProContextMenu: { x, y, zoneId, items } | null`
   - `openContextMenuAnalystPro(x, y, zoneId)` — computes items via `buildContextMenu(zone, dashboard)` pure helper.
   - `closeContextMenuAnalystPro()`.

4. **Pure helper** `lib/contextMenuBuilder.ts`:
   - `buildContextMenu(zone, dashboard): MenuItem[]`.
   - Separates by zone type. Returns a discriminated union.

5. **Wire into `ZoneFrame.jsx`** (Plan 5a) + canvas empty area (shows "Paste / Add Text / Add Image" items).

6. **Command handlers** — each menu item dispatches an existing store action (`toggleZoneFloatAnalystPro`, `setFitModeAnalystPro`, etc.). Actions created in Plans 5d / 5e.

**Test expectations.**
- `ContextMenu.test.tsx` — renders items, keyboard nav works, Esc closes, click-away closes.
- `contextMenuBuilder.test.ts` — worksheet zone has Swap Sheets item, container has Distribute Evenly, floating zone has z-order items.

**Files:**
- Create: `ContextMenu.jsx`, `lib/contextMenuBuilder.ts`, tests
- Modify: `ZoneFrame.jsx` (hook onContextMenu)
- Modify: `FreeformCanvas.jsx` (canvas-level context menu on empty area)
- Modify: `store.js` — context-menu slice

**Task count target:** 10–12.

---

### Plan 5d — Zone Properties Panel Rewrite (Tabbed Inspector)

**Problem.** Right-rail inspector is Visibility-only. Tableau has Layout + Style + Visibility per zone.

**Deliverables.**

1. **Rewrite** `ZonePropertiesPanel.jsx` as tabbed inspector:
   - Tab 1: **Layout** — Position (X, Y pixel inputs for floating; proportion % read-only for tiled) + Size (W, H) + Size Mode dropdown (Fit / Fit Width / Fit Height / Entire View / Fixed) + Inner Padding (0–100 px) + Outer Padding (0–100 px).
   - Tab 2: **Style** — Background color picker + opacity slider; Border (L/R/T/B weight + color + dashed/solid); Title Show/Hide toggle + font size + colour; Caption Show/Hide toggle.
   - Tab 3: **Visibility** — existing rule editor (preserve current behaviour).

2. **New zone fields** — extend `BaseZone` in `types.ts`:
   ```ts
   innerPadding?: number;        // pixels, default 4
   outerPadding?: number;        // pixels, default 0
   background?: { color: string; opacity: number };  // default transparent
   border?: { weight: [number,number,number,number]; color: string; style: 'solid'|'dashed' };
   showTitle?: boolean;          // default true for worksheet, false for blank/image
   showCaption?: boolean;        // default false
   fitMode?: 'fit' | 'fit-width' | 'fit-height' | 'entire' | 'fixed';  // default 'fit'
   ```

3. **Store action:** `setZonePropertyAnalystPro(zoneId, patch)` — patches arbitrary zone fields; updates history.

4. **Apply properties in renderer:**
   - `ZoneFrame.jsx` reads `zone.background`, `zone.border`, `zone.innerPadding` etc. and applies inline styles.
   - `fitMode` controls how chart content sizes within zone (Vega-Lite signal override).

5. **Migration.** `backend/dashboard_migration.py` — preserve new fields through legacy → freeform conversion. Default missing fields.

**Test expectations.**
- `ZonePropertiesPanel.test.tsx` — each tab renders, editing commits via store action.
- `zoneTreeOps.test.ts` — property patches preserve siblings' proportions.
- Backend migration test — properties round-trip.

**Files:**
- Rewrite: `ZonePropertiesPanel.jsx`, test
- Modify: `lib/types.ts` — extend BaseZone
- Modify: `ZoneFrame.jsx` — apply properties
- Modify: `store.js` — `setZonePropertyAnalystPro`
- Modify: `backend/dashboard_migration.py` + `user_storage.py` allowlist
- Modify: backend tests

**Task count target:** 10–12.

---

### Plan 5e — Float Toggle + Smart Layout Defaults + Container Commands

**Problem.** Tiled zones locked into flow — no way to pop one out. Legacy shim stacks 30 tiles in one vertical container = 26px rows. No "Distribute Evenly", no "Fit Container to Content", no "Remove Container".

**Deliverables.**

1. **Float / unfloat toggle.** New store action `toggleZoneFloatAnalystPro(zoneId)`:
   - Tiled → floating: remove from tree (re-normalize parent), add to floatingLayer with current resolved pixel rect as `{ x, y, pxW, pxH }`.
   - Floating → tiled: prompt user to pick destination container (or default to root). Insert as last child.
   - Generates undo entry.

2. **Smart layout heuristic** — rewrite `legacyTilesToDashboard` in `AnalystProLayout.jsx`:
   - If ≤ 4 tiles → single Vert Container (current behaviour).
   - If 5–9 tiles → 2-column Horz Container with Vert Container children.
   - If 10+ tiles → 3-column grid: Horz root with 3 Vert children, distribute tiles round-robin.
   - Canvas default size: `fixed` `{ width: 1440, height: Math.max(900, ceil(tiles.length / 3) * 320) }`.
   - Users can still switch to Automatic via SizeToggleDropdown.

3. **Container commands** (context menu + toolbar):
   - `distributeEvenlyAnalystPro(containerId)` — sets every child's axis proportion to `100000 / children.length`.
   - `fitContainerToContentAnalystPro(containerId)` — sum of children's measured natural sizes → container's fixed px override.
   - `removeContainerAnalystPro(containerId)` — unwrap: container's children replace container in its parent. Re-normalize. Reject if removing root.

4. **Toolbar buttons** — add to `StructureToolbar.jsx`:
   - Distribute Evenly (⇹) — enabled when 2+ siblings in selected container.
   - Fit to Content (⇲) — enabled when container selected.
   - Remove Container (⬚) — enabled when non-root container selected.

5. **Keyboard shortcut** for float toggle: Cmd+Shift+F (floating zones are Tableau-familiar; F for float).

**Test expectations.**
- `zoneTreeOps.test.ts` — `toggleZoneFloat`, `distributeEvenly`, `fitContainerToContent`, `removeContainer` unit tests.
- `AnalystProLayout.test.tsx` — 3-tile dashboard uses single vert; 7-tile uses 2-col; 15-tile uses 3-col.
- Integration — float toggle round-trip preserves identity.

**Files:**
- Modify: `lib/zoneTreeOps.ts` — 4 new ops
- Modify: `store.js` — 4 new actions
- Modify: `AnalystProLayout.jsx` — smart layout heuristic
- Modify: `StructureToolbar.jsx` — 3 new buttons
- Modify: `hooks/useKeyboardShortcuts.js` — Cmd+Shift+F
- Tests across all

**Task count target:** 10–12.

---

## Phase 6 — Canvas Power Controls

**Goal.** Pan/zoom/ruler/device-preview feel; undo history visible; Tableau-style tabbed left rail; real mark interactions on charts; Keep-Only/Exclude/View-Data from tooltip.

### Plan 6a — Canvas Zoom + Pan + Rulers + Device Preview

**Deliverables.**

1. **Zoom controls** — new `CanvasZoomControls.jsx` top-right floating widget:
   - Buttons: 25%, 50%, 75%, 100%, 150%, 200%, Fit.
   - Current zoom displayed; dropdown + custom input for arbitrary %.
   - Ctrl+Scroll wheel anywhere on canvas → zoom in/out at cursor.
   - Ctrl+0 → Fit. Ctrl++ / Ctrl+- → zoom in/out.

2. **Pan gesture** — Space-hold + drag anywhere on canvas pans. Cursor becomes `grab` / `grabbing`. Middle-click drag also pans.

3. **Zoom + pan state:**
   - `analystProCanvasZoom: number` (default 1.0).
   - `analystProCanvasPan: { x: number; y: number }` (default 0,0).
   - `setCanvasZoomAnalystPro(zoom, anchor?)`, `setCanvasPanAnalystPro(x, y)`.

4. **Apply via CSS transform** on `.freeform-sheet`: `transform: translate(${pan.x}px, ${pan.y}px) scale(${zoom})`. Keep pointer events accurate by tracking transform matrix in hit-test.

5. **Rulers.** New `CanvasRulers.jsx`:
   - Top horizontal ruler (24px strip), left vertical ruler (24px strip).
   - Tick marks every 50px; labels every 100px.
   - Respect current zoom + pan.
   - Toggle via `analystProRulersVisible` + toolbar button.

6. **Device preview dropdown** — new top-toolbar component `DevicePreviewToggle.jsx`:
   - Options: Desktop (≥ 1366), Tablet (768–1365), Phone (≤ 767).
   - Switches canvas size + applies device-layout overrides if dashboard has them.
   - Per Tableau: device layouts override positions but don't rebuild the tree (see `Build_Tableau.md` §IX.5).

7. **Device-layout data model** — extend dashboard schema:
   ```ts
   deviceLayouts?: {
     tablet?: DeviceLayoutOverride;
     phone?: DeviceLayoutOverride;
   };
   // where DeviceLayoutOverride = { zoneOverrides: Record<zoneId, { x?, y?, w?, h?, visible? }> }
   ```

**Test expectations.**
- Zoom → scale applied; pan → translate applied; pointer events remain accurate.
- Rulers scale with zoom.
- Device preview swaps size + applies overrides.

**Files:**
- Create: `CanvasZoomControls.jsx`, `CanvasRulers.jsx`, `DevicePreviewToggle.jsx`, tests
- Modify: `FreeformCanvas.jsx` — apply transform, handle ctrl+scroll/space+drag
- Modify: `store.js` — zoom, pan, rulers, device slices
- Modify: `AnalystProLayout.jsx` — mount new toolbar widgets
- Modify: `backend/dashboard_migration.py` — preserve deviceLayouts

**Task count target:** 10–12.

---

### Plan 6b — Undo/Redo Toolbar UI + History Inspector

**Deliverables.**

1. **Undo/Redo buttons** in `AnalystProLayout.jsx` top toolbar:
   - `↶ Undo (N)` / `↷ Redo (M)` where N/M are `past.length` / `future.length`.
   - Disabled when stack empty.
   - Hover tooltip shows the name of the last operation (e.g. "Resize zone", "Insert text").

2. **Operation labels.** `pushAnalystProHistory` currently stores only the dashboard snapshot. Extend to `pushAnalystProHistory(dashboard, operation?: string)`. All existing callsites gain an `operation` string.

3. **History inspector panel** — new `HistoryInspectorPanel.jsx`:
   - Toggleable via Cmd+H or toolbar button.
   - Lists past operations (newest first) with diff preview (zones changed).
   - Click any entry → revert to that state.
   - Max 50 entries shown (store has 500).

4. **Store additions:**
   - History entry shape: `{ snapshot: Dashboard, operation: string, timestamp: number }`.
   - `jumpToHistoryAnalystPro(index)` — revert to a specific past state.

**Test expectations.**
- Buttons enable/disable based on stack state.
- Operation names round-trip through undo.
- Jump-to-index works.

**Files:**
- Create: `HistoryInspectorPanel.jsx`, test
- Modify: `store.js` — extend history shape + `jumpTo`
- Modify: `AnalystProLayout.jsx` — toolbar + panel mount
- Modify: all callsites of `pushAnalystProHistory` — add operation labels

**Task count target:** 6–8.

**Status:** ✅ Shipped 2026-04-17. 7 tasks. New tests: `store.historyEntries` (10), `store.operationLabels` (9), `historyDiff` (6), `UndoRedoToolbar` (5), `HistoryInspectorPanel` (4) — 34 new assertions. All 23 store callsites + 5 hook callsites now pass labels; `jumpToHistoryAnalystPro` enables random-access revert (not Revert-to-saved — §XVII.2 out of scope).

---

### Plan 6c — Tableau-Style Sidebar Tabs — ✅ Shipped 2026-04-18

**Problem.** Left rail dumps Objects + Tree + Sets + Params together. Tableau has Dashboard tab + Layout tab.

**Deliverables.**

1. **Rewrite left rail** in `AnalystProLayout.jsx`:
   - Two tabs at top: **Dashboard** | **Layout**.
   - Tab state: `analystProSidebarTab: 'dashboard' | 'layout'`.

2. **Dashboard tab contains:**
   - Objects section (existing `ObjectLibraryPanel`).
   - Sheets section — new panel listing all worksheets in the workbook with drag-to-insert.
   - Sets section (existing `SetsPanel`).
   - Parameters section (existing `ParametersPanel`).

3. **Layout tab contains:**
   - Item Hierarchy — existing `LayoutTreePanel`.
   - Selected Item — new panel with Position / Size / Padding / Background / Border (tiny echo of `ZonePropertiesPanel` Layout tab).

4. **New component** `SheetsInsertPanel.jsx`:
   - Lists `dashboard.worksheets`.
   - Each item draggable with MIME `application/askdb-analyst-pro-sheet+json` payload `{ sheetId }`.
   - Drop on canvas → inserts a worksheet zone.

5. **Collapsible sections.** Each section has a chevron + heading; click collapses.

**Test expectations.**
- Tabs switch content.
- Sheets panel renders; drag inserts a zone.
- Selected Item panel syncs to selection.

**Files:**
- Create: `SheetsInsertPanel.jsx`, `SelectedItemMini.jsx` (small Layout echo), tests
- Modify: `AnalystProLayout.jsx` — sidebar tab structure
- Modify: `store.js` — `analystProSidebarTab`

**Task count target:** 8–10.

**Status:** ✅ Shipped 2026-04-18. 8 commits (T1+T3 merged: one store commit covers both the sidebar tab/collapse slices and the `worksheetRef` extension of `insertObjectAnalystPro`). Left rail is now a two-tab shell (Dashboard | Layout) with collapsible sections: Objects / Sheets / Sets / Parameters on Dashboard; Item Hierarchy / Selected Item on Layout. Sheet drag uses MIME `application/askdb-analyst-pro-sheet+json`; canvas drop inserts a worksheet zone. New tests: `store.sidebarTabs` (7), `SidebarSection` (4), `SheetsInsertPanel` (4), `FreeformCanvas.integration` sheet-drop (2), `SelectedItemMini` (4), `AnalystProSidebar` (7) — 28 new assertions. A11y: `role=tablist/tab/tabpanel`, `aria-selected`, roving `tabIndex`, section headers expose `aria-expanded`/`aria-controls`. Deferred (Build_Tableau §IX.4): size-mode controls stay on the top toolbar `SizeToggleDropdown`.

---

### Plan 6d — Mark Selection + Highlight Overlay on Charts — ✅ Shipped 2026-04-17

**Problem.** `analystProSheetHighlights` slice exists (Plan 4a) but no chart reads it. Clicking a chart bar should select the mark, emit a `MarkEvent` to bus (already wired for actions), AND dim non-matching marks in the target sheet.

**Deliverables.**

1. **Wire click handler on Vega chart** — extend `VegaRenderer.tsx` (already exists at `frontend/src/components/editor/renderers/VegaRenderer.tsx`):
   - Add Vega `signal` for selected mark.
   - Emit `MarkEvent({ sheetId, fields: {...selectedFieldValues} })` to `markEventBus` (already a singleton).
   - Accept `highlightFilter` prop — dims non-matching marks via opacity override.

2. **Highlight overlay via Vega signal.** Compile `sheetHighlights[sheetId]` into a Vega filter expression: `datum[field] === value`. Dim non-matching to opacity 0.15; matching stay at 1.0.

3. **Selection ring on clicked mark.** Vega spec override adds a stroke around selected marks.

4. **Clear on click-outside.** Click on chart empty area → clear mark selection + emit `MarkEvent({ sheetId, fields: null })` (signals deselect).

5. **Multi-select with Shift.** Shift+click adds to selection. Bus emits with accumulated fields.

6. **Update `useActionRuntime.js`** — `case 'highlight'` → write to `setAnalystProSheetHighlight(targetSheetId, { field: value })`. Clear on mark deselect.

**Test expectations.**
- Click bar chart → MarkEvent published; highlighted via signal.
- Shift+click adds to selection.
- Second click on empty area clears.
- Action cascade: Highlight action → target sheet dims.

**Files:**
- Modify: `VegaRenderer.tsx` — signal + highlight prop + click handler
- Modify: `AnalystProWorksheetTile.jsx` — pass highlightFilter from slice
- Modify: `useActionRuntime.js` — highlight op real exec
- Modify: `store.js` — highlight helpers (already partly there)
- Tests

**Task count target:** 8–10.

---

### Plan 6e — Chart Tooltip: Keep Only / Exclude / View Data — ✅ Shipped 2026-04-18

**Status:** ✅ Shipped 2026-04-18. 11 tasks (T1 backend `notIn` op, T2 Literal tightening, T3 `/queries/underlying` endpoint + line-comment-safe wrap, T4 frontend `notIn` Filter variant, T5 `api.executeUnderlying`, T6 `viewDataDrawer` slice, T7 `ChartTooltipCard`, T8 `VegaRenderer` `onMarkHover`, T9 tile wiring, T10 `ViewDataDrawer`, T11 verification). Commits: `483047c`, `88960e3`, `a150eaf`+`aef170e`, `ce565ae`, `9b83a42`, `5ba912d`, `ac92a76`, `7b75e59`, `c709989`, `a7280d9`. Backend: `/queries/underlying` enforces 6-layer SQLValidator + read-only + audit `view_data` event, default limit 10000 / hard cap 50000. Frontend: tooltip + drawer + store contract verified.

**Problem.** Vega tooltips show values but no authoring affordance. Tableau's tooltip has Keep Only / Exclude / View Data / Group Members.

**Deliverables.**

1. **Custom tooltip component** `ChartTooltipCard.jsx`:
   - Positioned at cursor via Floating UI (already in deps).
   - Shows hovered mark's field values.
   - Bottom action row: Keep Only | Exclude | View Data.
   - Tab / arrow keys navigate actions.

2. **Keep Only / Exclude actions:**
   - Keep Only → append `{ field, op: 'in', value }` to `analystProSheetFilters[sheetId]` slice.
   - Exclude → append `{ field, op: 'notIn', value }`.
   - Both re-use the Plan 4a filter-injection pipeline (wrapped SQL re-run via `AnalystProWorksheetTile`).

3. **View Data drawer.** New `ViewDataDrawer.jsx`:
   - Right-side 480px drawer over canvas.
   - Two tabs: Summary (aggregated rows currently rendered) | Underlying (raw rows from SQL).
   - Summary fetches via existing `/queries/execute` with no filter; Underlying fetches via new `/queries/underlying` endpoint accepting `{ sheetId, markSelection }`.
   - Export to CSV button.

4. **Backend endpoint** `POST /api/v1/queries/underlying`:
   - Takes `{ sheetId, connId, dashboardId, markSelection: Record<field,value>, limit?: number }`.
   - Runs original worksheet SQL wrapped with `SELECT * FROM (<sql>) WHERE <mark filter>`.
   - Same 6-layer validator, same read-only enforcement.
   - Default limit 10000, cap 50000.
   - Audit row `view_data`.

5. **Extend Vega `mouseover`** to open the custom tooltip instead of Vega's built-in.

**Test expectations.**
- Hover mark → tooltip appears.
- Keep Only → filter slice updated → chart re-queries with WHERE.
- View Data → drawer opens, fetches underlying rows.
- Backend test: `/queries/underlying` with SQL injection attempt → 400.

**Files:**
- Create: `ChartTooltipCard.jsx`, `ViewDataDrawer.jsx`, tests
- Modify: `VegaRenderer.tsx` — disable built-in tooltip, emit hover event
- Create: `backend/routers/query_routes.py` extension — `/underlying` endpoint
- Create: `backend/tests/test_view_data_underlying.py`

**Task count target:** 10–12.

---

### Plan 7 — Tableau-Parity Finish (Hotfix, distinct from Phase 7 VizQL) — ✅ Shipped 2026-04-18

**Naming note.** This hotfix plan happens to be labelled "Plan 7" but is NOT part of Phase 7 (VizQL Engine) below. Commit tags use `(Plan 7 TN)`; VizQL plans use `(Plan 7a TN)` / `(Plan 7b TN)` / etc, so the two do not collide in git log. Full plan doc: `docs/superpowers/plans/2026-04-18-analyst-pro-plan-7-tableau-parity-finish.md`.

**Goal.** Close three readability + drag bugs the user hit after Plans 5a-6e shipped, plus wire authored-layout persistence (missing since Plan 3 T9 whitelisted the backend fields). 14 tasks across 6 phases: Chrome → Drag → Layout → Persistence → Load-path rip → Verify.

**Status:** ✅ Shipped 2026-04-18. 11 commits (T3 was no-op — hover-only actions already shipped in Plan 5a; T13 live verify deferred to user). Commits: `da0c2be` (T1), `bc61860` (T2), `517309c` (T4), `665806a` (T5), `67af156` (T6), `e63c686` (T7), T8 hook commit, `60405e2` (T9), `1e3945c` (T10), `74022c8` (T11), `0f2bfa3` (T12 fixup).

**Ships.**
- T1: `TITLE_BAR_DEFAULT_VISIBLE` no longer includes `'worksheet'` — kills the "Worksheet #3w8i" double-title on Vega chart tiles (readability fix).
- T2: `legacyTilesToDashboard` carries `tile.title` through as `zone.displayName`, so opting into a frame bar shows the real chart name instead of the id-hash fallback.
- T4: `wrapInContainer` rejects drops that would produce <120 px child cells (`MIN_WRAP_PX` guard) — drags into tiny targets become no-ops instead of producing unreadable wraps. Wired via `FreeformCanvas` → `useDragResize` → `wrapInContainerAnalystPro(…, canvasSize)`.
- T5: `clampFloatingMove` keeps floating zones inside the canvas rect (Build_Tableau §E.14 parity). Floating drags past edges no longer render off-screen.
- T6: `classifyTile` pure helper — `'kpi' | 'chart'` classification with explicit override, chartType allowlist, `chart_spec.mark.type === 'text'` detection.
- T7: legacy shim switches to a KPI-aware bin pack when any KPI is present — KPIs 4/row × 160 px, charts 2/row × 360 px. All-chart dashboards still hit the Plan 5e columnar path byte-identical.
- T8-T9: `useAnalystProAutosave` debounced (1500 ms) PATCH hook mounted in `AnalystProLayout`. Payload = `{ schemaVersion, archetype, size, tiledRoot, floatingLayer }` (matches Plan 3 T9 backend whitelist). Serialized-payload short-circuit prevents duplicate PATCHes. Unmount cancels.
- T10-T11: `AnalystProLayout` accepts an `authoredLayout` prop; when its `tiledRoot` is truthy, render it verbatim and skip `legacyTilesToDashboard`. `AnalyticsShell` passes the full backend dashboard object through `DashboardShell`. `FreeformCanvas` reseeds the store on tree-identity change (not just id change), so a mid-session re-hydration restores the authored tree without a wipe cycle.

**New tests (7 files, 50+ assertions).** `zoneDefaults.test.ts` (extended, Plan 7 T1 block), `legacyTilesToDashboard.test.ts` (extended — Plan 7 T2 + T7 describe blocks, 14 new cases), `zoneTreeOps.wrapGuard.test.ts` (5), `useDragResize.bounds.test.ts` (7), `classifyTile.test.ts` (8), `useAnalystProAutosave.test.ts` (7), `AnalystProLayout.loadPath.test.tsx` (3). Full freeform suite: 676 tests green after Plan 7.

**Out of scope (not attempted, noted in plan).** Collaborative editing / CRDT, cross-refresh undo, tile classification beyond kpi-vs-chart, animated drag ghosts, dashboard-level Fit Content button, worksheet-ref vs zone-displayName reconciliation.

---

## Phase 7 — VizQL Engine (new query architecture)

**Goal.** Our own minerva-equivalent 3-stage compilation pipeline (see `Build_Tableau.md` Part IV + Appendix Y). Produces dialect-aware SQL from a canonical `VisualSpec` IR. Our waterfall router becomes one consumer.

### Plan 7a — VisualSpec IR + Protobuf Schema

**Deliverables.**

1. New Protobuf schema `backend/proto/askdb/vizdataservice/v1.proto` mirroring `tableau.vizdataservice.v1`:
   - `VisualSpec { fields, shelves, encodings, filters, parameters, lod_calculations, mark_type, analytics }`.
   - `Shelf { kind: ROW|COLUMN|DETAIL|COLOR|SIZE|SHAPE|LABEL|PATH|ANGLE|TOOLTIP; fields[] }`.
   - `FilterSpec` with 4 kinds: `categorical`, `hierarchical`, `range`, `relative_date`.
   - `Calculation { formula, is_adhoc }`.
   - `Field { id, data_type, role, semantic_role, aggregation, is_disagg }`.
   - `is_generative_ai_web_authoring: bool` (mirrors §I.5 flag).

2. Generate TS types via `protoc` + `ts-proto`.
3. Generate Python classes for backend via `protoc` + `protobuf`.
4. New lib `frontend/src/components/dashboard/freeform/lib/vizSpec.ts` — IR types + builders.
5. New backend module `backend/vizql/spec.py` — Python IR.
6. Serialize/deserialize round-trip tests.

**Task count target:** 8.

**Status:** ✅ Shipped 2026-04-19. 8 tasks. Commits `03d9cfa` (T1 scaffold), `8e40cce` (T2 v1.proto), `b63b0e1` (T3 codegen), `a8e6d13` (T4 Python spec.py + 15 roundtrip tests), `2e02f38` (T5 TS vizSpec.ts + 11 tests), `9c97520` (T6 vizSpecBridge.ts + 11 tests), `df00d9a` (T7 README + CLAUDE.md). Python codegen uses `python -m grpc_tools.protoc`; TypeScript codegen reuses the same bundled protoc via `--plugin=protoc-gen-ts_proto=…` (no system protoc binary required — Windows-friendly). 37 new test assertions across backend + frontend; zero regressions (688 backend pass, 22 new ts tests pass, chart-ir failure count unchanged from baseline). Dependencies pinned: `protobuf==5.29.3`, `grpcio-tools==1.68.1`, `ts-proto@2.6.1`. Plan doc: `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7a-visualspec-ir.md`.

---

### Plan 7b — Minerva Logical Plan Port

**Deliverables.**

1. New backend module `backend/vizql/logical.py`:
   - Operators: `LogicalOpProject`, `LogicalOpSelect`, `LogicalOpRelation`, `LogicalOpAggregate`, `LogicalOpOrder`, `LogicalOpTop`, `LogicalOpOver`, `LogicalOpLookup`, `LogicalOpUnpivot`, `LogicalOpValuestoColumns`, `LogicalOpDomain`, `LogicalOpUnion`, `LogicalOpIntersect`, `LogicalOpFilter`.
   - `DomainType` enum: `Snowflake`, `Separate`.
   - Supporting: `Field`, `NamedExps`, `OrderBy`, `FrameType`, `PartitionBys`.

2. Compiler `backend/vizql/compiler.py`:
   - `VisualSpec → LogicalPlan`.
   - Handles dim/measure split, GROUP BY derivation, Measure Names/Values synthetic fields.
   - Unit tests cover each mark type's spec shape.

**Task count target:** 12.

**Status:** ✅ Shipped 2026-04-20. 12 tasks. Plan doc: docs/superpowers/plans/2026-04-17-analyst-pro-plan-7b-minerva-logical-plan.md.

---

### Plan 7c — SQL AST + Optimizer Passes

**Deliverables.**

1. New module `backend/vizql/sql_ast.py`:
   - `SQLQueryFunction` / `SQLQueryExpression` tree.
   - Passes: `AggregatePushdown`, `CommonSubexpressionElimination`, `DataTypeResolver`, `EqualityProver`, `JoinTreeVirtualizer`.

2. Filter order-of-ops enforcement (`Build_Tableau.md` §IV.7):
   - 9 stages (Extract → DS → Context → FIXED → Dim → INCLUDE/EXCLUDE → Measure → TableCalc → Totals).
   - `apply_filters_in_order(plan, filters)` attaches each filter at the correct stage.

3. Test: filter order determines WHERE vs HAVING vs CTE vs correlated subquery.

**Task count target:** 10.

**Status:** ✅ Shipped 2026-04-19. 10 tasks. Commits `1137de7..78712bb`
(T1 `1137de7`, T2 `311a1bc`, T3 `297e2f6`, T4 `3b840b8`, T5 `bf436a0`,
T6 `a542daf`, T7 `6fed546`, T8 `6fc4f36`, T9 `78712bb`, T10 = this
commit). New modules: `backend/vizql/sql_ast.py`, `generic_sql.py`,
`logical_to_sql.py`, `filter_ordering.py`, `optimizer.py`, `passes/`
(7 passes). Security gate: every emitted query passes `sql_validator`
(injection-rejection test in `test_vizql_security_gate.py`). Filter
ordering enforces §IV.7's nine stages at plan-build time. mypy --strict
passes on every new Plan 7c module (17 pre-existing errors in
`vizql/spec.py` + `vizql/proto/*` are carried Plan 7a baseline). Plan
doc:
`docs/superpowers/plans/2026-04-17-analyst-pro-plan-7c-sql-ast-optimizer.md`.

---

### Plan 7d — Dialect Emitters

**Deliverables.**

1. Base `backend/vizql/dialect_base.py` — `BaseDialect` with abstract `format_*` methods.
2. `backend/vizql/dialects/duckdb.py` — first (our twin).
3. `backend/vizql/dialects/postgres.py`.
4. `backend/vizql/dialects/bigquery.py`.
5. `backend/vizql/dialects/snowflake.py`.
6. Each dialect has round-trip tests using real sample VisualSpec → SQL → execute on fixture DB.

**Task count target:** 12.

**Status:** ✅ Shipped — 2026-04-17 (see `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7d-dialect-emitters.md`).

---

### Plan 7e — Query Cache 2-Tier + Integration

**Deliverables.**

1. New module `backend/vizql/cache.py`:
   - `AbstractQueryCacheKey = {ds_id, relation_tree_hash, predicate_hash, projection, group_bys, order, agg_types}`.
   - `LRUQueryCachePolicy(max_bytes)`.
   - `InProcessLogicalQueryCache` — in-memory.
   - `ExternalLogicalQueryCache` — Redis-backed (when available).
   - `HistoryTrackingCache` wrapper — invalidation reasoning per entry.

2. Wire into `waterfall_router.py` — VizQL path becomes new Tier 3.

**Task count target:** 8.

**Status:** ✅ Shipped — 2026-04-20. 8 tasks + 1 concurrency follow-up + 1 pytest hygiene commit. New modules: `backend/vizql/cache.py`, `backend/vizql/batch.py`, `backend/vizql/telemetry.py`. New tier wired: `backend/waterfall_router.py :: VizQLTier` between MemoryTier and TurboTier, context isolated via `contextvars.ContextVar`. Config surface: `VIZQL_CACHE_ENABLED`, `VIZQL_INPROCESS_CACHE_BYTES` (64 MiB), `VIZQL_EXTERNAL_CACHE_BYTES` (512 MiB), `VIZQL_CACHE_TTL_SECONDS` (3600), `VIZQL_HISTORY_TRACKING_ENABLED`. Audit events: `log_vizql_cache_event`, `log_vizql_batch_event`. Redis-backed external tier degrades gracefully via existing `redis_client.get_redis()`. Plan doc: `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7e-query-cache-integration.md`.

---

## Phase 8 — Calc Fields + LOD + Table Calcs

### Plan 8a — Expression Parser + Function Catalogue

**Deliverables.**

1. New module `backend/vizql/calc_parser.py` — parser for Tableau-calc syntax (sqlglot-aided).
2. Function catalogue covering every entry in `Build_Tableau.md` §V.1 (Aggregate / Logical / String / Date / Type / User / Table calc / LOD / Spatial / Passthrough).
3. Validation: unknown function → 400.
4. Test: every function has at least one positive + one negative test.

**Task count target:** 12.

**Status:** ✅ Shipped — 2026-04-20. 12 tasks. New modules: `backend/vizql/calc_ast.py`, `backend/vizql/calc_parser.py`, `backend/vizql/calc_functions.py`, `backend/vizql/calc_typecheck.py`, `backend/vizql/calc_to_expression.py`, `backend/vizql/CALC_LANGUAGE.md`. New endpoint: `POST /api/v1/calcs/validate` (FEATURE_ANALYST_PRO-gated, 10/30s per user). New config: `FEATURE_RAWSQL_ENABLED` (default False), `CALC_RATE_LIMIT_PER_30S=10`, `MAX_CALC_FORMULA_LEN=10000`, `MAX_CALC_NESTING=32`. Public helper: `param_substitution.format_as_literal()`. Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8a-calc-parser-function-catalogue.md`.

---

### Plan 8b — LOD Semantics (FIXED / INCLUDE / EXCLUDE)

**Deliverables.**

1. LOD compiler in `backend/vizql/compiler.py`:
   - `FIXED` → emit correlated subquery on fixed dims, join back.
   - `INCLUDE` → emit window expression (`LogicalOpOver`).
   - `EXCLUDE` → emit window expression.
2. Filter order: FIXED at step 4, INCLUDE/EXCLUDE at step 6 (see §IV.7).
3. Test: "make a dim filter affect a FIXED LOD" → requires promotion to Context.
4. Test: high-cardinality FIXED triggers warning (anti-pattern detection).

**Task count target:** 10.

**Status:** ✅ Shipped — 2026-04-20. 10 tasks. New modules: `backend/vizql/lod_compiler.py`, `backend/vizql/lod_analyzer.py`, `backend/vizql/context_filter_helper.py`, `backend/vizql/LOD_SEMANTICS.md`. Extended: `backend/vizql/filter_ordering.py` (`place_lod_in_order` + `LodPlacement`), `backend/vizql/calc_to_expression.py` (viz_granularity threading), `backend/vizql/spec.py` (`VisualSpec.join_lod_overrides` + `viz_granularity()` method), `backend/proto/askdb/vizdataservice/v1.proto` (field 15 `join_lod_overrides`). New config: `LOD_WARN_THRESHOLD_ROWS=1_000_000`. Endpoint `POST /api/v1/calcs/validate` response gains `warnings: list[CalcWarning]` (additive). Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8b-lod-semantics.md`.

---

### Plan 8c — Table Calculations

**Deliverables.**

1. Table calc module with addressing + partitioning semantics.
2. Functions: `RUNNING_SUM/AVG/MIN/MAX/COUNT`, `WINDOW_SUM/AVG/MIN/MAX/MEDIAN/STDEV/VAR/PERCENTILE/CORR/COVAR`, `INDEX`, `FIRST`, `LAST`, `SIZE`, `LOOKUP`, `PREVIOUS_VALUE`, `RANK`/`RANK_DENSE`/`RANK_MODIFIED`/`RANK_UNIQUE`/`RANK_PERCENTILE`, `TOTAL`, `PCT_TOTAL`, `DIFF`.
3. Client-side evaluator for "Compute using → Table (across)" default.
4. UI for Compute Using selection.

**Task count target:** 10.

**Status:** Shipped — 2026-04-20. 10 tasks. New modules: `backend/vizql/table_calc.py`, `frontend/src/components/dashboard/freeform/lib/tableCalcEvaluator.ts`, `frontend/src/components/dashboard/freeform/panels/ComputeUsingDialog.jsx`, `docs/TABLE_CALC_GUIDE.md`. Extended: `backend/vizql/filter_ordering.py` (`place_table_calc_filter`), `backend/vizql/spec.py` (`VisualSpec.table_calc_specs`), `backend/proto/askdb/vizdataservice/v1.proto` (.proto source updated with field 16 `table_calc_specs` + new `TableCalcSpec` message — NOTE: the generated `backend/vizql/proto/v1_pb2.py` has NOT yet been regenerated because `protoc` was unavailable in the integration environment; the `VisualSpec.table_calc_specs` dataclass field is Python-only until `protoc` is installed and `VisualSpec.to_proto`/`from_proto` are wired per plan Step 8.5. `backend/routers/query_routes.py` (`/queries/execute` accepts + echoes `table_calc_specs` + `table_calc_filters`), `frontend/src/store.js` (`setTableCalcComputeUsingAnalystPro`). Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8c-table-calculations.md`.

- Known debt: run `bash backend/scripts/regen_proto.sh` + update `VisualSpec.to_proto`/`from_proto` per plan Step 8.5 once protoc is installed.

---

### Plan 8d — Monaco Calc Editor

**Deliverables.**

1. Embed Monaco editor in a new `CalcEditorDialog.jsx`.
2. Autocomplete grounded on:
   - Data source columns (from `connId` schema cache).
   - Function catalogue from Plan 8a.
   - Parameters/sets from current dashboard.
3. Inline test values — run expression against first 10 rows, show result preview.
4. LLM suggest button — generate calc from NL description (Claude Haiku). Grounded strictly on schema + function catalogue.
5. Multi-line debug — step through test values.

**Task count target:** 12.

**Status:** ✅ Shipped — 2026-04-20. 12 tasks. New modules: `frontend/src/components/dashboard/freeform/lib/{calcLanguage,calcMonarch,calcFunctionCatalogue,calcCompletionProvider,calcSignatureProvider,calcHoverProvider,calcDiagnostics}.ts`, `frontend/src/components/dashboard/freeform/panels/{CalcEditorDialog,CalcTestValues,CalcResultPreview,CalcDebugPanel,CalcSuggestDialog}.jsx`, `backend/vizql/{calc_evaluate,calc_suggest}.py`. New endpoints: `POST /api/v1/calcs/evaluate` (DuckDB single-row eval, 1s timeout, 6-layer validator), `POST /api/v1/calcs/suggest` (Haiku grounded on schema + Plan 8a catalogue, ground-checked for hallucinated fields/params/functions, `is_generative_ai_web_authoring=true` stamped per §I.5). New config: `FEATURE_CALC_LLM_SUGGEST=true`, `CALC_SUGGEST_RATE_LIMIT_PER_60S=5`, `CALC_SUGGEST_MAX_DESCRIPTION_LEN=1000`, `CALC_EVAL_TIMEOUT_SECONDS=1.0`, `CALC_EVAL_CACHE_TTL_SECONDS=60`. Dependencies: `@monaco-editor/react@^4.7.0`, `monaco-editor@^0.52.2` (chunk-split). Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8d-monaco-calc-editor.md`.

---

## Phase 9 — Analytics Pane

### Plan 9a — Reference Lines / Bands / Distributions + Totals — ✅ Shipped 2026-04-20

### Plan 9b — Trend Line (linear/log/exp/power/polynomial)

### Plan 9c — Forecast (Holt-Winters + AIC model selection)

### Plan 9d — Cluster (K-means + Calinski-Harabasz)

### Plan 9e — Box Plots + Drop Lines

Each uses DuckDB or Python (scikit-learn via subprocess) for numerical work. Surface R²/p-value/SSE for trend; confidence intervals for forecast; F-statistic/within-sum-of-squares for cluster. Reference `Build_Tableau.md` §XIII for math + UI.

---

## Phase 10 — Formatting System

### Plan 10a — Precedence Chain (Mark > Field > Worksheet > DS > Workbook)

### Plan 10b — Number Format Grammar (Excel-style)

### Plan 10c — Date Format Grammar (ICU tokens)

### Plan 10d — Rich Text + Theme System

### Plan 10e — Conditional Formatting (2 mechanisms: stepped palette + calc→color)

Reference `Build_Tableau.md` §XIV.

---

## Phase 11 — Data + Extracts + RLS

### Plan 11a — DuckDB-Backed Extracts (our `.hyper`)

### Plan 11b — Incremental Refresh + Monotonic-Field Warning

### Plan 11c — Virtual Connection Equivalent (`QueryableResource` protobuf)

### Plan 11d — RLS Data Policies (USERNAME, ISMEMBEROF user-context functions)

Reference `Build_Tableau.md` §XV.

---

## Phase 12 — Extensions API

### Plan 12a — Iframe Host + CSP Sandbox

### Plan 12b — `.trex` Manifest + Dashboard Extensions

### Plan 12c — Viz Extensions (`MarkType.viz-extension` + `customEncodingTypeId`)

### Plan 12d — Analytics Extensions (TabPy/Einstein/Generic-API)

Reference `Build_Tableau.md` §XVI.

---

## Phase 13 — File Format + Versioning

### Plan 13a — Canonical `.askdb` Serializer (Git-native)

- Deterministic attribute order, whitespace, line endings.
- Line-diffable workbooks (leapfrog target, see §XXV.5).

### Plan 13b — `TransformNames` Catalogue + Upgrade/Downgrade/PreviewDowngrade

Reference `Build_Tableau.md` §XVII.

---

## Phase 14 — Multi-user + CRDT (leapfrog)

### Plan 14a — Workgroup-Equivalent API + Tenant Awareness

### Plan 14b — CRDT on Delta Model (real concurrent authoring)

### Plan 14c — Real-Time Cursors + Presence

### Plan 14d — Publishing Flow + Capability Negotiation

Reference `Build_Tableau.md` §XVIII + §XXV.5 (Tableau's delta is almost CRDT-shaped).

---

## Phase 15 — Animation + Telemetry + Perf

### Plan 15a — Mark Enter/Exit/Update Animations

### Plan 15b — Performance Recording (`.tlog` equivalent + profiler workbook)

### Plan 15c — Usage Analytics Stream (TUA-equivalent, separate from telemetry)

Reference `Build_Tableau.md` §XX + §XIX.

---

## Phase 16 — NL Authoring (our differentiator)

### Plan 16a — Metric-First Grounding

Every NL query MUST ground on a declared metric + dimension set. No free-form NL against arbitrary schema.

### Plan 16b — NL Audit Trail

Every AI-generated spec flagged `is_generative_ai_web_authoring=true`; stored in audit log.

### Plan 16c — Clarification Dialog

When confidence < threshold, ask 1–3 targeted questions before generating SQL.

Reference `Build_Tableau.md` §XX.5 (Explain Data / Pulse) + §XXV.4 (Tableau's NL failures) + §XXVI Phase 15 (our NL Authoring plan).

---

## Execution Protocol

1. **One plan per scheduled task.** Each scheduled task reads `docs/Build_Tableau.md` + this roadmap + its plan-specific section, writes the implementation plan markdown, commits, and stops.
2. **Separate execution session** dispatches the plan via `superpowers:subagent-driven-development`.
3. **Plans within a phase are ordered** — do not run in parallel unless explicitly marked parallel-safe.
4. **Phase dependencies:**
   - 5 depends on 4e (done).
   - 6 depends on 5.
   - 7 independent of 5/6 but enables 8+.
   - 8 depends on 7.
   - 9 depends on 7.
   - 10 can parallelise with 7/8/9.
   - 11 depends on 7.
   - 12 independent.
   - 13 depends on 4e for canonical migration.
   - 14 depends on 13 (canonical serializer).
   - 15 parallel anytime.
   - 16 depends on 7 + 8 (needs VizQL + calc language).
5. **Tracking.** Each plan doc lives at `docs/superpowers/plans/YYYY-MM-DD-analyst-pro-plan-<X>-<slug>.md`. Update this roadmap's "Phase Index" status column as plans ship.

---

## Hard Anti-Hallucination Checklist (every plan author subagent)

Before writing the plan:
- [ ] Read `docs/Build_Tableau.md` fully (~1,600 lines).
- [ ] Read `QueryCopilot V1/CLAUDE.md` fully.
- [ ] Read this roadmap's plan-specific section.
- [ ] Read the referenced `Build_Tableau.md` part number(s).
- [ ] Run `git log --oneline -40` to confirm prior commits.
- [ ] List existing files in the `frontend/src/components/dashboard/freeform/` subtree.
- [ ] Confirm exact store action/state names via `grep "analystPro" frontend/src/store.js`.

In the plan:
- [ ] Every task step has complete code — no placeholders.
- [ ] Use canonical Tableau enum names from `Build_Tableau.md` Appendix A.
- [ ] Reference exact existing symbols (function names, store keys, file paths).
- [ ] Every new function has at least one unit test defined in the plan.
- [ ] Commit message per step.
- [ ] STOP after saving + committing plan — no implementation.

---

**Maintained at:** `QueryCopilot V1/docs/analyst_pro_tableau_parity_roadmap.md`.
Update this file as plans ship, phases advance, or scope shifts.

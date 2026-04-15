# Trigger: Sub-project A Phase 4c — Cutover + Real Layouts + C/D UI (autonomous)

**Why this doc exists:** Phase 4c is the final layer of the chart-system rebuild. Phase 4b shipped the skeleton DashboardShell + migration script + `NEW_CHART_EDITOR_ENABLED` feature flag behind `/dev/dashboard-shell`. Phase 4c replaces the skeleton layouts with real implementations, wires Sub-projects C (user-authored chart types) and D (semantic layer) into the editor UI, removes ECharts from the new code paths, and preps the flag for a real production flip.

## How to trigger

**Option A — Fresh Claude Code session (recommended)**

1. Open a new Claude Code session (`claude code` from this repo root).
2. Paste the entire contents of `## Prompt` below into the first message.
3. Claude runs the autonomous Phase 4c implementation, commits per logical unit, pushes when done, and reports back.
4. Expected wall clock: 60–120 minutes depending on model speed.

**Option B — `/schedule` skill or `create_scheduled_task` MCP**

From a non-scheduled session:
```
/schedule
```
and paste the prompt. Pick "run once manually".

**Option C — Remote trigger via claude.ai**

Use `RemoteTrigger` API if you want it to run from the mobile app.

---

## State of the world (at trigger creation)

- Branch: `askdb-global-comp` (active dev). Already pushed to origin.
- Latest tags: `v4b-migration-cutover-prep`, `v5-stage-mode`, `v-b3-downsamplers`, `v-c-user-types-foundation`, `v-d-semantic-layer-foundation`.
- Tests green: **276 backend pytest**, **240 frontend vitest** (26 test files), `npx tsc --noEmit -p .` clean, `npm run build` clean.
- **What's already shipped and should NOT be re-done**:
  - A Phase 0–4b (editor shell, Marks card + drag-drop, on-object editing, voice + agent panel, dashboard shell skeleton, migration script + feature flag + dev route)
  - A Phase 5 (six Stage Mode themes + ThemeProvider + creative-lane registry)
  - B Phase 0–B3 (RSR + perf + react-vega mount + all four downsample methods: lttb, uniform, pixel_min_max, aggregate_bin)
  - C foundation (UserChartType + registry + validator + instantiate + backend CRUD at `/api/v1/chart-types`)
  - D foundation (SemanticModel + validator + resolver + compileSemanticSpec + backend CRUD at `/api/v1/semantic-models`)
- **What's still missing** (Phase 4c scope):
  1. Real layout implementations behind the DashboardShell skeleton
  2. MarksCard / Inspector UI for Sub-project C + D
  3. ECharts removal from the new editor code paths (legacy TileEditor keeps ECharts until production flag flip)
  4. Real migration run end-to-end + staging flag flip

---

## Scope ceiling — Phase 4c IN scope

**Priority 1 — must land (these are the highest-value unblocks):**

1. **ExecBriefingLayout real implementation**
   - Importance-scored bin-packing. Reuse the scoring heuristic from `src/components/dashboard/PresentationEngine.jsx` if it exists (KPI > chart > table > SQL-only). If the heuristic isn't factored out, extract it into `src/components/dashboard/lib/importanceScoring.js` so PitchLayout can reuse it.
   - Pack tiles into a responsive 12-column grid with KPI cards at 3–4 columns wide, charts at 6–8 columns, tables full-width.
   - Render each tile with a real chart via `<ChartEditor mode="default" surface="dashboard-tile" />` (the new editor) — NOT via the legacy ResultsChart.

2. **AnalystWorkbenchLayout real implementation**
   - Wire `react-grid-layout` (already in dependencies, check `package.json`). Support drag-resize with `preventCollision: false` + `compactType: 'vertical'`.
   - Persist layout state per dashboard tab via the existing `dashboard_routes.update_tile` endpoint — add a `layout` field to the payload if missing.
   - Render tile content via `<ChartEditor />` like Briefing.

3. **PitchLayout real implementation**
   - Mount the existing `PresentationEngine.jsx` component inside PitchLayout, but pass it the new ChartSpec tile array (convert on the fly from `tile.chart_spec` → ChartSpec). PresentationEngine's bin-packing logic should stay intact; only the chart renderer inside it changes from ResultsChart to ChartEditor.

4. **Sub-project C — MarksCard integration**
   - Extend the existing `src/components/editor/MarksCard.jsx` with a new "Custom" section that lists registered user chart types from `UserChartTypeRegistry` (or fetches them via `api.listChartTypes()` on mount).
   - Clicking a user chart type opens a parameter-binding popover that collects the `${param}` values and calls `UserChartTypeRegistry.instantiate()` → dispatches `onSpecChange(nextSpec)`.
   - Alternatively, add a new "Chart picker" button next to the Marks card that opens a modal listing built-in marks + user-authored types side by side. Either approach is fine; pick the one that minimizes MarksCard surface churn.

5. **Sub-project D — Semantic field picker in Inspector**
   - Add a "Semantic fields" accordion in `Inspector/InspectorRoot.jsx`'s Setup tab (above or below the existing MarksCard) that lists the active SemanticModel's dimensions / measures / metrics.
   - Each entry is draggable with the same `application/x-askdb-field` payload as DataRail pills, but the payload includes a `semantic: { dimension | measure | metric }` envelope.
   - `ChannelSlot` receives the drop and, when the payload has a `semantic` envelope, calls `compileSemanticSpec(spec, model)` via `applySpecPatch` to produce a ChartSpec with the resolved FieldRef + any required calculate transforms.
   - The active SemanticModel comes from a new Zustand slice `activeSemanticModel` that's hydrated from `api.listSemanticModels()` on editor mount.

6. **ECharts removal from new editor paths**
   - Search the new editor code under `src/components/editor/**`, `src/components/dashboard/DashboardShell.jsx`, `src/components/dashboard/modes/**` for any `echarts-for-react` or `echarts` imports and remove them. The legacy `ResultsChart.jsx` + `CanvasChart.jsx` keep ECharts until the production flag flip.
   - Do NOT remove `echarts` / `echarts-for-react` from `package.json`. That's Phase 4c+1.

**Priority 2 — should land (if budget allows):**

7. **LiveOpsLayout WebSocket refresh**
   - Frontend: add a `useDashboardRefresh(tileIds, intervalMs)` hook that opens an SSE connection to a new `/api/v1/dashboards/{id}/refresh-stream` backend endpoint. Tiles receive re-run signals every 5 seconds.
   - Backend: add the SSE endpoint to `routers/dashboard_routes.py` that re-executes the tile's SQL on the user's active connection and streams fresh result rows.

8. **StoryLayout IntersectionObserver scrollytelling**
   - Wrap each story chapter in a `<section>` watched by an IntersectionObserver.
   - When a section enters the viewport, emit an `onChapterEnter(chapterId)` callback and pulse the annotation column.

9. **WorkbookLayout shared filter bar**
   - Extend `src/components/dashboard/GlobalFilterBar.jsx` (or equivalent) with a workbook-level filter bar that pushes a filter context down to every tile via React context.
   - The filter context translates to an extra `where` clause appended to the tile's SQL at execution time.

**Priority 3 — nice to have (defer if budget tight):**

10. **Real migration run end-to-end**
    - Start both servers. For the demo user, POST `/api/v1/dashboards/migrate` and verify every tile in the response has a `chart_spec` field.
    - Visually confirm at least one migrated dashboard renders correctly inside `/dev/dashboard-shell`.

11. **Staging flag flip preparation**
    - Document the flip steps in `docs/PHASE_4C_FLIP_PLAN.md`: backup → migration → flip → smoke test → rollback procedure.
    - Do NOT actually flip `NEW_CHART_EDITOR_ENABLED` in this session. That's a user decision.

---

## Scope ceiling — OUT of scope

- Full ECharts dependency removal from `package.json` (Phase 4c+1)
- Actually flipping `NEW_CHART_EDITOR_ENABLED` in production or staging (needs user signoff)
- Rewriting the legacy `TileEditor.jsx` / `ResultsChart.jsx` — those stay as rollback safety until the flag flips
- New agent tools for Phase 4c (the existing `create_dashboard_tile` / `update_dashboard_tile` / `delete_dashboard_tile` suffice)
- Three.js Hologram / ParticleFlow binding (Phase 5 already registered them in the creative lane)
- Real vendor voice adapters (still stubbed — that's a separate B Phase 4 task)

---

## How to work

Follow the superpowers:subagent-driven-development skill pattern or inline execution — whichever preserves the most token budget. Inline with batched commits per Priority boundary is recommended.

TDD where practical: test first for pure logic (importance scoring, semantic field drop handler, user type instantiation callbacks), snapshot-after for visual layout components.

Commit per logical unit. Use this prefix convention:
- `feat(a4c): <thing>` for Phase 4c feature work
- `test(a4c): <thing>` for test-only changes
- `chore(a4c): <thing>` for devDep or config bumps
- `refactor(a4c): <thing>` for extracted modules (e.g. importance scoring extraction)

## Gotchas

1. **`react-grid-layout` style import** — if the CSS imports break the build, follow Vite's conditional CSS import pattern (`import 'react-grid-layout/css/styles.css'`). Check the existing `dashboard/CanvasChart.jsx` for the current pattern.
2. **DashboardShell is already mounted at `/dev/dashboard-shell`** — don't re-add the route, just upgrade the layouts.
3. **PresentationEngine.jsx expects legacy tiles** — you'll need a `legacyTileFromSpec(tile, spec)` adapter or pass a wrapper that renders `<ChartEditor spec={...} />` through PresentationEngine's slot.
4. **Inspector's Setup tab currently mounts `<MarksCard />`** — add the semantic accordion above/below without removing MarksCard.
5. **ChannelSlot's drop handler already validates via `CHANNEL_ALLOW`** — the semantic-aware path needs to validate semantic refs against `semanticType` compatibility too (dimension with semanticType='nominal' into a Color slot works; a metric into a Color slot only makes sense if the metric's synthetic field is quantitative).
6. **chartEditor store already has `currentSpec + history`** — the semantic model state should live in a sibling slice `activeSemanticModel` so history stays spec-scoped.
7. **Don't break 240 vitest / 276 pytest baseline** — every commit should end with both green.
8. **Verify live** — at minimum, run `/dev/chart-editor` and `/dev/dashboard-shell` via `preview_start` + `preview_snapshot` after Priority 1 lands. Visual confirmation of: MarksCard with user-type section, briefing layout with real tiles, workbench drag-resize.

## When done

1. Run: `cd backend && python -m pytest tests/ -q` → expect 276+ pass, no regressions
2. Run: `cd frontend && npm run test:chart-ir` → expect 240+ pass (Phase 4c adds its own tests)
3. Run: `cd frontend && npx tsc --noEmit -p .` → expect clean
4. Run: `cd frontend && npm run build` → expect clean
5. Start both servers, navigate to `/dev/dashboard-shell`, visually confirm all six modes render real content. Take screenshots for the status report.
6. Tag `v4c-cutover-ready` at the final Phase 4c commit.
7. Push branch + tag: `git push origin askdb-global-comp && git push origin v4c-cutover-ready`.
8. Write a status report covering:
   - Commit SHAs + file list
   - Test counts (before / after)
   - Which priority items landed vs deferred
   - Screenshots of `/dev/chart-editor` (with C+D UI) and `/dev/dashboard-shell` (with real layouts)
   - Ready-for-flag-flip assessment — what still blocks the production flip?
   - Any architectural decisions that need user signoff before flipping

## Scope ceiling (reminder)

Do NOT during this run:
- Flip `NEW_CHART_EDITOR_ENABLED` in production or staging
- Delete `echarts` / `echarts-for-react` from `package.json`
- Touch `ResultsChart.jsx` / `TileEditor.jsx` / `CanvasChart.jsx` (rollback safety)
- Add new agent tools (existing ones suffice)
- Start real vendor voice adapter work

If you hit a blocker, stop and report `DONE_WITH_CONCERNS`. Don't force work through architectural uncertainty — the user would rather have a clean partial deliverable than a broken full one.

## Final ask

If Phase 4c Priority 1 lands cleanly, mention that the next logical tasks are:
- `docs/PHASE_4C_FLIP_PLAN.md` review + signoff
- Actual staging flag flip
- Phase 4c+1: `echarts` dependency removal from `package.json`

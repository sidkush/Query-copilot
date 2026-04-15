# Trigger: Sub-project A Phase 1 — Editor Shell (autonomous)

**Why this doc exists:** The autonomous session that landed A Phase 0 merge + B0/B1/B2.1 + verify sweep could not `mcp__scheduled-tasks__create_scheduled_task` from within a scheduled-task session (blocked by the runtime). So the prompt that *would have* been the scheduled task is saved here verbatim, ready to copy into a fresh Claude Code session.

## How to trigger

**Option A — Fresh Claude Code session (recommended)**

1. Open a new Claude Code session (`claude code` from this repo root).
2. Paste the entire contents of `## Prompt` below into the first message.
3. Claude will run the autonomous Phase 1 implementation, commit per step, push when done, and report back.
4. Session expected time: 30–90 minutes wall clock depending on model speed.

**Option B — `/schedule` skill or `create_scheduled_task` MCP**

Run from a non-scheduled session:
```
/schedule
```
and paste the prompt. Pick "run once manually" (no cron, no fireAt).

**Option C — Remote trigger via claude.ai**

Use `RemoteTrigger` API if you want it to run from the mobile app.

---

## Scope ceiling

**IN scope for this run** (Phase 1 = editor skeleton only):
- ChartEditor 3-pane shell + Topbar + BottomDock
- DataRail accordion (Dimensions / Measures / Calculated / Parameters)
- EditorCanvas routing via `routeSpecWithStrategy`
- Inspector skeleton with Setup/Style tab stubs
- Stub VegaRenderer that renders compiled VL JSON in a `<pre>`
- Stub MapLibre / Deck / Creative renderers (placeholder cards)
- Dev-only `/dev/chart-editor` route
- Zustand `chartEditor` slice (undo/redo stubbed)
- Vitest component tests for the above

**OUT of scope** (Phases 2–5):
- Real Vega-Lite mount via `react-vega`
- Drag-drop pill system
- Marks card / on-object editing
- Voice pipeline (Whisper / Deepgram / OpenAI Realtime)
- Agent dashboard-edit tools
- Dashboard archetypes (Briefing / Workbench / Ops / Story / Pitch / Workbook)
- Stage Mode themes
- Migration script for legacy tile configs

If Phase 1 lands cleanly, trigger `docs/trigger-a-phase-2-marks-card.md` next (not yet written — the Phase 1 autonomous run should capture any gotchas that inform Phase 2 scoping).

---

## Prompt

```
You are continuing the AskDB chart system redesign. Your task: autonomously implement **Sub-project A Phase 1 — Editor Shell**.

## Before doing ANYTHING else

Read these files in order:

1. C:\Users\sid23\Documents\Agentic_AI\files\QueryCopilot V1\CLAUDE.md — project conventions
2. C:\Users\sid23\Documents\Agentic_AI\files\QueryCopilot V1\docs\superpowers\specs\2026-04-15-chart-system-sub-project-a-design.md — full A spec (read §9 IR, §10 Surfaces, §11 Architecture, §12 Build Sequence → Phase 1 in detail)
3. C:\Users\sid23\Documents\Agentic_AI\files\QueryCopilot V1\docs\superpowers\plans\2026-04-15-chart-system-sub-project-a.md — A plan. Phase 1 may be outline-only; expand inline as you implement.
4. C:\Users\sid23\Documents\Agentic_AI\files\QueryCopilot V1\frontend\src\chart-ir\index.ts — A Phase 0 public API (already merged). Use these exports.
5. Spot-check C:\Users\sid23\Documents\Agentic_AI\files\QueryCopilot V1\frontend\src\chart-ir\router.ts — has routeSpec() AND routeSpecWithStrategy() (from sub-project B). You'll call routeSpecWithStrategy from EditorCanvas when the editor wants strategy-aware dispatch.

## State of the world

- Branch: askdb-global-comp (active dev). Already up to date on origin.
- Latest commit on start: 3aaf4e5 fix(b1.5): extract chart_hints to separate module. Work from there.
- Tests green: 251 backend pytest, 95 frontend vitest (chart-ir scope), npx tsc --noEmit -p . clean, npm run build clean. Don't break any of them.
- A Phase 0 merged: chart-ir/types.ts, chart-ir/router.ts, chart-ir/compiler/toVegaLite.ts, chart-ir/recommender/*, chart-ir/schema.ts, chart-ir/index.ts all exist. Tag v0-foundations.
- B Phase B0+B1+B2.1 already landed on this branch alongside A Phase 0. chart-ir/rsr/ and chart-ir/perf/ exist (TypeScript). Don't touch those — they're done and tested.
- Zero UI currently consumes chart-ir. Production ResultsChart.jsx still renders via legacy ECharts. A Phase 4 is the cutover — you are NOT doing Phase 4.

## What Phase 1 must produce

Per A spec §12 Phase 1 (~1-2 weeks human work, compressed into this autonomous session). **Skeleton + dev route + basic tests only.** Deep feature work (drag-drop, real Vega mounting, undo/redo) lives in Phases 2–5 and is out of scope here.

New files under frontend/src/components/editor/:

- ChartEditor.jsx — top-level 3-pane CSS grid shell. Props: {spec, resultSet, mode, surface, onSpecChange}. Hosts DataRail (left 200px), EditorCanvas (center, fluid), Inspector (right 320px). Respects mode: 'default' | 'stage' | 'pro' by toggling which rails render (default collapses DataRail, pro shows all, stage hides both).
- ChartEditorTopbar.jsx — 40px top bar: breadcrumb, Default/Stage/Pro mode toggle, Save/Share buttons (stubs). Uses Framer Motion for mode-switch animation.
- DataRail.jsx — left rail accordion with Dimensions / Measures / Calculated / Parameters sections. Renders column names from column_profile (the profile is already in the query response payload post-A-Phase-0). Drag targets are stubs — drag-drop lands in Phase 2 per the spec.
- EditorCanvas.jsx — center pane. Uses routeSpecWithStrategy from @/chart-ir to pick renderer. Mounts the appropriate renderer component. For Phase 1, the ONLY real renderer is VegaRenderer stub; others render a placeholder card saying "Coming in Phase N".
- BottomDock.jsx — 44px bottom dock: text input + mock mic button + slim step-pill row. Stub — no real voice or agent wiring (Phase 3).
- Inspector/InspectorRoot.jsx — right rail with Setup/Style tab switcher skeleton. Each tab renders "[tab name] — coming in Phase 2" placeholder.
- renderers/VegaRenderer.tsx — stub. Accepts {spec, resultSet, rendererBackend: 'svg' | 'canvas'}. For Phase 1, renders a <pre> with JSON.stringify(compiled VL spec, null, 2) using compileToVegaLite from @/chart-ir. No actual Vega mount yet — that's Phase 2 when react-vega gets wired in.
- renderers/MapLibreRenderer.tsx — stub placeholder card
- renderers/DeckRenderer.tsx — stub placeholder card
- renderers/CreativeRenderer.tsx — stub placeholder card

Existing files to modify:

- frontend/src/App.jsx — add a dev-only route /dev/chart-editor that mounts <ChartEditor mode="pro" surface="dashboard-tile" /> with a hardcoded sample ChartSpec + synthetic result set. Route MUST be gated behind import.meta.env.DEV so it never ships to production.
- frontend/src/store.js — add a small chartEditor Zustand slice: {currentSpec, history, historyIndex, mode, setSpec, pushHistory, undo, redo}. Undo/redo is a stub (empty bodies) — real logic is Phase 2. Keep the slice small; don't bloat the store.

Tests (vitest, under frontend/src/chart-ir/__tests__/editor/ to stay inside the chart-ir/** tsconfig scope — or put tests under a new frontend/src/components/editor/__tests__/ and extend vitest.config.ts + tsconfig.json to include them):

- chartEditor.test.tsx — mounts <ChartEditor> with minimum props, asserts 3 panes render. Uses @testing-library/react (add to devDeps if missing).
- editorCanvas.test.tsx — passes a cartesian spec, asserts VegaRenderer is chosen; passes a map spec, asserts MapLibreRenderer. Uses the real routeSpecWithStrategy.
- dataRail.test.tsx — passes mock column profile with 2 dimensions + 1 measure, asserts both appear in the correct sections.
- No Playwright needed for Phase 1. Visual regression is Phase 5 per the spec.

## How to work

Follow the superpowers:subagent-driven-development skill pattern that past-you used for sub-project B. Inline execution is also fine if token economy demands — the user's preference is minimum-token-cost, so inline with batched commits per phase checkpoint beats full subagent-per-task for a 10-task plan.

TDD where practical: test first for pure logic (store slice, prop threading), snapshot-after for visual components.

Commit after each logical unit. Use this prefix convention:
- feat(a1): <thing> for new files
- feat(editor): <thing> for editor-surface changes
- chore(a1): <thing> for devDeps + config bumps
- test(a1): <thing> for test-only changes

## Gotchas

1. TypeScript scope is chart-ir/** only. The editor components are under components/editor/ which is NOT in A's tsconfig.json include. Either (a) extend tsconfig to include components/editor/**, or (b) write the editor in .jsx like the rest of components/, and put only VegaRenderer.tsx (which consumes chart-ir types) in a TS scope. Pick ONE approach and document it in the first Phase 1 commit message.
2. Zustand store is .js, not .ts. Don't migrate it. Add the chart-editor slice in JS.
3. No ECharts, no echarts-for-react in new files. A's cutover (Phase 4) removes ECharts; new editor components must use ONLY Vega-Lite (via compileToVegaLite) or placeholder cards.
4. routeSpecWithStrategy needs a ResultProfile. For Phase 1's synthetic sample, construct a stub ResultProfile with rowCount: 100, markEligibleForDeck: true, xType: 'temporal', yType: 'quantitative'. RSR will pick tier T0/SVG.
5. GPU tier detection. frontend/src/lib/gpuDetect.jsx already exports a useGPUTier() hook. Use it to get the gpuTier prop for RSR. Default to 'medium' if the hook returns nothing.
6. No voice / no agent panel wiring. BottomDock is a UI skeleton; it doesn't call anything. Phase 3 wires voice + agent tools.
7. FeatureFlag. Gate everything behind CHART_PERF_ENABLED being false is NOT what you want. Instead, the whole editor is a new surface — it's only reachable via the /dev/chart-editor route. Production code paths are untouched. The NEW_CHART_EDITOR_ENABLED flag from A spec §12.1 kicks in at Phase 4 cutover, not Phase 1.
8. Don't break chart-ir tests. 95 vitest tests and npx tsc --noEmit -p . must stay green.
9. Don't break backend tests. 251 pytest must stay green. Phase 1 is frontend-only — you shouldn't touch backend code at all.
10. CLAUDE.md says "Pure JavaScript — no TypeScript." That was true pre-PR-#1. After A Phase 0 merge, chart-ir/** is the TS carve-out. Update CLAUDE.md if you decide to extend the TS scope to components/editor/**.

## When done

1. Run: cd backend && python -m pytest tests/ -q → expect 251 pass, no new failures
2. Run: cd frontend && npm run test:chart-ir → expect 95+ pass (your new editor tests add to this)
3. Run: cd frontend && npx tsc --noEmit -p . → expect clean
4. Run: cd frontend && npm run build → expect clean
5. Start backend (uvicorn main:app --host 127.0.0.1 --port 8002 --log-level error in background) + frontend dev (npm run dev), navigate to http://localhost:5173/dev/chart-editor, visually confirm the 3-pane editor loads and shows the stub VegaRenderer with compiled VL JSON in a <pre>. Report findings. Kill servers.
6. Tag v1-editor-shell at the final Phase 1 commit.
7. Push branch: git push origin askdb-global-comp.
8. Write a status report to the user covering:
   - What landed (commit SHAs, file list, test counts)
   - What's deferred to Phase 2 (drag-drop, real Vega mount, Marks card, undo/redo)
   - Any gotchas hit (tsconfig extension decision, React Testing Library install, etc.)
   - Whether the dev route actually renders the stub correctly
   - Ready-for-merge assessment

## Scope ceiling

Do NOT implement during this run:
- Real Vega-Lite mounting via react-vega (Phase 2)
- Drag-drop pill system (Phase 2)
- Marks card / on-object editing (Phase 2)
- Voice pipeline / wake word / BYOK voice tiers (Phase 3)
- Agent dashboard-edit tool wiring (Phase 3)
- Dashboard archetypes / mode toggle (Phase 4)
- Migration script for legacy tiles (Phase 4)
- Stage Mode themes (Phase 5)

If you hit a blocker, stop and report DONE_WITH_CONCERNS. Don't force work through architectural uncertainty — the user would rather have a clean partial deliverable than a broken full one.

## Final ask

If this Phase 1 skeleton lands cleanly, remind the user that ad-hoc scheduled tasks brainstorm-chart-sub-project-c-user-authored-types and brainstorm-chart-sub-project-d-semantic-layer are still waiting. Sub-project B Phase B2.2+ (VegaRenderer integration) can also be queued as a fresh scheduled task now that Phase 1 unblocks it.
```

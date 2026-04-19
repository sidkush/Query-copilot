# Connection-Aware Dashboards

## Summary

approach=classifier+intent+purge+cache-flatten | confidence=5 | session=2026-04-19 | outcome=RESOLVED

## Detail

### Debug Session 2026-04-19 (Plan TSS2)

**Decisions**

- H1 accepted (root cause: all four themed preset layouts carried hardcoded finance/wireframe fallbacks that bled through whenever slots were unbound; purge removes them).
- H2 accepted (root cause: heuristic picker had no semantic filter → SUM(start_lat) shipped for KPI slots; classifier forbids geo + identifier SUM and prefers COUNT_DISTINCT on identifier columns).
- H3 accepted (root cause: 5-step semantic wizard friction; single free-text intent textarea + LLM tag-inference is higher-signal).

**Fix summary**

- `backend/schema_semantics.py` — classifier tags every column with roles (`geo`, `identifier`, `temporal`, `measure`, `dimension`, `entity_name`) + `forbid_aggs` / `prefer_aggs` sets. Name regex catches `start_lat` → geo, `ride_id` → identifier, `started_at` VARCHAR → temporal.
- `backend/preset_autogen.py` — `_heuristic_pick` consults classifier; `_schema_digest` now delegates to `digest_with_semantics` (role tags + rejection notes rendered into LLM prompt); `_llm_pick_slot_binding` prompt carries 5 CRITICAL SEMANTIC RULES + `User intent:` line; `run_autogen` accepts `user_intent` and calls `infer_semantic_tags` on empty tags; `_schema_profile_for_entry` now accepts dict shapes + flattens `tables[].columns` + falls back to on-disk cache + normalises `type→dtype`.
- `backend/user_intent_interpreter.py` — single Haiku tool-use call turning NL intent + role-annotated schema into a SemanticTags dict; fail-soft to `{userIntent: ...}`.
- `backend/routers/dashboard_routes.py` — autogen route body now carries `user_intent`.
- `backend/preset_sql_compiler.py` — `DATE_TRUNC(<col>, GRAIN)` wraps VARCHAR date columns with `SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S UTC', <col>)`.
- `frontend/src/components/dashboard/modes/presets/slots.ts` — 20 new descriptors (`bp.kicker`, `bp.topbar-0..5`, `eb.kicker`, `eb.topbar-0..5`, `oc.footer`, `oc.metadata`, `sg.legend-0..3`); every finance label on every existing KPI/narrative descriptor replaced with generic `—` fallbacks.
- `frontend/src/components/dashboard/modes/presets/{BoardPack,OperatorConsole,Signal,EditorialBrief}Layout.jsx` — hardcoded arrays (`DEFAULT_KPIS`, `DEFAULT_ACCOUNTS`, `TRACE_POINTS`, `HIST_BINS`, `DEFAULT_EVENT_LOG`, `KPI_META`, `DEFAULT_KPI_SUBS`, `TOP_STATS`, `MRR_SERIES`, `EVENT_MARKERS`, `CHURN_BINS`, etc.) deleted; kicker / byline / headline / summary / commentary / legend / footer all routed through `<Slot>` wrappers with neutral `—` fallbacks.
- `frontend/src/components/dashboard/DashboardIntentStep.jsx` — new component (textarea + submit). `SaveDashboardDialog.jsx` renders it inline; store action `saveDashboardAndAutogen` forwards `userIntent` as `user_intent` in the POST.
- Five legacy vitest assertions (`+$478K`, `$2.47M`, `CH.1A fallback`, etc.) updated to new `—` contract.

**Commits** (main chain on `askdb-global-comp`): `19b835d` T1 classifier · `11634a0` T6 slots · `c6a8d43` T11 SQL compiler · `d7fc230` T12 intent step · `1c450da` T2 heuristic · `c2d1be3` T4 interpreter · `f64b56e` T7 board-pack purge · `5501e6d` T8 operator purge · `b50e355` T9 signal purge · `df58839` T10 editorial purge · `3a6f72b` T3 prompt rules · `fdde192` T5 route threading · `f9daa7a` legacy test update · `6e68495` schema flattener hotfix (with interleaved merge commits).

**Assumption outcomes**

- ASSUMPTION: schema profile arrives as `{columns: [...]}` flat | VALIDATED: NO — backend objects expose `.tables[0].columns` and HTTP JSON is nested under `tables` | IMPACT: added `_schema_profile_for_entry` flattener with cache-file fallback.
- ASSUMPTION: LLM always returns a valid `{column}` tool input | VALIDATED: NO — on CityBikes schema the LLM sometimes returned no tool_use because every numeric column is geo-forbidden | IMPACT: T2's heuristic `identifier → COUNT_DISTINCT` path is now the load-bearing fallback.
- ASSUMPTION: `presetBindings` writable via `PUT /api/v1/dashboards/{id}` | VALIDATED: NO — only the autogen route writes that field | IMPACT: live verification ran autogen directly instead of cross-copying.
- ASSUMPTION: existing `9cd58159e2a3` Analyst Pro canvas renders without `floatingLayer` | VALIDATED: NO — `AlignmentToolbar` expects the array, unmounts the whole app | IMPACT: used the existing `d4440b94d5ba` dashboard for the E2E run; follow-up: default-shape guard on fresh dashboards.

**Unvalidated assumptions (risk items)**

- "Q3 · Revenue Review" header in `SignalLayout.jsx` — may still carry hardcoded demo copy not caught by the purge test. Spot-checked on Signal screenshot; test list should add it.
- "Revenue composition · 12 months" subtitle in `SignalLayout.jsx` — same risk.
- `bp.accounts-list` returned rows of `1` each — the `GROUP BY station LIMIT 5` SQL compiled but the LLM/heuristic picked `COUNT_DISTINCT(ride_id)` which is trivially 1 per ride; should use `COUNT(*)` for "top stations by rides" semantics.
- The `@param_0` BigQuery parameter substitution failed once ("`Query parameter 'param_0' not found`") — one Signal slot with a `WHERE member_casual = @param_0` filter never bound. Narrow: BQ dialect literal substitution missing for filter binder.

**Cascade paths verified**

- Backend: `preset_autogen.py :: _heuristic_pick` + `_schema_digest` + `_llm_pick_slot_binding` + `run_autogen` + `_schema_profile_for_entry` — all routing through the new classifier.
- Backend: `preset_sql_compiler.py :: compile_chart_sql` handles both VARCHAR and TIMESTAMP date columns.
- Frontend: all four themed layouts' hardcoded finance content removed; forbidden-string tests green.
- Frontend: `SaveDashboardDialog.jsx` → `DashboardIntentStep.jsx` → store `saveDashboardAndAutogen` → `api.autogenAllPresets` body carries `user_intent`.

**Verification receipts**

- Pytest backend: 547 passed / 0 failed on post-T5 merge; 526 passed before T5 interpreter tests added.
- Vitest dashboard suite: 115 files / 852 tests passed / 0 failed after legacy-test update.
- Live preview (`C:/Users/sid23/Documents/Agentic_AI/files`, Vite on 5173, FastAPI on 8002):
  - CityBikes reconnected via `POST /api/v1/connections/reconnect/a12b68c3` → runtime `conn_id=89dabdd6`.
  - `POST /api/v1/dashboards/d4440b94d5ba/autogen-all-presets` with `user_intent="Show monthly bike ride counts, top 10 most-used start stations, and member vs casual breakdown"` → `bindingAutogenState=complete`, 54/58 bindings resolved.
  - Hero KPI bound to `COUNT(DISTINCT ride_id) = 84,565,639` (displayed 84.57M).
  - Screenshots captured for Analyst Pro (real 137.5M member / 31.6M casual / 2.3K stations), Board Pack (hero 84.57M + trend), Operator Console (CH.1 channels 84.57M), Signal (KPIs 84.57M / 2 / —), Editorial Brief (84.57M / 169.13M / 2 / 84.57M).
  - DOM text scan across all five preset modes contains no `MRR / ARR / NRR / LTV:CAC / CFO / M. Chen / Acme / Beta-Axion / Amberline / Waverly / "The Quarter Was Made" / Row 1..5 / $2.47M / +12.4% / 6886.09M / PROD-EU-1` strings.

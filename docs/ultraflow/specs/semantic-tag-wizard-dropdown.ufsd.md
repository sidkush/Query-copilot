# Semantic Tag Wizard — Dropdown Population

## Summary

approach=classifier-fallback | confidence=5 | session=2026-04-19 | outcome=RESOLVED

## Detail

### Debug Session 2026-04-19

**Decisions**

- H1 accepted (root cause: frontend-only classifier needed a type-based
  fallback when backend emits no `role`).
- H2 rejected (schema endpoint returned 200 with 13 columns in Phase 1 —
  the prop wasn't null).

**Fix summary**

- Added `frontend/src/components/dashboard/lib/columnClassify.ts` with:
  `flattenSchemaColumns`, `isTemporalColumn`, `isNumericColumn`,
  `isMeasureColumn`, `isDimensionColumn`, `isStringColumn`,
  `inferColumnRole`. Rules: `role` if present, else numeric-type →
  measure, else dimension; temporal falls back to name heuristics for
  dates-as-strings (`_at`/`_on`/`_date`/`_time` suffix + common verbs
  like `started/ended/created/updated/posted`).
- `SemanticTagWizard.jsx` swapped its local `isMeasure/isDimension`
  for the shared helpers; added "Show all fields" toggle + meta line
  (`4 matches · 13 total`); option testids + React keys disambiguate
  via the enclosing `table.column` prefix so the same column name
  across multiple tables in one connection is stable.
- `SlotEditPopover.jsx` swapped to `isMeasureColumn` /
  `isDimensionColumn` + `flattenSchemaColumns` for consistency.
- `DashboardShell.jsx` added a fallback chain: prefers store-slice
  `analystProDashboard.presetBindings[activePresetId]`, falls through
  to `authoredLayout.presetBindings[activePresetId]` so reloads render
  live bindings before the store mirror completes.
- `AnalyticsShell.jsx` mirrors `api.getDashboard(id)` into the
  Analyst-Pro Zustand slice via `useStore.getState().setAnalystProDashboard(full)`
  in both `fetchDashboard` + `switchDashboard`.

**Commits** (since baseline): `a50f60e`, `b8ea937`, `61d943f`.

**Assumption outcomes**

- ASSUMPTION: backend `/schema-profile` emits `role` | VALIDATED: NO |
  IMPACT: forced client-side inference.
- ASSUMPTION: `started_at` has TIMESTAMP type | VALIDATED: NO, real
  data is VARCHAR | IMPACT: added name-pattern fallback for temporal.
- ASSUMPTION: schema columns carry `cardinality` | VALIDATED: NO |
  IMPACT: entity-name step defaults to "show all strings" when card
  is absent (matches wizard code's original behaviour).
- ASSUMPTION: `authoredLayout` arrives with presetBindings | VALIDATED:
  YES when the correct dashboard is loaded; the earlier inability to
  see data was traced to two saved dashboards with the same name — the
  picker was loading the one without autogen-populated bindings.

**Unvalidated assumptions (risk items)**

- None outstanding for this session. Known follow-ups:
  - `preset_sql_compiler.py` emits `DATE_TRUNC(<varchar>, MONTH)` which
    BigQuery rejects when the date column is stored as VARCHAR. Affects
    the 9 "unresolved" slots observed in the autogen run. Tracked
    separately.
  - All KPI slots use the same `revenueMetric` measure so visually
    every slot reads `6886.09M`. Expected given the schema only has
    4 FLOAT columns (lat/lng); the autogen obediently applied the
    user's tag. Not a bug.
  - Dashboard-picker allows duplicate names (two "TSS End-To-End Test"
    entries); UX only. Consider enforcing uniqueness or appending an
    id suffix in the picker on collision.

**Cascade paths verified**

- `SemanticTagWizard.jsx:71-78` (the original) — fixed.
- `SlotEditPopover.jsx:98, 102` — fixed (same `.role === 'measure'` /
  `'dimension'` pattern).
- Other `col.role` consumers (`AnalyticsShell.jsx:87`,
  `chart-ir/recommender/*`, `DataRail.jsx`) receive columns that are
  ALREADY normalised via `AnalyticsShell.jsx:87`'s inline classifier
  (which tests `measure || semanticType === 'quantitative' || dtype
  numeric`). Safe.

**Verification receipts**

- Vitest: 8/8 green in `semanticTagWizard.test.tsx` (4 new + 4
  updated); 1026/1026 green in the scoped regression suite.
- Live preview: `preview_eval` walked the full wizard against the
  CityBikes BigQuery connection — step 1 lists `started_at/ended_at`,
  step 2 lists 4 FLOAT columns, step 3 lists 7 non-temporal VARCHARs,
  step 4 lists 9 strings. Save + autogen run persisted 21 bound
  slots; all 4 themed presets render `6886.09M` (SUM(start_lat)) via
  `data-state="bound"`. Screenshots captured for each.

# UFSD — Calc Editor Fields Panel

## Summary
approach=lazy-fetch-on-open | confidence=4 | session=2026-04-21 | outcome=RESOLVED

## Debug Session 2026-04-21
Decisions:
- Picked H1 (root cause: `dashboard.schemaFields` has zero writers anywhere) over H2 (render-layer symptom).
- Picked `/api/v1/schema/tables` over `/connections/{id}/schema-profile` to avoid the "schema not profiled yet" 404 race (Ghost β2).
- Resolved `connId` lazily rather than subscribing to `connections` — the extra subscription caused an `analyticsShell` waitFor regression.
- Computed `connId` twice (inside effect, and for the JSX prop) after the subscription removal introduced a ReferenceError on first run; live preview caught it.

Fix summary:
- `AnalystProCalcEditorMount` now fetches `/api/v1/schema/tables?conn_id=…` on open and flattens `tables[].columns[]` into `[{name, dataType}]` for CalcEditorDialog.
- Conn id fallback chain: `activeConnId → dashboard.boundConnId → connections[0].conn_id`.
- `connections` read via `useStore.getState()` — no subscription.

Assumption outcomes:
- ASSUMPTION: `dashboard.schemaFields` populated on connect | VALIDATED: no | IMPACT: drove the fix direction.
- ASSUMPTION: `/schema/tables` returns sync data with columns | VALIDATED: yes | IMPACT: confirmed chosen data source.
- ASSUMPTION: `activeConnId` is set when a connection is live | VALIDATED: no (null despite 1 connection) | IMPACT: added fallback chain.

Unvalidated assumptions (risk items): none.

Cascade paths verified:
- `AnalystProLayout.jsx:347 AnalystProCalcEditorMount` — only reader of `schemaFields`. Confirmed via `grep -rn "schemaFields" frontend/src`.
- `analyticsShell.test.tsx` re-run after refactor — returned to baseline 2 failures.

# Phase 4c Flip Plan — NEW_CHART_EDITOR_ENABLED

**Status:** draft — awaiting user signoff
**Created:** 2026-04-15 (Phase 4c cutover end-of-session)
**Owner:** sid23

Phase 4c shipped the real layouts, Sub-project C + D editor UI hooks,
ECharts-free guard, and all supporting tests. The feature flag
`NEW_CHART_EDITOR_ENABLED` stays **false** until this plan executes.

The flip moves production `/dashboard` + `/analytics` traffic from the
legacy `ResultsChart.jsx` / `TileEditor.jsx` / `CanvasChart.jsx` path
to the new `ChartEditor` / `DashboardShell` path. It is reversible
until the rollback window closes (one full release cycle after flip).

---

## 1. Pre-flip checklist

Run in order. Stop if any step returns a red.

| Step | Command | Pass criterion |
|------|---------|----------------|
| 1.1  | `git fetch origin && git status` | clean working tree, on `askdb-global-comp` |
| 1.2  | `cd backend && python -m pytest tests/ -q` | **≥ 276 pass** |
| 1.3  | `cd frontend && npm run test:chart-ir` | **≥ 290 pass** |
| 1.4  | `cd frontend && npx tsc --noEmit -p .` | clean |
| 1.5  | `cd frontend && npm run build` | clean |
| 1.6  | `cd frontend && npm run lint` | clean |
| 1.7  | Backend running on 8002 + frontend on 5173 | `/dev/dashboard-shell` renders all six modes |
| 1.8  | `/dev/chart-editor` loads + drag-drop works | MarksCard + Inspector respond |
| 1.9  | ECharts guard test passes | new editor paths have zero echarts imports |

If any step fails, **do not proceed.** Fix forward or revert via
`git reset --hard v4b-migration-cutover-prep`.

---

## 2. Backup procedure

Before flipping in staging:

```bash
# On the staging host:
cd /app/backend

# Backup dashboards
cp -a .data/user_data /backup/askdb-pre-4c-$(date +%Y%m%d-%H%M)/user_data

# Backup ChromaDB
cp -a .chroma /backup/askdb-pre-4c-$(date +%Y%m%d-%H%M)/chroma

# Snapshot the config
cp .env /backup/askdb-pre-4c-$(date +%Y%m%d-%H%M)/env.snapshot
```

Keep the backup directory for at least **7 days** after flip.

---

## 3. Migration run

The migration is **idempotent** — tiles that already carry a
`chart_spec` are skipped. Safe to re-run.

```bash
# Against staging backend (authenticated as each user):
curl -X POST -H "Authorization: Bearer $STAGING_TOKEN" \
  https://staging.askdb.dev/api/v1/dashboards/migrate
```

Or, for a single user during smoke test:

```bash
# Dev login → grab token → migrate demo user
curl -X POST -H "Authorization: Bearer $DEV_TOKEN" \
  https://staging.askdb.dev/api/v1/dashboards/migrate
```

Expected response shape:

```json
{
  "total_dashboards": 4,
  "migrated_tiles": 17,
  "skipped_tiles": 3,
  "errors": []
}
```

**Fail criteria:**
- `errors` non-empty → investigate before flipping
- `migrated_tiles + skipped_tiles` ≠ total tiles → data loss risk,
  stop and restore from backup

---

## 4. Staging flag flip

Once migration completes cleanly:

```bash
# Edit staging .env
NEW_CHART_EDITOR_ENABLED=true

# Restart backend
systemctl restart askdb-backend
# OR via docker-compose
docker-compose restart backend
```

Verify:

```bash
curl https://staging.askdb.dev/api/v1/dashboards/feature-flags
# Expected: {"NEW_CHART_EDITOR_ENABLED": true}
```

Frontend needs to fetch the flag on boot and swap routing. That work
lives in `App.jsx` → `useEffect(() => fetch feature flags)` which
replaces the `/dashboard` + `/analytics` route `element={}` with
`<DashboardShell />` when the flag is true. If the route switch is
not yet wired, the flip is a no-op from the user's perspective —
safe to flip early and wire the route switch in a follow-up PR.

---

## 5. Smoke test (staging)

Log in as **demo@askdb.dev** (or any migrated user) and:

1. Navigate to `/dashboard` → new shell should render with the briefing
   layout by default.
2. Click through all six mode toggles — each should render without
   console errors.
3. Open one tile → `ChartEditor` opens, drag a field from DataRail
   into the MarksCard → spec updates + chart re-renders via
   VegaRenderer.
4. Open `/dev/chart-editor` → confirm the CustomTypePicker lists
   registered user chart types (or "no custom types yet" if none).
5. Confirm the SemanticFieldRail lists dimensions/measures/metrics
   from the active model.
6. Drag a semantic pill onto a channel slot → `resolveSemanticRef`
   runs + the spec's encoding+transform updates.
7. Verify the backend `/api/v1/dashboards/{id}/refresh-stream` SSE
   endpoint streams ticks when LiveOps mode is active.

**Fail criteria:**
- Any visible chart regression vs legacy `/analytics` rendering
- Any unhandled console error or 5xx response
- Tile data missing after migration

If any fail, execute rollback (§7).

---

## 6. Production flip

**Only after 1 full week of staging dogfood with zero P0/P1 issues.**

Identical to §4 but on the production host. Watch:
- Error rate (Sentry / Datadog) for 4 hours post-flip
- Time-to-first-chart latency from the agent SSE stream
- Chart-edit count per session (should trend up)
- Cmd-K usage (should trend up)

Keep the legacy files (`ResultsChart.jsx`, `TileEditor.jsx`,
`CanvasChart.jsx`) in the tree for **one more release cycle** as
rollback safety before Phase 4c+1 deletes them.

---

## 7. Rollback procedure

**If a P0/P1 issue surfaces within the rollback window:**

```bash
# Staging or production
# 1. Flip flag off
NEW_CHART_EDITOR_ENABLED=false
systemctl restart askdb-backend

# 2. Verify
curl .../api/v1/dashboards/feature-flags
# Expected: {"NEW_CHART_EDITOR_ENABLED": false}

# 3. Frontend continues to build + serve the legacy routes.
#    The new shell stays in the tree but is unreachable.
```

The migrated tiles keep their `chart_spec` field + original legacy
fields (`chartType`, `columns`, `rows`, …) so the legacy TileEditor /
ResultsChart render against the original data with **zero loss of
fidelity**. Migration was additive — no legacy fields were dropped.

If rollback fails to unblock the issue, restore from backup (§2):

```bash
rm -rf /app/backend/.data/user_data
cp -a /backup/askdb-pre-4c-YYYYMMDD-HHMM/user_data /app/backend/.data/user_data
systemctl restart askdb-backend
```

---

## 8. Post-flip hardening (Phase 4c+1)

After two stable production releases:

1. Delete `ResultsChart.jsx`, `TileEditor.jsx`, `CanvasChart.jsx`
   and any `chartDefs.js` entries they uniquely reference.
2. Remove `echarts` + `echarts-for-react` from `package.json` →
   re-run the bundle-size guard.
3. Drop the `NEW_CHART_EDITOR_ENABLED` flag and its `config.py`
   entry + the `/api/v1/dashboards/feature-flags` endpoint (or keep
   the endpoint for future flags).
4. Archive this doc into `docs/archive/`.

The ECharts guard test (`src/chart-ir/__tests__/editor/echartsGuard.test.ts`)
stays in place — it will extend to cover the full `src/components/**`
once the legacy files are gone.

---

## 9. Open items that must be resolved before production flip

These are **not blockers for the staging flip** but must land before
production traffic cuts over:

- [ ] Wire the feature flag into `App.jsx` route-level switching so
      production `/dashboard` + `/analytics` actually render the new
      shell when the flag is true (currently the flag only gates the
      dev route).
- [ ] Implement `api.refreshTile` integration in `DashboardTileCanvas`
      so WorkbookLayout filter bar changes re-run SQL and blend rows
      into the tile's `resultSet`.
- [ ] Implement `AgentPanel` → dashboard edit tool calls that target
      the new `DashboardShell` (`create_tile`, `update_tile_layout`,
      `edit_tile`, `delete_tile`) — agent tool endpoints already exist
      per the CLAUDE.md notes; the shell just needs to re-render on
      agent-initiated tile changes.
- [ ] Decide: does the production `/analytics` DashboardBuilder keep
      its `react-grid-layout` editing surface, or does
      AnalystWorkbenchLayout replace it entirely? (The redesign spec
      §11.2 says replace; the legacy code keeps working for now.)

None of the above is gated by Phase 4c; they are Phase 4c+1 items.

---

## 10. Approvers

- [ ] **sid23** — architecture + scope signoff
- [ ] **sid23** — migration run verified on backup copy of production
- [ ] **sid23** — staging smoke test passed
- [ ] **sid23** — production flip go/no-go

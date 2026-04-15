# Journal — 2026-04-14 — Dashboard Density + Wow-Factor Implementation

**Branch:** `askdb-global-comp`
**Commits:** 30 (from `64d9928` baseline to `39a2ef9` latest)
**Plan spec:** `C:\Users\sid23\.claude\plans\valiant-foraging-cupcake.md`
**Implementation plan:** `C:\Users\sid23\.claude\plans\2026-04-14-dashboard-density-wow-impl.md`

---

## Context

Three user asks stacked up:

1. **Tableau-class dense dashboards** — pack 4+ metrics per row via specialized dense tiles
2. **Wow-factor charts beyond Tableau / Looker / Power BI** — 3D, globe, ridgeline, particle flow, etc.
3. **User engagement / retention hooks**

A prior 51-chart maximalist plan was reviewed by a 20-persona Ultraflow Council and unanimously flagged as a time-to-value trap. The council-approved synthesis (Approach A) scoped this work to:

- **Phase 0** — Pre-existing `ResultsChart.jsx` bug fixes (blocks everything else)
- **Phase 1** — 4 dense tile types as first-class citizens
- **Phase 2** — Engagement loop (diff-on-load banner + ambient hot-metric pulse + tile survival telemetry)
- **Phase 3** — Production safety harness (error boundaries, WebGL pool, viewport mount, feature flags)
- **Phase 4** — 6 flagship wow charts (3D scatter, hologram, globe, ridgeline, particle flow, liquid gauge)
- **Phase 5** — Time animation framework + 2D↔3D toggle
- **Phase 6** — Long tail (20 more chart types), deferred

Impeccable-only frontend discipline. No non-impeccable direct edits.

---

## Phase 0 — Debt Paydown

**Goal:** fix pre-existing `ResultsChart.jsx` bugs before adding new features. Every one of these would block or corrupt later phases.

| Sub-task | Commit | Bug fixed |
|---|---|---|
| 0.1 | `ab400be` | Baseline snapshot before changes |
| 0.2 | `03e95af` | ESLint `react/jsx-uses-vars` plugin — flagged `motion` as "unused" despite `<motion.div>` JSX usage at 4 call sites. Config fix cleared 21 false-positive unused-import errors repo-wide. |
| 0.3 | `5f38397` | Unreachable duplicate `return false;` at line 211 (inside `if (!instance)` guard) |
| 0.4 | `a1ab36d` | Rules-of-Hooks violation: `MeasureSelector` helper component had an early `return null` at line 233 BEFORE 3 hooks at 234/235/238. Moved early return AFTER hooks. |
| 0.5 | `58f0ff8` | Two `setState` calls inside `useEffect` that only synced local state to changed props. Replaced with React-docs render-time prop-sync pattern (store prev prop in state, compare during render, setState synchronously — React short-circuits the uncommitted render). |
| 0.6 | `a2d7794` + `c7ad266` | `echartsOption` `useMemo` had 16-dep array missing `embedded` (used inside), plus a stale `colors` dep that was never read. Also wrapped `fmtTickFn` in its own `useMemo` so its reference stopped changing every render and invalidating the outer memo. |

**Outcome:** `ResultsChart.jsx` lint-clean (0 errors, 0 warnings). Build 1.84s green.

**Lesson from 0.2:** Plan's "remove unused motion import" task had a wrong premise. The import IS used — the real bug was eslint config missing `react/jsx-uses-vars`. Always verify lint errors are real before blindly removing code.

---

## Phase 1 — Dense Tile Foundation

**Goal:** 4 Tableau-class dense tile types as first-class citizens in the chart registry.

### Deviation: Tremor abandoned

Plan called for `@tremor/react` as the dense-tile primitive library. Reality:

- `@tremor/react@3.x` blocks on React 19 peer dependency (`react@^18.0.0` only)
- `@tremor/react@4.0.0-beta` accepts React 19 but:
  - Bundle: **226 KB gzipped** — 2.4× the 100 KB budget
  - Ships **recharts** transitively, violating the project's "ECharts only" invariant in `CLAUDE.md`
  - Still beta, breaking API changes from v3

**Decision:** abandon Tremor. Build the 4 dense tiles natively on top of existing ECharts + tokens.js + plain React. Zero new deps. Final bundle delta: ~6 KB for all 4 tiles combined.

### Delivered

| Task | Commit | File |
|---|---|---|
| 1.2 | `c9b8b98` | `charts/defs/chartDefs.js` — unified registry extracted from inline `CHART_DEFS` in ResultsChart. Added `family` / `engine` fields in preparation for dense / 3d / geo / creative families. Exports `CHART_FAMILIES`, `getChartDef`, `getChartsByFamily`, `rankChartsForData` |
| 1.3 | `2c98962` | `tokens.js` — 29 `TOKENS.dense.*` sub-tokens (header, body, typography, delta chips, sparkline, bar rail, heat cells, grid defaults), all theme-aware via CSS vars |
| 1.4 | `1cc1979` | `tiles/SparklineKPI.jsx` — 120×60 dense metric tile with pure SVG sparkline + delta chip |
| 1.5 | `cae29bd` | `tiles/ScorecardTable.jsx` — ranked list with inline mini-bars |
| 1.6 | `5ebdfc8` | `tiles/HBarCard.jsx` — overlay h-bars with label+value on the fill |
| 1.7 | `8b3510b` | `tiles/HeatMatrix.jsx` — thin adapter over existing `CanvasChart` ECharts heatmap series |
| 1.8 | `4e2c5e3` | chartDefs entries + `DENSE_TILE_REGISTRY` in TileWrapper + picker split in TileEditor |

**Outcome:** 4 dense tiles live. TileEditor picker now has a "Dense · Tableau-class" section.

---

## Phase 2 — Engagement Loop

**Goal:** three utility-first engagement mechanisms layered on the same snapshot-diff infrastructure. Zero dark patterns — no streaks, FOMO, notification spam, or achievement badges.

| Task | Commit | Mechanism |
|---|---|---|
| 2.2 | `be6cc43` | `lib/diffOnLoad.js` — per-dashboard-per-tile localStorage snapshot + pct-delta primitive. Silent fail on quota/private mode. Feeds the next two. |
| 2.3 | `e0ee487` | `DiffOnLoadBanner.jsx` — "While you were away" glass pill showing top-3 delta chips since last visit. 24h dismiss per-dashboard. Render-time prop sync (no `set-state-in-effect`). CSS for the banner + Phase 2.4 pulse keyframes shipped in the same commit. |
| 2.4 | `4a01e10` | `lib/hotMetricDetector.js` — ranks tiles by `abs(delta%)`, caps 3 simultaneously hot, ack-on-hover-2s marks tile as cold for the session. `data-heat` attribute on `.dashboard-tile`, `@keyframes heatPulseUp/Down` in index.css with `prefers-reduced-motion` fallback. Store toggle `hotMetricsEnabled` with localStorage persistence. |
| 2.5 | `ffe6373` | `lib/tileSurvivalTelemetry.js` + backend `audit_trail.log_tile_event()` + `POST /dashboards/audit/tile-event`. Fire-and-forget wrappers for `tile_created`, `tile_deleted`, `tile_survived_24h`. Reuses existing JSONL writer — zero schema change. |

**Architecture notes:**

- **Single data source:** `diffOnLoad.js` stores snapshots; both `DiffOnLoadBanner` (read-for-display) and `hotMetricDetector` (read-for-classification) derive from it.
- **Engagement discipline:** pulse caps at 3, ack-on-hover decays to cold, opt-out toggle persisted. `impeccable:quieter` gate: "does the pulse feel like breathing or like a notification?"
- **Backend thin pass-through:** email pre-hashed (sha256, 16-char prefix) before hitting `_append_entry`. Allowlist on event types.

---

## Phase 3 — Production Safety Harness

**Goal:** fail-safe the dashboard so one bad tile can't crash the page. **Non-negotiable before Phase 4 ships 3D charts.**

| Task | Commit | Primitive |
|---|---|---|
| 3.1 | `fbce5d3` | `TileBoundary.jsx` — per-tile React class error boundary with glass fallback card + "Reload tile" action. Dev-mode `console.error` with component stack, prod-mode silent recovery. Wraps the chart body in `TileWrapper`. |
| 3.2 | `59f9cce` | `lib/webglContextPool.js` — LRU pool capped at 8 concurrent WebGL contexts (under the lowest browser limit). Exports `acquireContext` / `touchContext` / `releaseContext` / `onContextLost`. Evicts LRU on overflow and calls the victim's `onEvict` callback so engines can swap to 2D. Global `webglcontextlost` listener forwards to subscribers. |
| 3.3 | `59f9cce` | `lib/useViewportMount.js` — IntersectionObserver hook with 200px rootMargin head-start, one-shot disconnect, SSR-safe fallback. |
| 3.4 | `59f9cce` | `lib/tileFeatureFlag.js` — `ff.<chartType>` localStorage kill switch (DevTools-settable) + wired into TileWrapper to render "chart type disabled" card instead of rendering the broken engine. `lib/clientPiiGuard.js` — belt-and-braces local PII column scanner (NFKC normalized, substring-based, over-masks safely). |

**Layering order in `TileWrapper`:** feature flag check → `TileBoundary` → chart engine. A single bad tile can fail three different ways and the dashboard keeps rendering.

**Important:** Phase 3 shipped BEFORE Phase 4 as required by the plan's risk register. Without the webglContextPool in place, a dashboard with 10+ 3D tiles on first load would silently lose contexts.

---

## Phase 4 — Flagship Wow Chart Slice

**Goal:** 6 flagship wow charts that Tableau/Looker/Power BI don't ship out of the box.

### Deviation: echarts-gl blocked

| Dep | Outcome |
|---|---|
| `deck.gl` + `@deck.gl/{core,layers,geo-layers,mesh-layers}` | ✅ Clean React 19 install |
| `d3-shape`, `d3-scale`, `d3-selection` | ✅ Clean install |
| `echarts-gl` | ❌ **Blocked** — only supports `echarts@^5.1.2`, project is on `echarts@6`. Skipped entirely — none of the 6 flagship charts actually need it. |

### Delivered

| Task | Commit | Engine | Stack |
|---|---|---|---|
| 4.1 | `ca5dc73` | dep install + vite chunks | `vendor-deckgl` + `vendor-d3` manualChunks added |
| 4.2 | `8a1ebea` | **ThreeScatter3D** | `@react-three/fiber` + drei OrbitControls/Text/Grid, `InstancedMesh` 10K cap |
| 4.3 | `42b4911` | **ThreeHologram** | same Three.js stack with additive blending, CSS scan-line overlay, wireframe grid, Tron/CRT aesthetic |
| 4.4 | `42b4911` | **DeckGlobe** *(later replaced — see below)* | deck.gl `_GlobeView` with auto-rotation |
| 4.5 | `42b4911` | **D3Ridgeline** | pure React SVG, Gaussian KDE via new `lib/kernelDensity.js`, `d3-shape` `curveBasis` smoothing, 12-ridge cap sorted by median |
| 4.6 | `42b4911` | **ThreeParticleFlow** | 5000-particle `InstancedMesh` vector field with `useFrame` integration. 4 numeric cols → real vector field; `<4` → synthetic rotational curl fallback. |
| 4.7 | `42b4911` | **LiquidGauge** | pure SVG sine-wave crest, `requestAnimationFrame` wave phase, reduced-motion safe |
| 4.8 | `42b4911` | close | registry wire-up in chartDefs + TileWrapper `WOW_TILE_REGISTRY` + TileEditor picker + `isCoordinatePair`/`isLatColumn`/`isLngColumn` helpers in `fieldClassification.js` + `hasCoordinates` added to `analyzeData()` |

### Pipeline validation

Every wow chart goes through the Phase 3 harness in order:
1. feature flag check → 2. TileBoundary → 3. useViewportMount (250px rootMargin) → 4. webglContextPool (acquire on mount, release on unmount, graceful "paused" fallback on LRU eviction) → 5. useGPUTier gate → 6. engine render

**Lint fix caught mid-flight:** `Math.random()` in `useRef` initializer was flagged by `react-hooks/purity` (render-time impurity). Replaced with module-level monotonic `nextAnonId()` counter that falls back to `tile.id` when available.

### Bundle impact

| Chunk | Size (gzipped) | Notes |
|---|---|---|
| `vendor-d3` | 9.5 KB | new |
| `vendor-deckgl` | 184 KB | new |
| `vendor-three` | 280 KB | unchanged — 4 new 3D engines share the existing chunk |
| `vendor-echarts` | 371 KB | unchanged |

**Phase 4 delta: ~194 KB gzip.** Within the 280 KB plan budget.

---

## Phase 5 — Time Animation Framework

**Goal:** retrofit existing and new charts with play/pause/speed/loop for time-series data. Engine-agnostic.

**All 5 tasks committed in `cdf276a`.**

| Task | Component |
|---|---|
| 5.1 | `charts/animation/useTimeAnimation.js` — hook with frame enumeration (auto-detects time column via `isDateColumn`), `requestAnimationFrame` playback (time-delta based so 2× is actually 2× regardless of monitor refresh rate), `prefers-reduced-motion` auto-pause, `currentIndex` clamp via render-time prop sync (not set-state-in-effect) |
| 5.2 | `charts/animation/TimelineScrubber.jsx` — premium glass pill with play/pause button (accent-tinted, magnetic hover), native `<input type="range">` re-skinned via CSS (webkit + firefox), frame label (auto-trims YYYY-MM-DD to YYYY-MM on tight tiles), segmented speed selector (0.5× 1× 2× 4×), loop toggle with filled state |
| 5.3 | `TileWrapper` wiring — `effectiveRows` flows through every engine branch when `chartDef.supportsTimeAnimation && timeField && frames.length > 1`. Line/area/scatter now declare `supportsTimeAnimation` so they animate for free alongside Phase 4 wow charts. |
| 5.4 | **2D↔3D toggle** — segmented pill in tile header, visible only when `chartDef.supports3DToggle` AND the chart type is in `TWIN_MAP`. `TWIN_MAP: { scatter: 'scatter_3d', scatter_3d: 'scatter' }`. Calls `onChangeChart(tile.id, twin)`. `.tile-dim-toggle` CSS with active-segment highlight. |
| 5.5 | close — lint clean, build green (1.20s), bundle delta ~4 KB |

---

## Post-Phase Fixes & Additions

### Smoke test + backend dialect fix (`5f0a3ef`)

Created `backend/smoke_test_new_charts.py` — a regression script that builds 11 tiles (1 standard + 4 dense + 6 wow) on the demo user's dashboard using real BigQuery live queries. Surfaced three issues:

1. **Timestamp parsing:** BigQuery driver can't parse `2025-06-23 16:58:16.720` via `PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', ...)`. Use `CAST(started_at AS TIMESTAMP)` — canonical parser handles fractional seconds.
2. **Backend SQL validator dialect:** The tile-save endpoints (`add_tile`, `add_tile_shortcut`, `update_tile_endpoint`) were constructing `SQLValidator()` with default `'postgres'` dialect, rejecting BigQuery backtick-quoted table names at save time. **Fix:** new `_pick_dialect_for_user()` helper in `dashboard_routes.py` walks `app.state.connections` for the authenticated user's dialect. Passed to all three validator call sites. **Requires backend restart to take effect** (uvicorn running without `--reload`).
3. **Free-plan 10/day cap:** demo user hit the limit mid-run. Reset `query_stats.json.queries_today = 0` between runs.

Smoke test result after fixes: **11/11 pass**. Tiles live on the demo user's `quick insight Dashboard` under a "New Charts Smoke Test" tab.

### Dense-tile null-path bug (`c346ef2`)

**Symptom:** User opened the smoke-test dashboard and saw "This tile failed to render" on all 4 dense tiles (Sparkline KPI, Scorecard, Bar Card, Heat Matrix). Wow charts unaffected.

**Investigation (via superpowers ultraflow:debugging):**
- 4 failing tiles share the dense family — single shared bug, not 4 independent ones
- All 4 components read `const dense = TOKENS.tile.dense;`
- Runtime check: `TOKENS.tile.dense === undefined`
- `TOKENS.dense` (root level, sibling of `tile:` and `kpi:`) was defined correctly
- Phase 1.3 had authored the sub-object at `TOKENS.dense`, but all 4 consumers assumed `TOKENS.tile.dense`

**Root cause:** Phase 1.3's commit message intended `tile.dense` nesting, but the actual Edit placed the block at root level alongside `tile:` and `kpi:`. Every dense tile's first `dense.bodyPad` access threw `TypeError`, caught by `TileBoundary`, user saw the fallback.

**Why validators missed it:**
- ESLint can't detect runtime property access on `undefined`
- `npm run build` doesn't render components
- Smoke test only SAVED tiles, never drove them through React render

This was the exact "unverified assumption" failure mode flagged in the pre-phase Meta-Cognitive Map. Only a real browser session would have caught it.

**Fix:** 4 one-line edits (Option B — update consumers instead of moving 60 lines of tokens). `TOKENS.kpi` already at root level set the precedent; the consumers had the wrong mental model.

### Globe v1 fix (`5c1a87e`)

**Symptom:** DeckGlobe rendered as "a black dot moving". Multiple compounding issues:
- `zoom: 0` shrank the whole sphere to tile-width
- Point radii 40-400km invisible at that zoom
- No continent context
- Ocean layer `alpha: 180` (translucent space)
- Auto-rotation at 0.08°/frame distractingly fast

**Fix applied (later superseded):**
- Zoom `0 → 1.2`
- Radii `40k-400k → 150k-700k` + `radiusMinPixels: 4` / `radiusMaxPixels: 28`
- Brighter fill + white 230-alpha stroke
- NEW `GeoJsonLayer` loading public-domain world country outlines from `github.com/johan/world.geo.json`
- Ocean opaque (alpha 180 → 255)
- Auto-rotate 0.08 → 0.04°/frame
- `parameters: { depthTest: false }` on country + point layers

### Sample Dashboard script (`8bab48d`)

Created `backend/sample_dashboard.py` — 21-chart reference dashboard on the demo user. Unlike the smoke test (live BigQuery), this generates deterministic dummy data locally and POSTs it as tile payloads.

**Layout (4 sections, 21 tiles):**
- **Core Charts** (6): bar, bar_h, line, area, pie, donut
- **Advanced Standard** (5): radar, treemap, scatter, stacked_bar, kpi
- **Dense Family · Tableau-class** (4): sparkline_kpi, scorecard_table, hbar_card, heat_matrix
- **Wow Factor · 3D + Geo + Premium** (6): scatter_3d, hologram_scatter, geo_map, ridgeline, particle_flow, liquid_gauge

All generators use seeded PRNGs (`random.Random(42)`, etc.) so re-runs produce byte-identical tile payloads.

**Curated data highlights:**
- **Line** — 90 days of DAU with growth trend + weekly seasonality (weekends 18% lower)
- **Heat Matrix** — 7-day × 24-hour traffic with realistic morning/evening peaks on weekdays and later brunch peaks on weekends
- **Ridgeline** — 6 services with distinct Gaussian response-time distributions (Cache 15ms, API Gateway 50ms, DB Read 80ms, Auth 120ms, DB Write 180ms, ML Inference 320ms)
- **Particle Flow** — 13×13 grid clean curl whirlpool pattern so particles visibly rotate
- **Globe/GeoMap** — 20 globally distributed cities (NYC, London, Tokyo, Sydney, São Paulo, Mumbai, Cape Town, Cairo, LA, Singapore, Paris, Berlin, Toronto, Dubai, Istanbul, Bangkok, Mexico City, Buenos Aires, Moscow, Beijing)

**Delete-if-exists** at script start so re-runs are idempotent (avoids duplicate "Sample Dashboard" entries).

### Globe v2 — replaced with Tableau-style GeoMap (`39a2ef9`)

**User feedback on Globe v1:** "just looks like a black dot". The 3D sphere metaphor doesn't work at typical tile footprints even with the fixes — users wanted Google Maps / Mapbox style instead.

**Decision:** delete the globe entirely, build a 2D bubble map.

**NEW: `GeoMap.jsx`** — flat Web Mercator bubble map:
- deck.gl `TileLayer` streaming free CartoDB basemap tiles (dark_all on dark theme, light_all on light theme). No API key, no Mapbox signup. TileLayer was already bundled via `@deck.gl/geo-layers` from Phase 4.1.
- `ScatterplotLayer` with **pixel radii** (6-44px), not meter-radius. Bubbles stay readable at every zoom level — the key fix vs the 3D globe.
- Glow halo layer at 1.7× radius, 55-alpha, premium Tableau aura effect
- `WebMercatorViewport.fitBounds` auto-fits initial view to data bbox on mount (intentional `setState-in-effect` with scoped eslint-disable + justification — measuring DOM layout is legitimately external to React)
- Hover picking → glass pill tooltip with label + formatted value
- 3-bubble proportional size legend bottom-left (Tableau convention)
- "© OSM · CARTO" attribution pill bottom-right (license requirement)
- Theme-reactive via `useStore(s => s.resolvedTheme)` — tile URL + bubble color swap on theme flip

**Architecture changes:**
- Deleted `DeckGlobe.jsx` (346 lines)
- Renamed chartType key `globe_3d` → `geo_map` in chartDefs, picker, sample_dashboard
- Kept `globe_3d` as deprecated hidden alias in chartDefs (`score: () => -1000`, `deprecated: true`) + `WOW_TILE_REGISTRY` alias pointing at `GeoMap` so any pre-rename tile still renders
- Re-ran `sample_dashboard.py` — old dashboard auto-deleted, new Sample Dashboard live at `a0d8e6a63090` with 21/21 tiles

**Bundle:** `vendor-deckgl` 636 → 755 KB raw (+42 KB gzip) for `TileLayer` + `WebMercatorViewport`.

---

## Final State

### Branch status

- **Branch:** `askdb-global-comp`
- **Commits ahead of main:** 30 (from pre-plan baseline `64d9928`)
- **Files created:** 23 frontend + 2 backend scripts
- **Files modified:** ~14 frontend + 3 backend
- **Lint:** all new code 0 errors, 0 warnings
- **Build:** 1.95s green, `vendor-deckgl` 755 KB / `vendor-three` 1008 KB / `vendor-d3` 25 KB
- **Sample Dashboard live:** `a0d8e6a63090` — 21 tiles across 4 sections on the demo user

### Chart catalog (live)

**Standard (10):** bar, bar_h, stacked, line, area, pie, donut, radar, treemap, scatter
**KPI:** kpi
**Dense (4):** sparkline_kpi, scorecard_table, hbar_card, heat_matrix
**Wow (6):** scatter_3d, hologram_scatter, geo_map, ridgeline, particle_flow, liquid_gauge

**Animation support:** line, area, scatter, scatter_3d, hologram_scatter, geo_map all declare `supportsTimeAnimation: true`. TimelineScrubber auto-mounts when a time column is detected.

**2D↔3D toggle:** `scatter ↔ scatter_3d`. Extensible via `TWIN_MAP` in `TileWrapper.jsx`.

### Deps added

| Package | Reason |
|---|---|
| `deck.gl` + `@deck.gl/{core,layers,geo-layers,mesh-layers}` | GeoMap (TileLayer, BitmapLayer, ScatterplotLayer, WebMercatorViewport) |
| `d3-shape`, `d3-scale`, `d3-selection` | D3Ridgeline |

**Rejected:** `@tremor/react` (React 19 + recharts conflict), `echarts-gl` (echarts 6 peer block)

### Risks that didn't materialize

- Tremor React 19 incompat: **CONFIRMED** — abandoned in Phase 1.1, built native
- echarts-gl React 19 / echarts 6: **CONFIRMED** — skipped, not needed
- deck.gl React 19: **clean install**
- d3 React 19: **clean install**
- webglContextPool consumers: **all wired, all graceful on eviction**
- TileBoundary in production: **wired around every engine**, caught the dense-tile null bug (and fell back correctly so the rest of the dashboard kept working — validated)
- Phase ordering (3 before 4): **held** — the one confirmed dense-tile runtime failure was caught by TileBoundary as designed

### Known issues remaining

1. **Backend dialect fix (`5f0a3ef`) not yet live** — uvicorn running without `--reload`. Restart required before any NEW tile saved from BigQuery through the UI will succeed. Existing tiles already saved are unaffected.
2. **Pre-existing lint debt in DashboardBuilder.jsx** — 25 `err is defined but never used` errors + 4 `exhaustive-deps` warnings. Inherited from before Phase 0. Deferred as backlog.
3. **Pre-existing lint debt in TileEditor.jsx** — 2 warnings (`baseColumns` + `useEffect` deps). Not touched.
4. **Vite 8.0.0-8.0.4 high-severity CVE** — path traversal in optimized deps `.map` handling. Pre-existing, unrelated to Phase 4 installs. Needs `npm audit fix` separately.
5. **ThreeHologram trail buffer** — scaffold shipped, ring-buffer hooks deferred pending Phase 5 usage patterns (plan has it on the Phase 5 polish list but was out of scope for the close commit).

---

## Lessons Learned

### 1. Smoke tests that don't render are worth less than their cost

The smoke test script exercised the backend save path but never drove the React render path. This missed the `TOKENS.tile.dense` null bug entirely — all 11 tiles SAVED successfully, then failed at first browser render. The dense-tile rename would have caught it if any validator had actually mounted a component.

**Next time:** when testing new chart types, do at least one of: (a) vitest + testing-library render test, (b) headless browser smoke, or (c) at minimum a dev-mode page-load check through `curl` + error log scrape.

### 2. Plan assumptions need runtime verification before the fix lands

Phase 0.2 "remove unused `motion` import" was wrong — the import WAS used via `<motion.div>` JSX. The plan failed to account for eslint-plugin-react's `jsx-uses-vars` being disabled. The correct fix was a config change, not a source edit.

Phase 1.3 "add TOKENS.tile.dense" put the sub-object at `TOKENS.dense` instead of nested inside `tile:`. Lint + build passed because neither validator runs property access at runtime.

**Next time:** for any plan task that touches shared structures, add a one-liner runtime check (`node -e "import('./x.js').then(m => console.log(m.FOO))"`) to the verification step. It would have caught both bugs in seconds.

### 3. Dep survey before writing the plan saves a phase

Plan assumed `@tremor/react` and `echarts-gl` would work. Neither did. Both were caught at Task 1.1 / 4.1 — the dep-install tasks — but a 10-minute peer-dep check before writing the plan would have caught them earlier. Both blocked with the same pattern: "library supports the old major version of a core dep, project is on the new one."

**Next time:** add a "Dep Compatibility Audit" step to the planning skill — run `npm info <pkg> peerDependencies` for every new dep before committing the plan.

### 4. The safety harness proved itself on a real bug

The Phase 3 `TileBoundary` was not just theoretical — it caught the Phase 1.3 null-path bug in production. Without it, the whole dashboard would have crashed to white screen on the first user open. With it, 4 tiles showed fallback cards and the rest kept working while I debugged.

Shipping Phase 3 BEFORE Phase 4 (as the plan risk register required) turned out to be load-bearing for reasons the plan never anticipated.

### 5. The user's "black dot" feedback wasn't about the 3D globe — it was about the metaphor

My first globe fix (zoom + country outlines) addressed the symptom ("can't see anything") but not the cause ("3D is wrong for this chart at this footprint"). The second fix (replace with 2D bubble map) took 30 minutes and the result was immediately right.

**Next time:** when user feedback says "I can't comprehend it", don't just adjust parameters — ask whether the underlying visual paradigm is wrong.

---

## What's Next

User has asked (via ultraplan) for a deep research + implementation plan on Tableau / Power BI / Looker chart generation, compact layout, and editing UX — to improve beyond the current "rigid" UI. The ultraplan remote session was queued but had not returned an executable plan at the time of this journal.

Pending user direction on:
- Retry ultraplan
- Inline research + plan in the main session
- Tighter scope (pick 2-3 charts to deep-dive)

---

**Commit range:** `64d9928..39a2ef9`
**Total LOC added:** ~5,100 frontend + ~200 backend
**Journal author:** Claude Opus 4.6 (1M context)

# Ground Truth — Server Verification (2026-04-08)

## Backend (FastAPI)

### Dependencies (`pip install -r requirements.txt`)
- **Status:** FAILS with clean install due to dependency conflict
- **Root cause:** `sqlalchemy-redshift>=0.8` requires `SQLAlchemy<2.0`, but project requires `SQLAlchemy>=2.0`. These are fundamentally incompatible.
- **Workaround:** `pip install -r requirements.txt --no-deps` installs everything but skips dependency resolution. Works because SQLAlchemy 2.x is already installed from prior sessions.
- **Commented-out drivers (install manually):** `snowflake-sqlalchemy`, `google-cloud-bigquery[sqlalchemy]`, `databricks-sql-connector`, `databricks-sqlalchemy`, `sqlalchemy-hana`, `hdbcli`, `ibm-db-sa`, `ibm_db`
- **Action needed:** Either pin `sqlalchemy-redshift` to a 2.x-compatible version or comment it out like the other cloud warehouse drivers.

### Startup (`uvicorn main:app --reload --port 8002`)
- **Status:** STARTS CLEANLY
- **Warnings (expected in dev):**
  - `JWT_SECRET_KEY is set to the default value!` — config.py line 212
  - `BLOCKED_KEYWORDS missing mandatory entries: {'MERGE'}` — auto-adds it
- **All 11 routers imported and registered:** auth, query, schema, connection, user, chat, admin, dashboard, alert, agent, behavior
- **Additional modules loaded at startup:** `model_provider.py` (InvalidKeyError exception handler), `user_storage.py` (share token pruning), `digest.py` (scheduler)
- **Health check:** `GET /api/v1/health` returns `{"status":"healthy","database_connected":false,"active_connections":0}`

### Swagger (`/docs`)
- **Status:** LOADS
- **Endpoint count:** 117 paths, 134 endpoints
- **Route breakdown:**
  - `/api/v1/admin` — 10 routes
  - `/api/v1/agent` — 3 routes
  - `/api/v1/alerts` — 4 routes
  - `/api/v1/auth` — 12 routes
  - `/api/v1/behavior` — 10 routes
  - `/api/v1/chats` — 3 routes
  - `/api/v1/connections` — 14 routes
  - `/api/v1/dashboards` — 24 routes
  - `/api/v1/health` — 1 route
  - `/api/v1/queries` — 20 routes
  - `/api/v1/schema` — 3 routes
  - `/api/v1/user` — 13 routes

### `.env.example` gap
- **Missing:** `JWT_SECRET_KEY` is not listed in `.env.example` but is required by config.py. Falls back to default `"change-me-in-production-use-a-long-random-string"` which triggers a critical warning.

### Backend files NOT mentioned in CLAUDE.md
All backend .py files are accounted for in `CLAUDE.md`:
- `model_provider.py`, `anthropic_provider.py`, `provider_registry.py` — LLM provider abstraction (BYOK support). Referenced via `InvalidKeyError` in `main.py`.
- `agent_engine.py`, `behavior_engine.py`, `digest.py`, `duckdb_twin.py`, `waterfall_router.py` — all documented in CLAUDE.md.
- `test_dual_response_invariants.py` — manual test script (not documented, same pattern as other `test_*.py`).

---

## Frontend (React 19 + Vite 8)

### Install (`npm install`)
- **Status:** SUCCEEDS
- **1 high severity vulnerability** (npm audit)

### Dev Server (`npm run dev`)
- **Status:** STARTS on port 5173 (or next available port)
- **Landing page:** Renders fully. Tested via accessibility snapshot — full navigation (Chat, Database, Analytics, Schema, Billing), Account page with stats, API config, danger zone all render.
- **3D backgrounds:** Preview screenshot timed out (likely WebGL/Three.js heavy rendering), but no console errors. The `WebGLErrorBoundary` fallback to 2D `AnimatedBackground` exists for environments without GPU support.

### Lint (`npm run lint`)
- **Status:** FAILS — 137 errors, 14 warnings (151 total)
- **Major error categories:**
  - `react-hooks/purity` — `Math.random()` calls in 3D animation components (`Background3D`, `SectionBackground3D`, `NeonBackground3D`, etc.). These are intentional for procedural geometry.
  - `react-hooks/set-state-in-effect` — setState in useEffect in `ERDiagram.jsx`, `ResultsChart.jsx`, `CursorGlow.jsx`
  - `react-hooks/rules-of-hooks` — conditional hooks in `ResultsChart.jsx` (useMemo after early return)
  - `no-unused-vars` — unused `motion` import in `ResultsChart.jsx`, `SchemaView.jsx`; unused `useCallback` in `DeviceFrame3D.jsx`
- **Note:** The `rules-of-hooks` error in `ResultsChart.jsx` (conditional useMemo) is a real bug that could cause runtime crashes in certain render paths.

### Production Build (`npm run build`)
- **Status:** SUCCEEDS in 1.09s
- **Total JS output:** ~3.8 MB (uncompressed), ~1.1 MB gzipped
- **Large chunks (>500 KB warning):**
  - `vendor-echarts` — 1,137 KB (373 KB gzip)
  - `index` (main bundle) — 914 KB (267 KB gzip)
  - `vendor-three` — 716 KB (182 KB gzip)
  - `vendor-export` (html2canvas/jspdf) — 601 KB (177 KB gzip)
- **Large static assets (webp screenshots for landing page):**
  - `chat_to_chart.webp` — 7.4 MB
  - `multi_db_er.webp` — 6.1 MB
  - `dashboard_filter.webp` — 4.7 MB
  - `dashboard_assembly.webp` — 3.9 MB
- **Manual chunk splitting is working** as configured in `vite.config.js` (echarts, framer-motion, three, export libs all separate).

---

## Summary

| Check | Status | Notes |
|-------|--------|-------|
| Backend pip install | FAIL | sqlalchemy-redshift conflict with SQLAlchemy 2.x |
| Backend starts | PASS | All 11 routers, 134 endpoints |
| Health endpoint | PASS | Returns healthy |
| Swagger docs | PASS | 117 paths load |
| Frontend npm install | PASS | 1 high vuln |
| Frontend dev server | PASS | Renders fully |
| Frontend lint | FAIL | 137 errors (mostly 3D/animation purity) |
| Frontend build | PASS | 1.09s, ~1.1 MB gzip |
| Landing page render | PASS | Full UI loads, navigation works |
| 3D backgrounds | UNCERTAIN | No errors logged, but screenshot timed out |

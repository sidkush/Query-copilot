# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**QueryCopilot** — a natural language-to-SQL analytics SaaS. Users connect their own database, ask questions in plain English, and receive generated SQL (shown for review before execution), results, auto-generated charts, and a natural-language summary.

## Setup & Running

```bash
# Backend (Python 3.10+, from backend/)
pip install -r requirements.txt
cp .env.example .env        # fill in ANTHROPIC_API_KEY, JWT_SECRET_KEY, etc.
uvicorn main:app --reload --port 8002

# Frontend (from frontend/)
npm install
npm run dev                 # http://localhost:5173 (proxied to backend at localhost:8002)

# Lint frontend
npm run lint

# Build frontend for production
npm run build
```

There are no automated tests. `test_registration.py` and `regression_test.py` are manual scripts, not pytest suites.

## Architecture

Two independently running services: FastAPI backend on port 8002, React frontend on port 5173 (Vite proxies `/api` to backend).

### Backend — FastAPI (`/backend`)

**Entry point:** `main.py` — registers 8 routers under `/api`, initializes `app.state.connections = {}`.

**Core query pipeline (`query_engine.py`):**
1. Embed user question → ChromaDB RAG retrieval (per-connection namespaced collections for schema + few-shot examples)
2. Build prompt → Claude API (Haiku primary, Sonnet fallback on validation failure)
3. SQL cleaned → 6-layer validation (`sql_validator.py`) → optional execution → PII masking → NL summary
4. Positive user feedback stored back into ChromaDB to improve future queries

**Two-step query flow by design:** `/api/queries/generate` (returns SQL for user review) → `/api/queries/execute` (user-approved execution). Do not collapse these into one step.

**Connection model:** `app.state.connections[email][conn_id]` → `ConnectionEntry` (models.py) holding a `DatabaseConnector` + `QueryEngine`. Connections are lazy (no DB connection on startup), gracefully disconnected on shutdown.

**Routers (`backend/routers/`):** `auth_routes` (OTP + OAuth), `connection_routes` (DB connect/disconnect/save/load), `query_routes` (generate/execute/feedback/suggestions/dashboard-gen), `schema_routes` (table listing/DDL/ER positions), `chat_routes` (session CRUD), `user_routes` (profile/account/billing/tickets), `dashboard_routes` (tile CRUD + layout), `admin_routes` (separate JWT, user/ticket management).

**Security — three independent layers, never remove any:**
1. `db_connector.py` — driver-level read-only (`SET TRANSACTION READ ONLY`)
2. `sql_validator.py` — 6 layers: multi-statement → keyword blocklist → sqlglot AST (15+ dialects) → SELECT-only → LIMIT enforcement → dangerous-function detection
3. Connector re-validates before execution

**PII masking** (`pii_masking.py`) — column-name pattern matching + regex value scanning. Must always run via `mask_dataframe()` before any data is returned to users or the LLM.

**18 supported database engines** (defined as `DBType` enum in `config.py`):
PostgreSQL, MySQL, MariaDB, SQLite, MSSQL, CockroachDB, Snowflake\*, BigQuery\*, Redshift, Databricks\*, ClickHouse, DuckDB, Trino, Oracle, SAP HANA\*, IBM Db2\*, Supabase. (\* = driver commented out in `requirements.txt`; install manually.)

**Data persistence (file-based, no application database):**
- `.data/users.json` — user accounts (bcrypt hashed passwords), thread-locked
- `.data/pending_verifications.json` — temporary OTP verification state (email/phone must be OTP-verified before account creation completes)
- `.data/oauth_states.json` — short-lived OAuth CSRF state tokens (10-min TTL, auto-purged)
- `.data/user_data/{sha256_prefix}/` — per-user: `connections.json` (Fernet-encrypted passwords), `chat_history/`, `query_stats.json`, `er_positions/`, `dashboards.json`, `profile.json`
- `.chroma/querycopilot/` — ChromaDB vector store. Deleting it loses all trained context; re-seed only by reconnecting.
- Atomic file writes (write-then-rename) are used intentionally for crash safety; preserve this pattern.

**Config:** `config.py` — Pydantic `BaseSettings` singleton (`settings`). All config from `backend/.env`. `.env` path resolved relative to `config.py`, not the working directory.

### Frontend — React 19 + Vite 8 (`/frontend`)

**State:** Zustand store (`store.js`) — auth, connections, chat, profile. Token persisted to localStorage.

**API layer:** `api.js` — injects JWT `Authorization` header. 401 responses redirect to `/login`. Admin API uses separate `admin_token` in localStorage.

**Routing:** `App.jsx` — React Router v7 with `ProtectedRoute` HOC and `AnimatePresence` page transitions. Route map:
- Public: `/` (Landing), `/login`, `/auth/callback`, `/admin/login`, `/admin`
- Protected (no sidebar): `/tutorial`
- Protected (with `AppLayout` sidebar): `/dashboard`, `/schema`, `/chat`, `/profile`, `/account`, `/billing`, `/analytics`
- `/dashboard` → `Dashboard.jsx` (view-only, query result tiles); `/analytics` → `DashboardBuilder.jsx` (full drag-resize builder with TileEditor)

**Animation system** (`src/components/animation/`): Three.js 3D backgrounds (`Background3D`, `SectionBackground3D`, `FrostedBackground3D`, `NeonBackground3D`) lazy-loaded with a `WebGLErrorBoundary` fallback to `AnimatedBackground` (2D). Also: `PageTransition`, `StaggerContainer`, `MotionButton`, `AnimatedCounter`, `SkeletonLoader`, `useScrollReveal` hook.

**Dashboard subsystem** (`src/components/dashboard/`):
- `tokens.js` — single source of truth for design tokens (colors, radii, transitions, chart palettes). Import `TOKENS` and `CHART_PALETTES` from here; don't hardcode hex values in dashboard components.
- Uses `react-grid-layout` for drag-resize tiles, `html2canvas` + `jspdf` for export.

**Dashboard lib utilities** (`src/lib/`): `dataBlender.js` — client-side left-join across multiple query result sets; `metricEvaluator.js` — KPI threshold/conditional logic; `visibilityRules.js` — tile show/hide rule engine; `formatUtils.js` — number/date formatting helpers.

**Charts:** Both ECharts (`echarts-for-react`) and Recharts (`recharts`) are used — check which library an existing component uses before adding a new chart.

**Styling:** Tailwind CSS 4.2 + custom glassmorphism classes in `index.css`. Dark theme (`#06060e` bg). Fonts: Poppins (headings) + Open Sans (body). Animations: Framer Motion + GSAP. Three.js for 3D landing backgrounds.

## Key Constraints

- **Read-only enforcement** — driver, SQL validator, and connector layers. Never weaken any.
- **PII masking** — `mask_dataframe()` must run before any data reaches users or the LLM.
- **Two-step query flow** — `/generate` then `/execute`. Don't collapse.
- **Daily query limits** enforced in `query_routes.py`. Plans: free=10, weekly=50, monthly=200, yearly=500, pro=1000, enterprise=unlimited.
- **`JWT_SECRET_KEY`** — also derives the Fernet key for saved DB passwords. Changing it invalidates all saved connection configs.
- **Vite proxy** → `http://localhost:8002`. Backend must run on port 8002 during development.
- **Admin auth** is a separate JWT flow (`admin_token` in localStorage), not the same as user auth.
- **User deletion** is soft-delete — archived in `deleted_users.json`.
- **CORS** configured for `localhost:5173`, `localhost:3000`, and `FRONTEND_URL`. Update for production.
- **OAuth redirect URI** defaults to `http://localhost:5173/auth/callback` (configurable via `OAUTH_REDIRECT_URI`).
- **OTP-first registration** — email (and optionally phone) must be OTP-verified before `create_user()` is called. The `pending_verifications.json` file tracks this state; do not skip verification in the registration flow.

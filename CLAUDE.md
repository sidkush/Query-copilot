# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**QueryCopilot** — a natural language-to-SQL analytics SaaS. Users connect their own database, ask questions in plain English, and receive generated SQL (shown for review before execution), results, auto-generated charts, and a natural-language summary. Includes an agentic multi-step query mode, NL-defined alerts, scheduled email digests, and a dashboard presentation engine.

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

There are no automated tests. `test_registration.py`, `regression_test.py`, `test_agent_engine.py`, `test_phase*.py`, and `test_waterfall.py` are manual scripts, not pytest suites.

**Docker:** `docker-compose.yml` exists but maps backend to port 8000 (not 8002). For local dev without Docker, always use port 8002 to match the Vite proxy target.

## Architecture

Two independently running services: FastAPI backend on port 8002, React frontend on port 5173 (Vite proxies `/api` to backend).

### Backend — FastAPI (`/backend`)

**Entry point:** `main.py` — registers routers under `/api`, initializes `app.state.connections = {}`, starts digest scheduler on lifespan startup.

**Core query pipeline (`query_engine.py`):**
1. Embed user question → ChromaDB RAG retrieval (per-connection namespaced collections for schema + few-shot examples)
2. Build prompt → Claude API (Haiku primary, Sonnet fallback on validation failure)
3. SQL cleaned → 6-layer validation (`sql_validator.py`) → optional execution → PII masking → NL summary
4. Positive user feedback stored back into ChromaDB to improve future queries

**Two-step query flow by design:** `/api/queries/generate` (returns SQL for user review) → `/api/queries/execute` (user-approved execution). Do not collapse these into one step.

**Agent system (`agent_engine.py`):**
- `AgentEngine` — multi-step tool-use loop using Anthropic's native tool-use API with SSE streaming
- 6 tools: `find_relevant_tables` (ChromaDB vector search), `inspect_schema` (live DDL + samples), `run_sql` (validated execution), `suggest_chart`, `ask_user` (interactive pauses), `summarize_results`
- `SessionMemory` with auto-compaction at ~8K tokens
- Guardrails: max 6 tool calls, 30s timeout, max 3 SQL retries, Haiku primary + Sonnet fallback
- Endpoints: `/api/v1/agent/run` (SSE stream), `/api/v1/agent/respond` (user response to `ask_user`)

**Connection model:** `app.state.connections[email][conn_id]` → `ConnectionEntry` (models.py) holding a `DatabaseConnector` + `QueryEngine`. Connections are lazy (no DB connection on startup), gracefully disconnected on shutdown.

**Behavior Intelligence (`behavior_engine.py`):**
- Predictive next-action suggestions from query history, schema context, and compacted behavioral profiles
- Detects user skill level (basic/intermediate/advanced) from SQL pattern analysis
- Consent-gated: users control tracking level via `/api/v1/behavior` routes
- Profile stored in `.data/user_data/{hash}/behavior_profile.json`

**Routers (`backend/routers/`):** `auth_routes` (OTP + OAuth), `connection_routes` (DB connect/disconnect/save/load), `query_routes` (generate/execute/feedback/suggestions/dashboard-gen), `schema_routes` (table listing/DDL/ER positions), `chat_routes` (session CRUD), `user_routes` (profile/account/billing/tickets), `dashboard_routes` (tile CRUD + layout), `admin_routes` (separate JWT, user/ticket management), `alert_routes` (NL-defined alert CRUD with webhook support), `behavior_routes` (behavior tracking deltas + consent management), `agent_routes` (SSE agent streaming + waterfall router singleton).

**Alert system (`routers/alert_routes.py`):**
- NL condition text parsed into SQL + column + operator + threshold
- Per-plan alert count limits; frequency-based checks (15 min to weekly)
- Per-alert Slack/Teams webhook URLs

**Email digest service (`digest.py`):**
- APScheduler-based; per-user daily/weekly/none frequency (stored in `notification_preferences.digest_frequency`)
- Collects query metrics (total, success rate, avg latency) and sends styled HTML email
- `start_digest_scheduler()` / `stop_digest_scheduler()` called in app lifespan

**Redis client (`redis_client.py`):**
- Singleton connection pool via `get_redis()`; graceful degradation (returns `None` if unavailable, callers fall back to in-memory)
- 30s TTL-based retry backoff after connection failure

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

**Config:** `config.py` — Pydantic `BaseSettings` singleton (`settings`). All config from `backend/.env`. `.env` path resolved relative to `config.py`, not the working directory. Model defaults: `claude-haiku-4-5-20251001` (primary), `claude-sonnet-4-5-20250514` (fallback). Note `.env.example` lists `claude-sonnet-4-6` as fallback — reconcile if updating models.

**Storage abstraction:** `user_storage.py` defines a `StorageBackend` ABC with pluggable backends (file, S3, SQLite, Postgres). Default is file-based. All per-user data I/O goes through this module.

### Frontend — React 19 + Vite 8 (`/frontend`)

**State:** Zustand store (`store.js`) — auth, connections, chat, profile, agent. Token persisted to localStorage. Agent slice: `agentSteps`, `agentLoading`, `agentError`, `agentWaiting`, `agentAutoExecute`, `agentChatId`.

**API layer:** `api.js` — injects JWT `Authorization` header. 401 responses redirect to `/login`. Admin API uses separate `admin_token` in localStorage.

**Routing:** `App.jsx` — React Router v7 with `ProtectedRoute` HOC and `AnimatePresence` page transitions. Route map:
- Public: `/` (Landing), `/login`, `/auth/callback`, `/admin/login`, `/admin`
- Protected (no sidebar): `/tutorial`
- Protected (with `AppLayout` sidebar): `/dashboard`, `/schema`, `/chat`, `/profile`, `/account`, `/billing`, `/analytics`
- `/dashboard` → `Dashboard.jsx` (view-only, query result tiles); `/analytics` → `DashboardBuilder.jsx` (full drag-resize builder with TileEditor)

**Agent UI** (`src/components/agent/`):
- `AgentPanel.jsx` — draggable/resizable dockable panel (float/right/bottom/left positions)
- `AgentStepFeed.jsx` — renders agent thinking, tool calls, user questions, results in real-time
- `AgentQuestion.jsx` — inline question UI (buttons or text input) for `ask_user` tool responses
- Integrated into Chat page (streaming steps) and Dashboard (floating progress overlay + dockable panel)

**Animation system** (`src/components/animation/`): Three.js 3D backgrounds (`Background3D`, `SectionBackground3D`, `FrostedBackground3D`, `NeonBackground3D`) lazy-loaded with a `WebGLErrorBoundary` fallback to `AnimatedBackground` (2D). Also: `PageTransition`, `StaggerContainer`, `MotionButton`, `AnimatedCounter`, `SkeletonLoader`, `useScrollReveal` hook.

**Dashboard subsystem** (`src/components/dashboard/`):
- `tokens.js` (`src/components/dashboard/tokens.js`) — single source of truth for design tokens (colors, radii, transitions, chart palettes). Import `TOKENS` and `CHART_PALETTES` from here; don't hardcode hex values in dashboard components.
- Uses `react-grid-layout` for drag-resize tiles, `html2canvas` + `jspdf` for export.
- `PresentationEngine.jsx` — importance-scored tile bin-packing into 16:9 slides with animated transitions (KPI > chart > table > SQL-only scoring).
- `AlertManager.jsx` — NL alert creation/testing/listing UI with webhook config.

**Dashboard lib utilities** (`src/lib/`): `dataBlender.js` — client-side left-join across multiple query result sets; `metricEvaluator.js` — KPI threshold/conditional logic; `visibilityRules.js` — tile show/hide rule engine; `formatUtils.js` — number/date formatting helpers.

**Charts:** Both ECharts (`echarts-for-react`) and Recharts (`recharts`) are used — check which library an existing component uses before adding a new chart.

**Styling:** Tailwind CSS 4.2 + custom glassmorphism classes in `index.css`. Dark theme (`#06060e` bg). Fonts: Poppins (headings) + Open Sans (body). Animations: Framer Motion + GSAP. Three.js for 3D landing backgrounds.

### Query Intelligence System (`/backend` — 6 new modules)

Four-tier waterfall that makes the agent/chat/dashboard feel instant on large datasets. Each query routes through tiers in order; the first hit wins.

```
User question
  → Tier 0: SchemaTier (schema_intelligence.py) — ~7ms
  │   Answers structural questions ("what tables?", "how many rows?") from cached metadata.
  │   Profiles DB on connect: table names, columns, row counts, indexes, partitions.
  │   Cache: .data/schema_cache/{conn_id}.json (atomic writes, TTL-based staleness).
  │   Hash-based drift detection: validate_freshness() compares cached vs live schema hash.
  │
  → Tier 1: MemoryTier (query_memory.py) — ~19ms
  │   Answers from anonymized query insights stored in ChromaDB.
  │   Stores SQL *intents* (anonymize_sql strips all literals → "SELECT col FROM t WHERE x = ?").
  │   Shared across users on the same DB (network effect). Scoped by conn_id.
  │   Collection: {QUERY_MEMORY_COLLECTION_PREFIX}{conn_id}.
  │   Auto-stored after every successful query; confidence boosted on positive feedback.
  │
  → Tier 2a: TurboTier (duckdb_twin.py) — <100ms
  │   Queries a local DuckDB replica (opt-in "Turbo Mode" per connection).
  │   Twin: .data/turbo_twins/{conn_id}.duckdb (sampled rows, max 50K/table).
  │   User-triggered via POST /connections/{conn_id}/turbo/enable (background sync).
  │   Cleaned up on disconnect. Refresh via /turbo/refresh.
  │
  → Tier 2b: LiveTier (query_decomposer.py) — seconds, streamed
      Final fallback — always answers. Agent generates SQL as usual.
      Can decompose queries into parallel sub-queries (by GROUP BY partition).
      Uses sqlglot for SQL parsing. Max 10 sub-queries.
```

**Routing logic** (`waterfall_router.py`): Strategy pattern — `WaterfallRouter` holds ordered `BaseTier` subclasses. `route_sync()` is the sync-safe entry point (avoids event loop conflicts with FastAPI). `ValidationGate` checks schema hash before serving cached results; rejects empty hashes for data-returning tiers (memory/turbo).

**Module-level singleton**: `_waterfall_router` in `agent_routes.py` — do NOT create per-request. This prevents ChromaDB client proliferation.

**Audit trail** (`audit_trail.py`): Append-only JSONL at `.data/audit/query_decisions.jsonl`. Logs every routing decision with conn_id, question hash, tiers checked, tier hit, schema hash. Thread-safe, auto-rotates at 50MB.

**Config** (13 new settings in `config.py`): `SCHEMA_CACHE_MAX_AGE_MINUTES` (60), `QUERY_MEMORY_ENABLED` (True), `QUERY_MEMORY_TTL_HOURS` (168), `TURBO_MODE_ENABLED` (True), `TURBO_TWIN_MAX_SIZE_MB` (500), `TURBO_TWIN_SAMPLE_PERCENT` (1.0), `DECOMPOSITION_ENABLED` (True), `DECOMPOSITION_MIN_ROWS` (1M), `STREAMING_PROGRESS_INTERVAL_MS` (1000).

**Frontend** (`AgentStepFeed.jsx`): Three new SSE step types (additive, Invariant-7):
- `tier_routing` — amber badge: "Checking intelligence tiers..."
- `progress` — progress bar with elapsed/estimated time or sub-query count
- `tier_hit` — green badge: "Answered from team knowledge (3m ago)" / "Answered from Turbo Mode"

**Store** (`store.js`): `agentTierInfo`, `turboStatus`, `queryIntelligence`, `setTurboStatus()`, `setQueryIntelligence()`.

**API** (`api.js`): `enableTurbo()`, `disableTurbo()`, `getTurboStatus()`, `refreshTurbo()`, `getSchemaProfile()`, `refreshSchema()`.

## Key Constraints

- **Read-only enforcement** — driver, SQL validator, and connector layers. Never weaken any.
- **PII masking** — `mask_dataframe()` must run before any data reaches users or the LLM.
- **Two-step query flow** — `/generate` then `/execute`. Don't collapse.
- **Agent guardrails** — max 6 tool calls, 30s timeout, max 3 SQL retries. Agent's `run_sql` tool uses the same validator + read-only enforcement as the main pipeline.
- **Daily query limits** enforced in `query_routes.py`. Plans: free=10, weekly=50, monthly=200, yearly=500, pro=1000, enterprise=unlimited.
- **`JWT_SECRET_KEY`** — also derives the Fernet key for saved DB passwords. Changing it invalidates all saved connection configs.
- **Vite proxy** → `http://localhost:8002`. Backend must run on port 8002 during development. `vite.config.js` has manual chunk splitting for echarts, framer-motion, three.js, and export libs (html2canvas/jspdf) — keep this when adding large dependencies.
- **Admin auth** is a separate JWT flow (`admin_token` in localStorage), not the same as user auth.
- **User deletion** is soft-delete — archived in `deleted_users.json`.
- **CORS** configured for `localhost:5173`, `localhost:3000`, and `FRONTEND_URL`. Update for production.
- **OAuth redirect URI** defaults to `http://localhost:5173/auth/callback` (configurable via `OAUTH_REDIRECT_URI`).
- **OTP-first registration** — email (and optionally phone) must be OTP-verified before `create_user()` is called. The `pending_verifications.json` file tracks this state; do not skip verification in the registration flow.
- **Redis is optional** — `redis_client.py` degrades gracefully. Features using Redis must have in-memory fallbacks.
- **Waterfall router is a module-level singleton** in `agent_routes.py`. Never create per-request (`build_default_router()` instantiates ChromaDB clients).
- **`route_sync()`** — always use this instead of `route()` from sync code. Avoids `asyncio.new_event_loop()` conflicts with FastAPI's running loop.
- **Waterfall early-return must store in memory** — if a tier answers and the agent returns early, call `memory.add_turn()` for both question and answer BEFORE returning. Otherwise session history is lost.
- **ValidationGate rejects empty hashes** for memory/turbo tiers. Only schema/live tiers (which read live data) pass through without a hash.
- **Turbo Mode is opt-in per connection** — privacy-sensitive customers can skip it. Twin + turbo_status cleaned up on disconnect.
- **Query memory stores anonymized SQL intents** — `anonymize_sql()` strips all literals. Sensitive column names (`ssn`, `salary`, etc.) are masked to `[MASKED]` in both `sql_intent` and `columns` metadata before ChromaDB storage (P1 fix 2026-04-06). Never store raw query results or column values in ChromaDB.
- **`query_twin()` validates SQL** through `sql_validator.SQLValidator` before execution and caps results at 10K rows (P1 fix 2026-04-06). This prevents filesystem-reading DuckDB functions and OOM from unbounded fetchall.
- **`cleanup_stale()` on QueryMemory** is defined but not auto-scheduled — call it periodically or on disconnect to prevent unbounded ChromaDB growth.

## Deferred Security Hardening (Prompt When Ready)

Items #1-4 identified during R7 NEMESIS testing; #5-8 during Query Intelligence NEMESIS testing (both 2026-04-06). Low-risk today but critical at specific milestones. **When the user reaches a milestone below, proactively recommend implementing the corresponding fix.**

| # | Fix | File(s) | Milestone Trigger | Effort | Risk if Skipped |
|---|-----|---------|-------------------|--------|-----------------|
| 1 | **OTP hash storage** — store `hmac(secret, code)` instead of plaintext OTP codes in `pending_verifications.json` | `otp.py` | Pre-launch (before first paying customer) | ~30 min | Plaintext OTPs in JSON file; low risk in dev, unacceptable in prod |
| 2 | **In-memory OTP rate limiter** — replace file-based rate limiting with `collections.defaultdict` + TTL eviction so attackers can't bypass by deleting the log file | `otp.py` | Before SOC 2 / compliance audit | ~1-2 hrs | File-deletable rate limit; low risk without hostile filesystem access |
| 3 | **PII column-name masking in ChromaDB** — mask column names like `ssn`, `salary` before embedding into vector store metadata | `query_engine.py`, `pii_masking.py` | When adding team/multi-tenant features | ~2-3 hrs | Column names (not values) visible in shared ChromaDB; single-tenant = no exposure |
| 4 | **Async ask_user (replace thread polling)** — convert `_waiting_for_user` polling loop to `asyncio.Event` so parked agent sessions don't consume thread pool slots | `agent_engine.py`, `routers/agent_routes.py` | ~50 concurrent agent users (thread pool exhaustion threshold) | ~3-4 hrs | Thread starvation under load; irrelevant at low concurrency |
| 5 | ~~**Column-name masking in query memory**~~ — **RESOLVED 2026-04-06** (P1 adversarial fix). Sensitive column names now masked to `[MASKED]` in `sql_intent` and `columns` metadata before ChromaDB storage. | `query_memory.py`, `agent_engine.py` | ~~When adding multi-tenant / team features~~ | Done | Resolved |
| 6 | **DuckDB twin encryption at rest** — encrypt `.duckdb` twin files or restrict to encrypted volumes | `duckdb_twin.py` | Pre-launch for healthcare/finance customers | ~2-3 hrs | Sampled rows (potentially PHI/PII) stored in plaintext on disk |
| 7 | **Auto-schedule `cleanup_stale()`** — add periodic background task to purge expired query memory insights | `query_memory.py`, `main.py` | When ChromaDB storage exceeds 1GB or ~10K insights per connection | ~1 hr | Unbounded ChromaDB collection growth; performance degradation over time |
| 8 | **Schema profiling async** — move `profile_connection()` to background task during connect to avoid blocking slow databases (Snowflake, BigQuery) | `connection_routes.py`, `schema_intelligence.py` | When supporting cloud warehouses with >30s introspection time | ~1-2 hrs | Connect endpoint blocks for 30-120s on slow databases |
| 9 | **`anonymize_sql` coverage gaps** — add regex branches for hex (`0xFF`), scientific notation (`1e10`), dollar-quoted (`$$...$$`), and fix backslash-escape model for SQL-standard `''` escaping | `query_memory.py` | Before multi-tenant or when storing insights from PostgreSQL/MySQL workloads | ~2 hrs | Literal values leak into shared ChromaDB through unrecognized syntax forms |
| 10 | **`refresh_twin()` atomic swap** — replace delete-then-create with create-new-then-rename to eliminate unavailability window during refresh | `duckdb_twin.py` | ~10+ concurrent turbo users (intermittent query failures during refresh) | ~1-2 hrs | Concurrent queries fail with "twin does not exist" during refresh window |
| 11 | **Audit trail fsync optimization** — replace per-entry `os.fsync()` under global `_write_lock` with buffered writes or async write queue | `audit_trail.py` | ~50+ concurrent users (fsync serializes all routing decisions) | ~2 hrs | 5-50ms latency penalty per concurrent audit write, P99 latency spikes |
| 12 | **Waterfall cache hits and query limits** — SchemaTier/MemoryTier early returns in agent_engine.py bypass `increment_query_stats()` | `agent_engine.py` | Before monetization launch (free-plan users get unlimited cached queries) | ~30 min | Daily query limits not enforced for waterfall-cached answers |

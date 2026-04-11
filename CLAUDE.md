# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AskDB** (formerly QueryCopilot) — a natural language-to-SQL analytics SaaS. Users connect their own database, ask questions in plain English, and receive generated SQL (shown for review before execution), results, auto-generated charts, and a natural-language summary. Includes an agentic multi-step query mode, NL-defined alerts, scheduled email digests, and a dashboard presentation engine.

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

# Preview production build locally
npm run preview
```

There are no automated tests. `test_registration.py`, `regression_test.py`, `test_agent_engine.py`, `test_phase*.py`, and `test_waterfall.py` are manual scripts, not pytest suites.

**Docker:**
```bash
docker-compose up --build    # backend on :8000, frontend on :5173
```
Note: Docker maps backend to port 8000, not 8002. For local dev without Docker, always use port 8002 to match the Vite proxy target in `vite.config.js`.

**Manual test scripts** (not pytest — run individually):
```bash
cd backend
python test_registration.py       # auth flow smoke test
python test_waterfall.py          # waterfall routing tiers
python test_agent_engine.py       # agent tool-use loop
python test_phase1.py             # incremental feature tests (1-4)
python test_bi_editability.py     # BI editability features
python test_dual_response_invariants.py  # dual-response system invariants
python regression_test.py         # broad regression checks
```

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
- 6 core tools + 5 dashboard tools: `find_relevant_tables` (ChromaDB vector search), `inspect_schema` (live DDL + samples), `run_sql` (validated execution), `suggest_chart`, `ask_user` (interactive pauses), `summarize_results`, `list_dashboards`, `get_dashboard_tiles`, `create_dashboard_tile`, `update_dashboard_tile`, `delete_dashboard_tile`
- `SessionMemory` with auto-compaction at ~8K tokens
- **Dynamic tool budget**: heuristic initial (dashboard=20, complex=15, simple=8) with auto-extension in increments of 10, safety cap at 100. Extensions logged to audit trail.
- **Lightweight planning**: Complex/dashboard queries trigger a Sonnet planning call that generates a task list. Plan emitted as `AgentStep(type="plan")` shown as checklist in UI. Auto-executes without user gate.
- **Structured progress tracker**: `_progress` dict tracks `{goal, completed, pending, total_tool_calls}`. Updated after each tool call. Used by `/continue` endpoint for session resume.
- **Dialect-aware SQL hints**: BigQuery, Snowflake, MySQL, MSSQL, PostgreSQL hints injected into system prompt based on `connection_entry.db_type`.
- **Sliding context compaction**: Every 6 tool calls, old tool_result content is summarized to 1-line summaries. Keeps context under ~15K tokens for long dashboard builds.
- Guardrails: dynamic budget (up to 100 tool calls), phase-aware timeouts (planning 30s, schema 60s, SQL gen 30s, DB exec 300s, verify 30s), 1800s session hard cap, max 3 SQL retries, Haiku primary + Sonnet fallback
- **Session persistence** (`agent_session_store.py`): SQLite at `.data/agent_sessions.db` (WAL mode). Sessions auto-saved on SSE completion and on disconnect. 50 sessions per user cap with auto-purge.
- Endpoints: `/api/v1/agent/run` (SSE stream), `/api/v1/agent/respond` (user response to `ask_user`), `/api/v1/agent/continue` (resume interrupted session), `/api/v1/agent/sessions` (list), `/api/v1/agent/sessions/{chat_id}` (load/delete)

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
PostgreSQL, MySQL, MariaDB, SQLite, MSSQL, CockroachDB, Snowflake\*, BigQuery\*, Redshift, Databricks\*, ClickHouse, DuckDB, Trino, Oracle, SAP HANA\*, IBM Db2\*, Supabase. (\* = driver commented out in `requirements.txt`; install manually.) Note: Supabase is a virtual type — connects via the PostgreSQL driver.

**Data persistence (file-based, no application database):**
- `.data/users.json` — user accounts (bcrypt hashed passwords), thread-locked
- `.data/pending_verifications.json` — temporary OTP verification state (email/phone must be OTP-verified before account creation completes)
- `.data/oauth_states.json` — short-lived OAuth CSRF state tokens (10-min TTL, auto-purged)
- `.data/user_data/{sha256_prefix}/` — per-user: `connections.json` (Fernet-encrypted passwords), `chat_history/`, `query_stats.json`, `er_positions/`, `dashboards.json`, `profile.json`
- `.chroma/querycopilot/` — ChromaDB vector store. Deleting it loses all trained context; re-seed only by reconnecting.
- Atomic file writes (write-then-rename) are used intentionally for crash safety; preserve this pattern.
- `.data/` and `.chroma/` are gitignored — all runtime state lives there. Never commit these directories.

**BYOK (Bring Your Own Key) provider system:**
- `model_provider.py` — `ModelProvider` ABC that all LLM adapters implement. Defines `ProviderResponse`, `ContentBlock`, `ProviderToolResponse` data classes.
- `anthropic_provider.py` — Anthropic SDK adapter (the ONLY file that should `import anthropic`). Supports prompt caching, native tool-use, token streaming, circuit breaker (3 failures → 30s cooldown).
- `provider_registry.py` — resolves the correct provider + API key per user. Demo user (`demo@askdb.dev`) gets the platform key; all others must supply their own. Model catalog in `ANTHROPIC_MODELS` dict.
- User API keys stored Fernet-encrypted in per-user profile via `user_storage.py`. Key validation and status tracked through `user_routes.py` endpoints.

**Config:** `config.py` — Pydantic `BaseSettings` singleton (`settings`). All config from `backend/.env`. `.env` path resolved relative to `config.py`, not the working directory. Model defaults: `claude-haiku-4-5-20251001` (primary), `claude-sonnet-4-5-20250514` (fallback). Note `.env.example` lists `claude-sonnet-4-6` as fallback — reconcile if updating models.

**Storage abstraction:** `user_storage.py` defines a `StorageBackend` ABC with pluggable backends (file, S3, SQLite, Postgres). Default is file-based. All per-user data I/O goes through this module.

### Frontend — React 19 + Vite 8 (`/frontend`)

**State:** Zustand store (`store.js`) — auth, connections, chat, profile, agent, theme. Token persisted to localStorage. Agent slice properties:
- Core: `agentSteps`, `agentLoading`, `agentError`, `agentWaiting`, `agentWaitingOptions`, `agentAutoExecute`, `agentChatId`
- UI panel: `agentDock` (float/right/bottom/left), `agentPanelWidth`, `agentPanelHeight`, `agentPanelOpen`, `agentResizing`
- Progress: `agentChecklist`, `agentPhase`, `agentElapsedMs`, `agentEstimatedMs`, `agentSessionProgress`, `agentVerification`
- Permissions: `agentPersona`, `agentPermissionMode`
- Dual-response: `dualResponseActive`, `cachedResultStep`
- Intelligence: `agentTierInfo`, `turboStatus`, `queryIntelligence`

**API layer:** `api.js` — injects JWT `Authorization` header. 401 responses redirect to `/login`. Admin API uses separate `admin_token` in localStorage.

**Routing:** `App.jsx` — React Router v7 with `ProtectedRoute` HOC and `AnimatePresence` page transitions. `ProtectedRoute` gates on `apiKeyStatus` — BYOK users without a valid key are redirected to set one up. Route map:
- Public: `/` (Landing), `/login`, `/auth/callback`, `/admin/login`, `/admin`, `/shared/:id` (SharedDashboard)
- Protected (no sidebar): `/tutorial`, `/onboarding`
- Protected (with `AppLayout` sidebar): `/dashboard`, `/schema`, `/chat`, `/profile`, `/account`, `/billing`, `/analytics`
- `/dashboard` → `Dashboard.jsx` (view-only, query result tiles); `/analytics` → `DashboardBuilder.jsx` (full drag-resize builder with TileEditor)

**Top-level shared components** (`src/components/`): `AppLayout.jsx` (sidebar + main content wrapper), `AppSidebar.jsx`, `DatabaseSwitcher.jsx` (connection picker), `ERDiagram.jsx` (schema visualization), `ResultsChart.jsx` + `ResultsTable.jsx` (query result rendering), `SQLPreview.jsx`, `SchemaExplorer.jsx`, `StatSummaryCard.jsx`, `AskDBLogo.jsx`, `UserDropdown.jsx`.

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

**Onboarding flow** (`src/components/onboarding/`, `src/pages/Onboarding.jsx`): Multi-step wizard — Welcome → Tour → API Key setup → DB Connect → First Query. Guides new users through BYOK key entry and first connection. Has a Skip button for users who want to explore first.

**SharedDashboard** (`src/pages/SharedDashboard.jsx`): Public read-only dashboard view at `/shared/:id`. No auth required. Uses `TOKENS` and `CHART_PALETTES` from `tokens.js`.

**Dashboard lib utilities** (`src/lib/`): `dataBlender.js` — client-side left-join across multiple query result sets; `metricEvaluator.js` — KPI threshold/conditional logic; `visibilityRules.js` — tile show/hide rule engine; `formatUtils.js` — number/date formatting helpers; `anomalyDetector.js` — client-side anomaly detection; `formulaSandbox.js` + `formulaWorker.js` — sandboxed formula evaluation (Web Worker); `exportUtils.js` — dashboard export helpers; `gpuDetect.jsx` — `GPUTierProvider` context for conditional 3D rendering; `behaviorEngine.js` — client-side behavior tracking utilities; `fieldClassification.js` — column type classification for auto chart suggestions.

**Charts:** ECharts only (`echarts-for-react`). Used in `ResultsChart.jsx` and `CanvasChart.jsx`. Do not introduce a second chart library.

**Theme system:** Light/dark/system preference stored in Zustand (`theme`/`resolvedTheme`), persisted to `localStorage("askdb-theme")`. `useThemeInit` hook in `App.jsx` toggles `.light` class on `<html>`. CSS variables in `index.css` handle both modes. Dashboard tokens in `tokens.js` adapt to resolved theme.

**Styling:** Tailwind CSS 4.2 + custom glassmorphism classes in `index.css`. Dark theme default (`#06060e` bg). Fonts: Poppins (headings) + Open Sans (body). Animations: Framer Motion + GSAP. Three.js for 3D landing backgrounds.

### Query Intelligence System (`/backend` — 6 modules)

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

**Config** (`config.py`): `SCHEMA_CACHE_MAX_AGE_MINUTES` (60), `QUERY_MEMORY_ENABLED` (True), `QUERY_MEMORY_TTL_HOURS` (168), `TURBO_MODE_ENABLED` (True), `TURBO_TWIN_MAX_SIZE_MB` (500), `TURBO_TWIN_SAMPLE_PERCENT` (1.0), `DECOMPOSITION_ENABLED` (True), `DECOMPOSITION_MIN_ROWS` (1M), `STREAMING_PROGRESS_INTERVAL_MS` (1000).

**Frontend** (`AgentStepFeed.jsx`): Three new SSE step types (additive, Invariant-7):
- `tier_routing` — amber badge: "Checking intelligence tiers..."
- `progress` — progress bar with elapsed/estimated time or sub-query count
- `tier_hit` — green badge: "Answered from team knowledge (3m ago)" / "Answered from Turbo Mode"

**Store** (`store.js`): `agentTierInfo`, `turboStatus`, `queryIntelligence`, `setTurboStatus()`, `setQueryIntelligence()`.

**API** (`api.js`): `enableTurbo()`, `disableTurbo()`, `getTurboStatus()`, `refreshTurbo()`, `getSchemaProfile()`, `refreshSchema()`.

### Dual-Response System (Progressive Dual-Response Data Acceleration)

When a waterfall tier (memory/turbo) answers a query, the system can simultaneously stream a cached answer and fire a live query to verify freshness. Controlled by 4 config flags:
- `DUAL_RESPONSE_ENABLED` (default True) — master toggle
- `DUAL_RESPONSE_STALENESS_TTL_SECONDS` (default 300) — cache age threshold; older than this = stale
- `DUAL_RESPONSE_ALWAYS_CORRECT` (default True) — always fire live correction even when cache is fresh
- `WRITE_TIME_MASKING` (default False) — PII mask at DuckDB write time instead of read time
- `BEHAVIOR_WARMING_ENABLED` (default False) — pre-warm cache based on predicted query patterns

### Feature Flags (`config.py`)

20+ feature flags control predictive intelligence. Enabled by default: `FEATURE_PREDICTIONS` (suggestions), `FEATURE_ADAPTIVE_COMPLEXITY` (skill detection), `FEATURE_INTENT_DISAMBIGUATION`, `FEATURE_ANALYST_TONE`, `FEATURE_TIME_PATTERNS`, `FEATURE_AGENT_DASHBOARD` (agent tile control), `FEATURE_PERMISSION_SYSTEM` (supervised/autonomous). Disabled by default: session tracking, consent flow, autocomplete, personas, insight chains, collaborative predictions, style matching, data prep, workflow templates, skill gaps, anomaly alerts, auto-switch, smart preload. Check `config.py` for the full list — flags are grouped with numbered comments referencing their design doc origins.

### Reference Documents (`/docs`)

`PROJECT_JOURNAL.md` — full engineering history (architecture decisions, blockers, resolutions). `DASHBOARD_DEEP_DIVE.md` — detailed dashboard subsystem design. `docs/` — session journals, design brainstorms, and audit reports. These are read-only reference material, not configuration.

## Key Constraints

- **Read-only enforcement** — driver, SQL validator, and connector layers. Never weaken any.
- **PII masking** — `mask_dataframe()` must run before any data reaches users or the LLM.
- **Two-step query flow** — `/generate` then `/execute`. Don't collapse.
- **Agent guardrails** — dynamic tool budget (heuristic 8/15/20, auto-extends to 100), phase-aware timeouts (planning 30s, schema 60s, SQL gen 30s, DB exec 300s, verify 30s), 600s per-segment soft cap, 1800s session hard cap, max 3 SQL retries, per-user concurrency cap (2 active sessions). Smart verification pass on complex queries (JOINs, aggregations, 3+ tool calls) with HIGH/MEDIUM/LOW confidence scoring. Claude Code-style progress checklist with phase badges and ETA. First-class cancel button wired to backend cancel endpoint. Agent's `run_sql` tool uses the same validator + read-only enforcement as the main pipeline. Sessions persisted to SQLite (`.data/agent_sessions.db`).
- **Daily query limits** enforced in `query_routes.py`. Plans: free=10, weekly=50, monthly=200, yearly=500, pro=1000, enterprise=unlimited.
- **`JWT_SECRET_KEY`** — also derives the Fernet key for saved DB passwords. Changing it invalidates all saved connection configs.
- **Vite proxy** → `http://localhost:8002`. Backend must run on port 8002 during development. `vite.config.js` has manual chunk splitting for echarts, framer-motion, three.js, and export libs (html2canvas/jspdf) — keep this when adding large dependencies.
- **Admin auth** is a separate JWT flow (`admin_token` in localStorage), not the same as user auth.
- **User deletion** is soft-delete — archived in `deleted_users.json`.
- **Config safety rails** — `MAX_ROWS` capped at 50,000 even if `.env` sets higher. Mandatory blocked keywords (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `MERGE`) are force-appended if missing from `BLOCKED_KEYWORDS`. JWT default key causes `CRITICAL` log and hard exit in production/staging (`ASKDB_ENV` or `QUERYCOPILOT_ENV`).
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
- **Share tokens** — dashboard sharing uses time-limited tokens (`SHARE_TOKEN_EXPIRE_HOURS`, default 7 days). Expired/revoked tokens auto-pruned on startup via `prune_expired_share_tokens()`.
- **SQL Allowlist mode** — `SQL_ALLOWLIST_MODE` (default False) + `SQL_ALLOWED_TABLES` restricts queries to an explicit table list. Off by default; enable for tightly scoped deployments.
- **Thread pool** — explicit `ThreadPoolExecutor(max_workers=THREAD_POOL_MAX_WORKERS)` set in lifespan startup (default 32, bounded 4–256). Replaces the default 8–12 thread pool to prevent agent concurrency bottlenecks.

## Deferred Security Hardening (Prompt When Ready)

Items #1-4 identified during R7 NEMESIS testing; #5-8 during Query Intelligence NEMESIS testing (both 2026-04-06). Low-risk today but critical at specific milestones. **When the user reaches a milestone below, proactively recommend implementing the corresponding fix.**

| # | Fix | File(s) | Milestone Trigger | Effort | Risk if Skipped |
|---|-----|---------|-------------------|--------|-----------------|
| 1 | **OTP hash storage** — store `hmac(secret, code)` instead of plaintext OTP codes in `pending_verifications.json` | `otp.py` | Pre-launch (before first paying customer) | ~30 min | Plaintext OTPs in JSON file; low risk in dev, unacceptable in prod |
| 2 | **In-memory OTP rate limiter** — replace file-based rate limiting with `collections.defaultdict` + TTL eviction so attackers can't bypass by deleting the log file | `otp.py` | Before SOC 2 / compliance audit | ~1-2 hrs | File-deletable rate limit; low risk without hostile filesystem access |
| 3 | **PII column-name masking in ChromaDB** — mask column names like `ssn`, `salary` before embedding into vector store metadata | `query_engine.py`, `pii_masking.py` | When adding team/multi-tenant features | ~2-3 hrs | Column names (not values) visible in shared ChromaDB; single-tenant = no exposure |
| 4 | ~~**Async ask_user (replace thread polling)**~~ — **RESOLVED 2026-04-10**: converted `time.sleep(0.3)` polling to `threading.Event.wait()` in `agent_engine.py`; `/respond` and `/cancel` signal the event | `agent_engine.py`, `routers/agent_routes.py` | ~~~50 concurrent agent users~~ | Done | Thread starvation eliminated |
| 5 | **DuckDB twin encryption at rest** — encrypt `.duckdb` twin files or restrict to encrypted volumes | `duckdb_twin.py` | Pre-launch for healthcare/finance customers | ~2-3 hrs | Sampled rows (potentially PHI/PII) stored in plaintext on disk |
| 6 | **Auto-schedule `cleanup_stale()`** — add periodic background task to purge expired query memory insights | `query_memory.py`, `main.py` | When ChromaDB storage exceeds 1GB or ~10K insights per connection | ~1 hr | Unbounded ChromaDB collection growth; performance degradation over time |
| 7 | **Schema profiling async** — move `profile_connection()` to background task during connect to avoid blocking slow databases (Snowflake, BigQuery) | `connection_routes.py`, `schema_intelligence.py` | When supporting cloud warehouses with >30s introspection time | ~1-2 hrs | Connect endpoint blocks for 30-120s on slow databases |
| 8 | **`anonymize_sql` coverage gaps** — add regex branches for hex (`0xFF`), scientific notation (`1e10`), dollar-quoted (`$$...$$`), and fix backslash-escape model for SQL-standard `''` escaping | `query_memory.py` | Before multi-tenant or when storing insights from PostgreSQL/MySQL workloads | ~2 hrs | Literal values leak into shared ChromaDB through unrecognized syntax forms |
| 9 | **`refresh_twin()` atomic swap** — replace delete-then-create with create-new-then-rename to eliminate unavailability window during refresh | `duckdb_twin.py` | ~10+ concurrent turbo users (intermittent query failures during refresh) | ~1-2 hrs | Concurrent queries fail with "twin does not exist" during refresh window |
| 10 | **Audit trail fsync optimization** — replace per-entry `os.fsync()` under global `_write_lock` with buffered writes or async write queue | `audit_trail.py` | ~50+ concurrent users (fsync serializes all routing decisions) | ~2 hrs | 5-50ms latency penalty per concurrent audit write, P99 latency spikes |
| 11 | ~~**Waterfall cache hits and query limits**~~ — **RESOLVED 2026-04-10**: all 3 early-return paths (route_sync schema/memory, dual-response schema, dual-response memory) now call `increment_query_stats()` | `agent_engine.py` | ~~Before monetization~~ | Done | Query limits now enforced for cached answers |


## Debugging & Bug Fixes

When fixing bugs, always verify the fix actually works before reporting success. Run the app/tests and confirm the issue is resolved end-to-end — don't just check that the code looks correct.

## Refactoring Guidelines

When renaming/rebranding across the codebase, account for string splits across JSX tags (e.g., `Data<span>Lens</span>`), template literals, and dynamic string construction — don't rely solely on grep-based find-and-replace.

## Development Environment

Before starting server processes or builds, check for zombie processes on required ports (e.g., `lsof -i :8002`) and kill them. Always verify dependencies are installed for the current Python/Node version before assuming they work.

## General Rules

- When creating or saving files, always confirm the target directory with the user before writing. Default to the project root unless explicitly told otherwise.
- This is a full-stack SaaS app. Primary languages: JavaScript (frontend, React + Vite), Python (backend, FastAPI). When making changes, check both frontend and backend impact.

## graphify

A curated knowledge graph exists at `C:/Users/sid23/knowledge/graphify-out/graph.json` (external to this repo). It captures architecture decisions, security model, data flow, and design constraints.

Rules:
- If `graphify-out/` exists in this repo, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure before answering architecture questions
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files
- Source knowledge docs are at `C:/Users/sid23/knowledge/*.md` — run `/graphify` to rebuild after edits

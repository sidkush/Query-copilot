# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AskDB** (formerly QueryCopilot) — natural language-to-SQL analytics SaaS. User connect own DB, ask plain English, get generated SQL (shown for review before run), results, auto-charts, NL summary. Include agentic multi-step query mode, NL-defined alerts, scheduled email digests, dashboard presentation engine.

## Setup & Running

```bash
# Backend (Python 3.10+, from backend/)
pip install -r requirements.txt
cp .env.example .env        # fill in ANTHROPIC_API_KEY, JWT_SECRET_KEY, etc.
uvicorn main:app --reload --port 8002

# ML training worker (separate process, only if using ML Engine async jobs)
celery -A celery_app worker --loglevel=info

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

**Tests (pytest):**
```bash
cd backend
python -m pytest tests/ -v              # full suite (516+ tests)
python -m pytest tests/test_adv_*.py -v # adversarial hardening tests only
python -m pytest tests/test_bug_*.py -v # backlog bug fix tests only
python -m pytest tests/test_adv_otp_hash.py -v  # single test file
```

516+ auto tests across 84 files in `backend/tests/`. Security-focused + dashboard migration + chart customization — adversarial regression guards for OTP hashing, PII masking, SQL anonymization, file permissions, rate limiting, connection limits, more. Run full suite after any security change. Naming: `test_adv_*` = adversarial hardening, `test_bug_{round}_{number}_*` = backlog bug fixes (round 1–4, numbered).

**Manual test scripts** (not pytest — run one-by-one from `backend/`):
```bash
python test_registration.py       # auth flow smoke test
python test_waterfall.py          # waterfall routing tiers
python test_agent_engine.py       # agent tool-use loop
python test_phase1.py             # incremental feature tests (1-4)
python test_bi_editability.py     # BI editability features
python test_dual_response_invariants.py  # dual-response system invariants
python regression_test.py         # broad regression checks
```

**Docker:**
```bash
docker-compose up --build    # backend on :8000, frontend on :5173
```
Note: Docker map backend to 8000, not 8002. Local dev without Docker always use 8002 to match Vite proxy in `vite.config.js`. Both containers run as non-root `app` user. ChromaDB data persist via `chroma_data` named volume mapped to `/app/.chroma`. No CI/CD pipeline.

## Architecture

Two independent services: FastAPI backend on 8002, React frontend on 5173 (Vite proxies `/api` to backend).

### Backend — FastAPI (`/backend`)

**Entry point:** `main.py` — register routers under `/api`, init `app.state.connections = {}`, start digest scheduler on lifespan startup.

**Core query pipeline (`query_engine.py`):**
1. Embed question → ChromaDB RAG retrieval (per-connection namespaced collections for schema + few-shot)
2. Build prompt → Claude API (Haiku primary, Sonnet fallback on validation fail)
3. SQL cleaned → 6-layer validation (`sql_validator.py`) → optional execution → PII masking → NL summary
4. Positive feedback stored back to ChromaDB for future queries

**Two-step query flow by design:** `/api/queries/generate` (returns SQL for review) → `/api/queries/execute` (user-approved run). Never collapse.

**Agent system (`agent_engine.py`):**
- `AgentEngine` — multi-step tool-use loop using Anthropic native tool-use API with SSE streaming
- 6 core tools + 9 dashboard tools: `find_relevant_tables` (ChromaDB vector search), `inspect_schema` (live DDL + samples), `run_sql` (validated run), `suggest_chart`, `ask_user` (interactive pause), `summarize_results`, `list_dashboards`, `get_dashboard_tiles`, `create_dashboard_tile`, `update_dashboard_tile`, `delete_dashboard_tile`, `create_custom_metric`, `create_section`, `move_tile`, `rename_section`, `set_dashboard_mode`, `set_dashboard_theme`
- `SessionMemory` auto-compacts at ~8K tokens
- **Dynamic tool budget**: heuristic initial (dashboard=20, complex=15, simple=8), auto-extend in increments of 10, safety cap 100. Extensions logged to audit trail.
- **Lightweight planning**: Complex/dashboard queries trigger Sonnet planning call that generates task list. Plan emitted as `AgentStep(type="plan")` shown as checklist in UI. Auto-executes, no user gate.
- **Structured progress tracker**: `_progress` dict tracks `{goal, completed, pending, total_tool_calls}`. Updated after each tool call. Used by `/continue` endpoint for resume.
- **Dialect-aware SQL hints**: BigQuery, Snowflake, MySQL, MSSQL, PostgreSQL hints injected into system prompt from `connection_entry.db_type`.
- **Sliding context compaction**: Every 6 tool calls, old tool_result content summarized to 1-line. Keep context under ~15K tokens for long dashboard builds.
- Guardrails: dynamic budget (up to 100 tool calls), phase-aware timeouts (planning 30s, schema 60s, SQL gen 30s, DB exec 300s, verify 30s), 1800s session hard cap, max 3 SQL retries, Haiku primary + Sonnet fallback
- **Session persistence** (`agent_session_store.py`): SQLite at `.data/agent_sessions.db` (WAL mode). Sessions auto-saved on SSE complete and on disconnect. 50 sessions per user cap with auto-purge.
- Endpoints: `/api/v1/agent/run` (SSE stream), `/api/v1/agent/respond` (user response to `ask_user`), `/api/v1/agent/continue` (resume), `/api/v1/agent/sessions` (list), `/api/v1/agent/sessions/{chat_id}` (load/delete)

**Connection model:** `app.state.connections[email][conn_id]` → `ConnectionEntry` (models.py) hold `DatabaseConnector` + `QueryEngine`. Connections lazy (no DB connect on startup), disconnect gracefully on shutdown.

**Behavior Intelligence (`behavior_engine.py`):**
- Predictive next-action suggestions from query history, schema context, compacted behavior profiles
- Detect user skill level (basic/intermediate/advanced) from SQL pattern analysis
- Consent-gated: user control tracking level via `/api/v1/behavior` routes
- Profile stored in `.data/user_data/{hash}/behavior_profile.json`

**Routers (`backend/routers/`):** `auth_routes` (OTP + OAuth), `connection_routes` (DB connect/disconnect/save/load), `query_routes` (generate/execute/feedback/suggestions/dashboard-gen), `schema_routes` (table listing/DDL/ER positions), `chat_routes` (session CRUD), `user_routes` (profile/account/billing/tickets), `dashboard_routes` (tile CRUD + layout + migration + feature-flags), `admin_routes` (separate JWT, user/ticket management), `alert_routes` (NL alert CRUD with webhook support), `behavior_routes` (behavior tracking deltas + consent), `agent_routes` (SSE agent streaming + waterfall router singleton), `ml_routes` (`/api/v1/ml/train`, `/predict` — direct AutoML), `ml_pipeline_routes` (`/api/v1/ml/pipelines` — workflow CRUD + per-stage exec), `voice_routes` (`/api/v1/voice` WebSocket + `POST /session` ephemeral token mint), `chart_customization_routes` (`/api/v1/chart-types` + `/api/v1/semantic-models` — Sub-projects C + D CRUD).

**Backend modules (chart system):** `dashboard_migration.py` — `legacy_to_chart_spec()` converter + `migrate_user_dashboards()` walker. `chart_customization.py` — per-user storage for user-authored chart types (C) + semantic models (D). `voice_registry.py` — 3-tier ephemeral token mint for BYOK voice. `chart_downsampler.py` — LTTB downsampling for large datasets. `chart_hints.py` — chart suggestion hint generation. `chart_recommender.py` — backend chart auto-recommendation.

**Backend modules (semantic layer — Sub-project D):** `semantic_layer.py` — per-connection semantic model CRUD (measures, dimensions, relationships). `semantic_bootstrap.py` — auto-bootstrap semantic models from schema metadata. `gallery_store.py` — chart type gallery/template storage (Sub-project C). `marketplace_billing.py` — paid chart type billing tracking.

**Backend modules (data pipeline):** `arrow_flight_adapter.py` — Arrow Flight RPC protocol adapter for high-throughput data transfer. `arrow_stream.py` — Arrow IPC streaming utilities. `join_graph.py` — schema join-path discovery for multi-table queries. `param_substitution.py` — query parameter substitution (`$1`, `{{var}}`). `sql_filter_injector.py` — dynamic WHERE clause injection for dashboard filters. `custom_connector.py` — custom database connector logic. `workspace_sharing.py` — multi-user workspace sharing.

**Alert system (`routers/alert_routes.py`):**
- NL condition text parsed into SQL + column + operator + threshold
- Per-plan alert count limits; frequency-based checks (15 min to weekly)
- Per-alert Slack/Teams webhook URLs

**Email digest service (`digest.py`):**
- APScheduler-based; per-user daily/weekly/none frequency (in `notification_preferences.digest_frequency`)
- Collect query metrics (total, success rate, avg latency), send styled HTML email
- `start_digest_scheduler()` / `stop_digest_scheduler()` called in app lifespan

**Redis client (`redis_client.py`):**
- Singleton connection pool via `get_redis()`; graceful degradation (returns `None` if down, callers fall back to in-memory)
- 30s TTL-based retry backoff after connection fail

**Security — three independent layers, never remove:**
1. `db_connector.py` — driver-level read-only (`SET TRANSACTION READ ONLY`)
2. `sql_validator.py` — 6 layers: multi-statement → keyword blocklist → sqlglot AST (15+ dialects) → SELECT-only → LIMIT enforce (negatives clamped to 0) → dangerous-function detect
3. Connector re-validates before execution

**PII masking** (`pii_masking.py`) — substring-based column-name pattern match (catch compound like `employee_ssn`) + Unicode NFKC normalize (prevent fullwidth bypass) + regex value scan. Must run via `mask_dataframe()` before data returns to user or LLM.

**OTP security** (`otp.py`) — OTP codes stored as HMAC-SHA256 hashes (`hmac.new(JWT_SECRET_KEY, code, sha256)`), never plaintext. Verify use `hmac.compare_digest()` for constant-time compare. In-memory rate limit via `collections.defaultdict(list)` with TTL eviction (survives log file deletion).

**JWT hardening** (`config.py`) — `JWT_ALGORITHM` restricted to `_SAFE_JWT_ALGORITHMS = {"HS256", "HS384", "HS512"}` allowlist enforced at startup. Rejects `none` algorithm (CVE-2015-9235).

**Fernet encryption** (`user_storage.py`) — Key derivation use PBKDF2-HMAC-SHA256 with 480K iterations (upgraded from bare SHA-256). Derives Fernet key from `JWT_SECRET_KEY`.

**Input sanitization** (`auth.py`) — `_sanitize_text()` strips HTML tags, HTML entities (`&lt;`, `&#60;`, `&#x3c;`), javascript/data/vbscript URIs, event handler attributes.

**18 supported database engines** (as `DBType` enum in `config.py`):
PostgreSQL, MySQL, MariaDB, SQLite, MSSQL, CockroachDB, Snowflake\*, BigQuery\*, Redshift, Databricks\*, ClickHouse, DuckDB, Trino, Oracle, SAP HANA\*, IBM Db2\*, Supabase. (\* = driver commented in `requirements.txt`; install manually.) Note: Supabase virtual type — connects via PostgreSQL driver.

**Data persistence (file-based, no app database):**
- `.data/users.json` — user accounts (bcrypt hashed passwords), thread-locked
- `.data/pending_verifications.json` — temp OTP verification state (email/phone must OTP-verify before account creation completes)
- `.data/oauth_states.json` — short-lived OAuth CSRF state tokens (10-min TTL, auto-purge)
- `.data/user_data/{sha256_prefix}/` — per-user: `connections.json` (Fernet-encrypted passwords), `chat_history/`, `query_stats.json`, `er_positions/`, `dashboards.json`, `profile.json`
- `.chroma/querycopilot/` — ChromaDB vector store. Delete loses all trained context; re-seed only by reconnecting.
- Atomic file writes (write-then-rename) used intentionally for crash safety; preserve.
- `.data/audit/query_decisions.jsonl` — waterfall routing audit log (auto-rotate at 50MB)
- `.data/schema_cache/{conn_id}.json` — cached schema profiles per connection
- `.data/turbo_twins/{conn_id}.duckdb` — DuckDB replicas for Turbo Mode
- `.data/agent_sessions.db` — SQLite (WAL mode) for agent session persistence
- `.data/ml_models/{user_hash}/` — trained model artifacts (`.joblib`), `dataset.parquet`, run metadata
- `.data/ml_pipelines/{user_hash}/{pipeline_id}.json` — ML workflow state per user (6 stages: ingest, clean, features, train, evaluate, results)
- `.data/user_data/{hash}/chart_customizations.json` — per-user chart types (C) + semantic models (D)
- `.data/user_data/{hash}/dashboards.backup.{ts}.json` — pre-migration snapshot (created by dashboard_migration)
- `.data/` and `.chroma/` gitignored — all runtime state lives there. Never commit.

**BYOK (Bring Your Own Key) provider system:**
- `model_provider.py` — `ModelProvider` ABC that all LLM adapters implement. Defines `ProviderResponse`, `ContentBlock`, `ProviderToolResponse` data classes.
- `anthropic_provider.py` — Anthropic SDK adapter (ONLY file that should `import anthropic`). Supports prompt caching, native tool-use, token streaming, circuit breaker (5 failures → 30s cooldown with jitter, per-API-key isolation).
- `provider_registry.py` — resolves correct provider + API key per user. Demo user (`demo@askdb.dev`) gets platform key; all others must supply own. Model catalog in `ANTHROPIC_MODELS` dict.
- User API keys stored Fernet-encrypted in per-user profile via `user_storage.py`. Key validation and status tracked through `user_routes.py` endpoints.

**Config:** `config.py` — Pydantic `BaseSettings` singleton (`settings`). All config from `backend/.env`. `.env` path resolved relative to `config.py`, not cwd. Model defaults: `claude-haiku-4-5-20251001` (primary), `claude-sonnet-4-5-20250514` (fallback). Note `.env.example` lists `claude-sonnet-4-6` as fallback — reconcile if updating models. Key config not obvious from `.env.example`:
- `ADMIN_JWT_SECRET_KEY` — separate admin JWT secret; falls back to `JWT_SECRET_KEY` if empty (collapses admin/user auth boundary, logged as warning)
- `FERNET_SECRET_KEY` — dedicated Fernet key; falls back to PBKDF2(JWT_SECRET_KEY) if empty
- `DEMO_ENABLED` (default False) — must be explicitly enabled for demo login (`demo@askdb.dev`)
- `ASKDB_ENV` / `QUERYCOPILOT_ENV` — set to `production`/`staging` to force hard exit on default JWT key
- `WATERFALL_CAN_ANSWER_BUDGET_MS` (200ms, min 10ms) / `WATERFALL_ANSWER_BUDGET_MS` (1000ms, min 50ms) — tier routing speed budgets with floor to prevent accidental disable
- `OTP_EXPIRY_SECONDS` (default 600 = 10 min)
- `ML_ENGINE_ENABLED` (True), `ML_FULL_DATASET_ENABLED` (True), `ML_MAX_TRAINING_ROWS` (10M cap), `ML_DEFAULT_SAMPLE_SIZE` (500K stratified), `ML_TRAINING_QUERY_TIMEOUT` (3600s), `ML_TRAINING_TIMEOUT_SECONDS` (3600s), `ML_WORKER_MAX_MEMORY_MB` (512), `ML_MAX_CONCURRENT_TRAINING_PER_USER` (2), `ML_AUTO_EXCLUDE_PII` (True — drops PII columns from features), `ML_MAX_MODELS_FREE` (3) / `ML_MAX_MODELS_PRO` (10), `ML_MODELS_DIR` / `ML_PIPELINES_DIR`

**Storage abstraction:** `user_storage.py` defines `StorageBackend` ABC with pluggable backends (file, S3, SQLite, Postgres). Default file-based. All per-user data I/O goes through this module.

### Frontend — React 19 + Vite 8 (`/frontend`)

**Mostly JavaScript** with a TypeScript carve-out for `chart-ir/**` and `components/editor/**/*.{ts,tsx}`. Vitest 2.x test suite: **1189 tests across 141 files** (`npm run test:chart-ir`). tsconfig scope: `src/chart-ir/**` + `src/components/editor/**/*.{ts,tsx}`. Rest of `src/components/` stays `.jsx`.

**State:** Zustand store (`store.js`) — auth, connections, chat, profile, agent, theme, chartEditor, activeSemanticModel. Token persisted to localStorage. chartEditor slice: `{currentSpec, history, historyIndex, mode, historyCap}` + `setChartEditorSpec`/`initChartEditorSpec`/`undoChartEditor`/`redoChartEditor`/`setChartEditorMode`. Agent slice properties:
- Core: `agentSteps`, `agentLoading`, `agentError`, `agentWaiting`, `agentWaitingOptions`, `agentAutoExecute`, `agentChatId`
- UI panel: `agentDock` (float/right/bottom/left), `agentPanelWidth`, `agentPanelHeight`, `agentPanelOpen`, `agentResizing`
- Progress: `agentChecklist`, `agentPhase`, `agentElapsedMs`, `agentEstimatedMs`, `agentSessionProgress`, `agentVerification`
- Permissions: `agentPersona`, `agentPermissionMode`
- Dual-response: `dualResponseActive`, `cachedResultStep`
- Intelligence: `agentTierInfo`, `turboStatus`, `queryIntelligence`

**API layer:** `api.js` — injects JWT `Authorization` header. 401 redirects to `/login`. Admin API use separate `admin_token` in localStorage.

**Routing:** `App.jsx` — React Router v7 with `ProtectedRoute` HOC and `AnimatePresence` page transitions. `ProtectedRoute` gates on `apiKeyStatus` — BYOK users without valid key redirected to setup. Route map:
- Public: `/` (Landing), `/login`, `/auth/callback`, `/admin/login`, `/admin`, `/shared/:id` (SharedDashboard)
- Protected (no sidebar): `/tutorial`, `/onboarding`
- Protected (with `AppLayout` sidebar): `/dashboard`, `/schema`, `/chat`, `/profile`, `/account`, `/billing`, `/analytics`, `/ml-engine`
- `/dashboard` → `Dashboard.jsx` (view-only, query result tiles); `/analytics` → `AnalyticsShell.jsx` → `DashboardShell.jsx` (6-mode archetype shell with ChartEditor tiles — Vega-Lite rendering, no ECharts); `/ml-engine` → `MLEngine.jsx` (AutoML pipeline UI — 6 stages: Ingest → Clean → Features → Train → Evaluate → Results)
- Dev-only (import.meta.env.DEV): `/dev/chart-editor` (ChartEditor smoke test), `/dev/dashboard-shell` (DashboardShell smoke test)

**Top-level shared components** (`src/components/`): `AppLayout.jsx` (sidebar + main content wrap), `AppSidebar.jsx`, `DatabaseSwitcher.jsx` (connection picker), `ERDiagram.jsx` (schema viz), `ResultsTable.jsx` (query result table), `SQLPreview.jsx`, `SchemaExplorer.jsx`, `StatSummaryCard.jsx`, `AskDBLogo.jsx`, `UserDropdown.jsx`.

**Agent UI** (`src/components/agent/`):
- `AgentPanel.jsx` — draggable/resizable dockable panel (float/right/bottom/left)
- `AgentStepFeed.jsx` — renders agent thinking, tool calls, user questions, results in real-time
- `AgentQuestion.jsx` — inline question UI (buttons or text input) for `ask_user` tool responses
- Wired into Chat page (streaming steps) and Dashboard (floating progress overlay + dockable panel)

**Animation system** (`src/components/animation/`): Three.js 3D backgrounds (`Background3D`, `SectionBackground3D`, `FrostedBackground3D`, `NeonBackground3D`) lazy-loaded with `WebGLErrorBoundary` fallback to `AnimatedBackground` (2D). Also: `PageTransition`, `StaggerContainer`, `MotionButton`, `AnimatedCounter`, `SkeletonLoader`, `useScrollReveal` hook.

**Dashboard subsystem** (`src/components/dashboard/`):
- `DashboardShell.jsx` — top-level shell that swaps between 6 archetype layouts via `DashboardModeToggle.jsx`.
- `modes/ExecBriefingLayout.jsx` — importance-scored 12-col bin-packing (KPI cards 3-col, hero chart 12-col, supporting 6-col).
- `modes/AnalystWorkbenchLayout.jsx` — `react-grid-layout` drag-resize, ResizeObserver width measure, layout persistence.
- `modes/LiveOpsLayout.jsx` — 5s auto-refresh via SSE (`useDashboardRefresh` hook) with connected/disconnected indicator.
- `modes/StoryLayout.jsx` — IntersectionObserver scrollytelling, sticky annotation column, chapter activation.
- `modes/PitchLayout.jsx` — wraps `PresentationEngine.jsx` with a ChartSpec → legacy-tile adapter.
- `modes/WorkbookLayout.jsx` — multi-tab with `WorkbookFilterProvider` context pushing filters to tiles.
- `lib/importanceScoring.js` — shared tile-scoring heuristic (used by Briefing + Pitch).
- `lib/DashboardTileCanvas.jsx` — shared tile renderer mounting ChartEditor per tile.
- `lib/useDashboardRefresh.js` — SSE/interval refresh hook for LiveOps.
- `lib/workbookFilterContext.jsx` — React context for workbook-level filter bar.
- `PresentationEngine.jsx` — 16:9 slide-style bin-packing (reused by PitchLayout).
- `AlertManager.jsx` — NL alert create/test/list UI with webhook config.
- `tokens.js` — design tokens (colors, radii, transitions, chart palettes).

**Onboarding flow** (`src/components/onboarding/`, `src/pages/Onboarding.jsx`): Multi-step wizard — Welcome → Tour → API Key setup → DB Connect → First Query. Guide new users through BYOK key entry and first connection. Has Skip button for users who want to explore first.

**SharedDashboard** (`src/pages/SharedDashboard.jsx`): Public read-only dashboard at `/shared/:id`. No auth. Uses `TOKENS` and `CHART_PALETTES` from `tokens.js`.

**Dashboard lib utilities** (`src/lib/`): `dataBlender.js` — client-side left-join across multiple query result sets; `metricEvaluator.js` — KPI threshold/conditional logic; `visibilityRules.js` — tile show/hide rule engine; `formatUtils.js` — number/date formatting; `anomalyDetector.js` — client-side anomaly detection; `formulaSandbox.js` + `formulaWorker.js` — sandboxed formula eval (Web Worker); `exportUtils.js` — dashboard export helpers; `gpuDetect.jsx` — `GPUTierProvider` context for conditional 3D rendering; `behaviorEngine.js` — client-side behavior tracking utils; `fieldClassification.js` — column type classification for auto chart suggestions.

**Charts:** Vega-Lite via `react-vega` rendered through `VegaRenderer.tsx`. ECharts fully removed (Sub-project A Phase 4c). Chart IR (`src/chart-ir/`) defines `ChartSpec` types, compiler (`compileToVegaLite`), Render Strategy Router (RSR), recommender (`showMe`), JSON Patch helper (`applySpecPatch`), transforms (LTTB, uniform, pixel_min_max, aggregate_bin), user-authored types (Sub-project C), and semantic layer (Sub-project D).

**ChartEditor** (`src/components/editor/`): 3-pane Tableau-class editor shell. ChartEditor.jsx (CSS grid, mode toggle Default/Pro/Stage), DataRail.jsx (field pills), EditorCanvas.jsx (RSR dispatch → VegaRenderer), MarksCard.jsx (encoding channel slots + drag-drop), Pill.jsx + ChannelSlot.jsx (drag source + drop target), Inspector/InspectorRoot.jsx (Setup tab with MarksCard + SemanticFieldRail, Style tab stub), BottomDock.jsx (text input + mic), AgentPanel.jsx (editor-scoped agent conversation), onobject/ (OnObjectOverlay + AxisPopover + LegendPopover + SeriesPopover + TitleInlineEditor), renderers/ (VegaRenderer.tsx real mount, MapLibre/Deck/Creative placeholders).

**Theme system:** 8-theme registry in `components/editor/themes/`: 2 base (light/dark Editorial) + 6 Stage Mode themes (quiet-executive, iron-man, bloomberg, mission-control, cyberpunk, vision-pro). `ThemeProvider.jsx` applies CSS custom properties via inline style. Creative-lane registry (`creativeRegistry.js`) lazy-loads ThreeHologram + ThreeParticleFlow for Stage Mode. Light/dark system preference in Zustand (`theme`/`resolvedTheme`), persisted to `localStorage("askdb-theme")`.

**Styling:** Tailwind CSS 4.2 + custom glassmorphism classes in `index.css`. Dark theme default (`#06060e` bg). Fonts: Outfit (headings) + Inter (body). Animations: Framer Motion + GSAP. Three.js for 3D landing backgrounds.

**Linting:** ESLint flat config (`eslint.config.js`) — `@eslint/js` recommended + React Hooks + React Refresh plugins. `no-unused-vars` ignores names matching `^[A-Z_]` (allows unused component imports and `_` prefixed vars). No Prettier; no backend linter (no ruff/flake8/pyproject.toml).

### Query Intelligence System (`/backend` — 6 modules)

Four-tier waterfall makes agent/chat/dashboard feel instant on big datasets. Each query routes through tiers in order; first hit wins.

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

**Routing logic** (`waterfall_router.py`): Strategy pattern — `WaterfallRouter` holds ordered `BaseTier` subclasses. `route_sync()` is sync-safe entry point (avoid event loop conflicts with FastAPI). `ValidationGate` checks schema hash before serving cached results; rejects empty hashes for data-returning tiers (memory/turbo).

**Module-level singleton**: `_waterfall_router` in `agent_routes.py` — never create per-request. Prevents ChromaDB client proliferation.

**Audit trail** (`audit_trail.py`): Append-only JSONL at `.data/audit/query_decisions.jsonl`. Logs every routing decision with conn_id, question hash, tiers checked, tier hit, schema hash. Thread-safe with buffered writes (flush, no per-entry fsync), auto-rotates at 50MB.

**Config** (`config.py`): `SCHEMA_CACHE_MAX_AGE_MINUTES` (60), `QUERY_MEMORY_ENABLED` (True), `QUERY_MEMORY_TTL_HOURS` (168), `TURBO_MODE_ENABLED` (True), `TURBO_TWIN_MAX_SIZE_MB` (500), `TURBO_TWIN_SAMPLE_PERCENT` (1.0), `DECOMPOSITION_ENABLED` (True), `DECOMPOSITION_MIN_ROWS` (1M), `STREAMING_PROGRESS_INTERVAL_MS` (1000).

**Frontend** (`AgentStepFeed.jsx`): Three new SSE step types (additive, Invariant-7):
- `tier_routing` — amber badge: "Checking intelligence tiers..."
- `progress` — progress bar with elapsed/estimated time or sub-query count
- `tier_hit` — green badge: "Answered from team knowledge (3m ago)" / "Answered from Turbo Mode"

**Store** (`store.js`): `agentTierInfo`, `turboStatus`, `queryIntelligence`, `setTurboStatus()`, `setQueryIntelligence()`.

**API** (`api.js`): `enableTurbo()`, `disableTurbo()`, `getTurboStatus()`, `refreshTurbo()`, `getSchemaProfile()`, `refreshSchema()`.

### ML Engine — AutoML Pipeline (`/backend` — 6 modules + 2 routers + Celery)

Optional AutoML subsystem layered onto the same connection model. Polars-native (no pandas in feature engineering — see commit `34a57a5`). Six fixed stages drive both direct training and persisted workflows.

**Modules:**
- `ml_engine.py` — `MLEngine` orchestrator. Methods: `ingest_from_twin()` (pulls DuckDB twin via Arrow zero-copy), `ingest_from_source()` (live DB query bypassing twin sampling — for >50K row training), `ingest_dataframe()`, plus train/evaluate/predict.
- `ml_feature_engine.py` — `detect_column_types()`, `analyze_features()`, `prepare_dataset()`. Handles scaling, power transforms, outlier removal, one-hot/label encoding, custom feature creation. String target columns auto-encoded for classification (LabelEncoder).
- `ml_models.py` — model catalog (`ModelConfig` dataclass). Per-task lists: classification (XGBoost, LightGBM, RandomForest, LogReg), regression (XGBoost, LightGBM, RandomForest), with default hyperparams.
- `ml_pipeline_store.py` — file-based pipeline workflow CRUD with atomic writes. Stages = `["ingest", "clean", "features", "train", "evaluate", "results"]`. Each stage holds `{status, config, output_summary}`.
- `ml_tasks.py` + `celery_app.py` + `celery_worker.py` — Celery async training jobs (worker process separate from FastAPI). Required for long-running training that exceeds request timeouts.
- `arrow_bridge.py` + `datafusion_engine.py` — zero-copy Arrow data movement between DuckDB / Polars / DataFusion. Lets ML pipeline reuse warehouse data without serialization.

**Three ingest modes** (Data Source selector in Training stage):
1. **Twin** — sampled DuckDB replica (fast, capped at twin size)
2. **Sample** — stratified sample from live source via `ingest_from_source(stratify_column=...)`
3. **Full Dataset** — full live source query bypassing twin (`ML_FULL_DATASET_ENABLED`, capped by `ML_MAX_TRAINING_ROWS`). On connector lookup miss, falls back to any active connection for same user (`67397ca`). Errors loudly instead of silent twin fallback when Full Dataset connector unavailable (`3ac69be`).

**PII handling:** `ML_AUTO_EXCLUDE_PII=True` drops PII-flagged columns before training. Uses same masking detection as query path.

**Routers:**
- `ml_routes.py` (`/api/v1/ml`) — direct one-shot endpoints: `POST /train` (synchronous train + persist), `POST /predict`. Gated on `ML_ENGINE_ENABLED`.
- `ml_pipeline_routes.py` (`/api/v1/ml/pipelines`) — workflow CRUD + per-stage manual execution. `update_pipeline` field whitelist must include `data_source` and cached URI fields (`255df79`) — extend whitelist when adding new stage config keys.

**BigQuery perf path** (`db_connector.py`): BigQuery uses `google.cloud.bigquery.Client.query().to_arrow()` (Storage Read API) instead of SQLAlchemy REST — 10–50× faster on >10M row ingests. Requires `google-cloud-bigquery-storage`. ML ingest does column pruning (`SELECT col1, col2 …` not `SELECT *`, commit `1b5e092`) and uses `TABLESAMPLE SYSTEM` with dataset-qualified table names (`4e63c0b`). When extending other warehouses, prefer native Arrow paths over SQLAlchemy.

### Voice Mode — Hybrid Tiered (`routers/voice_routes.py` + `voice_registry.py`)

Three-tier BYOK voice stack per Sub-project A Phase 3:
- **whisper-local** — whisper.cpp WASM in-browser via Web Worker. Free, private, ~2-3s latency. Model at `public/voice-models/whisper-tiny-en/`.
- **deepgram** — Deepgram streaming WebSocket. BYOK key (Fernet-encrypted in user profile). Backend mints ephemeral token via `POST /api/v1/voice/session`.
- **openai-realtime** — OpenAI Realtime API WebSocket. Same BYOK + ephemeral token pattern.

Frontend tier abstraction: `chart-ir/voice/voiceProvider.ts` (interface + registry), `whisperLocal.ts`, `deepgramStreaming.ts`, `openaiRealtime.ts` (real adapters, self-register at import). `stubs.ts` provides test-safe fallbacks.

Backend: `voice_registry.py` — `mint_ephemeral_token(email, tier)` with 5-min TTL. WebSocket at `/api/v1/voice/ws/{chat_id}` for text-flow continuous conversation (legacy path, still works). Voice and text share the same `SessionMemory` and `chat_id`.

### Dual-Response System (Progressive Dual-Response Data Acceleration)

When waterfall tier (memory/turbo) answers a query, system can simultaneously stream cached answer and fire live query to verify freshness. Controlled by 4 config flags:
- `DUAL_RESPONSE_ENABLED` (default True) — master toggle
- `DUAL_RESPONSE_STALENESS_TTL_SECONDS` (default 300) — cache age threshold; older = stale
- `DUAL_RESPONSE_ALWAYS_CORRECT` (default True) — always fire live correction even when cache fresh
- `WRITE_TIME_MASKING` (default False) — PII mask at DuckDB write time instead of read time
- `BEHAVIOR_WARMING_ENABLED` (default False) — pre-warm cache from predicted query patterns

### Feature Flags (`config.py`)

20+ feature flags control predictive intelligence + chart system cutover. `NEW_CHART_EDITOR_ENABLED` (default True) — chart system cutover flag; /analytics uses the new DashboardShell + ChartEditor + Vega-Lite path. Enabled by default: `FEATURE_PREDICTIONS` (suggestions), `FEATURE_ADAPTIVE_COMPLEXITY` (skill detect), `FEATURE_INTENT_DISAMBIGUATION`, `FEATURE_ANALYST_TONE`, `FEATURE_TIME_PATTERNS`, `FEATURE_AGENT_DASHBOARD` (agent tile control), `FEATURE_PERMISSION_SYSTEM` (supervised/autonomous). Disabled by default: session tracking, consent flow, autocomplete, personas, insight chains, collaborative predictions, style matching, data prep, workflow templates, skill gaps, anomaly alerts, auto-switch, smart preload. Check `config.py` for full list.

### Reference Documents (`/docs`)

`PROJECT_JOURNAL.md` — full engineering history (architecture decisions, blockers, resolutions). `DASHBOARD_DEEP_DIVE.md` — detailed dashboard subsystem design. `docs/journal-2026-04-11-adversarial-hardening.md` — adversarial testing journal with root cause analysis, prevention playbook, test coverage map. `docs/ultraflow/specs/UFSD-2026-04-10-adversarial-testing.md` — adversarial testing spec with all findings and verdicts. `docs/` — session journals, design brainstorms, audit reports. Read-only reference, not config.

## Key Constraints

### Security Invariants (never weaken)

- **Read-only enforcement** — driver, SQL validator, connector layers. All three must agree.
- **PII masking** — `mask_dataframe()` must run before data reaches user or LLM.
- **Two-step query flow** — `/generate` then `/execute`. Never collapse.
- **Config safety rails** — `MAX_ROWS` capped at 50,000 even if `.env` sets higher. Mandatory blocked keywords (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `MERGE`) force-appended if missing from `BLOCKED_KEYWORDS`. JWT default key causes `CRITICAL` log and hard exit in production/staging.
- **OTP-first registration** — email (and optionally phone) must OTP-verify before `create_user()` called. `pending_verifications.json` tracks state.
- **Tile SQL validation** — `dashboard_routes.py` validates SQL through `SQLValidator` at write time (create/update tile), not just execution.
- **`query_twin()` validates SQL** through `SQLValidator` before execution and caps results at 10K rows. Prevents filesystem-reading DuckDB functions and OOM.
- **Query memory stores anonymized SQL intents** — `anonymize_sql()` strips all literals (integers, decimals, floats, scientific, hex, dollar-quoted, escaped quotes). Sensitive column names masked to `[MASKED]` via alpha-only lookarounds (`(?<![a-zA-Z])`) and substring match before ChromaDB storage. Never store raw query results or column values in ChromaDB.
- **Dependencies** — critical packages pinned to exact versions (`==`) in `requirements.txt` to prevent supply chain attacks.

### Agent System

- **Guardrails** — dynamic tool budget (heuristic 8/15/20, auto-extends to 100), phase-aware timeouts (planning 30s, schema 60s, SQL gen 30s, DB exec 300s, verify 30s), 600s per-segment soft cap, 1800s session hard cap, max 3 SQL retries, per-user concurrency cap (2 active sessions). Agent `run_sql` uses same validator + read-only as main pipeline.
- **Collected steps cap** — `MAX_COLLECTED_STEPS = 200` in `agent_routes.py`. Oldest evicted when cap reached.
- **Waterfall early-return must store in memory** — if tier answers and agent returns early, call `memory.add_turn()` for both question and answer BEFORE returning. Else session history lost.
- **ValidationGate rejects empty hashes** for memory/turbo tiers. Only schema/live tiers pass through without hash.
- **Turbo Mode opt-in per connection** — privacy-sensitive customers can skip. Twin + turbo_status cleaned on disconnect.
- **`cleanup_stale()` on QueryMemory** — auto-scheduled every 6 hours in `main.py` lifespan. `QueryMemory()` instantiated once before loop (not per-iteration) to prevent ChromaDB client proliferation.

### Auth & Access Control

- **`JWT_SECRET_KEY`** — also derives Fernet key for saved DB passwords. Changing invalidates all saved connection configs.
- **Admin auth** is separate JWT flow (`admin_token` in localStorage), not same as user auth.
- **User deletion** is soft-delete — archived in `deleted_users.json`. `create_user()` checks before allowing re-registration.
- **Daily query limits** enforced in `query_routes.py`. Plans: free=10, weekly=50, monthly=200, yearly=500, pro=1000, enterprise=unlimited.
- **Per-user connection limit** — `MAX_CONNECTIONS_PER_USER` (default 10) in `connection_routes.py`. Returns 429 when exceeded.
- **Per-user share token quota** — plan-based limits in `dashboard_routes.py`. Free=3, weekly=5, monthly=10, yearly=20, pro=50, enterprise=unlimited.
- **Share tokens** — dashboard sharing uses time-limited tokens (`SHARE_TOKEN_EXPIRE_HOURS`, default 7 days). Auto-pruned on startup.

### Infrastructure & Config

- **Vite proxy** → `http://localhost:8002`. Backend must run on 8002 during dev. `vite.config.js` has manual chunk splitting for framer-motion, three.js, deck.gl, d3, export libs — keep when adding large deps.
- **CORS** configured for `localhost:5173`, `localhost:3000`, `FRONTEND_URL`. Update for production.
- **OAuth redirect URI** defaults to `http://localhost:5173/auth/callback` (configurable via `OAUTH_REDIRECT_URI`).
- **Redis optional** — `redis_client.py` degrades gracefully. Redis features must have in-memory fallbacks.
- **Thread pool** — explicit `ThreadPoolExecutor(max_workers=THREAD_POOL_MAX_WORKERS)` in lifespan startup (default 32, bounded 4–256).
- **SQL Allowlist mode** — `SQL_ALLOWLIST_MODE` (default False) + `SQL_ALLOWED_TABLES` restricts queries to explicit table list.
- **Schema profiling** — `profile_connection()` runs in background thread to avoid blocking connect endpoint on slow DBs.

## Security Hardening Status

Two rounds of 20-analyst adversarial testing (2026-04-10/11) found 33 findings. All P0/P1 fixed with rebreak verification. 112 regression tests guard against regressions. Full journal: `docs/journal-2026-04-11-adversarial-hardening.md`.

**Deferred items:**

| # | Issue | Trigger | Risk |
|---|-------|---------|------|
| 5 | DuckDB twin encryption at rest (`duckdb_twin.py`) | Pre-launch for healthcare/finance | PHI/PII in plaintext on disk; `TURBO_TWIN_WARN_UNENCRYPTED` logs warning |
| 12 | PII substring false positives — `business`→`sin`, `adobe`→`dob` | When complaints arrive | Over-masking only (safe tradeoff) |
| 13 | Per-request QueryMemory proliferation | Singleton refactor | Bounded by query rate; scheduler leak fixed |

## Security Coding Rules (from adversarial testing)

Established after 33 findings. See `docs/journal-2026-04-11-adversarial-hardening.md` for root cause analysis.

- **Never use `\b` for SQL/code identifiers** — treats `_` as word char, so `\bssn\b` won't match `employee_ssn`. Use `(?<![a-zA-Z])` / `(?![a-zA-Z])` lookarounds.
- **PII matching must be substring-based** — exact set membership misses compound names. Over-masking > under-masking.
- **Normalize Unicode before security checks** — `unicodedata.normalize("NFKC", text)` before pattern match.
- **Multi-value returns must use NamedTuple** — bare tuple unpacking silently breaks when return signatures change.
- **Fast paths must preserve side effects** — cache hits/early returns must still run rate limiting, stats, audit logging.
- **File state writes must be atomic** — write to `{path}.tmp`, flush, then `os.replace(tmp, path)`.
- **Config values are untrusted input** — validate at startup against explicit allowlists (not blocklists).
- **Never use `time.sleep()` polling in thread pool** — use `threading.Event.wait()`, `Queue.get()`, or async primitives.
- **Health endpoints must not leak identifiers** — aggregate counts only.
- **Every config flag must be consumed** — dead flags mislead users. Test that flags are read.
- **New endpoints must inherit guards** — extract shared security logic into decorators or middleware.

## Development Notes

- **Adding new router:** create in `routers/`, register via `app.include_router()` in `main.py`, inherit shared security guards (auth dependency, rate limiting).
- When fixing bugs, verify fix end-to-end (run app/tests) — never just check code looks correct.
- When renaming/rebranding, account for string splits across JSX tags (e.g., `Data<span>Lens</span>`), template literals, dynamic string construction.
- Before starting servers, check zombie processes on required ports (e.g., `lsof -i :8002`).
- Full-stack SaaS app (JS frontend + Python backend). Check both sides when changing.

## graphify

Curated knowledge graph at `C:/Users/sid23/knowledge/graphify-out/graph.json` (external to repo). Captures architecture decisions, security model, data flow, design constraints.

Rules:
- If `graphify-out/` exists in repo, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure before answering architecture questions
- If `graphify-out/wiki/index.md` exists, navigate it instead of raw files
- Source knowledge docs at `C:/Users/sid23/knowledge/*.md` — run `/graphify` to rebuild after edits
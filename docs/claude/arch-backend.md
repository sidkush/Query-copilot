## Scope

Backend deep-dive: FastAPI entry point, core query pipeline, agent
system, routers, security layers, OTP/JWT/Fernet crypto, storage.
Numeric constants live in `config-defaults.md`; invariants live in
`security-core.md`. **Always-loaded.**

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
- **Dynamic tool budget**: heuristic initial (see `config-defaults.md` :: Dynamic tool budget), auto-extend to the safety cap. Extensions logged to audit trail.
- **Lightweight planning**: Complex/dashboard queries trigger Sonnet planning call that generates task list. Plan emitted as `AgentStep(type="plan")` shown as checklist in UI. Auto-executes, no user gate.
- **Structured progress tracker**: `_progress` dict tracks `{goal, completed, pending, total_tool_calls}`. Updated after each tool call. Used by `/continue` endpoint for resume.
- **Dialect-aware SQL hints**: BigQuery, Snowflake, MySQL, MSSQL, PostgreSQL hints injected into system prompt from `connection_entry.db_type`.
- **Sliding context compaction**: Every 6 tool calls, old tool_result content summarized to 1-line. Keep context under ~15K tokens for long dashboard builds.
- Guardrails: dynamic budget (up to 100 tool calls), phase-aware timeouts (see `config-defaults.md` :: Agent system), session hard cap + max SQL retries (see `config-defaults.md`), Haiku primary + Sonnet fallback
- **Session persistence** (`agent_session_store.py`): SQLite at `.data/agent_sessions.db` (WAL mode). Sessions auto-saved on SSE complete and on disconnect. per-user session cap with auto-purge (see `config-defaults.md`).
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
- TTL-based retry backoff after connection fail (see `config-defaults.md`)

**Security — three independent layers, never remove:**
1. `db_connector.py` — driver-level read-only (`SET TRANSACTION READ ONLY`)
2. `sql_validator.py` — 6 layers: multi-statement → keyword blocklist → sqlglot AST (15+ dialects) → SELECT-only → LIMIT enforce (negatives clamped to 0) → dangerous-function detect
3. Connector re-validates before execution

**PII masking** (`pii_masking.py`) — substring-based column-name pattern match (catch compound like `employee_ssn`) + Unicode NFKC normalize (prevent fullwidth bypass) + regex value scan. Must run via `mask_dataframe()` before data returns to user or LLM.

**OTP security** (`otp.py`) — OTP codes stored as HMAC-SHA256 hashes (`hmac.new(JWT_SECRET_KEY, code, sha256)`), never plaintext. Verify use `hmac.compare_digest()` for constant-time compare. In-memory rate limit via `collections.defaultdict(list)` with TTL eviction (survives log file deletion).

**JWT hardening** (`config.py`) — `JWT_ALGORITHM` restricted to `_SAFE_JWT_ALGORITHMS = {"HS256", "HS384", "HS512"}` allowlist enforced at startup. Rejects `none` algorithm (CVE-2015-9235).

**Fernet encryption** (`user_storage.py`) — Key derivation use PBKDF2-HMAC-SHA256 with PBKDF2 iteration count (see `config-defaults.md` :: Crypto) (upgraded from bare SHA-256). Derives Fernet key from `JWT_SECRET_KEY`.

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


## See also
- `config-defaults.md` — numeric defaults: MAX_ROWS, JWT_ALGORITHM, model IDs, tool budget tiers, cache TTLs).
- `security-core.md` — invariants these layers enforce (never weaken).
- `constraints-agent-auth.md` — agent runtime rules + per-user quotas.
- `arch-query-intelligence.md` — waterfall tier internals referenced by `agent_routes.py`.
- `arch-ml-engine.md` — ML routers reuse the same connection model.
- `arch-voice-dual-response.md` — voice + dual-response routers.

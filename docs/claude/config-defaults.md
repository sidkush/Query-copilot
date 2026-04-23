## Scope

Single source of truth for the numeric / string constants that govern
QueryCopilot V1's runtime behaviour. The architecture + constraints docs
point here instead of duplicating values. Confirm against
`backend/config.py` + `backend/.env.example` before changing anything.

### Model selection (BYOK Anthropic via `anthropic_provider.py`)

| Constant | Source-of-truth | Value |
|---|---|---|
| `PRIMARY_MODEL` | `backend/config.py` default | `claude-haiku-4-5-20251001` |
| `FALLBACK_MODEL` | `backend/config.py` default | `claude-sonnet-4-6` |
| `FALLBACK_MODEL` | `backend/.env.example` override | `claude-sonnet-4-6` |

### Ports

| Key | Value | Notes |
|---|---|---|
| Backend (local dev) | `8002` | Vite proxy points `/api` → `8002`. |
| Backend (Docker) | `8000` | docker-compose maps container 8000 → host 8000. |
| Frontend (Vite) | `5173` | Hard-coded in `vite.config.js` CORS + OAuth redirect. |
| DB (default Postgres) | `5432` | `backend/config.py :: DB_PORT`. |
| SMTP | `587` | `backend/config.py :: SMTP_PORT`. |

### Query / SQL guardrails (`backend/config.py` + `sql_validator.py`)

| Constant | Value | Notes |
|---|---|---|
| `MAX_ROWS` default | `1000` | Hard ceiling enforced at `50_000` (`_MAX_ROWS_CEILING`). |
| `_MAX_ROWS_CEILING` | `50000` | Can't be raised via `.env`. |
| `_MANDATORY_BLOCKED` | `{DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, MERGE}` | Force-appended to `BLOCKED_KEYWORDS` if missing. |
| `_SAFE_JWT_ALGORITHMS` | `{HS256, HS384, HS512}` | Allowlist enforced at startup; unsafe values (incl. `none`) forced to `HS256`. |
| `JWT_ALGORITHM` default | `HS256` | |

### Data Coverage (Phase B — Ring 1)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_DATA_COVERAGE` | `True` | Gate for Ring-1 empirical grounding. Off → card module silent. |
| `COVERAGE_CACHE_DIR` | `.data/coverage_cache` | Per-connection card JSON path. Same atomic-write pattern as SchemaProfile. |
| `COVERAGE_QUERY_TIMEOUT_SECONDS` | `5.0` | Per-query wall-clock cap. Timeout → card fields set to `None`, never raises. |
| `COVERAGE_CACHE_TTL_HOURS` | `6` | Re-profile when older; mirrors `SCHEMA_CACHE_MAX_AGE_MINUTES`. |
| `COVERAGE_MAX_COLUMNS_PER_TABLE` | `5` | Picker emits at most 5 columns: up to 2 date-like, 3 categorical. |
| `COVERAGE_MAX_TABLES_PER_CONNECTION` | `30` | Budget cap: skip beyond 30 tables to bound connect time. |

### Scope Validator (Phase C — Ring 3)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_SCOPE_VALIDATOR` | `True` | Master switch for Ring 3. Off → validator silent. |
| `SCOPE_VALIDATOR_FAIL_OPEN` | `True` | H6 — sqlglot parse exception logs warning, never blocks. |
| `SCOPE_VALIDATOR_REPLAN_BUDGET` | `1` | H6 — maximum re-plan turns per query on violation. |
| `RULE_RANGE_MISMATCH` | `True` | Rule 1 — WHERE narrows outside DataCoverageCard min/max. |
| `RULE_FANOUT_INFLATION` | `True` | Rule 2 — JOIN + COUNT(*) without DISTINCT. |
| `RULE_LIMIT_BEFORE_ORDER` | `True` | Rule 3 — LIMIT in subquery + ORDER BY outer. |
| `RULE_TIMEZONE_NAIVE` | `True` | Rule 4 — DATE on TIMESTAMP_TZ without AT TIME ZONE. |
| `RULE_SOFT_DELETE_MISSING` | `True` | Rule 5 — historical window + `deleted_at` col + no tombstone predicate. |
| `RULE_NEGATION_AS_JOIN` | `True` | Rule 6 — NL contains "never/no/without" + SQL is INNER JOIN. |
| `RULE_DIALECT_FALLTHROUGH` | `True` | Rule 7 — sqlglot transpile failure against connection db_type. |
| `RULE_VIEW_WALKER` | `True` | Rule 8 — recursive view resolution; card check at base. |
| `RULE_CONJUNCTION_SELECTIVITY` | `False` | Rule 9 — EXPLAIN-backed estimate; off until Phase E. |
| `RULE_EXPRESSION_PREDICATE` | `True` | Rule 10 — non-literal WHERE → mark unverified-scope. |

### Intent Echo (Phase D — Ring 4)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_INTENT_ECHO` | `True` | Gate for Ring-4 IntentEcho firing |
| `ECHO_AMBIGUITY_AUTO_PROCEED_MAX` | `0.3` | Auto-proceed below this score |
| `ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN` | `0.7` | Mandatory choice at or above this score |
| `ECHO_AUTO_DOWNGRADE_PAUSE_MS` | `500` | Accept faster than this = rubber-stamp streak tick |
| `ECHO_AUTO_DOWNGRADE_STREAK` | `3` | Streak threshold for auto-downgrade |
| `ECHO_LLM_MAX_TOKENS` | `512` | Max tokens for LLM gray-zone second-opinion call |
| `NON_INTERACTIVE_MODE_CONSERVATIVE` | `True` | Force AUTO_PROCEED in non-interactive modes |
| `VOICE_MODE_READBACK_AMBIGUITY_MIN` | `0.5` | Voice TTS readback fires at or above this score |
| `FEATURE_SEMANTIC_REGISTRY` | `True` | Gate for H12 SemanticRegistry |
| `SEMANTIC_REGISTRY_DIR` | `.data/semantic_registry` | Per-connection definition JSON path |
| `FEATURE_DRIFT_DETECTOR` | `True` | Gate for H12 DriftDetector |
| `FISCAL_YEAR_START_MONTH` | `1` | Tenant fiscal year start (1=Jan); mismatch fires DriftDetector |

### Calc parser (Plan 8a)

| Constant | Value | Notes |
|---|---|---|
| `CALC_RATE_LIMIT_PER_30S` | `10` | per-user `/api/v1/calcs/validate` cap |
| `MAX_CALC_FORMULA_LEN` | `10_000` | reject oversized formula bodies (413) |
| `MAX_CALC_NESTING` | `32` | parser depth cap (ParseError beyond) |
| `FEATURE_RAWSQL_ENABLED` | `False` | `RAWSQL_*` passthrough gate |

### Calc parser (Plan 8b)

| Constant | Value | Notes |
|---|---|---|
| `LOD_WARN_THRESHOLD_ROWS` | `1_000_000` | FIXED LOD cost estimate above this triggers `CalcWarning(kind="expensive_fixed_lod")` via `vizql/lod_analyzer.py`. Observation-only; never blocks. Section XIX.1 anti-pattern #1. |

### Calc editor (Plan 8d)

| Constant | Value | Notes |
|---|---|---|
| `CALC_EVAL_TIMEOUT_SECONDS` | `1.0` | Single-row DuckDB eval wall-clock cap (504 if exceeded). |
| `CALC_EVAL_CACHE_TTL_SECONDS` | `60` | `(formula_hash, row_hash)` result cache TTL for `/api/v1/calcs/evaluate`. |
| `FEATURE_CALC_LLM_SUGGEST` | `True` | Gates `/api/v1/calcs/suggest` LLM endpoint. Free-plan ops can force `False` without code change. |
| `CALC_SUGGEST_RATE_LIMIT_PER_60S` | `5` | Per-user LLM suggestion cap (60s sliding window). 429 when exceeded. |
| `CALC_SUGGEST_MAX_DESCRIPTION_LEN` | `1000` | Reject oversized NL descriptions (413). |

### Trend line (Plan 9b)

| Constant | Value | Notes |
|---|---|---|
| `TREND_RATE_LIMIT_PER_30S` | `20` | Per-user sliding-window cap on `/api/v1/analytics/trend-fit`. 429 when exceeded. |
| `TREND_MAX_ROWS` | `100_000` | Reject input payloads over this count (413). Hard cap, not sampled. |
| `TREND_TIMEOUT_SECONDS` | `5.0` | Per-request wall-clock budget (504 when exceeded). |

### Forecast (Plan 9c)

| Constant | Value | Notes |
|---|---|---|
| `FORECAST_RATE_LIMIT_PER_60S` | `10` | Per-user sliding-window cap on `/api/v1/analytics/forecast`. 429 when exceeded. |
| `FORECAST_MAX_ROWS` | `10_000` | Reject input series over this count (413). Hard cap, not sampled. |
| `FORECAST_TIMEOUT_SECONDS` | `10.0` | Per-request wall-clock budget (504 when exceeded). |
| `FORECAST_MAX_HORIZON` | `200` | Hard sanity cap on `forecast_length` regardless of unit (400 if exceeded). |

### Cluster (Plan 9d)

| Constant | Value | Notes |
|---|---|---|
| `CLUSTER_RATE_LIMIT_PER_60S` | `10` | Per-user sliding-window cap on `/api/v1/analytics/cluster`. 429 when exceeded. |
| `CLUSTER_MAX_ROWS` | `50_000` | Reject input row payloads over this count (413). Hard cap, not sampled. |
| `CLUSTER_TIMEOUT_SECONDS` | `8.0` | Per-request wall-clock budget (504 when exceeded). |
| `CLUSTER_K_MAX_HARD_CAP` | `25` | Hard sanity cap on `k_max` in auto mode regardless of spec value. |

### Agent system (`agent_engine.py`)

| Constant | Value | Notes |
|---|---|---|
| Dynamic tool budget — simple | `8` | Heuristic initial cap. |
| Dynamic tool budget — complex | `15` | |
| Dynamic tool budget — dashboard | `20` | |
| Tool budget safety cap | `100` | Auto-extend in increments of `10`, max `100`. |
| `MAX_COLLECTED_STEPS` | `200` | In `agent_routes.py`; oldest evicted at cap. |
| Session hard cap | `1800 s` | 30 min. |
| Per-segment soft cap | `600 s` | |
| Planning timeout | `30 s` | |
| Schema timeout | `60 s` | |
| SQL-gen timeout | `30 s` | |
| DB exec timeout | `300 s` | |
| Verify timeout | `30 s` | |
| Per-user active sessions | `2` | Concurrency cap. |
| SQL retries (on validation fail) | `3` max | Switches to Sonnet fallback after exhaust. |
| Sliding context compaction | every `6` tool calls | Keep ~`15 000` tokens. |
| Session memory auto-compact | ~`8 000` tokens | |
| SQLite sessions-per-user cap | `50` | `.data/agent_sessions.db`, auto-purge. |

### Query Intelligence (`config.py` → `waterfall_router.py`)

| Constant | Value |
|---|---|
| `SCHEMA_CACHE_MAX_AGE_MINUTES` | `60` |
| `QUERY_MEMORY_ENABLED` | `True` |
| `QUERY_MEMORY_TTL_HOURS` | `168` (7 days) |
| `TURBO_MODE_ENABLED` | `True` |
| `TURBO_TWIN_MAX_SIZE_MB` | `500` |
| `TURBO_TWIN_SAMPLE_PERCENT` | `1.0` |
| `DECOMPOSITION_ENABLED` | `True` |
| `DECOMPOSITION_MIN_ROWS` | `1 000 000` (1M) |
| `STREAMING_PROGRESS_INTERVAL_MS` | `1000` |
| `WATERFALL_CAN_ANSWER_BUDGET_MS` | `200` (min `10`) |
| `WATERFALL_ANSWER_BUDGET_MS` | `1000` (min `50`) |
| `VIZQL_CACHE_ENABLED` | `True` |
| `VIZQL_INPROCESS_CACHE_BYTES` | `67_108_864` (64 MiB) |
| `VIZQL_EXTERNAL_CACHE_BYTES` | `536_870_912` (512 MiB) |
| `VIZQL_CACHE_TTL_SECONDS` | `3600` (1 h) |
| `VIZQL_HISTORY_TRACKING_ENABLED` | `True` |

### Dual-response + behaviour

| Constant | Value |
|---|---|
| `DUAL_RESPONSE_ENABLED` | `True` |
| `DUAL_RESPONSE_STALENESS_TTL_SECONDS` | `300` |
| `DUAL_RESPONSE_ALWAYS_CORRECT` | `True` |
| `WRITE_TIME_MASKING` | `False` |
| `BEHAVIOR_WARMING_ENABLED` | `False` |
| `OTP_EXPIRY_SECONDS` | `600` (10 min) |

### ML engine (`config.py`)

| Constant | Value |
|---|---|
| `ML_ENGINE_ENABLED` | `True` |
| `ML_FULL_DATASET_ENABLED` | `True` |
| `ML_MAX_TRAINING_ROWS` | `10 000 000` (10M) |
| `ML_DEFAULT_SAMPLE_SIZE` | `500 000` |
| `ML_TRAINING_QUERY_TIMEOUT` | `3600 s` |
| `ML_TRAINING_TIMEOUT_SECONDS` | `3600 s` |
| `ML_WORKER_MAX_MEMORY_MB` | `512` |
| `ML_MAX_CONCURRENT_TRAINING_PER_USER` | `2` |
| `ML_AUTO_EXCLUDE_PII` | `True` |
| `ML_MAX_MODELS_FREE` | `3` |
| `ML_MAX_MODELS_PRO` | `10` |

### Crypto

| Constant | Value |
|---|---|
| Fernet key derivation | PBKDF2-HMAC-SHA256, `480 000` iterations (from `JWT_SECRET_KEY`) |
| OTP storage | HMAC-SHA256 keyed by `JWT_SECRET_KEY`, never plaintext |
| OAuth state TTL | `600 s` (10 min) |
| Share token default expiry | `7 days` (`SHARE_TOKEN_EXPIRE_HOURS`) |

### Plan-based quotas (`query_routes.py`, `connection_routes.py`, `dashboard_routes.py`)

| Plan | Daily query limit | Share tokens |
|---|---|---|
| free | `10` | `3` |
| weekly | `50` | `5` |
| monthly | `200` | `10` |
| yearly | `500` | `20` |
| pro | `1000` | `50` |
| enterprise | unlimited | unlimited |
| Per-user connections | `10` (`MAX_CONNECTIONS_PER_USER`) | — |

### Thread pool + admin

| Constant | Value |
|---|---|
| `THREAD_POOL_MAX_WORKERS` | `32` (bounded 4–256) |
| Redis retry backoff after fail | `30 s` (TTL-based) |
| Admin auth | Separate `ADMIN_JWT_SECRET_KEY` (falls back to `JWT_SECRET_KEY` with warning) |
| Fernet secret | `FERNET_SECRET_KEY` (falls back to PBKDF2(`JWT_SECRET_KEY`)) |

### Environment gating

- `ASKDB_ENV` / `QUERYCOPILOT_ENV` — set to `production` / `staging` to force hard exit on default JWT key.
- `DEMO_ENABLED` — default `False`. Must be explicit for demo login (`demo@askdb.dev`).
- `NEW_CHART_EDITOR_ENABLED` — default `True`. Chart system cutover flag (Vega-Lite path at `/analytics`).

### Feature flags (20+, `config.py`)

Default **ON**: `FEATURE_PREDICTIONS`, `FEATURE_ADAPTIVE_COMPLEXITY`,
`FEATURE_INTENT_DISAMBIGUATION`, `FEATURE_ANALYST_TONE`,
`FEATURE_TIME_PATTERNS`, `FEATURE_AGENT_DASHBOARD`,
`FEATURE_PERMISSION_SYSTEM`.

Default **OFF**: session tracking, consent flow, autocomplete, personas,
insight chains, collaborative predictions, style matching, data prep,
workflow templates, skill gaps, anomaly alerts, auto-switch, smart preload.

Full list in `config.py`. Check enabled flag before changing predictive-
intelligence behaviour.

## See also
- `security-core.md` — invariants that these constants enforce (read-only, 6-layer SQL validation, PII, JWT allowlist).
- `arch-backend.md` — modules that consume these values.
- `constraints-agent-auth.md` — agent-runtime rules referencing the tool budget and session caps.

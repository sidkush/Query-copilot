## Scope

Single source of truth for the numeric / string constants that govern
QueryCopilot V1's runtime behaviour. The architecture + constraints docs
point here instead of duplicating values. Confirm against
`backend/config.py` + `backend/.env.example` before changing anything.

### Model selection (BYOK Anthropic via `anthropic_provider.py`)

| Constant | Source-of-truth | Value |
|---|---|---|
| `PRIMARY_MODEL` | `backend/config.py` default | `claude-haiku-4-5-20251001` |
| `FALLBACK_MODEL` | `backend/config.py` default | `claude-sonnet-4-5-20250514` |
| `FALLBACK_MODEL` | `backend/.env.example` override | `claude-sonnet-4-6` |

**Reconcile note.** Runtime picks up `.env` first, so `sonnet-4-6` wins when
`.env` comes from `.env.example`. The two files currently disagree. Treat the
`.env.example` value as the intended production pin until the code default is
updated — do not assume `4-5-20250514` without checking the active `.env`.

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

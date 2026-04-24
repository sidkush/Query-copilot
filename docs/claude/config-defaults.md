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

### Provenance + Tenant + Chaos (Phase E — Rings 5/6, H7/H8/H10/H11)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_PROVENANCE_CHIP` | `True` | Emit provenance_chip SSE event before first token. |
| `SKEW_GUARD_P99_P50_RATIO` | `10.0` | Ratio trigger for "add median alongside mean" in summaries. |
| `TIER_PROMOTE_KEYWORDS` | `exact,last hour,today,fraud rate,incident,live` | Force live execution on match. |
| `FEATURE_TENANT_FORTRESS` | `True` | `(tenant, conn, user)` composite keys everywhere. |
| `TENANT_EU_REGIONS` | `eu,fr,de,ie,nl,pl,es,it` | Tenants whose region_hint matches → EU Anthropic endpoint. |
| `FEATURE_CHAOS_ISOLATION` | `True` | Jitter + singleflight + cost breaker + SSE cursor. |
| `JITTER_BASE_MS` | `50` | Exponential backoff base for retry. |
| `JITTER_MAX_MS` | `500` | Retry cap. |
| `SINGLEFLIGHT_WAIT_TIMEOUT_S` | `10.0` | Secondary caller timeout when primary key held. |
| `COST_BREAKER_MAX_USD_PER_MINUTE` | `1.0` | Per-tenant spend cap; trips → 429. |
| `SSE_CURSOR_TTL_SECONDS` | `300` | Resumable SSE cursor retention. |
| `FEATURE_RESULT_PROVENANCE` | `True` | H10 always-on observability on results. |
| `TURBO_LIVE_SANITY_SAMPLE_FRACTION` | `0.01` | 1% Turbo answers re-run live for sanity. |
| `TURBO_LIVE_DIVERGENCE_WARN_PCT` | `10.0` | % divergence → warn on chip. |
| `FEATURE_SAMPLING_AWARE` | `True` | HLL + sentinel + stratify. |
| `HLL_PRECISION` | `14` | `2^14 = 16 384` registers; ~0.8% error. |
| `VIZQL_HEX_BIN_THRESHOLD_ROWS` | `20_000` | Scatter → hex-bin auto-swap above this. |

### Correction Pipeline (Phase F — P6 + P10 + H15)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_CORRECTION_PIPELINE` | `True` | Master gate for Phase F. Off → `promote_to_examples()` no-ops with log line. |
| `PROMOTION_ADMIN_CEREMONY_REQUIRED` | `True` | H15 — require 2-admin approval. Off → auto-promote (staging only). |
| `PROMOTION_CEREMONY_PER_ADMIN_DAILY_LIMIT` | `20` | H15 — per-admin approval quota per 24h rolling window. 429 when exceeded. |
| `PROMOTIONS_PER_TENANT_PER_DAY` | `10` | Per-tenant promotion cap. Enforced in `query_memory.promote_example`. |
| `PROMOTION_GOLDEN_EVAL_THRESHOLD_PCT` | `2.0` | % pass-rate drop on any trap suite that blocks promotion. |
| `ADVERSARIAL_SIMILARITY_COSINE_THRESHOLD` | `0.92` | Cosine distance under which 2 upvotes from same user count as storm. |
| `ADVERSARIAL_SIMILARITY_WINDOW_HOURS` | `1` | Sliding window for thumbs-up storm detection. |
| `ADVERSARIAL_SIMILARITY_MAX_UPVOTES` | `3` | Max thumbs-ups from same user in window before block. |
| `PROMOTION_LEDGER_DIR` | `.data/promotion_ledger` | JSONL append-only ledger of promotion decisions. |

### Retrieval Hygiene (Phase G — P9)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_RETRIEVAL_HYGIENE` | `True` | Master gate for Phase G. Off → `SkillRouter.resolve` pre-G behaviour (no bundles, no expansion, no depends_on closure). |
| `FEATURE_QUERY_EXPANSION` | `True` | Off → router embeds the raw question. |
| `FEATURE_SKILL_BUNDLES` | `True` | Off → bundle stage skipped. |
| `FEATURE_DEPENDS_ON_RESOLVER` | `True` | Off → `depends_on:` frontmatter ignored at retrieval. |
| `QUERY_EXPANSION_MAX_TOKENS` | `200` | Hard cap on LLM output. Haiku `max_tokens` param. |
| `QUERY_EXPANSION_CACHE_TTL_SECONDS` | `3600` | Per-tenant expansion cache lifetime. |
| `QUERY_EXPANSION_MODEL` | `claude-haiku-4-5-20251001` | Must match `PRIMARY_MODEL`. |
| `RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT` | `30.0` | Phase G exit criterion (measured in `tests/test_retrieval_budget.py`). |
| `SKILL_ARCHIVAL_DORMANCY_DAYS` | `30` | Skill unused this long is archival candidate. |
| `SKILL_ARCHIVAL_MIN_RETRIEVALS` | `1` | < N retrievals in window → archive. |
| `SKILL_ARCHIVAL_ROOT` | `askdb-skills/archive` | Destination. Preserves original subdir. Never deletes. |

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

### Hardening Bands (Phase H — H19–H27)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_SUPPLY_CHAIN_HARDENING` | `True` | H19 gate; startup reads `requirements.lock`. |
| `REQUIREMENTS_LOCK_PATH` | `backend/requirements.lock` | Generated by `pip-compile --generate-hashes`. Commit alongside `requirements.txt`. |
| `SAFETENSORS_ONLY` | `True` | H19 — `embedder_registry` rejects unsafe weight formats. |
| `FEATURE_IDENTITY_HARDENING` | `True` | H20 master gate. |
| `OAUTH_STATE_HMAC_TTL_SECONDS` | `600` | HMAC signer (itsdangerous). 10 min. |
| `STRIPE_WEBHOOK_SECRET` | `""` | Empty => verify raises. Set via `.env`. |
| `DISPOSABLE_EMAIL_BLOCKLIST_PATH` | `backend/middleware/disposable_emails.txt` | H20 + H23 shared list. |
| `TRIAL_QUOTA_DAILY_QUERIES` | `10` | Server-enforced via Redis/in-memory. |
| `FEATURE_INFRA_RESILIENCE` | `True` | H21 gate. |
| `AGENT_SESSION_DB_PATH` | `.data/agent_sessions.db` | Override with PVC mount in k8s. |
| `STALE_BACKUP_WARN_DAYS` | `30` | Dashboard snapshot older -> load-time banner. |
| `FEATURE_A11Y_MOTION_SETTING` | `True` | H22 motion setting. |
| `MOTION_SPEED_MS_DEFAULT` | `150` | Frontend default; `prefers-reduced-motion` overrides to 0. |
| `FEATURE_SUPPORT_IMPERSONATION` | `True` | H23 gate. |
| `SUPPORT_IMPERSONATION_TTL_SECONDS` | `900` | 15 min default. |
| `FEATURE_AUDIT_INTEGRITY` | `True` | H24 gate. |
| `AUDIT_SILENCE_WINDOW_SECONDS` | `60` | Emit `MONITORING_SILENT` telemetry. |
| `FEATURE_TRANSPORT_GUARDS` | `True` | H25 ASGI middleware. |
| `HTTP2_MAX_RST_PER_MINUTE` | `100` | Rapid-reset cap per HTTP/2 conn. |
| `FEATURE_EXPORT_SCOPE_VALIDATION` | `True` | H26 — export runs Ring-3. |
| `FEATURE_AB_VARIANT_DEDUP` | `True` | H26 — variant-id dedup table. |
| `FEATURE_CANCEL_2PC` | `True` | H26 — async cancel two-phase commit. |
| `FEATURE_AUTH_UNIFIED_MIDDLEWARE` | `True` | H27 — single code path per request. |
| `JWT_LEEWAY_SECONDS` | `5` | H27 — jwt.decode leeway clamp. |
| `NONCE_CACHE_TTL_SECONDS` | `300` | H27 — Redis (fallback: memory) nonce TTL. |
| `ASKDB_PCI_MODE` | `False` | H27 — strict mode. |
| `ASKDB_HIPAA_MODE` | `False` | H27 — strict mode + write-time masking. |

### Operations Layer (Phase I — P11)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_ALERT_MANAGER` | `True` | Off -> detectors silent, `alert_manager.fire()` no-ops. |
| `ALERT_DEDUP_WINDOW_SECONDS` | `300` | H16 sliding dedup per `(tenant_id, rule_id)`. |
| `ALERT_MULTI_HOUR_ACCUMULATOR_SECONDS` | `3600` | One fire per hour when signal stays hot. |
| `ALERT_MAX_RETRY` | `3` | Retry via `chaos_isolation.jittered_backoff`. |
| `ALERT_DISPATCH_FAIL_BUDGET` | `5` | Dispatch-failure count in 1 h before `ops_alert_dispatch_failure` fires. |
| `SLACK_WEBHOOK_DEV_URL` | `""` | Dev channel for `scripts/test_alert_fire.py`. |
| `ALERT_FALLBACK_EMAIL_ON_SLACK_FAIL` | `True` | Fall back to `digest._send_email()`. |
| `FEATURE_CACHE_STATS_DASHBOARD` | `True` | Admin-only React page. |
| `CACHE_STATS_REFRESH_SECONDS` | `60` | Frontend poll. |
| `RESIDUAL_RISK_TELEMETRY_DIR` | `.data/residual_risk` | JSONL counters per `(tenant_id, rule_id)`. |
| `ALERT_TELEMETRY_MISSING_WINDOW_SECONDS` | `600` | No emission in window -> `ops_telemetry_source_missing`. |
| `RESIDUAL_RISK_1_TRAP_FN_RATE_MAX_PCT` | `2.0` | Master row 1. |
| `RESIDUAL_RISK_3_SCHEMA_DRIFT_RATE_MAX_PCT` | `1.0` | Master row 3. |
| `RESIDUAL_RISK_4_LEAP_DAY_PASS_RATE_MIN_PCT` | `100.0` | Master row 4. |
| `RESIDUAL_RISK_5_TOP10_PRECISION_MIN_PCT` | `70.0` | Master row 5. |
| `RESIDUAL_RISK_6_UPVOTE_STORM_MAX_PER_HOUR` | `3` | Master row 6. |
| `RESIDUAL_RISK_7_CLIENT_RETRIES_MAX_PER_5MIN` | `5` | Master row 7. |
| `RESIDUAL_RISK_9_DEPRECATED_BYOK_PINNED_MAX` | `0` | Master row 9. |
| `RESIDUAL_RISK_10_LOW_TRAFFIC_CACHE_MISS_MAX_PCT` | `30.0` | Master row 10. |

### Ring 8 Agent Orchestration (Phase K)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_AGENT_PLANNER` | `False` | Master gate for `analytical_planner.py`. Off → `_tool_run_sql` is pre-K behavior. Demo tenant overrides to True. |
| `FEATURE_AGENT_FEEDBACK_LOOP` | `False` | Wires `_handle_scope_violations_with_replan` into tool loop. Off → Phase C/D dead-code state preserved. |
| `FEATURE_AGENT_HALLUCINATION_ABORT` | `False` | `SafeText` guard active. Off → agent output unfiltered. |
| `FEATURE_AGENT_MODEL_LADDER` | `False` | `ModelLadder.select()` routes by role. Off → single-model path. |
| `AGENT_STEP_CAP` | `20` | Max tool calls per user query. 21st call → safe_abort. |
| `AGENT_WALL_CLOCK_TYPICAL_S` | `60.0` | Budget exhaustion → safe_abort with partial-plan banner. |
| `AGENT_WALL_CLOCK_HARD_S` | `120.0` | Absolute ceiling; agent process killed. |
| `AGENT_COST_CAP_USD` | `0.10` | Per-query Anthropic spend. Trips `chaos_isolation.CostBreaker`. |
| `MODEL_LADDER_STEP_EXEC` | `claude-haiku-4-5-20251001` | Step execution tier. |
| `MODEL_LADDER_PLAN_EMIT` | `claude-sonnet-4-6` | Plan emission tier. No extended-thinking. |
| `MODEL_LADDER_RECOVERY` | `claude-opus-4-7-1m-20260115` | Recovery tier. Verify availability at deploy; update via model-version-sweep. |
| `SEMANTIC_REGISTRY_BOOTSTRAP_ON_CONNECT` | `True` | Auto-seed registry on new connection. |
| `PLANNER_MAX_CTE_COUNT` | `3` | Planner refuses plans with >3 CTEs; splits into follow-up. |
| `PLAN_ARTIFACT_EMIT_BEFORE_FIRST_SQL` | `True` | SSE emits `plan_artifact` event before any `run_sql` tool call. |
| `GROUNDING_W1_HARDCAP_ENFORCE` | `False` | Master gate for Week-1 grounding (hard cap + consent card + banner). Flip to True after WAL backup. |
| `W1_ANALYTICAL_CAP` | `20` | Hard tool-call cap for analytical workload; no auto-extend when flag on. |
| `W1_DASHBOARD_CAP` | `40` | Hard tool-call cap for dashboard workload; no auto-extend when flag on. |
| `W1_CONSECUTIVE_TOOL_ERROR_THRESHOLD` | `3` | N consecutive `run_sql` errors → fire `agent_checkpoint` consent card (GAP A). |

### Audit Ledger + Progressive UX + Plan Cache (Phase L)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_AUDIT_LEDGER` | `False` | Master gate for hash-chained per-claim ledger. Off → no audit writes. |
| `FEATURE_CLAIM_PROVENANCE` | `False` | Scans agent synthesis for numeric spans + binds to tool-results. Off → synthesis unfiltered. |
| `FEATURE_PROGRESSIVE_UX_FULL` | `False` | Frontend slot streaming + cancel + revise + ResultPreview + ClaimChip. |
| `FEATURE_PLAN_CACHE` | `False` | Plan reuse via ChromaDB. Off → every Q calls Sonnet. |
| `FEATURE_DEADLINE_PROPAGATION` | `False` | asyncio contextvar DEADLINE threaded through tool methods. |
| `AUDIT_LEDGER_DIR` | `.data/audit_ledger` | Per-tenant `<tenant_id>/<YYYY-MM>.jsonl` files. Gitignored. |
| `AUDIT_LEDGER_FLUSH_EVERY_N` | `1` | Fsync every N entries. Set >1 for higher throughput (weaker durability). |
| `CLAIM_PROVENANCE_UNVERIFIED_MARKER` | `[unverified]` | Inline marker replacing unbound numeric spans in synthesis text. |
| `PLAN_CACHE_COSINE_THRESHOLD` | `0.85` | Minimum cosine similarity to reuse a cached plan. Below → re-plan. |
| `PLAN_CACHE_TTL_HOURS` | `168` | 7 days. Schema-change invalidation overrides TTL. |
| `PLAN_CACHE_MAX_ENTRIES_PER_TENANT` | `500` | LRU eviction above this. |
| `RESULT_PREVIEW_LIMIT_ROWS` | `50` | `LIMIT 50` probe streams while full query runs. |
| `AGENT_CANCEL_GRACE_MS` | `2000` | Grace period after cancel before hard-kill. |

### Dialect Bridge (Phase M-alt)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_DIALECT_BRIDGE` | `False` | Master gate. Off → LiveTier executes on source dialect directly, no transpile. |
| `DIALECT_BRIDGE_ALERT_ON_FAILURE` | `True` | Fire `transpile_failure` alert via alert_manager when sqlglot transpile raises. Keep True in prod for observability. |

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
`FEATURE_PERMISSION_SYSTEM`, `FEATURE_ANALYST_PRO`.

Default **OFF**: `FEATURE_SESSION_TRACKING`, `FEATURE_CONSENT_FLOW`,
`FEATURE_AUTOCOMPLETE`, `FEATURE_PERSONAS`, `FEATURE_INSIGHT_CHAINS`,
`FEATURE_COLLABORATIVE`, `FEATURE_STYLE_MATCHING`, `FEATURE_DATA_PREP`,
`FEATURE_WORKFLOW_TEMPLATES`, `FEATURE_SKILL_GAPS`,
`FEATURE_ANOMALY_ALERTS`, `FEATURE_AUTO_SWITCH`, `FEATURE_SMART_PRELOAD`.

Full list in `config.py`. Check enabled flag before changing predictive-
intelligence behaviour.

### Phase J closeout — flag coverage verifier

`scripts/verify_phase_j.py` enforces that every `FEATURE_*` / `RULE_*` /
`ECHO_*` / `COVERAGE_*` / `SCOPE_*` / `TENANT_*` / `SKEW_*` / `TIER_*` /
`JITTER_*` / `SINGLEFLIGHT_*` / `COST_*` / `SSE_*` / `HLL_*` /
`VIZQL_HEX_*` / `FISCAL_*` / `TURBO_LIVE_*` flag in `backend/config.py`
has a backticked mention in this file. CI / pre-commit: run
`python scripts/verify_phase_j.py` — exits non-zero on undocumented
flags.

## See also
- `security-core.md` — invariants that these constants enforce (read-only, 6-layer SQL validation, PII, JWT allowlist).
- `arch-backend.md` — modules that consume these values.
- `constraints-agent-auth.md` — agent-runtime rules referencing the tool budget and session caps.

"""
AskDB Configuration
Central configuration management using Pydantic settings.
"""

from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field, model_validator
from typing import Optional
from enum import Enum
from dotenv import dotenv_values

# Resolve .env relative to this file, not cwd
_ENV_FILE = Path(__file__).resolve().parent / ".env"


class DBType(str, Enum):
    # Relational
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"
    MARIADB = "mariadb"
    SQLITE = "sqlite"
    MSSQL = "mssql"
    COCKROACHDB = "cockroachdb"
    # Cloud Data Warehouses
    SNOWFLAKE = "snowflake"
    BIGQUERY = "bigquery"
    REDSHIFT = "redshift"
    DATABRICKS = "databricks"
    # Analytics Engines
    CLICKHOUSE = "clickhouse"
    DUCKDB = "duckdb"
    TRINO = "trino"
    # Enterprise
    ORACLE = "oracle"
    SAP_HANA = "sap_hana"
    IBM_DB2 = "ibm_db2"


class Settings(BaseSettings):
    # ── Anthropic API ──────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = Field(..., description="Your Anthropic API key")
    PRIMARY_MODEL: str = Field(default="claude-haiku-4-5-20251001")
    FALLBACK_MODEL: str = Field(default="claude-sonnet-4-5-20250514")
    MAX_TOKENS: int = Field(default=2048)

    # ── Agent Phase Timeouts ──────────────────────────────────────
    AGENT_PHASE_PLANNING: int = Field(default=30, description="Planning phase budget (seconds)")
    AGENT_PHASE_SCHEMA: int = Field(default=60, description="Schema discovery budget (seconds)")
    AGENT_PHASE_SQL_GEN: int = Field(default=30, description="SQL generation budget (seconds)")
    AGENT_PHASE_DB_EXEC: int = Field(default=300, description="DB execution budget (seconds)")
    AGENT_PHASE_VERIFY: int = Field(default=30, description="Verification pass budget (seconds)")
    AGENT_SESSION_HARD_CAP: int = Field(default=1800, description="Absolute session cap (seconds)")
    AGENT_MAX_CONCURRENT_PER_USER: int = Field(default=2, description="Max concurrent agent sessions per user")

    # ── Database Connection ────────────────────────────────────────
    DB_TYPE: DBType = Field(default=DBType.POSTGRESQL)
    DB_HOST: str = Field(default="localhost")
    DB_PORT: int = Field(default=5432)
    DB_NAME: str = Field(default="analytics")
    DB_USER: str = Field(default="copilot_readonly")
    DB_PASSWORD: str = Field(default="")
    DB_SCHEMA: str = Field(default="public")

    # BigQuery specific
    BQ_PROJECT: Optional[str] = Field(default=None)
    BQ_DATASET: Optional[str] = Field(default=None)
    BQ_CREDENTIALS_PATH: Optional[str] = Field(default=None)

    # Snowflake specific
    SF_ACCOUNT: Optional[str] = Field(default=None)
    SF_WAREHOUSE: Optional[str] = Field(default=None)
    SF_DATABASE: Optional[str] = Field(default=None)
    SF_SCHEMA: Optional[str] = Field(default=None)

    # ── Security Settings ─────────────────────────────────────────
    MAX_ROWS: int = Field(default=1000)
    QUERY_TIMEOUT_SECONDS: int = Field(default=30)
    MAX_CONNECTIONS_PER_USER: int = Field(default=10)
    BLOCKED_KEYWORDS: list = Field(
        default=["DROP", "DELETE", "UPDATE", "INSERT", "ALTER",
                 "TRUNCATE", "GRANT", "REVOKE", "CREATE", "EXEC",
                 "EXECUTE", "pg_sleep", "LOAD_FILE", "INTO OUTFILE",
                 "INTO DUMPFILE", "BENCHMARK"]
    )

    # ── JWT Auth ──────────────────────────────────────────────────
    JWT_SECRET_KEY: str = Field(default="change-me-in-production-use-a-long-random-string")
    ADMIN_JWT_SECRET_KEY: str = Field(default="")  # Separate admin JWT secret; falls back to JWT_SECRET_KEY if empty
    JWT_ALGORITHM: str = Field(default="HS256")  # Constrained at startup to SAFE_JWT_ALGORITHMS
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=1440)  # 24 hours

    # ── Encryption ───────────────────────────────────────────────
    FERNET_SECRET_KEY: str = Field(default="")  # Dedicated Fernet key; falls back to SHA256(JWT_SECRET_KEY) if empty

    # ── Share Tokens ─────────────────────────────────────────────
    SHARE_TOKEN_EXPIRE_HOURS: int = Field(default=168)  # 7 days

    # ── SQL Allowlist ────────────────────────────────────────────
    SQL_ALLOWLIST_MODE: bool = Field(default=False)
    SQL_ALLOWED_TABLES: list = Field(default=[])

    # ── OAuth ─────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: Optional[str] = Field(default=None)
    GOOGLE_CLIENT_SECRET: Optional[str] = Field(default=None)
    GITHUB_CLIENT_ID: Optional[str] = Field(default=None)
    GITHUB_CLIENT_SECRET: Optional[str] = Field(default=None)
    OAUTH_REDIRECT_URI: str = Field(default="http://localhost:5173/auth/callback")

    # ── Email Delivery (OTP) ────────────────────────────────────
    # Option 1: Resend (recommended — free 100 emails/day, no domain setup)
    RESEND_API_KEY: str = Field(default="")
    RESEND_FROM_EMAIL: str = Field(default="AskDB <onboarding@resend.dev>")
    # Option 2: SMTP (Gmail App Password, SendGrid, Brevo, etc.)
    SMTP_HOST: str = Field(default="smtp.gmail.com")
    SMTP_PORT: int = Field(default=587)
    SMTP_USER: str = Field(default="")
    SMTP_PASSWORD: str = Field(default="")
    SMTP_FROM_EMAIL: str = Field(default="")
    SMTP_FROM_NAME: str = Field(default="AskDB")
    OTP_EXPIRY_SECONDS: int = Field(default=600)  # 10 minutes

    # ── SMS Delivery (Phone OTP via Twilio) ───────────────────
    TWILIO_ACCOUNT_SID: str = Field(default="")
    TWILIO_AUTH_TOKEN: str = Field(default="")
    TWILIO_FROM_NUMBER: str = Field(default="")  # Your Twilio phone number
    TWILIO_MESSAGING_SERVICE_SID: str = Field(default="")  # Optional: better deliverability

    # ── Integrations ─────────────────────────────────────────────
    SLACK_WEBHOOK_URL: str = Field(default="")  # Incoming webhook URL for alert notifications

    # ── App ───────────────────────────────────────────────────────
    APP_TITLE: str = Field(default="AskDB")
    FRONTEND_URL: str = Field(default="http://localhost:5173")

    # ── ChromaDB ──────────────────────────────────────────────────
    CHROMA_PERSIST_DIR: str = Field(default=".chroma/querycopilot")

    # ── Redis ────────────────────────────────────────────────────
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # ── Storage ───────────────────────────────────────────────────
    STORAGE_BACKEND: str = Field(default="file")  # Pluggable: "file" (default). Future: "s3", "sqlite", "postgres"

    # ── Email Digests ────────────────────────────────────────────
    DIGEST_ENABLED: bool = Field(default=False)  # Enable scheduled email digests
    DIGEST_HOUR_UTC: int = Field(default=9)  # Hour (UTC) to send daily digests
    DIGEST_WEEKDAY: int = Field(default=0)  # Day of week for weekly digests (0=Monday)

    # ── Caching ───────────────────────────────────────────────────
    CACHE_ENABLED: bool = Field(default=True)
    CACHE_TTL_SECONDS: int = Field(default=3600)

    # ── Query Intelligence ───────────────────────────────────────
    SCHEMA_CACHE_MAX_AGE_MINUTES: int = Field(default=60)
    SCHEMA_CACHE_DIR: str = Field(default=".data/schema_cache")
    QUERY_MEMORY_ENABLED: bool = Field(default=True)
    QUERY_MEMORY_COLLECTION_PREFIX: str = Field(default="query_memory_")
    QUERY_MEMORY_TTL_HOURS: int = Field(default=168)  # 7 days
    TURBO_MODE_ENABLED: bool = Field(default=True)
    TURBO_TWIN_DIR: str = Field(default=".data/turbo_twins")
    TURBO_TWIN_MAX_SIZE_MB: int = Field(default=500)
    TURBO_TWIN_SAMPLE_PERCENT: float = Field(default=1.0)  # 1% sample for TB-scale
    TURBO_TWIN_REFRESH_HOURS: int = Field(default=4)
    TURBO_TWIN_WARN_UNENCRYPTED: bool = Field(default=True)  # Log warning when twins enabled without disk encryption

    # ---- VizQL query cache (Plan 7e, Build_Tableau §IV.10) -----------
    VIZQL_CACHE_ENABLED: bool = Field(default=True)
    VIZQL_INPROCESS_CACHE_BYTES: int = Field(default=67_108_864)     # 64 MiB
    VIZQL_EXTERNAL_CACHE_BYTES: int = Field(default=536_870_912)     # 512 MiB
    VIZQL_CACHE_TTL_SECONDS: int = Field(default=3600)
    VIZQL_HISTORY_TRACKING_ENABLED: bool = Field(default=True)

    # Smart Twin (Phase 3 — Global Comp)
    SMART_TWIN_FULL_COPY_THRESHOLD: int = Field(default=50_000, description="Tables below this row count are fully copied, not sampled")
    SMART_TWIN_AGGREGATE_ENABLED: bool = Field(default=True, description="Auto-generate aggregate tables in twin during sync")
    SMART_TWIN_PATTERN_AWARE: bool = Field(default=True, description="Use query patterns to bias sampling toward frequently-queried data")

    # DataFusion (Phase 3 — Global Comp)
    DATAFUSION_ENABLED: bool = Field(default=True, description="Use DataFusion for query optimization in LiveTier")
    DATAFUSION_TIMEOUT_MS: int = Field(default=5000, description="Per-provider timeout for DataFusion execution")
    DATAFUSION_FALLBACK_TO_DECOMPOSER: bool = Field(default=True, description="Fall back to query_decomposer.py if DataFusion fails")

    # Celery + Redis
    CELERY_BROKER_URL: str = Field(default="redis://localhost:6379/0")
    CELERY_RESULT_BACKEND: str = Field(default="redis://localhost:6379/1")

    # ML Engine
    ML_ENGINE_ENABLED: bool = Field(default=True)
    ML_MAX_MODELS_FREE: int = Field(default=3)
    ML_MAX_MODELS_PRO: int = Field(default=10)
    ML_TRAINING_TIMEOUT_SECONDS: int = Field(default=3600)
    ML_WORKER_MAX_MEMORY_MB: int = Field(default=512)
    ML_MAX_CONCURRENT_TRAINING_PER_USER: int = Field(default=2)
    ML_AUTO_EXCLUDE_PII: bool = Field(default=True)
    ML_MODELS_DIR: str = Field(default=".data/ml_models")
    ML_FULL_DATASET_ENABLED: bool = Field(default=True, description="Allow training on full source dataset (bypasses twin sampling)")
    ML_MAX_TRAINING_ROWS: int = Field(default=10_000_000, description="Safety cap for full dataset training")
    ML_DEFAULT_SAMPLE_SIZE: int = Field(default=500_000, description="Default stratified sample size")
    ML_TRAINING_QUERY_TIMEOUT: int = Field(default=3600, description="Timeout for full dataset queries (seconds)")
    ML_PIPELINES_DIR: str = Field(default=".data/ml_pipelines")

    # Voice Mode (Phase 5 — Global Comp)
    VOICE_MODE_ENABLED: bool = Field(default=True)
    VOICE_WS_MAX_CONNECTIONS_PER_USER: int = Field(default=2)
    VOICE_RESPONSE_MAX_CHARS: int = Field(default=500, description="Cap TTS response length for cost control")
    VOICE_INTERIM_DEBOUNCE_MS: int = Field(default=300)

    DECOMPOSITION_ENABLED: bool = Field(default=True)
    DECOMPOSITION_MIN_ROWS: int = Field(default=1_000_000)  # only decompose if estimated > 1M rows
    STREAMING_PROGRESS_INTERVAL_MS: int = Field(default=1000)
    WATERFALL_CAN_ANSWER_BUDGET_MS: int = Field(default=200, ge=10)   # P1 NEMESIS: min 10ms prevents accidental disable
    WATERFALL_ANSWER_BUDGET_MS: int = Field(default=1000, ge=50)     # P1 NEMESIS: min 50ms prevents accidental disable

    # ── Sub-project B (chart performance) ─────────────────────────
    CHART_PERF_ENABLED: bool = Field(default=True)
    CHART_DOWNSAMPLE_ENABLED: bool = Field(default=True)
    CHART_DOWNSAMPLE_DEFAULT_TARGET_POINTS: int = Field(default=4000)
    CHART_STREAM_BATCH_ROWS: int = Field(default=5000)
    CHART_FRAME_BUDGET_TIGHT_MS: int = Field(default=16)
    CHART_FRAME_BUDGET_LOOSE_MS: int = Field(default=33)
    CHART_INSTANCE_POOL_MAX: int = Field(default=12)

    # ── Dual-Response (Progressive Dual-Response Data Acceleration) ──
    DUAL_RESPONSE_ENABLED: bool = Field(default=True)                # T1: master toggle for cached+live dual-stream
    DUAL_RESPONSE_STALENESS_TTL_SECONDS: int = Field(default=300)    # T2: cache age threshold for staleness gate
    DUAL_RESPONSE_ALWAYS_CORRECT: bool = Field(default=True)         # T2: True=always fire live; False=skip live when fresh
    WRITE_TIME_MASKING: bool = Field(default=False)                  # T3: PII mask at DuckDB write time (not read)
    BEHAVIOR_WARMING_ENABLED: bool = Field(default=False)            # T4: warm cache based on query patterns

    # Arrow Data Bridge (Phase 1 — Global Comp)
    ARROW_BRIDGE_ENABLED: bool = Field(default=True, description="Use Arrow RecordBatches in tier results instead of Python dicts")
    ARROW_FALLBACK_TO_PANDAS: bool = Field(default=True, description="Fall back to pandas path if Arrow conversion fails")
    PERFORMANCE_TRACKING_ENABLED: bool = Field(default=True, description="Track and expose query latency metrics")

    # ── Infrastructure ──────────────────────────────────────────────
    THREAD_POOL_MAX_WORKERS: int = Field(default=32, ge=4, le=256)    # M1: explicit thread pool (P2 NEMESIS: bounded 4-256)

    # ── Predictive Intelligence Feature Flags ────────────────────
    FEATURE_PREDICTIONS: bool = Field(default=True)  # #1: 3 predictive suggestions
    FEATURE_ADAPTIVE_COMPLEXITY: bool = Field(default=True)  # #4: skill-level detection
    FEATURE_INTENT_DISAMBIGUATION: bool = Field(default=True)  # #15: term→meaning maps
    FEATURE_ANALYST_TONE: bool = Field(default=True)  # #21: immutable analyst persona
    FEATURE_TIME_PATTERNS: bool = Field(default=True)  # #5: day/hour predictions
    FEATURE_SESSION_TRACKING: bool = Field(default=False)  # #2: client-side behavior capture
    FEATURE_CONSENT_FLOW: bool = Field(default=False)  # #3: 2-tier opt-in
    FEATURE_AUTOCOMPLETE: bool = Field(default=False)  # #9: typing prediction
    FEATURE_PERSONAS: bool = Field(default=False)  # #10: Explorer/Auditor/Storyteller
    FEATURE_INSIGHT_CHAINS: bool = Field(default=False)  # #11: cross-session resume
    FEATURE_COLLABORATIVE: bool = Field(default=False)  # #12: cross-user predictions
    FEATURE_STYLE_MATCHING: bool = Field(default=False)  # #13: NL tone adaptation
    FEATURE_DATA_PREP: bool = Field(default=False)  # #14: pre-caching
    FEATURE_WORKFLOW_TEMPLATES: bool = Field(default=False)  # #16: repeated pattern detection
    FEATURE_SKILL_GAPS: bool = Field(default=False)  # #17: unused SQL suggestions
    FEATURE_AGENT_DASHBOARD: bool = Field(default=True)  # #19: agent tile control
    FEATURE_PERMISSION_SYSTEM: bool = Field(default=True)  # #20: supervised/autonomous
    FEATURE_ANOMALY_ALERTS: bool = Field(default=False)  # #7: proactive anomaly detection
    FEATURE_AUTO_SWITCH: bool = Field(default=False)  # #6: connection switching prediction
    FEATURE_SMART_PRELOAD: bool = Field(default=False)  # #8: dashboard pre-loading

    # ── Analyst Pro archetype (Tableau-parity freeform workbook) ──
    # Plan 1 ships read-only rendering. Plan 2+ add drag/resize/actions/sets.
    FEATURE_ANALYST_PRO: bool = False
    FEATURE_RAWSQL_ENABLED: bool = False
    CALC_RATE_LIMIT_PER_30S: int = 10
    MAX_CALC_FORMULA_LEN: int = 10_000
    MAX_CALC_NESTING: int = 32

    # Plan 8b Section XIX.1 — warn on FIXED LOD with estimated Cartesian > this
    LOD_WARN_THRESHOLD_ROWS: int = 1_000_000

    # Plan 8d — Monaco calc editor live eval + LLM suggest
    CALC_EVAL_TIMEOUT_SECONDS: float = 1.0          # max wall time for single-row eval
    CALC_EVAL_CACHE_TTL_SECONDS: int = 60           # (formula_hash, row_hash) result cache
    FEATURE_CALC_LLM_SUGGEST: bool = True           # gates /api/v1/calcs/suggest
    CALC_SUGGEST_RATE_LIMIT_PER_60S: int = 5        # per-user LLM suggest cap (60s sliding)
    CALC_SUGGEST_MAX_DESCRIPTION_LEN: int = 1000    # reject oversized NL descriptions (413)

    # Plan 9b — Trend Line analytics endpoint.
    TREND_RATE_LIMIT_PER_30S: int = 20
    TREND_MAX_ROWS: int = 100_000
    TREND_TIMEOUT_SECONDS: float = 5.0

    # Sub-project A — new chart editor + ChartSpec IR cutover (Phase 4b).
    # Phase 4c+2: default flipped to True. /analytics now always renders
    # the new DashboardShell + ChartEditor path (legacy DashboardBuilder
    # + TileEditor have been deleted). The flag is preserved as part of
    # a generic dashboard feature-flag endpoint for future flags; setting
    # it False no longer swaps routing because the legacy surface is
    # gone. Chat / SharedDashboard / PresentationEngine still use
    # ResultsChart + ECharts internally until a future migration.
    NEW_CHART_EDITOR_ENABLED: bool = Field(default=True)

    # Sub-project C — user-authored chart types + community gallery.
    CUSTOM_CHART_TYPES_ENABLED: bool = Field(default=True)   # Tier 1 spec templates (live since C0)
    CHART_SDK_ENABLED: bool = Field(default=True)             # Tier 2 iframe SDK (C5 production flip)

    # Demo login guard — must be explicitly enabled
    DEMO_ENABLED: bool = Field(default=False)

    # ── Skill Library (Plan 3) ────────────────────────────
    SKILL_LIBRARY_ENABLED: bool = Field(default=False)
    SKILL_LIBRARY_PATH: str = Field(default="../askdb-skills")
    SKILL_MAX_RETRIEVED: int = Field(default=3)
    SKILL_MAX_TOTAL_TOKENS: int = Field(default=20000)
    SKILL_ALWAYS_ON_TOKENS_CAP: int = Field(default=7000)
    CORRECTION_QUEUE_ENABLED: bool = Field(default=True)
    SKILL_DRIFT_KL_THRESHOLD: float = Field(default=0.3)
    SKILL_SHADOW_MODE_ENABLED: bool = Field(default=True)

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8", "extra": "ignore"}

    @model_validator(mode="after")
    def _fill_empty_from_dotenv(self):
        """If env vars are empty strings (e.g. inherited from parent process), fall back to .env file."""
        env_vals = dotenv_values(str(_ENV_FILE))
        for field_name in self.model_fields:
            val = getattr(self, field_name, None)
            if val == "" and field_name in env_vals and env_vals[field_name]:
                object.__setattr__(self, field_name, env_vals[field_name])
        return self


settings = Settings()

# ── Startup Security Checks ─────────────────────────────────────
import logging as _logging
_cfg_logger = _logging.getLogger("config")

if settings.JWT_SECRET_KEY in ("change-me-in-production-use-a-long-random-string", "change-me-in-production"):
    _cfg_logger.critical(
        "JWT_SECRET_KEY is set to the default value! "
        "Set a strong random secret in .env before deploying. "
        "Example: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )
    import os as _os
    if (_os.environ.get("ASKDB_ENV") or _os.environ.get("QUERYCOPILOT_ENV", "")).lower() in ("production", "prod", "staging"):
        raise SystemExit("FATAL: JWT_SECRET_KEY must be changed from default in production/staging")

# Cap MAX_ROWS to prevent env-var abuse
_MAX_ROWS_CEILING = 50000
if settings.MAX_ROWS > _MAX_ROWS_CEILING:
    _cfg_logger.warning("MAX_ROWS=%d exceeds ceiling %d — capping", settings.MAX_ROWS, _MAX_ROWS_CEILING)
    object.__setattr__(settings, "MAX_ROWS", _MAX_ROWS_CEILING)

# Ensure critical keywords are always blocked (even if BLOCKED_KEYWORDS is overridden)
_MANDATORY_BLOCKED = {"DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE", "MERGE"}
_current_blocked = {k.upper() for k in settings.BLOCKED_KEYWORDS}
_missing = _MANDATORY_BLOCKED - _current_blocked
if _missing:
    _cfg_logger.warning("BLOCKED_KEYWORDS missing mandatory entries: %s — adding them", _missing)
    settings.BLOCKED_KEYWORDS.extend(sorted(_missing))

# Constrain JWT algorithm to safe HMAC variants (prevent "none" algorithm attack)
_SAFE_JWT_ALGORITHMS = {"HS256", "HS384", "HS512"}
if settings.JWT_ALGORITHM not in _SAFE_JWT_ALGORITHMS:
    _cfg_logger.critical(
        "JWT_ALGORITHM=%r is not in safe set %s — forcing HS256",
        settings.JWT_ALGORITHM, _SAFE_JWT_ALGORITHMS,
    )
    object.__setattr__(settings, "JWT_ALGORITHM", "HS256")

# Warn when admin JWT secret falls back to user secret (collapses admin/user auth boundary)
if not settings.ADMIN_JWT_SECRET_KEY:
    _cfg_logger.warning(
        "ADMIN_JWT_SECRET_KEY is empty — admin auth uses JWT_SECRET_KEY. "
        "Set a separate secret in .env to isolate admin from user auth."
    )

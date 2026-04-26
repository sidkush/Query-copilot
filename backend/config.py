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
    FALLBACK_MODEL: str = Field(default="claude-sonnet-4-6")
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

    # ── Data Coverage (Phase B — Ring 1) ──
    FEATURE_DATA_COVERAGE: bool = Field(default=True)
    COVERAGE_CACHE_DIR: str = Field(default=".data/coverage_cache")
    COVERAGE_QUERY_TIMEOUT_SECONDS: float = Field(default=5.0)
    COVERAGE_CACHE_TTL_HOURS: int = Field(default=6)
    COVERAGE_MAX_COLUMNS_PER_TABLE: int = Field(default=5)
    COVERAGE_MAX_TABLES_PER_CONNECTION: int = Field(default=30)

    # ── Scope Validator (Phase C — Ring 3) ──
    FEATURE_SCOPE_VALIDATOR: bool = Field(default=True)
    SCOPE_VALIDATOR_FAIL_OPEN: bool = Field(default=True)
    SCOPE_VALIDATOR_REPLAN_BUDGET: int = Field(default=2, ge=1, le=5)
    RULE_RANGE_MISMATCH: bool = Field(default=True)
    RULE_FANOUT_INFLATION: bool = Field(default=True)
    RULE_LIMIT_BEFORE_ORDER: bool = Field(default=True)
    RULE_TIMEZONE_NAIVE: bool = Field(default=True)
    RULE_SOFT_DELETE_MISSING: bool = Field(default=True)
    RULE_NEGATION_AS_JOIN: bool = Field(default=True)
    RULE_DIALECT_FALLTHROUGH: bool = Field(default=True)
    RULE_VIEW_WALKER: bool = Field(default=True)
    RULE_CONJUNCTION_SELECTIVITY: bool = Field(default=False)
    RULE_EXPRESSION_PREDICATE: bool = Field(default=True)

    # ── Intent Echo (Phase D — Ring 4) ──────────────────────────────
    FEATURE_INTENT_ECHO: bool = Field(default=True)
    ECHO_AMBIGUITY_AUTO_PROCEED_MAX: float = Field(default=0.3)
    ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN: float = Field(default=0.7)
    ECHO_AUTO_DOWNGRADE_PAUSE_MS: int = Field(default=500)
    ECHO_AUTO_DOWNGRADE_STREAK: int = Field(default=3)
    ECHO_LLM_MAX_TOKENS: int = Field(default=512)
    NON_INTERACTIVE_MODE_CONSERVATIVE: bool = Field(default=True)
    VOICE_MODE_READBACK_AMBIGUITY_MIN: float = Field(default=0.5)
    FEATURE_SEMANTIC_REGISTRY: bool = Field(default=True)
    SEMANTIC_REGISTRY_DIR: str = Field(default=".data/semantic_registry")
    FEATURE_DRIFT_DETECTOR: bool = Field(default=True)
    FISCAL_YEAR_START_MONTH: int = Field(default=1)
    # ── Provenance + Tier Calibration (Phase E — Ring 5) ──
    FEATURE_PROVENANCE_CHIP: bool = Field(default=True)
    SKEW_GUARD_P99_P50_RATIO: float = Field(default=10.0)
    TIER_PROMOTE_KEYWORDS: str = Field(
        default="exact,last hour,today,fraud rate,incident,live",
        description="Comma-separated NL triggers that force live execution."
    )
    # ── Tenant Fortress (Phase E — Ring 6 / H7) ──
    FEATURE_TENANT_FORTRESS: bool = Field(default=True)
    TENANT_EU_REGIONS: str = Field(default="eu,fr,de,ie,nl,pl,es,it")
    # ── Chaos Isolation (Phase E — H8) ──
    FEATURE_CHAOS_ISOLATION: bool = Field(default=True)
    JITTER_BASE_MS: int = Field(default=50)
    JITTER_MAX_MS: int = Field(default=500)
    SINGLEFLIGHT_WAIT_TIMEOUT_S: float = Field(default=10.0)
    COST_BREAKER_MAX_USD_PER_MINUTE: float = Field(default=1.0)
    SSE_CURSOR_TTL_SECONDS: int = Field(default=300)
    # ── Result Provenance (Phase E — H10) ──
    FEATURE_RESULT_PROVENANCE: bool = Field(default=True)
    TURBO_LIVE_SANITY_SAMPLE_FRACTION: float = Field(default=0.01)
    TURBO_LIVE_DIVERGENCE_WARN_PCT: float = Field(default=10.0)
    # ── Sampling-Aware Correctness (Phase E — H11) ──
    FEATURE_SAMPLING_AWARE: bool = Field(default=True)
    HLL_PRECISION: int = Field(default=14)
    VIZQL_HEX_BIN_THRESHOLD_ROWS: int = Field(default=20_000)

    # ── Correction Pipeline (Phase F — P6 + P10 + H15) ──
    FEATURE_CORRECTION_PIPELINE: bool = Field(default=True)
    PROMOTION_ADMIN_CEREMONY_REQUIRED: bool = Field(default=True)
    PROMOTION_CEREMONY_PER_ADMIN_DAILY_LIMIT: int = Field(default=20)
    PROMOTIONS_PER_TENANT_PER_DAY: int = Field(default=10)
    PROMOTION_GOLDEN_EVAL_THRESHOLD_PCT: float = Field(default=2.0, description="% pass-rate drop that blocks promotion")
    ADVERSARIAL_SIMILARITY_COSINE_THRESHOLD: float = Field(default=0.92, description="cosine >= this among same user -> storm")
    ADVERSARIAL_SIMILARITY_WINDOW_HOURS: int = Field(default=1)
    ADVERSARIAL_SIMILARITY_MAX_UPVOTES: int = Field(default=3, description="> N thumbs-up in window -> block")
    PROMOTION_LEDGER_DIR: str = Field(default=".data/promotion_ledger")

    # ── Retrieval Hygiene (Phase G — P9) ──
    FEATURE_RETRIEVAL_HYGIENE: bool = Field(default=True, description="Master gate for Phase G (bundles + expansion + archival + depends_on).")
    FEATURE_QUERY_EXPANSION: bool = Field(default=True, description="Off -> router calls ChromaDB with raw question.")
    FEATURE_SKILL_BUNDLES: bool = Field(default=True, description="Off -> bundles never fire; fallback to 3-stage router.")
    FEATURE_DEPENDS_ON_RESOLVER: bool = Field(default=True, description="Off -> depends_on closure is a no-op.")
    QUERY_EXPANSION_MAX_TOKENS: int = Field(default=200, description="Hard cap on LLM expansion output (Haiku max_tokens).")
    QUERY_EXPANSION_CACHE_TTL_SECONDS: int = Field(default=3600, description="Per-tenant expansion cache TTL.")
    QUERY_EXPANSION_MODEL: str = Field(default="claude-haiku-4-5-20251001", description="Must match anthropic_provider default Haiku.")
    RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT: float = Field(default=30.0, description="Phase G exit criterion - measured against pinned corpus.")
    SKILL_ARCHIVAL_DORMANCY_DAYS: int = Field(default=30, description="Skill never retrieved in N days -> archival candidate.")
    SKILL_ARCHIVAL_MIN_RETRIEVALS: int = Field(default=1, description="< N retrievals in the dormancy window -> archive.")
    SKILL_ARCHIVAL_ROOT: str = Field(default="askdb-skills/archive", description="Relative to repo root. Moved files preserve subdir.")

    # ── Two-step HMAC binding (S5) ──
    FEATURE_GENERATION_ID_BINDING: bool = Field(default=False, description="S5 — HMAC-bind /generate + /execute pair. Default off until frontend echoes generation_id.")
    # ── Supply Chain + Pipeline (Phase H — H19) ──
    FEATURE_SUPPLY_CHAIN_HARDENING: bool = Field(default=True, description="Off -> skip lock-file + safetensors checks at startup.")
    REQUIREMENTS_LOCK_PATH: str = Field(default="backend/requirements.lock", description="Relative to repo root.")
    SAFETENSORS_ONLY: bool = Field(default=True, description="Reject non-safetensors embedder weight formats.")
    # ── Identity Hardening (Phase H — H20) ──
    FEATURE_IDENTITY_HARDENING: bool = Field(default=True)
    OAUTH_STATE_HMAC_TTL_SECONDS: int = Field(default=600, description="Signed-state expiry; 10 min matches existing flow.")
    STRIPE_WEBHOOK_SECRET: str = Field(default="", description="Stripe-signed webhook shared secret; empty -> verify raises.")
    DISPOSABLE_EMAIL_BLOCKLIST_PATH: str = Field(default="backend/middleware/disposable_emails.txt")
    TRIAL_QUOTA_DAILY_QUERIES: int = Field(default=10, description="Free-tier daily query cap; server-enforced.")
    # ── Infra Resilience (Phase H — H21) ──
    FEATURE_INFRA_RESILIENCE: bool = Field(default=True)
    AGENT_SESSION_DB_PATH: str = Field(default=".data/agent_sessions.db", description="PVC-mount point in k8s.")
    STALE_BACKUP_WARN_DAYS: int = Field(default=30)
    # ── Accessibility (Phase H — H22) ──
    FEATURE_A11Y_MOTION_SETTING: bool = Field(default=True)
    MOTION_SPEED_MS_DEFAULT: int = Field(default=150, description="Frontend reads this via /api/user/settings; 0 = reduced motion.")
    # ── Support + Trial (Phase H — H23) ──
    FEATURE_SUPPORT_IMPERSONATION: bool = Field(default=True)
    SUPPORT_IMPERSONATION_TTL_SECONDS: int = Field(default=900, description="15 min default.")
    # ── Observability Self-Defense (Phase H — H24) ──
    FEATURE_AUDIT_INTEGRITY: bool = Field(default=True)
    AUDIT_SILENCE_WINDOW_SECONDS: int = Field(default=60, description="No audit-log writes in this window during business hours -> MONITORING_SILENT event.")
    # ── Transport + Protocol (Phase H — H25) ──
    FEATURE_TRANSPORT_GUARDS: bool = Field(default=True)
    HTTP2_MAX_RST_PER_MINUTE: int = Field(default=100, description="RST_STREAM frames per HTTP/2 connection cap.")
    # ── Export + A/B + Cancel (Phase H — H26) ──
    FEATURE_EXPORT_SCOPE_VALIDATION: bool = Field(default=True)
    FEATURE_AB_VARIANT_DEDUP: bool = Field(default=True)
    FEATURE_CANCEL_2PC: bool = Field(default=True)
    # ── Auth Version + SSO (Phase H — H27) ──
    FEATURE_AUTH_UNIFIED_MIDDLEWARE: bool = Field(default=False, description="H27 — unified auth middleware. Off by default; per-route Depends(get_current_user) remains. Flip True after full router audit.")
    JWT_LEEWAY_SECONDS: int = Field(default=5)
    NONCE_CACHE_TTL_SECONDS: int = Field(default=300)
    ASKDB_PCI_MODE: bool = Field(default=False, description="Strict mode: no demo user, audit fsync each write, Redis mandatory.")
    ASKDB_HIPAA_MODE: bool = Field(default=False, description="Same as PCI + mandatory TLS + write-time PII masking on.")

    # ── Operations Layer (Phase I — P11 / H16) ──
    FEATURE_ALERT_MANAGER: bool = Field(default=True, description="Master gate. Off -> detectors silent, alert_manager.fire() no-ops with log.")

    # ── Ring 8 Agent Orchestration (Phase K) ──
    FEATURE_AGENT_PLANNER: bool = Field(default=False)
    FEATURE_AGENT_FEEDBACK_LOOP: bool = Field(default=True)
    FEATURE_AGENT_HALLUCINATION_ABORT: bool = Field(default=True)
    FEATURE_AGENT_MODEL_LADDER: bool = Field(default=False)
    AGENT_STEP_CAP: int = Field(default=20)
    AGENT_WALL_CLOCK_TYPICAL_S: float = Field(default=60.0)
    AGENT_WALL_CLOCK_HARD_S: float = Field(default=120.0)
    AGENT_COST_CAP_USD: float = Field(default=0.10)
    MODEL_LADDER_STEP_EXEC: str = Field(default="claude-haiku-4-5-20251001")
    MODEL_LADDER_PLAN_EMIT: str = Field(default="claude-sonnet-4-6")
    MODEL_LADDER_RECOVERY: str = Field(default="claude-opus-4-7-1m-20260115")
    SEMANTIC_REGISTRY_BOOTSTRAP_ON_CONNECT: bool = Field(default=True)
    PLANNER_MAX_CTE_COUNT: int = Field(default=3)
    PLAN_ARTIFACT_EMIT_BEFORE_FIRST_SQL: bool = Field(default=True)
    # ── Phase K Week-1 demo-safe baseline (GROUNDING_W1) ──
    GROUNDING_W1_HARDCAP_ENFORCE: bool = Field(
        default=True,
        description=(
            "Master gate for Week-1 grounding guards: two-tier hard-cap, "
            "consecutive-tool-error consent card, empty-BoundSet banner, "
            "red fallback banner. Off → pre-W1 heuristic + auto-extend to 100."
        ),
    )
    W1_ANALYTICAL_CAP: int = Field(default=20, description="Hard tool-call cap for analytical workloads when W1 flag on. No auto-extend.")
    W1_DASHBOARD_CAP: int = Field(default=40, description="Hard tool-call cap for dashboard workloads when W1 flag on. No auto-extend.")
    W1_CONSECUTIVE_TOOL_ERROR_THRESHOLD: int = Field(default=3, description="N consecutive run_sql errors → fire agent_checkpoint consent card (GAP A).")
    # ── Phase K Week-2 Day 3 Task 1 — Ring 4 Gate C schema-entity-mismatch ──
    W2_SCHEMA_MISMATCH_GATE_ENFORCE: bool = Field(
        default=True,
        description=(
            "Master gate for Ring-4 Gate C schema-entity-mismatch consent card. "
            "When ON: NL referencing rider/user/customer/etc. entity with no "
            "matching id column in the connection schema parks the agent on an "
            "agent_checkpoint with options [station_proxy, abort]. Fail-closed "
            "on empty schema (AMEND-W2-06). OFF → pre-W2 behaviour."
        ),
    )
    W2_GATE_C_PARK_TIMEOUT_S: float = Field(
        default=300.0,
        description=(
            "User-interaction wait budget for Ring-4 Gate C park. The agent's "
            "AGENT_WALL_CLOCK_HARD_S (120s) is a query-execution budget — too "
            "short for a human to read a consent card and click. Park pulls "
            "the user out of the query budget; this is the dedicated cap. "
            "Default-on-timeout still 'abort' (AMEND-W2-08)."
        ),
    )
    # ── Phase K Week-2 Day 3 Task 4 — Ring 3 fan-out DISTINCT-CTE branch ──
    W2_FANOUT_DISTINCT_CTE_ENFORCE: bool = Field(
        default=True,
        description=(
            "W2 Task 4 — extend RULE_FANOUT_INFLATION to flag SELECT DISTINCT "
            "CTEs joined on multiple columns (one of which can be many-to-one). "
            "Off → only the legacy COUNT(*) + JOIN check fires."
        ),
    )
    # ── Phase K Week-2 Day 3 Task 2 — Synthesis token streaming ──
    W2_SYNTHESIS_STREAMING_ENFORCE: bool = Field(
        default=True,
        description=(
            "W2 Task 2 — stream final-synthesis tokens via message_delta SSE. "
            "Off → single result event after full synthesis (blank-screen UX)."
        ),
    )
    W2_MAX_STREAM_BYTES: int = Field(
        default=2_000_000,
        description=(
            "AMEND-W2-14 — per-stream byte cap. On overflow, provider yields "
            "a stream_error event and aborts to prevent OOM from runaway model "
            "+ double-accumulator. 2 MB ≈ 500k tokens of UTF-8 prose."
        ),
    )
    W2_THINKING_TOTAL_BUDGET: int = Field(
        default=8_000,
        description=(
            "AMEND-W2-26 — cumulative extended-thinking-token budget across all "
            "tool-loop iterations of a single query. Per-call budget is "
            "max(1024, total - used); thinking dropped when exhausted."
        ),
    )
    # ── Phase K Week-2 Day 3 Task 3 — Thinking SSE pass-through ──
    W2_THINKING_STREAM_ENFORCE: bool = Field(
        default=True,
        description=(
            "W2 Task 3 — request Anthropic extended thinking and stream "
            "thinking_delta blocks as SSE so the agent's reasoning is visible. "
            "Off → no thinking blocks requested or streamed."
        ),
    )
    W2_THINKING_BUDGET_TOKENS: int = Field(
        default=2_000,
        description=(
            "Per-call thinking budget. Floor 1024 (Anthropic API minimum); "
            "actual budget per turn is min(this, W2_THINKING_TOTAL_BUDGET - used) "
            "and is further clamped per AMEND-W2-27 if max_tokens is small."
        ),
    )
    # ── Audit Ledger + Progressive UX + Plan Cache (Phase L) ──
    FEATURE_AUDIT_LEDGER: bool = Field(default=False)
    FEATURE_CLAIM_PROVENANCE: bool = Field(default=False)
    FEATURE_PROGRESSIVE_UX_FULL: bool = Field(default=False)
    FEATURE_PLAN_CACHE: bool = Field(default=False)
    FEATURE_DEADLINE_PROPAGATION: bool = Field(default=False)
    AUDIT_LEDGER_DIR: str = Field(default=".data/audit_ledger")
    AUDIT_LEDGER_FLUSH_EVERY_N: int = Field(default=1)
    CLAIM_PROVENANCE_UNVERIFIED_MARKER: str = Field(default="[unverified]")
    PLAN_CACHE_COSINE_THRESHOLD: float = Field(default=0.85)
    PLAN_CACHE_TTL_HOURS: int = Field(default=168)
    PLAN_CACHE_MAX_ENTRIES_PER_TENANT: int = Field(default=500)
    RESULT_PREVIEW_LIMIT_ROWS: int = Field(default=50)
    AGENT_CANCEL_GRACE_MS: int = Field(default=2000)
    # ── Phase K Week 2 — Park primitive cutover ──
    PARK_V2_ASK_USER: bool = Field(default=True, description="When True, /respond routes responses through ParkRegistry.resolve via park_id; when False, legacy _user_response_event path is authoritative. Day 2 cutover: 2026-04-24.")
    # ── Dialect Bridge (Phase M-alt) ──
    FEATURE_DIALECT_BRIDGE: bool = Field(default=False)
    DIALECT_BRIDGE_ALERT_ON_FAILURE: bool = Field(default=True)
    ALERT_DEDUP_WINDOW_SECONDS: int = Field(default=300, description="H16 sliding dedup per (tenant_id, rule_id). 5 min.")
    ALERT_MULTI_HOUR_ACCUMULATOR_SECONDS: int = Field(default=3600, description="Fires once per hour even if signal stays hot.")
    ALERT_MAX_RETRY: int = Field(default=3, description="Retry budget per dispatch via chaos_isolation.jittered_backoff.")
    ALERT_DISPATCH_FAIL_BUDGET: int = Field(default=5, description="Failures in 1 h across all rules before ops_alert_dispatch_failure fires.")
    SLACK_WEBHOOK_DEV_URL: str = Field(default="", description="Dev channel for test_alert_fire.py harness.")
    ALERT_FALLBACK_EMAIL_ON_SLACK_FAIL: bool = Field(default=True, description="Fall back to digest._send_email() when Slack exhausted.")
    FEATURE_CACHE_STATS_DASHBOARD: bool = Field(default=True)
    CACHE_STATS_REFRESH_SECONDS: int = Field(default=60, description="Frontend poll interval.")
    RESIDUAL_RISK_TELEMETRY_DIR: str = Field(default=".data/residual_risk", description="JSONL counters per (tenant_id, rule_id).")
    ALERT_TELEMETRY_MISSING_WINDOW_SECONDS: int = Field(default=600, description="No emission in window -> ops_telemetry_source_missing. Business hours only.")
    # ── Residual-risk thresholds (quote-for-quote from master plan lines 266–276) ──
    RESIDUAL_RISK_1_TRAP_FN_RATE_MAX_PCT: float = Field(default=2.0, description="Master row 1: >2%.")
    RESIDUAL_RISK_3_SCHEMA_DRIFT_RATE_MAX_PCT: float = Field(default=1.0, description="Master row 3: >1%.")
    RESIDUAL_RISK_4_LEAP_DAY_PASS_RATE_MIN_PCT: float = Field(default=100.0, description="Master row 4: <100%.")
    RESIDUAL_RISK_5_TOP10_PRECISION_MIN_PCT: float = Field(default=70.0, description="Master row 5: <70%.")
    RESIDUAL_RISK_6_UPVOTE_STORM_MAX_PER_HOUR: int = Field(default=3, description="Master row 6: >3 in 1h from same user. Phase F ships detection; Phase I wires alert.")
    RESIDUAL_RISK_7_CLIENT_RETRIES_MAX_PER_5MIN: int = Field(default=5, description="Master row 7: >5 in 5min.")
    RESIDUAL_RISK_9_DEPRECATED_BYOK_PINNED_MAX: int = Field(default=0, description="Master row 9: >0.")
    RESIDUAL_RISK_10_LOW_TRAFFIC_CACHE_MISS_MAX_PCT: float = Field(default=30.0, description="Master row 10: >30%.")
    # Rows 2 + 8 use 'any divergence' — no threshold field; detectors test non-zero divergence counter.

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
    # Default True because Plan 9a–9e shipped and the `/analytics` route +
    # calc editor + analytics panel are on by default in the frontend
    # (NEW_CHART_EDITOR_ENABLED). Override to False in staging/prod to
    # gate individual launches if needed.
    FEATURE_ANALYST_PRO: bool = True
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

    # ── Forecast (Plan 9c) ────────────────────────────────────
    FORECAST_RATE_LIMIT_PER_60S: int = 10
    FORECAST_MAX_ROWS: int = 10_000
    FORECAST_TIMEOUT_SECONDS: float = 10.0
    FORECAST_MAX_HORIZON: int = 200

    # Cluster (Plan 9d)
    CLUSTER_RATE_LIMIT_PER_60S: int = 10
    CLUSTER_MAX_ROWS: int = 50_000
    CLUSTER_TIMEOUT_SECONDS: float = 8.0
    CLUSTER_K_MAX_HARD_CAP: int = 25

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

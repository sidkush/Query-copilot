"""
QueryCopilot Configuration
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
    BLOCKED_KEYWORDS: list = Field(
        default=["DROP", "DELETE", "UPDATE", "INSERT", "ALTER",
                 "TRUNCATE", "GRANT", "REVOKE", "CREATE", "EXEC",
                 "EXECUTE", "pg_sleep", "LOAD_FILE", "INTO OUTFILE",
                 "INTO DUMPFILE", "BENCHMARK"]
    )

    # ── JWT Auth ──────────────────────────────────────────────────
    JWT_SECRET_KEY: str = Field(default="change-me-in-production-use-a-long-random-string")
    JWT_ALGORITHM: str = Field(default="HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=1440)  # 24 hours

    # ── OAuth ─────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: Optional[str] = Field(default=None)
    GOOGLE_CLIENT_SECRET: Optional[str] = Field(default=None)
    GITHUB_CLIENT_ID: Optional[str] = Field(default=None)
    GITHUB_CLIENT_SECRET: Optional[str] = Field(default=None)
    OAUTH_REDIRECT_URI: str = Field(default="http://localhost:5173/auth/callback")

    # ── Email Delivery (OTP) ────────────────────────────────────
    # Option 1: Resend (recommended — free 100 emails/day, no domain setup)
    RESEND_API_KEY: str = Field(default="")
    RESEND_FROM_EMAIL: str = Field(default="QueryCopilot <onboarding@resend.dev>")
    # Option 2: SMTP (Gmail App Password, SendGrid, Brevo, etc.)
    SMTP_HOST: str = Field(default="smtp.gmail.com")
    SMTP_PORT: int = Field(default=587)
    SMTP_USER: str = Field(default="")
    SMTP_PASSWORD: str = Field(default="")
    SMTP_FROM_EMAIL: str = Field(default="")
    SMTP_FROM_NAME: str = Field(default="QueryCopilot")
    OTP_EXPIRY_SECONDS: int = Field(default=600)  # 10 minutes

    # ── SMS Delivery (Phone OTP via Twilio) ───────────────────
    TWILIO_ACCOUNT_SID: str = Field(default="")
    TWILIO_AUTH_TOKEN: str = Field(default="")
    TWILIO_FROM_NUMBER: str = Field(default="")  # Your Twilio phone number
    TWILIO_MESSAGING_SERVICE_SID: str = Field(default="")  # Optional: better deliverability

    # ── Alert Manager (Phase I) ───────────────────────────────────
    FEATURE_ALERT_MANAGER: bool = Field(default=True)
    ALERT_DEDUP_WINDOW_SECONDS: int = Field(default=300)
    ALERT_MULTI_HOUR_ACCUMULATOR_SECONDS: int = Field(default=3600)
    ALERT_MAX_RETRY: int = Field(default=3)

    # ── Residual Risk Thresholds (Phase I) ────────────────────────
    RESIDUAL_RISK_6_UPVOTE_STORM_MAX_PER_HOUR: int = Field(default=3)

    # ── App ───────────────────────────────────────────────────────
    APP_TITLE: str = Field(default="QueryCopilot")
    FRONTEND_URL: str = Field(default="http://localhost:5173")

    # ── ChromaDB ──────────────────────────────────────────────────
    CHROMA_PERSIST_DIR: str = Field(default=".chroma/querycopilot")

    # ── Caching ───────────────────────────────────────────────────
    CACHE_ENABLED: bool = Field(default=True)
    CACHE_TTL_SECONDS: int = Field(default=3600)

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

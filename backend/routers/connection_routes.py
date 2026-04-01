"""Database connection routes — dynamic connection from user-provided credentials."""

import os
import re
import uuid
import socket
import logging
from pathlib import Path
from urllib.parse import quote_plus
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator, field_validator
from typing import Optional
from auth import get_current_user
from config import DBType
from db_connector import DatabaseConnector
from query_engine import QueryEngine
from models import ConnectionEntry
from user_storage import (
    save_connection_config, load_connection_configs, delete_connection_config,
    decrypt_password,
)

_MAX_FIELD_LENGTH = 500


def _safe_error(e: Exception) -> str:
    """Return a user-safe error message without leaking internal details."""
    msg = str(e)
    lower = msg.lower()
    # Specific errors with helpful messages
    if "could not translate host name" in lower:
        if "supabase" in lower:
            return (
                "Cannot resolve Supabase database host. Supabase direct connections require IPv6. "
                "Please enable the IPv4 add-on in your Supabase dashboard (Project Settings > Database > IPv4 Add-on), "
                "or use the connection pooler hostname from your Supabase dashboard."
            )
        return "Could not resolve database host. Please check the hostname."
    if "tenant or user not found" in lower:
        return (
            "Supabase project not reachable — it may be paused (free-tier projects auto-pause "
            "after 7 days of inactivity). Please go to your Supabase dashboard at supabase.com, "
            "open your project, and click 'Restore' to unpause it. Then try connecting again."
        )
    if "network is unreachable" in lower:
        return "Network is unreachable. The database server may require IPv6 connectivity."
    if "password authentication failed" in lower:
        return "Authentication failed. Please check your username and password."
    if "connection refused" in lower:
        return "Connection refused. Please check the host and port are correct."
    if "timeout" in lower or "timed out" in lower:
        return "Connection timed out. Please check network connectivity and firewall settings."
    if "driver not installed" in lower or "pip install" in lower:
        return msg  # Show the helpful "pip install X" message
    # Pass through ValueError messages from our own code (e.g. Supabase pooler not found)
    if isinstance(e, ValueError):
        return msg if len(msg) <= 300 else msg[:300]
    # Generic fallback for library errors
    for prefix in [
        "(psycopg2.", "(pymysql.", "(sqlalchemy.", "(google.",
        "(pymssql.", "(oracledb.", "(clickhouse_driver.", "(trino.",
        "(hdbcli.", "(ibm_db.",
    ]:
        if prefix in msg:
            return "Database connection failed. Please check your credentials and try again."
    if len(msg) > 200:
        return msg[:200]
    return msg

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/connections", tags=["connections"])


def get_user_connections(email: str) -> dict:
    """Get user-scoped connections dict from app.state."""
    from main import app
    return app.state.connections.setdefault(email, {})


class ConnectRequest(BaseModel):
    db_type: str
    # Common fields
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None
    schema_name: Optional[str] = "public"
    # Snowflake specific
    account: Optional[str] = None
    warehouse: Optional[str] = None
    # BigQuery specific
    project: Optional[str] = None
    dataset: Optional[str] = None
    credentials_path: Optional[str] = None
    # SQLite / DuckDB
    path: Optional[str] = None
    # Oracle specific
    service_name: Optional[str] = None
    # Databricks specific
    token: Optional[str] = None
    http_path: Optional[str] = None
    catalog: Optional[str] = None
    # Trino specific
    catalog_name: Optional[str] = None
    # General
    ssl_mode: Optional[str] = None
    # Save & label
    save: bool = False
    label: Optional[str] = None

    @model_validator(mode="after")
    def _strip_and_validate(self):
        for field_name in self.model_fields:
            val = getattr(self, field_name, None)
            if isinstance(val, str):
                val = val.strip()
                # Enforce max length on all string fields (except credentials_path, path)
                if field_name not in ("credentials_path", "path") and len(val) > _MAX_FIELD_LENGTH:
                    raise ValueError(f"{field_name} exceeds maximum length of {_MAX_FIELD_LENGTH}")
                object.__setattr__(self, field_name, val)

        # Validate credentials_path — block path traversal
        if self.credentials_path:
            cred_path = self.credentials_path
            if ".." in cred_path:
                raise ValueError("credentials_path must not contain '..'")
            resolved = str(Path(cred_path).resolve())
            if not resolved.endswith(".json"):
                raise ValueError("credentials_path must point to a .json file")
            if not os.path.isfile(resolved):
                raise ValueError(f"credentials_path does not exist: {cred_path}")
        return self


def _encode_creds(user: str, password: str) -> tuple:
    """URL-encode username and password for safe inclusion in a connection URI."""
    return quote_plus(user or ""), quote_plus(password or "")


# ── Supabase pooler auto-detection ────────────────────────────
_SUPABASE_HOST_RE = re.compile(r"^db\.([a-z]+)\.supabase\.co$")
_SUPABASE_POOLER_REGIONS = [
    "us-east-1", "us-west-1", "us-west-2",
    "eu-west-1", "eu-west-2", "eu-central-1",
    "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
    "sa-east-1", "ca-central-1",
]

# Supabase uses multiple pooler prefixes (aws-0, aws-1, etc.)
_SUPABASE_POOLER_PREFIXES = ["aws-0", "aws-1"]


def _resolve_supabase_pooler(project_ref: str, user: str, password: str) -> Optional[str]:
    """Try to find the working Supabase connection pooler for a project.

    Tries all prefix + region combinations, then verifies the tenant exists
    by attempting a real connection. Returns the pooler hostname if found.
    """
    import psycopg2

    # Collect resolvable pooler hostnames
    candidates = []
    for prefix in _SUPABASE_POOLER_PREFIXES:
        for region in _SUPABASE_POOLER_REGIONS:
            pooler = f"{prefix}-{region}.pooler.supabase.com"
            try:
                socket.getaddrinfo(pooler, 6543, socket.AF_INET)
                candidates.append(pooler)
            except socket.gaierror:
                continue

    # Try connecting to each candidate to find the right one
    pooler_user = f"{user}.{project_ref}"
    for pooler in candidates:
        try:
            conn = psycopg2.connect(
                host=pooler, port=6543, dbname="postgres",
                user=pooler_user, password=password,
                connect_timeout=5,
            )
            conn.close()
            logger.info(f"Supabase pooler found: {pooler}")
            return pooler
        except Exception as e:
            err = str(e).lower()
            if "tenant or user not found" in err:
                continue  # Wrong region/prefix, try next
            if "password authentication failed" in err:
                return pooler  # Right pooler, wrong password — still return it
            continue

    return None


def _build_supabase_uri(user: str, password: str, project_ref: str,
                        database: str, host: str, port: int) -> str:
    """Build a PostgreSQL URI, auto-switching to Supabase pooler if the direct
    host is IPv6-only and the machine has no IPv6 connectivity."""
    u, p = _encode_creds(user, password)

    # First check if direct host is reachable via IPv4
    try:
        socket.getaddrinfo(host, port, socket.AF_INET)
        # Direct host has IPv4 — use it as-is
        return f"postgresql+psycopg2://{u}:{p}@{host}:{port}/{database}"
    except socket.gaierror:
        pass

    # Direct host is IPv6-only; try the connection pooler
    pooler_host = _resolve_supabase_pooler(project_ref, user, password)
    if not pooler_host:
        raise ValueError(
            f"Cannot connect to Supabase project '{project_ref}'. "
            f"The direct host ({host}) requires IPv6 which is not available on this machine, "
            f"and the connection pooler could not be found. "
            f"Please go to your Supabase dashboard → Settings → Database and copy "
            f"the 'Connection Pooler' hostname, then use that as the Host instead."
        )

    # Pooler requires user format: {db_user}.{project_ref}
    pooler_user = quote_plus(f"{user}.{project_ref}")
    logger.info(f"Supabase: direct host is IPv6-only, using pooler {pooler_host}:6543")
    return f"postgresql+psycopg2://{pooler_user}:{p}@{pooler_host}:6543/{database}"


def _build_uri(req) -> str:
    """Build a connection URI from a ConnectRequest."""
    dt = req.db_type
    u, p = _encode_creds(req.user, req.password)

    # ── Relational ────────────────────────────────────────────
    if dt == "postgresql":
        host = req.host or ""
        match = _SUPABASE_HOST_RE.match(host)
        if match:
            return _build_supabase_uri(
                req.user, req.password, match.group(1),
                req.database, host, req.port or 5432,
            )
        return f"postgresql+psycopg2://{u}:{p}@{host}:{req.port or 5432}/{req.database}"
    elif dt == "mysql":
        return f"mysql+pymysql://{u}:{p}@{req.host}:{req.port or 3306}/{req.database}"
    elif dt == "mariadb":
        return f"mariadb+pymysql://{u}:{p}@{req.host}:{req.port or 3306}/{req.database}"
    elif dt == "sqlite":
        path = req.path or ":memory:"
        return f"sqlite:///{path}" if path != ":memory:" else "sqlite:///:memory:"
    elif dt == "mssql":
        return f"mssql+pymssql://{u}:{p}@{req.host}:{req.port or 1433}/{req.database}"
    elif dt == "cockroachdb":
        ssl = f"?sslmode={req.ssl_mode}" if req.ssl_mode else "?sslmode=require"
        return f"cockroachdb://{u}:{p}@{req.host}:{req.port or 26257}/{req.database}{ssl}"

    # ── Cloud Data Warehouses ─────────────────────────────────
    elif dt == "snowflake":
        return (
            f"snowflake://{u}:{p}@{req.account}/{req.database}"
            f"/{req.schema_name}?warehouse={req.warehouse}"
        )
    elif dt == "bigquery":
        return f"bigquery://{req.project}/{req.dataset}"
    elif dt == "redshift":
        return (
            f"redshift+redshift_connector://{u}:{p}"
            f"@{req.host}:{req.port or 5439}/{req.database}"
        )
    elif dt == "databricks":
        return (
            f"databricks://token:{quote_plus(req.token or '')}@{req.host}"
            f"?http_path={req.http_path}&catalog={req.catalog}&schema={req.schema_name}"
        )

    # ── Analytics Engines ─────────────────────────────────────
    elif dt == "clickhouse":
        return f"clickhouse+http://{u}:{p}@{req.host}:{req.port or 8123}/{req.database}"
    elif dt == "duckdb":
        path = req.path or ":memory:"
        return f"duckdb:///{path}" if path != ":memory:" else "duckdb:///:memory:"
    elif dt == "trino":
        return f"trino://{u}@{req.host}:{req.port or 8080}/{req.catalog_name}/{req.schema_name}"

    # ── Enterprise ────────────────────────────────────────────
    elif dt == "oracle":
        return f"oracle+oracledb://{u}:{p}@{req.host}:{req.port or 1521}/{req.service_name}"
    elif dt == "sap_hana":
        return f"hana+hdbcli://{u}:{p}@{req.host}:{req.port or 30015}"
    elif dt == "ibm_db2":
        return f"db2+ibm_db://{u}:{p}@{req.host}:{req.port or 50000}/{req.database}"

    raise ValueError(f"Unsupported db_type: {dt}")


def _build_uri_from_config(cfg: dict) -> str:
    """Build a connection URI from a saved config dict (with decrypted password)."""
    dt = cfg.get("db_type") or ""
    u, p = _encode_creds(cfg.get("user") or "", cfg.get("password") or "")
    host = cfg.get("host") or ""
    port = cfg.get("port")
    database = cfg.get("database") or ""
    schema_name = cfg.get("schema_name") or "public"
    account = cfg.get("account") or ""
    warehouse = cfg.get("warehouse") or ""
    project = cfg.get("project") or ""
    dataset = cfg.get("dataset") or ""
    path = cfg.get("path") or ""
    service_name = cfg.get("service_name") or ""
    token = quote_plus(cfg.get("token") or "")
    http_path = cfg.get("http_path") or ""
    catalog = cfg.get("catalog") or ""
    catalog_name = cfg.get("catalog_name") or ""
    ssl_mode = cfg.get("ssl_mode") or ""

    # ── Relational ────────────────────────────────────────────
    if dt == "postgresql":
        match = _SUPABASE_HOST_RE.match(host)
        if match:
            return _build_supabase_uri(
                cfg.get("user", ""), cfg.get("password", ""), match.group(1),
                database, host, port or 5432,
            )
        return f"postgresql+psycopg2://{u}:{p}@{host}:{port or 5432}/{database}"
    elif dt == "mysql":
        return f"mysql+pymysql://{u}:{p}@{host}:{port or 3306}/{database}"
    elif dt == "mariadb":
        return f"mariadb+pymysql://{u}:{p}@{host}:{port or 3306}/{database}"
    elif dt == "sqlite":
        path = path or ":memory:"
        return f"sqlite:///{path}" if path != ":memory:" else "sqlite:///:memory:"
    elif dt == "mssql":
        return f"mssql+pymssql://{u}:{p}@{host}:{port or 1433}/{database}"
    elif dt == "cockroachdb":
        ssl = f"?sslmode={ssl_mode}" if ssl_mode else "?sslmode=require"
        return f"cockroachdb://{u}:{p}@{host}:{port or 26257}/{database}{ssl}"

    # ── Cloud Data Warehouses ─────────────────────────────────
    elif dt == "snowflake":
        return (
            f"snowflake://{u}:{p}@{account}/{database}"
            f"/{schema_name}?warehouse={warehouse}"
        )
    elif dt == "bigquery":
        return f"bigquery://{project}/{dataset}"
    elif dt == "redshift":
        return f"redshift+redshift_connector://{u}:{p}@{host}:{port or 5439}/{database}"
    elif dt == "databricks":
        return (
            f"databricks://token:{token}@{host}"
            f"?http_path={http_path}&catalog={catalog}&schema={schema_name}"
        )

    # ── Analytics Engines ─────────────────────────────────────
    elif dt == "clickhouse":
        return f"clickhouse+http://{u}:{p}@{host}:{port or 8123}/{database}"
    elif dt == "duckdb":
        path = path or ":memory:"
        return f"duckdb:///{path}" if path != ":memory:" else "duckdb:///:memory:"
    elif dt == "trino":
        return f"trino://{u}@{host}:{port or 8080}/{catalog_name}/{schema_name}"

    # ── Enterprise ────────────────────────────────────────────
    elif dt == "oracle":
        return f"oracle+oracledb://{u}:{p}@{host}:{port or 1521}/{service_name}"
    elif dt == "sap_hana":
        return f"hana+hdbcli://{u}:{p}@{host}:{port or 30015}"
    elif dt == "ibm_db2":
        return f"db2+ibm_db://{u}:{p}@{host}:{port or 50000}/{database}"

    raise ValueError(f"Unsupported db_type: {dt}")


# ── DB types that use schema parameter for introspection ───────
_SCHEMA_DB_TYPES = {
    "postgresql", "snowflake", "redshift", "cockroachdb",
    "mssql", "oracle", "sap_hana", "ibm_db2", "trino",
}


@router.post("/test")
def test_connection(req: ConnectRequest, user: dict = Depends(get_current_user)):
    """Test a database connection without persisting it."""
    try:
        db_type = DBType(req.db_type)
        uri = _build_uri(req)
        connector = DatabaseConnector(
            db_type=db_type,
            connection_uri=uri,
            credentials_path=req.credentials_path,
        )
        connector.connect()
        ok = connector.test_connection()
        connector.disconnect()
        return {"status": "ok" if ok else "failed"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=_safe_error(e))


@router.post("/connect")
def connect_database(req: ConnectRequest, user: dict = Depends(get_current_user)):
    """Connect to a database, introspect schema, and train the query engine."""
    try:
        db_type = DBType(req.db_type)
        uri = _build_uri(req)
        connector = DatabaseConnector(
            db_type=db_type,
            connection_uri=uri,
            credentials_path=req.credentials_path,
        )
        connector.connect()

        email = user["email"]
        user_conns = get_user_connections(email)

        # Generate a unique connection id
        conn_id = uuid.uuid4().hex[:8]

        # Initialize and train the query engine with namespaced collections
        engine = QueryEngine(connector, namespace=conn_id)
        table_count = engine.train_schema()

        # Determine database name for display
        database_name = (
            req.database or req.project or req.account
            or req.catalog or req.path or "unknown"
        )

        # Store as a ConnectionEntry
        entry = ConnectionEntry(
            conn_id=conn_id,
            connector=connector,
            engine=engine,
            db_type=req.db_type,
            database_name=database_name,
        )
        user_conns[conn_id] = entry

        # Auto-save config if requested
        saved_config_id = None
        if req.save:
            config_dict = {
                k: v for k, v in {
                    "db_type": req.db_type,
                    "host": req.host,
                    "port": req.port,
                    "database": req.database,
                    "user": req.user,
                    "password": req.password,
                    "schema_name": req.schema_name,
                    "account": req.account,
                    "warehouse": req.warehouse,
                    "project": req.project,
                    "dataset": req.dataset,
                    "credentials_path": req.credentials_path,
                    "path": req.path,
                    "service_name": req.service_name,
                    "token": req.token,
                    "http_path": req.http_path,
                    "catalog": req.catalog,
                    "catalog_name": req.catalog_name,
                    "ssl_mode": req.ssl_mode,
                    "label": req.label,
                }.items() if v is not None
            }
            saved = save_connection_config(email, config_dict)
            saved_config_id = saved["id"]

        # Get schema info for the response
        schema_param = req.schema_name if req.db_type in _SCHEMA_DB_TYPES else None
        schema_info = connector.get_schema_info(schema_param)
        tables = []
        for table_name, info in schema_info.items():
            tables.append({
                "name": table_name,
                "columns": info["columns"],
                "primary_key": info["primary_key"],
                "foreign_keys": info["foreign_keys"],
                "column_count": len(info["columns"]),
            })

        result = {
            "status": "connected",
            "conn_id": conn_id,
            "db_type": req.db_type,
            "database_name": database_name,
            "tables_found": table_count,
            "tables": tables,
        }
        if saved_config_id:
            result["saved_config_id"] = saved_config_id
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=_safe_error(e))


@router.get("/list")
def list_connections(user: dict = Depends(get_current_user)):
    """Return all active connections for the current user."""
    email = user["email"]
    user_conns = get_user_connections(email)
    result = []
    for conn_id, entry in user_conns.items():
        result.append({
            "conn_id": entry.conn_id,
            "db_type": entry.db_type,
            "database_name": entry.database_name,
            "connected_at": entry.connected_at.isoformat(),
        })
    return {"connections": result}


@router.post("/disconnect/{conn_id}")
def disconnect_database(conn_id: str, user: dict = Depends(get_current_user)):
    """Disconnect and remove a specific connection."""
    email = user["email"]
    user_conns = get_user_connections(email)
    entry = user_conns.pop(conn_id, None)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    try:
        entry.connector.disconnect()
    except Exception:
        pass
    return {"status": "disconnected", "conn_id": conn_id}


# ── Saved connection configs ─────────────────────────────────────

@router.get("/saved")
def list_saved_configs(user: dict = Depends(get_current_user)):
    """List saved connection configs for the current user. Passwords are masked."""
    email = user["email"]
    configs = load_connection_configs(email)
    # Mask passwords and tokens
    for cfg in configs:
        if cfg.get("password"):
            cfg["password"] = "\u2022\u2022\u2022\u2022\u2022\u2022"
        if cfg.get("token"):
            cfg["token"] = "\u2022\u2022\u2022\u2022\u2022\u2022"
    return {"configs": configs}


class SaveConfigRequest(BaseModel):
    db_type: str
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None
    schema_name: Optional[str] = "public"
    account: Optional[str] = None
    warehouse: Optional[str] = None
    project: Optional[str] = None
    dataset: Optional[str] = None
    credentials_path: Optional[str] = None
    path: Optional[str] = None
    service_name: Optional[str] = None
    token: Optional[str] = None
    http_path: Optional[str] = None
    catalog: Optional[str] = None
    catalog_name: Optional[str] = None
    ssl_mode: Optional[str] = None
    label: Optional[str] = None


@router.post("/save")
def save_config(body: SaveConfigRequest, user: dict = Depends(get_current_user)):
    """Save a connection config (encrypts password before storing)."""
    email = user["email"]
    config_dict = body.model_dump(exclude_none=True)
    saved = save_connection_config(email, config_dict)
    # Mask password in response
    if saved.get("password"):
        saved["password"] = "\u2022\u2022\u2022\u2022\u2022\u2022"
    if saved.get("token"):
        saved["token"] = "\u2022\u2022\u2022\u2022\u2022\u2022"
    return saved


@router.delete("/saved/{config_id}")
def delete_saved_config(config_id: str, user: dict = Depends(get_current_user)):
    """Delete a saved connection config."""
    email = user["email"]
    configs = load_connection_configs(email)
    if not any(c.get("id") == config_id for c in configs):
        raise HTTPException(status_code=404, detail=f"Saved config '{config_id}' not found")
    delete_connection_config(email, config_id)
    return {"status": "deleted", "config_id": config_id}


@router.post("/reconnect/{config_id}")
def reconnect_from_saved(config_id: str, user: dict = Depends(get_current_user)):
    """Load a saved config, decrypt password, and create a live connection."""
    email = user["email"]
    configs = load_connection_configs(email)
    cfg = next((c for c in configs if c.get("id") == config_id), None)
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"Saved config '{config_id}' not found")

    try:
        # Decrypt password
        working_cfg = dict(cfg)
        if working_cfg.get("password"):
            working_cfg["password"] = decrypt_password(working_cfg["password"])
        if working_cfg.get("token"):
            working_cfg["token"] = decrypt_password(working_cfg["token"])

        db_type = DBType(working_cfg["db_type"])
        uri = _build_uri_from_config(working_cfg)
        connector = DatabaseConnector(
            db_type=db_type,
            connection_uri=uri,
            credentials_path=working_cfg.get("credentials_path"),
        )
        connector.connect()

        user_conns = get_user_connections(email)
        conn_id = uuid.uuid4().hex[:8]

        engine = QueryEngine(connector, namespace=conn_id)
        table_count = engine.train_schema()

        database_name = (
            working_cfg.get("database") or working_cfg.get("project")
            or working_cfg.get("account") or working_cfg.get("catalog")
            or working_cfg.get("path") or "unknown"
        )

        entry = ConnectionEntry(
            conn_id=conn_id,
            connector=connector,
            engine=engine,
            db_type=working_cfg["db_type"],
            database_name=database_name,
        )
        user_conns[conn_id] = entry

        schema_param = (
            working_cfg.get("schema_name")
            if working_cfg.get("db_type") in _SCHEMA_DB_TYPES
            else None
        )
        schema_info = connector.get_schema_info(schema_param)
        tables = []
        for table_name, info in schema_info.items():
            tables.append({
                "name": table_name,
                "columns": info["columns"],
                "primary_key": info["primary_key"],
                "foreign_keys": info["foreign_keys"],
                "column_count": len(info["columns"]),
            })

        return {
            "status": "connected",
            "conn_id": conn_id,
            "db_type": working_cfg["db_type"],
            "database_name": database_name,
            "tables_found": table_count,
            "tables": tables,
            "from_saved_config": config_id,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=_safe_error(e))

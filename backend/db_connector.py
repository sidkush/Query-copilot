"""
Database Connector — Multi-database connection manager.
Supports 16 database engines via SQLAlchemy.
All connections are READ-ONLY enforced at both driver and query level.
"""

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.pool import QueuePool, StaticPool
from typing import Optional, Dict, List, Any
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from urllib.parse import quote_plus
import logging

from config import settings, DBType

logger = logging.getLogger(__name__)

# ── Driver availability check ──────────────────────────────────

_DRIVER_PACKAGES = {
    DBType.POSTGRESQL: ("psycopg2", "psycopg2-binary"),
    DBType.MYSQL: ("pymysql", "PyMySQL"),
    DBType.MARIADB: ("pymysql", "PyMySQL"),
    DBType.BIGQUERY: ("google.cloud.bigquery", "google-cloud-bigquery[sqlalchemy]"),
    DBType.SNOWFLAKE: ("snowflake.sqlalchemy", "snowflake-sqlalchemy"),
    DBType.MSSQL: ("pymssql", "pymssql"),
    DBType.REDSHIFT: ("redshift_connector", "redshift-connector sqlalchemy-redshift"),
    DBType.DUCKDB: ("duckdb", "duckdb duckdb-engine"),
    DBType.ORACLE: ("oracledb", "oracledb"),
    DBType.CLICKHOUSE: ("clickhouse_sqlalchemy", "clickhouse-sqlalchemy clickhouse-driver"),
    DBType.COCKROACHDB: ("psycopg2", "psycopg2-binary sqlalchemy-cockroachdb"),
    DBType.DATABRICKS: ("databricks", "databricks-sql-connector databricks-sqlalchemy"),
    DBType.TRINO: ("trino", "trino[sqlalchemy]"),
    DBType.SAP_HANA: ("hdbcli", "hdbcli sqlalchemy-hana"),
    DBType.IBM_DB2: ("ibm_db_sa", "ibm-db-sa ibm_db"),
    # SQLite and DuckDB use built-in Python drivers — no check needed
    DBType.SQLITE: (None, None),
}


def _check_driver(db_type: DBType) -> None:
    """Raise a clear error if the required driver package is not installed."""
    entry = _DRIVER_PACKAGES.get(db_type)
    if not entry or entry[0] is None:
        return  # Built-in or no check needed
    module_name, pip_packages = entry
    try:
        __import__(module_name)
    except ImportError:
        raise ImportError(
            f"Driver not installed for {db_type.value}. "
            f"Please install: pip install {pip_packages}"
        )


# ── Databases that use schema parameter in introspection ───────

_SCHEMA_DBS = {
    DBType.POSTGRESQL, DBType.SNOWFLAKE, DBType.REDSHIFT,
    DBType.COCKROACHDB, DBType.MSSQL, DBType.ORACLE,
    DBType.SAP_HANA, DBType.IBM_DB2, DBType.TRINO,
}

# ── Big data / warehouse engines (need chunked fetch + smart prompting)
BIG_DATA_ENGINES = {
    DBType.BIGQUERY, DBType.SNOWFLAKE, DBType.REDSHIFT,
    DBType.DATABRICKS, DBType.CLICKHOUSE, DBType.TRINO,
}

_CHUNK_SIZE = 500  # rows per fetchmany() call for big data engines


class DatabaseConnector:
    def __init__(
        self,
        db_type: Optional[DBType] = None,
        connection_uri: Optional[str] = None,
        credentials_path: Optional[str] = None,
        **kwargs
    ):
        self.db_type = db_type or settings.DB_TYPE
        self._connection_uri = connection_uri
        self._credentials_path = credentials_path
        self._engine = None
        self._kwargs = kwargs

    def _build_uri(self) -> str:
        if self._connection_uri:
            return self._connection_uri

        u = quote_plus(settings.DB_USER or "")
        p = quote_plus(settings.DB_PASSWORD or "")

        if self.db_type == DBType.POSTGRESQL:
            return (
                f"postgresql+psycopg2://{u}:{p}"
                f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
            )
        elif self.db_type == DBType.MYSQL:
            return (
                f"mysql+pymysql://{u}:{p}"
                f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
            )
        elif self.db_type == DBType.BIGQUERY:
            return f"bigquery://{settings.BQ_PROJECT}/{settings.BQ_DATASET}"
        elif self.db_type == DBType.SNOWFLAKE:
            return (
                f"snowflake://{u}:{p}"
                f"@{settings.SF_ACCOUNT}/{settings.SF_DATABASE}"
                f"/{settings.SF_SCHEMA}?warehouse={settings.SF_WAREHOUSE}"
            )
        elif self.db_type == DBType.SQLITE:
            return "sqlite:///:memory:"
        elif self.db_type == DBType.DUCKDB:
            return "duckdb:///:memory:"
        raise ValueError(f"Unsupported database type: {self.db_type}")

    def connect(self) -> None:
        _check_driver(self.db_type)
        uri = self._build_uri()
        connect_args = {}
        engine_kwargs = dict(self._kwargs)

        # ── Per-dialect connect_args & engine settings ─────────
        if self.db_type == DBType.POSTGRESQL:
            connect_args = {
                "options": f"-c statement_timeout={settings.QUERY_TIMEOUT_SECONDS * 1000}"
            }
        elif self.db_type in (DBType.MYSQL, DBType.MARIADB):
            connect_args = {
                "read_timeout": settings.QUERY_TIMEOUT_SECONDS,
                "write_timeout": settings.QUERY_TIMEOUT_SECONDS,
            }
        elif self.db_type == DBType.BIGQUERY:
            creds_path = self._credentials_path or settings.BQ_CREDENTIALS_PATH
            if creds_path:
                engine_kwargs["credentials_path"] = creds_path
        elif self.db_type == DBType.MSSQL:
            connect_args = {
                "login_timeout": settings.QUERY_TIMEOUT_SECONDS,
                "timeout": settings.QUERY_TIMEOUT_SECONDS,
            }
        elif self.db_type in (DBType.REDSHIFT, DBType.COCKROACHDB):
            connect_args = {
                "options": f"-c statement_timeout={settings.QUERY_TIMEOUT_SECONDS * 1000}"
            }
        elif self.db_type == DBType.CLICKHOUSE:
            connect_args = {
                "send_receive_timeout": settings.QUERY_TIMEOUT_SECONDS,
            }

        # ── Pool configuration ────────────────────────────────
        if self.db_type in (DBType.SQLITE, DBType.DUCKDB):
            # In-process engines use StaticPool (single connection)
            self._engine = create_engine(
                uri,
                poolclass=StaticPool,
                connect_args=connect_args,
                **engine_kwargs
            )
        else:
            self._engine = create_engine(
                uri,
                poolclass=QueuePool,
                pool_size=5,
                max_overflow=10,
                pool_timeout=30,
                pool_recycle=3600,
                connect_args=connect_args,
                **engine_kwargs
            )

        # ── Validate connection ───────────────────────────────
        with self._engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            logger.info(f"Connected to {self.db_type.value} database successfully")

    def is_big_data_engine(self) -> bool:
        """Return True if connected to a warehouse / big-data engine."""
        return self.db_type in BIG_DATA_ENGINES

    def execute_query(self, sql: str, timeout: Optional[int] = None):
        import pandas as pd  # Lazy import: avoids native DLL conflict with ChromaDB on Windows
        if not self._engine:
            raise RuntimeError("Not connected. Call connect() first.")

        effective_timeout = timeout or settings.QUERY_TIMEOUT_SECONDS

        def _run():
            with self._engine.connect() as conn:
                # ── Per-dialect read-only enforcement ──────────
                if self.db_type in (
                    DBType.POSTGRESQL, DBType.REDSHIFT, DBType.COCKROACHDB
                ):
                    conn.execute(
                        text("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
                    )
                # SQLite and DuckDB: read-only enforced via SQL validator only
                elif self.db_type == DBType.CLICKHOUSE:
                    conn.execute(text("SET readonly = 1"))

                result = conn.execute(text(sql))
                columns = list(result.keys())

                # ── Chunked fetch for big data engines ────────
                if self.is_big_data_engine():
                    rows = []
                    max_rows = settings.MAX_ROWS
                    while len(rows) < max_rows:
                        chunk = result.fetchmany(_CHUNK_SIZE)
                        if not chunk:
                            break
                        rows.extend(chunk)
                    # Cap to max rows (defense-in-depth alongside SQL LIMIT)
                    rows = rows[:max_rows]
                else:
                    rows = result.fetchall()

                return pd.DataFrame(rows, columns=columns)

        try:
            # ── Python-level timeout wrapper ──────────────
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_run)
                try:
                    df = future.result(timeout=effective_timeout)
                except FuturesTimeout:
                    raise RuntimeError(
                        f"Query timed out after {effective_timeout}s. "
                        "Try adding filters or reducing the date range."
                    )
            logger.info(f"Query executed: {len(df)} rows returned")
            return df
        except RuntimeError:
            raise
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            raise RuntimeError(f"Query failed: {str(e)}")

    def execute_query_arrow(self, sql: str, timeout: int = 3600):
        """Execute query and return Arrow Table using native database Arrow exports.

        BigQuery: uses google.cloud.bigquery Client.query().to_arrow() (Storage Read API)
        Others: chunked fetch via SQLAlchemy → Arrow
        """
        import pyarrow as pa
        from concurrent.futures import ThreadPoolExecutor

        db_type_str = (self.db_type.value if hasattr(self.db_type, 'value') else str(self.db_type)).lower()

        def _run():
            # BigQuery: bypass SQLAlchemy, use native client for true Arrow streaming
            if 'bigquery' in db_type_str:
                try:
                    from google.cloud import bigquery
                    # Extract project and dataset from engine URL
                    url_str = str(self._engine.url)
                    # bigquery://project/dataset or bigquery://project
                    parts = url_str.replace('bigquery://', '').split('/')
                    project = parts[0] if parts else None
                    dataset = parts[1] if len(parts) > 1 else None

                    # Qualify unqualified table names with dataset
                    qualified_sql = sql
                    if dataset:
                        # Replace unqualified `table` with `dataset.table`
                        import re
                        qualified_sql = re.sub(
                            r'FROM\s+`([^`.]+)`',
                            f'FROM `{dataset}.\\1`',
                            sql
                        )
                        qualified_sql = re.sub(
                            r'JOIN\s+`([^`.]+)`',
                            f'JOIN `{dataset}.\\1`',
                            qualified_sql
                        )

                    # Get credentials from engine
                    creds = None
                    if hasattr(self._engine, 'dialect') and hasattr(self._engine.dialect, 'credentials_path'):
                        creds_path = self._engine.dialect.credentials_path
                        if creds_path:
                            from google.oauth2 import service_account
                            creds = service_account.Credentials.from_service_account_file(creds_path)

                    # Try to get credentials from existing engine connection
                    if not creds:
                        try:
                            create_disposition = getattr(self._engine.dialect, 'create_disposition', None)
                            # Use default credentials
                            import google.auth
                            creds, _ = google.auth.default()
                        except Exception as _gauth_exc:
                            # Tier 1 fix #1 (2026-04-27 council R5): pre-fix this was silent.
                            # google.auth.default() failure means client falls through with
                            # creds=None, which BigQuery may accept (workload identity) or
                            # error out at query time. Surface so the auth-bypass risk is
                            # observable rather than swallowed.
                            logger.warning(
                                "google.auth.default() failed (%s: %s); BigQuery client "
                                "will be constructed with creds=None — auth resolves at "
                                "query time, may fail there",
                                type(_gauth_exc).__name__, _gauth_exc,
                            )

                    client = bigquery.Client(project=project, credentials=creds)
                    job = client.query(qualified_sql)
                    result = job.result()  # Waits for completion
                    arrow_table = result.to_arrow()
                    return arrow_table
                except ImportError:
                    logger.warning("google-cloud-bigquery not available, falling back to SQLAlchemy")
                except Exception as e:
                    logger.warning(f"BigQuery native Arrow failed: {e}, falling back to SQLAlchemy")

            # All other databases: SQLAlchemy path
            with self._engine.connect() as conn:
                # Set read-only for supported databases
                if 'postgresql' in db_type_str or 'redshift' in db_type_str or 'cockroach' in db_type_str:
                    try:
                        conn.execute(text("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY"))
                    except Exception as _ro_exc:
                        # Tier 1 fix #1 — pre-fix this was silent. If the read-only
                        # SET fails, the connection MAY still be read-only via driver
                        # defaults / role permissions, but defense-in-depth fails.
                        # Surface so DBA can investigate before a write slips through.
                        logger.warning(
                            "READ ONLY transaction SET failed (%s: %s) on %s; "
                            "relying on driver/role-level read-only enforcement "
                            "alone — investigate connection role config",
                            type(_ro_exc).__name__, _ro_exc, db_type_str,
                        )

                result = conn.execute(text(sql))
                columns = list(result.keys())

                # Chunked fetch → columnar Arrow
                all_rows = []
                while True:
                    chunk = result.fetchmany(50000)
                    if not chunk:
                        break
                    all_rows.extend(chunk)

                if not all_rows:
                    return pa.table({col: [] for col in columns})

                col_data = {}
                for ci, col in enumerate(columns):
                    col_data[col] = [row[ci] for row in all_rows]

                return pa.table(col_data)

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_run)
            try:
                return future.result(timeout=timeout)
            except Exception as e:
                raise RuntimeError(f"Arrow query failed: {str(e)}")

    def estimate_result_size(self, sql: str, timeout: int = 5) -> Optional[int]:
        """Quick COUNT(*) estimate for big data queries. Returns None on failure."""
        if not self._engine or not self.is_big_data_engine():
            return None
        try:
            count_sql = f"SELECT COUNT(*) AS cnt FROM ({sql}) _est"
            with ThreadPoolExecutor(max_workers=1) as executor:
                def _count():
                    with self._engine.connect() as conn:
                        row = conn.execute(text(count_sql)).fetchone()
                        return row[0] if row else None
                future = executor.submit(_count)
                return future.result(timeout=timeout)
        except Exception:
            return None  # estimation is best-effort

    def preview_query(self, sql: str, timeout: int = 5) -> Optional[dict]:
        """Run EXPLAIN on a SQL query to preview estimated rows and columns.
        Returns {estimated_rows, columns} or None on failure."""
        if not self._engine:
            return None
        try:
            import pandas as pd
            # Try EXPLAIN to get row estimate
            explain_sql = f"EXPLAIN {sql}"
            estimated_rows = None
            explain_text = ""

            with self._engine.connect() as conn:
                try:
                    result = conn.execute(text(explain_sql))
                    explain_rows = result.fetchall()
                    explain_text = "\n".join(str(r) for r in explain_rows)
                    # Parse row estimates from EXPLAIN output (varies by dialect)
                    import re
                    rows_match = re.search(r'rows[=:\s]+(\d+)', explain_text, re.IGNORECASE)
                    if rows_match:
                        estimated_rows = int(rows_match.group(1))
                except Exception:
                    pass  # EXPLAIN not supported for this dialect

                # Get column names via LIMIT 0
                try:
                    limit_sql = f"SELECT * FROM ({sql}) _preview LIMIT 0"
                    result = conn.execute(text(limit_sql))
                    columns = list(result.keys())
                except Exception:
                    columns = []

            return {
                "estimated_rows": estimated_rows,
                "columns": columns,
                "column_count": len(columns),
            }
        except Exception:
            return None

    def get_schema_info(self, schema: Optional[str] = None) -> Dict[str, Any]:
        if not self._engine:
            raise RuntimeError("Not connected. Call connect() first.")

        # DuckDB/SQLite: use information_schema fallback (Inspector can fail on pg_catalog)
        if self.db_type in (DBType.DUCKDB, DBType.SQLITE):
            return self._get_schema_info_via_sql()

        # Only fall back to DB_SCHEMA for databases that use schemas
        if schema is None and self.db_type in _SCHEMA_DBS:
            schema = settings.DB_SCHEMA
        inspector = inspect(self._engine)
        schema_info = {}

        for table_name in inspector.get_table_names(schema=schema):
            columns = []
            for col in inspector.get_columns(table_name, schema=schema):
                columns.append({
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                })

            pk = inspector.get_pk_constraint(table_name, schema=schema)
            fks = inspector.get_foreign_keys(table_name, schema=schema)

            schema_info[table_name] = {
                "columns": columns,
                "primary_key": pk.get("constrained_columns", []),
                "foreign_keys": [
                    {
                        "columns": fk["constrained_columns"],
                        "referred_table": fk["referred_table"],
                        "referred_columns": fk["referred_columns"],
                    }
                    for fk in fks
                ],
            }

        logger.info(f"Schema introspected: {len(schema_info)} tables found")
        return schema_info

    def _get_schema_info_via_sql(self) -> Dict[str, Any]:
        """Fallback schema introspection using information_schema (for DuckDB, SQLite)."""
        schema_info: Dict[str, Any] = {}
        with self._engine.connect() as conn:
            # Get table names
            if self.db_type == DBType.SQLITE:
                rows = conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
                ).fetchall()
                table_names = [r[0] for r in rows]
            else:
                rows = conn.execute(
                    text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE'")
                ).fetchall()
                table_names = [r[0] for r in rows]

            for tbl in table_names:
                if self.db_type == DBType.SQLITE:
                    cols_raw = conn.execute(text(f'PRAGMA table_info("{tbl}")')).fetchall()
                    columns = [
                        {"name": c[1], "type": str(c[2]), "nullable": c[3] == 0}
                        for c in cols_raw
                    ]
                    pk_cols = [c[1] for c in cols_raw if c[5] > 0]
                    fk_raw = conn.execute(text(f'PRAGMA foreign_key_list("{tbl}")')).fetchall()
                    fks = [
                        {"columns": [f[3]], "referred_table": f[2], "referred_columns": [f[4]]}
                        for f in fk_raw
                    ]
                else:
                    # DuckDB: use DESCRIBE
                    cols_raw = conn.execute(text(f'DESCRIBE "{tbl}"')).fetchall()
                    columns = [
                        {"name": c[0], "type": str(c[1]), "nullable": c[2] != "NO"}
                        for c in cols_raw
                    ]
                    pk_cols = [c[0] for c in cols_raw if c[3] == "PRI"]
                    fks = []  # DuckDB FK introspection is limited

                schema_info[tbl] = {
                    "columns": columns,
                    "primary_key": pk_cols,
                    "foreign_keys": fks,
                }

        logger.info(f"Schema introspected (SQL fallback): {len(schema_info)} tables found")
        return schema_info

    def get_ddl(self, schema: Optional[str] = None) -> List[str]:
        schema_info = self.get_schema_info(schema)
        ddl_statements = []

        for table_name, info in schema_info.items():
            cols = []
            for col in info["columns"]:
                nullable = "" if col["nullable"] else " NOT NULL"
                cols.append(f"  {col['name']} {col['type']}{nullable}")

            if info["primary_key"]:
                cols.append(f"  PRIMARY KEY ({', '.join(info['primary_key'])})")

            for fk in info["foreign_keys"]:
                # SQLAlchemy returns None entries for FK columns when the
                # underlying SQLite metadata is incomplete (BIRD's
                # european_football_2, debit_card_specializing surface this).
                # Mirror the defensive pattern from agent_engine._tool_inspect_schema:
                # substitute '?' for missing names so DDL stays valid + parseable
                # and skip the FK clause entirely if every constrained column is None.
                src_cols = [c if c else "?" for c in (fk.get("columns") or fk.get("constrained_columns") or [])]
                ref_cols = [c if c else "?" for c in (fk.get("referred_columns") or [])]
                ref_table = fk.get("referred_table") or "?"
                if not src_cols or not ref_cols:
                    continue  # malformed FK — skip rather than emit broken DDL
                cols.append(
                    f"  FOREIGN KEY ({', '.join(src_cols)}) "
                    f"REFERENCES {ref_table}"
                    f"({', '.join(ref_cols)})"
                )

            ddl = f"CREATE TABLE {table_name} (\n" + ",\n".join(cols) + "\n);"
            ddl_statements.append(ddl)

        return ddl_statements

    def test_connection(self) -> bool:
        try:
            with self._engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    def disconnect(self) -> None:
        if self._engine:
            self._engine.dispose()
            self._engine = None
            logger.info("Database connection closed")

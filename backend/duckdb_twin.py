"""
DuckDB Local Replica Manager — "Turbo Mode"

Creates lightweight local DuckDB copies of user databases for millisecond-speed
analytical queries, using sampled data from the source.

Invariant-1: All queries to the source DB are SELECT-only (sampling uses SELECT).
Invariant-2: Caller must run mask_dataframe() on any rows returned from query_twin.
Invariant-6: Atomic file writes — twin is created as .tmp.duckdb, renamed on success.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import duckdb
import pandas as pd

from config import settings

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

_MAX_ROWS_PER_TABLE = 50_000          # Hard cap — prevents bloat on TB-scale tables
_METADATA_TABLE = "_twin_metadata"   # Internal DuckDB table holding sync metadata

# Databases known to support TABLESAMPLE SYSTEM (SQL standard / dialect-specific).
# For others we fall back to ORDER BY RANDOM()/RAND() LIMIT.
_TABLESAMPLE_ENGINES = {
    "postgresql", "redshift", "cockroachdb",
    "mssql", "oracle", "ibm_db2",
    "bigquery", "databricks",  # Both support TABLESAMPLE SYSTEM (N PERCENT)
}

# Databases that use RAND() instead of RANDOM() for random ordering.
# PostgreSQL, Snowflake, SQLite, DuckDB, Trino use RANDOM().
# MySQL, MariaDB, SAP HANA, ClickHouse use RAND().
_RAND_ENGINES = {
    "mysql", "mariadb", "sap_hana", "clickhouse",
}

# ── Helpers ────────────────────────────────────────────────────────────────────


def _utcnow_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _file_size_mb(path: Path) -> float:
    """Return the file size in megabytes, or 0.0 if the file does not exist."""
    try:
        return path.stat().st_size / (1024 * 1024)
    except OSError:
        return 0.0


def _schema_hash(schema_profile) -> str:
    """Compute a stable hash over the table names in a SchemaProfile."""
    table_names = sorted(t.name for t in schema_profile.tables)
    payload = "|".join(table_names).encode()
    return hashlib.sha256(payload).hexdigest()[:16]


def _db_type_name(db_connector) -> str:
    """Return a lowercase string identifying the source database type."""
    try:
        return db_connector.db_type.value.lower()
    except AttributeError:
        return ""


def _supports_tablesample(db_connector) -> bool:
    """Return True if the source DB supports TABLESAMPLE SYSTEM (...)."""
    return _db_type_name(db_connector) in _TABLESAMPLE_ENGINES


def _uses_rand(db_connector) -> bool:
    """Return True if the source DB uses RAND() instead of RANDOM()."""
    return _db_type_name(db_connector) in _RAND_ENGINES


def _build_sample_sql(
    table: str,
    supports_tablesample: bool,
    sample_percent: float,
    max_rows: int,
    use_rand: bool = False,
) -> str:
    """
    Build a SELECT-only sampling query for the given table.

    Invariant-1: This is always a SELECT statement — never mutates the source DB.

    Args:
        use_rand: If True, use RAND() instead of RANDOM() for databases
                  like MySQL, MariaDB, SAP HANA, ClickHouse.
    """
    if supports_tablesample:
        return (
            f"SELECT * FROM {table} "
            f"TABLESAMPLE SYSTEM ({sample_percent} PERCENT) "
            f"LIMIT {max_rows}"
        )
    # Fallback: ORDER BY RANDOM()/RAND() depending on dialect
    rand_fn = "RAND()" if use_rand else "RANDOM()"
    return f"SELECT * FROM {table} ORDER BY {rand_fn} LIMIT {max_rows}"


# ── Query-pattern warm priorities (Task 4.2) ──────────────────────────────────

_QUERY_PATTERNS_DIR = Path(".data/query_patterns")


def get_warm_priorities(conn_id: str) -> List[str]:
    """Return the top-10 table names for *conn_id* sorted by query frequency.

    Reads `.data/query_patterns/{conn_id}.json` written by
    ``query_memory.record_query_pattern``.

    Returns an empty list when:
    - ``settings.BEHAVIOR_WARMING_ENABLED`` is False
    - the patterns file does not exist yet (new connection)
    - the file cannot be parsed
    """
    if not settings.BEHAVIOR_WARMING_ENABLED:
        return []

    pattern_file = _QUERY_PATTERNS_DIR / f"{conn_id}.json"
    if not pattern_file.exists():
        return []

    try:
        with pattern_file.open("r", encoding="utf-8") as fh:
            data: Dict[str, Any] = json.load(fh)
    except Exception as exc:
        logger.warning("get_warm_priorities(%s): could not read patterns file — %s", conn_id, exc)
        return []

    # Sort tables by count descending; return top 10 names only
    sorted_tables = sorted(
        data.items(),
        key=lambda kv: kv[1].get("count", 0),
        reverse=True,
    )
    return [table for table, _ in sorted_tables[:10]]


# ── Main class ─────────────────────────────────────────────────────────────────


class DuckDBTwin:
    """
    Manages per-connection DuckDB local replicas (Turbo Mode twins).

    Each twin is a single .duckdb file stored under settings.TURBO_TWIN_DIR.
    Files are created atomically (.tmp.duckdb → .duckdb) and opened READ-ONLY
    for query execution.
    """

    def __init__(self) -> None:
        self._twin_dir = Path(settings.TURBO_TWIN_DIR)
        self._twin_dir.mkdir(parents=True, exist_ok=True)
        logger.debug("DuckDBTwin initialised — twin dir: %s", self._twin_dir)

    # ── Path helpers ───────────────────────────────────────────────────────────

    def _twin_path(self, conn_id: str) -> Path:
        return self._twin_dir / f"{conn_id}.duckdb"

    def _tmp_path(self, conn_id: str) -> Path:
        return self._twin_dir / f"{conn_id}.tmp.duckdb"

    # ── Public API ─────────────────────────────────────────────────────────────

    def twin_exists(self, conn_id: str) -> bool:
        """Quick check whether a twin file exists for the given connection."""
        return self._twin_path(conn_id).exists()

    def get_twin_info(self, conn_id: str) -> Optional[Dict[str, Any]]:
        """
        Return metadata about an existing twin, or None if no twin exists.

        Returns:
            {
                exists: bool,
                size_mb: float,
                tables: list[str],
                last_sync: str (ISO-8601 UTC),
                sample_percent: float,
                schema_hash: str,
            }
        """
        path = self._twin_path(conn_id)
        if not path.exists():
            return None

        size_mb = _file_size_mb(path)
        tables: List[str] = []
        last_sync = ""
        sample_percent = settings.TURBO_TWIN_SAMPLE_PERCENT
        schema_hash = ""
        masked_at_write: Optional[str] = None

        try:
            con = duckdb.connect(str(path), read_only=True)
            try:
                # List all user tables (exclude the metadata table)
                result = con.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'main'"
                ).fetchall()
                tables = [
                    row[0]
                    for row in result
                    if row[0] != _METADATA_TABLE
                ]

                # Read stored metadata if available
                meta_exists = con.execute(
                    "SELECT COUNT(*) FROM information_schema.tables "
                    f"WHERE table_name = '{_METADATA_TABLE}'"
                ).fetchone()[0]

                if meta_exists:
                    # Check whether masked_at_write column exists (older twins won't have it)
                    meta_cols = {
                        row[0]
                        for row in con.execute(
                            "SELECT column_name FROM information_schema.columns "
                            f"WHERE table_name = '{_METADATA_TABLE}'"
                        ).fetchall()
                    }
                    if "masked_at_write" in meta_cols:
                        meta = con.execute(
                            f"SELECT last_sync, sample_percent, schema_hash, masked_at_write "
                            f"FROM {_METADATA_TABLE} LIMIT 1"
                        ).fetchone()
                        if meta:
                            last_sync = meta[0] or ""
                            sample_percent = float(meta[1]) if meta[1] is not None else sample_percent
                            schema_hash = meta[2] or ""
                            masked_at_write = meta[3] or None
                    else:
                        meta = con.execute(
                            f"SELECT last_sync, sample_percent, schema_hash "
                            f"FROM {_METADATA_TABLE} LIMIT 1"
                        ).fetchone()
                        if meta:
                            last_sync = meta[0] or ""
                            sample_percent = float(meta[1]) if meta[1] is not None else sample_percent
                            schema_hash = meta[2] or ""
            finally:
                con.close()
        except Exception as exc:
            logger.warning("get_twin_info(%s): could not read DuckDB file — %s", conn_id, exc)

        return {
            "exists": True,
            "size_mb": round(size_mb, 3),
            "tables": tables,
            "last_sync": last_sync,
            "sample_percent": sample_percent,
            "schema_hash": schema_hash,
            "masked_at_write": masked_at_write,
        }

    def create_twin(
        self,
        conn_id: str,
        db_connector,
        schema_profile,
        sample_percent: float = None,
    ) -> Dict[str, Any]:
        """
        Build a DuckDB twin for the given connection from sampled source data.

        Steps:
          1. Resolve configuration.
          2. For each table in schema_profile.tables:
             a. Fetch sampled rows from source (SELECT-only — Invariant-1).
             b. Create and populate the table in a temporary DuckDB file.
             c. Abort if the file size exceeds TURBO_TWIN_MAX_SIZE_MB.
          3. Write metadata row into _twin_metadata.
          4. Rename .tmp.duckdb → .duckdb (Invariant-6 atomic write).

        Returns:
            {status, tables_synced, size_mb, elapsed_seconds}
            or {status: "error", message: str} on failure.
        """
        resolved_percent = (
            sample_percent
            if sample_percent is not None
            else settings.TURBO_TWIN_SAMPLE_PERCENT
        )
        max_size_mb: float = float(settings.TURBO_TWIN_MAX_SIZE_MB)
        supports_ts = _supports_tablesample(db_connector)
        use_rand = _uses_rand(db_connector)
        computed_hash = _schema_hash(schema_profile)
        tmp_path = self._tmp_path(conn_id)
        final_path = self._twin_path(conn_id)

        # Remove any leftover tmp file from a previous crashed attempt
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError as exc:
                logger.warning("create_twin: could not remove stale tmp file %s — %s", tmp_path, exc)

        t_start = time.monotonic()
        tables_synced = 0
        skipped_size_limit = False

        try:
            # Open the temporary DuckDB file for writing
            con = duckdb.connect(str(tmp_path))
            try:
                for table_profile in schema_profile.tables:
                    table_name = table_profile.name

                    # ── Check size guard before fetching next table ──────────
                    current_size_mb = _file_size_mb(tmp_path)
                    if current_size_mb >= max_size_mb:
                        logger.warning(
                            "create_twin(%s): size limit %.1f MB reached after %d tables — stopping.",
                            conn_id, max_size_mb, tables_synced,
                        )
                        skipped_size_limit = True
                        break

                    # ── Build sampling SQL (Invariant-1: SELECT-only) ────────
                    sample_sql = _build_sample_sql(
                        table=table_name,
                        supports_tablesample=supports_ts,
                        sample_percent=resolved_percent,
                        max_rows=_MAX_ROWS_PER_TABLE,
                        use_rand=use_rand,
                    )

                    # ── Fetch sampled data from source DB ────────────────────
                    try:
                        df: pd.DataFrame = db_connector.execute_query(sample_sql)
                    except Exception as exc:
                        logger.warning(
                            "create_twin(%s): failed to sample table '%s' — %s",
                            conn_id, table_name, exc,
                        )
                        continue

                    if df is None or df.empty:
                        logger.debug(
                            "create_twin(%s): table '%s' returned no rows — skipping.",
                            conn_id, table_name,
                        )
                        # Still create the (empty) table so schema is represented
                        try:
                            # Register an empty DataFrame to create the table
                            con.register("_empty_df", df if df is not None else pd.DataFrame())
                            con.execute(
                                f'CREATE TABLE IF NOT EXISTS "{table_name}" AS '
                                f"SELECT * FROM _empty_df LIMIT 0"
                            )
                            con.unregister("_empty_df")
                        except Exception as exc2:
                            logger.warning(
                                "create_twin(%s): could not create empty table '%s' — %s",
                                conn_id, table_name, exc2,
                            )
                        continue

                    # ── Write-time PII masking (Task 3.1) ───────────────────
                    # If WRITE_TIME_MASKING is enabled, mask the DataFrame now so
                    # the twin stores pre-masked data.  On failure, log and
                    # continue with unmasked data — BaseTier._apply_masking will
                    # still mask at read time (Invariant-2 preserved either way).
                    if settings.WRITE_TIME_MASKING:
                        try:
                            from pii_masking import mask_dataframe
                            df = mask_dataframe(df, conn_id=conn_id)
                            logger.debug(
                                "create_twin(%s): write-time PII masking applied to table '%s'.",
                                conn_id, table_name,
                            )
                        except Exception as mask_exc:
                            logger.error(
                                "create_twin(%s): write-time masking failed for table '%s' — "
                                "continuing with unmasked data (read-time masking still active): %s",
                                conn_id, table_name, mask_exc,
                            )

                    # ── Write data into DuckDB ───────────────────────────────
                    try:
                        # Register the DataFrame as a temporary view, then CREATE TABLE from it.
                        # This lets DuckDB infer column types from pandas dtypes automatically.
                        con.register("_src_df", df)
                        con.execute(
                            f'CREATE TABLE IF NOT EXISTS "{table_name}" AS '
                            f"SELECT * FROM _src_df"
                        )
                        con.unregister("_src_df")
                        tables_synced += 1
                        logger.debug(
                            "create_twin(%s): synced table '%s' (%d rows).",
                            conn_id, table_name, len(df),
                        )
                    except Exception as exc:
                        logger.warning(
                            "create_twin(%s): failed to insert table '%s' into DuckDB — %s",
                            conn_id, table_name, exc,
                        )
                        # Attempt cleanup of partial table
                        try:
                            con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                        except Exception:
                            pass
                        continue

                # ── Write metadata table ─────────────────────────────────────
                sync_ts = _utcnow_iso()
                masked_at_write_ts = sync_ts if settings.WRITE_TIME_MASKING else None
                try:
                    con.execute(f"DROP TABLE IF EXISTS {_METADATA_TABLE}")
                    con.execute(
                        f"""
                        CREATE TABLE {_METADATA_TABLE} (
                            conn_id          VARCHAR,
                            last_sync        VARCHAR,
                            sample_percent   DOUBLE,
                            schema_hash      VARCHAR,
                            tables_synced    INTEGER,
                            masked_at_write  VARCHAR
                        )
                        """
                    )
                    con.execute(
                        f"""
                        INSERT INTO {_METADATA_TABLE}
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        [conn_id, sync_ts, resolved_percent, computed_hash, tables_synced, masked_at_write_ts],
                    )
                except Exception as exc:
                    logger.warning(
                        "create_twin(%s): could not write metadata table — %s", conn_id, exc
                    )
            finally:
                con.close()

            # ── Atomic rename: .tmp.duckdb → .duckdb (Invariant-6) ──────────
            # On Windows os.replace() is used because Path.rename() can fail
            # when the destination already exists on some Windows versions.
            os.replace(str(tmp_path), str(final_path))

            # ── Restrict file permissions (owner-only) ────────────────────
            # Twin files contain sampled rows that may include PHI/PII.
            # Set 0o600 (rw-------) so only the process owner can access.
            try:
                os.chmod(str(final_path), 0o600)
            except OSError as perm_err:
                logger.warning("create_twin(%s): could not restrict file permissions — %s", conn_id, perm_err)

            # ── Warn about unencrypted twin files ─────────────────────────
            if settings.TURBO_TWIN_WARN_UNENCRYPTED:
                logger.warning(
                    "create_twin(%s): twin file at %s is NOT encrypted at rest. "
                    "For healthcare/finance deployments, ensure the volume is encrypted "
                    "or set TURBO_TWIN_WARN_UNENCRYPTED=false after confirming disk encryption.",
                    conn_id, final_path,
                )

        except Exception as exc:
            logger.error("create_twin(%s): fatal error — %s", conn_id, exc, exc_info=True)
            # Clean up the partial tmp file if it exists
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass
            return {"status": "error", "message": str(exc)}

        elapsed = round(time.monotonic() - t_start, 3)
        size_mb = round(_file_size_mb(final_path), 3)

        result: Dict[str, Any] = {
            "status": "created",
            "tables_synced": tables_synced,
            "size_mb": size_mb,
            "elapsed_seconds": elapsed,
        }
        if skipped_size_limit:
            result["warning"] = (
                f"Size limit of {max_size_mb} MB reached — "
                "not all tables were synced."
            )

        logger.info(
            "create_twin(%s): done — %d tables, %.3f MB, %.3fs.",
            conn_id, tables_synced, size_mb, elapsed,
        )
        return result

    # Maximum rows returned from a twin query to prevent OOM on cross-joins.
    _MAX_RESULT_ROWS = 10_000

    def query_twin(self, conn_id: str, sql: str) -> Dict[str, Any]:
        """
        Execute a SQL query against the local DuckDB twin and return results.

        The DuckDB file is opened READ-ONLY to prevent any accidental mutation.

        P1 fix: SQL is validated through sql_validator before execution to
        prevent filesystem-reading DuckDB functions (read_csv_auto, etc.).
        P1 fix: Result set is capped at _MAX_RESULT_ROWS to prevent OOM.

        # INVARIANT-2: caller must run mask_dataframe() on any rows returned here
        #              before surfacing them to users or passing them to the LLM.

        Returns:
            {columns, rows, row_count, query_ms, truncated}
            or {status: "error", message: str} on failure.
        """
        # P1 fix: validate SQL before execution on DuckDB twin.
        # Prevents read_csv_auto('/etc/passwd') and other filesystem functions.
        try:
            from sql_validator import SQLValidator
            validator = SQLValidator()
            is_valid, _cleaned, error_msg = validator.validate(sql)
            if not is_valid:
                return {
                    "status": "error",
                    "message": f"SQL validation failed: {error_msg}",
                }
        except Exception as exc:
            logger.warning("query_twin(%s): SQL validation error — %s", conn_id, exc)
            return {
                "status": "error",
                "message": "SQL validation unavailable; query blocked for safety.",
            }

        path = self._twin_path(conn_id)
        if not path.exists():
            return {
                "status": "error",
                "message": f"Twin for connection '{conn_id}' does not exist.",
            }

        t_start = time.monotonic()
        try:
            # Open READ-ONLY — prevents any writes to the twin file
            con = duckdb.connect(str(path), read_only=True)
            try:
                result = con.execute(sql)
                columns: List[str] = [desc[0] for desc in result.description]
                # P1 fix: cap result size to prevent OOM on cross-joins
                rows: List[List[Any]] = result.fetchmany(self._MAX_RESULT_ROWS + 1)
                truncated = len(rows) > self._MAX_RESULT_ROWS
                if truncated:
                    rows = rows[:self._MAX_RESULT_ROWS]
            finally:
                con.close()
        except Exception as exc:
            logger.error("query_twin(%s): query failed — %s", conn_id, exc, exc_info=True)
            return {"status": "error", "message": "Query execution failed on twin."}

        query_ms = round((time.monotonic() - t_start) * 1000, 2)

        # INVARIANT-2: caller must run mask_dataframe() on any rows returned here.
        return {
            "columns": columns,
            "rows": [list(row) for row in rows],
            "row_count": len(rows),
            "query_ms": query_ms,
            "truncated": truncated,
        }

    def refresh_twin(
        self,
        conn_id: str,
        db_connector,
        schema_profile,
    ) -> Dict[str, Any]:
        """
        Atomically replace the existing twin with a fresh one.

        create_twin() writes to .tmp.duckdb and renames to .duckdb,
        so the existing twin remains available until the swap completes.
        """
        return self.create_twin(conn_id, db_connector, schema_profile)

    def delete_twin(self, conn_id: str) -> bool:
        """
        Delete the DuckDB twin file for the given connection.

        Returns:
            True  — file existed and was deleted.
            False — file did not exist (no-op).
        """
        path = self._twin_path(conn_id)
        if not path.exists():
            return False
        try:
            path.unlink()
            logger.info("delete_twin(%s): twin deleted.", conn_id)
            return True
        except OSError as exc:
            logger.error("delete_twin(%s): could not delete twin — %s", conn_id, exc)
            return False

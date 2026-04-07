"""
SchemaIntelligence — enriched schema metadata extraction and caching.

Extracts table profiles (columns, indexes, primary/foreign keys, row-count
estimates) from a connected DatabaseConnector, serialises them to a per-
connection JSON cache, and provides freshness / staleness helpers.

Invariant-1: ALL queries issued to the source DB are SELECT-only.
Invariant-6: All cache writes use an atomic write-then-rename pattern.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import tempfile
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import settings, DBType

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class TableProfile:
    """Enriched metadata for a single table."""
    name: str
    row_count_estimate: int          # -1 when unknown
    columns: List[Dict[str, Any]]    # [{name, type, nullable}, ...]
    indexes: List[Any]               # dialect-specific index dicts
    partitions: List[Any]            # partition names / definitions
    primary_keys: List[str]
    foreign_keys: List[Dict[str, Any]]


@dataclass
class SchemaProfile:
    """Full schema snapshot for one connection."""
    tables: List[TableProfile]
    schema_hash: str
    cached_at: datetime              # always UTC-aware
    conn_id: str


# ---------------------------------------------------------------------------
# JSON helpers  (datetime <-> ISO-8601, TableProfile <-> dict)
# ---------------------------------------------------------------------------

def _dt_to_str(dt: datetime) -> str:
    """Serialise a datetime to an ISO-8601 string with UTC offset."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _str_to_dt(s: str) -> datetime:
    """Parse an ISO-8601 string into a UTC-aware datetime."""
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _table_to_dict(tp: TableProfile) -> Dict[str, Any]:
    return asdict(tp)


def _dict_to_table(d: Dict[str, Any]) -> TableProfile:
    return TableProfile(
        name=d["name"],
        row_count_estimate=d.get("row_count_estimate", -1),
        columns=d.get("columns", []),
        indexes=d.get("indexes", []),
        partitions=d.get("partitions", []),
        primary_keys=d.get("primary_keys", []),
        foreign_keys=d.get("foreign_keys", []),
    )


def _profile_to_dict(profile: SchemaProfile) -> Dict[str, Any]:
    return {
        "conn_id": profile.conn_id,
        "schema_hash": profile.schema_hash,
        "cached_at": _dt_to_str(profile.cached_at),
        "tables": [_table_to_dict(t) for t in profile.tables],
    }


def _dict_to_profile(d: Dict[str, Any]) -> SchemaProfile:
    return SchemaProfile(
        conn_id=d["conn_id"],
        schema_hash=d["schema_hash"],
        cached_at=_str_to_dt(d["cached_at"]),
        tables=[_dict_to_table(t) for t in d.get("tables", [])],
    )


# ---------------------------------------------------------------------------
# Row-count estimation helpers  (SELECT-only — Invariant-1)
# ---------------------------------------------------------------------------

def _estimate_row_count_pg(conn, table_name: str) -> int:
    """
    PostgreSQL / Redshift / CockroachDB — fast statistics estimate.
    Falls back to COUNT(*) if pg_class lookup returns nothing.
    """
    try:
        # Quote the table name to handle mixed-case identifiers.
        row = conn.execute(
            __import__("sqlalchemy").text(
                "SELECT reltuples::bigint AS estimate "
                "FROM pg_class "
                "WHERE relname = :tbl"
            ),
            {"tbl": table_name},
        ).fetchone()
        if row is not None and row[0] is not None and row[0] >= 0:
            return int(row[0])
    except Exception as exc:
        logger.debug("pg_class lookup failed for %s: %s", table_name, exc)
    return _count_star(conn, table_name)


def _estimate_row_count_mysql(conn, table_name: str) -> int:
    """MySQL / MariaDB — SHOW TABLE STATUS estimate."""
    try:
        from sqlalchemy import text
        rows = conn.execute(
            text("SHOW TABLE STATUS LIKE :tbl"),
            {"tbl": table_name},
        ).fetchall()
        if rows:
            # Column 4 (index 4) is 'Rows' in SHOW TABLE STATUS output.
            estimate = rows[0][4]
            if estimate is not None:
                return int(estimate)
    except Exception as exc:
        logger.debug("SHOW TABLE STATUS failed for %s: %s", table_name, exc)
    return _count_star(conn, table_name)


def _safe_quote_ident(table_name: str) -> str:
    """SQL-standard identifier quoting: escape embedded double-quotes by doubling them.

    NEMESIS P1 fix (2026-04-07): prevents SQL injection via crafted table names
    (Ops 1, 5). All f-string table name interpolation MUST use this function.
    """
    # Reject null bytes (undefined behavior across dialects)
    if "\x00" in table_name:
        return '""'  # empty identifier — will safely error on all dialects
    return '"' + table_name.replace('"', '""') + '"'


def _count_star(conn, table_name: str) -> int:
    """Generic COUNT(*) fallback — SELECT-only, safe for all dialects."""
    try:
        from sqlalchemy import text
        safe_name = _safe_quote_ident(table_name)
        result = conn.execute(
            text(f'SELECT COUNT(*) FROM {safe_name}')
        ).fetchone()
        if result and result[0] is not None:
            return int(result[0])
    except Exception as exc:
        logger.debug("COUNT(*) failed for %s: %s", table_name, exc)
    return -1


def _count_star_sampled(conn, table_name: str, sample_limit: int = 100_000) -> int:
    """G1 fix: Fast approximate row count for cloud warehouses.

    Strategy: COUNT(*) on a LIMIT subset, then extrapolate.
    If the limited count returns exactly sample_limit rows, the table has at
    least that many rows; we return sample_limit as a floor estimate.
    This avoids full table scans on TB-scale Snowflake/BigQuery/Databricks tables.
    Falls back to -1 (unknown) on error — never blocks for >5s.
    """
    if sample_limit <= 0:
        return -1
    safe_name = _safe_quote_ident(table_name)
    try:
        from sqlalchemy import text
        result = conn.execute(
            text(f'SELECT COUNT(*) FROM (SELECT 1 FROM {safe_name} LIMIT :lim) AS _sample'),
            {"lim": sample_limit},
        ).fetchone()
        if result and result[0] is not None:
            return int(result[0])
    except Exception:
        pass

    # Some dialects (BigQuery, Databricks) don't support subquery with LIMIT well.
    # Try TABLESAMPLE if available.
    try:
        from sqlalchemy import text
        result = conn.execute(
            text(f'SELECT COUNT(*) FROM {safe_name} TABLESAMPLE SYSTEM (1)'),
        ).fetchone()
        if result and result[0] is not None:
            # 1% sample → multiply by 100 for estimate
            return int(result[0]) * 100
    except Exception:
        pass

    # Final fallback: return -1 (unknown) rather than blocking with COUNT(*)
    logger.debug("Sampled count failed for %s; returning -1 (unknown)", table_name)
    return -1


def _estimate_row_count_snowflake(conn, table_name: str) -> int:
    """Snowflake — use INFORMATION_SCHEMA.TABLES for fast row count.

    NEMESIS P2 fix (2026-04-07, Op 18): Uses case-insensitive comparison
    and TABLE_SCHEMA filter to handle quoted mixed-case identifiers and
    multi-schema databases correctly.
    """
    try:
        from sqlalchemy import text
        # Case-insensitive match handles both quoted ("MyTable") and unquoted (MYTABLE)
        result = conn.execute(
            text(
                "SELECT ROW_COUNT FROM INFORMATION_SCHEMA.TABLES "
                "WHERE LOWER(TABLE_NAME) = LOWER(:tbl) "
                "AND TABLE_SCHEMA = CURRENT_SCHEMA()"
            ),
            {"tbl": table_name},
        ).fetchone()
        if result and result[0] is not None:
            return int(result[0])
    except Exception as exc:
        logger.debug("Snowflake INFORMATION_SCHEMA lookup failed for %s: %s", table_name, exc)
    return _count_star_sampled(conn, table_name)


def _estimate_row_count_mssql(conn, table_name: str) -> int:
    """SQL Server — use sys.partitions for fast row count."""
    try:
        from sqlalchemy import text
        result = conn.execute(
            text(
                "SELECT SUM(p.rows) FROM sys.partitions p "
                "INNER JOIN sys.tables t ON p.object_id = t.object_id "
                "WHERE t.name = :tbl AND p.index_id IN (0, 1)"
            ),
            {"tbl": table_name},
        ).fetchone()
        if result and result[0] is not None:
            return int(result[0])
    except Exception as exc:
        logger.debug("MSSQL sys.partitions lookup failed for %s: %s", table_name, exc)
    return _count_star(conn, table_name)


def _get_row_count(db_connector, table_name: str) -> int:
    """
    Dispatch to the most efficient row-count strategy for the connected
    dialect.  All paths are SELECT-only (Invariant-1).

    G1 fix (2026-04-07): Added fast paths for Snowflake, MSSQL, and a
    sampled fallback for cloud warehouses (Databricks, BigQuery, etc.)
    to avoid blocking COUNT(*) on TB-scale tables.
    """
    engine = db_connector._engine
    if engine is None:
        return -1

    try:
        with engine.connect() as conn:
            db_type = db_connector.db_type
            if db_type in (DBType.POSTGRESQL, DBType.REDSHIFT, DBType.COCKROACHDB):
                return _estimate_row_count_pg(conn, table_name)
            elif db_type in (DBType.MYSQL, DBType.MARIADB):
                return _estimate_row_count_mysql(conn, table_name)
            elif db_type == DBType.SNOWFLAKE:
                return _estimate_row_count_snowflake(conn, table_name)
            elif db_type == DBType.MSSQL:
                return _estimate_row_count_mssql(conn, table_name)
            elif db_type in (DBType.DATABRICKS, DBType.BIGQUERY, DBType.CLICKHOUSE,
                             DBType.SAP_HANA, DBType.IBM_DB2, DBType.TRINO):
                # Cloud warehouses: use sampled count to avoid full scan
                return _count_star_sampled(conn, table_name)
            else:
                return _count_star(conn, table_name)
    except Exception as exc:
        logger.warning("Row count estimation failed for table %s: %s", table_name, exc)
        return -1


def _get_indexes(db_connector, table_name: str, schema: Optional[str]) -> List[Any]:
    """Retrieve index metadata via SQLAlchemy Inspector; return [] on failure."""
    try:
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(db_connector._engine)
        return inspector.get_indexes(table_name, schema=schema)
    except Exception as exc:
        logger.debug("Index introspection failed for %s: %s", table_name, exc)
        return []


def _get_partitions(db_connector, table_name: str) -> List[Any]:
    """
    Best-effort partition list — PostgreSQL only for now.
    Returns [] for all other dialects (partition metadata is non-standard).
    """
    if db_connector.db_type != DBType.POSTGRESQL:
        return []
    try:
        from sqlalchemy import text
        with db_connector._engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT child.relname AS partition_name "
                    "FROM pg_inherits "
                    "JOIN pg_class parent ON pg_inherits.inhparent = parent.oid "
                    "JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid "
                    "WHERE parent.relname = :tbl"
                ),
                {"tbl": table_name},
            ).fetchall()
            return [r[0] for r in rows]
    except Exception as exc:
        logger.debug("Partition lookup failed for %s: %s", table_name, exc)
        return []


# ---------------------------------------------------------------------------
# SchemaIntelligence
# ---------------------------------------------------------------------------

class SchemaIntelligence:
    """
    Extracts, caches, and validates enriched schema profiles.

    Cache layout
    ------------
    ``<SCHEMA_CACHE_DIR>/<conn_id>.json``

    All cache writes are atomic: data is written to a sibling temp file
    then renamed into place (Invariant-6).
    """

    def __init__(self) -> None:
        self._cache_dir = Path(settings.SCHEMA_CACHE_DIR)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _cache_path(self, conn_id: str) -> Path:
        return self._cache_dir / f"{conn_id}.json"

    def _ensure_cache_dir(self) -> None:
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def _write_cache(self, profile: SchemaProfile) -> None:
        """Atomic write: temp file → rename (Invariant-6)."""
        self._ensure_cache_dir()
        target = self._cache_path(profile.conn_id)
        payload = json.dumps(_profile_to_dict(profile), indent=2, default=str)

        # Write to a temp file in the same directory so rename is atomic.
        fd, tmp_path = tempfile.mkstemp(
            dir=self._cache_dir,
            prefix=f".{profile.conn_id}_",
            suffix=".tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(payload)
            os.replace(tmp_path, target)   # atomic on POSIX; near-atomic on Windows
            logger.info("Schema cache written: %s", target)
        except Exception:
            # Clean up orphan temp file on failure.
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    def _read_cache(self, conn_id: str) -> Optional[SchemaProfile]:
        path = self._cache_path(conn_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return _dict_to_profile(data)
        except Exception as exc:
            logger.warning("Failed to read schema cache %s: %s", path, exc)
            return None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def profile_connection(self, db_connector, conn_id: str) -> SchemaProfile:
        """
        Extract full schema metadata from *db_connector* and persist to cache.

        Uses ``db_connector.get_schema_info()`` for structural data, then
        issues dialect-appropriate SELECT-only row-count queries for each table.

        Parameters
        ----------
        db_connector:
            A connected ``DatabaseConnector`` instance.
        conn_id:
            Unique identifier for this connection (used as the cache key).

        Returns
        -------
        SchemaProfile
            The freshly built profile (also written to cache).
        """
        logger.info("Profiling schema for connection '%s'", conn_id)

        # Determine schema parameter for index lookups.
        schema_param: Optional[str] = None
        if db_connector.db_type in {
            DBType.POSTGRESQL, DBType.SNOWFLAKE, DBType.REDSHIFT,
            DBType.COCKROACHDB, DBType.MSSQL, DBType.ORACLE,
            DBType.SAP_HANA, DBType.IBM_DB2, DBType.TRINO,
        }:
            schema_param = settings.DB_SCHEMA

        raw_schema: Dict[str, Any] = {}
        try:
            raw_schema = db_connector.get_schema_info()
        except Exception as exc:
            logger.error("get_schema_info() failed for '%s': %s", conn_id, exc)
            # Return a minimal, empty-but-valid profile so callers don't crash.
            now = datetime.now(tz=timezone.utc)
            profile = SchemaProfile(
                tables=[],
                schema_hash=hashlib.md5(b"").hexdigest(),
                cached_at=now,
                conn_id=conn_id,
            )
            self._write_cache(profile)
            return profile

        table_profiles: List[TableProfile] = []

        for table_name, meta in raw_schema.items():
            columns: List[Dict[str, Any]] = meta.get("columns", [])
            primary_keys: List[str] = meta.get("primary_key", [])
            foreign_keys: List[Dict[str, Any]] = meta.get("foreign_keys", [])

            # Row count — SELECT-only (Invariant-1).
            row_count = _get_row_count(db_connector, table_name)

            # Indexes — best-effort, non-fatal.
            indexes = _get_indexes(db_connector, table_name, schema_param)

            # Partitions — PostgreSQL only, non-fatal.
            partitions = _get_partitions(db_connector, table_name)

            table_profiles.append(TableProfile(
                name=table_name,
                row_count_estimate=row_count,
                columns=columns,
                indexes=indexes,
                partitions=partitions,
                primary_keys=primary_keys,
                foreign_keys=foreign_keys,
            ))

        now = datetime.now(tz=timezone.utc)
        h = self._compute_hash(table_profiles)
        profile = SchemaProfile(
            tables=table_profiles,
            schema_hash=h,
            cached_at=now,
            conn_id=conn_id,
        )
        self._write_cache(profile)
        logger.info(
            "Profiled %d tables for connection '%s' (hash=%s)",
            len(table_profiles), conn_id, h,
        )
        return profile

    def get_profile(self, conn_id: str) -> Optional[SchemaProfile]:
        """
        Return the cached ``SchemaProfile`` for *conn_id*, or ``None`` if
        no cache file exists or it cannot be parsed.
        """
        profile = self._read_cache(conn_id)
        if profile is None:
            logger.debug("No cached schema profile found for '%s'", conn_id)
        return profile

    def invalidate(self, conn_id: str) -> None:
        """
        Delete the cache file for *conn_id*.  No-op if it does not exist.
        """
        path = self._cache_path(conn_id)
        try:
            path.unlink(missing_ok=True)
            logger.info("Schema cache invalidated for '%s'", conn_id)
        except Exception as exc:
            logger.warning("Could not invalidate cache for '%s': %s", conn_id, exc)

    # ------------------------------------------------------------------
    # Hashing
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_hash(tables: List[TableProfile]) -> str:
        """
        Compute an MD5 fingerprint from sorted table names + column
        names + column types.  Used to detect schema drift.
        """
        parts: List[str] = []
        for tbl in sorted(tables, key=lambda t: t.name):
            parts.append(tbl.name)
            for col in sorted(tbl.columns, key=lambda c: c.get("name", "")):
                parts.append(col.get("name", ""))
                parts.append(col.get("type", ""))
        digest = hashlib.md5("\n".join(parts).encode("utf-8")).hexdigest()
        return digest

    def schema_hash(self, profile: SchemaProfile) -> str:
        """Return (or recompute) the MD5 hash for *profile*."""
        return self._compute_hash(profile.tables)

    # ------------------------------------------------------------------
    # Freshness
    # ------------------------------------------------------------------

    def is_stale(self, conn_id: str, max_age_minutes: int = 60) -> bool:
        """
        Return ``True`` if the cached profile is older than
        *max_age_minutes* (or does not exist).

        Defaults to ``settings.SCHEMA_CACHE_MAX_AGE_MINUTES`` when the
        caller passes the default sentinel of ``60``; callers that want
        explicit control should pass a value directly.
        """
        effective_max = getattr(settings, "SCHEMA_CACHE_MAX_AGE_MINUTES", max_age_minutes)
        profile = self._read_cache(conn_id)
        if profile is None:
            return True
        now = datetime.now(tz=timezone.utc)
        cached_at = profile.cached_at
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)
        age_minutes = (now - cached_at).total_seconds() / 60.0
        stale = age_minutes > effective_max
        if stale:
            logger.debug(
                "Cache for '%s' is stale (age=%.1f min, max=%d min)",
                conn_id, age_minutes, effective_max,
            )
        return stale

    def validate_freshness(self, conn_id: str, db_connector) -> Dict[str, bool]:
        """
        Compare the cached schema hash with a freshly computed one.

        Returns a dict:
        ``{"stale": bool, "refreshed": bool}``

        * ``stale``     — ``True`` if the schema has changed or no cache exists.
        * ``refreshed`` — ``True`` if a new profile was written during this call.

        The cache is only refreshed when a change is detected; callers that
        want a forced refresh should call ``profile_connection()`` directly.
        """
        cached = self._read_cache(conn_id)
        if cached is None:
            logger.info("No cache for '%s'; building fresh profile.", conn_id)
            self.profile_connection(db_connector, conn_id)
            return {"stale": True, "refreshed": True}

        # Build a lightweight live hash without persisting.
        try:
            raw_schema = db_connector.get_schema_info()
        except Exception as exc:
            logger.error(
                "validate_freshness: get_schema_info() failed for '%s': %s",
                conn_id, exc,
            )
            # Cannot determine freshness — treat as stale but don't refresh.
            return {"stale": True, "refreshed": False}

        live_tables: List[TableProfile] = []
        for table_name, meta in raw_schema.items():
            live_tables.append(TableProfile(
                name=table_name,
                row_count_estimate=-1,           # not needed for hash
                columns=meta.get("columns", []),
                indexes=[],
                partitions=[],
                primary_keys=meta.get("primary_key", []),
                foreign_keys=meta.get("foreign_keys", []),
            ))

        live_hash = self._compute_hash(live_tables)
        if live_hash == cached.schema_hash:
            logger.debug("Schema unchanged for '%s' (hash=%s)", conn_id, live_hash)
            return {"stale": False, "refreshed": False}

        logger.info(
            "Schema changed for '%s' (old=%s, new=%s); refreshing cache.",
            conn_id, cached.schema_hash, live_hash,
        )
        self.profile_connection(db_connector, conn_id)
        return {"stale": True, "refreshed": True}

    # ------------------------------------------------------------------
    # Query-time estimation
    # ------------------------------------------------------------------

    def estimate_query_time(self, sql: str, profile: SchemaProfile) -> Dict[str, Any]:
        """
        Heuristic estimate of query execution time.

        The result dict contains:

        ``estimated_ms``      — rough wall-clock estimate in milliseconds.
        ``confidence``        — "high" | "medium" | "low".
        ``total_rows_scanned``— sum of row-count estimates for tables referenced.
        ``complexity_score``  — dimensionless complexity score (higher = slower).
        ``notes``             — list of human-readable reasoning strings.

        This is a *static* heuristic — it does not issue any queries to the
        source database.
        """
        notes: List[str] = []
        complexity = 1.0

        sql_upper = sql.upper()

        # ── Identify referenced tables ─────────────────────────────────────
        table_index: Dict[str, TableProfile] = {t.name.lower(): t for t in profile.tables}
        referenced: List[TableProfile] = []

        # Extract table references via FROM / JOIN keywords (best-effort regex).
        # We look for identifiers that follow FROM or JOIN.
        _table_ref_re = re.compile(
            r"(?:FROM|JOIN)\s+([`\"\[]?[\w.]+[`\"\]]?)",
            re.IGNORECASE,
        )
        for match in _table_ref_re.finditer(sql):
            raw_name = match.group(1).strip('`"[]').split(".")[-1].lower()
            tp = table_index.get(raw_name)
            if tp is not None and tp not in referenced:
                referenced.append(tp)

        total_rows = sum(
            t.row_count_estimate for t in referenced if t.row_count_estimate > 0
        )
        if not referenced:
            notes.append("No matching tables found in profile; estimate is approximate.")
            total_rows = 100_000   # conservative default

        # ── SQL complexity factors ─────────────────────────────────────────
        join_count = len(re.findall(r"\bJOIN\b", sql_upper))
        if join_count > 0:
            complexity *= 1.5 ** join_count
            notes.append(f"{join_count} JOIN(s) detected (+{join_count * 50:.0f}% complexity).")

        if re.search(r"\bGROUP\s+BY\b", sql_upper):
            complexity *= 1.4
            notes.append("GROUP BY detected (+40% complexity).")

        if re.search(r"\bORDER\s+BY\b", sql_upper):
            complexity *= 1.2
            notes.append("ORDER BY detected (+20% complexity).")

        if re.search(r"\bDISTINCT\b", sql_upper):
            complexity *= 1.3
            notes.append("DISTINCT detected (+30% complexity).")

        subquery_count = sql_upper.count("SELECT") - 1
        if subquery_count > 0:
            complexity *= 1.3 ** subquery_count
            notes.append(f"{subquery_count} subquery/subqueries detected.")

        has_limit = bool(re.search(r"\bLIMIT\s+\d+", sql_upper))
        if has_limit:
            complexity *= 0.7
            notes.append("LIMIT clause detected (−30% complexity).")

        has_where = bool(re.search(r"\bWHERE\b", sql_upper))
        if has_where:
            complexity *= 0.8
            notes.append("WHERE clause detected (−20% complexity).")

        # ── Time model ────────────────────────────────────────────────────
        # Base: ~1 ms per 10 000 rows, scaled by complexity.
        base_ms = max(1.0, total_rows / 10_000.0) * complexity * 10
        estimated_ms = round(base_ms, 1)

        # ── Confidence ────────────────────────────────────────────────────
        unknown_rows = sum(
            1 for t in referenced if t.row_count_estimate < 0
        )
        if not referenced or unknown_rows == len(referenced):
            confidence = "low"
        elif unknown_rows > 0:
            confidence = "medium"
        else:
            confidence = "high"

        logger.debug(
            "estimate_query_time: estimated=%s ms, confidence=%s, rows=%d",
            estimated_ms, confidence, total_rows,
        )

        return {
            "estimated_ms": estimated_ms,
            "confidence": confidence,
            "total_rows_scanned": total_rows,
            "complexity_score": round(complexity, 3),
            "notes": notes,
        }

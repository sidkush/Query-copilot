"""DataCoverageCard — Ring 1 empirical grounding.

Captures actual table content footprint: row count, date range/distinct-months
for date columns, distinct-count + small sample for low-cardinality categoricals.

Written once per connection per TTL. Read by:
- agent_engine._tool_find_relevant_tables (enriches the summary text)
- agent_engine._build_legacy_system_prompt (injects <data_coverage> block)

Key invariants:
- All SQL emitted by this module passes through SQLValidator before execution.
- Timeout bounded (COVERAGE_QUERY_TIMEOUT_SECONDS). Timeout -> fields set None.
- PII columns excluded from categorical sampling (via pii_masking.is_pii_column).
- Atomic cache writes (Invariant-6): tmp file -> rename.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from typing import Optional


@dataclass(frozen=True)
class DateCoverage:
    """Date/timestamp column observed range."""
    column: str
    min_value: Optional[str]      # ISO-8601 string or None on timeout/empty
    max_value: Optional[str]
    distinct_months: Optional[int]  # None on timeout/unsupported
    span_days: Optional[int]       # (max - min).days, or None


@dataclass(frozen=True)
class CategoricalCoverage:
    """Low-cardinality column distinct values + sample."""
    column: str
    distinct_count: Optional[int]
    sample_values: list[str] = field(default_factory=list)   # up to 10 values


@dataclass(frozen=True)
class DataCoverageCard:
    """Per-table empirical content card."""
    table_name: str
    row_count: int
    date_columns: list[DateCoverage]
    categorical_columns: list[CategoricalCoverage]
    computed_at: datetime
    dialect: str


def _dt_to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _iso_to_dt(s: str) -> datetime:
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def card_to_dict(card: DataCoverageCard) -> dict:
    """JSON-safe dict representation. Converts datetime -> ISO string."""
    out = asdict(card)
    out["computed_at"] = _dt_to_iso(card.computed_at)
    return out


def dict_to_card(d: dict) -> DataCoverageCard:
    """Inverse of card_to_dict."""
    return DataCoverageCard(
        table_name=d["table_name"],
        row_count=int(d["row_count"]),
        date_columns=[DateCoverage(**dc) for dc in d.get("date_columns", [])],
        categorical_columns=[CategoricalCoverage(**cc) for cc in d.get("categorical_columns", [])],
        computed_at=_iso_to_dt(d["computed_at"]),
        dialect=d["dialect"],
    )


# ─────────────────────────────────────────────────────────────────────────
# Per-dialect SQL generators.
# ─────────────────────────────────────────────────────────────────────────


class UnsupportedDialectError(ValueError):
    """Raised when a coverage SQL is requested for an unknown dialect."""


_QUOTE_BY_DIALECT = {
    "sqlite":     '"',
    "postgresql": '"',
    "duckdb":     '"',
    "mysql":      "`",
    "mariadb":    "`",
    "bigquery":   "`",
    "snowflake":  '"',
    "mssql":      '"',
    "redshift":   '"',
    "cockroachdb":'"',
    "trino":      '"',
    "oracle":     '"',
    "clickhouse": '"',
}


def _quote(dialect: str, ident: str) -> str:
    q = _QUOTE_BY_DIALECT.get(dialect.lower())
    if q is None:
        raise UnsupportedDialectError(f"no identifier quote for {dialect!r}")
    safe = ident.replace(q, q + q)
    return f"{q}{safe}{q}"


def row_count_sql(dialect: str, table: str) -> str:
    return f"SELECT COUNT(*) FROM {_quote(dialect, table)}"


def date_coverage_sql(dialect: str, table: str, column: str) -> str:
    """Return SELECT MIN(c), MAX(c), COUNT(DISTINCT month(c)) FROM t in the appropriate dialect."""
    d = dialect.lower()
    col = _quote(d, column)
    tbl = _quote(d, table)

    if d in {"sqlite", "duckdb"}:
        month_expr = f"strftime('%Y-%m', {col})"
    elif d in {"postgresql", "cockroachdb", "redshift"}:
        month_expr = f"date_trunc('month', {col})"
    elif d in {"mysql", "mariadb"}:
        month_expr = f"DATE_FORMAT({col}, '%Y-%m')"
    elif d == "bigquery":
        month_expr = f"FORMAT_DATE('%Y-%m', DATE({col}))"
    elif d == "snowflake":
        month_expr = f"TO_CHAR({col}, 'YYYY-MM')"
    elif d == "mssql":
        month_expr = f"FORMAT({col}, 'yyyy-MM')"
    elif d == "oracle":
        month_expr = f"TO_CHAR({col}, 'YYYY-MM')"
    elif d == "clickhouse":
        month_expr = f"formatDateTime({col}, '%Y-%m')"
    elif d == "trino":
        month_expr = f"date_format({col}, '%Y-%m')"
    else:
        raise UnsupportedDialectError(f"date coverage SQL not implemented for {dialect!r}")

    return (
        f"SELECT MIN({col}) AS min_v, MAX({col}) AS max_v, "
        f"COUNT(DISTINCT {month_expr}) AS distinct_months "
        f"FROM {tbl}"
    )


def categorical_coverage_sql(dialect: str, table: str, column: str) -> str:
    """Return sample query for categorical column."""
    d = dialect.lower()
    col = _quote(d, column)
    tbl = _quote(d, table)
    if d == "mssql":
        return f"SELECT TOP 10 {col} FROM {tbl} GROUP BY {col} ORDER BY {col}"
    return f"SELECT {col} FROM {tbl} GROUP BY {col} ORDER BY {col} LIMIT 10"


def categorical_count_sql(dialect: str, table: str, column: str) -> str:
    """Emit a SELECT COUNT(DISTINCT col) query."""
    d = dialect.lower()
    col = _quote(d, column)
    tbl = _quote(d, table)
    return f"SELECT COUNT(DISTINCT {col}) FROM {tbl}"


# ─────────────────────────────────────────────────────────────────────────
# Column picker
# ─────────────────────────────────────────────────────────────────────────

from enum import Enum


class ColumnRole(Enum):
    DATE = "date"
    CATEGORICAL = "categorical"


_DATE_TYPE_TOKENS = ("DATE", "TIME", "TIMESTAMP")
_CATEGORICAL_TYPE_TOKENS = ("CHAR", "TEXT", "VARCHAR", "ENUM", "STRING")
_EXCLUDE_TYPE_TOKENS = ("BLOB", "BYTEA", "JSON", "CLOB", "XML", "ARRAY")

_PII_HINTS = (
    "email", "phone", "ssn", "social", "dob", "birth",
    "address", "zip", "credit", "card", "passport",
)


def _type_matches(col_type: str, tokens: tuple) -> bool:
    up = col_type.upper()
    return any(tok in up for tok in tokens)


def _is_pii(col_name: str) -> bool:
    """Delegate to pii_masking when available; fall back to local hints."""
    try:
        from pii_masking import is_pii_column   # type: ignore
        return bool(is_pii_column(col_name))
    except Exception:
        low = col_name.lower()
        return any(h in low for h in _PII_HINTS)


def pick_coverage_columns(
    columns: list,
    max_date: int = 2,
    max_categorical: int = 3,
) -> list:
    """Return a selection of (column_name, role) tuples to profile."""
    dates = []
    cats = []

    for col in columns:
        name = col.get("name", "")
        ctype = col.get("type", "") or ""
        if not name:
            continue
        if _type_matches(ctype, _EXCLUDE_TYPE_TOKENS):
            continue
        if _is_pii(name):
            continue
        if _type_matches(ctype, _DATE_TYPE_TOKENS) and len(dates) < max_date:
            dates.append((name, ColumnRole.DATE))
        elif _type_matches(ctype, _CATEGORICAL_TYPE_TOKENS) and len(cats) < max_categorical:
            cats.append((name, ColumnRole.CATEGORICAL))

    return dates + cats


# ─────────────────────────────────────────────────────────────────────────
# CoverageProfiler
# ─────────────────────────────────────────────────────────────────────────

from typing import Callable, Iterable


class CoverageProfiler:
    """Given a callable that executes SQL and returns rows, build a card.

    `run_query` contract:
      - Accepts a single SELECT string
      - Returns a list of row tuples (list[tuple])
      - MUST enforce read-only + timeout at the call site.
    """

    def __init__(self, dialect: str, max_date: int = 2, max_categorical: int = 3):
        self.dialect = dialect.lower()
        self.max_date = max_date
        self.max_categorical = max_categorical

    def profile_table(
        self,
        run_query: Callable,
        table_name: str,
        columns: list,
        treat_as_date: Iterable = (),
    ) -> DataCoverageCard:
        treat_as_date_set = set(treat_as_date or ())

        try:
            rows = run_query(row_count_sql(self.dialect, table_name))
            row_count = int(rows[0][0]) if rows else 0
        except Exception:
            row_count = -1

        selection = pick_coverage_columns(columns, self.max_date, self.max_categorical)

        # Promote treat_as_date columns: remove from cats if present, insert as DATE.
        for col in columns:
            name = col.get("name", "")
            if name in treat_as_date_set:
                # Remove if already in selection (possibly as CATEGORICAL)
                existing = [(c, r) for c, r in selection if c == name]
                if existing and existing[0][1] is ColumnRole.DATE:
                    continue  # already a date, nothing to do
                selection = [(c, r) for c, r in selection if c != name]
                selection.insert(0, (name, ColumnRole.DATE))

        date_cards = []
        cat_cards = []

        for col_name, role in selection:
            if role is ColumnRole.DATE:
                date_cards.append(self._profile_date(run_query, table_name, col_name))
            elif role is ColumnRole.CATEGORICAL:
                cat_cards.append(self._profile_categorical(run_query, table_name, col_name))

        return DataCoverageCard(
            table_name=table_name,
            row_count=row_count,
            date_columns=date_cards,
            categorical_columns=cat_cards,
            computed_at=datetime.now(timezone.utc),
            dialect=self.dialect,
        )

    def _profile_date(self, run_query: Callable, table: str, col: str) -> DateCoverage:
        try:
            rows = run_query(date_coverage_sql(self.dialect, table, col))
            min_v, max_v, distinct_m = (rows[0] if rows else (None, None, None))
            span_days = None
            if min_v and max_v:
                try:
                    mn = datetime.fromisoformat(str(min_v).replace("Z", "+00:00"))
                    mx = datetime.fromisoformat(str(max_v).replace("Z", "+00:00"))
                    span_days = (mx - mn).days
                except ValueError:
                    span_days = None
            return DateCoverage(
                column=col,
                min_value=str(min_v) if min_v is not None else None,
                max_value=str(max_v) if max_v is not None else None,
                distinct_months=int(distinct_m) if distinct_m is not None else None,
                span_days=span_days,
            )
        except Exception:
            return DateCoverage(col, None, None, None, None)

    def _profile_categorical(self, run_query: Callable, table: str, col: str) -> CategoricalCoverage:
        try:
            count_rows = run_query(categorical_count_sql(self.dialect, table, col))
            distinct_count = int(count_rows[0][0]) if count_rows else 0
            sample_rows = run_query(categorical_coverage_sql(self.dialect, table, col))
            samples = [str(r[0]) for r in sample_rows if r and r[0] is not None]
            return CategoricalCoverage(
                column=col,
                distinct_count=distinct_count,
                sample_values=samples[:10],
            )
        except Exception:
            return CategoricalCoverage(col, None, [])


# ─────────────────────────────────────────────────────────────────────────
# CoverageCache
# ─────────────────────────────────────────────────────────────────────────

import json as _json
import os as _os
import tempfile as _tempfile
from pathlib import Path


class CoverageCache:
    """Per-connection coverage card list persisted as one JSON file.

    Layout: <root>/<conn_id>.json  (atomic write: tmp -> rename).
    """

    def __init__(self, root, ttl_hours: int = 6):
        self.root = Path(root)
        self.ttl_hours = ttl_hours

    def _path(self, conn_id: str) -> Path:
        return self.root / f"{conn_id}.json"

    def write(self, conn_id: str, cards: list) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        target = self._path(conn_id)
        payload = {
            "conn_id": conn_id,
            "written_at": _dt_to_iso(datetime.now(timezone.utc)),
            "cards": [card_to_dict(c) for c in cards],
        }
        fd, tmp_path = _tempfile.mkstemp(
            dir=str(self.root), prefix=f".{conn_id}_", suffix=".tmp"
        )
        try:
            with _os.fdopen(fd, "w", encoding="utf-8") as fh:
                _json.dump(payload, fh, indent=2)
            _os.replace(tmp_path, target)
        except Exception:
            try:
                _os.unlink(tmp_path)
            except OSError:
                pass
            raise

    def read(self, conn_id: str):
        path = self._path(conn_id)
        if not path.exists():
            return None
        try:
            data = _json.loads(path.read_text(encoding="utf-8"))
            return [dict_to_card(d) for d in data.get("cards", [])]
        except Exception:
            return None

    def is_stale(self, conn_id: str) -> bool:
        """True when no file, or when file is older than ttl_hours."""
        path = self._path(conn_id)
        if not path.exists():
            return True
        try:
            data = _json.loads(path.read_text(encoding="utf-8"))
            written = _iso_to_dt(data["written_at"])
            age_hours = (datetime.now(timezone.utc) - written).total_seconds() / 3600
            return age_hours >= self.ttl_hours
        except Exception:
            return True

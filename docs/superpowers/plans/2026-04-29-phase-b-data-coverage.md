# Grounding Stack v6 — Phase B (Ring 1: DataCoverageCard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Ring 1 empirical grounding — a module that queries actual table MIN / MAX / DISTINCT / row-count at connect-time, caches per-connection, and injects a `<data_coverage>` block into the agent system prompt so the agent grounds answers in real data instead of inferring from table names.

**Architecture:** One new backend module `data_coverage.py` (profiler + cache + card dataclass), one new per-dialect SQL generator, a feature-flagged hook in the connection lifecycle that populates coverage after schema profiling, and two hooks in `agent_engine.py` — one that enriches the `_tool_find_relevant_tables` summary, one that injects a `<data_coverage>` block into `_build_legacy_system_prompt`. Coverage is only computed once per connection TTL (6h default); agent reads from cache.

**Tech Stack:** Python 3.10+, existing `SchemaIntelligence` / `SchemaProfile` pattern (atomic JSON writes, per-conn cache), sqlglot (already pinned) for dialect-aware SQL, existing `SQLValidator` for read-only enforcement, Phase A `trap_grader.py` extended with new oracle types.

**Scope — Phase B covers vs defers:**
- ✅ DataCoverageCard dataclass + JSON round-trip
- ✅ Per-dialect coverage SQL (sqlite, postgres, mysql, duckdb, bigquery, snowflake, mssql)
- ✅ Column-type picker (dates, low-cardinality categoricals; PII-excluded)
- ✅ Coverage profiler with bounded timeout + empty-table handling
- ✅ Per-connection cache with TTL staleness + atomic writes (Invariant-6)
- ✅ Connection-lifecycle hook (background after schema profile)
- ✅ Agent prompt enrichment (schema_context + data_coverage block)
- ✅ 10 new Ring-1 trap questions + 2 new grader oracle types
- ✅ Phase A trap regression preserved
- ⛔ **Deferred:** Ring 3 pre-exec validator (Phase C), IntentEcho (Phase D), ProvenanceChip UI (Phase E), rich column-value sampling beyond distinct-count (Phase F).

---

## Prerequisites

- [ ] You are in the `QueryCopilot V1/` working tree on branch `askdb-global-comp` at or after commit `e006e4a` (Phase A exit gate).
- [ ] `python -m pytest backend/tests/ -v` is green (Phase A established 1493 pass, 1 skip).
- [ ] `python -m backend.tests.run_traps backend/tests/trap_temporal_scope.jsonl .data/eval_baseline.json` exits 0.
- [ ] You have read `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` (Ring 1 spec).
- [ ] Fixture DB exists: `python -m backend.tests.fixtures.eval_seed /tmp/eval_fixture.sqlite` (Windows: `%TEMP%\eval_fixture.sqlite`).

---

## File Structure

All files Phase B touches. No deletions.

| Path | Create/Edit | Purpose |
|---|---|---|
| `backend/data_coverage.py` | Create | DataCoverageCard + DateCoverage + CategoricalCoverage dataclasses; per-dialect SQL generator; CoverageProfiler; CoverageCache |
| `backend/tests/test_data_coverage_cards.py` | Create | Dataclass + JSON round-trip unit tests |
| `backend/tests/test_data_coverage_sql.py` | Create | Per-dialect SQL generator unit tests |
| `backend/tests/test_data_coverage_profiler.py` | Create | End-to-end profile against fixture SQLite |
| `backend/tests/test_data_coverage_cache.py` | Create | Cache round-trip + TTL staleness tests |
| `backend/tests/test_data_coverage_picker.py` | Create | Column selection (dates/categoricals/skip-PII) unit tests |
| `backend/tests/test_agent_coverage_hook.py` | Create | Verify `_tool_find_relevant_tables` + system-prompt injection |
| `backend/tests/trap_coverage_grounding.jsonl` | Create | 10 new Ring-1 trap questions |
| `.data/coverage_baseline.json` | Create (committed) | Mock-suite baseline for Ring-1 traps (H13) |
| `backend/tests/trap_grader.py` | Modify | Add `must_mention_full_range` + `must_not_claim_limited` oracle handlers |
| `backend/tests/test_trap_grader_ring1.py` | Create | Unit tests for new oracle handlers |
| `backend/config.py` | Modify | `FEATURE_DATA_COVERAGE`, `COVERAGE_QUERY_TIMEOUT_SECONDS`, `COVERAGE_CACHE_TTL_HOURS`, `COVERAGE_MAX_COLUMNS_PER_TABLE`, `COVERAGE_CACHE_DIR` |
| `backend/routers/connection_routes.py` | Modify | Background coverage run after schema profile (Task 8) |
| `backend/agent_engine.py` | Modify | Enrich `_tool_find_relevant_tables` + inject `<data_coverage>` block |
| `backend/models.py` | Modify | `ConnectionEntry.coverage_cards: Optional[list[DataCoverageCard]] = None` |
| `docs/claude/config-defaults.md` | Modify | Record 4 new constants under new "Data Coverage (Phase B)" section |

---

## Track B — Ring 1 DataCoverageCard

### Task 0: Config defaults + feature flag

**Files:**
- Modify: `backend/config.py`
- Modify: `docs/claude/config-defaults.md`

- [ ] **Step 1: Add config fields**

Open `backend/config.py`. Find the section where `SCHEMA_CACHE_DIR` is defined (~line 156). Add immediately below it:

```python
    # ── Data Coverage (Phase B — Ring 1) ──
    FEATURE_DATA_COVERAGE: bool = Field(default=True)
    COVERAGE_CACHE_DIR: str = Field(default=".data/coverage_cache")
    COVERAGE_QUERY_TIMEOUT_SECONDS: float = Field(default=5.0)
    COVERAGE_CACHE_TTL_HOURS: int = Field(default=6)
    COVERAGE_MAX_COLUMNS_PER_TABLE: int = Field(default=5)
    COVERAGE_MAX_TABLES_PER_CONNECTION: int = Field(default=30)
```

- [ ] **Step 2: Update docs**

Open `docs/claude/config-defaults.md`. Find the "### Query / SQL guardrails" section and add a new section immediately below it:

```markdown
### Data Coverage (Phase B — Ring 1)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_DATA_COVERAGE` | `True` | Gate for Ring-1 empirical grounding. Off → card module silent. |
| `COVERAGE_CACHE_DIR` | `.data/coverage_cache` | Per-connection card JSON path. Same atomic-write pattern as SchemaProfile. |
| `COVERAGE_QUERY_TIMEOUT_SECONDS` | `5.0` | Per-query wall-clock cap. Timeout → card fields set to `None`, never raises. |
| `COVERAGE_CACHE_TTL_HOURS` | `6` | Re-profile when older; mirrors `SCHEMA_CACHE_MAX_AGE_MINUTES`. |
| `COVERAGE_MAX_COLUMNS_PER_TABLE` | `5` | Picker emits at most 5 columns: up to 2 date-like, 3 categorical. |
| `COVERAGE_MAX_TABLES_PER_CONNECTION` | `30` | Budget cap: skip beyond 30 tables to bound connect time. |
```

- [ ] **Step 3: Run existing config test (sanity)**

Run: `python -m pytest backend/tests/ -k config -v`
Expected: existing tests still green (no regressions).

- [ ] **Step 4: Commit**

```bash
git add backend/config.py docs/claude/config-defaults.md
git commit -m "feat(phase-b): config defaults + feature flag for DataCoverageCard"
```

---

### Task 1: DataCoverageCard dataclass + JSON round-trip

**Files:**
- Create: `backend/data_coverage.py`
- Create: `backend/tests/test_data_coverage_cards.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_data_coverage_cards.py`:

```python
"""Unit tests: DataCoverageCard dataclasses and JSON round-trip."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from data_coverage import (
    DataCoverageCard,
    DateCoverage,
    CategoricalCoverage,
    card_to_dict,
    dict_to_card,
)


def test_date_coverage_fields():
    dc = DateCoverage(
        column="started_at",
        min_value="2023-12-01",
        max_value="2025-10-28",
        distinct_months=23,
        span_days=698,
    )
    assert dc.column == "started_at"
    assert dc.distinct_months == 23


def test_categorical_coverage_fields():
    cc = CategoricalCoverage(
        column="rider_type",
        distinct_count=2,
        sample_values=["member", "casual"],
    )
    assert cc.distinct_count == 2
    assert cc.sample_values == ["member", "casual"]


def test_card_roundtrip():
    card = DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage(
            column="started_at",
            min_value="2023-12-01",
            max_value="2025-10-28",
            distinct_months=23,
            span_days=698,
        )],
        categorical_columns=[CategoricalCoverage(
            column="rider_type",
            distinct_count=2,
            sample_values=["member", "casual"],
        )],
        computed_at=datetime(2026, 4, 29, 12, 0, tzinfo=timezone.utc),
        dialect="sqlite",
    )
    blob = json.dumps(card_to_dict(card), sort_keys=True)
    restored = dict_to_card(json.loads(blob))
    assert restored == card


def test_empty_table_card():
    card = DataCoverageCard(
        table_name="empty",
        row_count=0,
        date_columns=[],
        categorical_columns=[],
        computed_at=datetime(2026, 4, 29, tzinfo=timezone.utc),
        dialect="sqlite",
    )
    blob = card_to_dict(card)
    assert blob["row_count"] == 0
    assert blob["date_columns"] == []
```

- [ ] **Step 2: Run to verify fail**

Run: `python -m pytest backend/tests/test_data_coverage_cards.py -v`
Expected: FAIL — `ModuleNotFoundError: data_coverage`.

- [ ] **Step 3: Implement dataclasses**

Create `backend/data_coverage.py`:

```python
"""DataCoverageCard — Ring 1 empirical grounding.

Captures actual table content footprint: row count, date range/distinct-months
for date columns, distinct-count + small sample for low-cardinality categoricals.

Written once per connection per TTL. Read by:
- agent_engine._tool_find_relevant_tables (enriches the summary text)
- agent_engine._build_legacy_system_prompt (injects <data_coverage> block)

Key invariants:
- All SQL emitted by this module passes through SQLValidator before execution.
- Timeout bounded (COVERAGE_QUERY_TIMEOUT_SECONDS). Timeout → fields set None.
- PII columns excluded from categorical sampling (via pii_masking.is_pii_column).
- Atomic cache writes (Invariant-6): tmp file → rename.
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
    """JSON-safe dict representation. Converts datetime → ISO string."""
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
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest backend/tests/test_data_coverage_cards.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/data_coverage.py backend/tests/test_data_coverage_cards.py
git commit -m "feat(phase-b): DataCoverageCard dataclasses + JSON round-trip"
```

---

### Task 2: Per-dialect coverage SQL generators

**Files:**
- Modify: `backend/data_coverage.py`
- Create: `backend/tests/test_data_coverage_sql.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_data_coverage_sql.py`:

```python
"""Per-dialect coverage SQL generator tests."""
import pytest

from data_coverage import (
    date_coverage_sql,
    categorical_coverage_sql,
    row_count_sql,
    UnsupportedDialectError,
)


@pytest.mark.parametrize("dialect,expected_substrings", [
    ("sqlite",    ["MIN(", "MAX(", "strftime", "'%Y-%m'"]),
    ("postgresql",["MIN(", "MAX(", "date_trunc", "'month'"]),
    ("mysql",     ["MIN(", "MAX(", "DATE_FORMAT", "'%Y-%m'"]),
    ("duckdb",    ["MIN(", "MAX(", "strftime", "'%Y-%m'"]),
    ("bigquery",  ["MIN(", "MAX(", "FORMAT_DATE", "'%Y-%m'"]),
    ("snowflake", ["MIN(", "MAX(", "TO_CHAR", "'YYYY-MM'"]),
    ("mssql",     ["MIN(", "MAX(", "FORMAT(", "'yyyy-MM'"]),
])
def test_date_sql_per_dialect(dialect, expected_substrings):
    sql = date_coverage_sql(dialect, "january_trips", "started_at")
    for snippet in expected_substrings:
        assert snippet in sql, f"{dialect}: missing {snippet!r} in {sql!r}"


def test_categorical_sql_emits_distinct_and_limit():
    sql = categorical_coverage_sql("sqlite", "january_trips", "rider_type")
    assert "COUNT(DISTINCT" in sql
    assert "rider_type" in sql
    assert "LIMIT 10" in sql or "TOP 10" in sql


def test_row_count_sql_exact_count():
    sql = row_count_sql("sqlite", "january_trips")
    assert sql.strip().upper().startswith("SELECT COUNT(*)")
    assert "january_trips" in sql


def test_unsupported_dialect_raises():
    with pytest.raises(UnsupportedDialectError):
        date_coverage_sql("acme_db", "t", "c")
```

- [ ] **Step 2: Run to verify fail**

Run: `python -m pytest backend/tests/test_data_coverage_sql.py -v`
Expected: FAIL — `ImportError: cannot import name 'date_coverage_sql'`.

- [ ] **Step 3: Implement SQL generators**

Append to `backend/data_coverage.py`:

```python

# ─────────────────────────────────────────────────────────────────────────
# Per-dialect SQL generators.
#
# These return a single SELECT statement that must pass SQLValidator.
# Identifiers (table/column) are wrapped in the dialect's quote char.
# No user input reaches these functions — they are invoked with profiled
# schema metadata only.
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
    # Double the quote char inside the identifier to escape.
    safe = ident.replace(q, q + q)
    return f"{q}{safe}{q}"


def row_count_sql(dialect: str, table: str) -> str:
    return f"SELECT COUNT(*) FROM {_quote(dialect, table)}"


def date_coverage_sql(dialect: str, table: str, column: str) -> str:
    """Return `SELECT MIN(c), MAX(c), COUNT(DISTINCT month(c)) FROM t`
    in the appropriate dialect.
    """
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
    """`SELECT DISTINCT <col> FROM <tbl> ORDER BY <col> LIMIT 10` plus distinct count
    as two separate queries is cleaner, but we emit one statement that fetches
    both shape and sample in a UNION-friendly form. Callers run the two pieces.
    """
    d = dialect.lower()
    col = _quote(d, column)
    tbl = _quote(d, table)
    if d == "mssql":
        sample = f"SELECT TOP 10 {col} FROM {tbl} GROUP BY {col} ORDER BY {col}"
    else:
        sample = f"SELECT {col} FROM {tbl} GROUP BY {col} ORDER BY {col} LIMIT 10"
    return sample


def categorical_count_sql(dialect: str, table: str, column: str) -> str:
    """Emit a SELECT COUNT(DISTINCT col) query (separate from sample SQL)."""
    d = dialect.lower()
    col = _quote(d, column)
    tbl = _quote(d, table)
    return f"SELECT COUNT(DISTINCT {col}) FROM {tbl}"
```

**Note on the categorical test** — the test asserts `COUNT(DISTINCT` is present in `categorical_coverage_sql`. The implementation emits only the sample query. To satisfy the contract, revise the test OR combine both in one function. Choose the cleaner path: update the test in step 1 above to also cover the `categorical_count_sql` helper. Apply this edit to `backend/tests/test_data_coverage_sql.py` now:

Replace `test_categorical_sql_emits_distinct_and_limit` with:

```python
def test_categorical_sample_sql_emits_limit():
    sql = categorical_coverage_sql("sqlite", "january_trips", "rider_type")
    assert "rider_type" in sql
    assert "LIMIT 10" in sql or "TOP 10" in sql


def test_categorical_count_sql_emits_distinct():
    sql = categorical_count_sql("sqlite", "january_trips", "rider_type")
    assert "COUNT(DISTINCT" in sql
    assert "rider_type" in sql
```

Also update the top import:

```python
from data_coverage import (
    date_coverage_sql,
    categorical_coverage_sql,
    categorical_count_sql,
    row_count_sql,
    UnsupportedDialectError,
)
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest backend/tests/test_data_coverage_sql.py -v`
Expected: 10 PASS (7 parametrized + 3 new).

- [ ] **Step 5: Commit**

```bash
git add backend/data_coverage.py backend/tests/test_data_coverage_sql.py
git commit -m "feat(phase-b): per-dialect coverage SQL generators"
```

---

### Task 3: Column picker (dates + categoricals, skip PII)

**Files:**
- Modify: `backend/data_coverage.py`
- Create: `backend/tests/test_data_coverage_picker.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_data_coverage_picker.py`:

```python
"""Column picker: given a TableProfile's columns list, return up-to-N
date columns + up-to-M categorical columns, skip PII."""
from data_coverage import pick_coverage_columns, ColumnRole


def test_picker_selects_date_columns():
    cols = [
        {"name": "id", "type": "INTEGER"},
        {"name": "started_at", "type": "TIMESTAMP"},
        {"name": "created_at", "type": "DATETIME"},
        {"name": "rider_type", "type": "TEXT"},
    ]
    selection = pick_coverage_columns(cols, max_date=2, max_categorical=3)
    date_cols = [c for c, role in selection if role is ColumnRole.DATE]
    cat_cols  = [c for c, role in selection if role is ColumnRole.CATEGORICAL]
    assert "started_at" in date_cols
    assert "created_at" in date_cols
    assert "rider_type" in cat_cols
    assert "id" not in [c for c, _ in selection]   # integer PK not categorical


def test_picker_skips_pii_email():
    cols = [
        {"name": "email", "type": "TEXT"},
        {"name": "rider_type", "type": "TEXT"},
    ]
    selection = pick_coverage_columns(cols)
    picked = [c for c, _ in selection]
    assert "email" not in picked
    assert "rider_type" in picked


def test_picker_respects_max_counts():
    cols = [{"name": f"d{i}", "type": "DATE"} for i in range(5)] + \
           [{"name": f"c{i}", "type": "VARCHAR"} for i in range(5)]
    selection = pick_coverage_columns(cols, max_date=2, max_categorical=3)
    assert len([1 for _, r in selection if r is ColumnRole.DATE]) == 2
    assert len([1 for _, r in selection if r is ColumnRole.CATEGORICAL]) == 3


def test_picker_returns_empty_when_no_candidates():
    cols = [{"name": "blob", "type": "BLOB"}, {"name": "id", "type": "BIGINT"}]
    selection = pick_coverage_columns(cols)
    assert selection == []
```

- [ ] **Step 2: Run to verify fail**

Run: `python -m pytest backend/tests/test_data_coverage_picker.py -v`
Expected: FAIL — `cannot import name 'pick_coverage_columns'`.

- [ ] **Step 3: Implement picker**

Append to `backend/data_coverage.py`:

```python
from enum import Enum


class ColumnRole(Enum):
    DATE = "date"
    CATEGORICAL = "categorical"


_DATE_TYPE_TOKENS = ("DATE", "TIME", "TIMESTAMP")
_CATEGORICAL_TYPE_TOKENS = ("CHAR", "TEXT", "VARCHAR", "ENUM", "STRING")
_EXCLUDE_TYPE_TOKENS = ("BLOB", "BYTEA", "JSON", "CLOB", "XML", "ARRAY")

# Shared with pii_masking.py. Duplicated here to avoid hard import cycle —
# the actual authoritative list is in pii_masking.PII_COLUMN_PATTERNS, and
# this module calls the public helper at runtime (see _is_pii).
_PII_HINTS = (
    "email", "phone", "ssn", "social", "dob", "birth",
    "address", "zip", "credit", "card", "passport",
)


def _type_matches(col_type: str, tokens: tuple[str, ...]) -> bool:
    up = col_type.upper()
    return any(tok in up for tok in tokens)


def _is_pii(col_name: str) -> bool:
    """Delegate to pii_masking when available; fall back to local hints.

    Importing pii_masking at function scope (not module top) avoids circular
    imports at FastAPI startup — data_coverage must be safe to import alone.
    """
    try:
        from pii_masking import is_pii_column   # type: ignore
        return bool(is_pii_column(col_name))
    except Exception:
        low = col_name.lower()
        return any(h in low for h in _PII_HINTS)


def pick_coverage_columns(
    columns: list[dict],
    max_date: int = 2,
    max_categorical: int = 3,
) -> list[tuple[str, "ColumnRole"]]:
    """Return a selection of (column_name, role) tuples to profile.

    Deterministic: columns traversed in given order, date columns first.
    """
    dates: list[tuple[str, ColumnRole]] = []
    cats:  list[tuple[str, ColumnRole]] = []

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
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest backend/tests/test_data_coverage_picker.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/data_coverage.py backend/tests/test_data_coverage_picker.py
git commit -m "feat(phase-b): column picker with PII skip + deterministic order"
```

---

### Task 4: CoverageProfiler — profile single table against fixture

**Files:**
- Modify: `backend/data_coverage.py`
- Create: `backend/tests/test_data_coverage_profiler.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_data_coverage_profiler.py`:

```python
"""Integration-style test: profile the Phase-A fixture DB."""
import os
import sqlite3
import tempfile
from pathlib import Path

import pytest

from data_coverage import CoverageProfiler, DataCoverageCard, ColumnRole


@pytest.fixture(scope="module")
def fixture_db(tmp_path_factory):
    from tests.fixtures.eval_seed import seed
    path = tmp_path_factory.mktemp("cov") / "eval.sqlite"
    seed(path)
    return path


def _connect(path):
    return sqlite3.connect(str(path))


def test_profile_january_trips_detects_23_months(fixture_db):
    profiler = CoverageProfiler(dialect="sqlite")
    card = profiler.profile_table(
        run_query=lambda sql: _connect(fixture_db).execute(sql).fetchall(),
        table_name="january_trips",
        columns=[
            {"name": "id", "type": "INTEGER"},
            {"name": "rider_type", "type": "TEXT"},
            {"name": "started_at", "type": "TEXT"},   # SQLite date-as-text
            {"name": "duration_sec", "type": "INTEGER"},
        ],
    )
    assert isinstance(card, DataCoverageCard)
    assert card.table_name == "january_trips"
    assert card.row_count == 500
    # SQLite TEXT column is not caught by _type_matches(DATE) — picker drops it.
    # This asserts the behaviour and motivates Task 4b below (date-heuristic
    # based on column name suffix).
    assert card.date_columns == []


def test_profile_honours_date_name_heuristic(fixture_db):
    """Same call but with columns passed in the `heuristic_date_columns`
    override (names ending _at / _date / _ts treated as dates regardless
    of declared type). Needed because SQLite stores dates as TEXT.
    """
    profiler = CoverageProfiler(dialect="sqlite")
    card = profiler.profile_table(
        run_query=lambda sql: _connect(fixture_db).execute(sql).fetchall(),
        table_name="january_trips",
        columns=[
            {"name": "id", "type": "INTEGER"},
            {"name": "rider_type", "type": "TEXT"},
            {"name": "started_at", "type": "TEXT"},
            {"name": "duration_sec", "type": "INTEGER"},
        ],
        treat_as_date=("started_at",),
    )
    assert len(card.date_columns) == 1
    dc = card.date_columns[0]
    assert dc.column == "started_at"
    assert dc.min_value.startswith("2023-12")
    assert dc.max_value.startswith("2025-10")
    assert dc.distinct_months == 23


def test_empty_table_profile_returns_zero_row_card(tmp_path):
    db = tmp_path / "empty.sqlite"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE t(a TEXT, b TEXT)")
    conn.commit()
    profiler = CoverageProfiler(dialect="sqlite")
    card = profiler.profile_table(
        run_query=lambda sql: sqlite3.connect(db).execute(sql).fetchall(),
        table_name="t",
        columns=[{"name": "a", "type": "TEXT"}, {"name": "b", "type": "TEXT"}],
    )
    assert card.row_count == 0
    # Empty table → categorical distinct_count=0, sample_values=[]
    assert all(cc.distinct_count == 0 for cc in card.categorical_columns)
    assert all(cc.sample_values == [] for cc in card.categorical_columns)
```

- [ ] **Step 2: Run to verify fail**

Run: `python -m pytest backend/tests/test_data_coverage_profiler.py -v`
Expected: FAIL — `cannot import name 'CoverageProfiler'`.

- [ ] **Step 3: Implement profiler**

Append to `backend/data_coverage.py`:

```python
from typing import Callable, Iterable


class CoverageProfiler:
    """Given a callable that executes SQL and returns rows, build a card.

    `run_query` contract:
      - Accepts a single SELECT string
      - Returns a list of row tuples (list[tuple])
      - MUST enforce read-only + timeout at the call site (caller's
        responsibility). Profiler does not open DB connections itself.
    """

    def __init__(self, dialect: str, max_date: int = 2, max_categorical: int = 3):
        self.dialect = dialect.lower()
        self.max_date = max_date
        self.max_categorical = max_categorical

    def profile_table(
        self,
        run_query: Callable[[str], list[tuple]],
        table_name: str,
        columns: list[dict],
        treat_as_date: Iterable[str] = (),
    ) -> DataCoverageCard:
        treat_as_date_set = set(treat_as_date or ())

        # ── row count ──
        try:
            rows = run_query(row_count_sql(self.dialect, table_name))
            row_count = int(rows[0][0]) if rows else 0
        except Exception:
            row_count = -1

        # ── column selection ──
        selection = pick_coverage_columns(columns, self.max_date, self.max_categorical)

        # Add treat_as_date overrides (column-name heuristic — SQLite stores
        # dates as TEXT so declared type is not enough).
        for col in columns:
            name = col.get("name", "")
            if name in treat_as_date_set and not any(c == name for c, _ in selection):
                selection.insert(0, (name, ColumnRole.DATE))

        date_cards: list[DateCoverage] = []
        cat_cards:  list[CategoricalCoverage] = []

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

    def _profile_date(
        self, run_query: Callable[[str], list[tuple]], table: str, col: str
    ) -> DateCoverage:
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

    def _profile_categorical(
        self, run_query: Callable[[str], list[tuple]], table: str, col: str
    ) -> CategoricalCoverage:
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
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest backend/tests/test_data_coverage_profiler.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/data_coverage.py backend/tests/test_data_coverage_profiler.py
git commit -m "feat(phase-b): CoverageProfiler against fixture SQLite"
```

---

### Task 5: Coverage cache (atomic write + TTL staleness)

**Files:**
- Modify: `backend/data_coverage.py`
- Create: `backend/tests/test_data_coverage_cache.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_data_coverage_cache.py`:

```python
"""Cache round-trip + staleness tests."""
from datetime import datetime, timedelta, timezone

import pytest

from data_coverage import (
    DataCoverageCard,
    DateCoverage,
    CategoricalCoverage,
    CoverageCache,
)


def _card(ts):
    return DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=ts,
        dialect="sqlite",
    )


def test_cache_write_then_read(tmp_path):
    cache = CoverageCache(tmp_path)
    now = datetime.now(timezone.utc)
    cache.write("conn-abc", [_card(now)])
    restored = cache.read("conn-abc")
    assert len(restored) == 1
    assert restored[0].table_name == "january_trips"
    assert restored[0].row_count == 500


def test_cache_missing_returns_none(tmp_path):
    cache = CoverageCache(tmp_path)
    assert cache.read("never-written") is None


def test_cache_stale_when_ttl_exceeded(tmp_path):
    cache = CoverageCache(tmp_path, ttl_hours=1)
    stale = datetime.now(timezone.utc) - timedelta(hours=2)
    cache.write("conn-old", [_card(stale)])
    assert cache.is_stale("conn-old")


def test_cache_fresh_when_within_ttl(tmp_path):
    cache = CoverageCache(tmp_path, ttl_hours=6)
    fresh = datetime.now(timezone.utc)
    cache.write("conn-new", [_card(fresh)])
    assert not cache.is_stale("conn-new")
```

- [ ] **Step 2: Run to verify fail**

Run: `python -m pytest backend/tests/test_data_coverage_cache.py -v`
Expected: FAIL — `cannot import name 'CoverageCache'`.

- [ ] **Step 3: Implement cache**

Append to `backend/data_coverage.py`:

```python
import json as _json
import os as _os
import tempfile as _tempfile
from pathlib import Path


class CoverageCache:
    """Per-connection coverage card list persisted as one JSON file.

    Layout: <root>/<conn_id>.json  (atomic write: tmp → rename).
    """

    def __init__(self, root: Path | str, ttl_hours: int = 6):
        self.root = Path(root)
        self.ttl_hours = ttl_hours

    def _path(self, conn_id: str) -> Path:
        return self.root / f"{conn_id}.json"

    def write(self, conn_id: str, cards: list[DataCoverageCard]) -> None:
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

    def read(self, conn_id: str) -> Optional[list[DataCoverageCard]]:
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
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest backend/tests/test_data_coverage_cache.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/data_coverage.py backend/tests/test_data_coverage_cache.py
git commit -m "feat(phase-b): per-connection CoverageCache with TTL staleness"
```

---

### Task 6: Connection-lifecycle hook (background coverage after schema profile)

**Files:**
- Modify: `backend/routers/connection_routes.py`
- Modify: `backend/models.py`

- [ ] **Step 1: Inspect current ConnectionEntry shape**

Run: `grep -n "schema_profile" backend/models.py`
Expected: a line showing `schema_profile: Optional[SchemaProfile] = None`.

- [ ] **Step 2: Add coverage_cards field to ConnectionEntry**

Open `backend/models.py`. Find the `ConnectionEntry` class. Locate the `schema_profile: ...` line. Add immediately below it:

```python
    # Phase B — Ring 1 empirical grounding. Populated by background task
    # after schema_profile. None when FEATURE_DATA_COVERAGE disabled.
    coverage_cards: Optional[list] = None   # list[DataCoverageCard]
```

(Use `list` not `list[DataCoverageCard]` to avoid a top-level import cycle — the values are `DataCoverageCard` at runtime.)

- [ ] **Step 3: Wire background run into connection flow**

Open `backend/routers/connection_routes.py`. Locate the two background-task blocks where `schema_profile = _schema_intel.profile_connection(...)` is called (around lines 483 and 737 per grep).

Immediately after each `entry_ref.schema_profile = schema_profile` assignment, add:

```python
            # Phase B — Ring 1 coverage profiling (feature-flagged).
            if settings.FEATURE_DATA_COVERAGE:
                try:
                    from data_coverage import (
                        CoverageProfiler, CoverageCache,
                    )
                    profiler = CoverageProfiler(
                        dialect=(connector_ref.db_type or "").lower(),
                        max_date=2,
                        max_categorical=3,
                    )
                    cache = CoverageCache(
                        root=settings.COVERAGE_CACHE_DIR,
                        ttl_hours=settings.COVERAGE_CACHE_TTL_HOURS,
                    )
                    # Heuristic: TEXT columns ending _at/_date/_ts are dates.
                    def _heuristic_dates(cols):
                        return tuple(
                            c["name"] for c in cols
                            if c.get("name", "").endswith(("_at", "_date", "_ts"))
                        )
                    cards = []
                    cap = settings.COVERAGE_MAX_TABLES_PER_CONNECTION
                    for tbl in schema_profile.tables[:cap]:
                        cards.append(profiler.profile_table(
                            run_query=lambda sql, _c=connector_ref: _c.execute_query(sql),
                            table_name=tbl.name,
                            columns=tbl.columns,
                            treat_as_date=_heuristic_dates(tbl.columns),
                        ))
                    cache.write(cid, cards)
                    entry_ref.coverage_cards = cards
                    logger.info(
                        "Coverage profiled (background): %d cards for conn %s",
                        len(cards), cid,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Coverage profiling failed (non-fatal): %s", exc)
```

**Important:** `connector_ref.execute_query(sql)` is an assumption — confirm the actual method. Run:
```bash
grep -n "def execute_query\|def execute\|def run_sql" backend/db_connector.py | head -5
```
Use whichever method returns `list[tuple]` of rows after validating read-only. If the method name differs, update the lambda above.

- [ ] **Step 4: Smoke-test via Python import**

Run:
```bash
python -c "from routers import connection_routes; print('import OK')"
```
Expected: `import OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/routers/connection_routes.py
git commit -m "feat(phase-b): background coverage profile after schema profile"
```

---

### Task 7: Agent hook #1 — enrich `_tool_find_relevant_tables` summary

**Files:**
- Modify: `backend/agent_engine.py`
- Create: `backend/tests/test_agent_coverage_hook.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_agent_coverage_hook.py`:

```python
"""Verify coverage cards flow into agent prompts."""
from datetime import datetime, timezone

from data_coverage import (
    DataCoverageCard, DateCoverage, CategoricalCoverage,
)
from agent_engine import _format_coverage_card_block


def test_format_card_emits_readable_line():
    card = DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 4, 29, tzinfo=timezone.utc),
        dialect="sqlite",
    )
    block = _format_coverage_card_block(card)
    assert "january_trips" in block
    assert "500 rows" in block
    assert "started_at" in block
    assert "2023-12" in block and "2025-10" in block
    assert "23 distinct months" in block
    assert "rider_type" in block
    assert "member" in block


def test_format_card_handles_none_fields():
    """When queries timeout, min/max/distinct come back as None — must render
    without crashing and without leaking literal 'None' garbage."""
    card = DataCoverageCard(
        table_name="mystery",
        row_count=-1,
        date_columns=[DateCoverage("x", None, None, None, None)],
        categorical_columns=[CategoricalCoverage("y", None, [])],
        computed_at=datetime(2026, 4, 29, tzinfo=timezone.utc),
        dialect="postgresql",
    )
    block = _format_coverage_card_block(card)
    assert "mystery" in block
    assert "(unavailable)" in block
```

- [ ] **Step 2: Run to verify fail**

Run: `python -m pytest backend/tests/test_agent_coverage_hook.py -v`
Expected: FAIL — `cannot import name '_format_coverage_card_block'`.

- [ ] **Step 3: Implement formatter**

Open `backend/agent_engine.py`. Add this helper at module top-level (after the imports, before the class definition — use grep to confirm position; insert before `class AgentEngine`):

```python
def _format_coverage_card_block(card) -> str:
    """Render a DataCoverageCard as one multi-line text block for system prompts.

    Format:
      [DATA COVERAGE] <table>: <N rows>
        <col> date range YYYY-MM .. YYYY-MM (K distinct months, D days)
        <col> distinct=N sample=[v1, v2, v3]
    Missing fields render as '(unavailable)' so the LLM doesn't try to parse
    literal 'None'.
    """
    lines = []
    row_txt = "(unavailable)" if card.row_count is None or card.row_count < 0 else f"{card.row_count:,} rows"
    lines.append(f"[DATA COVERAGE] {card.table_name}: {row_txt}")
    for dc in card.date_columns:
        if dc.min_value and dc.max_value:
            dm = f"{dc.distinct_months} distinct months" if dc.distinct_months is not None else "(unavailable)"
            sp = f"{dc.span_days} days" if dc.span_days is not None else "(unavailable)"
            lines.append(f"  {dc.column} date range {dc.min_value} .. {dc.max_value} ({dm}, {sp})")
        else:
            lines.append(f"  {dc.column} date range (unavailable)")
    for cc in card.categorical_columns:
        dn = f"{cc.distinct_count}" if cc.distinct_count is not None else "(unavailable)"
        if cc.sample_values:
            sample = ", ".join(cc.sample_values[:5])
            lines.append(f"  {cc.column} distinct={dn} sample=[{sample}]")
        else:
            lines.append(f"  {cc.column} distinct={dn} sample=(unavailable)")
    return "\n".join(lines)
```

- [ ] **Step 4: Hook into `_tool_find_relevant_tables`**

Still in `backend/agent_engine.py`, find `_tool_find_relevant_tables` (around line 2205). Inside the try block, after the `tables.append({...})` line, before `return json.dumps(...)`, add coverage enrichment:

Replace:
```python
                        tables.append({
                            "table": table_name,
                            "summary": doc[:500],
                        })
            return json.dumps({"tables": tables, "count": len(tables)})
```

With:
```python
                        tables.append({
                            "table": table_name,
                            "summary": doc[:500],
                        })

            # Phase B — enrich summaries with DataCoverageCard (Ring 1).
            coverage_cards = getattr(self.connection_entry, "coverage_cards", None) or []
            coverage_by_name = {c.table_name: c for c in coverage_cards}
            for t in tables:
                card = coverage_by_name.get(t["table"])
                if card is not None:
                    t["summary"] = t["summary"] + "\n\n" + _format_coverage_card_block(card)

            return json.dumps({"tables": tables, "count": len(tables)})
```

- [ ] **Step 5: Run to verify pass**

Run: `python -m pytest backend/tests/test_agent_coverage_hook.py -v`
Expected: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/agent_engine.py backend/tests/test_agent_coverage_hook.py
git commit -m "feat(phase-b): coverage card enrichment in find_relevant_tables"
```

---

### Task 8: Agent hook #2 — `<data_coverage>` block in system prompt

**Files:**
- Modify: `backend/agent_engine.py`
- Modify: `backend/tests/test_agent_coverage_hook.py` (add system-prompt test)

- [ ] **Step 1: Extend test file**

Append to `backend/tests/test_agent_coverage_hook.py`:

```python
from unittest.mock import MagicMock


def test_system_prompt_includes_data_coverage_block():
    """When coverage_cards is populated, system prompt contains a
    <data_coverage> XML-ish block after <schema_context>."""
    from agent_engine import AgentEngine

    # Build a minimal engine skeleton (no real DB / LLM required for this test).
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = [DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 4, 29, tzinfo=timezone.utc),
        dialect="sqlite",
    )]
    engine.connection_entry.db_type = "sqlite"
    engine.engine = None
    engine.email = "u@test"
    engine._persona = None
    engine._skill_library = None
    engine._skill_collection = None

    # The helper we test: directly assemble the data_coverage block.
    block = engine._build_data_coverage_block(["january_trips"])
    assert "<data_coverage>" in block
    assert "</data_coverage>" in block
    assert "january_trips" in block
    assert "500 rows" in block
    assert "23 distinct months" in block
```

- [ ] **Step 2: Run to verify fail**

Run: `python -m pytest backend/tests/test_agent_coverage_hook.py::test_system_prompt_includes_data_coverage_block -v`
Expected: FAIL — `'AgentEngine' object has no attribute '_build_data_coverage_block'`.

- [ ] **Step 3: Implement `_build_data_coverage_block`**

Open `backend/agent_engine.py`. Find the class `AgentEngine` and locate `_build_legacy_system_prompt` (around line 785). Add this method inside the class, immediately BEFORE `_build_legacy_system_prompt`:

```python
    def _build_data_coverage_block(self, table_names: list[str] | None = None) -> str:
        """Phase B — render <data_coverage> block for the system prompt.

        If `table_names` is provided, restrict to those tables; otherwise
        emit all cached cards. Empty when FEATURE_DATA_COVERAGE off or no cards.
        """
        if not settings.FEATURE_DATA_COVERAGE:
            return ""
        cards = getattr(self.connection_entry, "coverage_cards", None) or []
        if not cards:
            return ""
        if table_names:
            wanted = set(table_names)
            cards = [c for c in cards if c.table_name in wanted]
            if not cards:
                return ""
        body = "\n\n".join(_format_coverage_card_block(c) for c in cards)
        return (
            "\n\n<data_coverage>\n"
            + body
            + "\n</data_coverage>\n"
            + "The above is empirical profile data — treat it as ground truth "
            + "about what the database actually contains. Do NOT infer coverage "
            + "from table names; the profile is the source of truth.\n"
        )
```

- [ ] **Step 4: Call it from `_build_legacy_system_prompt`**

Still in `backend/agent_engine.py`, find the line `system_prompt += prefetch_context` inside `_build_legacy_system_prompt` (around line 849). Add below it:

```python
        # Phase B — data coverage block (Ring 1 empirical grounding).
        system_prompt += self._build_data_coverage_block()
```

- [ ] **Step 5: Run to verify pass**

Run: `python -m pytest backend/tests/test_agent_coverage_hook.py -v`
Expected: 3 PASS (2 from Task 7 + 1 new).

- [ ] **Step 6: Commit**

```bash
git add backend/agent_engine.py backend/tests/test_agent_coverage_hook.py
git commit -m "feat(phase-b): inject <data_coverage> block into system prompt"
```

---

### Task 9: New trap JSONL — Ring 1 coverage grounding

**Files:**
- Create: `backend/tests/trap_coverage_grounding.jsonl`

- [ ] **Step 1: Write 10 trap questions**

Create `backend/tests/trap_coverage_grounding.jsonl`:

```jsonl
{"id": "cov-001", "nl": "does january_trips only contain January data?", "expected_sql_contains": ["january_trips"], "oracle": {"type": "must_not_claim_limited", "forbidden_phrases": ["only january", "january only", "one month of data", "limited to january"]}}
{"id": "cov-002", "nl": "what is the full date range of january_trips?", "expected_sql_contains": ["MIN", "MAX", "january_trips"], "oracle": {"type": "must_mention_full_range", "table": "january_trips", "column": "started_at", "min_before": "2024-01-01", "max_after": "2025-01-01"}}
{"id": "cov-003", "nl": "how many distinct months of trip data are there?", "expected_sql_contains": ["COUNT(DISTINCT", "january_trips"], "oracle": {"type": "distinct_months", "table": "january_trips", "column": "started_at", "expected_value": 23, "tolerance": 1}}
{"id": "cov-004", "nl": "give me a quarterly breakdown of trips across all years", "expected_sql_contains": ["GROUP BY", "january_trips"], "oracle": {"type": "must_not_claim_limited", "forbidden_phrases": ["only january", "data is limited"]}}
{"id": "cov-005", "nl": "compare casual vs member usage between Dec 2023 and Oct 2025", "expected_sql_contains": ["casual", "member", "january_trips"], "oracle": {"type": "must_not_refuse", "forbidden_phrases": ["insufficient", "only january", "one month"]}}
{"id": "cov-006", "nl": "yearly trend of trips from 2023 through 2025", "expected_sql_contains": ["2023", "2025", "january_trips"], "oracle": {"type": "must_query_table", "table": "january_trips"}}
{"id": "cov-007", "nl": "what is the latest trip date in the database?", "expected_sql_contains": ["MAX(started_at)", "january_trips"], "oracle": {"type": "max_date", "table": "january_trips", "column": "started_at", "min_expected": "2025-10-01"}}
{"id": "cov-008", "nl": "show me trips by season across all years", "expected_sql_contains": ["january_trips"], "oracle": {"type": "must_not_refuse", "forbidden_phrases": ["only january", "single month"]}}
{"id": "cov-009", "nl": "does this dataset span multiple years?", "expected_sql_contains": ["january_trips"], "oracle": {"type": "must_not_claim_limited", "forbidden_phrases": ["no", "single year", "only 2024", "only 2023"]}}
{"id": "cov-010", "nl": "average trip duration by rider type across entire period", "expected_sql_contains": ["AVG(duration_sec)", "rider_type", "GROUP BY"], "oracle": {"type": "must_not_refuse", "forbidden_phrases": ["only january", "insufficient data"]}}
```

- [ ] **Step 2: Validate JSONL shape**

Run:
```bash
python -c "import json; [json.loads(l) for l in open('backend/tests/trap_coverage_grounding.jsonl')]; print('OK')"
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/trap_coverage_grounding.jsonl
git commit -m "feat(phase-b): Ring-1 trap suite (10 coverage-grounding questions)"
```

---

### Task 10: Extend trap grader with new oracle types

**Files:**
- Modify: `backend/tests/trap_grader.py`
- Create: `backend/tests/test_trap_grader_ring1.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_trap_grader_ring1.py`:

```python
"""Unit tests for the new Ring-1 oracle types."""
from pathlib import Path
from tests.trap_grader import grade_trap


def _fixture_path():
    """Reuse the same Windows-/POSIX-tolerant fixture path resolver."""
    from tests.trap_grader import _resolve_db_path
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_mention_full_range_passes_on_correct_min_max_sql():
    trap = {
        "id": "cov-002",
        "nl": "range",
        "expected_sql_contains": ["MIN", "MAX"],
        "oracle": {
            "type": "must_mention_full_range",
            "table": "january_trips",
            "column": "started_at",
            "min_before": "2024-01-01",
            "max_after": "2025-01-01",
        },
    }
    sql = "SELECT MIN(started_at), MAX(started_at) FROM january_trips"
    result = grade_trap(trap, sql, _fixture_path())
    assert result.passed is True


def test_must_not_claim_limited_fails_on_refusal_text():
    trap = {
        "id": "cov-001",
        "nl": "scope",
        "expected_sql_contains": [],
        "oracle": {
            "type": "must_not_claim_limited",
            "forbidden_phrases": ["only january", "limited to january"],
        },
    }
    sql = "-- data appears only january; limited scope noted."
    result = grade_trap(trap, sql, _fixture_path())
    assert result.passed is False
    assert "only january" in result.reason.lower()


def test_must_not_claim_limited_passes_on_clean_sql():
    trap = {
        "id": "cov-001",
        "nl": "scope",
        "expected_sql_contains": [],
        "oracle": {
            "type": "must_not_claim_limited",
            "forbidden_phrases": ["only january"],
        },
    }
    sql = "SELECT COUNT(*) FROM january_trips WHERE started_at >= '2023-12-01'"
    result = grade_trap(trap, sql, _fixture_path())
    assert result.passed is True
```

- [ ] **Step 2: Run to verify fail**

Run: `python -m pytest backend/tests/test_trap_grader_ring1.py -v`
Expected: FAIL — both `must_mention_full_range` and `must_not_claim_limited` are unknown oracle types in the existing `_HANDLERS` dict.

- [ ] **Step 3: Extend grader with new handlers**

Open `backend/tests/trap_grader.py`. Find the `_HANDLERS = {...}` dict (around line 538 per the plan). Add two handler functions ABOVE the `_HANDLERS` dict:

```python
def _check_must_mention_full_range(
    sql: str, oracle: dict[str, Any], db_path: Path
) -> tuple[bool, str]:
    """Ring-1 oracle: SQL must compute MIN and MAX on a column and reference
    the target table. Then run it on the fixture and confirm the actual range
    spans the required before/after thresholds.
    """
    lc = sql.lower()
    if "min(" not in lc or "max(" not in lc:
        return False, "sql must compute both MIN and MAX"
    tbl = oracle["table"]
    if tbl.lower() not in lc:
        return False, f"sql does not reference table {tbl}"
    # Run an independent sanity query on the fixture.
    import sqlite3
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute(
            f"SELECT MIN({oracle['column']}), MAX({oracle['column']}) FROM {tbl}"
        )
        actual_min, actual_max = cur.fetchone()
    finally:
        conn.close()
    if actual_min is None or actual_max is None:
        return False, "fixture returned empty range"
    if actual_min > oracle.get("min_before", "9999-12-31"):
        return False, f"actual min {actual_min} not before threshold"
    if actual_max < oracle.get("max_after", "0000-01-01"):
        return False, f"actual max {actual_max} not after threshold"
    return True, "range spans required window"


def _check_must_not_claim_limited(
    sql: str, oracle: dict[str, Any]
) -> tuple[bool, str]:
    """Ring-1 oracle: reject any forbidden phrase suggesting the dataset is
    narrower than it actually is ('only january', 'one month', etc)."""
    lc = sql.lower()
    for phrase in oracle.get("forbidden_phrases", []):
        if phrase.lower() in lc:
            return False, f"forbidden 'limited' phrase {phrase!r} present"
    return True, "no 'limited' claims"
```

Now extend the `_HANDLERS` dict. Replace:

```python
_HANDLERS = {
    "date_range": _check_date_range,
    "must_not_refuse": lambda sql, ora, _db: _check_must_not_refuse(sql, ora),
    "must_query_table": lambda sql, ora, _db: _check_must_query_table(sql, ora),
    "max_date": _check_date_range,            # same structural check
    "distinct_months": _check_must_query_table,  # loose check — tighten later
}
```

With (adding two lines):

```python
_HANDLERS = {
    "date_range": _check_date_range,
    "must_not_refuse": lambda sql, ora, _db: _check_must_not_refuse(sql, ora),
    "must_query_table": lambda sql, ora, _db: _check_must_query_table(sql, ora),
    "max_date": _check_date_range,
    "distinct_months": _check_must_query_table,
    # Phase B — Ring 1 oracles.
    "must_mention_full_range": _check_must_mention_full_range,
    "must_not_claim_limited": lambda sql, ora, _db: _check_must_not_claim_limited(sql, ora),
}
```

- [ ] **Step 4: Seed fixture for range check**

Run: `python -m backend.tests.fixtures.eval_seed /tmp/eval_fixture.sqlite`
Expected: `Seeded fixture DB at /tmp/eval_fixture.sqlite` (Windows resolves to `%TEMP%`).

- [ ] **Step 5: Run to verify pass**

Run: `python -m pytest backend/tests/test_trap_grader_ring1.py -v`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/trap_grader.py backend/tests/test_trap_grader_ring1.py
git commit -m "feat(phase-b): extend trap grader with Ring-1 oracle types"
```

---

### Task 11: Generate coverage baseline + regression check

**Files:**
- Create: `.data/coverage_baseline.json`

- [ ] **Step 1: Write initial coverage baseline**

Run:
```bash
python -m backend.tests.fixtures.eval_seed /tmp/eval_fixture.sqlite
python -m backend.tests.run_traps backend/tests/trap_coverage_grounding.jsonl .data/coverage_baseline.json --write-baseline
```
Expected: `Wrote baseline: .data/coverage_baseline.json`.

- [ ] **Step 2: Re-run without --write-baseline**

Run:
```bash
python -m backend.tests.run_traps backend/tests/trap_coverage_grounding.jsonl .data/coverage_baseline.json
```
Expected: `OK — 10/10 pass (no regressions vs baseline)`.

- [ ] **Step 3: Confirm Phase A suite still green**

Run:
```bash
python -m backend.tests.run_traps backend/tests/trap_temporal_scope.jsonl .data/eval_baseline.json
```
Expected: `OK — 10/10 pass (no regressions vs baseline)`.

- [ ] **Step 4: Add exception to .gitignore if needed**

Run: `grep -n "coverage_baseline" .gitignore || echo "NOT_IGNORED"`

If it shows `NOT_IGNORED`, you must add a negation to guarantee future commits keep the file. Append to `.gitignore`:

```
# Ring-1 trap baseline — committed per H13 (eval integrity)
!.data/coverage_baseline.json
```

(`.data/eval_baseline.json` was already negated in Phase A — add a sibling negation.)

- [ ] **Step 5: Commit**

```bash
git add .data/coverage_baseline.json .gitignore
git commit -m "feat(phase-b): Ring-1 trap baseline committed (10/10 pass)"
```

---

### Task 12: Wire coverage baseline into CI workflow

**Files:**
- Modify: `.github/workflows/agent-traps.yml`

- [ ] **Step 1: Inspect current workflow**

Run: `grep -n "run_traps" .github/workflows/agent-traps.yml`
Expected: one line under `mock-suite` running the temporal-scope traps.

- [ ] **Step 2: Add coverage-suite step to mock-suite job**

Open `.github/workflows/agent-traps.yml`. Find the `mock-suite` job's last step:

```yaml
      - name: Run trap suite against mock
        run: |
          python -m backend.tests.run_traps \
            backend/tests/trap_temporal_scope.jsonl \
            .data/eval_baseline.json \
            --db /tmp/eval_fixture.sqlite
```

Append immediately below (still inside the same `steps:` list, same indent):

```yaml
      - name: Run Ring-1 coverage trap suite against mock
        run: |
          python -m backend.tests.run_traps \
            backend/tests/trap_coverage_grounding.jsonl \
            .data/coverage_baseline.json \
            --db /tmp/eval_fixture.sqlite
```

- [ ] **Step 3: Validate YAML**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/agent-traps.yml')); print('OK')"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/agent-traps.yml
git commit -m "feat(phase-b): CI gates coverage trap baseline (Ring-1)"
```

---

### Task 13: Phase B exit gate

- [ ] **Step 1: Run full backend test suite**

Run: `python -m pytest backend/tests/ -v 2>&1 | tail -30`
Expected: 1500+ tests pass (Phase A's 1493 + ~22 new Phase B tests), 1 skip (existing agent smoke test).

- [ ] **Step 2: Run both trap suites back-to-back**

Run:
```bash
python -m backend.tests.fixtures.eval_seed /tmp/eval_fixture.sqlite
python -m backend.tests.run_traps backend/tests/trap_temporal_scope.jsonl .data/eval_baseline.json
python -m backend.tests.run_traps backend/tests/trap_coverage_grounding.jsonl .data/coverage_baseline.json
```
Expected: both output `OK — 10/10 pass (no regressions vs baseline)`.

- [ ] **Step 3: Validate both CI workflows**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/agent-traps.yml')); yaml.safe_load(open('.github/workflows/pii-scan.yml')); print('CI OK')"
```
Expected: `CI OK`.

- [ ] **Step 4: Frontend unaffected**

Run: `cd frontend && npm run lint 2>&1 | tail -5`
Expected: no new errors (Phase B touches zero frontend).

- [ ] **Step 5: Agent-engine import health**

Run:
```bash
python -c "
import sys; sys.path.insert(0, 'backend')
from data_coverage import (
    DataCoverageCard, DateCoverage, CategoricalCoverage,
    CoverageProfiler, CoverageCache, pick_coverage_columns,
    date_coverage_sql, categorical_coverage_sql, row_count_sql,
)
import agent_engine
assert hasattr(agent_engine.AgentEngine, '_build_data_coverage_block')
assert hasattr(agent_engine, '_format_coverage_card_block')
print('Phase B imports OK')
"
```
Expected: `Phase B imports OK`.

- [ ] **Step 6: Exit commit**

```bash
git commit --allow-empty -m "chore(phase-b): exit gate — T0-T12 shipped, Ring-1 traps committed, CI wired"
```

---

## Phase B exit criteria

- [ ] `backend/data_coverage.py` exposes: `DataCoverageCard`, `DateCoverage`, `CategoricalCoverage`, `card_to_dict`, `dict_to_card`, `CoverageProfiler`, `CoverageCache`, `pick_coverage_columns`, `date_coverage_sql`, `categorical_coverage_sql`, `categorical_count_sql`, `row_count_sql`, `UnsupportedDialectError`, `ColumnRole`.
- [ ] `backend/tests/trap_coverage_grounding.jsonl` has 10 questions; baseline committed at `.data/coverage_baseline.json`.
- [ ] `python -m backend.tests.run_traps backend/tests/trap_coverage_grounding.jsonl .data/coverage_baseline.json` exits 0.
- [ ] `python -m backend.tests.run_traps backend/tests/trap_temporal_scope.jsonl .data/eval_baseline.json` STILL exits 0 (no Phase A regression).
- [ ] `AgentEngine._build_data_coverage_block()` renders the `<data_coverage>` block; the system prompt contains it after `<schema_context>` when `FEATURE_DATA_COVERAGE=True` and the connection has cached cards.
- [ ] `connection_routes.py` background task populates `ConnectionEntry.coverage_cards` after `schema_profile` succeeds (feature-flagged).
- [ ] CI workflow `agent-traps.yml` gates both trap suites.
- [ ] Full pytest suite: 1500+ pass, 1 skip.

---

## Risk notes & follow-ups

- **Dialect coverage gaps** — Task 2 covers 10 of the 18 supported engines. If a customer connects Oracle / SAP HANA / IBM Db2 / ClickHouse / Redshift / CockroachDB / Trino / MariaDB, the `_QUOTE_BY_DIALECT` map handles identifier quoting but date-SQL branches exist only for the listed 10. `UnsupportedDialectError` is raised and caught in the profiler (card fields = None). Expanding support = Phase B+ follow-up, tracked in `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` Security Backlog.
- **Timeout plumbing** — Task 4's `run_query` callable must be wrapped by the caller to enforce `COVERAGE_QUERY_TIMEOUT_SECONDS`. The connection_routes hook in Task 6 does NOT currently wrap with timeout (uses raw `connector_ref.execute_query`). A Phase B+ follow-up should add a per-query signal-based timeout or a thread wrapper. Accepted risk: a pathologically slow table blocks background coverage for up to the connector's own timeout.
- **Mock-suite only tests SQL emission, not LLM reasoning** — the real grounding test is shadow-eval (Phase A T12) against real Anthropic. Shadow-eval against Ring-1 traps is a Phase C gate.
- **Card injection grows the system prompt** — at 30 tables × ~8 lines/card, the block adds ~240 lines to every agent run. This exceeds the prompt-cache prefix-stability assumption if coverage changes between calls. Mitigation: coverage is cached for 6 hours, so block text is stable across consecutive agent invocations inside that window. If agents are sensitive to cache miss after 6h, tighten TTL or keep a last-known-good card for longer.
- **PII leak via sample_values** — Task 3's `_is_pii` delegates to `pii_masking.is_pii_column` where possible, falling back to local hints. If a column slips both checks (e.g., free-text notes), its sample values could leak PII into the agent prompt. Mitigation: Phase C adds `mask_dataframe()` on sample values; for Phase B we accept that category-column sampling should only run on columns that passed both PII filters.

---

## Execution note for agentic workers

All tasks are independent in the sense that each has its own tests and commit — but Tasks 1–5 are sequentially dependent (each appends to `backend/data_coverage.py`). Safe parallel cluster boundaries:

- **Cluster 1 (sequential):** T0 → T1 → T2 → T3 → T4 → T5 (same file, must serialize).
- **Cluster 2 (after Cluster 1):** T6, T7, T8 (all modify agent_engine.py — partial overlap; serialize in this order).
- **Cluster 3 (after Cluster 2):** T9, T10, T11 (T10 extends grader; T9+T11 produce/commit trap artefacts — can run T9 parallel with T10).
- **Cluster 4 (after Cluster 3):** T12 → T13 (CI wire + exit gate).

Subagent-driven development is the recommended execution mode.

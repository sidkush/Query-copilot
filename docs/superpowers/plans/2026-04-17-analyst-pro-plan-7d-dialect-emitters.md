# Plan 7d — Dialect Emitters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit dialect-specific SQL from the `SQLQueryFunction` AST built in Plan 7c via a visitor-driven `BaseDialect` layer, with concrete implementations for DuckDB, Postgres, BigQuery, and Snowflake, wired into `waterfall_router.py` and gated through `sql_validator.SQLValidator`.

**Architecture:** One AST, many emit strategies. `BaseDialect` holds the common emit algorithm (projections, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, CTE, SetOp, Subquery) and exposes ~22 `format_*` hooks that dialect subclasses override for identifier quoting, casts, date functions, window frames, and literal rendering. A `DialectRegistry` maps `DBType` → `BaseDialect` singleton; unsupported engines fall back to the DuckDB dialect with a single-shot warning. Every emitted SQL string goes through `SQLValidator.validate()` before any consumer can run it.

**Tech Stack:** Python 3.10+, dataclasses (frozen/slots), `sqlglot` (already in requirements), `duckdb` (local fixture DB for round-trip execution), pytest, `pytest-benchmark` (optional, install during T11 if missing).

**References:**
- `docs/Build_Tableau.md` §IV.1 (tabquery architecture), §IV.5 (dialect layer + `BaseDialect` format-function catalogue), §IV.6 (observed grammar: WITH RECURSIVE / GROUPING SETS / ROLLUP / CUBE / PIVOT / UNPIVOT / OVER / FILTER (WHERE …) / WITHIN GROUP / LATERAL / BETWEEN / TempTableMsg / TransactionMode / IsolationLevel), Appendix B (observed keyword coverage), Appendix C (`tabquery` → this module).
- `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 7d (authoritative scope).
- `backend/vizql/sql_ast.py` (Plan 7c — `SQLQueryFunction`, `Visitor` protocol, all node types).
- `backend/vizql/generic_sql.py` (Plan 7c — ANSI emitter; **NOT** a dialect emitter; used only for debugging).

**Precondition check.** Before starting Task 1 confirm Plans 7a/7b/7c are shipped:

```bash
cd "QueryCopilot V1"
ls backend/vizql/ | grep -E "^(sql_ast|logical_to_sql|optimizer|filter_ordering)\.py$"
# Expected: 4 matches.
git log --oneline | grep -E "Plan 7[abc] T" | wc -l
# Expected: ≥ 20.
```

If either command fails, STOP and re-run the earlier plans — 7d depends on the AST shape frozen by 7c.

---

## File Structure

**New files:**
- `backend/vizql/dialect_base.py` — `BaseDialect` abstract class + `EmitVisitor` + shared clause emitters.
- `backend/vizql/dialects/__init__.py` — exports registry + `get_dialect`.
- `backend/vizql/dialects/duckdb.py` — `DuckDBDialect`.
- `backend/vizql/dialects/postgres.py` — `PostgresDialect`.
- `backend/vizql/dialects/bigquery.py` — `BigQueryDialect`.
- `backend/vizql/dialects/snowflake.py` — `SnowflakeDialect`.
- `backend/vizql/dialects/registry.py` — `DBType` → dialect map + `get_dialect()` + fallback logic.
- `backend/vizql/dialects/README.md` — per-dialect quirks, coverage matrix, known gaps.
- `backend/tests/test_vizql_dialect_base.py` — abstract-surface + `EmitVisitor` scaffold tests.
- `backend/tests/test_vizql_dialect_registry.py` — registry + fallback tests.
- `backend/tests/test_vizql_dialect_duckdb.py` — 15 golden-file scenarios.
- `backend/tests/test_vizql_dialect_postgres.py` — 15 golden-file scenarios.
- `backend/tests/test_vizql_dialect_bigquery.py` — 15 golden-file scenarios.
- `backend/tests/test_vizql_dialect_snowflake.py` — 15 golden-file scenarios.
- `backend/tests/test_vizql_dialect_validator_gate.py` — `SQLValidator` integration.
- `backend/tests/test_vizql_dialect_router_wiring.py` — waterfall-router dispatch.
- `backend/tests/test_vizql_dialect_bench.py` — `< 10 ms` per 200-node plan + idempotency.
- `backend/tests/golden/vizql/duckdb/*.sql` — 15 golden fixtures.
- `backend/tests/golden/vizql/postgres/*.sql` — 15 golden fixtures.
- `backend/tests/golden/vizql/bigquery/*.sql` — 15 golden fixtures.
- `backend/tests/golden/vizql/snowflake/*.sql` — 15 golden fixtures.
- `backend/tests/vizql/_fixtures.py` — `VisualSpec` builders shared across dialect tests.

**Modified files:**
- `backend/vizql/__init__.py` — re-export `get_dialect` / `BaseDialect`.
- `backend/waterfall_router.py` — dialect lookup in the VizQL-compile path (new helper; no change to tier ordering).
- `docs/analyst_pro_tableau_parity_roadmap.md` — mark Plan 7d shipped in the Phase 4 checklist (final task).

**Responsibility split.**
- `dialect_base.py` = emit algorithm (walk the AST, call `format_*` hooks, join clauses). Zero dialect specifics.
- `dialects/<name>.py` = override `format_*` hooks. No AST walking.
- `registry.py` = only the `DBType` → dialect class mapping and the fallback warning.

---

## Task 1 — Scaffold `BaseDialect` + `EmitVisitor` skeleton

**Files:**
- Create: `backend/vizql/dialect_base.py`
- Test: `backend/tests/test_vizql_dialect_base.py`

- [ ] **Step 1: Write the failing test**

Write `backend/tests/test_vizql_dialect_base.py`:

```python
"""Surface tests for BaseDialect. Ensures the abstract contract matches
Build_Tableau.md §IV.5 FormatXxx catalogue."""
from __future__ import annotations

import inspect
import pytest

from backend.vizql.dialect_base import BaseDialect


EXPECTED_FORMAT_METHODS = {
    "format_select", "format_join", "format_case", "format_simple_case",
    "format_aggregate", "format_window", "format_cast", "format_drop_column",
    "format_table_dee", "format_default_from_clause",
    "format_set_isolation_level",
    "format_boolean_attribute", "format_float_attribute",
    "format_integer_attribute", "format_int64_attribute",
    "format_top_clause", "format_offset_clause",
    "format_string_literal", "format_identifier",
    "format_date_trunc", "format_datediff", "format_extract",
    "format_current_timestamp", "format_interval",
}


def test_base_dialect_is_abstract() -> None:
    with pytest.raises(TypeError):
        BaseDialect()  # type: ignore[abstract]


def test_format_method_catalogue_matches_build_tableau() -> None:
    missing = EXPECTED_FORMAT_METHODS - {
        name for name, _ in inspect.getmembers(BaseDialect, predicate=inspect.isfunction)
    }
    assert not missing, f"BaseDialect is missing hooks: {sorted(missing)}"


def test_emit_entry_point_signature() -> None:
    sig = inspect.signature(BaseDialect.emit)
    params = list(sig.parameters)
    assert params[:2] == ["self", "qf"], sig
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_base.py -v`
Expected: `ImportError: No module named 'backend.vizql.dialect_base'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/vizql/dialect_base.py`:

```python
"""BaseDialect — visitor that walks SQLQueryFunction and calls format_*
hooks. Dialect-specific subclasses live in backend/vizql/dialects/.

Mirrors Tableau's BaseDialect / SQLDialect (Build_Tableau.md §IV.5).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from . import sql_ast as sa


class BaseDialect(ABC):
    """Abstract dialect. Override format_* methods in subclasses."""

    name: str = "base"

    # ---- Top-level entry (Task 2 fills this in) ----
    def emit(self, qf: sa.SQLQueryFunction) -> str:
        raise NotImplementedError("BaseDialect.emit is implemented in Task 2")

    # ---- §IV.5 format catalogue — abstract on the base, overridable per dialect ----
    @abstractmethod
    def format_select(self, qf: sa.SQLQueryFunction) -> str: ...
    @abstractmethod
    def format_join(self, j: sa.JoinNode) -> str: ...
    @abstractmethod
    def format_case(self, c: sa.Case) -> str: ...
    @abstractmethod
    def format_simple_case(self, c: sa.Case) -> str: ...
    @abstractmethod
    def format_aggregate(self, f: sa.FnCall) -> str: ...
    @abstractmethod
    def format_window(self, w: sa.Window) -> str: ...
    @abstractmethod
    def format_cast(self, c: sa.Cast) -> str: ...
    @abstractmethod
    def format_drop_column(self, table: str, column: str) -> str: ...
    @abstractmethod
    def format_table_dee(self) -> str: ...
    @abstractmethod
    def format_default_from_clause(self) -> str: ...
    @abstractmethod
    def format_set_isolation_level(self, level: str) -> str: ...
    @abstractmethod
    def format_boolean_attribute(self, v: bool) -> str: ...
    @abstractmethod
    def format_float_attribute(self, v: float) -> str: ...
    @abstractmethod
    def format_integer_attribute(self, v: int) -> str: ...
    @abstractmethod
    def format_int64_attribute(self, v: int) -> str: ...
    @abstractmethod
    def format_top_clause(self, n: int) -> str: ...
    @abstractmethod
    def format_offset_clause(self, n: int) -> str: ...
    @abstractmethod
    def format_string_literal(self, v: str) -> str: ...
    @abstractmethod
    def format_identifier(self, ident: str) -> str: ...
    @abstractmethod
    def format_date_trunc(self, part: str, expr: str) -> str: ...
    @abstractmethod
    def format_datediff(self, part: str, a: str, b: str) -> str: ...
    @abstractmethod
    def format_extract(self, part: str, expr: str) -> str: ...
    @abstractmethod
    def format_current_timestamp(self) -> str: ...
    @abstractmethod
    def format_interval(self, part: str, n: int) -> str: ...


__all__ = ["BaseDialect"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_base.py -v`
Expected: 3 PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/dialect_base.py backend/tests/test_vizql_dialect_base.py
git commit -m "feat(analyst-pro): scaffold BaseDialect format catalogue (Plan 7d T1)"
```

---

## Task 2 — Emit algorithm in `BaseDialect.emit`

**Files:**
- Modify: `backend/vizql/dialect_base.py`
- Modify: `backend/tests/test_vizql_dialect_base.py` (add an `emit()` round-trip test with a stub concrete dialect)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_vizql_dialect_base.py`:

```python
from backend.vizql import sql_ast as sa


class _StubDialect(BaseDialect):
    """Only the minimum hooks needed for test_emit_walks_full_ast."""
    name = "stub"
    def format_select(self, qf): return f"<SELECT n={len(qf.projections)}>"
    def format_join(self, j): return f"<JOIN {j.kind}>"
    def format_case(self, c): return f"<CASE n={len(c.whens)}>"
    def format_simple_case(self, c): return f"<SCASE n={len(c.whens)}>"
    def format_aggregate(self, f): return f"<AGG {f.name}>"
    def format_window(self, w): return "<WIN>"
    def format_cast(self, c): return f"<CAST {c.target_type}>"
    def format_drop_column(self, t, c): return f"ALTER TABLE {t} DROP {c}"
    def format_table_dee(self): return "(SELECT 1)"
    def format_default_from_clause(self): return ""
    def format_set_isolation_level(self, level): return f"SET TX {level}"
    def format_boolean_attribute(self, v): return "TRUE" if v else "FALSE"
    def format_float_attribute(self, v): return repr(float(v))
    def format_integer_attribute(self, v): return str(int(v))
    def format_int64_attribute(self, v): return str(int(v))
    def format_top_clause(self, n): return f"LIMIT {n}"
    def format_offset_clause(self, n): return f"OFFSET {n}"
    def format_string_literal(self, v): return "'" + v.replace("'", "''") + "'"
    def format_identifier(self, i): return '"' + i.replace('"', '""') + '"'
    def format_date_trunc(self, p, e): return f"DATE_TRUNC('{p}', {e})"
    def format_datediff(self, p, a, b): return f"DATEDIFF('{p}', {a}, {b})"
    def format_extract(self, p, e): return f"EXTRACT({p} FROM {e})"
    def format_current_timestamp(self): return "CURRENT_TIMESTAMP"
    def format_interval(self, p, n): return f"INTERVAL '{n}' {p}"


def test_emit_walks_full_ast() -> None:
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="c", expression=sa.Column(name="c", table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
    )
    out = _StubDialect().emit(qf)
    assert isinstance(out, str) and out.startswith("<SELECT ")


def test_emit_is_idempotent() -> None:
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="c", expression=sa.Column(name="c", table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
    )
    a, b = _StubDialect().emit(qf), _StubDialect().emit(qf)
    assert a == b
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_base.py::test_emit_walks_full_ast -v`
Expected: FAIL — `NotImplementedError: BaseDialect.emit is implemented in Task 2`.

- [ ] **Step 3: Write minimal implementation**

Replace the placeholder `emit` in `backend/vizql/dialect_base.py` and add the shared walker:

```python
    # ---- Emit (shared across dialects) ----
    def emit(self, qf: sa.SQLQueryFunction) -> str:
        """Walk ``qf`` and render dialect SQL. Pure string building.

        Order: CTEs (WITH), SELECT (via format_select), FROM, WHERE, GROUP BY
        / ROLLUP / CUBE / GROUPING SETS, HAVING, ORDER BY, LIMIT/OFFSET, set
        ops. client_side_filters are NOT emitted (§IV.7 step 8 is client-side).
        """
        qf.validate_structure()
        parts: list[str] = []
        if qf.ctes:
            parts.append(self._emit_ctes(qf.ctes))
        parts.append(self.format_select(qf))
        parts.append("FROM " + self._emit_from(qf.from_))
        if qf.where is not None:
            parts.append("WHERE " + self._emit_expr(qf.where))
        if qf.group_by:
            parts.append("GROUP BY " + ", ".join(self._emit_expr(e) for e in qf.group_by))
        if qf.rollup:
            parts.append("GROUP BY ROLLUP (" + ", ".join(self._emit_expr(e) for e in qf.rollup) + ")")
        if qf.cube:
            parts.append("GROUP BY CUBE (" + ", ".join(self._emit_expr(e) for e in qf.cube) + ")")
        if qf.grouping_sets:
            sets = ", ".join(
                "(" + ", ".join(self._emit_expr(e) for e in s) + ")"
                for s in qf.grouping_sets
            )
            parts.append("GROUP BY GROUPING SETS (" + sets + ")")
        if qf.having is not None:
            parts.append("HAVING " + self._emit_expr(qf.having))
        if qf.order_by:
            parts.append("ORDER BY " + ", ".join(
                f"{self._emit_expr(e)} {'ASC' if asc else 'DESC'}" for e, asc in qf.order_by))
        if qf.limit is not None:
            parts.append(self.format_top_clause(qf.limit))
        body = " ".join(parts)
        if qf.set_op is not None:
            so = qf.set_op
            kind = so.kind + (" ALL" if so.all else "")
            body = f"({body}) {kind} ({self.emit(so.right)})"
        return body

    # ---- Helpers ----
    def _emit_ctes(self, ctes: tuple[sa.CTE, ...]) -> str:
        head = "WITH RECURSIVE " if any(c.recursive for c in ctes) else "WITH "
        return head + ", ".join(
            f"{self.format_identifier(c.name)} AS ({self.emit(c.query)})" for c in ctes
        )

    def _emit_from(self, src: sa.FromSource) -> str:
        if isinstance(src, sa.TableRef):
            qualified = self.format_identifier(src.name) if not src.schema else (
                self.format_identifier(src.schema) + "." + self.format_identifier(src.name))
            alias = (" " + self.format_identifier(src.alias)) if src.alias else ""
            return qualified + alias
        if isinstance(src, sa.JoinNode):
            return self.format_join(src)
        if isinstance(src, sa.SubqueryRef):
            lat = "LATERAL " if src.lateral else ""
            return f"{lat}({self.emit(src.query)}) {self.format_identifier(src.alias)}"
        raise TypeError(f"unknown FromSource: {type(src).__name__}")

    def _emit_expr(self, e: sa.SQLQueryExpression) -> str:
        if isinstance(e, sa.Column):
            tbl = (self.format_identifier(e.table_alias) + ".") if e.table_alias else ""
            ident = "*" if e.name == "*" else self.format_identifier(e.name)
            return tbl + ident
        if isinstance(e, sa.Literal):
            return self._emit_literal(e)
        if isinstance(e, sa.BinaryOp):
            return f"({self._emit_expr(e.left)} {e.op} {self._emit_expr(e.right)})"
        if isinstance(e, sa.FnCall):
            return self._emit_fncall(e)
        if isinstance(e, sa.Case):
            return self.format_case(e)
        if isinstance(e, sa.Cast):
            return self.format_cast(e)
        if isinstance(e, sa.Window):
            return self.format_window(e)
        if isinstance(e, sa.Subquery):
            return f"({self.emit(e.query)})"
        raise TypeError(f"unknown expr: {type(e).__name__}")

    def _emit_literal(self, lit: sa.Literal) -> str:
        v = lit.value
        if v is None:
            return "NULL"
        if isinstance(v, bool):
            return self.format_boolean_attribute(v)
        if isinstance(v, int):
            return self.format_int64_attribute(v) if lit.data_type == "int64" \
                else self.format_integer_attribute(v)
        if isinstance(v, float):
            return self.format_float_attribute(v)
        return self.format_string_literal(str(v))

    def _emit_fncall(self, f: sa.FnCall) -> str:
        AGGS = {"SUM","AVG","COUNT","COUNTD","MIN","MAX","MEDIAN","STDEV",
                "STDEVP","VAR","VARP","PERCENTILE","ATTR","COLLECT"}
        if f.name.upper() in AGGS:
            return self.format_aggregate(f)
        args = ", ".join(self._emit_expr(a) for a in f.args)
        return f"{f.name}({args})"
```

Also add `from typing import Sequence` import if needed. (The file currently only imports `Optional` + `ABC/abstractmethod` — add `Sequence` only if your type annotations use it. The code above does not require it.)

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_base.py -v`
Expected: 5 PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/dialect_base.py backend/tests/test_vizql_dialect_base.py
git commit -m "feat(analyst-pro): implement BaseDialect.emit visitor walker (Plan 7d T2)"
```

---

## Task 3 — Dialect registry + fallback

**Files:**
- Create: `backend/vizql/dialects/__init__.py`
- Create: `backend/vizql/dialects/registry.py`
- Test: `backend/tests/test_vizql_dialect_registry.py`

- [ ] **Step 1: Write the failing test**

```python
"""Registry tests — DBType → BaseDialect dispatch + DuckDB fallback."""
import logging

import pytest

from backend.config import DBType
from backend.vizql.dialects import get_dialect
from backend.vizql.dialects.duckdb import DuckDBDialect


@pytest.mark.parametrize("db_type, expected_name", [
    (DBType.DUCKDB, "duckdb"),
    (DBType.POSTGRESQL, "postgres"),
    (DBType.BIGQUERY, "bigquery"),
    (DBType.SNOWFLAKE, "snowflake"),
])
def test_registered_dialects(db_type, expected_name):
    assert get_dialect(db_type).name == expected_name


def test_unsupported_db_type_falls_back_to_duckdb(caplog):
    with caplog.at_level(logging.WARNING):
        d = get_dialect(DBType.CLICKHOUSE)
    assert isinstance(d, DuckDBDialect)
    assert any("falling back to DuckDB" in m for m in caplog.messages)


def test_fallback_warning_is_logged_only_once(caplog):
    caplog.clear()
    with caplog.at_level(logging.WARNING):
        get_dialect(DBType.ORACLE)
        get_dialect(DBType.ORACLE)
    assert sum("falling back to DuckDB" in m for m in caplog.messages) == 1


def test_same_dialect_instance_returned():
    assert get_dialect(DBType.DUCKDB) is get_dialect(DBType.DUCKDB)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_registry.py -v`
Expected: ImportError — `backend.vizql.dialects` missing.

- [ ] **Step 3: Write minimal implementation**

`backend/vizql/dialects/__init__.py`:

```python
"""Dialect subpackage. Public surface is get_dialect()."""
from .registry import get_dialect

__all__ = ["get_dialect"]
```

`backend/vizql/dialects/registry.py`:

```python
"""DBType → BaseDialect singleton map. Unknown engines fall back to
DuckDB with a single-shot WARNING log."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from backend.config import DBType

if TYPE_CHECKING:
    from ..dialect_base import BaseDialect

_log = logging.getLogger(__name__)
_warned: set[DBType] = set()
_cache: dict[type, "BaseDialect"] = {}


def _load() -> dict[DBType, "BaseDialect"]:
    from .duckdb import DuckDBDialect
    from .postgres import PostgresDialect
    from .bigquery import BigQueryDialect
    from .snowflake import SnowflakeDialect

    def _mk(cls):
        if cls not in _cache:
            _cache[cls] = cls()
        return _cache[cls]

    return {
        DBType.DUCKDB: _mk(DuckDBDialect),
        DBType.POSTGRESQL: _mk(PostgresDialect),
        DBType.COCKROACHDB: _mk(PostgresDialect),  # Postgres wire-compat
        DBType.REDSHIFT: _mk(PostgresDialect),      # Postgres-dialect family
        DBType.BIGQUERY: _mk(BigQueryDialect),
        DBType.SNOWFLAKE: _mk(SnowflakeDialect),
    }


def get_dialect(db_type: DBType) -> "BaseDialect":
    table = _load()
    if db_type in table:
        return table[db_type]
    if db_type not in _warned:
        _log.warning(
            "VizQL: no dialect emitter for %s; falling back to DuckDB. "
            "(Plan 7d only ships duckdb/postgres/bigquery/snowflake; "
            "others are roadmap Phase 4 follow-up.)",
            db_type.value,
        )
        _warned.add(db_type)
    return table[DBType.DUCKDB]


__all__ = ["get_dialect"]
```

Create empty stub files so the registry can import them (Tasks 4–7 fill bodies):

`backend/vizql/dialects/duckdb.py`:

```python
from ..dialect_base import BaseDialect

class DuckDBDialect(BaseDialect):
    name = "duckdb"
    # All format_* bodies land in Task 4; this stub keeps the import live.
    def format_select(self, qf): raise NotImplementedError
    def format_join(self, j): raise NotImplementedError
    def format_case(self, c): raise NotImplementedError
    def format_simple_case(self, c): raise NotImplementedError
    def format_aggregate(self, f): raise NotImplementedError
    def format_window(self, w): raise NotImplementedError
    def format_cast(self, c): raise NotImplementedError
    def format_drop_column(self, table, column): raise NotImplementedError
    def format_table_dee(self): raise NotImplementedError
    def format_default_from_clause(self): raise NotImplementedError
    def format_set_isolation_level(self, level): raise NotImplementedError
    def format_boolean_attribute(self, v): raise NotImplementedError
    def format_float_attribute(self, v): raise NotImplementedError
    def format_integer_attribute(self, v): raise NotImplementedError
    def format_int64_attribute(self, v): raise NotImplementedError
    def format_top_clause(self, n): raise NotImplementedError
    def format_offset_clause(self, n): raise NotImplementedError
    def format_string_literal(self, v): raise NotImplementedError
    def format_identifier(self, ident): raise NotImplementedError
    def format_date_trunc(self, part, expr): raise NotImplementedError
    def format_datediff(self, part, a, b): raise NotImplementedError
    def format_extract(self, part, expr): raise NotImplementedError
    def format_current_timestamp(self): raise NotImplementedError
    def format_interval(self, part, n): raise NotImplementedError
```

Create analogous stub files `postgres.py`, `bigquery.py`, `snowflake.py`, each copying the pattern above with the matching `name = "<engine>"`.

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_registry.py -v`
Expected: 4 PASSED (warning is visible in caplog).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/dialects/ backend/tests/test_vizql_dialect_registry.py
git commit -m "feat(analyst-pro): add dialect registry + fallback to DuckDB (Plan 7d T3)"
```

---

## Task 4 — DuckDB dialect + golden-file tests

**Files:**
- Modify: `backend/vizql/dialects/duckdb.py` (replace stubs with real bodies).
- Create: `backend/tests/vizql/__init__.py` (empty).
- Create: `backend/tests/vizql/_fixtures.py` (shared VisualSpec / SQLQueryFunction builders).
- Create: `backend/tests/test_vizql_dialect_duckdb.py`.
- Create: `backend/tests/golden/vizql/duckdb/*.sql` (15 fixtures, listed below).

Scenarios — these 15 recur across every dialect test file, so the helper factory in `_fixtures.py` builds them once. Each fixture name below is the filename stem under `golden/vizql/<dialect>/`.

| Stem | Description |
|---|---|
| `01_simple_bar.sql` | `SELECT category, SUM(revenue) AS rev FROM sales GROUP BY category ORDER BY rev DESC LIMIT 100` |
| `02_lod_fixed.sql` | FIXED `[Region]` total emitted as correlated subquery joined back (§IV.7 step 4) |
| `03_lod_include.sql` | INCLUDE `[Segment]` emitted as `SUM(...) OVER (PARTITION BY …)` |
| `04_lod_exclude.sql` | EXCLUDE `[Segment]` emitted as `OVER (PARTITION BY other-dims)` |
| `05_context_filter_cte.sql` | Context filter CTE `WITH _ctx AS (SELECT … WHERE …)` then main body inner-joins `_ctx` (§IV.8 Hyper path) |
| `06_measure_filter_having.sql` | `HAVING SUM(qty) > 100` — FilterKind=Measure (§IV.7 step 7) |
| `07_window_running_sum.sql` | `SUM(revenue) OVER (PARTITION BY region ORDER BY order_date ROWS UNBOUNDED PRECEDING)` |
| `08_pivot_unpivot.sql` | `PIVOT` / `UNPIVOT` (DuckDB native; others emit generic CASE pivot — see 7). |
| `09_union.sql` | `UNION ALL` across two compiled SQLQueryFunctions |
| `10_relative_date.sql` | Relative-date filter → `order_date >= DATE_TRUNC('month', CURRENT_TIMESTAMP) - INTERVAL '6' MONTH` |
| `11_categorical_filter.sql` | `WHERE region IN ('West','East')` |
| `12_parameter_substitution.sql` | Parameter `:target_rev` → literal substitution (string literal quoted) |
| `13_snowflake_domain.sql` | "Snowflake domain" (show empty rows) — `LEFT JOIN` against dim cross-join |
| `14_table_calc_flag_no_sql.sql` | `client_side_filters` set — visitor must **not** emit any predicate for them |
| `15_cast_boolean.sql` | `CAST(status AS BOOLEAN)`, `WHERE flag = TRUE` |

- [ ] **Step 1: Write fixture helpers (no test yet)**

`backend/tests/vizql/__init__.py`: empty file.

`backend/tests/vizql/_fixtures.py`:

```python
"""Builds the 15 canonical SQLQueryFunction scenarios used by every
dialect test suite. Pure AST construction — no dialect logic."""
from __future__ import annotations

from typing import Callable

from backend.vizql import sql_ast as sa


def _col(name: str, alias: str = "t") -> sa.Column:
    return sa.Column(name=name, table_alias=alias)


def _lit(v, dt="string") -> sa.Literal:
    return sa.Literal(value=v, data_type=dt)


def scenario_01_simple_bar() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="category", expression=_col("category")),
            sa.Projection(alias="rev", expression=sa.FnCall(
                name="SUM", args=(_col("revenue"),))),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=(_col("category"),),
        order_by=((_col("rev", ""), False),),
        limit=100,
    )


# … _14 other constructors follow the same shape. Each is <30 lines.
# Full bodies inline in the task (see §"Scenario code" below).

SCENARIOS: dict[str, Callable[[], sa.SQLQueryFunction]] = {
    "01_simple_bar": scenario_01_simple_bar,
    # fill remaining 14 after writing bodies below
}
```

Write the remaining 14 scenario builders. For example:

```python
def scenario_02_lod_fixed() -> sa.SQLQueryFunction:
    # FIXED [region] SUM(revenue) ─ correlated subquery
    inner = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region", expression=_col("region", "s")),
            sa.Projection(alias="fx", expression=sa.FnCall(
                name="SUM", args=(_col("revenue", "s"),))),
        ),
        from_=sa.TableRef(name="sales", alias="s"),
        group_by=(_col("region", "s"),),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region", expression=_col("region")),
            sa.Projection(alias="fx", expression=sa.Subquery(
                query=inner, correlated_on=(("region", "region"),))),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=(_col("region"),),
    )

def scenario_03_lod_include() -> sa.SQLQueryFunction:
    win = sa.Window(
        expr=sa.FnCall(name="SUM", args=(_col("revenue"),)),
        partition_by=(_col("region"), _col("segment")),
        order_by=(),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region", expression=_col("region")),
            sa.Projection(alias="inc", expression=win),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
    )

def scenario_04_lod_exclude() -> sa.SQLQueryFunction:
    win = sa.Window(
        expr=sa.FnCall(name="SUM", args=(_col("revenue"),)),
        partition_by=(_col("region"),),          # segment excluded
        order_by=(),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region",  expression=_col("region")),
            sa.Projection(alias="segment", expression=_col("segment")),
            sa.Projection(alias="exc",     expression=win),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
    )

def scenario_05_context_filter_cte() -> sa.SQLQueryFunction:
    ctx_body = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="id", expression=_col("id", "s")),),
        from_=sa.TableRef(name="sales", alias="s"),
        where=sa.BinaryOp(op=">=", left=_col("order_date", "s"),
                          right=_lit("2026-01-01", "date")),
    )
    inner_join = sa.JoinNode(
        kind="INNER",
        left=sa.TableRef(name="sales", alias="t"),
        right=sa.SubqueryRef(query=ctx_body, alias="ctx"),
        on=sa.BinaryOp(op="=", left=_col("id", "t"), right=_col("id", "ctx")),
    )
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="cnt",
                                    expression=sa.FnCall(name="COUNT",
                                                          args=(_lit(1, "int"),))),),
        from_=inner_join,
    )

def scenario_06_measure_filter_having() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region", expression=_col("region")),
            sa.Projection(alias="qsum", expression=sa.FnCall(name="SUM",
                                                              args=(_col("qty"),))),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=(_col("region"),),
        having=sa.BinaryOp(op=">",
                           left=sa.FnCall(name="SUM", args=(_col("qty"),)),
                           right=_lit(100, "int")),
    )

def scenario_07_window_running_sum() -> sa.SQLQueryFunction:
    frame = sa.FrameClause(kind="ROWS", start=("UNBOUNDED", 0), end=("CURRENT_ROW", 0))
    win = sa.Window(
        expr=sa.FnCall(name="SUM", args=(_col("revenue"),)),
        partition_by=(_col("region"),),
        order_by=((_col("order_date"), True),),
        frame=frame,
    )
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="rsum", expression=win),),
        from_=sa.TableRef(name="sales", alias="t"),
    )

def scenario_08_pivot_unpivot() -> sa.SQLQueryFunction:
    # Pivot is a CASE sum pattern; dialects that support native PIVOT can override.
    case = sa.Case(
        whens=((sa.BinaryOp(op="=", left=_col("status"),
                             right=_lit("paid")), sa.FnCall(name="SUM",
                                                              args=(_col("revenue"),))),),
        else_=_lit(0, "int"))
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="paid_sum", expression=case),),
        from_=sa.TableRef(name="orders", alias="t"),
        group_by=(_col("category"),),
    )

def scenario_09_union() -> sa.SQLQueryFunction:
    left = scenario_01_simple_bar()
    right = sa.SQLQueryFunction(
        projections=left.projections,
        from_=sa.TableRef(name="sales_archive", alias="t"),
        group_by=(_col("category"),),
    )
    return sa.SQLQueryFunction(
        projections=left.projections,
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=left.group_by,
        set_op=sa.SetOp(kind="UNION", left=left, right=right, all=True),
    )

def scenario_10_relative_date() -> sa.SQLQueryFunction:
    today = sa.FnCall(name="CURRENT_TIMESTAMP", args=())
    trunc = sa.FnCall(name="DATE_TRUNC", args=(_lit("month"), today))
    lower = sa.BinaryOp(op="-", left=trunc,
                         right=sa.FnCall(name="INTERVAL",
                                          args=(_lit("month"), _lit(6, "int"))))
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="c",
                                    expression=sa.FnCall(name="COUNT",
                                                          args=(_lit(1, "int"),))),),
        from_=sa.TableRef(name="sales", alias="t"),
        where=sa.BinaryOp(op=">=", left=_col("order_date"), right=lower),
    )

def scenario_11_categorical_filter() -> sa.SQLQueryFunction:
    in_list = sa.FnCall(name="IN",
                         args=(_col("region"), _lit("West"), _lit("East")))
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="r", expression=_col("region")),),
        from_=sa.TableRef(name="sales", alias="t"),
        where=in_list,
    )

def scenario_12_parameter_substitution() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="hit",
                                    expression=sa.BinaryOp(op=">",
                                                            left=sa.FnCall(name="SUM",
                                                                             args=(_col("revenue"),)),
                                                            right=_lit(250000, "int"))),),
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=(_col("region"),),
    )

def scenario_13_snowflake_domain() -> sa.SQLQueryFunction:
    dim = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="region", expression=_col("region", "d")),),
        from_=sa.TableRef(name="dim_region", alias="d"),
    )
    join = sa.JoinNode(
        kind="LEFT",
        left=sa.SubqueryRef(query=dim, alias="d"),
        right=sa.TableRef(name="sales", alias="s"),
        on=sa.BinaryOp(op="=", left=_col("region", "d"),
                         right=_col("region", "s")),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region", expression=_col("region", "d")),
            sa.Projection(alias="rev", expression=sa.FnCall(name="SUM",
                                                              args=(_col("revenue", "s"),))),
        ),
        from_=join,
        group_by=(_col("region", "d"),),
    )

def scenario_14_table_calc_flag_no_sql() -> sa.SQLQueryFunction:
    # Table-calc filter is §IV.7 step 8 — client-side. Must NOT appear in SQL.
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="rev",
                                    expression=sa.FnCall(name="SUM",
                                                          args=(_col("revenue"),))),),
        from_=sa.TableRef(name="sales", alias="t"),
        client_side_filters=(sa.BinaryOp(op=">", left=_col("rn"),
                                           right=_lit(5, "int")),),
    )

def scenario_15_cast_boolean() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="flag",
                                    expression=sa.Cast(
                                        expr=_col("status"),
                                        target_type="boolean")),),
        from_=sa.TableRef(name="accounts", alias="t"),
        where=sa.BinaryOp(op="=", left=_col("flag"),
                         right=_lit(True, "bool")),
    )

SCENARIOS.update({
    "02_lod_fixed": scenario_02_lod_fixed,
    "03_lod_include": scenario_03_lod_include,
    "04_lod_exclude": scenario_04_lod_exclude,
    "05_context_filter_cte": scenario_05_context_filter_cte,
    "06_measure_filter_having": scenario_06_measure_filter_having,
    "07_window_running_sum": scenario_07_window_running_sum,
    "08_pivot_unpivot": scenario_08_pivot_unpivot,
    "09_union": scenario_09_union,
    "10_relative_date": scenario_10_relative_date,
    "11_categorical_filter": scenario_11_categorical_filter,
    "12_parameter_substitution": scenario_12_parameter_substitution,
    "13_snowflake_domain": scenario_13_snowflake_domain,
    "14_table_calc_flag_no_sql": scenario_14_table_calc_flag_no_sql,
    "15_cast_boolean": scenario_15_cast_boolean,
})
```

- [ ] **Step 2: Write the failing golden-file test**

`backend/tests/test_vizql_dialect_duckdb.py`:

```python
"""Golden-file round-trip tests for DuckDBDialect.

Contract:
  1. Emit each scenario via DuckDBDialect().emit(qf).
  2. Strip whitespace runs to a single space.
  3. Compare against backend/tests/golden/vizql/duckdb/<stem>.sql.
  4. Execute the emitted SQL against an in-memory DuckDB with the
     fixture schema — a runtime parse error FAILS the scenario.
"""
from __future__ import annotations

import re
from pathlib import Path

import duckdb
import pytest

from backend.vizql.dialects.duckdb import DuckDBDialect
from backend.tests.vizql._fixtures import SCENARIOS


GOLDEN = Path(__file__).parent / "golden" / "vizql" / "duckdb"


def _norm(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


def _fixture_db() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    con.execute("""
        CREATE TABLE sales (id INT, category VARCHAR, region VARCHAR,
            segment VARCHAR, revenue DOUBLE, qty INT, order_date DATE,
            status VARCHAR, flag BOOLEAN);
        CREATE TABLE sales_archive AS SELECT * FROM sales;
        CREATE TABLE dim_region (region VARCHAR);
        CREATE TABLE orders (id INT, category VARCHAR, status VARCHAR,
            revenue DOUBLE);
        CREATE TABLE accounts (id INT, status VARCHAR, flag BOOLEAN);
    """)
    return con


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_duckdb_golden_roundtrip(stem):
    qf = SCENARIOS[stem]()
    emitted = DuckDBDialect().emit(qf)
    gold_path = GOLDEN / f"{stem}.sql"
    assert gold_path.exists(), f"missing golden: {gold_path}"
    assert _norm(emitted) == _norm(gold_path.read_text(encoding="utf-8"))

    # Parse/plan check — execute against fixture schema.
    con = _fixture_db()
    try:
        con.execute(f"EXPLAIN {emitted}")
    finally:
        con.close()


def test_table_calc_filter_is_not_emitted():
    qf = SCENARIOS["14_table_calc_flag_no_sql"]()
    emitted = DuckDBDialect().emit(qf)
    assert "rn" not in emitted, "client_side_filters must stay client-side"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_duckdb.py -v`
Expected: FAIL on every scenario (`NotImplementedError` from the stub + missing golden files).

- [ ] **Step 4: Implement DuckDB dialect**

Replace `backend/vizql/dialects/duckdb.py` with:

```python
"""DuckDB dialect. First-class citizen — our Turbo-Mode twin uses this."""
from __future__ import annotations

from ..dialect_base import BaseDialect
from .. import sql_ast as sa


class DuckDBDialect(BaseDialect):
    name = "duckdb"

    # ---- Clause-level ----
    def format_select(self, qf: sa.SQLQueryFunction) -> str:
        cols = ", ".join(
            f"{self._emit_expr(p.expression)} AS {self.format_identifier(p.alias)}"
            for p in qf.projections
        )
        return f"SELECT {cols}"

    def format_join(self, j: sa.JoinNode) -> str:
        lhs = self._emit_from(j.left)
        rhs = self._emit_from(j.right)
        if j.kind == "CROSS":
            return f"{lhs} CROSS JOIN {rhs}"
        return f"{lhs} {j.kind} JOIN {rhs} ON {self._emit_expr(j.on)}"

    def format_case(self, c: sa.Case) -> str:
        whens = " ".join(
            f"WHEN {self._emit_expr(w)} THEN {self._emit_expr(t)}"
            for w, t in c.whens
        )
        tail = f" ELSE {self._emit_expr(c.else_)}" if c.else_ is not None else ""
        return f"CASE {whens}{tail} END"

    def format_simple_case(self, c: sa.Case) -> str:  # unused on DuckDB but required by base
        return self.format_case(c)

    def format_aggregate(self, f: sa.FnCall) -> str:
        distinct = "DISTINCT " if f.distinct or f.name.upper() == "COUNTD" else ""
        fn = "COUNT" if f.name.upper() == "COUNTD" else f.name
        args = ", ".join(self._emit_expr(a) for a in f.args) if f.args else "*"
        body = f"{fn}({distinct}{args})"
        if f.within_group:
            ob = ", ".join(
                f"{self._emit_expr(e)} {'ASC' if asc else 'DESC'}"
                for e, asc in f.within_group)
            body += f" WITHIN GROUP (ORDER BY {ob})"
        if f.filter_clause is not None:
            body += f" FILTER (WHERE {self._emit_expr(f.filter_clause)})"
        return body

    def format_window(self, w: sa.Window) -> str:
        inner = self._emit_expr(w.expr)
        parts: list[str] = []
        if w.partition_by:
            parts.append("PARTITION BY " + ", ".join(
                self._emit_expr(e) for e in w.partition_by))
        if w.order_by:
            parts.append("ORDER BY " + ", ".join(
                f"{self._emit_expr(e)} {'ASC' if asc else 'DESC'}"
                for e, asc in w.order_by))
        if w.frame is not None:
            parts.append(self._emit_frame(w.frame))
        over = " ".join(parts)
        return f"{inner} OVER ({over})"

    def _emit_frame(self, f: sa.FrameClause) -> str:
        def bound(kind: str, offset: int) -> str:
            if kind == "UNBOUNDED":
                return "UNBOUNDED PRECEDING" if offset <= 0 else "UNBOUNDED FOLLOWING"
            if kind == "CURRENT_ROW":
                return "CURRENT ROW"
            if kind == "PRECEDING":
                return f"{offset} PRECEDING"
            if kind == "FOLLOWING":
                return f"{offset} FOLLOWING"
            raise ValueError(kind)
        return f"{f.kind} BETWEEN {bound(*f.start)} AND {bound(*f.end)}"

    def format_cast(self, c: sa.Cast) -> str:
        # DuckDB prefers :: but CAST is also supported and reads better in goldens.
        return f"CAST({self._emit_expr(c.expr)} AS {c.target_type.upper()})"

    def format_drop_column(self, table: str, column: str) -> str:
        return f"ALTER TABLE {self.format_identifier(table)} DROP COLUMN {self.format_identifier(column)}"

    def format_table_dee(self) -> str:
        return "(SELECT 1)"

    def format_default_from_clause(self) -> str:
        return ""  # DuckDB allows SELECT-without-FROM.

    def format_set_isolation_level(self, level: str) -> str:
        # DuckDB has no isolation levels; emit a comment so the validator is happy.
        return f"-- ISOLATION LEVEL {level}"

    def format_boolean_attribute(self, v: bool) -> str: return "TRUE" if v else "FALSE"
    def format_float_attribute(self, v: float) -> str: return repr(float(v))
    def format_integer_attribute(self, v: int) -> str: return str(int(v))
    def format_int64_attribute(self, v: int) -> str: return f"{int(v)}::BIGINT"

    def format_top_clause(self, n: int) -> str: return f"LIMIT {int(n)}"
    def format_offset_clause(self, n: int) -> str: return f"OFFSET {int(n)}"

    def format_string_literal(self, v: str) -> str:
        return "'" + v.replace("'", "''") + "'"

    def format_identifier(self, ident: str) -> str:
        if ident == "*":
            return "*"
        return '"' + ident.replace('"', '""') + '"'

    def format_date_trunc(self, part: str, expr: str) -> str:
        return f"DATE_TRUNC('{part}', {expr})"

    def format_datediff(self, part: str, a: str, b: str) -> str:
        return f"DATE_DIFF('{part}', {a}, {b})"

    def format_extract(self, part: str, expr: str) -> str:
        return f"EXTRACT({part} FROM {expr})"

    def format_current_timestamp(self) -> str:
        return "CURRENT_TIMESTAMP"

    def format_interval(self, part: str, n: int) -> str:
        return f"INTERVAL '{int(n)}' {part.upper()}"

    # ---- Overrides: DuckDB has native PIVOT — detect and rewrite ----
    # (Not needed for the 15 scenarios; add when a PIVOT AST node lands.)
```

**Special-case the IN function** — `FnCall(name="IN")` must render as an infix `IN (…)`. Add in the top of `format_aggregate` check? No — IN is not an aggregate. Extend `_emit_fncall` in `dialect_base.py` to special-case `IN` before the aggregate dispatch:

```python
# in BaseDialect._emit_fncall, before the AGGS check
if f.name.upper() == "IN":
    left = self._emit_expr(f.args[0])
    rhs = ", ".join(self._emit_expr(a) for a in f.args[1:])
    return f"{left} IN ({rhs})"
if f.name.upper() == "INTERVAL" and len(f.args) == 2:
    part = f.args[0]
    n = f.args[1]
    assert isinstance(part, sa.Literal) and isinstance(n, sa.Literal)
    return self.format_interval(str(part.value), int(n.value))  # type: ignore[arg-type]
if f.name.upper() == "CURRENT_TIMESTAMP" and not f.args:
    return self.format_current_timestamp()
if f.name.upper() == "DATE_TRUNC" and len(f.args) == 2:
    part = f.args[0]
    assert isinstance(part, sa.Literal)
    return self.format_date_trunc(str(part.value), self._emit_expr(f.args[1]))
```

- [ ] **Step 5: Generate goldens**

Run the scenarios once to produce initial goldens:

```bash
cd backend
python -c "
import os, re
from backend.vizql.dialects.duckdb import DuckDBDialect
from backend.tests.vizql._fixtures import SCENARIOS
out = 'tests/golden/vizql/duckdb'
os.makedirs(out, exist_ok=True)
for stem, build in sorted(SCENARIOS.items()):
    sql = DuckDBDialect().emit(build())
    open(f'{out}/{stem}.sql', 'w', encoding='utf-8').write(sql + '\n')
    print('wrote', stem)
"
```

Inspect each `.sql` by hand. Edit to match the expected dialect shape (fix any oddities in the scenario builders, not the dialect) — e.g. confirm `01_simple_bar.sql` reads:

```sql
SELECT "t"."category" AS "category", SUM("t"."revenue") AS "rev" FROM "sales" "t" GROUP BY "t"."category" ORDER BY "rev" DESC LIMIT 100
```

- [ ] **Step 6: Run tests**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_duckdb.py -v`
Expected: 16 PASSED (15 scenarios + 1 table-calc guard).

- [ ] **Step 7: Commit**

```bash
git add backend/vizql/dialect_base.py backend/vizql/dialects/duckdb.py \
        backend/tests/vizql/ backend/tests/test_vizql_dialect_duckdb.py \
        backend/tests/golden/vizql/duckdb/
git commit -m "feat(analyst-pro): DuckDB dialect + 15 golden tests (Plan 7d T4)"
```

---

## Task 5 — Postgres dialect + golden-file tests

**Files:**
- Modify: `backend/vizql/dialects/postgres.py`
- Create: `backend/tests/test_vizql_dialect_postgres.py`
- Create: `backend/tests/golden/vizql/postgres/*.sql`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_vizql_dialect_postgres.py` — same shape as the DuckDB file but uses `PostgresDialect`, `GOLDEN = .../postgres`, and the round-trip executes via `sqlglot.parse_one(sql, dialect="postgres")` (no live Postgres dependency):

```python
from __future__ import annotations
import re
from pathlib import Path

import pytest
import sqlglot

from backend.vizql.dialects.postgres import PostgresDialect
from backend.tests.vizql._fixtures import SCENARIOS


GOLDEN = Path(__file__).parent / "golden" / "vizql" / "postgres"


def _norm(sql: str) -> str: return re.sub(r"\s+", " ", sql).strip()


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_postgres_golden_roundtrip(stem):
    qf = SCENARIOS[stem]()
    emitted = PostgresDialect().emit(qf)
    gold_path = GOLDEN / f"{stem}.sql"
    assert gold_path.exists(), f"missing golden: {gold_path}"
    assert _norm(emitted) == _norm(gold_path.read_text(encoding="utf-8"))
    sqlglot.parse_one(emitted, dialect="postgres")  # raises on parse error


def test_postgres_cast_uses_double_colon_syntax():
    qf = SCENARIOS["15_cast_boolean"]()
    sql = PostgresDialect().emit(qf)
    assert "::" in sql and "CAST(" not in sql.upper() or "::BOOLEAN" in sql.upper()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_postgres.py -v`
Expected: FAIL — `PostgresDialect` still a stub.

- [ ] **Step 3: Implement PostgresDialect**

`backend/vizql/dialects/postgres.py`:

```python
"""Postgres dialect — canonical SQL. Postgres-family DBs (CockroachDB,
Redshift) also route here (see registry.py)."""
from __future__ import annotations

from ..dialect_base import BaseDialect
from .. import sql_ast as sa
from .duckdb import DuckDBDialect


class PostgresDialect(DuckDBDialect):
    """Inherit generic-SQL overrides from DuckDB, change the pieces that
    actually differ from Postgres: cast syntax, int64 literals, DATE_DIFF,
    DROP COLUMN syntax."""
    name = "postgres"

    def format_cast(self, c: sa.Cast) -> str:
        return f"({self._emit_expr(c.expr)})::{c.target_type.upper()}"

    def format_int64_attribute(self, v: int) -> str:
        return f"{int(v)}::BIGINT"

    def format_datediff(self, part: str, a: str, b: str) -> str:
        # Postgres: AGE(b, a) → interval, or EXTRACT(EPOCH FROM ...)/86400.
        return f"(EXTRACT('{part}' FROM {b}) - EXTRACT('{part}' FROM {a}))"

    def format_top_clause(self, n: int) -> str:
        return f"LIMIT {int(n)}"

    def format_interval(self, part: str, n: int) -> str:
        return f"INTERVAL '{int(n)} {part.lower()}'"

    def format_drop_column(self, table: str, column: str) -> str:
        return (f"ALTER TABLE {self.format_identifier(table)} "
                f"DROP COLUMN {self.format_identifier(column)}")

    def format_set_isolation_level(self, level: str) -> str:
        return f"SET TRANSACTION ISOLATION LEVEL {level.upper()}"
```

- [ ] **Step 4: Generate + review goldens**

```bash
cd backend
python -c "
import os
from backend.vizql.dialects.postgres import PostgresDialect
from backend.tests.vizql._fixtures import SCENARIOS
out = 'tests/golden/vizql/postgres'
os.makedirs(out, exist_ok=True)
for stem, build in sorted(SCENARIOS.items()):
    open(f'{out}/{stem}.sql', 'w', encoding='utf-8').write(PostgresDialect().emit(build()) + '\n')
"
```

Spot-check that `15_cast_boolean.sql` uses `::BOOLEAN`, not `CAST(...)`.

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_postgres.py -v`
Expected: 16 PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/dialects/postgres.py \
        backend/tests/test_vizql_dialect_postgres.py \
        backend/tests/golden/vizql/postgres/
git commit -m "feat(analyst-pro): Postgres dialect + 15 golden tests (Plan 7d T5)"
```

---

## Task 6 — BigQuery dialect + golden-file tests

**Files:**
- Modify: `backend/vizql/dialects/bigquery.py`
- Create: `backend/tests/test_vizql_dialect_bigquery.py`
- Create: `backend/tests/golden/vizql/bigquery/*.sql`

Key BigQuery quirks to enforce:
- Backtick identifiers.
- `SAFE_CAST(x AS T)` instead of `CAST` for user-exposed casts.
- `DATE_TRUNC(ts, DAY)` — **argument order reversed**, part is an unquoted identifier.
- `TIMESTAMP_DIFF(b, a, DAY)` for datediff.
- No `::` cast syntax.
- `CURRENT_TIMESTAMP()` with parens.
- `DATE_ADD(ts, INTERVAL n DAY)` for interval arithmetic.

- [ ] **Step 1: Write the failing test**

Mirror Task 5's test file structure. Swap `sqlglot.parse_one(..., dialect="bigquery")`. Add these targeted assertions:

```python
def test_bigquery_identifier_uses_backticks():
    qf = SCENARIOS["01_simple_bar"]()
    assert "`" in BigQueryDialect().emit(qf)
    assert '"' not in BigQueryDialect().emit(qf)


def test_bigquery_date_trunc_argument_order():
    qf = SCENARIOS["10_relative_date"]()
    sql = BigQueryDialect().emit(qf)
    # BigQuery: DATE_TRUNC(ts, MONTH)  — NOT  DATE_TRUNC('month', ts)
    assert "DATE_TRUNC(" in sql
    assert "'month'" not in sql.lower()
    assert ", month" in sql.lower() or ", MONTH" in sql
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_bigquery.py -v`
Expected: FAIL — stub + goldens missing.

- [ ] **Step 3: Implement BigQueryDialect**

`backend/vizql/dialects/bigquery.py`:

```python
"""BigQuery dialect — argument-swapped DATE_TRUNC, backtick idents,
SAFE_CAST, TIMESTAMP_DIFF. Mirrors BigQuerySQLDialect (§IV.5)."""
from __future__ import annotations

from ..dialect_base import BaseDialect
from .. import sql_ast as sa
from .duckdb import DuckDBDialect


class BigQueryDialect(DuckDBDialect):
    name = "bigquery"

    def format_identifier(self, ident: str) -> str:
        if ident == "*":
            return "*"
        return "`" + ident.replace("`", "``") + "`"

    def format_cast(self, c: sa.Cast) -> str:
        return f"SAFE_CAST({self._emit_expr(c.expr)} AS {c.target_type.upper()})"

    def format_int64_attribute(self, v: int) -> str:
        return f"CAST({int(v)} AS INT64)"

    def format_date_trunc(self, part: str, expr: str) -> str:
        return f"DATE_TRUNC({expr}, {part.upper()})"

    def format_datediff(self, part: str, a: str, b: str) -> str:
        return f"TIMESTAMP_DIFF({b}, {a}, {part.upper()})"

    def format_current_timestamp(self) -> str:
        return "CURRENT_TIMESTAMP()"

    def format_interval(self, part: str, n: int) -> str:
        return f"INTERVAL {int(n)} {part.upper()}"

    def format_set_isolation_level(self, level: str) -> str:
        # BigQuery has no session isolation — comment out.
        return f"-- BIGQUERY IGNORES ISOLATION LEVEL {level}"
```

- [ ] **Step 4: Generate + review goldens**

Same generator pattern as Tasks 4–5; inspect each `.sql`.

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_bigquery.py -v`
Expected: 17 PASSED (15 scenarios + 2 BigQuery assertions).

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/dialects/bigquery.py \
        backend/tests/test_vizql_dialect_bigquery.py \
        backend/tests/golden/vizql/bigquery/
git commit -m "feat(analyst-pro): BigQuery dialect + 15 golden tests (Plan 7d T6)"
```

---

## Task 7 — Snowflake dialect + golden-file tests

**Files:**
- Modify: `backend/vizql/dialects/snowflake.py`
- Create: `backend/tests/test_vizql_dialect_snowflake.py`
- Create: `backend/tests/golden/vizql/snowflake/*.sql`

Snowflake quirks:
- Double-quoted identifiers, case-sensitive. Warn if identifier is all-lowercase (surprise on re-query).
- `DATE_TRUNC('DAY', ts)` — same order as Postgres/DuckDB but **uppercase part literal** and uppercase preferred.
- `DATEDIFF(part, a, b)` — part is an unquoted identifier.
- `CAST(x AS T)` or `::` both valid — emit `::` for compactness.
- `INTERVAL '1 DAY'` (single-string form) — same as Postgres.
- `CURRENT_TIMESTAMP()` — optional parens; emit without for brevity.

- [ ] **Step 1: Write the failing test**

Mirror Task 5's test file. Specific asserts:

```python
def test_snowflake_datediff_uses_unquoted_part():
    sql = SnowflakeDialect().format_datediff("day", '"a"', '"b"')
    assert sql == "DATEDIFF(DAY, \"a\", \"b\")"


def test_snowflake_warns_on_all_lowercase_identifier(caplog):
    import logging
    with caplog.at_level(logging.WARNING):
        SnowflakeDialect().format_identifier("price")
    assert any("case-sensitive" in m.lower() for m in caplog.messages)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_snowflake.py -v`
Expected: FAIL — stub + goldens missing.

- [ ] **Step 3: Implement SnowflakeDialect**

`backend/vizql/dialects/snowflake.py`:

```python
"""Snowflake dialect — case-sensitive quoted idents, unquoted datediff part."""
from __future__ import annotations

import logging

from ..dialect_base import BaseDialect
from .. import sql_ast as sa
from .duckdb import DuckDBDialect


_log = logging.getLogger(__name__)
_warned_idents: set[str] = set()


class SnowflakeDialect(DuckDBDialect):
    name = "snowflake"

    def format_identifier(self, ident: str) -> str:
        if ident == "*":
            return "*"
        if ident.islower() and ident not in _warned_idents:
            _log.warning(
                "Snowflake identifier %r is all-lowercase; Snowflake quotes are "
                "case-sensitive — callers must match the exact casing.", ident)
            _warned_idents.add(ident)
        return '"' + ident.replace('"', '""') + '"'

    def format_cast(self, c: sa.Cast) -> str:
        return f"{self._emit_expr(c.expr)}::{c.target_type.upper()}"

    def format_int64_attribute(self, v: int) -> str:
        return f"{int(v)}::NUMBER(38,0)"

    def format_date_trunc(self, part: str, expr: str) -> str:
        return f"DATE_TRUNC('{part.upper()}', {expr})"

    def format_datediff(self, part: str, a: str, b: str) -> str:
        return f"DATEDIFF({part.upper()}, {a}, {b})"

    def format_current_timestamp(self) -> str:
        return "CURRENT_TIMESTAMP"

    def format_interval(self, part: str, n: int) -> str:
        return f"INTERVAL '{int(n)} {part.upper()}'"

    def format_set_isolation_level(self, level: str) -> str:
        return f"-- SNOWFLAKE SESSION ISOLATION IS FIXED — {level}"
```

- [ ] **Step 4: Generate + review goldens**

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_snowflake.py -v`
Expected: 17 PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/dialects/snowflake.py \
        backend/tests/test_vizql_dialect_snowflake.py \
        backend/tests/golden/vizql/snowflake/
git commit -m "feat(analyst-pro): Snowflake dialect + 15 golden tests (Plan 7d T7)"
```

---

## Task 8 — Validator gating

**Files:**
- Modify: `backend/vizql/__init__.py` — add `emit_validated(db_type, qf) -> str`.
- Create: `backend/tests/test_vizql_dialect_validator_gate.py`

Goal: every caller gets a SQL string that is already known to pass the 6-layer validator. Bypassing this helper is a security regression.

- [ ] **Step 1: Write the failing test**

```python
"""Every dialect emit must pass SQLValidator.validate() before it leaves
the module. This is the security invariant — dialect choice does not bypass
the read-only / keyword / AST guard chain (see security-core.md)."""
from __future__ import annotations

import pytest

from backend.config import DBType
from backend.vizql import emit_validated
from backend.tests.vizql._fixtures import SCENARIOS


@pytest.mark.parametrize("db_type", [
    DBType.DUCKDB, DBType.POSTGRESQL, DBType.BIGQUERY, DBType.SNOWFLAKE,
])
@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_emit_validated_passes_sql_validator(db_type, stem):
    qf = SCENARIOS[stem]()
    sql = emit_validated(db_type, qf)
    assert sql.strip().upper().startswith(("SELECT", "WITH"))


def test_emit_validated_raises_on_injected_ddl(monkeypatch):
    from backend.vizql.dialects.duckdb import DuckDBDialect

    def _evil(self, qf):
        return "DROP TABLE users; SELECT 1"

    monkeypatch.setattr(DuckDBDialect, "emit", _evil)
    qf = next(iter(SCENARIOS.values()))()
    with pytest.raises(Exception) as e:
        emit_validated(DBType.DUCKDB, qf)
    assert "validator" in str(e.value).lower() or "drop" in str(e.value).lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_validator_gate.py -v`
Expected: `ImportError: cannot import name 'emit_validated'`.

- [ ] **Step 3: Implement `emit_validated`**

Extend `backend/vizql/__init__.py`:

```python
"""VizQL package. Public API — other modules should import from here."""
from __future__ import annotations

from backend.config import DBType
from backend.sql_validator import SQLValidator

from .dialect_base import BaseDialect
from .dialects import get_dialect
from . import sql_ast as _sql_ast


class DialectValidationError(RuntimeError):
    """Raised when the emitted SQL fails SQLValidator.validate().

    This is a security invariant — never catch-and-run this."""


_VALIDATOR: SQLValidator | None = None


def _validator() -> SQLValidator:
    global _VALIDATOR
    if _VALIDATOR is None:
        _VALIDATOR = SQLValidator()
    return _VALIDATOR


def emit_validated(db_type: DBType, qf: _sql_ast.SQLQueryFunction) -> str:
    sql = get_dialect(db_type).emit(qf)
    ok, message, _ = _validator().validate(sql)
    if not ok:
        raise DialectValidationError(
            f"VizQL {db_type.value} emission failed sql_validator: {message}")
    return sql


__all__ = ["BaseDialect", "get_dialect", "emit_validated",
           "DialectValidationError"]
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_validator_gate.py -v`
Expected: 61 PASSED (15 scenarios × 4 dialects + 1 DDL-injection guard).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/__init__.py backend/tests/test_vizql_dialect_validator_gate.py
git commit -m "feat(analyst-pro): gate dialect emit through sql_validator (Plan 7d T8)"
```

---

## Task 9 — Wire into `waterfall_router.py`

**Files:**
- Modify: `backend/waterfall_router.py`
- Create: `backend/tests/test_vizql_dialect_router_wiring.py`

The router does not currently select a dialect — the VizQL path was not yet operational. Add a lightweight helper method that compiles a `SQLQueryFunction` using the connection's `db_type`. No tier-ordering change; no behavioural change for existing tiers.

- [ ] **Step 1: Write the failing test**

```python
from __future__ import annotations

import pytest

from backend.config import DBType
from backend.waterfall_router import WaterfallRouter
from backend.tests.vizql._fixtures import SCENARIOS


class _FakeTier:
    name = "fake"
    async def can_answer(self, *a, **kw): return False
    async def answer(self, *a, **kw): return None


@pytest.fixture
def router():
    return WaterfallRouter(tiers=[_FakeTier()])


@pytest.mark.parametrize("db_type", [
    DBType.DUCKDB, DBType.POSTGRESQL, DBType.BIGQUERY, DBType.SNOWFLAKE,
    DBType.CLICKHOUSE,  # fallback path
])
def test_router_emits_sql_for_any_db_type(router, db_type):
    qf = SCENARIOS["01_simple_bar"]()
    sql = router.emit_vizql_sql(qf, db_type)
    assert sql.strip().upper().startswith("SELECT")


def test_router_fallback_emits_duckdb_shape_for_unknown_db(router):
    qf = SCENARIOS["15_cast_boolean"]()
    sql = router.emit_vizql_sql(qf, DBType.SAP_HANA)
    assert 'CAST(' in sql.upper()  # DuckDB shape, not "::"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_router_wiring.py -v`
Expected: FAIL — `AttributeError: 'WaterfallRouter' object has no attribute 'emit_vizql_sql'`.

- [ ] **Step 3: Add the helper to `WaterfallRouter`**

Open `backend/waterfall_router.py`. Near the top-of-file imports, add:

```python
from backend.vizql import emit_validated  # Plan 7d T9
```

Inside the `WaterfallRouter` class, anywhere alongside the other public methods, append:

```python
    def emit_vizql_sql(self, qf, db_type) -> str:
        """Emit dialect-specific SQL for ``qf`` given the connection's
        DBType. Uses Plan 7d dialect registry + sql_validator gating.

        Unknown DBType falls back to DuckDB dialect with a logged warning
        (see backend/vizql/dialects/registry.py).
        """
        return emit_validated(db_type, qf)
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_router_wiring.py -v`
Expected: 6 PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/waterfall_router.py backend/tests/test_vizql_dialect_router_wiring.py
git commit -m "feat(analyst-pro): wire WaterfallRouter.emit_vizql_sql dispatch (Plan 7d T9)"
```

---

## Task 10 — Idempotency + dialect isolation

**Files:**
- Create: `backend/tests/test_vizql_dialect_isolation.py`

No production code change — this task catches subtle regressions: shared mutable state between dialects, unstable stringification, cached fixtures mutating across tests.

- [ ] **Step 1: Write the test**

```python
"""Idempotency + dialect isolation guards."""
from __future__ import annotations

import pytest

from backend.config import DBType
from backend.vizql import emit_validated
from backend.vizql.dialects.duckdb import DuckDBDialect
from backend.vizql.dialects.postgres import PostgresDialect
from backend.vizql.dialects.bigquery import BigQueryDialect
from backend.vizql.dialects.snowflake import SnowflakeDialect
from backend.tests.vizql._fixtures import SCENARIOS


ALL = [DuckDBDialect, PostgresDialect, BigQueryDialect, SnowflakeDialect]


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
@pytest.mark.parametrize("cls", ALL, ids=[c.__name__ for c in ALL])
def test_emit_is_idempotent(stem, cls):
    qf = SCENARIOS[stem]()
    a = cls().emit(qf)
    b = cls().emit(qf)
    assert a == b


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_dialects_produce_distinct_output_where_expected(stem):
    if stem in {"14_table_calc_flag_no_sql"}:
        # this scenario has no dialect-specific syntax
        return
    outs = {cls.__name__: cls().emit(SCENARIOS[stem]()) for cls in ALL}
    # BigQuery uses backticks; Snowflake/Postgres/DuckDB use double quotes.
    assert any("`" in s for s in outs.values())
    assert any('"' in s for s in outs.values())


def test_cross_dialect_state_is_not_shared():
    qf = SCENARIOS["15_cast_boolean"]()
    pg = PostgresDialect().emit(qf)
    assert "::BOOLEAN" in pg.upper()
    dk = DuckDBDialect().emit(qf)
    assert "CAST(" in dk.upper() and "::" not in dk
    pg2 = PostgresDialect().emit(qf)
    assert pg2 == pg  # Postgres output did not drift after DuckDB ran
```

- [ ] **Step 2: Run tests**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_isolation.py -v`
Expected: 62 PASSED (60 parametrised + 2 standalone).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_vizql_dialect_isolation.py
git commit -m "test(analyst-pro): dialect idempotency + isolation guards (Plan 7d T10)"
```

---

## Task 11 — Performance benchmark

**Files:**
- Create: `backend/tests/test_vizql_dialect_bench.py`

Target: < 10 ms per 200-node plan emission (pure string building; no DB round-trip).

- [ ] **Step 1: Write the test**

```python
"""Micro-benchmark: emission latency for a synthetic 200-node plan.

Target: < 10 ms per emit call (pure string build, no DB). Runs as a normal
pytest test — no pytest-benchmark dependency needed."""
from __future__ import annotations

import time

import pytest

from backend.vizql import sql_ast as sa
from backend.vizql.dialects.duckdb import DuckDBDialect
from backend.vizql.dialects.postgres import PostgresDialect
from backend.vizql.dialects.bigquery import BigQueryDialect
from backend.vizql.dialects.snowflake import SnowflakeDialect


def _big_plan() -> sa.SQLQueryFunction:
    cols = tuple(
        sa.Projection(alias=f"c{i}", expression=sa.Column(name=f"c{i}", table_alias="t"))
        for i in range(100)
    )
    where = sa.Column(name="c0", table_alias="t")
    for i in range(1, 100):
        where = sa.BinaryOp(
            op="AND",
            left=where,
            right=sa.BinaryOp(op=">",
                              left=sa.Column(name=f"c{i}", table_alias="t"),
                              right=sa.Literal(value=i, data_type="int")))
    return sa.SQLQueryFunction(
        projections=cols,
        from_=sa.TableRef(name="t", alias="t"),
        where=where,
    )


@pytest.mark.parametrize("cls", [
    DuckDBDialect, PostgresDialect, BigQueryDialect, SnowflakeDialect,
])
def test_emit_under_10ms_for_200_node_plan(cls):
    qf = _big_plan()
    d = cls()
    best = float("inf")
    for _ in range(5):
        t0 = time.perf_counter()
        out = d.emit(qf)
        best = min(best, time.perf_counter() - t0)
    assert out
    assert best < 0.010, f"{cls.__name__} took {best*1000:.2f}ms (budget: 10ms)"
```

- [ ] **Step 2: Run the test**

Run: `cd backend && python -m pytest tests/test_vizql_dialect_bench.py -v`
Expected: 4 PASSED. If a dialect exceeds the budget, profile (`python -m cProfile`) before widening the budget — the common culprit is a quadratic string concat in a hot path.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_vizql_dialect_bench.py
git commit -m "test(analyst-pro): dialect emission < 10ms for 200-node plan (Plan 7d T11)"
```

---

## Task 12 — Docs + roadmap mark-shipped

**Files:**
- Create: `backend/vizql/dialects/README.md`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` (mark Plan 7d shipped).

- [ ] **Step 1: Write the dialect README**

`backend/vizql/dialects/README.md`:

```markdown
# VizQL Dialect Emitters (Plan 7d)

`BaseDialect` in `../dialect_base.py` walks `SQLQueryFunction` from Plan 7c.
Each concrete dialect here overrides the 22 `format_*` hooks documented in
`Build_Tableau.md §IV.5`.

## Coverage

| DBType                      | Dialect class        | Notes |
|-----------------------------|----------------------|-------|
| `DUCKDB`                    | `DuckDBDialect`      | First-class; powers Turbo Mode. |
| `POSTGRESQL`, `COCKROACHDB`, `REDSHIFT` | `PostgresDialect`    | Subclasses DuckDB; swaps cast / interval / datediff. |
| `BIGQUERY`                  | `BigQueryDialect`    | Backtick idents; DATE_TRUNC args reversed; SAFE_CAST. |
| `SNOWFLAKE`                 | `SnowflakeDialect`   | Double-quoted case-sensitive idents; DATEDIFF unquoted part. |
| `MYSQL`, `MARIADB`, `SQLITE`, `MSSQL`, `CLICKHOUSE`, `TRINO`, `ORACLE`, `SAP_HANA`, `IBM_DB2`, `DATABRICKS` | — (fallback) | Routed to DuckDB dialect with a single-shot warning. See roadmap Phase 4 follow-ups. |

## Known gaps

- **MDX / DAX** — deferred to Phase 12 Analytics Extensions. `BaseDialect`
  leaves hooks like `FormatSelectMember` / `FormatCurrentMember` /
  `FormatDAXAggregation` unimplemented; add a sibling class when those
  providers land.
- **MSSQL `TOP n`** — MSSQL uses `SELECT TOP n`, not `LIMIT`. Fallback
  dialect emits `LIMIT` which MSSQL rejects. Tracked as a follow-up task.
- **Oracle `FETCH FIRST n ROWS ONLY`** — same as above.
- **LOCKING / ISOLATION** — `format_set_isolation_level` is a stub in
  DuckDB/BigQuery (these engines don't expose transaction isolation that
  the emitter can set). Postgres + Snowflake emit correct syntax.
- **PIVOT / UNPIVOT native syntax** — BaseDialect renders a CASE-based
  rewrite by default. DuckDB + BigQuery + Snowflake all support native
  PIVOT; overriding `format_pivot` is a roadmap follow-up once a PIVOT AST
  node exists (Plan 8 Analytics Pane).

## Security

Every emission goes through `backend.sql_validator.SQLValidator.validate()`
via `backend.vizql.emit_validated()`. Dialect selection does **not**
bypass the 6-layer validator. See `docs/claude/security-core.md`.

## Performance

Target: pure string building, < 10 ms per 200-node plan on a laptop
(`test_vizql_dialect_bench.py`).
```

- [ ] **Step 2: Mark Plan 7d shipped in the roadmap**

Open `docs/analyst_pro_tableau_parity_roadmap.md`. Find the line:

```
**Task count target:** 12.
```

immediately under `### Plan 7d — Dialect Emitters`. Append below the Deliverables list:

```

**Status:** ✅ Shipped — 2026-04-17 (see `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7d-dialect-emitters.md`).
```

- [ ] **Step 3: Verify full suite stays green**

Run: `cd backend && python -m pytest tests/ -v -k "vizql"`
Expected: all Plan 7a/7b/7c/7d tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/vizql/dialects/README.md docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): mark Plan 7d shipped + dialects README (Plan 7d T12)"
```

---

## Done criteria

- All 12 tasks committed; each commit compiles and its tests pass.
- `python -m pytest tests/ -k "vizql"` green.
- `backend/vizql/dialects/{duckdb,postgres,bigquery,snowflake}.py` all implement every `BaseDialect.format_*` hook without `NotImplementedError`.
- `backend/vizql/emit_validated(db_type, qf)` is the single public entrypoint; every call passes through `SQLValidator`.
- 60 golden `.sql` files under `backend/tests/golden/vizql/<dialect>/` exist and match emitted output.
- Roadmap §Plan 7d annotated "Shipped 2026-04-17".

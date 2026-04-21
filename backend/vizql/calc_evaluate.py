"""Plan 8d T7 — single-row calc evaluation against an in-process DuckDB.

Design:

* Formula is parsed + typechecked with Plan 8a's parser/typechecker.
* AST is compiled to `sql_ast` via `calc_to_expression.compile_calc`.
* The expression is rendered by `DuckDBDialect._emit_expr` (the same emitter
  Plan 7d's Turbo Mode uses). We wrap it as:
      SELECT <expr> AS v FROM (VALUES (?, ?, ...)) AS t(col1, col2, ...)
  The VALUES row carries parameter-bound values; no literal interpolation.
* Every generated SELECT goes through `SQLValidator` — same 6-layer check as
  the main pipeline — so DuckDB never sees unvetted SQL.
* Read-only is enforced at two levels: an ephemeral `:memory:` DuckDB
  connection (no attached files) and the validator already rejects DDL.
* Wall-clock timeout: watchdog thread + `con.interrupt()`.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import dataclass
from typing import Any

import duckdb

from config import settings
from sql_validator import SQLValidator
from vizql.calc_parser import parse, ParseError, LexError
from vizql.calc_typecheck import typecheck, TypeError as CalcTypeError
from vizql.calc_to_expression import compile_calc, CompileError
from vizql.calc_functions import Dialect
from vizql.dialects.duckdb import DuckDBDialect
from vizql import calc_ast as ca


_validator = SQLValidator(dialect="duckdb")
_duckdb_dialect = DuckDBDialect()


@dataclass
class EvalResult:
    value: Any
    type: str
    error: str | None
    trace: dict | None = None


def _row_hash(row: dict[str, Any]) -> str:
    payload = json.dumps(row, sort_keys=True, default=str).encode()
    return hashlib.sha256(payload).hexdigest()[:16]


def _formula_hash(formula: str) -> str:
    return hashlib.sha256(formula.encode()).hexdigest()[:16]


_cache: dict[tuple[str, str], tuple[float, EvalResult]] = {}
_cache_lock = threading.Lock()


def _cache_get(key: tuple[str, str]) -> EvalResult | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit is None:
            return None
        ts, val = hit
        if time.time() - ts > settings.CALC_EVAL_CACHE_TTL_SECONDS:
            _cache.pop(key, None)
            return None
        return val


def _cache_put(key: tuple[str, str], value: EvalResult) -> None:
    with _cache_lock:
        _cache[key] = (time.time(), value)


def _build_values_sql(expression_sql: str, row: dict[str, Any]) -> tuple[str, list[Any]]:
    cols = list(row.keys())
    if not cols:
        # No fields — still allow literal expressions like `1 + 1`.
        return f"SELECT {expression_sql} AS v", []
    placeholders = ", ".join(["?"] * len(cols))
    col_list = ", ".join([_duckdb_dialect.format_identifier(c) for c in cols])
    sql = (
        f"SELECT {expression_sql} AS v "
        f"FROM (VALUES ({placeholders})) AS t({col_list})"
    )
    return sql, [row[c] for c in cols]


def _build_values_sql_multi(
    expression_sql: str, rows: list[dict[str, Any]]
) -> tuple[str, list[Any]]:
    """Multi-row VALUES variant. Aggregate formulas collapse to 1 output row;
    per-row formulas return one output row per input row. Columns are drawn
    from the first row — callers must pass homogeneous rows (the sample-rows
    endpoint returns them from a single table, so this holds)."""
    if not rows:
        return f"SELECT {expression_sql} AS v", []
    cols = list(rows[0].keys())
    if not cols:
        return f"SELECT {expression_sql} AS v", []
    per_row_ph = "(" + ", ".join(["?"] * len(cols)) + ")"
    values_clause = ", ".join([per_row_ph] * len(rows))
    col_list = ", ".join([_duckdb_dialect.format_identifier(c) for c in cols])
    sql = (
        f"SELECT {expression_sql} AS v "
        f"FROM (VALUES {values_clause}) AS t({col_list})"
    )
    flat_params: list[Any] = []
    for r in rows:
        flat_params.extend(r.get(c) for c in cols)
    return sql, flat_params


def _run_with_timeout(con: duckdb.DuckDBPyConnection, sql: str, params: list[Any],
                      timeout_s: float) -> Any:
    done = threading.Event()
    result_holder: dict[str, Any] = {}

    def worker() -> None:
        try:
            result_holder["val"] = con.execute(sql, params).fetchone()
        except Exception as exc:  # noqa: BLE001 — propagated via result_holder
            result_holder["exc"] = exc
        finally:
            done.set()

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    if not done.wait(timeout=timeout_s):
        try:
            con.interrupt()
        except Exception:  # noqa: BLE001 — best-effort
            pass
        t.join(timeout=0.5)
        raise TimeoutError(f"calc evaluation exceeded {timeout_s}s")
    if "exc" in result_holder:
        raise result_holder["exc"]
    row_result = result_holder.get("val")
    return row_result[0] if row_result else None


def _run_fetchall_with_timeout(
    con: duckdb.DuckDBPyConnection, sql: str, params: list[Any], timeout_s: float,
) -> list[Any]:
    """Multi-row variant of `_run_with_timeout` — returns every row's first
    column. Aggregate formulas collapse to a 1-element list; per-row
    formulas yield one entry per input row."""
    done = threading.Event()
    result_holder: dict[str, Any] = {}

    def worker() -> None:
        try:
            result_holder["val"] = con.execute(sql, params).fetchall()
        except Exception as exc:  # noqa: BLE001 — propagated via result_holder
            result_holder["exc"] = exc
        finally:
            done.set()

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    if not done.wait(timeout=timeout_s):
        try:
            con.interrupt()
        except Exception:  # noqa: BLE001 — best-effort
            pass
        t.join(timeout=0.5)
        raise TimeoutError(f"calc evaluation exceeded {timeout_s}s")
    if "exc" in result_holder:
        raise result_holder["exc"]
    rows = result_holder.get("val") or []
    return [r[0] for r in rows]


def _normalize_duckdb_value(v: Any, inferred_kind: str | None = None) -> Any:
    """Coerce DuckDB-specific types + calc-AST literal strings to JSON-safe values.

    `calc_to_expression` pre-renders scalar literals via `format_as_literal`,
    producing `sa.Literal(value="1", data_type="integer")`. DuckDB then
    emits/returns them as varchar, so we coerce back to numeric/boolean when
    the calc's inferred type says so.
    """
    import datetime as _dt
    from decimal import Decimal

    if isinstance(v, Decimal):
        if v == v.to_integral_value():
            return int(v)
        return float(v)
    if isinstance(v, (_dt.date, _dt.datetime, _dt.time)):
        return v.isoformat()

    if isinstance(v, str) and inferred_kind is not None:
        if inferred_kind in ("integer",):
            try:
                return int(v)
            except ValueError:
                return v
        if inferred_kind in ("number", "real"):
            try:
                f = float(v)
                return int(f) if f.is_integer() else f
            except ValueError:
                return v
        if inferred_kind == "boolean":
            lv = v.lower()
            if lv in ("true", "t", "1"):
                return True
            if lv in ("false", "f", "0"):
                return False
    return v


def evaluate_formula(
    *, formula: str, row: dict[str, Any], schema_ref: dict[str, str],
    trace: bool = False,
) -> EvalResult:
    """Evaluate a single-row calc formula.

    Raises ValueError for parse / type / compile / validator errors (caller → 400).
    Raises TimeoutError for wall-clock breach (caller → 504).
    """
    key = (_formula_hash(formula), _row_hash(row))
    if not trace:
        cached = _cache_get(key)
        if cached is not None:
            return cached

    try:
        ast = parse(formula, max_depth=settings.MAX_CALC_NESTING)
        inferred = typecheck(ast, schema_ref)
    except (ParseError, LexError) as exc:
        raise ValueError(str(exc)) from exc
    except CalcTypeError as exc:
        raise ValueError(str(exc)) from exc

    try:
        expr = compile_calc(ast, dialect=Dialect.DUCKDB, schema=schema_ref)
    except CompileError as exc:
        raise ValueError(str(exc)) from exc

    expression_sql = _duckdb_dialect._emit_expr(expr)  # type: ignore[attr-defined]
    sql, params = _build_values_sql(expression_sql, row)

    ok, _canonical, err = _validator.validate(sql)
    if not ok:
        raise ValueError(f"sql_validator rejected compiled calc SQL: {err}")

    con = duckdb.connect(database=":memory:", read_only=False)
    try:
        raw_value = _run_with_timeout(
            con, sql, params, settings.CALC_EVAL_TIMEOUT_SECONDS
        )
    finally:
        con.close()

    value = _normalize_duckdb_value(raw_value, inferred.kind.value)

    trace_payload: dict | None = None
    if trace:
        trace_payload = _trace_ast(ast, row, schema_ref)

    result = EvalResult(
        value=value, type=inferred.kind.value, error=None, trace=trace_payload,
    )
    if not trace:
        _cache_put(key, result)
    return result


def evaluate_formula_over_rows(
    *, formula: str, rows: list[dict[str, Any]], schema_ref: dict[str, str],
) -> dict[str, Any]:
    """Multi-row variant. Evaluates the compiled SQL over every sample row;
    returns a scalar when the formula is an aggregate (DuckDB collapses the
    result set to 1 row) and a list of N values otherwise.

    Shape: {value, type, row_count, is_aggregate}. The endpoint surfaces all
    four so the UI can render "over N sample rows" labels unambiguously.
    """
    try:
        ast = parse(formula, max_depth=settings.MAX_CALC_NESTING)
        inferred = typecheck(ast, schema_ref)
    except (ParseError, LexError) as exc:
        raise ValueError(str(exc)) from exc
    except CalcTypeError as exc:
        raise ValueError(str(exc)) from exc

    try:
        expr = compile_calc(ast, dialect=Dialect.DUCKDB, schema=schema_ref)
    except CompileError as exc:
        raise ValueError(str(exc)) from exc

    expression_sql = _duckdb_dialect._emit_expr(expr)  # type: ignore[attr-defined]
    sql, params = _build_values_sql_multi(expression_sql, rows)

    ok, _canonical, err = _validator.validate(sql)
    if not ok:
        raise ValueError(f"sql_validator rejected compiled calc SQL: {err}")

    con = duckdb.connect(database=":memory:", read_only=False)
    try:
        raw_values = _run_fetchall_with_timeout(
            con, sql, params, settings.CALC_EVAL_TIMEOUT_SECONDS
        )
    finally:
        con.close()

    kind = inferred.kind.value
    normalized = [_normalize_duckdb_value(v, kind) for v in raw_values]

    is_aggregate = len(normalized) == 1 and len(rows) > 1
    value: Any = normalized[0] if len(normalized) == 1 else normalized

    return {
        "value": value,
        "type": kind,
        "row_count": len(rows),
        "result_count": len(normalized),
        "is_aggregate": is_aggregate,
        "error": None,
    }


def _trace_ast(ast: ca.CalcExpr, row: dict[str, Any],
               schema_ref: dict[str, str]) -> dict:
    """Walk the Plan 8a AST and evaluate every sub-expression by
    re-serialising the subtree via `to_formula()` and calling the
    evaluator again (trace=False to avoid runaway recursion)."""
    nodes: list[dict] = []
    seen: set[int] = set()  # guard against pathological re-visits

    def visit(node: ca.CalcExpr) -> None:
        node_id = id(node)
        if node_id in seen:
            return
        seen.add(node_id)
        label = ca.to_formula(node)
        value = _eval_subnode(node, row, schema_ref)
        nodes.append({"label": label, "value": value})
        for child in _children(node):
            visit(child)

    visit(ast)
    return {"nodes": nodes}


def _children(node: ca.CalcExpr) -> list[ca.CalcExpr]:
    if isinstance(node, ca.BinaryOp):
        return [node.lhs, node.rhs]
    if isinstance(node, ca.UnaryOp):
        return [node.operand]
    if isinstance(node, ca.FnCall):
        return list(node.args)
    if isinstance(node, ca.IfExpr):
        out: list[ca.CalcExpr] = [node.cond, node.then_]
        for c, b in node.elifs:
            out.extend([c, b])
        if node.else_ is not None:
            out.append(node.else_)
        return out
    if isinstance(node, ca.CaseExpr):
        out = []
        if node.scrutinee is not None:
            out.append(node.scrutinee)
        for c, b in node.whens:
            out.extend([c, b])
        if node.else_ is not None:
            out.append(node.else_)
        return out
    if isinstance(node, ca.LodExpr):
        return [node.body]
    return []


def _eval_subnode(node: ca.CalcExpr, row: dict[str, Any],
                  schema_ref: dict[str, str]) -> Any:
    """Re-serialise the subtree to a formula, evaluate it via the main
    path, and return the raw value. Any failure → None so a single broken
    child never blocks the whole trace."""
    try:
        sub_formula = ca.to_formula(node)
    except Exception:  # noqa: BLE001
        return None
    try:
        res = evaluate_formula(
            formula=sub_formula, row=row, schema_ref=schema_ref, trace=False,
        )
        return res.value
    except Exception:  # noqa: BLE001 — tracing is best-effort
        return None

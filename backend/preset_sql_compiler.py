"""Deterministic SQL compiler for themed-preset slot bindings.

Typed-Seeking-Spring Phase 2. The LLM only picks field names; this
module compiles the canonical BigQuery SQL string. SQL shape is fixed
so the 6-layer `SQLValidator` always sees a well-formed query.

Contract
--------
  compile_kpi_sql(binding, schema, table_ref)
      -> SELECT <agg>(`col`) AS value FROM <table> [WHERE ...] LIMIT 1

  compile_table_sql(binding, schema, table_ref, rank_limit=5)
      -> SELECT `dim`, <agg>(`col`) AS value FROM <table>
         [WHERE ...] GROUP BY `dim` ORDER BY value DESC LIMIT n

  compile_chart_sql(binding, schema, table_ref, time_grain='month',
                    row_limit=5000)
      -> SELECT DATE_TRUNC(`date`, <GRAIN>) AS bucket,
                <agg>(`col`) AS value [, `series` AS series]
         FROM <table>
         [WHERE ...]
         GROUP BY bucket[, series]
         ORDER BY bucket
         LIMIT n

Filter values are **always** parameterised via `@param_0`, `@param_1`, …
Parameters are returned alongside the SQL so the engine can bind them
server-side — never inline user input.

Hardening invariants (see `docs/claude/security-core.md`):
  - Column names must be identifiers (alnum + underscore). We reject
    anything else with a ValueError before writing to SQL.
  - Aggregation verbs are an allowlist — unknown verbs raise.
  - The module NEVER calls the LLM; it is pure string assembly.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple

# Ordered so sqlglot parses the canonical form consistently.
_VALID_AGGS = ("SUM", "AVG", "COUNT", "MIN", "MAX", "COUNT_DISTINCT")
_VALID_TIME_GRAINS = ("day", "week", "month", "quarter", "year")
_VALID_OPS = ("eq", "gt", "lt", "in")

# Identifier whitelist — BigQuery allows letters / digits / underscore.
# We disallow everything else so we never write user-controlled text
# into the SQL body.
_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
# Table refs look like `project.dataset.table` or `dataset.table`.
_TABLE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_\-]*(\.[A-Za-z_][A-Za-z0-9_\-]*){0,2}$")


# ── Helpers ────────────────────────────────────────────────────────

def _validate_identifier(name: str, kind: str) -> None:
    if not isinstance(name, str) or not name:
        raise ValueError(f"Invalid {kind}: empty or non-string")
    if not _ID_RE.match(name):
        raise ValueError(
            f"Invalid {kind} '{name}': only [A-Za-z0-9_] identifiers allowed"
        )


def _validate_table_ref(table_ref: str) -> None:
    if not _TABLE_RE.match(table_ref):
        raise ValueError(
            f"Invalid table_ref '{table_ref}': "
            "must be [project.]dataset.table with identifier parts"
        )


def _quote_ident(name: str) -> str:
    """Back-tick quote a column/simple-identifier for BigQuery."""
    _validate_identifier(name, "column")
    return f"`{name}`"


def _quote_table(table_ref: str) -> str:
    """Back-tick quote each component of a `[project.]dataset.table` ref."""
    _validate_table_ref(table_ref)
    parts = table_ref.split(".")
    return ".".join(f"`{p}`" for p in parts)


def _normalize_agg(agg: str) -> str:
    agg_up = (agg or "").upper()
    if agg_up not in _VALID_AGGS:
        raise ValueError(
            f"Invalid agg '{agg}': must be one of {_VALID_AGGS}"
        )
    return agg_up


def _agg_sql(agg: str, col_sql: str) -> str:
    """Render an aggregation expression against a quoted column SQL fragment."""
    agg_up = _normalize_agg(agg)
    if agg_up == "COUNT_DISTINCT":
        return f"COUNT(DISTINCT {col_sql})"
    return f"{agg_up}({col_sql})"


def _time_grain_keyword(grain: str) -> str:
    g = (grain or "month").lower()
    if g not in _VALID_TIME_GRAINS:
        raise ValueError(
            f"Invalid time_grain '{grain}': must be one of {_VALID_TIME_GRAINS}"
        )
    return g.upper()  # DATE_TRUNC takes an unquoted keyword: DAY / MONTH / …


# String-like dtype tokens we must defensively PARSE on BigQuery. The
# BQ `DATE_TRUNC` / `TIMESTAMP_TRUNC` functions reject string args, so a
# raw VARCHAR column storing "2023-05-01 10:00:00 UTC" would crash the
# whole chart query. Wrapping in `SAFE.PARSE_TIMESTAMP` returns NULL on
# bad rows instead of blowing up — the safe-fail behaviour the dashboard
# auto-gen pipeline assumes. See Plan TSS2 T11.
_STRING_DTYPE_TOKENS = ("VARCHAR", "STRING", "TEXT", "CHAR")


def _date_expr(
    col_name: str,
    schema: Dict[str, Any],
    dialect: str,
) -> str:
    """Render the date expression for DATE_TRUNC, wrapping VARCHAR on BQ.

    On BigQuery when the bound column's dtype is string-like (VARCHAR,
    STRING, TEXT, CHAR) we wrap the reference in
    ``SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S UTC', …)``. Truly typed
    TIMESTAMP / DATE columns pass through unchanged.

    One format for now — the plan's Risks section tracks adding a
    fallback (`%Y-%m-%dT%H:%M:%SZ`) in a later task.
    """
    # Re-validate the identifier here so a caller that hits this helper
    # directly can't sneak a bad name through (defence in depth — the
    # callers also validate via _quote_ident).
    _validate_identifier(col_name, "column")

    columns = (schema or {}).get("columns") or []
    col = next(
        (c for c in columns if (c or {}).get("name") == col_name),
        None,
    )
    dtype = str((col or {}).get("dtype") or "").upper()
    is_string = any(tok in dtype for tok in _STRING_DTYPE_TOKENS)

    quoted = _quote_ident(col_name)
    if is_string and (dialect or "").lower() == "bigquery":
        # CityBikes-style "YYYY-MM-DD HH:MM:SS UTC".
        return f"SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S UTC', {quoted})"
    return quoted


def _compile_where(
    filt: Optional[Dict[str, Any]],
    params: Dict[str, Any],
) -> str:
    """Emit a parameterised ``WHERE col <op> @param_n`` clause, else ''."""
    if not filt:
        return ""
    col = filt.get("column")
    op = (filt.get("op") or "eq").lower()
    val = filt.get("value")
    if op not in _VALID_OPS:
        raise ValueError(f"Invalid filter op '{op}': must be one of {_VALID_OPS}")
    _validate_identifier(col, "filter column")
    next_idx = len(params)
    param_name = f"param_{next_idx}"
    params[param_name] = val
    op_sql = {"eq": "=", "gt": ">", "lt": "<", "in": "IN"}[op]
    if op == "in":
        # IN expects a list — caller supplies one; we still serialise as a
        # single parameter. BigQuery supports array params.
        return f" WHERE {_quote_ident(col)} IN UNNEST(@{param_name})"
    return f" WHERE {_quote_ident(col)} {op_sql} @{param_name}"


# ── Public: KPI ────────────────────────────────────────────────────

def compile_kpi_sql(
    binding: Dict[str, Any],
    schema: Dict[str, Any],
    table_ref: str,
) -> Tuple[str, Dict[str, Any]]:
    """Compile a single-value KPI SQL (scalar result, LIMIT 1)."""
    measure = binding.get("measure") or {}
    col = measure.get("column")
    agg = measure.get("agg", "SUM")
    if not col:
        raise ValueError("KPI binding missing measure.column")

    col_sql = _quote_ident(col)
    agg_sql = _agg_sql(agg, col_sql)
    table_sql = _quote_table(table_ref)

    params: Dict[str, Any] = {}
    where_sql = _compile_where(binding.get("filter"), params)
    sql = f"SELECT {agg_sql} AS value FROM {table_sql}{where_sql} LIMIT 1"
    return sql, params


# ── Public: Table (ranked list) ────────────────────────────────────

def compile_table_sql(
    binding: Dict[str, Any],
    schema: Dict[str, Any],
    table_ref: str,
    rank_limit: int = 5,
) -> Tuple[str, Dict[str, Any]]:
    """Compile a GROUP-BY + ORDER-BY-DESC ranked table query."""
    measure = binding.get("measure") or {}
    dim = binding.get("dimension")
    col = measure.get("column")
    agg = measure.get("agg", "SUM")
    if not col:
        raise ValueError("Table binding missing measure.column")
    if not dim:
        raise ValueError("Table binding missing dimension")

    rank_limit = int(rank_limit or 5)
    if rank_limit <= 0 or rank_limit > 10_000:
        raise ValueError(f"rank_limit {rank_limit} out of bounds (1..10000)")

    dim_sql = _quote_ident(dim)
    col_sql = _quote_ident(col)
    agg_sql = _agg_sql(agg, col_sql)
    table_sql = _quote_table(table_ref)

    params: Dict[str, Any] = {}
    where_sql = _compile_where(binding.get("filter"), params)

    sql = (
        f"SELECT {dim_sql}, {agg_sql} AS value "
        f"FROM {table_sql}"
        f"{where_sql} "
        f"GROUP BY {dim_sql} "
        f"ORDER BY value DESC "
        f"LIMIT {rank_limit}"
    )
    return sql, params


# ── Public: Chart (time-bucketed trend) ────────────────────────────

def compile_chart_sql(
    binding: Dict[str, Any],
    schema: Dict[str, Any],
    table_ref: str,
    time_grain: str = "month",
    row_limit: int = 5000,
    dialect: str = "bigquery",
) -> Tuple[str, Dict[str, Any]]:
    """Compile a time-bucketed chart query.

    Expects ``binding['primary_date']`` — the LLM's picked temporal
    column (fallback via semantic-tag ``primaryDate``). An optional
    ``binding['dimension']`` produces a secondary ``series`` column.

    ``dialect`` defaults to ``"bigquery"`` (only engine the compiler
    currently emits for). When the bound ``primary_date`` column's dtype
    is string-like, the date expression is wrapped in
    ``SAFE.PARSE_TIMESTAMP`` so ``DATE_TRUNC`` receives a real timestamp
    instead of raw text. See ``_date_expr`` + Plan TSS2 T11.
    """
    measure = binding.get("measure") or {}
    col = measure.get("column")
    agg = measure.get("agg", "SUM")
    date_col = binding.get("primary_date") or binding.get("primaryDate")
    series_dim = binding.get("dimension")

    if not col:
        raise ValueError("Chart binding missing measure.column")
    if not date_col:
        raise ValueError("Chart binding missing primary_date")

    row_limit = int(row_limit or 5000)
    if row_limit <= 0 or row_limit > 50_000:
        raise ValueError(f"row_limit {row_limit} out of bounds (1..50000)")

    date_sql = _date_expr(date_col, schema, dialect)
    col_sql = _quote_ident(col)
    agg_sql = _agg_sql(agg, col_sql)
    table_sql = _quote_table(table_ref)
    grain = _time_grain_keyword(time_grain)

    select_series = ""
    group_by_suffix = ""
    if series_dim:
        series_sql = _quote_ident(series_dim)
        select_series = f", {series_sql} AS series"
        group_by_suffix = ", series"

    params: Dict[str, Any] = {}
    where_sql = _compile_where(binding.get("filter"), params)

    sql = (
        f"SELECT DATE_TRUNC({date_sql}, {grain}) AS bucket, "
        f"{agg_sql} AS value{select_series} "
        f"FROM {table_sql}"
        f"{where_sql} "
        f"GROUP BY bucket{group_by_suffix} "
        f"ORDER BY bucket "
        f"LIMIT {row_limit}"
    )
    return sql, params


__all__ = [
    "compile_kpi_sql",
    "compile_table_sql",
    "compile_chart_sql",
]

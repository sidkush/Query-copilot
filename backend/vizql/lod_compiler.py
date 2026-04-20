"""Plan 8b — compile calc_ast.LodExpr into sa.Subquery / sa.Window.

Canonical reference: docs/Build_Tableau.md Section V.2 and Appendix E.2.

    FIXED   -> sa.Subquery  (correlated subquery on fixed dims)    -- stage 4
    INCLUDE -> sa.Window    (partition_by = viz UNION include_dims) -- stage 6
    EXCLUDE -> sa.Window    (partition_by = viz \\ exclude_dims)    -- stage 6

Never bypass the 6-layer SQL validator -- every emitted sa.Subquery passes
through sql_validator.py at execution time via Plan 7d's pipeline.
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import Literal as _Lit, Mapping

from . import calc_ast as ca
from . import sql_ast as sa
from .calc_functions import Dialect  # reuse Plan 8a dialect enum


class LodCompileError(ValueError):
    """Raised when a LodExpr cannot be compiled to sql_ast."""


# A field-identifier string -- Plan 7a's spec.Field.name is the canonical form.
FieldId = str


@dataclass(frozen=True, slots=True)
class LodCompileCtx:
    """Compilation context -- dialect + schema + viz-level granularity.

    viz_granularity: union(Rows-dims, Cols-dims, Detail, Path, Pages) per
    Build_Tableau.md section V.4. Measure pills + Filters-shelf fields
    excluded. Empty = no viz context (the Plan 8a /calcs/validate endpoint
    passes empty granularity; Plan 7 executor passes the viz's real
    granularity).
    """

    dialect: Dialect
    schema: Mapping[str, str]
    table_alias: str
    viz_granularity: frozenset[FieldId] = field(default_factory=frozenset)


@dataclass(frozen=True, slots=True)
class CompiledLod:
    expr: sa.SQLQueryExpression
    kind: _Lit["FIXED", "INCLUDE", "EXCLUDE"]
    stage: _Lit["fixed_lod", "include_exclude_lod"]
    warnings: tuple[str, ...]  # observation-only; never fatal


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _rebind_columns(
    e: sa.SQLQueryExpression, new_alias: str
) -> sa.SQLQueryExpression:
    """Rewrite every Column.table_alias -> new_alias.

    Leaves literals + nested subqueries untouched so the inner projection's
    aggregate body binds to the inner scope while the outer query joins via
    correlated_on.
    """
    if isinstance(e, sa.Column):
        return dataclasses.replace(e, table_alias=new_alias)
    if isinstance(e, sa.BinaryOp):
        return dataclasses.replace(
            e,
            left=_rebind_columns(e.left, new_alias),
            right=_rebind_columns(e.right, new_alias),
        )
    if isinstance(e, sa.FnCall):
        return dataclasses.replace(
            e,
            args=tuple(_rebind_columns(a, new_alias) for a in e.args),
        )
    if isinstance(e, sa.Case):
        whens = tuple(
            (_rebind_columns(c, new_alias), _rebind_columns(b, new_alias))
            for c, b in e.whens
        )
        else_ = (
            _rebind_columns(e.else_, new_alias) if e.else_ is not None else None
        )
        return dataclasses.replace(e, whens=whens, else_=else_)
    if isinstance(e, sa.Cast):
        return dataclasses.replace(e, expr=_rebind_columns(e.expr, new_alias))
    if isinstance(e, sa.Window):
        return dataclasses.replace(
            e,
            expr=_rebind_columns(e.expr, new_alias),
            partition_by=tuple(
                _rebind_columns(p, new_alias) for p in e.partition_by
            ),
        )
    # Literal / nested Subquery: leave as-is.
    return e


def _compile_body(expr: ca.CalcExpr, ctx: LodCompileCtx) -> sa.SQLQueryExpression:
    """Compile the LOD body expression by delegating to calc_to_expression.

    Local import to avoid circular import (calc_to_expression imports this
    module in its LodExpr branch).
    """
    from .calc_to_expression import compile_calc as _compile_calc_expr

    return _compile_calc_expr(
        expr,
        dialect=ctx.dialect,
        schema=ctx.schema,
        table_alias=ctx.table_alias,
    )


# ---------------------------------------------------------------------------
# FIXED  -> correlated subquery
# ---------------------------------------------------------------------------


def _compile_fixed(expr: ca.LodExpr, ctx: LodCompileCtx) -> CompiledLod:
    # Validate every fixed dim is in the schema.
    for d in expr.dims:
        if d.field_name not in ctx.schema:
            raise LodCompileError(
                f"FIXED LOD references field {d.field_name!r} "
                "not in data source schema"
            )

    body_expr = _compile_body(expr.body, ctx)

    inner_alias = f"{ctx.table_alias}_lod_inner"
    group_bys: tuple[sa.SQLQueryExpression, ...] = tuple(
        sa.Column(name=d.field_name, table_alias=inner_alias)
        for d in expr.dims
    )
    body_inner = _rebind_columns(body_expr, new_alias=inner_alias)
    projections: tuple[sa.Projection, ...] = (
        sa.Projection(alias="_lod_val", expression=body_inner),
    )
    inner = sa.SQLQueryFunction(
        projections=projections,
        from_=sa.TableRef(name=ctx.table_alias, alias=inner_alias),
        where=None,
        group_by=group_bys,
        having=None,
        order_by=(),
        limit=None,
    )

    # Correlation: only fixed dims that also appear in viz_granularity.
    # Preserve expr.dims order -> deterministic SQL, easier test asserts.
    correlated_on: tuple[tuple[str, str], ...] = tuple(
        (d.field_name, d.field_name)
        for d in expr.dims
        if d.field_name in ctx.viz_granularity
    )

    subquery = sa.Subquery(query=inner, correlated_on=correlated_on)
    return CompiledLod(
        expr=subquery,
        kind="FIXED",
        stage="fixed_lod",
        warnings=(),
    )


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------


def compile_lod(expr: ca.CalcExpr, ctx: LodCompileCtx) -> CompiledLod:
    if not isinstance(expr, ca.LodExpr):
        raise LodCompileError(
            f"compile_lod expects LodExpr, got {type(expr).__name__}"
        )

    if expr.kind == "FIXED":
        return _compile_fixed(expr, ctx)
    if expr.kind == "INCLUDE":
        raise LodCompileError("INCLUDE LOD compilation not yet implemented (Task 3)")
    if expr.kind == "EXCLUDE":
        raise LodCompileError("EXCLUDE LOD compilation not yet implemented (Task 4)")

    raise LodCompileError(f"unknown LOD kind {expr.kind!r}")


__all__ = [
    "LodCompileError",
    "LodCompileCtx",
    "CompiledLod",
    "Dialect",
    "FieldId",
    "compile_lod",
]

"""CalcExpr → SQL AST Expression compiler. Plan 8a T10.

Consumes a calc AST (calc_ast.CalcExpr) and produces a sql_ast.SQLQueryExpression
that Plan 7d's dialect emitters render. Functions dispatch via FunctionDef
templates; param references substitute via format_as_literal (Plan 7c security).

Imports diverge slightly from the plan:
  - `Dialect` lives in `vizql.calc_functions` (function catalogue), not
    `vizql.dialects.registry`.
  - `format_as_literal` is imported absolutely from `param_substitution`
    because backend/ is on sys.path (same pattern as `query_routes.py`).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional

# Absolute import: backend/ is on sys.path, so param_substitution resolves.
from param_substitution import format_as_literal  # type: ignore[import-not-found]

from . import calc_ast as ca
from . import sql_ast as sa
from .calc_functions import FUNCTIONS, Category, Dialect, TypeKind  # noqa: F401


class CompileError(ValueError):
    """Raised when a calc AST cannot be compiled to sql_ast."""


_TYPE_TO_SQL_KIND: dict[str, str] = {
    "string": "varchar",
    "integer": "integer",
    "number": "double",
    "real": "double",
    "boolean": "boolean",
    "date": "date",
    "datetime": "timestamp",
    "spatial": "geometry",
}


@dataclass(frozen=True, slots=True)
class _Ctx:
    dialect: Dialect
    schema: Mapping[str, str]
    table_alias: str
    params: Mapping[str, Mapping[str, Any]]
    rawsql: bool


def compile_calc(
    expr: ca.CalcExpr,
    dialect: Dialect,
    schema: Mapping[str, str],
    *,
    table_alias: str = "t",
    params: Optional[Mapping[str, Mapping[str, Any]]] = None,
    feature_rawsql_enabled: bool = False,
) -> sa.SQLQueryExpression:
    """Compile a calc AST to a sql_ast expression.

    ``params``: {name: {'type': 'string'|'integer'|..., 'value': ...}},
    used for substituting <Parameters.Name> via format_as_literal.
    ``feature_rawsql_enabled``: Plan 11 endpoint passes
    ``settings.FEATURE_RAWSQL_ENABLED``.
    """
    ctx = _Ctx(
        dialect=dialect,
        schema=schema,
        table_alias=table_alias,
        params=params or {},
        rawsql=feature_rawsql_enabled,
    )
    return _walk(expr, ctx)


def _walk(expr: ca.CalcExpr, ctx: _Ctx) -> sa.SQLQueryExpression:
    if isinstance(expr, ca.Literal):
        ptype = expr.data_type if expr.data_type != "real" else "number"
        rendered = (
            "NULL" if expr.value is None else format_as_literal(expr.value, ptype)
        )
        return sa.Literal(
            value=rendered,
            data_type=_TYPE_TO_SQL_KIND.get(expr.data_type, "unknown"),
        )

    if isinstance(expr, ca.FieldRef):
        kind_str = ctx.schema.get(expr.field_name, "unknown")
        return sa.Column(
            name=expr.field_name,
            table_alias=ctx.table_alias,
            resolved_type=_TYPE_TO_SQL_KIND.get(kind_str, kind_str),
        )

    if isinstance(expr, ca.ParamRef):
        p = ctx.params.get(expr.param_name)
        if p is None:
            raise CompileError(
                f"parameter <Parameters.{expr.param_name}> not bound"
            )
        rendered = format_as_literal(p["value"], p["type"])
        return sa.Literal(
            value=rendered,
            data_type=_TYPE_TO_SQL_KIND.get(p["type"], "unknown"),
        )

    if isinstance(expr, ca.UnaryOp):
        operand = _walk(expr.operand, ctx)
        if expr.op == "NOT":
            return sa.FnCall(name="NOT", args=(operand,), resolved_type="boolean")
        # Unary minus: -x  →  -1 * x
        return sa.BinaryOp(
            op="*",
            left=sa.Literal("-1", "integer"),
            right=operand,
            resolved_type="number",
        )

    if isinstance(expr, ca.BinaryOp):
        return sa.BinaryOp(
            op=expr.op,
            left=_walk(expr.lhs, ctx),
            right=_walk(expr.rhs, ctx),
        )

    if isinstance(expr, ca.IfExpr):
        whens: list[tuple[sa.SQLQueryExpression, sa.SQLQueryExpression]] = [
            (_walk(expr.cond, ctx), _walk(expr.then_, ctx))
        ]
        for c, b in expr.elifs:
            whens.append((_walk(c, ctx), _walk(b, ctx)))
        else_: Optional[sa.SQLQueryExpression] = (
            _walk(expr.else_, ctx) if expr.else_ is not None else None
        )
        return sa.Case(whens=tuple(whens), else_=else_)

    if isinstance(expr, ca.CaseExpr):
        # Simple CASE rewrites scrutinee = arm-cond into searched CASE for sa.Case.
        whens2: list[tuple[sa.SQLQueryExpression, sa.SQLQueryExpression]] = []
        scrutinee_expr = (
            _walk(expr.scrutinee, ctx) if expr.scrutinee is not None else None
        )
        for cond, branch in expr.whens:
            cond_sa = _walk(cond, ctx)
            if scrutinee_expr is not None:
                cond_sa = sa.BinaryOp(
                    op="=",
                    left=scrutinee_expr,
                    right=cond_sa,
                    resolved_type="boolean",
                )
            whens2.append((cond_sa, _walk(branch, ctx)))
        else2: Optional[sa.SQLQueryExpression] = (
            _walk(expr.else_, ctx) if expr.else_ is not None else None
        )
        return sa.Case(whens=tuple(whens2), else_=else2)

    if isinstance(expr, ca.LodExpr):
        # Plan 8b finalises FIXED → correlated subquery.
        #   FIXED  → raise (deferred)
        #   INCLUDE / EXCLUDE → Window over aggregate body.
        if expr.kind == "FIXED":
            raise CompileError(
                "FIXED LOD compilation is owned by Plan 8b; Plan 8a only parses + typechecks it"
            )
        body = _walk(expr.body, ctx)
        partitions = tuple(_walk(d, ctx) for d in expr.dims)
        return sa.Window(expr=body, partition_by=partitions, order_by=())

    if isinstance(expr, ca.FnCall):
        return _compile_fn(expr, ctx)

    raise CompileError(f"unhandled node {type(expr).__name__}")


def _compile_fn(expr: ca.FnCall, ctx: _Ctx) -> sa.SQLQueryExpression:
    if expr.name == "__TUPLE__":
        # IN-list payload — handled by BinaryOp("IN") above; never standalone.
        raise CompileError("__TUPLE__ must appear as RHS of IN")

    fn = FUNCTIONS.get(expr.name)
    if fn is None:
        raise CompileError(f"unknown function {expr.name}")

    if fn.category is Category.PASSTHROUGH and not ctx.rawsql:
        raise CompileError(
            f"{fn.name}: RAWSQL passthrough requires FEATURE_RAWSQL_ENABLED"
        )
    if fn.category is Category.ANALYTICS_EXT:
        raise CompileError(f"{fn.name}: external analytics scripts require Phase 12")
    if fn.is_table_calc:
        raise CompileError(f"{fn.name}: table calc lowering owned by Plan 8c")

    sa_args = tuple(_walk(a, ctx) for a in expr.args)

    # Aggregate / scalar functions both emit sa.FnCall — dialect emitter
    # resolves the template per-dialect at SQL emission time. Plan 8a does
    # NOT pre-render the template string here; it preserves the call-tree
    # so Plan 7d's dialect layer can pick the right per-dialect form.
    return sa.FnCall(
        name=fn.name,
        args=sa_args,
        distinct=(fn.name == "COUNTD"),
    )


__all__ = ["compile_calc", "CompileError"]

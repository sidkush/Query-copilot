"""Plan 8b — compile calc_ast.LodExpr into sa.Subquery / sa.Window.

Canonical reference: docs/Build_Tableau.md Section V.2 and Appendix E.2.

    FIXED   -> sa.Subquery  (correlated subquery on fixed dims)    -- stage 4
    INCLUDE -> sa.Window    (partition_by = viz UNION include_dims) -- stage 6
    EXCLUDE -> sa.Window    (partition_by = viz \\ exclude_dims)    -- stage 6

Never bypass the 6-layer SQL validator -- every emitted sa.Subquery passes
through sql_validator.py at execution time via Plan 7d's pipeline.
"""
from __future__ import annotations

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


def compile_lod(expr: ca.CalcExpr, ctx: LodCompileCtx) -> CompiledLod:
    if not isinstance(expr, ca.LodExpr):
        raise LodCompileError(
            f"compile_lod expects LodExpr, got {type(expr).__name__}"
        )

    if expr.kind == "FIXED":
        raise LodCompileError("FIXED LOD compilation not yet implemented (Task 2)")
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

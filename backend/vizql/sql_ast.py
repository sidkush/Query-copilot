"""SQL AST — SQLQueryFunction + SQLQueryExpression.

Plan 7c (Build_Tableau.md §IV.4) stage 3 of the VizQL pipeline. This
module defines a dialect-agnostic SQL AST that Plan 7d's dialect emitters
consume via the Visitor pattern.

Design rules:

* Every dataclass is ``frozen=True, slots=True``.
* Every sequence field is ``tuple[T, ...]``.
* Zero dialect knowledge lives here (kept in Plan 7d ``dialects/``).
* ``to_sql_generic()`` emits ANSI SQL for debugging + validator round-trip;
  it is NOT the dialect layer.
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import Generic, Iterable, Optional, Protocol, TypeVar, Union

T = TypeVar("T")
T_co = TypeVar("T_co", covariant=True)


@dataclass(frozen=True, slots=True)
class Column:
    name: str
    table_alias: str
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_column(self)


@dataclass(frozen=True, slots=True)
class Literal:
    value: object
    data_type: str
    def accept(self, v: "Visitor[T]") -> T: return v.visit_literal(self)

    @property
    def resolved_type(self) -> str: return self.data_type


@dataclass(frozen=True, slots=True)
class BinaryOp:
    op: str
    left: "SQLQueryExpression"
    right: "SQLQueryExpression"
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_binary_op(self)


@dataclass(frozen=True, slots=True)
class FnCall:
    """Scalar or aggregate. ``filter_clause`` = §IV.6 ``FILTER (WHERE …)``.

    ``within_group`` = §IV.6 ``WITHIN GROUP (ORDER BY …)`` for ordered-set
    aggregates (percentile_cont, percentile_disc).
    """
    name: str
    args: tuple["SQLQueryExpression", ...]
    filter_clause: Optional["SQLQueryExpression"] = None
    within_group: tuple[tuple["SQLQueryExpression", bool], ...] = ()
    distinct: bool = False
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_fn_call(self)


@dataclass(frozen=True, slots=True)
class Case:
    whens: tuple[tuple["SQLQueryExpression", "SQLQueryExpression"], ...]
    else_: Optional["SQLQueryExpression"]
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_case(self)


@dataclass(frozen=True, slots=True)
class Cast:
    expr: "SQLQueryExpression"
    target_type: str
    def accept(self, v: "Visitor[T]") -> T: return v.visit_cast(self)

    @property
    def resolved_type(self) -> str: return self.target_type


@dataclass(frozen=True, slots=True)
class FrameClause:
    """§IV.6 ROWS/RANGE frame.

    ``start`` / ``end`` = ``(kind, offset)``;
    ``kind`` ∈ {``UNBOUNDED``, ``CURRENT_ROW``, ``PRECEDING``, ``FOLLOWING``}.
    """
    kind: str  # "ROWS" | "RANGE"
    start: tuple[str, int]
    end: tuple[str, int]


@dataclass(frozen=True, slots=True)
class Window:
    expr: "SQLQueryExpression"
    partition_by: tuple["SQLQueryExpression", ...]
    order_by: tuple[tuple["SQLQueryExpression", bool], ...]
    frame: Optional[FrameClause] = None
    resolved_type: str = "unknown"
    def accept(self, v: "Visitor[T]") -> T: return v.visit_window(self)


@dataclass(frozen=True, slots=True)
class Subquery:
    query: "SQLQueryFunction"
    correlated_on: tuple[tuple[str, str], ...] = ()  # (outer_col, inner_col)
    def accept(self, v: "Visitor[T]") -> T: return v.visit_subquery(self)

    @property
    def resolved_type(self) -> str: return "unknown"


SQLQueryExpression = Union[Column, Literal, BinaryOp, FnCall, Case, Cast,
                            Window, Subquery]


class Visitor(Protocol, Generic[T_co]):
    def visit(self, node: SQLQueryExpression) -> T_co: return node.accept(self)
    def visit_column(self, n: Column) -> T_co: ...
    def visit_literal(self, n: Literal) -> T_co: ...
    def visit_binary_op(self, n: BinaryOp) -> T_co: ...
    def visit_fn_call(self, n: FnCall) -> T_co: ...
    def visit_case(self, n: Case) -> T_co: ...
    def visit_cast(self, n: Cast) -> T_co: ...
    def visit_window(self, n: Window) -> T_co: ...
    def visit_subquery(self, n: Subquery) -> T_co: ...


class SQLASTStructuralError(Exception):
    """Raised by SQLQueryFunctionChecker / validate_structure (§IV.4)."""


@dataclass(frozen=True, slots=True)
class TableRef:
    name: str
    alias: str
    schema: str = ""


@dataclass(frozen=True, slots=True)
class JoinNode:
    kind: str  # "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS"
    left: "FromSource"
    right: "FromSource"
    on: SQLQueryExpression
    def __post_init__(self) -> None:
        if self.kind not in {"INNER", "LEFT", "RIGHT", "FULL", "CROSS"}:
            raise SQLASTStructuralError(f"bad join kind {self.kind!r}")


@dataclass(frozen=True, slots=True)
class Projection:
    alias: str
    expression: SQLQueryExpression


@dataclass(frozen=True, slots=True)
class CTE:
    name: str
    query: "SQLQueryFunction"
    recursive: bool = False


@dataclass(frozen=True, slots=True)
class SetOp:
    kind: str  # "UNION" | "INTERSECT" | "EXCEPT"
    left: "SQLQueryFunction"
    right: "SQLQueryFunction"
    all: bool = False
    def __post_init__(self) -> None:
        if self.kind not in {"UNION", "INTERSECT", "EXCEPT"}:
            raise SQLASTStructuralError(f"bad set-op kind {self.kind!r}")


FromSource = Union[TableRef, "JoinNode", "SubqueryRef"]


@dataclass(frozen=True, slots=True)
class SubqueryRef:
    query: "SQLQueryFunction"
    alias: str
    lateral: bool = False  # §IV.6 LATERAL


# Width ranking for SQLQueryFunctionForceLongsLast
_TYPE_WIDTH = {
    "bool": 0, "int": 1, "float": 2, "date": 2, "date-time": 3,
    "number": 2, "string": 4, "spatial": 5, "unknown": 3,
}


@dataclass(frozen=True, slots=True)
class SQLQueryFunction:
    """Top-level query node. Mirrors Tableau's SQLQueryFunction (§IV.4)."""
    projections: tuple[Projection, ...]
    from_: FromSource
    ctes: tuple[CTE, ...] = ()
    where: Optional[SQLQueryExpression] = None
    group_by: tuple[SQLQueryExpression, ...] = ()
    grouping_sets: tuple[tuple[SQLQueryExpression, ...], ...] = ()
    rollup: tuple[SQLQueryExpression, ...] = ()
    cube: tuple[SQLQueryExpression, ...] = ()
    having: Optional[SQLQueryExpression] = None
    order_by: tuple[tuple[SQLQueryExpression, bool], ...] = ()
    limit: Optional[int] = None
    set_op: Optional[SetOp] = None
    # §IV.7 cross-SQL flags:
    client_side_filters: tuple[SQLQueryExpression, ...] = ()
    totals_query_required: bool = False
    should_affect_totals: bool = True
    # Diagnostics from optimiser passes (non-fatal)
    diagnostics: tuple[str, ...] = ()

    # ---- SQLQueryFunctionChecker (§IV.4) ----
    def validate_structure(self) -> None:
        if not self.projections:
            raise SQLASTStructuralError("empty projection list")
        has_agg = _any_agg(p.expression for p in self.projections)
        if self.having is not None and not (self.group_by or has_agg):
            raise SQLASTStructuralError(
                "HAVING requires GROUP BY or aggregate projection "
                "(SQLQueryFunctionHavingInSelects)")
        for s in (self.grouping_sets, self.rollup, self.cube):
            if s and not self.group_by:
                raise SQLASTStructuralError(
                    "GROUPING SETS / ROLLUP / CUBE require GROUP BY")

    # ---- SQLQueryFunctionForceLongsLast (§IV.4) ----
    def force_longs_last(self) -> "SQLQueryFunction":
        def w(p: Projection) -> int:
            return _TYPE_WIDTH.get(_resolved_type(p.expression), 3)
        ordered = tuple(sorted(self.projections, key=w))
        return dataclasses.replace(self, projections=ordered)

    # ---- Debugging / validator round-trip only — NOT the dialect layer ----
    def to_sql_generic(self) -> str:
        from .generic_sql import render_generic  # local import to keep module clean
        return render_generic(self)


def _any_agg(exprs: Iterable[SQLQueryExpression]) -> bool:
    AGG = {"SUM", "AVG", "COUNT", "MIN", "MAX", "MEDIAN", "STDEV", "STDEVP",
           "VAR", "VARP", "COUNTD", "PERCENTILE", "ATTR", "COLLECT"}
    def walk(e: SQLQueryExpression) -> bool:
        if isinstance(e, FnCall): return e.name.upper() in AGG
        if isinstance(e, BinaryOp): return walk(e.left) or walk(e.right)
        if isinstance(e, Case):
            return any(walk(c) or walk(v) for c, v in e.whens) or (
                e.else_ is not None and walk(e.else_))
        if isinstance(e, Cast): return walk(e.expr)
        if isinstance(e, Window): return walk(e.expr)
        return False
    return any(walk(e) for e in exprs)


def _resolved_type(e: SQLQueryExpression) -> str:
    return getattr(e, "resolved_type", "unknown")


__all__ = [
    "Column", "Literal", "BinaryOp", "FnCall", "Case", "Cast",
    "FrameClause", "Window", "Subquery",
    "SQLQueryExpression", "Visitor",
    "TableRef", "JoinNode", "Projection", "CTE", "SetOp", "SubqueryRef",
    "SQLQueryFunction", "SQLASTStructuralError",
]

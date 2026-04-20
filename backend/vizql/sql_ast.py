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

from dataclasses import dataclass, field
from typing import Generic, Optional, Protocol, TypeVar, Union

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


# forward ref — filled in Task 2
class SQLQueryFunction:  # pragma: no cover — replaced in T2
    pass


__all__ = [
    "Column", "Literal", "BinaryOp", "FnCall", "Case", "Cast",
    "FrameClause", "Window", "Subquery",
    "SQLQueryExpression", "Visitor", "SQLQueryFunction",
]

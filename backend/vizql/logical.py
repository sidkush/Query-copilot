"""Minerva logical operator IR.

Plan 7b (Build_Tableau.md §IV.1 stage 2) lowers a VisualSpec into a tree
of LogicalOp* nodes. Plan 7c will translate that tree into a dialect-
agnostic SQL AST.

Design rules:

* Every dataclass is ``frozen=True, slots=True`` so nodes are hashable,
  cheap to equality-compare, and safe to use as cache keys in Plan 7e.
* Every sequence field is ``tuple[T, ...]`` (mutable list on a frozen
  dataclass is a silent-mutation bug; tuples participate in hashing).
* Enum values are short lowercase strings, not ints — the logical IR is
  human-readable in test fixtures and does not cross a wire boundary.
* This module imports nothing from ``vizql.proto``; the logical plan is
  deliberately wire-format-agnostic.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Union


class DomainType(Enum):
    """Build_Tableau.md Appendix A.15."""
    SNOWFLAKE = "snowflake"
    SEPARATE = "separate"


class WindowFrameType(Enum):
    """Build_Tableau.md §IV.2 supporting types / §IV.6 frame clause."""
    ROWS = "rows"
    RANGE = "range"


class WindowFrameExclusion(Enum):
    """Build_Tableau.md §IV.6 frame clause exclusion."""
    NO_OTHERS = "no_others"
    CURRENT_ROW = "current_row"
    GROUP = "group"
    TIES = "ties"


class SqlSetType(Enum):
    """Build_Tableau.md §IV.2 supporting types."""
    UNION = "union"
    INTERSECT = "intersect"
    EXCEPT = "except"


@dataclass(frozen=True, slots=True)
class Field:
    """Logical-plan field descriptor. Mirrors spec.Field but string-typed.

    ``role`` values: ``"dimension" | "measure" | "unknown"`` (§A.2).
    ``data_type`` values: see §A.1.
    ``aggregation`` values: see §A.14 (lowercased, ``"none"`` when unagg).
    ``is_disagg`` mirrors spec.Field.is_disagg (§VIII.2).
    """
    id: str
    data_type: str
    role: str
    aggregation: str
    semantic_role: str
    is_disagg: bool


@dataclass(frozen=True, slots=True)
class Column:
    """Expression node: reference a Field by id."""
    field_id: str


@dataclass(frozen=True, slots=True)
class Literal:
    """Expression node: scalar literal with type tag."""
    value: object
    data_type: str


@dataclass(frozen=True, slots=True)
class BinaryOp:
    """Expression node: binary operator (comparison / arithmetic / logical)."""
    op: str
    left: "Expression"
    right: "Expression"


@dataclass(frozen=True, slots=True)
class FnCall:
    """Expression node: scalar / aggregate / table function call."""
    name: str
    args: tuple["Expression", ...]


Expression = Union[Column, Literal, BinaryOp, FnCall]


@dataclass(frozen=True, slots=True)
class NamedExps:
    """Ordered { name -> expression } map. Tuple of pairs preserves order + hashability."""
    entries: tuple[tuple[str, Expression], ...]


@dataclass(frozen=True, slots=True)
class OrderBy:
    """Build_Tableau.md §IV.2 supporting type."""
    identifier_exp: Expression
    is_ascending: bool


@dataclass(frozen=True, slots=True)
class PartitionBys:
    """Build_Tableau.md §IV.2 supporting type - OVER partition."""
    fields: tuple[Field, ...]


@dataclass(frozen=True, slots=True)
class FrameStart:
    kind: str
    offset: int = 0


@dataclass(frozen=True, slots=True)
class FrameEnd:
    kind: str
    offset: int = 0


@dataclass(frozen=True, slots=True)
class FrameSpec:
    """ROWS/RANGE frame clause."""
    frame_type: WindowFrameType
    start: FrameStart
    end: FrameEnd
    exclusion: WindowFrameExclusion = WindowFrameExclusion.NO_OTHERS


@dataclass(frozen=True, slots=True)
class AggExp:
    """Named aggregation expression used by LogicalOpAggregate."""
    name: str
    agg: str
    expr: Expression


@dataclass(frozen=True, slots=True)
class LogicalOpRelation:
    """Build_Tableau.md §IV.2 — base table reference."""
    table: str
    schema: str = ""


@dataclass(frozen=True, slots=True)
class LogicalOpProject:
    """Build_Tableau.md §IV.2 — SELECT projection (rename / drop / add).

    ``renames``      : tuple of (source_field_id, new_name) pairs.
    ``expressions``  : NamedExps of output-column expressions.
    ``calculated_column`` : tuple of (output_name, Expression) pairs —
                            calculated fields attached at projection time.
    """
    input: "LogicalOp"
    renames: tuple[tuple[str, str], ...]
    expressions: NamedExps
    calculated_column: tuple[tuple[str, Expression], ...]


_VALID_FILTER_STAGES = frozenset({
    "extract", "datasource", "context", "fixed_lod", "dimension",
    "include_exclude_lod", "measure", "table_calc", "totals",
})


@dataclass(frozen=True, slots=True)
class LogicalOpSelect:
    """Build_Tableau.md §IV.2 — WHERE filter (dim filter stage by default).

    ``filter_stage`` annotates §IV.7 position so Plan 7c can decide
    WHERE vs CTE vs correlated-subquery placement. Plan 7b records
    only; it does not enforce order.
    """
    input: "LogicalOp"
    predicate: Expression
    filter_stage: str = "dimension"

    def __post_init__(self) -> None:
        if self.filter_stage not in _VALID_FILTER_STAGES:
            raise ValueError(
                f"filter_stage={self.filter_stage!r} not in {sorted(_VALID_FILTER_STAGES)}"
            )


@dataclass(frozen=True, slots=True)
class LogicalOpFilter:
    """Build_Tableau.md §IV.2 — measure-level filter (HAVING)."""
    input: "LogicalOp"
    predicate: Expression
    filter_stage: str = "measure"

    def __post_init__(self) -> None:
        if self.filter_stage not in _VALID_FILTER_STAGES:
            raise ValueError(
                f"filter_stage={self.filter_stage!r} not in {sorted(_VALID_FILTER_STAGES)}"
            )


@dataclass(frozen=True, slots=True)
class LogicalOpAggregate:
    """Build_Tableau.md §IV.2 — GROUP BY + aggregation."""
    input: "LogicalOp"
    group_bys: tuple[Field, ...]
    aggregations: tuple[AggExp, ...]


@dataclass(frozen=True, slots=True)
class LogicalOpOrder:
    """Build_Tableau.md §IV.2 — ORDER BY."""
    input: "LogicalOp"
    order_by: tuple[OrderBy, ...]


@dataclass(frozen=True, slots=True)
class LogicalOpTop:
    """Build_Tableau.md §IV.2 — TOP / LIMIT."""
    input: "LogicalOp"
    limit: int
    is_percentage: bool = False

    def __post_init__(self) -> None:
        if self.limit < 0:
            raise ValueError(f"LogicalOpTop.limit must be >= 0 (got {self.limit})")


@dataclass(frozen=True, slots=True)
class LogicalOpOver:
    """Build_Tableau.md §IV.2 — OVER (windowed expression)."""
    input: "LogicalOp"
    partition_bys: PartitionBys
    order_by: tuple[OrderBy, ...]
    frame: FrameSpec
    expressions: NamedExps


@dataclass(frozen=True, slots=True)
class LogicalOpLookup:
    """Build_Tableau.md §IV.2 — cross-row reference (LOOKUP)."""
    input: "LogicalOp"
    lookup_field: Expression
    offset: int


LogicalOp = Union[
    "LogicalOpRelation",
    "LogicalOpProject",
    "LogicalOpSelect",
    "LogicalOpFilter",
    "LogicalOpAggregate",
    "LogicalOpOrder",
    "LogicalOpTop",
    "LogicalOpOver",
    "LogicalOpLookup",
]  # extended in subsequent tasks


__all__ = [
    "DomainType", "WindowFrameType", "WindowFrameExclusion", "SqlSetType",
    "Field",
    "Column", "Literal", "BinaryOp", "FnCall", "Expression",
    "NamedExps", "OrderBy", "PartitionBys",
    "FrameStart", "FrameEnd", "FrameSpec",
    "AggExp",
    "LogicalOpRelation", "LogicalOpProject",
    "LogicalOpSelect", "LogicalOpFilter",
    "LogicalOpAggregate",
    "LogicalOpOrder", "LogicalOpTop",
    "LogicalOpOver", "LogicalOpLookup",
]

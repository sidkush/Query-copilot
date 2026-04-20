"""Plan 7b - structural validator for logical plans.

Guarantees shipped by this validator:

* No reference cycles (every node visited at most once along any path).
* Every unary op has a non-None ``input``; every binary op has both
  ``left`` and ``right``.
* Every ``LogicalOpAggregate`` has either a non-empty ``group_bys`` tuple
  or at least one ``AggExp`` — never both empty (that's a grammar error
  from the compiler).

Deeper type/schema derivation is Plan 7c's responsibility.
"""

from __future__ import annotations

from typing import cast

from vizql.logical import (
    LogicalOp, LogicalOpAggregate, LogicalOpDomain, LogicalOpFilter,
    LogicalOpIntersect, LogicalOpLookup, LogicalOpOrder, LogicalOpOver,
    LogicalOpProject, LogicalOpRelation, LogicalOpSelect, LogicalOpTop,
    LogicalOpUnion, LogicalOpUnpivot, LogicalOpValuestoColumns,
)


class LogicalPlanError(ValueError):
    """Raised by validate_logical_plan on structural violations."""


_UNARY_OP_TYPES = (
    LogicalOpProject, LogicalOpSelect, LogicalOpAggregate, LogicalOpOrder,
    LogicalOpTop, LogicalOpOver, LogicalOpLookup, LogicalOpUnpivot,
    LogicalOpValuestoColumns, LogicalOpDomain, LogicalOpFilter,
)
_BINARY_OP_TYPES = (LogicalOpUnion, LogicalOpIntersect)


def validate_logical_plan(plan: LogicalOp) -> None:
    """Walk the plan; raise LogicalPlanError on any violation."""
    _walk(plan, visiting=set())


def _walk(node: object, visiting: set[int]) -> None:
    nid = id(node)
    if nid in visiting:
        raise LogicalPlanError(f"cycle detected at node {type(node).__name__}")
    visiting.add(nid)
    try:
        if isinstance(node, LogicalOpRelation):
            return
        if isinstance(node, _UNARY_OP_TYPES):
            child = getattr(node, "input", None)
            if child is None:
                raise LogicalPlanError(
                    f"{type(node).__name__} has missing input"
                )
            _walk(child, visiting)
            if isinstance(node, LogicalOpAggregate):
                _check_aggregate(node)
            return
        if isinstance(node, _BINARY_OP_TYPES):
            left = getattr(node, "left", None)
            right = getattr(node, "right", None)
            if left is None or right is None:
                raise LogicalPlanError(
                    f"{type(node).__name__} has missing input branch"
                )
            _walk(left, visiting)
            _walk(right, visiting)
            return
        raise LogicalPlanError(f"unknown logical op type: {type(node).__name__}")
    finally:
        visiting.discard(nid)


def _check_aggregate(node: LogicalOpAggregate) -> None:
    if not node.group_bys and not node.aggregations:
        raise LogicalPlanError(
            "LogicalOpAggregate with empty group_bys and no aggregations is invalid"
        )
    # Cast kept explicit so mypy --strict accepts the narrowing site.
    _ = cast(LogicalOpAggregate, node)

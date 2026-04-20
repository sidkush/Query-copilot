"""Plan 8b — FIXED LOD cost estimator + CalcWarning.

Observation-only. Never raises, never blocks a user. Build_Tableau.md
Section XIX.1 anti-pattern #1: "FIXED LOD on high-cardinality dimension —
correlated subquery blows up."
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from . import calc_ast as ca


class SchemaStats(Protocol):
    """Per-field distinct-count lookup.

    Plan 7 wraps `schema_intelligence.profile_dataframe()` `cardinality`
    per column; production callers pass that adapter. Tests pass a stub.
    """

    def distinct_count(self, field_name: str) -> int: ...


@dataclass(frozen=True, slots=True)
class LodCost:
    dims: tuple[str, ...]
    estimate: int


@dataclass(frozen=True, slots=True)
class CalcWarning:
    kind: str              # "expensive_fixed_lod"
    estimate: int
    suggestion: str
    details: str = ""


def estimate_fixed_lod_cost(expr: ca.LodExpr, stats: SchemaStats) -> LodCost:
    """Cartesian of distinct counts across fixed dims.

    Matches Tableau's Hyper cost model well enough for an authoring
    warning: the correlated subquery produces one row per unique
    fixed-dim tuple. If any dim lacks stats we treat the cost as 0
    (unknown) to avoid false-positive warnings.
    """
    dims = tuple(d.field_name for d in expr.dims)
    product = 1
    for d in dims:
        c = stats.distinct_count(d)
        if c <= 0:
            return LodCost(dims=dims, estimate=0)
        product *= c
    return LodCost(dims=dims, estimate=product)


def analyze_fixed_lod(
    expr: ca.LodExpr,
    stats: SchemaStats,
    *,
    threshold: int = 1_000_000,
) -> list[CalcWarning]:
    """Emit an `expensive_fixed_lod` warning when FIXED LOD cost exceeds threshold.

    Observation-only: never raises, never blocks. INCLUDE / EXCLUDE
    variants return an empty list — the correlated-subquery trap only
    applies to FIXED.
    """
    if expr.kind != "FIXED":
        return []
    cost = estimate_fixed_lod_cost(expr, stats)
    if cost.estimate <= threshold:
        return []
    dim_list = ", ".join(cost.dims)
    return [
        CalcWarning(
            kind="expensive_fixed_lod",
            estimate=cost.estimate,
            suggestion=(
                f"FIXED LOD on high-cardinality dim(s) [{dim_list}] — "
                f"estimated {cost.estimate:,} rows in correlated subquery. "
                "Promote a narrowing filter to context, or reduce fixed-dim count."
            ),
            details=(
                f"Build_Tableau.md Section XIX.1 anti-pattern #1: "
                f"FIXED LOD on high-cardinality dimension makes the correlated "
                f"subquery blow up. Threshold = {threshold:,} rows."
            ),
        )
    ]


__all__ = [
    "SchemaStats",
    "LodCost",
    "CalcWarning",
    "estimate_fixed_lod_cost",
    "analyze_fixed_lod",
]

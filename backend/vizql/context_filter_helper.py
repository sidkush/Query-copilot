"""Plan 8b — context-promotion hint for §IV.8 / §XXV.3 #1 authoring friction.

Tableau's most-reported month-one trap: dim filter does not narrow FIXED LOD
unless the filter is Added to Context (→ runs at stage 3 CTE, before FIXED
at stage 4). This module detects the trap at authoring time and emits a hint.

Authoring-time only. Never rewrites plans. Never runs SQL.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

from . import calc_ast as ca


@dataclass(frozen=True, slots=True)
class FilterHint:
    field_name: str
    kind: str              # "dimension" | "measure" | "table_calc"
    domain_size: int       # total distinct values declared on the filter card
    selected_size: int     # values currently selected


@dataclass(frozen=True, slots=True)
class ContextPromotionHint:
    field_name: str
    message: str           # UI-facing copy
    lod_ids: tuple[str, ...] = ()  # FIXED LODs that would benefit


_NARROW_RATIO = 0.5  # > 50% narrowing


def should_promote_to_context(
    filt: FilterHint,
    lods: Sequence[ca.LodExpr],
) -> Optional[ContextPromotionHint]:
    if filt.kind != "dimension":
        return None
    if filt.domain_size <= 0:
        return None
    narrowing = 1.0 - (filt.selected_size / filt.domain_size)
    if narrowing <= _NARROW_RATIO:
        return None

    affected = [
        l for l in lods
        if l.kind == "FIXED"
        and filt.field_name not in {d.field_name for d in l.dims}
    ]
    if not affected:
        return None

    # Message quotes §XXV.3 authoring-friction language.
    msg = (
        f"Promote '[{filt.field_name}]' filter to context — "
        "FIXED LOD computed BEFORE dimension filter stage per Tableau filter order. "
        "Right-click the filter → Add to Context."
    )
    return ContextPromotionHint(
        field_name=filt.field_name,
        message=msg,
        lod_ids=(),  # caller can enrich with LodCalculation.id if available
    )


__all__ = ["FilterHint", "ContextPromotionHint", "should_promote_to_context"]

"""§IV.7 nine-stage filter order-of-operations — enforcement.

Stages in canonical order (never reorder; §IV.7 is the spec):

  1. extract              — on .hyper build; we treat as DuckDB extract config.
  2. datasource           — WHERE on every query against the DS.
  3. context              — CTE wrapping the plan (Hyper/DuckDB); legacy RDBMS
                            emits #Tableau_Temp_ at the dialect layer (Plan 7d).
  4. fixed_lod            — correlated subquery; Plan 7c/T8 owns emission.
                            Critically: NOT filtered by step 5 unless promoted
                            to step 3.
  5. dimension            — outer WHERE.
  6. include_exclude_lod  — window OVER; Plan 7c/T8 owns emission.
  7. measure              — HAVING.
  8. table_calc           — client-side flag (``client_side_filters``).
                            NOT emitted to SQL.
  9. totals               — triggers ``totals_query_required=True``. Plan 7d
                            emits the second query.  ``should_affect_totals``
                            flag is preserved here so Plan 7d knows whether to
                            replay stages 2/5 on the totals query.

Also preserves:

  * ``case_sensitive`` flag — controls Plan 7d's ``LIKE`` vs ``ILIKE`` choice
    on wildcard filters.
"""
from __future__ import annotations
import dataclasses
from dataclasses import dataclass
from typing import Sequence
from . import sql_ast as sa


FILTER_STAGES = (
    "extract", "datasource", "context",
    "fixed_lod", "dimension", "include_exclude_lod",
    "measure", "table_calc", "totals",
)
_VALID = frozenset(FILTER_STAGES)


@dataclass(frozen=True, slots=True)
class StagedFilter:
    stage: str
    predicate: sa.SQLQueryExpression
    case_sensitive: bool = True
    should_affect_totals: bool = True

    def __post_init__(self) -> None:
        if self.stage not in _VALID:
            raise ValueError(
                f"stage={self.stage!r} not in {FILTER_STAGES}")


def apply_filters_in_order(
    plan: sa.SQLQueryFunction,
    staged_filters: Sequence[StagedFilter],
) -> sa.SQLQueryFunction:
    buckets: dict[str, list[StagedFilter]] = {s: [] for s in FILTER_STAGES}
    for sf in staged_filters: buckets[sf.stage].append(sf)

    out = plan

    # 1. Extract — metadata; record as diagnostic (Plan 7d consumes).
    if buckets["extract"]:
        preds = " AND ".join(_show(f.predicate) for f in buckets["extract"])
        out = dataclasses.replace(out, diagnostics=out.diagnostics + (
            f"extract_filter: {preds}",))

    # 2. DataSource — WHERE on base.
    if buckets["datasource"]:
        out = _and_where(out, _join(buckets["datasource"]))

    # 3. Context — CTE wrapping plan.
    if buckets["context"]:
        inner = dataclasses.replace(out, ctes=())
        inner = _and_where(inner, _join(buckets["context"]))
        cte = sa.CTE(name=f"ctx_{len(out.ctes)}", query=inner)
        # replace FROM with a SubqueryRef pointing at the CTE name
        out = dataclasses.replace(
            out,
            ctes=out.ctes + (cte,),
            from_=sa.TableRef(name=cte.name, alias=cte.name),
        )

    # 4. FIXED LOD — marker + subquery predicate; Task 8 emits correlated
    # subquery. DO NOT fold into the outer WHERE of step 5.
    if buckets["fixed_lod"]:
        preds = " AND ".join(_show(f.predicate) for f in buckets["fixed_lod"])
        out = dataclasses.replace(out, diagnostics=out.diagnostics + (
            f"fixed_lod_filter: {preds}",))

    # 5. Dimension — outer WHERE.
    if buckets["dimension"]:
        out = _and_where(out, _join(buckets["dimension"]))

    # 6. INCLUDE/EXCLUDE — marker; Task 8 emits window.
    if buckets["include_exclude_lod"]:
        preds = " AND ".join(_show(f.predicate) for f in buckets["include_exclude_lod"])
        out = dataclasses.replace(out, diagnostics=out.diagnostics + (
            f"include_exclude_lod: {preds}",))

    # 7. Measure — HAVING.
    if buckets["measure"]:
        out = _and_having(out, _join(buckets["measure"]))

    # 8. Table calc — client-side.
    if buckets["table_calc"]:
        out = dataclasses.replace(
            out,
            client_side_filters=out.client_side_filters +
                tuple(f.predicate for f in buckets["table_calc"]),
        )

    # 9. Totals — separate query flag.
    if buckets["totals"]:
        # all totals filters share the flag; non-shouldAffectTotals wins
        affect = all(f.should_affect_totals for f in buckets["totals"])
        out = dataclasses.replace(
            out,
            totals_query_required=True,
            should_affect_totals=affect,
        )

    out.validate_structure()
    return out


def _and_where(qf: sa.SQLQueryFunction, pred: sa.SQLQueryExpression) -> sa.SQLQueryFunction:
    if qf.where is None: return dataclasses.replace(qf, where=pred)
    return dataclasses.replace(qf,
                                where=sa.BinaryOp(op="AND", left=qf.where, right=pred))


def _and_having(qf: sa.SQLQueryFunction, pred: sa.SQLQueryExpression) -> sa.SQLQueryFunction:
    if qf.having is None: return dataclasses.replace(qf, having=pred)
    return dataclasses.replace(qf,
                                having=sa.BinaryOp(op="AND", left=qf.having, right=pred))


def _join(fs: list[StagedFilter]) -> sa.SQLQueryExpression:
    if len(fs) == 1: return fs[0].predicate
    out = fs[0].predicate
    for f in fs[1:]: out = sa.BinaryOp(op="AND", left=out, right=f.predicate)
    return out


def _show(e: sa.SQLQueryExpression) -> str:
    if isinstance(e, sa.Column):
        return f"{e.table_alias}.{e.name}" if e.table_alias else e.name
    if isinstance(e, sa.Literal): return str(e.value)
    if isinstance(e, sa.BinaryOp): return f"{_show(e.left)} {e.op} {_show(e.right)}"
    return repr(e)


# ---------------------------------------------------------------------------
# Plan 8b §V.2 — LOD placement on the 9-stage filter pipeline.
#
# FIXED LOD lands at stage 4 (`fixed_lod`), so it is NOT filtered by stage-5
# dim filters — matching §IV.7 semantics. INCLUDE/EXCLUDE lands at stage 6
# (`include_exclude_lod`), running after measure-aggregation on the outer
# WHERE. JoinLODOverrides (§V.2) is a per-viz opt-out list: any LOD id in
# `overrides` is treated as already-hand-placed by the user's .twb edit and
# auto-placement steps over it.
# ---------------------------------------------------------------------------

_LOD_STAGES: frozenset[str] = frozenset({"fixed_lod", "include_exclude_lod"})


@dataclass(frozen=True, slots=True)
class LodPlacement:
    """One LOD calc compiled + placed in the filter stream.

    Attributes
    ----------
    lod_id:
        The ``VisualSpec.lod_calculations[i].id`` this placement represents.
        Used for override matching against ``VisualSpec.join_lod_overrides``.
    stage:
        One of ``"fixed_lod"`` (§IV.7 stage 4) or ``"include_exclude_lod"``
        (§IV.7 stage 6).
    predicate:
        The compiled LOD predicate / marker expression that the downstream
        emitter (Plan 7d) turns into a correlated subquery or window.
    """

    lod_id: str
    stage: str
    predicate: sa.SQLQueryExpression

    def __post_init__(self) -> None:
        if self.stage not in _LOD_STAGES:
            raise ValueError(
                "LodPlacement.stage must be one of "
                f"{sorted(_LOD_STAGES)!r}, got {self.stage!r}"
            )


def place_lod_in_order(
    plan: sa.SQLQueryFunction,
    lod_placements: Sequence[LodPlacement],
    overrides: Sequence[str] = (),
) -> sa.SQLQueryFunction:
    """Append each LOD placement to the canonical StagedFilter stream.

    §IV.7: FIXED at step 4, INCLUDE/EXCLUDE at step 6. The existing
    ``apply_filters_in_order`` machinery encodes stage 4 as a diagnostic
    marker (the FIXED correlated subquery is emitted by Plan 7d) and stage
    6 as a window-layer marker — we reuse both unchanged.

    Parameters
    ----------
    plan:
        The plan to fold LOD placements onto.
    lod_placements:
        The LOD placements, each tagged with ``lod_id``, ``stage``, and a
        compiled predicate.
    overrides:
        ``VisualSpec.join_lod_overrides`` — LOD IDs whose placement was
        hand-edited in the source .twb XML. Any placement whose ``lod_id``
        appears here is skipped; the caller is responsible for having
        already spliced the hand-edited version into ``plan`` so auto-
        placement never clobbers a user override (Plan 8b §V.2).
    """
    override_set: frozenset[str] = frozenset(overrides)
    staged: list[StagedFilter] = []
    for p in lod_placements:
        if p.lod_id in override_set:
            # User hand-overrode in the .twb — caller is responsible for
            # having already spliced it in; auto-placement is a no-op.
            continue
        staged.append(
            StagedFilter(
                stage=p.stage,
                predicate=p.predicate,
                case_sensitive=True,
                should_affect_totals=True,
            )
        )
    return apply_filters_in_order(plan, staged)


__all__ = [
    "FILTER_STAGES",
    "StagedFilter",
    "apply_filters_in_order",
    "LodPlacement",
    "place_lod_in_order",
    "place_table_calc_filter",
]


def place_table_calc_filter(
    predicate: sa.SQLQueryExpression,
    *,
    case_sensitive: bool = True,
    should_affect_totals: bool = True,
) -> StagedFilter:
    """Plan 8c — wrap a table-calc filter predicate as a stage-8
    `StagedFilter`. Stage 8 lives in the client-side bucket per
    Build_Tableau.md §IV.7 step 8: the predicate never reaches SQL —
    `apply_filters_in_order` parks it in `client_side_filters` so the
    frontend evaluator can apply it post-fetch.
    """
    return StagedFilter(
        stage="table_calc",
        predicate=predicate,
        case_sensitive=case_sensitive,
        should_affect_totals=should_affect_totals,
    )

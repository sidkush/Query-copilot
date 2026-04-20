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


__all__ = ["FILTER_STAGES", "StagedFilter", "apply_filters_in_order"]

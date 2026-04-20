"""Plan 7b - VisualSpec -> LogicalOp compiler.

Stage 2 of the Build_Tableau.md §IV.1 three-stage pipeline. Consumes a
Plan 7a VisualSpec and returns a root ``LogicalOp`` node. Produces NO
SQL; that is Plan 7d's job.

Compilation steps (this module):

1. Derive viz grain per §V.4: union of dimension pills on
   Rows / Columns / Detail / Path / Pages. Filters shelf is EXCLUDED.
2. Split shelf fields into dims (``group_bys``) + measures
   (``aggregations``). Unknown roles are rejected.
3. Lower filters into ``LogicalOpSelect`` (dim) / ``LogicalOpFilter``
   (measure) nodes stacked above ``LogicalOpRelation``. Filter-stage
   annotations per §IV.7 are attached here; Plan 7c enforces ordering.
4. Wrap in ``LogicalOpAggregate(group_bys=grain, aggregations=...)`` when
   the mark type calls for aggregation (see T11 for mark-aware policy).
5. LOD calculations (§V.2): FIXED / INCLUDE / EXCLUDE (T12).
6. Synthetic Measure Names / Measure Values columns (§III.6) (T11).
"""

from __future__ import annotations

from typing import Iterable

from vizql import spec
from vizql.logical import (
    AggExp, Column, Field as LField,
    LogicalOp, LogicalOpAggregate, LogicalOpRelation,
)


_GRAIN_SHELF_KINDS: frozenset[int] = frozenset({
    spec.ShelfKind.SHELF_KIND_ROW,
    spec.ShelfKind.SHELF_KIND_COLUMN,
    spec.ShelfKind.SHELF_KIND_DETAIL,
    spec.ShelfKind.SHELF_KIND_PATH,
    spec.ShelfKind.SHELF_KIND_PAGES,
})


_AGG_NAMES: dict[int, str] = {
    spec.AggType.AGG_TYPE_SUM: "sum",
    spec.AggType.AGG_TYPE_AVG: "avg",
    spec.AggType.AGG_TYPE_COUNT: "count",
    spec.AggType.AGG_TYPE_COUNTD: "countd",
    spec.AggType.AGG_TYPE_MIN: "min",
    spec.AggType.AGG_TYPE_MAX: "max",
    spec.AggType.AGG_TYPE_MEDIAN: "median",
    spec.AggType.AGG_TYPE_ATTR: "attr",
    spec.AggType.AGG_TYPE_UNSPECIFIED: "none",
}


def compile_visual_spec(v: spec.VisualSpec) -> LogicalOp:
    """Lower a VisualSpec into a LogicalOp tree."""
    _validate_roles(v.fields)

    grain = _derive_viz_grain(v)
    measures = _collect_measures(v)

    base: LogicalOp = LogicalOpRelation(table=v.sheet_id, schema="")

    # T10 does not attach filters yet — that is T11's scope. Stub call here
    # so T11 can extend without touching this function body.
    base = _apply_filters(base, v)

    if measures:
        aggs = tuple(_to_agg_exp(m) for m in measures)
        return LogicalOpAggregate(
            input=base,
            group_bys=tuple(_to_lfield(f) for f in grain),
            aggregations=aggs,
        )
    # No measures: scatter/disagg path is T11.
    return base


# ---- helpers ----------------------------------------------------------


def _validate_roles(fields: Iterable[spec.Field]) -> None:
    for f in fields:
        if f.role not in (
            spec.FieldRole.FIELD_ROLE_DIMENSION,
            spec.FieldRole.FIELD_ROLE_MEASURE,
        ):
            raise ValueError(
                f"Field {f.id!r} has unsupported role={f.role}; "
                "expected dimension or measure."
            )


def _derive_viz_grain(v: spec.VisualSpec) -> list[spec.Field]:
    """Union of dim pills on grain-bearing shelves (§V.4)."""
    seen: dict[str, spec.Field] = {}
    for shelf in v.shelves:
        if shelf.kind not in _GRAIN_SHELF_KINDS:
            continue
        for f in shelf.fields:
            if f.role != spec.FieldRole.FIELD_ROLE_DIMENSION:
                continue
            seen.setdefault(f.id, f)
    return list(seen.values())


def _collect_measures(v: spec.VisualSpec) -> list[spec.Field]:
    seen: dict[str, spec.Field] = {}
    for shelf in v.shelves:
        if shelf.kind == spec.ShelfKind.SHELF_KIND_FILTER:
            continue
        for f in shelf.fields:
            if f.role == spec.FieldRole.FIELD_ROLE_MEASURE and not f.is_disagg:
                seen.setdefault(f.id, f)
    return list(seen.values())


def _apply_filters(base: LogicalOp, v: spec.VisualSpec) -> LogicalOp:
    """Extended in T11; T10 returns base unchanged."""
    del v  # unused this task
    return base


def _to_lfield(f: spec.Field) -> LField:
    return LField(
        id=f.id,
        data_type=_data_type_name(f.data_type),
        role=_role_name(f.role),
        aggregation=_AGG_NAMES.get(f.aggregation, "none"),
        semantic_role=f.semantic_role,
        is_disagg=f.is_disagg,
    )


def _to_agg_exp(m: spec.Field) -> AggExp:
    agg_name = _AGG_NAMES.get(m.aggregation, "sum")
    return AggExp(
        name=f"{m.id}__{agg_name}",
        agg=agg_name,
        expr=Column(field_id=m.id),
    )


def _data_type_name(dt: int) -> str:
    mapping = {
        spec.DataType.DATA_TYPE_STRING: "string",
        spec.DataType.DATA_TYPE_NUMBER: "number",
        spec.DataType.DATA_TYPE_INT: "int",
        spec.DataType.DATA_TYPE_FLOAT: "float",
        spec.DataType.DATA_TYPE_BOOL: "bool",
        spec.DataType.DATA_TYPE_DATE: "date",
        spec.DataType.DATA_TYPE_DATE_TIME: "date-time",
        spec.DataType.DATA_TYPE_SPATIAL: "spatial",
    }
    return mapping.get(dt, "unknown")


def _role_name(r: int) -> str:
    if r == spec.FieldRole.FIELD_ROLE_DIMENSION:
        return "dimension"
    if r == spec.FieldRole.FIELD_ROLE_MEASURE:
        return "measure"
    return "unknown"


__all__ = ["compile_visual_spec"]

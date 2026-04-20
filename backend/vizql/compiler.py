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
   the mark type calls for aggregation. Scatter (``MARK_TYPE_CIRCLE``)
   and explicitly disaggregated measures emit ``LogicalOpProject``
   instead.
5. LOD calculations (§V.2): FIXED / INCLUDE / EXCLUDE (T12).
6. Synthetic Measure Names / Measure Values columns (§III.6) — caller
   supplies a synthetic ``__measure_names__`` dim; compiler preserves
   it in the grain and keeps multi-measure aggregation.
7. Snowflake domain (§IV.3): wrap in ``LogicalOpDomain(domain=SNOWFLAKE)``
   when ``spec.domain_type == "snowflake"``.
"""

from __future__ import annotations

from typing import Iterable

from vizql import spec
from vizql.logical import (
    AggExp, BinaryOp, Column, DomainType, Expression, Field as LField, FnCall,
    FrameEnd, FrameSpec, FrameStart, Literal, LogicalOp, LogicalOpAggregate,
    LogicalOpDomain, LogicalOpFilter, LogicalOpLookup, LogicalOpOver,
    LogicalOpProject, LogicalOpRelation, LogicalOpSelect, NamedExps, OrderBy,
    PartitionBys, WindowFrameType,
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


_MEASURE_NAMES_ID = "__measure_names__"

_DISAGG_MARKS: frozenset[int] = frozenset({
    spec.MarkType.MARK_TYPE_CIRCLE,
})

_DIM_FILTER_STAGES: frozenset[str] = frozenset({
    "extract", "datasource", "context", "fixed_lod", "dimension",
    "include_exclude_lod",
})

_MEASURE_FILTER_STAGES: frozenset[str] = frozenset({
    "measure", "table_calc", "totals",
})


def compile_visual_spec(v: spec.VisualSpec) -> LogicalOp:
    """Lower a VisualSpec into a LogicalOp tree."""
    _validate_roles(v.fields)

    grain = _derive_viz_grain(v)
    measures = _collect_measures(v)

    base: LogicalOp = LogicalOpRelation(table=v.sheet_id, schema="")
    dim_filters, measure_filters = _split_filters_by_stage(v.filters)
    for fs in dim_filters:
        base = LogicalOpSelect(
            input=base,
            predicate=_lower_filter_predicate(fs),
            filter_stage=_valid_stage(fs.filter_stage, default="dimension"),
        )

    body: LogicalOp
    if _is_disagg(v, measures):
        # Scatter / explicitly disaggregated: Project, no Aggregate.
        exprs = NamedExps(entries=tuple(
            (m.id, Column(field_id=m.id)) for m in measures
        ))
        body = LogicalOpProject(
            input=base,
            renames=(),
            expressions=exprs,
            calculated_column=(),
        )
    else:
        aggs = tuple(_to_agg_exp(m) for m in measures)
        body = LogicalOpAggregate(
            input=base,
            group_bys=tuple(_to_lfield(f) for f in grain),
            aggregations=aggs,
        )

    for fs in measure_filters:
        body = LogicalOpFilter(
            input=body,
            predicate=_lower_filter_predicate(fs),
            filter_stage=_valid_stage(fs.filter_stage, default="measure"),
        )

    if v.lod_calculations:
        body = _apply_lod(body, grain, v.lod_calculations)

    if v.domain_type == "snowflake":
        body = LogicalOpDomain(input=body, domain=DomainType.SNOWFLAKE)

    return body


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
    """Collect measures from non-filter shelves. Respects mark-level disagg.

    When the mark type is in ``_DISAGG_MARKS`` (scatter), every measure
    is cloned with ``is_disagg=True`` so downstream code can distinguish
    "aggregate default" from "explicit disaggregation" without re-reading
    ``v.mark_type``.
    """
    seen: dict[str, spec.Field] = {}
    disagg = v.mark_type in _DISAGG_MARKS
    for shelf in v.shelves:
        if shelf.kind == spec.ShelfKind.SHELF_KIND_FILTER:
            continue
        for f in shelf.fields:
            if f.role != spec.FieldRole.FIELD_ROLE_MEASURE:
                continue
            if disagg and not f.is_disagg:
                # Clone with is_disagg=True so downstream sees the flag.
                f = spec.Field(
                    id=f.id, data_type=f.data_type, role=f.role,
                    semantic_role=f.semantic_role, aggregation=f.aggregation,
                    is_disagg=True, column_class=f.column_class,
                )
            seen.setdefault(f.id, f)
    return list(seen.values())


# ---- filter helpers --------------------------------------------------


def _split_filters_by_stage(
    filters: list[spec.FilterSpec],
) -> tuple[list[spec.FilterSpec], list[spec.FilterSpec]]:
    dim: list[spec.FilterSpec] = []
    meas: list[spec.FilterSpec] = []
    for f in filters:
        stage = f.filter_stage or "dimension"
        if stage in _MEASURE_FILTER_STAGES:
            meas.append(f)
        else:
            dim.append(f)
    return dim, meas


def _valid_stage(stage: str, *, default: str) -> str:
    return stage if stage in (_DIM_FILTER_STAGES | _MEASURE_FILTER_STAGES) else default


def _lower_filter_predicate(f: spec.FilterSpec) -> Expression:
    col = Column(field_id=f.field.id)
    if f.categorical is not None:
        args: list[object] = [col]
        for v in f.categorical.values:
            args.append(Literal(value=v, data_type="string"))
        pred = FnCall(name="IN", args=tuple(args))  # type: ignore[arg-type]
        if f.categorical.is_exclude_mode:
            return FnCall(name="NOT", args=(pred,))
        return pred
    if f.range is not None:
        lo = BinaryOp(op=">=", left=col,
                      right=Literal(value=f.range.min, data_type="number"))
        hi = BinaryOp(op="<=", left=col,
                      right=Literal(value=f.range.max, data_type="number"))
        return BinaryOp(op="AND", left=lo, right=hi)
    if f.relative_date is not None:
        rd = f.relative_date
        return FnCall(
            name="RELATIVE_DATE",
            args=(
                col,
                Literal(value=rd.anchor_date, data_type="string"),
                Literal(value=rd.period_type, data_type="string"),
                Literal(value=rd.date_range_type, data_type="string"),
                Literal(value=rd.range_n, data_type="int"),
            ),
        )
    if f.hierarchical is not None:
        return FnCall(
            name="HIER_IN",
            args=tuple(Literal(value=v, data_type="string")
                        for v in f.hierarchical.hier_val_selection_models),
        )
    # Unknown filter body: lower to a no-op predicate so the plan stays valid.
    return BinaryOp(op="=", left=Literal(value=1, data_type="int"),
                    right=Literal(value=1, data_type="int"))


# ---- mark / disagg ---------------------------------------------------


def _is_disagg(v: spec.VisualSpec, measures: list[spec.Field]) -> bool:
    if v.mark_type in _DISAGG_MARKS:
        return True
    return any(m.is_disagg for m in measures)


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
    mapping: dict[int, str] = {
        int(spec.DataType.DATA_TYPE_STRING): "string",
        int(spec.DataType.DATA_TYPE_NUMBER): "number",
        int(spec.DataType.DATA_TYPE_INT): "int",
        int(spec.DataType.DATA_TYPE_FLOAT): "float",
        int(spec.DataType.DATA_TYPE_BOOL): "bool",
        int(spec.DataType.DATA_TYPE_DATE): "date",
        int(spec.DataType.DATA_TYPE_DATE_TIME): "date-time",
        int(spec.DataType.DATA_TYPE_SPATIAL): "spatial",
    }
    return mapping.get(int(dt), "unknown")


def _role_name(r: int) -> str:
    if r == spec.FieldRole.FIELD_ROLE_DIMENSION:
        return "dimension"
    if r == spec.FieldRole.FIELD_ROLE_MEASURE:
        return "measure"
    return "unknown"


# ---- LOD lowering (Build_Tableau.md §V.2) ---------------------------


def _apply_lod(
    body: LogicalOp,
    grain_fields: list[spec.Field],
    lods: list[spec.LodCalculation],
) -> LogicalOp:
    for lod in lods:
        kind = (lod.lod_kind or "").lower()
        if kind == "fixed":
            body = _lower_fixed_lod(body, lod)
        elif kind == "include":
            body = _lower_include_lod(body, grain_fields, lod)
        elif kind == "exclude":
            body = _lower_exclude_lod(body, grain_fields, lod)
        # unknown kinds silently skipped; Plan 8a will enforce.
    return body


def _lower_fixed_lod(body: LogicalOp, lod: spec.LodCalculation) -> LogicalOp:
    inner_grain = tuple(_to_lfield(f) for f in lod.lod_dims)
    inner_agg_name = _AGG_NAMES.get(lod.outer_aggregation, "sum")
    inner_aggs = (AggExp(
        name=f"{lod.id}__inner",
        agg=inner_agg_name,
        expr=Column(field_id=lod.inner_calculation.id
                    if lod.inner_calculation is not None else lod.id),
    ),)
    inner = LogicalOpAggregate(
        input=_leaf_relation(body),
        group_bys=inner_grain,
        aggregations=inner_aggs,
    )
    return LogicalOpLookup(
        input=inner,
        lookup_field=Column(field_id=f"{lod.id}__inner"),
        offset=0,
    )


def _lower_include_lod(
    body: LogicalOp,
    grain_fields: list[spec.Field],
    lod: spec.LodCalculation,
) -> LogicalOp:
    extra = [_to_lfield(f) for f in lod.lod_dims]
    grain = [_to_lfield(f) for f in grain_fields]
    seen: dict[str, LField] = {f.id: f for f in grain}
    for f in extra:
        seen.setdefault(f.id, f)
    return _build_over(body, tuple(seen.values()), lod)


def _lower_exclude_lod(
    body: LogicalOp,
    grain_fields: list[spec.Field],
    lod: spec.LodCalculation,
) -> LogicalOp:
    excluded = {f.id for f in lod.lod_dims}
    remaining = tuple(_to_lfield(f) for f in grain_fields if f.id not in excluded)
    return _build_over(body, remaining, lod)


def _build_over(
    body: LogicalOp,
    partition_fields: tuple[LField, ...],
    lod: spec.LodCalculation,
) -> LogicalOp:
    frame = FrameSpec(
        frame_type=WindowFrameType.ROWS,
        start=FrameStart(kind="unbounded_preceding"),
        end=FrameEnd(kind="unbounded_following"),
    )
    agg = _AGG_NAMES.get(lod.outer_aggregation, "sum")
    exprs = NamedExps(entries=((
        lod.id,
        FnCall(name=agg.upper(), args=(
            Column(field_id=lod.inner_calculation.id
                   if lod.inner_calculation is not None else lod.id),
        )),
    ),))
    return LogicalOpOver(
        input=body,
        partition_bys=PartitionBys(fields=partition_fields),
        order_by=(),
        frame=frame,
        expressions=exprs,
    )


def _leaf_relation(body: LogicalOp) -> LogicalOp:
    """Walk down ``input`` chain to the LogicalOpRelation leaf.

    FIXED-LOD inner subquery references the base table independently of
    the outer filter stack - consistent with §IV.7 stage 4 (AFTER
    Context, BEFORE Dim). Plan 7c will also thread Extract/DS/Context
    filters through the inner.
    """
    cur: object = body
    while True:
        inp = getattr(cur, "input", None)
        if inp is None:
            return cur  # type: ignore[return-value]
        cur = inp


__all__ = ["compile_visual_spec"]

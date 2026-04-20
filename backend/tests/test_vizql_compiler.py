"""Plan 7b - VisualSpec -> LogicalOp compiler."""

from __future__ import annotations

import pytest

from vizql import spec
from vizql.compiler import compile_visual_spec
from vizql.logical import (
    BinaryOp, Column, DomainType, FnCall, Literal,
    LogicalOpAggregate, LogicalOpDomain, LogicalOpFilter,
    LogicalOpLookup, LogicalOpOver, LogicalOpProject, LogicalOpRelation,
    LogicalOpSelect, PartitionBys,
)

# NOTE: validate_logical_plan lands in T9 (parallel worktree plan7b-t9).
# The import below is optional so the rest of this file imports cleanly in
# the T10 worktree; the one test that uses it is skipped until T9 merges.
try:  # pragma: no cover - import-only guard
    from vizql.validator import validate_logical_plan  # type: ignore[import-not-found]
    _HAS_VALIDATOR = True
except Exception:  # noqa: BLE001
    validate_logical_plan = None  # type: ignore[assignment]
    _HAS_VALIDATOR = False


def _dim(id_: str) -> spec.Field:
    return spec.Field(
        id=id_,
        data_type=spec.DataType.DATA_TYPE_STRING,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
        aggregation=spec.AggType.AGG_TYPE_UNSPECIFIED,
    )


def _measure(id_: str, agg: int = spec.AggType.AGG_TYPE_SUM) -> spec.Field:
    return spec.Field(
        id=id_,
        data_type=spec.DataType.DATA_TYPE_NUMBER,
        role=spec.FieldRole.FIELD_ROLE_MEASURE,
        aggregation=agg,
    )


def _bar_spec() -> spec.VisualSpec:
    region = _dim("orders.region")
    total = _measure("orders.total")
    return spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )


def test_compile_bar_1dim_1measure():
    plan = compile_visual_spec(_bar_spec())
    assert isinstance(plan, LogicalOpAggregate)
    assert len(plan.group_bys) == 1
    assert plan.group_bys[0].id == "orders.region"
    assert len(plan.aggregations) == 1
    assert plan.aggregations[0].agg == "sum"
    # Relation at the leaf
    node = plan.input
    while not isinstance(node, LogicalOpRelation):
        node = getattr(node, "input")
    assert node.table == "orders"


def test_compile_bar_plan_validates():
    plan = compile_visual_spec(_bar_spec())
    validate_logical_plan(plan)


def test_compile_excludes_filters_shelf_from_grain():
    region = _dim("orders.region")
    country = _dim("orders.country")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, country, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_FILTER, fields=[country]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    assert isinstance(plan, LogicalOpAggregate)
    grain_ids = {f.id for f in plan.group_bys}
    assert grain_ids == {"orders.region"}  # country excluded


def test_compile_detail_and_pages_included_in_grain():
    region = _dim("orders.region")
    page = _dim("orders.year")
    detail = _dim("orders.segment")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, page, detail, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_PAGES, fields=[page]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_DETAIL, fields=[detail]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    grain_ids = {f.id for f in plan.group_bys}
    assert grain_ids == {"orders.region", "orders.year", "orders.segment"}


def test_compile_rejects_unknown_role():
    unk = spec.Field(
        id="mystery",
        data_type=spec.DataType.DATA_TYPE_STRING,
        role=spec.FieldRole.FIELD_ROLE_UNSPECIFIED,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[unk],
        shelves=[spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[unk])],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    with pytest.raises(ValueError, match="role"):
        compile_visual_spec(s)


def test_compile_empty_filters_produces_no_select_nodes():
    plan = compile_visual_spec(_bar_spec())
    # Walk down from Aggregate; there should be no Select nodes when no filters exist.
    node = plan.input  # type: ignore[attr-defined]
    while not isinstance(node, LogicalOpRelation):
        assert not isinstance(node, LogicalOpSelect)
        node = getattr(node, "input")


# ---- Plan 7b T11: filter lowering + mark-aware agg + MN/MV + dual axis + domain


def _categorical_filter(field_id: str, values: list[str],
                         stage: str = "dimension") -> spec.FilterSpec:
    f = spec.Field(
        id=field_id,
        data_type=spec.DataType.DATA_TYPE_STRING,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
    )
    return spec.FilterSpec(
        filter_kind=spec.FilterKind.FILTER_KIND_CATEGORICAL,
        field=f,
        categorical=spec.CategoricalFilterProps(values=values),
        filter_stage=stage,
    )


def test_compile_attaches_categorical_dim_filter_as_select():
    region = _dim("orders.region")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[_categorical_filter("orders.region", ["East", "West"])],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    # Drill through Aggregate.input to find the Select.
    node = plan.input  # type: ignore[attr-defined]
    assert isinstance(node, LogicalOpSelect)
    assert node.filter_stage == "dimension"
    assert isinstance(node.predicate, FnCall)
    assert node.predicate.name == "IN"


def test_compile_attaches_range_filter_as_binary_op():
    region = _dim("orders.region")
    total = _measure("orders.total")
    price = spec.Field(
        id="orders.price",
        data_type=spec.DataType.DATA_TYPE_NUMBER,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
    )
    rf = spec.FilterSpec(
        filter_kind=spec.FilterKind.FILTER_KIND_RANGE,
        field=price,
        range=spec.RangeFilterProps(min=0.0, max=100.0),
        filter_stage="dimension",
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total, price],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[rf],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    node = plan.input  # type: ignore[attr-defined]
    assert isinstance(node, LogicalOpSelect)
    # BETWEEN lowered as AND of two comparisons.
    assert isinstance(node.predicate, BinaryOp)
    assert node.predicate.op == "AND"


def test_compile_relative_date_filter_lowers_to_fncall():
    date = spec.Field(
        id="orders.date",
        data_type=spec.DataType.DATA_TYPE_DATE,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
    )
    total = _measure("orders.total")
    rd = spec.FilterSpec(
        filter_kind=spec.FilterKind.FILTER_KIND_RELATIVE_DATE,
        field=date,
        relative_date=spec.RelativeDateFilterProps(
            anchor_date="2026-01-01", period_type="month",
            date_range_type="last_n", range_n=3,
        ),
        filter_stage="dimension",
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[date, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[date]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[rd],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    node = plan.input  # type: ignore[attr-defined]
    assert isinstance(node, LogicalOpSelect)
    assert isinstance(node.predicate, FnCall)
    assert node.predicate.name == "RELATIVE_DATE"


def test_compile_context_filter_marker_preserved():
    region = _dim("orders.region")
    total = _measure("orders.total")
    cf = _categorical_filter("orders.region", ["East"], stage="context")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[cf],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    node = plan.input  # type: ignore[attr-defined]
    assert isinstance(node, LogicalOpSelect)
    assert node.filter_stage == "context"


def test_compile_measure_filter_becomes_logical_op_filter():
    region = _dim("orders.region")
    total = _measure("orders.total")
    # Measure filter: HAVING SUM(total) > 1000.
    mf = spec.FilterSpec(
        filter_kind=spec.FilterKind.FILTER_KIND_RANGE,
        field=total,
        range=spec.RangeFilterProps(min=1000.0, max=1e18),
        filter_stage="measure",
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        filters=[mf],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    # Measure filter sits above the aggregate.
    assert isinstance(plan, LogicalOpFilter)
    assert plan.filter_stage == "measure"


def test_compile_scatter_disaggregates():
    x = _measure("orders.price")
    y = _measure("orders.profit")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[x, y],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[x]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[y]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_CIRCLE,  # scatter default
    )
    plan = compile_visual_spec(s)
    # No aggregate wrapper; Project instead.
    assert isinstance(plan, LogicalOpProject)
    names = [n for n, _ in plan.expressions.entries]
    assert "orders.price" in names and "orders.profit" in names


def test_compile_dual_axis_produces_two_aggregations():
    region = _dim("orders.region")
    sales = _measure("orders.sales")
    profit = _measure("orders.profit")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, sales, profit],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[sales, profit]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    assert isinstance(plan, LogicalOpAggregate)
    names = {a.name for a in plan.aggregations}
    assert {"orders.sales__sum", "orders.profit__sum"} <= names


def test_compile_measure_names_values_synthetic():
    region = _dim("orders.region")
    sales = _measure("orders.sales")
    profit = _measure("orders.profit")
    mn = spec.Field(
        id="__measure_names__",
        data_type=spec.DataType.DATA_TYPE_STRING,
        role=spec.FieldRole.FIELD_ROLE_DIMENSION,
        column_class=spec.ColumnClass.COLUMN_CLASS_VISUAL_DATA,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, sales, profit, mn],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN,
                       fields=[region, mn]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW,
                       fields=[sales, profit]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
    )
    plan = compile_visual_spec(s)
    assert isinstance(plan, LogicalOpAggregate)
    grain_ids = {f.id for f in plan.group_bys}
    assert "__measure_names__" in grain_ids
    assert len(plan.aggregations) == 2


def test_compile_snowflake_domain_wraps_in_logical_op_domain():
    region = _dim("orders.region")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        domain_type="snowflake",
    )
    plan = compile_visual_spec(s)
    assert isinstance(plan, LogicalOpDomain)
    assert plan.domain == DomainType.SNOWFLAKE


def test_compile_separate_domain_does_not_wrap():
    region = _dim("orders.region")
    total = _measure("orders.total")
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        domain_type="separate",
    )
    plan = compile_visual_spec(s)
    # Default: no LogicalOpDomain wrap.
    assert not isinstance(plan, LogicalOpDomain)


def test_compile_fixed_lod_emits_lookup_over_inner_aggregate():
    region = _dim("orders.region")
    country = _dim("orders.country")
    total = _measure("orders.total")
    lod = spec.LodCalculation(
        id="country_total_fixed",
        lod_kind="fixed",
        lod_dims=[country],
        inner_calculation=spec.Calculation(id="inner_sum",
                                          formula="SUM([orders.total])"),
        outer_aggregation=spec.AggType.AGG_TYPE_SUM,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, country, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        lod_calculations=[lod],
    )
    plan = compile_visual_spec(s)
    # Walk down from the root aggregate; there must be a Lookup somewhere
    # whose input is an inner Aggregate grouping on country.
    found = _find_first(plan, LogicalOpLookup)
    assert found is not None, "expected LogicalOpLookup from FIXED LOD"
    inner = found.input
    assert isinstance(inner, LogicalOpAggregate)
    inner_ids = {f.id for f in inner.group_bys}
    assert inner_ids == {"orders.country"}


def test_compile_include_lod_emits_over_with_grain_plus_dim():
    region = _dim("orders.region")
    segment = _dim("orders.segment")
    total = _measure("orders.total")
    lod = spec.LodCalculation(
        id="segment_include",
        lod_kind="include",
        lod_dims=[segment],
        inner_calculation=spec.Calculation(id="inner",
                                          formula="SUM([orders.total])"),
        outer_aggregation=spec.AggType.AGG_TYPE_AVG,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, segment, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN, fields=[region]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        lod_calculations=[lod],
    )
    plan = compile_visual_spec(s)
    over = _find_first(plan, LogicalOpOver)
    assert over is not None
    ids = {f.id for f in over.partition_bys.fields}
    # viz_grain = {region}; INCLUDE adds segment.
    assert ids == {"orders.region", "orders.segment"}


def test_compile_exclude_lod_removes_dim_from_partition():
    region = _dim("orders.region")
    segment = _dim("orders.segment")
    total = _measure("orders.total")
    lod = spec.LodCalculation(
        id="exclude_region",
        lod_kind="exclude",
        lod_dims=[region],
        inner_calculation=spec.Calculation(id="inner",
                                          formula="SUM([orders.total])"),
        outer_aggregation=spec.AggType.AGG_TYPE_SUM,
    )
    s = spec.VisualSpec(
        sheet_id="orders",
        fields=[region, segment, total],
        shelves=[
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_COLUMN,
                       fields=[region, segment]),
            spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[total]),
        ],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        lod_calculations=[lod],
    )
    plan = compile_visual_spec(s)
    over = _find_first(plan, LogicalOpOver)
    assert over is not None
    ids = {f.id for f in over.partition_bys.fields}
    # viz_grain = {region, segment}; EXCLUDE removes region.
    assert ids == {"orders.segment"}


def _find_first(node, target_type):
    """DFS: return first subtree instance of target_type, else None."""
    from collections import deque
    q = deque([node])
    while q:
        cur = q.popleft()
        if isinstance(cur, target_type):
            return cur
        for attr in ("input", "left", "right"):
            child = getattr(cur, attr, None)
            if child is not None and not isinstance(child, (str, int, float, bool, tuple)):
                q.append(child)
    return None

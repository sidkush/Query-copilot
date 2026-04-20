"""Plan 7b - VisualSpec -> LogicalOp compiler."""

from __future__ import annotations

import pytest

from vizql import spec
from vizql.compiler import compile_visual_spec
from vizql.logical import (
    LogicalOpAggregate, LogicalOpRelation, LogicalOpSelect,
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

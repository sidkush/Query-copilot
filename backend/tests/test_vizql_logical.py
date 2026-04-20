"""Plan 7b - minerva logical plan port.

Exercises backend/vizql/logical.py operator dataclasses + expression AST
+ canonical-name pinning against docs/Build_Tableau.md §IV.2.
"""

from __future__ import annotations

import pytest


def test_plan_7a_prerequisites_satisfied():
    """Plan 7b depends on Plan 7a deliverables. Fail loudly if absent."""
    from vizql import spec  # noqa: F401
    from vizql.proto import v1_pb2  # noqa: F401

    assert hasattr(spec, "VisualSpec"), "Plan 7a VisualSpec missing"
    assert hasattr(spec, "AggType"), "Plan 7a AggType re-export missing"
    assert hasattr(v1_pb2, "VisualSpec"), "Plan 7a protobuf codegen missing"


def test_domain_type_enum_values():
    from vizql.logical import DomainType
    assert DomainType.SNOWFLAKE.value == "snowflake"
    assert DomainType.SEPARATE.value == "separate"
    assert {d.value for d in DomainType} == {"snowflake", "separate"}


def test_window_frame_type_enum_values():
    from vizql.logical import WindowFrameType
    assert WindowFrameType.ROWS.value == "rows"
    assert WindowFrameType.RANGE.value == "range"


def test_window_frame_exclusion_enum_values():
    from vizql.logical import WindowFrameExclusion
    assert {e.value for e in WindowFrameExclusion} == {
        "no_others", "current_row", "group", "ties",
    }


def test_sql_set_type_enum_values():
    from vizql.logical import SqlSetType
    assert {s.value for s in SqlSetType} == {"union", "intersect", "except"}


def test_field_equality_and_hash():
    from vizql.logical import Field
    a = Field(id="orders.total", data_type="number", role="measure",
              aggregation="sum", semantic_role="", is_disagg=False)
    b = Field(id="orders.total", data_type="number", role="measure",
              aggregation="sum", semantic_role="", is_disagg=False)
    assert a == b
    assert hash(a) == hash(b)


def test_field_is_frozen():
    from vizql.logical import Field
    f = Field(id="x", data_type="number", role="measure",
              aggregation="sum", semantic_role="", is_disagg=False)
    with pytest.raises((AttributeError, Exception)):
        f.id = "y"  # type: ignore[misc]


def test_expression_ast_column():
    from vizql.logical import Column
    c = Column(field_id="orders.total")
    assert c.field_id == "orders.total"
    assert hash(c) == hash(Column(field_id="orders.total"))


def test_expression_ast_literal():
    from vizql.logical import Literal
    assert Literal(value=42, data_type="int").value == 42
    assert Literal(value="x", data_type="string") != Literal(value="y", data_type="string")


def test_expression_ast_binary_op():
    from vizql.logical import BinaryOp, Column, Literal
    expr = BinaryOp(op=">", left=Column(field_id="orders.total"),
                    right=Literal(value=100, data_type="int"))
    assert expr.op == ">"
    assert expr.left == Column(field_id="orders.total")


def test_expression_ast_fn_call():
    from vizql.logical import Column, FnCall
    expr = FnCall(name="CONTAINS", args=(Column(field_id="orders.region"),))
    assert expr.name == "CONTAINS"
    assert len(expr.args) == 1


def test_order_by_shape():
    from vizql.logical import Column, OrderBy
    ob = OrderBy(identifier_exp=Column(field_id="orders.total"), is_ascending=False)
    assert ob.is_ascending is False


def test_partition_bys_holds_fields():
    from vizql.logical import Field, PartitionBys
    f = Field(id="orders.region", data_type="string", role="dimension",
              aggregation="none", semantic_role="", is_disagg=False)
    p = PartitionBys(fields=(f,))
    assert p.fields == (f,)


def test_agg_exp_shape():
    from vizql.logical import AggExp, Column
    a = AggExp(name="total_sum", agg="sum", expr=Column(field_id="orders.total"))
    assert a.agg == "sum"
    assert a.name == "total_sum"


def test_named_exps_is_mapping_like():
    from vizql.logical import Column, NamedExps
    n = NamedExps(entries=(("total", Column(field_id="orders.total")),))
    assert dict(n.entries)["total"] == Column(field_id="orders.total")


def test_logical_op_relation_construction():
    from vizql.logical import LogicalOpRelation
    r = LogicalOpRelation(table="orders", schema="public")
    assert r.table == "orders"
    assert r.schema == "public"


def test_logical_op_relation_is_hashable():
    from vizql.logical import LogicalOpRelation
    a = LogicalOpRelation(table="orders", schema="public")
    b = LogicalOpRelation(table="orders", schema="public")
    assert a == b
    assert hash(a) == hash(b)
    assert {a, b} == {a}  # deduped via hash


def test_logical_op_project_renames_and_expressions():
    from vizql.logical import (
        Column, LogicalOpProject, LogicalOpRelation, NamedExps,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    proj = LogicalOpProject(
        input=base,
        renames=(("orders.total", "total"),),
        expressions=NamedExps(entries=(
            ("total", Column(field_id="orders.total")),
        )),
        calculated_column=(),
    )
    assert proj.input is base
    assert proj.renames == (("orders.total", "total"),)
    assert proj.expressions.entries[0][0] == "total"


def test_logical_op_project_carries_calculated_columns():
    from vizql.logical import (
        BinaryOp, Column, Literal, LogicalOpProject, LogicalOpRelation, NamedExps,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    calc = ("profit_margin", BinaryOp(
        op="/",
        left=Column(field_id="orders.profit"),
        right=Column(field_id="orders.revenue"),
    ))
    proj = LogicalOpProject(
        input=base,
        renames=(),
        expressions=NamedExps(entries=()),
        calculated_column=(calc,),
    )
    assert proj.calculated_column[0][0] == "profit_margin"
    # unused expr reference (no-op assertion — keeps Literal in scope for future calc shapes)
    assert Literal(value=0, data_type="int").value == 0


FILTER_STAGES = {
    "extract", "datasource", "context", "fixed_lod", "dimension",
    "include_exclude_lod", "measure", "table_calc", "totals",
}


def test_logical_op_select_carries_predicate_and_stage():
    from vizql.logical import (
        BinaryOp, Column, Literal, LogicalOpRelation, LogicalOpSelect,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    pred = BinaryOp(op=">", left=Column(field_id="orders.total"),
                    right=Literal(value=100, data_type="int"))
    sel = LogicalOpSelect(input=base, predicate=pred, filter_stage="dimension")
    assert sel.predicate.op == ">"
    assert sel.filter_stage == "dimension"


def test_logical_op_select_rejects_unknown_stage():
    from vizql.logical import (
        Column, Literal, LogicalOpRelation, LogicalOpSelect, BinaryOp,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    pred = BinaryOp(op="=", left=Column(field_id="orders.id"),
                    right=Literal(value=1, data_type="int"))
    with pytest.raises(ValueError, match="filter_stage"):
        LogicalOpSelect(input=base, predicate=pred, filter_stage="bogus_stage")


def test_logical_op_filter_measure_stage_default():
    from vizql.logical import (
        BinaryOp, Column, Literal, LogicalOpFilter, LogicalOpRelation,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    pred = BinaryOp(op=">", left=Column(field_id="total_sum"),
                    right=Literal(value=1000, data_type="int"))
    f = LogicalOpFilter(input=base, predicate=pred)
    assert f.filter_stage == "measure"


def test_logical_op_aggregate_carries_group_bys_and_aggregations():
    from vizql.logical import (
        AggExp, Column, Field, LogicalOpAggregate, LogicalOpRelation,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    region = Field(id="orders.region", data_type="string", role="dimension",
                   aggregation="none", semantic_role="", is_disagg=False)
    total_sum = AggExp(name="total_sum", agg="sum",
                        expr=Column(field_id="orders.total"))
    agg = LogicalOpAggregate(
        input=base,
        group_bys=(region,),
        aggregations=(total_sum,),
    )
    assert agg.group_bys == (region,)
    assert agg.aggregations[0].agg == "sum"


def test_logical_op_aggregate_empty_group_bys_allowed():
    """SELECT SUM(...) FROM orders  — no GROUP BY."""
    from vizql.logical import (
        AggExp, Column, LogicalOpAggregate, LogicalOpRelation,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    agg = LogicalOpAggregate(
        input=base,
        group_bys=(),
        aggregations=(AggExp(name="total", agg="sum",
                             expr=Column(field_id="orders.total")),),
    )
    assert agg.group_bys == ()


def test_logical_op_order_preserves_tuple_order():
    from vizql.logical import (
        Column, LogicalOpOrder, LogicalOpRelation, OrderBy,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    order = LogicalOpOrder(
        input=base,
        order_by=(
            OrderBy(identifier_exp=Column(field_id="orders.total"), is_ascending=False),
            OrderBy(identifier_exp=Column(field_id="orders.region"), is_ascending=True),
        ),
    )
    assert len(order.order_by) == 2
    assert order.order_by[0].is_ascending is False
    assert order.order_by[1].is_ascending is True


def test_logical_op_top_limit_and_percentage_flag():
    from vizql.logical import LogicalOpRelation, LogicalOpTop
    base = LogicalOpRelation(table="orders", schema="public")
    top = LogicalOpTop(input=base, limit=10, is_percentage=False)
    assert top.limit == 10
    assert top.is_percentage is False

    pct = LogicalOpTop(input=base, limit=5, is_percentage=True)
    assert pct.is_percentage is True


def test_logical_op_top_rejects_negative_limit():
    from vizql.logical import LogicalOpRelation, LogicalOpTop
    base = LogicalOpRelation(table="orders", schema="public")
    with pytest.raises(ValueError, match="limit"):
        LogicalOpTop(input=base, limit=-1, is_percentage=False)


def test_logical_op_over_window_expression():
    from vizql.logical import (
        Column, Field, FrameEnd, FrameSpec, FrameStart,
        LogicalOpOver, LogicalOpRelation, NamedExps, OrderBy, PartitionBys,
        WindowFrameType,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    region = Field(id="orders.region", data_type="string", role="dimension",
                   aggregation="none", semantic_role="", is_disagg=False)
    frame = FrameSpec(
        frame_type=WindowFrameType.ROWS,
        start=FrameStart(kind="unbounded_preceding"),
        end=FrameEnd(kind="current_row"),
    )
    over = LogicalOpOver(
        input=base,
        partition_bys=PartitionBys(fields=(region,)),
        order_by=(OrderBy(identifier_exp=Column(field_id="orders.date"),
                          is_ascending=True),),
        frame=frame,
        expressions=NamedExps(entries=(
            ("running_total", Column(field_id="orders.total")),
        )),
    )
    assert over.partition_bys.fields == (region,)
    assert over.frame.frame_type == WindowFrameType.ROWS


def test_logical_op_lookup_cross_row_reference():
    from vizql.logical import (
        Column, LogicalOpLookup, LogicalOpRelation,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    look = LogicalOpLookup(
        input=base,
        lookup_field=Column(field_id="orders.total"),
        offset=-1,
    )
    assert look.offset == -1


def test_logical_op_unpivot_columns_to_rows():
    from vizql.logical import LogicalOpRelation, LogicalOpUnpivot
    base = LogicalOpRelation(table="sales_wide", schema="public")
    op = LogicalOpUnpivot(
        input=base,
        pivot_cols=("q1", "q2", "q3", "q4"),
        value_col="revenue",
        name_col="quarter",
    )
    assert op.pivot_cols == ("q1", "q2", "q3", "q4")
    assert op.value_col == "revenue"
    assert op.name_col == "quarter"


def test_logical_op_values_to_columns_rows_to_columns():
    from vizql.logical import (
        Column, LogicalOpRelation, LogicalOpValuestoColumns,
    )
    base = LogicalOpRelation(table="orders", schema="public")
    op = LogicalOpValuestoColumns(
        input=base,
        pivot_col=Column(field_id="orders.region"),
        agg_col=Column(field_id="orders.total"),
    )
    assert op.pivot_col == Column(field_id="orders.region")

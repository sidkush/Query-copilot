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

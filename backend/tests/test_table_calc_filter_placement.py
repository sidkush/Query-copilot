# backend/tests/test_table_calc_filter_placement.py
import dataclasses
from vizql import sql_ast as sa
from vizql.filter_ordering import (
    StagedFilter, apply_filters_in_order, place_table_calc_filter,
)


def _trivial_plan() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                   expression=sa.Column(name="x",
                                                        table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
        where=None, group_by=(), having=None, order_by=(), limit=None,
    )


def test_place_table_calc_filter_returns_stage_8_staged_filter():
    pred = sa.BinaryOp(op=">",
                       left=sa.Column(name="rs", table_alias="t"),
                       right=sa.Literal(value=100, data_type="int"))
    sf = place_table_calc_filter(pred)
    assert isinstance(sf, StagedFilter)
    assert sf.stage == "table_calc"
    assert sf.predicate is pred


def test_table_calc_filter_pushes_to_client_side_filters_bucket():
    pred = sa.BinaryOp(op=">",
                       left=sa.Column(name="rs", table_alias="t"),
                       right=sa.Literal(value=100, data_type="int"))
    out = apply_filters_in_order(_trivial_plan(), [place_table_calc_filter(pred)])
    assert pred in out.client_side_filters
    # WHERE / HAVING untouched
    assert out.where is None
    assert out.having is None

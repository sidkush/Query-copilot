"""Plan 7c §V.2 — LOD emission shape."""
import pytest
from vizql import logical as lg, sql_ast as sa
from vizql.logical_to_sql import compile_logical_to_sql


def _f(id_: str, **kw) -> lg.Field:
    return lg.Field(id=id_, data_type="int", role="dimension", aggregation="none",
                    semantic_role="", is_disagg=False, **kw)


def test_fixed_lod_emits_correlated_subquery_joined_on_fixed_dims():
    """FIXED [region] : SUM([amount]) → correlated subquery on region."""
    rel = lg.LogicalOpRelation(table="orders")
    inner_agg = lg.LogicalOpAggregate(
        input=rel,
        group_bys=(_f("region"),),
        aggregations=(lg.AggExp(name="fixed_total", agg="sum",
                                 expr=lg.Column(field_id="amount")),),
    )
    lookup = lg.LogicalOpLookup(
        input=inner_agg,
        lookup_field=lg.Column(field_id="fixed_total"),
        offset=0,  # 0 = correlated lookup
    )
    qf = compile_logical_to_sql(lookup)
    # Expect: qf has a Subquery-bearing projection OR a Window wrapping
    # a correlated expression; the dialect emitter unfolds to correlated
    # SELECT in Plan 7d.
    has_correlated = any(
        _contains_correlated(p.expression) for p in qf.projections)
    assert has_correlated


def test_include_lod_becomes_window_union_viz_grain_plus_dim():
    rel = lg.LogicalOpRelation(table="sales")
    over = lg.LogicalOpOver(
        input=rel,
        partition_bys=lg.PartitionBys(fields=(_f("region"), _f("product"))),
        order_by=(),
        frame=lg.FrameSpec(frame_type=lg.WindowFrameType.ROWS,
                            start=lg.FrameStart(kind="UNBOUNDED"),
                            end=lg.FrameEnd(kind="UNBOUNDED")),
        expressions=lg.NamedExps(entries=(
            ("incl_total",
             lg.FnCall(name="SUM", args=(lg.Column(field_id="amount"),))),)),
    )
    qf = compile_logical_to_sql(over)
    windows = [p.expression for p in qf.projections
               if isinstance(p.expression, sa.Window)]
    assert windows
    w = windows[0]
    partitions = {getattr(p, "name", None) for p in w.partition_by}
    assert "region" in partitions and "product" in partitions


def test_exclude_lod_removes_dim_from_viz_grain():
    # EXCLUDE [product] with viz_grain = {region, product}
    # → partition_by = {region}
    rel = lg.LogicalOpRelation(table="sales")
    over = lg.LogicalOpOver(
        input=rel,
        partition_bys=lg.PartitionBys(fields=(_f("region"),)),  # product excluded
        order_by=(),
        frame=lg.FrameSpec(frame_type=lg.WindowFrameType.ROWS,
                            start=lg.FrameStart(kind="UNBOUNDED"),
                            end=lg.FrameEnd(kind="UNBOUNDED")),
        expressions=lg.NamedExps(entries=(
            ("excl_total",
             lg.FnCall(name="SUM", args=(lg.Column(field_id="amount"),))),)),
    )
    qf = compile_logical_to_sql(over)
    windows = [p.expression for p in qf.projections
               if isinstance(p.expression, sa.Window)]
    partitions = {getattr(p, "name", None) for p in windows[0].partition_by}
    assert partitions == {"region"}


def _contains_correlated(e) -> bool:
    if isinstance(e, sa.Subquery): return bool(e.correlated_on)
    if isinstance(e, sa.Window): return _contains_correlated(e.expr)
    if isinstance(e, sa.BinaryOp):
        return _contains_correlated(e.left) or _contains_correlated(e.right)
    if isinstance(e, sa.FnCall): return any(_contains_correlated(a) for a in e.args)
    return False

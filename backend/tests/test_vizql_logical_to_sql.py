"""Plan 7c — LogicalOp → SQLQueryFunction (LogicalExpToSQLQueryExpression)."""
import pytest
from vizql import logical as lg, sql_ast as sa
from vizql.logical_to_sql import compile_logical_to_sql


def _f(id_: str, dt="int", role="dimension", agg="none", disagg=False) -> lg.Field:
    return lg.Field(id=id_, data_type=dt, role=role, aggregation=agg,
                    semantic_role="", is_disagg=disagg)


def test_relation_becomes_tableref():
    qf = compile_logical_to_sql(lg.LogicalOpRelation(table="sales", schema="public"))
    assert isinstance(qf.from_, sa.TableRef)
    assert qf.from_.name == "sales"
    assert qf.from_.schema == "public"


def test_project_emits_aliases_and_calc_columns():
    rel = lg.LogicalOpRelation(table="t")
    proj = lg.LogicalOpProject(
        input=rel,
        renames=(("amount", "amt"),),
        expressions=lg.NamedExps(entries=(("amt", lg.Column(field_id="amount")),)),
        calculated_column=(("is_big",
                            lg.BinaryOp(op=">",
                                        left=lg.Column(field_id="amount"),
                                        right=lg.Literal(value=100, data_type="int"))),),
    )
    qf = compile_logical_to_sql(proj)
    aliases = {p.alias for p in qf.projections}
    assert {"amt", "is_big"}.issubset(aliases)


def test_select_becomes_where():
    rel = lg.LogicalOpRelation(table="t")
    sel = lg.LogicalOpSelect(
        input=rel,
        predicate=lg.BinaryOp(op=">", left=lg.Column(field_id="x"),
                              right=lg.Literal(value=0, data_type="int")),
        filter_stage="dimension",
    )
    qf = compile_logical_to_sql(sel)
    assert qf.where is not None
    assert isinstance(qf.where, sa.BinaryOp) and qf.where.op == ">"


def test_filter_becomes_having():
    rel = lg.LogicalOpRelation(table="t")
    agg = lg.LogicalOpAggregate(
        input=rel,
        group_bys=(_f("d"),),
        aggregations=(lg.AggExp(name="n", agg="sum", expr=lg.Column(field_id="x")),),
    )
    filt = lg.LogicalOpFilter(
        input=agg,
        predicate=lg.BinaryOp(op=">", left=lg.Column(field_id="n"),
                              right=lg.Literal(value=10, data_type="int")),
        filter_stage="measure",
    )
    qf = compile_logical_to_sql(filt)
    assert qf.having is not None
    assert qf.where is None  # measure filter must NOT land in WHERE


def test_aggregate_emits_group_by():
    rel = lg.LogicalOpRelation(table="t")
    agg = lg.LogicalOpAggregate(
        input=rel,
        group_bys=(_f("region"),),
        aggregations=(lg.AggExp(name="total", agg="sum",
                                expr=lg.Column(field_id="amount")),),
    )
    qf = compile_logical_to_sql(agg)
    assert len(qf.group_by) == 1
    assert any(p.alias == "total" and isinstance(p.expression, sa.FnCall)
               and p.expression.name.upper() == "SUM" for p in qf.projections)


def test_order_and_top_emit_order_by_and_limit():
    rel = lg.LogicalOpRelation(table="t")
    order = lg.LogicalOpOrder(
        input=rel,
        order_by=(lg.OrderBy(identifier_exp=lg.Column(field_id="x"),
                             is_ascending=True),),
    )
    top = lg.LogicalOpTop(input=order, limit=50)
    qf = compile_logical_to_sql(top)
    assert qf.limit == 50
    assert len(qf.order_by) == 1


def test_over_emits_window():
    rel = lg.LogicalOpRelation(table="t")
    over = lg.LogicalOpOver(
        input=rel,
        partition_bys=lg.PartitionBys(fields=(_f("region"),)),
        order_by=(lg.OrderBy(identifier_exp=lg.Column(field_id="d"),
                             is_ascending=True),),
        frame=lg.FrameSpec(frame_type=lg.WindowFrameType.ROWS,
                           start=lg.FrameStart(kind="UNBOUNDED"),
                           end=lg.FrameEnd(kind="CURRENT_ROW")),
        expressions=lg.NamedExps(entries=(
            ("cume",
             lg.FnCall(name="SUM", args=(lg.Column(field_id="amount"),))),)),
    )
    qf = compile_logical_to_sql(over)
    assert any(isinstance(p.expression, sa.Window) for p in qf.projections)


def test_union_becomes_setop():
    l = lg.LogicalOpRelation(table="a")
    r = lg.LogicalOpRelation(table="b")
    qf = compile_logical_to_sql(lg.LogicalOpUnion(left=l, right=r))
    assert qf.set_op is not None and qf.set_op.kind == "UNION"


def test_intersect_becomes_setop():
    l = lg.LogicalOpRelation(table="a")
    r = lg.LogicalOpRelation(table="b")
    qf = compile_logical_to_sql(lg.LogicalOpIntersect(left=l, right=r))
    assert qf.set_op is not None and qf.set_op.kind == "INTERSECT"


def test_domain_snowflake_emits_cartesian_cte_or_cross_join():
    rel = lg.LogicalOpRelation(table="t")
    dom = lg.LogicalOpDomain(input=rel, domain=lg.DomainType.SNOWFLAKE)
    qf = compile_logical_to_sql(dom)
    # Snowflake domain ⇒ at least one CTE OR a CROSS JOIN in the FROM tree
    has_cross = _find_cross_join(qf.from_)
    assert qf.ctes or has_cross


def _find_cross_join(src) -> bool:
    if isinstance(src, sa.JoinNode):
        return src.kind == "CROSS" or _find_cross_join(src.left) or _find_cross_join(src.right)
    return False


def test_unpivot_and_pivot_emit_corresponding_nodes():
    rel = lg.LogicalOpRelation(table="t")
    up = lg.LogicalOpUnpivot(input=rel, pivot_cols=("a", "b"),
                              value_col="v", name_col="n")
    qf = compile_logical_to_sql(up)
    # UNPIVOT renders as a FnCall-style node or a dedicated projection; at
    # minimum the value_col + name_col appear as projected aliases.
    aliases = {p.alias for p in qf.projections}
    assert {"v", "n"}.issubset(aliases)

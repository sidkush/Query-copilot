import pytest
from vizql import sql_ast as sa
from vizql.passes.input_schema_prover import InputSchemaProverPass, InputSchemaError
from vizql.passes.logical_op_schema_and_type_deriver import SchemaAndTypeDeriverPass
from vizql.passes.data_type_resolver import DataTypeResolverPass
from vizql.passes.join_tree_virtualizer import JoinTreeVirtualizerPass
from vizql.passes.equality_prover import EqualityProverPass


def _qf_with_missing_column() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="y",
                                     expression=sa.Column(name="ghost",
                                                          table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )


def test_schema_prover_rejects_ghost_column():
    schemas = {"tbl": {"x": "int"}}
    with pytest.raises(InputSchemaError, match="ghost"):
        InputSchemaProverPass(schemas).run(_qf_with_missing_column())


def test_schema_prover_accepts_known_column():
    schemas = {"tbl": {"ghost": "int"}}
    InputSchemaProverPass(schemas).run(_qf_with_missing_column())  # no raise


def test_type_deriver_annotates_projections():
    schemas = {"tbl": {"x": "int", "y": "float"}}
    qf = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="a", expression=sa.Column(name="x", table_alias="t")),
            sa.Projection(alias="b", expression=sa.Column(name="y", table_alias="t")),
        ),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    derived = SchemaAndTypeDeriverPass(schemas).run(qf)
    # both projections now carry resolved_type
    assert all(getattr(p.expression, "resolved_type", "unknown") != "unknown"
               for p in derived.projections)


def test_data_type_resolver_propagates_binary_op_types():
    schemas = {"tbl": {"x": "int", "y": "int"}}
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="sum",
            expression=sa.BinaryOp(op="+",
                                    left=sa.Column(name="x", table_alias="t"),
                                    right=sa.Column(name="y", table_alias="t"))),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    qf2 = SchemaAndTypeDeriverPass(schemas).run(qf)
    qf3 = DataTypeResolverPass().run(qf2)
    binop = qf3.projections[0].expression
    assert binop.resolved_type in {"int", "number"}


def test_data_type_resolver_rejects_cast_to_unknown_source():
    schemas = {"tbl": {"x": "unknown"}}
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="c",
            expression=sa.Cast(expr=sa.Column(name="x", table_alias="t"),
                                target_type="int")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    with pytest.raises(Exception, match=r"(?i)unknown"):
        DataTypeResolverPass(strict=True).run(
            SchemaAndTypeDeriverPass(schemas).run(qf))


def _qf_three_tables() -> sa.SQLQueryFunction:
    a = sa.TableRef(name="a", alias="a")
    b = sa.TableRef(name="b", alias="b")
    c = sa.TableRef(name="c", alias="c")
    j1 = sa.JoinNode(kind="INNER", left=a, right=b,
                     on=sa.BinaryOp(op="=",
                                     left=sa.Column(name="id", table_alias="a"),
                                     right=sa.Column(name="a_id", table_alias="b")))
    j2 = sa.JoinNode(kind="INNER", left=j1, right=c,
                     on=sa.BinaryOp(op="=",
                                     left=sa.Column(name="id", table_alias="b"),
                                     right=sa.Column(name="b_id", table_alias="c")))
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="a")),),
        from_=j2,
    )


def test_join_virtualizer_drops_unreferenced_table():
    qf = _qf_three_tables()
    out = JoinTreeVirtualizerPass(referenced_tables={"a"}).run(qf)
    # only 'a' is referenced; joins to b and c should collapse to base TableRef
    assert isinstance(out.from_, sa.TableRef)
    assert out.from_.name == "a"


def test_join_virtualizer_keeps_referenced_joins():
    qf = _qf_three_tables()
    out = JoinTreeVirtualizerPass(referenced_tables={"a", "b"}).run(qf)
    assert isinstance(out.from_, sa.JoinNode)


def test_equality_prover_collects_asserted_equalities():
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
        where=sa.BinaryOp(op="=",
                           left=sa.Column(name="x", table_alias="t"),
                           right=sa.Literal(value=1, data_type="int")),
    )
    prover = EqualityProverPass()
    prover.run(qf)
    eq = prover.assertions_for_scope("root")
    assert ("t.x", "1") in eq.equalities


def test_equality_prover_is_idempotent():
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
    )
    p = EqualityProverPass()
    assert p.run(p.run(qf)) == p.run(qf)


from vizql.passes.aggregate_pushdown import AggregatePushdownPass
from vizql.passes.common_subexp_elimination import CommonSubexpElimPass
from vizql.optimizer import optimize, OptimizerContext


def test_agg_pushdown_moves_sum_into_subquery_when_safe():
    inner = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="*",
                                     expression=sa.Column(name="*", table_alias="")),),
        from_=sa.TableRef(name="orders", alias="o"),
    )
    outer = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region",
                          expression=sa.Column(name="region", table_alias="sub")),
            sa.Projection(alias="total",
                          expression=sa.FnCall(
                              name="SUM",
                              args=(sa.Column(name="amount", table_alias="sub"),))),
        ),
        from_=sa.SubqueryRef(query=inner, alias="sub"),
        group_by=(sa.Column(name="region", table_alias="sub"),),
    )
    out = AggregatePushdownPass().run(outer)
    # pushed: the inner query now carries the SUM + GROUP BY
    pushed_inner = out.from_.query  # type: ignore[union-attr]
    agg_names = {p.alias for p in pushed_inner.projections}
    assert "total" in agg_names or len(pushed_inner.group_by) > 0


def test_cse_hoists_shared_subexpression_to_cte():
    # expression "x * 2" referenced twice → CSE promotes it
    shared = sa.BinaryOp(op="*",
                          left=sa.Column(name="x", table_alias="t"),
                          right=sa.Literal(value=2, data_type="int"))
    qf = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="a", expression=shared),
            sa.Projection(alias="b",
                          expression=sa.BinaryOp(op="+",
                                                  left=shared,
                                                  right=sa.Literal(value=1,
                                                                    data_type="int"))),
        ),
        from_=sa.TableRef(name="t", alias="t"),
    )
    out = CommonSubexpElimPass().run(qf)
    # a shared expression counted ≥ 2 becomes a named ref
    assert "cse" in " ".join(out.diagnostics) or len(out.ctes) >= 1 or \
           any(isinstance(p.expression, sa.Column) and p.expression.name.startswith("__cse")
               for p in out.projections)


def test_optimizer_pipeline_idempotent():
    schemas = {"tbl": {"x": "int"}}
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    ctx = OptimizerContext(schemas=schemas, referenced_tables={"tbl"})
    once = optimize(qf, ctx)
    twice = optimize(once, ctx)
    assert once == twice


def test_optimizer_pipeline_terminates_fixed_cap():
    # no pass should explode the AST; pipeline caps iterations at 2
    schemas = {"tbl": {"x": "int"}}
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    ctx = OptimizerContext(schemas=schemas, referenced_tables={"tbl"},
                            max_iterations=2)
    optimize(qf, ctx)  # no raise; completes under cap

"""Plan 7c SQL AST — scaffold, expressions, visitor."""
import pytest

def test_prereq_plan_7b_shipped():
    """Fail loudly if Plan 7b logical/compiler/validator not importable."""
    from vizql import logical, compiler, validator
    rel = logical.LogicalOpRelation(table="t")
    validator.validate_logical_plan(rel)  # raises if broken
    assert isinstance(rel, logical.LogicalOpRelation)

def test_prereq_sqlglot_30_1_0_or_compatible():
    import sqlglot
    major, minor = (int(x) for x in sqlglot.__version__.split(".")[:2])
    assert major == 30, f"sqlglot major pinned to 30; got {sqlglot.__version__}"


from vizql import sql_ast as sa

def test_column_is_frozen_hashable():
    c = sa.Column(name="x", table_alias="t")
    assert hash(c) == hash(sa.Column(name="x", table_alias="t"))
    with pytest.raises(Exception):  # FrozenInstanceError
        c.name = "y"  # type: ignore[misc]

def test_literal_retains_type_tag():
    lit = sa.Literal(value=42, data_type="int")
    assert lit.data_type == "int"

def test_binaryop_composes():
    expr = sa.BinaryOp(op="=",
                      left=sa.Column(name="a", table_alias="t"),
                      right=sa.Literal(value=1, data_type="int"))
    assert expr.op == "="

def test_fncall_aggregate_filter_clause_present():
    """§IV.6 observed: FILTER (WHERE …) on aggregate."""
    agg = sa.FnCall(
        name="SUM",
        args=(sa.Column(name="sales", table_alias="t"),),
        filter_clause=sa.BinaryOp(
            op=">",
            left=sa.Column(name="y", table_alias="t"),
            right=sa.Literal(value=2020, data_type="int"),
        ),
    )
    assert agg.filter_clause is not None

def test_case_expression():
    e = sa.Case(
        whens=((sa.BinaryOp(op=">",
                            left=sa.Column(name="x", table_alias="t"),
                            right=sa.Literal(value=0, data_type="int")),
                sa.Literal(value="pos", data_type="string")),),
        else_=sa.Literal(value="neg", data_type="string"),
    )
    assert len(e.whens) == 1

def test_cast_annotates_target_type():
    c = sa.Cast(expr=sa.Column(name="x", table_alias="t"), target_type="float")
    assert c.target_type == "float"

def test_window_expression_has_partition_order_frame():
    """§IV.6: OVER(PARTITION BY … ORDER BY … ROWS/RANGE …)."""
    w = sa.Window(
        expr=sa.FnCall(name="ROW_NUMBER", args=()),
        partition_by=(sa.Column(name="d", table_alias="t"),),
        order_by=((sa.Column(name="d", table_alias="t"), True),),  # (expr, is_asc)
        frame=sa.FrameClause(kind="ROWS",
                             start=("UNBOUNDED", 0),
                             end=("CURRENT_ROW", 0)),
    )
    assert w.frame.kind == "ROWS"

def test_visitor_dispatch_reaches_every_kind():
    class NameCollector(sa.Visitor[list]):
        def visit_column(self, n): return [f"col:{n.name}"]
        def visit_literal(self, n): return [f"lit:{n.value}"]
        def visit_binary_op(self, n):
            return self.visit(n.left) + [f"op:{n.op}"] + self.visit(n.right)
        def visit_fn_call(self, n):
            out = [f"fn:{n.name}"]
            for a in n.args: out += self.visit(a)
            return out
        def visit_case(self, n): return ["case"]
        def visit_cast(self, n): return ["cast"] + self.visit(n.expr)
        def visit_window(self, n): return ["window"]
        def visit_subquery(self, n): return ["subq"]

    e = sa.BinaryOp(op="=", left=sa.Column(name="a", table_alias="t"),
                    right=sa.Literal(value=1, data_type="int"))
    assert e.accept(NameCollector()) == ["col:a", "op:=", "lit:1"]


def _trivial_qf() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="x", expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )

def test_qf_minimal():
    qf = _trivial_qf()
    assert len(qf.projections) == 1
    assert qf.from_.name == "tbl"

def test_qf_having_requires_group_by():
    """SQLQueryFunctionHavingInSelects rule: HAVING invalid without GROUP BY
    OR aggregate projection."""
    with pytest.raises(sa.SQLASTStructuralError):
        sa.SQLQueryFunction(
            projections=(sa.Projection(
                alias="x", expression=sa.Column(name="x", table_alias="t")),),
            from_=sa.TableRef(name="tbl", alias="t"),
            having=sa.BinaryOp(op=">",
                               left=sa.Column(name="x", table_alias="t"),
                               right=sa.Literal(value=0, data_type="int")),
        ).validate_structure()

def test_qf_force_longs_last_ordering():
    """SQLQueryFunctionForceLongsLast: wide (long) columns come after narrow."""
    qf = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="note",
                          expression=sa.Column(name="note", table_alias="t",
                                               resolved_type="string")),
            sa.Projection(alias="id",
                          expression=sa.Column(name="id", table_alias="t",
                                               resolved_type="int")),
        ),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    reordered = qf.force_longs_last()
    assert reordered.projections[0].alias == "id"
    assert reordered.projections[1].alias == "note"

def test_qf_force_aggregation_when_empty_bindings():
    """ForceAggregation::HandleEmptyBindings — an empty GROUP BY with agg
    projections MUST pass checker (scalar-agg case)."""
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="n",
            expression=sa.FnCall(name="COUNT",
                                 args=(sa.Literal(value=1, data_type="int"),))),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )
    qf.validate_structure()  # no raise

def test_qf_client_side_filters_flagged():
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="x", expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
        client_side_filters=(sa.BinaryOp(
            op="=",
            left=sa.Column(name="tc", table_alias="t"),
            right=sa.Literal(value=1, data_type="int")),),
    )
    assert len(qf.client_side_filters) == 1

def test_qf_totals_flag():
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="x", expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
        totals_query_required=True,
    )
    assert qf.totals_query_required

def test_cte_and_setop_nodes():
    inner = _trivial_qf()
    cte = sa.CTE(name="ctx_ds1", query=inner, recursive=False)
    assert cte.name == "ctx_ds1"
    so = sa.SetOp(kind="UNION", left=inner, right=inner, all=False)
    assert so.kind == "UNION"

def test_join_node_kinds():
    for kind in ("INNER", "LEFT", "RIGHT", "FULL", "CROSS"):
        j = sa.JoinNode(kind=kind,
                        left=sa.TableRef(name="a", alias="a"),
                        right=sa.TableRef(name="b", alias="b"),
                        on=sa.Literal(value=True, data_type="bool"))
        assert j.kind == kind

def test_to_sql_generic_round_trips_through_sqlglot():
    """The ANSI stringifier must emit SQL that sqlglot parses cleanly."""
    import sqlglot
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="c", expression=sa.FnCall(
                name="COUNT", args=(sa.Column(name="*", table_alias=""),))),),
        from_=sa.TableRef(name="orders", alias="o"),
        where=sa.BinaryOp(op=">",
                          left=sa.Column(name="amount", table_alias="o"),
                          right=sa.Literal(value=100, data_type="int")),
    )
    sql = qf.to_sql_generic()
    parsed = sqlglot.parse_one(sql, dialect="postgres")
    assert parsed is not None

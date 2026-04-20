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

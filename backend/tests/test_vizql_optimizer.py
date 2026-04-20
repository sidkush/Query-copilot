import pytest
from vizql import sql_ast as sa
from vizql.passes.input_schema_prover import InputSchemaProverPass, InputSchemaError
from vizql.passes.logical_op_schema_and_type_deriver import SchemaAndTypeDeriverPass
from vizql.passes.data_type_resolver import DataTypeResolverPass


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

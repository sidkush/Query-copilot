"""Builds the 15 canonical SQLQueryFunction scenarios used by every
dialect test suite. Pure AST construction — no dialect logic."""
from __future__ import annotations

from typing import Callable

from vizql import sql_ast as sa


def _col(name: str, alias: str = "t") -> sa.Column:
    return sa.Column(name=name, table_alias=alias)


def _lit(v, dt="string") -> sa.Literal:
    return sa.Literal(value=v, data_type=dt)


def scenario_01_simple_bar() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="category", expression=_col("category")),
            sa.Projection(alias="rev", expression=sa.FnCall(
                name="SUM", args=(_col("revenue"),))),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=(_col("category"),),
        order_by=((_col("rev", ""), False),),
        limit=100,
    )


def scenario_02_lod_fixed() -> sa.SQLQueryFunction:
    # FIXED [region] SUM(revenue) - correlated subquery.
    # Correlated scalar subquery must project exactly one column (the
    # aggregate value). The join-back on region happens via
    # correlated_on, which is metadata consumed by downstream rewriters.
    inner = sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="fx", expression=sa.FnCall(
                name="SUM", args=(_col("revenue", "s"),))),
        ),
        from_=sa.TableRef(name="sales", alias="s"),
        group_by=(_col("region", "s"),),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region", expression=_col("region")),
            sa.Projection(alias="fx", expression=sa.Subquery(
                query=inner, correlated_on=(("region", "region"),))),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=(_col("region"),),
    )


def scenario_03_lod_include() -> sa.SQLQueryFunction:
    win = sa.Window(
        expr=sa.FnCall(name="SUM", args=(_col("revenue"),)),
        partition_by=(_col("region"), _col("segment")),
        order_by=(),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region", expression=_col("region")),
            sa.Projection(alias="inc", expression=win),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
    )


def scenario_04_lod_exclude() -> sa.SQLQueryFunction:
    win = sa.Window(
        expr=sa.FnCall(name="SUM", args=(_col("revenue"),)),
        partition_by=(_col("region"),),          # segment excluded
        order_by=(),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region",  expression=_col("region")),
            sa.Projection(alias="segment", expression=_col("segment")),
            sa.Projection(alias="exc",     expression=win),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
    )


def scenario_05_context_filter_cte() -> sa.SQLQueryFunction:
    ctx_body = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="id", expression=_col("id", "s")),),
        from_=sa.TableRef(name="sales", alias="s"),
        where=sa.BinaryOp(op=">=", left=_col("order_date", "s"),
                          right=_lit("2026-01-01", "date")),
    )
    inner_join = sa.JoinNode(
        kind="INNER",
        left=sa.TableRef(name="sales", alias="t"),
        right=sa.SubqueryRef(query=ctx_body, alias="ctx"),
        on=sa.BinaryOp(op="=", left=_col("id", "t"), right=_col("id", "ctx")),
    )
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="cnt",
                                    expression=sa.FnCall(name="COUNT",
                                                          args=(_lit(1, "int"),))),),
        from_=inner_join,
    )


def scenario_06_measure_filter_having() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region", expression=_col("region")),
            sa.Projection(alias="qsum", expression=sa.FnCall(name="SUM",
                                                              args=(_col("qty"),))),
        ),
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=(_col("region"),),
        having=sa.BinaryOp(op=">",
                           left=sa.FnCall(name="SUM", args=(_col("qty"),)),
                           right=_lit(100, "int")),
    )


def scenario_07_window_running_sum() -> sa.SQLQueryFunction:
    frame = sa.FrameClause(kind="ROWS", start=("UNBOUNDED", 0), end=("CURRENT_ROW", 0))
    win = sa.Window(
        expr=sa.FnCall(name="SUM", args=(_col("revenue"),)),
        partition_by=(_col("region"),),
        order_by=((_col("order_date"), True),),
        frame=frame,
    )
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="rsum", expression=win),),
        from_=sa.TableRef(name="sales", alias="t"),
    )


def scenario_08_pivot_unpivot() -> sa.SQLQueryFunction:
    # Pivot is a CASE-inside-SUM pattern; dialects that support native
    # PIVOT can override. The CASE sits under SUM so the per-row
    # branching is aggregated to the GROUP BY grain (category).
    case = sa.Case(
        whens=((sa.BinaryOp(op="=", left=_col("status"),
                             right=_lit("paid")), _col("revenue")),),
        else_=_lit(0, "int"))
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="category", expression=_col("category")),
            sa.Projection(alias="paid_sum",
                           expression=sa.FnCall(name="SUM", args=(case,))),
        ),
        from_=sa.TableRef(name="orders", alias="t"),
        group_by=(_col("category"),),
    )


def scenario_09_union() -> sa.SQLQueryFunction:
    left = scenario_01_simple_bar()
    right = sa.SQLQueryFunction(
        projections=left.projections,
        from_=sa.TableRef(name="sales_archive", alias="t"),
        group_by=(_col("category"),),
    )
    return sa.SQLQueryFunction(
        projections=left.projections,
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=left.group_by,
        set_op=sa.SetOp(kind="UNION", left=left, right=right, all=True),
    )


def scenario_10_relative_date() -> sa.SQLQueryFunction:
    today = sa.FnCall(name="CURRENT_TIMESTAMP", args=())
    trunc = sa.FnCall(name="DATE_TRUNC", args=(_lit("month"), today))
    lower = sa.BinaryOp(op="-", left=trunc,
                         right=sa.FnCall(name="INTERVAL",
                                          args=(_lit("month"), _lit(6, "int"))))
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="c",
                                    expression=sa.FnCall(name="COUNT",
                                                          args=(_lit(1, "int"),))),),
        from_=sa.TableRef(name="sales", alias="t"),
        where=sa.BinaryOp(op=">=", left=_col("order_date"), right=lower),
    )


def scenario_11_categorical_filter() -> sa.SQLQueryFunction:
    in_list = sa.FnCall(name="IN",
                         args=(_col("region"), _lit("West"), _lit("East")))
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="r", expression=_col("region")),),
        from_=sa.TableRef(name="sales", alias="t"),
        where=in_list,
    )


def scenario_12_parameter_substitution() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="hit",
                                    expression=sa.BinaryOp(op=">",
                                                            left=sa.FnCall(name="SUM",
                                                                             args=(_col("revenue"),)),
                                                            right=_lit(250000, "int"))),),
        from_=sa.TableRef(name="sales", alias="t"),
        group_by=(_col("region"),),
    )


def scenario_13_snowflake_domain() -> sa.SQLQueryFunction:
    dim = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="region", expression=_col("region", "d")),),
        from_=sa.TableRef(name="dim_region", alias="d"),
    )
    join = sa.JoinNode(
        kind="LEFT",
        left=sa.SubqueryRef(query=dim, alias="d"),
        right=sa.TableRef(name="sales", alias="s"),
        on=sa.BinaryOp(op="=", left=_col("region", "d"),
                         right=_col("region", "s")),
    )
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(alias="region", expression=_col("region", "d")),
            sa.Projection(alias="rev", expression=sa.FnCall(name="SUM",
                                                              args=(_col("revenue", "s"),))),
        ),
        from_=join,
        group_by=(_col("region", "d"),),
    )


def scenario_14_table_calc_flag_no_sql() -> sa.SQLQueryFunction:
    # Table-calc filter is IV.7 step 8 - client-side. Must NOT appear in SQL.
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="rev",
                                    expression=sa.FnCall(name="SUM",
                                                          args=(_col("revenue"),))),),
        from_=sa.TableRef(name="sales", alias="t"),
        client_side_filters=(sa.BinaryOp(op=">", left=_col("rn"),
                                           right=_lit(5, "int")),),
    )


def scenario_15_cast_boolean() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="flag",
                                    expression=sa.Cast(
                                        expr=_col("status"),
                                        target_type="boolean")),),
        from_=sa.TableRef(name="accounts", alias="t"),
        where=sa.BinaryOp(op="=", left=_col("flag"),
                         right=_lit(True, "bool")),
    )


SCENARIOS: dict[str, Callable[[], sa.SQLQueryFunction]] = {
    "01_simple_bar": scenario_01_simple_bar,
    "02_lod_fixed": scenario_02_lod_fixed,
    "03_lod_include": scenario_03_lod_include,
    "04_lod_exclude": scenario_04_lod_exclude,
    "05_context_filter_cte": scenario_05_context_filter_cte,
    "06_measure_filter_having": scenario_06_measure_filter_having,
    "07_window_running_sum": scenario_07_window_running_sum,
    "08_pivot_unpivot": scenario_08_pivot_unpivot,
    "09_union": scenario_09_union,
    "10_relative_date": scenario_10_relative_date,
    "11_categorical_filter": scenario_11_categorical_filter,
    "12_parameter_substitution": scenario_12_parameter_substitution,
    "13_snowflake_domain": scenario_13_snowflake_domain,
    "14_table_calc_flag_no_sql": scenario_14_table_calc_flag_no_sql,
    "15_cast_boolean": scenario_15_cast_boolean,
}

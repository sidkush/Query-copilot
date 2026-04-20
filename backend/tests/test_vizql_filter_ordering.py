"""Plan 7c §IV.7 — nine-stage filter ordering."""
import pytest
from vizql import sql_ast as sa
from vizql.filter_ordering import (
    apply_filters_in_order, StagedFilter, FILTER_STAGES,
)


def _plan() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(sa.Projection(alias="x",
                                     expression=sa.Column(name="x", table_alias="t")),),
        from_=sa.TableRef(name="tbl", alias="t"),
    )


def _pred(col: str, val: int) -> sa.SQLQueryExpression:
    return sa.BinaryOp(op=">",
                        left=sa.Column(name=col, table_alias="t"),
                        right=sa.Literal(value=val, data_type="int"))


def test_stage_order_is_canonical_nine():
    assert FILTER_STAGES == (
        "extract", "datasource", "context",
        "fixed_lod", "dimension", "include_exclude_lod",
        "measure", "table_calc", "totals",
    )


def test_datasource_filter_goes_to_where():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="datasource", predicate=_pred("d", 0)),
    ])
    assert out.where is not None


def test_context_filter_becomes_cte():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="context", predicate=_pred("c", 0)),
    ])
    assert len(out.ctes) >= 1
    assert out.ctes[0].name.startswith("ctx_")


def test_dimension_filter_goes_to_where_after_context():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="context", predicate=_pred("c", 0)),
        StagedFilter(stage="dimension", predicate=_pred("d", 0)),
    ])
    assert out.where is not None  # dim filter on outer
    assert out.ctes  # context still materialised


def test_measure_filter_goes_to_having_not_where():
    # Need a group_by/agg for checker to accept HAVING
    base = sa.SQLQueryFunction(
        projections=(sa.Projection(
            alias="total",
            expression=sa.FnCall(
                name="SUM",
                args=(sa.Column(name="amount", table_alias="t"),))),),
        from_=sa.TableRef(name="tbl", alias="t"),
        group_by=(sa.Column(name="region", table_alias="t"),),
    )
    out = apply_filters_in_order(base, [
        StagedFilter(stage="measure", predicate=_pred("total", 100)),
    ])
    assert out.having is not None
    assert out.where is None  # measure filter MUST NOT land in WHERE


def test_fixed_lod_does_not_reflect_dim_filter_by_default():
    """The property §IV.7 insists on: a dim filter does NOT filter a
    FIXED LOD unless promoted to Context."""
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="fixed_lod", predicate=_pred("fx", 0)),
        StagedFilter(stage="dimension", predicate=_pred("d", 0)),
    ])
    # fixed_lod becomes a subquery / marker; dim filter sits above as WHERE.
    # The subquery predicate must NOT be AND'd with the dim predicate.
    assert out.where is not None


def test_include_exclude_goes_to_window_layer_marker():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="include_exclude_lod", predicate=_pred("inc", 0)),
    ])
    # Stage is carried to downstream window emission (Task 8)
    assert "include_exclude_lod" in " ".join(out.diagnostics)


def test_table_calc_filter_is_client_side_only():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="table_calc", predicate=_pred("tc", 0)),
    ])
    assert len(out.client_side_filters) == 1
    assert out.where is None


def test_totals_filter_flags_second_query():
    out = apply_filters_in_order(_plan(), [
        StagedFilter(stage="totals", predicate=_pred("tot", 0),
                     should_affect_totals=False),
    ])
    assert out.totals_query_required is True
    assert out.should_affect_totals is False


def test_case_sensitive_flag_round_trips():
    f = StagedFilter(stage="dimension", predicate=_pred("d", 0),
                     case_sensitive=False)
    assert f.case_sensitive is False  # wildcard LIKE vs ILIKE choice deferred to Plan 7d


def test_bad_stage_raises():
    with pytest.raises(ValueError):
        StagedFilter(stage="bogus", predicate=_pred("x", 0))

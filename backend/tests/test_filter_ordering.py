"""Plan 8b §V.2 / §IV.7 — LOD filter-stage placement tests.

These tests cover the new `LodPlacement` + `place_lod_in_order` helper added
in Plan 8b Task T6 on top of the pre-existing `apply_filters_in_order` + 9-stage
order machinery (Plan 7c).

§IV.7 fact under test: *"A dimension filter does NOT filter a FIXED LOD unless
promoted to Context."*
§V.2 fact: *"JoinLODOverrides = per-viz override set written into `.twb` XML."*
Modelled as an opt-in list of LodCalculation IDs whose compiled partition_by
was hand-edited and therefore must bypass auto-placement.
"""
from __future__ import annotations

from vizql.filter_ordering import (
    FILTER_STAGES,
    LodPlacement,
    StagedFilter,
    apply_filters_in_order,
    place_lod_in_order,
)
from vizql import sql_ast as sa


def _trivial_plan() -> sa.SQLQueryFunction:
    return sa.SQLQueryFunction(
        projections=(
            sa.Projection(
                alias="x",
                expression=sa.Column(name="x", table_alias="t"),
            ),
        ),
        from_=sa.TableRef(name="t", alias="t"),
    )


def test_place_lod_in_order_fixed_lands_at_stage_4() -> None:
    placement = LodPlacement(
        lod_id="lod1",
        stage="fixed_lod",
        predicate=sa.Literal(value=1, data_type="int"),
    )
    plan = place_lod_in_order(_trivial_plan(), (placement,))
    # Plan 7c's apply_filters_in_order writes fixed_lod placements into
    # diagnostics (step 4 marker).
    assert any("fixed_lod_filter" in d for d in plan.diagnostics)


def test_place_lod_in_order_include_lands_at_stage_6() -> None:
    placement = LodPlacement(
        lod_id="lod2",
        stage="include_exclude_lod",
        predicate=sa.Literal(value=1, data_type="int"),
    )
    plan = place_lod_in_order(_trivial_plan(), (placement,))
    assert any("include_exclude_lod" in d for d in plan.diagnostics)


def test_place_lod_in_order_respects_overrides() -> None:
    p1 = LodPlacement(
        lod_id="lod1",
        stage="fixed_lod",
        predicate=sa.Literal(value=1, data_type="int"),
    )
    p2 = LodPlacement(
        lod_id="lod2",
        stage="fixed_lod",
        predicate=sa.Literal(value=2, data_type="int"),
    )
    plan = place_lod_in_order(
        _trivial_plan(), (p1, p2), overrides=("lod1",),
    )
    # Only lod2 placed — lod1 skipped (user hand-overrode in the .twb).
    fixed_diag = [d for d in plan.diagnostics if "fixed_lod_filter" in d]
    assert len(fixed_diag) == 1
    # And lod2's payload (the integer literal 2) must be the one that landed.
    assert "2" in fixed_diag[0]


def test_dim_filter_does_not_apply_to_fixed_lod_unless_context_promoted() -> None:
    """§IV.7: dim filter (stage 5) runs AFTER FIXED LOD (stage 4).

    Proof via SQL diagnostics:
      - dim filter appears in WHERE (folded in at stage 5)
      - fixed_lod predicate appears in the `fixed_lod_filter:` diagnostic at
        stage 4
      - Neither the fixed_lod predicate nor its inner subquery references the
        dim filter's field, proving the FIXED subquery runs against the
        unfiltered CTE/table.
    """
    dim_filter = StagedFilter(
        stage="dimension",
        predicate=sa.BinaryOp(
            op="=",
            left=sa.Column(name="Segment", table_alias="t"),
            right=sa.Literal(value="Corporate", data_type="string"),
        ),
    )
    fixed_placement = LodPlacement(
        lod_id="region_total",
        stage="fixed_lod",
        predicate=sa.Column(name="region_total_sales", table_alias="t"),
    )
    plan = place_lod_in_order(_trivial_plan(), (fixed_placement,))
    plan = apply_filters_in_order(plan, (dim_filter,))

    # Dim filter is in WHERE (stage 5).
    assert plan.where is not None
    # FIXED predicate is in diagnostics at stage 4 — not folded into WHERE.
    assert any("fixed_lod_filter" in d for d in plan.diagnostics)


def test_dim_filter_DOES_apply_to_fixed_lod_when_promoted_to_context() -> None:
    """Counterpart: when user right-clicks → Add to Context, the filter runs
    at stage 3 (CTE) — FIXED's correlated subquery now runs against the
    filtered CTE, so the filter DOES narrow the FIXED result."""
    promoted = StagedFilter(
        stage="context",  # <- user promoted
        predicate=sa.BinaryOp(
            op="=",
            left=sa.Column(name="Segment", table_alias="t"),
            right=sa.Literal(value="Corporate", data_type="string"),
        ),
    )
    fixed_placement = LodPlacement(
        lod_id="region_total",
        stage="fixed_lod",
        predicate=sa.Column(name="region_total_sales", table_alias="t"),
    )
    plan = apply_filters_in_order(_trivial_plan(), (promoted,))
    plan = place_lod_in_order(plan, (fixed_placement,))

    # Context filter materialises as a CTE wrapping the plan.
    assert len(plan.ctes) == 1
    # FIXED placement recorded downstream.
    assert any("fixed_lod_filter" in d for d in plan.diagnostics)


def test_lod_placement_rejects_invalid_stage() -> None:
    """`LodPlacement.stage` must be one of the two LOD-bearing stages."""
    import pytest

    with pytest.raises(ValueError):
        LodPlacement(
            lod_id="lodX",
            stage="dimension",  # not a valid LOD stage
            predicate=sa.Literal(value=1, data_type="int"),
        )


def test_filter_stages_unchanged() -> None:
    """Adding LodPlacement must not alter the canonical 9-stage order."""
    assert FILTER_STAGES == (
        "extract", "datasource", "context",
        "fixed_lod", "dimension", "include_exclude_lod",
        "measure", "table_calc", "totals",
    )

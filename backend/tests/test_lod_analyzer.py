"""Plan 8b — FIXED LOD cost estimator + CalcWarning."""
from __future__ import annotations

import pytest

from vizql import lod_analyzer as la
from vizql import calc_ast as ca


class _StubSchemaStats:
    def __init__(self, cardinalities: dict[str, int]) -> None:
        self._c = cardinalities

    def distinct_count(self, field_name: str) -> int:
        return self._c.get(field_name, 0)


def _fixed(dims: tuple[str, ...]) -> ca.LodExpr:
    return ca.LodExpr(
        kind="FIXED",
        dims=tuple(ca.FieldRef(field_name=d) for d in dims),
        body=ca.FnCall(name="SUM", args=(ca.FieldRef(field_name="Sales"),)),
    )


def test_cost_is_product_of_distinct_counts():
    stats = _StubSchemaStats({"Region": 5, "City": 200})
    cost = la.estimate_fixed_lod_cost(_fixed(("Region", "City")), stats)
    assert cost.estimate == 5 * 200
    assert cost.dims == ("Region", "City")


def test_warning_emitted_above_threshold():
    stats = _StubSchemaStats({"Region": 5, "City": 500_000})
    warnings = la.analyze_fixed_lod(
        _fixed(("Region", "City")), stats, threshold=1_000_000,
    )
    assert len(warnings) == 1
    assert warnings[0].kind == "expensive_fixed_lod"
    assert warnings[0].estimate == 5 * 500_000
    assert "context" in warnings[0].suggestion.lower()


def test_no_warning_below_threshold():
    stats = _StubSchemaStats({"Region": 5, "City": 1000})
    assert la.analyze_fixed_lod(
        _fixed(("Region", "City")), stats, threshold=1_000_000,
    ) == []


def test_non_fixed_lod_returns_empty():
    expr = ca.LodExpr(
        kind="INCLUDE",
        dims=(ca.FieldRef(field_name="Region"),),
        body=ca.FnCall(name="SUM", args=(ca.FieldRef(field_name="Sales"),)),
    )
    assert la.analyze_fixed_lod(expr, _StubSchemaStats({"Region": 1_000_000})) == []


def test_missing_distinct_count_falls_back_to_zero_cost():
    # If a dim has no stats, we can't estimate — treat as 0 to avoid false-positive warnings.
    stats = _StubSchemaStats({})
    warnings = la.analyze_fixed_lod(_fixed(("Region",)), stats, threshold=10)
    assert warnings == []

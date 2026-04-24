"""AnalyticalPlanner — plan dataclass + emit-against-registry contract."""
from unittest.mock import MagicMock
import json

import pytest

from analytical_planner import (
    AnalyticalPlanner, AnalyticalPlan, PlanCTE, PlannerFallback,
)


def test_plan_dataclass_roundtrip():
    plan = AnalyticalPlan(
        plan_id="p1",
        ctes=[PlanCTE(name="base", description="filter trips", sql="SELECT * FROM trips")],
        fallback=False,
        registry_hits=["trips_row_count"],
    )
    d = plan.to_dict()
    restored = AnalyticalPlan.from_dict(d)
    assert restored == plan


def test_plan_cte_count_capped_at_three():
    """Plans with >3 CTEs must be rejected."""
    with pytest.raises(ValueError):
        AnalyticalPlan(
            plan_id="p1",
            ctes=[PlanCTE(name=f"c{i}", description="x", sql="SELECT 1") for i in range(4)],
            fallback=False,
            registry_hits=[],
        )


def test_planner_plan_method_returns_fallback_when_registry_empty():
    """Empty registry → plan marked fallback=True and caller uses free-form path."""
    provider = MagicMock()
    planner = AnalyticalPlanner(
        provider=provider,
        registry=MagicMock(list_for_conn=MagicMock(return_value=[])),
    )
    plan = planner.plan(
        conn_id="c1",
        nl="how many orders?",
        coverage_cards=[],
    )
    assert plan.fallback is True
    assert plan.ctes == []


def test_planner_emits_plan_from_mock_sonnet_response():
    """Planner calls provider with plan-emission system prompt, parses JSON response."""
    provider = MagicMock()
    provider.invoke = MagicMock(return_value={
        "content": json.dumps({
            "ctes": [
                {"name": "recent_trips", "description": "last 90 days", "sql": "SELECT * FROM trips WHERE started_at >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)"},
                {"name": "by_station", "description": "agg per station", "sql": "SELECT station_id, COUNT(*) FROM recent_trips GROUP BY station_id"},
            ],
            "registry_hits": ["trips_row_count", "trips_by_station"],
        }),
    })
    registry = MagicMock()
    registry.list_for_conn = MagicMock(return_value=[
        MagicMock(name="trips_row_count"),
        MagicMock(name="trips_by_station"),
    ])
    planner = AnalyticalPlanner(provider=provider, registry=registry)
    plan = planner.plan(conn_id="c1", nl="trips by station", coverage_cards=[])
    assert plan.fallback is False
    assert len(plan.ctes) == 2
    assert plan.ctes[0].name == "recent_trips"
    provider.invoke.assert_called_once()


def test_planner_rejects_emission_over_3_ctes():
    """Sonnet returns 4 CTEs → planner falls back."""
    provider = MagicMock()
    provider.invoke = MagicMock(return_value={
        "content": json.dumps({
            "ctes": [{"name": f"c{i}", "description": "x", "sql": "SELECT 1"} for i in range(4)],
            "registry_hits": [],
        }),
    })
    registry = MagicMock(list_for_conn=MagicMock(return_value=["some_hit"]))
    planner = AnalyticalPlanner(provider=provider, registry=registry)
    plan = planner.plan(conn_id="c1", nl="too complex", coverage_cards=[])
    assert plan.fallback is True


def test_planner_uses_cache_hit_and_skips_provider():
    """Cache hit -> provider NOT called; returned plan equals cached."""
    from analytical_planner import AnalyticalPlanner, AnalyticalPlan
    from plan_cache import CachedPlan
    from unittest.mock import MagicMock
    provider = MagicMock()
    registry = MagicMock()
    registry.list_for_conn = MagicMock(return_value=["some_hit"])
    cached_plan_obj = AnalyticalPlan(
        plan_id="p-cached", ctes=[], fallback=False, registry_hits=["m1"],
    )
    cache = MagicMock()
    cache.lookup = MagicMock(return_value=CachedPlan(plan=cached_plan_obj, similarity=0.95, cached_id="cid"))
    planner = AnalyticalPlanner(provider=provider, registry=registry)
    planner._cache = cache
    plan = planner.plan(conn_id="c1", nl="churn analysis", coverage_cards=[])
    assert plan.plan_id == "p-cached"
    provider.invoke.assert_not_called()


def test_planner_calls_provider_on_cache_miss():
    from analytical_planner import AnalyticalPlanner
    from unittest.mock import MagicMock
    import json as _j
    provider = MagicMock()
    provider.invoke = MagicMock(return_value={
        "content": _j.dumps({"ctes": [{"name": "c1", "description": "x", "sql": "SELECT 1"}], "registry_hits": []}),
    })
    registry = MagicMock()
    registry.list_for_conn = MagicMock(return_value=["some_hit"])
    cache = MagicMock()
    cache.lookup = MagicMock(return_value=None)
    cache.store = MagicMock()
    planner = AnalyticalPlanner(provider=provider, registry=registry)
    planner._cache = cache
    plan = planner.plan(conn_id="c1", nl="novel question", coverage_cards=[])
    provider.invoke.assert_called_once()
    cache.store.assert_called_once()
    assert plan.fallback is False

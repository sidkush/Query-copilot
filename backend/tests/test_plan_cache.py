"""PlanCache — ChromaDB plan retrieval via NL embedding."""
from unittest.mock import MagicMock
import pytest
from plan_cache import PlanCache, CachedPlan
from analytical_planner import AnalyticalPlan, PlanCTE


def _sample_plan(pid="p1"):
    return AnalyticalPlan(
        plan_id=pid,
        ctes=[PlanCTE(name="c1", description="d", sql="SELECT 1")],
        fallback=False,
        registry_hits=["m1"],
    )


def test_cache_miss_returns_none():
    chroma = MagicMock()
    chroma.query = MagicMock(return_value={"ids": [[]], "distances": [[]], "metadatas": [[]]})
    cache = PlanCache(chroma=chroma, embedder=MagicMock(encode=lambda t: [0.1] * 384), cosine_threshold=0.85)
    result = cache.lookup(tenant_id="t1", conn_id="c1", nl="hello")
    assert result is None


def test_cache_hit_returns_plan_above_threshold():
    import json
    plan = _sample_plan()
    plan_dict = json.dumps(plan.to_dict())
    chroma = MagicMock()
    chroma.query = MagicMock(return_value={
        "ids": [["id1"]], "distances": [[0.1]],
        "metadatas": [[{"plan_json": plan_dict}]],
    })
    emb = MagicMock(encode=lambda t: [0.1] * 384)
    cache = PlanCache(chroma=chroma, embedder=emb, cosine_threshold=0.85)
    result = cache.lookup(tenant_id="t1", conn_id="c1", nl="hello")
    assert result is not None
    assert result.plan.plan_id == "p1"


def test_cache_miss_below_threshold():
    chroma = MagicMock()
    chroma.query = MagicMock(return_value={
        "ids": [["id1"]], "distances": [[0.5]],
        "metadatas": [[{"plan_json": "{}"}]],
    })
    cache = PlanCache(chroma=chroma, embedder=MagicMock(encode=lambda t: [0.1] * 384), cosine_threshold=0.85)
    result = cache.lookup(tenant_id="t1", conn_id="c1", nl="hello")
    assert result is None


def test_store_writes_to_chroma():
    chroma = MagicMock()
    emb = MagicMock(encode=lambda t: [0.1] * 384)
    cache = PlanCache(chroma=chroma, embedder=emb, cosine_threshold=0.85)
    cache.store(tenant_id="t1", conn_id="c1", nl="hello", plan=_sample_plan())
    chroma.add.assert_called_once()

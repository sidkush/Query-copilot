"""S1 adversarial hardening — plan_cache must not leak across tenants,
must honor TTL, must invalidate on schema change, must cap per-tenant entries."""
import hashlib
import json
import time
from unittest.mock import MagicMock, patch
import pytest

from plan_cache import PlanCache
from analytical_planner import AnalyticalPlan, PlanCTE


def _plan(pid="p1"):
    return AnalyticalPlan(
        plan_id=pid,
        ctes=[PlanCTE(name="c1", description="d", sql="SELECT 1")],
        fallback=False,
        registry_hits=[],
    )


def test_store_rejects_empty_tenant_id():
    cache = PlanCache(chroma=MagicMock(), embedder=MagicMock(encode=lambda t: [0.1] * 8))
    with pytest.raises(ValueError):
        cache.store(tenant_id="", conn_id="c1", nl="hello", plan=_plan())


def test_lookup_rejects_empty_tenant_id():
    cache = PlanCache(chroma=MagicMock(), embedder=MagicMock(encode=lambda t: [0.1] * 8))
    with pytest.raises(ValueError):
        cache.lookup(tenant_id="", conn_id="c1", nl="hello")


def test_store_uses_composite_deterministic_doc_id():
    """Same (tenant, conn, nl) must produce the same doc_id so overwrites replace
    instead of spawning duplicate ChromaDB entries."""
    chroma = MagicMock()
    cache = PlanCache(chroma=chroma, embedder=MagicMock(encode=lambda t: [0.1] * 8))
    cache.store(tenant_id="t1", conn_id="c1", nl="hello", plan=_plan())
    call1_id = chroma.add.call_args.kwargs["ids"][0]
    chroma.reset_mock()
    cache.store(tenant_id="t1", conn_id="c1", nl="hello", plan=_plan())
    call2_id = chroma.add.call_args.kwargs["ids"][0]
    assert call1_id == call2_id
    # Different tenant => different doc_id
    chroma.reset_mock()
    cache.store(tenant_id="t2", conn_id="c1", nl="hello", plan=_plan())
    call3_id = chroma.add.call_args.kwargs["ids"][0]
    assert call3_id != call1_id


def test_lookup_respects_ttl():
    import plan_cache as pc_mod
    plan_dict = json.dumps(_plan().to_dict())
    stale_ts = time.time() - (200 * 3600)  # > 168h TTL
    chroma = MagicMock()
    chroma.query = MagicMock(return_value={
        "ids": [["id1"]], "distances": [[0.05]],
        "metadatas": [[{"plan_json": plan_dict, "created_at": stale_ts}]],
    })
    cache = PlanCache(chroma=chroma, embedder=MagicMock(encode=lambda t: [0.1] * 8))
    result = cache.lookup(tenant_id="t1", conn_id="c1", nl="hello")
    assert result is None  # stale entry must be evicted


def test_lookup_rejects_schema_hash_mismatch():
    plan_dict = json.dumps(_plan().to_dict())
    chroma = MagicMock()
    chroma.query = MagicMock(return_value={
        "ids": [["id1"]], "distances": [[0.05]],
        "metadatas": [[{
            "plan_json": plan_dict,
            "created_at": time.time(),
            "schema_hash": "old-hash",
        }]],
    })
    cache = PlanCache(chroma=chroma, embedder=MagicMock(encode=lambda t: [0.1] * 8))
    result = cache.lookup(tenant_id="t1", conn_id="c1", nl="hello", schema_hash="new-hash")
    assert result is None


def test_lookup_passes_schema_hash_match():
    plan_dict = json.dumps(_plan().to_dict())
    chroma = MagicMock()
    chroma.query = MagicMock(return_value={
        "ids": [["id1"]], "distances": [[0.05]],
        "metadatas": [[{
            "plan_json": plan_dict,
            "created_at": time.time(),
            "schema_hash": "h1",
        }]],
    })
    cache = PlanCache(chroma=chroma, embedder=MagicMock(encode=lambda t: [0.1] * 8))
    result = cache.lookup(tenant_id="t1", conn_id="c1", nl="hello", schema_hash="h1")
    assert result is not None

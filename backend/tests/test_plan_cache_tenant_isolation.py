"""Wave 2 — proves PlanCache collection key + where-filter both isolate tenants.

Commit 1 (tests-first):
- Cross-tenant collection-name isolation marked @pytest.mark.xfail with
  strict=True (awaiting Commit 2 which adds tenant prefix to collection name).
- Existing isolation guarantees (where-filter, empty-tenant rejection) test
  live behavior in plan_cache.py and pass today.

Commit 2 will remove the xfail decorator. The strict=True flag means CI
fails if the test starts passing while still marked xfail — forcing the
decorator removal in the same commit that lands the fix. Conversion from
xfail to pass is the signal that Commit 2 worked end-to-end.
"""
from unittest.mock import MagicMock
import pytest


def test_different_tenants_get_different_collection_names():
    """Same conn_id, different tenant_id MUST produce distinct collection names.

    Wave 2 Commit 2: helper body now includes 16-hex tenant prefix. Same
    conn_id across tenants no longer shares a Chroma collection — defense
    in depth on top of PlanCache's existing doc_id + where-filter isolation.
    """
    from plan_cache import compose_plan_cache_collection_name

    name_a = compose_plan_cache_collection_name(
        tenant_id="tenant-A-uuid", conn_id="shared-conn-id"
    )
    name_b = compose_plan_cache_collection_name(
        tenant_id="tenant-B-uuid", conn_id="shared-conn-id"
    )
    assert name_a != name_b, (
        "tenant_id must differentiate collection name; same conn_id shared "
        "across tenants must NOT share the same Chroma collection"
    )


def test_same_tenant_same_conn_collides_intentionally():
    """Same (tenant, conn) MUST produce same collection name — cache reuse path."""
    from plan_cache import compose_plan_cache_collection_name

    a = compose_plan_cache_collection_name(tenant_id="t1", conn_id="c1")
    b = compose_plan_cache_collection_name(tenant_id="t1", conn_id="c1")
    assert a == b


def test_plan_cache_lookup_blocks_cross_tenant_read_via_where_filter():
    """Even if two tenants land in same collection, where-filter scopes by tenant.

    PlanCache.lookup builds a Chroma where-clause that includes tenant_id.
    Tenant B querying a collection that contains Tenant A's doc must see
    its where filter scoped to "tenant_id == B" — Chroma then refuses to
    surface A's row regardless of cosine similarity.
    """
    from plan_cache import PlanCache

    fake_chroma = MagicMock()
    fake_chroma.query.return_value = {
        "ids": [["any-id"]],
        "distances": [[0.05]],
        "metadatas": [[{
            "tenant_id": "tenant-A",
            "conn_id": "shared-conn",
            "plan_json": (
                '{"plan_id":"pA","ctes":[],"fallback":true,"registry_hits":[]}'
            ),
            "created_at": 1700000000.0,
        }]],
    }
    embedder = MagicMock()
    embedder.encode.return_value = [0.1] * 384
    cache = PlanCache(fake_chroma, embedder, cosine_threshold=0.85)

    cache.lookup(tenant_id="tenant-B", conn_id="shared-conn", nl="show top trips")

    call_kwargs = fake_chroma.query.call_args.kwargs
    assert call_kwargs["where"]["tenant_id"] == "tenant-B", (
        "Chroma where filter MUST scope to caller tenant_id, not metadata tenant_id"
    )


def test_plan_cache_rejects_empty_tenant_id_on_lookup_and_store():
    """Empty tenant_id MUST raise ValueError on both code paths."""
    from plan_cache import PlanCache

    cache = PlanCache(MagicMock(), MagicMock(), 0.85)
    with pytest.raises(ValueError, match="tenant_id"):
        cache.lookup(tenant_id="", conn_id="c", nl="x")
    with pytest.raises(ValueError, match="tenant_id"):
        cache.store(tenant_id="", conn_id="c", nl="x", plan=MagicMock())

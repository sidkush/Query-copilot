"""Plan 7e T4 — HistoryTrackingCache + QueryCategory enum."""
from __future__ import annotations

import pytest

from vizql.cache import (
    AbstractQueryCacheKey,
    HistoryTrackingCache,
    InProcessLogicalQueryCache,
    InvalidationRecord,
    LRUQueryCachePolicy,
    OrderByKey,
)
from vizql.telemetry import QueryCategory


def _key(ds: str, i: int) -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id=ds, relation_tree_hash=f"rel_{i}", predicate_hash=f"pred_{i}",
        projection=("a",), group_bys=(), order_by=(OrderByKey(column="a"),),
        agg_types=("SUM",), dialect="duckdb",
    )


def test_get_and_put_pass_through():
    inner = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    c = HistoryTrackingCache(inner)
    k = _key("ds", 1)
    c.put(k, b"xxx", size_bytes=3)
    assert c.get(k) == b"xxx"


def test_invalidate_records_reason():
    inner = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    c = HistoryTrackingCache(inner)
    k = _key("ds_alpha", 1)
    c.put(k, b"x", size_bytes=1)
    c.invalidate(k, reason="param_change")
    history = c.get_invalidation_history("ds_alpha")
    assert len(history) == 1
    assert isinstance(history[0], InvalidationRecord)
    assert history[0].reason == "param_change"
    assert history[0].key_hash == k.content_hash()


def test_history_ring_buffer_caps_at_10k():
    inner = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=10 * 1024 * 1024))
    c = HistoryTrackingCache(inner, history_max_per_ds=10_000)
    for i in range(10_500):
        k = _key("ds", i)
        c.put(k, b"x", size_bytes=1)
        c.invalidate(k, reason="ttl")
    history = c.get_invalidation_history("ds")
    assert len(history) == 10_000
    assert history[0].key_hash == _key("ds", 500).content_hash()


def test_rejects_unknown_reason():
    inner = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    c = HistoryTrackingCache(inner)
    with pytest.raises(ValueError):
        c.invalidate(_key("ds", 1), reason="nonsense_reason")


def test_query_category_enum_mirrors_tableau():
    """§IV.11 — QueryCategory telemetry enum parity."""
    names = {c.name for c in QueryCategory}
    assert {"MDX_SETUP", "MDX_VALIDATION", "NOW", "FILTER", "IMPERSONATE",
            "HYPER_STREAM"}.issubset(names)

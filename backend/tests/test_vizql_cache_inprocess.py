"""Plan 7e T2 — LRUQueryCachePolicy + InProcessLogicalQueryCache."""
from __future__ import annotations

import threading

import pytest

from vizql.cache import (
    AbstractQueryCacheKey,
    InProcessLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)


def _key(ds: str, i: int) -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id=ds,
        relation_tree_hash=f"rel_{i}",
        predicate_hash=f"pred_{i}",
        projection=("a",),
        group_bys=(),
        order_by=(OrderByKey(column="a", descending=False),),
        agg_types=("SUM",),
        dialect="duckdb",
    )


def test_put_then_get_roundtrip():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    k = _key("ds1", 1)
    c.put(k, value=b"x" * 100, size_bytes=100)
    assert c.get(k) == b"x" * 100


def test_miss_returns_none():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    assert c.get(_key("ds1", 99)) is None


def test_eviction_by_byte_budget():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=300))
    k1, k2, k3 = _key("ds", 1), _key("ds", 2), _key("ds", 3)
    c.put(k1, b"a" * 100, size_bytes=100)
    c.put(k2, b"b" * 100, size_bytes=100)
    c.put(k3, b"c" * 100, size_bytes=100)
    assert c.current_bytes() == 300  # sanity: all three fit before eviction
    k4 = _key("ds", 4)
    c.put(k4, b"d" * 100, size_bytes=100)
    assert c.get(k1) is None, "LRU victim should be k1"
    assert c.get(k4) is not None


def test_lru_touch_on_get():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=300))
    k1, k2, k3 = _key("ds", 1), _key("ds", 2), _key("ds", 3)
    c.put(k1, b"a" * 100, size_bytes=100)
    c.put(k2, b"b" * 100, size_bytes=100)
    c.put(k3, b"c" * 100, size_bytes=100)
    c.get(k1)  # promote k1 - k2 is now LRU
    k4 = _key("ds", 4)
    c.put(k4, b"d" * 100, size_bytes=100)
    assert c.get(k2) is None
    assert c.get(k1) is not None


def test_invalidate_removes_entry_and_frees_bytes():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=300))
    k = _key("ds", 1)
    c.put(k, b"x" * 100, size_bytes=100)
    assert c.current_bytes() == 100
    c.invalidate(k)
    assert c.get(k) is None
    assert c.current_bytes() == 0


def test_invalidate_by_predicate():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    c.put(_key("ds1", 1), b"a" * 50, size_bytes=50)
    c.put(_key("ds2", 2), b"b" * 50, size_bytes=50)
    removed = c.invalidate_by_predicate(lambda k: k.ds_id == "ds1")
    assert removed == 1
    assert c.get(_key("ds1", 1)) is None
    assert c.get(_key("ds2", 2)) is not None


def test_stats_counters():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1024))
    k = _key("ds", 1)
    c.get(k)  # miss
    c.put(k, b"x", size_bytes=1)
    c.get(k)  # hit
    c.get(k)  # hit
    stats = c.stats()
    assert stats["hits"] == 2
    assert stats["misses"] == 1
    assert stats["per_ds"]["ds"]["hits"] == 2


def test_thread_safety_concurrent_puts():
    c = InProcessLogicalQueryCache(LRUQueryCachePolicy(max_bytes=1_000_000))
    errors: list[Exception] = []

    def worker(start: int) -> None:
        try:
            for i in range(start, start + 100):
                c.put(_key("ds", i), b"x" * 10, size_bytes=10)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i * 100,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    assert c.current_bytes() == 400 * 10

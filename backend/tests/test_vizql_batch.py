"""Plan 7e T5 — QueryBatch dashboard dedup."""
from __future__ import annotations

from vizql.batch import BatchResult, QueryBatch
from vizql.cache import (
    AbstractQueryCacheKey,
    HistoryTrackingCache,
    InProcessLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)


def _k(i: int) -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id="ds", relation_tree_hash=f"rel_{i}", predicate_hash=f"pred_{i}",
        projection=("a",), group_bys=(), order_by=(OrderByKey(column="a"),),
        agg_types=("SUM",), dialect="duckdb",
    )


def test_all_misses_all_unique():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    keys = [_k(i) for i in range(5)]
    batch = QueryBatch(keys=keys, cache=cache)
    result = batch.check_cache()
    assert result.hits == {}
    assert len(result.misses) == 5
    assert len(result.distinct_misses()) == 5


def test_dedup_10_queries_3_unique():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    keys = [_k(i % 3) for i in range(10)]
    batch = QueryBatch(keys=keys, cache=cache)
    result = batch.check_cache()
    assert len(result.distinct_misses()) == 3
    assert len(result.misses) == 10


def test_mixed_hits_and_misses():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    cache.put(_k(0), b"cached_zero", size_bytes=11)
    cache.put(_k(1), b"cached_one", size_bytes=10)
    keys = [_k(0), _k(1), _k(2), _k(3)]
    result = QueryBatch(keys=keys, cache=cache).check_cache()
    assert set(result.hits.keys()) == {_k(0), _k(1)}
    assert len(result.distinct_misses()) == 2


def test_publish_stores_results():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    batch = QueryBatch(keys=[_k(0), _k(1)], cache=cache)
    batch.check_cache()
    batch.publish({_k(0): b"z0", _k(1): b"z1"}, size_estimator=lambda v: len(v))
    assert cache.get(_k(0)) == b"z0"
    assert cache.get(_k(1)) == b"z1"

"""Plan 7e T3 — ExternalLogicalQueryCache (Redis + degradation)."""
from __future__ import annotations

import pickle
from unittest.mock import MagicMock, patch

import pytest

from vizql.cache import (
    AbstractQueryCacheKey,
    ExternalLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)


def _key() -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id="ds1",
        relation_tree_hash="rel_1",
        predicate_hash="pred_1",
        projection=("a",),
        group_bys=(),
        order_by=(OrderByKey(column="a"),),
        agg_types=("SUM",),
        dialect="duckdb",
    )


def test_put_serialises_with_protocol5_and_sets_ttl():
    fake_redis = MagicMock()
    with patch("vizql.cache.get_redis", return_value=fake_redis):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        cache.put(_key(), {"rows": [1, 2, 3]})

    assert fake_redis.setex.called
    redis_key, ttl, value = fake_redis.setex.call_args[0]
    assert redis_key.startswith("askdb:vizql:cache:")
    assert ttl == 3600
    assert pickle.loads(value) == {"rows": [1, 2, 3]}


def test_get_returns_deserialised_value():
    fake_redis = MagicMock()
    fake_redis.get.return_value = pickle.dumps({"rows": [1, 2]}, protocol=5)
    with patch("vizql.cache.get_redis", return_value=fake_redis):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        assert cache.get(_key()) == {"rows": [1, 2]}


def test_get_returns_none_when_redis_down():
    with patch("vizql.cache.get_redis", return_value=None):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        assert cache.get(_key()) is None


def test_put_is_noop_when_redis_down():
    with patch("vizql.cache.get_redis", return_value=None):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        cache.put(_key(), {"rows": []})  # must not raise


def test_put_swallows_redis_errors():
    fake_redis = MagicMock()
    fake_redis.setex.side_effect = ConnectionError("redis down mid-flight")
    with patch("vizql.cache.get_redis", return_value=fake_redis):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        cache.put(_key(), {"rows": []})  # must not raise


def test_invalidate_deletes_redis_key():
    fake_redis = MagicMock()
    with patch("vizql.cache.get_redis", return_value=fake_redis):
        cache = ExternalLogicalQueryCache(
            policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
            ttl_seconds=3600,
        )
        cache.invalidate(_key())
    assert fake_redis.delete.called


def test_redis_key_namespace_stable():
    k = _key()
    cache = ExternalLogicalQueryCache(
        policy=LRUQueryCachePolicy(max_bytes=1024 * 1024),
        ttl_seconds=3600,
    )
    rk = cache._redis_key(k)
    assert rk == f"askdb:vizql:cache:{k.ds_id}:{k.content_hash()}"

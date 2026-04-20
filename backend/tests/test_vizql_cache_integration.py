"""Plan 7e T8 — end-to-end VizQL cache integration."""
from __future__ import annotations

import asyncio
import pickle
from unittest.mock import patch

import pytest

from vizql.cache import (
    AbstractQueryCacheKey,
    HistoryTrackingCache,
    InProcessLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)
from vizql.batch import QueryBatch
from waterfall_router import VizQLContext, VizQLTier


@pytest.fixture(autouse=True)
def _reset_vizql_context():
    """Clear the process-wide VizQL ContextVar between tests.

    ``VizQLTier.set_context`` writes to a module-level ``ContextVar``.  When
    ``asyncio.run(...)`` creates a fresh event loop the ContextVar set in the
    outer test function persists, leaking into subsequent tests that expect
    ``can_answer`` to return ``False`` when no context is active.
    """
    yield
    from waterfall_router import _VIZQL_CURRENT_CTX
    _VIZQL_CURRENT_CTX.set(None)


def _key(i: int, *, param_region: str = "EMEA") -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id="conn_a",
        relation_tree_hash=f"rel_{i}",
        predicate_hash=f"pred_{i}",
        projection=("amount",),
        group_bys=(),
        order_by=(OrderByKey(column="amount"),),
        agg_types=("SUM",),
        dialect="duckdb",
        parameter_snapshot=(("region", f'"{param_region}"'),),
    )


def test_roundtrip_inprocess_serialisation_preserves_key_identity():
    """Cache key must be serialisation-safe + hash stable across un/repickle."""
    k = _key(1)
    k2 = pickle.loads(pickle.dumps(k, protocol=5))
    assert k == k2
    assert k.content_hash() == k2.content_hash()


def test_parameter_change_invalidates_only_affected_query():
    """§XIX.1 #4 — param change must not invalidate sibling queries."""
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(4096)))
    cache.put(_key(1, param_region="EMEA"), b"emea_1", size_bytes=6)
    cache.put(_key(2, param_region="EMEA"), b"emea_2", size_bytes=6)
    cache.put(_key(1, param_region="AMER"), b"amer_1", size_bytes=6)

    new_key = _key(1, param_region="LATAM")
    assert cache.get(new_key) is None
    assert cache.get(_key(1, param_region="EMEA")) == b"emea_1"
    assert cache.get(_key(1, param_region="AMER")) == b"amer_1"

    cache.invalidate(_key(1, param_region="EMEA"), reason="param_change")
    assert cache.get(_key(1, param_region="EMEA")) is None
    assert cache.get(_key(2, param_region="EMEA")) == b"emea_2"


def test_dashboard_10_sheets_3_distinct_only_3_compile_jobs():
    """Dashboard with 10 sheets referencing 3 logical queries => 3 compile jobs."""
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(10_000)))
    keys = [_key(i % 3) for i in range(10)]
    batch = QueryBatch(keys=keys, cache=cache)
    result = batch.check_cache()
    assert len(result.distinct_misses()) == 3


def test_vizql_tier_hit_does_not_invoke_downstream():
    """If VizQL caches a value, TurboTier execute path is not reached."""
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(10_000)))
    cache.put(_key(1), {"rows": [[99]], "columns": ["x"]}, size_bytes=64)

    tier = VizQLTier(cache=cache)
    tier.set_context(VizQLContext(cache_key=_key(1), qf=None, dialect="duckdb"))

    from schema_intelligence import SchemaProfile
    from datetime import datetime, timezone
    schema = SchemaProfile(
        tables=[], schema_hash="sh",
        cached_at=datetime.now(timezone.utc), conn_id="conn_a",
    )

    result = asyncio.run(tier.answer("q", schema, "conn_a"))
    assert result.hit is True
    # BaseTier._apply_masking may reshape rows via pandas.to_dict(records).
    # Accept either raw list-of-list or normalised list-of-dict shape.
    rows = result.data["rows"]
    assert rows == [[99]] or rows == [{"x": 99}]


def test_external_degraded_still_serves_inprocess_hits():
    """Redis down — in-process cache keeps working."""
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    cache.put(_key(1), {"rows": []}, size_bytes=16)

    with patch("vizql.cache.get_redis", return_value=None):
        tier = VizQLTier(cache=cache)
        tier.set_context(VizQLContext(cache_key=_key(1), qf=None, dialect="duckdb"))
        from schema_intelligence import SchemaProfile
        from datetime import datetime, timezone
        schema = SchemaProfile(
            tables=[], schema_hash="sh",
            cached_at=datetime.now(timezone.utc), conn_id="conn_a",
        )
        result = asyncio.run(tier.answer("q", schema, "conn_a"))

    assert result.hit is True
    assert result.data["source"] == "vizql_cache"

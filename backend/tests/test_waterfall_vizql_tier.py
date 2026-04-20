"""Plan 7e T7 — VizQLTier integration with WaterfallRouter."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from waterfall_router import VizQLTier, WaterfallRouter
from vizql.cache import (
    AbstractQueryCacheKey,
    HistoryTrackingCache,
    InProcessLogicalQueryCache,
    LRUQueryCachePolicy,
    OrderByKey,
)


def _fake_schema_profile():
    from schema_intelligence import SchemaProfile
    return SchemaProfile(
        tables=[],
        schema_hash="sh_123",
        cached_at=datetime.now(timezone.utc),
        conn_id="conn_a",
    )


def _key() -> AbstractQueryCacheKey:
    return AbstractQueryCacheKey(
        ds_id="conn_a", relation_tree_hash="rel_1", predicate_hash="pred_1",
        projection=("amount",), group_bys=(), order_by=(OrderByKey(column="amount"),),
        agg_types=("SUM",), dialect="duckdb",
    )


def test_tier_ordering_vizql_between_memory_and_turbo():
    r = WaterfallRouter.default()
    names = [t.name for t in r._tiers]
    assert names.index("memory") < names.index("vizql") < names.index("turbo") < names.index("live")


def test_can_answer_false_without_vizql_context():
    tier = VizQLTier(
        cache=HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024))),
    )
    assert asyncio.run(tier.can_answer("any question", _fake_schema_profile(), "conn_a")) is False


def test_can_answer_true_with_vizql_context():
    tier = VizQLTier(
        cache=HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024))),
    )
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))
    assert asyncio.run(tier.can_answer("any", _fake_schema_profile(), "conn_a")) is True


def test_cache_hit_short_circuits_tier_returning_immediately():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(10 * 1024)))
    cache.put(_key(), {"rows": [[42]], "columns": ["total"]}, size_bytes=256)

    tier = VizQLTier(cache=cache)
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))

    result = asyncio.run(tier.answer("q", _fake_schema_profile(), "conn_a"))
    assert result.hit is True
    assert result.tier_name == "vizql"
    assert result.data["source"] == "vizql_cache"
    # BaseTier.answer() applies PII masking which reshapes list-rows to dict-rows
    # via pandas to_dict("records"). Accept either shape — the value must be 42.
    rows = result.data["rows"]
    assert rows == [[42]] or rows == [{"total": 42}]


def test_cache_miss_returns_hit_false_for_waterfall_fallthrough():
    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    tier = VizQLTier(cache=cache)
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))

    result = asyncio.run(tier.answer("q", _fake_schema_profile(), "conn_a"))
    assert result.hit is False
    assert result.tier_name == "vizql"


def test_audit_logged_on_hit(tmp_path, monkeypatch):
    import audit_trail as _at
    monkeypatch.setattr(_at, "_LOG_DIR", tmp_path)

    cache = HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024)))
    cache.put(_key(), {"rows": [], "columns": []}, size_bytes=8)
    tier = VizQLTier(cache=cache)
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))
    asyncio.run(tier.answer("q", _fake_schema_profile(), "conn_a"))

    log = (tmp_path / "query_decisions.jsonl").read_text().strip().splitlines()
    assert any('"event_type": "hit_inprocess"' in ln for ln in log)


def test_vizql_disabled_flag_skips_tier(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "VIZQL_CACHE_ENABLED", False)
    tier = VizQLTier(
        cache=HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024))),
    )
    from waterfall_router import VizQLContext
    tier.set_context(VizQLContext(cache_key=_key(), qf=None, dialect="duckdb"))
    assert asyncio.run(tier.can_answer("q", _fake_schema_profile(), "conn_a")) is False


def test_context_is_isolated_across_async_tasks():
    """Two concurrent asyncio tasks with different contexts must not see each other's."""
    import asyncio as _asyncio
    from waterfall_router import VizQLContext
    tier = VizQLTier(
        cache=HistoryTrackingCache(InProcessLogicalQueryCache(LRUQueryCachePolicy(1024))),
    )

    async def scenario(marker: str):
        key = AbstractQueryCacheKey(
            ds_id=marker, relation_tree_hash=f"rel_{marker}", predicate_hash="p",
            projection=("a",), group_bys=(), order_by=(OrderByKey(column="a"),),
            agg_types=("SUM",), dialect="duckdb",
        )
        tier.set_context(VizQLContext(cache_key=key, qf=None, dialect="duckdb"))
        await _asyncio.sleep(0)
        # If ContextVar isolation is broken, another task's set_context clobbers this one.
        can = await tier.can_answer("q", _fake_schema_profile(), marker)
        assert can is True
        result = await tier.answer("q", _fake_schema_profile(), marker)
        # Miss is fine; what matters is that the tier processes THIS task's key hash.
        assert result.metadata["vizql_key_hash"] == key.content_hash()
        return marker

    async def driver():
        return await _asyncio.gather(scenario("ds_A"), scenario("ds_B"))

    markers = asyncio.run(driver())
    assert markers == ["ds_A", "ds_B"]

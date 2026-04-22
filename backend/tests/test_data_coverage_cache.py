"""Cache round-trip + staleness tests."""
from datetime import datetime, timedelta, timezone

import pytest

from data_coverage import (
    DataCoverageCard,
    DateCoverage,
    CategoricalCoverage,
    CoverageCache,
)


def _card(ts):
    return DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=ts,
        dialect="sqlite",
    )


def test_cache_write_then_read(tmp_path):
    cache = CoverageCache(tmp_path)
    now = datetime.now(timezone.utc)
    cache.write("conn-abc", [_card(now)])
    restored = cache.read("conn-abc")
    assert len(restored) == 1
    assert restored[0].table_name == "january_trips"
    assert restored[0].row_count == 500


def test_cache_missing_returns_none(tmp_path):
    cache = CoverageCache(tmp_path)
    assert cache.read("never-written") is None


def test_cache_stale_when_ttl_exceeded(tmp_path):
    cache = CoverageCache(tmp_path, ttl_hours=1)
    stale = datetime.now(timezone.utc) - timedelta(hours=2)
    cache.write("conn-old", [_card(stale)])
    assert cache.is_stale("conn-old")


def test_cache_fresh_when_within_ttl(tmp_path):
    cache = CoverageCache(tmp_path, ttl_hours=6)
    fresh = datetime.now(timezone.utc)
    cache.write("conn-new", [_card(fresh)])
    assert not cache.is_stale("conn-new")

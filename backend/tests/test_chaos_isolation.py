"""Chaos isolation — H8."""
import time

import pytest

from chaos_isolation import (
    jittered_backoff, Singleflight, CostBreaker, CostExceeded, SSECursor,
)


def test_jittered_backoff_returns_value_in_expected_range():
    for attempt in range(1, 5):
        ms = jittered_backoff(attempt=attempt, base_ms=50, max_ms=500)
        assert 0 <= ms <= 500


def test_jittered_backoff_never_exceeds_max():
    for _ in range(100):
        assert jittered_backoff(attempt=10, base_ms=50, max_ms=200) <= 200


def test_singleflight_first_caller_runs_and_others_get_shared_result():
    sf = Singleflight()
    call_count = {"n": 0}
    def slow():
        call_count["n"] += 1
        time.sleep(0.05)
        return 42
    results = []
    import threading
    threads = [threading.Thread(target=lambda: results.append(sf.do("k", slow))) for _ in range(3)]
    for t in threads: t.start()
    for t in threads: t.join()
    assert results == [42, 42, 42]
    assert call_count["n"] == 1


def test_singleflight_releases_key_after_run():
    sf = Singleflight()
    sf.do("k", lambda: 1)
    assert sf.do("k", lambda: 2) == 2


def test_cost_breaker_allows_under_budget():
    cb = CostBreaker(max_usd_per_minute=1.0)
    cb.charge(tenant_id="t1", usd=0.25)
    cb.charge(tenant_id="t1", usd=0.25)
    cb.check(tenant_id="t1")  # no raise


def test_cost_breaker_trips_on_overrun():
    cb = CostBreaker(max_usd_per_minute=1.0)
    cb.charge(tenant_id="t1", usd=1.5)
    with pytest.raises(CostExceeded):
        cb.check(tenant_id="t1")


def test_cost_breaker_per_tenant_isolation():
    cb = CostBreaker(max_usd_per_minute=1.0)
    cb.charge(tenant_id="t1", usd=1.5)
    cb.check(tenant_id="t2")


def test_sse_cursor_records_position(tmp_path):
    cur = SSECursor(root=tmp_path, ttl_seconds=300)
    cur.record("sess-1", position=17)
    assert cur.get("sess-1") == 17


def test_sse_cursor_resumable_after_disconnect(tmp_path):
    cur = SSECursor(root=tmp_path, ttl_seconds=300)
    cur.record("sess-1", position=17)
    cur2 = SSECursor(root=tmp_path, ttl_seconds=300)
    assert cur2.get("sess-1") == 17


def test_sse_cursor_returns_none_on_unknown():
    cur = SSECursor(root="/nonexistent_dir", ttl_seconds=300)
    assert cur.get("missing") is None

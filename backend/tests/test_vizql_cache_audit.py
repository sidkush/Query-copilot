"""Plan 7e T6 — audit_trail vizql cache events."""
from __future__ import annotations

import json

import pytest

from config import settings


def test_config_has_vizql_cache_settings():
    assert settings.VIZQL_CACHE_ENABLED is True
    assert settings.VIZQL_INPROCESS_CACHE_BYTES == 67_108_864
    assert settings.VIZQL_EXTERNAL_CACHE_BYTES == 536_870_912
    assert settings.VIZQL_CACHE_TTL_SECONDS == 3600
    assert settings.VIZQL_HISTORY_TRACKING_ENABLED is True


def test_audit_trail_log_vizql_cache_event(tmp_path, monkeypatch):
    from audit_trail import log_vizql_cache_event
    import audit_trail as _at
    monkeypatch.setattr(_at, "_LOG_DIR", tmp_path)

    log_vizql_cache_event(
        conn_id="conn_x",
        event_type="hit_inprocess",
        key_hash="deadbeef" * 4,
        tier="in_process",
        reason="exact match",
    )

    log_file = tmp_path / "query_decisions.jsonl"
    assert log_file.exists()
    entry = json.loads(log_file.read_text().strip().splitlines()[-1])
    assert entry["event_type"] == "hit_inprocess"
    assert entry["tier"] == "in_process"
    assert entry["key_hash"] == "deadbeef" * 4


def test_audit_trail_rejects_unknown_event_type(tmp_path, monkeypatch, caplog):
    from audit_trail import log_vizql_cache_event
    import audit_trail as _at
    monkeypatch.setattr(_at, "_LOG_DIR", tmp_path)

    with caplog.at_level("WARNING"):
        log_vizql_cache_event(
            conn_id="conn_x", event_type="nonsense",
            key_hash="x", tier="in_process", reason="",
        )
    assert any("unknown event_type" in r.message for r in caplog.records)


def test_log_vizql_batch_event(tmp_path, monkeypatch):
    from audit_trail import log_vizql_batch_event
    import audit_trail as _at
    monkeypatch.setattr(_at, "_LOG_DIR", tmp_path)

    log_vizql_batch_event(
        conn_id="conn_x",
        total=10,
        hits=7,
        misses=3,
        distinct_misses=2,
        total_ms=42.0,
    )
    entry = json.loads((tmp_path / "query_decisions.jsonl").read_text().strip().splitlines()[-1])
    assert entry["event_type"] == "vizql_batch"
    assert entry["hits"] == 7
    assert entry["distinct_misses"] == 2


def test_vizql_package_reexports():
    from vizql import (  # noqa: F401
        AbstractQueryCacheKey,
        ExternalLogicalQueryCache,
        HistoryTrackingCache,
        InProcessLogicalQueryCache,
        LRUQueryCachePolicy,
        QueryBatch,
        QueryCategory,
    )

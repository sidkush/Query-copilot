def test_trial_quota_hits_cap(monkeypatch):
    monkeypatch.setattr("config.settings.TRIAL_QUOTA_DAILY_QUERIES", 2)
    # Force Redis to None so the in-memory counter path is exercised.
    monkeypatch.setattr("redis_client.get_redis", lambda: None)
    from routers.query_routes import _trial_quota_gate, _MEM_TRIAL
    _MEM_TRIAL.clear()
    _trial_quota_gate("u@example.com", "free")
    _trial_quota_gate("u@example.com", "free")
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as ei:
        _trial_quota_gate("u@example.com", "free")
    assert ei.value.status_code == 429

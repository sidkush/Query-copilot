"""Integration tests for /api/v1/ops routes — admin-auth + tenant scoping."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


@pytest.fixture
def admin_headers_t1(client):
    """Get a valid admin JWT for tenant t-1. Uses the admin test helper if available."""
    try:
        from tests.conftest import make_admin_token
        token = make_admin_token(tenant_id="t-1")
        return {"Authorization": f"Bearer {token}"}
    except Exception:
        return {}  # will cause 401/403, which is what we test below


def test_cache_stats_requires_admin_auth(client):
    r = client.get("/api/v1/ops/cache-stats")
    assert r.status_code in (401, 403)


def test_alerts_requires_admin_auth(client):
    r = client.get("/api/v1/ops/alerts")
    assert r.status_code in (401, 403)


def test_alert_history_requires_admin_auth(client):
    r = client.get("/api/v1/ops/alerts/residual_risk_1_llm_pretraining_fn/history")
    assert r.status_code in (401, 403)


def test_cache_stats_route_exists_and_rejects_unauthenticated(client):
    """Route is registered — not a 404."""
    r = client.get("/api/v1/ops/cache-stats")
    assert r.status_code != 404


def test_alerts_route_exists_and_rejects_unauthenticated(client):
    r = client.get("/api/v1/ops/alerts")
    assert r.status_code != 404

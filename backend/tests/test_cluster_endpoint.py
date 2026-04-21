"""Plan 9d T3 — POST /api/v1/analytics/cluster integration tests."""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from config import settings
from routers import query_routes
from tests.fixtures.cluster.synthetic import gaussian_blobs


# Minimal test app (mirror of test_forecast_endpoint.py — no agent_engine).
_test_app = FastAPI()
_test_app.include_router(query_routes.router)


def _make_token(email: str = "demo@askdb.dev") -> str:
    from jose import jwt
    payload = {
        "sub": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    return jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {_make_token('demo@askdb.dev')}"}


@pytest.fixture
def client():
    return TestClient(_test_app)


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """Clear the per-user sliding window between tests to avoid pollution."""
    try:
        query_routes._CLUSTER_RL_TIMESTAMPS.clear()  # type: ignore[attr-defined]
    except Exception:
        pass
    yield


@pytest.fixture(autouse=True)
def _enable_analyst_pro(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", True)


def _payload(rows, **spec_overrides):
    spec = dict(k="auto", k_min=2, k_max=6, variables=["x", "y"],
                disaggregate=False, standardize=True, seed=42)
    spec.update(spec_overrides)
    return {"rows": rows, "spec": spec}


def test_happy_path(client, auth_headers):
    rows = gaussian_blobs(30, [(0, 0), (10, 0), (5, 10)], spread=0.3, seed=1)
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows), headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["result"]["optimal_k"] == 3
    assert len(body["result"]["assignments"]) == len(rows)


def test_feature_flag_off(monkeypatch, client, auth_headers):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False)
    rows = gaussian_blobs(10, [(0, 0), (5, 5)], spread=0.3, seed=1)
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows), headers=auth_headers)
    assert r.status_code == 403


def test_payload_too_large(monkeypatch, client, auth_headers):
    monkeypatch.setattr(settings, "CLUSTER_MAX_ROWS", 50)
    rows = gaussian_blobs(40, [(0, 0), (5, 5)], spread=0.3, seed=1)  # 80 rows
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows), headers=auth_headers)
    assert r.status_code == 413


def test_bad_spec_kmin_gt_kmax(client, auth_headers):
    rows = gaussian_blobs(20, [(0, 0), (5, 5)], spread=0.3, seed=1)
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows, k_min=8, k_max=4), headers=auth_headers)
    assert r.status_code == 400


def test_empty_variables(client, auth_headers):
    rows = gaussian_blobs(10, [(0, 0), (5, 5)], spread=0.3, seed=1)
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows, variables=[]), headers=auth_headers)
    assert r.status_code == 400


def test_rate_limit(monkeypatch, client, auth_headers):
    monkeypatch.setattr(settings, "CLUSTER_RATE_LIMIT_PER_60S", 2)
    rows = gaussian_blobs(10, [(0, 0), (5, 5)], spread=0.3, seed=1)
    for _ in range(2):
        r = client.post("/api/v1/analytics/cluster",
                        json=_payload(rows), headers=auth_headers)
        assert r.status_code == 200
    r = client.post("/api/v1/analytics/cluster",
                    json=_payload(rows), headers=auth_headers)
    assert r.status_code == 429


def test_all_nan_rows_returns_422(client, auth_headers):
    import json
    rows = [{"x": float("nan"), "y": float("nan")} for _ in range(5)]
    # stdlib json rejects NaN by default; use allow_nan + raw POST so the
    # payload reaches the engine where the all-NaN guard fires.
    body = json.dumps(_payload(rows), allow_nan=True)
    r = client.post(
        "/api/v1/analytics/cluster",
        content=body,
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert r.status_code == 422

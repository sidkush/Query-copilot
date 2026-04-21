"""Plan 9c T6 — POST /api/v1/analytics/forecast endpoint."""
import os
import sys
import time
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from config import settings
from routers import query_routes


# Minimal test app (mirror of test_trend_fit_endpoint.py — no agent_engine).
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
def auth():
    return {"Authorization": f"Bearer {_make_token('demo@askdb.dev')}"}


@pytest.fixture
def client():
    return TestClient(_test_app)


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """Clear the per-user sliding window between tests to avoid pollution."""
    try:
        query_routes._FORECAST_RL_TIMESTAMPS.clear()  # type: ignore[attr-defined]
    except Exception:
        pass
    yield


@pytest.fixture(autouse=True)
def _enable_analyst_pro(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", True)


def _series(n=40):
    rng = np.random.default_rng(0)
    base = float(time.time())
    return [{"t": base + i * 86400.0, "y": float(i + rng.normal(0, 0.1))} for i in range(n)]


def _spec(horizon=4):
    return {
        "forecast_length": horizon, "forecast_unit": "auto", "model": "auto",
        "season_length": None, "confidence_level": 0.95, "ignore_last": 0,
    }


def test_forecast_happy_path(client, auth):
    body = {"series": _series(), "spec": _spec(), "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "fits" in payload
    assert len(payload["fits"]) == 1
    fit = payload["fits"][0]["result"]
    assert fit["best_model"]["kind"] in {"AAA", "AAM", "AMA", "AMM", "ANA", "ANM", "ANN", "MNN"}
    assert len(fit["forecasts"]) == 4
    assert len(fit["model_candidates"]) == 8


def test_forecast_rejects_non_temporal(client, auth):
    body = {
        "series": [{"x": i, "y": float(i)} for i in range(20)],
        "spec": _spec(), "factor_fields": [],
    }
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 400
    assert "temporal" in r.text.lower()


def test_forecast_rejects_short_series(client, auth):
    body = {"series": _series(n=5), "spec": _spec(), "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 400


def test_forecast_413_oversized_payload(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "FORECAST_MAX_ROWS", 30)
    body = {"series": _series(n=40), "spec": _spec(), "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 413


def test_forecast_403_when_feature_flag_off(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False)
    body = {"series": _series(), "spec": _spec(), "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 403


def test_forecast_429_after_rate_limit(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "FORECAST_RATE_LIMIT_PER_60S", 2)
    body = {"series": _series(), "spec": _spec(), "factor_fields": []}
    assert client.post("/api/v1/analytics/forecast", json=body, headers=auth).status_code == 200
    assert client.post("/api/v1/analytics/forecast", json=body, headers=auth).status_code == 200
    assert client.post("/api/v1/analytics/forecast", json=body, headers=auth).status_code == 429


def test_forecast_400_on_invalid_spec(client, auth):
    body = {"series": _series(), "spec": {**_spec(), "confidence_level": 0.80}, "factor_fields": []}
    r = client.post("/api/v1/analytics/forecast", json=body, headers=auth)
    assert r.status_code == 400

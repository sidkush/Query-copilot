"""Plan 9b T5 — /api/v1/analytics/trend-fit endpoint."""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from config import settings
from routers import query_routes


# ── Minimal test app (no agent_engine / heavy deps) ────────────────────

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


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """Clear the per-user sliding window between tests to avoid cross-test
    rate-limit pollution (tests share a module-level counter dict)."""
    try:
        query_routes._TREND_RL_TIMESTAMPS.clear()  # type: ignore[attr-defined]
    except Exception:
        pass
    yield


@pytest.fixture(autouse=True)
def _enable_analyst_pro(monkeypatch):
    # Ensure feature-flag is on by default; individual tests may override.
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", True)


@pytest.fixture
def client(auth_headers):
    return TestClient(_test_app), auth_headers


def test_trend_fit_linear_no_factor(client):
    c, auth = client
    rows = [{"x": i, "y": 2 * i + 3} for i in range(20)]
    body = {
        "rows": rows,
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": True,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["fits"]) == 1
    fit = data["fits"][0]
    assert fit["factor_value"] is None
    assert fit["result"]["coefficients"][0] == pytest.approx(2.0, rel=1e-6)
    assert fit["result"]["r_squared"] > 0.9999


def test_trend_fit_by_factor(client):
    c, auth = client
    rows = (
        [{"x": i, "y": 2 * i + 1, "region": "A"} for i in range(20)]
        + [{"x": i, "y": -i + 5, "region": "B"} for i in range(20)]
    )
    body = {
        "rows": rows,
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": ["region"],
            "show_confidence_bands": True, "confidence_level": 0.95,
            "color_by_factor": True, "trend_line_label": True,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 200
    fits = r.json()["fits"]
    assert {f["factor_value"] for f in fits} == {"A", "B"}
    # Confidence bands → every prediction carries lower/upper.
    for f in fits:
        assert all("lower" in p for p in f["result"]["predictions"])


def test_trend_fit_rejects_too_many_rows(client, monkeypatch):
    monkeypatch.setattr(settings, "TREND_MAX_ROWS", 10)
    c, auth = client
    body = {
        "rows": [{"x": i, "y": i} for i in range(20)],
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": False,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 413


def test_trend_fit_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "TREND_RATE_LIMIT_PER_30S", 2)
    c, auth = client
    body = {
        "rows": [{"x": 1, "y": 1}, {"x": 2, "y": 2}, {"x": 3, "y": 3}],
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": False,
        },
    }
    assert c.post("/api/v1/analytics/trend-fit", json=body, headers=auth).status_code == 200
    assert c.post("/api/v1/analytics/trend-fit", json=body, headers=auth).status_code == 200
    assert c.post("/api/v1/analytics/trend-fit", json=body, headers=auth).status_code == 429


def test_trend_fit_feature_flag_gates(client, monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False)
    c, auth = client
    body = {
        "rows": [{"x": 1, "y": 1}, {"x": 2, "y": 2}],
        "spec": {
            "fit_type": "linear", "degree": None, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": False,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 403


def test_trend_fit_rejects_invalid_spec(client):
    c, auth = client
    body = {
        "rows": [{"x": 1, "y": 1}, {"x": 2, "y": 2}],
        "spec": {
            "fit_type": "polynomial", "degree": 9, "factor_fields": [],
            "show_confidence_bands": False, "confidence_level": 0.95,
            "color_by_factor": False, "trend_line_label": False,
        },
    }
    r = c.post("/api/v1/analytics/trend-fit", json=body, headers=auth)
    assert r.status_code == 400
    assert "degree" in r.text.lower()

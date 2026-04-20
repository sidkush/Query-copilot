"""Plan 8d T10 — /api/v1/calcs/suggest endpoint.

Covers:
  - happy path: mocked provider returns valid JSON, endpoint surfaces it
  - non-JSON LLM output → 422
  - hallucinated field (not in schema_ref) → 422
  - rate limit → 429
  - audit row emitted

Uses app.dependency_overrides for auth + `patch` for the provider — same
isolation pattern as backend/tests/test_calc_routes.py.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from auth import get_current_user
from config import settings
from model_provider import ProviderResponse
from routers import query_routes


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", True)
    monkeypatch.setattr(settings, "FEATURE_CALC_LLM_SUGGEST", True)

    def _user():
        return {"email": "calc-suggest@askdb.dev", "sub": "calc-suggest@askdb.dev"}

    app.dependency_overrides[get_current_user] = _user
    query_routes._CALC_RL_TIMESTAMPS.clear()

    # Clear per-user suggest rate-limit window between tests.
    from vizql import calc_suggest as _cs
    with _cs._RL_LOCK:
        _cs._RL.clear()

    yield TestClient(app)

    app.dependency_overrides.clear()
    query_routes._CALC_RL_TIMESTAMPS.clear()
    with _cs._RL_LOCK:
        _cs._RL.clear()


def _mock_provider(formula_json: str):
    provider = MagicMock()
    provider.complete.return_value = ProviderResponse(
        text=formula_json,
        usage={"input_tokens": 100, "output_tokens": 50},
        stop_reason="end_turn",
    )
    return provider


def test_suggest_returns_valid_formula(client):
    payload = json.dumps({
        "formula": "SUM([Sales]) / COUNTD([Customer])",
        "explanation": "Average sales per unique customer.",
        "confidence": 0.9,
    })
    with patch("vizql.calc_suggest.get_provider_for_user",
               return_value=_mock_provider(payload)):
        res = client.post(
            "/api/v1/calcs/suggest",
            json={
                "description": "average sales per customer",
                "schema_ref": {"Sales": "number", "Customer": "string"},
                "parameters": [],
                "sets": [],
                "existing_calcs": [],
            },
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["formula"].startswith("SUM([Sales])")
    assert body["confidence"] == 0.9
    assert body["is_generative_ai_web_authoring"] is True


def test_suggest_rejects_invalid_llm_output(client):
    payload = "i am not json, i am literally just prose"
    with patch("vizql.calc_suggest.get_provider_for_user",
               return_value=_mock_provider(payload)):
        res = client.post(
            "/api/v1/calcs/suggest",
            json={"description": "avg sales", "schema_ref": {"Sales": "number"}},
        )
    assert res.status_code == 422
    assert "parse" in res.json()["detail"].lower() or \
           "json" in res.json()["detail"].lower()


def test_suggest_rejects_hallucinated_field(client):
    payload = json.dumps({
        "formula": "SUM([Margin])",    # Margin NOT in schema_ref
        "explanation": "Total margin.",
        "confidence": 0.8,
    })
    with patch("vizql.calc_suggest.get_provider_for_user",
               return_value=_mock_provider(payload)):
        res = client.post(
            "/api/v1/calcs/suggest",
            json={"description": "total margin", "schema_ref": {"Sales": "number"}},
        )
    assert res.status_code == 422
    assert "Margin" in res.json()["detail"]


def test_suggest_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "CALC_SUGGEST_RATE_LIMIT_PER_60S", 2)
    payload = json.dumps({
        "formula": "SUM([Sales])", "explanation": "", "confidence": 0.5,
    })
    with patch("vizql.calc_suggest.get_provider_for_user",
               return_value=_mock_provider(payload)):
        for _ in range(2):
            res = client.post(
                "/api/v1/calcs/suggest",
                json={"description": "x", "schema_ref": {"Sales": "number"}},
            )
            assert res.status_code == 200, res.text
        res = client.post(
            "/api/v1/calcs/suggest",
            json={"description": "x", "schema_ref": {"Sales": "number"}},
        )
    assert res.status_code == 429


def test_suggest_writes_audit_row(client, monkeypatch):
    captured: list[dict] = []

    def fake_audit(event_type, data):
        captured.append({"event_type": event_type, **data})

    monkeypatch.setattr("vizql.calc_suggest._audit", fake_audit)
    payload = json.dumps({
        "formula": "SUM([Sales])", "explanation": "", "confidence": 0.5,
    })
    with patch("vizql.calc_suggest.get_provider_for_user",
               return_value=_mock_provider(payload)):
        client.post(
            "/api/v1/calcs/suggest",
            json={"description": "total", "schema_ref": {"Sales": "number"}},
        )
    assert any(c["event_type"] == "calc_suggest" for c in captured), captured

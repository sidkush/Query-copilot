"""Plan 8a T11 — /api/v1/calcs/validate endpoint.

Covers:
  - happy path (known function → inferredType)
  - unknown function → 400
  - FEATURE_ANALYST_PRO off → 404
  - per-user rate limit → 429 after cap
  - oversized formula → 413
  - SQL-injection-shaped input → 400 or safely handled 200

Uses app.dependency_overrides to stub get_current_user (the pattern used
across the rest of the backend test suite, e.g. test_execute_parameters.py)
instead of the plan's module-reload approach — far simpler and doesn't
interact with module-level settings caches.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from auth import get_current_user
from config import settings
from routers import query_routes


@pytest.fixture
def client(monkeypatch):
    # Enable Analyst Pro for every test in this module by default; the
    # "feature-off" test flips it back locally.
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", True)

    # Stub auth — reuse demo user email so all tests share a rate-limit key
    # unless they override it below.
    def _user():
        return {"email": "calc-test@askdb.dev", "sub": "calc-test@askdb.dev"}

    app.dependency_overrides[get_current_user] = _user

    # Reset the per-user sliding window between tests so state from one
    # test cannot starve another (module-level dict otherwise leaks).
    query_routes._CALC_RL_TIMESTAMPS.clear()

    yield TestClient(app)

    app.dependency_overrides.clear()
    query_routes._CALC_RL_TIMESTAMPS.clear()


def _body(formula: str, schema: dict | None = None) -> dict:
    return {"formula": formula, "schema_ref": schema if schema is not None else {}}


def test_validate_known_function_returns_inferred_type(client):
    r = client.post(
        "/api/v1/calcs/validate",
        json=_body("SUM([Sales])", {"Sales": "number"}),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["valid"] is True
    assert body["inferredType"] == "number"
    assert body["errors"] == []
    assert body["isAggregate"] is True


def test_validate_unknown_function_400(client):
    r = client.post(
        "/api/v1/calcs/validate",
        json=_body("WAT([Sales])", {"Sales": "number"}),
    )
    assert r.status_code == 400
    assert "unknown function" in r.json()["detail"].lower()


def test_validate_blocked_when_feature_off(client, monkeypatch):
    # Override back to False for this single test.
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False)
    r = client.post(
        "/api/v1/calcs/validate",
        json=_body("SUM([Sales])", {"Sales": "number"}),
    )
    assert r.status_code == 404


def test_validate_rate_limit_kicks_in(client, monkeypatch):
    monkeypatch.setattr(settings, "CALC_RATE_LIMIT_PER_30S", 3)
    body = _body("SUM([Sales])", {"Sales": "number"})
    for _ in range(3):
        assert client.post("/api/v1/calcs/validate", json=body).status_code == 200
    r = client.post("/api/v1/calcs/validate", json=body)
    assert r.status_code == 429
    assert "rate limit" in r.json()["detail"].lower()


def test_validate_rejects_oversized_formula(client, monkeypatch):
    monkeypatch.setattr(settings, "MAX_CALC_FORMULA_LEN", 20)
    r = client.post(
        "/api/v1/calcs/validate",
        json=_body("SUM([Sales]) + " * 50, {"Sales": "number"}),
    )
    assert r.status_code == 413


def test_validate_injection_attempt_rejected_or_safe(client):
    # A SQL-injection-shaped string is not a valid calc expression — the
    # parser should refuse it with 400. If parsing ever succeeds in the
    # future, the response must not echo the raw payload back as SQL.
    r = client.post(
        "/api/v1/calcs/validate",
        json=_body("'); DROP TABLE users;--", {}),
    )
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        # Must not appear unescaped anywhere in the response.
        assert "DROP TABLE" not in r.text


# ── Plan 8b T9 — LOD cardinality warnings surfaced in validate response ──


def test_validate_calc_returns_warnings_for_expensive_fixed_lod(client, monkeypatch):
    """FIXED on high-cardinality dim → response includes expensive_fixed_lod warning."""
    monkeypatch.setattr(settings, "LOD_WARN_THRESHOLD_ROWS", 100)

    body = {
        "formula": "{FIXED [City] : SUM([Sales])}",
        "schema_ref": {"City": "string", "Sales": "number"},
        # Plan 8b extension — caller may attach schema_stats for cost estimate.
        "schema_stats": {"City": 10000, "Sales": 0},
    }
    r = client.post("/api/v1/calcs/validate", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["valid"] is True
    warns = out["warnings"]
    assert len(warns) == 1
    assert warns[0]["kind"] == "expensive_fixed_lod"
    assert warns[0]["estimate"] == 10_000


def test_validate_calc_returns_empty_warnings_when_schema_stats_missing(client):
    body = {
        "formula": "{FIXED [Region] : SUM([Sales])}",
        "schema_ref": {"Region": "string", "Sales": "number"},
    }
    r = client.post("/api/v1/calcs/validate", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["warnings"] == []


def test_validate_calc_response_shape_backwards_compatible(client):
    """The `warnings` field must be additive — existing `valid`, `inferredType`,
    `isAggregate`, `errors` fields are untouched."""
    body = {"formula": "SUM([Sales])", "schema_ref": {"Sales": "number"}}
    r = client.post("/api/v1/calcs/validate", json=body)
    out = r.json()
    assert set(out.keys()) >= {"valid", "inferredType", "isAggregate", "errors", "warnings"}

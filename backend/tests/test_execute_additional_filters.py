"""
Verify /queries/execute accepts `additional_filters`, wraps the SQL via
sql_filter_injector before dispatch, and rejects malformed filters.

Plan 4a — T4. Uses a minimal FastAPI app with only the query router
(same pattern as test_actions_fire.py) to avoid importing agent_engine.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from config import settings
from routers import query_routes


# ── Minimal test app ────────────────────────────────────────────────────────

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


def _make_engine(captured: list):
    """Engine stub whose execute_sql captures the SQL and returns a
    QueryResult-like object with the fields query_routes touches."""
    def _run(sql, question=""):
        captured.append(sql)
        return SimpleNamespace(
            sql=sql,
            columns=["a"],
            rows=[[1]],
            row_count=1,
            success=True,
            error=None,
            latency_ms=1.0,
            summary="ok",
            to_dict=lambda: {
                "sql": sql,
                "columns": ["a"],
                "rows": [[1]],
                "row_count": 1,
                "success": True,
                "error": None,
                "latency_ms": 1.0,
                "summary": "ok",
            },
        )
    engine = MagicMock()
    engine.execute_sql = MagicMock(side_effect=_run)
    return engine


@pytest.fixture
def fake_app_state(monkeypatch):
    """Plant a fake ConnectionEntry on app.state so get_connection() works."""
    captured: list = []
    fake_engine = _make_engine(captured)
    fake_connector = MagicMock()
    fake_connector.is_big_data_engine = MagicMock(return_value=False)
    fake_entry = SimpleNamespace(
        engine=fake_engine,
        connector=fake_connector,
        conn_id="test-conn",
        db_type="postgres",
        database_name="test",
    )

    # `from main import app` is referenced inside get_connection / execute_sql
    # — patch its state in place rather than importing the heavy main module.
    import sys as _sys
    fake_main = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        connections={"demo@askdb.dev": {"test-conn": fake_entry}},
    )))
    monkeypatch.setitem(_sys.modules, "main", fake_main)

    # Stub side-effect helpers so we don't touch disk / scheduler / redis.
    monkeypatch.setattr(
        query_routes, "get_daily_usage",
        lambda email: {
            "unlimited": True, "remaining": 999,
            "daily_limit": 999, "plan": "pro",
        },
    )
    monkeypatch.setattr(
        query_routes, "check_connection_rate_limit",
        lambda email, conn_id: None,
    )
    monkeypatch.setattr(query_routes, "increment_query_stats", lambda *a, **k: None)
    monkeypatch.setattr(query_routes, "log_sql_edit", lambda *a, **k: None)

    return captured


def test_execute_without_filters_is_pass_through(fake_app_state, auth_headers):
    captured = fake_app_state
    client = TestClient(_test_app)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT a FROM t",
            "question": "q",
            "conn_id": "test-conn",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert captured, "engine.execute_sql was never called"
    assert captured[-1].strip().startswith("SELECT a FROM t")
    assert "_askdb_filtered" not in captured[-1]


def test_execute_with_additional_filters_wraps_sql(fake_app_state, auth_headers):
    captured = fake_app_state
    client = TestClient(_test_app)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT a FROM t",
            "question": "q",
            "conn_id": "test-conn",
            "additional_filters": [
                {"field": "region", "op": "eq", "value": "West"},
            ],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert captured, "engine.execute_sql was never called"
    final_sql = captured[-1]
    assert "_askdb_filtered" in final_sql
    assert '"region" = \'West\'' in final_sql


def test_execute_rejects_invalid_field(fake_app_state, auth_headers):
    client = TestClient(_test_app)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT a FROM t",
            "question": "q",
            "conn_id": "test-conn",
            "additional_filters": [
                {"field": "bad field", "op": "eq", "value": 1},
            ],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "invalid filter" in resp.json()["detail"].lower()


def test_execute_accepts_not_in_op(monkeypatch):
    """notIn is a valid op for the request model and reaches the injector."""
    from routers.query_routes import _AdditionalFilter

    f = _AdditionalFilter(field="region", op="notIn", values=["East"])
    payload = f.model_dump()
    assert payload == {"field": "region", "op": "notIn", "value": None, "values": ["East"]}


def test_execute_rejects_unknown_op():
    from pydantic import ValidationError
    from routers.query_routes import _AdditionalFilter
    import pytest

    with pytest.raises(ValidationError):
        _AdditionalFilter(field="x", op="like", values=["%a%"])

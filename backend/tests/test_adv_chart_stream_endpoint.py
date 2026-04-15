"""
Adversarial tests for POST /api/v1/agent/charts/stream SSE endpoint.

Phase B4 — validates auth guards and Pydantic input validation
before the Arrow IPC streaming logic is ever invoked.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

from main import app
from auth import get_current_user


# ── Helper ────────────────────────────────────────────────────────────────────

def _authed_client() -> TestClient:
    """Return a TestClient with get_current_user dependency overridden."""
    app.dependency_overrides[get_current_user] = lambda: {
        "email": "test@example.com",
        "plan": "pro",
    }
    return TestClient(app, raise_server_exceptions=False)


def _clear_overrides():
    app.dependency_overrides.pop(get_current_user, None)


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_rejects_unauthenticated_request():
    """POST without auth header must be rejected with 401 or 403."""
    _clear_overrides()  # Ensure no override is active
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(
            "/api/v1/agent/charts/stream",
            json={"conn_id": "abc", "sql": "SELECT 1"},
        )
    assert resp.status_code in (401, 403), (
        f"Expected 401 or 403 for unauthenticated request, got {resp.status_code}"
    )


def test_rejects_missing_conn_id():
    """POST with valid auth but no conn_id must return 422 (Pydantic validation)."""
    with _authed_client() as client:
        resp = client.post(
            "/api/v1/agent/charts/stream",
            json={"sql": "SELECT 1"},
        )
    assert resp.status_code == 422, (
        f"Expected 422 for missing conn_id, got {resp.status_code}"
    )
    _clear_overrides()


def test_rejects_missing_sql():
    """POST with valid auth but no sql must return 422 (Pydantic validation)."""
    with _authed_client() as client:
        resp = client.post(
            "/api/v1/agent/charts/stream",
            json={"conn_id": "abc"},
        )
    assert resp.status_code == 422, (
        f"Expected 422 for missing sql, got {resp.status_code}"
    )
    _clear_overrides()


def test_rejects_oversized_batch_rows():
    """POST with batch_rows=1_000_000 must return 422 (le=50_000 constraint)."""
    with _authed_client() as client:
        resp = client.post(
            "/api/v1/agent/charts/stream",
            json={"conn_id": "abc", "sql": "SELECT 1", "batch_rows": 1_000_000},
        )
    assert resp.status_code == 422, (
        f"Expected 422 for batch_rows=1_000_000 (exceeds le=50_000), got {resp.status_code}"
    )
    _clear_overrides()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

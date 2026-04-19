"""/api/v1/skill-library/status endpoint smoke test."""
from __future__ import annotations


def test_status_endpoint_returns_library_state():
    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as client:
        resp = client.get("/api/v1/skill-library/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled" in data
        assert "library_loaded" in data
        assert "skill_count" in data
        assert data["library_loaded"] is True
        assert data["skill_count"] >= 48

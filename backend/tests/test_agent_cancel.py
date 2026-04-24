"""Cancel endpoint acknowledges + marks session cancelled."""
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

def test_cancel_ack_returned_on_valid_plan_id(monkeypatch):
    from main import app
    from routers import agent_routes
    sessions = {"p1": {"cancelled": False}}
    monkeypatch.setattr(agent_routes, "_ACTIVE_AGENT_SESSIONS", sessions)
    client = TestClient(app)
    resp = client.post("/api/v1/agent/cancel", params={"plan_id": "p1"})
    assert resp.status_code == 200
    assert resp.json() == {"cancelled": True, "plan_id": "p1"}
    assert sessions["p1"]["cancelled"] is True

def test_cancel_unknown_plan_id_returns_404(monkeypatch):
    from main import app
    from routers import agent_routes
    monkeypatch.setattr(agent_routes, "_ACTIVE_AGENT_SESSIONS", {})
    client = TestClient(app)
    resp = client.post("/api/v1/agent/cancel", params={"plan_id": "never"})
    assert resp.status_code == 404

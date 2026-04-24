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

def test_agent_checks_cancel_flag_between_tool_calls():
    from agent_engine import AgentEngine
    from routers import agent_routes
    engine = AgentEngine.__new__(AgentEngine)
    engine._current_plan = MagicMock(plan_id="p1")
    agent_routes._ACTIVE_AGENT_SESSIONS["p1"] = {"cancelled": True}
    try:
        assert engine._is_cancelled() is True
    finally:
        del agent_routes._ACTIVE_AGENT_SESSIONS["p1"]

def test_agent_not_cancelled_when_flag_false():
    from agent_engine import AgentEngine
    from routers import agent_routes
    engine = AgentEngine.__new__(AgentEngine)
    engine._current_plan = MagicMock(plan_id="p2")
    agent_routes._ACTIVE_AGENT_SESSIONS["p2"] = {"cancelled": False}
    try:
        assert engine._is_cancelled() is False
    finally:
        del agent_routes._ACTIVE_AGENT_SESSIONS["p2"]

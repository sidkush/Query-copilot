"""Admin promotion routes — pending list + approve + reject."""
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    return TestClient(app)


def _auth(token="stub-admin-token"):
    return {"Authorization": f"Bearer {token}"}


def test_get_pending_requires_admin_auth(client):
    resp = client.get("/api/v1/admin/promotions/pending")
    assert resp.status_code in (401, 403)


def test_get_pending_returns_list(client, monkeypatch, tmp_path):
    from routers import admin_routes
    from admin_ceremony import AdminCeremony
    # Seed one pending candidate.
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-001", question="q", proposed_sql="SELECT 1")
    # Monkeypatch the ceremony root and admin auth.
    monkeypatch.setattr(admin_routes, "_ceremony_root", lambda: tmp_path, raising=False)
    # Override get_admin_user dependency.
    from routers.admin_routes import get_admin_user
    app.dependency_overrides[get_admin_user] = lambda: {"email": "admin@x.com"}
    try:
        resp = client.get("/api/v1/admin/promotions/pending")
        assert resp.status_code == 200
        body = resp.json()
        assert any(p["candidate_id"] == "prom-001" for p in body["items"])
    finally:
        app.dependency_overrides.clear()


def test_approve_advances_ceremony(client, monkeypatch, tmp_path):
    from routers import admin_routes
    from admin_ceremony import AdminCeremony, CeremonyState
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-002", question="q", proposed_sql="SELECT 1")
    monkeypatch.setattr(admin_routes, "_ceremony_root", lambda: tmp_path, raising=False)
    from routers.admin_routes import get_admin_user
    app.dependency_overrides[get_admin_user] = lambda: {"email": "alice@x.com"}
    try:
        resp = client.post("/api/v1/admin/promotions/prom-002/approve", json={})
        assert resp.status_code == 200
        rec = AdminCeremony(root=tmp_path).get(candidate_id="prom-002")
        assert rec.state is CeremonyState.FIRST_ACK
    finally:
        app.dependency_overrides.clear()


def test_reject_terminates_ceremony(client, monkeypatch, tmp_path):
    from routers import admin_routes
    from admin_ceremony import AdminCeremony, CeremonyState
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-003", question="q", proposed_sql="SELECT 1")
    monkeypatch.setattr(admin_routes, "_ceremony_root", lambda: tmp_path, raising=False)
    from routers.admin_routes import get_admin_user
    app.dependency_overrides[get_admin_user] = lambda: {"email": "alice@x.com"}
    try:
        resp = client.post("/api/v1/admin/promotions/prom-003/reject",
                           json={"reason": "flaky SQL"})
        assert resp.status_code == 200
        rec = AdminCeremony(root=tmp_path).get(candidate_id="prom-003")
        assert rec.state is CeremonyState.REJECTED
    finally:
        app.dependency_overrides.clear()


def test_approve_same_admin_twice_returns_400(client, monkeypatch, tmp_path):
    from routers import admin_routes
    from admin_ceremony import AdminCeremony
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-004", question="q", proposed_sql="SELECT 1")
    c.ack(candidate_id="prom-004", admin_email="alice@x.com", approve=True)
    monkeypatch.setattr(admin_routes, "_ceremony_root", lambda: tmp_path, raising=False)
    from routers.admin_routes import get_admin_user
    app.dependency_overrides[get_admin_user] = lambda: {"email": "alice@x.com"}
    try:
        resp = client.post("/api/v1/admin/promotions/prom-004/approve", json={})
        assert resp.status_code == 400
        assert "different admin" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()

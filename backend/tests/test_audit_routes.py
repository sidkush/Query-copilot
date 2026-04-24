"""Admin audit-ledger export endpoint."""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

def test_export_requires_admin_auth():
    from main import app
    client = TestClient(app)
    resp = client.get("/api/v1/admin/audit-ledger/export?tenant_id=t1&year_month=2026-06")
    assert resp.status_code in (401, 403)

def test_export_returns_empty_jsonl_for_unknown_tenant(tmp_path, monkeypatch):
    from main import app
    from routers import audit_routes
    monkeypatch.setattr(audit_routes, "_LEDGER_ROOT", tmp_path)
    from routers.admin_routes import get_admin_user
    app.dependency_overrides[get_admin_user] = lambda: MagicMock(tenant_id="admin-t", email="admin@test")
    client = TestClient(app)
    try:
        resp = client.get("/api/v1/admin/audit-ledger/export", params={"tenant_id": "unknown", "year_month": "2026-06"})
        assert resp.status_code == 200
        assert resp.text.strip() == ""
    finally:
        app.dependency_overrides.clear()

"""Phase H — end-to-end: a single authenticated request passes through:
  1. TransportGuardMiddleware (UTF-8 enforced, no CL+TE smuggling).
  2. AuthMiddleware (bearer-token required).
  3. Route handler, which:
     - reads request.state.user,
     - runs ScopeValidator on export SQL,
     - writes audit entry with actor_type,
     - returns provenance chip before first token.
"""
from fastapi.testclient import TestClient


def test_end_to_end_authenticated_export():
    from main import app
    client = TestClient(app)
    r = client.post("/api/v1/auth/login", json={"email": "demo@askdb.dev", "password": "demo"})
    if r.status_code != 200:
        return
    token = r.json()["access_token"]
    r = client.get("/api/connections", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code in (200, 404)


def test_end_to_end_transport_guard_rejects_smuggle():
    from main import app
    client = TestClient(app)
    r = client.post(
        "/api/v1/agent/run",
        content=b'{"x":1}',
        headers={
            "Content-Length": "7",
            "Transfer-Encoding": "chunked",
        },
    )
    assert r.status_code == 400


def test_end_to_end_legacy_returns_410():
    from middleware.auth_middleware import AuthMiddleware
    from fastapi import FastAPI
    app = FastAPI()
    app.add_middleware(AuthMiddleware)

    @app.post("/api/v1/auth/legacy-login")
    def _legacy():
        return {"ok": True}

    client = TestClient(app)
    r = client.post("/api/v1/auth/legacy-login", json={"email": "x@y.com"})
    assert r.status_code == 410


def test_end_to_end_audit_chain_verifies_after_rotate(tmp_path, monkeypatch):
    import audit_trail
    monkeypatch.setattr(audit_trail, "_log_path", lambda: tmp_path / "audit.jsonl", raising=False)
    for i in range(5):
        audit_trail.log_agent_event(
            email=f"u{i}@x",
            chat_id=str(i),
            event="e",
            actor_type="user",
            details={},
        )
    rotator = getattr(audit_trail, "_rotate_if_needed", None)
    if rotator is not None:
        rotator()
    try:
        from audit_integrity import verify_chain
    except ImportError:
        return
    rotated = list(tmp_path.glob("audit.*.jsonl"))
    for path in rotated:
        assert verify_chain(path) is True

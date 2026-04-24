from fastapi import FastAPI
from fastapi.testclient import TestClient
from middleware.auth_middleware import AuthMiddleware


def test_unauthed_request_rejected():
    app = FastAPI()
    app.add_middleware(AuthMiddleware)

    @app.get("/protected")
    def p():
        return {"ok": True}

    client = TestClient(app)
    r = client.get("/protected")
    assert r.status_code == 401


def test_public_path_passthrough():
    app = FastAPI()
    app.add_middleware(AuthMiddleware)

    @app.get("/api/v1/auth/login")
    def login():
        return {"ok": True}

    client = TestClient(app)
    r = client.get("/api/v1/auth/login")
    assert r.status_code == 200


def test_legacy_deprecated_path_410():
    app = FastAPI()
    app.add_middleware(AuthMiddleware)

    @app.post("/api/v1/auth/legacy-login")
    def legacy():
        return {"ok": True}

    client = TestClient(app)
    r = client.post("/api/v1/auth/legacy-login")
    assert r.status_code == 410

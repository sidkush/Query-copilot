"""Phase H — H25: Transport guard middleware tests."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from transport_guards import TransportGuardMiddleware


@pytest.fixture
def app():
    app = FastAPI()
    app.add_middleware(TransportGuardMiddleware)

    @app.post("/echo")
    async def echo(body: dict):
        return body

    return app


def test_rejects_content_length_and_transfer_encoding_together(app):
    client = TestClient(app)
    r = client.post(
        "/echo",
        content=b'{"x":1}',
        headers={"Content-Length": "7", "Transfer-Encoding": "chunked"},
    )
    assert r.status_code == 400
    assert "smuggling" in r.text.lower() or "transfer-encoding" in r.text.lower()


def test_rejects_non_utf8_body(app):
    client = TestClient(app)
    r = client.post(
        "/echo",
        content=b"\xe9",
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 400


def test_accepts_clean_utf8(app):
    client = TestClient(app)
    r = client.post("/echo", json={"x": 1})
    assert r.status_code == 200

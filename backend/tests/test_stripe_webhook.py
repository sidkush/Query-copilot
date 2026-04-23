from fastapi.testclient import TestClient
import pytest


def test_stripe_webhook_rejects_missing_signature(monkeypatch):
    from main import app
    client = TestClient(app)
    r = client.post("/api/v1/billing/webhook", content=b"{}")
    assert r.status_code in (400, 422)


def test_stripe_webhook_rejects_bad_signature(monkeypatch):
    from main import app
    monkeypatch.setattr("config.settings.STRIPE_WEBHOOK_SECRET", "whsec_testkey")
    client = TestClient(app)
    r = client.post(
        "/api/v1/billing/webhook",
        content=b'{"fake":"event"}',
        headers={"Stripe-Signature": "t=1,v1=deadbeef"},
    )
    assert r.status_code == 400
    assert "invalid signature" in r.json()["detail"]

import time
import pytest
from identity_hardening import (
    verify_jwt_tenant,
    sign_oauth_state,
    verify_oauth_state,
    verify_stripe_signature,
    is_disposable_email,
    OAuthStateInvalid,
)


def test_jwt_tenant_rejects_token_without_tenant_id():
    fake_payload = {"sub": "u@example.com"}  # no tenant_id
    with pytest.raises(ValueError, match="tenant_id missing"):
        verify_jwt_tenant(fake_payload, expected_tenant="t-123")


def test_jwt_tenant_rejects_mismatched_tenant():
    fake_payload = {"sub": "u@example.com", "tenant_id": "t-ATTACKER"}
    with pytest.raises(ValueError, match="tenant_id mismatch"):
        verify_jwt_tenant(fake_payload, expected_tenant="t-123")


def test_jwt_tenant_accepts_match():
    fake_payload = {"sub": "u@example.com", "tenant_id": "t-123"}
    verify_jwt_tenant(fake_payload, expected_tenant="t-123")  # no raise


def test_oauth_state_roundtrip():
    state = sign_oauth_state(provider="google")
    out = verify_oauth_state(state)
    assert out == "google"


def test_oauth_state_rejects_tampered():
    state = sign_oauth_state(provider="google")
    tampered = state[:-4] + "xxxx"
    with pytest.raises(OAuthStateInvalid):
        verify_oauth_state(tampered)


def test_oauth_state_rejects_expired(monkeypatch):
    monkeypatch.setattr("identity_hardening._OAUTH_TTL", 1)
    state = sign_oauth_state(provider="google")
    time.sleep(2)
    with pytest.raises(OAuthStateInvalid):
        verify_oauth_state(state)


def test_disposable_email_detected():
    assert is_disposable_email("user@mailinator.com") is True
    assert is_disposable_email("user@gmail.com") is False


def test_disposable_email_case_insensitive():
    assert is_disposable_email("USER@MAILINATOR.COM") is True

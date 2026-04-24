"""S5 adversarial — two-step flow HMAC binding (generate→execute)."""
import os
import time
import pytest


@pytest.fixture(autouse=True)
def _jwt_key(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key-long-enough-for-hmac")
    yield


def test_mint_then_verify_round_trip():
    from generation_binding import mint, verify
    tok = mint(sql="SELECT 1", user_id="u1", conn_id="c1")
    assert verify(tok, sql="SELECT 1", user_id="u1", conn_id="c1") is True


def test_verify_rejects_mutated_sql():
    from generation_binding import mint, verify
    tok = mint(sql="SELECT 1", user_id="u1", conn_id="c1")
    assert verify(tok, sql="DROP TABLE users", user_id="u1", conn_id="c1") is False


def test_verify_rejects_foreign_user():
    from generation_binding import mint, verify
    tok = mint(sql="SELECT 1", user_id="alice", conn_id="c1")
    assert verify(tok, sql="SELECT 1", user_id="bob", conn_id="c1") is False


def test_verify_rejects_cross_connection_replay():
    from generation_binding import mint, verify
    tok = mint(sql="SELECT 1", user_id="u1", conn_id="prod")
    assert verify(tok, sql="SELECT 1", user_id="u1", conn_id="staging") is False


def test_verify_rejects_expired_token():
    from generation_binding import mint, verify
    tok = mint(sql="SELECT 1", user_id="u1", conn_id="c1", issued_at=int(time.time()) - 3600)
    assert verify(tok, sql="SELECT 1", user_id="u1", conn_id="c1", max_age_seconds=60) is False


def test_verify_rejects_malformed_token():
    from generation_binding import verify
    assert verify("not-a-token", sql="SELECT 1", user_id="u1", conn_id="c1") is False
    assert verify("", sql="SELECT 1", user_id="u1", conn_id="c1") is False
    assert verify("abc.notanint", sql="SELECT 1", user_id="u1", conn_id="c1") is False

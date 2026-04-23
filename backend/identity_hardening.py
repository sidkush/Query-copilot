"""Phase H — H20: Identity hardening helpers.

* `verify_jwt_tenant` — server-verifies `tenant_id` claim in decoded JWT.
* `sign_oauth_state` / `verify_oauth_state` — HMAC-signed CSRF state (itsdangerous).
* `verify_stripe_signature` — `stripe.Webhook.construct_event`.
* `is_disposable_email` — O(1) lookup against committed blocklist.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from config import settings


class OAuthStateInvalid(ValueError):
    """State token was tampered, expired, or unparsable."""


_OAUTH_TTL = settings.OAUTH_STATE_HMAC_TTL_SECONDS


def _signer() -> URLSafeTimedSerializer:
    # Re-uses JWT_SECRET_KEY; changing JWT_SECRET_KEY invalidates in-flight OAuth flows.
    return URLSafeTimedSerializer(settings.JWT_SECRET_KEY, salt="askdb-oauth-state-v1")


def sign_oauth_state(*, provider: str) -> str:
    return _signer().dumps(provider)


def verify_oauth_state(state: str) -> str:
    try:
        return _signer().loads(state, max_age=_OAUTH_TTL)
    except SignatureExpired as e:
        raise OAuthStateInvalid("oauth state expired") from e
    except BadSignature as e:
        raise OAuthStateInvalid("oauth state tampered") from e


def verify_jwt_tenant(payload: dict[str, Any], *, expected_tenant: str) -> None:
    tid = payload.get("tenant_id")
    if not tid:
        raise ValueError("tenant_id missing from JWT payload")
    if tid != expected_tenant:
        raise ValueError(f"tenant_id mismatch: token={tid} expected={expected_tenant}")


def verify_stripe_signature(*, payload: bytes, sig_header: str) -> dict:
    import stripe  # lazy import — stripe is a Phase H pin

    secret = settings.STRIPE_WEBHOOK_SECRET
    if not secret:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET unset — refusing to verify")
    return stripe.Webhook.construct_event(payload, sig_header, secret)  # raises on invalid


@lru_cache(maxsize=1)
def _disposable_set() -> frozenset[str]:
    p = Path(__file__).resolve().parent.parent / settings.DISPOSABLE_EMAIL_BLOCKLIST_PATH
    try:
        lines = p.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return frozenset()
    return frozenset(line.strip().lower() for line in lines if line.strip() and not line.startswith("#"))


def is_disposable_email(email: str) -> bool:
    if "@" not in email:
        return False
    domain = email.rsplit("@", 1)[1].lower()
    return domain in _disposable_set()

"""S5 — two-step flow HMAC binding.

`/generate` mints a `generation_id` bound to (sql, user_id, conn_id, ts) via
HMAC-SHA256 keyed by `JWT_SECRET_KEY`. `/execute` must echo the same
`generation_id` and recompute the HMAC over the request body; mismatch or
expired => reject.

Agent-mode exemption is documented in `constraints-agent-auth.md`: the agent
loop uses an internal short-circuit and does not round-trip through the
two-step flow. Exemption is out-of-scope for this module (middleware layer).

Enforcement is flag-gated behind `FEATURE_GENERATION_ID_BINDING` so the
frontend can roll forward before the backend flips to fail-closed.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time


_DEFAULT_MAX_AGE_SECONDS = 600  # 10 minutes


def _key() -> bytes:
    key = os.environ.get("JWT_SECRET_KEY") or ""
    if not key:
        try:
            from config import settings
            key = getattr(settings, "JWT_SECRET_KEY", "") or ""
        except Exception:
            key = ""
    if not key:
        raise RuntimeError("JWT_SECRET_KEY required for generation_binding")
    return key.encode("utf-8")


def _compose_payload(sql: str, user_id: str, conn_id: str, issued_at: int) -> bytes:
    normalized = f"{(sql or '').strip()}|{user_id or ''}|{conn_id or ''}|{issued_at}"
    return normalized.encode("utf-8")


def mint(sql: str, user_id: str, conn_id: str, issued_at: int | None = None) -> str:
    """Return an opaque `<hex_mac>.<issued_at>` token bound to the triple."""
    ts = int(issued_at if issued_at is not None else time.time())
    mac = hmac.new(_key(), _compose_payload(sql, user_id, conn_id, ts), hashlib.sha256).hexdigest()
    return f"{mac}.{ts}"


def verify(
    token: str,
    sql: str,
    user_id: str,
    conn_id: str,
    max_age_seconds: int = _DEFAULT_MAX_AGE_SECONDS,
) -> bool:
    if not token or "." not in token:
        return False
    try:
        mac_hex, ts_str = token.rsplit(".", 1)
        ts = int(ts_str)
    except (ValueError, AttributeError):
        return False
    age = int(time.time()) - ts
    if age < 0 or age > max_age_seconds:
        return False
    expected = hmac.new(_key(), _compose_payload(sql, user_id, conn_id, ts), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, mac_hex)

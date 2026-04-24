"""Phase H — H27: SSO + auth version hardening.

* parse_saml_safely — defusedxml (no XXE / entity-expansion).
* check_nonce — Redis nonce cache; replay detected on duplicate.
* jwt_decode_strict — jose.jwt.decode with leeway clamp + strict alg allowlist.
* enforce_pci_mode — fails hard if PCI/HIPAA mode + demo user enabled.
"""
from __future__ import annotations

from defusedxml import ElementTree as DefusedET
from jose import jwt

from config import settings
from redis_client import get_redis


class XXEAttempt(ValueError):
    pass


class ReplayAttempt(ValueError):
    pass


def parse_saml_safely(payload: bytes):
    try:
        return DefusedET.fromstring(payload)
    except Exception as e:
        raise XXEAttempt(f"unsafe xml: {e}") from e


_MEM_NONCE: dict[str, float] = {}


def check_nonce(nonce: str) -> None:
    """Raises ReplayAttempt if nonce already seen within TTL."""
    ttl = settings.NONCE_CACHE_TTL_SECONDS
    redis = get_redis()
    if redis:
        ok = redis.set(f"nonce:{nonce}", "1", ex=ttl, nx=True)
        if not ok:
            raise ReplayAttempt(f"nonce {nonce} replayed")
        return
    import time
    now = time.time()
    for k in [k for k, t in _MEM_NONCE.items() if t < now]:
        _MEM_NONCE.pop(k, None)
    if nonce in _MEM_NONCE:
        raise ReplayAttempt(f"nonce {nonce} replayed")
    _MEM_NONCE[nonce] = now + ttl


def jwt_decode_strict(token: str, *, secret: str) -> dict:
    return jwt.decode(
        token,
        secret,
        algorithms=list(settings._SAFE_JWT_ALGORITHMS),
        options={"require": ["exp", "iat"]},
        leeway=settings.JWT_LEEWAY_SECONDS,
    )


def enforce_pci_mode(*, demo_enabled: bool) -> None:
    if settings.ASKDB_PCI_MODE and demo_enabled:
        raise RuntimeError("PCI mode forbids demo user login")
    if settings.ASKDB_HIPAA_MODE and demo_enabled:
        raise RuntimeError("HIPAA mode forbids demo user login")

"""voice_registry — tier dispatch for hybrid BYOK voice.

Three tiers matching frontend chart-ir/voice/voiceProvider.ts:

    whisper-local   — browser-side whisper.cpp WASM. Backend doesn't
                      mint tokens for this tier; the frontend runs the
                      model in-browser. Backend exists only to record
                      tier selection for analytics.
    deepgram        — Deepgram streaming. Backend stores user's
                      Deepgram key (Fernet-encrypted in the user
                      profile), mints an ephemeral JWT the frontend
                      passes when opening the Deepgram WebSocket.
    openai-realtime — OpenAI Realtime API. Same BYOK + ephemeral token
                      flow as Deepgram, different vendor endpoint.

Phase 3 ships the registry + ephemeral token mint interface. Real
vendor signing is stubbed (returns a signed placeholder) and will be
replaced by real vendor SDK calls in a follow-up scheduled task. The
stub still uses the user's encrypted API key load path so the BYOK
invariant is exercised end-to-end.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from dataclasses import dataclass
from typing import Literal

from config import settings

logger = logging.getLogger(__name__)

VoiceTier = Literal["whisper-local", "deepgram", "openai-realtime"]
VALID_TIERS: set[str] = {"whisper-local", "deepgram", "openai-realtime"}

# How long an ephemeral token stays valid. Short-lived by design —
# vendors reject old tokens, and even if our signer is compromised
# the blast radius is bounded to this window.
EPHEMERAL_TOKEN_TTL_SECONDS = 300  # 5 minutes


@dataclass
class EphemeralToken:
    tier: VoiceTier
    token: str
    expires_at: int  # unix seconds


class VoiceProviderError(Exception):
    """Raised when a tier dispatch fails (unknown tier, missing key, etc.)."""


def is_valid_tier(tier: str) -> bool:
    return tier in VALID_TIERS


def mint_ephemeral_token(user_email: str, tier: str) -> EphemeralToken:
    """Mint a short-lived token for the given tier.

    For whisper-local: no vendor key needed — we return a sentinel
    token the frontend uses purely for analytics.

    For deepgram / openai-realtime: the user's BYOK key is loaded
    from encrypted user storage; the stub signs a placeholder that a
    follow-up commit will replace with a real vendor-signed token.
    """
    if not is_valid_tier(tier):
        raise VoiceProviderError(f"Unknown voice tier: {tier!r}")

    now = int(time.time())
    expires_at = now + EPHEMERAL_TOKEN_TTL_SECONDS

    if tier == "whisper-local":
        # No vendor round-trip. Return a short sentinel so the frontend
        # can track which tier is active without special-casing the
        # response shape.
        token = _sign_sentinel(user_email, tier, expires_at)
        return EphemeralToken(tier=tier, token=token, expires_at=expires_at)

    # BYOK tiers — load the user's vendor API key. The real load path
    # lives in user_storage.py; this stub uses a conservative fallback
    # so the endpoint works in environments where the key isn't set.
    vendor_key = _load_vendor_key(user_email, tier)
    if not vendor_key:
        raise VoiceProviderError(
            f"No {tier} API key configured for {user_email}. "
            f"Add one in Workspace Settings -> Voice."
        )

    # Phase 3 stub: sign a placeholder token with the vendor key + our
    # JWT secret. Follow-up task will replace this with a real vendor
    # signing call (Deepgram token API, OpenAI Realtime session API).
    token = _sign_placeholder(user_email, tier, vendor_key, expires_at)
    logger.info("voice_registry: minted ephemeral token tier=%s user=%s", tier, user_email)
    return EphemeralToken(tier=tier, token=token, expires_at=expires_at)


def _sign_sentinel(user_email: str, tier: str, expires_at: int) -> str:
    """Sign a local-tier sentinel token with JWT_SECRET_KEY."""
    payload = f"{user_email}:{tier}:{expires_at}".encode("utf-8")
    sig = hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return f"local:{expires_at}:{sig}"


def _sign_placeholder(
    user_email: str, tier: str, vendor_key: str, expires_at: int
) -> str:
    """Phase 3 stub — HMAC over user+tier+exp keyed with vendor key.

    NOT a real vendor token. The frontend treats it opaquely, passes
    it to the tier's WebSocket, and the vendor rejects it. Follow-up
    task will replace with real vendor signing calls.
    """
    payload = f"{user_email}:{tier}:{expires_at}".encode("utf-8")
    sig = hmac.new(vendor_key.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"stub:{tier}:{expires_at}:{sig}"


def _load_vendor_key(user_email: str, tier: str) -> str | None:
    """Load the user's vendor API key from encrypted user storage.

    The real storage plumbing lives in user_storage.py; this stub
    wraps it with a graceful fallback so the endpoint works before
    the workspace settings UI lands.
    """
    try:
        from user_storage import load_user_profile  # lazy import
    except Exception:
        return None

    try:
        profile = load_user_profile(user_email)
    except Exception:
        return None

    if not profile:
        return None

    voice_keys = (profile or {}).get("voice_keys") or {}
    key_field = {
        "deepgram": "deepgram_api_key",
        "openai-realtime": "openai_api_key",
    }.get(tier)
    if not key_field:
        return None
    return voice_keys.get(key_field)

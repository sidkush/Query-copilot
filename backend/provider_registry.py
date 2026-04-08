"""
Provider registry for DataLens.

Resolves the correct LLM provider + API key for a given user.
Demo users get the platform key; all others must supply their own.
"""

from config import settings
from user_storage import load_profile, decrypt_password
from anthropic_provider import AnthropicProvider
from model_provider import InvalidKeyError

DEMO_USER_EMAIL = "demo@datalens.dev"

ANTHROPIC_MODELS = {
    "claude-haiku-4-5-20251001": {"name": "Claude Haiku 4.5", "tier": "fast", "cost": "$"},
    "claude-sonnet-4-5-20250514": {"name": "Claude Sonnet 4.5", "tier": "balanced", "cost": "$$"},
    "claude-sonnet-4-20250514": {"name": "Claude Sonnet 4", "tier": "balanced", "cost": "$$"},
    "claude-opus-4-20250514": {"name": "Claude Opus 4", "tier": "powerful", "cost": "$$$"},
}


def get_fallback_model(preferred: str) -> str:
    """Return the fallback model for a given preferred model."""
    if "haiku" in preferred:
        return "claude-sonnet-4-5-20250514"
    return "claude-sonnet-4-5-20250514"


def get_provider_for_user(email: str) -> AnthropicProvider:
    """Resolve the correct AnthropicProvider for a user.

    Demo users use the platform API key. All other users must have
    an encrypted API key stored in their profile.
    """
    if email == DEMO_USER_EMAIL:
        # Demo user can still change preferred model via Account settings
        demo_profile = load_profile(email)
        preferred = demo_profile.get("preferred_model", settings.PRIMARY_MODEL)
        return AnthropicProvider(
            api_key=settings.ANTHROPIC_API_KEY,
            default_model=preferred,
            fallback_model=get_fallback_model(preferred),
        )

    profile = load_profile(email)
    api_key_encrypted = profile.get("api_key_encrypted")
    if not api_key_encrypted:
        raise InvalidKeyError(
            "No API key configured. Please add your Anthropic API key in Account settings."
        )

    try:
        api_key = decrypt_password(api_key_encrypted)
    except Exception:
        # Fernet InvalidToken — key corrupted or JWT_SECRET_KEY rotated
        raise InvalidKeyError(
            "Stored API key is corrupted or the server encryption key changed. "
            "Please save a new API key in Account settings."
        )
    preferred_model = profile.get("preferred_model", settings.PRIMARY_MODEL)
    fallback = get_fallback_model(preferred_model)

    return AnthropicProvider(
        api_key=api_key,
        default_model=preferred_model,
        fallback_model=fallback,
    )

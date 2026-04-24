"""
Provider registry for AskDB.

Resolves the correct LLM provider + API key for a given user.
Demo users get the platform key; all others must supply their own.
"""

from config import settings

DEMO_USER_EMAIL = "demo@askdb.dev"

ANTHROPIC_MODELS = {
    "claude-haiku-4-5-20251001": {"name": "Claude Haiku 4.5", "tier": "fast", "cost": "$"},
    "claude-sonnet-4-6": {"name": "Claude Sonnet 4.6", "tier": "balanced", "cost": "$$"},
    "claude-sonnet-4-5-20250514": {"name": "Claude Sonnet 4.5", "tier": "balanced", "cost": "$$"},
    "claude-sonnet-4-20250514": {"name": "Claude Sonnet 4", "tier": "balanced", "cost": "$$"},
    "claude-opus-4-6": {"name": "Claude Opus 4.6", "tier": "powerful", "cost": "$$$"},
    "claude-opus-4-20250514": {"name": "Claude Opus 4", "tier": "powerful", "cost": "$$$"},
}

# Plan → allowed model tiers
PLAN_MODEL_ACCESS = {
    "free": ["fast"],
    "weekly": ["fast"],
    "monthly": ["fast", "balanced"],
    "yearly": ["fast", "balanced"],
    "pro": ["fast", "balanced"],
    "enterprise": ["fast", "balanced", "powerful"],
}


def get_models_for_plan(plan: str) -> list[str]:
    """Return model IDs accessible to a given plan."""
    allowed_tiers = PLAN_MODEL_ACCESS.get(plan, PLAN_MODEL_ACCESS["free"])
    return [
        model_id for model_id, info in ANTHROPIC_MODELS.items()
        if info["tier"] in allowed_tiers
    ]


def get_fallback_model(preferred: str) -> str:
    """Return the fallback model for a given preferred model."""
    return settings.FALLBACK_MODEL


def deprecated_byok_pinned_count(tenant_id: str) -> int:
    """Return count of BYOK users in tenant pinned to deprecated models. 0 if no data."""
    return 0  # stub — real impl checks ANTHROPIC_MODELS deprecated flag

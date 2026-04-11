"""
Test for Bug 4.2: All models available to all users regardless of plan.

The bug: list_available_models() returns all Anthropic models for every user.
Free-tier users can access expensive models without paying.

The fix: Add PLAN_MODEL_ACCESS mapping. Filter available models by plan.
Gate model selection in get_provider_for_user().
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_plan_model_access_mapping_exists():
    """provider_registry.py must define PLAN_MODEL_ACCESS."""
    from provider_registry import PLAN_MODEL_ACCESS
    assert isinstance(PLAN_MODEL_ACCESS, dict), (
        "PLAN_MODEL_ACCESS must be a dict mapping plan names to allowed tiers"
    )


def test_free_plan_restricted_to_fast():
    """Free plan should only access 'fast' tier models (Haiku)."""
    from provider_registry import PLAN_MODEL_ACCESS
    free_tiers = PLAN_MODEL_ACCESS.get("free", [])
    assert "fast" in free_tiers, "Free plan must include 'fast' tier"
    assert "powerful" not in free_tiers, (
        "Free plan must NOT include 'powerful' tier (Opus)"
    )


def test_pro_plan_includes_balanced():
    """Pro plan should access 'fast' and 'balanced' tiers."""
    from provider_registry import PLAN_MODEL_ACCESS
    pro_tiers = PLAN_MODEL_ACCESS.get("pro", [])
    assert "fast" in pro_tiers, "Pro plan must include 'fast' tier"
    assert "balanced" in pro_tiers, "Pro plan must include 'balanced' tier"


def test_enterprise_includes_all():
    """Enterprise plan should access all tiers."""
    from provider_registry import PLAN_MODEL_ACCESS
    ent_tiers = PLAN_MODEL_ACCESS.get("enterprise", [])
    assert "fast" in ent_tiers
    assert "balanced" in ent_tiers
    assert "powerful" in ent_tiers


def test_get_models_for_plan_function_exists():
    """provider_registry must export get_models_for_plan()."""
    from provider_registry import get_models_for_plan
    assert callable(get_models_for_plan)


def test_get_models_for_plan_filters_correctly():
    """get_models_for_plan('free') should return only fast-tier models."""
    from provider_registry import get_models_for_plan, ANTHROPIC_MODELS
    free_models = get_models_for_plan("free")
    for model_id in free_models:
        tier = ANTHROPIC_MODELS[model_id]["tier"]
        assert tier == "fast", (
            f"Free plan returned model {model_id} with tier '{tier}', "
            f"expected only 'fast' tier"
        )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])

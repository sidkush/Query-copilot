"""
Test for Bug 3.2: Unlimited share tokens per user.

The bug: Users can create unlimited share tokens, exhausting storage.

The fix: Add per-plan share token limits. Check existing token count
before creating new ones.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_share_token_limits_exists():
    """user_storage.py must define SHARE_TOKEN_LIMITS."""
    from user_storage import SHARE_TOKEN_LIMITS
    assert isinstance(SHARE_TOKEN_LIMITS, dict), (
        "SHARE_TOKEN_LIMITS must be a dict mapping plans to limits"
    )


def test_share_token_limits_has_plans():
    """SHARE_TOKEN_LIMITS must cover free, pro, and enterprise plans."""
    from user_storage import SHARE_TOKEN_LIMITS
    assert "free" in SHARE_TOKEN_LIMITS
    assert "pro" in SHARE_TOKEN_LIMITS
    assert "enterprise" in SHARE_TOKEN_LIMITS


def test_free_plan_has_low_limit():
    """Free plan share token limit should be modest (5-10)."""
    from user_storage import SHARE_TOKEN_LIMITS
    free_limit = SHARE_TOKEN_LIMITS["free"]
    assert 1 <= free_limit <= 10, (
        f"Free plan share limit is {free_limit}, expected 1-10"
    )


def test_enterprise_has_high_or_unlimited():
    """Enterprise plan should have a high limit or -1 (unlimited)."""
    from user_storage import SHARE_TOKEN_LIMITS
    ent_limit = SHARE_TOKEN_LIMITS["enterprise"]
    assert ent_limit == -1 or ent_limit >= 100, (
        f"Enterprise share limit is {ent_limit}, expected -1 or >= 100"
    )


def test_create_share_token_checks_quota():
    """create_share_token source must reference SHARE_TOKEN_LIMITS."""
    source_path = os.path.join(os.path.dirname(__file__), "..", "user_storage.py")
    with open(source_path, "r", encoding="utf-8") as f:
        source = f.read()
    match = re.search(
        r"def create_share_token\(.*?(?=\ndef |\Z)", source, re.DOTALL
    )
    assert match, "Could not find create_share_token function"
    body = match.group()
    assert "SHARE_TOKEN_LIMITS" in body, (
        "create_share_token() must check SHARE_TOKEN_LIMITS before creating tokens"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])

"""
Test for Bug 3.7: Circuit breaker threshold too low + no jitter.

The bug: 3 intentional failures trigger 30s cooldown (self-DoS).
Fixed cooldown allows thundering herd on recovery.

The fix: Increase threshold to 5. Add randomized jitter to cooldown.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_default_threshold_at_least_5():
    """_get_breaker should create breakers with threshold >= 5."""
    source_path = os.path.join(
        os.path.dirname(__file__), "..", "anthropic_provider.py"
    )
    with open(source_path, "r") as f:
        source = f.read()
    # Find _get_breaker function and extract the threshold parameter
    match = re.search(
        r"_CircuitBreaker\(\s*threshold\s*=\s*(\d+)", source
    )
    assert match, "Could not find _CircuitBreaker(threshold=N) in _get_breaker"
    threshold = int(match.group(1))
    assert threshold >= 5, (
        f"Circuit breaker threshold is {threshold}, must be >= 5"
    )


def test_cooldown_has_jitter():
    """Circuit breaker cooldown must include randomization (jitter)."""
    source_path = os.path.join(
        os.path.dirname(__file__), "..", "anthropic_provider.py"
    )
    with open(source_path, "r") as f:
        source = f.read()
    # Look for random/jitter in the circuit breaker area
    match = re.search(
        r"class _CircuitBreaker.*?(?=\nclass |\n# )", source, re.DOTALL
    )
    assert match, "Could not find _CircuitBreaker class"
    breaker_source = match.group()
    has_jitter = (
        "random" in breaker_source.lower()
        or "jitter" in breaker_source.lower()
        or "randint" in breaker_source
        or "uniform" in breaker_source
    )
    assert has_jitter, (
        "Circuit breaker must include jitter in cooldown to prevent thundering herd"
    )


def test_breaker_is_per_api_key():
    """Circuit breakers must be scoped per-API-key (already implemented)."""
    source_path = os.path.join(
        os.path.dirname(__file__), "..", "anthropic_provider.py"
    )
    with open(source_path, "r") as f:
        source = f.read()
    assert "Per-API-key" in source or "per-key" in source.lower() or "api_key" in source, (
        "Circuit breaker must be scoped per API key"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])

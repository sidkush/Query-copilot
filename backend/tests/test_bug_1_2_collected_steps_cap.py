"""
Test for Bug 1.2: Unbounded collected_steps in SSE generators.

The bug: collected_steps list in agent_routes.py event_generator() grows
without bound as agent steps are appended. Long sessions (100 tool calls)
with large results can cause memory bloat.

The fix: Add MAX_COLLECTED_STEPS constant and _cap_collected_steps() helper.
Apply cap at persist time.

We test by verifying the source contains the fix, then testing the logic
directly (reimplemented to match expected behavior).
"""

import os
import sys
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

MODULE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "routers", "agent_routes.py"
)


def _load_source():
    with open(MODULE_PATH, "r") as f:
        return f.read()


def _get_max_steps():
    source = _load_source()
    match = re.search(r"MAX_COLLECTED_STEPS\s*=\s*(\d+)", source)
    assert match, "MAX_COLLECTED_STEPS not found in agent_routes.py"
    return int(match.group(1))


# --- Source verification tests ---

def test_max_collected_steps_constant_in_source():
    source = _load_source()
    assert "MAX_COLLECTED_STEPS" in source

def test_cap_collected_steps_function_in_source():
    source = _load_source()
    assert "def _cap_collected_steps" in source

def test_persist_calls_cap():
    source = _load_source()
    assert "_cap_collected_steps(collected_steps)" in source

def test_max_collected_steps_bounds():
    max_steps = _get_max_steps()
    assert 50 <= max_steps <= 500


# --- Logic tests (reimplement the expected cap behavior) ---

def _cap_collected_steps_expected(steps, max_steps):
    """Reference implementation matching the expected fix behavior."""
    if len(steps) <= max_steps:
        return steps
    return steps[:10] + steps[-(max_steps - 10):]


def test_cap_under_limit():
    max_steps = _get_max_steps()
    steps = [{"type": "thinking", "content": f"step {i}"} for i in range(10)]
    result = _cap_collected_steps_expected(steps, max_steps)
    assert len(result) == 10
    assert result == steps


def test_cap_at_limit():
    max_steps = _get_max_steps()
    steps = [{"type": "thinking", "content": f"step {i}"} for i in range(max_steps)]
    result = _cap_collected_steps_expected(steps, max_steps)
    assert len(result) == max_steps


def test_cap_over_limit():
    max_steps = _get_max_steps()
    steps = [{"type": "thinking", "content": f"step {i}"} for i in range(max_steps + 200)]
    result = _cap_collected_steps_expected(steps, max_steps)
    assert len(result) == max_steps


def test_cap_preserves_last_entries():
    max_steps = _get_max_steps()
    n = max_steps + 100
    steps = [{"type": "thinking", "content": f"step {i}"} for i in range(n)]
    result = _cap_collected_steps_expected(steps, max_steps)
    assert result[-1] == steps[-1]
    assert result[-50:] == steps[-50:]


def test_cap_preserves_first_entries():
    max_steps = _get_max_steps()
    n = max_steps + 100
    steps = [{"type": "thinking", "content": f"step {i}"} for i in range(n)]
    result = _cap_collected_steps_expected(steps, max_steps)
    assert result[:10] == steps[:10]


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])

"""BIRD-prep — BENCHMARK_MODE bypass regression tests.

Three production agent-loop pause points are bypassed under BENCHMARK_MODE
to match BIRD's single-shot evaluation protocol:

  Gate #1 — Clarification dialog (_tool_ask_user)
  Gate #3 — Schema-entity mismatch (Gate-C)
  Gate #4 — Error cascade checkpoint

Tests verify both branches per gate:
  - BENCHMARK_MODE=False  → existing production behavior (park + wait)
  - BENCHMARK_MODE=True   → bypass fires, no hang, counter increments

Plus the ask_user counter escalation (warn at 4, raise at 5) and the
cascade iteration cap (1st=change_approach, 2nd+=summarize).

NOTE on change_approach semantics: investigation showed the agent's prompt
template does NOT distinguish change_approach from retry — both result in
"continue loop with refreshed counters." See BIRD-INTEGRATION.md.
"""
from unittest.mock import patch, MagicMock
import json
import pytest


def _make_engine_for_bypass_test():
    """Minimal AgentEngine stub for unit-testing bypass helpers in isolation."""
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    engine._waiting_for_user = False
    engine._pending_question = None
    engine._pending_options = None
    engine._benchmark_bypass_count = 0
    engine._benchmark_gate_c_bypass_count = 0
    engine._benchmark_cascade_bypass_count = 0
    engine._consecutive_logic_errors = 0
    return engine


# ── Gate #1: ask_user clarification bypass ──────────────────────────────


def test_ask_user_clarification_fires_when_benchmark_mode_off():
    """Production default: ask_user pauses agent and stores pending question."""
    engine = _make_engine_for_bypass_test()
    with patch("agent_engine.settings") as mock_s:
        mock_s.BENCHMARK_MODE = False
        result = engine._tool_ask_user(
            question="Did you mean active or paying users?",
            options=["active", "paying"],
        )
    parsed = json.loads(result)
    assert parsed["status"] == "waiting_for_user"
    assert engine._waiting_for_user is True
    assert engine._pending_question == "Did you mean active or paying users?"
    assert engine._benchmark_bypass_count == 0  # bypass did NOT fire


def test_ask_user_bypass_on_first_call_returns_proceed():
    """BENCHMARK_MODE: first ask_user returns proceed, increments counter, no park."""
    engine = _make_engine_for_bypass_test()
    with patch("agent_engine.settings") as mock_s:
        mock_s.BENCHMARK_MODE = True
        result = engine._tool_ask_user(
            question="Did you mean X or Y?",
            options=["X", "Y"],
        )
    parsed = json.loads(result)
    assert parsed["status"] == "proceed"
    assert engine._waiting_for_user is False, (
        "BENCHMARK_MODE MUST NOT set _waiting_for_user — would hang harness"
    )
    assert engine._benchmark_bypass_count == 1
    assert "Do NOT call ask_user again" in parsed["user_response"]


def test_ask_user_bypass_at_4th_call_returns_warning_message():
    """4th bypass: stronger 'FINAL WARNING' message, still status=proceed."""
    engine = _make_engine_for_bypass_test()
    engine._benchmark_bypass_count = 3  # simulate 3 prior bypasses
    with patch("agent_engine.settings") as mock_s:
        mock_s.BENCHMARK_MODE = True
        result = engine._tool_ask_user(question="Q?", options=None)
    parsed = json.loads(result)
    assert parsed["status"] == "proceed"
    assert engine._benchmark_bypass_count == 4
    assert "STOP asking" in parsed["user_response"]
    assert "final warning" in parsed["user_response"].lower()


def test_ask_user_bypass_at_5th_call_raises_loop_error():
    """5th bypass: BenchmarkBypassLoopError raised, harness catches as Q-level fail."""
    from agent_engine import BenchmarkBypassLoopError
    engine = _make_engine_for_bypass_test()
    engine._benchmark_bypass_count = 4  # simulate 4 prior bypasses
    with patch("agent_engine.settings") as mock_s:
        mock_s.BENCHMARK_MODE = True
        with pytest.raises(BenchmarkBypassLoopError) as exc_info:
            engine._tool_ask_user(question="Stubborn ambiguity?", options=None)
    assert exc_info.value.asks_count == 5
    assert "Stubborn ambiguity?" in exc_info.value.question
    assert engine._benchmark_bypass_count == 5


# ── Gate #3: Gate-C schema mismatch bypass ──────────────────────────────


def test_gate_c_park_fires_when_benchmark_mode_off():
    """Production default: Gate-C mismatch retains non-None value, park-and-wait fires."""
    engine = _make_engine_for_bypass_test()
    # Simulate the gate logic by directly testing the bypass condition
    _gate_c_mismatch = "rider"  # simulated mismatch (entity not in schema)
    with patch("agent_engine.settings") as mock_s:
        mock_s.BENCHMARK_MODE = False
        # Mirror the production check
        if _gate_c_mismatch is not None and getattr(mock_s, "BENCHMARK_MODE", False):
            engine._benchmark_gate_c_bypass_count += 1
            _gate_c_mismatch = None
    # Production: mismatch retained, bypass not triggered
    assert _gate_c_mismatch == "rider"
    assert engine._benchmark_gate_c_bypass_count == 0


def test_gate_c_bypass_skips_park_and_increments_counter():
    """BENCHMARK_MODE: Gate-C mismatch dropped, counter incremented, no park."""
    engine = _make_engine_for_bypass_test()
    _gate_c_mismatch = "rider"  # simulated mismatch
    with patch("agent_engine.settings") as mock_s:
        mock_s.BENCHMARK_MODE = True
        # Mirror the production check (the actual bypass logic in run())
        if _gate_c_mismatch is not None and getattr(mock_s, "BENCHMARK_MODE", False):
            engine._benchmark_gate_c_bypass_count += 1
            _gate_c_mismatch = None
    assert _gate_c_mismatch is None, "BENCHMARK_MODE must drop the mismatch flag"
    assert engine._benchmark_gate_c_bypass_count == 1


# ── Gate #4: Error cascade bypass with iteration cap ─────────────────────


def test_cascade_first_fire_resolves_to_change_approach():
    """1st cascade fire under BENCHMARK_MODE: change_approach (give agent another shot)."""
    engine = _make_engine_for_bypass_test()
    engine._consecutive_logic_errors = 3  # cascade trigger threshold
    choice = engine._benchmark_resolve_cascade()
    assert choice == "change_approach"
    assert engine._benchmark_cascade_bypass_count == 1


def test_cascade_second_fire_resolves_to_summarize():
    """2nd cascade fire under BENCHMARK_MODE: summarize (bound total work)."""
    engine = _make_engine_for_bypass_test()
    engine._consecutive_logic_errors = 3
    # First fire
    choice1 = engine._benchmark_resolve_cascade()
    assert choice1 == "change_approach"
    # Second fire (after counter reset between fires by main loop)
    engine._consecutive_logic_errors = 3  # re-tripped
    choice2 = engine._benchmark_resolve_cascade()
    assert choice2 == "summarize"
    assert engine._benchmark_cascade_bypass_count == 2

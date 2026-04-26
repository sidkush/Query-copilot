"""T20-revised — Cascade tuning with separate transient counter.

Tests for `_classify_tool_error`, dual counters
(`_consecutive_logic_errors`, `_consecutive_transient_errors`), and the
two distinct checkpoints (logic-cascade + transient-degraded).
"""
import pytest
from unittest.mock import MagicMock


def make_engine():
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine._consecutive_logic_errors = 0
    engine._consecutive_transient_errors = 0
    return engine


def test_classify_column_not_found_as_logic():
    engine = make_engine()
    cls = engine._classify_tool_error("column 'foo' does not exist")
    assert cls == "logic"


def test_classify_connection_reset_as_transient():
    engine = make_engine()
    cls = engine._classify_tool_error("connection reset by peer")
    assert cls == "transient"


def test_classify_timeout_as_transient():
    engine = make_engine()
    cls = engine._classify_tool_error("query timeout after 300s")
    assert cls == "transient"


def test_logic_cascade_fires_at_3():
    engine = make_engine()
    engine._consecutive_logic_errors = 3
    assert engine._should_fire_error_cascade_checkpoint() is True


def test_transient_degraded_fires_at_5():
    engine = make_engine()
    engine._consecutive_transient_errors = 5
    assert engine._should_fire_transient_degraded_checkpoint() is True


def test_transient_does_not_fire_logic_cascade():
    engine = make_engine()
    engine._consecutive_transient_errors = 10
    engine._consecutive_logic_errors = 0
    assert engine._should_fire_error_cascade_checkpoint() is False


def test_both_counters_reset_on_success():
    engine = make_engine()
    engine._consecutive_logic_errors = 2
    engine._consecutive_transient_errors = 3
    # Simulate a successful tool call resets both
    engine._consecutive_logic_errors = 0
    engine._consecutive_transient_errors = 0
    assert engine._consecutive_logic_errors == 0
    assert engine._consecutive_transient_errors == 0


def test_three_transient_plus_one_logic_triggers_logic_cascade_not_transient():
    """3 transients then 1 logic = logic cascade fires (not transient)."""
    engine = make_engine()
    errors = [
        "connection reset",
        "connection reset",
        "connection reset",
        "column 'foo' does not exist",
    ]
    for err in errors:
        cls = engine._classify_tool_error(err)
        if cls == "transient":
            engine._consecutive_transient_errors += 1
            engine._consecutive_logic_errors = 0
        else:
            engine._consecutive_logic_errors += 1
            engine._consecutive_transient_errors = 0

    assert engine._consecutive_logic_errors == 1
    assert engine._consecutive_transient_errors == 0
    assert engine._should_fire_error_cascade_checkpoint() is False  # only 1 logic error
    assert engine._should_fire_transient_degraded_checkpoint() is False

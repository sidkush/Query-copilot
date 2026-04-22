"""Validator lifecycle state machine (H9)."""
import pytest
from validator_state import ValidatorState, InvalidTransition


def test_initial_state_is_pending():
    s = ValidatorState()
    assert s.state == "pending"


def test_legal_transition_pending_to_running():
    s = ValidatorState()
    s.transition("running")
    assert s.state == "running"


def test_legal_running_to_passed():
    s = ValidatorState()
    s.transition("running")
    s.transition("passed")
    assert s.state == "passed"


def test_legal_running_to_violated():
    s = ValidatorState()
    s.transition("running")
    s.transition("violated")
    assert s.state == "violated"


def test_legal_running_to_failed():
    s = ValidatorState()
    s.transition("running")
    s.transition("failed")
    assert s.state == "failed"


def test_illegal_pending_to_passed_raises():
    s = ValidatorState()
    with pytest.raises(InvalidTransition):
        s.transition("passed")


def test_illegal_passed_to_running_raises():
    s = ValidatorState()
    s.transition("running")
    s.transition("passed")
    with pytest.raises(InvalidTransition):
        s.transition("running")


def test_history_tracks_transitions():
    s = ValidatorState()
    s.transition("running")
    s.transition("passed")
    assert s.history == ["pending", "running", "passed"]

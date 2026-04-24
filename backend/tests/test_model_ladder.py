"""ModelLadder role-based model selection."""
import pytest

from model_ladder import ModelLadder, PlanRole, LadderUnavailable


def test_step_exec_returns_haiku():
    ladder = ModelLadder(
        step_exec="claude-haiku-4-5-20251001",
        plan_emit="claude-sonnet-4-6",
        recovery="claude-opus-4-7-1m-20260115",
    )
    assert ladder.select(PlanRole.STEP_EXEC) == "claude-haiku-4-5-20251001"


def test_plan_emit_returns_sonnet():
    ladder = ModelLadder("h", "s", "o")
    assert ladder.select(PlanRole.PLAN_EMIT) == "s"


def test_recovery_returns_opus():
    ladder = ModelLadder("h", "s", "o")
    assert ladder.select(PlanRole.RECOVERY) == "o"


def test_unknown_role_raises():
    ladder = ModelLadder("h", "s", "o")
    with pytest.raises(LadderUnavailable):
        ladder.select("bogus")  # type: ignore

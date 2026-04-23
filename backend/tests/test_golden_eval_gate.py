"""GoldenEvalGate — shadow run of all 7 trap baselines before promotion."""
import pytest
from golden_eval_gate import (
    GoldenEvalGate, GateDecision, TRAP_SUITE_NAMES,
)


def test_suite_list_contains_seven():
    assert len(TRAP_SUITE_NAMES) == 7
    assert "trap_temporal_scope" in TRAP_SUITE_NAMES
    assert "trap_multi_tenant" in TRAP_SUITE_NAMES


def test_no_regression_allows_promotion():
    def runner(suite_name: str) -> float:
        return 0.90
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    assert isinstance(decision, GateDecision)
    assert decision.block is False
    assert decision.worst_delta_pct == 0.0


def test_regression_beyond_threshold_blocks():
    def runner(suite_name: str) -> float:
        if suite_name == "trap_temporal_scope":
            return 0.85
        return 0.90
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    assert decision.block is True
    assert decision.worst_suite == "trap_temporal_scope"
    assert decision.worst_delta_pct >= 2.0


def test_regression_within_threshold_passes():
    def runner(suite_name: str) -> float:
        if suite_name == "trap_temporal_scope":
            return 0.89
        return 0.90
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    assert decision.block is False


def test_improvement_never_blocks():
    def runner(suite_name: str) -> float:
        return 0.98
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    assert decision.block is False


def test_missing_baseline_raises():
    def runner(suite_name: str) -> float:
        return 0.90
    incomplete = {"trap_temporal_scope": 0.90}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=incomplete)
    with pytest.raises(ValueError, match="missing baseline"):
        gate.check()


def test_runner_exception_blocks_conservative():
    def runner(suite_name: str) -> float:
        raise RuntimeError("trap runner crashed")
    baselines = {name: 0.90 for name in TRAP_SUITE_NAMES}
    gate = GoldenEvalGate(threshold_pct=2.0, runner=runner, baselines=baselines)
    decision = gate.check()
    assert decision.block is True
    assert "crashed" in decision.worst_suite or decision.worst_suite in TRAP_SUITE_NAMES

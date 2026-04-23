"""CorrectionPipeline — end-to-end with mock gates."""
from datetime import datetime, timezone

import pytest

from correction_pipeline import (
    promote_to_examples, PromotionResult, RejectReason,
)


def _candidate(**overrides):
    base = {
        "candidate_id": "prom-001",
        "question": "how many trips in 2024",
        "canonical_sql": "SELECT COUNT(*) FROM trips WHERE EXTRACT(YEAR FROM started_at)=2024",
        "tenant_id": "t1",
        "conn_id": "c1",
        "user_id": "u1",
        "user_hash": "hash-u1",
        "embedding": [0.1, 0.2, 0.3],
        "ceremony_state": "approved",
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
    }
    base.update(overrides)
    return base


def _pass_gate():
    class _G:
        def check(self):
            from golden_eval_gate import GateDecision
            return GateDecision(block=False, deltas_pct={}, worst_suite="", worst_delta_pct=0.0)
    return _G()


def _block_gate():
    class _G:
        def check(self):
            from golden_eval_gate import GateDecision
            return GateDecision(block=True, deltas_pct={"trap_temporal_scope": 5.0},
                                worst_suite="trap_temporal_scope", worst_delta_pct=5.0)
    return _G()


def _never_storm_similarity():
    class _S:
        def is_storm(self, **kw): return False
        def record(self, **kw): pass
    return _S()


def _always_storm_similarity():
    class _S:
        def is_storm(self, **kw): return True
        def record(self, **kw):
            from adversarial_similarity import StormDetected
            raise StormDetected("storm")
    return _S()


class _FakeMemory:
    def __init__(self):
        self.calls = []
    def promote_example(self, **kw):
        self.calls.append(kw)
        return f"doc-{len(self.calls)}"


def test_happy_path_promotes(tmp_path):
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is True
    assert len(mem.calls) == 1


def test_storm_blocks_without_hitting_gate(tmp_path):
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_always_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is False
    assert result.reason is RejectReason.ADVERSARIAL_STORM
    assert len(mem.calls) == 0


def test_ceremony_not_approved_blocks(tmp_path):
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(ceremony_state="pending"),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is False
    assert result.reason is RejectReason.CEREMONY_NOT_APPROVED


def test_golden_eval_regression_blocks(tmp_path):
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_block_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is False
    assert result.reason is RejectReason.GOLDEN_EVAL_REGRESSION


def test_feature_flag_off_noops(tmp_path, monkeypatch):
    monkeypatch.setattr("config.settings.FEATURE_CORRECTION_PIPELINE", False, raising=False)
    mem = _FakeMemory()
    result = promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    assert result.promoted is False
    assert result.reason is RejectReason.FEATURE_DISABLED
    assert len(mem.calls) == 0


def test_ledger_row_appended_on_accept(tmp_path):
    mem = _FakeMemory()
    promote_to_examples(
        candidate=_candidate(),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    ledger = tmp_path / "t1.jsonl"
    assert ledger.exists()
    content = ledger.read_text(encoding="utf-8")
    assert "prom-001" in content
    assert '"promoted": true' in content


def test_ledger_row_appended_on_reject(tmp_path):
    mem = _FakeMemory()
    promote_to_examples(
        candidate=_candidate(ceremony_state="pending"),
        memory=mem,
        similarity=_never_storm_similarity(),
        gate=_pass_gate(),
        ledger_root=tmp_path,
    )
    ledger = tmp_path / "t1.jsonl"
    assert ledger.exists()
    assert '"promoted": false' in ledger.read_text(encoding="utf-8")

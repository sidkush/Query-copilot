"""Phase F — end-to-end ceremony -> pipeline -> ledger."""
import json
from datetime import datetime, timezone

from admin_ceremony import AdminCeremony, CeremonyState
from adversarial_similarity import AdversarialSimilarity
from golden_eval_gate import GoldenEvalGate, TRAP_SUITE_NAMES
from correction_pipeline import promote_to_examples, RejectReason


class _FakeMemory:
    def __init__(self):
        self.calls = []

    def promote_example(self, **kw):
        self.calls.append(kw)
        return "doc-1"


def test_full_flow_promotes(tmp_path):
    # 1) Open ceremony.
    c = AdminCeremony(root=tmp_path / "ceremony", per_admin_daily_limit=10)
    c.open(candidate_id="prom-full-1", question="q", proposed_sql="SELECT 1")
    # 2) Two distinct admins approve.
    c.ack(candidate_id="prom-full-1", admin_email="alice@x.com", approve=True)
    rec = c.ack(candidate_id="prom-full-1", admin_email="bob@x.com", approve=True)
    assert rec.state is CeremonyState.APPROVED

    # 3) Pipeline runs.
    mem = _FakeMemory()
    sim = AdversarialSimilarity(cosine_threshold=0.99, window_hours=1, max_upvotes=10)
    gate = GoldenEvalGate(
        threshold_pct=2.0,
        runner=lambda _name: 0.90,
        baselines={n: 0.90 for n in TRAP_SUITE_NAMES},
    )
    result = promote_to_examples(
        candidate={
            "candidate_id": "prom-full-1",
            "question": rec.question,
            "canonical_sql": rec.proposed_sql,
            "tenant_id": "t1",
            "conn_id": "c1",
            "user_id": "u1",
            "user_hash": "hash-u1",
            "embedding": [0.1, 0.2, 0.3],
            "ceremony_state": rec.state.value,
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
        },
        memory=mem,
        similarity=sim,
        gate=gate,
        ledger_root=tmp_path / "ledger",
    )

    assert result.promoted is True
    assert result.reason is None
    assert len(mem.calls) == 1
    ledger_line = (tmp_path / "ledger" / "t1.jsonl").read_text(encoding="utf-8").strip()
    obj = json.loads(ledger_line)
    assert obj["promoted"] is True
    assert obj["candidate_id"] == "prom-full-1"


def test_storm_stops_full_flow(tmp_path):
    """Storm detection blocks before ceremony/gate even checked."""
    mem = _FakeMemory()
    sim = AdversarialSimilarity(cosine_threshold=0.9, window_hours=1, max_upvotes=2)
    gate = GoldenEvalGate(
        threshold_pct=2.0,
        runner=lambda _name: 0.90,
        baselines={n: 0.90 for n in TRAP_SUITE_NAMES},
    )
    # Pre-seed 2 identical upvotes so the 3rd trips storm.
    from datetime import timezone
    ts = datetime.now(timezone.utc)
    sim.record(user_hash="u1", embedding=[1.0, 0.0, 0.0], ts=ts)
    sim.record(user_hash="u1", embedding=[1.0, 0.0, 0.0], ts=ts)

    result = promote_to_examples(
        candidate={
            "candidate_id": "prom-storm-1",
            "question": "q",
            "canonical_sql": "SELECT 1",
            "tenant_id": "t1",
            "conn_id": "c1",
            "user_id": "u1",
            "user_hash": "u1",
            "embedding": [1.0, 0.0, 0.0],
            "ceremony_state": "approved",
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
        },
        memory=mem,
        similarity=sim,
        gate=gate,
        ledger_root=tmp_path / "ledger",
    )
    assert result.promoted is False
    assert result.reason is RejectReason.ADVERSARIAL_STORM
    assert len(mem.calls) == 0

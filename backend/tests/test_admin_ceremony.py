"""AdminCeremony — 2-admin state machine + rate limit."""
import pytest
from datetime import datetime, timezone, timedelta

from admin_ceremony import (
    AdminCeremony, CeremonyState, CeremonyError, RateLimitExceeded,
    CeremonyRecord,
)


def test_new_ceremony_starts_pending(tmp_path):
    c = AdminCeremony(root=tmp_path)
    rec = c.open(candidate_id="prom-001", question="how many trips 2024", proposed_sql="SELECT COUNT(*) FROM trips")
    assert rec.state is CeremonyState.PENDING
    assert rec.first_admin is None


def test_first_ack_advances_to_first_ack(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-002", question="q", proposed_sql="SELECT 1")
    rec = c.ack(candidate_id="prom-002", admin_email="alice@x.com", approve=True)
    assert rec.state is CeremonyState.FIRST_ACK
    assert rec.first_admin == "alice@x.com"


def test_second_different_admin_approves(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-003", question="q", proposed_sql="SELECT 1")
    c.ack(candidate_id="prom-003", admin_email="alice@x.com", approve=True)
    rec = c.ack(candidate_id="prom-003", admin_email="bob@x.com", approve=True)
    assert rec.state is CeremonyState.APPROVED
    assert rec.second_admin == "bob@x.com"


def test_second_same_admin_rejected(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-004", question="q", proposed_sql="SELECT 1")
    c.ack(candidate_id="prom-004", admin_email="alice@x.com", approve=True)
    with pytest.raises(CeremonyError, match="different admin"):
        c.ack(candidate_id="prom-004", admin_email="alice@x.com", approve=True)


def test_reject_at_first_ack_terminal(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="prom-005", question="q", proposed_sql="SELECT 1")
    rec = c.ack(candidate_id="prom-005", admin_email="alice@x.com", approve=False)
    assert rec.state is CeremonyState.REJECTED


def test_rate_limit_enforces_per_admin_daily_cap(tmp_path):
    c = AdminCeremony(root=tmp_path, per_admin_daily_limit=2)
    for i in range(2):
        cid = f"prom-rl-{i}"
        c.open(candidate_id=cid, question="q", proposed_sql="SELECT 1")
        c.ack(candidate_id=cid, admin_email="alice@x.com", approve=True)
    c.open(candidate_id="prom-rl-2", question="q", proposed_sql="SELECT 1")
    with pytest.raises(RateLimitExceeded):
        c.ack(candidate_id="prom-rl-2", admin_email="alice@x.com", approve=True)


def test_list_pending_returns_only_pending_and_first_ack(tmp_path):
    c = AdminCeremony(root=tmp_path)
    c.open(candidate_id="A", question="q", proposed_sql="SELECT 1")
    c.open(candidate_id="B", question="q", proposed_sql="SELECT 2")
    c.ack(candidate_id="B", admin_email="alice@x.com", approve=True)
    c.open(candidate_id="C", question="q", proposed_sql="SELECT 3")
    c.ack(candidate_id="C", admin_email="alice@x.com", approve=False)
    pending = c.list_pending()
    ids = {p.candidate_id for p in pending}
    assert ids == {"A", "B"}


def test_missing_candidate_raises(tmp_path):
    c = AdminCeremony(root=tmp_path)
    with pytest.raises(CeremonyError, match="unknown candidate"):
        c.ack(candidate_id="ghost", admin_email="alice@x.com", approve=True)


def test_record_persists_across_instances(tmp_path):
    c1 = AdminCeremony(root=tmp_path)
    c1.open(candidate_id="prom-006", question="q", proposed_sql="SELECT 1")
    c1.ack(candidate_id="prom-006", admin_email="alice@x.com", approve=True)
    c2 = AdminCeremony(root=tmp_path)
    rec = c2.get(candidate_id="prom-006")
    assert rec.state is CeremonyState.FIRST_ACK
    assert rec.first_admin == "alice@x.com"

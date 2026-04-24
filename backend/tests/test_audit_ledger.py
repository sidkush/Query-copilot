"""AuditLedger — hash-chained JSONL per-tenant."""
import json
from datetime import datetime, timezone
from pathlib import Path
import pytest
from audit_ledger import (
    AuditLedger, AuditLedgerEntry, GENESIS_HASH, compute_entry_hash,
)

def test_entry_dataclass_fields():
    entry = AuditLedgerEntry(
        claim_id="c1", plan_id="p1", query_id="q1", tenant_id="t1",
        ts="2026-06-04T10:00:00+00:00", sql_hash="aa", rowset_hash="bb",
        schema_hash="cc", pii_redaction_applied=True,
        prev_hash=GENESIS_HASH, curr_hash="",
    )
    assert entry.claim_id == "c1"
    assert entry.prev_hash == GENESIS_HASH

def test_compute_entry_hash_deterministic():
    kwargs = dict(
        claim_id="c1", plan_id="p1", query_id="q1", tenant_id="t1",
        ts="2026-06-04T10:00:00+00:00", sql_hash="a", rowset_hash="b",
        schema_hash="c", pii_redaction_applied=True, prev_hash="00" * 32,
    )
    h1 = compute_entry_hash(**kwargs)
    h2 = compute_entry_hash(**kwargs)
    assert h1 == h2
    assert len(h1) == 64

def test_compute_entry_hash_includes_prev_hash():
    base = dict(
        claim_id="c1", plan_id="p1", query_id="q1", tenant_id="t1",
        ts="2026-06-04T10:00:00+00:00", sql_hash="a", rowset_hash="b",
        schema_hash="c", pii_redaction_applied=True,
    )
    h1 = compute_entry_hash(**base, prev_hash="00" * 32)
    h2 = compute_entry_hash(**base, prev_hash="11" * 32)
    assert h1 != h2

def test_append_and_read_single_entry(tmp_path):
    ledger = AuditLedger(root=tmp_path)
    entry = AuditLedgerEntry(
        claim_id="c1", plan_id="p1", query_id="q1", tenant_id="t1",
        ts="2026-06-04T10:00:00+00:00", sql_hash="a", rowset_hash="b",
        schema_hash="c", pii_redaction_applied=True,
        prev_hash=GENESIS_HASH, curr_hash="",
    )
    ledger.append(entry)
    read_back = ledger.read(tenant_id="t1", year_month="2026-06")
    assert len(read_back) == 1
    assert read_back[0].claim_id == "c1"
    assert read_back[0].curr_hash != ""

def test_append_chains_to_previous_hash(tmp_path):
    ledger = AuditLedger(root=tmp_path)
    e1 = AuditLedgerEntry(
        claim_id="c1", plan_id="p1", query_id="q1", tenant_id="t1",
        ts="2026-06-04T10:00:00+00:00", sql_hash="a", rowset_hash="b",
        schema_hash="c", pii_redaction_applied=True,
        prev_hash=GENESIS_HASH, curr_hash="",
    )
    ledger.append(e1)
    read_back = ledger.read(tenant_id="t1", year_month="2026-06")
    e2 = AuditLedgerEntry(
        claim_id="c2", plan_id="p1", query_id="q1", tenant_id="t1",
        ts="2026-06-04T10:00:01+00:00", sql_hash="a2", rowset_hash="b2",
        schema_hash="c", pii_redaction_applied=True,
        prev_hash=read_back[0].curr_hash, curr_hash="",
    )
    ledger.append(e2)
    all_entries = ledger.read(tenant_id="t1", year_month="2026-06")
    assert len(all_entries) == 2
    assert all_entries[1].prev_hash == all_entries[0].curr_hash

def test_read_nonexistent_tenant_returns_empty(tmp_path):
    ledger = AuditLedger(root=tmp_path)
    assert ledger.read(tenant_id="never", year_month="2026-06") == []

def test_verify_chain_returns_ok_on_intact(tmp_path):
    ledger = AuditLedger(root=tmp_path)
    prev = GENESIS_HASH
    for i in range(5):
        e = AuditLedgerEntry(
            claim_id=f"c{i}", plan_id="p1", query_id=f"q{i}", tenant_id="t1",
            ts=f"2026-06-04T10:0{i}:00+00:00",
            sql_hash=f"a{i}", rowset_hash=f"b{i}", schema_hash="c",
            pii_redaction_applied=True, prev_hash=prev, curr_hash="",
        )
        sealed = ledger.append(e)
        prev = sealed.curr_hash
    result = ledger.verify_chain(tenant_id="t1", year_month="2026-06")
    assert result.ok is True
    assert result.broken_at_index is None

def test_verify_chain_detects_tamper(tmp_path):
    ledger = AuditLedger(root=tmp_path)
    prev = GENESIS_HASH
    for i in range(3):
        e = AuditLedgerEntry(
            claim_id=f"c{i}", plan_id="p1", query_id=f"q{i}", tenant_id="t1",
            ts=f"2026-06-04T10:0{i}:00+00:00",
            sql_hash=f"a{i}", rowset_hash=f"b{i}", schema_hash="c",
            pii_redaction_applied=True, prev_hash=prev, curr_hash="",
        )
        sealed = ledger.append(e)
        prev = sealed.curr_hash
    path = tmp_path / "t1" / "2026-06.jsonl"
    lines = path.read_text(encoding="utf-8").splitlines()
    import json as _j
    tampered = _j.loads(lines[1])
    tampered["rowset_hash"] = "TAMPERED"
    lines[1] = _j.dumps(tampered, sort_keys=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    result = ledger.verify_chain(tenant_id="t1", year_month="2026-06")
    assert result.ok is False
    assert result.broken_at_index == 1

def test_verify_chain_empty_returns_ok(tmp_path):
    ledger = AuditLedger(root=tmp_path)
    result = ledger.verify_chain(tenant_id="never", year_month="2026-06")
    assert result.ok is True
    assert result.broken_at_index is None

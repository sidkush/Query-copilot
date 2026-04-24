"""S2 adversarial hardening — audit ledger must lock per tenant,
chain cross-month, and expose an HMAC sidecar for tamper detection."""
import json
import os
import threading
from pathlib import Path
import pytest
from audit_ledger import AuditLedger, AuditLedgerEntry, GENESIS_HASH


def _entry(i, prev, tenant="t1", month=6, day=4):
    return AuditLedgerEntry(
        claim_id=f"c{i}", plan_id="p1", query_id=f"q{i}", tenant_id=tenant,
        ts=f"2026-{month:02d}-{day:02d}T10:0{i % 10}:0{i % 10}+00:00",
        sql_hash=f"a{i}", rowset_hash=f"b{i}", schema_hash="s",
        pii_redaction_applied=True, prev_hash=prev, curr_hash="",
    )


def test_append_chained_auto_crosses_month(tmp_path):
    ledger = AuditLedger(root=tmp_path)
    s1 = ledger.append_chained(_entry(1, prev="", month=6, day=30))
    s2 = ledger.append_chained(_entry(2, prev="", month=7, day=1))
    # July entry must chain to June's final hash, not genesis
    assert s2.prev_hash == s1.curr_hash
    assert s2.prev_hash != GENESIS_HASH


def test_concurrent_appends_do_not_break_chain(tmp_path):
    ledger = AuditLedger(root=tmp_path)
    errors = []

    def writer(i):
        try:
            ledger.append_chained(_entry(i, prev="", month=6, day=4))
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=writer, args=(i,)) for i in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    result = ledger.verify_chain(tenant_id="t1", year_month="2026-06")
    assert result.ok is True, f"chain broken: {result.reason}"


def test_hmac_sidecar_written_on_append(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIT_HMAC_KEY", "test-secret-key-32bytes-minimum-ok")
    ledger = AuditLedger(root=tmp_path)
    ledger.append_chained(_entry(1, prev="", month=6))
    sidecar = tmp_path / "t1" / "2026-06.jsonl.hmac"
    assert sidecar.exists()
    data = sidecar.read_text().strip()
    # HMAC-SHA256 hex = 64 chars
    assert len(data) == 64
    assert all(c in "0123456789abcdef" for c in data)


def test_hmac_sidecar_detects_tamper(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIT_HMAC_KEY", "test-secret-key-32bytes-minimum-ok")
    ledger = AuditLedger(root=tmp_path)
    ledger.append_chained(_entry(1, prev="", month=6))
    jsonl = tmp_path / "t1" / "2026-06.jsonl"
    jsonl.write_text(jsonl.read_text().replace("a1", "XX"), encoding="utf-8")
    assert ledger.verify_sidecar(tenant_id="t1", year_month="2026-06") is False


def test_hmac_sidecar_passes_clean(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIT_HMAC_KEY", "test-secret-key-32bytes-minimum-ok")
    ledger = AuditLedger(root=tmp_path)
    ledger.append_chained(_entry(1, prev="", month=6))
    assert ledger.verify_sidecar(tenant_id="t1", year_month="2026-06") is True

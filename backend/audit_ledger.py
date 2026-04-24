"""Phase L — AuditLedger. Hash-chained append-only JSONL per (tenant_id, YYYY-MM)."""
from __future__ import annotations
import hashlib, json, os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

GENESIS_HASH = "0" * 64

@dataclass(frozen=True)
class AuditLedgerEntry:
    claim_id: str
    plan_id: str
    query_id: str
    tenant_id: str
    ts: str
    sql_hash: str
    rowset_hash: str
    schema_hash: str
    pii_redaction_applied: bool
    prev_hash: str
    curr_hash: str

def compute_entry_hash(*, claim_id, plan_id, query_id, tenant_id, ts, sql_hash, rowset_hash, schema_hash, pii_redaction_applied, prev_hash):
    payload = {"claim_id": claim_id, "plan_id": plan_id, "query_id": query_id, "tenant_id": tenant_id, "ts": ts, "sql_hash": sql_hash, "rowset_hash": rowset_hash, "schema_hash": schema_hash, "pii_redaction_applied": pii_redaction_applied, "prev_hash": prev_hash}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

class AuditLedger:
    def __init__(self, root):
        self.root = Path(root)

    def _path(self, tenant_id, year_month):
        return self.root / tenant_id / f"{year_month}.jsonl"

    def _year_month_from_ts(self, ts):
        return ts[:7]

    def append(self, entry: AuditLedgerEntry) -> AuditLedgerEntry:
        year_month = self._year_month_from_ts(entry.ts)
        path = self._path(entry.tenant_id, year_month)
        path.parent.mkdir(parents=True, exist_ok=True)
        curr_hash = compute_entry_hash(
            claim_id=entry.claim_id, plan_id=entry.plan_id, query_id=entry.query_id,
            tenant_id=entry.tenant_id, ts=entry.ts, sql_hash=entry.sql_hash,
            rowset_hash=entry.rowset_hash, schema_hash=entry.schema_hash,
            pii_redaction_applied=entry.pii_redaction_applied, prev_hash=entry.prev_hash,
        )
        sealed = AuditLedgerEntry(
            claim_id=entry.claim_id, plan_id=entry.plan_id, query_id=entry.query_id,
            tenant_id=entry.tenant_id, ts=entry.ts, sql_hash=entry.sql_hash,
            rowset_hash=entry.rowset_hash, schema_hash=entry.schema_hash,
            pii_redaction_applied=entry.pii_redaction_applied,
            prev_hash=entry.prev_hash, curr_hash=curr_hash,
        )
        line = json.dumps(asdict(sealed), sort_keys=True) + "\n"
        fd = os.open(str(path), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
        try:
            os.write(fd, line.encode("utf-8"))
            os.fsync(fd)
        finally:
            os.close(fd)
        return sealed

    def read(self, tenant_id, year_month):
        path = self._path(tenant_id, year_month)
        if not path.exists():
            return []
        out = []
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(AuditLedgerEntry(**json.loads(line)))
                except Exception:
                    continue
        return out

@dataclass(frozen=True)
class ChainVerifyResult:
    ok: bool
    broken_at_index: Optional[int]
    reason: Optional[str] = None

def _verify_single_entry(entry: AuditLedgerEntry) -> bool:
    expected = compute_entry_hash(
        claim_id=entry.claim_id, plan_id=entry.plan_id, query_id=entry.query_id,
        tenant_id=entry.tenant_id, ts=entry.ts, sql_hash=entry.sql_hash,
        rowset_hash=entry.rowset_hash, schema_hash=entry.schema_hash,
        pii_redaction_applied=entry.pii_redaction_applied, prev_hash=entry.prev_hash,
    )
    return expected == entry.curr_hash

def _verify_chain(self, tenant_id: str, year_month: str) -> ChainVerifyResult:
    entries = self.read(tenant_id, year_month)
    if not entries:
        return ChainVerifyResult(ok=True, broken_at_index=None)
    prev = GENESIS_HASH
    for i, entry in enumerate(entries):
        if entry.prev_hash != prev:
            return ChainVerifyResult(ok=False, broken_at_index=i, reason=f"prev_hash mismatch at index {i}")
        if not _verify_single_entry(entry):
            return ChainVerifyResult(ok=False, broken_at_index=i, reason=f"curr_hash mismatch at index {i}")
        prev = entry.curr_hash
    return ChainVerifyResult(ok=True, broken_at_index=None)

AuditLedger.verify_chain = _verify_chain

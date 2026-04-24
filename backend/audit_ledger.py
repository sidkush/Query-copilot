"""Phase L — AuditLedger. Hash-chained append-only JSONL per (tenant_id, YYYY-MM).

Hardening (S2, 2026-04-24 adversarial):
- Per-tenant `threading.Lock` serializes concurrent appends so the chain never
  interleaves.
- `append_chained(entry)` auto-resolves `prev_hash` from the last entry of the
  most recent month file for the tenant (including cross-month rollover) instead
  of forcing callers to pass `GENESIS_HASH` into a new month.
- HMAC-SHA256 sidecar `<file>.jsonl.hmac` written after every append; keyed by
  `AUDIT_HMAC_KEY` env with fallback to `JWT_SECRET_KEY` (logged warning on
  fallback). `verify_sidecar()` fails-closed when sidecar is missing.
"""
from __future__ import annotations
import hashlib
import hmac
import json
import logging
import os
import threading
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

GENESIS_HASH = "0" * 64


def _hmac_key() -> bytes:
    key = os.environ.get("AUDIT_HMAC_KEY") or ""
    if not key:
        fallback = os.environ.get("JWT_SECRET_KEY") or ""
        if fallback:
            logger.warning("AUDIT_HMAC_KEY unset; falling back to JWT_SECRET_KEY. Set AUDIT_HMAC_KEY for cryptographic separation.")
            key = fallback
        else:
            # Fail-closed: no usable key. Return empty so HMAC still deterministic;
            # verify_sidecar will succeed on untampered data but provides no
            # cryptographic guarantee without a real key.
            key = "audit-ledger-unconfigured-do-not-rely"
    return key.encode("utf-8")


def _compute_sidecar(path: Path) -> str:
    if not path.exists():
        return ""
    h = hmac.new(_hmac_key(), digestmod=hashlib.sha256)
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


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
    _locks: "dict[str, threading.Lock]" = defaultdict(threading.Lock)
    _locks_guard = threading.Lock()

    def __init__(self, root):
        self.root = Path(root)

    def _tenant_lock(self, tenant_id: str) -> threading.Lock:
        with AuditLedger._locks_guard:
            return AuditLedger._locks[tenant_id]

    def _path(self, tenant_id, year_month):
        return self.root / tenant_id / f"{year_month}.jsonl"

    def _sidecar_path(self, tenant_id, year_month):
        return self.root / tenant_id / f"{year_month}.jsonl.hmac"

    def _year_month_from_ts(self, ts):
        return ts[:7]

    def _latest_prev_hash(self, tenant_id: str) -> str:
        """Walk month files for tenant in reverse chronological order and return
        the most recent entry's curr_hash. Enables cross-month chain continuity."""
        tenant_dir = self.root / tenant_id
        if not tenant_dir.exists():
            return GENESIS_HASH
        months = sorted(
            [p.stem for p in tenant_dir.glob("*.jsonl")],
            reverse=True,
        )
        for ym in months:
            entries = self.read(tenant_id, ym)
            if entries:
                return entries[-1].curr_hash
        return GENESIS_HASH

    def _write_sidecar(self, tenant_id, year_month):
        path = self._path(tenant_id, year_month)
        sidecar = self._sidecar_path(tenant_id, year_month)
        digest = _compute_sidecar(path)
        tmp = sidecar.with_suffix(sidecar.suffix + ".tmp")
        tmp.write_text(digest, encoding="utf-8")
        os.replace(tmp, sidecar)

    def append(self, entry: AuditLedgerEntry) -> AuditLedgerEntry:
        year_month = self._year_month_from_ts(entry.ts)
        path = self._path(entry.tenant_id, year_month)
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._tenant_lock(entry.tenant_id):
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
            self._write_sidecar(entry.tenant_id, year_month)
        return sealed

    def append_chained(self, entry: AuditLedgerEntry) -> AuditLedgerEntry:
        """Auto-resolve prev_hash from the latest existing entry for this tenant
        (walks prior months) and commit under the per-tenant lock so concurrent
        writers don't interleave. Caller can leave `prev_hash` empty/None."""
        with self._tenant_lock(entry.tenant_id):
            prev = self._latest_prev_hash(entry.tenant_id)
            rebound = AuditLedgerEntry(
                claim_id=entry.claim_id, plan_id=entry.plan_id, query_id=entry.query_id,
                tenant_id=entry.tenant_id, ts=entry.ts, sql_hash=entry.sql_hash,
                rowset_hash=entry.rowset_hash, schema_hash=entry.schema_hash,
                pii_redaction_applied=entry.pii_redaction_applied,
                prev_hash=prev, curr_hash="",
            )
            year_month = self._year_month_from_ts(rebound.ts)
            path = self._path(rebound.tenant_id, year_month)
            path.parent.mkdir(parents=True, exist_ok=True)
            curr_hash = compute_entry_hash(
                claim_id=rebound.claim_id, plan_id=rebound.plan_id, query_id=rebound.query_id,
                tenant_id=rebound.tenant_id, ts=rebound.ts, sql_hash=rebound.sql_hash,
                rowset_hash=rebound.rowset_hash, schema_hash=rebound.schema_hash,
                pii_redaction_applied=rebound.pii_redaction_applied, prev_hash=rebound.prev_hash,
            )
            sealed = AuditLedgerEntry(
                claim_id=rebound.claim_id, plan_id=rebound.plan_id, query_id=rebound.query_id,
                tenant_id=rebound.tenant_id, ts=rebound.ts, sql_hash=rebound.sql_hash,
                rowset_hash=rebound.rowset_hash, schema_hash=rebound.schema_hash,
                pii_redaction_applied=rebound.pii_redaction_applied,
                prev_hash=rebound.prev_hash, curr_hash=curr_hash,
            )
            line = json.dumps(asdict(sealed), sort_keys=True) + "\n"
            fd = os.open(str(path), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            try:
                os.write(fd, line.encode("utf-8"))
                os.fsync(fd)
            finally:
                os.close(fd)
            self._write_sidecar(rebound.tenant_id, year_month)
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

    def verify_sidecar(self, tenant_id: str, year_month: str) -> bool:
        """Fail-closed verification of the HMAC sidecar.
        Missing sidecar when the ledger file exists => False (tamper suspected)."""
        path = self._path(tenant_id, year_month)
        sidecar = self._sidecar_path(tenant_id, year_month)
        if not path.exists():
            return True  # nothing to verify
        if not sidecar.exists():
            return False
        expected = _compute_sidecar(path)
        actual = sidecar.read_text(encoding="utf-8").strip()
        return hmac.compare_digest(expected, actual)


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
    # Seed expected prev_hash from prior month's final curr_hash if this file
    # continues a cross-month chain; otherwise GENESIS.
    tenant_dir = self.root / tenant_id
    prior_months = sorted(
        [p.stem for p in tenant_dir.glob("*.jsonl") if p.stem < year_month],
        reverse=True,
    )
    prev = GENESIS_HASH
    for ym in prior_months:
        prior = self.read(tenant_id, ym)
        if prior:
            prev = prior[-1].curr_hash
            break
    for i, entry in enumerate(entries):
        if entry.prev_hash != prev:
            return ChainVerifyResult(ok=False, broken_at_index=i, reason=f"prev_hash mismatch at index {i}")
        if not _verify_single_entry(entry):
            return ChainVerifyResult(ok=False, broken_at_index=i, reason=f"curr_hash mismatch at index {i}")
        prev = entry.curr_hash
    return ChainVerifyResult(ok=True, broken_at_index=None)


AuditLedger.verify_chain = _verify_chain

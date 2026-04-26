"""Phase L — AuditLedger. Hash-chained append-only JSONL per (tenant_id, YYYY-MM).

Hardening (S2, 2026-04-24 adversarial):
- Per-tenant `threading.Lock` serializes concurrent appends so the chain never
  interleaves.
- `filelock.FileLock` prevents cross-process chain races on shared filesystems.
- `append_chained(entry)` auto-resolves `prev_hash` from the last entry of the
  most recent month file for the tenant (including cross-month rollover) instead
  of forcing callers to pass a genesis hash into a new month.
- HMAC-SHA256 sidecar `<file>.jsonl.hmac` written after every append; keyed by
  `AUDIT_HMAC_KEY` env (required when FEATURE_AUDIT_LEDGER=True).
  `verify_sidecar()` fails-closed when sidecar is missing.
- Genesis hash is per-tenant HMAC(key, tenant_id) — not the predictable 64-zero
  string — so an attacker without the key cannot forge a valid genesis entry.
- `hmac.compare_digest` used for all hash comparisons (timing-safe).
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

import filelock as _filelock

logger = logging.getLogger(__name__)

_UNCONFIGURED_SENTINEL = "audit-ledger-unconfigured-do-not-rely"

# Kept for backward compat only — new chains use _genesis_hash(tenant_id).
GENESIS_HASH = "0" * 64


def _hmac_key() -> bytes:
    key = os.environ.get("AUDIT_HMAC_KEY") or ""
    if not key:
        feature_on = os.environ.get("FEATURE_AUDIT_LEDGER", "").lower() in ("1", "true", "yes")
        if feature_on:
            raise RuntimeError(
                "AUDIT_HMAC_KEY must be set when FEATURE_AUDIT_LEDGER=True. "
                "Refusing to operate with unconfigured HMAC key."
            )
        fallback = os.environ.get("JWT_SECRET_KEY") or _UNCONFIGURED_SENTINEL
        if fallback != _UNCONFIGURED_SENTINEL:
            logger.warning(
                "AUDIT_HMAC_KEY unset; falling back to JWT_SECRET_KEY. "
                "Set AUDIT_HMAC_KEY for cryptographic separation."
            )
        else:
            logger.warning(
                "AUDIT_HMAC_KEY and JWT_SECRET_KEY both unset; using dev sentinel. "
                "HMAC provides no cryptographic guarantee."
            )
        return fallback.encode("utf-8")
    return key.encode("utf-8")


def _genesis_hash(tenant_id: str) -> str:
    """Per-tenant salted genesis derived from HMAC(key, tenant_id).
    Prevents an attacker from forging a valid first entry without the key."""
    key = _hmac_key()
    return hmac.new(key, tenant_id.encode("utf-8"), hashlib.sha256).hexdigest()


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

    def _tenant_filelock(self, tenant_id: str) -> _filelock.FileLock:
        lock_path = self.root / tenant_id / ".audit.lock"
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        return _filelock.FileLock(str(lock_path), timeout=30)

    def _path(self, tenant_id, year_month):
        return self.root / tenant_id / f"{year_month}.jsonl"

    def _sidecar_path(self, tenant_id, year_month):
        return self.root / tenant_id / f"{year_month}.jsonl.hmac"

    def _year_month_from_ts(self, ts):
        return ts[:7]

    def _latest_prev_hash(self, tenant_id: str) -> str:
        """Walk month files for tenant in reverse chronological order and return
        the most recent entry's curr_hash. Falls back to per-tenant genesis."""
        tenant_dir = self.root / tenant_id
        if not tenant_dir.exists():
            return _genesis_hash(tenant_id)
        months = sorted(
            [p.stem for p in tenant_dir.glob("*.jsonl")],
            reverse=True,
        )
        for ym in months:
            entries = self.read(tenant_id, ym)
            if entries:
                return entries[-1].curr_hash
        return _genesis_hash(tenant_id)

    def _write_sidecar(self, tenant_id, year_month):
        path = self._path(tenant_id, year_month)
        sidecar = self._sidecar_path(tenant_id, year_month)
        digest = _compute_sidecar(path)
        tmp = sidecar.with_suffix(sidecar.suffix + ".tmp")
        tmp.write_text(digest, encoding="utf-8")
        os.replace(tmp, sidecar)

    def append(self, entry: AuditLedgerEntry) -> AuditLedgerEntry:
        """Delegates to append_chained so all write paths use the same hardened logic."""
        return self.append_chained(entry)

    def append_chained(self, entry: AuditLedgerEntry) -> AuditLedgerEntry:
        """Auto-resolve prev_hash from the latest existing entry for this tenant
        (walks prior months) and commit under thread + file lock so concurrent
        writers in the same or different processes don't interleave the chain."""
        tid = entry.tenant_id
        if not tid or tid.strip().lower() in ("", "unknown"):
            raise ValueError(
                f"Audit ledger write rejected: tenant_id is '{tid}'. "
                "Cross-tenant contamination prevented."
            )
        with self._tenant_lock(entry.tenant_id):
            with self._tenant_filelock(entry.tenant_id):
                prev = self._latest_prev_hash(entry.tenant_id)
                year_month = self._year_month_from_ts(entry.ts)
                path = self._path(entry.tenant_id, year_month)
                path.parent.mkdir(parents=True, exist_ok=True)
                curr_hash = compute_entry_hash(
                    claim_id=entry.claim_id, plan_id=entry.plan_id, query_id=entry.query_id,
                    tenant_id=entry.tenant_id, ts=entry.ts, sql_hash=entry.sql_hash,
                    rowset_hash=entry.rowset_hash, schema_hash=entry.schema_hash,
                    pii_redaction_applied=entry.pii_redaction_applied, prev_hash=prev,
                )
                sealed = AuditLedgerEntry(
                    claim_id=entry.claim_id, plan_id=entry.plan_id, query_id=entry.query_id,
                    tenant_id=entry.tenant_id, ts=entry.ts, sql_hash=entry.sql_hash,
                    rowset_hash=entry.rowset_hash, schema_hash=entry.schema_hash,
                    pii_redaction_applied=entry.pii_redaction_applied,
                    prev_hash=prev, curr_hash=curr_hash,
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
    return hmac.compare_digest(expected, entry.curr_hash)


def _verify_chain(self, tenant_id: str, year_month: str) -> ChainVerifyResult:
    entries = self.read(tenant_id, year_month)
    if not entries:
        return ChainVerifyResult(ok=True, broken_at_index=None)
    tenant_dir = self.root / tenant_id
    prior_months = sorted(
        [p.stem for p in tenant_dir.glob("*.jsonl") if p.stem < year_month],
        reverse=True,
    )
    prev = _genesis_hash(tenant_id)
    for ym in prior_months:
        prior = self.read(tenant_id, ym)
        if prior:
            prev = prior[-1].curr_hash
            break
    for i, entry in enumerate(entries):
        if not hmac.compare_digest(entry.prev_hash, prev):
            return ChainVerifyResult(ok=False, broken_at_index=i, reason=f"prev_hash mismatch at index {i}")
        if not _verify_single_entry(entry):
            return ChainVerifyResult(ok=False, broken_at_index=i, reason=f"curr_hash mismatch at index {i}")
        prev = entry.curr_hash
    return ChainVerifyResult(ok=True, broken_at_index=None)


AuditLedger.verify_chain = _verify_chain

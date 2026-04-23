"""H15 — 2-admin approval ceremony for correction promotions."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Optional


class CeremonyState(Enum):
    PENDING = "pending"
    FIRST_ACK = "first_ack"
    APPROVED = "approved"
    REJECTED = "rejected"


class CeremonyError(RuntimeError):
    """Raised on invalid state transition or unknown candidate."""


class RateLimitExceeded(RuntimeError):
    """Raised when an admin has exceeded per-day approval quota."""


@dataclass
class CeremonyRecord:
    candidate_id: str
    question: str
    proposed_sql: str
    state: CeremonyState = CeremonyState.PENDING
    first_admin: Optional[str] = None
    second_admin: Optional[str] = None
    first_ack_at: Optional[str] = None
    terminal_at: Optional[str] = None
    reject_reason: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["state"] = self.state.value
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "CeremonyRecord":
        d = dict(d)
        d["state"] = CeremonyState(d["state"])
        return cls(**d)


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def _atomic_write(path: Path, data: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(data, encoding="utf-8")
    os.replace(tmp, path)


class AdminCeremony:
    def __init__(self, root, per_admin_daily_limit: Optional[int] = None):
        self.root = Path(root)
        if per_admin_daily_limit is None:
            try:
                from config import settings
                per_admin_daily_limit = int(settings.PROMOTION_CEREMONY_PER_ADMIN_DAILY_LIMIT)
            except Exception:
                per_admin_daily_limit = 20
        self.per_admin_daily_limit = per_admin_daily_limit

    def _path(self, candidate_id: str) -> Path:
        return self.root / f"{candidate_id}.json"

    def _load(self, candidate_id: str) -> CeremonyRecord:
        p = self._path(candidate_id)
        if not p.exists():
            raise CeremonyError(f"unknown candidate: {candidate_id}")
        return CeremonyRecord.from_dict(json.loads(p.read_text(encoding="utf-8")))

    def _save(self, rec: CeremonyRecord) -> None:
        _atomic_write(self._path(rec.candidate_id), json.dumps(rec.to_dict(), indent=2))

    def _count_recent_approvals(self, admin_email: str) -> int:
        if not self.root.exists():
            return 0
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        n = 0
        for p in self.root.glob("*.json"):
            try:
                rec = CeremonyRecord.from_dict(json.loads(p.read_text(encoding="utf-8")))
            except Exception:
                continue
            ts_str = rec.terminal_at or rec.first_ack_at
            if not ts_str:
                continue
            try:
                ts = datetime.strptime(ts_str, "%Y-%m-%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if ts < cutoff:
                continue
            if rec.first_admin == admin_email or rec.second_admin == admin_email:
                n += 1
        return n

    def open(self, *, candidate_id: str, question: str, proposed_sql: str) -> CeremonyRecord:
        rec = CeremonyRecord(
            candidate_id=candidate_id,
            question=question,
            proposed_sql=proposed_sql,
        )
        self._save(rec)
        return rec

    def ack(self, *, candidate_id: str, admin_email: str, approve: bool,
            reason: Optional[str] = None) -> CeremonyRecord:
        if self._count_recent_approvals(admin_email) >= self.per_admin_daily_limit:
            raise RateLimitExceeded(
                f"{admin_email} exceeded {self.per_admin_daily_limit}/day"
            )
        rec = self._load(candidate_id)
        now = _iso_now()
        if rec.state is CeremonyState.PENDING:
            if not approve:
                rec.state = CeremonyState.REJECTED
                rec.first_admin = admin_email
                rec.terminal_at = now
                rec.reject_reason = reason
            else:
                rec.state = CeremonyState.FIRST_ACK
                rec.first_admin = admin_email
                rec.first_ack_at = now
        elif rec.state is CeremonyState.FIRST_ACK:
            if admin_email == rec.first_admin:
                raise CeremonyError("second ack must come from different admin")
            if not approve:
                rec.state = CeremonyState.REJECTED
                rec.second_admin = admin_email
                rec.terminal_at = now
                rec.reject_reason = reason
            else:
                rec.state = CeremonyState.APPROVED
                rec.second_admin = admin_email
                rec.terminal_at = now
        else:
            raise CeremonyError(f"cannot ack from terminal state {rec.state.value}")
        self._save(rec)
        return rec

    def get(self, *, candidate_id: str) -> CeremonyRecord:
        return self._load(candidate_id)

    def list_pending(self) -> list[CeremonyRecord]:
        if not self.root.exists():
            return []
        out = []
        for p in self.root.glob("*.json"):
            try:
                rec = CeremonyRecord.from_dict(json.loads(p.read_text(encoding="utf-8")))
            except Exception:
                continue
            if rec.state in (CeremonyState.PENDING, CeremonyState.FIRST_ACK):
                out.append(rec)
        return out

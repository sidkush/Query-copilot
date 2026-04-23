"""Ring 4 — PinnedReceiptStore.

Receipts that agents accept (IntentEcho confirmation, ScopeValidator replan,
user-explicit-scope-override) survive session-memory sliding compaction.

Layout: <root>/<session_id>.receipts.json  (atomic write: tmp -> rename).
"""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class Receipt:
    kind: str
    text: str
    created_at: datetime
    session_id: str


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _from_iso(s: str) -> datetime:
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class PinnedReceiptStore:
    def __init__(self, root):
        self.root = Path(root)

    def _path(self, session_id: str) -> Path:
        return self.root / f"{session_id}.receipts.json"

    def pin(self, session_id: str, receipt: Receipt) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        existing = self.read(session_id)
        existing.append(receipt)
        payload = [
            {**asdict(r), "created_at": _iso(r.created_at)} for r in existing
        ]
        target = self._path(session_id)
        fd, tmp = tempfile.mkstemp(dir=str(self.root), prefix=f".{session_id}_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(tmp, target)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def read(self, session_id: str) -> list:
        path = self._path(session_id)
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            return [
                Receipt(
                    kind=r["kind"],
                    text=r["text"],
                    created_at=_from_iso(r["created_at"]),
                    session_id=r["session_id"],
                ) for r in raw
            ]
        except Exception:
            return []

    def prune(self, session_id: str) -> None:
        path = self._path(session_id)
        try:
            path.unlink()
        except FileNotFoundError:
            pass

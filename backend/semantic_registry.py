"""H12 — SemanticRegistry.

Per-connection JSON-backed registry of metric definitions with
valid_from / valid_until. Agents ground terminology against this
registry; on miss, IntentEcho surfaces a "terminology unknown" warning.
"""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


class NotFound(KeyError):
    pass


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _from_iso(s):
    if s is None:
        return None
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@dataclass(frozen=True)
class Definition:
    name: str
    definition: str
    valid_from: datetime
    valid_until: Optional[datetime]
    owner: str
    unit: Optional[str] = None


class SemanticRegistry:
    def __init__(self, root):
        self.root = Path(root)

    def _path(self, conn_id: str) -> Path:
        return self.root / f"{conn_id}.json"

    def _load(self, conn_id: str) -> list:
        p = self._path(conn_id)
        if not p.exists():
            return []
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            return [
                Definition(
                    name=d["name"],
                    definition=d["definition"],
                    valid_from=_from_iso(d["valid_from"]),
                    valid_until=_from_iso(d.get("valid_until")),
                    owner=d.get("owner", ""),
                    unit=d.get("unit"),
                ) for d in raw
            ]
        except Exception:
            return []

    def _save(self, conn_id: str, entries: list) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        payload = []
        for e in entries:
            d = asdict(e)
            d["valid_from"] = _iso(e.valid_from)
            d["valid_until"] = _iso(e.valid_until) if e.valid_until else None
            payload.append(d)
        target = self._path(conn_id)
        fd, tmp = tempfile.mkstemp(dir=str(self.root), prefix=f".{conn_id}_", suffix=".tmp")
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

    def register(self, conn_id: str, defn: Definition) -> None:
        entries = self._load(conn_id)
        entries.append(defn)
        self._save(conn_id, entries)

    def lookup(self, conn_id: str, name: str, at: datetime) -> Definition:
        entries = self._load(conn_id)
        for d in entries:
            if d.name != name:
                continue
            if d.valid_from <= at and (d.valid_until is None or at <= d.valid_until):
                return d
        raise NotFound(f"No definition for {name!r} at {at.isoformat()}")

    def list_for_conn(self, conn_id: str, at: Optional[datetime] = None) -> list:
        """Return definitions for conn_id, optionally filtered to those valid at `at`.

        Wave 2 spike-fix (2026-04-26): added so AnalyticalPlanner.plan() can
        actually retrieve registry candidates instead of AttributeError-ing
        into the bare-except fallback path. Pre-fix, this method did not
        exist — planner always returned fallback=True without firing Sonnet.

        When `at` is None, returns every definition stored for conn_id.
        When `at` is a datetime, returns only definitions whose
        valid_from <= at and (valid_until is None or valid_until >= at).
        """
        entries = self._load(conn_id)
        if at is None:
            return entries
        return [
            d for d in entries
            if d.valid_from <= at and (d.valid_until is None or d.valid_until >= at)
        ]

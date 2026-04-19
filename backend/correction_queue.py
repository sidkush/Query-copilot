"""Write-only correction queue.

Corrections land here; the review pipeline (correction_reviewer.py) decides
promotion. NEVER import ChromaDB from this module — keeps the write path
strictly filesystem and makes ICRH safeguards auditable.

See askdb-skills/agent/learn-from-corrections.md.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

Tier = Literal["T1_explicit_edit", "T1_thumbs_up", "T2_implicit", "T3_follow_up"]
Status = Literal["pending_review", "auto_promoted", "manual_review", "rejected"]


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def enqueue(
    *,
    user_hash: str,
    question: str,
    original_sql: str,
    corrected_sql: str,
    user_note: str,
    connection_id: str,
    queue_root: Path,
    tier: Tier = "T1_explicit_edit",
) -> Path:
    ts = _iso_now()
    dir_ = queue_root / user_hash
    dir_.mkdir(parents=True, exist_ok=True)
    path = dir_ / f"{ts}.json"
    record = {
        "ts": ts,
        "user_hash": user_hash,
        "question": question,
        "original_sql": original_sql,
        "corrected_sql": corrected_sql,
        "user_note": user_note,
        "connection_id": connection_id,
        "status": "pending_review",
        "tier": tier,
    }
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(record, indent=2), encoding="utf-8")
    tmp.replace(path)  # atomic
    logger.info("correction_queue: enqueued %s", path.name)
    return path


def list_pending(queue_root: Path) -> list[dict]:
    pending = []
    if not queue_root.exists():
        return pending
    for path in queue_root.rglob("*.json"):
        try:
            pending.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:  # noqa: BLE001
            continue
    return pending

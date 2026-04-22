"""Embedding migration with crash-resume via checkpoint file.

Strategy (H14):
1. Write to NEW collection (`skills_v1_minilm`) while READS fallback to old.
2. Per-doc-id checkpoint written AFTER commit.
3. On crash, resume from `last_committed_doc_id`.
4. When all docs in new collection: atomic swap (update reader config).
5. Old collection retained for 7 days, then deleted.
"""
from __future__ import annotations
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional, Sequence


@dataclass(frozen=True)
class CheckpointState:
    collection_from: str
    collection_to: str
    last_committed_doc_id: Optional[str]
    total_committed: int


def load_checkpoint(path: Path) -> Optional[CheckpointState]:
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    return CheckpointState(**data)


def write_checkpoint(path: Path, state: CheckpointState) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(asdict(state), indent=2))
    tmp.replace(path)


def next_batch(
    all_doc_ids: Sequence[str],
    last_committed: Optional[str],
    batch_size: int,
) -> list[str]:
    if last_committed is None:
        start = 0
    else:
        try:
            start = all_doc_ids.index(last_committed) + 1
        except ValueError:
            # last_committed not found → assume fresh start (pool changed).
            start = 0
    return list(all_doc_ids[start : start + batch_size])

"""Phase H — H26: A/B variant dedup. In-memory only (single-process)."""
from __future__ import annotations
from threading import Lock

_SEEN: dict[tuple[str, str, str], bool] = {}
_LOCK = Lock()

def _key(user_id, experiment, variant):
    return (user_id, experiment, variant)

def record_bucket(*, user_id: str, experiment: str, variant: str) -> None:
    with _LOCK:
        _SEEN[_key(user_id, experiment, variant)] = True

def is_duplicate_bucket(*, user_id: str, experiment: str, variant: str) -> bool:
    with _LOCK:
        if _SEEN.get(_key(user_id, experiment, variant), False):
            return True
        _SEEN[_key(user_id, experiment, variant)] = True
        return False

def warmup(*, experiment: str, variants: list[str]) -> None:
    _ = list(variants)
